/**
 * @fileoverview Abstract transport interface for network communication.
 * Defines the common interface for different transport implementations.
 * @module net/Transport
 */

import { NetworkMessage } from './NetworkMessage';

/**
 * Transport state.
 */
export enum TransportState {
  /** Not connected */
  CLOSED = 'closed',
  /** Attempting to connect */
  CONNECTING = 'connecting',
  /** Connected and ready */
  OPEN = 'open',
  /** Closing connection */
  CLOSING = 'closing',
  /** Error state */
  ERROR = 'error',
}

/**
 * Transport capabilities.
 */
export interface TransportCapabilities {
  /** Supports reliable ordered delivery */
  reliable: boolean;
  /** Supports unreliable unordered delivery */
  unreliable: boolean;
  /** Supports message fragmentation */
  fragmentation: boolean;
  /** Maximum message size in bytes */
  maxMessageSize: number;
}

/**
 * Transport configuration.
 */
export interface TransportConfig {
  /** Automatically reconnect on disconnect */
  autoReconnect?: boolean;
  /** Maximum reconnection attempts */
  maxReconnectAttempts?: number;
  /** Reconnection delay in milliseconds */
  reconnectDelay?: number;
  /** Enable message batching */
  enableBatching?: boolean;
  /** Maximum batch size in bytes */
  maxBatchSize?: number;
}

/**
 * Transport statistics.
 */
export interface TransportStats {
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
  /** Messages queued */
  messagesQueued: number;
  /** Average send rate (bytes/sec) */
  sendRate: number;
  /** Average receive rate (bytes/sec) */
  receiveRate: number;
}

/**
 * Abstract base class for network transports.
 * Defines the common interface that all transport implementations must follow.
 *
 * @example
 * ```typescript
 * class MyTransport extends Transport {
 *   async connect(): Promise<void> {
 *     // Implementation
 *   }
 *
 *   disconnect(): void {
 *     // Implementation
 *   }
 *
 *   send(message: NetworkMessage): boolean {
 *     // Implementation
 *     return true;
 *   }
 *
 *   flush(): void {
 *     // Implementation
 *   }
 * }
 * ```
 */
export abstract class Transport {
  protected state: TransportState = TransportState.CLOSED;
  protected messageHandlers = new Set<(msg: NetworkMessage) => void>();
  protected stateHandlers = new Set<(state: TransportState) => void>();

  protected stats: TransportStats = {
    connectionTime: 0,
    bytesSent: 0,
    bytesReceived: 0,
    messagesSent: 0,
    messagesReceived: 0,
    messagesQueued: 0,
    sendRate: 0,
    receiveRate: 0,
  };

  /**
   * Connects to the network.
   * @returns Promise that resolves when connected
   */
  abstract connect(): Promise<void>;

  /**
   * Disconnects from the network.
   */
  abstract disconnect(): void;

  /**
   * Sends a message.
   *
   * @param message - Message to send
   * @returns True if queued successfully, false if dropped
   */
  abstract send(message: NetworkMessage): boolean;

  /**
   * Flushes any pending messages.
   * Called at the end of each frame to send batched messages.
   */
  abstract flush(): void;

  /**
   * Gets the transport capabilities.
   * @returns Transport capabilities
   */
  abstract getCapabilities(): TransportCapabilities;

  /**
   * Registers a message handler.
   *
   * @param handler - Handler function
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * const unsub = transport.onMessage((msg) => {
   *   console.log('Received message:', msg.type);
   * });
   * // Later: unsub();
   * ```
   */
  onMessage(handler: (msg: NetworkMessage) => void): () => void {
    this.messageHandlers.add(handler);
    return () => {
      this.messageHandlers.delete(handler);
    };
  }

  /**
   * Registers a state change handler.
   *
   * @param handler - Handler function
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * transport.onStateChange((state) => {
   *   console.log('Transport state:', state);
   * });
   * ```
   */
  onStateChange(handler: (state: TransportState) => void): () => void {
    this.stateHandlers.add(handler);
    return () => {
      this.stateHandlers.delete(handler);
    };
  }

  /**
   * Notifies message handlers.
   */
  protected notifyMessage(message: NetworkMessage): void {
    for (const handler of this.messageHandlers) {
      try {
        handler(message);
      } catch (error) {
        console.error('Error in message handler:', error);
      }
    }
  }

  /**
   * Notifies state change handlers.
   */
  protected notifyStateChange(newState: TransportState): void {
    this.state = newState;
    for (const handler of this.stateHandlers) {
      try {
        handler(newState);
      } catch (error) {
        console.error('Error in state change handler:', error);
      }
    }
  }

  /**
   * Gets the current transport state.
   * @returns Transport state
   */
  getState(): TransportState {
    return this.state;
  }

  /**
   * Checks if the transport is connected.
   * @returns True if connected
   */
  isConnected(): boolean {
    return this.state === TransportState.OPEN;
  }

  /**
   * Gets transport statistics.
   * @returns Transport statistics
   */
  getStats(): Readonly<TransportStats> {
    return { ...this.stats };
  }

  /**
   * Resets transport statistics.
   */
  resetStats(): void {
    this.stats = {
      connectionTime: 0,
      bytesSent: 0,
      bytesReceived: 0,
      messagesSent: 0,
      messagesReceived: 0,
      messagesQueued: 0,
      sendRate: 0,
      receiveRate: 0,
    };
  }

  /**
   * Updates transport statistics (call every frame).
   *
   * @param deltaTime - Time since last update in seconds
   */
  update(deltaTime: number): void {
    if (this.state === TransportState.OPEN) {
      this.stats.connectionTime += deltaTime * 1000;
    }
  }

  /**
   * Cleans up resources.
   */
  dispose(): void {
    this.disconnect();
    this.messageHandlers.clear();
    this.stateHandlers.clear();
  }
}
