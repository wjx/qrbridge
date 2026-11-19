/** Sender-side controller. Counts acknowledged payload bytes, never QR headers or retries. */
const SPEEDS = [200, 250, 300, 400, 500, 750, 1000, 1500, 2000];
const WINDOW_MS = 5000;
const FEEDBACK_GRACE_MS = 1500;
const STALL_MS = 5000;

export class AdaptiveTransfer {
  interval = 500;
  reason = "Waiting for playback and receiver feedback.";
  private acknowledged = new Set<number>();
  private shown = new Map<number, number>();
  private running = false;
  private previousTime: number | null = null;
  private elapsed = 0;
  private lastProgress = 0;
  private lastDecision = 0;
  private windowBytes = 0;
  private previousRate: number | null = null;
  private healthyWindows = 0;
  private cooldown = 0;
  private bytes = 0;
  private adaptive = false;

  constructor(private readonly payloadSizes: number[]) {}

  private advance(now: number) {
    if (this.running && this.previousTime !== null) this.elapsed += Math.max(0, now - this.previousTime);
    this.previousTime = now;
  }

  setRunning(running: boolean, now: number) {
    this.advance(now);
    if (running && !this.running) {
      this.lastProgress = this.elapsed;
      this.resetWindow();
    }
    this.running = running && !this.complete;
  }

  setAdaptive(enabled: boolean, now: number) {
    this.advance(now);
    this.adaptive = enabled;
    this.interval = 500;
    this.lastProgress = this.elapsed;
    this.previousRate = null;
    this.healthyWindows = 0;
    this.cooldown = 0;
    this.resetWindow();
    this.reason = enabled ? "Starting at 500ms; collecting feedback." : "Manual speed.";
  }

  private resetWindow() {
    this.lastDecision = this.elapsed;
    this.windowBytes = this.bytes;
    this.shown.clear();
  }

  markShown(index: number, now: number) {
    this.advance(now);
    if (this.running && index >= 0 && index < this.payloadSizes.length && !this.acknowledged.has(index) && !this.shown.has(index)) {
      this.shown.set(index, this.elapsed);
    }
  }

  acknowledge(missing: number[], now: number) {
    this.advance(now);
    const absent = new Set(missing);
    for (let i = 0; i < this.payloadSizes.length; i++) {
      if (!absent.has(i + 1) && !this.acknowledged.has(i)) {
        this.acknowledged.add(i);
        this.bytes += this.payloadSizes[i];
        this.lastProgress = this.elapsed;
      }
    }
    if (this.complete) {
      this.running = false;
      this.reason = "All payload bytes acknowledged.";
    }
  }

  get complete() { return this.payloadSizes.length > 0 && this.acknowledged.size === this.payloadSizes.length; }

  tick(now: number) {
    this.advance(now);
    if (this.adaptive && this.running && this.elapsed - this.lastDecision >= WINDOW_MS) {
      const rate = (this.bytes - this.windowBytes) / ((this.elapsed - this.lastDecision) / 1000);
      const eligible = [...this.shown].filter(([, at]) => this.elapsed - at >= FEEDBACK_GRACE_MS);
      const success = eligible.filter(([index]) => this.acknowledged.has(index)).length;
      const ratio = eligible.length ? success / eligible.length : null;
      const position = SPEEDS.indexOf(this.interval);
      let assessed = true;
      if (this.elapsed - this.lastProgress >= STALL_MS) {
        this.interval = SPEEDS[Math.min(SPEEDS.length - 1, position + 2)];
        this.reason = "No new acknowledgements for 5s; slowing down.";
        this.healthyWindows = 0;
        this.cooldown = 2;
      } else if (this.payloadSizes.length - this.acknowledged.size <= 3) {
        this.interval = Math.max(500, this.interval);
        this.reason = "Finishing remaining codes at a conservative speed.";
      } else if (eligible.length >= 4) {
        if (ratio! < 0.7 || (this.previousRate !== null && rate < this.previousRate * 0.8)) {
          this.interval = SPEEDS[Math.min(SPEEDS.length - 1, position + 1)];
          this.reason = "Reception or useful throughput fell; slowing down.";
          this.healthyWindows = 0;
          this.cooldown = 2;
        } else if (ratio! >= 0.9) {
          if (this.cooldown > 0) this.cooldown--;
          else this.healthyWindows++;
          if (this.healthyWindows >= 2) {
            this.interval = SPEEDS[Math.max(0, position - 1)];
            this.reason = "Two healthy feedback windows; trying a faster speed.";
            this.healthyWindows = 0;
          } else this.reason = "Reception is healthy; confirming stability.";
        } else {
          this.healthyWindows = 0;
          this.reason = "Holding speed while monitoring reception.";
        }
        this.previousRate = rate;
      } else {
        assessed = false;
        this.reason = "Waiting for enough displayed codes and delayed feedback.";
      }
      // Retain newly displayed codes until feedback has had time to arrive.
      if (assessed) for (const [index] of eligible) this.shown.delete(index);
      this.lastDecision = this.elapsed;
      this.windowBytes = this.bytes;
    }
    return {
      interval: this.interval, reason: this.reason, acknowledgedBytes: this.bytes,
      bytesPerSecond: this.elapsed > 0 ? this.bytes / (this.elapsed / 1000) : null,
      complete: this.complete,
    };
  }
}
