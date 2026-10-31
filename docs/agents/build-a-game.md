# Build a game with Aura3D

Version: 4.7.1 (kits: 4.1.0 and later). One page, one path: a complete, mobile-friendly, testable browser game from the library kits, with nothing for you to invent. Read `llms.txt` and `docs/agents/claims-and-boundaries.md` first.

Every snippet below is a file in `docs/agents/samples/coin-dash/`, type-checked against the repository source (`tsc -p docs/agents/samples/coin-dash/tsconfig.json`, strict, `@aura3d/engine`, `@aura3d/engine/game`, `@aura3d/debug`). It has not been run in a browser from this page: run the verification steps in section 8 before you claim anything about it.

Before you start and before you ship, use [`new-game-checklist.md`](new-game-checklist.md); every mistake it guards against is catalogued in [`lessons-learned.md`](lessons-learned.md). Run `node tools/game-checks/run.mjs <game-slug>` for the static checks.

## 0. The path

| Step | You write | The library gives you |
| --- | --- | --- |
| 1 Scaffold | nothing | `npx create-aura3d@latest my-game --template mini-game` |
| 2 Simulation | one pure TypeScript module | `createCountedRng`, fixed step constant |
| 3 Assets | a manifest of GLBs | `defineModelAssets` (same-origin URL, sha256, provenance) |
| 4 Shell | one `createGame` call | HUD, touch, sound, juice, pause, tab-hide handling, evidence beacon |
| 5 Loop | step and present functions | `createFixedStepLoop` |
| 6 QA | state snapshot | `installQaHooks`, `readQaParams` |
| 7 Safety | one call | `installSafetyNet` (`?diag=1`, black-frame self-heal) |
| 8 Verify | one spec | remote runner, `check-deploy` |

Do not hand-roll a HUD, a touch layer, a fixed-step loop, QA hooks, a synth or a black-frame guard. Eleven ports did, and each of those is now library surface.

## 1. Pick the kit entry

Import `createGame` from `@aura3d/engine/game` (the real kit). The `createGame` on `@aura3d/engine` is a headless stub that logs `CREATE_GAME_STUB`. Importing the `/game` entry turns the `game` lane on; do not add a `qualityRebuild` flag list. See `docs/api/game-kit.md`.

## 2. The simulation (pure, deterministic)

No DOM, no `Math.random`, no `Date`, no `performance.now`. Same seed and same inputs give the same state, which is what makes replay gates possible (Aura Slam matches its original bit for bit; the Crayon ports to 1e-6 or better).

```ts
// sim.ts
import { createCountedRng } from "@aura3d/engine";

export const FIXED_DT = 1 / 60;
export const ARENA_HALF_WIDTH = 6;

export interface DashInput {
  readonly left: boolean;
  readonly right: boolean;
}

export interface DashState {
  readonly frame: number;
  readonly playerX: number;
  readonly coinX: number;
  readonly score: number;
  readonly timeLeft: number;
  readonly over: boolean;
}

export type DashEvent = "coin" | "timeout";

export interface Dash {
  state(): DashState;
  step(input: DashInput): readonly DashEvent[];
  reset(seed?: number): void;
}

export function createDash(seed: number): Dash {
  const rng = createCountedRng(seed);
  let frame = 0;
  let playerX = 0;
  let score = 0;
  let timeLeft = 30;
  let over = false;
  let coinX = rng.range(-ARENA_HALF_WIDTH, ARENA_HALF_WIDTH);

  return {
    state: () => ({ frame, playerX, coinX, score, timeLeft, over }),
    step(input) {
      const events: DashEvent[] = [];
      if (over) return events;
      frame++;
      playerX = Math.max(-ARENA_HALF_WIDTH, Math.min(ARENA_HALF_WIDTH, playerX + ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * 6 * FIXED_DT));
      if (Math.abs(playerX - coinX) < 0.6) {
        score++;
        coinX = rng.range(-ARENA_HALF_WIDTH, ARENA_HALF_WIDTH);
        events.push("coin");
      }
      timeLeft = Math.max(0, timeLeft - FIXED_DT);
      if (timeLeft === 0) {
        over = true;
        events.push("timeout");
      }
      return events;
    },
    reset(nextSeed) {
      rng.reset(nextSeed);
      frame = 0;
      playerX = 0;
      score = 0;
      timeLeft = 30;
      over = false;
      coinX = rng.range(-ARENA_HALF_WIDTH, ARENA_HALF_WIDTH);
    }
  };
}
```

