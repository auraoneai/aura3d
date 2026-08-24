/**
 * Aurora Lander ghost replay round-trip.
 *
 * Proves the player-facing best-run feature on the public replay stack:
 * record press/release events -> game.inputReplay -> game.exportReplay ->
 * JSON string (localStorage shape) -> JSON.parse -> game.importReplay ->
 * game.inputReplayDriver driving the SAME deterministic authored integrator —
 * and the reproduced trajectory hash is IDENTICAL to the original run.
 */
import { describe, expect, it } from "vitest";
import { game, type GameInputReplayEvent } from "@aura3d/engine";
import {
  GHOST_FPS,
  buildGhostPlan,
  createGhostPlayback,
  exportBestRun,
  importBestRun,
  trajectoryHash,
  type GhostSample
} from "../../../apps/showcase-aurora-lander/src/ghost";
import { createLanderState, stepLander, type Controls } from "../../../apps/showcase-aurora-lander/src/lander";
import { SITES } from "../../../apps/showcase-aurora-lander/src/sites";

const site = SITES[0]!;
const dt = 1 / GHOST_FPS;

/** Scripted thrust/rotate pattern with its press/release event stream. */
function scriptedAttempt(): { controlsAt: (frame: number) => Controls; events: GameInputReplayEvent[] } {
  const events: GameInputReplayEvent[] = [];
  const press = (frame: number, binding: string) => events.push({ frame, time: frame * dt, type: "press", binding });
  const release = (frame: number, binding: string) => events.push({ frame, time: frame * dt, type: "release", binding });

  // Non-overlapping windows so every control has exactly one press and one release:
  //   thrust on [0,40) then [72,150); rotate on [70,90).
  press(0, "KeyW");
  release(40, "KeyW");
  press(70, "KeyD");
  press(72, "KeyW");
  release(90, "KeyD");
  release(150, "KeyW");

  const controlsAt = (frame: number): Controls => ({
    thrust: frame < 40 || (frame >= 72 && frame < 150) ? 1 : 0,
    rotate: frame >= 70 && frame < 90 ? 1 : 0
  });
  return { controlsAt, events };
}

describe("aurora lander ghost round-trip", () => {
  it("reproduces a hash-identical trajectory through export/import/driver", () => {
    const { events } = scriptedAttempt();

    // Reference playback: the in-memory plan drives the deterministic integrator
    // through a detached controller, exactly like the route's ghost system.
    const referencePlan = buildGhostPlan(events, "unit-roundtrip");
    const driveWith = (plan: ReturnType<typeof buildGhostPlan>): GhostSample[] => {
      const playback = createGhostPlayback();
      playback.begin(plan, createLanderState(site.spawn, site.fuelBudget), site.gust);
      const samples: GhostSample[] = [];
      let current = createLanderState(site.spawn, site.fuelBudget);
      for (let frame = 0; frame < 180; frame += 1) {
        const step = playback.step(dt);
        current = step.state;
        samples.push({ frame, x: current.x, y: current.y, z: current.z });
        if (step.complete && frame > 150) break;
      }
      return samples;
    };
    const referenceSamples = driveWith(referencePlan);
    const referenceHash = trajectoryHash(referenceSamples);
    expect(referenceHash).toMatch(/^[0-9a-f]{8}$/);

    // Persist exactly like the route does: plan -> export -> localStorage JSON,
    // then reload: parse -> import -> fresh playback driver.
    const stored = exportBestRun(
      { siteId: site.id, events, samples: referenceSamples },
      referencePlan,
      "soft",
      1234
    );
    const serialized = JSON.parse(JSON.stringify(stored));
    expect(serialized.trajectoryHash).toBe(referenceHash);
    const imported = importBestRun(serialized);
    expect(imported.replay.checksum).toBe(referencePlan.checksum);

    const replayedSamples = driveWith(imported.replay);
    expect(trajectoryHash(replayedSamples)).toBe(referenceHash);
  });

  it("keeps checksums stable across repeated plans of the same events", () => {
    const { events } = scriptedAttempt();
    const first = game.inputReplay(events, { fps: GHOST_FPS, seed: 7, label: "stability" });
    const second = game.inputReplay([...events], { fps: GHOST_FPS, seed: 7, label: "stability" });
    expect(first.checksum).toBe(second.checksum);
    expect(first.frameCount).toBe(second.frameCount);
  });

  it("rejects foreign export schemas instead of replaying them", () => {
    expect(() => game.importReplay({ kind: "something-else", schemaVersion: "x", replay: { events: [] } } as unknown as Parameters<typeof game.importReplay>[0])).toThrow();
  });

  it("quantizes trajectory hashes so serialization float noise cannot split them", () => {
    const baseSamples: GhostSample[] = [{ frame: 1, x: 1.234567, y: -2.345678, z: 3.456789 }];
    const noisySamples: GhostSample[] = [{ frame: 1, x: 1.2345678, y: -2.3456781, z: 3.4567892 }];
    // Sub-micron differences inside the same quantization bucket stay identical;
    // a real control difference moves coordinates far more than 1mm.
    expect(trajectoryHash(noisySamples)).toBe(trajectoryHash(baseSamples));
    const differentSamples: GhostSample[] = [{ frame: 1, x: 1.24, y: -2.34, z: 3.46 }];
    expect(trajectoryHash(differentSamples)).not.toBe(trajectoryHash(baseSamples));
  });
});
