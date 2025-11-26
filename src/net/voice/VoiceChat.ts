import { Logger } from '../../core/Logger';

/**
 * Voice chat participant
 */
export interface VoiceParticipant {
  /** Participant ID */
  id: string;
  /** Participant name */
  name: string;
  /** Is currently speaking */
  isSpeaking: boolean;
  /** Is muted */
  isMuted: boolean;
  /** Audio volume (0-1) */
  volume: number;
  /** WebRTC peer connection */
  peerConnection?: RTCPeerConnection;
  /** Remote audio stream */
  remoteStream?: MediaStream;
  /** Audio element for playback */
  audioElement?: HTMLAudioElement;
}

/**
 * Voice chat configuration
 */
export interface VoiceChatConfig {
  /** WebRTC ICE servers */
  iceServers?: RTCIceServer[];
  /** Audio constraints */
  audioConstraints?: MediaTrackConstraints;
  /** Push-to-talk enabled */
  pushToTalk?: boolean;
  /** Voice activation threshold (0-1) */
  voiceActivationThreshold?: number;
  /** Enable noise suppression */
  noiseSuppression?: boolean;
  /** Enable echo cancellation */
  echoCancellation?: boolean;
  /** Enable auto gain control */
  autoGainControl?: boolean;
  /** Enable debug logging */
  debug?: boolean;
}

/**
 * Voice activity detection result
 */
export interface VoiceActivityResult {
  /** Is voice detected */
  isActive: boolean;
  /** Audio level (0-1) */
  level: number;
}

/**
 * Voice chat manager using WebRTC for peer-to-peer audio communication.
 * Supports push-to-talk and voice activation detection.
 *
 * @example
 * ```typescript
 * const voiceChat = new VoiceChat({
 *   pushToTalk: false,
 *   voiceActivationThreshold: 0.1,
 *   noiseSuppression: true
 * });
 *
 * await voiceChat.initialize();
 * voiceChat.on('speaking', (participantId, isSpeaking) => {
 *   console.log(`${participantId} speaking: ${isSpeaking}`);
 * });
 *
 * await voiceChat.addParticipant('player1', 'Player One');
 * ```
 */
export class VoiceChat {
  private readonly participants: Map<string, VoiceParticipant> = new Map();
  private localStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private readonly config: Required<VoiceChatConfig>;
  private readonly logger: Logger;
  private initialized: boolean = false;
  private isPushToTalkActive: boolean = false;
  private isMuted: boolean = false;
  private vadCheckInterval: number | null = null;
  private readonly eventHandlers: Map<string, Set<Function>> = new Map();

  constructor(config: VoiceChatConfig = {}) {
    this.config = {
      iceServers: config.iceServers ?? [
        { urls: 'stun:stun.l.google.com:19302' }
      ],
      audioConstraints: config.audioConstraints ?? {
        echoCancellation: config.echoCancellation ?? true,
        noiseSuppression: config.noiseSuppression ?? true,
        autoGainControl: config.autoGainControl ?? true
      },
      pushToTalk: config.pushToTalk ?? false,
      voiceActivationThreshold: config.voiceActivationThreshold ?? 0.1,
      noiseSuppression: config.noiseSuppression ?? true,
      echoCancellation: config.echoCancellation ?? true,
      autoGainControl: config.autoGainControl ?? true,
      debug: config.debug ?? false
    };
    this.logger = new Logger('VoiceChat');
  }

