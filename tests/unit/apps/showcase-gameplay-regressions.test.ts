import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createGameAssetBoundPlatformerLevel,
  createGamePlatformerKit,
  createGameRacingKit
} from "../../../packages/engine/src/agent-api/GameGenreKits";
// Turbo's generated game-geometry contract was trashed with the dual-path
// route (Live Fix B2); the rebuilt route ships the racing-starter route
// geometry inline in src/main.ts, mirrored in the pace test below.
import { createTurboOpponentAi, type TurboOpponentInput } from "../../../apps/showcase-turbo-drift-circuit/src/opponent-ai";
import { createRunnerChallenge } from "../../../apps/showcase-skyline-runner/src/runner-challenge";
import { createSixtySecondLevelProof } from "../../../apps/showcase-skyline-runner/src/level-proof";
import {
  SKYLINE_FIRST_MID_CHECKPOINT_ID,
  SKYLINE_SECTION_COUNT,
  createSkylineLevel
} from "../../../apps/showcase-skyline-runner/src/level";

describe("public showcase gameplay regressions", () => {
  it("does not self-author completion or visual approval before mounted interaction", () => {
    const skyline = readFileSync("apps/showcase-skyline-runner/src/main.ts", "utf8");
    const turbo = readFileSync("apps/showcase-turbo-drift-circuit/src/main.ts", "utf8");

    // invariant: source must keep `completed: false` — does not self-author completion or visual approval before mounted interaction
    expect(skyline).toContain("completed: false");
    expect(skyline).toContain("state.status === \"completed\"");
    expect(skyline).toContain("!completionProof.completed");
    // The shipped level now completes at the physical finish. A post-finish clock
    // gate would make a short course look long without adding any gameplay.
    expect(skyline).not.toContain("challengeEvidence.elapsedSeconds >= level.assetBinding.authoredPlayableSeconds");
    expect(skyline).toContain("completionProof.finalTime = challengeEvidence.elapsedSeconds");
    expect(skyline).not.toContain("visualReviewPass: true");
    expect(turbo).not.toContain("visualReviewPass: true");
    // The trashed route proved these intents with evidence-field names
    // (`opponentMovesIndependently`, `finishProgression`) that died with
    // its generated geometry contract. The rebuilt main.ts proves the
    // same intents structurally: the opponent is stepped from its own kit
    // through the shared driver, and the race reaches a finished state.
    expect(turbo).toContain("createVehicleDriverAi");
    expect(turbo).toContain("opponentAi.step(");
    expect(turbo).toContain("opponentProgress");
    expect(turbo).toContain('playerState.status === "finished"');
  });

  it("keeps Skyline Runner traversable through its generated finish surface", () => {
    /*
     * The route's own level, from the module that owns it.
     *
     * Reconstructing it here meant the test exercised a *different* level from the one the
     * route ships: after motion was derived from the level geometry, this copy still
     * carried the old floaty tuning and the new validator rejected it. Testing the shared
     * definition is what makes these regressions about the shipped route.
     */
    const level = createSkylineLevel();
    expect(level.finish, "extended Skyline level must retain a physical finish").toBeDefined();
    const finish = level.finish!;
    const lastDistrictPrefix = `district-${SKYLINE_SECTION_COUNT}-`;
    const finishSurface = level.platforms?.find((surface) =>
      (surface.id.startsWith(lastDistrictPrefix) || surface.id === "asset-finish-run")
      && finish.x >= surface.x
      && finish.x <= surface.x + surface.width
      && finish.y >= surface.y
      && finish.y <= surface.y + surface.height + 0.1
    );
    const hazard = level.hazards?.find((surface) => surface.id.endsWith("asset-hazard-gap"));
    expect(finishSurface, "finish must be retained as collision geometry").toBeDefined();
    expect(hazard, "route must retain a miss-jump hazard").toBeDefined();
    expect(rectsOverlap(finishSurface!, hazard!)).toBe(false);
    for (const platform of level.platforms ?? []) expect(rectsOverlap(platform, hazard!)).toBe(false);

    // Reuse the route-owned deterministic driver rather than maintaining a
    // second, weaker jump policy here. It traverses the complete physical course
    // and records the exact finish frame inside the promised two-to-three-minute
    // window.
    const proof = createSixtySecondLevelProof();
    expect(proof.metrics.finalStatus).toBe("completed");
    expect(proof.metrics.maxTraversalX).toBeGreaterThan(finish.x - 1);
    expect(proof.metrics.activatedCheckpointCount).toBe(level.checkpoints?.length);
    expect(proof.mechanics.completionFallsInsideTargetWindow).toBe(true);
  });

  it("respawns Skyline checkpoints on supporting surfaces instead of trigger-center heights", () => {
    /*
     * The route's own level, from the module that owns it.
     *
     * Reconstructing it here meant the test exercised a *different* level from the one the
     * route ships: after motion was derived from the level geometry, this copy still
     * carried the old floaty tuning and the new validator rejected it. Testing the shared
     * definition is what makes these regressions about the shipped route.
     */
    const level = createSkylineLevel();
    const checkpoint = level.checkpoints?.find((candidate) => candidate.id === SKYLINE_FIRST_MID_CHECKPOINT_ID);
    const supportingSurface = [...(level.platforms ?? [])].sort((left, right) => {
      const leftDistance = Math.abs(checkpoint!.x - Math.min(Math.max(checkpoint!.x, left.x), left.x + left.width));
      const rightDistance = Math.abs(checkpoint!.x - Math.min(Math.max(checkpoint!.x, right.x), right.x + right.width));
      return leftDistance - rightDistance;
    })[0];
    expect(checkpoint).toBeDefined();
    expect(supportingSurface).toBeDefined();

    const simulation = createGamePlatformerKit(level);
    const respawned = simulation.reset(checkpoint!.id);
    const playerInset = Math.min((level.playerSize?.[0] ?? 0.45) * 0.5, supportingSurface.width * 0.25);
    const expectedX = Math.min(
      Math.max(checkpoint!.x, supportingSurface.x + playerInset),
      supportingSurface.x + supportingSurface.width - playerInset
    );
    expect(respawned.player.x).toBeCloseTo(expectedX, 6);
    expect(respawned.player.y).toBeCloseTo(supportingSurface.y + supportingSurface.height, 6);
    expect(respawned.player.y).not.toBeCloseTo(checkpoint!.y, 3);

    let continued = respawned;
    const frames = 45;
    for (let frame = 0; frame < frames; frame += 1) {
      continued = simulation.step(1 / 60, { moveX: 1 });
    }
    /*
     * Expected travel is derived from the level's own move speed, not a literal.
     *
     * The previous `+ 0.75` was tuned against a hardcoded `moveSpeed: 1.15`, so deriving
     * motion from the level geometry broke a test that was measuring the old constant
     * rather than the behaviour. The behaviour under test is "the respawned player can walk
     * forward off the checkpoint", which is a fraction of the distance the level's speed
     * covers in the sampled window.
     */
    const expectedTravel = (level.moveSpeed ?? 1) * (frames / 60) * 0.7;
    expect(continued.player.x).toBeGreaterThan(respawned.player.x + expectedTravel);
    expect(continued.deaths).toBe(0);
  });

  it("requires neutral movement after a Skyline death to prevent checkpoint death loops", () => {
    /*
     * The route's own level, from the module that owns it.
     *
     * Reconstructing it here meant the test exercised a *different* level from the one the
     * route ships: after motion was derived from the level geometry, this copy still
     * carried the old floaty tuning and the new validator rejected it. Testing the shared
     * definition is what makes these regressions about the shipped route.
     */
    const level = createSkylineLevel();
    const simulation = createGamePlatformerKit(level);
    let snapshot = simulation.reset(SKYLINE_FIRST_MID_CHECKPOINT_ID);
    const checkpointX = snapshot.player.x;
    for (let frame = 0; frame < 240 && snapshot.deaths === 0; frame += 1) {
      snapshot = simulation.step(1 / 60, { moveX: 1 });
    }
    expect(snapshot.deaths).toBe(1);
    const respawnDeaths = snapshot.deaths;
    // Keep holding well beyond the old 300 ms timer but inside the bounded
    // continuous-controller fallback. A human release must remain the fast path.
    for (let frame = 0; frame < 36; frame += 1) {
      snapshot = simulation.step(1 / 60, { moveX: 1 });
    }
    expect(snapshot.deaths).toBe(respawnDeaths);
    expect(snapshot.player.x).toBeCloseTo(checkpointX, 3);
    expect(snapshot.player.grounded).toBe(true);

    simulation.step(1 / 60, { moveX: 0 });
    const releasedAtX = simulation.snapshot().player.x;
    for (let frame = 0; frame < 30; frame += 1) {
      snapshot = simulation.step(1 / 60, { moveX: 1, jumpPressed: frame === 0 });
    }
    expect(snapshot.deaths).toBe(respawnDeaths);
    expect(snapshot.player.x).toBeGreaterThan(releasedAtX + 0.3);
  });

  it("faces the Skyline character along travel instead of toward the camera", () => {
    const source = readFileSync("apps/showcase-skyline-runner/src/main.ts", "utf8");
    expect(source).toContain("playerYawForFacing");
    expect(source).toContain("state.player.vx >= 0 ? 1 : -1");
    // The shipped route keeps the gameplay-facing yaw contract while applying
    // a documented visual profile offset to the typed hero. The rigid run
    // cycle (26912b8c) folds stride sway + lean into a run yaw derived from
    // that same profile, so the assertion follows the run yaw, not the
    // pre-cycle direct call: the base is still the facing profile, and the
    // bounded sway/lean cannot turn the hero toward the camera.
    expect(source).toContain("const runYaw = playerVisualYawForFacing(playerFacing) + runSway");
    expect(source).toContain("player.setRotation(0, runYaw, runLeanZ)");
  });

  it("scores Skyline flow, collection chains, checkpoint splits, retries, and reset", () => {
    const challenge = createRunnerChallenge(40);
    const initial = runnerChallengeSnapshot();
    const moving = {
      ...initial,
      player: { vx: 1.2, vy: 2.4 },
      collected: ["coin-1", "coin-2"],
      activatedCheckpoints: ["asset-checkpoint-01"],
      checkpointId: "asset-checkpoint-01",
      score: 200
    };
    const afterChain = challenge.step(1, initial, moving);
    expect(afterChain.flow).toBeGreaterThan(0);
    expect(afterChain.collectionChain).toBe(2);
    expect(afterChain.maxCollectionChain).toBe(2);
    expect(afterChain.checkpointSplits["asset-checkpoint-01"]).toBe(0.1);
    expect(afterChain.challengeScore).toBeGreaterThan(moving.score);

    const retried = challenge.step(0.5, moving, { ...moving, deaths: 1 });
    expect(retried.deathless).toBe(false);
    expect(retried.collectionChain).toBe(0);
    expect(retried.flow).toBe(0);

    const completed = challenge.step(0.5, { ...moving, deaths: 1 }, {
      ...moving,
      deaths: 1,
      collected: ["coin-1", "coin-2", "coin-3"],
      status: "completed"
    });
    expect(completed.completed).toBe(true);
    expect(completed.objectiveMet).toBe(true);

    const reset = challenge.reset();
    expect(reset.elapsedSeconds).toBe(0);
    expect(reset.challengeScore).toBe(0);
    expect(reset.resets).toBe(1);
    expect(reset.recentEvents).toContain("challenge-reset");
  });

  it("runs Turbo Drift at the shipped arcade pace on its inline route", () => {
    // The certified-geometry pace pin (`gameplayPaceMultiplier = 4` over a
    // certified baseline) belonged to the trashed generated contract and
    // its src/hud.ts panel; both are deleted. The rebuilt route runs the
    // racing-starter tuning teleported inline in src/main.ts. This test
    // now proves the pace behaviourally on that shipped route shape
    // (mirrored here) and keeps the banned machinery out by source.
    const ROUTE_SCALE = 3.5;
    const route = {
      id: "turbo-drift-circuit",
      width: 2.2 * ROUTE_SCALE,
      points: [
        { x: -0.4 * ROUTE_SCALE, y: -0.25 * ROUTE_SCALE },
        { x: 2.4 * ROUTE_SCALE, y: -0.9 * ROUTE_SCALE },
        { x: 5.4 * ROUTE_SCALE, y: 0.15 * ROUTE_SCALE },
        { x: 5.9 * ROUTE_SCALE, y: 2.7 * ROUTE_SCALE },
        { x: 3.2 * ROUTE_SCALE, y: 3.9 * ROUTE_SCALE },
        { x: 0.3 * ROUTE_SCALE, y: 3.15 * ROUTE_SCALE },
        { x: -0.75 * ROUTE_SCALE, y: 1.15 * ROUTE_SCALE }
      ],
      checkpoints: [0.14, 0.27, 0.4, 0.53, 0.66, 0.79]
    };
    const simulation = createGameRacingKit({
      route,
      startProgress: 0.04,
      checkpointRadius: 0.08,
      lapsToWin: 3,
      maxSpeed: 40,
      acceleration: 60,
      drag: 1.4,
      steerRate: 2.85,
      model: "bicycle",
      chassis: false
    });
    expect(simulation.maxSpeed).toBe(40);
    // Arcade pace, behaviourally: held throttle on the opening straight
    // keeps accelerating through the first second (the bicycle model's
    // effective rate is measured here rather than derived from the
    // acceleration option; throttle-only for longer leaves the line and
    // off-track drag dominates, which measures recovery, not pace).
    let state = simulation.snapshot();
    for (let frame = 0; frame < 30; frame += 1) {
      state = simulation.step(1 / 60, { throttle: true });
    }
    const halfSecondSpeed = state.speed;
    for (let frame = 0; frame < 30; frame += 1) {
      state = simulation.step(1 / 60, { throttle: true });
    }
    expect(halfSecondSpeed).toBeGreaterThan(0);
    expect(state.speed).toBeGreaterThan(halfSecondSpeed);
    expect(state.progress).not.toBeCloseTo(0.04, 3);

    const source = readFileSync("apps/showcase-turbo-drift-circuit/src/main.ts", "utf8");
    expect(source).toContain("maxSpeed: 40");
    expect(source).not.toContain("gameplayPaceMultiplier");
    expect(source).not.toContain("renderTurboHudPanel");
    expect(source).not.toContain("turboAcceptanceInputOverride");
    expect(source).not.toContain("ROAD_DETAIL_SURFACE_LIFT");
  });

  it("drives the Turbo opponent from its own racing state instead of a player-progress offset", () => {
    let snapshot = {
      progress: 0.12,
      speed: 0,
      // Heading, position and off-track state are part of the snapshot because the
      // reusable driver needs them: it aims at a look-ahead point on the racing line,
      // which requires knowing where the car is and which way it faces. A controller
      // that only sees lateral offset cannot turn into a corner before reaching it.
      heading: 0,
      position: { x: 0, y: 0.08 },
      offTrack: false,
      trackOffset: 0.08,
      // Signed, because an unsigned magnitude cannot tell the controller which way to
      // correct. The opponent used to read `trackOffset` and could not return to the line.
      signedTrackOffset: 0.08,
      lap: 1,
      checkpoint: 0,
      status: "running",
      frame: 0
    };
    const inputs: TurboOpponentInput[] = [];
    const state = {
      snapshot: () => snapshot,
      step: (dt: number, input: TurboOpponentInput) => {
        inputs.push(input);
        const speed = Math.max(0, snapshot.speed + (input.throttle ? 2.4 * dt : 0) - (input.brake ? 3 * dt : 0));
        const signedTrackOffset = snapshot.signedTrackOffset + input.steer * dt;
        const progress = (snapshot.progress + speed * dt * 0.08) % 1;
        snapshot = {
          ...snapshot,
          speed,
          signedTrackOffset,
          trackOffset: Math.abs(signedTrackOffset),
          progress,
          position: { x: progress * 100, y: signedTrackOffset },
          frame: snapshot.frame + 1
        };
        return snapshot;
      },
      reset: (progress = 0) => {
        snapshot = { ...snapshot, progress, speed: 0, frame: 0 };
        return snapshot;
      },
      resolveContact: (position: { readonly x: number; readonly y: number }, options?: { readonly speedMultiplier?: number }) => {
        snapshot = {
          ...snapshot,
          position,
          speed: snapshot.speed * (options?.speedMultiplier ?? 1)
        };
        return snapshot;
      }
    };
    const opponent = createTurboOpponentAi(state, { startProgress: 0.12, maxSpeed: 4.4 });

    for (let frame = 0; frame < 180; frame += 1) opponent.step(1 / 60, 0.02);
    const evidence = opponent.evidence(0.02);

    expect(opponent.snapshot().progress).not.toBeCloseTo(0.24, 3);
    expect(opponent.snapshot().progress).toBeGreaterThan(0.12);
    expect(inputs.some((input) => input.throttle)).toBe(true);
    expect(inputs.some((input) => Math.abs(input.steer) > 0.01)).toBe(true);
    // Starting offset is +0.08, so a correcting controller must steer negative at least
    // once. Reading the unsigned magnitude produced a controller that could only ever
    // steer one way regardless of which side of the line it was on.
    expect(inputs.some((input) => input.steer < 0)).toBe(true);
    expect(evidence.independentFromPlayerPlacement).toBe(true);
    expect(evidence.decisionCount).toBeGreaterThan(0);
    expect(evidence.recentDecisions.length).toBeGreaterThan(0);

    const speedBeforeContact = opponent.snapshot().speed;
    const contactResolved = opponent.resolveContact({ x: 3, y: -0.2 }, 0.4);
    expect(contactResolved.position).toEqual({ x: 3, y: -0.2 });
    expect(contactResolved.speed).toBeCloseTo(speedBeforeContact * 0.4, 6);

    expect(opponent.reset().progress).toBeCloseTo(0.12, 6);
    expect(opponent.snapshot().speed).toBe(0);
  });
});

function runnerChallengeSnapshot() {
  return {
    player: { vx: 0, vy: 0 },
    collected: [] as readonly string[],
    activatedCheckpoints: [] as readonly string[],
    deaths: 0,
    checkpointId: "start",
    status: "playing",
    score: 0
  };
}

function rectsOverlap(
  a: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  b: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
