import { describe, expect, it } from "vitest";
import { createGamePlatformerKit } from "../../../packages/engine/src/agent-api/GameGenreKits";
import { solvePlatformerMotion } from "../../../packages/engine/src/agent-api/PlatformerMotion";
import { playerYawForFacing } from "../../../apps/showcase-skyline-runner/src/facing";
import { createSkylineFlow } from "../../../apps/showcase-skyline-runner/src/flow";
import {
  buildSkylineLevel,
  SKYLINE_FINISH,
  SKYLINE_HAZARDS,
  SKYLINE_PLATFORMS,
  SKYLINE_PLAYER_HEIGHT,
  SKYLINE_START
} from "../../../apps/showcase-skyline-runner/src/level";

// The rebuilt route's own level assembly, exactly as src/main.ts does it:
// authored rects + the shared solver (no route-local physics constants).
function createRouteKit() {
  const motion = solvePlatformerMotion(SKYLINE_PLATFORMS, {
    feel: "snappy",
    characterHeight: SKYLINE_PLAYER_HEIGHT,
    jumpHeight: SKYLINE_PLAYER_HEIGHT * 2.3,
    runSpeedPerHeight: 4.5
  });
  return { motion, kit: createGamePlatformerKit(buildSkylineLevel(motion)) };
}

// Deterministic driver: hold right, jump when grounded near the right edge
// of the supporting platform.
function driveRight(
  kit: ReturnType<typeof createGamePlatformerKit>,
  maxSeconds: number,
  onStep?: (state: ReturnType<typeof kit.snapshot>) => void
) {
  let state = kit.snapshot();
  const frames = Math.round(maxSeconds * 60);
  let deaths = state.deaths;
  let neutralFrames = 0;
  for (let frame = 0; frame < frames && state.status !== "completed"; frame += 1) {
    const support = SKYLINE_PLATFORMS.find(
      (p) => Math.abs(p.y + p.height - state.player.y) < 0.05
        && state.player.x >= p.x - 0.1 && state.player.x <= p.x + p.width + 0.1
    );
    const nearEdge = support !== undefined && state.player.x > support.x + support.width - 0.45;
    // The kit requires neutral input after a respawn before control returns.
    if (state.deaths > deaths) neutralFrames = 6;
    deaths = state.deaths;
    const neutral = neutralFrames > 0;
    if (neutral) neutralFrames -= 1;
    const jumpPressed = !neutral && state.player.grounded && nearEdge;
    state = kit.step(1 / 60, {
      moveX: neutral ? 0 : 1,
      jumpPressed,
      jumpHeld: jumpPressed || !state.player.grounded
    });
    onStep?.(state);
  }
  return state;
}

describe("skyline-runner rebuild — facing helper", () => {
  it("faces travel direction in the play plane, never the camera", () => {
    expect(playerYawForFacing(1)).toBeCloseTo(Math.PI / 2);
    expect(playerYawForFacing(-1)).toBeCloseTo(-Math.PI / 2);
    expect(playerYawForFacing(1)).not.toBe(0);
    expect(playerYawForFacing(-1)).not.toBe(0);
    // Opposite travel directions are exact opposites.
    expect(playerYawForFacing(1) + playerYawForFacing(-1)).toBe(0);
  });
});

