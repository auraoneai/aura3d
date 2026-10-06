import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

test("arena shooter route exposes a live gameplay proof", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");
  await page.waitForFunction(() => Boolean((window as unknown as { __AURA3D_ROUTE_READY__?: unknown }).__AURA3D_ROUTE_READY__));
  await page.waitForFunction(() => Boolean((window as unknown as { __AURA3D_ARENA_SHOOTER__?: unknown }).__AURA3D_ARENA_SHOOTER__));

  const proof = await page.evaluate(() => (window as unknown as {
    __AURA3D_ARENA_SHOOTER__?: {
      status: string;
      wave: number;
      shield: number;
      ship: { assetId: string; url: string; metres: readonly number[] };
      assets: { typedAssets: number; drone: { assetId: string }; planet: { assetId: string } };
      waves: { spawnIntervalSeconds: number; shieldMax: number };
      look: { id: string };
      camera: { rig: string; pitchDegrees: number; presented: boolean };
    };
  }).__AURA3D_ARENA_SHOOTER__);

  expect(proof).toBeTruthy();
  expect(["playing", "wave-cleared", "paused"]).toContain(proof!.status);
  expect(proof!.look.id).toBe("space");
  expect(proof!.camera.pitchDegrees).toBe(60);
  expect(proof!.camera.presented).toBe(true);
  expect(proof!.waves.spawnIntervalSeconds).toBe(1.8);
  expect(proof!.waves.shieldMax).toBe(5);
  expect(proof!.shield).toBeLessThanOrEqual(5);
  expect(proof!.shield).toBeGreaterThanOrEqual(0);
  expect(proof!.ship.assetId).toBe("ship");
  expect(proof!.ship.url).toContain("/aura-assets/");
  expect(proof!.ship.metres[1]).toBeGreaterThan(0.5);
  expect(proof!.assets.drone.assetId).toBe("drone");
  expect(proof!.assets.planet.assetId).toBe("planet");
  expect(proof!.assets.typedAssets).toBe(3);

  // The source manifest pins the scaffold contract: createGame entry, typed
  // assets and the space look.
  const source = await page.evaluate(() => (window as unknown as {
    __AURA3D_GAME_SOURCE__?: {
      template: string;
      publicEngineApi: boolean;
      look: { id: string };
      lifecycle: { usesCreateGame: boolean };
      typedAssetKeys: readonly string[];
    };
  }).__AURA3D_GAME_SOURCE__);
  expect(source?.template).toBe("arena-shooter");
  expect(source?.publicEngineApi).toBe(true);
  expect(source?.look.id).toBe("space");
  expect(source?.lifecycle.usesCreateGame).toBe(true);
  expect(source?.typedAssetKeys).toEqual(["ship", "drone", "planet"]);

  // Wave spawner: drones land on the 1.8 s cadence and converge.
  await page.waitForFunction(
    () => ((window as unknown as { __AURA3D_ARENA_SHOOTER__?: { dronesAlive: number; dronesQueued: number } }).__AURA3D_ARENA_SHOOTER__?.dronesAlive ?? 0)
      + ((window as unknown as { __AURA3D_ARENA_SHOOTER__?: { dronesQueued: number } }).__AURA3D_ARENA_SHOOTER__?.dronesQueued ?? 0) > 0,
    { timeout: 30_000 }
  );

  // Movement drives the ship position in the proof.
  const before = await page.evaluate(() => (window as unknown as { __AURA3D_ARENA_SHOOTER__?: { ship: { position: readonly number[] } } }).__AURA3D_ARENA_SHOOTER__?.ship.position ?? [0, 0, 0]);
  await page.keyboard.down("KeyD");
  await page.waitForTimeout(600);
  await page.keyboard.up("KeyD");
  const moved = await page.evaluate(() => (window as unknown as { __AURA3D_ARENA_SHOOTER__?: { ship: { position: readonly number[] } } }).__AURA3D_ARENA_SHOOTER__?.ship.position ?? [0, 0, 0]);
  expect(moved[0]).toBeGreaterThan((before[0] ?? 0) + 0.05);

  expect(errors).toEqual([]);
  const canvasBounds = await page.evaluate(() => {
    const element = document.querySelector("canvas");
    if (!(element instanceof HTMLCanvasElement)) return null;
    const bounds = element.getBoundingClientRect();
    return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  });
  expect(canvasBounds?.width ?? 0).toBeGreaterThan(0);
  expect(canvasBounds?.height ?? 0).toBeGreaterThan(0);
  mkdirSync(resolve("tests/reports"), { recursive: true });
  writeFileSync(resolve("tests/reports/route-health.json"), `${JSON.stringify({
    template: "arena-shooter", url: page.url(), canvasBounds, proof, source, moved, errors
  }, null, 2)}\n`);
});
