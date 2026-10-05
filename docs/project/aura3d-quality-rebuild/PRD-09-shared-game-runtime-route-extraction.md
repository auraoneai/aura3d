# PRD 09: Shared Game Runtime and Route-Local Extraction

Status: draft for implementation. Branch base: `aura3d-quality-rebuild/audit` @ `c08d8acb`.
Owner question this PRD answers: *why do 18 games that each re-implement HUD, audio, juice, pause,
touch and evidence still feel like prototypes, and what shared layer must exist so a game's shipped
frame (not its review frame) is competitive?*

Evidence base: research `10`, `12`, `14`, `16`, `17-g1…g5`, `18`, `19`, `20` (non-visual categories),
`21` (authoritative for visual categories), `22`/`23` (benchmark). Screenshots:
`docs/project/aura3d-quality-rebuild/evidence/games/<id>-{contact,mid}.jpg`, fps in
`evidence/games/report.slim.json` (GitHub Actions run 37289688772, macos-14, ANGLE Metal).

Ground rule for every gate in this PRD: tests passing, routes returning 200, non-blank canvases, and
evidence globals populating are **not** quality. The final gate is a human plus vision-model judgment
that the shipped play frame looks and feels competitive.

---

## 1. Problem statement

The 18 game routes share almost nothing above `@aura3d/engine`. Each game rebuilds a HUD, an audio
wrapper, a pause handler, reduced-motion detection, touch controls, hit feedback, and its own evidence
publisher. Those per-route rebuilds are generic dev-dashboard quality, and in several cases they are
wired to nothing. Three effects follow:

1. **The reviewed frame is not the played frame.** 16 of 18 routes parse `?capture=review` and branch
   on it 395 times, changing lights, emissive values, materials, actor scale, poses and whole scene
   content (research 16 §Headline 3; 17-g4 §4.3; 17-g5 §1.10). Screenshots that passed review showed
   a game no player can reach.
2. **Feel and presentation code produces no pixels or sound.** `game.effects`/`gameFeel` nodes are
   never mounted (0 `.nodes()` calls in 18 routes, research 19 claim "production bridge draws zero
   pixels…", skeptic 2). Hit-stop is metadata. `playPositional` is not spatial. 17 of 18 games ship
   oscillator-synthesized WAVs (research 18 C12). The default cue is a 176 Hz sine
   (`packages/engine/src/game/GameAudio.ts:485-503`).
3. **About a third of the game code is evidence plumbing.** ~29.9k of 87.7k classified route LOC is
   evidence/proof/capture/review (research 16 per-route table). That work went into proving the
   game ran instead of making it look and feel better.

Measured outcome on the shipped frames (research 20 for non-visual, 21 for visual):

| Category | Fleet range | Notes |
|---|---|---|
| `sound_audio` | 0–5, median 3 | Orbital Defense is silent; Aura Clash (4) is the only sampled-audio game |
| `polish_juice` | 0–5, median 2 | Turbo is 5 by code volume but "primitive VFX mute it" |
| `loading_transitions` | 3–5 | No designed loader, title or transitions anywhere; step-before-mount empty frames |
| `ui_hud` (vision, 21) | 4–6 | "reads as a web dashboard"; debug text ("Evidence", "Backend rapier", "LOS rays 75", "PROTOTYPE", "ASSET PASSPORT", checksum) ships to players |
| `mobile_presentation` | 1–3.5 | HUD eats 22–40% of portrait; no touch in 13 of 18; canvases are boxed insets |
| `performance` (rAF measured) | 0.5–60 fps | Most games 5–15 fps; Deep Recovery 0.5–3.6; Orbital/Vault ~60; engine self-report falsely says 60 |

The fps problem is mostly owned by PRDs 01/02/11. This PRD owns the parts that the shared runtime
can fix directly: presentation shell, HUD, sound, juice, lifecycle, touch, honest capture and
evidence, and removing route-local duplication.

## 2. Evidence from current code (path:line)

### 2.1 Capture/review divergence

- One-line local parse, copy-pasted: `apps/showcase-bank-shot/src/main.ts:49`,
  `showcase-courier-rush/src/main.ts:100`, `showcase-aurora-lander/src/main.ts:111`,
  `showcase-blockfall-reactor/src/main.ts:109`, `showcase-deep-recovery/src/main.ts:144`,
  `showcase-gravity-post/src/main.ts:76`, `showcase-gallery-shift/src/main.ts:84`,
  `showcase-neon-swarm/src/main.ts:177`, `showcase-mech-hangar/src/main.ts:62`,
  `showcase-skyline-runner/src/main.ts:120`, `showcase-patrol-wing/src/main.ts:76`,
  `showcase-rooftop-buckets/src/main.ts:49`, `showcase-pulse-tunnel/src/main.ts:58`,
  `showcase-siege-golf/src/main.ts:45`, `showcase-vault-breakers/src/main.ts:50`;
  Turbo uses `?capture=overview` (`showcase-turbo-drift-circuit/src/main.ts:564`).
- Ternary counts per route (research 16): rooftop 81, pulse 52, neon 40, gravity 37, skyline 35,
  blockfall 30, aurora 21, bank 21, deep 17, patrol 16, courier 15, gallery 12, siege 9, mech 5,
  vault 4, aura-clash 1, turbo 0 (separate overview camera), orbital 0. Total 395.
- Examples: rooftop `main.ts:322-382` (emissiveIntensity 3.05 vs 1.4, ambient 0.72 vs 1.32, athlete
  scale 1.4 vs 1.34, pose "Release" vs "Ready"); pulse hides tunnel, pylons, rocks, track (scale
  0.001) and adds 15 review builder arrays and 3 particle systems (`main.ts:1373-1467`); neon removes
  all district dressing and swaps the hero GLB (`main.ts:254, 688, 878`); gravity-post changes key
  light 1.48→3.0, pod scale 1.7→0.94, adds a review-only freightway, and hides planets
  (17-g5 §1.10; `main.ts:303, 1369, 2441-2443`).
- An audit tool already exists and classifies these branches as ART/FRAMING/TRANSIENT/UNKNOWN:
  `tools/showcase-library/game-capture-parity.mjs` (`--fail-on-art`, wired as `check:capture-parity`
  in `package.json:691`). It is not run in any workflow (17-g4 §0).
- The new capture harness already captures the default URL with real input only
  (`tools/quality-rebuild-capture/games.json` `$comment`: "no debug hooks, no ?capture= review
  lenses"). It still uses per-game evidence globals for readiness (`readyExpr`, e.g.
  `window.__AURA_CLASH_ARENA_PROOF__?.status === 'running'`).

### 2.2 Feel helpers that reach no pixels

- `game.effects` (`packages/engine/src/agent-api/index.ts:8271` → `GameRuntime.ts:2800-2879`) is a
  data pool; pixels need `nodes()` → `effectToSceneNode` (`GameRuntime.ts:3879-3916`). No route calls
  it (research 19, both skeptics). neon-swarm spawns 7 times and never calls `update`
  (`main.ts:1148-1627`) and discards `cameraDirector` output (`main.ts:1667-1671`).
- `gameFeel.hitStop(durationMs)` (note: milliseconds, `packages/engine/src/agent-api/GameFeel.ts:83, 195`)
  only changes `timeScale()`/`effectiveDt()` (`GameFeel.ts:136-140, 240-243`); no
  game reads them (research 10 §4.2). Canonical durations already exist:
  `GAME_FEEL_HIT_STOP_{LIGHT,HEAVY,SPECIAL,DEFAULT}_S` = 0.045/0.07/0.1/0.06 s (`GameFeel.ts:27-30`). `FrameLoop.timeScale` is a constructor constant with no setter
  (`packages/engine/src/agent-api/FrameLoop.ts:46, 63, 126`). `createGameAppRuntime` forwards only
  `frame.dt` (`GameAppRuntime.ts:151-153`).
- Only alpha-over blending exists (`WebGL2Device.ts:4404`), and sub-1 opacity primitives may render
  as "dark shells" (research 18 C8). Parked FX pools at y=-50…-70 inflate the shadow map size
  (research 18 C2).
- Turbo's shake is written into fields the follow camera ignores (research 10 §3.3); skyline's
  shake is low-passed to ~7% (§3.1). Camera application belongs to PRD 08. This PRD depends on it.

### 2.3 Audio

- `playCue` (`GameAudio.ts:345`) always plays into `bus.node?.input ?? audioContext.destination`
  (`:370, 372, 374`); the `spatial` argument only feeds `recordPlayingNode` evidence (`:326-343`). `setOcclusion` mutates evidence
  records only (`:415-421`). There is no live rate/gain on loops, no limiter, no variation, and no
  voice limiting beyond the 32-entry evidence list (`:205`).
- Default cue: `oscillator.type = "sine"`, 176 Hz, 0.12 s, gain 0.025 (`GameAudio.ts:485-503`).
- `PositionalEmitter.update` sets `this.source.playbackRate` (`packages/audio/src/PositionalEmitter.ts:232`),
  but `AudioSource` applies it only when `play()` creates the node (`AudioSource.ts:47-51`), so doppler
  and pitch never change a playing loop.
- `@aura3d/audio` already has `AudioBus`, `GameMixer`, `AudioMixer`, `SpatialAudio`,
  `PositionalEmitter`, `Footsteps` (`packages/audio/src/`). `createGameAudio` uses only `AudioBus`,
  `AudioSource`, `AudioFileManager`, `FootstepPlayer`.
- 16 routes have a near-identical ~170–180-LOC `apps/*/src/*-audio.ts` wrapper (16 files, 2,894 LOC by
  `wc -l` at `c08d8acb`; Skyline and Turbo add a separate `audio-cues.ts`). 14 wrap `createGameAudio`
  (compare `apps/showcase-bank-shot/src/billiards-audio.ts`, 170 LOC, with
  `apps/showcase-patrol-wing/src/wing-audio.ts`, 180 LOC). Rooftop (`buckets-audio.ts`) and Deep Recovery
  (`deep-audio.ts`) bypass `createGameAudio` with raw `HTMLAudioElement`, so cues cut each other off
  (research 20 Rooftop, Deep Recovery). Aura Clash has its own sampled path; Orbital Defense has no
  audio module. The WAVs are generated by 16 per-app `scripts/build-sfx.mjs` (e.g.
  `apps/showcase-bank-shot/package.json:12`) through oscillator/noise synthesis.
- Engine loops: Turbo plays the engine loop once with no RPM pitch (`turbo main.ts:4411-4417`);
  Patrol Wing maps throttle to volume only (`wing-audio.ts:8-9, 92`); Courier defines the engine and
  ambient loops and never plays them (research 20 Courier).

### 2.4 HUD, shell, lifecycle, touch

- `game.hud.*` (`index.ts:8280-8295`) are value bindings with no renderer; used by 1 route
  (blockfall). Routes hand-build HUD DOM (~2.3k LOC; research 16 row 9). Orbital Defense and Gravity
  Post rebuild `innerHTML` every frame, which breaks buttons and causes hover flicker (research 20).
- `ui.*` (`index.ts:3967-4000`) is thin DOM sugar. No title, loading, pause, settings, results, or
  transition exists at engine level. `setScene` disposes and remounts (`index.ts:11353-11359`), so a
  scene change is a hard cut with a possible blank frame (research 10 §9).
- Aura Clash already has `apps/aura-clash-showcase/src/ui/{TitleScreen,LoadingShell,CharacterSelect,PauseMenu,ResultsPanel,FightHud}.ts`.
  Research 20 says title, select and results are "unwired", and Saira is named in CSS but never
  loaded.
- `game.accessibility.{reducedMotion,reducedFlash,highContrast,pauseControls,settings}`
  (`index.ts:8296-8304`) are sources that need wiring. 4 routes use any of them and 0 use
  `pauseControls`. 17 routes call `matchMedia('(prefers-reduced-motion)')` themselves. 0 routes
  handle `visibilitychange`. 11 routes write `togglePause` (research 16 row 8).
- Touch: `game.touchControls` (`index.ts:8250`, layout data only) is used by 2 routes;
  `packages/input/src/VirtualTouchControls.ts` and `TouchLayouts.ts` are used by 0 routes.
  13 of 18 routes have no touch path beyond 1–2 pointer handlers (research 16 row 12). Vision shows
  keyboard-hint buttons on touch layouts (Aura Clash, Mech Hangar) (research 21).
- Layout: Aura Clash's canvas covers ~43–45% of the page inside nav and prose cards (research 20,
  21). Mobile HUDs take 22–40% of portrait in most games (research 21).

### 2.5 Evidence share

- Evidence ≈ 34% of classified route LOC; pulse-tunnel 65%, gravity-post 48%, aura-clash 47%,
  turbo 42%, skyline 40% (research 16).
- 31+ distinct `window.__*__` globals; 0 routes use `game.evidence` (`index.ts:8306` →
  `GameEvidence.ts:258 collectGameRuntimeEvidence`). Each route has its own
  `publishEvidence()`/`safeDiagnostics()`/`Object.defineProperty(window, …)` block of 80–300 LOC.
- 13 near-duplicate `scripts/write-performance-report.ts` (1,116 LOC).
- `apps/common/src/rapier-physics-proof.ts` (84 LOC) runs a separate 480-step Rapier box drop at
  startup in blockfall and turbo, unconnected to gameplay (research 10 §6.3).
- The engine fps counter reports 60 while rAF-measured fps is 0.5–23 in most games (research 20,
  every performance row). Evidence built on that counter is false.
- Evidence strings assert composition the pixels don't deliver: turbo `main.ts:3953`, skyline
  `main.ts:1743` (research 10 §10).

### 2.6 Engine facts this PRD builds on (verified at `c08d8acb`)

These were checked against source because earlier drafts assumed APIs that do not exist. Every task
below is written against these facts.

| Fact | Source | Consequence for this PRD |
|---|---|---|
| `AuraApp.diagnostics` is a **method** returning `AuraDiagnostics` | `index.ts:10767` (`diagnostics(): AuraDiagnostics;` inside `interface AuraApp` at `:10680`) | `app.diagnostics.lookSignature()` is not callable. The new API is `app.lookSignature()` / `app.lookManifest()` on `AuraApp` |
| `AuraApp` has no `camera`, `capabilities` or `renderer` members | `index.ts:10680-10771` | `app.camera.addLayer` is PRD 08's contract (feature-detected); `app.capabilities.particles` does not exist (FX backend is an explicit option, §6.7); the overlay hook is a new `app.setOutputOverlay()` (§7.8) |
| `AuraApp` already exposes `onDeviceLost` / `onDeviceRestored` / `deviceLost()` | `index.ts:10748-10752` | Context-loss UI subscribes to these, not raw canvas events. They are documented for WebGL context loss (`WebGL2Device.ts:444` listener); whether they also fire on WebGPU `device.lost` is unverified and checked by a Phase 4 task |
| `AuraApp.setScene` is synchronous: `normalizeSceneSnapshot` → `runtimeNodes.reset` → remount | `index.ts:11480-11490`, `mountCurrentScene` `:11353-11359` | `game.setScene` wraps it in a transition and awaits `firstPresentedFrame()` |
| Runtime node handles: `setPosition(x,y,z)`, `setRotation(x,y,z)`, `setScale(number \| AuraVec3)`, `setVisible(b)` | `AuraRuntimeNodeHandle`, `index.ts:10497-10530` | `TweenableNode` must match these signatures exactly (§7.6) |
| `instances.{box,sphere,plane,…}` take a **static** `transforms` array; no runtime per-instance update API exists | `index.ts:2222-2240`; no `setInstance*` symbol in `index.ts` | FX backend A needs a new `setInstanceTransforms` engine API (§7.8, Phase 3 task) to stay at 1 draw per kind |
| `SeededRandom` has only `nextUint32`, `nextFloat`, `range`, `clone` | `packages/math/src/Random.ts:1-33` | `int/pick/shuffle/fork` must be added to `SeededRandom` (not "re-exported") |
| `Easing` has only `linear`, `easeInQuad`, `easeOutQuad`, `easeInOutCubic`, and throws outside `[0,1]` | `packages/math/src/Easing.ts:1-24` | The full Penner set is added to `@aura3d/math` `Easing`; `@aura3d/game/util` re-exports it |
| `packages/input/src/Haptics.ts` already implements `navigator.vibrate` + `vibrationActuator.playEffect` behind capability probes | `Haptics.ts:2-3, 37` | `juice.rumble` wraps `Haptics`; it does not reimplement it |
| `TouchLayouts.ts` supports only 3 genres: `fight`, `race`, `platform` | `TouchLayouts.ts:3, 124` | 5 of the 8 presets (§6.11) need new layout definitions |
| WebGL2 final pass is `ensureLdrPostprocessProgram` with **loose** uniforms (no UBOs anywhere in the device); `applyToneMapping` decodes → maps → encodes in one function; FXAA/sharpen call `baseColorAt` up to 9×/pixel | `WebGL2Device.ts:3440-3640`, uniforms set at `:1893-1908`, used at `:943` | Juice uniforms are 4 loose `vec4`s applied once in `main()` after FXAA (§8). The pass runs only when the scene has post passes |
| WebGPU post is a chain of separate fullscreen passes | `WebGPUDevice.ts:1446` `presentLdrPostprocess` | Juice is an extra final `fs_juice` pass, encoded only while an amount is non-zero |
| Only `SRC_ALPHA, ONE_MINUS_SRC_ALPHA` blending | `WebGL2Device.ts:4402-4404` | FX backend A uses opaque emissive geometry |
| Shadow `sceneRadius` = max over **all** nodes of `hypot(position) + scale`, visibility ignored | `index.ts:12949-12960` | Pool nodes parented at origin with scale ≤ 1 do not change the shadow-map size |
| `game-capture-parity.mjs` accepts only `--json <path>` and `--fail-on-art`; its TRANSIENT class (`particles, fx, effect, shake, reducedMotion, pulse, glow…`) is labelled "legitimate" | `tools/showcase-library/game-capture-parity.mjs:14-35` | `--routes`, `--fail-on-framing`, `--fail-on-transient`, `--fail-on-unknown` and `--fail-on-any` must be added; the §6.4 rule bans TRANSIENT capture branches too |
| No workflow runs `check:capture-parity` | `rg capture-parity .github/workflows` → 0 hits | Phase 1 adds it to `.github/workflows/test.yml` |
| Unit workflow is `.github/workflows/test.yml`; `pnpm test:unit` = `vitest run tests/unit --maxWorkers=2` | `package.json:149` | Unit gates go there |
| `size-limit` / `@size-limit/file` ^12.1.0, `eslint` ^9.26.0, `@playwright/test` 1.59.1, `three` 0.185.1 already in root devDependencies | `package.json:719-743` | No new tool dependency is needed (§12.1) |

## 3. Root cause

1. **No shared game layer.** `apps/common` (969 LOC) is a viewer runtime (`runtime.ts`, 885 LOC),
   not a game library (research 16 §1). Each route is an island, so every presentation system is
   rebuilt at prototype quality.
2. **The engine API stops one step short of output.** Effects return data, hit-stop returns a
   number, positional audio records numbers, HUD bindings return values. Every consumer has to
   finish the last mile, and none did (research 10 §0).
3. **Evidence was rewarded over experience.** Gates checked that globals populated and canvases were
   non-blank (research 14 §3.9). Routes optimized the judge's artifact with review-only worlds
   (17-g5 §1.10: "~60% of 2,489 lines are comments justifying review-frame tweaks").
4. **There is no capture contract.** With no engine notion of capture mode, each route invented one
   and used it to retune the look (research 16 row 1).
5. **The root-API-only rule plus missing re-exports** pushed routes to hand-roll RNG (13 routes),
   clamp/lerp (13), triggers (5), and touch (research 16 rows 11, 12, 16).
