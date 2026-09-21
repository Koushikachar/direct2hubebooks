import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/adminAuth";
import { getReviewsPage } from "@/lib/reviews";

const DAY_MS = 86_400_000;

// India Standard Time is a fixed UTC+5:30 all year (no DST), so a
// constant offset is exact. Every bucket below — which day/week/month a
// sale falls into, and "today" for the Today's Sales card — is computed
// in IST, the timezone the store and its customers are actually in.
// Bucketing in UTC instead (the previous behaviour) silently moved any
// sale made after 5:30pm IST into the next UTC day, which is what made
// "today's sales" and the daily chart look wrong around evenings.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function toIST(d: Date): Date {
  return new Date(d.getTime() + IST_OFFSET_MS);
}

function dayKey(d: Date): string {
  return toIST(d).toISOString().slice(0, 10);
}

function startOfWeekKey(d: Date): string {
  const ist = toIST(d);
  const day = ist.getUTCDay(); // 0=Sun
  const diff = (day + 6) % 7; // days since Monday
  ist.setUTCDate(ist.getUTCDate() - diff);
  return ist.toISOString().slice(0, 10);
}

function monthKey(d: Date): string {
  const ist = toIST(d);
  return `${ist.getUTCFullYear()}-${String(ist.getUTCMonth() + 1).padStart(2, "0")}`;
}

// "N months before the current IST month", computed from the 1st of the
// month. Building this from day 1 (instead of subtracting months from
// today's day-of-month) avoids a real overflow bug: e.g. Aug 31 minus 6
// months via `setMonth` lands on Mar 2/3 (February doesn't have 31 days),
// which silently duplicated one month's bucket and skipped another —
// exactly the "gap between months isn't right" symptom in the 6-month
// and yearly charts.
function monthKeyAgo(monthsAgo: number): string {
  const now = toIST(new Date());
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// Visit rows already store an IST calendar-day string (see lib/visitor.ts),
// so bucketing them into weeks/months is plain string/date arithmetic —
// no second IST conversion needed (that would double-shift them).
function weekKeyFromDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const diff = (d.getUTCDay() + 6) % 7; // days since Monday
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}
function monthKeyFromDay(day: string): string {
  return day.slice(0, 7);
}

// The exact rolling lookback each KPI card covers when its range tab is
// selected — "Day" is the literal last 24 hours, "Week" the last 7 days,
// and so on. This is intentionally independent of the *chart* windows
// below (14 daily points, 8 weekly points, etc.), which exist to show a
// trend over time rather than a single current-period total.
const RANGE_WINDOW_DAYS = { daily: 1, weekly: 7, monthly: 30, sixMonth: 180, yearly: 365 } as const;

