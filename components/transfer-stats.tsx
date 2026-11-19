"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/components/session-provider";
import { TransferProgress, formatRemainingTime, formatDataRate } from "@/lib/transfer-progress";

export function TransferStats({ received, total, active }: {
  received: number;
  total: number;
  active: boolean;
}) {
  const { transferProgress: tracker } = useSession();
  const [stats, setStats] = useState<ReturnType<TransferProgress["update"]>>({
    speed: null, remainingSeconds: null,
  });
  const [rates, setRates] = useState(() => tracker.dataRates(performance.now()));
  const complete = received === total;

  useEffect(() => {
    const refresh = () => {
      const now = performance.now();
      setStats(tracker.update(received, total, active, now));
      setRates(tracker.dataRates(now));
    };
    refresh();
    if (complete) return;
    const timer = window.setInterval(refresh, 500);
    return () => window.clearInterval(timer);
  }, [received, total, active, complete, tracker]);

  useEffect(() => () => tracker.pause(performance.now()), [tracker]);

  return (
    <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-muted-foreground tabular-nums">
      {!complete && <span>Live speed: {formatDataRate(active ? rates.realtime : 0)}</span>}
      <span>{complete ? "Final average" : "Average speed"}: {rates.average === null ? (complete ? "—" : "Estimating...") : formatDataRate(rates.average)}</span>
      <span>{complete ? "Completed in" : "Elapsed"}: {tracker.durationSeconds === null ? "—" : `${tracker.durationSeconds.toFixed(1)}s`}</span>
      <span>Time remaining: {complete ? "0s" : !active ? "Paused"
        : stats.remainingSeconds === null ? "Estimating..." : `~${formatRemainingTime(stats.remainingSeconds)}`}</span>
      <span className="w-full text-xs">Unique payload bytes only; file payload includes encoding overhead. Live: last 3s. Average: active scan time. Elapsed: since first chunk, including pauses.</span>
    </div>
  );
}
