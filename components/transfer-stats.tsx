"use client";

import { useEffect, useRef, useState } from "react";
import { TransferProgress, formatRemainingTime } from "@/lib/transfer-progress";

export function TransferStats({ received, total, active }: {
  received: number;
  total: number;
  active: boolean;
}) {
  const tracker = useRef(new TransferProgress());
  const [stats, setStats] = useState<ReturnType<TransferProgress["update"]>>({
    speed: null, remainingSeconds: null,
  });
  const complete = received === total;

  useEffect(() => {
    const refresh = () => setStats(tracker.current.update(received, total, active, performance.now()));
    refresh();
    if (!active || complete) return;
    const timer = window.setInterval(refresh, 1000);
    return () => window.clearInterval(timer);
  }, [received, total, active, complete]);

  return (
    <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground tabular-nums">
      <span>Average speed: {stats.speed === null ? "Estimating..." : `${stats.speed.toFixed(2)} chunks/s`}</span>
      <span>Time remaining: {complete ? "0s" : !active ? "Paused"
        : stats.remainingSeconds === null ? "Estimating..." : `~${formatRemainingTime(stats.remainingSeconds)}`}</span>
    </div>
  );
}
