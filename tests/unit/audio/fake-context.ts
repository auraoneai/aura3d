/**
 * Fake AudioContext for game-sound unit tests: records node creation order,
 * param calls, and connections. Every factory exists so feature checks all
 * take the "supported" path unless the test deletes one.
 */

import type { SoundGraphContext, SoundNodeLike } from "../../../packages/audio/src/game-sound/types";

export interface FakeParam {
  value: number;
  calls: { method: string; args: number[] }[];
  setTargetAtTime(v: number, t: number, tau: number): void;
  cancelScheduledValues(t: number): void;
  setValueAtTime(v: number, t: number): void;
  linearRampToValueAtTime(v: number, t: number): void;
}

export const fakeParam = (initial = 0): FakeParam => ({
  value: initial,
  calls: [],
  setTargetAtTime(v, t, tau) {
    this.calls.push({ method: "setTargetAtTime", args: [v, t, tau] });
    this.value = v;
  },
  cancelScheduledValues(t) {
    this.calls.push({ method: "cancelScheduledValues", args: [t] });
  },
  setValueAtTime(v, t) {
    this.calls.push({ method: "setValueAtTime", args: [v, t] });
    this.value = v;
  },
  linearRampToValueAtTime(v, t) {
    this.calls.push({ method: "linearRampToValueAtTime", args: [v, t] });
    this.value = v;
  }
});

export class FakeNode implements SoundNodeLike {
  readonly kind: string;
  readonly connectedTo: SoundNodeLike[] = [];
  params: Record<string, FakeParam> = {};
  constructor(kind: string) {
    this.kind = kind;
  }
  connect(d: SoundNodeLike): SoundNodeLike {
    this.connectedTo.push(d);
    return d;
  }
  disconnect(): void {
    this.connectedTo.length = 0;
  }
}

export class FakeSource extends FakeNode {
  buffer: AudioBuffer | null = null;
  loop = false;
  playbackRate = fakeParam(1);
  started: { when: number; offset?: number; duration?: number }[] = [];
  stopped = 0;
  onended: (() => void) | null = null;
  constructor() {
    super("source");
  }
  start(when = 0, offset?: number, duration?: number): void {
    this.started.push({ when, offset, duration });
  }
  stop(): void {
    this.stopped += 1;
    this.onended?.();
  }
}

export class FakeGain extends FakeNode {
  gain = fakeParam(1);
  constructor() {
    super("gain");
  }
}

export class FakeCompressor extends FakeNode {
  threshold = fakeParam(0);
  knee = fakeParam(0);
  ratio = fakeParam(1);
  attack = fakeParam(0);
  release = fakeParam(0);
  reduction = 0;
  constructor() {
    super("compressor");
  }
}

export class FakeShaper extends FakeNode {
  curve: Float32Array | null = null;
  oversample: OverSampleType = "none";
  constructor() {
    super("shaper");
  }
}

export class FakePanner extends FakeNode {
  panningModel: PanningModelType = "equalpower";
  distanceModel: DistanceModelType = "linear";
  refDistance = 1;
  maxDistance = 10_000;
  rolloffFactor = 1;
  positionX = fakeParam(0);
  positionY = fakeParam(0);
  positionZ = fakeParam(0);
  velocity?: [number, number, number];
  constructor() {
    super("panner");
  }
  setPosition(x: number, y: number, z: number): void {
    this.positionX.value = x;
    this.positionY.value = y;
    this.positionZ.value = z;
  }
  setVelocity(x: number, y: number, z: number): void {
    this.velocity = [x, y, z];
  }
}

export class FakeBiquad extends FakeNode {
  type: BiquadFilterType = "lowpass";
  frequency = fakeParam(350);
  Q = fakeParam(1);
  constructor() {
    super("biquad");
  }
}

export class FakeContext implements SoundGraphContext {
  state = "running";
  destination = new FakeNode("destination") as unknown as AudioNode;
  currentTime = 0;
  created: FakeNode[] = [];
  listener?: unknown;

  tick(seconds: number): void {
    this.currentTime += seconds;
  }

  private track<T extends FakeNode>(n: T): T {
    this.created.push(n);
    return n;
  }
  createGain(): GainNode {
    return this.track(new FakeGain()) as unknown as GainNode;
  }
  createBufferSource(): AudioBufferSourceNode {
    return this.track(new FakeSource()) as unknown as AudioBufferSourceNode;
  }
  createPanner(): PannerNode {
    return this.track(new FakePanner()) as unknown as PannerNode;
  }
  createBiquadFilter(): BiquadFilterNode {
    return this.track(new FakeBiquad()) as unknown as BiquadFilterNode;
  }
  createConvolver(): ConvolverNode {
    return this.track(new FakeNode("convolver")) as unknown as ConvolverNode;
  }
  createDynamicsCompressor(): DynamicsCompressorNode {
    return this.track(new FakeCompressor()) as unknown as DynamicsCompressorNode;
  }
  createWaveShaper(): WaveShaperNode {
    return this.track(new FakeShaper()) as unknown as WaveShaperNode;
  }
  decodeAudioData = async (_data: ArrayBuffer): Promise<AudioBuffer> =>
    ({ duration: 0.02, length: 960, sampleRate: 48_000, numberOfChannels: 1 }) as AudioBuffer;
  createMediaElementSource?: (el: HTMLMediaElement) => MediaElementAudioSourceNode;
  resume = async (): Promise<void> => {
    this.state = "running";
  };
  suspend = async (): Promise<void> => {
    this.state = "suspended";
  };
  close = async (): Promise<void> => {
    this.state = "closed";
  };

  ofKind<T = FakeNode>(kind: string): T[] {
    return this.created.filter((n) => n.kind === kind) as unknown as T[];
  }
}
