import { Logger } from '../../core/Logger';

/**
 * Player skill rating for matchmaking
 */
export interface PlayerSkill {
  /** Main skill rating (e.g., ELO, MMR) */
  rating: number;
  /** Confidence/uncertainty in rating */
  uncertainty: number;
  /** Number of games played */
  gamesPlayed: number;
}

/**
 * Matchmaking criteria
 */
export interface MatchmakingCriteria {
  /** Game mode */
  gameMode: string;
  /** Region preference */
  region?: string;
  /** Minimum players */
  minPlayers: number;
  /** Maximum players */
  maxPlayers: number;
  /** Skill rating range tolerance */
  skillTolerance?: number;
  /** Maximum ping tolerance (ms) */
  maxPing?: number;
  /** Custom criteria */
  custom?: Record<string, any>;
}

/**
 * Matchmaking queue entry
 */
export interface QueueEntry {
  /** Unique queue entry ID */
  id: string;
  /** Player ID */
  playerId: string;
  /** Player skill */
  skill: PlayerSkill;
  /** Matchmaking criteria */
  criteria: MatchmakingCriteria;
  /** Time entered queue */
  queueTime: number;
  /** Estimated wait time (ms) */
  estimatedWait?: number;
}

/**
 * Match found result
 */
export interface MatchFound {
  /** Match ID */
  matchId: string;
  /** Server connection info */
  serverAddress: string;
  /** Server port */
  serverPort: number;
  /** Session token for authentication */
  sessionToken: string;
  /** All players in match */
  players: Array<{
    playerId: string;
    skill: PlayerSkill;
    team?: number;
  }>;
  /** Average skill rating of match */
  averageSkill: number;
}

/**
 * Matchmaking status
 */
export enum MatchmakingStatus {
  IDLE = 'idle',
  SEARCHING = 'searching',
  MATCH_FOUND = 'match_found',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

/**
 * Matchmaking client configuration
 */
export interface MatchmakingClientConfig {
  /** WebSocket server URL */
  serverUrl: string;
  /** Auto-reconnect on disconnect */
  autoReconnect?: boolean;
  /** Reconnect interval (ms) */
  reconnectInterval?: number;
  /** Maximum reconnect attempts */
  maxReconnectAttempts?: number;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Matchmaking client for skill-based matching and queue management.
 * Connects to matchmaking server and handles player queuing.
 *
 * @example
 * ```typescript
 * const client = new MatchmakingClient({
 *   serverUrl: 'wss://matchmaking.example.com'
 * });
 *
 * client.on('matchFound', (match) => {
 *   console.log('Match found!', match);
 * });
 *
 * await client.connect();
 * await client.joinQueue({
 *   gameMode: 'deathmatch',
 *   minPlayers: 2,
 *   maxPlayers: 8
 * });
 * ```
 */
export class MatchmakingClient {
  private ws: WebSocket | null = null;
  private readonly serverUrl: string;
  private readonly autoReconnect: boolean;
  private readonly reconnectInterval: number;
  private readonly maxReconnectAttempts: number;
  private readonly debug: boolean;
  private readonly logger: Logger;
  private status: MatchmakingStatus = MatchmakingStatus.IDLE;
  private currentQueueEntry: QueueEntry | null = null;
  private reconnectAttempts: number = 0;
  private reconnectTimer: number | null = null;
  private readonly eventHandlers: Map<string, Set<Function>> = new Map();
  private playerId: string | null = null;
  private playerSkill: PlayerSkill | null = null;

  constructor(config: MatchmakingClientConfig) {
    this.serverUrl = config.serverUrl;
    this.autoReconnect = config.autoReconnect ?? true;
    this.reconnectInterval = config.reconnectInterval ?? 3000;
    this.maxReconnectAttempts = config.maxReconnectAttempts ?? 5;
    this.debug = config.debug ?? false;
    this.logger = new Logger('MatchmakingClient');
  }

  /**
   * Connect to matchmaking server
   *
   * @param playerId - Player identifier
   * @param playerSkill - Player's skill rating
   */
  public async connect(playerId: string, playerSkill: PlayerSkill): Promise<void> {
    this.playerId = playerId;
    this.playerSkill = playerSkill;

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.serverUrl);

        this.ws.onopen = () => {
          if (this.debug) {
            this.logger.debug('Connected to matchmaking server');
          }
          this.reconnectAttempts = 0;
          this.setStatus(MatchmakingStatus.IDLE);

          // Send authentication
          this.send({
            type: 'authenticate',
            playerId: this.playerId,
            skill: this.playerSkill
          });

          resolve();
        };

        this.ws.onclose = () => {
          this.handleDisconnect();
        };

        this.ws.onerror = (error) => {
          this.logger.error('WebSocket error:', error);
          reject(error);
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data);
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from matchmaking server
   */
  public disconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.setStatus(MatchmakingStatus.IDLE);
    this.currentQueueEntry = null;

    if (this.debug) {
      this.logger.debug('Disconnected from matchmaking server');
    }
  }

  /**
   * Join matchmaking queue
   *
   * @param criteria - Matchmaking criteria
   */
  public async joinQueue(criteria: MatchmakingCriteria): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to matchmaking server');
    }

    if (this.status === MatchmakingStatus.SEARCHING) {
      throw new Error('Already in queue');
    }

