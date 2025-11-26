/**
 * G3D Leaderboards
 * Cloud leaderboard system with time-based rankings
 * @module Cloud
 */

import { CloudManager, CloudError } from './CloudManager';

/**
 * Leaderboard entry
 */
export interface LeaderboardEntry {
  /** Player ID */
  playerId: string;
  /** Player name */
  playerName: string;
  /** Score */
  score: number;
  /** Rank */
  rank: number;
  /** Submission timestamp */
  timestamp: number;
  /** Additional data */
  metadata?: Record<string, any>;
}

/**
 * Leaderboard time frame
 */
export type LeaderboardTimeFrame = 'all-time' | 'daily' | 'weekly' | 'monthly';

/**
 * Leaderboard sort order
 */
export type LeaderboardSortOrder = 'ascending' | 'descending';

/**
 * Leaderboard configuration
 */
export interface LeaderboardConfig {
  /** Leaderboard ID */
  id: string;
  /** Display name */
  name: string;
  /** Sort order */
  sortOrder: LeaderboardSortOrder;
  /** Score format (integer, decimal, time) */
  scoreFormat: 'integer' | 'decimal' | 'time';
  /** Reset interval */
  resetInterval?: LeaderboardTimeFrame;
}

/**
 * Pagination options
 */
export interface PaginationOptions {
  /** Number of entries per page */
  limit: number;
  /** Offset from start */
  offset: number;
}

/**
 * Leaderboard result
 */
export interface LeaderboardResult {
  /** Entries */
  entries: LeaderboardEntry[];
  /** Total entries */
  total: number;
  /** Player's entry (if any) */
  playerEntry?: LeaderboardEntry;
  /** Time frame */
  timeFrame: LeaderboardTimeFrame;
  /** Last updated */
  lastUpdated: number;
}

/**
 * Leaderboards Service
 * Manages cloud leaderboards
 */
export class Leaderboards {
  private cloudManager: CloudManager;
  private cache: Map<string, { result: LeaderboardResult; expiry: number }> = new Map();
  private readonly CACHE_DURATION = 60000; // 1 minute

  constructor(cloudManager: CloudManager) {
    this.cloudManager = cloudManager;
  }

  /**
   * Submit score to leaderboard
   */
  public async submitScore(
    leaderboardId: string,
    score: number,
    metadata?: Record<string, any>
  ): Promise<LeaderboardEntry> {
    if (!this.cloudManager.isConnected()) {
      throw new CloudError('Cannot submit score while offline', 'OFFLINE');
    }

    if (!this.cloudManager.auth.isAuthenticated()) {
      throw new CloudError('Not authenticated', 'NOT_AUTHENTICATED');
    }

    try {
      const response = await this.cloudManager.requestWithRetry<LeaderboardEntry>(
        `/leaderboards/${leaderboardId}/scores`,
        {
          method: 'POST',
          body: JSON.stringify({ score, metadata })
        }
      );

      // Invalidate cache
      this.invalidateCache(leaderboardId);

      console.log('[Leaderboards] Score submitted:', leaderboardId, score);
      return response;
    } catch (error: any) {
      throw new CloudError(
        error.message || 'Failed to submit score',
        'LEADERBOARD_SUBMIT_FAILED'
      );
    }
  }

