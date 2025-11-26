/**
 * @fileoverview Connection state machine and management.
 * Handles connection lifecycle, heartbeat, disconnect detection, and reconnection.
 * @module net/Connection
 */

import { Logger } from '../core/Logger';
import { EventBus } from '../core/EventBus';

const logger = Logger.create('Connection');

/**
 * Connection state.
 */
export enum ConnectionState {
  /** Not connected */
  DISCONNECTED = 'disconnected',
  /** Attempting to connect */
  CONNECTING = 'connecting',
  /** Connected and authenticated */
  CONNECTED = 'connected',
  /** Reconnecting after disconnect */
  RECONNECTING = 'reconnecting',
  /** Disconnecting gracefully */
  DISCONNECTING = 'disconnecting',
  /** Connection failed */
  FAILED = 'failed',
}

/**
 * Disconnect reason codes.
 */
export enum DisconnectReason {
  /** Normal disconnect */
  NORMAL = 'normal',
  /** Connection timeout */
  TIMEOUT = 'timeout',
  /** Kicked by server */
  KICKED = 'kicked',
  /** Network error */
  ERROR = 'error',
  /** Protocol error */
  PROTOCOL_ERROR = 'protocol_error',
  /** Authentication failed */
  AUTH_FAILED = 'auth_failed',
  /** Server full */
  SERVER_FULL = 'server_full',
}

/**
 * Connection statistics.
 */
export interface ConnectionStats {
  /** Time connected in milliseconds */
  connectionTime: number;
  /** Bytes sent */
  bytesSent: number;
  /** Bytes received */
  bytesReceived: number;
  /** Messages sent */
  messagesSent: number;
  /** Messages received */
  messagesReceived: number;
  /** Average round-trip time in milliseconds */
  averageRTT: number;
  /** Packet loss percentage (0-100) */
  packetLoss: number;
}

/**
 * Connection configuration.
 */
export interface ConnectionConfig {
  /** Heartbeat interval in milliseconds */
  heartbeatInterval?: number;
  /** Connection timeout in milliseconds */
  connectionTimeout?: number;
  /** Maximum reconnection attempts */
  maxReconnectAttempts?: number;
  /** Reconnection delay in milliseconds */
  reconnectDelay?: number;
  /** Enable automatic reconnection */
  autoReconnect?: boolean;
}

/**
 * Connection events.
 */
export interface ConnectionEvents {
  /** Connection state changed */
  'state-changed': (state: ConnectionState, previousState: ConnectionState) => void;
  /** Connection established */
  'connected': () => void;
  /** Connection lost */
  'disconnected': (reason: DisconnectReason) => void;
  /** Reconnection attempt */
  'reconnecting': (attempt: number, maxAttempts: number) => void;
  /** Heartbeat received */
  'heartbeat': (rtt: number) => void;
}

/**
 * Connection state machine and management.
 * Handles connection lifecycle, heartbeat, and automatic reconnection.
 *
 * @example
 * ```typescript
 * const connection = new Connection({
 *   heartbeatInterval: 5000,
 *   connectionTimeout: 30000,
 *   autoReconnect: true,
 *   maxReconnectAttempts: 5,
 * });
 *
 * connection.on('connected', () => {
 *   console.log('Connected!');
 * });
 *
 * connection.on('disconnected', (reason) => {
 *   console.log('Disconnected:', reason);
 * });
 *
 * // Start connection
 * await connection.connect();
 *
 * // Update heartbeat
 * connection.update(deltaTime);
 *
 * // Check connection state
 * if (connection.isConnected()) {
 *   // Send data
 * }
 * ```
 */
export class Connection {
  private config: Required<ConnectionConfig>;
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private reconnectAttempts: number = 0;

  /** Last heartbeat send time */
  private lastHeartbeatSent: number = 0;

  /** Last heartbeat received time */
  private lastHeartbeatReceived: number = 0;

  /** Connection start time */
  private connectionStartTime: number = 0;

  /** Statistics */
  private stats: ConnectionStats = {
    connectionTime: 0,
    bytesSent: 0,
    bytesReceived: 0,
    messagesSent: 0,
    messagesReceived: 0,
    averageRTT: 0,
    packetLoss: 0,
  };

  /** RTT samples for averaging */
  private rttSamples: number[] = [];
  private readonly maxRTTSamples = 10;

  /** Event handlers */
  private eventHandlers = new Map<keyof ConnectionEvents, Set<Function>>();

  /** Heartbeat timer handle */
  private heartbeatTimer: number | null = null;

  /** Connection timeout timer */
  private connectionTimeoutTimer: number | null = null;

  /** Reconnect timer handle */
  private reconnectTimer: number | null = null;

  /** Pending heartbeat timestamp */
  private pendingHeartbeat: number | null = null;

