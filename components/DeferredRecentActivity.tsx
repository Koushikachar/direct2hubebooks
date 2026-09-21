"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { whenIdle } from "@/lib/idle";

// The "someone just bought" toast is a nice-to-have. Its JS chunk and its
// /api/recent-activity request are both held back until the browser is idle,
// and it is never server-rendered — so it costs nothing on the critical path
// (LCP / hydration / first interaction).
const RecentActivity = dynamic(() => import("./RecentActivity"), { ssr: false });

export default function DeferredRecentActivity() {
  const [ready, setReady] = useState(false);

  useEffect(() => whenIdle(() => setReady(true), 4000), []);

  return ready ? <RecentActivity /> : null;
}
