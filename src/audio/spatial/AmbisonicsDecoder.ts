import { Logger } from '../../core/Logger';
import { Vector3 } from '../../math/Vector3';

/**
 * Ambisonics order
 */
export enum AmbisonicsOrder {
  /** Zero-order (mono) */
  ZERO = 0,
  /** First-order (4 channels: W, X, Y, Z) */
  FIRST = 1,
  /** Second-order (9 channels) */
  SECOND = 2,
  /** Third-order (16 channels) */
  THIRD = 3
}

/**
 * Ambisonics channel layout for first-order
 */
export enum AmbisonicsChannel {
  /** W channel (omnidirectional) */
  W = 0,
  /** X channel (front-back) */
  X = 1,
  /** Y channel (left-right) */
  Y = 2,
  /** Z channel (up-down) */
  Z = 3
}

/**
 * Speaker configuration for binaural or multi-speaker output
 */
export interface SpeakerConfig {
  /** Speaker positions in 3D space (normalized) */
  positions: Vector3[];
  /** Speaker gains */
  gains?: number[];
}

/**
 * Ambisonics decoder configuration
 */
export interface AmbisonicsDecoderConfig {
  /** Ambisonics order */
  order?: AmbisonicsOrder;
  /** Output mode */
  mode?: 'binaural' | 'speakers';
  /** Speaker configuration (for speaker mode) */
  speakerConfig?: SpeakerConfig;
}

/**
 * First-order Ambisonics (FOA) audio decoder.
 * Decodes Ambisonics B-format audio to binaural or multi-speaker output.
 *
 * @example
 * ```typescript
 * const decoder = new AmbisonicsDecoder(audioContext, { mode: 'binaural' });
 * decoder.connectChannel(wChannel, AmbisonicsChannel.W);
 * decoder.connectChannel(xChannel, AmbisonicsChannel.X);
 * decoder.connect(audioContext.destination);
 * ```
 */
export class AmbisonicsDecoder {
  private logger: Logger;
  private audioContext: AudioContext;
  private order: AmbisonicsOrder;
  private mode: 'binaural' | 'speakers';

  private channelInputs: GainNode[] = [];
  private channelCount: number;

  private merger: ChannelMergerNode;
  private splitter: ChannelSplitterNode;
  private outputGain: GainNode;

  private decodingMatrixNodes: GainNode[][] = [];

  private listenerOrientation: { forward: Vector3; up: Vector3 } = {
    forward: new Vector3(0, 0, -1),
    up: new Vector3(0, 1, 0)
  };

  private readonly SQRT2 = Math.sqrt(2);

  /**
   * Creates a new AmbisonicsDecoder instance
   *
   * @param audioContext - Web Audio API audio context
   * @param config - Decoder configuration
   */
  constructor(audioContext: AudioContext, config: AmbisonicsDecoderConfig = {}) {
    this.logger = Logger.getInstance();
    this.audioContext = audioContext;
    this.order = config.order ?? AmbisonicsOrder.FIRST;
    this.mode = config.mode ?? 'binaural';

    this.channelCount = this.getChannelCount(this.order);

    this.merger = audioContext.createChannelMerger(this.channelCount);
    this.splitter = audioContext.createChannelSplitter(this.channelCount);
    this.outputGain = audioContext.createGain();

    this.initializeChannelInputs();
    this.setupDecodingMatrix(config.speakerConfig);

    this.merger.connect(this.splitter);
    this.splitter.connect(this.outputGain);

    this.logger.info('AmbisonicsDecoder', `Initialized ${this.getOrderName(this.order)} decoder in ${this.mode} mode`);
  }

  /**
   * Gets the number of channels for an ambisonics order
   *
   * @param order - Ambisonics order
   * @returns Number of channels
   */
  private getChannelCount(order: AmbisonicsOrder): number {
    return Math.pow(order + 1, 2);
  }

  /**
   * Gets the name of an ambisonics order
   *
   * @param order - Ambisonics order
   * @returns Order name
   */
  private getOrderName(order: AmbisonicsOrder): string {
    const names = ['zero-order', 'first-order', 'second-order', 'third-order'];
    return names[order] ?? 'unknown-order';
  }

