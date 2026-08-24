/**
 * SR-A1 speedrun ghost unit contract.
 *
 * The hardest property is the export -> import round trip: serializing a
 * recording, parsing it back, and replaying BOTH must reproduce the identical
 * x-timeline hash. Isolation properties prove the echo can never touch a live
 * kit instance.
 */
import { describe, expect, it } from "vitest";
import {
  SKYLINE_GHOST_TICK_SECONDS,
  createSkylineGhostMemoryStore,
  createSkylineGhostRecorder,
  createSkylineGhostReplay,
  parseSkylineGhostRecording,
  serializeSkylineGhostRecording,
  shouldReplaceGhostRecording,
  skylineGhostTimelineHash
} from "../../../apps/showcase-skyline-runner/src/ghost";
import type { SkylineGhostRecording } from "../../../apps/showcase-skyline-runner/src/ghost";
import { createSkylineLevel } from "../../../apps/showcase-skyline-runner/src/level";
import { game } from "@aura3d/engine";

/** Builds a plausible run-right-and-hop recording without any DOM. */
function buildRecording(ticks = 600, finishSeconds = 10): SkylineGhostRecording {
  const recorder = createSkylineGhostRecorder();
  for (let index = 0; index < ticks; index += 1) {
    const hop = index % 90 === 0 || index % 97 === 0;
    recorder.tick(SKYLINE_GHOST_TICK_SECONDS, {
      moveX: index % 200 === 150 ? 0 : 1,
      jumpPressed: hop,
      jumpHeld: hop || (hop ? false : index % 90 < 12)
    });
  }
  const recording = recorder.finalize(finishSeconds);
  expect(recording).not.toBeNull();
  return recording!;
}

describe("Skyline ghost recordings serialize losslessly", () => {
  it("reproduces an identical x-timeline hash through export -> import", () => {
    const recording = buildRecording();
    const exported = serializeSkylineGhostRecording(recording);
    const imported = parseSkylineGhostRecording(exported);
    expect(skylineGhostTimelineHash(imported)).toBe(skylineGhostTimelineHash(recording));
    expect(imported.finishSeconds).toBe(recording.finishSeconds);
    expect(imported.tickCount).toBe(recording.ticks.length);
  });

  it("is deterministic: two independent replays share one timeline", () => {
    const recording = buildRecording(400);
    expect(skylineGhostTimelineHash(recording)).toBe(skylineGhostTimelineHash(parseSkylineGhostRecording(serializeSkylineGhostRecording(recording))));
    const left = createSkylineGhostReplay(recording);
    const right = createSkylineGhostReplay(recording);
    for (let index = 0; index < 120; index += 1) {
      const a = left.advance(SKYLINE_GHOST_TICK_SECONDS);
      const b = right.advance(SKYLINE_GHOST_TICK_SECONDS);
      expect(a.x).toBe(b.x);
      expect(a.grounded).toBe(b.grounded);
    }
  });

  it("rejects corrupt or foreign payloads instead of guessing", () => {
    expect(() => parseSkylineGhostRecording("not json")).toThrow();
    expect(() => parseSkylineGhostRecording(JSON.stringify({ version: 99, finishSeconds: 1, ticks: [] }))).toThrow();
    const good = buildRecording(30);
    const broken = JSON.parse(serializeSkylineGhostRecording(good)) as { ticks: unknown };
    broken.ticks = [{ mx: 7, jp: false, jh: false }];
    expect(() => parseSkylineGhostRecording(JSON.stringify(broken))).toThrow(/moveX/);
  });
});

describe("Skyline ghost playback is structurally visual-only", () => {
  it("runs its own kit instance: replaying never touches another simulation", () => {
    // A live-style instance is first advanced into non-default truth (time,
    // player pose, and any solver bookkeeping), then frozen as a complete value.
    const levelA = createSkylineLevel();
    const bystander = game.platformer(levelA);
    for (let index = 0; index < 45; index += 1) {
      bystander.step(SKYLINE_GHOST_TICK_SECONDS, {
        moveX: 1,
        jumpPressed: index === 1,
        jumpHeld: index < 10
      });
    }
    const before = structuredClone(bystander.snapshot());

    const replay = createSkylineGhostReplay(buildRecording(240));
    let last = replay.snapshot();
    for (let index = 0; index < 100; index += 1) last = replay.advance(SKYLINE_GHOST_TICK_SECONDS);
    expect(last.tickIndex).toBe(100);

    // Every live snapshot field remains byte-for-byte equivalent. This covers
    // player state, score, collections, hazards, checkpoints, status, and events
    // without maintaining a hand-picked allowlist that could miss new game truth.
    expect(bystander.snapshot()).toEqual(before);
    // The replay API exposes pose/timing only: it cannot return truth for the live
    // route to accidentally consume as score, completion, collision, or pickups.
    expect(Object.keys(last).sort()).toEqual([
      "exhausted", "facing", "grounded", "tickCount", "tickIndex", "vy", "x", "y"
    ]);
  });

  it("stops consuming inputs when exhausted and reports it", () => {
    const replay = createSkylineGhostReplay(buildRecording(50));
    let snap = replay.snapshot();
    for (let index = 0; index < 80; index += 1) snap = replay.advance(SKYLINE_GHOST_TICK_SECONDS);
    expect(snap.exhausted).toBe(true);
    expect(snap.tickIndex).toBe(50);
    const held = replay.advance(SKYLINE_GHOST_TICK_SECONDS);
    expect(held.tickIndex).toBe(50);
  });

  it("keeps best-finish semantics: only faster runs replace the stored recording", () => {
    const slower = buildRecording(100, 12.5);
    const faster = buildRecording(90, 9.25);
    expect(shouldReplaceGhostRecording(null, slower)).toBe(true);
    expect(shouldReplaceGhostRecording(slower, faster)).toBe(true);
    expect(shouldReplaceGhostRecording(faster, slower)).toBe(false);
  });

  it("memory store round-trips the exact payload", () => {
    const store = createSkylineGhostMemoryStore();
    expect(store.load()).toBeNull();
    store.save("payload-v1");
    expect(store.load()).toBe("payload-v1");
  });
});
