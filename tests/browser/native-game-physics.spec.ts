import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createServer, type Plugin, type ViteDevServer } from "vite";
import { installedAuraPackageAliases } from "./installed-package-resolve";

// Phase A writes this installed-consumer probe. Run only in Phase B against the
// frozen candidate; it must not silently resolve the source workspace.
const moduleId = "virtual:aura3d-native-game-physics";
const resolvedId = `\0${moduleId}`;
const fixture = String.raw`
import { game as kit, lights, physics, primitives, scene } from "@aura3d/engine";
import { createGame } from "@aura3d/engine/game";

const host = document.querySelector("#stage");
const buildScene = () => scene()
  .add(lights.studio())
  .add(primitives.box({ name: "player" }).position(0, 2, 0).runtime(kit.runtimeNode("player")))
  .add(primitives.box({ name: "floor", size: [12, 1, 3] }).position(0, -0.5, 0));
const world = physics.world({ gravity: [0, -9.81, 0], fixedDelta: 1 / 60 });
world.createBody({ type: "static", position: [0, -0.5, 0], shape: physics.box(6, 0.5, 1.5) });
const body = world.createBody({ type: "dynamic", position: [0, 2, 0], shape: physics.box(0.5, 0.5, 0.5) });
let cuePlayed = 0;
const shell = createGame({
  id: "native-game-physics", target: host, autoStart: false, scene: buildScene,
  input: { actions: { left: ["ArrowLeft"], right: ["ArrowRight"] }, axes: { x: { negative: "left", positive: "right" } } },
  hud: { widgets: [{ id: "score", kind: "score", anchor: "top-left", label: "Score", rollMs: 0 }] },
  touch: { preset: "dpad-2btn", bindings: { left: "left", right: "right" } },
  sound: { cues: { pulse: { id: "pulse", play(context, destination) {
    cuePlayed += 1;
    const oscillator = context.createOscillator();
    oscillator.frequency.value = 440;
    oscillator.connect(destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.03);
  } } } },
  juice: { pulse: { cue: "pulse", fx: { kind: "spark", count: 4 } } }
});
let node = shell.app.nodes.require("player");
let frames = 0;
function advance(dt) {
  const x = shell.input.axis("x") * 3;
  body.setVelocity([x, body.velocity[1], body.velocity[2]]);
  world.step(dt);
  node.setPosition(...body.position);
  shell.hud.set("score", Math.round(body.position[0] * 10));
}
const detach = shell.runtime.onFrame(({ dt }) => {
  if (shell.session.paused || dt <= 0) return;
  advance(dt);
  frames += 1;
});
shell.start();
await shell.ready();
window.__AURA3D_GAME_PHYSICS__ = {
  state: () => ({
    x: body.position[0], y: body.position[1], nodeX: node.position[0],
    frames, session: shell.session.state, runtimePaused: shell.runtime.paused,
    contacts: world.contacts().length, liveFx: shell.fx.liveCount,
    hud: shell.hud.snapshot().widgets, sound: shell.sound?.evidence, cuePlayed,
    replay: shell.input.recorded(), disposed: shell.runtime.disposed
  }),
  pause: () => shell.session.pause(),
  resume: () => shell.session.resume(),
  reset: () => { world.reset(); shell.input.replay([], 0); node.setPosition(...body.position); shell.hud.set("score", 0); },
  replay: (events) => {
    world.reset();
    shell.input.replay(events, 0);
    for (let i = 0; i < 30; i += 1) advance(1 / 60);
    return [...body.position];
  },
  pulse: async () => { await shell.sound.unlock(); shell.juice.fire("pulse"); },
  isDisposed: () => shell.runtime.disposed,
  async dispose() { detach(); await shell.dispose(); world.dispose(); }
};
`;

function fixturePlugin(): Plugin {
  return {
    name: "native-game-physics-fixture",
    resolveId(id) { return id === moduleId ? resolvedId : undefined; },
    load(id) { return id === resolvedId ? fixture : undefined; },
    configureServer(server) {
      server.middlewares.use("/native-game-physics.html", (_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div id="stage" style="position:relative;width:640px;height:480px"></div><script type="module" src="/@id/__x00__virtual:aura3d-native-game-physics"></script>');
      });
    }
  };
}

interface FixtureState {
  x: number; y: number; nodeX: number; frames: number; session: string; runtimePaused: boolean;
  contacts: number; liveFx: number; cuePlayed: number; disposed: boolean;
  hud: readonly { id: string; value: unknown }[];
  sound?: { playedCueCount: number; errors: readonly string[] };
  replay: readonly { frame: number; time: number; type: "press" | "release"; binding: string }[];
}
interface FixtureApi {
  state(): FixtureState;
  pause(): void;
  resume(): void;
  reset(): void;
  replay(events: FixtureState["replay"]): number[];
  pulse(): Promise<void>;
  isDisposed(): boolean;
  dispose(): Promise<void>;
}

type FixtureWindow = Window & { __AURA3D_GAME_PHYSICS__: FixtureApi };
let server: ViteDevServer;
let origin: string;

