import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createGameAssetBoundPlatformerLevel,
  createGameAssetBoundRacingRoute,
  createGamePlatformerKit,
  createGameRacingKit
} from "../../../packages/engine/src/agent-api/GameGenreKits";
import { gameGeometryContract as skylineGeometry } from "../../../apps/showcase-skyline-runner/src/generated/game-geometry";
import { gameGeometryContract as turboGeometry } from "../../../apps/showcase-turbo-drift-circuit/src/generated/game-geometry";
import { createTurboOpponentAi, type TurboOpponentInput } from "../../../apps/showcase-turbo-drift-circuit/src/opponent-ai";

describe("public showcase gameplay regressions", () => {
  it("keeps Skyline Runner traversable through its generated finish surface", () => {
    const level = createGameAssetBoundPlatformerLevel({
      characterAsset: "showcaseKenneyOobiPlatformerHero",
      worldAssetBindings: skylineGeometry.worldAssetBindings,
      playableSurfaceMap: skylineGeometry.surfaceMap,
      authoredPlayableSeconds: skylineGeometry.authoredSeconds,
      minPlayableSeconds: 30,
      minCheckpoints: 6,
      level: skylineGeometry.level
    });
    const finishSurface = level.platforms?.find((surface) => surface.id === "asset-finish-run");
    const hazard = level.hazards?.find((surface) => surface.id === "asset-hazard-gap");
    expect(finishSurface, "finish must be retained as collision geometry").toBeDefined();
    expect(hazard, "route must retain a miss-jump hazard").toBeDefined();
    expect(rectsOverlap(finishSurface!, hazard!)).toBe(false);
    for (const platform of level.platforms ?? []) expect(rectsOverlap(platform, hazard!)).toBe(false);

    const simulation = createGamePlatformerKit(level);
    let snapshot = simulation.snapshot();
    let lastJumpFrame = -100;
    for (let frame = 0; frame < 60 * 45 && snapshot.status !== "completed"; frame += 1) {
      const jump = snapshot.player.grounded && frame - lastJumpFrame > 24;
      if (jump) lastJumpFrame = frame;
      snapshot = simulation.step(1 / 60, { moveX: 1, jumpPressed: jump, jumpHeld: jump });
    }

    expect(snapshot.status).toBe("completed");
    expect(snapshot.deaths).toBe(0);
    expect(snapshot.checkpointId).toBe("asset-checkpoint-06");
  });

  it("respawns Skyline checkpoints on supporting surfaces instead of trigger-center heights", () => {
    const level = createGameAssetBoundPlatformerLevel({
      characterAsset: "showcaseKenneyOobiPlatformerHero",
      worldAssetBindings: skylineGeometry.worldAssetBindings,
      playableSurfaceMap: skylineGeometry.surfaceMap,
      authoredPlayableSeconds: skylineGeometry.authoredSeconds,
      minPlayableSeconds: 30,
      minCheckpoints: 6,
      level: skylineGeometry.level
    });
    const checkpoint = level.checkpoints?.find((candidate) => candidate.id === "asset-checkpoint-03");
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
    for (let frame = 0; frame < 45; frame += 1) {
      continued = simulation.step(1 / 60, { moveX: 1 });
    }
    expect(continued.player.x).toBeGreaterThan(respawned.player.x + 0.75);
    expect(continued.deaths).toBe(0);
  });

  it("faces the Skyline character along travel instead of toward the camera", () => {
    const source = readFileSync("apps/showcase-skyline-runner/src/main.ts", "utf8");
    expect(source).toContain("playerYawForFacing");
    expect(source).toContain("state.player.vx >= 0 ? 1 : -1");
    expect(source).toContain("player.setRotation(0, playerYawForFacing(playerFacing), 0)");
  });

  it("runs Turbo Drift at an arcade pace above the certified evidence baseline", () => {
    const route = createGameAssetBoundRacingRoute({
      vehicleAsset: "showcaseKenneyRaceCarRed",
      trackAsset: "showcaseKenneyNeonRaceCircuit",
      authoredLapSeconds: turboGeometry.authoredSeconds,
      minLapSeconds: 30,
      minCheckpoints: 6,
      topology: turboGeometry.topology,
      route: turboGeometry.route
    });
    const paceMultiplier = 4;
    const simulation = createGameRacingKit({
      route,
      paceMultiplier,
      acceleration: route.assetBinding.speedModel.certifiedSpeed * paceMultiplier * 4.1,
      drag: 0.28,
      steerRate: 0.62
    });

    expect(route.assetBinding.speedModel.certifiedSpeed).toBeCloseTo(1.098, 3);
    expect(simulation.maxSpeed).toBeGreaterThan(4);
    expect(simulation.maxSpeed).toBeCloseTo(route.assetBinding.speedModel.certifiedSpeed * paceMultiplier, 6);

    const source = readFileSync("apps/showcase-turbo-drift-circuit/src/main.ts", "utf8");
    expect(source).toContain("const gameplayPaceMultiplier = 4");
    expect(source).toContain("Speed · km/h");
  });

  it("drives the Turbo opponent from its own racing state instead of a player-progress offset", () => {
    let snapshot = {
      progress: 0.12,
      speed: 0,
      trackOffset: 0.08,
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
        snapshot = {
          ...snapshot,
          speed,
          trackOffset: snapshot.trackOffset + input.steer * dt,
          progress: (snapshot.progress + speed * dt * 0.08) % 1,
          frame: snapshot.frame + 1
        };
        return snapshot;
      },
      reset: (progress = 0) => {
        snapshot = { ...snapshot, progress, speed: 0, frame: 0 };
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
    expect(evidence.independentFromPlayerPlacement).toBe(true);
    expect(evidence.decisionCount).toBeGreaterThan(0);
    expect(evidence.recentDecisions.length).toBeGreaterThan(0);

    expect(opponent.reset().progress).toBeCloseTo(0.12, 6);
    expect(opponent.snapshot().speed).toBe(0);
  });
});

function rectsOverlap(
  a: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  b: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
