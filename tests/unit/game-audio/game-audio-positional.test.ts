import { describe, expect, it } from "vitest";
// Deep import: the engine barrel is currently broken by a sibling phase's
// in-progress `SpotShadowMaps.ts` (missing `./ShadowMap`); this module has no
// rendering dependency, matching the precedent in touch-control-binding.test.ts.
import { createGameAudio, type GameAudioContextLike } from "../../../packages/engine/src/game/GameAudio";

class FakeParam {
  value = 1;
  setValueAtTime(value: number): void {
    this.value = value;
  }
  exponentialRampToValueAtTime(value: number): void {
    this.value = value;
  }
  linearRampToValueAtTime(value: number): void {
    this.value = value;
  }
  cancelScheduledValues(): void {}
}

class FakeAudioNode {
  connect(): this {
    return this;
  }
  disconnect(): void {}
}

class FakeGain extends FakeAudioNode {
  readonly gain = new FakeParam();
}

class FakeOscillator extends FakeAudioNode {
  type: OscillatorType = "sine";
  readonly frequency = new FakeParam();
  start(): void {}
  stop(): void {}
}

class FakeAudioContext implements GameAudioContextLike {
  state = "suspended";
  currentTime = 0;
  readonly destination = new FakeGain() as unknown as AudioNode;
  async resume(): Promise<void> {
    this.state = "running";
  }
  async close(): Promise<void> {
    this.state = "closed";
  }
  createGain(): GainNode {
    return new FakeGain() as unknown as GainNode;
  }
  createOscillator(): OscillatorNode {
    return new FakeOscillator() as unknown as OscillatorNode;
  }
}

function createCues() {
  return {
    blip: { id: "blip" as const, frequency: 220 },
    stepGrass: { id: "stepGrass" as const, frequency: 140 },
    stepStone: { id: "stepStone" as const, frequency: 180 }
  };
}

describe("game audio positional evidence (I1)", () => {
  it("playPositional records node position, attenuation, doppler, and occlusion", async () => {
    const audio = createGameAudio({ context: new FakeAudioContext(), cues: createCues() });
    audio.setListenerPosition({ x: 0, y: 0, z: 0 });
    await audio.playPositional("blip", { x: 3, y: 0, z: 0 }, { velocity: { x: -34.3, y: 0, z: 0 }, occlusion: 0.5 });

    const evidence = audio.evidence;
    expect(evidence.playingNodes).toHaveLength(1);
    expect(evidence.playingNodes[0]).toMatchObject({
      cue: "blip",
      position: { x: 3, y: 0, z: 0 },
      occlusion: 0.5
    });
    expect(evidence.playingNodes[0]?.attenuationGain).toBeCloseTo(1 / 3, 9);
    expect(evidence.playingNodes[0]?.dopplerShift ?? 0).toBeGreaterThan(1);
    expect(evidence.playedCueCount).toBe(1);
  });

  it("listener distance drives attenuation and suppressed cues leave no nodes", async () => {
    const audio = createGameAudio({ context: new FakeAudioContext(), cues: createCues() });
    await audio.playPositional("blip", { x: 1, y: 0, z: 0 });
    audio.setListenerPosition({ x: 0, y: 0, z: 0 });
    await audio.playPositional("blip", { x: 9, y: 0, z: 0 });
    const [near, far] = audio.evidence.playingNodes;
    expect(near?.attenuationGain).toBe(1);
    expect(far?.attenuationGain).toBeCloseTo(1 / 9, 9);

    audio.setMuted(true);
    await audio.playPositional("blip", { x: 1, y: 0, z: 0 });
    expect(audio.evidence.playingNodes).toHaveLength(2);
    expect(audio.evidence.suppressedCueCount).toBe(1);
    expect(audio.evidence.busLevels[0]?.level).toBe(0);
  });

  it("setOcclusion updates playing nodes and rejects out-of-range amounts", async () => {
    const audio = createGameAudio({ context: new FakeAudioContext(), cues: createCues() });
    await audio.playPositional("blip", { x: 2, y: 0, z: 0 });
    audio.setOcclusion("blip", 0.75);
    expect(audio.evidence.playingNodes[0]?.occlusion).toBe(0.75);
    expect(() => audio.setOcclusion("blip", 2)).toThrow(RangeError);
    expect(() => audio.setListenerPosition({ x: Number.NaN, y: 0, z: 0 })).toThrow(/finite/);
  });

  it("dialogue ducking scales the music bus and restores it", async () => {
    const audio = createGameAudio({
      context: new FakeAudioContext(),
      buses: [{ id: "music", volume: 0.8 }],
      cues: createCues(),
      ducking: { musicBus: "music", ratio: 0.5 }
    });
    audio.setDialogueActive(true);
    let evidence = audio.evidence;
    expect(evidence.duckingActive).toBe(true);
    expect(evidence.busLevels.find((bus) => bus.id === "music")?.volume).toBeCloseTo(0.4, 9);

    audio.setBusVolume("music", 0.6);
    expect(audio.evidence.busLevels.find((bus) => bus.id === "music")?.volume).toBeCloseTo(0.3, 9);

    audio.setDialogueActive(false);
    evidence = audio.evidence;
    expect(evidence.duckingActive).toBe(false);
    expect(evidence.busLevels.find((bus) => bus.id === "music")?.volume).toBeCloseTo(0.6, 9);
  });

  it("foot plants route to surface cues at the plant position", async () => {
    const audio = createGameAudio({
      context: new FakeAudioContext(),
      cues: createCues(),
      footsteps: { surfaces: { grass: ["stepGrass", "stepStone"] }, fallback: "blip" }
    });
    const event = await audio.onFootPlant({ foot: "left", surface: "grass", position: { x: 1, y: 0, z: 2 } });
    expect(event?.cue).toBe("stepGrass");
    const fallback = await audio.onFootPlant({ foot: "right", surface: "metal" });
    expect(fallback?.cue).toBe("blip");
    expect(audio.evidence.footplants).toBe(2);
    expect(audio.evidence.playingNodes.map((node) => node.cue)).toEqual(["stepGrass", "blip"]);
    expect(audio.evidence.playingNodes[0]?.position).toEqual({ x: 1, y: 0, z: 2 });
  });

  it("foot plants without configuration return null and unknown cues throw at setup", async () => {
    const bare = createGameAudio({ context: new FakeAudioContext(), cues: createCues() });
    expect(await bare.onFootPlant({ foot: "left", surface: "grass" })).toBeNull();

    expect(() => createGameAudio({ context: new FakeAudioContext(), cues: createCues(), ducking: { ratio: 7 } })).toThrow(
      /ducking ratio/
    );
    expect(() =>
      createGameAudio({
        context: new FakeAudioContext(),
        cues: createCues(),
        footsteps: { surfaces: { grass: ["nope" as never] } }
      })
    ).toThrow(/Unknown game audio cue/);
  });
});


