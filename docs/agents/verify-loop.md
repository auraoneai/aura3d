# The verify loop: author, validate, render, inspect, correct

Version: 5.1 (lane `510-agent-loop`, minimum viable loop). Status: `CLI asset pipeline` claim label plus the bounded receipts below. No advantage claim is made (see "What this does not prove").

`aura3d verify` runs one pass over an Aura3D project and ends in ONE machine-readable JSON report. An agent edits the project, runs it again, reads the findings and corrects. It reuses what already exists: `tsc`, `assets validate` and `check-deploy` logic, the render-gate frame analysis, the engine's own `app.diagnostics()` snapshot. It adds no deterministic replay and no physics.

```bash
aura3d verify                      # human summary, exit 0 on ok, 1 on any error finding, 2 on usage error
aura3d verify --json               # the report only, on stdout
aura3d verify --json --out report.json --frames-dir frames   # also save the report and the two captured frames
aura3d verify --skip typecheck,build      # reuse an existing dist
aura3d verify --only lint                 # static rules only, no browser
aura3d verify --explain FRAME_BLACK       # cause and fix for one code (add --json for the raw entry)
aura3d verify --list-codes                # the whole explainer table as JSON
```

## Steps (fixed order)

| Step | What runs | Skipped when |
| --- | --- | --- |
| `typecheck` | `tsc --noEmit -p tsconfig.json` (the project's TypeScript, else the one bundled with the CLI). Up to 20 errors, each with `file:line:col` and the TS code. | no `tsconfig.json` (raises `TYPECHECK_UNAVAILABLE`) |
| `assets` | `assets validate --source` when `aura.assets.json` exists, plus the asset lint rules (`ASSET_PATH_INVENTED`, `ASSET_KEY_UNKNOWN`). | never; reports `no aura.assets.json` |
| `lint` | The static scene rules below, on the TypeScript AST of `src/`. | never |
| `build` | `npm run build`, then `check-deploy` logic when a manifest exists. | `--skip build` |
| `serve` | A plain static server over `dist/` (no SPA fallback, so a missing file is a real 404). | no browser step requested |
| `render` | A browser driver loads the page, waits for `body[data-aura3d-ready]`, settles, and captures two frames about a second apart. | `--skip render` |
| `inspect` | Reads `window.__AURA3D_ROUTE_READY__.diagnostics` (warnings, errors, degradations), console, page exceptions, failed requests, `*_DEGRADED` and `RENDERER_MOUNT_FAILED`; analyses frame 1 (black, flat, empty, dim) and compares frame 1 with frame 2 (motion). | `--skip inspect` or no capture |

A step is `pass`, `fail` (it raised at least one error finding) or `skipped`. `inspect` needs `render`.

### The browser driver

The default driver launches a locally installed Chrome headless on a loopback DevTools port (`--remote-debugging-port=0`, `127.0.0.1` only), drives one page over a small CDP client, and removes the profile when done. It does not use Playwright and downloads nothing. Find order: `--chrome <path>`, `AURA3D_CHROME`, `CHROME_PATH`, the usual macOS and Linux locations. `--software-gl` forces SwiftShader; the default is the machine's GPU. `--browser-lock <dir>` serialises browser steps across several verify runs with a `mkdir` mutex that is held only around `render` and `inspect`, never during a build.

The driver is an interface (`VerifyBrowserDriver`: `capture(url, options) -> RenderCapture`, `close()`), exported from the CLI's `verify` module. Tests inject a mock; a Playwright, REA or remote driver can be dropped in without touching the pipeline.

## Report schema, `aura3d.verify/1`

```jsonc
{
  "schema": "aura3d.verify/1",
  "ok": false,                    // true iff no finding has severity "error"
  "project": "my-scene",          // folder name
  "startedAt": "2026-11-06T...Z", "durationMs": 21034,
  "steps": [ { "id": "typecheck|assets|lint|build|serve|render|inspect", "status": "pass|fail|skipped", "durationMs": 8065, "detail": "0 error(s)" } ],
  "findings": [
    {
      "code": "LINT_SHADOW_NO_RECEIVER",         // stable, append-only
      "severity": "error|warning|info",
      "step": "lint",
      "message": "what was found, specific to this project",
      "cause": "plain-English cause, same text as --explain",
      "fix": "concrete fix hint keyed by code",
      "location": { "file": "src/main.ts", "line": 12, "column": 7 },   // source findings only
      "evidence": { }                              // optional: tsCode, outputTail, frame metrics, degradation code, ...
    }
  ],
  "counts": { "error": 1, "warning": 2, "info": 0 },
  "render": {                      // present when the render step captured a page
    "driver": "chrome-cdp", "viewport": { "width": 960, "height": 540 },
    "backend": "webgl2", "drawCalls": 7,
    "frame":  { "meanLuma": 55.1, "p99Luma": 224, "distinctColors": 130, "texturedBlockFraction": 0.31, "drawn": true, "black": false, "flat": false, "empty": false, "dim": false, "reasons": [] },
    "motion": { "meanAbsDiff": 1.2, "changedPixelFraction": 0.04, "moved": true },
    "degradeCodes": [], "frames": ["my-scene-frame1.png", "my-scene-frame2.png"]
  }
}
```

Rules an agent can rely on: `findings` are in emission order (step order); a code never changes meaning; `cause` and `fix` are keyed by code, not by message, so a repair loop can switch on `code`. `*_DEGRADED` codes from the renderer are passed through as their own code and `--explain` resolves any of them to the generic `RENDER_DEGRADED` entry. A static scene is a `MOTION_NONE` warning, never an error. `ok` ignores warnings and info.

The error-code explainer is `packages/aura3d-cli/src/verify/codes.ts` (one table, `VERIFY_CODE_TABLE`, `explainCode(code)`), written once so an MCP server can serve the same text.

## Lint rules (static, conservative)

Each rule fires only on literal evidence in source; a value it cannot see produces no finding.

| Rule (code) | Fires when | Does not fire when |
| --- | --- | --- |
| `LINT_SHADOW_NO_RECEIVER` | a light sets `shadow` and every visible surface builder is receiver-off (`receiveShadow: false`, or `material.custom` without `receiveShadow: true`, since custom materials do not receive by default) | any default primitive/model is present (primitives receive by default), no surface builder is visible, or `shadow: false` |
| `LINT_SKY_HIDES_BACKGROUND` (info) | `scene({ background })` / `.background(x)` and a `sky.*` node in one file | the background is taken from the sky (`sky.dayNight(...).background`). The canonical recipes do this on purpose, so it is informational |
| `LINT_SHADER_UNIFORM_UNREAD` | a `material.custom` uniform never appears in resolvable GLSL (aliases count) | the GLSL cannot be resolved to a string |
| `LINT_SHADER_ATTRIBUTE_UNREAD` | `geometry.*({ attributes })` names an attribute no custom GLSL reads | any custom GLSL is unresolvable |
| `LINT_UNIFORM_RESERVED` | a uniform uses a prelude-owned name (`uTime`, `uResolution`, `cameraPosition`, matrices, `position`, `normal`, `uv`, ...) | never (the engine rejects these) |
| `LINT_UTIME_NOT_ANIMATED` | GLSL reads `uTime`/`u_time` and the project lacks `app.onFrame` plus a `.runtime({ mutable: true })` node | both are present |
| `LINT_EFFECT_OPTION_IGNORED` | `effects.fog` gets a key outside its read list, or `instances.model` gets `lod`, `maxInstancesPerDraw`, `static`, `chunkSize`, `shadowLod` or `impostor` | the value is `undefined` |
| `LINT_READY_NOT_AWAITED` | `const app = createAuraApp(...)` and `app.ready()` is never awaited or chained | the handle is discarded (templates report readiness through `data-aura3d-ready`) |
| `LINT_TOP_LEVEL_AWAIT_READY` | `await app.ready()` at module scope (see "A finding from building this") | it is inside a function |
| `LINT_TOP_LEVEL_AWAIT_ENGINE` (warning) | module-level `await` on a call to an `@aura3d/*` import (`loadGltfScene`, `createProductViewer`, `Renderer.create`, ...) or on a same-file function that awaits one (`await mount()`); the promise may need a lazy engine chunk and deadlock the same way | it is inside a function |
| `LINT_SCALE_EXTREME` | `.scale()` literal >= 50 or <= 0.02 on a primitive or model that is not named like a ground, sky, water or backdrop | |
| `LINT_CAMERA_INSIDE_OBJECT` | a camera distance or position is inside a large scaled node at a literal position | |
| `ASSET_PATH_INVENTED` | a `defineAuraAssets` entry whose local `url` is not a file under `public/`, or `model("...glb")` with a string | the URL is `http(s)` |
| `ASSET_KEY_UNKNOWN` | `assets.<key>` is not a key of `defineAuraAssets` | |

Two tables are copied from the engine and guarded by a parity test (`tests/unit/aura3d-cli/verify-lint.test.ts` reads `customMaterial.ts`, `effects.ts`, `instances.ts`): the reserved uniform names and the fog option list. `effects.particles` has no table because every defined particle option rides to lowering; there is no list of ignored particle options to lint against, so the seeded "ignored option" scene uses `effects.fog` with `particleCount`, which the engine really does ignore. If a particle option is dropped at runtime, `RUNTIME_OPTION_IGNORED` still reports it from the engine's own degradation list.

## Codes

| Code | Severity | Step | Meaning |
| --- | --- | --- | --- |
| `VERIFY_STEP_CRASHED` | error | verify | A verify step threw |
| `TYPECHECK_ERROR` | error | typecheck | TypeScript error |
| `TYPECHECK_UNAVAILABLE` | warning | typecheck | Typecheck skipped |
| `ASSET_VALIDATION_FAILED` | error | assets | Asset manifest check failed |
| `ASSET_VALIDATION_WARNING` | warning | assets | Asset manifest warning |
| `ASSET_PATH_INVENTED` | error | assets | Model path is not a typed asset |
| `ASSET_KEY_UNKNOWN` | error | assets | assets.<key> is not defined |
| `LINT_SHADOW_NO_RECEIVER` | warning | lint | Light has shadow on, nothing receives shadows |
| `LINT_SKY_HIDES_BACKGROUND` | info | lint | Sky node covers the scene background |
| `LINT_SHADER_UNIFORM_UNREAD` | warning | lint | Custom shader uniform is never read |
| `LINT_SHADER_ATTRIBUTE_UNREAD` | warning | lint | Custom vertex attribute is never read |
| `LINT_EFFECT_OPTION_IGNORED` | warning | lint | Option is accepted but ignored |
| `LINT_UTIME_NOT_ANIMATED` | warning | lint | Shader reads uTime but nothing advances time |
| `LINT_UNIFORM_RESERVED` | error | lint | Reserved uniform name |
| `LINT_READY_NOT_AWAITED` | warning | lint | app.ready() is not awaited |
| `LINT_TOP_LEVEL_AWAIT_READY` | error | lint | Module-level `await app.ready()` |
| `LINT_TOP_LEVEL_AWAIT_ENGINE` | warning | lint | Module-level await on an engine promise |
| `LINT_SCALE_EXTREME` | warning | lint | Node scale looks off by orders of magnitude |
| `LINT_CAMERA_INSIDE_OBJECT` | warning | lint | Camera starts inside an object |
| `BUILD_FAILED` | error | build | Build failed |
| `BUILD_SCRIPT_MISSING` | error | build | No build script |
| `DEPLOY_CHECK_FAILED` | error | build | check-deploy failed |
| `SERVE_FAILED` | error | serve | Static server could not start |
| `BROWSER_UNAVAILABLE` | error | render | No Chrome found for the render step |
| `RENDER_NAVIGATION_FAILED` | error | render | Page did not load |
| `RENDER_NEVER_READY` | error | render | App never reported ready |
| `RENDERER_MOUNT_FAILED` | error | render | Renderer failed to mount |
| `RENDER_DEGRADED` | warning | render | A feature is degraded |
| `RUNTIME_OPTION_IGNORED` | warning | inspect | Runtime reported OPTION_IGNORED |
| `RUNTIME_DEGRADATION` | warning | inspect | Compiler reported a degradation |
| `RUNTIME_NO_LIGHTS` | warning | inspect | Scene has no lights |
| `RUNTIME_NO_INTERACTIONS` | info | inspect | Scene has no interactions |
| `RUNTIME_DIAGNOSTIC_ERROR` | error | inspect | Engine diagnostics reported an error |
| `RUNTIME_DIAGNOSTIC_WARNING` | warning | inspect | Engine diagnostics reported a warning |
| `CONSOLE_ERROR` | error | inspect | Console error |
| `PAGE_EXCEPTION` | error | inspect | Uncaught exception |
| `REQUEST_FAILED` | error | inspect | A request failed (HTTP error or network failure) |
| `FRAME_BLACK` | error | inspect | Frame is black |
| `FRAME_DIM` | warning | inspect | Frame is very dim |
| `FRAME_FLAT` | error | inspect | Frame is one flat colour |
| `FRAME_EMPTY` | warning | inspect | Frame has no scene texture |
| `MOTION_NONE` | warning | inspect | Nothing moved between two frames |

Run `aura3d verify --explain <CODE>` for the cause and the fix text.

## Seeded benchmark

`tests/fixtures/agent-loop-seeded/` holds 10 small broken scenes (`manifest.json` lists each scene, its static code and its runtime code):

| Scene | Seeded defect | Static code | Runtime code |
| --- | --- | --- | --- |
| `frozen-utime-water` | frozen uTime water | `LINT_UTIME_NOT_ANIMATED` | `MOTION_NONE` |
| `black-frame-no-light` | black frame from missing light | - | `FRAME_BLACK` |
| `invented-asset-path` | invented asset path | `ASSET_PATH_INVENTED` | - |
| `shadow-no-receiver` | shadow flag without receiver | `LINT_SHADOW_NO_RECEIVER` | - |
| `fog-hides-scene` | fog hiding scene | - | `FRAME_FLAT` |
| `ignored-effect-option` | ignored effects option (effects.fog particleCount) | `LINT_EFFECT_OPTION_IGNORED` | `RUNTIME_OPTION_IGNORED` |
| `scale-off-by-100x` | scale off by 100x | `LINT_SCALE_EXTREME` | - |
| `camera-inside-model` | camera inside the model | `LINT_CAMERA_INSIDE_OBJECT` | - |
| `missing-await-ready` | missing await ready | `LINT_READY_NOT_AWAITED` | - |
| `reserved-uniform-name` | reserved uniform name | `LINT_UNIFORM_RESERVED` | - |

Run it:

```bash
pnpm exec vitest run tests/unit/aura3d-cli/verify-lint.test.ts tests/unit/aura3d-cli/verify-run.test.ts tests/unit/aura3d-cli/verify-seeded.test.ts   # no browser, driver mocked
node tools/agent-loop/run-seeded.mjs --no-browser                                    # real lint/typecheck/build on all 10, no browser
node tools/agent-loop/run-seeded.mjs --browser-lock /tmp/a3d-rea.lock                # real Chrome, every expected code asserted
node tools/agent-loop/stage-template.mjs vite-vanilla                                # stage a shipped template so verify can build it from monorepo source
node tools/agent-loop/repair-harness.mjs --runs 1 --browser-lock /tmp/a3d-rea.lock   # Prism subject repairs each scene from the report alone
```

The seeded scenes build from monorepo source through the shared `_shared/vite.config.ts` and `_shared/tsconfig.json` (the same aliases `docs/agents/recipes-src` uses). They contain no top-level `await` for the reason below.

### The repair harness

`tools/agent-loop/repair-harness.mjs` gives a subject model (Kiro Prism, `claude-sonnet-5.5` by default, subject only) the first verify report and three tools confined to `src/` (`list_files`, `read_file`, `write_file`) plus `done`. After each `done` the harness re-runs verify and shows the new report. No docs, no manifest, no expected code, no shell. A run is `REPAIRED` at the first turn whose report has none of the scene's expected codes and zero error findings; the budget is 5 turns. Prism sampling is not seedable, so a run is one sample, not a rate.

### Results recorded in this lane (2026-11-06)

**Unit and integration tests (no browser, driver mocked):** 46 tests in `verify-lint`, `verify-run`, `verify-seeded` and `verify-repair-harness` pass. They prove the lint rules (including false-positive guards and parity with the engine tables), the report plumbing, the code mapping, the frame analysis (identical output to `tools/release/render-gate/analysis.mjs` on five test images) and the repair-harness bookkeeping. They do not prove the engine behaves as the mocked captures say.

**Real Chrome, `tests/reports/agent-loop/real-gpu/` (reports, text output and the two captured frames per run):** local headless Chrome on an Apple M4 Max, no `--software-gl`. The reports record backend `webgl2`; whether ANGLE used Metal or a software path was not checked. One run each:

| Project | Result | Findings raised |
| --- | --- | --- |
| seeded `frozen-utime-water` | ok (warnings only) | `LINT_UTIME_NOT_ANIMATED`, `MOTION_NONE` (0.000% of pixels changed over 1 s) |
| seeded `black-frame-no-light` | fail | `FRAME_BLACK` (p99 luma 0), `RUNTIME_NO_LIGHTS` |
| seeded `fog-hides-scene` | fail | `FRAME_FLAT` (2 distinct colours) |
| template `vite-vanilla` (staged) | ok | `MOTION_NONE` warning (a static product shot, so this is expected noise) |
| template `product-viewer` (staged) | ok | `FRAME_EMPTY` warning at 9.6% textured blocks against a 10% threshold (the frame is drawn; this is a borderline false positive on a large flat backdrop), and two real `ASSET_VALIDATION_WARNING`s (manifest bounds do not match the GLB) |

All ten seeded scenes were run through real Chrome once during development, before several fixes below (8 of 10 raised their expected code then; the two misses were the black-frame seed and `RUNTIME_OPTION_IGNORED`, both since fixed). That run is not committed and the other seven scenes were not re-run in a browser after the fixes, so only the five rows above are current evidence. What the real runs taught, all fixed before the committed runs: the engine supplies a default environment, so "no `lights.*`" alone never gives a black frame (the original seed drew a lit sphere), and the seed is now a hand-written lambert shader whose light uniform is never set; `RUNTIME_NO_LIGHTS` is the engine's own signal for the missing-light case and is a separate code; staged templates need the HDRI set that `create-aura3d` copies, otherwise they 404 on `/hdri/studio_small_08_1k.hdr` and verify correctly reports `REQUEST_FAILED` for a staging artefact; and the `await app.ready()` finding in the section below.

The staged `product-viewer` frame shows the product floating above the plinth. That was observed in the committed frame and is not investigated or attributed here (it could be a staging artefact of the monorepo-source build or a template composition issue).

**Subject repair run (n=1, model `claude-sonnet-5.5` through Kiro Prism, 5-turn budget):** `tests/reports/agent-loop/repair-static/`. Run with `--no-browser`, so the subject saw typecheck, assets, lint and build findings only. This covers the 8 seeded scenes that have a static expectation: **8 of 8 repaired in 1 turn** (all edits in the first turn, 3 model calls each), where "repaired" means the scene's expected code is gone and the report has no error findings. Read that number with these limits: the lint message for these defects names the fix, the scenes are 15 to 30 lines, it is one sample, and the success test is the report, not a render. One repair does not preserve the scene's intent: for `invented-asset-path` the subject replaced the `model(assets.robot)` node with box primitives, because it has no shell to admit a real asset; the report is clean but `claims-and-boundaries.md` forbids that fallback for a named object. The other repairs removed the seeded defect and kept the scene (a driven `waveClock` uniform, `receiveShadow: true`, scale 1, camera distance 40, and so on). No repair was verified in a browser. The two scenes that can only be detected at runtime (`black-frame-no-light`, `fog-hides-scene`) need the browser in the loop and are covered next.

**Runtime-only scenes (browser in the loop, `tests/reports/agent-loop/repair-runtime/`):** `black-frame-no-light` and `fog-hides-scene`, n=1, real Chrome on every verify: **2 of 2 repaired in 1 turn** (3 model calls each, 291 s and 493 s wall time, most of it waiting for the shared browser lock). `FRAME_BLACK` and `FRAME_FLAT` were gone afterwards; both reports still carry a `FRAME_EMPTY` warning (a flat-ish scene), which the success test allows. The black-frame repair set the light uniform and also added `lights.studio()`; the fog repair lowered the density from 40 to 0.02.

**Total: 10 of 10 seeded scenes repaired within the 5-turn budget, all in the first turn, one sample each (n=1).** The 10 are split across two modes (8 static-only, 2 with the browser), and the 8 static repairs were not re-rendered. Prism sampling is not seedable, so a repeat can differ; one sample of one model on 10 small scenes supports "the report is usable by a model for these defects" and nothing about rates, other models or real projects.

## A finding from building this

While seeding scenes, `await app.ready()` at module scope left every page blank with no console output and no `data-aura3d-ready`: the page loaded, the canvas was sized, and the app never reported ready. The same source with `void app.ready()` (or `await` inside an `async function main()`) reached ready in about 3 seconds. The mechanism was later confirmed (5.3.0 candidate, a one-box app built by Vite 7 with default options against the package dist): a single-entry build puts the engine modules the app imports into the entry chunk, and every lazily loaded engine chunk (`renderingLazy`, `v2Entry`, the environment loaders, decoders) imports that entry chunk back. An entry suspended on `await app.ready()` never finishes evaluating, so those chunks never evaluate and the mount never settles. It is a property of how the consumer's bundler places shared modules, so the engine cannot remove it; `docs/agents/recipes-src` escaped it only because each recipe is one entry among several with a shared chunk. `verify` and `validate` report it as `LINT_TOP_LEVEL_AWAIT_READY` (static, an error since 5.3.0) and `verify` as `RENDER_NEVER_READY` (runtime). Every snippet in `docs/agents`, `llms.txt` and the skills now uses `void app.ready()` / `app.ready().then(...)` or awaits inside a function.

## What this does not prove

- That an agent authors better, faster or with fewer turns using the loop than without it, or than with any other engine's tooling. The only agent numbers here are the n=1 repair run above on 10 seeded scenes.
- That the lint rules find real-world defects at any rate. They are conservative static guesses validated on the seeded scenes, the shipped templates and the recipes (see the false-positive notes in the rule table), not on a corpus of agent-written projects.
- That a clean report means a good-looking scene. The frame check detects a black, flat or texture-poor frame and a frozen one; it does not judge composition, lighting or style (use the look-dev loop in `aura3d-art-direction`).
- Deterministic replay, physics behaviour or input handling. None of that is exercised.
- Anything about WebGPU, other browsers or other GPUs. The real-Chrome reports record the machine that produced them (below).