## 3. Typed assets

Every character, vehicle, creature and landmark is a GLB admitted through the asset pipeline, never a primitive and never a raw URL (`tests/unit/agent-api/public-example-boundary.test.ts` enforces it for public examples). Get GLBs from the catalog (`aura3d assets search`), your own files (`aura3d assets add`) or Meshy through Kiro Prism (`meshy-cli` skill). `defineModelAssets` validates the sha256 and URL, and `?models=0` falls back to your stand-in. See `docs/api/model-loader.md`.

```ts
// assets.ts
import { defineModelAssets } from "@aura3d/engine";

export const assets = defineModelAssets(
  {
    hero: {
      url: new URL("./assets/hero.glb", import.meta.url).pathname,
      sha256: "0".repeat(64),
      sizeBytes: 1_200_000
    }
  },
  { license: "Own text prompt, generated with Meshy through Kiro Prism, 2026-10-24" }
);
```

## 4. The route: shell, loop, QA, safety

```ts
// main.ts
import { camera, createFixedStepLoop, game, installQaHooks, lights, primitives, readQaParams, scene } from "@aura3d/engine";
import { createGame, sfxUrl } from "@aura3d/engine/game";
import { installSafetyNet } from "@aura3d/debug";
import { assets } from "./assets";
import { createDash, FIXED_DT, type DashInput } from "./sim";

const qa = readQaParams({ seed: { type: "number", default: 1 }, manual: { type: "flag" } });
const sim = createDash(qa.seed);
let ready = false;
let frames = 0;
let scripted: Partial<DashInput> | undefined;

function buildScene() {
  return scene()
    .background("#0b1020")
    .add(lights.ambient({ color: "#dce8f5", intensity: 0.5 }))
    .add(lights.directional({ position: [-6, 9, 6], target: [0, 0, 0], intensity: 0.9 }))
    .camera(camera.perspective({ position: [0, 5, 9], target: [0, 0.5, 0], fov: 50 }))
    .addMany([
      primitives.plane({ name: "floor", size: [20, 8, 1] }).rotate(-Math.PI / 2, 0, 0),
      assets.node("hero", { name: "hero" }, () => primitives.capsule({ name: "hero-stand-in", size: [0.8, 1.6, 0.8] })).runtime(game.runtimeNode("hero")),
      primitives.sphere({ name: "coin", size: [0.5, 0.5, 0.5] }).runtime(game.runtimeNode("coin"))
    ]);
}

const g = createGame({
  id: "coin-dash",
  target: "#app",
  scene: buildScene,
  input: { actions: { left: ["KeyA", "ArrowLeft"], right: ["KeyD", "ArrowRight"], restart: ["KeyR"] }, bufferMs: 120 },
  hud: {
    theme: "arcade-neon",
    widgets: [
      { id: "score", kind: "score", anchor: "top-left", label: "Coins" },
      { id: "time", kind: "objective", anchor: "top-right", label: "Time" }
    ]
  },
  touch: { preset: "dpad-2btn", bindings: { left: "left", right: "right" } },
  sound: {
    cues: {
      coin: { id: "coin", asset: { url: sfxUrl("pickup.coin.00") }, volume: 0.7 },
      end: { id: "end", asset: { url: sfxUrl("stinger.win.00") }, volume: 0.8 }
    }
  },
  juice: {
    coin: { punch: { fovDeg: 1.4, ms: 140 }, flash: { color: "#ffd94a", peak: 0.12, ms: 160 } },
    timeout: { hitStop: 0.05, shake: 0.2 }
  }
});

const app = g.app;
const net = installSafetyNet({ safety: new URLSearchParams(location.search).has("safety"), canvas: document.querySelector("canvas") ?? undefined, app });

function readInput(): DashInput {
  const pressed = g.input;
  return {
    left: scripted?.left ?? pressed?.held("left") ?? false,
    right: scripted?.right ?? pressed?.held("right") ?? false
  };
}

function present(): void {
  const s = sim.state();
  app.nodes.require("hero").setPosition(s.playerX, 0.8, 0);
  app.nodes.require("coin").setPosition(s.coinX, 0.5, 0);
  g.hud.set("score", s.score);
  g.hud.set("time", s.timeLeft.toFixed(1));
}

function finish(): void {
  g.sound?.cue("end");
  void g.hud.banner(`Time! ${sim.state().score} coins. Press R to restart`, { holdMs: 2400 });
}

function stepOnce(input: DashInput): void {
  for (const event of sim.step(input)) {
    if (event === "coin") { g.sound?.cue("coin"); g.juice.fire("coin"); }
    if (event === "timeout") { g.juice.fire("timeout"); finish(); }
  }
}

const loop = createFixedStepLoop({
  stepSeconds: FIXED_DT,
  manual: qa.manual,
  isActive: () => ready && !g.session.paused,
  step: () => stepOnce(readInput()),
  render: () => {
    if (sim.state().over && g.input?.pressed("restart")) sim.reset();
    present();
    net.sample(++frames);
  }
});

const hooks = installQaHooks<ReturnType<typeof sim.state>, DashInput>("coin-dash", {
  ready: () => ready,
  seed: qa.seed,
  state: () => sim.state(),
  stepFrames: (n, input) => { scripted = input; loop.advance(n); scripted = undefined; },
  reset: (seed) => { sim.reset(seed); present(); },
  app: () => app
});

g.start();
g.ready().then(() => { ready = true; present(); loop.start(); }).catch((error: unknown) => { hooks.reportError(error); throw error; });
```