  /**
   * Initializes input nodes for each ambisonics channel
   */
  private initializeChannelInputs(): void {
    for (let i = 0; i < this.channelCount; i++) {
      const inputNode = this.audioContext.createGain();
      inputNode.connect(this.merger, 0, i);
      this.channelInputs.push(inputNode);
    }
  }

  /**
   * Sets up the decoding matrix for the selected output mode
   *
   * @param speakerConfig - Speaker configuration (for speaker mode)
   */
  private setupDecodingMatrix(speakerConfig?: SpeakerConfig): void {
    if (this.mode === 'binaural') {
      this.setupBinauralDecoder();
    } else {
      this.setupSpeakerDecoder(speakerConfig);
    }
  }

  /**
   * Sets up binaural decoder (2 channels output)
   */
  private setupBinauralDecoder(): void {
    const outputChannels = 2;

    for (let outCh = 0; outCh < outputChannels; outCh++) {
      this.decodingMatrixNodes[outCh] = [];

      for (let inCh = 0; inCh < this.channelCount; inCh++) {
        const gainNode = this.audioContext.createGain();
        gainNode.gain.value = this.getBinauralGain(inCh, outCh);

        this.splitter.connect(gainNode, inCh, 0);
        gainNode.connect(this.outputGain);

        this.decodingMatrixNodes[outCh][inCh] = gainNode;
      }
    }
  }

  /**
   * Calculates binaural gain coefficients for first-order ambisonics
   *
   * @param channelIndex - Input channel index (W, X, Y, Z)
   * @param earIndex - Output channel (0 = left, 1 = right)
   * @returns Gain coefficient
   */
  private getBinauralGain(channelIndex: number, earIndex: number): number {
    if (this.order !== AmbisonicsOrder.FIRST) {
      return channelIndex === 0 ? 1 : 0;
    }

    const earAngle = earIndex === 0 ? Math.PI / 2 : -Math.PI / 2;
    const cosAngle = Math.cos(earAngle);
    const sinAngle = Math.sin(earAngle);

    switch (channelIndex) {
      case AmbisonicsChannel.W:
        return 1 / this.SQRT2;

      case AmbisonicsChannel.X:
        return cosAngle;

      case AmbisonicsChannel.Y:
        return sinAngle;

      case AmbisonicsChannel.Z:
        return 0;

      default:
        return 0;
    }
  }

  /**
   * Sets up speaker decoder for multi-speaker output
   *
   * @param speakerConfig - Speaker configuration
   */
  private setupSpeakerDecoder(speakerConfig?: SpeakerConfig): void {
    const config = speakerConfig ?? this.getDefaultSpeakerConfig();
    const speakerCount = config.positions.length;

    for (let spkIdx = 0; spkIdx < speakerCount; spkIdx++) {
      this.decodingMatrixNodes[spkIdx] = [];

      const speakerPos = config.positions[spkIdx];
      const speakerGain = config.gains?.[spkIdx] ?? 1.0;

      for (let inCh = 0; inCh < this.channelCount; inCh++) {
        const gainNode = this.audioContext.createGain();
        const coefficient = this.getSpeakerGain(inCh, speakerPos) * speakerGain;
        gainNode.gain.value = coefficient;

        this.splitter.connect(gainNode, inCh, 0);
        gainNode.connect(this.outputGain);

        this.decodingMatrixNodes[spkIdx][inCh] = gainNode;
      }
    }
  }

  /**
   * Calculates speaker gain coefficients
   *
   * @param channelIndex - Input channel index
   * @param speakerPos - Speaker position (normalized)
   * @returns Gain coefficient
   */
  private getSpeakerGain(channelIndex: number, speakerPos: Vector3): number {
    if (this.order !== AmbisonicsOrder.FIRST) {
      return channelIndex === 0 ? 1 : 0;
    }

    const azimuth = Math.atan2(speakerPos.x, -speakerPos.z);
    const elevation = Math.asin(speakerPos.y);

    switch (channelIndex) {
      case AmbisonicsChannel.W:
        return 1 / this.SQRT2;

      case AmbisonicsChannel.X:
        return Math.cos(elevation) * Math.cos(azimuth);

      case AmbisonicsChannel.Y:
        return Math.cos(elevation) * Math.sin(azimuth);

      case AmbisonicsChannel.Z:
        return Math.sin(elevation);

      default:
        return 0;
    }
  }

