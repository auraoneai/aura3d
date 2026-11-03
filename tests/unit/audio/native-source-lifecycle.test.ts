import { describe, expect, it } from "vitest";
import { AudioClip } from "../../../packages/audio/src/AudioClip";
import type { AudioContextLike } from "../../../packages/audio/src/AudioContextManager";
import { AudioSource } from "../../../packages/audio/src/AudioSource";

type GainEvent = { kind: "set" | "ramp"; time: number; value: number };

// Models the relevant part of an AudioParam timeline. A `.value` assignment
// does not erase already scheduled events.
class TimelineParam {
  value = 1;
  events: GainEvent[] = [];

  cancelScheduledValues(time: number): void {
    this.events = this.events.filter((event) => event.time < time);
  }

  setValueAtTime(value: number, time: number): void {
    this.events.push({ kind: "set", time, value });
  }

  linearRampToValueAtTime(value: number, time: number): void {
    this.events.push({ kind: "ramp", time, value });
  }

  sample(time: number): number {
    let lastTime = 0;
    let lastValue = this.value;
    for (const event of this.events) {
      if (time < event.time) {
        if (event.kind === "ramp") {
          return lastValue + (event.value - lastValue) * ((time - lastTime) / (event.time - lastTime));
        }
        break;
      }
      lastTime = event.time;
      lastValue = event.value;
    }
    return lastValue;
  }
}

type RateEvent =
  | { kind: "set"; time: number; value: number }
  | { kind: "target"; time: number; value: number; timeConstant: number };

class RateTimelineParam {
  value = 1;
  private events: RateEvent[] = [];

  cancelScheduledValues(time: number): void {
    this.events = this.events.filter((event) => event.time < time);
  }
  setValueAtTime(value: number, time: number): void {
    this.events.push({ kind: "set", time, value });
  }
  setTargetAtTime(value: number, time: number, timeConstant: number): void {
    this.events.push({ kind: "target", time, value, timeConstant });
  }
  sample(time: number): number {
    let current = this.value;
    let lastTime = 0;
    let target: { value: number; timeConstant: number } | undefined;
    const advance = (nextTime: number) => {
      if (target) current = target.value + (current - target.value) * Math.exp(-(nextTime - lastTime) / target.timeConstant);
      lastTime = nextTime;
    };
    for (const event of this.events) {
      if (event.time > time) break;
      advance(event.time);
      if (event.kind === "set") {
        current = event.value;
        target = undefined;
      } else {
        target = { value: event.value, timeConstant: event.timeConstant };
      }
    }
    advance(time);
    return current;
  }
}

class BufferNode {
  buffer: AudioBuffer | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  playbackRate = { value: 1 };
  detune = { value: 0 };
  onended: (() => void) | null = null;
  connected = false;
  stopped = false;
  startArgs?: [number, number, number?];
  startError?: Error;
  stopError?: Error;

  connect(): void { this.connected = true; }
  disconnect(): void { this.connected = false; }
  start(when: number, offset: number, duration?: number): void {
    if (this.startError) throw this.startError;
    this.startArgs = [when, offset, duration];
  }
  stop(): void {
    if (this.stopError) throw this.stopError;
    this.stopped = true;
  }
}

class Gain {
  readonly gain = new TimelineParam();
  connected = false;
  connect(): void { this.connected = true; }
  disconnect(): void { this.connected = false; }
}

function setup() {
  const gains: Gain[] = [];
  const nodes: BufferNode[] = [];
  const context = {
    state: "running",
    currentTime: 0,
    destination: {} as AudioNode,
    nextStartError: undefined as Error | undefined,
    nextRateParam: undefined as RateTimelineParam | undefined,
    createGain() {
      const gain = new Gain();
      gains.push(gain);
      return gain as unknown as GainNode;
    },
    createBufferSource() {
      const node = new BufferNode();
      node.startError = this.nextStartError;
      this.nextStartError = undefined;
      if (this.nextRateParam) {
        node.playbackRate = this.nextRateParam;
        this.nextRateParam = undefined;
      }
      nodes.push(node);
      return node as unknown as AudioBufferSourceNode;
    }
  };
  const clip = new AudioClip({ buffer: { duration: 20, numberOfChannels: 1, sampleRate: 48_000 } as AudioBuffer });
  return { context, gains, nodes, clip, asContext: context as unknown as AudioContextLike };
}

