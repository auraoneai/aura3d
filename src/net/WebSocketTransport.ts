/**
 * @fileoverview WebSocket-based network transport.
 * Provides reliable connection with automatic reconnection, heartbeat, and quality metrics.
 * @module net/WebSocketTransport
 */

import { EventBus } from '../core/EventBus';
import { Logger } from '../core/Logger';
import { NetworkMessage, MessageQueue, MessagePriority } from './NetworkMessage';

const logger = Logger.create('WebSocketTransport');

/**
 * WebSocket connection state.
 */
export enum ConnectionState {
  /** Not connected */
  DISCONNECTED = 'disconnected',
  /** Connecting to server */
  CONNECTING = 'connecting',
  /** Connected and ready */
  CONNECTED = 'connected',
  /** Reconnecting after disconnect */
  RECONNECTING = 'reconnecting',
  /** Connection failed */
  FAILED = 'failed',
}

/**
 * Connection quality metrics.
 */
export interface ConnectionQuality {
  /** Round-trip time in milliseconds */
  rtt: number;
  /** Packet loss percentage (0-100) */
  packetLoss: number;
  /** Jitter in milliseconds */
  jitter: number;
  /** Bytes sent per second */
  bytesSentPerSecond: number;
  /** Bytes received per second */
  bytesReceivedPerSecond: number;
  /** Messages sent per second */
  messagesSentPerSecond: number;
  /** Messages received per second */
  messagesReceivedPerSecond: number;
}

/**
 * WebSocket transport configuration.
 */
export interface WebSocketTransportConfig {
  /** WebSocket URL */
  url: string;
  /** Automatic reconnection enabled */
  autoReconnect?: boolean;
  /** Reconnection delay in milliseconds */
  reconnectDelay?: number;
  /** Maximum reconnection attempts (0 = infinite) */
  maxReconnectAttempts?: number;
  /** Heartbeat interval in milliseconds */
  heartbeatInterval?: number;
  /** Connection timeout in milliseconds */
  connectionTimeout?: number;
  /** Binary message format (default: true) */
  binaryType?: 'blob' | 'arraybuffer';
  /** Maximum message queue size */
  maxQueueSize?: number;
}

/**
 * WebSocket-based network transport.
 * Provides reliable connection with automatic reconnection, heartbeat, and metrics.
 *
 * @example
 * ```typescript
 * const transport = new WebSocketTransport({
 *   url: 'ws://localhost:8080',
 *   autoReconnect: true,
 *   heartbeatInterval: 3000,
 * });
 *
 * // Connect
 * await transport.connect();
 *
 * // Send message
 * const msg = new NetworkMessage(1, new ArrayBuffer(8));
 * transport.send(msg);
 *
 * // Receive messages
 * transport.onMessage((msg) => {
 *   console.log('Received:', msg);
 * });
 *
 * // Disconnect
 * transport.disconnect();
 * ```
 */
export class WebSocketTransport {
  private config: Required<WebSocketTransportConfig>;
  private socket: WebSocket | null = null;
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private reconnectAttempts: number = 0;
  private reconnectTimer: number | null = null;
  private heartbeatTimer: number | null = null;
  private lastHeartbeatTime: number = 0;
  private lastPongTime: number = 0;
  private connectionStartTime: number = 0;

  /** Outgoing message queue */
  private sendQueue: MessageQueue;

  /** Message callback */
  private messageCallback: ((message: NetworkMessage) => void) | null = null;

  /** Connection quality metrics */
  private quality: ConnectionQuality = {
    rtt: 0,
    packetLoss: 0,
    jitter: 0,
    bytesSentPerSecond: 0,
    bytesReceivedPerSecond: 0,
    messagesSentPerSecond: 0,
    messagesReceivedPerSecond: 0,
  };

  /** Metrics tracking */
  private metrics = {
    bytesSent: 0,
    bytesReceived: 0,
    messagesSent: 0,
    messagesReceived: 0,
    lastMetricsUpdate: Date.now(),
    rttSamples: [] as number[],
    maxRTTSamples: 10,
  };

  /**
   * Creates a new WebSocket transport.
   *
   * @param config - Transport configuration
   *
   * @example
   * ```typescript
   * const transport = new WebSocketTransport({
   *   url: 'wss://game.example.com',
   *   autoReconnect: true,
   *   heartbeatInterval: 5000,
   * });
   * ```
   */
  constructor(config: WebSocketTransportConfig) {
    this.config = {
      url: config.url,
      autoReconnect: config.autoReconnect ?? true,
      reconnectDelay: config.reconnectDelay ?? 2000,
      maxReconnectAttempts: config.maxReconnectAttempts ?? 0,
      heartbeatInterval: config.heartbeatInterval ?? 5000,
      connectionTimeout: config.connectionTimeout ?? 10000,
      binaryType: config.binaryType ?? 'arraybuffer',
      maxQueueSize: config.maxQueueSize ?? 1000,
    };

    this.sendQueue = new MessageQueue(this.config.maxQueueSize);
  }

