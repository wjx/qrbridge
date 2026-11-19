/** Change only the QR mask, after repeated completed displays and feedback grace. */
export class QRMaskRetry {
  private entries = new Map<number, { attempts: number; firstCompleted: number; changedAt: number; variant: number }>();
  private current: { index: number; started: number; dwell: number } | null = null;

  variant(index: number) { return this.entries.get(index)?.variant ?? 0; }

  start(index: number, now: number, dwell: number, missing: readonly number[] | null) {
    const previous = this.current;
    // Tolerate timer rounding; interrupted/shortened displays are not failures.
    if (previous && now - previous.started >= previous.dwell * 0.9) {
      let entry = this.entries.get(previous.index);
      if (!entry) {
        entry = { attempts: 0, firstCompleted: now, changedAt: previous.started, variant: 0 };
        this.entries.set(previous.index, entry);
      }
      entry.attempts++;
    }
    const entry = this.entries.get(index);
    if (entry && missing?.includes(index + 1) && entry.attempts >= 2 &&
      now - entry.firstCompleted >= 1500 && now - entry.changedAt >= 2000) {
      entry.variant = (entry.variant + 1) % 8;
      entry.changedAt = now;
      entry.attempts = 0;
    }
    this.current = { index, started: now, dwell };
    return this.variant(index);
  }

  pause() { this.current = null; }
}
