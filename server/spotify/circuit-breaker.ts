export type CircuitState = 'closed' | 'open' | 'half-open';
export type Priority = 'critical' | 'high' | 'normal';

const FAILURE_THRESHOLD = 3;
const INITIAL_COOLDOWN_MS = 10_000;
const MAX_COOLDOWN_MS = 60_000;
const COOLDOWN_RESET_MS = 60_000;

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private consecutiveFailures = 0;
  private cooldownMs = INITIAL_COOLDOWN_MS;
  private openedAt = 0;
  private closedAt = 0;

  /** Called on every 429 response from Spotify. */
  recordFailure(): void {
    this.consecutiveFailures++;
    if (this.state === 'half-open') {
      // Probe failed — reopen with doubled cooldown
      this.open();
      return;
    }
    if (this.state === 'closed' && this.consecutiveFailures >= FAILURE_THRESHOLD) {
      this.open();
    }
  }

  /** Called on every successful (non-429) response. */
  recordSuccess(): void {
    if (this.state === 'half-open') {
      // Probe succeeded — close the circuit
      this.close();
      return;
    }
    if (this.state === 'closed') {
      this.consecutiveFailures = 0;
    }
  }

  /**
   * Returns true if the request should be **blocked**.
   * High and critical priority requests are never blocked.
   */
  isOpen(priority: Priority): boolean {
    if (priority === 'high' || priority === 'critical') return false;

    if (this.state === 'closed') return false;

    if (this.state === 'open') {
      const elapsed = Date.now() - this.openedAt;
      if (elapsed >= this.cooldownMs) {
        // Cooldown expired — transition to half-open
        this.state = 'half-open';
        return false; // Allow this one request as probe
      }
      return true; // Still cooling down
    }

    // half-open: one probe already allowed via the transition above;
    // subsequent normal requests are blocked until the probe resolves
    return true;
  }

  getState(): CircuitState {
    return this.state;
  }

  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  getCooldownMs(): number {
    return this.cooldownMs;
  }

  private open(): void {
    if (this.state === 'open' || this.state === 'half-open') {
      // Repeated open — double cooldown
      this.cooldownMs = Math.min(this.cooldownMs * 2, MAX_COOLDOWN_MS);
    }
    this.state = 'open';
    this.openedAt = Date.now();
  }

  private close(): void {
    this.state = 'closed';
    this.consecutiveFailures = 0;
    this.closedAt = Date.now();
    // Don't reset cooldownMs here — it resets after 60s continuously closed
  }

  /**
   * Resets cooldown to initial value if the circuit has been
   * continuously closed for COOLDOWN_RESET_MS (60s).
   * Call this periodically (e.g., from the polling loop).
   */
  maybeResetCooldown(): void {
    if (this.state === 'closed' && this.closedAt > 0) {
      const elapsed = Date.now() - this.closedAt;
      if (elapsed >= COOLDOWN_RESET_MS) {
        this.cooldownMs = INITIAL_COOLDOWN_MS;
      }
    }
  }
}