  /**
   * Connects to the WebSocket server.
   * @returns Promise that resolves when connected
   *
   * @example
   * ```typescript
   * try {
   *   await transport.connect();
   *   console.log('Connected!');
   * } catch (error) {
   *   console.error('Failed to connect:', error);
   * }
   * ```
   */
  async connect(): Promise<void> {
    if (this.state === ConnectionState.CONNECTED || this.state === ConnectionState.CONNECTING) {
      logger.warn('Already connected or connecting');
      return;
    }

    this.state = ConnectionState.CONNECTING;
    this.connectionStartTime = Date.now();

    return new Promise((resolve, reject) => {
      try {
        this.socket = new WebSocket(this.config.url);
        this.socket.binaryType = this.config.binaryType;

        const timeoutId = setTimeout(() => {
          if (this.state === ConnectionState.CONNECTING) {
            this.handleConnectionTimeout();
            reject(new Error('Connection timeout'));
          }
        }, this.config.connectionTimeout);

        this.socket.onopen = () => {
          clearTimeout(timeoutId);
          this.handleOpen();
          resolve();
        };

        this.socket.onerror = (event) => {
          clearTimeout(timeoutId);
          this.handleError(event);
          if (this.state === ConnectionState.CONNECTING) {
            reject(new Error('Connection failed'));
          }
        };

        this.socket.onclose = (event) => {
          clearTimeout(timeoutId);
          this.handleClose(event);
        };

        this.socket.onmessage = (event) => {
          this.handleMessage(event);
        };
      } catch (error) {
        this.state = ConnectionState.FAILED;
        reject(error);
      }
    });
  }

  /**
   * Disconnects from the WebSocket server.
   *
   * @example
   * ```typescript
   * transport.disconnect();
   * ```
   */
  disconnect(): void {
    this.stopReconnect();
    this.stopHeartbeat();

    if (this.socket) {
      this.socket.close(1000, 'Client disconnect');
      this.socket = null;
    }

    this.state = ConnectionState.DISCONNECTED;
    this.sendQueue.clear();

    EventBus.emit('network:disconnected' as any, undefined);
    logger.info('Disconnected');
  }

  /**
   * Sends a network message.
   *
   * @param message - Message to send
   * @returns True if queued successfully
   *
   * @example
   * ```typescript
   * const msg = new NetworkMessage(1, data, MessagePriority.HIGH);
   * if (!transport.send(msg)) {
   *   console.warn('Send queue full');
   * }
   * ```
   */
  send(message: NetworkMessage): boolean {
    if (this.state !== ConnectionState.CONNECTED) {
      logger.warn('Cannot send - not connected');
      return false;
    }

    return this.sendQueue.enqueue(message);
  }

  /**
   * Flushes the send queue.
   * Call this regularly (e.g., every frame) to send queued messages.
   *
   * @example
   * ```typescript
   * update(): void {
   *   transport.flush();
   * }
   * ```
   */
  flush(): void {
    if (!this.socket || this.state !== ConnectionState.CONNECTED) {
      return;
    }

    while (!this.sendQueue.isEmpty) {
      const message = this.sendQueue.dequeue();
      if (!message) break;

      try {
        const data = message.serialize();
        this.socket.send(data);

        this.metrics.bytesSent += data.byteLength;
        this.metrics.messagesSent++;
      } catch (error) {
        logger.error('Failed to send message', error);
        // Re-queue if critical
        if (message.priority >= MessagePriority.CRITICAL) {
          this.sendQueue.enqueue(message);
        }
        break;
      }
    }

    this.updateMetrics();
  }

