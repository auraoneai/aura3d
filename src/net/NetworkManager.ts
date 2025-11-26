/**
 * @fileoverview Central network coordinator for G3D engine.
 * Manages connections, sessions, and client/server modes.
 * @module net/NetworkManager
 */

import { EventBus } from '../core/EventBus';
import { Logger } from '../core/Logger';
import { WebSocketTransport, ConnectionState } from './WebSocketTransport';
import { WebRTCTransport, RTCConnectionState } from './WebRTCTransport';
import { NetworkMessage, MessageType, MessageRegistry, MessagePriority, NetworkBinarySerializer as BinarySerializer } from './NetworkMessage';
import { NetworkEntityRegistry, PlayerId, NetworkId } from './NetworkEntity';
import { NetworkTime } from './NetworkTime';
import { RPCSystem, RPCInvocation } from './RPCSystem';

const logger = Logger.create('NetworkManager');

/**
 * Network mode.
 */
export enum NetworkMode {
  /** Offline - no networking */
  OFFLINE = 'offline',
  /** Server mode */
  SERVER = 'server',
  /** Client mode */
  CLIENT = 'client',
  /** Peer-to-peer mode */
  P2P = 'p2p',
}

/**
 * Transport type.
 */
export enum TransportType {
  /** WebSocket transport */
  WEBSOCKET = 'websocket',
  /** WebRTC transport */
  WEBRTC = 'webrtc',
}

/**
 * Session information.
 */
export interface SessionInfo {
  /** Session ID */
  sessionId: string;
  /** Local player ID */
  playerId: PlayerId;
  /** Connected players */
  players: Map<PlayerId, PlayerInfo>;
  /** Session start time */
  startTime: number;
}

/**
 * Player information.
 */
export interface PlayerInfo {
  /** Player ID */
  id: PlayerId;
  /** Player name */
  name: string;
  /** Connection time */
  connectTime: number;
  /** Is local player */
  isLocal: boolean;
  /** Latency in milliseconds */
  latency: number;
}

/**
 * Network manager configuration.
 */
export interface NetworkManagerConfig {
  /** Network mode */
  mode?: NetworkMode;
  /** Transport type */
  transport?: TransportType;
  /** WebSocket URL (for client mode) */
  wsUrl?: string;
  /** WebSocket port (for server mode) */
  wsPort?: number;
  /** ICE servers (for WebRTC) */
  iceServers?: any[];
  /** Enable automatic time sync */
  enableTimeSync?: boolean;
  /** Time sync interval in ms */
  timeSyncInterval?: number;
  /** Network tick rate */
  tickRate?: number;
}

/**
 * Central network coordinator.
 * Manages connections, sessions, message routing, and network systems.
 *
 * @example
 * ```typescript
 * // Client mode
 * const network = new NetworkManager({
 *   mode: NetworkMode.CLIENT,
 *   transport: TransportType.WEBSOCKET,
 *   wsUrl: 'ws://localhost:8080',
 *   enableTimeSync: true,
 * });
 *
 * await network.connect();
 *
 * // Send message
 * network.sendMessage(MessageTypes.PLAYER_INPUT, data);
 *
 * // Receive messages
 * network.onMessage(MessageTypes.STATE_UPDATE, (msg) => {
 *   // Handle state update
 * });
 *
 * // Update every frame
 * network.update(deltaTime);
 * ```
 */
export class NetworkManager {
  private config: Required<NetworkManagerConfig>;
  private mode: NetworkMode;
  private transport: WebSocketTransport | WebRTCTransport | null = null;
  private session: SessionInfo | null = null;

  /** Entity registry */
  readonly entityRegistry: NetworkEntityRegistry;

  /** Time synchronization */
  readonly networkTime: NetworkTime;

  /** RPC system */
  readonly rpc: RPCSystem;

  /** Message handlers */
  private messageHandlers = new Map<MessageType, Set<(msg: NetworkMessage) => void>>();

  /** Internal message types */
  private readonly MSG_RPC: MessageType;
  private readonly MSG_TIME_SYNC_REQUEST: MessageType;
  private readonly MSG_TIME_SYNC_RESPONSE: MessageType;
  private readonly MSG_PLAYER_CONNECT: MessageType;
  private readonly MSG_PLAYER_DISCONNECT: MessageType;

  /** Connection state */
  private isConnected: boolean = false;