describe("AudioSource gain and failed-start lifecycle", () => {
  it("makes an immediate volume change override a running fade", () => {
    const { context, gains, clip, asContext } = setup();
    const source = new AudioSource({ context: asContext, clip });
    source.fade(1, 0, 10);
    expect(gains[0].gain.sample(4)).toBeCloseTo(0.6);
    context.currentTime = 5;
    source.setVolume(0.25);
    expect(gains[0].gain.sample(5)).toBe(0.25);
    expect(gains[0].gain.sample(8)).toBe(0.25);
    source.dispose();
  });

  it("replaces a previous rate timeline for successive immediate changes", () => {
    const { context, clip, asContext } = setup();
    const rate = new RateTimelineParam();
    context.nextRateParam = rate;
    const source = new AudioSource({ context: asContext, clip });
    source.play();
    source.setPlaybackRate(3, 3000);
    context.currentTime = 1;
    source.setPlaybackRate(4);
    context.currentTime = 2;
    source.setPlaybackRate(2);
    context.currentTime = 3;
    expect(rate.sample(3)).toBeCloseTo(2);
    expect(source.positionSeconds).toBeCloseTo(3 - 2 * (1 - Math.exp(-1)) + 4 + 2);
    source.dispose();
  });

  it("rejects invalid constructor volume before allocating an owned gain", () => {
    const { gains, asContext } = setup();
    for (const volume of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => new AudioSource({ context: asContext, volume })).toThrow(/volume/);
    }
    expect(gains).toHaveLength(0);
  });

  it("cleans a failed sprite start and does not apply its offset or duration to the next play", () => {
    const { context, nodes, clip, asContext } = setup();
    const source = new AudioSource({ context: asContext, clip });
    source.play();
    context.currentTime = 2;
    const failure = new Error("start failed");
    context.nextStartError = failure;
    expect(() => source.playSprite(8, 4)).toThrow(failure);
    expect(nodes[0].stopped).toBe(true);
    expect(nodes[1].connected).toBe(false);
    expect(source.state).toBe("stopped");
    expect(source.positionSeconds).toBe(0);
    source.play();
    expect(nodes[2].startArgs).toEqual([0, 0, undefined]);
    source.dispose();
  });

  it("does not restore a paused offset after a replacement sprite fails to start", () => {
    const { context, nodes, clip, asContext } = setup();
    const source = new AudioSource({ context: asContext, clip });
    source.play();
    context.currentTime = 3;
    source.pause();
    expect(source.positionSeconds).toBe(3);
    context.nextStartError = new Error("start failed");
    expect(() => source.playSprite(8, 4)).toThrow("start failed");
    expect(source.state).toBe("stopped");
    expect(source.positionSeconds).toBe(0);
    source.play();
    expect(nodes[2].startArgs).toEqual([0, 0, undefined]);
    source.dispose();
  });

  it("disconnects its owned gain and becomes disposed even if a node stop fails", () => {
    const { nodes, gains, clip, asContext } = setup();
    const source = new AudioSource({ context: asContext, clip });
    source.play();
    nodes[0].stopError = new Error("stop failed");
    expect(() => source.dispose()).toThrow("stop failed");
    expect(nodes[0].connected).toBe(false);
    expect(gains[0].connected).toBe(false);
    expect(source.state).toBe("stopped");
    expect(() => source.play()).toThrow(/disposed/);
    expect(() => source.dispose()).not.toThrow();
  });

  it("retains only accepted scheduled-stop times when a native stop call fails", () => {
    const { context, nodes, clip, asContext } = setup();
    const source = new AudioSource({ context: asContext, clip });
    source.play();
    context.currentTime = 1;
    nodes[0].stopError = new Error("schedule failed");
    expect(() => source.stop(4)).toThrow("schedule failed");
    context.currentTime = 5;
    expect(source.positionSeconds).toBe(5);
    nodes[0].stopError = undefined;
    source.stop(8);
    nodes[0].stopError = new Error("replacement failed");
    expect(() => source.stop(6)).toThrow("replacement failed");
    context.currentTime = 9;
    expect(source.positionSeconds).toBe(8);
    expect(source.state).toBe("playing");
    nodes[0].stopError = undefined;
    source.dispose();
  });
});
