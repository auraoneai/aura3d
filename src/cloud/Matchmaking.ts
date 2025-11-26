/**
 * G3D Matchmaking
 * Cloud matchmaking with skill-based matching
 * @module Cloud
 */

import { CloudManager, CloudError } from './CloudManager';

/**
 * Match request
 */
export interface MatchRequest {
  /** Request ID */
  id: string;
  /** Game mode */
  gameMode: string;
  /** Player skill rating */
  skillRating?: number;
  /** Min players */
  minPlayers: number;
  /** Max players */
  maxPlayers: number;
  /** Acceptable skill variance */
  skillVariance?: number;
  /** Custom properties */
  properties?: Record<string, any>;
  /** Timestamp */
  timestamp: number;
}

/**
 * Match result
 */
export interface Match {
  /** Match ID */
  id: string;
  /** Game mode */
  gameMode: string;
  /** Matched players */
  players: MatchPlayer[];
  /** Match properties */
  properties?: Record<string, any>;
  /** Server endpoint (if dedicated server) */
  serverEndpoint?: string;
  /** Created timestamp */
  createdAt: number;
}

/**
 * Matched player
 */
export interface MatchPlayer {
  /** Player ID */
  playerId: string;
  /** Player name */
  playerName?: string;
  /** Skill rating */
  skillRating?: number;
  /** Team ID (if team-based) */
  teamId?: number;
  /** Custom properties */
  properties?: Record<string, any>;
}

/**
 * Match status
 */
export type MatchStatus = 'searching' | 'found' | 'cancelled' | 'timeout';

/**
 * Match found callback
 */
export type MatchFoundCallback = (match: Match) => void;

/**
 * Matchmaking configuration
 */
export interface MatchmakingConfig {
  /** Polling interval (ms) */
  pollingInterval: number;
  /** Match timeout (ms) */
  timeout: number;
  /** Auto-cancel on timeout */
  autoCancelOnTimeout: boolean;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: MatchmakingConfig = {
  pollingInterval: 2000, // 2 seconds
  timeout: 120000, // 2 minutes
  autoCancelOnTimeout: true
};

/**
 * Matchmaking Service
 * Manages cloud matchmaking
 */
export class Matchmaking {
  private cloudManager: CloudManager;
  private config: MatchmakingConfig;
  private currentRequest: MatchRequest | null = null;
  private status: MatchStatus = 'searching';
  private pollingTimer: number | null = null;
  private timeoutTimer: number | null = null;
  private matchFoundCallbacks: Set<MatchFoundCallback> = new Set();

