// Q-09-6 (#213): GameAudio.setListener carries the full C-25 listener pose, so
// spatial audio follows camera orientation (setListenerPosition used to send a
// hard-coded forward/up). bindFeelSound prefers setListener when present.
import { describe, expect, it } from "vitest";
import { createGameAudio, type GameAudioContextLike } from "../../../../packages/engine/src/game/GameAudio";

class Param {
  value = 0;
}

class FakeNode {
  connect(): this {
    return this;
  }
  disconnect(): void {}
}

class FakeGain extends FakeNode {
  readonly gain = { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} };
}

/** AudioParam-style listener (no setTargetAtTime, so syncListener writes .value). */
function fakeListener() {
  return {
    positionX: new Param(), positionY: new Param(), positionZ: new Param(),
    forwardX: new Param(), forwardY: new Param(), forwardZ: new Param(),
    upX: new Param(), upY: new Param(), upZ: new Param()
  };
}

class FakeAudioContext implements GameAudioContextLike {
  state = "running";
  currentTime = 0;
  readonly listener = fakeListener();
  readonly destination = new FakeGain() as unknown as AudioNode;
  async resume(): Promise<void> {}
  async close(): Promise<void> {}
  createGain(): GainNode {
    return new FakeGain() as unknown as GainNode;
  }
  createDynamicsCompressor(): DynamicsCompressorNode {
    const p = () => ({ value: 0, setValueAtTime() {} });
    return Object.assign(new FakeNode(), { threshold: p(), knee: p(), ratio: p(), attack: p(), release: p(), reduction: 0 }) as unknown as DynamicsCompressorNode;
  }
  createWaveShaper(): WaveShaperNode {
    return Object.assign(new FakeNode(), { curve: null, oversample: "none" }) as unknown as WaveShaperNode;
  }
}

const read = (l: ReturnType<typeof fakeListener>) => ({
  position: [l.positionX.value, l.positionY.value, l.positionZ.value],
  forward: [l.forwardX.value, l.forwardY.value, l.forwardZ.value],
  up: [l.upX.value, l.upY.value, l.upZ.value]
});

const cues = { blip: { id: "blip" as const, play: () => {} } };

describe("GameAudio.setListener (Q-09-6, #213)", () => {
  it("forwards position, forward and up to the engine listener", async () => {
    const context = new FakeAudioContext();
    const audio = createGameAudio({ context, cues });
    await audio.unlock();
    const ev = audio.setListener({ position: [1, 2, 3], forward: [1, 0, 0], up: [0, 0, 1] });
    expect(read(context.listener)).toEqual({ position: [1, 2, 3], forward: [1, 0, 0], up: [0, 0, 1] });
    expect(ev.listenerPosition).toEqual({ x: 1, y: 2, z: 3 });
  });

  it("setListenerPosition keeps the last orientation instead of resetting it", async () => {
    const context = new FakeAudioContext();
    const audio = createGameAudio({ context, cues });
    await audio.unlock();
    audio.setListener({ position: [0, 0, 0], forward: [0, 0, 1], up: [0, 1, 0] });
    audio.setListenerPosition({ x: 5, y: 0, z: -2 });
    expect(read(context.listener)).toEqual({ position: [5, 0, -2], forward: [0, 0, 1], up: [0, 1, 0] });
  });

  it("defaults to forward -Z / up +Y before any pose is set", async () => {
    const context = new FakeAudioContext();
    const audio = createGameAudio({ context, cues });
    await audio.unlock();
    audio.setListenerPosition({ x: 0, y: 1, z: 0 });
    expect(read(context.listener).forward).toEqual([0, 0, -1]);
    expect(read(context.listener).up).toEqual([0, 1, 0]);
  });

  it("rejects non-finite or zero-length orientation", () => {
    const audio = createGameAudio({ context: new FakeAudioContext(), cues });
    expect(() => audio.setListener({ position: [0, 0, 0], forward: [0, 0, 0], up: [0, 1, 0] })).toThrow(/forward must be non-zero/);
    expect(() => audio.setListener({ position: [0, Number.NaN, 0], forward: [0, 0, -1], up: [0, 1, 0] })).toThrow(/position must be three finite/);
  });
});
