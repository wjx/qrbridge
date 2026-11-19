"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/components/session-provider";
import { TransferProgress, formatRemainingTime } from "@/lib/transfer-progress";

export function TransferStats({ received, total, active }: {
  received: number;
  total: number;
  active: boolean;
}) {
  const { transferProgress: tracker } = useSession();
  const [stats, setStats] = useState<ReturnType<TransferProgress["update"]>>({
    speed: null, remainingSeconds: null,
  });
  const complete = received === total;

  useEffect(() => {
    const refresh = () => setStats(tracker.update(received, total, active, performance.now()));
    refresh();
    if (complete) return;
    const timer = window.setInterval(refresh, 1000);
    return () => window.clearInterval(timer);
  }, [received, total, active, complete, tracker]);

  useEffect(() => () => tracker.pause(performance.now()), [tracker]);

  return (
    <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground tabular-nums">
      <span>Effective speed: {stats.speed === null ? "Estimating..." : `${stats.speed.toFixed(2)} chunks/s`}</span>
      <span>{complete ? "Completed in" : "Elapsed"}: {tracker.durationSeconds === null ? "—" : `${tracker.durationSeconds.toFixed(1)}s`}</span>
      <span>Time remaining: {complete ? "0s" : !active ? "Paused"
        : stats.remainingSeconds === null ? "Estimating..." : `~${formatRemainingTime(stats.remainingSeconds)}`}</span>
      <span className="w-full text-xs">Unique chunks only. Speed excludes pauses; elapsed time includes pauses, starting from the first received chunk.</span>
    </div>
  );
}
