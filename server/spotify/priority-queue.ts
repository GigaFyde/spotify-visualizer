export type Priority = 'critical' | 'high' | 'normal';

export class QueueTimeoutError extends Error {
  constructor(priority: Priority) {
    super(`Queue timeout: ${priority} priority request expired`);
    this.name = 'QueueTimeoutError';
  }
}

interface QueueEntry {
  priority: Priority;
  resolve: (proceed: boolean) => void;
  timer: ReturnType<typeof setTimeout> | null;
}

const TIMEOUTS: Record<Exclude<Priority, 'critical'>, number> = {
  high: 2000,
  normal: 5000,
};

export class PriorityQueue {
  private queue: QueueEntry[] = [];

  get size(): number {
    return this.queue.length;
  }

  /**
   * Add a request to the queue.
   * - critical: resolves immediately (bypasses queue)
   * - high: front of queue, rejects after 2s with QueueTimeoutError
   * - normal: back of queue, resolves with false (dropped) after 5s
   *
   * Returns true if the request should proceed, false if dropped.
   */
  enqueue(priority: Priority): Promise<boolean> {
    if (priority === 'critical') {
      return Promise.resolve(true);
    }

    return new Promise<boolean>((resolve, reject) => {
      const entry: QueueEntry = {
        priority,
        resolve,
        timer: null,
      };

      entry.timer = setTimeout(() => {
        this.remove(entry);
        if (priority === 'high') {
          reject(new QueueTimeoutError(priority));
        } else {
          // normal: dropped silently
          resolve(false);
        }
      }, TIMEOUTS[priority]);

      if (priority === 'high') {
        // Insert at front (but after other high-priority entries)
        const insertIdx = this.queue.findIndex(e => e.priority !== 'high');
        if (insertIdx === -1) {
          this.queue.push(entry);
        } else {
          this.queue.splice(insertIdx, 0, entry);
        }
      } else {
        this.queue.push(entry);
      }
    });
  }

  /** Return the priority of the next entry without dequeuing. */
  peekPriority(): Priority | null {
    return this.queue[0]?.priority ?? null;
  }

  /**
   * Signal the next queued request to proceed.
   * Returns true if a request was dequeued, false if queue was empty.
   */
  processNext(): boolean {
    const entry = this.queue.shift();
    if (!entry) return false;

    if (entry.timer) clearTimeout(entry.timer);
    entry.resolve(true);
    return true;
  }

  /**
   * Clear all pending requests. High-priority requests get timeout errors,
   * normal requests are dropped silently.
   */
  clear(): void {
    for (const entry of this.queue) {
      if (entry.timer) clearTimeout(entry.timer);
      if (entry.priority === 'high') {
        // Use resolve(false) during clear — not an unexpected timeout, just shutdown
        entry.resolve(false);
      } else {
        entry.resolve(false);
      }
    }
    this.queue = [];
  }

  private remove(entry: QueueEntry): void {
    const idx = this.queue.indexOf(entry);
    if (idx !== -1) this.queue.splice(idx, 1);
  }
}
