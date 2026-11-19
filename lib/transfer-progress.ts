/** Measures unique chunks received during active scanning, starting at the first chunk. */
export class TransferProgress {
  private payloadIndices = new Set<number>();
  private payloadBytes = 0;
  private arrivals: { at: number; bytes: number }[] = [];
  private dataActive = false;
  private dataTime: number | null = null;
  private dataElapsed = 0;

  private advanceDataClock(now: number) {
    if (this.dataActive && this.dataTime !== null) this.dataElapsed += Math.max(0, now - this.dataTime);
    this.dataTime = now;
  }

  setDataActive(active: boolean, now: number) {
    this.advanceDataClock(now);
    this.dataActive = active;
    if (!active) this.arrivals = [];
  }

  recordPayload(index: number, content: string, now: number) {
    if (this.payloadIndices.has(index)) return;
    this.advanceDataClock(now);
    this.payloadIndices.add(index);
    const bytes = new TextEncoder().encode(content).length;
    this.payloadBytes += bytes;
    this.arrivals.push({ at: now, bytes });
  }

  dataRates(now: number) {
    this.advanceDataClock(now);
    this.arrivals = this.arrivals.filter(sample => sample.at > now - 3000);
    return {
      receivedBytes: this.payloadBytes,
      realtime: this.dataActive ? this.arrivals.reduce((sum, sample) => sum + sample.bytes, 0) / 3 : 0,
      average: this.dataElapsed > 0 ? this.payloadBytes / (this.dataElapsed / 1000) : null,
    };
  }

  private startedAt: number | null = null;
  private finishedAt: number | null = null;

  /** Wall time from first observed chunk; includes pauses, frozen on completion. */
  get durationSeconds(): number | null {
    return this.startedAt === null ? null : Math.max(0, (this.finishedAt ?? this.previousTime) - this.startedAt) / 1000;
  }

  private baseline: number | null = null;
  private previousTime = 0;
  private active = false;
  private elapsedMs = 0;

  pause(now: number) {
    if (this.active) this.elapsedMs += Math.max(0, now - this.previousTime);
    this.previousTime = now;
    this.active = false;
  }

  update(received: number, total: number, active: boolean, now: number) {
    if (received === 0) {
      this.payloadIndices.clear();
      this.payloadBytes = 0;
      this.arrivals = [];
      this.dataActive = false;
      this.dataTime = null;
      this.dataElapsed = 0;
      this.startedAt = null;
      this.finishedAt = null;
      this.baseline = null;
      this.elapsedMs = 0;
      this.active = false;
    } else if (this.baseline === null) {
      // The time spent receiving the first chunk is unknown.
      this.startedAt = now;
      this.baseline = received;
    } else if (this.active) {
      this.elapsedMs += Math.max(0, now - this.previousTime);
    }
    if (received > 0 && received >= total && this.finishedAt === null) this.finishedAt = now;
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

export function formatDataRate(bytesPerSecond: number): string {
  return bytesPerSecond < 1024
    ? `${bytesPerSecond.toFixed(0)} B/s`
    : `${(bytesPerSecond / 1024).toFixed(2)} KiB/s`;
}
