import type { SynthContext } from "../../../packages/audio/src/synth";

export interface Call { node: string; method: string; args: unknown[] }

class Param {
  value = 0;
  calls: Call[];
  constructor(private readonly name: string, calls: Call[]) { this.calls = calls; }
  setValueAtTime(v: number, t: number) { this.value = v; this.calls.push({ node: this.name, method: "setValueAtTime", args: [v, t] }); return this; }
  exponentialRampToValueAtTime(v: number, t: number) { this.calls.push({ node: this.name, method: "expRamp", args: [v, t] }); return this; }
  setTargetAtTime(v: number, t: number, tc: number) { this.value = v; this.calls.push({ node: this.name, method: "setTarget", args: [v, t, tc] }); return this; }
}

export class FakeNode {
  connections: FakeNode[] = [];
  started: number[] = [];
  stopped: number[] = [];
  type = "";
  buffer: unknown = null;
  loop = false;
  gain: Param;
  frequency: Param;
  detune: Param;
  Q: Param;
  constructor(readonly kind: string, calls: Call[]) {
    this.gain = new Param(`${kind}.gain`, calls);
    this.frequency = new Param(`${kind}.frequency`, calls);
    this.detune = new Param(`${kind}.detune`, calls);
    this.Q = new Param(`${kind}.Q`, calls);
  }
  connect(node: FakeNode) { this.connections.push(node); return node; }
  start(t = 0) { this.started.push(t); }
  stop(t = 0) { this.stopped.push(t); }
}

export function createFakeContext(initialState = "running") {
  const calls: Call[] = [];
  const nodes: FakeNode[] = [];
  const make = (kind: string) => { const n = new FakeNode(kind, calls); nodes.push(n); return n; };
  const ctx = {
    state: initialState,
    currentTime: 0,
    sampleRate: 1000,
    destination: make("destination"),
    resumed: 0,
    async resume() { this.resumed++; this.state = "running"; },
    async suspend() { this.state = "suspended"; },
    async close() { this.state = "closed"; },
    createGain: () => make("gain"),
    createOscillator: () => make("osc"),
    createBiquadFilter: () => make("filter"),
    createBufferSource: () => make("source"),
    createPanner: () => make("panner"),
    createConvolver: () => make("convolver"),
    createBuffer: (_c: number, length: number) => ({ length, getChannelData: () => new Float32Array(length) })
  };
  return { ctx: ctx as unknown as SynthContext & { currentTime: number; state: string; resumed: number }, nodes, calls, ofKind: (k: string) => nodes.filter((n) => n.kind === k) };
}

export class FakeTarget {
  listeners = new Map<string, Array<(e: unknown) => void>>();
  addEventListener(type: string, l: (e: unknown) => void) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), l]); }
  removeEventListener(type: string, l: (e: unknown) => void) { this.listeners.set(type, (this.listeners.get(type) ?? []).filter((x) => x !== l)); }
  emit(type: string, event: unknown = {}) { for (const l of this.listeners.get(type) ?? []) l(event); }
  count() { let n = 0; for (const v of this.listeners.values()) n += v.length; return n; }
}
