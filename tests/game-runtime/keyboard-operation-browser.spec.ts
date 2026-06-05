import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../browser/example-dev-server";

test.describe("game runtime keyboard operation browser source", () => {
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("keyboard input drives combat events, effects, and HUD bindings without query selectors", async ({ page }) => {
    await page.goto(`${server.origin}/examples/game-slice/index.html`, { waitUntil: "domcontentloaded" });
    await installKeyboardHarness(page);

    await page.keyboard.down("KeyJ");
    const first = await page.evaluate(() => window.__AURA3D_KEYBOARD_OPERATION__?.step());
    await page.keyboard.up("KeyJ");
    const second = await page.evaluate(() => window.__AURA3D_KEYBOARD_OPERATION__?.step());
    await page.keyboard.down("KeyK");
    const guard = await page.evaluate(() => window.__AURA3D_KEYBOARD_OPERATION__?.step());
    await page.keyboard.up("KeyK");
    await page.keyboard.down("ShiftLeft");
    const dash = await page.evaluate(() => window.__AURA3D_KEYBOARD_OPERATION__?.step());
    await page.keyboard.up("ShiftLeft");

    expect(first?.lightPressed).toBe(true);
    expect(first?.controlsProofId).toBe("controls");
    expect(first?.events).toEqual(expect.arrayContaining(["hit"]));
    expect(first?.hudChangedIds).toEqual(expect.arrayContaining(["hud:rival:health"]));
    expect(first?.effectsSpawned).toBeGreaterThan(0);
    expect(second?.lightReleased).toBe(true);
    expect(guard?.guardHeld).toBe(true);
    expect(dash?.dashPressed).toBe(true);

    await page.evaluate(() => window.__AURA3D_KEYBOARD_OPERATION__?.dispose());
  });
});

async function installKeyboardHarness(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const modulePath: string = "/packages/engine/src/index.ts";
    const engine = await import(modulePath);
    const input = engine.game.input({
      actions: {
        moveLeft: ["KeyA", "ArrowLeft"],
        moveRight: ["KeyD", "ArrowRight"],
        light: ["KeyJ"],
        guard: ["KeyK"],
        dash: ["ShiftLeft", "ShiftRight"]
      },
      axes: {
        moveX: { negative: "moveLeft", positive: "moveRight" }
      },
      autoListen: true,
      target: window
    });
    const combat = engine.game.combatWorld();
    const effects = engine.game.effects();
    combat.addActor({ id: "player", team: "p1", position: [0, 0, 0], facing: 1 });
    combat.addActor({ id: "rival", team: "p2", position: [0.86, 0, 0], facing: -1, health: 100 });

    window.__AURA3D_KEYBOARD_OPERATION__ = {
      step() {
        const inputSnapshot = input.update(1 / 60);
        if (inputSnapshot.actions.light?.pressed) {
          combat.beginAttack("player", {
            id: "keyboard-light",
            damage: 8,
            activeFrames: [1, 1],
            durationFrames: 4,
            hitboxes: [{ id: "keyboard-light-hitbox", offset: [0.62, 0.86, 0], size: [0.52, 0.36, 0.46] }]
          });
        }
        const combatSnapshot = combat.update(1 / 60);
        const bridge = engine.game.combatEvents(combatSnapshot.events, {
          combat: combatSnapshot,
          effects,
          hudBindings: [engine.game.hud.health({ actorId: "rival", label: "Rival health" })],
          rules: { maxHealth: 100 }
        });
        return {
          controlsProofId: "controls",
          lightPressed: inputSnapshot.actions.light?.pressed === true,
          lightReleased: inputSnapshot.actions.light?.released === true,
          guardHeld: inputSnapshot.actions.guard?.held === true,
          dashPressed: inputSnapshot.actions.dash?.pressed === true,
          moveAxis: inputSnapshot.axes?.moveX ?? 0,
          events: combatSnapshot.events.map((event) => event.type),
          hudChangedIds: bridge.hud?.changedIds ?? [],
          effectsSpawned: effects.snapshot().spawned
        };
      },
      dispose() {
        input.dispose();
      }
    };
  });
}

declare global {
  interface Window {
    __AURA3D_KEYBOARD_OPERATION__?: {
      step(): {
        readonly controlsProofId: "controls";
        readonly lightPressed: boolean;
        readonly lightReleased: boolean;
        readonly guardHeld: boolean;
        readonly dashPressed: boolean;
        readonly moveAxis: number;
        readonly events: readonly string[];
        readonly hudChangedIds: readonly string[];
        readonly effectsSpawned: number;
      };
      dispose(): void;
    };
  }
}