test.beforeAll(async () => {
  const root = process.env.A3D_INSTALLED_PACKAGE_ROOT;
  if (!root) throw new Error("A3D_INSTALLED_PACKAGE_ROOT must identify the frozen candidate consumer");
  const aliases = installedAuraPackageAliases();
  for (const name of ["@aura3d/engine", "@aura3d/engine/game"]) {
    const entry = aliases.find((alias) => alias.find === name);
    if (!entry || realpathSync(entry.replacement).includes("/packages/")) {
      throw new Error(`${name} must resolve to the installed candidate`);
    }
  }
  server = await createServer({
    root: process.cwd(), logLevel: "error", resolve: { alias: [...aliases] },
    server: { fs: { allow: [process.cwd(), resolve(root)] } }, plugins: [fixturePlugin()]
  });
  await server.listen(0);
  origin = server.resolvedUrls?.local[0] ?? "";
  if (!origin) throw new Error("The installed candidate test server has no local origin");
});
test.afterAll(async () => { await server?.close(); });

async function state(page: Page): Promise<FixtureState> {
  return page.evaluate(() => (window as unknown as FixtureWindow).__AURA3D_GAME_PHYSICS__.state());
}

test("installed game connects keyboard, touch, physics, HUD, audio, FX, pause, replay and cleanup", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin}native-game-physics.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean((window as Partial<FixtureWindow>).__AURA3D_GAME_PHYSICS__), undefined, { timeout: 90_000 });
  await expect(page.locator("#stage canvas")).toBeVisible();
  await page.waitForFunction(() => (window as unknown as FixtureWindow).__AURA3D_GAME_PHYSICS__.state().contacts > 0);

  await page.evaluate(() => (window as unknown as FixtureWindow).__AURA3D_GAME_PHYSICS__.reset());
  const start = await state(page);
  await page.keyboard.down("ArrowRight");
  await page.waitForFunction((x) => (window as unknown as FixtureWindow).__AURA3D_GAME_PHYSICS__.state().x > x + 0.25, start.x);
  await page.keyboard.up("ArrowRight");
  const moved = await state(page);
  expect(Math.abs(moved.nodeX - moved.x)).toBeLessThan(0.05);
  expect(moved.hud.find((widget) => widget.id === "score")?.value).toBeGreaterThan(0);
  expect(moved.replay.some((event) => event.type === "press" && event.binding === "ArrowRight")).toBe(true);

  await page.evaluate(() => (window as unknown as FixtureWindow).__AURA3D_GAME_PHYSICS__.pause());
  const paused = await state(page);
  await page.waitForTimeout(100);
  const pausedAgain = await state(page);
  expect(pausedAgain.session).toBe("paused");
  expect(pausedAgain.runtimePaused).toBe(true);
  expect(pausedAgain.x).toBe(paused.x);
  expect(pausedAgain.frames).toBe(paused.frames);
  const press = moved.replay.filter((event) => event.type === "press" && event.binding === "ArrowRight").slice(0, 1);
  const replay = await page.evaluate((events) => {
    const api = (window as unknown as FixtureWindow).__AURA3D_GAME_PHYSICS__;
    return [api.replay(events), api.replay(events)];
  }, press);
  expect(replay[0][0]).toBeGreaterThan(0.5);
  expect(replay[0]).toEqual(replay[1]);
  await page.evaluate(() => { const api = (window as unknown as FixtureWindow).__AURA3D_GAME_PHYSICS__; api.reset(); api.resume(); });

  const right = page.locator('[data-control="right"]');
  const touchStartX = (await state(page)).x;
  await right.dispatchEvent("touchstart", { bubbles: true });
  await expect(right).toBeVisible();
  await page.waitForFunction((x) => (window as unknown as FixtureWindow).__AURA3D_GAME_PHYSICS__.state().x > x + 0.2, touchStartX);
  await right.dispatchEvent("touchend", { bubbles: true });

  await page.locator("#stage").click({ position: { x: 300, y: 150 } });
  await page.evaluate(() => (window as unknown as FixtureWindow).__AURA3D_GAME_PHYSICS__.pulse());
  await page.waitForFunction(() => (window as unknown as FixtureWindow).__AURA3D_GAME_PHYSICS__.state().cuePlayed > 0);
  const pulsed = await state(page);
  expect(pulsed.liveFx).toBeGreaterThan(0);
  expect(pulsed.sound?.playedCueCount).toBeGreaterThan(0);
  expect(pulsed.sound?.errors).toEqual([]);

  await page.evaluate(() => (window as unknown as FixtureWindow).__AURA3D_GAME_PHYSICS__.dispose());
  expect(await page.evaluate(() => (window as unknown as FixtureWindow).__AURA3D_GAME_PHYSICS__.isDisposed())).toBe(true);
  await expect(page.locator(".a3g-hud, .a3g-touch, .a3g-juice-overlay")).toHaveCount(0);
  expect(errors).toEqual([]);
});