  /**
   * Creates a new Connection instance.
   *
   * @param config - Connection configuration
   *
   * @example
   * ```typescript
   * const connection = new Connection({
   *   heartbeatInterval: 5000,
   *   connectionTimeout: 30000,
   *   autoReconnect: true,
   * });
   * ```
   */
  constructor(config: ConnectionConfig = {}) {
    this.config = {
      heartbeatInterval: config.heartbeatInterval ?? 5000,
      connectionTimeout: config.connectionTimeout ?? 30000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 5,
      reconnectDelay: config.reconnectDelay ?? 2000,
      autoReconnect: config.autoReconnect ?? true,
    };
  }

  /**
   * Registers an event handler.
   *
   * @param event - Event name
   * @param handler - Event handler function
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * const unsub = connection.on('connected', () => {
   *   console.log('Connection established');
   * });
   * // Later: unsub();
   * ```
   */
  on<K extends keyof ConnectionEvents>(event: K, handler: ConnectionEvents[K]): () => void {
    let handlers = this.eventHandlers.get(event);
    if (!handlers) {
      handlers = new Set();
      this.eventHandlers.set(event, handlers);
    }
    handlers.add(handler as Function);

    return () => {
      handlers!.delete(handler as Function);
    };
  }

  /**
   * Emits an event.
   */
  private emit<K extends keyof ConnectionEvents>(
    event: K,
    ...args: Parameters<ConnectionEvents[K]>
  ): void {
    const handlers = this.eventHandlers.get(event);
    if (!handlers) return;

    for (const handler of handlers) {
      try {
        (handler as any)(...args);
      } catch (error) {
        logger.error(`Error in ${event} handler`, error);
      }
    }
  }

  /**
   * Connects to the network.
   * @returns Promise that resolves when connected
   */
  async connect(): Promise<void> {
    if (this.state === ConnectionState.CONNECTED) {
      logger.warn('Already connected');
      return;
    }

    this.setState(ConnectionState.CONNECTING);
    this.connectionStartTime = Date.now();

    try {
      // Actual connection logic would be implemented by transport layer
      // This is a state management wrapper
      await this.performConnect();

      this.setState(ConnectionState.CONNECTED);
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      this.emit('connected');

      logger.info('Connection established');
    } catch (error) {
      logger.error('Connection failed', error);
      this.setState(ConnectionState.FAILED);

      if (this.config.autoReconnect) {
        this.scheduleReconnect();
      }

      throw error;
    }
  }

  /**
   * Performs the actual connection (to be overridden by subclasses).
   */
  protected async performConnect(): Promise<void> {
    // Override in subclass or use transport layer
  }

  /**
   * Disconnects from the network.
   *
   * @param reason - Disconnect reason
   *
   * @example
   * ```typescript
   * connection.disconnect(DisconnectReason.NORMAL);
   * ```
   */
  disconnect(reason: DisconnectReason = DisconnectReason.NORMAL): void {
    if (this.state === ConnectionState.DISCONNECTED) {
      return;
    }

    this.setState(ConnectionState.DISCONNECTING);

    this.stopHeartbeat();
    this.clearTimeouts();

    // Perform actual disconnect
    this.performDisconnect();

    this.setState(ConnectionState.DISCONNECTED);
    this.emit('disconnected', reason);

    logger.info(`Disconnected: ${reason}`);
  }

  /**
   * Performs the actual disconnect (to be overridden by subclasses).
   */
  protected performDisconnect(): void {
    // Override in subclass or use transport layer
  }

  /**
   * Sets the connection state.
   */
  private setState(newState: ConnectionState): void {
    if (this.state === newState) {
      return;
    }

    const previousState = this.state;
    this.state = newState;

    this.emit('state-changed', newState, previousState);

    logger.debug(`Connection state: ${previousState} -> ${newState}`);
  }

  /**
   * Starts the heartbeat system.
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    const sendHeartbeat = () => {
      if (this.state !== ConnectionState.CONNECTED) {
        return;
      }

      this.sendHeartbeat();
      this.lastHeartbeatSent = Date.now();

      // Check for timeout
      if (this.lastHeartbeatReceived > 0) {
        const timeSinceLastReceived = Date.now() - this.lastHeartbeatReceived;
        if (timeSinceLastReceived > this.config.connectionTimeout) {
          logger.warn('Connection timeout - no heartbeat received');
          this.handleTimeout();
          return;
        }
      }
    };

    // Send initial heartbeat
    sendHeartbeat();

    // Schedule periodic heartbeats
    this.heartbeatTimer = setInterval(sendHeartbeat, this.config.heartbeatInterval) as any;
  }

  /**
   * Stops the heartbeat system.
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  /**
   * Sends a heartbeat ping.
   */
  protected sendHeartbeat(): void {
    // Override in subclass or use transport layer
    this.pendingHeartbeat = Date.now();
  }

