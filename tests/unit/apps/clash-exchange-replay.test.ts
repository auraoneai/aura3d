import { describe, expect, it } from "vitest";
import {
  EXCHANGE_REPLAY_SCRUB_STEP_SECONDS,
  clampScrubOffset,
  createExchangeReplayRecorder,
  stepScrubOffset,
  type ExchangeReplaySample
} from "../../../apps/aura-clash-showcase/src/playable/training/ExchangeReplay";
import { createFightHudReplayControlsModel } from "../../../apps/aura-clash-showcase/src/ui/FightHud";
import { readPlayableHudMode } from "../../../apps/aura-clash-showcase/src/playable/combat/clashFeel";

function sample(overrides: Partial<ExchangeReplaySample> = {}): ExchangeReplaySample {
  return {
    frame: 0,
    time: 0,
    playerX: -1.25,
    rivalX: 1.25,
    playerHp: 360,
    rivalHp: 360,
    activeAttack: null,
    ...overrides
  };
}

/** Deterministic damage script: heavy connects every 30 frames from frame 40. */
function scriptedTimeline(frames: number): ExchangeReplaySample[] {
  let rivalHp = 360;
  const rows: ExchangeReplaySample[] = [];
  for (let index = 0; index < frames; index += 1) {
    if (index >= 40 && (index - 40) % 30 === 0) rivalHp -= 10;
    rows.push(sample({
      frame: index,
      time: Number((index / 60).toFixed(4)),
      rivalHp,
      playerHp: 360 - Math.floor(index / 90) * 6,
      activeAttack: (index - 38) % 30 === 0 && index >= 38 ? "heavy" : null
    }));
  }
  return rows;
}

describe("AC-A2 exchange replay recorder", () => {
  it("keeps exactly the last window of history at route cadence", () => {
    const recorder = createExchangeReplayRecorder();
    expect(recorder.windowSeconds).toBe(6);
    expect(recorder.fps).toBe(60);
    expect(recorder.capacity).toBe(360);
    const rows = scriptedTimeline(400);
    for (const row of rows) recorder.push(row);
    expect(recorder.size()).toBe(360);
    // The retained window is the *tail* of the script, byte-identical.
    const timeline = recorder.timeline();
    expect(timeline[0]!.frame).toBe(40);
    expect(timeline[timeline.length - 1]!.frame).toBe(399);
  });

  it("reproduces the recorded HP timeline identically on read-back", () => {
    const recorder = createExchangeReplayRecorder();
    const rows = scriptedTimeline(360);
    for (const row of rows) recorder.push(row);
    const timeline = recorder.timeline();
    expect(timeline.map((row) => row.rivalHp)).toEqual(rows.map((row) => row.rivalHp));
    expect(timeline.map((row) => row.playerHp)).toEqual(rows.map((row) => row.playerHp));
    // Round-trip is value-identical, not just equal-length.
    expect(JSON.stringify(timeline)).toBe(JSON.stringify(rows));
  });

  it("scrubs to the exact recorded state offsetSeconds back from live", () => {
    const recorder = createExchangeReplayRecorder();
    for (const row of scriptedTimeline(360)) recorder.push(row);
    const scrubbed = recorder.sampleAtOffsetSeconds(-0.5);
    expect(scrubbed).not.toBeNull();
    // 0.5s before frame 359 is frame ~329; the sample returned is what was recorded then.
    expect(scrubbed!.frame).toBeLessThanOrEqual(329);
    expect(scrubbed!.frame).toBeGreaterThan(320);
    const expected = rowsAt(scrubbed!.frame);
    expect(scrubbed!.rivalHp).toBe(expected.rivalHp);
    expect(scrubbed!.playerHp).toBe(expected.playerHp);
    // Clamped past the start of the recording instead of returning garbage.
    const oldest = recorder.sampleAtOffsetSeconds(-999);
    expect(oldest!.frame).toBe(0);
  });

  function rowsAt(frame: number): ExchangeReplaySample {
    return scriptedTimeline(frame + 1)[frame]!;
  }

  it("clamps scrub offsets into [-buffered, 0] and steps by a fixed increment", () => {
    expect(clampScrubOffset(0.5, 3)).toBe(0);
    expect(clampScrubOffset(-10, 3)).toBe(-3);
    expect(clampScrubOffset(Number.NaN, 3)).toBe(-3);
    expect(EXCHANGE_REPLAY_SCRUB_STEP_SECONDS).toBeCloseTo(0.25, 6);
    expect(stepScrubOffset(-0.5, -1, 3)).toBeCloseTo(-0.75, 6);
    expect(stepScrubOffset(-2.9, -1, 3)).toBe(-3);
    expect(stepScrubOffset(-0.1, 1, 3)).toBe(0);
  });

  it("hides the replay strip outside debug/training mode and shows it inside", () => {
    // Debug-toggle law: the public playable path is not training mode.
    expect(readPlayableHudMode({ pathname: "/playable/", search: "" }).training).toBe(false);
    const hidden = createFightHudReplayControlsModel({ training: false, scrubOffsetSeconds: -1, bufferedSeconds: 5 });
    expect(hidden.visible).toBe(false);
    expect(hidden.scrubLabel).toBeNull();
    const live = createFightHudReplayControlsModel({ training: true, scrubOffsetSeconds: 0, bufferedSeconds: 5 });
    expect(live.visible).toBe(true);
    expect(live.hint).toContain("[ / ]");
    expect(live.scrubLabel).toBeNull();
    const scrubbing = createFightHudReplayControlsModel({ training: true, scrubOffsetSeconds: -0.75, bufferedSeconds: 5 });
    expect(scrubbing.scrubLabel).toContain("0.75");
  });
});
