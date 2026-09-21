"use client";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

export interface ChartPoint {
  label: string;
  sales: number;
  revenue: number;
  visitors: number;
}

// The Recharts-powered charts live in their own module so the admin page can
// load them with next/dynamic. Recharts (and the d3 modules it pulls in) is
// by far the heaviest dependency in the app; splitting it out means it is
// only downloaded on the admin dashboard's analytics tab — never on the
// public site, and not even for the admin's login screen.
export default function AnalyticsCharts({ chartData, isDark }: { chartData: ChartPoint[]; isDark: boolean }) {
  const gridStroke = isDark ? "#FFFFFF14" : "#00000010";
  const tickColor = isDark ? "#F4E0D2B3" : "#5A1F0CB3";

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-brick-700/80">Sales</h4>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: tickColor }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: tickColor }} />
            <Tooltip
              contentStyle={
                isDark ? { background: "#1B100C", border: "1px solid #FFFFFF1A", color: "#F4E0D2" } : undefined
              }
            />
            <Bar dataKey="sales" fill="#FF6600" radius={[6, 6, 0, 0]} name="Sales" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-brick-700/80">Revenue (₹)</h4>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: tickColor }} />
            <YAxis tick={{ fontSize: 11, fill: tickColor }} />
            <Tooltip
              contentStyle={
                isDark ? { background: "#1B100C", border: "1px solid #FFFFFF1A", color: "#F4E0D2" } : undefined
              }
            />
            <Line type="monotone" dataKey="revenue" stroke="#FFA366" strokeWidth={2.5} dot={{ r: 3 }} name="Revenue" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-brick-700/80">
          Unique visitors
        </h4>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: tickColor }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: tickColor }} />
            <Tooltip
              contentStyle={
                isDark ? { background: "#1B100C", border: "1px solid #FFFFFF1A", color: "#F4E0D2" } : undefined
              }
            />
            <Line
              type="monotone"
              dataKey="visitors"
              stroke="#2F7D6B"
              strokeWidth={2.5}
              dot={{ r: 3 }}
              name="Visitors"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