  /**
   * Handles received heartbeat pong.
   *
   * @example
   * ```typescript
   * // Called when heartbeat response is received
   * connection.onHeartbeatReceived();
   * ```
   */
  onHeartbeatReceived(): void {
    this.lastHeartbeatReceived = Date.now();

    // Calculate RTT
    if (this.pendingHeartbeat !== null) {
      const rtt = this.lastHeartbeatReceived - this.pendingHeartbeat;
      this.addRTTSample(rtt);
      this.emit('heartbeat', rtt);
      this.pendingHeartbeat = null;
    }
  }

  /**
   * Adds an RTT sample and updates average.
   */
  private addRTTSample(rtt: number): void {
    this.rttSamples.push(rtt);

    if (this.rttSamples.length > this.maxRTTSamples) {
      this.rttSamples.shift();
    }

    // Update average
    const sum = this.rttSamples.reduce((a, b) => a + b, 0);
    this.stats.averageRTT = sum / this.rttSamples.length;
  }

  /**
   * Handles connection timeout.
   */
  private handleTimeout(): void {
    logger.warn('Connection timeout');
    this.disconnect(DisconnectReason.TIMEOUT);

    if (this.config.autoReconnect) {
      this.scheduleReconnect();
    }
  }

  /**
   * Schedules a reconnection attempt.
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached');
      return;
    }

    this.setState(ConnectionState.RECONNECTING);
    this.reconnectAttempts++;

    this.emit('reconnecting', this.reconnectAttempts, this.config.maxReconnectAttempts);

    logger.info(
      `Reconnecting (${this.reconnectAttempts}/${this.config.maxReconnectAttempts})...`
    );

    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((error) => {
        logger.error('Reconnection failed', error);
        this.scheduleReconnect();
      });
    }, this.config.reconnectDelay) as any;
  }

  /**
   * Clears all timeout timers.
   */
  private clearTimeouts(): void {
    if (this.connectionTimeoutTimer !== null) {
      clearTimeout(this.connectionTimeoutTimer);
      this.connectionTimeoutTimer = null;
    }

    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Updates the connection (call every frame).
   *
   * @param deltaTime - Time since last update in seconds
   *
   * @example
   * ```typescript
   * update(deltaTime: number): void {
   *   connection.update(deltaTime);
   * }
   * ```
   */
  update(deltaTime: number): void {
    if (this.state === ConnectionState.CONNECTED) {
      this.stats.connectionTime += deltaTime * 1000;
    }
  }

  /**
   * Records sent data statistics.
   *
   * @param bytes - Number of bytes sent
   *
   * @example
   * ```typescript
   * connection.recordSent(message.byteLength);
   * ```
   */
  recordSent(bytes: number): void {
    this.stats.bytesSent += bytes;
    this.stats.messagesSent++;
  }

  /**
   * Records received data statistics.
   *
   * @param bytes - Number of bytes received
   */
  recordReceived(bytes: number): void {
    this.stats.bytesReceived += bytes;
    this.stats.messagesReceived++;
  }

  /**
   * Gets the current connection state.
   * @returns Connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Checks if connected.
   * @returns True if connected
   */
  isConnected(): boolean {
    return this.state === ConnectionState.CONNECTED;
  }

  /**
   * Checks if connecting.
   * @returns True if connecting
   */
  isConnecting(): boolean {
    return this.state === ConnectionState.CONNECTING ||
           this.state === ConnectionState.RECONNECTING;
  }

  /**
   * Checks if disconnected.
   * @returns True if disconnected
   */
  isDisconnected(): boolean {
    return this.state === ConnectionState.DISCONNECTED ||
           this.state === ConnectionState.FAILED;
  }

  /**
   * Gets connection statistics.
   * @returns Connection statistics
   */
  getStats(): Readonly<ConnectionStats> {
    return { ...this.stats };
  }

  /**
   * Gets the current RTT (round-trip time).
   * @returns RTT in milliseconds
   */
  getRTT(): number {
    return this.stats.averageRTT;
  }

  /**
   * Resets connection statistics.
   */
  resetStats(): void {
    this.stats = {
      connectionTime: 0,
      bytesSent: 0,
      bytesReceived: 0,
      messagesSent: 0,
      messagesReceived: 0,
      averageRTT: 0,
      packetLoss: 0,
    };
    this.rttSamples.length = 0;
  }

  /**
   * Cleans up resources.
   */
  dispose(): void {
    this.disconnect(DisconnectReason.NORMAL);
    this.clearTimeouts();
    this.eventHandlers.clear();
  }
}