  constructor(cloudManager: CloudManager, config?: Partial<MatchmakingConfig>) {
    this.cloudManager = cloudManager;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Request a match
   */
  public async requestMatch(
    gameMode: string,
    options?: {
      skillRating?: number;
      minPlayers?: number;
      maxPlayers?: number;
      skillVariance?: number;
      properties?: Record<string, any>;
    }
  ): Promise<string> {
    if (!this.cloudManager.isConnected()) {
      throw new CloudError('Cannot request match while offline', 'OFFLINE');
    }

    if (!this.cloudManager.auth.isAuthenticated()) {
      throw new CloudError('Not authenticated', 'NOT_AUTHENTICATED');
    }

    if (this.currentRequest) {
      throw new CloudError('Match request already in progress', 'REQUEST_IN_PROGRESS');
    }

    try {
      const request: Omit<MatchRequest, 'id' | 'timestamp'> = {
        gameMode,
        skillRating: options?.skillRating,
        minPlayers: options?.minPlayers || 2,
        maxPlayers: options?.maxPlayers || 4,
        skillVariance: options?.skillVariance || 100,
        properties: options?.properties
      };

      const response = await this.cloudManager.requestWithRetry<MatchRequest>(
        '/matchmaking/request',
        {
          method: 'POST',
          body: JSON.stringify(request)
        }
      );

      this.currentRequest = response;
      this.status = 'searching';

      // Start polling for match
      this.startPolling();

      // Start timeout timer
      this.startTimeout();

      console.log('[Matchmaking] Match requested:', response.id);
      return response.id;
    } catch (error: any) {
      throw new CloudError(
        error.message || 'Failed to request match',
        'MATCHMAKING_REQUEST_FAILED'
      );
    }
  }

  /**
   * Cancel match request
   */
  public async cancelMatch(): Promise<void> {
    if (!this.currentRequest) {
      return;
    }

    this.stopPolling();
    this.stopTimeout();

    try {
      await this.cloudManager.requestWithRetry(
        `/matchmaking/cancel/${this.currentRequest.id}`,
        { method: 'POST' }
      );

      console.log('[Matchmaking] Match cancelled:', this.currentRequest.id);
    } catch (error) {
      console.warn('[Matchmaking] Cancel failed:', error);
    } finally {
      this.currentRequest = null;
      this.status = 'cancelled';
    }
  }

  /**
   * Get match status
   */
  public async getMatchStatus(): Promise<MatchStatus> {
    if (!this.currentRequest) {
      return this.status;
    }

    if (!this.cloudManager.isConnected()) {
      return this.status;
    }

    try {
      const response = await this.cloudManager.request<{
        status: MatchStatus;
        match?: Match;
      }>(`/matchmaking/status/${this.currentRequest.id}`, {
        method: 'GET'
      });

      this.status = response.status;

      // Check if match found
      if (response.status === 'found' && response.match) {
        this.handleMatchFound(response.match);
      }

      return response.status;
    } catch (error) {
      console.warn('[Matchmaking] Status check failed:', error);
      return this.status;
    }
  }

  /**
   * Get current request
   */
  public getCurrentRequest(): MatchRequest | null {
    return this.currentRequest;
  }

  /**
   * Check if currently searching
   */
  public isSearching(): boolean {
    return this.status === 'searching';
  }

  /**
   * Add match found callback
   */
  public onMatchFound(callback: MatchFoundCallback): () => void {
    this.matchFoundCallbacks.add(callback);

    return () => {
      this.matchFoundCallbacks.delete(callback);
    };
  }

  /**
   * Join match by ID
   */
  public async joinMatch(matchId: string): Promise<Match> {
    if (!this.cloudManager.isConnected()) {
      throw new CloudError('Cannot join match while offline', 'OFFLINE');
    }

    if (!this.cloudManager.auth.isAuthenticated()) {
      throw new CloudError('Not authenticated', 'NOT_AUTHENTICATED');
    }

    try {
      const response = await this.cloudManager.requestWithRetry<Match>(
        `/matchmaking/join/${matchId}`,
        { method: 'POST' }
      );

      console.log('[Matchmaking] Joined match:', matchId);
      return response;
    } catch (error: any) {
      throw new CloudError(
        error.message || 'Failed to join match',
        'MATCHMAKING_JOIN_FAILED'
      );
    }
  }

  /**
   * Leave match
   */
  public async leaveMatch(matchId: string): Promise<void> {
    if (!this.cloudManager.isConnected()) {
      throw new CloudError('Cannot leave match while offline', 'OFFLINE');
    }

    try {
      await this.cloudManager.requestWithRetry(
        `/matchmaking/leave/${matchId}`,
        { method: 'POST' }
      );

      console.log('[Matchmaking] Left match:', matchId);
    } catch (error: any) {
      throw new CloudError(
        error.message || 'Failed to leave match',
        'MATCHMAKING_LEAVE_FAILED'
      );
    }
  }

  /**
   * Get match details
   */
  public async getMatch(matchId: string): Promise<Match> {
    if (!this.cloudManager.isConnected()) {
      throw new CloudError('Cannot get match while offline', 'OFFLINE');
    }

    try {
      const response = await this.cloudManager.requestWithRetry<Match>(
        `/matchmaking/match/${matchId}`,
        { method: 'GET' }
      );

      return response;
    } catch (error: any) {
      throw new CloudError(
        error.message || 'Failed to get match',
        'MATCHMAKING_GET_FAILED'
      );
    }
  }

  /**
   * Start polling for match
   */
  private startPolling(): void {
    this.stopPolling();

    this.pollingTimer = window.setInterval(() => {
      this.getMatchStatus().catch(error => {
        console.warn('[Matchmaking] Polling error:', error);
      });
    }, this.config.pollingInterval);
  }

  /**
   * Stop polling
   */
  private stopPolling(): void {
    if (this.pollingTimer !== null) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  /**
   * Start timeout timer
   */
  private startTimeout(): void {
    this.stopTimeout();

    this.timeoutTimer = window.setTimeout(() => {
      console.warn('[Matchmaking] Match request timed out');
      this.status = 'timeout';

      if (this.config.autoCancelOnTimeout) {
        this.cancelMatch();
      }
    }, this.config.timeout);
  }

  /**
   * Stop timeout timer
   */
  private stopTimeout(): void {
    if (this.timeoutTimer !== null) {
      clearTimeout(this.timeoutTimer);
      this.timeoutTimer = null;
    }
  }

  /**
   * Handle match found
   */
  private handleMatchFound(match: Match): void {
    this.stopPolling();
    this.stopTimeout();

    this.status = 'found';
    this.currentRequest = null;

    console.log('[Matchmaking] Match found:', match.id);

    // Notify callbacks
    for (const callback of this.matchFoundCallbacks) {
      try {
        callback(match);
      } catch (error) {
        console.error('[Matchmaking] Match found callback error:', error);
      }
    }
  }

  /**
   * Dispose matchmaking
   */
  public dispose(): void {
    this.stopPolling();
    this.stopTimeout();
    this.matchFoundCallbacks.clear();

    if (this.currentRequest) {
      this.cancelMatch().catch(error => {
        console.warn('[Matchmaking] Failed to cancel during dispose:', error);
      });
    }
  }
}
