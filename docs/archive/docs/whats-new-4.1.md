# What's new in Aura3D 4.1

4.1 is a large release. It came out of porting eleven browser games onto the public engine surface, fixing what that exposed, and moving the code every game had copied into the library. Most of it is additive. A short list of behaviour changes is in [`docs/migration/4.0-to-4.1.md`](migration/4.0-to-4.1.md); read it before upgrading a shipped route.

Each section below has a short example. The API names and options were checked against the source; the per-topic pages under [`docs/api/`](../../api/readme.md) have the full reference.

- [Game kit](#game-kit-aura3denginegame)
- [QA and replay hooks](#qa-and-replay-hooks)
- [Safety net and diagnostics](#safety-net-and-diagnostics)
- [Procedural audio](#procedural-audio-aura3daudio)
- [Production model loader](#production-model-loader)
- [GLSL chunk library](#glsl-chunk-library-for-materialcustom)
- [Scatter and static merge](#scatter-and-static-merge)
- [Racket-sport kit](#racket-sport-kit)
- [CLI asset tools](#cli-asset-tools)
- [Engine fixes you will notice](#engine-fixes-you-will-notice)
- [Verified and not verified](#verified-and-not-verified)

## Game kit (`@aura3d/engine/game`)

The game shell (lifecycle, pause and results, DOM HUD, touch controls, juice, sound) already shipped as the `./game` subpath of `@aura3d/engine`. What changes in 4.1: importing `createGame` from that subpath now turns the real kit on by itself. In 4.0 it returned the headless stub unless you passed `qualityRebuild: { flags: ["game"] }`.

```ts
import { createGame } from "@aura3d/engine/game";

const game = createGame({
  id: "my-route",
  target: "#app",
  scene: buildScene,
  hud: { theme: "motorsport", widgets: [] },
  touch: { preset: "steer-pedals", bindings: { throttle: "throttle", brake: "brake" } }
});

game.start();
await game.ready();
```

`createGame` from the root `@aura3d/engine` is still the headless stub; it now logs `CREATE_GAME_STUB` once and points you to the subpath. To opt out of the real kit use `?a3d-qr=-game`, `A3D_QR_GAME=0`, or `qualityRebuild: { flags: ["-game"] }` / `"none"`. Reference: [`docs/api/game-kit.md`](../../api/game-kit.md).

## QA and replay hooks

Every game used to copy the same hooks and fixed-timestep loop into its `main.ts`. They are now public: `installQaHooks`, `createFixedStepLoop` (alias `fixedStepLoop`), `readQaParams`, `createCountedRng`, `qaHookGlobalName`, `qaErrorGlobalName`, all from `@aura3d/engine`.

```ts
import { createFixedStepLoop, createCountedRng, installQaHooks, readQaParams } from "@aura3d/engine";

const config = readQaParams({
  seed: { type: "number", default: 1 },
  manual: { type: "flag" },
  warmup: { type: "int", default: 30 }
});

const rng = createCountedRng(config.seed);     // mulberry32 with a draw counter
let ready = false;

const loop = createFixedStepLoop({
  manual: config.manual,                       // only stepFrames/advance move the sim
  isActive: () => ready,
  step: () => sim.advance(readInput(), rng),
  render: () => draw()
});

const qa = installQaHooks("my-game", {         // window.__AURA_MY_GAME__
  ready: () => ready,
  seed: config.seed,
  state: () => sim.snapshot(),
  stepFrames: (n, input) => { loop.advance(n); },
  reset: (seed) => { rng.reset(seed); sim.reset(); },
  app: () => app
});

loop.start();
```

A spec then drives `window.__AURA_MY_GAME__.stepFrames(120)` and compares `state()` with a recorded reference. The first error is kept in `window.__AURA_MY_GAME_ERROR__` through `qa.reportError(error)`. Reference: [`docs/api/qa-kit.md`](../../api/qa-kit.md).

## Safety net and diagnostics

Real GPUs differ from the software renderers used in CI. `@aura3d/debug` now has an opt-in `installSafetyNet` that parses the shared quality URL switches (`?post=0 ?shadow=0 ?env=0 ?sky=0 ?aa=0 ?quality=low ?tm=aces ?heal=0 ?diag=1`), reloads one rung down a compatibility ladder when the canvas stays black, and shows a GPU diagnostics panel with `?diag=1`.

```ts
import { installSafetyNet } from "@aura3d/debug";

const net = installSafetyNet({ safety: true, canvas, app });
const { post, shadow, env, quality } = net.switches; // read before building the scene

// in your frame loop, after a frame is drawn:
net.sample(framesDrawn);
```

Nothing runs unless `safety` is `true` or a settings object. The ladder rungs are `no-aa`, `no-post`, `aces-tone`, `no-env`, `no-shadow` and `low-quality`; the reload logs `SAFETY_BLACK_FRAME`, and the next load logs `SAFETY_COMPAT_MODE` with the rung in force. A URL parameter you set always wins over a rung. Reference: [`docs/api/safety-net.md`](../../api/safety-net.md).

## Procedural audio (`@aura3d/audio`)

A sample-free cue bank, a step sequencer, a parameter-driven tone bed and a recorded-take player, all on the page's single `AudioContextManager`. Also exported from `@aura3d/engine/audio`.

```ts
import { createCueBank, createStepSequencer, createSampleSlices, noteFrom } from "@aura3d/engine/audio";

const note = noteFrom(523.25); // C5
const bank = createCueBank({
  cues: {
    coin: { layers: [{ freq: note(12), type: "triangle", dur: 0.14, gain: 0.2, slideTo: note(19) }] },
    crash: {
      layers: [
        { freq: 190, type: "sawtooth", dur: 0.32, slideTo: 55 },
        { kind: "noise", dur: 0.26, gain: 0.11, freq: 430, q: 0.7, slideTo: 110 }
      ],
      priority: 1,
      duckMusic: { amount: 0.6, ms: 700 }
    }
  },
  muteKey: "KeyM"
});

bank.install();       // first gesture unlocks audio; M toggles mute
bank.play("coin");

const music = createStepSequencer(bank, {
  bpm: 132,
  step: (index, at, stepSeconds, voice) => voice({ at, dur: stepSeconds * 0.9, freq: note(index % 8), type: "square", gain: 0.05 })
});
music.start();

const slices = createSampleSlices(bank, {
  sprites: { hit: { url: "/audio/racket.wav", offsets: [0, 0.3, 0.6], duration: 0.24 } }
});
slices.preload();
slices.play("hit", { gain: 0.6, pan: -0.2, lowpass: 4400 });
```

`play()` returns `false` instead of throwing when the bank is locked, muted, cooling down or over budget. A slice never repeats the previous take of the same sprite. Reference: [`docs/api/audio-synth.md`](../../api/audio-synth.md).

## Production model loader

The production bridge silently drops any model it cannot trust, so a wrong hash or a cross-origin URL used to draw nothing. `defineModelAssets` declares your GLBs once, validates them when you define them, and carries the procedural fallback as an option instead of a URL hack.

```ts
import { defineModelAssets, primitives, scene } from "@aura3d/engine";

const assets = defineModelAssets(
  {
    hero: { url: new URL("./assets/hero.glb", import.meta.url).pathname, sha256: "<64 hex characters>", animations: ["run", "idle"] },
    tree: { url: new URL("./assets/tree.glb", import.meta.url).pathname, sha256: "<64 hex characters>" }
  },
  { license: "Own text prompt, generated 2026-10-23" }
);

scene({
  children: [
    assets.node("hero", { name: "hero", position: [0, 0, 0] }, () => primitives.capsule({ size: [0.8, 1.6, 0.8] })),
    assets.node("tree", { position: [4, 0, 2] })
  ]
});
```

With `?models=0` in the URL (or `enabled: false`) `assets.node` returns the fallback you passed, or a hidden model when you passed none. A bad `sha256` or a cross-origin URL without a `sourcePath` under `public/aura-assets/` throws `invalid-model-assets` naming the entry. `assets.refs.<id>` works with `model(...)`, `instances.model(...)` and `cloneSkinned(...)`. `modelsEnabledFromUrl(param?, href?)` is exported for code that needs the same rule. Reference: [`docs/api/model-loader.md`](../../api/model-loader.md).

## GLSL chunk library for `material.custom`

Tested helpers you can `#include` in a custom shader: `a3d_math` (saturate, safe divide, sqrt, acos, normalize, remap, `a3dFinite`), `a3d_noise` (sin-free hashes, value and simplex noise, fbm, ridged), `a3d_sky`, `a3d_fog`, `a3d_triplanar`, `a3d_toon`, plus `colorspace_decode` and `colorspace_encode`. All are GLSL ES 3.00, `a3d`-prefixed, NaN-safe and free of `pow`.

```ts
import { material } from "@aura3d/engine";

const ground = material.custom({
  glsl: {
    fragment: `
#include <a3d_noise>
#include <a3d_fog>
out vec4 outColor;
void main() {
  float n = a3dFbm(vWorld.xz * 0.05, 4);
  outColor = vec4(a3dFogExp2(vec3(n), vec3(0.6, 0.7, 0.8), length(vWorld - cameraPosition), 0.004), 1.0);
}`
  }
});
```

A material's own `patch` and chunks registered with `registerShaderChunk` still override these. The chunks are GLSL only, so a material that includes them has no WGSL twin and runs on the default WebGL2 backend. Reference: [`docs/api/glsl-chunks.md`](../../api/glsl-chunks.md).

## Scatter and static merge

A seeded, filter-stable placement planner in front of `instances.*`, and a baker that turns many static parts into one geometry per material.

```ts
import { scatterAlongPath, splitScatterByDistance, scatterTransforms, mergeStatic, instances } from "@aura3d/engine";

const points = scatterAlongPath({ seed: 7, start: 0, end: 2000, path, step: [20, 40], lateral: [12, 90], kinds: 2, scale: [0.8, 1.3] });
const [near, far] = splitScatterByDistance(points, [cameraX, cameraZ], [180]);

instances.model(assets.refs.tree, { transforms: scatterTransforms(near) });

const village = mergeStatic([
  { geometry: houseGeometry, position: [0, 0, 0], rotation: [0, 0.4, 0] },
  { geometry: lampGeometry, position: [6, 0, 2] }
]); // undefined when the list is empty
```

The same seed gives the same layout on every machine, and adding an exclusion zone never moves the placements that survive. An empty list is valid everywhere. Reference: [`docs/api/scatter-merge.md`](../../api/scatter-merge.md).

## Racket-sport kit

`game.racketSports()` gains three pure kits, extracted from the Aura Slam tennis port:

```ts
import { game } from "@aura3d/engine";

const { ballFlight, scoring, athleteRig } = game.racketSports();

const flight = ballFlight({
  units: { x: 5.018, y: 11.885, z: 2.177 },
  gravity: 9.81,
  drag: 0.09,
  net: { centerHeight: 0.914, postHeight: 1.07, halfWidth: 1.08 },
  surfaces: { hard: { rebound: 0.65, retention: 0.79 } }
});

const rules = scoring();                     // tennis defaults; configurable
let state = rules.init(0);
const result = rules.awardPoint(state, 1);   // { state, gameWon, matchWon, tiebreakStarted }
state = result.state;
rules.label(state.points[0], state.points[1]); // "0" / "15" / "30" / "40" / "AD"
```

`ballFlight` is exact event-time flight (closed-form under gravity and drag, bounce, net and board events, a shot solver and a serve solver) and does not depend on frame rate; the older `stepBallPhysics` stays as the simple model. `scoring` is a game, tiebreak and match state machine whose rules (`pointsToGame`, `winBy`, `gamesToMatch`, `matchWinBy`, `tiebreak`) you can change. `athleteRig` has `locomotion()` (stride, split step, slide, planted stance) and `applyLimbs()` (leg, two-bone arm IK and racket posing). The tennis physics replays the original game to 1e-12, and the scoring matches the original over 2,000 seeded matches. References: [`ball-flight.md`](../../api/ball-flight.md) and [`racket-athlete-rig.md`](../../api/racket-athlete-rig.md); scoring is described in the CHANGELOG entry for this release.

## CLI asset tools

| Command | What it does |
| --- | --- |
| `aura3d assets optimize --file in.glb --out out.glb --role hero\|vehicle\|character\|prop\|background` | Role-based vertex and texture budgets. |
| `aura3d assets merge-clips --base rig --out file.glb name=clip ...` | Merge Meshy animation clips onto one rig by node name; rejects a foreign skeleton. |
| `aura3d assets import-meshy <dir> --into <assets-dir> --prefix <game> --name <role>` | Isolated admission in a temporary project; shared manifest files are never touched. |
| `aura3d meshy ledger status\|reserve\|settle\|reconcile\|list` | Credit ledger with per-game and global caps under a lock. |

Inside the Aura3D monorepo, `import-meshy` now runs isolated by default (`--shared-manifest` opts out), because several agents or games writing `aura.assets.json` and `src/aura-assets.ts` at once is a race. The ledger keeps a rate-limited or timed-out call as `unconfirmed` and keeps counting it, because the task usually finishes and is charged. These tools call no Meshy API and handle no credential. Reference: [`docs/api/cli-asset-tools.md`](../../api/cli-asset-tools.md).

## Engine fixes you will notice

- **Directional shadows cover only the caster's footprint.** The receiver depth is now clamped to [0, 1] in every directional sampler. Before, one small caster could darken half of a ground plane (about 80,000 of 230,400 pixels at a 15 degree field of view; about 500 after, and the same kind of drop at 32 and 60 degrees). Scenes will look lighter wherever shadows were over-dark. Measured on software rendering.
- **`instances.mesh` and `batched.mesh` show their textures.** The material's maps (`texture`, `normalMap`, `emissiveMap`, ...) were dropped and surfaces rendered white. A `texture.data` base-colour map must declare `colorSpace: "srgb"`.
- **Empty instance arrays no longer blank the canvas.** Zero instances is valid and reports `INSTANCES_EMPTY`; empty `points` and `lines` report `GEOMETRY_EMPTY`.
- **Custom shaders that call `pow` are NaN-safe.** The engine supplies a total `pow` so a slightly negative base no longer produces NaN on GPUs that return it, which used to smear black across the frame through bloom.
- **Repeated `model()` nodes share decoded textures.** Twenty nodes of one three-image GLB decode and upload 3 textures instead of 60. Opt out with `shareTextures: false`.
- **`material.custom` receives real view and projection matrices**, a declared-but-unused vertex attribute no longer skips the draw (`CUSTOM_ATTRIBUTE_UNUSED`), and self-registering modules survive production bundles (4.0.8).

## Verified and not verified

Be exact about what was and was not checked:

- Rendering was verified on **software WebGL2** (SwiftShader, no GPU) in a remote runner. That proves the code paths run and the output is not blank; it says nothing about speed on a GPU.
- A **real Apple M4 Max (ANGLE Metal)** was used by the owner on a few ports through the `?diag=1` panel. It showed Drift & Deliver rendering a black world on that GPU before the NaN-safe `pow` fix, and Silt & Signal rendering but with faint rings. Whether the NaN fix resolves the black Drift scene on real hardware is **not yet confirmed**. No other real-GPU run, no WebGPU canvas run on real hardware and no real headset WebXR run has been done.
- The eleven Crayon ports replay their original simulations to tight tolerances and look closer to their originals than before, but a blind model judge **still tells every port from its original**, so none is pixel-parity. HEATSINK and Roadster Hours are closest (the judge missed some trials); Ninja Runner, Last Train and most others were still identified in nearly every trial. Do not read these ports as indistinguishable.
- **Scatter and static merge** (`scatterAlongPath`, `scatterInArea`, `splitScatterByDistance`, `scatterTransforms`, `createScatterRandom`, `mergeStatic`, `mergeStaticByKey`) are implemented, unit-tested and exported from the engine's agent-api barrel (`packages/engine/src/agent-api/index.ts`). At the time of writing they are **not yet re-exported from the published root entry** (`packages/engine/src/public/index.ts`); this page shows the intended `@aura3d/engine` import.
- Several generated reference pages (`docs/api/public-api.md`, `public-api-contract.md`, `public-surface-diff-2.0.md`) were stale on `main` while this was written and are regenerated at release time.