  /**
   * Initialize voice chat and request microphone access
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      this.logger.warn('Voice chat already initialized');
      return;
    }

    try {
      // Request microphone access
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: this.config.audioConstraints,
        video: false
      });

      // Create audio context for voice activity detection
      this.audioContext = new AudioContext();
      const source = this.audioContext.createMediaStreamSource(this.localStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.8;
      source.connect(this.analyser);

      // Start voice activity detection if not using push-to-talk
      if (!this.config.pushToTalk) {
        this.startVoiceActivityDetection();
      }

      this.initialized = true;

      if (this.config.debug) {
        this.logger.debug('Voice chat initialized');
      }

      this.emit('initialized');
    } catch (error) {
      this.logger.error('Failed to initialize voice chat:', error);
      throw error;
    }
  }

  /**
   * Shutdown voice chat and release resources
   */
  public shutdown(): void {
    // Stop voice activity detection
    if (this.vadCheckInterval !== null) {
      clearInterval(this.vadCheckInterval);
      this.vadCheckInterval = null;
    }

    // Close all peer connections
    for (const participant of this.participants.values()) {
      this.removeParticipant(participant.id);
    }

    // Stop local stream
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => track.stop());
      this.localStream = null;
    }

    // Close audio context
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    this.analyser = null;
    this.initialized = false;

    if (this.config.debug) {
      this.logger.debug('Voice chat shutdown');
    }

    this.emit('shutdown');
  }

  /**
   * Add a participant to voice chat
   *
   * @param participantId - Participant ID
   * @param participantName - Participant name
   */
  public async addParticipant(
    participantId: string,
    participantName: string
  ): Promise<void> {
    if (!this.initialized) {
      throw new Error('Voice chat not initialized');
    }

    if (this.participants.has(participantId)) {
      this.logger.warn(`Participant ${participantId} already exists`);
      return;
    }

    const participant: VoiceParticipant = {
      id: participantId,
      name: participantName,
      isSpeaking: false,
      isMuted: false,
      volume: 1.0
    };

    this.participants.set(participantId, participant);

    if (this.config.debug) {
      this.logger.debug(`Added participant ${participantId}`);
    }

    this.emit('participantAdded', participant);
  }

  /**
   * Remove a participant from voice chat
   *
   * @param participantId - Participant ID
   */
  public removeParticipant(participantId: string): void {
    const participant = this.participants.get(participantId);
    if (!participant) {
      return;
    }

    // Close peer connection
    if (participant.peerConnection) {
      participant.peerConnection.close();
    }

    // Remove audio element
    if (participant.audioElement) {
      participant.audioElement.pause();
      participant.audioElement.srcObject = null;
      participant.audioElement.remove();
    }

    this.participants.delete(participantId);

    if (this.config.debug) {
      this.logger.debug(`Removed participant ${participantId}`);
    }

    this.emit('participantRemoved', participantId);
  }

  /**
   * Create WebRTC peer connection for a participant
   *
   * @param participantId - Participant ID
   * @returns RTC peer connection
   */
  public async createPeerConnection(participantId: string): Promise<RTCPeerConnection> {
    const participant = this.participants.get(participantId);
    if (!participant) {
      throw new Error('Participant not found');
    }

    if (!this.localStream) {
      throw new Error('Local stream not available');
    }

    const peerConnection = new RTCPeerConnection({
      iceServers: this.config.iceServers
    });

    // Add local stream tracks
    this.localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, this.localStream!);
    });

    // Handle remote stream
    peerConnection.ontrack = (event) => {
      if (this.config.debug) {
        this.logger.debug(`Received remote track from ${participantId}`);
      }

      participant.remoteStream = event.streams[0];

      // Create audio element for playback
      const audioElement = new Audio();
      audioElement.srcObject = event.streams[0];
      audioElement.autoplay = true;
      audioElement.volume = participant.volume;
      participant.audioElement = audioElement;

      this.emit('remoteStreamAdded', participantId, event.streams[0]);
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.emit('iceCandidate', participantId, event.candidate);
      }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      if (this.config.debug) {
        this.logger.debug(
          `Connection state for ${participantId}: ${peerConnection.connectionState}`
        );
      }

      if (peerConnection.connectionState === 'disconnected' ||
          peerConnection.connectionState === 'failed') {
        this.emit('participantDisconnected', participantId);
      } else if (peerConnection.connectionState === 'connected') {
        this.emit('participantConnected', participantId);
      }
    };

    participant.peerConnection = peerConnection;
    return peerConnection;
  }

  /**
   * Create an offer for a participant
   *
   * @param participantId - Participant ID
   * @returns SDP offer
   */
  public async createOffer(participantId: string): Promise<RTCSessionDescriptionInit> {
    const participant = this.participants.get(participantId);
    if (!participant || !participant.peerConnection) {
      throw new Error('Participant or peer connection not found');
    }

    const offer = await participant.peerConnection.createOffer();
    await participant.peerConnection.setLocalDescription(offer);

    return offer;
  }

  /**
   * Create an answer for a participant
   *
   * @param participantId - Participant ID
   * @param offer - Remote SDP offer
   * @returns SDP answer
   */
  public async createAnswer(
    participantId: string,
    offer: RTCSessionDescriptionInit
  ): Promise<RTCSessionDescriptionInit> {
    const participant = this.participants.get(participantId);
    if (!participant || !participant.peerConnection) {
      throw new Error('Participant or peer connection not found');
    }

    await participant.peerConnection.setRemoteDescription(offer);
    const answer = await participant.peerConnection.createAnswer();
    await participant.peerConnection.setLocalDescription(answer);

    return answer;
  }

  /**
   * Set remote answer for a participant
   *
   * @param participantId - Participant ID
   * @param answer - Remote SDP answer
   */
  public async setRemoteAnswer(
    participantId: string,
    answer: RTCSessionDescriptionInit
  ): Promise<void> {
    const participant = this.participants.get(participantId);
    if (!participant || !participant.peerConnection) {
      throw new Error('Participant or peer connection not found');
    }

    await participant.peerConnection.setRemoteDescription(answer);
  }

  /**
   * Add ICE candidate for a participant
   *
   * @param participantId - Participant ID
   * @param candidate - ICE candidate
   */
  public async addIceCandidate(
    participantId: string,
    candidate: RTCIceCandidateInit
  ): Promise<void> {
    const participant = this.participants.get(participantId);
    if (!participant || !participant.peerConnection) {
      throw new Error('Participant or peer connection not found');
    }

    await participant.peerConnection.addIceCandidate(candidate);
  }

  /**
   * Set push-to-talk state
   *
   * @param active - Push-to-talk active state
   */
  public setPushToTalk(active: boolean): void {
    if (!this.config.pushToTalk) {
      this.logger.warn('Push-to-talk is not enabled');
      return;
    }

    this.isPushToTalkActive = active;
    this.updateMicrophoneState();

    if (this.config.debug) {
      this.logger.debug(`Push-to-talk: ${active}`);
    }
  }

  /**
   * Set muted state
   *
   * @param muted - Muted state
   */
  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    this.updateMicrophoneState();

    if (this.config.debug) {
      this.logger.debug(`Muted: ${muted}`);
    }

    this.emit('mutedChanged', muted);
  }

  /**
   * Set participant volume
   *
   * @param participantId - Participant ID
   * @param volume - Volume level (0-1)
   */
  public setParticipantVolume(participantId: string, volume: number): void {
    const participant = this.participants.get(participantId);
    if (!participant) {
      return;
    }

    participant.volume = Math.max(0, Math.min(1, volume));

    if (participant.audioElement) {
      participant.audioElement.volume = participant.volume;
    }

    if (this.config.debug) {
      this.logger.debug(`Set volume for ${participantId}: ${participant.volume}`);
    }
  }

  /**
   * Update microphone enabled state based on mute and push-to-talk
   */
  private updateMicrophoneState(): void {
    if (!this.localStream) {
      return;
    }

    const enabled = !this.isMuted && (!this.config.pushToTalk || this.isPushToTalkActive);

    this.localStream.getAudioTracks().forEach(track => {
      track.enabled = enabled;
    });
  }

  /**
   * Start voice activity detection
   */
  private startVoiceActivityDetection(): void {
    if (this.vadCheckInterval !== null) {
      return;
    }

    this.vadCheckInterval = window.setInterval(() => {
      const activity = this.detectVoiceActivity();

      // Emit speaking events based on voice activity
      if (activity.isActive) {
        this.emit('speaking', 'local', true, activity.level);
      } else {
        this.emit('speaking', 'local', false, activity.level);
      }
    }, 100); // Check every 100ms
  }

  /**
   * Detect voice activity from local microphone
   *
   * @returns Voice activity result
   */
  private detectVoiceActivity(): VoiceActivityResult {
    if (!this.analyser) {
      return { isActive: false, level: 0 };
    }

    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteFrequencyData(dataArray);

    // Calculate average volume
    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      sum += dataArray[i];
    }
    const average = sum / bufferLength / 255; // Normalize to 0-1

    const isActive = average > this.config.voiceActivationThreshold;

    return { isActive, level: average };
  }

  /**
   * Get all participants
   *
   * @returns Array of participants
   */
  public getParticipants(): VoiceParticipant[] {
    return Array.from(this.participants.values()).map(p => ({ ...p }));
  }

  /**
   * Get participant by ID
   *
   * @param participantId - Participant ID
   * @returns Participant or undefined
   */
  public getParticipant(participantId: string): VoiceParticipant | undefined {
    const participant = this.participants.get(participantId);
    return participant ? { ...participant } : undefined;
  }

  /**
   * Check if initialized
   */
  public isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get muted state
   */
  public isMutedState(): boolean {
    return this.isMuted;
  }

  /**
   * Register event handler
   */
  public on(event: string, handler: Function): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  /**
   * Unregister event handler
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
  private emit(event: string, ...args: any[]): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(...args);
        } catch (error) {
          this.logger.error(`Error in event handler for ${event}:`, error);
        }
      }
    }
  }

  /**
   * Get voice chat statistics
   */
  public getStats(): {
    initialized: boolean;
    participantCount: number;
    isMuted: boolean;
    pushToTalkEnabled: boolean;
    pushToTalkActive: boolean;
  } {
    return {
      initialized: this.initialized,
      participantCount: this.participants.size,
      isMuted: this.isMuted,
      pushToTalkEnabled: this.config.pushToTalk,
      pushToTalkActive: this.isPushToTalkActive
    };
  }
}
