/**
 * MockAudio.ts
 *
 * Complete Web Audio API mock implementation for headless testing.
 * Provides AudioContext, AudioBuffer, and various audio nodes for testing.
 *
 * @module tests/utils/MockAudio
 */

/**
 * Mock AudioParam implementation
 */
export class MockAudioParam {
  private _value: number;
  readonly defaultValue: number;
  readonly minValue: number;
  readonly maxValue: number;

  constructor(defaultValue: number = 0, minValue: number = -3.4028235e38, maxValue: number = 3.4028235e38) {
    this._value = defaultValue;
    this.defaultValue = defaultValue;
    this.minValue = minValue;
    this.maxValue = maxValue;
  }

  get value(): number {
    return this._value;
  }

  set value(val: number) {
    this._value = Math.max(this.minValue, Math.min(this.maxValue, val));
  }

  setValueAtTime(value: number, startTime: number): AudioParam {
    this._value = value;
    return this as any;
  }

  linearRampToValueAtTime(value: number, endTime: number): AudioParam {
    this._value = value;
    return this as any;
  }

  exponentialRampToValueAtTime(value: number, endTime: number): AudioParam {
    this._value = value;
    return this as any;
  }

  setTargetAtTime(target: number, startTime: number, timeConstant: number): AudioParam {
    this._value = target;
    return this as any;
  }

  setValueCurveAtTime(values: number[] | Float32Array, startTime: number, duration: number): AudioParam {
    if (values.length > 0) {
      this._value = values[values.length - 1];
    }
    return this as any;
  }

  cancelScheduledValues(cancelTime: number): AudioParam {
    return this as any;
  }

  cancelAndHoldAtTime(cancelTime: number): AudioParam {
    return this as any;
  }
}

/**
 * Base mock audio node
 */
export class MockAudioNode {
  readonly context: MockAudioContext;
  readonly numberOfInputs: number;
  readonly numberOfOutputs: number;
  channelCount: number = 2;
  channelCountMode: ChannelCountMode = 'max';
  channelInterpretation: ChannelInterpretation = 'speakers';

  protected connections: MockAudioNode[] = [];

  constructor(
    context: MockAudioContext,
    numberOfInputs: number = 1,
    numberOfOutputs: number = 1
  ) {
    this.context = context;
    this.numberOfInputs = numberOfInputs;
    this.numberOfOutputs = numberOfOutputs;
  }

  connect(destinationNode: AudioNode | AudioParam, output?: number, input?: number): AudioNode {
    if (destinationNode instanceof MockAudioNode) {
      this.connections.push(destinationNode);
    }
    return destinationNode as any;
  }

  disconnect(destinationNode?: AudioNode | AudioParam | number, output?: number, input?: number): void {
    if (destinationNode instanceof MockAudioNode) {
      const index = this.connections.indexOf(destinationNode);
      if (index !== -1) {
        this.connections.splice(index, 1);
      }
    } else if (typeof destinationNode === 'undefined') {
      this.connections = [];
    }
  }
}

/**
 * Mock AudioBuffer implementation
 */
export class MockAudioBuffer {
  readonly sampleRate: number;
  readonly length: number;
  readonly duration: number;
  readonly numberOfChannels: number;
  private channels: Float32Array[];

  constructor(numberOfChannels: number, length: number, sampleRate: number) {
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }

  getChannelData(channel: number): Float32Array {
    if (channel < 0 || channel >= this.numberOfChannels) {
      throw new Error('Invalid channel index');
    }
    return this.channels[channel];
  }

  copyFromChannel(destination: Float32Array, channelNumber: number, bufferOffset?: number): void {
    const channel = this.getChannelData(channelNumber);
    const offset = bufferOffset || 0;
    destination.set(channel.subarray(offset, offset + destination.length));
  }

  copyToChannel(source: Float32Array, channelNumber: number, bufferOffset?: number): void {
    const channel = this.getChannelData(channelNumber);
    const offset = bufferOffset || 0;
    channel.set(source, offset);
  }
}

/**
 * Mock AudioBufferSourceNode implementation
 */
export class MockAudioBufferSourceNode extends MockAudioNode {
  buffer: AudioBuffer | null = null;
  readonly playbackRate: MockAudioParam = new MockAudioParam(1.0, 0.0, Number.MAX_VALUE);
  readonly detune: MockAudioParam = new MockAudioParam(0, -153600, 153600);
  loop: boolean = false;
  loopStart: number = 0;
  loopEnd: number = 0;

  private _started: boolean = false;
  private _stopped: boolean = false;

  onended: ((this: AudioScheduledSourceNode, ev: Event) => any) | null = null;

  constructor(context: MockAudioContext) {
    super(context, 0, 1);
  }

  start(when?: number, offset?: number, duration?: number): void {
    if (this._started) {
      throw new Error('Cannot call start more than once');
    }
    this._started = true;
    // Simulate ended event after duration
    if (this.onended) {
      setTimeout(() => {
        if (this.onended) {
          this.onended.call(this as any, new Event('ended'));
        }
      }, ((duration || this.buffer?.duration || 0) * 1000));
    }
  }

