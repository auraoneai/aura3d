/**
 * @fileoverview WebRTC peer-to-peer network transport.
 * Provides low-latency data channels with NAT traversal via STUN/TURN.
 * @module net/WebRTCTransport
 */

import { EventBus } from '../core/EventBus';
import { Logger } from '../core/Logger';
import { NetworkMessage, MessageQueue, MessagePriority, DeliveryMode } from './NetworkMessage';

const logger = Logger.create('WebRTCTransport');

/**
 * WebRTC connection state.
 */
export enum RTCConnectionState {
  /** Not connected */
  DISCONNECTED = 'disconnected',
  /** Gathering ICE candidates */
  GATHERING = 'gathering',
  /** Connecting */
  CONNECTING = 'connecting',
  /** Connected and ready */
  CONNECTED = 'connected',
  /** Connection failed */
  FAILED = 'failed',
}

/**
 * ICE server configuration.
 */
export interface ICEServer {
  /** Server URLs */
  urls: string | string[];
  /** Username for TURN servers */
  username?: string;
  /** Credential for TURN servers */
  credential?: string;
}

/**
 * WebRTC transport configuration.
 */
export interface WebRTCTransportConfig {
  /** ICE servers for NAT traversal */
  iceServers?: ICEServer[];
  /** Ordered delivery (default: false for better performance) */
  ordered?: boolean;
  /** Maximum retransmits for unreliable channels (default: 0) */
  maxRetransmits?: number;
  /** Maximum queue size */
  maxQueueSize?: number;
  /** Enable separate unreliable channel */
  enableUnreliableChannel?: boolean;
}

/**
 * Data channel wrapper with delivery mode.
 */
interface ManagedDataChannel {
  channel: RTCDataChannel;
  mode: DeliveryMode;
  queue: MessageQueue;
}

/**
 * WebRTC peer-to-peer transport.
 * Supports both reliable and unreliable data channels for optimal performance.
 *
 * @example
 * ```typescript
 * const transport = new WebRTCTransport({
 *   iceServers: [
 *     { urls: 'stun:stun.l.google.com:19302' },
 *     { urls: 'turn:turn.example.com', username: 'user', credential: 'pass' }
 *   ],
 *   enableUnreliableChannel: true,
 * });
 *
 * // Offer side
 * const offer = await transport.createOffer();
 * // Send offer to peer via signaling
 *
 * // Answer side
 * await transport.setRemoteOffer(offer);
 * const answer = await transport.createAnswer();
 * // Send answer back via signaling
 *
 * // Offer side receives answer
 * await transport.setRemoteAnswer(answer);
 *
 * // Both sides add ICE candidates as they arrive
 * transport.addICECandidate(candidate);
 *
 * // Send messages
 * const msg = new NetworkMessage(1, data, MessagePriority.HIGH, DeliveryMode.UNRELIABLE);
 * transport.send(msg);
 * ```
 */
export class WebRTCTransport {
  private config: Required<WebRTCTransportConfig>;
  private peerConnection: RTCPeerConnection | null = null;
  private state: RTCConnectionState = RTCConnectionState.DISCONNECTED;

  /** Reliable data channel */
  private reliableChannel: ManagedDataChannel | null = null;

  /** Unreliable data channel */
  private unreliableChannel: ManagedDataChannel | null = null;

  /** Pending ICE candidates */
  private pendingCandidates: RTCIceCandidate[] = [];

  /** Message callback */
  private messageCallback: ((message: NetworkMessage) => void) | null = null;

  /** ICE candidate callback */
  private iceCandidateCallback: ((candidate: RTCIceCandidate) => void) | null = null;

  /** Connection metrics */
  private metrics = {
    bytesSent: 0,
    bytesReceived: 0,
    messagesSent: 0,
    messagesReceived: 0,
  };

  /**
   * Creates a new WebRTC transport.
   *
   * @param config - Transport configuration
   *
   * @example
   * ```typescript
   * const transport = new WebRTCTransport({
   *   iceServers: [
   *     { urls: 'stun:stun.l.google.com:19302' }
   *   ],
   *   enableUnreliableChannel: true,
   * });
   * ```
   */
  constructor(config: WebRTCTransportConfig = {}) {
    this.config = {
      iceServers: config.iceServers ?? [
        { urls: 'stun:stun.l.google.com:19302' },
      ],
      ordered: config.ordered ?? false,
      maxRetransmits: config.maxRetransmits ?? 0,
      maxQueueSize: config.maxQueueSize ?? 1000,
      enableUnreliableChannel: config.enableUnreliableChannel ?? true,
    };
  }