  /** Next player ID (server only) */
  private nextPlayerId: PlayerId = 1;

  /**
   * Creates a new network manager.
   *
   * @param config - Network configuration
   *
   * @example
   * ```typescript
   * const network = new NetworkManager({
   *   mode: NetworkMode.CLIENT,
   *   transport: TransportType.WEBSOCKET,
   *   wsUrl: 'ws://game.example.com',
   * });
   * ```
   */
  constructor(config: NetworkManagerConfig = {}) {
    this.config = {
      mode: config.mode ?? NetworkMode.OFFLINE,
      transport: config.transport ?? TransportType.WEBSOCKET,
      wsUrl: config.wsUrl ?? 'ws://localhost:8080',
      wsPort: config.wsPort ?? 8080,
      iceServers: config.iceServers ?? [],
      enableTimeSync: config.enableTimeSync ?? true,
      timeSyncInterval: config.timeSyncInterval ?? 5000,
      tickRate: config.tickRate ?? 60,
    };

    this.mode = this.config.mode;
    this.entityRegistry = new NetworkEntityRegistry();
    this.networkTime = new NetworkTime(10, this.config.timeSyncInterval, this.config.tickRate);
    this.rpc = new RPCSystem(this.mode === NetworkMode.SERVER);

    // Register internal message types
    this.MSG_RPC = MessageRegistry.register('_rpc');
    this.MSG_TIME_SYNC_REQUEST = MessageRegistry.register('_time_sync_request');
    this.MSG_TIME_SYNC_RESPONSE = MessageRegistry.register('_time_sync_response');
    this.MSG_PLAYER_CONNECT = MessageRegistry.register('_player_connect');
    this.MSG_PLAYER_DISCONNECT = MessageRegistry.register('_player_disconnect');

    this.setupInternalHandlers();
  }

  /**
   * Sets up internal message handlers.
   */
  private setupInternalHandlers(): void {
    // RPC messages
    this.onMessage(this.MSG_RPC, (msg) => {
      const invocation = this.rpc.deserialize(msg.data);
      this.rpc.execute(invocation);
    });

    // Time sync messages
    if (this.mode === NetworkMode.SERVER) {
      this.onMessage(this.MSG_TIME_SYNC_REQUEST, (msg) => {
        this.handleTimeSyncRequest(msg);
      });
    } else {
      this.onMessage(this.MSG_TIME_SYNC_RESPONSE, (msg) => {
        this.handleTimeSyncResponse(msg);
      });
    }

    // Player connection messages
    this.onMessage(this.MSG_PLAYER_CONNECT, (msg) => {
      this.handlePlayerConnect(msg);
    });

    this.onMessage(this.MSG_PLAYER_DISCONNECT, (msg) => {
      this.handlePlayerDisconnect(msg);
    });
  }

  /**
   * Connects to the network.
   * For clients, connects to server. For servers, starts listening.
   *
   * @returns Promise that resolves when connected
   *
   * @example
   * ```typescript
   * try {
   *   await network.connect();
   *   console.log('Connected!');
   * } catch (error) {
   *   console.error('Connection failed:', error);
   * }
   * ```
   */
  async connect(): Promise<void> {
    if (this.mode === NetworkMode.OFFLINE) {
      logger.warn('Cannot connect in offline mode');
      return;
    }

    if (this.isConnected) {
      logger.warn('Already connected');
      return;
    }

    // Create transport
    if (this.config.transport === TransportType.WEBSOCKET) {
      this.transport = new WebSocketTransport({
        url: this.config.wsUrl,
        autoReconnect: true,
        heartbeatInterval: 5000,
      });
    } else {
      this.transport = new WebRTCTransport({
        iceServers: this.config.iceServers,
        enableUnreliableChannel: true,
      });
    }

    // Set up transport handlers
    this.setupTransport();

    // Connect
    if (this.transport instanceof WebSocketTransport) {
      await this.transport.connect();
    }
    // WebRTC connection is established via signaling (handled externally)

    this.isConnected = true;

    // Initialize session
    if (this.mode === NetworkMode.CLIENT) {
      this.session = {
        sessionId: '',
        playerId: 0, // Will be assigned by server
        players: new Map(),
        startTime: Date.now(),
      };
    } else if (this.mode === NetworkMode.SERVER) {
      this.session = {
        sessionId: this.generateSessionId(),
        playerId: 0, // Server is player 0
        players: new Map(),
        startTime: Date.now(),
      };

      // Add server as player
      this.session.players.set(0, {
        id: 0,
        name: 'Server',
        connectTime: Date.now(),
        isLocal: true,
        latency: 0,
      });
    }

    logger.info(`Connected in ${this.mode} mode`);
    EventBus.emit('network:connected' as any, undefined);
  }