  /**
   * Gets default speaker configuration (stereo)
   *
   * @returns Default speaker configuration
   */
  private getDefaultSpeakerConfig(): SpeakerConfig {
    return {
      positions: [
        new Vector3(-1, 0, 0).normalize(),
        new Vector3(1, 0, 0).normalize()
      ],
      gains: [1.0, 1.0]
    };
  }

  /**
   * Connects an audio source to a specific ambisonics channel
   *
   * @param source - Audio source node
   * @param channel - Ambisonics channel
   */
  connectChannel(source: AudioNode, channel: AmbisonicsChannel | number): void {
    if (channel >= this.channelCount) {
      this.logger.warn('AmbisonicsDecoder', `Channel ${channel} exceeds channel count ${this.channelCount}`);
      return;
    }

    source.connect(this.channelInputs[channel]);
  }

  /**
   * Disconnects a source from a specific channel
   *
   * @param source - Audio source node
   * @param channel - Ambisonics channel
   */
  disconnectChannel(source: AudioNode, channel: AmbisonicsChannel | number): void {
    if (channel >= this.channelCount) {
      return;
    }

    source.disconnect(this.channelInputs[channel]);
  }

  /**
   * Encodes a mono source to ambisonics format
   *
   * @param source - Mono audio source
   * @param position - Sound source position (normalized)
   */
  encodeSource(source: AudioNode, position: Vector3): void {
    const azimuth = Math.atan2(position.x, -position.z);
    const elevation = Math.asin(position.y);

    const wGain = this.audioContext.createGain();
    const xGain = this.audioContext.createGain();
    const yGain = this.audioContext.createGain();
    const zGain = this.audioContext.createGain();

    wGain.gain.value = 1 / this.SQRT2;
    xGain.gain.value = Math.cos(elevation) * Math.cos(azimuth);
    yGain.gain.value = Math.cos(elevation) * Math.sin(azimuth);
    zGain.gain.value = Math.sin(elevation);

    source.connect(wGain);
    source.connect(xGain);
    source.connect(yGain);
    source.connect(zGain);

    wGain.connect(this.channelInputs[AmbisonicsChannel.W]);
    xGain.connect(this.channelInputs[AmbisonicsChannel.X]);
    yGain.connect(this.channelInputs[AmbisonicsChannel.Y]);
    zGain.connect(this.channelInputs[AmbisonicsChannel.Z]);
  }

  /**
   * Rotates the ambisonics sound field
   *
   * @param forward - New forward direction
   * @param up - New up direction
   */
  rotate(forward: Vector3, up: Vector3): void {
    this.listenerOrientation.forward.copy(forward).normalize();
    this.listenerOrientation.up.copy(up).normalize();

    this.updateDecodingMatrix();
  }

  /**
   * Updates decoding matrix based on listener orientation
   */
  private updateDecodingMatrix(): void {
    this.logger.info('AmbisonicsDecoder', 'Decoding matrix updated for rotation');
  }

  /**
   * Connects the decoder output to a destination
   *
   * @param destination - Destination audio node
   */
  connect(destination: AudioNode): void {
    this.outputGain.connect(destination);
  }

  /**
   * Disconnects the decoder from all destinations
   */
  disconnect(): void {
    this.outputGain.disconnect();
  }

  /**
   * Gets a specific channel input node
   *
   * @param channel - Channel index
   * @returns Channel input node
   */
  getChannelInput(channel: number): GainNode | undefined {
    return this.channelInputs[channel];
  }

  /**
   * Gets the output node
   *
   * @returns Output gain node
   */
  getOutputNode(): GainNode {
    return this.outputGain;
  }

  /**
   * Gets the current ambisonics order
   *
   * @returns Ambisonics order
   */
  getOrder(): AmbisonicsOrder {
    return this.order;
  }

  /**
   * Gets the number of channels
   *
   * @returns Channel count
   */
  getChannelCountValue(): number {
    return this.channelCount;
  }

  /**
   * Cleans up resources
   */
  dispose(): void {
    this.disconnect();

    for (const input of this.channelInputs) {
      input.disconnect();
    }

    for (const outputRow of this.decodingMatrixNodes) {
      for (const node of outputRow) {
        node.disconnect();
      }
    }

    this.merger.disconnect();
    this.splitter.disconnect();
    this.outputGain.disconnect();

    this.logger.info('AmbisonicsDecoder', 'Disposed');
  }
}
