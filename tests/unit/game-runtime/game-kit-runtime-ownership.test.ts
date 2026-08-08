import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function between(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  expect(start, `missing ${startMarker}`).toBeGreaterThanOrEqual(0);
  expect(end, `missing ${endMarker}`).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe("game-kit shared runtime ownership", () => {
  const genreSource = readFileSync("packages/engine/src/agent-api/GameGenreKits.ts", "utf8");
  const fightingSource = readFileSync("packages/engine/src/agent-api/game-kits/fighting.ts", "utf8");

  it("delegates continuous racing and platformer pose integration", () => {
    const platformer = between(genreSource, "export function createGamePlatformerKit", "export function createGameAssetBoundPlatformerLevel");
    const racing = between(genreSource, "export function createGameRacingKit", "const FALLING_BLOCK_SHAPES");

    expect(platformer).toContain("createGameKinematicBody");
    expect(platformer).toContain("body.update(step)");
    expect(platformer).not.toMatch(/state\.player\.[xy]\s*\+=\s*state\.player\.v[xy]\s*\*\s*step/);
    expect(racing).toContain("createGameArcadeVehicle");
    expect(racing).toContain("motion.step(step");
  });

  it("keeps discrete board rules and locomotion state selection out of the physics solver", () => {
    const locomotion = between(genreSource, "export function createGameLocomotionKit", "export interface GameRacingRoute");
    const fallingBlocks = between(genreSource, "export function createGameFallingBlocksKit", "function createPlatformerState");

    for (const source of [locomotion, fallingBlocks]) {
      expect(source).not.toContain("PhysicsRuntime");
      expect(source).not.toContain("createGameCollisionWorld");
      expect(source).not.toContain("createGameKinematicBody");
    }
    expect(locomotion).not.toMatch(/position\s*[+\-*/]?=/);
    expect(fallingBlocks).toContain("gravityFrames");
    expect(fallingBlocks).toContain("frame += 1");
  });

  it("keeps fighting composed from shared runtime services", () => {
    for (const service of [
      "createGameInput",
      "createGameKinematicBody",
      "createCombatWorld",
      "createGameCameraDirector",
      "createGameEffects"
    ]) {
      expect(fightingSource).toContain(service);
    }
  });
});