  stop(when?: number): void {
    if (!this._started) {
      throw new Error('Cannot call stop before start');
    }
    if (this._stopped) {
      throw new Error('Cannot call stop more than once');
    }
    this._stopped = true;
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type === 'ended' && typeof listener === 'function') {
      this.onended = listener as any;
    }
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type === 'ended') {
      this.onended = null;
    }
  }

  dispatchEvent(event: Event): boolean {
    return true;
  }
}

/**
 * Mock GainNode implementation
 */
export class MockGainNode extends MockAudioNode {
  readonly gain: MockAudioParam = new MockAudioParam(1.0, -3.4028235e38, 3.4028235e38);

  constructor(context: MockAudioContext) {
    super(context, 1, 1);
  }
}

/**
 * Mock PannerNode implementation
 */
export class MockPannerNode extends MockAudioNode {
  panningModel: PanningModelType = 'equalpower';
  distanceModel: DistanceModelType = 'inverse';
  refDistance: number = 1;
  maxDistance: number = 10000;
  rolloffFactor: number = 1;
  coneInnerAngle: number = 360;
  coneOuterAngle: number = 360;
  coneOuterGain: number = 0;

  readonly positionX: MockAudioParam = new MockAudioParam(0);
  readonly positionY: MockAudioParam = new MockAudioParam(0);
  readonly positionZ: MockAudioParam = new MockAudioParam(0);
  readonly orientationX: MockAudioParam = new MockAudioParam(1);
  readonly orientationY: MockAudioParam = new MockAudioParam(0);
  readonly orientationZ: MockAudioParam = new MockAudioParam(0);

  constructor(context: MockAudioContext) {
    super(context, 1, 1);
  }

  setPosition(x: number, y: number, z: number): void {
    this.positionX.value = x;
    this.positionY.value = y;
    this.positionZ.value = z;
  }

  setOrientation(x: number, y: number, z: number): void {
    this.orientationX.value = x;
    this.orientationY.value = y;
    this.orientationZ.value = z;
  }
}

/**
 * Mock StereoPannerNode implementation
 */
export class MockStereoPannerNode extends MockAudioNode {
  readonly pan: MockAudioParam = new MockAudioParam(0, -1, 1);

  constructor(context: MockAudioContext) {
    super(context, 1, 1);
  }
}

/**
 * Mock ConvolverNode implementation
 */
export class MockConvolverNode extends MockAudioNode {
  buffer: AudioBuffer | null = null;
  normalize: boolean = true;

  constructor(context: MockAudioContext) {
    super(context, 1, 1);
  }
}

/**
 * Mock DelayNode implementation
 */
export class MockDelayNode extends MockAudioNode {
  readonly delayTime: MockAudioParam;

  constructor(context: MockAudioContext, maxDelayTime: number = 1.0) {
    super(context, 1, 1);
    this.delayTime = new MockAudioParam(0, 0, maxDelayTime);
  }
}

/**
 * Mock BiquadFilterNode implementation
 */
export class MockBiquadFilterNode extends MockAudioNode {
  type: BiquadFilterType = 'lowpass';
  readonly frequency: MockAudioParam = new MockAudioParam(350, 0, 22050);
  readonly detune: MockAudioParam = new MockAudioParam(0, -153600, 153600);
  readonly Q: MockAudioParam = new MockAudioParam(1, 0.0001, 1000);
  readonly gain: MockAudioParam = new MockAudioParam(0, -40, 40);

  constructor(context: MockAudioContext) {
    super(context, 1, 1);
  }

  getFrequencyResponse(
    frequencyHz: Float32Array,
    magResponse: Float32Array,
    phaseResponse: Float32Array
  ): void {
    // Mock implementation - fill with dummy values
    magResponse.fill(1.0);
    phaseResponse.fill(0);
  }
}

/**
 * Mock AnalyserNode implementation
 */
export class MockAnalyserNode extends MockAudioNode {
  fftSize: number = 2048;
  frequencyBinCount: number = 1024;
  minDecibels: number = -100;
  maxDecibels: number = -30;
  smoothingTimeConstant: number = 0.8;

  constructor(context: MockAudioContext) {
    super(context, 1, 1);
  }

  getFloatFrequencyData(array: Float32Array): void {
    array.fill(-Infinity);
  }

  getByteFrequencyData(array: Uint8Array): void {
    array.fill(0);
  }

  getFloatTimeDomainData(array: Float32Array): void {
    array.fill(0);
  }

  getByteTimeDomainData(array: Uint8Array): void {
    array.fill(128);
  }
}

/**
 * Mock DynamicsCompressorNode implementation
 */
export class MockDynamicsCompressorNode extends MockAudioNode {
  readonly threshold: MockAudioParam = new MockAudioParam(-24, -100, 0);
  readonly knee: MockAudioParam = new MockAudioParam(30, 0, 40);
  readonly ratio: MockAudioParam = new MockAudioParam(12, 1, 20);
  readonly reduction: number = 0;
  readonly attack: MockAudioParam = new MockAudioParam(0.003, 0, 1);
  readonly release: MockAudioParam = new MockAudioParam(0.25, 0, 1);

