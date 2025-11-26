import { Logger } from '../../core/Logger';

/**
 * Rate limit configuration per client
 */
export interface RateLimitConfig {
  /** Maximum tokens (requests) allowed */
  maxTokens: number;
  /** Token refill rate (tokens per second) */
  refillRate: number;
  /** Penalty duration for exceeding limit (ms) */
  penaltyDuration?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Rate limit bucket for a client
 */
export interface RateLimitBucket {
  /** Client ID */
  clientId: string;
  /** Current token count */
  tokens: number;
  /** Maximum tokens */
  maxTokens: number;
  /** Refill rate (tokens/second) */
  refillRate: number;
  /** Last refill timestamp */
  lastRefill: number;
  /** Penalty end time (if penalized) */
  penaltyUntil: number | null;
  /** Total requests made */
  totalRequests: number;
  /** Requests blocked */
  blockedRequests: number;
}

/**
 * Rate limit result
 */
export interface RateLimitResult {
  /** Is request allowed */
  allowed: boolean;
  /** Remaining tokens */
  remaining: number;
  /** Time until next token refill (ms) */
  retryAfter?: number;
  /** Reason for denial */
  reason?: string;
}

/**
 * Rate limiter using token bucket algorithm.
 * Prevents spam and DoS attacks by limiting requests per client.
 *
 * @example
 * ```typescript
 * const rateLimiter = new RateLimiter({
 *   maxTokens: 60,
 *   refillRate: 10, // 10 tokens per second
 *   penaltyDuration: 5000
 * });
 *
 * // Check if client can make a request
 * const result = rateLimiter.checkLimit('client1');
 * if (result.allowed) {
 *   // Process request
 * } else {
 *   console.log('Rate limited:', result.reason);
 * }
 * ```
 */
export class RateLimiter {
  private readonly buckets: Map<string, RateLimitBucket> = new Map();
  private readonly globalConfig: Required<Omit<RateLimitConfig, 'debug'>>;
  private readonly debug: boolean;
  private readonly logger: Logger;
  private cleanupInterval: number | null = null;

  constructor(config: RateLimitConfig) {
    this.globalConfig = {
      maxTokens: config.maxTokens,
      refillRate: config.refillRate,
      penaltyDuration: config.penaltyDuration ?? 5000
    };
    this.debug = config.debug ?? false;
    this.logger = new Logger('RateLimiter');

    // Start periodic cleanup
    this.startCleanup();
  }

  /**
   * Check if a client can make a request and consume a token
   *
   * @param clientId - Client identifier
   * @param cost - Number of tokens to consume (default: 1)
   * @returns Rate limit result
   */
  public checkLimit(clientId: string, cost: number = 1): RateLimitResult {
    const bucket = this.getBucket(clientId);
    const now = performance.now();

    // Check if client is penalized
    if (bucket.penaltyUntil !== null && now < bucket.penaltyUntil) {
      bucket.blockedRequests++;
      const retryAfter = bucket.penaltyUntil - now;

      if (this.debug) {
        this.logger.debug(
          `Client ${clientId} penalized, retry after ${retryAfter.toFixed(0)}ms`
        );
      }

      return {
        allowed: false,
        remaining: 0,
        retryAfter,
        reason: 'penalized'
      };
    }

    // Clear penalty if expired
    if (bucket.penaltyUntil !== null && now >= bucket.penaltyUntil) {
      bucket.penaltyUntil = null;
      if (this.debug) {
        this.logger.debug(`Penalty cleared for client ${clientId}`);
      }
    }

    // Refill tokens
    this.refillBucket(bucket, now);

    // Check if enough tokens
    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      bucket.totalRequests++;

      if (this.debug) {
        this.logger.debug(
          `Request allowed for ${clientId}, remaining: ${bucket.tokens.toFixed(2)}`
        );
      }

      return {
        allowed: true,
        remaining: Math.floor(bucket.tokens)
      };
    }

    // Rate limit exceeded
    bucket.blockedRequests++;

    // Apply penalty if too many blocked requests
    if (bucket.blockedRequests >= 10) {
      bucket.penaltyUntil = now + this.globalConfig.penaltyDuration;
      if (this.debug) {
        this.logger.warn(
          `Client ${clientId} penalized for ${this.globalConfig.penaltyDuration}ms`
        );
      }
    }

