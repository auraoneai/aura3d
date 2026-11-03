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

    // invariant: source must keep `createGameKinematicBody` — delegates continuous racing and platformer pose integration
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

import { createGameImpl } from "../../../packages/game/src/createGame";
import { primitives, scene } from "../../../packages/engine/src";
import { vi } from "vitest";

const gameScene = (name = "player") => scene().add(primitives.box({ name }));

async function playingGame(id: string) {
  const game = createGameImpl({
    id,
    target: null,
    autoStart: false,
    input: { actions: { jump: ["Space"] }, autoListen: false },
    scene: () => gameScene()
  });
  (game.app as { diagnostics: () => { drawCalls: number } }).diagnostics = () => ({ drawCalls: 1 });
  game.start();
  await game.ready();
  return game;
}

describe("full game runtime lifecycle", () => {
  it("advances input and tweens and freezes the owned runtime during pause", async () => {
    const game = await playingGame("lifecycle");
    const target = { value: 0 };
    const tween = game.juice.tween(target, { value: 1 }, { duration: 1, ease: "linear" });
    try {
      game.input!.press("Space");
      game.runtime.step(0.1);
      expect(game.input!.held("jump")).toBe(true);
      expect(target.value).toBeGreaterThan(0);
      const beforePause = target.value;
      const simTime = game.session.simTime;
      game.session.pause();
      expect(game.runtime.paused).toBe(true);
      game.runtime.step(0.1);
      expect(target.value).toBe(beforePause);
      expect(game.session.simTime).toBe(simTime);
      game.session.resume();
      expect(game.runtime.running).toBe(true);
      game.runtime.step(0.1);
      expect(target.value).toBeGreaterThan(beforePause);
    } finally {
      await game.dispose();
    }
    await tween.done;
  });

  it("resets particles and tweens when the scene changes without affecting another game", async () => {
    const first = await playingGame("first");
    const second = await playingGame("second");
    const target = { value: 0 };
    const tween = first.juice.tween(target, { value: 1 }, { duration: 10 });
    first.fx.burst("spark", [0, 0, 0], { count: 3, seed: 1 });
    second.fx.burst("spark", [0, 0, 0], { count: 2, seed: 1 });
    expect(first.fx.liveCount).toBe(3);
    expect(second.fx.liveCount).toBe(2);
    try {
      await first.setScene(gameScene("reset") as never);
      await tween.done;
      expect(first.fx.liveCount).toBe(0);
      expect(second.fx.liveCount).toBe(2);
      expect(() => first.fx.trail("player", { width: 1, life: 1 })).toThrow(/GAME_FX_TRAIL_UNSUPPORTED_V1/);
    } finally {
      await first.dispose();
      await second.dispose();
    }
  });

  it("cancels pending readiness, owns sound teardown once and rejects use after dispose", async () => {
    const soundAdapter = { suspend: vi.fn(), unlock: vi.fn(), dispose: vi.fn() };
    const game = createGameImpl({ id: "pending", target: null, autoStart: false, scene: () => gameScene(), soundAdapter });
    game.start();
    const ready = game.ready();
    const readyResult = expect(ready).rejects.toThrow(/GAME_DISPOSED_V1/);
    const first = game.dispose();
    const second = game.dispose();
    expect(second).toBe(first);
    await Promise.all([first, readyResult]);
    expect(soundAdapter.dispose).toHaveBeenCalledTimes(1);
    expect(game.session.state).toBe("disposed");
    expect(() => game.start()).toThrow(/GAME_DISPOSED_V1/);
    await expect(game.ready()).rejects.toThrow(/GAME_DISPOSED_V1/);
    await expect(game.setScene(gameScene() as never)).rejects.toThrow(/GAME_DISPOSED_V1/);
  });
});