  /**
   * Get leaderboard rankings
   */
  public async getRankings(
    leaderboardId: string,
    timeFrame: LeaderboardTimeFrame = 'all-time',
    pagination?: Partial<PaginationOptions>
  ): Promise<LeaderboardResult> {
    // Check cache
    const cacheKey = `${leaderboardId}_${timeFrame}_${pagination?.offset || 0}_${pagination?.limit || 10}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiry > Date.now()) {
      return cached.result;
    }

    if (!this.cloudManager.isConnected()) {
      throw new CloudError('Cannot fetch rankings while offline', 'OFFLINE');
    }

    try {
      const params = new URLSearchParams({
        timeFrame,
        limit: String(pagination?.limit || 10),
        offset: String(pagination?.offset || 0)
      });

      const response = await this.cloudManager.requestWithRetry<LeaderboardResult>(
        `/leaderboards/${leaderboardId}?${params}`,
        { method: 'GET' }
      );

      // Cache result
      this.cache.set(cacheKey, {
        result: response,
        expiry: Date.now() + this.CACHE_DURATION
      });

      return response;
    } catch (error: any) {
      throw new CloudError(
        error.message || 'Failed to fetch rankings',
        'LEADERBOARD_FETCH_FAILED'
      );
    }
  }

  /**
   * Get player's rank
   */
  public async getPlayerRank(
    leaderboardId: string,
    playerId?: string,
    timeFrame: LeaderboardTimeFrame = 'all-time'
  ): Promise<LeaderboardEntry | null> {
    if (!this.cloudManager.isConnected()) {
      throw new CloudError('Cannot fetch rank while offline', 'OFFLINE');
    }

    const userId = playerId || this.cloudManager.auth.getCurrentUser()?.id;
    if (!userId) {
      throw new CloudError('No player ID provided', 'NO_PLAYER_ID');
    }

    try {
      const params = new URLSearchParams({ timeFrame });

      const response = await this.cloudManager.requestWithRetry<LeaderboardEntry>(
        `/leaderboards/${leaderboardId}/players/${userId}?${params}`,
        { method: 'GET' }
      );

      return response;
    } catch (error: any) {
      if (error.statusCode === 404) {
        return null; // Player not on leaderboard
      }
      throw new CloudError(
        error.message || 'Failed to fetch player rank',
        'LEADERBOARD_RANK_FAILED'
      );
    }
  }

  /**
   * Get rankings around player
   */
  public async getRankingsAroundPlayer(
    leaderboardId: string,
    range: number = 5,
    timeFrame: LeaderboardTimeFrame = 'all-time'
  ): Promise<LeaderboardResult> {
    if (!this.cloudManager.isConnected()) {
      throw new CloudError('Cannot fetch rankings while offline', 'OFFLINE');
    }

    if (!this.cloudManager.auth.isAuthenticated()) {
      throw new CloudError('Not authenticated', 'NOT_AUTHENTICATED');
    }

    try {
      const params = new URLSearchParams({
        timeFrame,
        range: String(range)
      });

      const response = await this.cloudManager.requestWithRetry<LeaderboardResult>(
        `/leaderboards/${leaderboardId}/around-player?${params}`,
        { method: 'GET' }
      );

      return response;
    } catch (error: any) {
      throw new CloudError(
        error.message || 'Failed to fetch rankings around player',
        'LEADERBOARD_FETCH_FAILED'
      );
    }
  }

  /**
   * Get friend leaderboard
   */
  public async getFriendRankings(
    leaderboardId: string,
    friendIds: string[],
    timeFrame: LeaderboardTimeFrame = 'all-time'
  ): Promise<LeaderboardResult> {
    if (!this.cloudManager.isConnected()) {
      throw new CloudError('Cannot fetch friend rankings while offline', 'OFFLINE');
    }

    try {
      const params = new URLSearchParams({ timeFrame });

      const response = await this.cloudManager.requestWithRetry<LeaderboardResult>(
        `/leaderboards/${leaderboardId}/friends?${params}`,
        {
          method: 'POST',
          body: JSON.stringify({ friendIds })
        }
      );

      return response;
    } catch (error: any) {
      throw new CloudError(
        error.message || 'Failed to fetch friend rankings',
        'LEADERBOARD_FETCH_FAILED'
      );
    }
  }

  /**
   * Get top entries
   */
  public async getTopEntries(
    leaderboardId: string,
    count: number = 10,
    timeFrame: LeaderboardTimeFrame = 'all-time'
  ): Promise<LeaderboardEntry[]> {
    const result = await this.getRankings(leaderboardId, timeFrame, {
      limit: count,
      offset: 0
    });

    return result.entries;
  }

  /**
   * Create leaderboard
   */
  public async createLeaderboard(config: LeaderboardConfig): Promise<void> {
    if (!this.cloudManager.isConnected()) {
      throw new CloudError('Cannot create leaderboard while offline', 'OFFLINE');
    }

    try {
      await this.cloudManager.requestWithRetry('/leaderboards', {
        method: 'POST',
        body: JSON.stringify(config)
      });

      console.log('[Leaderboards] Leaderboard created:', config.id);
    } catch (error: any) {
      throw new CloudError(
        error.message || 'Failed to create leaderboard',
        'LEADERBOARD_CREATE_FAILED'
      );
    }
  }

  /**
   * Delete player score
   */
  public async deleteScore(
    leaderboardId: string,
    playerId?: string
  ): Promise<void> {
    if (!this.cloudManager.isConnected()) {
      throw new CloudError('Cannot delete score while offline', 'OFFLINE');
    }

    const userId = playerId || this.cloudManager.auth.getCurrentUser()?.id;
    if (!userId) {
      throw new CloudError('No player ID provided', 'NO_PLAYER_ID');
    }

    try {
      await this.cloudManager.requestWithRetry(
        `/leaderboards/${leaderboardId}/players/${userId}`,
        { method: 'DELETE' }
      );

      // Invalidate cache
      this.invalidateCache(leaderboardId);

      console.log('[Leaderboards] Score deleted:', leaderboardId);
    } catch (error: any) {
      throw new CloudError(
        error.message || 'Failed to delete score',
        'LEADERBOARD_DELETE_FAILED'
      );
    }
  }

  /**
   * Invalidate cache for leaderboard
   */
  private invalidateCache(leaderboardId: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(leaderboardId)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache
   */
  public clearCache(): void {
    this.cache.clear();
  }
}