What each piece does, so you can change it safely:

- `createGame({ ... })` mounts the app and owns lifecycle: pause on tab hide, the `playing` / `paused` / `results` states on `g.session`, the DOM HUD, touch controls for the preset, sound cues and juice events. `g.start()` begins it and `g.ready()` resolves when the first frame is presented.
- HUD widgets: `score`, `timer`, `meter`, `combo`, `lives`, `objective`, `speedometer`, `prompt`, `minimap`, `indicator`. Themes: `arcade-neon`, `motorsport`, `sports-broadcast`, `sci-fi-telemetry`, `fighting`, `tabletop`, `plain`. Anchors have a `mobileAnchor` override. Set values with `g.hud.set(id, value)`; announce with `g.hud.banner(text)` and `g.hud.toast(text)`. The sample uses a text widget for the clock because it was not exercised against the `timer` widget's `mode` option.
- Touch presets: `twin-stick`, `dpad-2btn`, `dpad-4btn`, `steer-pedals`, `aim-drag`, `flight`, `lane-swipe`, `flippers`. `bindings` map a touch control to one of your input actions, so keyboard and touch share one code path.
- Sound: `sfxUrl(id)` selects from the bundled effects pack (`SFX_IDS`). For synthesized sound with no assets, use `createCueBank` from `@aura3d/engine/audio` (`docs/api/audio-synth.md`) and bind `play` to simulation events, never to key presses, so replays sound the same.
- Juice: `g.juice.fire(event)` runs the matching camera punch, flash, shake, hit-stop and rumble together. Keep event names identical to simulation events.
- `createFixedStepLoop` turns variable frame time into fixed simulation steps (frame clamp 0.1 s, catch-up cap 6). With `?manual=1` only `stepFrames` advances it.
- `installQaHooks("coin-dash", ...)` publishes `window.__AURA_COIN_DASH__` with `ready()`, `state()`, `stepFrames(n, input?)`, `reset(seed?)` and the first-error slot `__AURA_COIN_DASH_ERROR__`. Keep `state()` plain data (`docs/api/qa-kit.md`).
- `installSafetyNet` is opt-in. With `safety` false it is inert. Ship it on any route real players reach (the black-frame ladder reloads one quality rung lower only when the canvas stays black after the app is ready). See `docs/api/safety-net.md`.
- Results screens: the shipped games render their own results DOM; `g.shell.showResults(values)` exists but no shipped game uses it, so treat it as untried and verify it before relying on it.