  constructor(context: MockAudioContext) {
    super(context, 1, 1);
  }
}

/**
 * Mock AudioDestinationNode implementation
 */
export class MockAudioDestinationNode extends MockAudioNode {
  readonly maxChannelCount: number = 2;

  constructor(context: MockAudioContext) {
    super(context, 1, 0);
    this.channelCount = 2;
  }
}

/**
 * Mock AudioListener implementation
 */
export class MockAudioListener {
  readonly positionX: MockAudioParam = new MockAudioParam(0);
  readonly positionY: MockAudioParam = new MockAudioParam(0);
  readonly positionZ: MockAudioParam = new MockAudioParam(0);
  readonly forwardX: MockAudioParam = new MockAudioParam(0);
  readonly forwardY: MockAudioParam = new MockAudioParam(0);
  readonly forwardZ: MockAudioParam = new MockAudioParam(-1);
  readonly upX: MockAudioParam = new MockAudioParam(0);
  readonly upY: MockAudioParam = new MockAudioParam(1);
  readonly upZ: MockAudioParam = new MockAudioParam(0);

  setPosition(x: number, y: number, z: number): void {
    this.positionX.value = x;
    this.positionY.value = y;
    this.positionZ.value = z;
  }

  setOrientation(x: number, y: number, z: number, xUp: number, yUp: number, zUp: number): void {
    this.forwardX.value = x;
    this.forwardY.value = y;
    this.forwardZ.value = z;
    this.upX.value = xUp;
    this.upY.value = yUp;
    this.upZ.value = zUp;
  }
}

/**
 * Mock AudioContext implementation
 */
export class MockAudioContext {
  readonly sampleRate: number = 44100;
  readonly destination: MockAudioDestinationNode;
  readonly listener: MockAudioListener;
  state: AudioContextState = 'running';

  private _currentTime: number = 0;
  private _timeUpdateInterval: any = null;

  onstatechange: ((this: BaseAudioContext, ev: Event) => any) | null = null;

  constructor(contextOptions?: AudioContextOptions) {
    if (contextOptions?.sampleRate) {
      (this as any).sampleRate = contextOptions.sampleRate;
    }
    this.destination = new MockAudioDestinationNode(this);
    this.listener = new MockAudioListener();

    // Simulate time progression
    this._timeUpdateInterval = setInterval(() => {
      this._currentTime += 0.01;
    }, 10);
  }

  get currentTime(): number {
    return this._currentTime;
  }

  async suspend(): Promise<void> {
    this.state = 'suspended';
  }

  async resume(): Promise<void> {
    this.state = 'running';
  }

  async close(): Promise<void> {
    this.state = 'closed';
    if (this._timeUpdateInterval) {
      clearInterval(this._timeUpdateInterval);
      this._timeUpdateInterval = null;
    }
  }

  createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBuffer {
    return new MockAudioBuffer(numberOfChannels, length, sampleRate) as any;
  }

  async decodeAudioData(audioData: ArrayBuffer): Promise<AudioBuffer> {
    // Mock: create a simple buffer
    return this.createBuffer(2, this.sampleRate, this.sampleRate);
  }

  createBufferSource(): AudioBufferSourceNode {
    return new MockAudioBufferSourceNode(this) as any;
  }

  createGain(): GainNode {
    return new MockGainNode(this) as any;
  }

  createPanner(): PannerNode {
    return new MockPannerNode(this) as any;
  }

  createStereoPanner(): StereoPannerNode {
    return new MockStereoPannerNode(this) as any;
  }

  createConvolver(): ConvolverNode {
    return new MockConvolverNode(this) as any;
  }

  createDelay(maxDelayTime?: number): DelayNode {
    return new MockDelayNode(this, maxDelayTime) as any;
  }

  createBiquadFilter(): BiquadFilterNode {
    return new MockBiquadFilterNode(this) as any;
  }

  createAnalyser(): AnalyserNode {
    return new MockAnalyserNode(this) as any;
  }

  createDynamicsCompressor(): DynamicsCompressorNode {
    return new MockDynamicsCompressorNode(this) as any;
  }

  // Oscillator, MediaStreamSource, etc. can be added if needed
  createOscillator(): OscillatorNode {
    return {} as any; // Simplified mock
  }

  createChannelMerger(numberOfInputs?: number): ChannelMergerNode {
    return new MockAudioNode(this, numberOfInputs || 6, 1) as any;
  }

  createChannelSplitter(numberOfOutputs?: number): ChannelSplitterNode {
    return new MockAudioNode(this, 1, numberOfOutputs || 6) as any;
  }
}

/**
 * Creates a mock AudioContext for testing
 *
 * @param options - Optional audio context options
 * @returns Mock AudioContext
 *
 * @example
 * ```typescript
 * const audioContext = createMockAudioContext();
 * const gainNode = audioContext.createGain();
 * gainNode.gain.value = 0.5;
 * ```
 */
export function createMockAudioContext(options?: AudioContextOptions): MockAudioContext {
  return new MockAudioContext(options);
}
