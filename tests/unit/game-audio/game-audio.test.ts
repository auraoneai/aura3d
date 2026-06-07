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

class FakeAudioContext implements GameAudioContextLike {
  state = "suspended";
  currentTime = 0;
  readonly destination = new FakeAudioNode() as unknown as AudioNode;
  oscillators: FakeOscillator[] = [];

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
});
