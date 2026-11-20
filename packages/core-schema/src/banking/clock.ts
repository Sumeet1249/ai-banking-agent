/**
 * Injected Deterministic Clock Interface
 *
 * Rule E3 & Decision D4:
 * Never call Date.now() directly in security rules. All time-dependent
 * evaluation (permit TTL, mandate expiry, UNUSUAL_HOURS_IST) receives
 * an injected Clock.
 */

export interface Clock {
  /** Returns current integer UTC epoch milliseconds. */
  now(): number;
}

/** Production clock delegating to system time. */
export class SystemClock implements Clock {
  now(): number {
    return Date.now();
  }
}

/** Controllable deterministic clock for adversarial tests and demo playback. */
export class TestClock implements Clock {
  private currentMs: number;

  constructor(initialMs: number = Date.now()) {
    this.currentMs = initialMs;
  }

  now(): number {
    return this.currentMs;
  }

  set(epochMs: number): void {
    this.currentMs = epochMs;
  }

  advance(deltaMs: number): void {
    this.currentMs += deltaMs;
  }
}