  /**
   * Creates a new peer connection.
   */
  private createPeerConnection(): void {
    const config: RTCConfiguration = {
      iceServers: this.config.iceServers,
    };

    this.peerConnection = new RTCPeerConnection(config);

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        logger.debug('ICE candidate', event.candidate);
        if (this.iceCandidateCallback) {
          this.iceCandidateCallback(event.candidate);
        }
      }
    };

    this.peerConnection.onicegatheringstatechange = () => {
      logger.debug(`ICE gathering state: ${this.peerConnection!.iceGatheringState}`);
      if (this.peerConnection!.iceGatheringState === 'gathering') {
        this.state = RTCConnectionState.GATHERING;
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      const iceState = this.peerConnection!.iceConnectionState;
      logger.debug(`ICE connection state: ${iceState}`);

      switch (iceState) {
        case 'connected':
        case 'completed':
          this.state = RTCConnectionState.CONNECTED;
          EventBus.emit('network:connected' as any, undefined);
          break;
        case 'failed':
          this.state = RTCConnectionState.FAILED;
          EventBus.emit('network:error' as any, { error: new Error('ICE connection failed') });
          break;
        case 'disconnected':
          this.state = RTCConnectionState.DISCONNECTED;
          EventBus.emit('network:disconnected' as any, undefined);
          break;
      }
    };

    this.peerConnection.ondatachannel = (event) => {
      this.handleIncomingDataChannel(event.channel);
    };
  }

  /**
   * Creates an offer to send to the remote peer.
   * Call this on the peer that initiates the connection.
   *
   * @returns SDP offer description
   *
   * @example
   * ```typescript
   * const offer = await transport.createOffer();
   * signalingChannel.send({ type: 'offer', sdp: offer });
   * ```
   */
  async createOffer(): Promise<RTCSessionDescriptionInit> {
    this.createPeerConnection();

    // Create reliable channel
    this.createReliableChannel();

    // Create unreliable channel if enabled
    if (this.config.enableUnreliableChannel) {
      this.createUnreliableChannel();
    }

    const offer = await this.peerConnection!.createOffer();
    await this.peerConnection!.setLocalDescription(offer);

    return offer;
  }

  /**
   * Creates an answer to send to the remote peer.
   * Call this after receiving an offer from the remote peer.
   *
   * @returns SDP answer description
   *
   * @example
   * ```typescript
   * await transport.setRemoteOffer(receivedOffer);
   * const answer = await transport.createAnswer();
   * signalingChannel.send({ type: 'answer', sdp: answer });
   * ```
   */
  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    if (!this.peerConnection) {
      throw new Error('Must set remote offer before creating answer');
    }

    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    return answer;
  }

  /**
   * Sets the remote offer description.
   * Call this when receiving an offer from the remote peer.
   *
   * @param offer - Remote offer description
   *
   * @example
   * ```typescript
   * signalingChannel.on('offer', async (offer) => {
   *   await transport.setRemoteOffer(offer);
   *   const answer = await transport.createAnswer();
   *   signalingChannel.send({ type: 'answer', sdp: answer });
   * });
   * ```
   */
  async setRemoteOffer(offer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) {
      this.createPeerConnection();
    }

    await this.peerConnection!.setRemoteDescription(offer);

    // Process pending ICE candidates
    for (const candidate of this.pendingCandidates) {
      await this.peerConnection!.addIceCandidate(candidate);
    }
    this.pendingCandidates = [];
  }

  /**
   * Sets the remote answer description.
   * Call this when receiving an answer from the remote peer.
   *
   * @param answer - Remote answer description
   *
   * @example
   * ```typescript
   * signalingChannel.on('answer', async (answer) => {
   *   await transport.setRemoteAnswer(answer);
   * });
   * ```
   */
  async setRemoteAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    await this.peerConnection.setRemoteDescription(answer);

    // Process pending ICE candidates
    for (const candidate of this.pendingCandidates) {
      await this.peerConnection.addIceCandidate(candidate);
    }
    this.pendingCandidates = [];
  }

  /**
   * Adds an ICE candidate received from the remote peer.
   *
   * @param candidate - ICE candidate
   *
   * @example
   * ```typescript
   * signalingChannel.on('ice-candidate', async (candidate) => {
   *   await transport.addICECandidate(candidate);
   * });
   * ```
   */
  async addICECandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.peerConnection) {
      logger.warn('Received ICE candidate before peer connection initialized');
      return;
    }

    const iceCandidate = new RTCIceCandidate(candidate);

    if (this.peerConnection.remoteDescription) {
      await this.peerConnection.addIceCandidate(iceCandidate);
    } else {
      // Queue candidate until remote description is set
      this.pendingCandidates.push(iceCandidate);
    }
  }

  /**
   * Creates the reliable data channel.
   */
  private createReliableChannel(): void {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    const channel = this.peerConnection.createDataChannel('reliable', {
      ordered: true,
      maxRetransmits: undefined, // Infinite retransmits
    });

    this.setupDataChannel(channel, DeliveryMode.RELIABLE);
  }

  /**
   * Creates the unreliable data channel.
   */
  private createUnreliableChannel(): void {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }

    const channel = this.peerConnection.createDataChannel('unreliable', {
      ordered: this.config.ordered,
      maxRetransmits: this.config.maxRetransmits,
    });

    this.setupDataChannel(channel, DeliveryMode.UNRELIABLE);
  }

  /**
   * Sets up a data channel with event handlers.
   */
  private setupDataChannel(channel: RTCDataChannel, mode: DeliveryMode): void {
    channel.binaryType = 'arraybuffer';

    const managed: ManagedDataChannel = {
      channel,
      mode,
      queue: new MessageQueue(this.config.maxQueueSize),
    };

    channel.onopen = () => {
      logger.info(`Data channel '${channel.label}' opened`);
      if (mode === DeliveryMode.RELIABLE) {
        this.state = RTCConnectionState.CONNECTED;
      }
    };

    channel.onclose = () => {
      logger.info(`Data channel '${channel.label}' closed`);
    };

    channel.onerror = (error) => {
      logger.error(`Data channel '${channel.label}' error`, error);
    };

    channel.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    if (mode === DeliveryMode.RELIABLE) {
      this.reliableChannel = managed;
    } else {
      this.unreliableChannel = managed;
    }
  }

  /**
   * Handles incoming data channel from remote peer.
   */
  private handleIncomingDataChannel(channel: RTCDataChannel): void {
    logger.info(`Received data channel: ${channel.label}`);

    if (channel.label === 'reliable') {
      this.setupDataChannel(channel, DeliveryMode.RELIABLE);
    } else if (channel.label === 'unreliable') {
      this.setupDataChannel(channel, DeliveryMode.UNRELIABLE);
    } else {
      logger.warn(`Unknown data channel: ${channel.label}`);
    }
  }

  /**
   * Handles incoming message.
   */
  private handleMessage(data: ArrayBuffer): void {
    this.metrics.bytesReceived += data.byteLength;
    this.metrics.messagesReceived++;

    try {
      const message = NetworkMessage.deserialize(data);
      if (this.messageCallback) {
        this.messageCallback(message);
      }
    } catch (error) {
      logger.error('Failed to deserialize message', error);
    }
  }

  /**
   * Sends a network message.
   *
   * @param message - Message to send
   * @returns True if queued successfully
   *
   * @example
   * ```typescript
   * const msg = new NetworkMessage(
   *   1,
   *   data,
   *   MessagePriority.NORMAL,
   *   DeliveryMode.UNRELIABLE
   * );
   * transport.send(msg);
   * ```
   */
  send(message: NetworkMessage): boolean {
    const channel = this.selectChannel(message.deliveryMode);
    if (!channel) {
      logger.warn('No suitable channel for message');
      return false;
    }

    return channel.queue.enqueue(message);
  }

  /**
   * Selects the appropriate channel for a message.
   */
  private selectChannel(mode: DeliveryMode): ManagedDataChannel | null {
    if (mode === DeliveryMode.UNRELIABLE && this.unreliableChannel) {
      return this.unreliableChannel;
    }
    return this.reliableChannel;
  }

  /**
   * Flushes all send queues.
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
    this.flushChannel(this.reliableChannel);
    this.flushChannel(this.unreliableChannel);
  }

  /**
   * Flushes a specific channel's queue.
   */
  private flushChannel(managed: ManagedDataChannel | null): void {
    if (!managed || managed.channel.readyState !== 'open') {
      return;
    }

    while (!managed.queue.isEmpty) {
      const message = managed.queue.dequeue();
      if (!message) break;

      try {
        const data = message.serialize();
        managed.channel.send(data);

        this.metrics.bytesSent += data.byteLength;
        this.metrics.messagesSent++;
      } catch (error) {
        logger.error('Failed to send message', error);
        // Re-queue if critical
        if (message.priority >= MessagePriority.CRITICAL) {
          managed.queue.enqueue(message);
        }
        break;
      }
    }
  }

  /**
   * Sets the message callback.
   * @param callback - Function to call when a message is received
   */
  onMessage(callback: (message: NetworkMessage) => void): void {
    this.messageCallback = callback;
  }

  /**
   * Sets the ICE candidate callback.
   * @param callback - Function to call when an ICE candidate is generated
   */
  onICECandidate(callback: (candidate: RTCIceCandidate) => void): void {
    this.iceCandidateCallback = callback;
  }

  /**
   * Gets the current connection state.
   * @returns Connection state
   */
  getState(): RTCConnectionState {
    return this.state;
  }

  /**
   * Checks if connected.
   * @returns True if connected
   */
  isConnected(): boolean {
    return this.state === RTCConnectionState.CONNECTED;
  }

  /**
   * Gets connection statistics.
   * @returns Connection metrics
   */
  getStats() {
    return { ...this.metrics };
  }

  /**
   * Closes the connection and cleans up resources.
   */
  close(): void {
    if (this.reliableChannel) {
      this.reliableChannel.channel.close();
      this.reliableChannel = null;
    }

    if (this.unreliableChannel) {
      this.unreliableChannel.channel.close();
      this.unreliableChannel = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.state = RTCConnectionState.DISCONNECTED;
    this.pendingCandidates = [];

    logger.info('Connection closed');
  }
}
