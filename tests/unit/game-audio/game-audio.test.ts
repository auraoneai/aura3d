import { describe, expect, it } from "vitest";
import { createGameAudio, type GameAudioContextLike } from "../../../packages/engine/src";

class FakeParam {
  value = 1;
  setValueAtTime(value: number): void {
    this.value = value;
  }
  exponentialRampToValueAtTime(value: number): void {
    this.value = value;
  }
  linearRampToValueAtTime(value: number): void { this.value = value; }
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
  started = false;
  stopped = false;
  start(): void {
    this.started = true;
  }
  stop(): void {
    this.stopped = true;
  }
}

class FakeBufferSource extends FakeAudioNode {
  buffer: AudioBuffer | null = null;
  loop = false;
  onended: (() => void) | null = null;
  started = false;
  start(): void { this.started = true; }
  stop(): void {}
}

class FakeAudioContext implements GameAudioContextLike {
  state = "suspended";
  currentTime = 0;
  readonly destination = new FakeAudioNode() as unknown as AudioNode;
  oscillators: FakeOscillator[] = [];
  bufferSources: FakeBufferSource[] = [];

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
    const oscillator = new FakeOscillator();
    this.oscillators.push(oscillator);
    return oscillator as unknown as OscillatorNode;
  }

  createBufferSource(): AudioBufferSourceNode {
    const source = new FakeBufferSource();
    this.bufferSources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }

  async decodeAudioData(): Promise<AudioBuffer> {
    return { duration: 1, numberOfChannels: 1, sampleRate: 48_000 } as AudioBuffer;
  }
}

describe("createGameAudio", () => {
  it("dispatches cue events, unlocks audio, and records evidence", async () => {
    const context = new FakeAudioContext();
    const events: string[] = [];
    const audio = createGameAudio({
      context,
      buses: [{ id: "combat", volume: 0.8 }],
      cues: {
        hit: { id: "hit", bus: "combat", frequency: 220 },
        ko: { id: "ko", bus: "combat", frequency: 90 }
      }
    });
    audio.onCue((event) => events.push(`${event.cue}:${event.bus}:${event.muted}`));

    await audio.cue("hit");

    expect(context.state).toBe("running");
    expect(context.oscillators).toHaveLength(1);
    expect(events).toEqual(["hit:combat:false"]);
    expect(audio.evidence).toMatchObject({
      kind: "aura-game-audio-evidence",
      enabled: true,
      muted: false,
      unlocked: true,
      cueCount: 2,
      playedCueCount: 1,
      suppressedCueCount: 0,
      lastCue: "hit"
    });
  });

  it("suppresses cues when muted without losing last-cue proof", async () => {
    const context = new FakeAudioContext();
    const audio = createGameAudio({
      context,
      cues: {
        jump: { id: "jump" }
      }
    });

    audio.setMuted(true);
    const event = await audio.cue("jump");

    expect(event.muted).toBe(true);
    expect(context.oscillators).toHaveLength(0);
    expect(audio.evidence).toMatchObject({
      muted: true,
      playedCueCount: 0,
      suppressedCueCount: 1,
      lastCue: "jump"
    });
  });

  it("delegates typed asset fetching, caching, decoding, and playback to the shared audio package", async () => {
    const context = new FakeAudioContext();
    const audio = createGameAudio({
      context,
      cues: { hit: { id: "hit", asset: "data:audio/wav;base64,AA==", volume: 0.25 } }
    });
    await audio.cue("hit");
    await audio.cue("hit");
    expect(context.bufferSources).toHaveLength(2);
    expect(context.bufferSources.every((source) => source.started)).toBe(true);
    expect(audio.evidence.playedCueCount).toBe(2);
    await audio.dispose();
    expect(context.state).toBe("closed");
  });
});