  /**
   * Disconnects from the network.
   *
   * @example
   * ```typescript
   * network.disconnect();
   * ```
   */
  disconnect(): void {
    if (!this.isConnected) {
      return;
    }

    if (this.transport instanceof WebSocketTransport) {
      this.transport.disconnect();
    } else if (this.transport instanceof WebRTCTransport) {
      this.transport.close();
    }

    this.transport = null;
    this.isConnected = false;
    this.session = null;

    logger.info('Disconnected');
    EventBus.emit('network:disconnected' as any, undefined);
  }

  /**
   * Sets up transport event handlers.
   */
  private setupTransport(): void {
    if (!this.transport) return;

    this.transport.onMessage((msg) => {
      this.handleMessage(msg);
    });
  }

  /**
   * Handles incoming network messages.
   */
  private handleMessage(msg: NetworkMessage): void {
    const handlers = this.messageHandlers.get(msg.type);
    if (!handlers || handlers.size === 0) {
      return;
    }

    for (const handler of handlers) {
      try {
        handler(msg);
      } catch (error) {
        logger.error(`Error in message handler for type ${msg.type}`, error);
      }
    }
  }

  /**
   * Registers a message handler.
   *
   * @param messageType - Message type to handle
   * @param handler - Handler function
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * const unsub = network.onMessage(MessageTypes.CHAT, (msg) => {
   *   const view = new DataView(msg.data);
   *   const [message] = BinarySerializer.readString(view, 0);
   *   console.log('Chat:', message);
   * });
   *
   * // Later: unsub();
   * ```
   */
  onMessage(
    messageType: MessageType,
    handler: (msg: NetworkMessage) => void
  ): () => void {
    let handlers = this.messageHandlers.get(messageType);
    if (!handlers) {
      handlers = new Set();
      this.messageHandlers.set(messageType, handlers);
    }

    handlers.add(handler);

    return () => {
      handlers!.delete(handler);
    };
  }

  /**
   * Sends a network message.
   *
   * @param messageType - Message type
   * @param data - Message data
   * @param priority - Message priority
   * @returns True if sent successfully
   *
   * @example
   * ```typescript
   * const buffer = new ArrayBuffer(16);
   * const view = new DataView(buffer);
   * view.setFloat32(0, playerX, true);
   * view.setFloat32(4, playerY, true);
   * view.setFloat32(8, playerZ, true);
   *
   * network.sendMessage(MessageTypes.PLAYER_MOVE, buffer, MessagePriority.HIGH);
   * ```
   */
  sendMessage(
    messageType: MessageType,
    data: ArrayBuffer,
    priority: MessagePriority = MessagePriority.NORMAL
  ): boolean {
    if (!this.isConnected || !this.transport) {
      logger.warn('Cannot send - not connected');
      return false;
    }

    const msg = new NetworkMessage(messageType, data, priority);
    return this.transport.send(msg);
  }

  /**
   * Sends an RPC call.
   *
   * @param rpcName - RPC name
   * @param targetId - Target entity ID
   * @param args - Arguments
   * @returns True if sent successfully
   *
   * @example
   * ```typescript
   * network.sendRPC('PlayerJump', playerEntityId, [jumpHeight]);
   * ```
   */
  sendRPC(rpcName: string, targetId: NetworkId, args: any[]): boolean {
    const invocation = this.rpc.call(rpcName, targetId, args, this.getLocalPlayerId());
    if (!invocation) {
      return false;
    }

    const data = this.rpc.serialize(invocation);
    return this.sendMessage(this.MSG_RPC, data, MessagePriority.HIGH);
  }