describe("skyline-runner rebuild — solver-driven level", () => {
  it("derives motion from the shared solver intent, not route constants", () => {
    const { motion } = createRouteKit();
    expect(motion.apex).toBeCloseTo(SKYLINE_PLAYER_HEIGHT * 2.3, 1);
    expect(motion.gravity).toBeLessThan(0);
    expect(motion.jumpVelocity).toBeGreaterThan(0);
    expect(motion.moveSpeed).toBeGreaterThan(0);
    // Widest authored gap must be clearable by the solved jump reach.
    const sorted = [...SKYLINE_PLATFORMS].sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i += 1) {
      const gap = sorted[i]!.x - (sorted[i - 1]!.x + sorted[i - 1]!.width);
      expect(motion.jumpReach, `gap before ${sorted[i]!.id}`).toBeGreaterThan(gap);
    }
  });

  it("keeps the hazard clear of every platform rect", () => {
    for (const hazard of SKYLINE_HAZARDS) {
      for (const platform of SKYLINE_PLATFORMS) {
        const overlap = hazard.x < platform.x + platform.width
          && hazard.x + hazard.width > platform.x
          && hazard.y < platform.y + platform.height
          && hazard.y + hazard.height > platform.y;
        expect(overlap, `${hazard.id} vs ${platform.id}`).toBe(false);
      }
    }
  });

  it("traverses start to finish, collects a coin, and completes only at the finish", () => {
    const { kit } = createRouteKit();
    const initial = kit.snapshot();
    expect(initial.status).toBe("playing");
    expect(initial.player.x).toBeCloseTo(SKYLINE_START.x, 5);
    let sawAirborne = false;
    let completedEarly = false;
    const final = driveRight(kit, 90, (state) => {
      if (!state.player.grounded) sawAirborne = true;
      if (state.status === "completed" && state.player.x < SKYLINE_FINISH.x - 1) completedEarly = true;
    });
    expect(sawAirborne).toBe(true);
    expect(completedEarly).toBe(false);
    expect(final.status).toBe("completed");
    expect(final.collected.length).toBeGreaterThanOrEqual(1);
    expect(final.activatedCheckpoints).toContain("mid");
  });

  it("jumps in an arc and lands grounded", () => {
    const { kit } = createRouteKit();
    // The kit grounds the player on the first step (initial snapshot is
    // pre-contact).
    let state = kit.step(1 / 60, { moveX: 0 });
    expect(state.player.grounded).toBe(true);
    let maxY = state.player.y;
    let landedAgain = false;
    for (let frame = 0; frame < 180; frame += 1) {
      state = kit.step(1 / 60, { moveX: 0, jumpPressed: frame === 0, jumpHeld: frame < 20 });
      maxY = Math.max(maxY, state.player.y);
      if (frame > 10 && state.player.grounded) landedAgain = true;
    }
    expect(maxY).toBeGreaterThan(SKYLINE_START.y + 0.8);
    expect(landedAgain).toBe(true);
  });

  it("faces right while travelling right and left while travelling left", () => {
    const { kit } = createRouteKit();
    let state = kit.snapshot();
    for (let frame = 0; frame < 45; frame += 1) state = kit.step(1 / 60, { moveX: 1 });
    expect(state.player.vx).toBeGreaterThan(0);
    expect(state.player.facing).toBe(1);
    expect(playerYawForFacing(state.player.facing)).toBeCloseTo(Math.PI / 2);
    for (let frame = 0; frame < 45; frame += 1) state = kit.step(1 / 60, { moveX: -1 });
    expect(state.player.vx).toBeLessThan(0);
    expect(state.player.facing).toBe(-1);
    expect(playerYawForFacing(state.player.facing)).toBeCloseTo(-Math.PI / 2);
  });

  it("reset returns to the start uncompleted", () => {
    const { kit } = createRouteKit();
    driveRight(kit, 3);
    const reset = kit.reset();
    expect(reset.status).toBe("playing");
    expect(reset.player.x).toBeCloseTo(SKYLINE_START.x, 5);
    expect(reset.collected).toEqual([]);
  });
});

describe("skyline-runner rebuild — flow scoring", () => {
  it("builds flow while moving, records splits, and completes only with the kit", () => {
    const { kit } = createRouteKit();
    const flow = createSkylineFlow();
    let previous = kit.snapshot();
    expect(flow.snapshot().completed).toBe(false);
    const final = driveRight(kit, 90, (state) => {
      flow.step(1 / 60, previous, state);
      previous = state;
    });
    const flowState = flow.snapshot();
    expect(final.status).toBe("completed");
    expect(flowState.completed).toBe(true);
    expect(flowState.collections).toBeGreaterThanOrEqual(1);
    expect(flowState.challengeScore).toBeGreaterThanOrEqual(final.score);
    expect(flowState.checkpointSplits["mid"]).toBeGreaterThan(0);
    expect(flowState.elapsedSeconds).toBeGreaterThan(0);

    const reset = flow.reset();
    expect(reset.flowScore).toBe(0);
    expect(reset.completed).toBe(false);
    expect(reset.resets).toBe(1);
  });

  it("decays flow while idle and never self-completes", () => {
    const { kit } = createRouteKit();
    const flow = createSkylineFlow();
    let previous = kit.snapshot();
    for (let frame = 0; frame < 120; frame += 1) {
      const state = kit.step(1 / 60, { moveX: 0 });
      flow.step(1 / 60, previous, state);
      previous = state;
    }
    expect(flow.snapshot().flowScore).toBe(0);
    expect(flow.snapshot().completed).toBe(false);
    expect(flow.snapshot().objectiveMet).toBe(false);
  });
});
