/** Measures unique chunks received during active scanning, starting at the first chunk. */
export class TransferProgress {
  private baseline: number | null = null;
  private previousTime = 0;
  private active = false;
  private elapsedMs = 0;

  update(received: number, total: number, active: boolean, now: number) {
    if (received === 0) {
      this.baseline = null;
      this.elapsedMs = 0;
      this.active = false;
    } else if (this.baseline === null) {
      // The time spent receiving the first chunk is unknown.
      this.baseline = received;
    } else if (this.active) {
      this.elapsedMs += Math.max(0, now - this.previousTime);
    }
    this.previousTime = now;
    this.active = active && received > 0 && received < total;

    const measured = received - (this.baseline ?? received);
    const speed = measured > 0 && this.elapsedMs > 0
      ? measured / (this.elapsedMs / 1000)
      : null;
    return {
      speed,
      remainingSeconds: received >= total ? 0
        : speed === null ? null : Math.ceil((total - received) / speed),
    };
  }
}

export function formatRemainingTime(seconds: number): string {
  const rounded = Math.ceil(seconds);
  if (rounded < 60) return `${rounded}s`;
  if (rounded < 3600) return `${Math.floor(rounded / 60)}m ${rounded % 60}s`;
  return `${Math.floor(rounded / 3600)}h ${Math.floor((rounded % 3600) / 60)}m`;
}