## 5. Rendering rules

- Look first: apply a genre look (`looks.preset(...)`, `docs/agents/art-direction.md`) before adding props. A mechanic-correct game on flat light and an empty void is `prototype`.
- Draw calls: instance or merge repeated props (`instances.mesh`, `instances.scatter`, `geometry.mergeStatic`, `docs/api/scatter-merge.md`); no shadow casting on small props. Budgets are per game and written down: Aura Slam's is 150 draw calls and it measured 119 live. Read your numbers from `app.diagnostics()` or the `?diag=1` panel.
- Custom shaders use the chunk registry (`#include <a3d_...>`, `docs/api/glsl-chunks.md`): it carries NaN-safe `pow`, noise and sky helpers, which fixed black frames on Apple GPUs.
- Fonts: only the licensed font library and dense UI preset that the machine policy in `AGENTS.md` points to. Never Inter, Roboto, Geist, Google Fonts or system stacks.
- First frame: `await app.ready()` settles the mount, not the shader programs. Programs compile asynchronously and a draw whose program is still compiling is skipped, so a game that renders straight after `ready()` shows part of the scene (a missing road, missing buildings) for seconds on a slow or busy GPU. Call `await warmPrograms(app)` (from `@aura3d/engine/game`) before showing the first frame or marking the game ready: it settles the programs, steps one frame so the renderer kicks the exact feature records, then settles again. If the scene requested an environment HDRI that is still loading, it waits for it (up to `environmentTimeoutMs`, default 20 s; `waitForEnvironment: false` turns that off) and settles again, because the HDRI landing switches every material to its image-based-lighting program and would otherwise recompile the scene after the game believed it was ready. It also waits for pending texture upgrades (`renderer.runtime.texturedMaterials` with status `pending`; up to `textureTimeoutMs`, default 20 s; `waitForTextures: false` turns that off) for the same reason: a material that gains its texture switches to a textured program variant that compiles asynchronously. The result reports `environmentReady` and `texturesReady`.
- Reuse library effects instead of porting shaders: `effects.toon` (`docs/api/toon.md`) for cel looks. The chase camera rig and objective marker pages are linked from `docs/api/game-kit.md` as they land.

## 6. Racket and ball sports

`game.racketSports()` gives `ballFlight` (exact event-time bounce, net, tape and boards), `scoring` (game, match and tiebreak state machine, tennis by default) and `athleteRig` (`docs/api/ball-flight.md`, `docs/api/racket-athlete-rig.md`). Line calls, AI and costumes stay game code. Aura Slam (`examples/aura-slam/`) is the reference.

## 7. Seeded randomness and scattering

Use `createCountedRng(seed)` (mulberry32 with a `draws` counter) for anything the replay must reproduce. For props use `scatterAlongPath`, `scatterInArea` and `scatterTransforms`; they are deterministic and take a seed.

## 8. Verify (remote only)

Never run Playwright, Chromium, Docker or heavy builds on the Mac. Run browser specs through `tools/remote-acr/run.sh` (serverless ACR on `az-auraone-gurbaksh`, software WebGL2):

```bash
SPECS="tests/browser/coin-dash.spec.ts" RUN_ID=coindash-1 tools/remote-acr/run.sh   # spec copied from docs/agents/samples/coin-dash/
```

