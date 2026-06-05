import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

type Vec3 = [number, number, number];

interface BrowserFightingKit {
  readonly kind: string;
  readonly controls: { readonly actions: Record<string, readonly string[]> };
  readonly moves: Record<string, unknown>;
  readonly input: {
    press(binding: string): void;
    release(binding: string): void;
  };
  readonly bodies: {
    readonly player: { position: Vec3 };
    readonly opponent: { position: Vec3 };
  };
  readonly camera: { snapshot(): { readonly shake: number; readonly zoom: number } };
  readonly effects: { snapshot(): { readonly spawned: number; readonly active: number } };
  update(dt: number): {
    readonly combat: {
      readonly events: readonly { readonly type: string; readonly moveId?: string; readonly damage?: number }[];
      readonly actors: readonly { readonly id: string; readonly health: number; readonly guard: number }[];
    };
  };
  snapshot(): {
    readonly combat: {
      readonly actors: readonly { readonly id: string; readonly health: number; readonly guard: number }[];
    };
  };
}

test.describe("fighting game runtime", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("public fighting kit resolves input, kinematic bodies, hitboxes, camera, and effects in browser", async ({ page }) => {
    await page.goto(`${server.origin}/examples/game-slice/index.html`, { waitUntil: "domcontentloaded" });

    const result = await evaluateFightingRuntime(page);

    expect(result.kind).toBe("aura-fighting-game-kit");
    expect(result.actionCount).toBeGreaterThanOrEqual(8);
    expect(result.moveIds).toEqual(expect.arrayContaining(["heavy", "light", "special", "sweep"]));
    expect(result.hitEvents).toEqual([{ type: "hit", moveId: "light", damage: 6 }]);
    expect(result.opponentHealth).toBeLessThan(100);
    expect(result.effectsSpawned).toBeGreaterThan(0);
    expect(result.maxShake).toBeGreaterThan(0);
    expect(result.zoom).toBeGreaterThan(0);
  });
});

async function evaluateFightingRuntime(page: Page): Promise<{
  readonly kind: string;
  readonly actionCount: number;
  readonly moveIds: readonly string[];
  readonly hitEvents: readonly { readonly type: string; readonly moveId?: string; readonly damage?: number }[];
  readonly opponentHealth: number;
  readonly effectsSpawned: number;
  readonly maxShake: number;
  readonly zoom: number;
}> {
  return page.evaluate(async () => {
    const modulePath: string = "/packages/engine/src/index.ts";
    const engine = await import(modulePath);
    const gameRuntime = (engine as { readonly game: { fighting(options: { readonly autoListen: boolean }): BrowserFightingKit } }).game;
    const kit = gameRuntime.fighting({ autoListen: false });
    const originalRandom = Math.random;
    const events: Array<{ readonly type: string; readonly moveId?: string; readonly damage?: number }> = [];
    let maxShake = 0;

    Math.random = () => 1;
    try {
      kit.bodies.player.position = [0, 0, 0];
      kit.bodies.opponent.position = [0.95, 0, 0];
      kit.input.press("KeyJ");

      for (let frame = 0; frame < 8; frame += 1) {
        const snapshot = kit.update(1 / 60);
        events.push(...snapshot.combat.events.map((event) => ({ type: event.type, moveId: event.moveId, damage: event.damage })));
        maxShake = Math.max(maxShake, kit.camera.snapshot().shake);
      }

      kit.input.release("KeyJ");
    } finally {
      Math.random = originalRandom;
    }

    const opponent = kit.snapshot().combat.actors.find((actor) => actor.id === "opponent");
    const effects = kit.effects.snapshot();
    const camera = kit.camera.snapshot();

    return {
      kind: kit.kind,
      actionCount: Object.keys(kit.controls.actions).length,
      moveIds: Object.keys(kit.moves).sort(),
      hitEvents: events.filter((event) => event.type === "hit"),
      opponentHealth: opponent?.health ?? 0,
      effectsSpawned: effects.spawned,
      maxShake,
      zoom: camera.zoom
    };
  });
}