  /**
   * Multicasts an RPC to all clients (server only).
   *
   * @param rpcName - RPC name
   * @param targetId - Target entity ID
   * @param args - Arguments
   * @returns True if sent successfully
   */
  multicastRPC(rpcName: string, targetId: NetworkId, args: any[]): boolean {
    if (this.mode !== NetworkMode.SERVER) {
      logger.error('Multicast can only be called on server');
      return false;
    }

    const invocation = this.rpc.multicast(rpcName, targetId, args);
    if (!invocation) {
      return false;
    }

    const data = this.rpc.serialize(invocation);
    return this.sendMessage(this.MSG_RPC, data, MessagePriority.HIGH);
  }

  /**
   * Updates the network manager.
   * Call this every frame.
   *
   * @param deltaTime - Time since last update in seconds
   *
   * @example
   * ```typescript
   * update(deltaTime: number): void {
   *   network.update(deltaTime);
   * }
   * ```
   */
  update(deltaTime: number): void {
    if (!this.isConnected) {
      return;
    }

    // Update time sync
    if (this.config.enableTimeSync && this.mode === NetworkMode.CLIENT) {
      if (this.networkTime.needsSync()) {
        this.sendTimeSyncRequest();
      }
    }

    // Update ticks
    const ticks = this.networkTime.updateTicks(deltaTime);
    if (ticks > 0) {
      this.rpc.processQueue();
    }

    // Flush transport
    if (this.transport) {
      this.transport.flush();
    }
  }

  /**
   * Sends a time sync request (client only).
   */
  private sendTimeSyncRequest(): void {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setFloat64(0, Date.now(), true);

    this.sendMessage(
      this.MSG_TIME_SYNC_REQUEST,
      buffer,
      MessagePriority.CRITICAL
    );
  }

  /**
   * Handles time sync request (server only).
   */
  private handleTimeSyncRequest(msg: NetworkMessage): void {
    const view = new DataView(msg.data);
    const clientSendTime = view.getFloat64(0, true);

    // Send response with server time
    const buffer = new ArrayBuffer(16);
    const responseView = new DataView(buffer);
    responseView.setFloat64(0, clientSendTime, true);
    responseView.setFloat64(8, Date.now(), true);

    this.sendMessage(
      this.MSG_TIME_SYNC_RESPONSE,
      buffer,
      MessagePriority.CRITICAL
    );
  }

  /**
   * Handles time sync response (client only).
   */
  private handleTimeSyncResponse(msg: NetworkMessage): void {
    const view = new DataView(msg.data);
    const clientSendTime = view.getFloat64(0, true);
    const serverTime = view.getFloat64(8, true);
    const clientReceiveTime = Date.now();

    this.networkTime.addSample(serverTime, clientSendTime, clientReceiveTime);
  }

  /**
   * Handles player connect message.
   */
  private handlePlayerConnect(msg: NetworkMessage): void {
    const view = new DataView(msg.data);
    const playerId = view.getUint32(0, true);
    const [name] = BinarySerializer.readString(view, 4);

    if (!this.session) return;

    const player: PlayerInfo = {
      id: playerId,
      name,
      connectTime: Date.now(),
      isLocal: false,
      latency: 0,
    };

    this.session.players.set(playerId, player);

    logger.info(`Player ${name} (${playerId}) connected`);
  }

  /**
   * Handles player disconnect message.
   */
  private handlePlayerDisconnect(msg: NetworkMessage): void {
    const view = new DataView(msg.data);
    const playerId = view.getUint32(0, true);

    if (!this.session) return;

    const player = this.session.players.get(playerId);
    if (player) {
      this.session.players.delete(playerId);
      logger.info(`Player ${player.name} (${playerId}) disconnected`);
    }
  }

  /**
   * Gets the local player ID.
   * @returns Local player ID
   */
  getLocalPlayerId(): PlayerId {
    return this.session?.playerId ?? 0;
  }

  /**
   * Gets session information.
   * @returns Session info or null
   */
  getSession(): Readonly<SessionInfo> | null {
    if (!this.session) return null;
    return { ...this.session };
  }

  /**
   * Gets the current network mode.
   * @returns Network mode
   */
  getMode(): NetworkMode {
    return this.mode;
  }

  /**
   * Checks if connected.
   * @returns True if connected
   */
  getIsConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Gets the transport instance.
   * @returns Transport or null
   */
  getTransport(): WebSocketTransport | WebRTCTransport | null {
    return this.transport;
  }

  /**
   * Generates a session ID.
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Note: NetworkBinarySerializer not re-exported here to avoid naming conflicts with serialization module
// Import directly from './NetworkMessage' if needed
