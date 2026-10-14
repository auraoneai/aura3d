import { describe, expect, it } from "vitest";
import {
  AudioContextManager,
  AudioMixer,
  AudioSystem,
  FilterEffect,
  ReverbEffect,
  type AudioContextLike
} from "../../../packages/audio/src";
import { createGameAudio, type GameAudioContextLike } from "../../../packages/engine/src";

/**
 * WS-3.2 — characterize BOTH audio layers before choosing a survivor. Same standard as WS-3.1.
 *
 * The PRD frames this as duplicate ownership: `packages/audio` (2,205 lines) versus
 * `packages/engine/src/game/GameAudio.ts`, which calls `createGain` itself. These tests establish what each
 * one actually promises, so a consolidation cannot quietly drop a behaviour — and so the survivor decision
 * comes from measured capability rather than from line count.
 */

/* ------------------------------------------------------------------------------------------- */
/* A Web Audio fake, shared by both suites so neither gets an easier substrate                  */
/* ------------------------------------------------------------------------------------------- */

class FakeParam {
  value = 1;
  setValueAtTime(value: number): this {
    this.value = value;
    return this;
  }
  linearRampToValueAtTime(value: number): this {
    this.value = value;
    return this;
  }
  exponentialRampToValueAtTime(value: number): this {
    this.value = value;
    return this;
  }
}

class FakeNode {
  connected: FakeNode[] = [];
  disconnectCount = 0;
  connect(destination: FakeNode): FakeNode {
    this.connected.push(destination);
    return destination;
  }
  disconnect(): void {
    this.disconnectCount += 1;
    this.connected = [];
  }
}

class FakeGain extends FakeNode {
  readonly gain = new FakeParam();
}

class FakeBiquad extends FakeNode {
  type: BiquadFilterType = "lowpass";
  readonly frequency = new FakeParam();
  readonly Q = new FakeParam();
}

class FakeConvolver extends FakeNode {
  buffer: AudioBuffer | null = null;
}

class FakeContext {
  state = "suspended";
  currentTime = 0;
  readonly destination = new FakeNode();
  resumeCount = 0;
  suspendCount = 0;
  closeCount = 0;
  readonly gains: FakeGain[] = [];
  async resume(): Promise<void> {
    this.resumeCount += 1;
    this.state = "running";
  }
  async suspend(): Promise<void> {
    this.suspendCount += 1;
    this.state = "suspended";
  }
  async close(): Promise<void> {
    this.closeCount += 1;
    this.state = "closed";
  }
  createGain(): FakeGain {
    const gain = new FakeGain();
    this.gains.push(gain);
    return gain;
  }
  createBufferSource(): FakeNode {
    return new FakeNode();
  }
  createPanner(): FakeNode {
    return new FakeNode();
  }
  createBiquadFilter(): FakeBiquad {
    return new FakeBiquad();
  }
  createConvolver(): FakeConvolver {
    return new FakeConvolver();
  }
}

function audioContext(): AudioContextLike & FakeContext {
  return new FakeContext() as unknown as AudioContextLike & FakeContext;
}

describe("audio characterization: packages/audio", () => {
  it("owns a single AudioContext and reports lifecycle state transitions", () => {
    const context = audioContext();
    const manager = new AudioContextManager({ context });
    // "locked" is a synthesised state: a suspended context that has never been unlocked by a gesture.
    expect(manager.state).toBe("locked");
    expect(manager.context, "the manager hands back the same context, never a second one").toBe(context);
  });

  it("unlock/suspend/resume drive the underlying context exactly once each", async () => {
    const context = audioContext();
    const manager = new AudioContextManager({ context });
    await manager.unlock();
    expect(context.resumeCount).toBe(1);
    expect(manager.state).toBe("running");
    await manager.suspend();
    expect(context.suspendCount).toBe(1);
    await manager.resume();
    expect(context.resumeCount).toBe(2);
    await manager.dispose();
    expect(context.closeCount, "dispose closes the context rather than leaking it").toBe(1);
    expect(manager.state).toBe("closed");
  });

  it("creates the mixer lazily and reuses it, so a scene does not accumulate graphs", () => {
    const system = new AudioSystem({ context: audioContext() });
    const first = system.mixer;
    expect(system.mixer, "mixer identity is stable").toBe(first);
    expect(first).toBeInstanceOf(AudioMixer);
  });

  it("disposes the mixer and the context together", async () => {
    const context = audioContext();
    const system = new AudioSystem({ context });
    void system.mixer;
    await system.dispose();
    expect(context.closeCount).toBe(1);
  });
});