  /**
   * Sets the message callback.
   * @param callback - Function to call when a message is received
   */
  onMessage(callback: (message: NetworkMessage) => void): void {
    this.messageCallback = callback;
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
   * Gets connection quality metrics.
   * @returns Connection quality
   */
  getQuality(): Readonly<ConnectionQuality> {
    return { ...this.quality };
  }

  /**
   * Handles WebSocket open event.
   */
  private handleOpen(): void {
    this.state = ConnectionState.CONNECTED;
    this.reconnectAttempts = 0;

    const connectTime = Date.now() - this.connectionStartTime;
    logger.info(`Connected in ${connectTime}ms`);

    this.startHeartbeat();
    EventBus.emit('network:connected' as any, undefined);
  }

  /**
   * Handles WebSocket close event.
   */
  private handleClose(event: CloseEvent): void {
    const wasConnected = this.state === ConnectionState.CONNECTED;

    this.stopHeartbeat();
    this.socket = null;

    logger.info(`Connection closed: ${event.code} - ${event.reason}`);

    if (wasConnected && this.config.autoReconnect) {
      this.attemptReconnect();
    } else {
      this.state = ConnectionState.DISCONNECTED;
      EventBus.emit('network:disconnected' as any, undefined);
    }
  }

  /**
   * Handles WebSocket error event.
   */
  private handleError(event: Event): void {
    logger.error('WebSocket error', event);
    this.state = ConnectionState.FAILED;
    EventBus.emit('network:error' as any, { error: new Error('WebSocket error') });
  }

  /**
   * Handles WebSocket message event.
   */
  private handleMessage(event: MessageEvent): void {
    try {
      let data: ArrayBuffer;

      if (event.data instanceof ArrayBuffer) {
        data = event.data;
      } else if (event.data instanceof Blob) {
        // Handle blob (convert to ArrayBuffer)
        event.data.arrayBuffer().then((buffer) => {
          this.processMessage(buffer);
        });
        return;
      } else {
        logger.warn('Received non-binary message');
        return;
      }

      this.processMessage(data);
    } catch (error) {
      logger.error('Failed to process message', error);
    }
  }

  /**
   * Processes a received message.
   */
  private processMessage(data: ArrayBuffer): void {
    this.metrics.bytesReceived += data.byteLength;
    this.metrics.messagesReceived++;

    // Check if it's a heartbeat pong
    if (data.byteLength === 1) {
      const view = new Uint8Array(data);
      if (view[0] === 0xFF) {
        this.handlePong();
        return;
      }
    }

    const message = NetworkMessage.deserialize(data);
    if (this.messageCallback) {
      this.messageCallback(message);
    }

    this.updateMetrics();
  }

  /**
   * Starts the heartbeat timer.
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatTimer = window.setInterval(() => {
      this.sendHeartbeat();
    }, this.config.heartbeatInterval);

    this.sendHeartbeat();
  }

  /**
   * Stops the heartbeat timer.
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
  private sendHeartbeat(): void {
    if (!this.socket || this.state !== ConnectionState.CONNECTED) {
      return;
    }

    // Send ping (single byte: 0xFF)
    const ping = new Uint8Array([0xFF]);
    this.socket.send(ping.buffer);
    this.lastHeartbeatTime = Date.now();
  }

  /**
   * Handles heartbeat pong response.
   */
  private handlePong(): void {
    this.lastPongTime = Date.now();
    const rtt = this.lastPongTime - this.lastHeartbeatTime;

    // Update RTT samples
    this.metrics.rttSamples.push(rtt);
    if (this.metrics.rttSamples.length > this.metrics.maxRTTSamples) {
      this.metrics.rttSamples.shift();
    }

    // Calculate average RTT
    const avgRTT =
      this.metrics.rttSamples.reduce((sum, val) => sum + val, 0) /
      this.metrics.rttSamples.length;
    this.quality.rtt = avgRTT;

    // Calculate jitter (variance in RTT)
    const variance =
      this.metrics.rttSamples.reduce((sum, val) => sum + Math.pow(val - avgRTT, 2), 0) /
      this.metrics.rttSamples.length;
    this.quality.jitter = Math.sqrt(variance);
  }

  /**
   * Updates connection quality metrics.
   */
  private updateMetrics(): void {
    const now = Date.now();
    const elapsed = now - this.metrics.lastMetricsUpdate;

    if (elapsed >= 1000) {
      const seconds = elapsed / 1000;

      this.quality.bytesSentPerSecond = this.metrics.bytesSent / seconds;
      this.quality.bytesReceivedPerSecond = this.metrics.bytesReceived / seconds;
      this.quality.messagesSentPerSecond = this.metrics.messagesSent / seconds;
      this.quality.messagesReceivedPerSecond = this.metrics.messagesReceived / seconds;

      this.metrics.bytesSent = 0;
      this.metrics.bytesReceived = 0;
      this.metrics.messagesSent = 0;
      this.metrics.messagesReceived = 0;
      this.metrics.lastMetricsUpdate = now;
    }
  }

  /**
   * Handles connection timeout.
   */
  private handleConnectionTimeout(): void {
    logger.warn('Connection timeout');
    this.state = ConnectionState.FAILED;

    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    if (this.config.autoReconnect) {
      this.attemptReconnect();
    }
  }

  /**
   * Attempts to reconnect.
   */
  private attemptReconnect(): void {
    if (
      this.config.maxReconnectAttempts > 0 &&
      this.reconnectAttempts >= this.config.maxReconnectAttempts
    ) {
      logger.error('Max reconnect attempts reached');
      this.state = ConnectionState.FAILED;
      return;
    }

    this.state = ConnectionState.RECONNECTING;
    this.reconnectAttempts++;

    logger.info(`Reconnecting (attempt ${this.reconnectAttempts})...`);

    this.reconnectTimer = window.setTimeout(() => {
      this.connect().catch((error) => {
        logger.error('Reconnect failed', error);
      });
    }, this.config.reconnectDelay);
  }

  /**
   * Stops reconnection attempts.
   */
  private stopReconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
  }
}