Software GL proves correctness, replay and draw-call counts. It is not GPU performance evidence; say so in any report.

A minimal determinism spec (type-checked):

```ts
// coin-dash.spec.ts
import { expect, test } from "@playwright/test";

test("coin dash is deterministic and renders", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("/?manual=1&seed=7");
  await page.waitForFunction(() => (window as unknown as { __AURA_COIN_DASH__?: { ready(): boolean } }).__AURA_COIN_DASH__?.ready() === true);
  const run = () => page.evaluate(() => {
    const qa = (window as unknown as { __AURA_COIN_DASH__: { reset(seed?: number): void; stepFrames(n: number): void; state(): unknown } }).__AURA_COIN_DASH__;
    qa.reset(7);
    qa.stepFrames(600);
    return qa.state();
  });
  expect(await run()).toEqual(await run());
  expect(errors).toEqual([]);
});
```

Then the asset and deploy gates:

```bash
npx @aura3d/cli@latest assets validate --no-placeholders --require-license
npx @aura3d/cli@latest assets validate-game
npx @aura3d/cli@latest check-deploy --dist dist
```

Minimum evidence for a public game (full list in `docs/agents/game-example-standards.md`): input changes state, restart works after win and fail, an objective and a fail condition exist, 60 seconds of player-driven play, replay hash stable, 0 console errors, draw calls within budget, desktop and mobile frames.

## 9. Claims

Use the labels in `docs/agents/claims-and-boundaries.md`. A game is `prototype` until the gates in section 8 pass on the exact route. Do not write "faster than three.js" or "drop-in"; the measured claim is shorter scene source and one import (`evidence/vs-threejs/RESULTS.md`, software GL, one author).

## 10. Known gaps to report, not hide

- The kit's results screen is unexercised by shipped games.
- `createBindingStore` (rebindable keys) is private to `@aura3d/game` until published through the game kit.
- If a rule you need is missing, write it route-local, label it in the notes and add a library task.

## Believable motion (characters, contacts)

Use the motion kit from `@aura3d/engine/game` instead of hand-rolling per game:

| Need | Use | Page |
|---|---|---|
| bat, club, ball in the hand | `attachToBone` | [motion-attach](../api/motion-attach.md) |
| legs that match the ground | `createLocomotion`, `proceduralLegSwing` | [motion-locomotion](../api/motion-locomotion.md) |
| prove there is no sliding | `createFootSlideMeter` | [motion-foot-slide](../api/motion-foot-slide.md) |
| walls, gates, bridges that hit back | `createImpactWorld`, `createImpactFeedback` | [motion-impact](../api/motion-impact.md) |
| no shake or jitter | `smoothDamp`, `createRenderInterpolator` | [motion-smoothing](../api/motion-smoothing.md) |
| smooth on 120 and 144 Hz displays (draw between sim steps) | `createFixedStepPresenter`, `createRecordBlend`, `runMotionGate`, `loop.alpha` | [motion-presenter](../api/motion-presenter.md) |
| ghosted or doubled players | `checkDoubleFrame` | [motion-double-frame](../api/motion-double-frame.md) |
| a ball dribbled by hand (hand and floor contact, handoffs, proof) | `createHandBounce`, `measureHandBall` | [motion-hand-bounce](../api/motion-hand-bounce.md) |
| a bat, club, racket or staff held in both hands (grip, hand-off, proof) | `createTwoHandGrip`, `measureGrip` | [motion-two-hand-grip](../api/motion-two-hand-grip.md) |
| enemies, NPCs and opponents that face their target (per-model forward axis, turn rate, proof) | `faceTowards`, `yawToFace`, `facingError` | [motion-facing](../api/motion-facing.md) |

A game with a fixed-step simulation must draw between the last two steps, or it stands still on every second frame on a 120 Hz display. Put `presenter.afterStep()` in the step callback, draw `presenter.present(loop, live)`, and add a unit test that drives the real simulation through `runMotionGate` at 60, 120 and 144 Hz.