describe("audio characterization: packages/audio effects (the WS-3.2 keep/delete question)", () => {
  it("FilterEffect validates its inputs — behaviour a raw BiquadFilterNode does not have", () => {
    /*
     * This is the measurement the PRD's inspection rests on. "Web Audio already provides createBiquadFilter"
     * is true and is not sufficient grounds for deletion: a raw node silently accepts NaN and negative
     * frequencies, producing a filter that does nothing with no error. These 39 lines turn that into a
     * throw at the call site.
     */
    const filter = new FilterEffect(audioContext(), "highpass");
    expect(filter.input.type).toBe("highpass");
    filter.setFrequency(880);
    expect(filter.input.frequency.value).toBe(880);
    expect(() => filter.setFrequency(0), "zero is not a frequency").toThrow(/positive/);
    expect(() => filter.setFrequency(Number.NaN)).toThrow(/positive/);
    expect(() => filter.setFrequency(-100)).toThrow(/positive/);
    filter.setQ(0);
    expect(() => filter.setQ(-1), "Q may be zero but not negative").toThrow(/non-negative/);
    expect(() => filter.setQ(Number.POSITIVE_INFINITY)).toThrow(/non-negative/);
  });

  it("ReverbEffect nulls its buffer on dispose, releasing the impulse response", () => {
    /*
     * The disposal discipline, and it is not cosmetic: an impulse response is typically the largest single
     * buffer in an audio graph. Dropping the effect without nulling `buffer` keeps it reachable.
     */
    const reverb = new ReverbEffect(audioContext());
    const impulse = { length: 48_000 } as unknown as AudioBuffer;
    reverb.setImpulse(impulse);
    expect(reverb.input.buffer).toBe(impulse);
    reverb.dispose();
    expect(reverb.input.buffer, "dispose must release the impulse response").toBeNull();
  });

  it("both conform to one AudioEffect interface, so a chain can hold either", () => {
    const context = audioContext();
    const effects = [new FilterEffect(context), new ReverbEffect(context)];
    for (const effect of effects) {
      expect(effect.input).toBeTruthy();
      expect(effect.output).toBeTruthy();
      expect(typeof effect.connect).toBe("function");
      expect(typeof effect.disconnect).toBe("function");
      expect(typeof effect.dispose).toBe("function");
    }
    // Interface conformance is the point: a heterogeneous chain is only possible because of it.
    const destination = new FakeNode();
    effects[0]!.connect(destination as unknown as AudioNode);
    expect((effects[0]!.input as unknown as FakeNode).connected).toContain(destination);
  });
});

describe("audio characterization: engine GameAudio", () => {
  function gameContext(): GameAudioContextLike & FakeContext {
    return new FakeContext() as unknown as GameAudioContextLike & FakeContext;
  }

  it("is cue-driven and evidence-producing, which packages/audio is not", () => {
    /*
     * The structural difference. `packages/audio` is a *graph* API — contexts, mixers, buses, effects.
     * `GameAudio` is a *cue* API: a route declares named cues and buses, and every operation returns
     * evidence describing what happened. That evidence is what the route-health harnesses consume.
     */
    const audio = createGameAudio({
      context: gameContext(),
      cues: {
        jump: { id: "jump", bus: "sfx" },
        music: { id: "music", bus: "music" }
      }
    });
    expect(audio.evidence.kind).toBeTruthy();
    expect(typeof audio.cue).toBe("function");
    expect(typeof audio.onCue).toBe("function");
    expect(typeof audio.setBusVolume).toBe("function");
  });

  it("requires an explicit unlock, matching browser autoplay policy", async () => {
    const audio = createGameAudio({ context: gameContext(), cues: { jump: { id: "jump", bus: "sfx" } } });
    const evidence = await audio.unlock();
    expect(evidence).toBeTruthy();
    await audio.dispose();
  });

  it("reports cue playback through a subscribable callback", async () => {
    const seen: string[] = [];
    const audio = createGameAudio({ context: gameContext(), cues: { jump: { id: "jump", bus: "sfx" } } });
    audio.onCue((event) => seen.push(event.cue));
    await audio.unlock();
    await audio.cue("jump");
    expect(seen, "a cue must be observable, because route evidence depends on it").toContain("jump");
    await audio.dispose();
  });

  it("mute and per-bus volume return evidence rather than void", async () => {
    const audio = createGameAudio({ context: gameContext(), cues: { jump: { id: "jump", bus: "sfx" } } });
    const muted = audio.setMuted(true);
    expect(muted).toBeTruthy();
    const volume = audio.setBusVolume("sfx", 0.25);
    expect(volume).toBeTruthy();
    await audio.dispose();
  });
});

/**
 * The comparison, asserted so it cannot drift — WS-3.2 step 2's evidence.
 */
describe("audio capability comparison (WS-3.2 step 2 evidence)", () => {
  it("the two layers expose disjoint concepts, not competing implementations of one", () => {
    const system = new AudioSystem({ context: audioContext() }) as unknown as Record<string, unknown>;
    const audio = createGameAudio({
      context: new FakeContext() as unknown as GameAudioContextLike,
      cues: { jump: { id: "jump", bus: "sfx" } }
    }) as unknown as Record<string, unknown>;

    // `packages/audio` owns the graph: context lifecycle and a mixer.
    for (const capability of ["contextManager", "mixer", "unlock", "suspend", "resume", "dispose"]) {
      expect(system[capability], `packages/audio must own ${capability}`).toBeDefined();
    }
    expect(system.cue, "packages/audio has no cue concept").toBeUndefined();
    expect(system.evidence, "packages/audio produces no route evidence").toBeUndefined();

    // `GameAudio` owns cues and evidence, and deliberately exposes no graph.
    for (const capability of ["cue", "onCue", "evidence", "setBusVolume", "setMuted"]) {
      expect(audio[capability], `GameAudio must own ${capability}`).toBeDefined();
    }
    expect(audio.mixer, "GameAudio exposes no mixer").toBeUndefined();
    expect(audio.suspend, "GameAudio exposes no context lifecycle beyond unlock/dispose").toBeUndefined();
  });
});
