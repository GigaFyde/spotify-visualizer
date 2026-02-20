export type Priority = 'critical' | 'high' | 'normal';

export interface RateLimiterConfig {
  maxTokens: number;
  refillRate: number;
  minTokensForPoll: number;
}

const DEFAULT_CONFIG: RateLimiterConfig = {
  maxTokens: 10,
  refillRate: 8,
  minTokensForPoll: 1,
};

interface WaitEntry {
  priority: Priority;
  resolve: (acquired: boolean) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly config: RateLimiterConfig;
  private waitQueue: WaitEntry[] = [];
  private drainTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<RateLimiterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.tokens = this.config.maxTokens;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(
      this.config.maxTokens,
      this.tokens + elapsed * this.config.refillRate,
    );
    this.lastRefill = now;
  }

  private canAcquire(priority: Priority): boolean {
    if (priority === 'normal') {
      return this.tokens > this.config.minTokensForPoll;
    }
    return this.tokens >= 1;
  }

  private startDrain(): void {
    if (this.drainTimer) return;
    this.drainTimer = setInterval(() => this.drain(), 100);
  }

  private stopDrain(): void {
    if (this.drainTimer) {
      clearInterval(this.drainTimer);
      this.drainTimer = null;
    }
  }

  private drain(): void {
    this.refill();
    for (const pri of ['high', 'normal'] as Priority[]) {
      for (let i = 0; i < this.waitQueue.length; i++) {
        const entry = this.waitQueue[i];
        if (entry.priority !== pri) continue;
        if (!this.canAcquire(pri)) break;
        this.tokens -= 1;
        this.waitQueue.splice(i, 1);
        i--;
        clearTimeout(entry.timeoutId);
        entry.resolve(true);
      }
    }
    if (this.waitQueue.length === 0) this.stopDrain();
  }

  acquire(priority: Priority = 'normal'): Promise<boolean> {
    if (priority === 'critical') return Promise.resolve(true);

    this.refill();
    if (this.canAcquire(priority)) {
      this.tokens -= 1;
      return Promise.resolve(true);
    }

    const timeout = priority === 'high' ? 2000 : 5000;

    return new Promise<boolean>((resolve) => {
      const entry: WaitEntry = {
        priority,
        resolve,
        timeoutId: setTimeout(() => {
          const idx = this.waitQueue.indexOf(entry);
          if (idx !== -1) this.waitQueue.splice(idx, 1);
          if (this.waitQueue.length === 0) this.stopDrain();
          resolve(false);
        }, timeout),
      };
      this.waitQueue.push(entry);
      this.startDrain();
    });
  }

  get availableTokens(): number {
    this.refill();
    return this.tokens;
  }

  get stats(): { availableTokens: number; maxTokens: number; refillRate: number } {
    this.refill();
    return {
      availableTokens: Math.round(this.tokens * 100) / 100,
      maxTokens: this.config.maxTokens,
      refillRate: this.config.refillRate,
    };
  }

  destroy(): void {
    this.stopDrain();
    for (const entry of this.waitQueue) {
      clearTimeout(entry.timeoutId);
      entry.resolve(false);
    }
    this.waitQueue = [];
  }
}
