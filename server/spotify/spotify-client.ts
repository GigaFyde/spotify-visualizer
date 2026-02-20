import { RateLimiter, type Priority } from './rate-limiter.js';
import { PriorityQueue, QueueTimeoutError } from './priority-queue.js';
import { CircuitBreaker, type CircuitState } from './circuit-breaker.js';

export { QueueTimeoutError };
export type { Priority };

export type HealthStatus = 'ok' | 'degraded' | 'limited';

type BroadcastFn = (status: HealthStatus, retryAfter?: number) => void;

interface SessionBudgetData {
  polls: number[];
  commands: number[];
}

// --- Error types ---

export class SpotifyClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SpotifyClientError';
  }
}

export class CircuitOpenError extends SpotifyClientError {
  constructor() {
    super('Circuit breaker is open');
    this.name = 'CircuitOpenError';
  }
}

export class BudgetExceededError extends SpotifyClientError {
  readonly budgetType: 'poll' | 'command';
  constructor(budgetType: 'poll' | 'command') {
    super(`Session ${budgetType} budget exceeded`);
    this.name = 'BudgetExceededError';
    this.budgetType = budgetType;
  }
}

export class RequestDroppedError extends SpotifyClientError {
  constructor() {
    super('Request dropped from queue');
    this.name = 'RequestDroppedError';
  }
}

// --- SpotifyClient ---

const BACKOFF_BASE_MS = 1000;
const BACKOFF_MULTIPLIER = 2;
const BACKOFF_MAX_MS = 30_000;
const BACKOFF_JITTER = 0.25;
const MAX_RETRIES = 3;

const BUDGET_WINDOW_MS = 60_000;
const POLLS_PER_MINUTE = 15;
const COMMANDS_PER_MINUTE = 30;

export class SpotifyClient {
  private rateLimiter: RateLimiter;
  private queue: PriorityQueue;
  private circuitBreaker: CircuitBreaker;
  private sessionBudgets = new Map<string, SessionBudgetData>();
  private broadcastFn: BroadcastFn | null = null;
  private currentHealth: HealthStatus = 'ok';
  private consecutive429s = 0;
  private processorRunning = false;

  constructor() {
    this.rateLimiter = new RateLimiter();
    this.queue = new PriorityQueue();
    this.circuitBreaker = new CircuitBreaker();
  }

  /**
   * Set the broadcast callback for api_health status changes.
   * Designed as a setter so the caller can wire it up later (decoupled from ws/session).
   */
  setBroadcastFn(fn: BroadcastFn): void {
    this.broadcastFn = fn;
  }

  /**
   * Send a request to the Spotify API through the rate limiter, queue, and circuit breaker.
   *
   * Throws:
   * - CircuitOpenError: circuit breaker is open for this priority
   * - BudgetExceededError: session budget exhausted
   * - QueueTimeoutError: high-priority request timed out in queue
   * - RequestDroppedError: normal-priority request dropped from queue
   */
  async request(
    token: string,
    url: string,
    options?: RequestInit,
    priority: Priority = 'normal',
    sessionId?: string,
  ): Promise<Response> {
    // 1. Circuit breaker check (high/critical bypass)
    if (this.circuitBreaker.isOpen(priority)) {
      throw new CircuitOpenError();
    }

    // 2. Session budget check
    if (sessionId) {
      const budgetType = priority === 'normal' ? 'poll' : 'command';
      if (!this.checkBudget(sessionId, budgetType)) {
        throw new BudgetExceededError(budgetType);
      }
    }

    // 3. Critical bypasses queue and rate limiter
    if (priority === 'critical') {
      if (sessionId) this.recordUsage(sessionId, 'command');
      return this.executeWithRetry(token, url, options);
    }

    // 4. Wait in priority queue (processor releases entries as rate limit tokens are available)
    // High-priority: rejects with QueueTimeoutError after 2s
    // Normal: resolves false (dropped) after 5s
    const proceed = await this.enqueueAndWait(priority);
    if (!proceed) {
      throw new RequestDroppedError();
    }

    // 5. Record budget usage after acquiring queue + rate limit slot
    if (sessionId) {
      this.recordUsage(sessionId, priority === 'normal' ? 'poll' : 'command');
    }

    // 6. Execute with exponential backoff on 429
    return this.executeWithRetry(token, url, options);
  }

  /** Remove a session's budget data. Call when a session disconnects. */
  removeSession(sessionId: string): void {
    this.sessionBudgets.delete(sessionId);
  }

  /** Stats for admin endpoint. */
  getStats(): {
    rateLimiter: { availableTokens: number; maxTokens: number; refillRate: number };
    circuitBreaker: { state: CircuitState; consecutive429s: number; cooldownMs: number };
    queue: { size: number };
    sessions: {
      total: number;
      budgets: Record<string, { pollsUsed: number; commandsUsed: number }>;
    };
    health: HealthStatus;
  } {
    const now = Date.now();
    const cutoff = now - BUDGET_WINDOW_MS;

    const budgets: Record<string, { pollsUsed: number; commandsUsed: number }> = {};
    for (const [sessionId, budget] of this.sessionBudgets) {
      budget.polls = budget.polls.filter((t) => t > cutoff);
      budget.commands = budget.commands.filter((t) => t > cutoff);
      budgets[sessionId] = {
        pollsUsed: budget.polls.length,
        commandsUsed: budget.commands.length,
      };
    }

    return {
      rateLimiter: this.rateLimiter.stats,
      circuitBreaker: {
        state: this.circuitBreaker.getState(),
        consecutive429s: this.circuitBreaker.getConsecutiveFailures(),
        cooldownMs: this.circuitBreaker.getCooldownMs(),
      },
      queue: { size: this.queue.size },
      sessions: { total: this.sessionBudgets.size, budgets },
      health: this.currentHealth,
    };
  }