    const retryAfter = (cost - bucket.tokens) / bucket.refillRate * 1000;

    if (this.debug) {
      this.logger.debug(
        `Request denied for ${clientId}, retry after ${retryAfter.toFixed(0)}ms`
      );
    }

    return {
      allowed: false,
      remaining: Math.floor(bucket.tokens),
      retryAfter,
      reason: 'rate_limit_exceeded'
    };
  }

  /**
   * Get or create a bucket for a client
   */
  private getBucket(clientId: string): RateLimitBucket {
    let bucket = this.buckets.get(clientId);

    if (!bucket) {
      bucket = {
        clientId,
        tokens: this.globalConfig.maxTokens,
        maxTokens: this.globalConfig.maxTokens,
        refillRate: this.globalConfig.refillRate,
        lastRefill: performance.now(),
        penaltyUntil: null,
        totalRequests: 0,
        blockedRequests: 0
      };

      this.buckets.set(clientId, bucket);

      if (this.debug) {
        this.logger.debug(`Created rate limit bucket for ${clientId}`);
      }
    }

    return bucket;
  }

  /**
   * Refill tokens in a bucket based on time elapsed
   */
  private refillBucket(bucket: RateLimitBucket, now: number): void {
    const elapsed = (now - bucket.lastRefill) / 1000; // Convert to seconds
    const tokensToAdd = elapsed * bucket.refillRate;

    bucket.tokens = Math.min(bucket.maxTokens, bucket.tokens + tokensToAdd);
    bucket.lastRefill = now;
  }

  /**
   * Set custom rate limit for a specific client
   *
   * @param clientId - Client identifier
   * @param config - Custom rate limit configuration
   */
  public setClientLimit(clientId: string, config: Partial<RateLimitConfig>): void {
    const bucket = this.getBucket(clientId);

    if (config.maxTokens !== undefined) {
      bucket.maxTokens = config.maxTokens;
      bucket.tokens = Math.min(bucket.tokens, bucket.maxTokens);
    }

    if (config.refillRate !== undefined) {
      bucket.refillRate = config.refillRate;
    }

    if (this.debug) {
      this.logger.debug(`Updated rate limit for ${clientId}`, config);
    }
  }

  /**
   * Reset rate limit for a client
   *
   * @param clientId - Client identifier
   */
  public resetClient(clientId: string): void {
    const bucket = this.buckets.get(clientId);
    if (!bucket) {
      return;
    }

    bucket.tokens = bucket.maxTokens;
    bucket.lastRefill = performance.now();
    bucket.penaltyUntil = null;
    bucket.blockedRequests = 0;

    if (this.debug) {
      this.logger.debug(`Reset rate limit for ${clientId}`);
    }
  }

  /**
   * Remove a client's rate limit bucket
   *
   * @param clientId - Client identifier
   * @returns True if client was removed
   */
  public removeClient(clientId: string): boolean {
    const removed = this.buckets.delete(clientId);

    if (removed && this.debug) {
      this.logger.debug(`Removed rate limit bucket for ${clientId}`);
    }

    return removed;
  }

  /**
   * Apply penalty to a client
   *
   * @param clientId - Client identifier
   * @param duration - Penalty duration in milliseconds
   */
  public penalizeClient(clientId: string, duration?: number): void {
    const bucket = this.getBucket(clientId);
    bucket.penaltyUntil = performance.now() + (duration ?? this.globalConfig.penaltyDuration);

    if (this.debug) {
      this.logger.warn(`Penalized client ${clientId} for ${duration ?? this.globalConfig.penaltyDuration}ms`);
    }
  }

  /**
   * Clear penalty for a client
   *
   * @param clientId - Client identifier
   */
  public clearPenalty(clientId: string): void {
    const bucket = this.buckets.get(clientId);
    if (bucket) {
      bucket.penaltyUntil = null;
      bucket.blockedRequests = 0;

      if (this.debug) {
        this.logger.debug(`Cleared penalty for ${clientId}`);
      }
    }
  }

  /**
   * Check if a client is penalized
   *
   * @param clientId - Client identifier
   * @returns True if client is currently penalized
   */
  public isPenalized(clientId: string): boolean {
    const bucket = this.buckets.get(clientId);
    if (!bucket || bucket.penaltyUntil === null) {
      return false;
    }

    return performance.now() < bucket.penaltyUntil;
  }

