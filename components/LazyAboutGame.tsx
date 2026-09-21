"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Skeleton } from "./Skeleton";

// The flip-card preview game sits far below the fold on /about. Its code (and
// its three preview images) only load once the visitor scrolls near it.
const AboutGame = dynamic(() => import("./AboutGame"), {
  ssr: false,
  loading: () => <Placeholder />,
});

function Placeholder() {
  return <Skeleton className="mx-auto h-[28rem] max-w-4xl rounded-3xl" />;
}

export default function LazyAboutGame(props: { pdfSizeKb?: number; totalPages?: number }) {
  const holderRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);

  useEffect(() => {
    const el = holderRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "400px 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return <div ref={holderRef}>{near ? <AboutGame pdfSizeKb={props.pdfSizeKb} totalPages={props.totalPages} /> : <Placeholder />}</div>;
}