6. **Templates and skills teach evidence-only feel** (research 10 §10; 12 §0: "6:1 evidence to craft
   in skills"). New games reproduce the gap.

## 4. Affected packages

| Package | Change |
|---|---|
| **new `@aura3d/game`** (`packages/game`) | Game shell, session/lifecycle, capture contract, evidence channel, HUD kit, juice + tween, touch controls, small util (rng, damp, easing) |
| `@aura3d/audio` | New `GameSoundEngine` (mixer chain, voices, variation, live loops, engine-RPM layers, spatial, reverb, music); `AudioSource` live `playbackRate`; `PositionalEmitter` fix |
| `@aura3d/engine` | `FrameLoop.setTimeScale`; `GameAppRuntime.setTimeScale`/`timeScale`/`firstPresentedFrame`; `AuraApp.lookSignature()`/`lookManifest()`; `AuraApp.setOutputOverlay()` (juice uniforms, with PRD 03); `AuraRuntimeNodeHandle.setInstanceTransforms()` for instanced nodes; `createGameAudio` reimplemented as an adapter over `GameSoundEngine`; deprecation of `game.hud`, `game.accessibility`, `game.evidence`, `game.touchControls` in favour of `@aura3d/game` |
| `@aura3d/math` | `SeededRandom.int/pick/shuffle/fork`; full Penner `Easing` set + `Easing.spring` |
| `@aura3d/rendering` | Juice overlay uniforms in the WebGL2 LDR postprocess program; final `fs_juice` pass in WebGPU `presentLdrPostprocess`; per-instance transform buffer update for instanced draws |
| `@aura3d/input` | `VirtualTouchControls`/`TouchLayouts` become the touch backend (5 new layouts); `Haptics` wired to `juice.rumble` |
| `@aura3d/aura3d-cli` | `aura3d perf-report` subcommand replacing 13 route scripts; `assets validate --release` audio provenance rule |
| `apps/*` (18 routes), `apps/common` | Migration; deletion of route-local systems |
| `packages/create-aura3d/templates/{mini-game,racing-starter,falling-blocks-starter,fighting-game,character-controller}` | Adopt `createGame` (API only here; template content in PRD 13) |

## 5. Affected files and directories

New:
- `packages/game/` (`package.json`, `src/index.ts`, `src/shell/*`, `src/session/*`, `src/capture/*`,
  `src/evidence/*`, `src/hud/*`, `src/juice/*`, `src/touch/*`, `src/util/*`, `src/styles/*.css`,
  `src/fonts/` (OFL woff2 subsets))
- `packages/audio/src/game-sound/*` (`GameSoundEngine.ts`, `Voice.ts`, `LoopHandle.ts`,
  `EngineLoop.ts`, `MusicController.ts`, `MasterChain.ts`, `ReverbSend.ts`, `SpatialVoice.ts`)
- `assets/packs/game-sfx-core/` (admitted audio files + `manifest.json`) and
  `assets/packs/game-sfx-core/LICENSES.md`
- `tests/unit/game/*.test.ts`, `tests/unit/audio/game-sound-*.test.ts`,
  `tests/browser/game-shell/*.spec.ts`
- ESLint capture rule: implemented as `no-restricted-syntax` + `no-restricted-imports` entries in
  `eslint.config.js` (no custom plugin; `tools/eslint-plugin-aura3d/` does not exist and is not created)
- `tools/quality-rebuild-capture/route-composition.mjs` (LOC classifier from research 16, made
  repeatable)
- `docs/project/aura3d-quality-rebuild/migration/{baseline,after}.json` and `migration/<id>.json`

Modified:
- `packages/engine/src/agent-api/FrameLoop.ts:46,63,126,161` (mutable time scale; snapshot reports current value)
- `packages/engine/src/agent-api/GameAppRuntime.ts:82-105,151-153` (interface + time scale + first-presented-frame)
- `packages/engine/src/agent-api/index.ts:8250,8280-8306` (deprecations), `:10497-10530`
  (`setInstanceTransforms` on the runtime handle), `:10680-10771` (`AuraApp.lookSignature`,
  `lookManifest`, `setOutputOverlay`), `:11480` (`setScene` re-arms first-presented-frame)
- `packages/math/src/Random.ts`, `packages/math/src/Easing.ts`
- `packages/engine/src/game/GameAudio.ts` (adapter; default-cue removal)
- `packages/audio/src/AudioSource.ts:18,47-51`, `packages/audio/src/PositionalEmitter.ts:232`
- `packages/input/src/TouchLayouts.ts` (5 new layouts)
- `packages/rendering/src/WebGL2Device.ts:1893-1908,3440-3640` (LDR postprocess uniforms + `applyJuice`),
  `packages/rendering/src/WebGPUDevice.ts:1446` (`fs_juice` final pass)
- `tools/showcase-library/game-capture-parity.mjs` (`--routes`, `--fail-on-{framing,transient,unknown,any}`, scenario exemption)
- `tools/quality-rebuild-capture/games.json` (`readyExpr` → shell state)
- `.github/workflows/quality-rebuild-capture.yml` (capture-parity + look-signature jobs)
- `.github/workflows/test.yml` (capture-parity step, route list grows per wave)
- `eslint.config.js`

Deleted at the end of migration (per route, Phase 5):
- 16 `apps/*/src/*-audio.ts` wrappers (keep cue maps only, as data)
- 13 `apps/*/scripts/write-performance-report.ts`
- 16 `apps/*/scripts/build-sfx.mjs` once their cues are sample-based
- per-route `hud.ts` / inline `syncHud`/`renderHud` (~2.3k LOC)
- per-route `publishEvidence`/`safeDiagnostics`/`defineProperty` blocks
- `apps/common/src/rapier-physics-proof.ts` and its imports (blockfall `main.ts:87`, turbo `:32`)
- all `visualReviewCapture`/`captureMode` branches; `apps/aura-clash-showcase/src/showcaseProofBoot.ts`
  is reduced to a scenario module

## 6. Architecture proposal

### 6.1 Layering

```
route (apps/showcase-*/src)       gameplay rules, content, cue map, HUD widget list, scenarios
      │ imports only @aura3d/engine + @aura3d/game
@aura3d/game                      createGame(): shell · session · capture · evidence · hud · juice · touch · util
      │                                   │ sound                    │ camera layers (PRD 08)
@aura3d/audio  GameSoundEngine ◄──────────┘                          │ fx layer (PRD 07 backend)
@aura3d/engine createGameApp / AuraApp / GameAppRuntime / FrameLoop ◄┘
@aura3d/rendering output pass (+ juice uniforms)
```

- `@aura3d/game` depends on `@aura3d/engine`, `@aura3d/audio` and `@aura3d/input`. The engine
  never imports `@aura3d/game`, so there is no cycle. Engine-side `game.hud`, `game.accessibility`,
  `game.evidence` and `game.touchControls` stay as deprecated shims for one minor release.
- The route import rule changes from "`@aura3d/engine` only" to "`@aura3d/engine` + `@aura3d/game`".
  PRD 15 may later fold `@aura3d/game` into an `@aura3d/engine/game` subpath. The API in §7 does not
  change if it does.
- `createGame()` is the single entry point. It wraps `createGameApp` (`index.ts:11818`), so a route
  that adopts it gets the fixed-step loop, input, shell, sound, juice and evidence in one call, and
  the shell owns the DOM.

### 6.2 Standard game shell (DOM layers)

```
<div class="a3g-root" data-state="playing" data-tier="high">     full viewport, 100dvh, safe-area aware
  <canvas class="a3g-canvas">                                    full-bleed (or letterboxed 16:9), never a card
  <div class="a3g-overlay">                                      DOM fallback for flash/fade (§6.6)
  <div class="a3g-hud">                                          HUD kit widgets, pointer-events:none except buttons
  <div class="a3g-touch">                                        touch controls; hidden when (pointer:fine) and no touch seen
  <div class="a3g-menus">                                        loading, title, pause, settings, results, about
  <div class="a3g-toasts">
  <div class="a3g-dev">                                          dev panel; only mounted when import.meta.env.DEV or ?dev=1
```

- Route marketing and prose (nav pills, "Evidence", "Deploy check", "npm", claim text) move into the
  `about` menu. They are never in the play view. This directly addresses research 21's "the UI chrome
  takes more pixels than the game" (Aura Clash) and the "dev dashboard" verdicts in 21 for Bank
  Shot, Gallery Shift, Mech Hangar and Neon Swarm.
- Session state machine: `booting → loading → title → playing ⇄ paused → results → (title|playing)`,
  plus `transitioning` and `context-lost`. `data-state` on the root lets CSS drive menu visibility, and
  `window.__AURA3D_GAME__.state` exposes it for harness readiness (§6.5).
- Loading shows real progress, defined concretely: progress = Σ weight of settled promises ÷ Σ weight of
  tracked promises. `createGame` tracks `app.ready()` (weight 1), every cue decode in `GameSoundEngine`
  (weight 0.1 each), font loads (0.1 each), and any promise the route registers with
  `shell.track(promise, weight)` (typed-asset loads). `AuraApp.ready()` has no byte progress, so no
  byte counts are claimed. Minimum display time is 400 ms to avoid flashes, and the loader fades out
  only after the **first presented frame** of the play scene. That removes the "step() ran before mount"
  empty frame reported in 7 games (research 20: Patrol, Rooftop, Bank, Vault, Blockfall, Gallery, Siege).
- Transitions (`shell.transition(fn)`) fade the DOM overlay to opaque (default 180 ms), run `fn`
  (usually `app.setScene`), wait for the first presented frame of the new scene, then fade back in
  (220 ms). There is no GPU readback. This hides the remount blank frame from `index.ts:11353-11359`.
- Context loss: the shell subscribes to `app.onDeviceLost` / `app.onDeviceRestored` (`index.ts:10748-10750`;
  documented for WebGL context loss; WebGPU `device.lost` coverage is verified in Phase 4) and shows a "Recovering graphics…"
  menu, hides the HUD, and pauses the session with reason `context-lost`. If the device is not restored
  within 3 s, it offers Reload. Courier's 1920 run went black with no recovery UI (research 20, 21). The
  actual GPU resource restore belongs to PRD 01. The shell only guarantees the player is never shown a
  frozen black frame with a live HUD.

### 6.3 Session: pause, time scale, hit-stop, lifecycle, accessibility

- One `GameSession` per game. It owns `paused`, `timeScale` (user scale × slow-mo × hit-stop), sim
  time, and per-actor freeze sets.
- Engine change: `FrameLoop` gains `setTimeScale(scale)`, and `GameAppRuntime` exposes `timeScale` and
  `setTimeScale`. The session drives them, so **every** fixed-step consumer (genre kits, physics,
  animation advanced by `app.step`) honors hit-stop without route code. Today `FrameLoop.timeScale` is
  readonly (`FrameLoop.ts:46`).
- Per-actor hit-stop is the fighting-game norm. `session.hitStop(0.07, { actors: ["p1","p2"] })`
  freezes only those actors. Route systems ask `session.scaledDt(dt, actorId)`. Global hit-stop
  (`actors` omitted) scales the whole loop.
- Lifecycle: `visibilitychange` (hidden → pause and suspend the AudioContext; visible → stay paused
  until the player resumes), `blur` (configurable), `pagehide` (if `event.persisted` the page is entering
  the back/forward cache: suspend audio only; otherwise dispose audio), `pageshow` with `persisted`
  (re-arm the audio unlock and show the pause menu), Escape/P/Gamepad Start (standard mapping
  button 9) → pause menu.
- Accessibility: `reducedMotion` and `reducedFlash` come from `matchMedia` with change listeners, and
  the player can override them in settings (persisted in `localStorage["a3g:<id>:settings:v1"]`; the
  `v1` suffix is the schema version and older versions are migrated or discarded). This replaces 17
  route-local `matchMedia` calls. `highContrast` maps to a HUD theme token set.
- Settings menu: per-bus volume (master, music, sfx, ui, ambience, voice), reduced motion, reduced
  flash, high contrast, quality tier (from PRD 11's tier API), key remap (writes `game.input` action
  bindings), touch layout opacity and size.

### 6.4 Capture contract (removes the 395 divergent branches)

**Rule: capture may change only camera pose, clock, seed and scenario state. Lights, materials,
effects, post, environment, background, node set, authored scale, poses and HUD must be identical to
play.**

- `@aura3d/game/capture` exports `captureFromUrl()` → `CaptureContext`. It reads `?scenario=`,
  `?seed=`, `?freezeAt=` and `?cameraPose=`. `?capture=review` and `?capture=overview` are **ignored**
  with a `console.warn`, and the route renders as play.
- Scenarios are named setup functions in `src/scenarios/*.ts`. They may only call gameplay APIs:
  input replay drivers (`game.inputReplayDriver`, `index.ts:8213`), rule/state setters, the session
  clock, and the PRD 08 camera named-pose API. Aura Clash's `capture/PosterScenarios.ts` (271 LOC) is
  the reference: named scenarios that drive state, not looks (research 16 row 1).
- Three layers of enforcement:
  1. **Lint:** `no-restricted-syntax` + `no-restricted-imports` entries in `eslint.config.js` (message
     prefix `aura3d/no-route-capture-flags:` so violations are greppable) ban `URLSearchParams#get("capture")`,
     identifiers matching `/^(visualReviewCapture|visualCaptureCamera|reviewCapture|captureMode|isCapture|CAPTURE_REVIEW)$/`, and
     imports of `@aura3d/game/capture` outside `src/scenarios/**`, in `apps/*/src/**` and
     `packages/create-aura3d/templates/*/src/**`.
  2. **Static audit:** `pnpm check:capture-parity --fail-on-any` runs in CI and must report 0 branches
     of **every** class (ART, FRAMING, TRANSIENT, UNKNOWN) for every migrated route
     (`tools/showcase-library/game-capture-parity.mjs`). The tool's current "TRANSIENT is legitimate"
     label (`:16`) conflicts with the rule above (effects must be identical), so TRANSIENT capture
     branches are also deleted. Reduced-motion branches that are *not* keyed on capture are not
     capture branches and are unaffected.
  3. **Runtime look signature:** `app.lookSignature()` (new `AuraApp` method; `app.diagnostics` is
     already a method returning `AuraDiagnostics`, §2.6) returns a SHA-256 hex over the
     canonicalized scene snapshot minus the camera: light list (type, color, intensity, position,
     direction, shadow flags), every material parameter, effect/postprocess nodes, environment,
     background, renderer options (tone map, exposure, DPR policy), and the node set with asset
     binding, material binding and **authored** scale/visibility. Runtime-handle mutations are excluded
     because they are gameplay. Hashing uses `crypto.subtle.digest` (secure context; the harness serves
     on `localhost`, which qualifies); outside a secure context it rejects with a clear error rather than
     falling back to a weak hash. The capture harness loads each route at the default URL, at every
     declared scenario URL, and at `?capture=review`. All signatures must be equal; on mismatch the
     job uploads the two `lookManifest()` JSONs and a key-level diff.

### 6.5 Evidence as a dev-only side channel

- **Pull, not push.** `publishEvidence({ route, schema, sections })` installs one getter,
  `window.__AURA3D_GAME_EVIDENCE__[route]`. Section functions run only when the getter is read, and
  results are cached for 250 ms. Play mode does zero per-frame serialization. Today each route calls
  `publishEvidence()` per frame or on a timer (research 16 row 7).
- **Always-on beacon** (< 0.5 KB code): `window.__AURA3D_GAME__ = { route, state, frame, firstFrameAt,
  sessionStartedAt }`. Harnesses use this for readiness instead of 31 route-specific globals.
  `games.json` `readyExpr` becomes `window.__AURA3D_GAME__?.state === 'playing'`.
- **Heavy sections are lazy.** Route section builders live in `src/evidence/*.ts` and load through
  dynamic `import()` only when `?evidence=1` is set or `window.__AURA3D_EVIDENCE_OPT_IN__ === true`
  (set by Playwright `addInitScript`). Production play never downloads them.
- **Built-in sections:** `session` (state, pause count, time scale), `sound` (bus levels, voices,
  cues played, unlock state, **sample vs synth provenance per cue**), `juice` (events fired, overlay
  amounts applied, fx live count), `hud` (widget values, HUD screen fraction), `perf` (rAF-measured
  frame intervals, ring buffer of 240 samples, p50/p95/p99; never the engine self-reported fps),
  `capture` (mode, scenario, look signature).
- **Honesty rule:** a section may only report a value read back from the output path (an applied
  uniform, a playing AudioNode, a mounted DOM rect). It may not report a requested value. This kills
  the "evidence says shake fired, pixels unchanged" class (research 10 §13).
- Legacy aliases: `legacyGlobals: ["__BANK_SHOT_EVIDENCE__", …]` re-exposes the same object for one
  release so `tools/showcase-library/*` gates keep working during migration. They are removed in
  Phase 6.

### 6.6 Juice

- `Juice` is a facade over existing correct math. It does not reimplement the camera:
  - `shake`/`punch` → PRD 08's post-damping camera layers (`app.camera.addLayer`). Until PRD 08 lands,
    `shake`/`punch` throw `JuiceDependencyError("camera layers require PRD 08")` in dev and are no-ops
    with a one-time warning in prod. They never pretend.
  - `hitStop`/`slowMo` → session time scale (§6.3).
  - `flash`/`vignettePulse`/`fade` → output-pass uniforms (§8), or the DOM overlay fallback.
  - `rumble` → a thin wrapper over the existing `packages/input/src/Haptics.ts` (already probes
    Gamepad `vibrationActuator.playEffect` and `navigator.vibrate`). iOS Safari has no vibration
    API, so it reports `via: "none"` there.
  - `squash`/`tween` → the tween engine on runtime-node handles (`setScale(n|vec3)`,
    `setPosition(x,y,z)`, `setRotation(x,y,z)`, `index.ts:10506-10510`) and plain objects.
  - `fx.burst`/`fx.trail` → the game FX layer (§6.7).
- `juice.define({ land: {...}, hit: {...}, collect: {...}, boost: {...} })` maps game events to a
  preset that combines fx, sound cue, shake, flash, hit-stop and rumble. Routes call
  `events.fire("hit", { position, strength })`. One call yields synchronized audio-visual feedback,
  which no route achieves today (research 20: Orbital "kills just vanish", Bank "juice is essentially a
  toast", Gallery "the alarm is a CSS red border").
- Reduced motion scales shake trauma ×0.25 and punch ×0.5, disables camera roll, and keeps hit-stop
  (it is timing, not motion). Reduced flash caps `flash.peak` at 0.15, enforces ≤ 3 flashes per
  second (WCAG 2.3.1), and replaces full-screen flashes with a 6 px edge glow.

### 6.7 Game FX layer (event-driven hits, dust, sparks)

- `createGame` appends the FX layer's pooled nodes to the scene **before mount**, through a scene
  decorator on `setScene`, so routes never have to call `nodes()`. That fixes the zero-pixel
  `game.effects` problem without waiting for post-mount node creation (17-g4 §5 F).
- Backend A (interim, ships in Phase 3): instanced primitive pool, one `instances.sphere` or
  `instances.plane` node per kind with `capacity` instances (tier cap, §17). Today instanced nodes
  take a static `transforms` array (`index.ts:2222`), so Phase 3 adds
  `AuraRuntimeNodeHandle.setInstanceTransforms(transforms: Float32Array, count, colors?)`, which
  uploads only the first `count` instances with `bufferSubData` (WebGL2) / `writeBuffer` (WebGPU) and
  draws `count` instances. If that engine change slips, backend A degrades to N individual primitive
  nodes per kind, capped at 16 live per kind, and the draw-call budget in §17 is re-measured and
  reported (not silently exceeded). Particles are opaque emissive with scale-down fade,
  `castShadow: false`, and the pool node is `visible: false` when `count === 0` (never parked at
  y=-50, because parked nodes inflate the shadow map size, research 18 C2; the shadow fit uses
  `hypot(position)+scale` of every node regardless of visibility, `index.ts:12949-12960`). It avoids
  sub-1 opacity because of the alpha-over-only "dark shells" risk (`WebGL2Device.ts:4404`, research 18 C8).
- Backend B (when PRD 07 lands): billboard particle pass with additive/premultiplied blend, soft
  particles and flipbooks. Same `fx.burst(kind, position, opts)` API. The backend is selected by the
  explicit option `createGame({ fx: { backend: "primitive-pool" | "particle-pass" } })`; the default is
  `"primitive-pool"` and flips to `"particle-pass"` in the PR that lands PRD 07's pass. There is no
  `app.capabilities` object to detect it from (§2.6).
- Kinds: `spark`, `dust`, `debris`, `ring`, `streak`, `pickup`, `explosion-small`, `muzzle`, `splash`,
  `bubble`. Each kind is a preset table (count, speed, gravity, drag, life, size curve, color ramp).
  Routes pass overrides.

### 6.8 Sound

`@aura3d/audio` gains `GameSoundEngine`. `@aura3d/game` exposes it as `game.sound`, and the engine's
`createGameAudio` becomes a thin adapter so existing calls keep working.

Graph:

```
voice(s) ─► [PannerNode HRTF|equalpower] ─► cue gain ─► bus (music|sfx|ui|ambience|voice)
                                                         │      └─► reverb send (ConvolverNode, tier-gated)
bus ───────────────────────────────────────────────────►  master gain ─► DynamicsCompressor (glue)
                                                                       ─► DynamicsCompressor (limiter, -1 dBFS)
                                                                       ─► WaveShaper safety clip (curve ±0.966 = −0.3 dBFS)
                                                                       ─► destination
```

- `DynamicsCompressorNode` is not a brick-wall limiter: its maximum ratio is 20 and its attack lets
  transients through, so 32 summed 0 dBFS hits (≈ +30 dB over threshold) still land ≈ +1.5 dB above a
  −1 dB threshold before overshoot. The final `WaveShaperNode` (1,024-point curve, linear to −6 dBFS,
  tanh knee to ±0.966; inputs outside [−1, 1] map to the curve endpoints by spec) is what guarantees the
  sample-peak ceiling. It is inaudible on normally mixed content and exists only to stop clipping.

- Variation: each cue may list N sample variants. Picks are round-robin without immediate repeats,
  with pitch jitter (default ±0.6 semitone) and gain jitter (default ±1.5 dB). The seed comes from
  the session seed, so captures are deterministic.
- Voice management: per-cue `maxVoices` (default 4) with oldest-steal, per-cue `cooldownMs` (default
  30), and a global voice cap per tier (§17). Priority classes are `critical` (UI, player hit), `normal`
  and `ambient`.
- Live loops: `LoopHandle.setRate(rate, rampMs)` and `setGain(gain, rampMs)` use
  `AudioParam.setTargetAtTime`. Engine sound: `sound.engine({ layers: [{ asset, rpm }...] })` crossfades
  2–4 RPM-recorded layers by RPM, with equal-power crossfade and per-layer pitch `rpm / layer.rpm`
  clamped to [0.7, 1.4]. `setLoad(0..1)` blends on-load and off-load layer sets.
- Spatial: `play(cue, { position, velocity })` builds a real `PannerNode` (via `SpatialAudio`, HRTF on
  High/Ultra). The listener auto-syncs from the PRD 08 camera pose each frame: `listener.positionX/…/upZ`
  AudioParams ramped with `setTargetAtTime` where they exist; Firefox does not implement the
  `AudioListener` AudioParams, so the code feature-detects `"positionX" in listener` and falls back to
  `setPosition`/`setOrientation` there. Until PRD 08 lands, routes call `sound.setListener(pose)`
  themselves. Occlusion is a `BiquadFilterNode` lowpass from 20 kHz (open) to 900 Hz (fully occluded).
- Music: a single-stem track streams through one `HTMLMediaElement` → `MediaElementAudioSourceNode`
  (no full decode). Multi-stem tracks (2–4 stems, intensity layers) are **decoded** `AudioBuffer`s
  started on one `AudioBufferSourceNode.start(when)` timestamp, because separate media elements cannot
  be kept sample-aligned. Stem memory counts against the decoded-audio budget in §17, so stems are
  short loops (≤ 60 s). Tracks crossfade (default 1.5 s), duck under voice (existing ratio 0.35,
  `GameAudio.ts:324`) and on pause (−9 dB plus lowpass to 1.2 kHz), and play stingers that can be
  quantized to the beat/bar from `bpm` and the `AudioContext.currentTime` of the track start (Pulse
  Tunnel's beat clock is the reference, research 20). Media elements are same-origin; cross-origin
  music requires CORS headers or the node outputs silence.
- Reverb presets: `none`, `small-room`, `hall`, `street`, `hangar`, `underwater` (adds lowpass 1.8 kHz).
  IRs are bundled mono 24 kHz, ≤ 2.5 s.
- Unlock: binds `pointerdown`/`keydown`/`touchend` once, resumes the context, and resolves
  `sound.ready`. The shell's title "Press any key / Tap to start" doubles as the unlock gesture.
- **Default synthesized cue is removed.** A cue with neither `asset` nor `play` throws at definition
  time. `definition.play` (custom synthesis) stays allowed but is tagged `provenance: "synth"` in
  evidence and fails `assets validate --release` unless the cue is in an explicit allowlist (for example,
  a deliberate chiptune game).

### 6.9 Sample-based SFX library

- Asset pack `game-sfx-core`, admitted through `aura3d assets add --type audio` with per-file license,
  source URL, author, and loudness. It is published as a typed asset index so routes reference
  `sfx.impact.metal.heavy[0..n]`.
- Sources, in order: Kenney audio packs (CC0; Aura Clash already ships them, research 18 C12), other
  CC0 packs, then royalty-free commercial packs whose license allows web redistribution in a bundled
  game. The license must be recorded per file. Files without a recorded license are not admitted.
- Categories and minimum counts (one-shot variants in brackets):

| Category | Ids | Min files |
|---|---|---|
| UI | click, hover, confirm, back, error, toggle, slider-tick, countdown-tick, countdown-go, score-tick, reward, unlock | 12 ×[2] |
| Impact | {light, medium, heavy} × {metal, wood, stone, flesh, glass, plastic, rubber-ball, energy} | 24 ×[3] |
| Whoosh | swing-light, swing-heavy, dash, pass-by-small, pass-by-large | 5 ×[3] |
| Explosion / energy | small, medium, large, shield-hit, charge-up, laser, zap | 7 ×[3] |
| Pickup / reward | coin, gem, power-up, power-down, extra-life, combo-up | 6 ×[2] |
| Sports / table | ball-bounce-hard, ball-bounce-court, rim, net-swish, billiard-clack, cushion, pocket, flipper, bumper, plunger | 10 ×[3] |
| Vehicle | engine RPM layer sets: car-small, car-sport, van, prop-plane, jet, thruster (each 3–4 layers on/off load); tyre-skid loop; boost; gear-shift | 6 sets + 6 |
| Footsteps | {concrete, metal, grass, wood, water, gravel} | 6 ×[4] |
| Ambience beds (loops ≥ 30 s, seamless) | city-night, city-day, wind-open, wind-high, interior-hum, hangar, underwater, space-hum, crowd-arena, crowd-sports | 10 |
| Creature / voice | grunt-light, grunt-heavy, ko, announcer: round, fight, ko, perfect | 7 ×[2] |
| Stingers | win, lose, level-start, checkpoint, alarm | 5 |

Minimum admitted file count from this table: UI 24 + Impact 72 + Whoosh 15 + Explosion 21 + Pickup 12
+ Sports 30 + Vehicle (6 sets × 3 layers × on/off load = 36, plus 6) 42 + Footsteps 24 + Ambience 10 +
Creature 14 + Stingers 5 = **269 files** (before Opus/AAC duplication).

- Mastering at admission: one-shots peak-normalized to −1 dBTP; loops and beds normalized to −20 LUFS
  integrated; music −16 LUFS. Encoding: Opus 96 kb/s in WebM primary and AAC-LC 128 kb/s in M4A
  fallback. The format is chosen at runtime by decoding a bundled 20 ms probe of each format
  (`decodeAudioData` success), not by `canPlayType` alone.

### 6.10 HUD kit

- DOM overlay on the full-bleed canvas. Widgets are created once at mount. Per-frame updates are
  batched into one rAF write phase that touches only `textContent`, `style.transform`,
  `style.opacity` and CSS custom properties, and only when a value changed. **`innerHTML` after mount is
  banned** (fixes the per-frame rebuild flicker and dead buttons in Orbital Defense and Gravity Post).
- Widgets: `score` (animated counter, eased roll-up), `timer` (countdown/stopwatch, warning pulse),
  `meter` (bar with damage-ghost trailing segment, segmented option), `combo` (scale-pop at edge,
  never over the action, per research 21 Aura Clash "combo plates cover the impact"), `banner`
  (centered announcement with in/hold/out animation: ROUND 1, FIGHT, LAP 2, FINAL LAP, WAVE 3, KO),
  `toast`, `damageNumbers` (world-anchored, projected through the PRD 08 camera each frame, pooled ≤
  24), `indicator` (off-screen arrow clamped to the safe rect), `prompt` (action glyph per active
  device: keyboard key cap, gamepad face button, touch icon), `lives`, `objective`, `speedometer`,
  `minimap` (one 2D canvas, ≤ 160 px, markers only).
- Themes are CSS custom-property sets, not per-route CSS: `arcade-neon`, `motorsport`,
  `sports-broadcast`, `sci-fi-telemetry`, `fighting`, `tabletop`. Each theme ships one display face
  and one UI face, as self-hosted OFL woff2 subsets (Latin, ≤ 40 KB each), preloaded with
  `<link rel=preload>` and loaded through `FontFace.load()` before the title screen shows. That fixes
  Aura Clash's "Saira named but never loaded" (research 20).
- Screen budget is enforced: the HUD's union bounding rect over the canvas is ≤ 15% of the canvas
  area on desktop and ≤ 22% on mobile portrait, excluding touch controls (measured in browser tests,
  §15).
- Banned player-facing tokens in play state (test-enforced by DOM text scan): `evidence`, `proof`,
  `backend`, `rapier`, `LOS rays`, `PROTOTYPE`, `asset passport`, `checksum`, `route-health`, `npm`,
  `deploy`, `fps:` (unless the settings "show fps" toggle is on). Research 21 found these on
  Aura Clash, Bank Shot, Gallery Shift, Mech Hangar, Patrol Wing, Aurora Lander and Orbital Defense.

### 6.11 Touch controls

- `mountTouchControls(input, { preset, bindings })` renders presets on top of
  `packages/input/src/VirtualTouchControls.ts`/`TouchLayouts.ts`. It writes into the same
  `game.input` actions and axes (`GameRuntime.ts:1668-1936`), so there is no parallel input stack.
  `TouchLayouts.ts` currently defines only `fight`, `race` and `platform` (`:3, 124`); those back
  `dpad-4btn`, `steer-pedals` and `dpad-2btn`. `twin-stick`, `aim-drag`, `flight`, `lane-swipe` and
  `flippers` are new `TouchLayoutGenre` entries added in Phase 4.
- Presets: `twin-stick` (neon, mech), `dpad-2btn`/`dpad-4btn` (platformer, fighting, blockfall),
  `steer-pedals` (turbo, courier), `aim-drag` (bank, gravity, siege, rooftop), `flight` (patrol,
  aurora, deep), `lane-swipe` (pulse), `flippers` (vault: left/right halves plus plunger pull).
- Visibility: shown after the first `touchstart`, or at mount when `(pointer: coarse)` matches.
  Hidden on desktop with a fine pointer, which fixes Gallery Shift's "touch buttons on desktop"
  (research 20). Keyboard-hint strips are hidden whenever touch controls are visible (Mech Hangar and
  Aura Clash show keyboard hints on mobile, research 21).
- Targets ≥ 48 CSS px and inside `env(safe-area-inset-*)`. Opacity 0.35 idle and 0.8 pressed. Stick
  dead zone and radius come from `game.input` defaults (0.18 dead zone). Optional haptic tick on
  press (Android).

### 6.12 Utilities (removes 13 hand-rolled RNGs and clamps)

`@aura3d/game/util`: `rng(seed)` (returns `packages/math/src/Random.ts` `SeededRandom`, which today has
only `nextUint32/nextFloat/range/clone`; Phase 3 adds `int(min, maxExclusive)`, `pick(array)`,
`shuffle(array)` (Fisher–Yates, in place) and `fork(label)` (new stream seeded from
`nextUint32() ^ fnv1a(label)`) to `SeededRandom` itself), `clamp`, `lerp`, `lerpAngle`, `smoothstep`,
`damp(current, target, lambda, dt)` (frame-rate-independent `1 - exp(-lambda*dt)`), `approach`, and
`ease.*` (re-export of `@aura3d/math` `Easing`, extended to the full set in Phase 3, §7.6).
These are tiny, tree-shakeable, and the only sanctioned versions for routes.

### 6.13 Cost and benefit per major recommendation

| Recommendation | Visual / feel benefit | GPU cost | CPU cost (main thread) | Memory | Bundle (gz) | Mobile impact | Fallback |
|---|---|---|---|---|---|---|---|
| Capture contract + look signature, delete 395 branches | Evidence finally shows the player frame. Review shots will look *worse* at first, which is the point. | 0 | 0 in play; ~1–3 ms one-off hash in dev on demand | ~0 | +1.5 KB (capture), signature in engine dev path | none | none needed; lint/audit block regressions |
| Standard shell (full-bleed, menus, loading, transitions, context-loss UI) | 3D view goes from ~43–60% to ≥ 95% of viewport; designed loading/title/pause/results; no blank frames | 0 (DOM); canvas size grows, so pixel cost rises up to 2.3× for boxed games (PRD 11 tiers absorb it) | ≤ 0.05 ms/frame idle; transitions ~0.1 ms/frame for 400 ms | DOM ≤ 300 nodes | ≤ 14 KB with session/capture/beacon | Largest single mobile win: removes stacked HUD cards and dead bands | `layout: "letterbox-16x9"`; menus degrade to plain buttons when CSS features are missing |
| Session time scale + per-actor hit-stop | Hits land with weight (45–100 ms freezes already defined in `GameFeel.ts:27-30`) | 0 | < 0.02 ms | ~0 | in core | none | `hitStop` scales global loop if a route does not pass actors |
| HUD kit + themes + fonts | Game-styled HUD instead of dev dashboards; ≤ 15% / 22% screen budget | 0 (compositor-only transforms) | ≤ 0.3 ms/frame worst case (20 widgets changing) | ≤ 150 DOM nodes; fonts ≤ 80 KB/theme | ≤ 12 KB JS + ≤ 6 KB CSS; fonts separate | Mobile layouts per widget (`mobileSlot`) | `theme: "plain"` system font stack |
| GameSoundEngine + sampled SFX | Replaces chiptune beeps with mixed, varied, spatial, pitched sound; engine RPM for 5 vehicle games | 0 | ≤ 0.2 ms/frame (listener sync + loop ramps); audio thread separate | decoded SFX budget per tier (§17); music streamed | ≤ 10 KB JS; audio assets ≤ 1.5 MB per game SFX + streamed music | equalpower panning and no reverb on Low; iOS needs gesture unlock (title screen) | `createGameAudio` adapter path; on decode failure, cue is silent and logged, never a beep |
| Juice facade + tween + events | Synchronized flash/shake/hit-stop/sound/rumble per event | WebGL2: ≤ 0.15 ms at 1080p folded into the existing LDR pass; WebGPU: one extra fullscreen pass ≤ 0.3 ms **only while an amount is non-zero**; 0 when idle | ≤ 0.1 ms (≤ 64 live tweens) | ~0 | ≤ 5 KB | reduced-motion defaults honored; haptics Android only | DOM overlay for flash/fade if no post pass runs |
| FX layer auto-mount (interim primitive pool) | Hit sparks and dust become visible in all games that spawn them | instanced: 1 draw per kind (requires `setInstanceTransforms`); ≤ 0.3 ms at 256 live on High | ≤ 0.1 ms pool update + one `bufferSubData` per active kind | ≤ 512 instances × 64 B (+ 16 B color) | ≤ 3 KB | Low tier caps 32 live | disabled kinds fall back to sound + flash only; without `setInstanceTransforms`, ≤ 16 individual nodes per kind |
| Touch presets | 13 games become playable on phones | 0 | ≤ 0.05 ms | ≤ 40 DOM nodes | ≤ 5 KB (lazy) | required for mobile completion | keyboard/gamepad unaffected |
| Evidence pull channel + lazy sections | Removes per-frame serialization; evidence reports output-path values only | 0 | 0 in play; ≤ 2 ms per pull in dev | ring buffer 240 × 8 B | beacon < 0.5 KB in core; sections lazy chunk | none | legacy globals kept one release |
| Shared util (`rng`, `damp`, `ease`) | Indirect: removes 13 hand-rolled RNGs/clamps, makes captures deterministic per seed | 0 | ~0 | ~0 | ≤ 1.5 KB (tree-shaken) | none | none needed |

## 7. APIs to add, change and remove

### 7.1 `@aura3d/game`: entry point

```ts
import type { AuraCreateGameAppOptions, AuraAppTarget, AuraApp, GameAppRuntime,
  GameInputOptions, GameInputController, AuraSceneSnapshot } from "@aura3d/engine";
import type { GameSound, GameSoundOptions } from "@aura3d/audio";

export interface CreateGameOptions<TCue extends string = string, TEvent extends string = string> {
  /** Kebab-case route id; keys evidence, settings storage and analytics. */
  readonly id: string;
  readonly title: string;
  /** Element (or selector) that becomes `.a3g-root`. The shell creates the canvas inside it. */
  readonly mount: HTMLElement | string;
  /** Forwarded to createGameApp; `loop.fixedDt` defaults to 1/60. */
  readonly app: Omit<AuraCreateGameAppOptions, "input">;
  readonly input: GameInputOptions | readonly GameInputOptions[];
  readonly sound?: GameSoundOptions<TCue>;
  readonly hud?: HudMountOptions;
  readonly touch?: TouchControlsOptions | false;
  readonly shell?: GameShellOptions;
  readonly juice?: JuiceEventMap<TEvent, TCue>;
  readonly scenarios?: Readonly<Record<string, GameScenario>>;
  readonly evidence?: EvidenceChannelOptions;
}

export interface Game<TCue extends string = string, TEvent extends string = string> {
  readonly id: string;
  readonly app: AuraApp;
  readonly runtime: GameAppRuntime<AuraApp>;
  readonly input: GameInputController;
  readonly session: GameSession;
  readonly sound: GameSound<TCue>;
  readonly juice: Juice<TEvent>;
  readonly hud: Hud;
  readonly touch: TouchControls | undefined;
  readonly shell: GameShell;
  readonly capture: CaptureContext;
  readonly fx: GameFxLayer;
  /** Resolves after assets load, audio is ready to unlock and the first frame is presented. */
  ready(): Promise<void>;
  /** Called by the shell when the player leaves the title screen; routes may also call it directly. */
  start(): void;
  /** Wraps app.setScene in a shell transition and re-applies the fx/scene decorators. */
  setScene(scene: AuraSceneSnapshot, options?: { readonly transition?: TransitionSpec | false }): Promise<void>;
  dispose(): Promise<void>;
}

export function createGame<TCue extends string, TEvent extends string>(
  options: CreateGameOptions<TCue, TEvent>
): Game<TCue, TEvent>;
```

### 7.2 Shell

```ts
export type GameShellLayout = "full-bleed" | "letterbox-16x9" | "letterbox-4x3";

export interface GameShellOptions {
  readonly layout?: GameShellLayout;                     // default "full-bleed"
  readonly loading?: { readonly tips?: readonly string[]; readonly minMs?: number; readonly art?: string } | false;
  readonly title?: {
    readonly art?: string;                               // typed texture/image URL
    readonly subtitle?: string;
    readonly prompt?: string;                            // default "Press any key" / "Tap to start"
    readonly attractCameraPose?: string;                 // PRD 08 named pose
  } | false;
  readonly pause?: {
    readonly keys?: readonly string[];                   // default ["Escape","KeyP"] + Gamepad Start
    readonly autoOnHidden?: boolean;                     // default true
    readonly autoOnBlur?: boolean;                       // default false
    readonly items?: readonly PauseMenuItem[];           // default resume, restart, settings, about, quit-to-title
  };
  readonly results?: ResultsSpec | false;
  readonly settings?: { readonly audio?: boolean; readonly accessibility?: boolean;
                        readonly controls?: boolean; readonly quality?: boolean };
  readonly about?: { readonly html: string } | false;   // prose/marketing lives here, never in play view
  readonly strings?: Partial<Record<ShellStringKey, string>>;
}

export interface PauseMenuItem { readonly id: string; readonly label: string; readonly run: (game: Game) => void | Promise<void> }
export interface ResultsSpec {
  readonly fields: readonly { readonly id: string; readonly label: string; readonly format?: (v: number) => string }[];
  readonly best?: { readonly key: string; readonly compare: "max" | "min" };   // localStorage, versioned
  readonly actions?: readonly ("retry" | "title" | "next")[];
}
export interface TransitionSpec { readonly kind: "fade" | "iris" | "wipe"; readonly outMs?: number; readonly inMs?: number; readonly color?: string }

export interface GameShell {
  readonly state: GameSessionState;
  showResults(values: Readonly<Record<string, number>>): Promise<"retry" | "title" | "next">;
  transition<T>(run: () => T | Promise<T>, spec?: TransitionSpec): Promise<T>;
  openMenu(id: "pause" | "settings" | "about"): void;
  closeMenus(): void;
  setLoadingProgress(fraction: number, label?: string): void;
}
```

### 7.3 Session

```ts
export type GameSessionState =
  | "booting" | "loading" | "title" | "playing" | "paused" | "results"
  | "transitioning" | "context-lost" | "disposed";
export type PauseReason = "user" | "hidden" | "blur" | "menu" | "context-lost";

export interface GameSession {
  readonly state: GameSessionState;
  readonly paused: boolean;
  /** Effective scale = user × slowMo × (hit-stop ? 0 : 1). */
  readonly timeScale: number;
  readonly simTime: number;
  readonly seed: number;
  readonly reducedMotion: boolean;
  readonly reducedFlash: boolean;
  readonly highContrast: boolean;
  pause(reason?: PauseReason): void;
  resume(): void;
  setTimeScale(scale: number, options?: { readonly rampMs?: number }): void;
  hitStop(seconds: number, options?: { readonly actors?: readonly string[] }): void;
  slowMo(scale: number, ms: number, options?: { readonly ease?: EaseName }): void;
  /** dt for a given actor; 0 while that actor is frozen. */
  scaledDt(rawDt: number, actorId?: string): number;
  isFrozen(actorId?: string): boolean;
  on(event: "state" | "pause" | "resume" | "settings", cb: (session: GameSession) => void): () => void;
}
```

### 7.4 Capture and evidence

```ts
export type CaptureMode = "play" | "scenario";
export interface CaptureContext {
  readonly mode: CaptureMode;
  readonly scenario?: string;
  readonly seed?: number;
  readonly freezeAt?: number;        // seconds of sim time, then session.pause("menu") without menu UI
  readonly cameraPose?: string;      // PRD 08 named pose; the only visual change allowed
}
/** Ignores ?capture=review|overview (warns) — those URLs render the play frame. */
export function captureFromUrl(url?: URL): CaptureContext;

export interface GameScenario {
  readonly description: string;
  /** May call gameplay/state APIs only. Lint forbids lights/material/effects/scale/visible in scenarios/. */
  setup(game: Game): void | Promise<void>;
}

export interface EvidenceChannelOptions {
  readonly schema: number;
  /** Lazy section loaders; imported only when evidence is opted in. */
  readonly sections?: () => Promise<Readonly<Record<string, () => unknown>>>;
  readonly legacyGlobals?: readonly string[];
}
export interface GameBeacon {
  readonly route: string; readonly state: GameSessionState;
  readonly frame: number; readonly firstFrameAt: number | null; readonly sessionStartedAt: number;
}
declare global {
  interface Window {
    __AURA3D_GAME__?: GameBeacon;
    __AURA3D_GAME_EVIDENCE__?: Record<string, unknown>;
    __AURA3D_EVIDENCE_OPT_IN__?: boolean;
  }
}
```

Engine addition:

```ts
// packages/engine/src/agent-api/index.ts — new members on `interface AuraApp` (:10680).
// `AuraApp.diagnostics` is already `diagnostics(): AuraDiagnostics` (:10767), so these are top-level.
interface AuraApp {
  /** SHA-256 hex over canonical look-relevant scene state, camera excluded (§6.4). */
  lookSignature(): Promise<string>;
  /** Canonical JSON used for the hash; for diffing failures. */
  lookManifest(): AuraLookManifest;
}
```

### 7.5 Sound (`@aura3d/audio`)

```ts
export type GameBusId = "master" | "music" | "sfx" | "ui" | "ambience" | "voice";
export interface AudioAssetRef { readonly url: string; readonly hash: string; readonly license: string; readonly provenance: "sample" | "synth" }

export interface SoundCueSpec {
  readonly asset?: AudioAssetRef | readonly AudioAssetRef[];   // variants
  readonly play?: (ctx: BaseAudioContext, destination: AudioNode) => void;  // custom synth; provenance "synth"
  readonly bus: GameBusId;
  readonly volumeDb?: number;            // default 0
  readonly pitchJitterSemitones?: number;// default 0.6 (0 for ui/music)
  readonly gainJitterDb?: number;        // default 1.5
  readonly maxVoices?: number;           // default 4
  readonly cooldownMs?: number;          // default 30
  readonly loop?: boolean;
  readonly spatial?: boolean | { readonly refDistance?: number; readonly maxDistance?: number; readonly rolloff?: number };
  readonly priority?: "critical" | "normal" | "ambient";
}

export interface GameSoundOptions<TCue extends string> {
  readonly cues: Readonly<Record<TCue, SoundCueSpec>>;
  readonly buses?: Partial<Record<GameBusId, number>>;            // linear 0..1
  readonly music?: MusicSpec;
  readonly reverb?: "none" | "small-room" | "hall" | "street" | "hangar" | "underwater";
  readonly master?: { readonly glue?: boolean; readonly limiterCeilingDb?: number };  // defaults true, -1
  readonly tier?: "low" | "medium" | "high" | "ultra";             // from PRD 11 tier API
  readonly seed?: number;
}

export interface VoiceHandle { readonly id: number; stop(fadeMs?: number): void }
export interface LoopHandle extends VoiceHandle {
  setRate(rate: number, rampMs?: number): void;
  setGain(gain: number, rampMs?: number): void;
  setPosition(position: Vec3Like, velocity?: Vec3Like): void;
  setOcclusion(amount01: number): void;
}
export interface EngineLoopSpec {
  readonly onLoad: readonly { readonly asset: AudioAssetRef; readonly rpm: number }[];
  readonly offLoad?: readonly { readonly asset: AudioAssetRef; readonly rpm: number }[];
  readonly idleRpm: number; readonly maxRpm: number; readonly bus?: GameBusId;
}
export interface EngineLoopHandle extends VoiceHandle {
  setRpm(rpm: number): void; setLoad(load01: number): void; setPosition(p: Vec3Like): void;
}
export interface MusicSpec {
  readonly tracks: Readonly<Record<string, { readonly stems: readonly AudioAssetRef[]; readonly bpm?: number; readonly loop?: boolean }>>;
  readonly initial?: string;
}
export interface MusicController {
  play(track: string, options?: { readonly crossfadeMs?: number }): void;
  setIntensity(level01: number): void;              // stem gains
  stinger(cue: string, options?: { readonly quantize?: "beat" | "bar" | "none" }): void;
  stop(fadeMs?: number): void;
}

export interface GameSound<TCue extends string> {
  readonly ready: Promise<void>;
  unlock(): Promise<void>;
  play(cue: TCue, options?: { readonly position?: Vec3Like; readonly velocity?: Vec3Like;
                               readonly volumeDb?: number; readonly rate?: number }): VoiceHandle | null;
  loop(cue: TCue, options?: { readonly position?: Vec3Like; readonly fadeInMs?: number }): LoopHandle | null;
  engine(spec: EngineLoopSpec): EngineLoopHandle;
  readonly music: MusicController;
  setListener(pose: { readonly position: Vec3Like; readonly forward: Vec3Like; readonly up: Vec3Like }): void;
  setBusVolume(bus: GameBusId, volume01: number): void;
  setMuted(muted: boolean): void;
  duck(bus: GameBusId, ratio01: number, ms: number): void;
  suspend(): Promise<void>; resume(): Promise<void>;
  proof(): GameSoundProof;     // read back from live AudioNodes only
  dispose(): Promise<void>;
}
export function createGameSoundEngine<TCue extends string>(options: GameSoundOptions<TCue>): GameSound<TCue>;
```

Changed in `@aura3d/audio`:

```ts
// AudioSource.ts — live rate; today applied only at play() (:47-51)
class AudioSource { setPlaybackRate(rate: number, rampMs?: number): void }
// PositionalEmitter.ts:232 — call setPlaybackRate(this.lastDoppler) instead of assigning the field
```

Changed in `@aura3d/engine`:

```ts
// GameAudio.ts — createGameAudio becomes an adapter over createGameSoundEngine.
// playPositional now creates a PannerNode; setOcclusion drives a lowpass; signature unchanged.
// playDefaultCue (GameAudio.ts:485-503) is deleted; a cue with neither asset nor play throws:
//   Error('Game audio cue "<id>" has no asset or play(); synthesized default cues were removed (PRD 09).')
```

### 7.6 Juice, tween, easing

```ts
export type EaseName =
  | "linear" | `${"quad" | "cubic" | "quart" | "quint" | "sine" | "expo" | "circ" | "back" | "elastic" | "bounce"}${"In" | "Out" | "InOut"}`;
export interface TweenOptions {
  readonly duration: number;              // seconds
  readonly ease?: EaseName | ((t: number) => number) | { readonly spring: { readonly stiffness: number; readonly damping: number } };
  readonly delay?: number;
  readonly unscaled?: boolean;            // UI tweens ignore hit-stop/pause
  readonly onComplete?: () => void;
}
export interface TweenableNode {
  // Matches AuraRuntimeNodeHandle (index.ts:10506-10510) so runtime handles are tweenable as-is.
  setPosition(x: number, y: number, z: number): unknown;
  setRotation(x: number, y: number, z: number): unknown;
  setScale(scale: number | readonly [number, number, number]): unknown;
  readonly position: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly scale: number | readonly [number, number, number];
}
export interface TweenHandle { readonly done: Promise<void>; cancel(): void; finish(): void }

export interface JuicePreset<TCue extends string = string> {
  readonly fx?: { readonly kind: GameFxKind; readonly count?: number; readonly color?: string; readonly speed?: number };
  readonly cue?: TCue;
  readonly shake?: number;                // trauma 0..1 (PRD 08 layer)
  readonly punch?: { readonly fovDeg?: number; readonly dolly?: number; readonly ms?: number };
  readonly hitStop?: number;              // seconds
  readonly flash?: { readonly color: string; readonly peak?: number; readonly ms?: number };
  readonly vignette?: { readonly amount: number; readonly ms?: number; readonly color?: string };
  readonly rumble?: { readonly ms: number; readonly strong?: number; readonly weak?: number };
}
export type JuiceEventMap<TEvent extends string, TCue extends string> = Readonly<Record<TEvent, JuicePreset<TCue>>>;

export interface Juice<TEvent extends string = string> {
  fire(event: TEvent, at?: { readonly position?: Vec3Like; readonly strength?: number; readonly actors?: readonly string[] }): void;
  shake(trauma: number): void;
  punch(options: { readonly fovDeg?: number; readonly dolly?: number; readonly ms?: number }): void;
  hitStop(seconds: number, options?: { readonly actors?: readonly string[] }): void;
  slowMo(scale: number, ms: number): void;
  flash(color: string, options?: { readonly peak?: number; readonly ms?: number }): void;
  vignettePulse(options: { readonly amount: number; readonly ms?: number; readonly color?: string }): void;
  fade(to01: number, options?: { readonly ms?: number; readonly color?: string }): Promise<void>;
  rumble(options: { readonly ms: number; readonly strong?: number; readonly weak?: number }): void;
  squash(node: TweenableNode, options?: { readonly amount?: number; readonly ms?: number; readonly axis?: "x" | "y" | "z" }): TweenHandle;
  tween<T extends object>(target: T | TweenableNode, to: Partial<Record<string, number | readonly number[]>>, options: TweenOptions): TweenHandle;
  snapshot(): JuiceSnapshot;              // applied overlay amounts and fired events
}

export type GameFxKind = "spark" | "dust" | "debris" | "ring" | "streak" | "pickup" | "explosion-small" | "muzzle" | "splash" | "bubble";
export interface GameFxLayer {
  burst(kind: GameFxKind, position: Vec3Like, options?: { readonly count?: number; readonly speed?: number;
        readonly color?: string; readonly normal?: Vec3Like; readonly seed?: number }): void;
  trail(target: TweenableNode & { readonly id: string }, options: { readonly width: number; readonly life: number; readonly color: string }): { stop(): void };
  readonly liveCount: number;
  readonly backend: "primitive-pool" | "particle-pass";
}
```

### 7.7 HUD and touch

```ts
export type HudThemePreset = "arcade-neon" | "motorsport" | "sports-broadcast" | "sci-fi-telemetry" | "fighting" | "tabletop" | "plain";
export type HudSlot = "top-left" | "top-center" | "top-right" | "bottom-left" | "bottom-center" | "bottom-right" | "center";
export interface HudWidgetBase { readonly id: string; readonly slot: HudSlot; readonly mobileSlot?: HudSlot | "hidden"; readonly label?: string }
export type HudWidgetSpec =
  | (HudWidgetBase & { readonly kind: "score"; readonly rollMs?: number; readonly format?: (v: number) => string })
  | (HudWidgetBase & { readonly kind: "timer"; readonly mode: "countdown" | "stopwatch"; readonly warnAt?: number })
  | (HudWidgetBase & { readonly kind: "meter"; readonly max: number; readonly ghost?: boolean; readonly segments?: number; readonly color?: string })
  | (HudWidgetBase & { readonly kind: "combo" | "lives" | "objective" | "speedometer" | "prompt" })
  | (HudWidgetBase & { readonly kind: "minimap"; readonly size: number; readonly bounds: readonly [number, number, number, number] })
  | (HudWidgetBase & { readonly kind: "indicator"; readonly target: () => Vec3Like | null });
export interface HudMountOptions {
  readonly theme?: HudThemePreset | Readonly<Record<`--a3g-${string}`, string>>;
  readonly widgets: readonly HudWidgetSpec[];
  readonly maxScreenFraction?: { readonly desktop?: number; readonly mobilePortrait?: number }; // defaults 0.15 / 0.22
}
export interface Hud {
  set(id: string, value: number | string | boolean | readonly [number, number]): void;
  banner(text: string, options?: { readonly holdMs?: number; readonly style?: "hero" | "info" | "warning" }): Promise<void>;
  toast(text: string, options?: { readonly ms?: number }): void;
  damageNumber(value: number | string, world: Vec3Like, options?: { readonly color?: string; readonly crit?: boolean }): void;
  setVisible(visible: boolean): void;
  snapshot(): HudSnapshot;               // values + measured screen fraction
  dispose(): void;
}

export type TouchPreset = "twin-stick" | "dpad-2btn" | "dpad-4btn" | "steer-pedals" | "aim-drag" | "flight" | "lane-swipe" | "flippers";
export interface TouchControlsOptions {
  readonly preset: TouchPreset;
  /** Map preset controls to game.input action/axis ids, e.g. { stickLeft: "move", buttonA: "jump" }. */
  readonly bindings: Readonly<Record<string, string>>;
  readonly show?: "auto" | "always" | "never";
  readonly haptics?: boolean;
  readonly scale?: number;               // 0.8..1.4, also in settings
}
export interface TouchControls { readonly visible: boolean; setVisible(v: boolean): void; dispose(): void }
```

### 7.8 Engine runtime changes

```ts
// FrameLoop.ts
class FrameLoop { setTimeScale(scale: number): void; get timeScale(): number }  // :46 becomes mutable; :126 and snapshot :161 read current
// GameAppRuntime.ts
interface GameAppRuntime<TApp> {
  readonly timeScale: number;
  setTimeScale(scale: number): GameAppRuntimeEvidence;
  /** Resolves with the frame index of the first frame actually presented after start()/setScene(). */
  firstPresentedFrame(): Promise<number>;
}
// index.ts — AuraApp
interface AuraApp {
  /** Juice overlay amounts for the final post pass (§8). No-op (and zero GPU work) until called with a non-zero amount. */
  setOutputOverlay(overlay: {
    readonly flash?: readonly [number, number, number, number];     // linear rgb, amount
    readonly vignette?: readonly [number, number, number, number];
    readonly shape?: readonly [number, number];                      // inner radius, softness
    readonly fade?: readonly [number, number, number, number];
  }): { readonly applied: boolean; readonly reason?: "no-post-pass" | "disposed" };
}
// index.ts — AuraRuntimeNodeHandle (instanced nodes only; throws on non-instanced kinds)
interface AuraRuntimeNodeHandle {
  setInstanceTransforms(matrices: Float32Array /* 16 × count, column-major */, count: number, colors?: Float32Array /* 4 × count */): this;
}
```

`setOutputOverlay` returns `applied: false, reason: "no-post-pass"` when the current scene has no
LDR postprocess pass; `Juice` then switches to the DOM overlay and records `juice.backend = "dom"`.

### 7.9 Deprecated, then removed

| API | Replacement | Deprecated in | Removed in |
|---|---|---|---|
| `game.hud.*` bindings (`index.ts:8280-8295`) | `@aura3d/game` `hud` | Phase 4 | Phase 6 |
| `game.accessibility.*` (`:8296-8304`) | `session.reducedMotion/reducedFlash/highContrast`, shell pause | Phase 1 | Phase 6 |
| `game.evidence` / `collectGameRuntimeEvidence` (`:8306`) | `EvidenceChannelOptions` built-in sections | Phase 1 | Phase 6 |
| `game.touchControls` layout data (`:8250`) | `mountTouchControls` | Phase 4 | Phase 6 |
| `createGameAudio` default oscillator cue | none (error) | Phase 2 | Phase 2 (breaking for asset-less cues) |
| `gameFeel.timeScale()/effectiveDt()` as the hit-stop path | `session.hitStop` | Phase 3 | Phase 6 |
| route `?capture=review` / `?capture=overview` | scenarios + `?cameraPose=` | Phase 1 (ignored) | Phase 5 (lint error) |
| `apps/common/src/rapier-physics-proof.ts` | none | Phase 5 | Phase 5 |

## 8. Shader changes

One small addition goes into the final LDR postprocess pass that PRD 03 owns. No other shader in the
engine changes in this PRD. The particle shaders for FX backend B belong to PRD 07.

**What exists today (verified, §2.6).** WebGL2's final pass is `ensureLdrPostprocessProgram`
(`WebGL2Device.ts:3440`), a fullscreen fragment shader with *loose* uniforms (the device uses no
uniform blocks anywhere). `applyToneMapping` decodes the input (`u_inputColorSpace`), maps, and
re-encodes (`encodeColor` clamps to [0,1] then applies the sRGB OETF if `u_outputColorSpace == 1`)
inside one function; color grade (with its own `u_vignette`) runs after that, in *encoded* space;
`finalColorAt` and FXAA call `baseColorAt` up to 9 times per pixel. There is no dither. WebGPU
(`WebGPUDevice.ts:1446`) runs a chain of separate fullscreen passes (`bloom`, `tone-mapping`,
`color-grade`, `fxaa`, `taa`). The pass runs only when the scene declares post passes; with no post
passes, tone mapping and encode happen in the material shaders and there is no full-screen pass.

**WebGL2 uniforms** (loose, matching the existing program style; set next to `:1893-1908` only when
`setOutputOverlay` changed a value):

```glsl
uniform vec4 u_juiceFlash;      // rgb = linear color, a = amount 0..1 (additive)
uniform vec4 u_juiceVignette;   // rgb = linear color, a = amount 0..1
uniform vec4 u_juiceShape;      // x = inner radius (0.35), y = softness (0.45), z = aspect (w/h), w = enabled 0/1
uniform vec4 u_juiceFade;       // rgb = linear color, a = amount 0..1 (mix)
```

**Placement:** once per pixel, at the end of `main()` after FXAA, on the final color. Applying it inside
`applyToneMapping` would run it up to 9× per pixel through `baseColorAt` and would feed the flash into
FXAA edge detection. Because the color at that point is already output-encoded, the shader decodes to
linear with the *output* color space, applies juice in display-referred linear, and re-encodes. Juice
amounts are perceptual, so they are not tone-mapped; applying them to sRGB-encoded values would make
the flash curve gamma-dependent.

```glsl
vec3 decodeOutput(vec3 c) {
  return u_outputColorSpace == 1 ? vec3(srgbToLinear(c.r), srgbToLinear(c.g), srgbToLinear(c.b)) : c;
}
vec3 encodeOutput(vec3 c) {             // same as encodeColor, kept separate so tone mapping is untouched
  vec3 l = clamp(c, 0.0, 1.0);
  return u_outputColorSpace == 1 ? vec3(linearToSrgb(l.r), linearToSrgb(l.g), linearToSrgb(l.b)) : l;
}
vec3 applyJuice(vec3 encoded, vec2 uv) {
  if (u_juiceShape.w < 0.5) return encoded;                 // uniform branch; idle output is untouched
  vec3 c = decodeOutput(encoded);
  c += u_juiceFlash.rgb * u_juiceFlash.a;                   // additive flash
  vec2 d = (uv - 0.5) * vec2(u_juiceShape.z, 1.0);
  float v = smoothstep(u_juiceShape.x, u_juiceShape.x + u_juiceShape.y, length(d)); // 0 center → 1 edge
  c = mix(c, u_juiceVignette.rgb, v * u_juiceVignette.a);
  c = mix(c, u_juiceFade.rgb, u_juiceFade.a);
  return encodeOutput(c);
}
// main(): every `outColor = vec4(X, alpha);` becomes `outColor = vec4(applyJuice(X, v_uv), alpha);`
```

The decode/encode round trip happens in float registers before the single write, so it adds no
8-bit quantization. When idle the branch returns the input unchanged, so the output is bit-identical
(`overlay-identity.spec.ts`). The CPU side sets `u_juiceShape.w = 0` whenever all three amounts are
below 1/512.

**WebGPU:** a new `fs_juice` WGSL fragment (same math) runs as an extra final fullscreen pass through
`runWebGPUFullscreenPass`, appended in `presentLdrPostprocess` **only on frames where an amount is
≥ 1/512**. Idle frames encode no extra pass, so idle output and cost are unchanged; active frames pay
one extra fullscreen read/write (budgeted in §17).

**Coexistence with color-grade `u_vignette`:** the existing grade vignette is a static look parameter
and stays in the look signature; the juice vignette is a transient gameplay pulse and is excluded from
it (runtime state, like camera).

**Fallback:** when no post pass runs (`setOutputOverlay` returns `reason: "no-post-pass"`), `Juice`
drives the `.a3g-overlay` DOM element with `background` plus `opacity` for flash/fade and a CSS
`radial-gradient` for the vignette. Visual parity is approximate (compositor blend in sRGB). This is
acceptable for feedback, and it is recorded in the evidence `juice.backend = "dom"`. Phase 0 records,
per route, whether its play scene runs the LDR pass, so the expected backend per route is known before
Phase 3.

## 9. Rendering changes

1. **FX layer pool nodes** are added to the initial scene snapshot by `createGame`'s scene decorator.
   They are instanced (one draw per kind, driven by the new `setInstanceTransforms`), `castShadow: false`,
   `receiveShadow: false`, `visible: false` when `count === 0`, and opaque emissive (backend A). The
   shadow fit (`index.ts:12949-12960`) uses `hypot(position) + scale` of every flattened node, visible
   or not, so the pool node is placed at `[0,0,0]` with scale 1 and cannot enlarge `sceneRadius`
   beyond its floor of 1. PRD 02 may later exclude invisible nodes; this PRD does not depend on it.
2. **Canvas size:** full-bleed layout enlarges the canvas for boxed games (Aura Clash ~45% → ~100% of
   viewport area). DPR policy stays PRD 11's. The shell calls `runtime.resize(w, h, dpr)` from a
   `ResizeObserver`, debounced to one call per frame, and never recreates the context. Mech Hangar
   recreates the context on resize today (research 20).
3. **First presented frame:** `GameAppRuntime.firstPresentedFrame()` resolves from the first
   `app.onFrame` callback after `start()`/`setScene()` **whose frame was submitted to the production
   renderer**. Phase 1's first task verifies in `index.ts` whether `onFrame` callbacks fire after
   render submission; if they fire before it (or also on `advance()`, which skips submission per
   `index.ts:10757-10763`), the task adds an internal `onPresented` hook raised after
   `productionController.render` resolves and resolves the promise from that instead.
4. **Look signature** is computed from the same normalized snapshot the bridge consumes
   (post-`normalizeCreateAppRendererOptions`), so it reflects what renders, not what was authored.
5. **Instanced transform update:** `setInstanceTransforms` writes the instance matrix (and color)
   buffers in place with `bufferSubData`/`queue.writeBuffer` and sets the draw's instance count. It
   never reallocates if `count ≤ capacity` and throws if `count > capacity`.
6. No change to tone mapping, lighting, shadows or materials here. Those are PRDs 01–04.

## 10. Migration plan

The order is driven by risk and by what each route proves:

| Wave | Routes | Why first | Key removals |
|---|---|---|---|
| Pilot (Phase 1–4 gating) | `showcase-bank-shot`, `showcase-courier-rush`, `aura-clash-showcase` | Bank: small, 21 ternaries, admin-panel HUD, synth audio. Courier: best existing HUD (`hud.ts`, 208 LOC), defined-but-unplayed engine loop, context-loss black frames. Clash: existing title/loading/pause/results modules to promote, sampled audio, juice already wired | 21 + 15 + 1 branches; 2 audio wrappers; `showcaseProofBoot.ts` reduced to scenarios |
| Wave 2 | rooftop-buckets, pulse-tunnel, neon-swarm, gravity-post, skyline-runner, blockfall-reactor | Highest ART-branch counts (81/52/40/37/35/30); the largest review-world swaps | 275 branches; review-only worlds (pulse `main.ts:1373-1467`, neon `:254,688,878`, gravity freightway) |
| Wave 3 | aurora-lander, deep-recovery, patrol-wing, gallery-shift, siege-golf, mech-hangar, vault-breakers, turbo-drift-circuit | Remaining branches (21/17/16/12/9/5/4/overview) plus engine-loop audio (patrol, turbo, aurora thruster, deep sub) | 84 branches + turbo overview camera; raw `HTMLAudioElement` in deep |
| Wave 4 | orbital-defense | Delete candidate (research 17-g1 §3.4); migrate only if PRD 14 keeps it | — |

Per-route migration steps, the same for every route (each step is a separate commit):

1. Run `node tools/showcase-library/game-capture-parity.mjs --routes <id> --json docs/project/aura3d-quality-rebuild/migration/<id>.parity.json`
   and `node tools/quality-rebuild-capture/route-composition.mjs --route <id> --out docs/project/aura3d-quality-rebuild/migration/<id>.json`,
   and commit both as the route's before numbers.
2. Replace `createGameApp(...)`/`createAuraApp(...)` + hand-written input with `createGame({...})`.
   Move the canvas into the shell mount and move prose/nav into `shell.about`.
3. Delete every `visualReviewCapture` branch by **keeping the play value**. Anything a review branch
   did that looked better (stronger key light, closer camera) is filed as an art/camera task for
   PRD 14. It is never kept behind a flag.
4. Convert review-only content (review worlds, candidate GLBs) to deletions. If a scenario is needed
   for a good capture moment, write `src/scenarios/<name>.ts` that drives state.
5. Replace `*-audio.ts` with a `cues` object in `src/sound.ts`, pointing at `game-sfx-core` ids or
   route-admitted samples. Delete `scripts/build-sfx.mjs` and the generated WAVs.
6. Replace the HUD module with a `hud.widgets` list. Delete `hud.ts`/`syncHud`.
7. Replace hit/land/collect/goal feedback with `juice.define(...)` events. Delete route spark pools
   (neon `combat-feel.ts`, mech `arena/feel.ts` geometry part, blockfall `clear-fx.ts`, pulse
   `spawnSpark`, gravity `syncSparks`, rooftop contact bursts) in favour of `fx.burst`.
8. Replace `togglePause`, `matchMedia` calls and pause key listeners with the session.
9. Add the touch preset. Delete route `bindTouchStick`/`bindTouchButton`.
10. Replace `publishEvidence`/`safeDiagnostics`/`defineProperty` with `evidence.sections` (lazy) and
    `legacyGlobals`. Delete `scripts/write-performance-report.ts` (use `aura3d perf-report`).
11. Re-run the capture workflow for the route, then the vision + human review (§16).

A route's migration is done only when its row in §10.1 is fully satisfied and its §20 evidence folder
is committed.

### 10.1 Per-game impact

Branch counts are research 16's ternary counts; audio module names verified by `ls apps/*/src/*-audio.ts`.
"Expected visible change" is what the player sees after migration; "likely regression" is what the
review frame loses when review branches go, and it is filed to PRD 14, never kept behind a flag.

| Game (route) | Wave | Capture branches → 0 | Audio change | HUD theme / widgets | Touch preset | Juice events | Route-specific deletions | Expected visible change | Likely review-frame regression (→ PRD 14) |
|---|---|---|---|---|---|---|---|---|---|
| Bank Shot (`showcase-bank-shot`) | Pilot | 21 (`main.ts:49`) | `billiards-audio.ts` + `build-sfx.mjs` → `sports/table` samples | `tabletop`: score, combo, objective, prompt | `aim-drag` | pot, foul, cushion, combo | `__BS_SCENARIO__` → `src/scenarios/*`; admin-panel HUD | Full-bleed table, readable pot feedback (ring burst + 45 ms hit-stop + clack) | Review lighting/framing tweaks on the table |
| Courier Rush (`showcase-courier-rush`) | Pilot | 15 (`main.ts:100`) | `courier-audio.ts` → van engine loop with live RPM + `city-night` bed | `motorsport`: timer, score, lives (strikes), objective, drop-off indicator, speedometer | `steer-pedals` | strike, pickup, deliver, combo | `hud.ts` (208 LOC); DOM strike flash; `game.effects` pool (`main.ts:113`, spawns `:846, :1191`) → `fx.burst` | Engine audible and pitched; context-loss UI instead of black frame | Review camera/emissive tweaks |
| Aura Clash (`aura-clash-showcase`) | Pilot | 1 | Keeps 11 CC0 samples via adapter; adds music + announcer | `fighting`: 2 meters with ghost, timer, edge combo, ROUND/FIGHT/KO banner | `dpad-4btn` | hit, block, KO | `src/ui/{TitleScreen,LoadingShell,PauseMenu,ResultsPanel}.ts` promoted then deleted; `showcaseProofBoot.ts` → scenarios; `PosterScenarios.ts` becomes `src/scenarios/*` | Canvas ~45% → ≥ 95% of viewport; Saira actually loads; combo no longer covers impacts | none expected (1 branch) |
| Rooftop Buckets (`showcase-rooftop-buckets`) | 2 | 81 (`main.ts:49`, e.g. `:322-382`) | `buckets-audio.ts` (raw `HTMLAudioElement`) → `sound` (no more cue cut-offs) | `sports-broadcast`: score, timer, shot meter, prompt | `aim-drag` | release, swish, rim, miss | review pavilion world; `?debug=animation` branch `:502-536`; contact-burst code | Same scene in play and review; overlapping cues | Brighter emissive (3.05 vs 1.4), "Release" pose, athlete scale |
| Pulse Tunnel (`showcase-pulse-tunnel`) | 2 | 52 (`main.ts:58`) | `tunnel-audio.ts` → samples; music beat clock → `MusicController` bpm | `arcade-neon`: score, combo, timer | `lane-swipe` | hit-beat, miss, combo | review builders `:1373-1467` (15 arrays, 3 particle systems); `spawnSpark`; 15 `art-review/*` probes | Tunnel/pylons/track visible in every capture | The review-only particle dressing |
| Neon Swarm (`showcase-neon-swarm`) | 2 | 40 (`main.ts:177`) | `swarm-audio.ts` → samples | `arcade-neon`: score, wave banner, meter (health), lives | `twin-stick` | kill, hit-taken, wave-clear | district-dressing removal + hero GLB swap `:254, 688, 878`; `combat-feel.ts` pools; unused `cameraDirector` `:1667-1671` | Kills produce sparks + sound; same hero model in play and capture | Swapped hero GLB, stripped dressing look |
| Gravity Post (`showcase-gravity-post`) | 2 | 37 (`main.ts:76`) | `post-audio.ts` → samples | `sci-fi-telemetry`: score, timer, objective | `aim-drag` | launch, catch, crash | freightway/`compositionPresentationOverride` `:1369, 2441-2443`; `syncSparks`; per-frame `innerHTML` HUD | Planets visible; HUD buttons stop flickering | Key light 3.0 vs 1.48; pod scale |
| Skyline Runner (`showcase-skyline-runner`) | 2 | 35 (`main.ts:120`) | `skyline-audio.ts` + `audio-cues.ts` → samples | `arcade-neon`: score, distance, combo | `dpad-2btn` | jump, land, collect, crash | `__AURA3D_COMPOSITION_PROBE__`/density/ghost globals | Shake is no longer low-passed to ~7% once PRD 08 layers land | Review density/composition tuning |
| Blockfall Reactor (`showcase-blockfall-reactor`) | 2 | 30 (`main.ts:109`) | `reactor-audio.ts` → samples | `arcade-neon`: score, level, lines, next-piece slot | `dpad-2btn` | lock, line-clear, tetris, top-out | room-node drop + backdrop enlargement `:528, 628`; 5 probe globals; `clear-fx.ts`; `rapier-physics-proof` import `:87` | Room visible in play; no startup Rapier box drop | Enlarged backdrop |
| Aurora Lander (`showcase-aurora-lander`) | 3 | 21 (`main.ts:111`) | `lander-audio.ts` → thruster loop with live pitch | `sci-fi-telemetry`: fuel meter, altitude, velocity, objective | `flight` | thrust-start, touchdown, crash | debug text in HUD | Audible thruster tied to throttle | Review lighting |
| Deep Recovery (`showcase-deep-recovery`) | 3 | 17 (`main.ts:144`) | `deep-audio.ts` (raw `HTMLAudioElement`) → sub engine loop + `underwater` reverb | `sci-fi-telemetry`: depth, oxygen meter, objective | `flight` | grab, collide, surface | evidence blocks | Overlapping cues stop cutting off | Review framing; fps (0.5–3.6) unchanged here (PRD 11) |
| Patrol Wing (`showcase-patrol-wing`) | 3 | 16 (`main.ts:76`) | `wing-audio.ts` → prop/jet loop: throttle drives RPM pitch, not just volume (`wing-audio.ts:8-9, 92`) | `sci-fi-telemetry`: speed, altitude, objective, indicator | `flight` | hit, pickup, ring-pass | debug HUD text | Pitched engine | Review framing |
| Gallery Shift (`showcase-gallery-shift`) | 3 | 12 (`main.ts:84`) | `heist-audio.ts` → samples + alarm stinger | `sci-fi-telemetry`: detection meter, objective, timer | `twin-stick` | spotted, alarm, loot | "Backend rapier / LOS rays" HUD text; touch buttons on desktop | Alarm is a flash + stinger, not a CSS red border | none significant |
| Siege Golf (`showcase-siege-golf`) | 3 | 9 (`main.ts:45`, `captureMode`) | `golf-audio.ts` → samples | `sports-broadcast`: strokes, power meter, wind, objective | `aim-drag` | swing, impact, wall-break, hole | evidence blocks | Impact feedback on wall hits | Review framing |
| Mech Hangar (`showcase-mech-hangar`) | 3 | 5 (`main.ts:62`) | `hangar-audio.ts` → samples + `hangar` reverb | `sci-fi-telemetry`: health/heat meters, ammo, objective | `twin-stick` | fire, hit, overheat | "ASSET PASSPORT" panel; `arena/feel.ts` geometry; context recreation on resize | No dev panel in play; keyboard hints hidden on touch | none significant |
| Vault Breakers (`showcase-vault-breakers`) | 3 | 4 (`main.ts:50`) | `pinball-audio.ts` → `sports/table` flipper/bumper/plunger | `arcade-neon`: score, balls (lives), multiplier | `flippers` | bumper, flipper, drain, jackpot | evidence blocks | Bumper hits flash + spark | none significant |
| Turbo Drift Circuit (`showcase-turbo-drift-circuit`) | 3 | 0 ternaries + `?capture=overview` camera (`main.ts:564`) + review smoothing disable (`:2826-2830`) | `turbo-audio.ts` + `audio-cues.ts` → car-sport engine with RPM (today played once, no pitch, `main.ts:4411-4417`), tyre-skid loop | `motorsport`: lap, position, timer, speedometer, minimap | `steer-pedals` | drift-start, boost, collide, lap | overview camera; `rapier-physics-proof` import `:32` | Engine pitch follows RPM; shake visible once PRD 08 lands | Overview camera framing |
| Orbital Defense (`showcase-orbital-defense`) | 4 | 0 | none today (silent) → samples if kept | `arcade-neon`: score, wave, health | `twin-stick` | kill, hit-taken, wave-clear | per-frame `innerHTML` HUD | Kills stop "just vanishing" | n/a; migrated only if PRD 14 keeps it |

## 11. Backward compatibility

- `createGameAudio` keeps its signature (`GameAudio.ts:138-155`). Behaviour changes: real panning,
  real occlusion lowpass, a master limiter, and **a thrown error for cues with no asset/play**. That is
  breaking for asset-less cues, and intentional. Research 10 §8.2 reports that the routes using
  `createGameAudio` (14 wrappers plus direct calls in aurora, courier, mech, neon, siege, turbo
  `main.ts`) supply assets or `play`; Phase 2's first task re-verifies this with a unit test that
  constructs every route cue map. Templates are fixed in the same PR.
- `game.hud`, `game.accessibility`, `game.evidence` and `game.touchControls` keep working, with
  `@deprecated` JSDoc, for one minor release.
- Legacy evidence globals are re-exposed via `legacyGlobals` until Phase 6, so
  `tools/showcase-library/*` gates (`route-gates.mjs`, `route-primary-probes.mjs`,
  `showcase-game-release-gates.mjs`, `game-play-probe.mjs`) keep resolving. Phase 6 moves them to
  `__AURA3D_GAME__` + `__AURA3D_GAME_EVIDENCE__[route]`.
- URLs with `?capture=review` keep loading. They render the play frame plus a console warning. Any
  external bookmark or thumbnail job that depended on the review look is expected to change.
  Blockfall thumbnails use `?capture=review` (17-g4 §0).
- `FrameLoop`'s constructor `timeScale` option is unchanged. `setTimeScale` is additive.
- Output pass: with `u_juiceShape.w = 0` the output is bit-identical (test in §15).
- Route import policy changes to allow `@aura3d/game`. `aura3d doctor`/lint rules that enforce
  "root only" must add it to the allowlist.

## 12. Dependencies on other PRDs

| PRD | What this PRD needs from it | Blocking? |
|---|---|---|
| 08 Camera / Controls / Game Feel | `app.camera` live controller with post-damping additive layers (shake incl. roll, punch FOV + dolly), named poses for scenarios/title attract, camera pose for listener sync and damage-number projection; render-once-per-rAF loop with interpolation | Blocking for `juice.shake/punch`, `cameraPose`, listener auto-sync. Not blocking for Phases 1–2 |
| 03 Postprocessing / Tone Mapping | Ownership of the output pass where the juice uniform block lands; the one surviving post path | Blocking for shader overlay; DOM fallback ships first |
| 07 VFX / Particles | Billboard particle pass with additive blend, soft particles, flipbooks, runtime spawn; FX backend B | Not blocking (backend A interim) |
| 02 Lighting / Shadows | Exclude invisible nodes from shadow `sceneRadius` | Not blocking (pool placed at origin) |
| 01 Rendering Core | WebGL context restore; post-mount node add (makes pool pre-allocation optional) | Context-loss UI is independent |
| 11 WebGPU / Performance Tiers | Tier API (`low/medium/high/ultra`) consumed by sound voice caps, reverb, FX caps, HUD effects; a correct fps counter | Defaults to `medium` until available |
| 05 Asset Pipeline | `aura3d assets add --type audio` with license/loudness metadata, Opus/AAC transcode stage, audio provenance in `validate --release` | Blocking for the SFX library admission |
| 12 Visual Benchmark + Regression | Capture workflow on macos-14, vision-judge runner, look-signature comparison job, golden play frames per game | Blocking for Phase 5 exit |
| 13 Agent Authoring / Templates | Templates and `aura3d-browser-game` skill rewritten on `createGame`; "no evidence-only feel" rule | Consumes this PRD |
| 14 18-Game Rebuild | Per-game art/camera tasks spun out of deleted review branches; portfolio decision (Orbital Defense) | Consumes this PRD |
| 15 API / Package Consolidation | Final home of `@aura3d/game` (package vs `@aura3d/engine/game` subpath); deprecation window policy | Not blocking |

### 12.1 External dependencies

- **Runtime npm dependencies added: none.** `@aura3d/game` depends only on workspace packages
  (`@aura3d/engine`, `@aura3d/audio`, `@aura3d/input`, `@aura3d/math`) with `workspace:*`.
- **Tooling:** reuses root devDependencies already present (`size-limit` / `@size-limit/file` ^12.1.0,
  `eslint` ^9.26.0, `vitest` ^3.1.3, `@playwright/test` 1.59.1; `package.json:719-743`). No new tool is
  added. If a loudness meter is needed for `assets add --type audio`, it is implemented in-repo
  (ITU-R BS.1770 K-weighting over decoded PCM, ~150 LOC) rather than adding a native dependency; PRD 05
  owns the transcode binary (`ffmpeg` on the remote runner, not bundled).
- **Fonts:** self-hosted OFL woff2 subsets with `OFL.txt` per family in `packages/game/src/fonts/`.
- **Audio content:** Kenney CC0 packs and other CC0/royalty-free packs per §6.9, each file with a
  recorded license; no runtime fetch from third-party hosts.
- **Remote services:** GitHub Actions `macos-14` (existing), and a real-device session for §19.

## 13. Implementation phases

**Phase 0: Baseline (no product code).**
- Make research 16's classifier repeatable as `tools/quality-rebuild-capture/route-composition.mjs`;
  record per-route LOC split, ternary counts, `window.__*__` globals, audio provenance.
- Run `game-capture-parity.mjs` for all 18 routes; commit the JSON.
- Capture both the default URL and `?capture=review` for the 16 affected routes in the
  `quality-rebuild-capture` workflow, as the divergence record (research 18 Q1).
- Record per route whether the play scene runs the LDR postprocess pass (`app.diagnostics()` at the
  default URL in the capture workflow), which fixes the expected juice backend (`shader` vs `dom`).
- Inventory consumers of route globals: `rg -l "__[A-Z_]+__" tools tests` → `migration/global-consumers.txt`.
- Exit: `docs/project/aura3d-quality-rebuild/migration/baseline.json` committed, with 18 entries,
  each listing LOC split, branch counts by class, global names, cue provenance counts, and
  `postPass: boolean`.

**Phase 1: Package, session, capture contract, evidence channel.**
- `packages/game` scaffold; `createGame`, session, lifecycle, capture, beacon, lazy evidence,
  `FrameLoop.setTimeScale`, `GameAppRuntime.setTimeScale/firstPresentedFrame`, `lookSignature`,
  lint rule, `game-capture-parity.mjs` `--routes`/`--fail-on-*` flags.
- Pilot: Bank Shot migrated through steps 1–3, 8 and 10.
- Exit: unit tests green on GH Actions (`test.yml`); Bank Shot has 0 capture branches of any class (`--routes showcase-bank-shot --fail-on-any`), equal look
  signatures across default and scenario URLs, auto-pause on hidden verified in a browser test, and
  `games.json` readiness for Bank Shot switched to `__AURA3D_GAME__`.

**Phase 2: Sound.**
- `GameSoundEngine`, `AudioSource.setPlaybackRate`, `PositionalEmitter` fix, `createGameAudio`
  adapter, default-cue removal, `game-sfx-core` admitted (≥ 269 files per the §6.9 count), music
  controller, engine-loop layers.
- Pilot: Bank Shot, Courier Rush (engine + city ambience loops actually playing), Aura Clash
  (adapter path, no regression).
- Exit: OfflineAudioContext tests (§15) green; 3 pilot routes play sampled cues only (evidence
  provenance `sample` = 100%); the Courier engine loop's pitch tracks speed (fundamental shift ≥ 25%
  idle→max); blind listening review by a named human scores the pilots' `sound_audio` ≥ 6.

**Phase 3: Juice, tween, FX layer, overlay.**
- Juice facade, tween/easing (`@aura3d/math` `Easing` extension), `SeededRandom` additions, event
  presets, `setInstanceTransforms`, FX layer backend A auto-mount, DOM overlay, LDR-pass juice uniforms
  + WebGPU `fs_juice` (with PRD 03), rumble via `Haptics`.
- Pilot: Courier (strike, pickup, deliver), Bank (pot, foul, combo), Aura Clash (hit, block, KO).
- Exit: `juice-pixels.spec.ts`, `hitstop.spec.ts`, `fx-instances.spec.ts` and `overlay-identity.spec.ts`
  green on macos-14 (deterministic clock, §15). `setInstanceTransforms` landed with FX draw calls
  = live kinds, or the degraded mode is active and its measured draw count is recorded in the Phase 3
  PR. `shake/punch` either drive PRD 08 layers (if landed) or throw/warn as specified. Idle output is
  bit-identical on both backends.

**Phase 4: HUD kit, shell screens, full-bleed layout, touch.**
- HUD kit + 6 themes + fonts; loading/title/pause/settings/results/about; transitions; context-loss
  UI; touch presets.
- Pilot: all 3 pilots.
- Exit: in the macos-14 capture, each pilot's canvas covers ≥ 95% of the desktop viewport. HUD ≤ 15%
  desktop and ≤ 22% mobile. 0 banned tokens in play DOM. Touch play completes the pilot's playbook on
  mobile emulation. Vision re-judgment (§16) on pilots: `ui_hud` ≥ 7, `loading_transitions` ≥ 7,
  `mobile_presentation` ≥ 6 (layout-attributable).

**Phase 5: Fleet migration (waves 2–4).**
- Steps 1–11 of §10 for the remaining 15 routes.
- Exit: `check:capture-parity --fail-on-any` exits 0 for all routes. The lint rule
  is at `error`. Look-signature parity holds for every declared scenario. Fleet evidence LOC ≤ 10% per
  route (classifier). The 16 audio wrappers, 13 perf scripts, all 16 `build-sfx.mjs` and
  `rapier-physics-proof.ts` are deleted. The vision + human thresholds in §16 are met.

**Phase 6: Templates, skills, removals.**
- With PRD 13: the 5 game templates are rebuilt on `createGame`. Deprecated engine shims are removed.
  Legacy evidence globals are removed. Tools are migrated to the beacon.
- Exit: `rg -l "window\.__(?!AURA3D_GAME__|AURA3D_GAME_EVIDENCE__|AURA3D_EVIDENCE_OPT_IN__)[A-Z0-9_]+__" --pcre2 apps tools tests`
  returns only files under `tests/fixtures/`. `rg "game\.hud\.|game\.accessibility\.|game\.evidence\(" apps packages/create-aura3d` returns 0. Templates produce a
  full-bleed, sampled-audio, juiced game from `create-aura3d` on the first run (PRD 13 acceptance).

## 14. Task checklist

### Phase 0: Baseline
- [ ] Create `tools/quality-rebuild-capture/route-composition.mjs`. Implement research 16's classifier (evidence = paths under `tests/ scripts/ art-review/ capture/ evidence/ seo/` or names matching `proof|evidence|probe|capture|acceptance|telemetry|performance-report|poster|harness`; statement-level split of `main.ts`/`*App.ts` with the 8% rule). Output `{route, loc:{evidence,presentation,gameplay,generated}, globals:[...], captureBranches:{ART,FRAMING,TRANSIENT,UNKNOWN}, cues:{sample,synth,html-audio}}`. Add a unit test on a fixture app in `tests/unit/tools/route-composition.test.ts`.
- [ ] Run it plus `tools/showcase-library/game-capture-parity.mjs --json` for all 18 routes. Commit `docs/project/aura3d-quality-rebuild/migration/baseline.json`.
- [ ] Add a `capture_review_divergence` job to `.github/workflows/quality-rebuild-capture.yml` that captures `?capture=review` (and Turbo's `?capture=overview`) for the 16 affected routes as artifacts (record only, not a gate).
- [ ] In the same workflow, record `postPass` per route (does the default-URL play scene run the LDR postprocess pass) into `baseline.json`, and write `migration/global-consumers.txt` from `rg -l "__[A-Z_]+__" tools tests`.

### Phase 1: Package, session, capture, evidence
- [ ] Create `packages/game/package.json` (`name: "@aura3d/game"`, ESM, `sideEffects: ["*.css"]`, exports `.`, `./capture`, `./util`, `./styles.css`), `tsconfig.json`, and `src/index.ts`. Add it to the workspace and the build graph.
- [ ] `packages/engine/src/agent-api/FrameLoop.ts`: make `timeScale` a private mutable field. Add `setTimeScale(scale)` (clamp `[0, 4]`, NaN → throw) and a `timeScale` getter. Make `:126` and the snapshot at `:161` read the current value. Test: `tests/unit/engine/frame-loop-timescale.test.ts` (scale 0 yields 0 substeps and alpha frozen; scale 0.5 halves accumulated sim time over 60 ticks).
- [ ] Verify presentation ordering first: read `index.ts` around the production render loop (`mountCurrentScene` `:11353`, `requestAnimationFrame(render)`) and record in the PR description whether `onFrame` callbacks run before or after `productionController.render` submission, and whether `advance()` (which skips submission, `:10755-10761`) also fires them. If they are not strictly post-submission, add an internal `onPresented(cb)` hook to the app raised after submission resolves.
- [ ] `packages/engine/src/agent-api/GameAppRuntime.ts`: add `timeScale`, `setTimeScale` (forwards to `FrameLoop.setTimeScale`) and `firstPresentedFrame()`. Resolve that promise from the first post-submission frame after `start()`, and re-arm it inside `app.setScene`. Tests in `tests/unit/engine/game-app-runtime.test.ts`: promise does not resolve on `advance()`; resolves once after `step()`; re-arms after `setScene`.
- [ ] `packages/game/src/session/GameSession.ts`: state machine per §7.3, `hitStop` with per-actor freeze sets (expire on sim-unscaled wall time), `slowMo` ramp, `scaledDt`. Drive `runtime.setTimeScale` for global effects. Tests: `tests/unit/game/session.test.ts` (hitStop 0.07 s freezes actor "p1" for 4–5 ticks at 60 Hz while "p3" advances; global hitStop yields runtime time scale 0 then 1).
- [ ] `packages/game/src/session/lifecycle.ts`: `visibilitychange` hidden → `pause("hidden")` + `sound.suspend()`; `pagehide` with `persisted` → suspend only, without → dispose audio; `pageshow` with `persisted` → re-arm unlock + pause menu; pause keys plus Gamepad standard-mapping button 9 polling through `game.input`. Tests with jsdom: `document.hidden` mock, and `PageTransitionEvent` with `persisted: true/false`.
- [ ] `packages/game/src/session/accessibility.ts`: `matchMedia` sources with change listeners plus settings override persisted at `localStorage["a3g:<id>:settings:v1"]`. Test that both override precedence and the media change event apply.
- [ ] `packages/game/src/capture/captureFromUrl.ts` per §7.4. `?capture=review|overview` → `mode:"play"` + `console.warn` once. Test with URLs covering every param.
- [ ] `packages/engine/src/agent-api/index.ts`: add `AuraApp.lookSignature()`/`lookManifest()` as top-level `AuraApp` members (`diagnostics` is already a method, `:10767`), computed from the normalized snapshot (lights, materials, effects, environment, background, renderer options, node id → asset/material/authored scale/authored visible), with the camera excluded and keys sorted. Hash with `crypto.subtle.digest("SHA-256")`. Tests (`tests/unit/engine/look-signature.test.ts`): two snapshots differing only in camera have equal hashes; differing in one `emissiveIntensity`, one light intensity, one authored `scale`, one authored `visible`, or the tone-map exposure each produce a different hash; runtime-handle `setPosition` after mount does not change the hash; object key order does not change the hash.
- [ ] `packages/game/src/evidence/beacon.ts`: install `window.__AURA3D_GAME__` (frozen object replaced on state change, frame counter updated at most 4×/s). Test size: the minified beacon module is < 0.5 KB gz (size-limit check in `packages/game/size-limit.json`).
- [ ] `packages/game/src/evidence/channel.ts`: getter on `window.__AURA3D_GAME_EVIDENCE__[id]`, 250 ms memo, lazy `sections()` import gated by `?evidence=1` or `__AURA3D_EVIDENCE_OPT_IN__`, `legacyGlobals` aliases. Built-in `perf` section from a rAF ring buffer (240 samples). Test: no section function runs in 600 simulated frames without a read.
- [ ] `tools/showcase-library/game-capture-parity.mjs` (today: only `--json` and `--fail-on-art`, `:28-30`): add `--routes <id[,id…]>`, `--fail-on-framing`, `--fail-on-transient`, `--fail-on-unknown`, and `--fail-on-any` (= all four classes). Exempt `src/scenarios/**` files that import only `@aura3d/game/capture`. Update `package.json:691` `check:capture-parity` to pass `--fail-on-any`. Fixture test in `tests/unit/tools/game-capture-parity.test.ts`: one fixture route per class exits 1 under the matching flag and 0 without it; a scenario file is exempt; `--routes` limits scanning.
- [ ] `eslint.config.js`: add `no-restricted-syntax` (messages prefixed `aura3d/no-route-capture-flags:`) for `CallExpression[callee.property.name="get"][arguments.0.value="capture"]` and `Identifier[name=/^(visualReviewCapture|visualCaptureCamera|reviewCapture|captureMode|isCapture|CAPTURE_REVIEW)$/]`, plus `no-restricted-imports` of `@aura3d/game/capture` outside `**/src/scenarios/**`, scoped to `apps/*/src/**` and `packages/create-aura3d/templates/*/src/**`. Start at `warn`; switch to `error` in Phase 5. Verify with `pnpm exec eslint apps/showcase-bank-shot/src/main.ts` reporting the `:49` line before migration and 0 after.
- [ ] `packages/game/src/createGame.ts`: compose `createGameApp` + session + capture + evidence (sound/hud/juice/touch stubs until later phases). Scene decorator wraps `setScene`. Run scenario `setup` after `firstPresentedFrame` when `capture.mode === "scenario"`.
- [ ] Migrate `apps/showcase-bank-shot` per §10 steps 1–3, 8 and 10. Delete `main.ts:49` and all 21 branches (keep the play values). Add `src/scenarios/{pocket,foul,eight-finish,rack-fail}.ts` replacing `__BS_SCENARIO__`. Update `tools/quality-rebuild-capture/games.json` `readyExpr` for bank-shot.
- [ ] CI: add a `node tools/showcase-library/game-capture-parity.mjs --fail-on-any --routes showcase-bank-shot` step to `.github/workflows/test.yml` (route list grows each wave).

### Phase 2: Sound
- [ ] `packages/audio/src/AudioSource.ts`: add `setPlaybackRate(rate, rampMs = 0)` that updates the live `AudioBufferSourceNode.playbackRate` via `setTargetAtTime` (τ = rampMs/3) and stores it for the next `play()`. Test with a mock AudioParam that records calls.
- [ ] `packages/audio/src/PositionalEmitter.ts:232`: replace the field assignment with `this.source.setPlaybackRate(this.lastDoppler, 50)`. Test that a playing loop's rate param changes across two `update()` calls.
- [ ] `packages/audio/src/game-sound/MasterChain.ts`: master gain → glue `DynamicsCompressorNode` (threshold −18 dB, knee 6, ratio 3, attack 0.005, release 0.25) → limiter `DynamicsCompressorNode` (threshold −1 dB, knee 0, ratio 20, attack 0.001, release 0.1) → `WaveShaperNode` safety clip (§6.8 curve, endpoints ±0.966) → destination. Tests with OfflineAudioContext at 48 kHz (runs in the browser suite, since Node/jsdom has no OfflineAudioContext; unit tests cover node wiring with a fake context): 32 simultaneous 0 dBFS 100 ms noise bursts → sample peak ≤ −0.3 dBFS; a single −12 dBFS sine → output within 0.5 dB of input (chain transparent at normal levels).
- [ ] `packages/audio/src/game-sound/Voice.ts`: variant selection (seeded, no immediate repeat), pitch/gain jitter, per-cue `maxVoices` oldest-steal, `cooldownMs`, global tier cap with priority eviction (`ambient` first). Tests cover the variant sequence for seed 42, steal order, and the cooldown drop count.
- [ ] Listener sync in `GameSoundEngine.setListener`: use `AudioListener.positionX…upZ` with `setTargetAtTime` when `"positionX" in listener`, else `setPosition`/`setOrientation` (Firefox). Unit test both branches with fake listeners.
- [ ] `packages/audio/src/game-sound/SpatialVoice.ts`: `PannerNode` (`panningModel` HRTF on high/ultra, equalpower otherwise; `distanceModel: "inverse"`, refDistance 1, maxDistance 60, rolloff 1) plus an occlusion `BiquadFilterNode` lowpass mapped `20000 * (900/20000)^amount`. Test (browser suite, OfflineAudioContext): source at x = −10 with the default listener gives left/right RMS ratio ≥ 6 dB for both `HRTF` and `equalpower`.
- [ ] `packages/audio/src/game-sound/LoopHandle.ts` and `EngineLoop.ts`: layer crossfade by RPM (equal-power), pitch `clamp(rpm/layer.rpm, 0.7, 1.4)`, load blend. Test fixture: two generated layers, 100 Hz sawtooth tagged rpm 1500 and 200 Hz sawtooth tagged rpm 4500; render 1 s at rpm 1500 and at rpm 6000 (OfflineAudioContext, browser suite); the autocorrelation fundamental differs by ≥ 25% (expected ≈ 100 Hz vs ≈ 267 Hz).
- [ ] `packages/audio/src/game-sound/MusicController.ts`: single-stem tracks via one `MediaElementAudioSourceNode`; multi-stem tracks as decoded buffers started at one shared `when` (§6.8); crossfade, intensity stem gains, beat/bar-quantized stinger scheduling from `bpm` and track start time, pause duck (−9 dB plus lowpass 1.2 kHz). Unit tests with a fake context clock: all stems receive the identical `start(when)`; a stinger requested at 1.3 bars at 120 bpm is scheduled at exactly bar 2 (4.0 s after start).
- [ ] `packages/audio/src/game-sound/ReverbSend.ts`: presets per §6.8 with bundled IRs (`packages/audio/assets/ir/<preset>.{webm,m4a}`, mono 24 kHz, chosen by the format probe); disabled on the `low` tier. Unit test: `low` tier creates no `ConvolverNode`; IR length per tier ≤ the §17 limit.
- [ ] `packages/audio/src/game-sound/GameSoundEngine.ts`: `createGameSoundEngine` per §7.5. `proof()` reads only live node state (playing voices, bus gain `.value`, context state, provenance). Export it from `packages/audio/src/index.ts`.
- [ ] `packages/engine/src/game/GameAudio.ts`: reimplement `createGameAudio` as an adapter over `createGameSoundEngine`, keeping the `GameAudio` interface (`:138-155`) and evidence shape. Delete `playDefaultCue` (`:485-503`). Throw on cues without `asset`/`play`. First add `tests/unit/engine/route-cue-maps.test.ts` that imports every route cue map and asserts each cue has `asset` or `play` (must pass before the throw lands). Update `tests/unit/engine/*audio*` expectations.
- [ ] Format probe: `packages/audio/src/game-sound/formatProbe.ts` decodes bundled 20 ms Opus/WebM and AAC/M4A probes once and picks the URL variant. Test with a mocked `decodeAudioData` rejecting Opus.
- [ ] `aura3d assets add --type audio`: require `license`, `sourceUrl` and `author`; compute loudness (integrated LUFS, true peak) and store it in the manifest. `assets validate --release` fails when `provenance: "synth"` is not on an allowlist (coordinate with PRD 05).
- [ ] Assemble `assets/packs/game-sfx-core/` per the §6.9 table (≥ 269 files): admit files with licenses, normalize loudness (§6.9 targets), and transcode to Opus + AAC on the remote runner. Write `LICENSES.md` with per-file attribution. Generate typed ids in `packages/game/src/sfx.ts`. Acceptance: `aura3d assets validate --release` passes on the pack; a script asserts every manifest entry has `license`, `sourceUrl`, `author`, `lufs`, `truePeak` and both encodings.
- [ ] Migrate Bank Shot cues (`billiards-audio.ts`) to `src/sound.ts` using `sports/table` ids. Delete `billiards-audio.ts`, `scripts/build-sfx.mjs` and the generated WAVs.
- [ ] Migrate Courier Rush: play the engine loop via `sound.engine({...van layers})`, with `setRpm` from van speed and `setLoad` from throttle every frame. Start the `city-night` ambience bed on `playing`. Delete `courier-audio.ts`.
- [ ] Aura Clash: verify that the adapter path preserves its 11 CC0 samples on 4 buses. Add a music track and announcer cues (`round`, `fight`, `ko`) from `creature/voice`.

### Phase 3: Juice, tween, FX, overlay
- [ ] `packages/math/src/Easing.ts`: extend the existing 4-function `Easing` (`:1-24`, keeps its `[0,1]` assertion) to the 31 functions in `EaseName` (§7.6) + `Easing.spring(stiffness, damping)` (closed-form critically/under-damped, returns `(t) => number`). `packages/game/src/util/ease.ts` re-exports it keyed by `EaseName`. Tests in `tests/unit/math/easing.test.ts`: `f(0)=0`, `f(1)=1` (±1e-9) for all 31; monotonic non-decreasing on 101 samples for every ease except `back*`, `elastic*`, `bounce*`.
- [ ] `packages/math/src/Random.ts`: add `int(min, maxExclusive)`, `pick(array)`, `shuffle(array)` (Fisher–Yates), `fork(label)` to `SeededRandom`. Tests: fixed sequences for seed 42; `fork("a")` and `fork("b")` diverge; `shuffle` is a permutation.
- [ ] `packages/game/src/juice/tween.ts`: tween engine on session time (or wall time with `unscaled`), ≤ 64 active (pool), property paths for `position/scale/rotation` on `TweenableNode` and numeric fields on objects. `done` promise; `cancel/finish`. Tests: a 0.5 s position tween reaches its target at tick 30 at 60 Hz; it pauses while the session is paused.
- [ ] `packages/game/src/juice/Juice.ts`: facade per §7.6. `fire()` resolves presets and applies reduced-motion/flash scaling (§6.6). `shake/punch` call `app.camera.addLayer` when present, otherwise follow the dev-throw / prod-warn rule. Tests for preset composition and reduced-motion scaling.
- [ ] `packages/game/src/juice/overlay.ts`: drives the new `app.setOutputOverlay({ flash, vignette, shape, fade })` (§7.8), or `.a3g-overlay` DOM when it returns `applied: false`. Envelope: attack 0, `amount(t) = peak · exp(-5t/ms)` for `t < ms`, then exactly 0 (so the idle branch is reached). Unit test with an injected clock: values at t = 0, ms/2, ms−ε, ms match the formula and the last is 0.
- [ ] `packages/rendering/src/WebGL2Device.ts`: add the four `u_juice*` loose uniforms and `applyJuice` to `ensureLdrPostprocessProgram` (`:3440`), applied once in `main()` on every `outColor` write (§8); upload next to `:1893-1908` only when values change. `packages/rendering/src/WebGPUDevice.ts`: add `fs_juice` and append it in `presentLdrPostprocess` (`:1446`) only when an amount ≥ 1/512. Engine: `AuraApp.setOutputOverlay` in the production bridge (`index.ts` near the postprocess plan at `:12898-12924`), returning `reason: "no-post-pass"` when the scene has no post passes. Coordinate with PRD 03 (it owns the pass; this PRD adds only these lines).
- [ ] Engine: `AuraRuntimeNodeHandle.setInstanceTransforms(matrices, count, colors?)` (§7.8) for nodes created by `instances.*` (`index.ts:2222`), with WebGL2 `bufferSubData` and WebGPU `writeBuffer` paths and no reallocation for `count ≤ capacity`. Tests: unit (handle validates sizes, throws on non-instanced nodes and `count > capacity`); browser (`fx-instances.spec.ts`: moving one instance changes pixels at the new position, draw-call count for the node stays 1).
- [ ] `packages/game/src/juice/fx.ts`: FX layer backend A, with an instanced pool per kind (sphere for spark/debris/bubble, quad for dust/ring/streak), preset tables, deterministic seeded bursts, gravity/drag integration on session dt, and capacity per tier (§17). Scene decorator adds the pool nodes at mount with `castShadow:false` and `visible:false`, at `[0,0,0]` scale 1 (§9.1). Per frame: integrate, write `setInstanceTransforms`, set `visible = count > 0`. Unit test: a 24-spark burst integrates deterministically for seed 7; `liveCount` returns to 0 after the longest `life`.
- [ ] `packages/game/src/juice/rumble.ts`: thin adapter over `packages/input/src/Haptics.ts` (which already probes `vibrationActuator.playEffect` and `navigator.vibrate`); maps `{ ms, strong, weak }` to its API, honors the settings toggle, and reports Haptics' `via` in the `juice` evidence section. Unit test with stubbed navigator/gamepad.
- [ ] Courier Rush: `juice.define({ strike, pickup, deliver, combo })`. Remove the DOM strike flash and the `game.effects` pool (`main.ts:113`) with its spawns (`ringShockwave` `:846`, `hitSpark` `:1191`) and `update` (`:1402`), replacing them with `fx.burst`.
- [ ] Bank Shot: `juice.define({ pot, foul, cushion, combo })` with `sports/table` cues, `fx.burst("ring")` at the pocket and a small `hitStop(0.045)` on a pot.
- [ ] Aura Clash: route its hit-stop to `session.hitStop(…, { actors })`. Replace the app-local spark path in `rendering/HitSparkVfx.ts` with `fx.burst("spark")` only if the vision comparison (§16) is not worse. Otherwise keep it, and file it for PRD 07.

### Phase 4: HUD, shell, touch
- [ ] `packages/game/src/hud/HudKit.ts`: mount once, slot grid with `env(safe-area-inset-*)`, a batched write phase on rAF, and no `innerHTML` after mount (dev assertion that wraps `Element.prototype.innerHTML` setter under `.a3g-hud` in dev builds). Widgets per §7.7 in `src/hud/widgets/*.ts`.
- [ ] `packages/game/src/hud/screenFraction.ts`: compute the union of widget rects ∩ canvas rect / canvas area. Publish it in `hud.snapshot()`. Dev warning when it exceeds `maxScreenFraction`.
- [ ] `packages/game/src/styles/themes/*.css`: 6 theme presets + `plain` as `--a3g-*` custom properties. `src/fonts/` with OFL woff2 Latin subsets (≤ 40 KB each) and `OFL.txt`; `FontFace` loading in the shell before title.
- [ ] `packages/game/src/shell/GameShell.ts` + `screens/{Loading,Title,Pause,Settings,Results,About,ContextLost}.ts`: layers per §6.2. Keyboard/gamepad/touch navigable menus (roving tabindex, `aria-modal`, focus trap, Escape closes). Loading progress from resolved asset promises. Title doubles as the audio unlock.
- [ ] `packages/game/src/shell/transition.ts`: overlay fade out → run → `await runtime.firstPresentedFrame()` → fade in. Test that no frame is presented with the overlay transparent between `setScene` and the first new frame (browser test).
- [ ] `packages/game/src/shell/contextLoss.ts`: subscribe to `app.onDeviceLost` → session `context-lost`, HUD hidden, ContextLost menu; `app.onDeviceRestored` → close menu, stay paused until the player resumes; after 3 s without restore, show a Reload button. (The engine already owns `webglcontextlost` handling behind `onDeviceLost`, `WebGL2Device.ts:444`; the shell does not attach its own canvas listeners.) Also verify that the WebGPU device's `device.lost` promise raises `onDeviceLost`; if it does not, add that wiring in `WebGPUDevice.ts` and a unit test with a fake device whose `lost` resolves.
- [ ] Promote Aura Clash `src/ui/{TitleScreen,LoadingShell,PauseMenu,ResultsPanel,CharacterSelect}.ts` patterns into the shell screens. Then delete the app copies after Clash runs on the shell (CharacterSelect stays route-local as a custom menu registered through `shell.pause.items`/a route screen hook).
- [ ] `packages/input/src/TouchLayouts.ts`: add `TouchLayoutGenre` entries for `twin-stick`, `aim-drag`, `flight`, `lane-swipe`, `flippers` (existing: `fight`, `race`, `platform`, `:3`), each with button/stick rects in safe-area-relative units and a unit test that all targets are ≥ 48 CSS px at 390×844.
- [ ] `packages/game/src/touch/TouchControls.ts`: presets per §6.11 built on `packages/input/src/VirtualTouchControls.ts` and `TouchLayouts.ts`, writing into `GameInputController` actions/axes. Visibility rule; ≥ 48 px targets; hide keyboard-hint elements marked `data-a3g-keyhint`.
- [ ] Pilots: Bank Shot `hud.widgets` (score, combo, objective, prompt) with the `tabletop` theme and `aim-drag` touch; Courier (`motorsport` widgets: timer, score, strikes as lives, objective, indicator to drop-off, speedometer; `steer-pedals`); Aura Clash (`fighting`: two meters with ghost, timer, combo at edge, banner ROUND/FIGHT/KO; `dpad-4btn`). Delete `courier-rush/src/hud.ts` and the Bank/Clash HUD code. Move nav/prose to `about`.

### Phase 5: Fleet
- [ ] For each wave-2 route (rooftop, pulse, neon, gravity, skyline, blockfall), complete §10 steps 1–11. Specifically delete: rooftop's review pavilion world and its `?debug=animation` hidden-athletes branch (`main.ts:502-536`), keeping the play-mode athlete visibility as-is (if athletes are hidden in play, that is filed as a PRD 06/14 task, not resolved here); pulse's `main.ts:1373-1467` review builders and 15 `art-review/*` probe entries; neon `main.ts:254,688,878` swaps (and wire `cameraDirector` output to PRD 08 or delete it, `main.ts:1667-1671`); gravity's freightway/`compositionPresentationOverride` (`main.ts:1369,2441-2443`); skyline `__AURA3D_COMPOSITION_PROBE__`/density/ghost capture globals; blockfall's room-node drop and backdrop enlargement (`main.ts:528,628`) and 5 probe globals.
- [ ] For each wave-3 route (aurora, deep, patrol, gallery, siege, mech, vault, turbo), complete §10 steps 1–11. Specifically: deep replaces raw `HTMLAudioElement` with `sound`; patrol, turbo, aurora and deep get `sound.engine`/thruster loops with live pitch; turbo removes the `?capture=overview` camera (`main.ts:564`) and the review-only smoothing disable (`main.ts:2826-2830`); mech deletes the "ASSET PASSPORT" panel; gallery removes "Backend rapier / LOS rays" HUD text; turbo and blockfall remove `rapier-physics-proof` imports.
- [ ] Delete `apps/common/src/rapier-physics-proof.ts`.
- [ ] Add `aura3d perf-report --route <id> --telemetry <json>` to `packages/aura3d-cli`, consuming the `perf` evidence section. Delete the 13 `apps/*/scripts/write-performance-report.ts` and their `package.json` scripts.
- [ ] Switch the ESLint capture rule to `error`. Add `check:capture-parity --fail-on-any` (all routes) and the look-signature job (default vs every scenario vs `?capture=review`, artifact = `look-signature.json` + manifest diffs) to `.github/workflows/quality-rebuild-capture.yml`.
- [ ] Update every `tools/quality-rebuild-capture/games.json` `readyExpr` to `window.__AURA3D_GAME__?.state === 'playing'`, and every `evidenceGlobal` to `__AURA3D_GAME_EVIDENCE__`.
- [ ] Re-run `route-composition.mjs`. Every route must be ≤ 10% evidence LOC. Commit `migration/after.json` with deltas against `baseline.json`.

### Phase 6: Removal and templates
- [ ] Remove `legacyGlobals` from all routes. Migrate `tools/showcase-library/{route-gates,route-primary-probes,showcase-game-release-gates,game-play-probe,game-viewport-probe,game-mobile-touch-audit}.mjs` to the beacon + evidence channel.
- [ ] Remove deprecated `game.hud`, `game.accessibility`, `game.evidence` and `game.touchControls` from `index.ts:8250,8280-8306`. Update `tools/public-api-contract`.
- [ ] With PRD 13: rebuild `packages/create-aura3d/templates/{mini-game,racing-starter,falling-blocks-starter,fighting-game,character-controller}` on `createGame` with sound cues from `game-sfx-core`, `juice.define` events, a HUD theme and a touch preset. Template tests assert 0 capture branches and 0 synth cues.

## 15. Test requirements

All browser and GPU tests run remotely on **GitHub Actions `macos-14`** (ANGLE Metal, per policy and
the existing `quality-rebuild-capture.yml`). Never use local browsers, and never use SwiftShader
(ubuntu) for visual gates (research 14 §3.9). Unit tests run with `vitest` (`pnpm test:unit`,
`maxWorkers=2`), and they may run on ubuntu runners.

Unit (vitest, `tests/unit/game/**`, `tests/unit/audio/game-sound-*.test.ts`, `tests/unit/engine/**`):
- Session: state transitions (illegal ones throw), hit-stop per actor and global, slow-mo ramp, pause
  on `document.hidden`, settings persistence round-trip and schema version migration.
- Capture: URL parsing; review/overview ignored with a warning; scenario only after first frame.
- Look signature: camera-only change → same hash; any light/material/effect/authored-scale/visibility
  change → different hash; key ordering irrelevant.
- Evidence: zero section evaluations without reads; memo window; lazy import not triggered without
  opt-in; legacy aliases return the same object; `perf` uses injected rAF timestamps, not engine fps.
- Sound (node, fake `BaseAudioContext` recording node graph and AudioParam calls): graph wiring
  matches §6.8; voice cap and steal order; cooldown drop count; deterministic variant/jitter sequence
  per seed; listener-sync branch selection; `createGameAudio` adapter evidence shape unchanged;
  asset-less cue throws; every route cue map has `asset` or `play`.
- Sound DSP (real `OfflineAudioContext` at 48 kHz, run as `tests/browser/game-shell/audio-dsp.spec.ts`
  on macos-14 because Node has no Web Audio): cue RMS > −40 dBFS in its window; panning ratio ≥ 6 dB;
  occlusion 1.0 attenuates the 5–10 kHz band by ≥ 18 dB relative to occlusion 0; master-chain sample
  peak ≤ −0.3 dBFS under 32 summed 0 dBFS bursts; transparency within 0.5 dB at −12 dBFS;
  engine-loop fundamental shift ≥ 25% on the fixture layers.
- Juice/tween/ease: easing endpoints; tween timing at 60 Hz and under pause; reduced-motion scaling;
  flash cap under reduced flash; ≤ 3 flashes/s limiter.
- HUD: no `innerHTML` writes after mount (dev guard); unchanged values cause 0 DOM writes over 100
  frames (MutationObserver count); banned-token scanner.
- Touch: preset → action mapping; visibility rules for `(pointer: coarse)`/fine.
- Tools: `route-composition.mjs` and `game-capture-parity.mjs` fixture tests.

Browser (Playwright on macos-14, `tests/browser/game-shell/*.spec.ts`, built pilot routes served
from the workflow on `localhost`). **Deterministic clock rule:** every pixel- or timing-sensitive spec
loads the route with `?scenario=<name>&freezeAt=<t>&evidence=1` and drives time through a test-build
hook `window.__AURA3D_GAME_TEST__.stepFrames(n, dt = 1/60)` that advances the session clock by exactly
`dt` and calls `app.step(dt)` once per frame, then awaits `firstPresentedFrame`-style presentation
before reading pixels. Real rAF timing is never used for these assertions, because measured runner
fps is 0.5–60 (§1) and a 200 ms envelope could otherwise fall between two frames. The hook is
compiled only when `import.meta.env.MODE === "test"` and its absence in production builds is asserted
by `layout.spec.ts` (`window.__AURA3D_GAME_TEST__ === undefined` on the production bundle).
- `overlay-identity.spec.ts`: render the benchmark `18-game-scene` and Bank Shot with the overlay
  compiled and amounts 0 vs the overlay code path absent, on WebGL2 and on WebGPU (Chromium with
  WebGPU enabled). Max per-channel abs diff = 0.
- `fx-instances.spec.ts`: moving one instance of an instanced node via `setInstanceTransforms`
  changes pixels at the new projected position and not at the old one; the node's draw count stays 1
  (`app.diagnostics()` draw-call counter).
- `audio-dsp.spec.ts`: the OfflineAudioContext DSP assertions listed under Sound DSP above.
- `juice-pixels.spec.ts`: frozen scenario (static frame), then `juice.flash("#ffffff", { peak: 0.6, ms: 200 })`
  at frame N, stepping 1/60 s per frame. Frame N+1 mean luma (Rec. 709, 8-bit, full canvas)
  increases by ≥ 25 over frame N. Frame N+13 (≥ 200 ms later, envelope exactly 0) has max per-channel
  abs diff = 0 versus frame N. Run once with `postPass` true (shader path) and once with
  `shell.overlay: "dom"` (DOM path; for the DOM path the screenshot is a page screenshot, not a canvas
  readback). `fx.burst("spark", p, { count: 24 })` → frames N+1…N+6 have ≥ 0.15% of canvas pixels within
  ΔE2000 < 12 of the spark color inside a 120 px radius of the projected point.
- `hitstop.spec.ts`: Aura Clash scenario "light-hit", stepping 1/60 s per frame → after contact,
  the struck actor's runtime-node position/rotation (`AuraRuntimeNodeHandle.snapshot()`) is unchanged
  for frames 1–2 (0.045 s light hit-stop ≥ 2 ticks) and changes by frame 4; a third, uninvolved
  animated node changes on every one of those frames.
- `shell-flow.spec.ts`: loading → title → playing on key and on tap; pause on Escape; hidden-tab
  auto-pause (`page.evaluate` dispatching `visibilitychange` with `document.hidden` patched); results
  retry. Transition check: in the test build the shell appends `{ frame, overlayOpacity, sceneId }`
  to `__AURA3D_GAME_TEST__.presentLog` on every presented frame (overlay opacity read from
  `getComputedStyle` before the frame); assert that no entry exists with `sceneId === previous` after
  `setScene` was called, nor with `overlayOpacity < 1` between the `setScene` call and the first entry
  carrying the new `sceneId`.
- `context-loss.spec.ts`: `WEBGL_lose_context.loseContext()` → ContextLost menu visible and
  `.a3g-hud` `display: none` within 100 ms; session state `context-lost`; `restoreContext()` → menu
  closes and state is `paused`; with restore withheld for 3 s, a Reload button is visible.
- `layout.spec.ts`: desktop 1920×1080, 1280×720 and mobile 390×844 → canvas ≥ 95% viewport area on
  desktop and ≥ 70% on mobile portrait (excluding the safe area). HUD fraction ≤ 0.15 / 0.22. 0
  banned tokens in `document.body.innerText` while `state === "playing"`.
- `touch.spec.ts` (mobile emulation, `hasTouch: true`): each pilot's capture playbook completes using
  touch events only.
- `capture-parity.spec.ts`: for each route, `lookSignature()` at the default URL equals the signature
  at each `?scenario=` URL and at `?capture=review`.
- `audio-live.spec.ts`: after a gesture, the AudioContext is `running`, `sound.proof()` shows ≥ 1 voice
  on cue, provenance all `sample`, and a master limiter is present. Courier: `setRpm` changes the live
  `playbackRate.value`.

## 16. Visual acceptance tests

Reference and judgment method: the `21-game-vision-judgment.md` rubric (same categories and
calibration prompt, same Kiro Prism vision model run, 3 desktop shots + 1 mobile shot from the
`quality-rebuild-capture` workflow at the default URL), **plus** a named human reviewer scoring the
same categories with written critique. Where the model and human differ by > 2 on a category, the
human score stands and the disagreement is recorded. Approval is impossible while any PRD-09-owned
category is ≤ 4 (research 14 §7.6 pattern).

PRD-09-owned categories and thresholds per migrated game (baseline from 20/21):

| Category | Baseline | Pass per game | Fleet median |
|---|---|---|---|
| `ui_hud` (vision) | 4–6 | ≥ 7 | ≥ 7.5 |
| `typography` | 2.5–6 | ≥ 7 | ≥ 7 |
| `loading_transitions` | 3–5 | ≥ 7 | ≥ 7.5 |
| `sound_audio` (human listening, 2 min session, headphones) | 0–5, median 3 | ≥ 6 | ≥ 7 |
| `polish_juice` (human + vision on action shot) | 0–5, median 2 | ≥ 6 | ≥ 6.5 |
| `mobile_presentation` (scored on the 390×844 shot; rubric instruction: "score layout, HUD share, touch affordances and absence of keyboard hints; do not penalize render resolution/blur, which PRD 11 owns") | 1–3.5 | ≥ 6 | ≥ 6.5 |
| Review-vs-play parity (research 18 axis) | 16/18 divergent | look signatures equal; 0 ART/FRAMING branches | 18/18 |

Guards that make these thresholds able to fail:
- **Calibration control.** Each judging batch includes, unlabelled and shuffled among the after-shots,
  the baseline shot of 2 randomly chosen games (`evidence/games/<id>-mid.jpg`). If either control is
  scored ≥ its game's pass threshold on any PRD-09-owned category, the whole batch is invalid and is
  re-run with the calibration prompt; two invalid batches in a row escalate to a human-only review.
- **Blind pairwise preference.** For each game the human reviewer (and separately the vision model) is
  shown baseline vs after for the same timeline moment in random left/right order and asked which
  has the better HUD, flow and feedback. The after-shot must win for that game; a tie or loss fails the
  game regardless of absolute scores.
- **No self-review.** The human reviewer is not the engineer who migrated the route.

Additional measured criteria (automated, from the same capture run):
- 3D canvas share ≥ 95% desktop; HUD fraction ≤ 15% desktop and ≤ 22% mobile.
- Action shot (`04-action`) of every combat/impact game (aura-clash, mech, neon, siege, rooftop,
  vault, bank, courier, gravity, turbo) shows visible feedback at the event: FX coverage ≥ 0.15% of
  canvas near the event, or a flash luma delta ≥ 15, confirmed by the human reviewer as "readable hit
  confirmation".
- 0 banned debug tokens (§6.10 list) in `document.body.innerText` and in OCR of each of the 4 shots
  (`tesseract`, installed with `brew install tesseract` in the macos-14 job; catches tokens drawn into
  the canvas or images).
- Per-game, the §10.1 "expected visible change" column is checked off by the human reviewer against the
  after-shots; any unchecked item fails the game.

Benchmark scenes (`benchmarks/quality-rebuild`, three r185 reference): this PRD must not regress
`18-game-scene` (Aura 3.5–4.5 / three 5–7, research 22/23) or `14-particles` (Aura 1 / three 6.5).
Gate: `overlay-identity.spec.ts` bit-identical with juice idle. These scenes improve through PRDs
01/02/07, not here.

Honesty check carried into every review: the reviewer is given the default-URL frames only. Review-
mode frames are not supplied. Any engineering gate (tests, route 200, non-blank, green audit) is
listed as context, never as quality evidence.

## 17. Performance budgets

Tiers follow PRD 11's tier API. Until it exists, the shared runtime defaults to `medium` on desktop
and `low` on `(pointer: coarse)` with `navigator.hardwareConcurrency ≤ 6`. Numbers are budgets for
**this PRD's systems only**, measured at 1920×1080 on the macos-14 runner (Apple M1 virtual,
ANGLE Metal) and on the mobile devices in §19. They are not frame totals.

| Budget | Low | Medium | High | Ultra |
|---|---|---|---|---|
| GPU: juice overlay, WebGL2 (folded into LDR pass, active frames) | 0 (DOM fallback) | ≤ 0.08 ms | ≤ 0.12 ms | ≤ 0.15 ms |
| GPU: juice overlay, WebGPU (extra `fs_juice` pass, active frames only) | 0 (DOM fallback) | ≤ 0.25 ms | ≤ 0.3 ms | ≤ 0.3 ms |
| GPU: juice overlay, idle frames (both backends) | 0 | 0 | 0 | 0 |
| GPU: FX layer (backend A) | ≤ 0.10 ms, ≤ 32 live | ≤ 0.20 ms, ≤ 96 live | ≤ 0.30 ms, ≤ 256 live | ≤ 0.45 ms, ≤ 512 live |
| Draw calls added (= FX kinds with `count > 0` this frame; idle kinds are `visible:false`) | ≤ 4 concurrent kinds | ≤ 6 | ≤ 10 | ≤ 10 |
| CPU: session + tween + juice | ≤ 0.10 ms | ≤ 0.15 ms | ≤ 0.20 ms | ≤ 0.25 ms |
| CPU: HUD write phase (p95) | ≤ 0.30 ms | ≤ 0.30 ms | ≤ 0.30 ms | ≤ 0.30 ms |
| CPU: sound main thread (p95) | ≤ 0.15 ms | ≤ 0.20 ms | ≤ 0.25 ms | ≤ 0.30 ms |
| CPU: evidence in play | 0 | 0 | 0 | 0 |
| Forced layout/reflow per frame | 0 | 0 | 0 | 0 |
| Audio voices (global cap) | 12 | 24 | 32 | 48 |
| HRTF panners (nearest N; rest equalpower) | 0 | 4 | 8 | 16 |
| Reverb | off | 1 send, IR ≤ 0.8 s | 1 send, IR ≤ 1.5 s | 1 send, IR ≤ 2.5 s |
| Decoded SFX memory (float32 PCM) | ≤ 16 MB | ≤ 32 MB | ≤ 48 MB | ≤ 64 MB |
| Music | streamed, 1 stem | streamed, ≤ 2 stems | streamed, ≤ 4 stems | streamed, ≤ 4 stems |
| HUD DOM nodes | ≤ 150 | ≤ 200 | ≤ 300 | ≤ 300 |
| Initial JS added by `@aura3d/game` (gz) | ≤ 46 KB | ≤ 46 KB | ≤ 46 KB | ≤ 46 KB |
| Fonts per theme (woff2) | ≤ 2 files, ≤ 80 KB | same | same | same |
| SFX download per game (Opus) | ≤ 0.8 MB at load + lazy rest | ≤ 1.5 MB | ≤ 1.5 MB | ≤ 2.5 MB |

Measurement method (each budget names its method in the perf evidence):
- GPU times: `EXT_disjoint_timer_query_webgl2` / WebGPU `timestamp-query` when the runner exposes
  them; otherwise A/B frame-time delta (feature on vs off, 600 frames each, scene made GPU-bound by
  rendering at 1920×1080 DPR 1 with `freezeAt`), reported as p50 delta. The method used is recorded;
  a budget measured by A/B delta passes only if the delta's 95% bootstrap interval upper bound is
  within budget.
- CPU times: `performance.now()` spans around each system per frame, p95 over 600 frames, from the
  `perf` evidence section.
- Forced layout: Chrome DevTools Protocol trace (`Layout` events with a JS stack inside `@aura3d/game`)
  over 600 play frames must be 0.
- Bundle: `size-limit` on `packages/game/dist` (CI).

Notes:
- Low-tier FX caps: at most 4 kinds may be live at once on Low; a burst of a 5th kind evicts the
  oldest kind's remaining particles.
- The 46 KB gz initial budget breaks down as core (shell, session, capture, beacon) ≤ 14, HUD ≤ 12 +
  CSS ≤ 6, sound glue ≤ 10 (the engine in `@aura3d/audio` is shared with `createGameAudio`), juice +
  tween + easing ≤ 5, touch ≤ 5 (lazy-loaded when touch is detected, so desktop initial ≤ 41).
  Evidence sections are a lazy chunk, never in the initial load. This is measured with size-limit in
  `packages/game/size-limit.json` in CI. Context: the root `.` bundle is 575,343 B gz against an
  80 kB budget (research 13 §9). This PRD must not add to the engine root, which is why the
  package is separate.
- **Expected route-side savings** (Phase 5 target, from research 16 counts and `wc -l`): −2.9k LOC audio wrappers,
  −2.3k HUD, −1.2k spark pools, −1.1k perf scripts, the evidence blocks (80–300 LOC per route), and
  395 capture branches. Target ≥ 8k LOC deleted fleet-wide, with each route's evidence share ≤ 10%.
- Memory arithmetic: 48 kHz stereo float32 = 384 KB/s. A 48 MB SFX budget ≈ 125 s of decoded
  one-shots, which is enough for the §6.9 core set (most one-shots are 0.1–1.5 s, typically mono:
  192 KB/s).
- The fps problem (5–15 fps in most games, 0.5–3.6 in Deep Recovery) is not this PRD's budget to fix.
  This PRD must not make it worse: the Phase 5 exit requires per-route rAF p50 frame time no worse
  than baseline +0.5 ms at equal canvas size. Canvas enlargement from full-bleed is measured
  separately and attributed to PRD 11 tiering.
- Mobile: Low tier on phones. Touch layer ≤ 0.05 ms/frame. `navigator.vibrate` only on Android
  Chrome. The AudioContext is suspended when hidden, which saves battery.

## 18. Browser coverage

| Browser | Runner | Scope |
|---|---|---|
| Chromium (Playwright, ANGLE Metal) | GH Actions `macos-14` | All unit + browser specs, capture workflow, vision captures (primary) |
| WebKit (Playwright) | GH Actions `macos-14` | `shell-flow`, `layout`, `audio-live` (gesture unlock, AAC fallback path), `touch` (mobile emulation) |
| Firefox (Playwright) | GH Actions `macos-14` | `shell-flow`, `audio-live` (Opus path), `layout` |
| Edge | covered by Chromium | — |
| Safari 17+ desktop specifics | WebKit run | `AudioContext` unlock only on gesture; `MediaElementAudioSourceNode` streaming; `FontFace` load; `visibilitychange` on tab switch |

No visual gate runs on ubuntu/SwiftShader. Unit tests may.

## 19. Mobile coverage

- Emulation (every PR touching `packages/game` or a migrated route): Playwright `iPhone 13` (390×844,
  DPR 3, WebKit) and `Pixel 7` (412×915, DPR 2.625, Chromium) on macos-14. Covers layout fractions,
  touch playbooks, the safe area (`viewport-fit=cover`), and orientation change (portrait → landscape
  re-layout without context recreation).
- Real devices (Phase 4 and Phase 5 exits): iPhone 13 or newer (iOS Safari 17+) and a mid-range
  Android (Pixel 6a/7 class, Chrome stable). No device farm exists in the repo today. Use AWS Device Farm
  (only region `us-west-2`) remote-access sessions on the `auraone-production-operator` profile, set up
  through `/Users/gurbakshchahal/AuraOne/scripts/setup-auraone-shared-aws.sh`; the deployed preview URL of
  each migrated route is opened in Safari/Chrome on the device and the checks below are run by the
  named human reviewer, with a screen recording saved to `evidence/games-after/<id>/device-{ios,android}.mp4`.
  If Device Farm is blocked (IAM deny such as `devicefarm:CreateRemoteAccessSession`), record the exact
  action, resource and profile plus the minimal grant, and keep the PRD's mobile completion criterion
  open. Do not substitute emulation.
- Mobile checks: audio unlock from the title tap (iOS mute-switch caveat documented in the settings
  hint), touch target size ≥ 48 px, HUD ≤ 22%, no keyboard hints visible, pause on app switch, and
  resume without an audio glitch.

## 20. Screenshots and evidence required

Per migrated route, committed under `docs/project/aura3d-quality-rebuild/evidence/games-after/<id>/`
(JPEG ≤ 1100 px for review, full PNGs as workflow artifacts with SHA-256 in `report.json`):
- `01-title`, `02-opening`, `03-mid`, `04-action` desktop 1920×1080, plus `03-mid` mobile 390×844, all
  from the **default URL** with real input (the existing `games.json` timelines).
- `05-pause`, `06-results`, `07-loading` (mid-progress) desktop.
- Side-by-side contact sheet: baseline (`evidence/games/<id>-contact.jpg`) vs after.
- `look-signature.json`: default URL vs each scenario vs `?capture=review`, all equal.
- `capture-parity.json`: 0 ART / 0 FRAMING / 0 TRANSIENT / 0 UNKNOWN.
- `composition.json`: LOC split after migration and delta from baseline.
- `audio.webm` (Opus): 60 s capture of the WebAudio master output during the timeline, through a
  `MediaStreamAudioDestinationNode` tap in the test build, for the human listening review.
- `review.md`: vision-model scores + human scores and critique for §16 categories, with reviewer name
  and date.

## 21. Completion criteria

PRD 09 is complete when **all** of the following hold:
1. All 18 routes (or the PRD 14 portfolio, if Orbital Defense is deleted) run on `createGame`.
2. `check:capture-parity --fail-on-any` exits 0 (0 ART, FRAMING, TRANSIENT and UNKNOWN branches). The ESLint
   capture rule is `error`. Look signatures are equal across default/scenario/`?capture=review` for
   every route.
3. 0 synth-provenance cues in any route outside an explicit allowlist. The default oscillator cue
   no longer exists. `playPositional` produces real panning (browser test).
4. Every route's evidence share is ≤ 10% of classified LOC. The 16 audio wrappers, 13 perf scripts,
   `build-sfx.mjs` scripts, `rapier-physics-proof.ts` and all route `publishEvidence` blocks are deleted.
5. The §16 per-game thresholds are met on the default-URL captures, as judged by the vision model
   **and** a named human. Fleet medians are met.
6. The §17 budgets hold on the macos-14 runner and on both real mobile devices.
7. Templates (PRD 13) generate games on `createGame` with sampled sound and visible juice.
8. A reviewer shown the shipped play frames answers "yes" to: *does this look and feel like a
   competitive modern browser game in its genre?* for the PRD-09-owned aspects (HUD, flow, sound,
   feedback, mobile layout). A green CI run alone does not satisfy this criterion.

## 22. Rollback considerations

- Migration is per route, in separate PRs. Rollback is `git revert` of that route's PR. The engine
  keeps `createGameApp`, and the deprecated shims stay available until Phase 6, so a reverted route
  still builds.
- Juice overlay kill switch: `createGame({ shell: { overlay: "dom" } })` forces the DOM fallback. The
  engine hook `setOutputOverlay` is a no-op when never called, and idle output is bit-identical.
- Sound: if `GameSoundEngine` regresses on a browser, `createGame({ sound: { engine: "legacy" } })`
  routes through the pre-PRD `createGameAudio` path (kept until Phase 6, with real panning off).
- FX layer: `fx: false` disables the pool for a route. Juice events then fall back to sound + flash.
- Capture contract: rollback is **not** allowed to reintroduce look-changing branches. If a route
  looks worse after deleting review branches, the fix goes to PRD 14 (art/camera). The lint rule
  stays at `error`.
- Evidence: `legacyGlobals` let old gates run during rollback windows. Gates removed in Phase 6 are
  not restored. They measured liveness, not quality (research 14 §3.9).

## 23. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Deleting review branches makes the published screenshots visibly worse (the review look was tuned brighter/closer) | High | Stakeholder pushback, perceived regression | Expected and honest. Each lost improvement is filed as a PRD 14 task with the review value as a hint; before/after contact sheets are published together |
| `juice.shake/punch` blocked on PRD 08; juice looks incomplete | Medium | Feel scores stall below 6 | Flash/hit-stop/FX/sound ship first; shake throws in dev so nobody fakes it; PRD 08 tracks this as a dependency |
| Sample licensing/procurement for engine RPM layers and announcer lines | Medium | Vehicle games stay on weak engine audio | Kenney/CC0 first; budget for a royalty-free pack with web-redistribution terms; record licenses per file; no unlicensed admission |
| Safari audio quirks (gesture unlock, Opus decode, MediaElement streaming) | Medium | Silent games on iOS | Title-screen gesture unlock, decode-probe format choice, WebKit browser tests, real-device check |
| Full-bleed canvas raises pixel count and lowers fps on already-slow games | High | 5–15 fps games get slower | PRD 11 DPR/tier caps; shell measures and reports; letterbox option; perf exit criterion compares at equal canvas size |
| 340 existing tools depend on route globals | High | Broken CI gates mid-migration | `legacyGlobals` for one release; inventory consumers with `rg "__[A-Z_]+__" tools tests` in Phase 0; migrate in Phase 6 |
| Look signature misses a look-relevant field, so divergence slips through | Low | Fake parity returns | Signature built from the normalized bridge input; lint + static audit are independent layers; test that each look field changes the hash |
| HUD themes become a new generic look across all games | Medium | Games read as one template | Themes are token sets; per-route token overrides; PRD 14 art direction owns the final choice per game |
| Evidence pull model changes timing that gates relied on (e.g. per-frame counters) | Low | Flaky probes | Beacon frame counter at 4 Hz; harness waits on `state` not counters |
| Removing the oscillator default breaks third-party/user code with asset-less cues | Low | Runtime error | Clear error message naming the fix; changelog; templates updated in the same PR |
| Most play scenes run no LDR post pass, so the shader overlay is unused and juice falls back to DOM | Medium | Flash/vignette composited in sRGB over the canvas, slightly different curve | Phase 0 records `postPass` per route; DOM path has its own pixel test; PRD 03 decides whether a final output pass always runs |
| `setInstanceTransforms` slips (engine/rendering change in both backends) | Medium | FX layer either draws nothing or costs 1 draw per particle | Explicit degraded mode (≤ 16 nodes per kind) with re-measured draw budget; tracked as a Phase 3 exit item |
| Deterministic test hook (`__AURA3D_GAME_TEST__`) leaks into production | Low | A new debug global ships to players | Compiled only in `MODE === "test"`; `layout.spec.ts` asserts it is absent from the production bundle |

## 24. Explicitly out of scope

- Renderer, lighting, IBL, shadows, materials, tone mapping, AA, DPR policy (PRDs 01–04, 11). This PRD
  only adds the juice uniform block to the output pass.
- Camera rig math, damping, shake/punch application, loop interpolation, render-once-per-rAF (PRD 08).
  This PRD consumes them.
- Particle/flipbook/trail rendering pipeline and additive blending (PRD 07). This PRD ships backend A
  and the spawn API.
- Per-game art, environment, assets, camera framing choices, and which games survive (PRDs 05, 10, 14).
- Agent skill and template content beyond adopting `createGame` (PRD 13).
- Final package/subpath layout and the 340-tool consolidation (PRD 15, PRD 12).
- Physics feel (vehicle slip model, platformer acceleration). Research 10 §6 is PRD 08/14.
- Networking/multiplayer, cloud saves, accounts, leaderboards beyond local `best` storage,
  localization beyond a single shell string table, analytics.