  /** Cleanup. */
  destroy(): void {
    this.rateLimiter.destroy();
    this.queue.clear();
    this.sessionBudgets.clear();
    this.broadcastFn = null;
  }

  // --- Private: queue + processor ---

  private async enqueueAndWait(priority: Priority): Promise<boolean> {
    const promise = this.queue.enqueue(priority);
    this.kickProcessor();
    return promise;
  }

  private kickProcessor(): void {
    if (this.processorRunning) return;
    this.processorRunning = true;
    this.runProcessor();
  }

  /**
   * Processing loop: acquires rate limit tokens and releases queue entries.
   * The PriorityQueue handles ordering (high first, normal second).
   * The RateLimiter controls flow rate.
   */
  private async runProcessor(): Promise<void> {
    while (this.queue.size > 0) {
      const acquired = await this.rateLimiter.acquire('high');
      if (acquired && this.queue.size > 0) {
        this.queue.processNext();
      }
    }
    this.processorRunning = false;
  }

  // --- Private: fetch with retry ---

  private async executeWithRetry(
    token: string,
    url: string,
    options?: RequestInit,
  ): Promise<Response> {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const response = await fetch(url, {
        ...options,
        headers: { Authorization: `Bearer ${token}`, ...options?.headers },
      });

      if (response.status !== 429) {
        // Non-429: record success, reset backoff tracking
        this.circuitBreaker.recordSuccess();
        if (this.consecutive429s > 0) {
          this.consecutive429s = 0;
          this.broadcastHealth();
        }
        return response;
      }

      // 429: record failure, update health
      this.circuitBreaker.recordFailure();
      this.consecutive429s++;
      this.broadcastHealth();

      if (attempt >= MAX_RETRIES) {
        return response;
      }

      const delay = this.calculateBackoffDelay(response, attempt);
      await sleep(delay);
    }

    // Unreachable, but TypeScript needs it
    throw new SpotifyClientError('Retry loop exited unexpectedly');
  }

  private calculateBackoffDelay(response: Response, attempt: number): number {
    // Check Retry-After header first
    const retryAfter = response.headers.get('Retry-After');
    if (retryAfter) {
      const seconds = Number(retryAfter);
      if (!Number.isNaN(seconds) && seconds > 0) {
        return seconds * 1000;
      }
      // Try HTTP-date format
      const date = new Date(retryAfter);
      if (!Number.isNaN(date.getTime())) {
        return Math.max(0, date.getTime() - Date.now());
      }
    }

    // Exponential backoff with ±25% jitter
    const base = Math.min(BACKOFF_BASE_MS * BACKOFF_MULTIPLIER ** attempt, BACKOFF_MAX_MS);
    const jitter = base * BACKOFF_JITTER * (Math.random() * 2 - 1);
    return base + jitter;
  }

  // --- Private: session budgets ---

  private getOrCreateBudget(sessionId: string): SessionBudgetData {
    let budget = this.sessionBudgets.get(sessionId);
    if (!budget) {
      budget = { polls: [], commands: [] };
      this.sessionBudgets.set(sessionId, budget);
    }
    return budget;
  }

  private checkBudget(sessionId: string, type: 'poll' | 'command'): boolean {
    const budget = this.getOrCreateBudget(sessionId);
    const now = Date.now();
    const cutoff = now - BUDGET_WINDOW_MS;

    if (type === 'poll') {
      budget.polls = budget.polls.filter((t) => t > cutoff);
      return budget.polls.length < POLLS_PER_MINUTE;
    }
    budget.commands = budget.commands.filter((t) => t > cutoff);
    return budget.commands.length < COMMANDS_PER_MINUTE;
  }

  private recordUsage(sessionId: string, type: 'poll' | 'command'): void {
    const budget = this.getOrCreateBudget(sessionId);
    const now = Date.now();
    if (type === 'poll') {
      budget.polls.push(now);
    } else {
      budget.commands.push(now);
    }
  }

  // --- Private: health status ---

  private broadcastHealth(): void {
    const circuitState = this.circuitBreaker.getState();
    let newStatus: HealthStatus;

    if (circuitState === 'open') {
      newStatus = 'limited';
    } else if (this.consecutive429s > 0) {
      newStatus = 'degraded';
    } else {
      newStatus = 'ok';
    }

    if (newStatus !== this.currentHealth) {
      this.currentHealth = newStatus;
      const retryAfter =
        newStatus !== 'ok'
          ? Math.ceil(this.circuitBreaker.getCooldownMs() / 1000)
          : undefined;
      this.broadcastFn?.(newStatus, retryAfter);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