    this.send({
      type: 'joinQueue',
      criteria
    });

    this.setStatus(MatchmakingStatus.SEARCHING);

    if (this.debug) {
      this.logger.debug('Joined matchmaking queue', criteria);
    }
  }

  /**
   * Leave matchmaking queue
   */
  public async leaveQueue(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to matchmaking server');
    }

    if (this.status !== MatchmakingStatus.SEARCHING) {
      throw new Error('Not in queue');
    }

    this.send({
      type: 'leaveQueue'
    });

    this.setStatus(MatchmakingStatus.IDLE);
    this.currentQueueEntry = null;

    if (this.debug) {
      this.logger.debug('Left matchmaking queue');
    }
  }

  /**
   * Accept a found match
   *
   * @param matchId - Match ID to accept
   */
  public async acceptMatch(matchId: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to matchmaking server');
    }

    this.send({
      type: 'acceptMatch',
      matchId
    });

    this.setStatus(MatchmakingStatus.CONNECTING);

    if (this.debug) {
      this.logger.debug(`Accepted match ${matchId}`);
    }
  }

  /**
   * Decline a found match
   *
   * @param matchId - Match ID to decline
   */
  public async declineMatch(matchId: string): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to matchmaking server');
    }

    this.send({
      type: 'declineMatch',
      matchId
    });

    this.setStatus(MatchmakingStatus.IDLE);

    if (this.debug) {
      this.logger.debug(`Declined match ${matchId}`);
    }
  }

  /**
   * Get current matchmaking status
   */
  public getStatus(): MatchmakingStatus {
    return this.status;
  }

  /**
   * Get current queue entry
   */
  public getQueueEntry(): QueueEntry | null {
    return this.currentQueueEntry ? { ...this.currentQueueEntry } : null;
  }

  /**
   * Get estimated wait time
   */
  public getEstimatedWaitTime(): number | null {
    return this.currentQueueEntry?.estimatedWait ?? null;
  }

  /**
   * Register event handler
   *
   * @param event - Event name
   * @param handler - Event handler function
   */
  public on(event: string, handler: Function): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  /**
   * Unregister event handler
   *
   * @param event - Event name
   * @param handler - Event handler function
   */
  public off(event: string, handler: Function): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * Emit event to handlers
   */
  private emit(event: string, data?: any): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (error) {
          this.logger.error(`Error in event handler for ${event}:`, error);
        }
      }
    }
  }

  /**
   * Handle incoming message from server
   */
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);

      switch (message.type) {
        case 'authenticated':
          this.emit('authenticated');
          break;

        case 'queueJoined':
          this.currentQueueEntry = message.queueEntry;
          this.emit('queueJoined', message.queueEntry);
          break;

        case 'queueUpdate':
          if (this.currentQueueEntry) {
            this.currentQueueEntry.estimatedWait = message.estimatedWait;
          }
          this.emit('queueUpdate', message);
          break;

        case 'matchFound':
          this.setStatus(MatchmakingStatus.MATCH_FOUND);
          this.emit('matchFound', message.match as MatchFound);
          break;

        case 'matchReady':
          this.setStatus(MatchmakingStatus.CONNECTED);
          this.currentQueueEntry = null;
          this.emit('matchReady', message.match);
          break;

        case 'matchCancelled':
          this.setStatus(MatchmakingStatus.IDLE);
          this.currentQueueEntry = null;
          this.emit('matchCancelled', message.reason);
          break;

        case 'error':
          this.logger.error('Matchmaking error:', message.error);
          this.emit('error', message.error);
          break;

        default:
          if (this.debug) {
            this.logger.warn('Unknown message type:', message.type);
          }
      }
    } catch (error) {
      this.logger.error('Error handling message:', error);
    }
  }

  /**
   * Handle disconnect
   */
  private handleDisconnect(): void {
    if (this.debug) {
      this.logger.debug('Disconnected from matchmaking server');
    }

    this.setStatus(MatchmakingStatus.FAILED);
    this.emit('disconnected');

    if (this.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      this.logger.info(
        `Reconnecting (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`
      );

      this.reconnectTimer = window.setTimeout(() => {
        if (this.playerId && this.playerSkill) {
          this.connect(this.playerId, this.playerSkill).catch((error) => {
            this.logger.error('Reconnect failed:', error);
          });
        }
      }, this.reconnectInterval);
    } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error('Max reconnect attempts reached');
      this.emit('reconnectFailed');
    }
  }

  /**
   * Send message to server
   */
  private send(message: any): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      throw new Error('WebSocket not connected');
    }
  }

  /**
   * Set matchmaking status
   */
  private setStatus(status: MatchmakingStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.emit('statusChanged', status);

      if (this.debug) {
        this.logger.debug(`Status changed to: ${status}`);
      }
    }
  }

  /**
   * Check if connected
   */
  public isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Get connection statistics
   */
  public getStats(): {
    status: MatchmakingStatus;
    connected: boolean;
    reconnectAttempts: number;
    queueTime: number | null;
  } {
    let queueTime: number | null = null;
    if (this.currentQueueEntry) {
      queueTime = performance.now() - this.currentQueueEntry.queueTime;
    }

    return {
      status: this.status,
      connected: this.isConnected(),
      reconnectAttempts: this.reconnectAttempts,
      queueTime
    };
  }
}