export async function GET(req: Request) {
  const authError = await requireAdmin(req);
  if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status });

  try {
    const since = new Date(Date.now() - 370 * DAY_MS); // last ~1 year covers every chart below
    const sinceDayKey = dayKey(since);

    const [paidSubmissions, totalSubmissions, reviewsPage, visits, totalUniqueVisitorGroups] = await Promise.all([
      prisma.submission.findMany({
        where: { paymentStatus: "paid", paidAt: { gte: since } },
        select: { amountPaise: true, paidAt: true },
        orderBy: { paidAt: "asc" },
      }),
      prisma.submission.count(),
      getReviewsPage(1, null),
      // Deduped at write time (one row per visitorId+day, see lib/visitor.ts
      // and app/api/track-visit/route.ts), so every row here already is a
      // unique visitor-day — no further dedup needed for daily buckets.
      prisma.visit.findMany({
        where: { day: { gte: sinceDayKey } },
        select: { visitorId: true, day: true, createdAt: true },
      }),
      prisma.visit.groupBy({ by: ["visitorId"] }),
    ]);

    const totalPaidCount = await prisma.submission.count({ where: { paymentStatus: "paid" } });
    const totalRevenuePaise = await prisma.submission.aggregate({
      where: { paymentStatus: "paid" },
      _sum: { amountPaise: true },
    });

    // Bucket every paid submission by IST day, week, and month all at
    // once — each chart range below just reads however many buckets it
    // needs from the same maps.
    const dailyMap = new Map<string, { count: number; revenue: number }>();
    const weeklyMap = new Map<string, { count: number; revenue: number }>();
    const monthlyMap = new Map<string, { count: number; revenue: number }>();

    for (const sub of paidSubmissions) {
      if (!sub.paidAt) continue;
      const day = dayKey(sub.paidAt);
      const wk = startOfWeekKey(sub.paidAt);
      const mo = monthKey(sub.paidAt);

      const d = dailyMap.get(day) || { count: 0, revenue: 0 };
      d.count += 1;
      d.revenue += sub.amountPaise;
      dailyMap.set(day, d);

      const w = weeklyMap.get(wk) || { count: 0, revenue: 0 };
      w.count += 1;
      w.revenue += sub.amountPaise;
      weeklyMap.set(wk, w);

      const m = monthlyMap.get(mo) || { count: 0, revenue: 0 };
      m.count += 1;
      m.revenue += sub.amountPaise;
      monthlyMap.set(mo, m);
    }

    // Same idea for visitors, but each bucket holds a Set (not a count) —
    // a visitor who came back on day 2 of the same week must still only
    // count once in that week's bucket, which a running counter can't do.
    const dailyVisitors = new Map<string, Set<string>>();
    const weeklyVisitors = new Map<string, Set<string>>();
    const monthlyVisitors = new Map<string, Set<string>>();

    function addVisitor(map: Map<string, Set<string>>, key: string, visitorId: string) {
      let set = map.get(key);
      if (!set) {
        set = new Set();
        map.set(key, set);
      }
      set.add(visitorId);
    }

    for (const v of visits) {
      addVisitor(dailyVisitors, v.day, v.visitorId);
      addVisitor(weeklyVisitors, weekKeyFromDay(v.day), v.visitorId);
      addVisitor(monthlyVisitors, monthKeyFromDay(v.day), v.visitorId);
    }

    // Unique visitors + conversion for each range's own rolling window —
    // a true "last N days" from right now (not a calendar-day bucket),
    // so "Day" really is the last 24 hours and not "since midnight".
    const rangeStats = {} as Record<
      keyof typeof RANGE_WINDOW_DAYS,
      { visitors: number; paidSales: number; revenueInr: number; visitorConversion: number }
    >;
    for (const range of Object.keys(RANGE_WINDOW_DAYS) as (keyof typeof RANGE_WINDOW_DAYS)[]) {
      const cutoffMs = Date.now() - RANGE_WINDOW_DAYS[range] * DAY_MS;
      const visitorSet = new Set<string>();
      for (const v of visits) if (v.createdAt.getTime() >= cutoffMs) visitorSet.add(v.visitorId);

      let paidSales = 0;
      let revenuePaise = 0;
      for (const sub of paidSubmissions) {
        if (!sub.paidAt || sub.paidAt.getTime() < cutoffMs) continue;
        paidSales += 1;
        revenuePaise += sub.amountPaise;
      }

      rangeStats[range] = {
        visitors: visitorSet.size,
        paidSales,
        revenueInr: Math.round(revenuePaise / 100),
        // Clamped at 100%: a buyer is conceptually always a visitor
        // first, so the rate can't legitimately exceed it. It can look
        // like it does right after this feature ships, since paid
        // orders from before visitor tracking existed still count as
        // sales in a window but were never recorded as a visit — that
        // self-corrects as new tracked visits accumulate.
        visitorConversion:
          visitorSet.size > 0 ? Math.min(100, Math.round((paidSales / visitorSet.size) * 1000) / 10) : 0,
      };
    }

    // Zero-filled buckets, oldest to newest, one series per chart range.
    const daily: { label: string; sales: number; revenue: number; visitors: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const key = dayKey(new Date(Date.now() - i * DAY_MS));
      const bucket = dailyMap.get(key) || { count: 0, revenue: 0 };
      daily.push({
        label: key,
        sales: bucket.count,
        revenue: Math.round(bucket.revenue / 100),
        visitors: dailyVisitors.get(key)?.size || 0,
      });
    }

    const weekly: { label: string; sales: number; revenue: number; visitors: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const key = startOfWeekKey(new Date(Date.now() - i * 7 * DAY_MS));
      const bucket = weeklyMap.get(key) || { count: 0, revenue: 0 };
      weekly.push({
        label: key,
        sales: bucket.count,
        revenue: Math.round(bucket.revenue / 100),
        visitors: weeklyVisitors.get(key)?.size || 0,
      });
    }

    // "Month" — daily buckets for the last 30 days. This tab didn't
    // exist before (only Day/Week/6 Months/Year), even though the admin
    // panel's own range list implied it should.
    const monthly: { label: string; sales: number; revenue: number; visitors: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const key = dayKey(new Date(Date.now() - i * DAY_MS));
      const bucket = dailyMap.get(key) || { count: 0, revenue: 0 };
      monthly.push({
        label: key,
        sales: bucket.count,
        revenue: Math.round(bucket.revenue / 100),
        visitors: dailyVisitors.get(key)?.size || 0,
      });
    }

    const sixMonth: { label: string; sales: number; revenue: number; visitors: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const key = monthKeyAgo(i);
      const bucket = monthlyMap.get(key) || { count: 0, revenue: 0 };
      sixMonth.push({
        label: key,
        sales: bucket.count,
        revenue: Math.round(bucket.revenue / 100),
        visitors: monthlyVisitors.get(key)?.size || 0,
      });
    }

    const yearly: { label: string; sales: number; revenue: number; visitors: number }[] = [];
    for (let i = 11; i >= 0; i--) {
      const key = monthKeyAgo(i);
      const bucket = monthlyMap.get(key) || { count: 0, revenue: 0 };
      yearly.push({
        label: key,
        sales: bucket.count,
        revenue: Math.round(bucket.revenue / 100),
        visitors: monthlyVisitors.get(key)?.size || 0,
      });
    }

    const today = dayKey(new Date());
    const todaySales = paidSubmissions.filter((s: { paidAt: Date | null }) => s.paidAt && dayKey(s.paidAt) === today).length;

    return NextResponse.json({
      ok: true,
      totals: {
        totalSubmissions,
        totalPaid: totalPaidCount,
        totalRevenueInr: Math.round((totalRevenuePaise._sum.amountPaise || 0) / 100),
        conversionRate: totalSubmissions > 0 ? Math.round((totalPaidCount / totalSubmissions) * 1000) / 10 : 0,
        todaySales,
        averageRating: reviewsPage.summary.average,
        reviewCount: reviewsPage.summary.count,
        // All-time distinct visitors, ever — a separate figure from any
        // of the range windows below (those are "in the last N days").
        totalUniqueVisitors: totalUniqueVisitorGroups.length,
        overallVisitorConversion:
          totalUniqueVisitorGroups.length > 0
            ? Math.min(100, Math.round((totalPaidCount / totalUniqueVisitorGroups.length) * 1000) / 10)
            : 0,
      },
      // Per-range window totals (visitors/sales/revenue/conversion) — one
      // object per tab, each scoped to exactly the lookback that tab's
      // chart shows. The admin panel's KPI cards read straight from this.
      rangeStats,
      daily,
      weekly,
      monthly,
      sixMonth,
      yearly,
      ratingBreakdown: reviewsPage.summary.breakdown,
    });
  } catch (err) {
    console.error("Analytics error:", err);
    return NextResponse.json({ error: "Could not load analytics." }, { status: 500 });
  }
}