  /**
   * Get bucket information for a client
   *
   * @param clientId - Client identifier
   * @returns Bucket information or undefined
   */
  public getClientInfo(clientId: string): RateLimitBucket | undefined {
    const bucket = this.buckets.get(clientId);
    if (!bucket) {
      return undefined;
    }

    // Refill before returning info
    this.refillBucket(bucket, performance.now());

    return { ...bucket };
  }

  /**
   * Get remaining tokens for a client
   *
   * @param clientId - Client identifier
   * @returns Number of remaining tokens
   */
  public getRemainingTokens(clientId: string): number {
    const bucket = this.buckets.get(clientId);
    if (!bucket) {
      return this.globalConfig.maxTokens;
    }

    this.refillBucket(bucket, performance.now());
    return Math.floor(bucket.tokens);
  }

  /**
   * Start periodic cleanup of inactive buckets
   */
  private startCleanup(): void {
    const cleanupIntervalMs = 60000; // 1 minute

    this.cleanupInterval = window.setInterval(() => {
      this.cleanup();
    }, cleanupIntervalMs);
  }

  /**
   * Clean up inactive buckets
   */
  private cleanup(): void {
    const now = performance.now();
    const inactiveThreshold = 300000; // 5 minutes
    let removed = 0;

    for (const [clientId, bucket] of this.buckets) {
      const inactive = now - bucket.lastRefill > inactiveThreshold;
      const noPenalty = bucket.penaltyUntil === null || now >= bucket.penaltyUntil;

      if (inactive && noPenalty) {
        this.buckets.delete(clientId);
        removed++;
      }
    }

    if (removed > 0 && this.debug) {
      this.logger.debug(`Cleaned up ${removed} inactive rate limit buckets`);
    }
  }

  /**
   * Stop the cleanup interval
   */
  public stopCleanup(): void {
    if (this.cleanupInterval !== null) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Get rate limiter statistics
   */
  public getStats(): {
    totalClients: number;
    totalRequests: number;
    totalBlocked: number;
    penalizedClients: number;
    blockRate: number;
  } {
    let totalRequests = 0;
    let totalBlocked = 0;
    let penalizedClients = 0;
    const now = performance.now();

    for (const bucket of this.buckets.values()) {
      totalRequests += bucket.totalRequests;
      totalBlocked += bucket.blockedRequests;

      if (bucket.penaltyUntil !== null && now < bucket.penaltyUntil) {
        penalizedClients++;
      }
    }

    const blockRate = totalRequests > 0 ? totalBlocked / totalRequests : 0;

    return {
      totalClients: this.buckets.size,
      totalRequests,
      totalBlocked,
      penalizedClients,
      blockRate
    };
  }

  /**
   * Get top clients by request count
   *
   * @param limit - Number of top clients to return
   * @returns Array of client IDs and request counts
   */
  public getTopClients(limit: number = 10): Array<{ clientId: string; requests: number }> {
    const clients = Array.from(this.buckets.values())
      .map(bucket => ({
        clientId: bucket.clientId,
        requests: bucket.totalRequests
      }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, limit);

    return clients;
  }

  /**
   * Get clients that exceeded rate limit
   *
   * @param minBlocked - Minimum blocked requests
   * @returns Array of client IDs
   */
  public getViolatingClients(minBlocked: number = 5): string[] {
    const violators: string[] = [];

    for (const bucket of this.buckets.values()) {
      if (bucket.blockedRequests >= minBlocked) {
        violators.push(bucket.clientId);
      }
    }

    return violators;
  }

  /**
   * Reset all client buckets
   */
  public resetAll(): void {
    for (const bucket of this.buckets.values()) {
      bucket.tokens = bucket.maxTokens;
      bucket.lastRefill = performance.now();
      bucket.penaltyUntil = null;
      bucket.totalRequests = 0;
      bucket.blockedRequests = 0;
    }

    if (this.debug) {
      this.logger.debug('Reset all rate limit buckets');
    }
  }

  /**
   * Clear all buckets
   */
  public clear(): void {
    this.buckets.clear();

    if (this.debug) {
      this.logger.debug('Cleared all rate limit buckets');
    }
  }

  /**
   * Shutdown the rate limiter
   */
  public shutdown(): void {
    this.stopCleanup();
    this.clear();

    if (this.debug) {
      this.logger.debug('Rate limiter shutdown');
    }
  }
}
