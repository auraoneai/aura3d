# PRD 09: Shared Game Runtime and Route-Local Extraction

Status: draft for implementation, parallelized against `CONTRACTS.md` (contracts-first). Branch base:
`aura3d-quality-rebuild/audit` @ `c08d8acb` (line references re-checked at `7992a0dd`, §2.6).
Lane: PRD 09. Flag: `A3D_QR_GAME` (sub-flags `A3D_QR_GAME_SOUND`, `A3D_QR_GAME_SHELL`). Contracts provided:
C-24, C-25 (plus the `setInstanceTransforms` C-37 member and the `lookSignature`/`lookManifest` C-38 flattened
methods). This PRD never waits on another lane: every cross-lane need is a contract consumed against its PR 0a
stub (§12.2) or a non-blocking request (§12.3). Day-0 start conditions are in "Parallel execution".
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
  shake is low-passed to ~7% (§3.1). Camera application belongs to the camera lane. This PRD consumes it
  through C-22 (`app.camera.shake` / `punch` layers, which the PR 0a stub already applies because layers
  are pure pose math) and never edits camera code.

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

### 2.6 Engine facts this PRD builds on (verified at `c08d8acb`, spot-checked again at `7992a0dd`)

Spot-check at `7992a0dd` (20 references re-read in source): `GameAudio.ts:485-503` (sine 176 Hz default cue),
`:345` (`playCue`), `:370-374` (destination fallback), `:205` (`MAX_PLAYING_NODES = 32`), `:415-421`
(`setOcclusion` mutates records only), `:138-155` (`GameAudio` interface), `:207` (duck ratio 0.35);
`FrameLoop.ts:46, 63, 126, 161`; `GameAppRuntime.ts:86, 151-153`; `AudioSource.ts:47-51`;
`PositionalEmitter.ts:232`; `TouchLayouts.ts:3, 124`; `GameFeel.ts:27-30, 83, 136-140`; `Haptics.ts:2-3, 37`;
`index.ts:2222, 8213, 8250, 8271, 8280, 8296, 8306, 10497, 10506-10510, 10680, 10748, 10757, 10767, 11353,
11480, 11818, 12949`; `WebGL2Device.ts:444, 3440, 4402-4404`; `WebGPUDevice.ts:1446`; `package.json:149, 691`;
route lines bank-shot `main.ts:49`, turbo `main.ts:32, 564`, blockfall `main.ts:87`, courier `main.ts:113, 846,
1191, 1402`, `bank-shot/package.json:12`. Corrected in this revision: `game-capture-parity.mjs` argv is at
`:15-17` (label `:3`), not `:14-35`/`:28-30`; `GameAppRuntime` interface starts at `:86`, not `:82`;
`Random.ts` is 32 lines; the music duck ratio is `GameAudio.ts:207`, not `:324`; `WebGL2Device.ts:1893` is
tone-map defaults, not juice-uniform upload. Counts re-verified with `ls`: 16 `*-audio.ts`, 16
`build-sfx.mjs`, 13 `write-performance-report.ts`.

These were checked against source because earlier drafts assumed APIs that do not exist. Every task
below is written against these facts.

| Fact | Source | Consequence for this PRD |
|---|---|---|
| `AuraApp.diagnostics` is a **method** returning `AuraDiagnostics` | `index.ts:10767` (`diagnostics(): AuraDiagnostics;` inside `interface AuraApp` at `:10680`) | `app.diagnostics.lookSignature()` is not callable. The new API is `app.lookSignature()` / `app.lookManifest()` on `AuraApp` |
| `AuraApp` has no `camera`, `capabilities` or `renderer` members | `index.ts:10680-10771` | `app.camera` arrives as the C-22 member pre-declared in PR 0a (via C-38); `app.capabilities.particles` does not exist (FX backend is an explicit option, §6.7); the overlay hook is the C-05 flattened method `app.setOutputOverlay()` pre-declared in PR 0a (§7.8) |
| `AuraApp` already exposes `onDeviceLost` / `onDeviceRestored` / `deviceLost()` | `index.ts:10748-10752` | Context-loss UI subscribes to these, not raw canvas events. They are documented for WebGL context loss (`WebGL2Device.ts:444` listener); whether they also fire on WebGPU `device.lost` is unverified and checked by a Phase 4 task |
| `AuraApp.setScene` is synchronous: `normalizeSceneSnapshot` → `runtimeNodes.reset` → remount | `index.ts:11480-11490`, `mountCurrentScene` `:11353-11359` | `game.setScene` wraps it in a transition and awaits `firstPresentedFrame()` |
| Runtime node handles: `setPosition(x,y,z)`, `setRotation(x,y,z)`, `setScale(number \| AuraVec3)`, `setVisible(b)` | `AuraRuntimeNodeHandle`, `index.ts:10497-10530` | `TweenableNode` must match these signatures exactly (§7.6) |
| `instances.{box,sphere,plane,…}` take a **static** `transforms` array; no runtime per-instance update API exists | `index.ts:2222` (`export const instances = {`); no `setInstance*` symbol in `index.ts` | FX backend A uses the C-37 node-handle member `setInstanceTransforms` (PR 0a stub rebuilds through the existing instanced-node update; PRD 09 registers the real one, §7.8) to stay at 1 draw per kind |
| `SeededRandom` has only `nextUint32`, `nextFloat`, `range`, `clone` | `packages/math/src/Random.ts:1-32` (32 lines) | `int/pick/shuffle/fork` must be added to `SeededRandom` (not "re-exported"); file is PRD 09-owned |
| `Easing` has only `linear`, `easeInQuad`, `easeOutQuad`, `easeInOutCubic`, and throws outside `[0,1]` | `packages/math/src/Easing.ts:1-24` | The full Penner set is added to `@aura3d/math` `Easing`; `@aura3d/game/util` re-exports it |
| `packages/input/src/Haptics.ts` already implements `navigator.vibrate` + `vibrationActuator.playEffect` behind capability probes | `Haptics.ts:2-3, 37` | `juice.rumble` wraps `Haptics`; it does not reimplement it |
| `TouchLayouts.ts` supports only 3 genres: `fight`, `race`, `platform` | `TouchLayouts.ts:3, 124` | 5 of the 8 presets (§6.11) need new layout definitions |
| WebGL2 final pass is `ensureLdrPostprocessProgram` with **loose** uniforms (no UBOs anywhere in the device); `applyToneMapping` decodes → maps → encodes in one function; FXAA/sharpen call `baseColorAt` up to 9×/pixel | `WebGL2Device.ts:3440` (`private ensureLdrPostprocessProgram()`), tone-map defaults near `:1893-1908` | `WebGL2Device.ts` is PRD 01-owned (CONTRACTS §4.2, "09 via C-05"). Juice reaches pixels only through C-05 `setOutputOverlay`; the §8 GLSL is the reference spec attached to request Q-01-1, not a PRD 09 edit |
| WebGPU post is a chain of separate fullscreen passes | `WebGPUDevice.ts:1446` `presentLdrPostprocess` | PRD 11-owned; WGSL twin of the overlay is request Q-11-1 |
| Only `SRC_ALPHA, ONE_MINUS_SRC_ALPHA` blending | `WebGL2Device.ts:4402-4404` | FX backend A uses opaque emissive geometry |
| Shadow `sceneRadius` = max over **all** nodes of `hypot(position) + scale`, visibility ignored | `index.ts:12949-12960` | Pool nodes parented at origin with scale ≤ 1 do not change the shadow-map size |
| `game-capture-parity.mjs` accepts only `--json <path>` and `--fail-on-art`; its TRANSIENT class (`particles, fx, effect, shake, reducedMotion, pulse, glow…`) is labelled "Legitimate" | `tools/showcase-library/game-capture-parity.mjs:3` (label), `:15-17` (argv parsing) | `--routes`, `--fail-on-framing`, `--fail-on-transient`, `--fail-on-unknown` and `--fail-on-any` must be added (file is PRD 09-owned); the §6.4 rule bans TRANSIENT capture branches too |
| No workflow runs `check:capture-parity` | `rg capture-parity .github/workflows` → 0 hits | Phase 1 runs it in the lane-owned `.github/workflows/qr-prd09-game.yml` (not `test.yml`, which is PRD 15's) |
| Unit workflow is `.github/workflows/test.yml`; `pnpm test:unit` = `vitest run tests/unit --maxWorkers=2` | `package.json:149` | New unit tests under `tests/unit/game/**` are picked up by `qr-contracts.yml` and `test.yml` with no workflow edit |
| `FrameLoop.timeScale` is `private readonly`, set once from options | `FrameLoop.ts:46, 63, 126, 161` | `FrameLoop.ts` is PRD 08-owned (R15). Time scale is consumed through C-23 `app.time` (the PR 0b seam wires `FrameLoop.setTimeScale`); PRD 09 never edits `FrameLoop.ts` |
| `GameAppRuntime` interface; runtime forwards only `frame.dt` | `GameAppRuntime.ts:86` (`export interface GameAppRuntime`), `:151-153` (`loop.onFrame(… app.step(frame.dt))`) | PRD 09-owned file; `timeScale`/`setTimeScale` delegate to `app.time` |
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
| `@aura3d/engine` | Only PRD 09-owned files: `agent-api/GameAppRuntime.ts` (`timeScale`/`setTimeScale` delegating to C-23 `app.time`, `firstPresentedFrame`), `agent-api/app/createGameApp.ts` and `agent-api/nodes/game/` (PR 0b-1 carve-outs of `index.ts:11818-11827` and `:8198-8307`; deprecations of `game.hud`, `game.accessibility`, `game.evidence`, `game.touchControls`), `packages/engine/src/game/GameAudio.ts` (`createGameAudio` as an adapter over `GameSoundEngine`), the lane barrel `src/lanes/prd09.ts` (provides C-25 binding, C-37 `setInstanceTransforms`, the C-38 look-signature methods). Everything else in engine (`FrameLoop.ts`, `GameRuntime.ts`, `GameFeel.ts`, `index.ts` outside the carves) is consumed, never edited |
| `@aura3d/math` | `SeededRandom.int/pick/shuffle/fork`; full Penner `Easing` set + `Easing.spring` (`Random.ts`, `Easing.ts` are PRD 09-owned) |
| `@aura3d/rendering` | **No edits.** The juice overlay is C-05 (`setOutputOverlay`, PRD 01 provider); per-instance upload is C-07 `instanceBufferSlot` (PRD 01 provider). The §8 shader is a reference spec attached to requests Q-01-1 / Q-11-1 |
| `@aura3d/input` | `TouchLayouts.ts` only (5 new layouts). `VirtualTouchControls.ts` and `Haptics.ts` (PRD 08) are consumed read-only (R16) |
| `@aura3d/aura3d-cli` | `aura3d perf-report` and `aura3d sfx admit` registered from `packages/aura3d-cli/src/commands/prd09/` through C-39. `assets add --type audio` and the `validate --release` audio rule are request Q-05-1 |
| `apps/*` (18 routes) | **Not edited by PRD 09** (R21: PRD 14 is the only writer). PRD 09 ships per-route migration patches and codemods under `docs/project/aura3d-quality-rebuild/migration/` and `commands/prd09/`, proves them in its own CI on a scratch checkout (§10), and hands them to PRD 14 (Q-14-1) |
| `apps/common` | PRD 09-owned: viewer runtime untouched; `rapier-physics-proof.ts` deprecated, deleted once `rg rapier-physics-proof apps` returns 0 |
| `packages/create-aura3d/templates/{mini-game,racing-starter,falling-blocks-starter,fighting-game,character-controller}` | **Not edited by PRD 09** (R20: PRD 13). PRD 09 publishes C-40 facts `F-09-*` and template patches (Q-13-1) |

## 5. Affected files and directories

Ownership follows CONTRACTS §4.1 (row **09** plus the lane-generic row). Anything not in 5.1/5.2 is reached
through a contract seam or a request (5.3, §12.3).

### 5.1 Owned by PRD 09: modify

- `packages/engine/src/agent-api/GameAppRuntime.ts:86-105` (interface: `timeScale`, `setTimeScale`,
  `firstPresentedFrame`), `:151-153` (frame forwarding reads `app.time.scale`)
- `packages/engine/src/agent-api/app/createGameApp.ts` (PR 0b-1 carve of `index.ts:11818-11827`)
- `packages/engine/src/agent-api/nodes/game/index.ts` (PR 0b-1 carve of the `game` namespace
  `index.ts:8198-8307`: `@deprecated` on `touchControls` `:8250`, `hud` `:8280-8295`, `accessibility`
  `:8296-8304`, `evidence` `:8306`)
- `packages/engine/src/game/GameAudio.ts` (adapter; default-cue removal `:485-503`)
- `packages/audio/src/AudioSource.ts:47-51`, `packages/audio/src/PositionalEmitter.ts:232`
- `packages/math/src/Random.ts`, `packages/math/src/Easing.ts`
- `packages/input/src/TouchLayouts.ts:3, 124` (5 new layouts)
- `tools/showcase-library/game-capture-parity.mjs:15-17` (`--routes`, `--fail-on-{framing,transient,unknown,any}`,
  scenario exemption) and, in Phase 6, `tools/showcase-library/{route-gates,route-primary-probes,
  showcase-game-release-gates,game-play-probe,game-viewport-probe,game-mobile-touch-audit}.mjs`
- `tools/public-api-contract/` (new `@aura3d/game` surface, deprecations)
- `apps/common/src/rapier-physics-proof.ts` (deprecate, then delete)
- `eslint/qr/no-route-capture-flags.js` (PR 0a creates it as an empty array export; `eslint.config.js`
  already imports it)

### 5.2 Owned by PRD 09: add

- `packages/game/` except `src/art/` (PR 0a creates the skeleton: `package.json`, `tsconfig.json`,
  `src/index.ts` re-exporting the C-24 stubs). PRD 09 adds `src/{createGame,shell,session,capture,evidence,
  hud,juice,touch,util}/*`, `src/styles/*.css`, `src/fonts/` (OFL woff2 subsets), `src/sfx.ts` (generated typed
  ids), `size-limit.json`, `fixtures/{table,courier,fighter}/` (three lane-owned reference games, §10)
- `packages/audio/src/game-sound/*` (`GameSoundEngine.ts`, `Voice.ts`, `LoopHandle.ts`, `EngineLoop.ts`,
  `MusicController.ts`, `MasterChain.ts`, `ReverbSend.ts`, `SpatialVoice.ts`, `formatProbe.ts`, `loudness.ts`),
  `packages/audio/assets/ir/`, `packages/audio/scripts/validate-sfx-pack.mjs`
- `assets/packs/game-sfx-core/` (admitted audio + `manifest.json` + `LICENSES.md`)
- `packages/engine/src/agent-api/nodes/game/{lookSignature,instanceTransforms}.ts`
- `tools/quality-rebuild-capture/route-composition.mjs`
- `docs/project/aura3d-quality-rebuild/migration/` (`baseline.json`, `after.json`, `<id>.json`,
  `<id>.parity.json`, `global-consumers.txt`, `patches/<id>/*.patch`, `guides/<id>.md`)
- Lane-generic: this file; `docs/project/aura3d-quality-rebuild/evidence/{prd09,prd-09}/`;
  `packages/*/src/lanes/prd09.ts`; `agent-api/compiler/diagnosticOnly.prd09.ts`;
  `packages/aura3d-cli/src/commands/prd09/` (`perf-report.ts`, `sfx-admit.ts`, codemods);
  `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd09/`; `.github/workflows/qr-prd09-*.yml`;
  `tests/qr/prd09/`; `tests/unit/contracts/impl/prd09-*`; new `tests/unit/game/**`, `tests/unit/audio/game-sound-*`,
  `tests/browser/game-shell/**` (creator rule)

### 5.3 Not edited by PRD 09 (seam or request)

| File | Owner | How PRD 09 gets its effect |
|---|---|---|
| `packages/engine/src/agent-api/FrameLoop.ts`, `GameRuntime.ts`, `GameFeel.ts` | 08 | C-23 `app.time` (PR 0b wires `FrameLoop.setTimeScale`); read-only use of `GAME_FEEL_HIT_STOP_*` |
| `packages/engine/src/agent-api/index.ts` (outside carves), `app/createAuraApp.ts`, `app/runtimeNodes.ts` | 15 | C-38 pre-declared `lookSignature`/`lookManifest`/`setOutputOverlay`; C-37 `registerNodeHandleExtension`; Q-15-1..3 |
| `packages/rendering/src/WebGL2Device.ts` | 01 | C-05 `setOutputOverlay` (stub = DOM overlay); Q-01-1 attaches the §8 GLSL |
| `packages/rendering/src/WebGPUDevice.ts` | 11 | Q-11-1 (WGSL overlay twin), Q-11-2 (`device.lost` → `onDeviceLost`) |
| `packages/input/src/{VirtualTouchControls,Haptics}.ts` | 08 | consumed read-only |
| `apps/showcase-*/`, `apps/aura-clash-showcase/` | 14 | migration patches + codemods, Q-14-1..4 |
| `packages/create-aura3d/templates/**`, skills | 13 | C-40 facts `F-09-*`, Q-13-1 |
| `tools/quality-rebuild-capture/games.json` | 14 | not needed: C-33 readiness already prefers `window.__AURA3D_GAME__` when present; `evidenceGlobal` updates are Q-14-3 |
| `.github/workflows/quality-rebuild-capture.yml` | 12 | called as `workflow_call` from `qr-prd09-*.yml`; checkpoint-level jobs are Q-12-1 |
| `.github/workflows/test.yml`, `eslint.config.js`, root `package.json` | 15 | lane workflow instead; `eslint/qr/` import already in PR 0a; root `check:capture-parity` flag change is a `root-manifest` request Q-15-4 |
| `packages/aura3d-cli/src/{cli.ts,admission/}` | 05 | C-39 registry for PRD 09 commands; Q-05-1 for `assets add --type audio` |

To be deleted by PRD 14 when it applies the migration patches (per route; PRD 09 deletes nothing in `apps/`
outside `apps/common`):
- 16 `apps/*/src/*-audio.ts` wrappers (cue maps kept as data), 16 `apps/*/scripts/build-sfx.mjs`, and 13
  `apps/*/scripts/write-performance-report.ts` (counts verified with `ls` at `7992a0dd`)
- per-route `hud.ts` / inline `syncHud`/`renderHud` (~2.3k LOC) and `publishEvidence`/`safeDiagnostics`/`defineProperty` blocks
- the `rapier-physics-proof` imports (blockfall `main.ts:87`, turbo `main.ts:32`)
- all `visualReviewCapture`/`captureMode`/`visualCaptureCamera` branches; `apps/aura-clash-showcase/src/showcaseProofBoot.ts`
  reduced to a scenario module

## 6. Architecture proposal

### 6.1 Layering

```
route (apps/showcase-*/src, PRD 14)  gameplay rules, content, cue map, HUD widget list, scenarios
      │ imports only @aura3d/engine + @aura3d/game
@aura3d/game (C-24 real)          createGame(): shell · session · capture · evidence · hud · juice · touch · util
      │                                   │ sound (C-25)             │ app.camera layers (C-22) · app.time (C-23)
@aura3d/audio  GameSoundEngine ◄──────────┘                          │ fx: primitive pool (C-37/C-07) | app.effects (C-20)
@aura3d/engine createGameApp / AuraApp / GameAppRuntime ◄────────────┘ app.setOutputOverlay (C-05) · app.quality (C-27)
@aura3d/rendering                 untouched by PRD 09 (C-05 / C-07 providers are PRD 01)
```

- `@aura3d/game` depends on `@aura3d/engine`, `@aura3d/audio` and `@aura3d/input`. The engine
  never imports `@aura3d/game`, so there is no cycle. Engine-side `game.hud`, `game.accessibility`,
  `game.evidence` and `game.touchControls` stay as deprecated shims for one minor release.
- The route import rule changes from "`@aura3d/engine` only" to "`@aura3d/engine` + `@aura3d/game`".
  The `@aura3d/game` and `@aura3d/game/capture` subpaths are reserved in PR 0a (CONTRACTS §3.8), so the final
  package layout is already fixed and no later fold-in is needed for this PRD.
- `createGame()` is the single entry point. It wraps `createGameApp` (`index.ts:11818`, carved to
  `app/createGameApp.ts` in PR 0b-1), so a route that adopts it gets the fixed-step loop, input, shell,
  sound, juice and evidence in one call, and the shell owns the DOM.
- **Stub vs real.** PR 0a ships the C-24 stub in `packages/engine/src/contracts/stubs/game.ts` and
  `packages/game/src/index.ts` re-exports it. PRD 09 replaces that entry with the real implementation and
  calls the C-24 slot's `provide(real)`; `createGame` resolves `slot.get(flags)`, so with `A3D_QR_GAME`
  off every caller still gets the stub (CONTRACTS §6.3).

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
  actual GPU resource restore is the rendering lane's (C-29 device lifecycle). The shell only guarantees the
  player is never shown a frozen black frame with a live HUD, and that holds on today's `onDeviceLost`.

### 6.3 Session: pause, time scale, hit-stop, lifecycle, accessibility

- One `GameSession` per game. It owns `paused`, `timeScale` (user scale × slow-mo × hit-stop), sim
  time, and per-actor freeze sets.
- Time scale goes through C-23 (R15): `session.setTimeScale/hitStop/slowMo` delegate to `app.time`
  (`scale`, `hitStop(seconds, { scope })`, `slowMo`). The C-23 controller is real in PR 0a (pure state) and
  PR 0b wires it to `FrameLoop.setTimeScale`, so **every** fixed-step consumer (genre kits, physics,
  animation advanced by `app.step`) honors hit-stop without route code and without PRD 09 touching
  `FrameLoop.ts` (PRD 08-owned; today `timeScale` is readonly, `FrameLoop.ts:46`). `GameAppRuntime`
  exposes `timeScale`/`setTimeScale` as thin views of `app.time.scale`.
- Per-actor hit-stop is the fighting-game norm. `session.hitStop(0.07, { actors: ["p1","p2"] })`
  calls `app.time.hitStop(0.07, { scope: ["p1","p2"] })`, whose handles read `timeScale` 0 for the duration
  (C-23/C-37 `timeScale` member, stub = plain field). Route systems ask `session.scaledDt(dt, actorId)`,
  which the session computes itself, so per-actor freeze works on the stub. Global hit-stop (`actors`
  omitted) scales the whole loop.
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
  flash, high contrast, quality tier (C-27 `app.quality.set(tier)`; the PR 0a tier data is real), key remap
  (writes `game.input` action bindings), touch layout opacity and size.

### 6.4 Capture contract (removes the 395 divergent branches)

**Rule: capture may change only camera pose, clock, seed and scenario state. Lights, materials,
effects, post, environment, background, node set, authored scale, poses and HUD must be identical to
play.**

- `@aura3d/game/capture` exports `captureFromUrl()` → `CaptureContext`. It reads `?scenario=`,
  `?seed=`, `?freezeAt=` and `?cameraPose=`. `?capture=review` and `?capture=overview` are **ignored**
  with a `console.warn`, and the route renders as play.
- Scenarios are named setup functions in `src/scenarios/*.ts`. They may only call gameplay APIs:
  input replay drivers (`game.inputReplayDriver`, `index.ts:8213`), rule/state setters, the session
  clock, and C-22 `app.camera.setPose(pose, { cut: true })` with a pose looked up by name from the route's
  `cameraPoses` table (`createGame({ capture: { cameraPoses } })`; C-22 has no named-pose registry, so the
  name → `Partial<AuraCameraPose>` table lives in `@aura3d/game/capture`). Aura Clash's
  `capture/PosterScenarios.ts` (271 LOC) is the reference: named scenarios that drive state, not looks
  (research 16 row 1).
- Three layers of enforcement:
  1. **Lint:** the rule module `eslint/qr/no-route-capture-flags.js` (PRD 09-owned; `eslint.config.js`
     imports every `eslint/qr/*.js` since PR 0a) exports `no-restricted-syntax` + `no-restricted-imports`
     config objects (message prefix `aura3d/no-route-capture-flags:` per C-24, so violations are greppable)
     banning `URLSearchParams#get("capture")`,
     identifiers matching `/^(visualReviewCapture|visualCaptureCamera|reviewCapture|captureMode|isCapture|CAPTURE_REVIEW)$/`, and
     imports of `@aura3d/game/capture` outside `src/scenarios/**`, in `apps/*/src/**` and
     `packages/create-aura3d/templates/*/src/**`. Severity is `error` for routes in `MIGRATED_ROUTES` (computed:
     any route whose `src/main.ts` imports `@aura3d/game`, plus a static override list in the same module) and
     `warn` elsewhere, so main never turns red because a route PRD 14
     has not migrated yet.
  2. **Static audit:** `node tools/showcase-library/game-capture-parity.mjs --fail-on-any` runs in the lane
     workflow `qr-prd09-game.yml` and must report 0 branches of **every** class (ART, FRAMING, TRANSIENT,
     UNKNOWN) for every route in `MIGRATED_ROUTES` and on every migration patch applied to a scratch checkout
     (§10). The tool's current "TRANSIENT … Legitimate" label (`:3`) conflicts with the rule above (effects must
     be identical), so TRANSIENT capture branches are also deleted. Reduced-motion branches that are *not*
     keyed on capture are not capture branches and are unaffected.
  3. **Runtime look signature**, two implementations with the same canonicalization:
     - `@aura3d/game/capture` `lookSignature(game)` (PRD 09, works on day 0): SHA-256 over the canonical
       **authored** scene snapshot that `createGame` received from `options.scene()` / `game.setScene()`,
       minus the camera. This is exactly what review branches changed (authored lights, emissive, scale,
       visibility, node set), so it needs no engine internals.
     - `app.lookSignature()` / `app.lookManifest()` (C-38 flattened methods pre-declared in PR 0a; the stub
       hashes `appliedLook` + `qrFlags`). PRD 09's real implementation in
       `agent-api/nodes/game/lookSignature.ts` hashes the normalized snapshot the bridge consumes; it is
       wired through CCR-09-1 (a C-38 provider slot for the two methods) and is an integrated-only signal.
     The canonical set (both): light list (type, color, intensity, position,
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

- `Juice` is a facade over existing correct math. It does not reimplement the camera, the clock, the
  output pass or particles; each channel goes through its owning contract:
  - `shake`/`punch` → C-22 `app.camera.shake.add(trauma)` / `app.camera.punch.trigger({ fov, dolly, … })`.
    The PR 0a stub applies layers (pure pose math) on top of `setPose`, so shake reaches pixels on day 0 for
    any route whose camera goes through `app.camera`. When `app.camera.evidence().layers` reports energy 0 after
    a trigger (camera written directly by route code), juice records `shake: "not-applied"` in its evidence
    section. It never reports a shake it could not observe.
  - `hitStop`/`slowMo` → session → C-23 `app.time` (§6.3).
  - `flash`/`vignettePulse`/`fade` → C-05 `app.setOutputOverlay()`. The PR 0a stub returns
    `{ applied: true, reason: "dom-fallback" }` and draws a `div.a3d-output-overlay`; PRD 01's real OutputPass
    applies the same values in-shader. Juice records the returned `reason` as `juice.backend`.
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
- Backend A (`"primitive-pool"`, default, ships in Phase 3): instanced primitive pool, one `instances.sphere` or
  `instances.plane` node per kind with `capacity` instances (tier cap, §17). Today instanced nodes
  take a static `transforms` array (`index.ts:2222`), so the pool drives the C-37 node-handle member
  `setInstanceTransforms(matrices, count, colors?)`. Its PR 0a/0b stub rebuilds instance transforms through
  the existing instanced-node update (still one instanced draw per kind; extra CPU cost measured in §17).
  PRD 09 registers the real member from `agent-api/nodes/game/instanceTransforms.ts` through
  `registerNodeHandleExtension`, writing C-07 `InstanceBufferLike.setMatrices/setColors` in place (C-07
  stub wraps today's per-frame instance upload, `ForwardPass.ts:1711-1803` per CONTRACTS), so no
  rendering file is edited. If neither path holds the per-kind draw count at 1, backend A degrades to N
  individual primitive nodes per kind, capped at 16 live per kind, and the draw-call budget in §17 is
  re-measured and reported (not silently exceeded). Particles are opaque emissive with scale-down fade,
  `castShadow: false`, and the pool node is `visible: false` when `count === 0` (never parked at
  y=-50, because parked nodes inflate the shadow map size, research 18 C2; the shadow fit uses
  `hypot(position)+scale` of every node regardless of visibility, `index.ts:12949-12960`). It avoids
  sub-1 opacity because of the alpha-over-only "dark shells" risk (`WebGL2Device.ts:4402-4404`, research 18 C8).
- Backend B (`"particle-pass"`): delegates every `burst`/`trail` to C-20 `app.effects.burst/trail`. It is
  selectable on day 0: the C-20 stub is an honest primitive pool through C-37 `add` (`sim: "primitive-pool"`),
  and PRD 07's real billboard pass (additive/premultiplied blend, soft particles, flipbooks) replaces it with
  no PRD 09 change. Same `fx.burst(kind, position, opts)` API. The backend is the explicit option
  `createGame({ fx: { backend: "primitive-pool" | "particle-pass" } })`; there is no `app.capabilities`
  object to detect it from (§2.6). The default flips to `"particle-pass"` only when `A3D_QR_VFX` reaches
  `integrated-accepted` at a checkpoint (CONTRACTS §5.3); that is a one-line default change in PRD 09's own
  file, never a wait.
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
  High/Ultra). The listener auto-syncs each frame from C-22 `app.camera.presented()` (the PR 0a stub reads
  the current camera spec, so this works on day 0): `listener.positionX/…/upZ`
  AudioParams ramped with `setTargetAtTime` where they exist; Firefox does not implement the
  `AudioListener` AudioParams, so the code feature-detects `"positionX" in listener` and falls back to
  `setPosition`/`setOrientation` there. Routes may still call `sound.setListener(pose)` to override
  (e.g. a first-person listener offset). Occlusion is a `BiquadFilterNode` lowpass from 20 kHz (open) to 900 Hz (fully occluded).
- Music: a single-stem track streams through one `HTMLMediaElement` → `MediaElementAudioSourceNode`
  (no full decode). Multi-stem tracks (2–4 stems, intensity layers) are **decoded** `AudioBuffer`s
  started on one `AudioBufferSourceNode.start(when)` timestamp, because separate media elements cannot
  be kept sample-aligned. Stem memory counts against the decoded-audio budget in §17, so stems are
  short loops (≤ 60 s). Tracks crossfade (default 1.5 s), duck under voice (existing ratio 0.35,
  `GameAudio.ts:207`) and on pause (−9 dB plus lowpass to 1.2 kHz), and play stingers that can be
  quantized to the beat/bar from `bpm` and the `AudioContext.currentTime` of the track start (Pulse
  Tunnel's beat clock is the reference, research 20). Media elements are same-origin; cross-origin
  music requires CORS headers or the node outputs silence.
- Reverb presets: `none`, `small-room`, `hall`, `street`, `hangar`, `underwater` (adds lowpass 1.8 kHz).
  IRs are bundled mono 24 kHz, ≤ 2.5 s.
- Unlock: binds `pointerdown`/`keydown`/`touchend` once, resumes the context, and resolves
  `sound.ready`. The shell's title "Press any key / Tap to start" doubles as the unlock gesture.
- **Default synthesized cue is removed.** A cue with neither `asset` nor `play` throws at definition
  time. `definition.play` (custom synthesis) stays allowed but is tagged `provenance: "synth"` in
  evidence and fails the provenance gate unless the cue is in an explicit allowlist (for example,
  a deliberate chiptune game). PRD 09's `packages/audio/scripts/validate-sfx-pack.mjs` enforces this for the
  pack and for route cue maps from day 0; request Q-05-1 adds the same rule to `assets validate --release`.

### 6.9 Sample-based SFX library

- Asset pack `game-sfx-core` (`assets/packs/game-sfx-core/`, PRD 09-owned), admitted by the PRD 09 CLI
  command `aura3d sfx admit` (registered from `packages/aura3d-cli/src/commands/prd09/sfx-admit.ts` via C-39)
  with per-file license, source URL, author, and loudness (`packages/audio/src/game-sound/loudness.ts`). The
  pack `manifest.json` follows the C-17 manifest 1.1 field names so that PRD 05's `assets add --type audio`
  (request Q-05-1) can later ingest it unchanged. It is published as a typed asset index so routes reference
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
  `toast`, `damageNumbers` (world-anchored, projected each frame with C-22 `app.camera.presented()`, pooled ≤
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
  `packages/input/src/VirtualTouchControls.ts` (PRD 08-owned, consumed read-only per R16)/`TouchLayouts.ts`
  (PRD 09-owned). It writes into the same `game.input` actions and axes (`GameRuntime.ts:1668-1936`, PRD 08,
  read-only), so there is no parallel input stack.
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
| Standard shell (full-bleed, menus, loading, transitions, context-loss UI) | 3D view goes from ~43–60% to ≥ 95% of viewport; designed loading/title/pause/results; no blank frames | 0 (DOM); canvas size grows, so pixel cost rises up to 2.3× for boxed games (C-27 tier `maxPixelRatio`/render scale absorbs it) | ≤ 0.05 ms/frame idle; transitions ~0.1 ms/frame for 400 ms | DOM ≤ 300 nodes | ≤ 14 KB with session/capture/beacon | Largest single mobile win: removes stacked HUD cards and dead bands | `layout: "letterbox-16x9"`; menus degrade to plain buttons when CSS features are missing |
| Session time scale + per-actor hit-stop | Hits land with weight (45–100 ms freezes already defined in `GameFeel.ts:27-30`) | 0 | < 0.02 ms | ~0 | in core | none | `hitStop` scales global loop if a route does not pass actors |
| HUD kit + themes + fonts | Game-styled HUD instead of dev dashboards; ≤ 15% / 22% screen budget | 0 (compositor-only transforms) | ≤ 0.3 ms/frame worst case (20 widgets changing) | ≤ 150 DOM nodes; fonts ≤ 80 KB/theme | ≤ 12 KB JS + ≤ 6 KB CSS; fonts separate | Mobile layouts per widget (`mobileAnchor`) | `theme: "plain"` system font stack |
| GameSoundEngine + sampled SFX | Replaces chiptune beeps with mixed, varied, spatial, pitched sound; engine RPM for 5 vehicle games | 0 | ≤ 0.2 ms/frame (listener sync + loop ramps); audio thread separate | decoded SFX budget per tier (§17); music streamed | ≤ 10 KB JS; audio assets ≤ 1.5 MB per game SFX + streamed music | equalpower panning and no reverb on Low; iOS needs gesture unlock (title screen) | `createGameAudio` adapter path; on decode failure, cue is silent and logged, never a beep |
| Juice facade + tween + events | Synchronized flash/shake/hit-stop/sound/rumble per event | Day 0 (C-05 stub): DOM overlay, 0 GPU (compositor). With C-05 real (PRD 01): folded into OutputPass, ≤ 0.15 ms at 1080p WebGL2 / ≤ 0.3 ms WebGPU **only while an amount is non-zero**; 0 when idle | ≤ 0.1 ms (≤ 64 live tweens) | ~0 | ≤ 5 KB | reduced-motion defaults honored; haptics Android only | DOM overlay is itself the fallback (`shell.overlay: "dom"` forces it) |
| FX layer auto-mount (interim primitive pool) | Hit sparks and dust become visible in all games that spawn them | instanced: 1 draw per kind via C-37 `setInstanceTransforms` (stub or PRD 09 real); ≤ 0.3 ms at 256 live on High | ≤ 0.1 ms pool update with the real member; stub rebuild path measured separately (§17) | ≤ 512 instances × 64 B (+ 16 B color) | ≤ 3 KB | Low tier caps 32 live | disabled kinds fall back to sound + flash only; ≤ 16 individual nodes per kind if instancing is unavailable; `backend: "particle-pass"` hands off to C-20 |
| Touch presets | 13 games become playable on phones | 0 | ≤ 0.05 ms | ≤ 40 DOM nodes | ≤ 5 KB (lazy) | required for mobile completion | keyboard/gamepad unaffected |
| Evidence pull channel + lazy sections | Removes per-frame serialization; evidence reports output-path values only | 0 | 0 in play; ≤ 2 ms per pull in dev | ring buffer 240 × 8 B | beacon < 0.5 KB in core; sections lazy chunk | none | legacy globals kept one release |
| Shared util (`rng`, `damp`, `ease`) | Indirect: removes 13 hand-rolled RNGs/clamps, makes captures deterministic per seed | 0 | ~0 | ~0 | ≤ 1.5 KB (tree-shaken) | none | none needed |

## 7. APIs to add, change and remove

### 7.0 Contract alignment (C-24 and C-25 are authoritative)

The frozen surfaces are `packages/engine/src/contracts/game.ts` (C-24) and
`packages/audio/src/contracts/gameSound.ts` (C-25), both created in PR 0a and custodian-owned by PRD 15. The
`@aura3d/game` / `@aura3d/audio` types below **extend** them: every contract member exists with the
contract's exact signature, and the extra members are additive. Where the earlier draft disagreed with the
contract, the contract wins; the remaining additions go through CCRs (CONTRACTS §6.4, optional fields and
new union members only) and work in PRD 09's package types on day 0 whether or not the CCR has merged.

| Item | Contract (frozen) | This PRD | Resolution |
|---|---|---|---|
| `PauseReason` | `"user" \| "blur" \| "visibility" \| "menu" \| "context-lost"` | was `"hidden"` | aligned: `"visibility"` |
| `TransitionSpec` | `kind: "fade" \| "cut" \| "wipe"; ms?; color?` | wanted `"iris"`, `outMs`, `inMs` | aligned to `ms`; CCR-09-2 adds optional `outMs`, `inMs` and union member `"iris"` |
| `CreateGameOptions` | `id, target, scene, layout?, hud?, touch?, sound?, juice?, qualityRebuild?` | was `mount`, no `scene` | aligned: `target`, `scene`; extra optional `title, app, input, shell, scenarios, evidence, fx, capture` (CCR-09-3 copies them into the contract as optional so the stub accepts and ignores them) |
| `Game.touch` | `TouchControls \| null` | was `undefined` | aligned: `null` |
| `HudWidgetSpec` placement | `anchor` (9 values) | was `slot` (7 values) | aligned: `anchor`, plus optional `mobileAnchor` |
| `HudMountOptions.maxScreenFraction` | `number`, default 0.18 | 0.15 desktop / 0.22 mobile portrait | the shell passes an explicit number chosen per viewport at mount (0.15 / 0.22); CCR-09-4 changes the documented default. **Unresolved until CCR-09-4 merges**: the contract text says 0.18 |
| `GameFxLayer.trail(target)` | `target: string`, `color?` | took a node object, `color` required | aligned: `string` node id (node objects accepted as a widening), `color?` |
| `SoundCueSpec.priority` / `spatial` | `number` / `boolean` | named classes / options object | CCR-09-5: union members `"critical" \| "normal" \| "ambient"` and the options object; numbers map 2/1/0 |
| `GameSound.engine(spec)` | `{ cue, rpmRange, pitchRange }` | layered `EngineLoopSpec` | both accepted (overload); the contract form maps to a single-layer loop. CCR-09-5 adds the layered form |
| `LoopHandle.setGain` | `gainDb` | was linear | aligned: dB |
| `GameSound.dispose` | `(): void` | was `Promise<void>` | aligned: `void` (context close is fire-and-forget, errors logged) |
| `GameSoundOptions` | `cues, reverb?, voiceLimit?` | adds `buses, music, master, tier, seed` | additive (CCR-09-5) |
| `app.lookSignature()/lookManifest()` | C-38 flattened methods, stub hashes `appliedLook` + `qrFlags` | real hash of normalized snapshot | CCR-09-1: a C-38 provider slot for the two methods; until then `@aura3d/game/capture` `lookSignature(game)` is the gate (§6.4) |
### 7.1 `@aura3d/game`: entry point

```ts
import type { AuraCreateGameAppOptions, AuraAppTarget, AuraApp, GameAppRuntime,
  GameInputOptions, GameInputController, AuraSceneSnapshot } from "@aura3d/engine";
import type { GameSound, GameSoundOptions } from "@aura3d/audio";

export interface CreateGameOptions<TCue extends string = string, TEvent extends string = string>
  extends C24.CreateGameOptions<TCue, TEvent> {   // import type * as C24 from "@aura3d/engine/contracts"
  /** Kebab-case route id; keys evidence, settings storage and analytics. */
  readonly id: string;
  /** Element that becomes `.a3g-root` (C-24 `target`). The shell creates the canvas inside it. */
  readonly target: HTMLElement;
  /** Initial scene (C-24). */
  readonly scene: () => AuraSceneSnapshot;
  readonly title?: string;
  /** Forwarded to createGameApp; `loop.fixedDt` defaults to 1/60. */
  readonly app?: Omit<AuraCreateGameAppOptions, "input">;
  readonly input: GameInputOptions | readonly GameInputOptions[];
  readonly sound?: GameSoundOptions<TCue>;
  readonly hud?: HudMountOptions;
  readonly touch?: TouchControlsOptions;
  readonly shell?: GameShellOptions;
  readonly juice?: JuiceEventMap<TEvent, TCue>;
  readonly scenarios?: Readonly<Record<string, GameScenario>>;
  readonly evidence?: EvidenceChannelOptions;
  readonly fx?: { readonly backend?: "primitive-pool" | "particle-pass" } | false;
  readonly capture?: { readonly cameraPoses?: Readonly<Record<string, Partial<AuraCameraPose>>> };  // C-22 pose type
  readonly qualityRebuild?: { readonly flags?: readonly string[] };   // C-24; resolved by resolveQrFlags
}

export interface Game<TCue extends string = string, TEvent extends string = string> extends C24.Game<TCue, TEvent> {
  readonly id: string;
  readonly app: AuraApp;
  readonly runtime: GameAppRuntime<AuraApp>;
  readonly input: GameInputController;
  readonly session: GameSession;
  readonly sound: GameSound<TCue>;
  readonly juice: Juice<TEvent>;
  readonly hud: Hud;
  readonly touch: TouchControls | null;
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
    readonly attractCameraPose?: string;                 // key into options.capture.cameraPoses (C-22 setPose)
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
export interface TransitionSpec { readonly kind: "fade" | "cut" | "wipe"; readonly ms?: number; readonly color?: string }   // C-24; outMs/inMs/"iris" via CCR-09-2

export interface GameShell {
  readonly state: GameSessionState;
  showResults(values: Readonly<Record<string, number>>): Promise<"retry" | "title" | "next">;
  transition<T>(run: () => T | Promise<T>, spec?: TransitionSpec): Promise<T>;
  openMenu(id: "pause" | "settings" | "about"): void;
  closeMenus(): void;
  setLoadingProgress(fraction: number, label?: string): void;
  track(promise: Promise<unknown>, weight: number): void;   // C-24
}
```

### 7.3 Session

```ts
export type GameSessionState =
  | "booting" | "loading" | "title" | "playing" | "paused" | "results"
  | "transitioning" | "context-lost" | "disposed";
export type PauseReason = "user" | "blur" | "visibility" | "menu" | "context-lost";   // C-24

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
  readonly cameraPose?: string;      // key into options.capture.cameraPoses, applied with C-22 setPose; the only visual change allowed
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

Look signature (two entry points, same canonicalization, §6.4):

```ts
// @aura3d/game/capture (PRD 09; works on day 0 from the authored snapshot createGame holds)
export function lookSignature(game: Game): Promise<string>;   // SHA-256 hex, camera excluded
export function lookManifest(game: Game): AuraLookManifest;    // canonical JSON for diffing

// AuraApp (pre-declared optional in PR 0a via C-38; PRD 09 does NOT edit index.ts)
interface AuraApp {
  lookSignature(): Promise<string>;   // stub: hash of appliedLook + qrFlags; real (CCR-09-1): normalized bridge snapshot
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
  readonly tier?: "low" | "medium" | "high" | "ultra";             // default: C-27 app.quality.tier
  readonly seed?: number;
}

export interface VoiceHandle { readonly id?: number; stop(fadeMs?: number): void; setPosition(p: readonly [number, number, number]): void }   // C-25 + id
export interface LoopHandle extends VoiceHandle {
  setRate(rate: number, rampMs?: number): void;
  setGain(gainDb: number, rampMs?: number): void;          // C-25: dB
  setPositionVelocity?(position: Vec3Like, velocity?: Vec3Like): void;
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
  engine(spec: EngineLoopSpec | { readonly cue: TCue; readonly rpmRange: readonly [number, number]; readonly pitchRange: readonly [number, number] }): EngineLoopHandle;   // second form = C-25
  readonly music: MusicController;
  setListener(pose: { readonly position: Vec3Like; readonly forward: Vec3Like; readonly up: Vec3Like }): void;
  setBusVolume(bus: GameBusId, volume01: number): void;
  setMuted(muted: boolean): void;
  duck(bus: GameBusId, ratio01: number, ms: number): void;
  suspend(): Promise<void>; resume(): Promise<void>;
  proof(): GameSoundProof;     // read back from live AudioNodes only
  dispose(): void;             // C-25
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
  readonly shake?: number;                // trauma 0..1 (C-22 app.camera.shake)
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
  trail(target: string | (TweenableNode & { readonly id: string }), options: { readonly width: number; readonly life: number; readonly color?: string }): { stop(): void };   // C-24: string node id
  readonly liveCount: number;
  readonly backend: "primitive-pool" | "particle-pass";
}
```

### 7.7 HUD and touch

```ts
export type HudThemePreset = "arcade-neon" | "motorsport" | "sports-broadcast" | "sci-fi-telemetry" | "fighting" | "tabletop" | "plain";
export type HudAnchor = "top-left" | "top" | "top-right" | "left" | "center" | "right" | "bottom-left" | "bottom" | "bottom-right";   // = C-24 anchor
export interface HudWidgetBase { readonly id: string; readonly anchor: HudAnchor; readonly mobileAnchor?: HudAnchor | "hidden"; readonly label?: string }
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
  readonly maxScreenFraction?: number;   // C-24 type; the shell passes 0.15 (desktop) / 0.22 (mobile portrait) chosen at mount (CCR-09-4 for the documented default)
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

### 7.8 Engine runtime changes (all through contracts; PRD 09 edits only its own files)

```ts
// GameAppRuntime.ts (PRD 09-owned) — views over C-23; no FrameLoop.ts edit
interface GameAppRuntime<TApp> {
  readonly timeScale: number;                                  // = app.time.scale
  setTimeScale(scale: number): GameAppRuntimeEvidence;          // clamps [0, 4], NaN throws; writes app.time.scale
  /** Resolves with the frame index of the first frame presented after start()/setScene() (§9.3). */
  firstPresentedFrame(): Promise<number>;
}

// Consumed, pre-declared in PR 0a (C-05 via C-38 flattening; provider PRD 01). Not implemented by PRD 09.
interface AuraApp {
  setOutputOverlay(overlay: AuraOutputOverlay): { readonly applied: boolean; readonly reason?: "no-post-pass" | "disposed" | "dom-fallback" };
}

// Provided by PRD 09 as a C-37 node-handle extension (member pre-declared in PR 0a):
// packages/engine/src/agent-api/nodes/game/instanceTransforms.ts
export const instanceTransformsExtension: NodeHandleExtension<"setInstanceTransforms"> = {
  id: "prd09.setInstanceTransforms", owner: "prd09", flag: "A3D_QR_GAME", member: "setInstanceTransforms",
  appliesTo: [/* the instanced primitive node kinds created by instances.* (index.ts:2222) */],   // throws INSTANCE_NODE_REQUIRED on others
  create: (handle, app) => (matrices /* 16 × count, column-major */, count, colors /* 4 × count */) => handle,
};
// registered from packages/engine/src/lanes/prd09.ts: registerNodeHandleExtension(instanceTransformsExtension)
```

`setOutputOverlay` returns `applied: true, reason: "dom-fallback"` on the PR 0a stub, and with PRD 01's real
OutputPass `applied: true` with no reason. `Juice` records the result as `juice.backend` (`"dom"` or
`"shader"`). `setInstanceTransforms` validates sizes (`matrices.length >= 16 * count`, `count <= capacity`,
else `INSTANCE_CAPACITY_EXCEEDED` per C-07) and, in the real path, calls the node's C-07
`InstanceBufferLike.setMatrices(matrices, count)` / `setColors(colors)`. Locating a node's instance buffer from
a handle needs a read accessor on the C-37 seam (`app/runtimeNodes.ts`, PRD 15): request Q-15-2. Until it
lands the C-37 stub path is used, which is functionally identical (1 draw per kind) and only costs CPU
(measured in §17).

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

**PRD 09 changes no shader and edits no rendering file.** The juice overlay reaches pixels through C-05
`AuraOutputOverlay` (`flash`, `vignette`, `shape`, `fade`), whose real in-shader implementation is PRD 01's
OutputPass ("Overlay uniforms in the output shader", C-05 Real) and whose PR 0a stub is the DOM overlay. The
particle shaders for FX backend B belong to PRD 07 (C-20). The rest of this section is the **reference
specification** PRD 09 attaches to request Q-01-1 (WebGL2 / OutputPass) and Q-11-1 (WGSL twin), so the
providers can implement the overlay without reinterpretation. Its invariant is already the C-05 invariant: an
overlay at zero values is bit-identical to no overlay.

**What exists today (verified, §2.6).** WebGL2's final pass is `ensureLdrPostprocessProgram`
(`WebGL2Device.ts:3440`), a fullscreen fragment shader with *loose* uniforms (the device uses no
uniform blocks anywhere). `applyToneMapping` decodes the input (`u_inputColorSpace`), maps, and
re-encodes (`encodeColor` clamps to [0,1] then applies the sRGB OETF if `u_outputColorSpace == 1`)
inside one function; color grade (with its own `u_vignette`) runs after that, in *encoded* space;
`finalColorAt` and FXAA call `baseColorAt` up to 9 times per pixel. There is no dither. WebGPU
(`WebGPUDevice.ts:1446`) runs a chain of separate fullscreen passes (`bloom`, `tone-mapping`,
`color-grade`, `fxaa`, `taa`). The pass runs only when the scene declares post passes; with no post
passes, tone mapping and encode happen in the material shaders and there is no full-screen pass.

**WebGL2 uniforms** (reference for Q-01-1; loose, matching the existing program style; uploaded alongside the
program's other per-frame uniforms only when
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

**Fallback:** the DOM path is the C-05 stub itself (`reason: "dom-fallback"`, `div.a3d-output-overlay` with
`background` plus `opacity` for flash/fade and a CSS `radial-gradient` for the vignette), and
`createGame({ shell: { overlay: "dom" } })` forces it even when the real OutputPass exists. Visual parity is
approximate (compositor blend in sRGB). This is acceptable for feedback, and it is recorded in the evidence
`juice.backend = "dom"`. Phase 0 records, per route, whether its play scene runs the LDR pass today, which
predicts where the shader path changes pixels once C-05 is real.

## 9. Rendering changes

1. **FX layer pool nodes** are added to the initial scene snapshot by `createGame`'s scene decorator
   (PRD 09 code; C-37 `add` is not needed, so the remount-per-add stub cost is avoided).
   They are instanced (one draw per kind, driven by C-37 `setInstanceTransforms`), `castShadow: false`,
   `receiveShadow: false`, `visible: false` when `count === 0`, and opaque emissive (backend A). The
   shadow fit (`index.ts:12949-12960`) uses `hypot(position) + scale` of every flattened node, visible
   or not, so the pool node is placed at `[0,0,0]` with scale 1 and cannot enlarge `sceneRadius`
   beyond its floor of 1. Whether the lighting lane later excludes invisible nodes does not matter here.
2. **Canvas size:** full-bleed layout enlarges the canvas for boxed games (Aura Clash ~45% → ~100% of
   viewport area). DPR policy is C-27's (`maxPixelRatio`/render scale per tier). The shell calls
   `runtime.resize(w, h, dpr)` from a `ResizeObserver`, debounced to one call per frame, and never
   recreates the context. Mech Hangar recreates the context on resize today (research 20).
3. **First presented frame:** `GameAppRuntime.firstPresentedFrame()` resolves from the first
   C-23 `app.onRender` callback (pre-declared in PR 0a via C-38) after `start()`/`game.setScene()` whose frame
   was submitted, re-armed by `game.setScene` inside `@aura3d/game` (no `index.ts` edit). Phase 1's first task
   verifies whether `onRender` (and today's `onFrame`, `index.ts:10701`) fire after submission or also on
   `advance()`, which skips submission (`index.ts:10757`). If they fire before submission, the runtime
   resolves on the next `requestAnimationFrame` after the callback (one frame conservative, never early), and
   request Q-15-1 asks for an internal `onPresented` hook raised after `productionController.render` in
   `app/createAuraApp.ts`.
4. **Look signature** in `@aura3d/game` is computed from the authored snapshot; the engine-level real one
   (CCR-09-1) is computed from the normalized snapshot the bridge consumes (post-`normalizeCreateAppRendererOptions`),
   so it reflects what renders, not what was authored.
5. **Instanced transform update:** the real `setInstanceTransforms` writes the node's C-07 instance buffer
   in place (`setMatrices`/`setColors`; the device-level `bufferSubData`/`writeBuffer` is PRD 01's/11's) and
   sets the draw's instance count. It never reallocates if `count ≤ capacity` and throws if `count > capacity`.
6. No change to tone mapping, lighting, shadows, materials or any rendering file here.

## 10. Migration plan

**Who writes what (R21).** Route source under `apps/showcase-*/` and `apps/aura-clash-showcase/` is PRD 14's
alone. PRD 09 never commits to it. For each route PRD 09 produces, in its own directories:
- `docs/project/aura3d-quality-rebuild/migration/patches/<id>/NN-<step>.patch`: one `git format-patch`-style
  patch per migration step below, generated against the current `main` HEAD of that route;
- `docs/project/aura3d-quality-rebuild/migration/guides/<id>.md`: the step list, the kept play values, and the
  filed PRD 14 art/camera tasks;
- codemods registered from `packages/aura3d-cli/src/commands/prd09/codemods/` (C-39): `prd09-capture-branches`
  (keeps the play arm of every `visualReviewCapture ? a : b`), `prd09-audio-wrapper` (rewrites
  `*-audio.ts` into a `cues` object), `prd09-evidence-globals` (rewrites `defineProperty(window, …)` into
  `evidence.sections`) and `prd09-perf-script` (removes `write-performance-report` scripts).

**Shadow migration (standalone, never blocks).** The lane workflow `.github/workflows/qr-prd09-routes.yml`
(macos-14) checks out `main`, applies `patches/<id>/*.patch` to a scratch working tree (never pushed), builds
the route, and runs `game-capture-parity.mjs --fail-on-any --routes <id>`, `route-composition.mjs`, the
`tests/browser/game-shell/*` specs, and a default-URL capture through `quality-rebuild-capture.yml` as
`workflow_call` with the scratch build. A patch that no longer applies is regenerated by PRD 09 against the new
HEAD (the codemods make this mechanical). This proves each migration end to end without any write to a
PRD 14 file.

**Hand-off.** When a route's patch set passes, PRD 09 opens request Q-14-1 for that route
(`qr-request`, `to:prd14`) with the patch set, the codemod command lines, the guide, and the scratch-capture
run id. PRD 14 applies it in its own PR when it chooses, behind `A3D_QR_ROUTE_<ROUTE_ID>` if it wants. No list needs
editing afterwards: the lint rule treats a route as migrated (severity `error`) as soon as its `src/main.ts`
imports `@aura3d/game` (`MIGRATED_ROUTES` is computed, with a static override list in PRD 09's rule file).

The order is driven by risk and by what each route proves:

| Wave | Routes | Why first | Key removals |
|---|---|---|---|
| Pilot (Phase 1–4 gating) | `showcase-bank-shot`, `showcase-courier-rush`, `aura-clash-showcase` | Bank: small, 21 ternaries, admin-panel HUD, synth audio. Courier: best existing HUD (`hud.ts`, 208 LOC), defined-but-unplayed engine loop, context-loss black frames. Clash: existing title/loading/pause/results modules to promote, sampled audio, juice already wired | 21 + 15 + 1 branches; 2 audio wrappers; `showcaseProofBoot.ts` reduced to scenarios |
| Wave 2 | rooftop-buckets, pulse-tunnel, neon-swarm, gravity-post, skyline-runner, blockfall-reactor | Highest ART-branch counts (81/52/40/37/35/30); the largest review-world swaps | 275 branches; review-only worlds (pulse `main.ts:1373-1467`, neon `:254,688,878`, gravity freightway) |
| Wave 3 | aurora-lander, deep-recovery, patrol-wing, gallery-shift, siege-golf, mech-hangar, vault-breakers, turbo-drift-circuit | Remaining branches (21/17/16/12/9/5/4/overview) plus engine-loop audio (patrol, turbo, aurora thruster, deep sub) | 84 branches + turbo overview camera; raw `HTMLAudioElement` in deep |
| Wave 4 | orbital-defense | Delete candidate (research 17-g1 §3.4); migrate only if PRD 14 keeps it | — |

Per-route migration steps, the same for every route (each step is a separate patch in
`migration/patches/<id>/`, proven by shadow migration and applied by PRD 14):

1. Run `node tools/showcase-library/game-capture-parity.mjs --routes <id> --json docs/project/aura3d-quality-rebuild/migration/<id>.parity.json`
   and `node tools/quality-rebuild-capture/route-composition.mjs --route <id> --out docs/project/aura3d-quality-rebuild/migration/<id>.json`
   on `main`, and commit both (PRD 09-owned paths) as the route's before numbers.
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
11. Re-run the shadow-migration workflow for the route (standalone evidence), then hand off (Q-14-1). The
    vision + human review of the applied route happens at the next G-PANEL checkpoint (§16.2).

A route's migration is *standalone-done* when its patch set passes shadow migration with its §10.1 row
satisfied on the scratch build and its `evidence/prd09/<id>/` folder committed. It is *integrated-done* when
PRD 14 has applied it and the §16.2 criteria pass at a checkpoint; that never blocks PRD 09.

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
| Skyline Runner (`showcase-skyline-runner`) | 2 | 35 (`main.ts:120`) | `skyline-audio.ts` + `audio-cues.ts` → samples | `arcade-neon`: score, distance, combo | `dpad-2btn` | jump, land, collect, crash | `__AURA3D_COMPOSITION_PROBE__`/density/ghost globals | Shake reaches the camera through C-22 layers instead of being low-passed to ~7% | Review density/composition tuning |
| Blockfall Reactor (`showcase-blockfall-reactor`) | 2 | 30 (`main.ts:109`) | `reactor-audio.ts` → samples | `arcade-neon`: score, level, lines, next-piece slot | `dpad-2btn` | lock, line-clear, tetris, top-out | room-node drop + backdrop enlargement `:528, 628`; 5 probe globals; `clear-fx.ts`; `rapier-physics-proof` import `:87` | Room visible in play; no startup Rapier box drop | Enlarged backdrop |
| Aurora Lander (`showcase-aurora-lander`) | 3 | 21 (`main.ts:111`) | `lander-audio.ts` → thruster loop with live pitch | `sci-fi-telemetry`: fuel meter, altitude, velocity, objective | `flight` | thrust-start, touchdown, crash | debug text in HUD | Audible thruster tied to throttle | Review lighting |
| Deep Recovery (`showcase-deep-recovery`) | 3 | 17 (`main.ts:144`) | `deep-audio.ts` (raw `HTMLAudioElement`) → sub engine loop + `underwater` reverb | `sci-fi-telemetry`: depth, oxygen meter, objective | `flight` | grab, collide, surface | evidence blocks | Overlapping cues stop cutting off | Review framing; fps (0.5–3.6) unchanged here (PRD 11) |
| Patrol Wing (`showcase-patrol-wing`) | 3 | 16 (`main.ts:76`) | `wing-audio.ts` → prop/jet loop: throttle drives RPM pitch, not just volume (`wing-audio.ts:8-9, 92`) | `sci-fi-telemetry`: speed, altitude, objective, indicator | `flight` | hit, pickup, ring-pass | debug HUD text | Pitched engine | Review framing |
| Gallery Shift (`showcase-gallery-shift`) | 3 | 12 (`main.ts:84`) | `heist-audio.ts` → samples + alarm stinger | `sci-fi-telemetry`: detection meter, objective, timer | `twin-stick` | spotted, alarm, loot | "Backend rapier / LOS rays" HUD text; touch buttons on desktop | Alarm is a flash + stinger, not a CSS red border | none significant |
| Siege Golf (`showcase-siege-golf`) | 3 | 9 (`main.ts:45`, `captureMode`) | `golf-audio.ts` → samples | `sports-broadcast`: strokes, power meter, wind, objective | `aim-drag` | swing, impact, wall-break, hole | evidence blocks | Impact feedback on wall hits | Review framing |
| Mech Hangar (`showcase-mech-hangar`) | 3 | 5 (`main.ts:62`) | `hangar-audio.ts` → samples + `hangar` reverb | `sci-fi-telemetry`: health/heat meters, ammo, objective | `twin-stick` | fire, hit, overheat | "ASSET PASSPORT" panel; `arena/feel.ts` geometry; context recreation on resize | No dev panel in play; keyboard hints hidden on touch | none significant |
| Vault Breakers (`showcase-vault-breakers`) | 3 | 4 (`main.ts:50`) | `pinball-audio.ts` → `sports/table` flipper/bumper/plunger | `arcade-neon`: score, balls (lives), multiplier | `flippers` | bumper, flipper, drain, jackpot | evidence blocks | Bumper hits flash + spark | none significant |
| Turbo Drift Circuit (`showcase-turbo-drift-circuit`) | 3 | 0 ternaries + `?capture=overview` camera (`main.ts:564`) + review smoothing disable (`:2826-2830`) | `turbo-audio.ts` + `audio-cues.ts` → car-sport engine with RPM (today played once, no pitch, `main.ts:4411-4417`), tyre-skid loop | `motorsport`: lap, position, timer, speedometer, minimap | `steer-pedals` | drift-start, boost, collide, lap | overview camera; `rapier-physics-proof` import `:32` | Engine pitch follows RPM; shake applied through C-22 layers | Overview camera framing |
| Orbital Defense (`showcase-orbital-defense`) | 4 | 0 | none today (silent) → samples if kept | `arcade-neon`: score, wave, health | `twin-stick` | kill, hit-taken, wave-clear | per-frame `innerHTML` HUD | Kills stop "just vanishing" | n/a; migrated only if PRD 14 keeps it |

## 11. Backward compatibility

- `createGameAudio` keeps its signature (`GameAudio.ts:138-155`). Behaviour changes: real panning,
  real occlusion lowpass, a master limiter, and, per C-25, **a thrown error for cues with no asset/play when
  `A3D_QR_GAME` is on** (a `console.warn` with the same message when it is off, so flag-off behaviour is
  unchanged except for the warning). That is breaking for asset-less cues under the flag, and intentional.
  Research 10 §8.2 reports that the routes using `createGameAudio` (14 wrappers plus direct calls in aurora,
  courier, mech, neon, siege, turbo `main.ts`) supply assets or `play`; Phase 2's first task re-verifies this
  with a unit test that imports every route cue map read-only. Template cue maps are checked by the same test;
  any template fix is a patch in request Q-13-1.
- `game.hud`, `game.accessibility`, `game.evidence` and `game.touchControls` keep working, with
  `@deprecated` JSDoc, for one minor release.
- Legacy evidence globals are re-exposed via `legacyGlobals` until Phase 6, so
  `tools/showcase-library/*` gates (`route-gates.mjs`, `route-primary-probes.mjs`,
  `showcase-game-release-gates.mjs`, `game-play-probe.mjs`) keep resolving. Phase 6 moves them to
  `__AURA3D_GAME__` + `__AURA3D_GAME_EVIDENCE__[route]`.
- URLs with `?capture=review` keep loading. They render the play frame plus a console warning. Any
  external bookmark or thumbnail job that depended on the review look is expected to change.
  Blockfall thumbnails use `?capture=review` (17-g4 §0).
- `FrameLoop` is untouched by PRD 09. Time scale goes through C-23, whose PR 0b wiring keeps the constructor
  `timeScale` option and adds `setTimeScale` additively (PRD 08's file).
- Output pass: PRD 09 adds nothing to it. C-05's invariant (zero overlay is bit-identical to no overlay) is
  checked by C-05 conformance; PRD 09's `overlay-identity.spec.ts` checks the same through `createGame`.
- With `A3D_QR_GAME` off, `createGame` resolves to the C-24 stub and `createGameAudio` keeps today's audio path
  (default cue warns instead of throwing), so no PRD 09 merge changes flag-off behaviour (CONTRACTS §6.1).
- Route import policy changes to allow `@aura3d/game`. The `aura3d doctor` root-only rule and its allowlist
  live in PRD 13/15 files: request Q-13-2. Until it lands the doctor reports `@aura3d/game` imports as a
  warning, which PRD 09's lint rule does not depend on.

## 12. Contracts consumed / provided

The earlier "Dependencies on other PRDs" table (with "blocking" rows for camera, post, asset pipeline and
benchmark) is replaced by contracts. PRD 09 builds against each consumed contract's PR 0a stub and never waits
for the provider's real implementation. What the stub can and cannot show decides whether a criterion is
standalone (§16.1) or integrated (§16.2).

### 12.1 Contracts provided

| ID | Surface PRD 09 provides | Stub that must keep working (PR 0a, CONTRACTS) | Real (PRD 09) | Consumers |
|---|---|---|---|---|
| C-24 | `createGame`, `Game`, `GameSession`, `GameShell`, `Hud`, `TouchControls`, `GameFxLayer`, `CaptureContext`, `captureFromUrl`, `GameScenario`, `GameBeacon`, `window.__AURA3D_GAME__` / `__AURA3D_GAME_EVIDENCE__` | `contracts/stubs/game.ts`: wraps `createGameApp` (`index.ts:11818`) + minimal DOM title/pause/results + fade; DOM-grid `Hud`; touch via `game.touchControls` (`:8250`); `fx.backend = "primitive-pool"` via C-20; `captureFromUrl` real; beacon published | `packages/game/src/**`, slot `provide` from `packages/game/src/index.ts`; `tests/unit/contracts/impl/prd09-game.test.ts` | 12 (beacon readiness, scenario query), 13 (6 templates), 14 (18 routes) |
| C-25 | `GameSound`, `createGameSoundEngine`, `SoundCueSpec`, buses, `MusicController`, `EngineLoopHandle`, `GameSoundProof`, `AudioSource.setPlaybackRate` | wraps `packages/engine/src/game/GameAudio.ts`; `engine()` = loop restarted on `setRate`; `proof().synthCues` counts synthesized cues | `packages/audio/src/game-sound/**`, `assets/packs/game-sfx-core/`; engine binding from `packages/engine/src/lanes/prd09.ts`; `tests/unit/contracts/impl/prd09-sound.test.ts` | 08 (feel `audio` channel, listener), 13, 14 |

Registry entries and members PRD 09 provides into other contracts:
- C-37 member `setInstanceTransforms` (`agent-api/nodes/game/instanceTransforms.ts`).
- C-38 flattened `lookSignature()`/`lookManifest()` (real behind CCR-09-1).
- C-31 diagnostics section `game` (session state, sound proof, juice backend, HUD fraction, fx live count;
  `null` for anything unmeasured).
- `look/capture-branch` in two forms: a C-39 `AuraDoctorRule` (source scan reusing the
  `game-capture-parity.mjs` classifier, hosted by `aura3d doctor --look`) and a C-34 `registerLookLintRule`
  entry (snapshot form: flags a snapshot whose authored-look manifest differs from the play manifest recorded
  for the same route).
- C-39 commands `perf-report`, `sfx admit`, and codemods `prd09-*` (§10).
- C-30 lane scenes `prd09-juice-flash`, `prd09-fx-burst`, `prd09-hud-fraction` in
  `benchmarks/quality-rebuild/{scenes,aura3d/scenes}/prd09/` (engineering scenes, no three reference claim).
- C-40 facts `F-09-*` (createGame defaults, cue provenance rule, HUD budget, capture rule).

The conformance suites `tests/unit/contracts/C-24-game.test.ts`, `C-25-sound.test.ts` and
`tests/browser/contracts/C-24-beacon.spec.ts` are PRD 15-owned and must pass for `stub` and `real`.

### 12.2 Contracts consumed

| ID | What PRD 09 uses | Day-0 stub behaviour PRD 09 relies on | Provider | Effect on acceptance |
|---|---|---|---|---|
| C-05 | `app.setOutputOverlay` for flash/vignette/fade | returns `{ applied: true, reason: "dom-fallback" }` and drives `div.a3d-output-overlay` (visible in page screenshots) | 01 | DOM juice standalone; in-shader juice integrated |
| C-06 | groups/transforms for game kits | existing scene graph | 01 | standalone |
| C-07 | `InstanceBufferLike.setMatrices/setColors` behind the real `setInstanceTransforms` | wraps today's per-frame instance upload (`ForwardPass.ts:1711-1803` per CONTRACTS) | 01 | standalone (1 draw per kind either way) |
| C-13 | none directly; the juice overlay is C-05, not a post pass | — | 03 | — |
| C-15 | material overrides for kit tints | `setTint` for `color` only | 04 | standalone (kits use color only) |
| C-17 | manifest 1.1 field names for `game-sfx-core/manifest.json` | types only | 05 | standalone |
| C-19 | character clips in fighter fixture | legacy playback | 06 | standalone |
| C-20 | `app.effects.burst/trail` for `fx.backend = "particle-pass"` | honest primitive pool via C-37 `add`, `sim: "primitive-pool"` | 07 | primitive FX standalone; particle-pass pixels integrated |
| C-22 | `app.camera.presented()` (listener, damage numbers), `shake`/`punch` layers, `setPose` (scenarios, title attract) | `presented()` reads current camera spec; `setPose` writes the camera node; layers applied | 08 | shake on `app.camera`-driven fixtures standalone; route camera feel integrated |
| C-23 | `app.time.scale/hitStop/slowMo`, `app.onRender`, handle `timeScale` | controller real (pure state); wired to `FrameLoop.setTimeScale` in PR 0b | 08 | standalone |
| C-27 | `app.quality.tier/settings` for voice caps, HRTF count, reverb, FX caps, HUD effects | real data; `"auto"` → `high` desktop, `medium` on `(pointer: coarse)` | 11 | standalone |
| C-28 | none required (FrameStats optional for perf section) | partial counters | 11 | perf section uses rAF intervals, never engine fps |
| C-29 | `onDeviceLost`/`onDeviceRestored` semantics | today's WebGL2 listener (`WebGL2Device.ts:444`) | 11 | WebGL2 context-loss UI standalone; WebGPU `device.lost` integrated (Q-11-2) |
| C-30 | lane scene index `prd09/`, `ReadyPayloadV2.qrFlags` | registry over the 18 scenes + lane indices | 12 | standalone |
| C-31 | `registerDiagnosticsSection("game")` | sections present with null values | 12 | standalone |
| C-32 | `GAME_NONVISUAL_CATEGORIES`, judgement schema | types + verbatim category list | 12 | screening standalone; acceptance only at G-PANEL |
| C-33 | beacon readiness, `workflow_call` capture, `--flags` passthrough, step plugins | today's scripts + PR 0b passthrough | 12 | standalone (shadow migration) |
| C-34 | `registerLookLintRule("look/capture-branch")` | registry real | 13 | standalone |
| C-35 | game acceptance schema fields read by §16.2 | data types | 14 | integrated |
| C-37 | `registerNodeHandleExtension("setInstanceTransforms")`, handle `timeScale` | extension stubs present; `add` = remount (not used by PRD 09) | 15 | standalone |
| C-38 | `app.camera/time/effects/quality/output` members, flattened `setOutputOverlay`, `lookSignature`, `onRender` | real registry, stub factories | 15 | standalone |
| C-39 | `registerCliCommand`, `registerCodemod`, `registerDoctorRule` | real in PR 0 | 15 | standalone |
| C-40 | facts table for PRD 13 | n/a | — | — |

Resolved conflicts from CONTRACTS §0 that changed this PRD: R13 (`GameFxLayer` facade vs `app.effects`), R15
(time scale lives in C-23 / `FrameLoop.ts` is PRD 08's), R16 (`@aura3d/game` touch is the public API on PRD 08's
primitives), R17 (PRD 09 owns all audio), R20 (templates are PRD 13's), R21 (routes are PRD 14's), R22
(`games.json` is PRD 14's data).

### 12.3 Requests to other lanes (non-blocking)

Filed as `qr-request` + `to:prdNN` issues (CONTRACTS §6.5). PRD 09 never waits: each row names what PRD 09
does meanwhile and which criterion moves to the next checkpoint after it lands.

| ID | To | File / change | Contract | Meanwhile |
|---|---|---|---|---|
| Q-01-1 | 01 | Implement the C-05 overlay in OutputPass per the §8 reference GLSL (decode → flash/vignette/fade → encode once, after AA, uniform branch idle) | C-05 | DOM overlay (stub); in-shader juice integrated |
| Q-11-1 | 11 | WGSL twin of the §8 overlay, encoded only while an amount ≥ 1/512 | C-05, C-29 | DOM overlay on WebGPU |
| Q-11-2 | 11 | `WebGPUDevice` `device.lost` → `AuraApp.onDeviceLost`, `onDeviceRestored` after re-init | C-29 | context-loss UI verified on WebGL2 only; WebGPU row integrated |
| Q-05-1 | 05 | `aura3d assets add --type audio` (license/sourceUrl/author required, LUFS/true-peak via PRD 09's `loudness.ts`), `assets validate --release` synth-provenance rule, Opus/AAC transcode stage | C-17, C-39 | `aura3d sfx admit` + `validate-sfx-pack.mjs` (PRD 09) |
| Q-08-1 | 08 | Feel bus `audio` channel calls C-25 `GameSound.play` (`executed.audio` counts real voices) | C-23, C-25 | `juice` plays cues directly |
| Q-12-1 | 12 | Checkpoint jobs in `quality-rebuild-capture.yml`: capture-parity `--fail-on-any` over all routes, look-signature comparison (default vs scenarios vs `?capture=review`), `audio.webm` tap artifact | C-33 | same jobs run in `qr-prd09-routes.yml` |
| Q-13-1 | 13 | Rebuild `mini-game`, `racing-starter`, `falling-blocks-starter`, `fighting-game`, `character-controller` on `createGame` (patches attached), `aura3d-browser-game` skill from facts `F-09-*` | C-24, C-40 | `packages/game/fixtures/*` are the reference games |
| Q-13-2 | 13 | `aura3d doctor` route import allowlist adds `@aura3d/game`; host doctor rule `look/capture-branch` | C-34, C-39 | lint rule enforces capture rule; doctor warns |
| Q-14-1 | 14 | Apply `migration/patches/<id>/` per route (pilot: bank-shot, courier-rush, aura-clash; then waves 2-4) | C-24, R21 | shadow migration in PRD 09 CI |
| Q-14-2 | 14 | Art/camera tasks for every review-branch improvement lost (§10.1 last column); portfolio decision for Orbital Defense | C-35 | none needed |
| Q-14-3 | 14 | `games.json` `evidenceGlobal` → `__AURA3D_GAME_EVIDENCE__`, `captureContractMigrated: true` per applied route | C-33 | readiness already via beacon (C-33) |
| Q-14-4 | 14 | Delete per-route `scripts/build-sfx.mjs`, generated WAVs, `write-performance-report.ts`, `*-audio.ts`, `rapier-physics-proof` imports (in the patches) | R21 | `rapier-physics-proof.ts` kept, `@deprecated` |
| Q-15-1 | 15 | Internal `onPresented` hook after `productionController.render` in `app/createAuraApp.ts`, exposed to `GameAppRuntime` | C-38 | `firstPresentedFrame` resolves one rAF late (never early) |
| Q-15-2 | 15 | Read accessor from a C-37 handle to its C-07 instance buffer in `app/runtimeNodes.ts` | C-07, C-37 | C-37 stub path for `setInstanceTransforms` |
| Q-15-3 | 15 | Export `normalizeSceneSnapshot` through `agent-api/internal/shared.ts` for the engine-level look signature | C-38 | `@aura3d/game/capture` signature (authored snapshot) |
| Q-15-4 | 15 | `root-manifest`: root `check:capture-parity` script gets `--fail-on-any` (`package.json:691`); `test.yml` optional step | §4.4 | lane workflow calls the tool directly |
| CCR-09-1 | 15 + consumer | C-38 provider slot for `lookSignature`/`lookManifest` | C-38 | stub hash + `@aura3d/game` signature |
| CCR-09-2 | 15 + consumer | `TransitionSpec` optional `outMs`, `inMs`, union member `"iris"` | C-24 | `ms` only |
| CCR-09-3 | 15 + consumer | `CreateGameOptions` optional `title, app, input, shell, scenarios, evidence, fx, capture` | C-24 | package type extends contract |
| CCR-09-4 | 15 + consumer | `maxScreenFraction` documented default 0.15 desktop / 0.22 mobile portrait | C-24 | shell passes explicit per-viewport numbers |
| CCR-09-5 | 15 + consumer | `SoundCueSpec.priority`/`spatial` unions, layered `engine()` spec, `GameSoundOptions` extras | C-25 | package type extends contract |

### 12.4 External dependencies

- **Runtime npm dependencies added: none.** `@aura3d/game` depends only on workspace packages
  (`@aura3d/engine`, `@aura3d/audio`, `@aura3d/input`, `@aura3d/math`) with `workspace:*`.
- **Tooling:** reuses root devDependencies already present (`size-limit` / `@size-limit/file` ^12.1.0,
  `eslint` ^9.26.0, `vitest` ^3.1.3, `@playwright/test` 1.59.1; `package.json:719-743`). No new tool is
  added. If a loudness meter is needed for `assets add --type audio`, it is implemented in-repo
  (ITU-R BS.1770 K-weighting over decoded PCM, ~150 LOC, `packages/audio/src/game-sound/loudness.ts`) rather
  than adding a native dependency; transcoding uses `ffmpeg` on the remote runner (not bundled), invoked by
  `aura3d sfx admit` until Q-05-1 gives PRD 05's admission the same stage.
- `@aura3d/game`'s own `package.json` (PRD 09-owned) lists its workspace deps with exact `workspace:*`; no root
  manifest change is needed (CONTRACTS §4.4).
- **Fonts:** self-hosted OFL woff2 subsets with `OFL.txt` per family in `packages/game/src/fonts/`.
- **Audio content:** Kenney CC0 packs and other CC0/royalty-free packs per §6.9, each file with a
  recorded license; no runtime fetch from third-party hosts.
- **Remote services:** GitHub Actions `macos-14` (existing), and a real-device session for §19.

---

## Parallel execution

### Day-0 start conditions

PRD 09 starts on 2026-10-05 from the PR 0a branch (CONTRACTS §3.9). The only prerequisites are PR 0a artifacts:
`packages/engine/src/contracts/{flags,game,camera,time,effects,output,runtimeNodes,app,diagnostics,looks,art}.ts`
and `contracts/stubs/game.ts`; `packages/audio/src/contracts/gameSound.ts`; `packages/rendering/src/contracts/{core,geometry,quality}.ts`;
the `packages/game` skeleton and the `@aura3d/game`, `@aura3d/game/capture` subpath reservations;
`eslint/qr/no-route-capture-flags.js` (empty); `packages/engine/src/lanes/prd09.ts`;
`packages/aura3d-cli/src/commands/prd09/index.ts`; `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd09/index.ts`;
`tools/quality-rebuild-capture/games.schema.json`; the conformance harness and the C-24/C-25 suites passing on
stubs. Nothing from any other lane's real implementation is needed: C-22, C-23, C-24, C-25 and C-27 are on
CONTRACTS' "no PR 0b seam needed" list.

Work in new PRD 09 files starts on day 0 (Phase 0 and Phase 1 tasks marked "day 0" in §14). Edits to carved
regions start when the PR 0b part containing them merges (≤ 2026-10-07); until then the code is written in PRD
09's own module and wired after the merge:
- PR 0b-1: `agent-api/app/createGameApp.ts` and `agent-api/nodes/game/index.ts` carves (deprecation JSDoc, game
  namespace), C-37/C-38/C-31 seams (`setInstanceTransforms`, `lookSignature`, `game` section).
- PR 0b-2: C-23 wiring of `FrameLoop.setTimeScale` (PRD 08's file; PRD 09 only consumes `app.time`).
- PR 0b-3: C-39 CLI fallthrough (`perf-report`, `sfx admit`, codemods), C-33 capture plugins and `--flags`.

### Owned files and directories (must match CONTRACTS §4.1)

`packages/game/` (except `src/art/`, PRD 14); `packages/audio/` (all except `src/contracts/`, PRD 15);
`packages/engine/src/game/`; `packages/engine/src/agent-api/GameAppRuntime.ts`,
`agent-api/app/createGameApp.ts`, `agent-api/nodes/game/` (default; `nodes/game/racingCamera.ts` is PRD 08's);
`packages/input/src/TouchLayouts.ts`; `packages/math/src/{Easing,Random}.ts`; `apps/common/`;
`assets/packs/game-sfx-core/`; `eslint/qr/no-route-capture-flags.js`; `tools/showcase-library/` (except
`game-visual-qa.mjs`, PRD 12); `tools/quality-rebuild-capture/route-composition.mjs`; `tools/public-api-contract/`;
`docs/project/aura3d-quality-rebuild/migration/`.
Lane-generic (CONTRACTS §4.1 "lane NN"): this PRD file, `docs/project/aura3d-quality-rebuild/evidence/{prd09,prd-09}/`,
`packages/*/src/lanes/prd09.ts`, `agent-api/compiler/diagnosticOnly.prd09.ts`, `packages/aura3d-cli/src/commands/prd09/`,
`benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd09/`, `.github/workflows/qr-prd09-*.yml`
(`qr-prd09-game.yml`: unit + browser + capture-parity; `qr-prd09-routes.yml`: shadow migration), `tests/qr/prd09/`,
`tests/unit/contracts/impl/prd09-*`; new test files under `tests/unit/{game,audio,math,tools}/` and
`tests/browser/game-shell/` (creator rule).

Tasks of the earlier draft that edited files owned by other lanes were converted:
`FrameLoop.ts` → C-23 `app.time` (08); `index.ts` `AuraApp`/handle members → C-38/C-37 pre-declared members and
PRD 09 extension modules (15); `WebGL2Device.ts` → C-05 + Q-01-1 (01); `WebGPUDevice.ts` → Q-11-1/Q-11-2 (11);
`apps/*` route migrations → patches + codemods + Q-14-1..4 (14); templates → Q-13-1 (13); `games.json` → not
needed / Q-14-3 (14); `quality-rebuild-capture.yml` → `workflow_call` + Q-12-1 (12); `test.yml`,
`eslint.config.js`, root `package.json` → lane workflow, `eslint/qr/` file, Q-15-4 (15); `assets add --type
audio` → `aura3d sfx admit` + Q-05-1 (05).

### Extension points used in files owned by others

| Extension point | Host file (owner) | PRD 09 registration (own file) |
|---|---|---|
| C-24 `ContractSlot.provide` | `packages/engine/src/contracts/game.ts` (15) | `packages/game/src/index.ts` |
| C-25 slot binding | `packages/engine/src/contracts/` (15) | `packages/engine/src/lanes/prd09.ts` |
| C-37 `registerNodeHandleExtension("setInstanceTransforms")` | `agent-api/app/runtimeNodes.ts` (15) | `agent-api/nodes/game/instanceTransforms.ts` via `lanes/prd09.ts` |
| C-38 flattened `lookSignature`/`lookManifest` (CCR-09-1) | `agent-api/app/createAuraApp.ts` (15) | `agent-api/nodes/game/lookSignature.ts` |
| C-31 `registerDiagnosticsSection("game")` | `agent-api/app/diagnostics.ts` (15) | `agent-api/nodes/game/diagnostics.ts` |
| C-34 `registerLookLintRule("look/capture-branch")` | `agent-api/looks/` (13) | `packages/game/src/capture/lookLint.ts` |
| C-39 `registerCliCommand`/`registerCodemod`/`registerDoctorRule` | `packages/aura3d-cli/src/commands/registry.ts` (15) | `packages/aura3d-cli/src/commands/prd09/index.ts` |
| C-33 `workflow_call` + `--flags` + beacon readiness | `.github/workflows/quality-rebuild-capture.yml`, `capture-games.mjs` (12) | `.github/workflows/qr-prd09-routes.yml` |
| C-30 lane scene index | `benchmarks/quality-rebuild/shared/registry.ts` (12) | `benchmarks/quality-rebuild/scenes/prd09/index.ts` |
| ESLint `eslint/qr/*.js` import | `eslint.config.js` (15) | `eslint/qr/no-route-capture-flags.js` |

### Feature flags

| Flag | Values | Gates | Default / state |
|---|---|---|---|
| `A3D_QR_GAME` | bool | `createGame` real (vs C-24 stub), C-25 real engine, asset-less cue throws (warn when off), real `setInstanceTransforms`, `game` diagnostics section, real look signature | off (`dev`) until standalone acceptance; CONTRACTS §5.3 transitions |
| `A3D_QR_GAME_SOUND` | bool | `GameSoundEngine` path inside `createGame` (off = `createGameAudio` legacy path, the `sound: { engine: "legacy" }` rollback) | follows `A3D_QR_GAME` |
| `A3D_QR_GAME_SHELL` | bool | full-bleed shell, menus, transitions, HUD kit (off = stub minimal DOM shell) | follows `A3D_QR_GAME` |

Routes opt in per route (`createGame({ qualityRebuild: { flags: ["game"] } })`, applied by PRD 14 with the patch);
`games.json` `qrFlags` mirrors it (PRD 14). Per-option switches that are not flags: `fx.backend`,
`shell.overlay: "dom"`, `fx: false`.

### Stubs used

C-05 (DOM overlay), C-07 (per-frame instance upload), C-15 (`setTint` color only), C-20 (primitive pool via C-37
`add`), C-22 (`presented` from camera spec, layers applied, `setPose` writes node), C-23 (real controller,
PR 0b `FrameLoop` wiring), C-27 (real data, `auto` resolution), C-28 (partial counters, unused for fps),
C-29 (WebGL2 context-loss listener), C-30, C-31, C-33 (today's scripts + passthrough), C-34 (registry real),
C-37 (extension stubs), C-38/C-39 (real). PRD 09's own C-24/C-25 stubs stay the flag-off path until §5.4
removal.

### Requests to other lanes (non-blocking)

The full table is §12.3 (Q-01-1, Q-05-1, Q-08-1, Q-11-1, Q-11-2, Q-12-1, Q-13-1, Q-13-2, Q-14-1..4,
Q-15-1..4, CCR-09-1..5). None gates a PRD 09 merge or `standalone-accepted`.

### Integration checkpoints

Integrated acceptance (§16.2) is evaluated only at CONTRACTS §7 checkpoints with `A3D_QR_GAME` on inside
`qr_flags=all`, and never blocks a PRD 09 merge:
- IC-0 (2026-10-08): flags `none` baseline; PRD 09 records per-game non-visual baselines and `postPass` per route.
- IC-1 (2026-10-15), IC-2 (10-22), IC-3 (10-29): screening (vision-only, recorded, cannot accept). First routes
  applied by PRD 14 appear here.
- IC-4 (2026-11-05), IC-8 (2026-12-03), IC-12 (2026-12-31): G-PANEL rounds, the only rounds that can move
  `A3D_QR_GAME` to `integrated-accepted` and satisfy §16.2. Leave-one-out (`all,-game`) attributes regressions.
A checkpoint failure becomes a `qr-ic-regression` issue against the owning lane (CONTRACTS §7).

## 13. Implementation phases

Every phase works only in PRD 09-owned paths against PR 0a stubs. Phases 0 and 1 start on day 0; phases 2-4
can run in parallel sub-teams once the Phase 1 package scaffold exists (same day). No phase exit depends on
another lane's real implementation or on PRD 14 applying a patch.

**Phase 0: Baseline (no product code; day 0).**
- Make research 16's classifier repeatable as `tools/quality-rebuild-capture/route-composition.mjs`;
  record per-route LOC split, ternary counts, `window.__*__` globals, audio provenance.
- Run `game-capture-parity.mjs` for all 18 routes; commit the JSON under `migration/`.
- Capture both the default URL and `?capture=review` (Turbo: `?capture=overview`) for the 16 affected routes
  from the lane workflow `qr-prd09-routes.yml` (macos-14), as the divergence record (research 18 Q1).
- Record per route whether the play scene runs the LDR postprocess pass (`app.diagnostics()` at the
  default URL), which predicts where C-05 real will move juice from DOM to shader.
- Inventory consumers of route globals: `rg -l "__[A-Z_]+__" tools tests` → `migration/global-consumers.txt`.
- Exit: `docs/project/aura3d-quality-rebuild/migration/baseline.json` committed, with 18 entries,
  each listing LOC split, branch counts by class, global names, cue provenance counts, and
  `postPass: boolean`.

**Phase 1: Package, session, capture contract, evidence channel (day 0).**
- `packages/game` real entry over the PR 0a skeleton; `createGame`, session (delegating to C-23 `app.time`),
  lifecycle, capture, beacon, lazy evidence, `GameAppRuntime.timeScale/setTimeScale/firstPresentedFrame`,
  `@aura3d/game/capture` `lookSignature`, lint rule module, `game-capture-parity.mjs` `--routes`/`--fail-on-*`.
- Reference fixture `packages/game/fixtures/table/` (bank-shot-shaped) built on `createGame` from the start.
- Pilot patch set for Bank Shot (§10 steps 1–3, 8, 10) proven by shadow migration.
- Exit (standalone): unit tests green in `qr-contracts.yml` and `qr-prd09-game.yml`; C-24 conformance green for
  `stub` and `real`; the Bank Shot scratch build has 0 capture branches of any class
  (`--routes showcase-bank-shot --fail-on-any`), equal `@aura3d/game` look signatures across default, every
  scenario URL and `?capture=review`; auto-pause on hidden verified in a browser test; the scratch capture's
  readiness resolved from `window.__AURA3D_GAME__` (C-33); request Q-14-1 (bank-shot) filed.

**Phase 2: Sound.**
- `GameSoundEngine`, `AudioSource.setPlaybackRate`, `PositionalEmitter` fix, `createGameAudio` adapter,
  default-cue removal (throw under flag, warn off), `game-sfx-core` admitted with `aura3d sfx admit`
  (≥ 269 files per the §6.9 count), music controller, engine-loop layers.
- Pilots: the table and courier fixtures; patch sets for Bank Shot, Courier Rush (engine + city ambience loops
  actually playing) and Aura Clash (adapter path, no regression).
- Exit (standalone): OfflineAudioContext tests (§15) green; C-25 conformance green for `stub` and `real`; the
  3 pilot scratch builds play sampled cues only (evidence provenance `sample` = 100%); the Courier engine
  loop's pitch tracks speed (fundamental shift ≥ 25% idle→max); blind listening review by a named human
  (not the implementer) scores the pilots' scratch-build `sound_audio` ≥ 6.

**Phase 3: Juice, tween, FX layer, overlay.**
- Juice facade, tween/easing (`@aura3d/math` `Easing` extension), `SeededRandom` additions, event
  presets, real `setInstanceTransforms` C-37 extension, FX layer backend A auto-mount, backend B over C-20,
  overlay through C-05 `setOutputOverlay`, rumble via `Haptics`, shake/punch via C-22 layers.
- Pilots: courier fixture + Courier patch (strike, pickup, deliver), Bank (pot, foul, combo), Aura Clash (hit,
  block, KO).
- Exit (standalone): `juice-pixels.spec.ts` (DOM path, i.e. the C-05 stub), `hitstop.spec.ts`,
  `fx-instances.spec.ts` and `overlay-identity.spec.ts` green on macos-14 (deterministic clock, §15). FX draw
  calls = live kinds, or the degraded mode is active and its measured draw count is recorded in the Phase 3 PR.
  `juice.shake` changes the presented pose on a fixture whose camera uses `app.camera` (C-22 stub).
  Idle output is bit-identical.

**Phase 4: HUD kit, shell screens, full-bleed layout, touch.**
- HUD kit + 6 themes + fonts; loading/title/pause/settings/results/about; transitions; context-loss
  UI; touch presets.
- Pilots: all 3 fixtures and the 3 pilot patch sets.
- Exit (standalone): in the macos-14 scratch captures, each pilot's canvas covers ≥ 95% of the desktop
  viewport; HUD ≤ 15% desktop and ≤ 22% mobile; 0 banned tokens in play DOM; touch play completes the pilot's
  playbook on mobile emulation; `loading_transitions` scored ≥ 7 by a named human on the scratch builds
  (non-visual category, CONTRACTS §8 standalone list). Visual categories (`ui_hud`, `typography`,
  `mobile_presentation`) are screening-only here and are accepted only in §16.2.

**Phase 5: Fleet migration packages (waves 2–4).**
- Patch sets and guides (§10 steps 1–11) for the remaining 15 routes, each proven by shadow migration and
  handed off as Q-14-1; `aura3d perf-report`; codemods `prd09-*`.
- Exit (standalone): for every route, the scratch build passes `--fail-on-any`, look-signature parity for
  every declared scenario, evidence LOC ≤ 10% (classifier), and per-route rAF p50 no worse than baseline
  +0.5 ms at equal canvas size; the 16 audio wrappers, 13 perf scripts, 16 `build-sfx.mjs` and the
  `rapier-physics-proof` imports are deleted **in the patches**. Applying them is PRD 14's (integrated).

**Phase 6: Removals and tool migration.**
- Tools in `tools/showcase-library/` read the beacon + evidence channel; `legacyGlobals` support removed from
  `@aura3d/game` once `rg` finds no consumer; deprecated `game.hud`, `game.accessibility`, `game.evidence`,
  `game.touchControls` removed from `nodes/game/index.ts` after two checkpoints with `A3D_QR_GAME` `default-on`
  (CONTRACTS §5.4); `apps/common/src/rapier-physics-proof.ts` deleted once unimported. Template patches handed
  off as Q-13-1.
- Exit (standalone): `rg -l "window\.__(?!AURA3D_GAME__|AURA3D_GAME_EVIDENCE__|AURA3D_EVIDENCE_OPT_IN__)[A-Z0-9_]+__" --pcre2 tools/showcase-library packages/game`
  returns only test fixtures; `tools/public-api-contract` updated; the template patches generate a full-bleed,
  sampled-audio, juiced game in the lane workflow from a scratch `create-aura3d` run. Template adoption itself is
  PRD 13's (integrated).

## 14. Task checklist

Every task writes only PRD 09-owned paths (§5.1, §5.2, "Parallel execution"). Tasks marked "(day 0)" and every
other Phase 0/1 task start on 2026-10-05 against the PR 0a branch; tasks marked "After PR 0b-N" start when that
part merges (≤ 2026-10-07) and are drafted in PRD 09's own module until then. "Patch" tasks produce files under
`docs/project/aura3d-quality-rebuild/migration/patches/<id>/`, are proven by shadow migration (§10), and are applied
by PRD 14 (Q-14-1); PRD 09 never commits to `apps/showcase-*` or `apps/aura-clash-showcase`.

### Phase 0: Baseline
- [ ] Create `tools/quality-rebuild-capture/route-composition.mjs`. Implement research 16's classifier (evidence = paths under `tests/ scripts/ art-review/ capture/ evidence/ seo/` or names matching `proof|evidence|probe|capture|acceptance|telemetry|performance-report|poster|harness`; statement-level split of `main.ts`/`*App.ts` with the 8% rule). Output `{route, loc:{evidence,presentation,gameplay,generated}, globals:[...], captureBranches:{ART,FRAMING,TRANSIENT,UNKNOWN}, cues:{sample,synth,html-audio}}`. Add a unit test on a fixture app in `tests/unit/tools/route-composition.test.ts`.
- [ ] Run it plus `tools/showcase-library/game-capture-parity.mjs --json` for all 18 routes. Commit `docs/project/aura3d-quality-rebuild/migration/baseline.json`.
- [ ] (day 0) Create `.github/workflows/qr-prd09-routes.yml` (macos-14, `workflow_dispatch` + `pull_request` on PRD 09 paths) with a `capture_review_divergence` job that serves each of the 16 affected routes from `main` and captures `?capture=review` (and Turbo's `?capture=overview`) plus the default URL with Playwright (`tests/qr/prd09/capture-divergence.spec.ts`), uploading them as artifacts (record only, not a gate).
- [ ] (day 0) In the same job, record `postPass` per route (`app.diagnostics()` at the default URL: does the play scene run the LDR postprocess pass) into `baseline.json`, and write `migration/global-consumers.txt` from `rg -l "__[A-Z_]+__" tools tests`.

### Phase 1: Package, session, capture, evidence
- [ ] (day 0) Replace the PR 0a skeleton entry `packages/game/src/index.ts` with the real exports and set `packages/game/package.json` (`name: "@aura3d/game"`, ESM, `sideEffects: ["*.css"]`, exports `.`, `./capture`, `./util`, `./styles.css`; deps `@aura3d/engine`, `@aura3d/audio`, `@aura3d/input`, `@aura3d/math` as `workspace:*`). The entry calls the C-24 slot's `provide(realCreateGame)` once; `createGame` resolves `slot.get(resolveQrFlags(...))`. Test `tests/unit/contracts/impl/prd09-game.test.ts`: flag off returns the stub's `Game` shape, flag on the real one.
- [ ] (day 0) Write `tests/unit/game/time-delegation.test.ts` against C-23 `app.time` (no `FrameLoop.ts` edit): `session.setTimeScale(0.5)` sets `app.time.scale = 0.5`; `session.hitStop(0.07)` calls `app.time.hitStop(0.07, { scope: "global" })`; with a fake `AuraTimeController`, scale 0 yields zero simulated advance over 60 ticks. Before PR 0b-2 merges, the test runs against the real C-23 controller object directly.
- [ ] Verify presentation ordering first: read `index.ts` around the production render loop (`mountCurrentScene` `:11353`, `requestAnimationFrame(render)` `:11350`, `onFrame` registration `:11511`) and record in the PR description whether `onFrame`/C-23 `onRender` callbacks run before or after `productionController.render` submission, and whether `advance()` (which skips submission, `:10757`) also fires them. If they are not strictly post-submission, resolve `firstPresentedFrame` on the next `requestAnimationFrame` after the callback and file Q-15-1.
- [ ] `packages/engine/src/agent-api/GameAppRuntime.ts` (`:86-105`): add `timeScale` (getter over `app.time.scale`), `setTimeScale` (clamp `[0, 4]`, NaN throws, writes `app.time.scale`) and `firstPresentedFrame()`. Resolve that promise per the previous task after `start()`, and re-arm it from `game.setScene` in `@aura3d/game` (no `index.ts` edit). Tests in `tests/unit/engine/game-app-runtime.test.ts`: promise does not resolve on `advance()`; resolves once after `step()`; re-arms after `game.setScene`.
- [ ] `packages/game/src/session/GameSession.ts`: state machine per §7.3 (C-24 states), `hitStop` with per-actor freeze sets (expire on real time, matching C-23 "hitStop and slowMo run on real time"), `slowMo` ramp, `scaledDt`. Global effects go to `app.time`. Tests: `tests/unit/game/session.test.ts` (hitStop 0.07 s freezes actor "p1" for 4–5 ticks at 60 Hz while "p3" advances; global hitStop drives `app.time.scale`-effective dt to 0 then back to 1; illegal transitions throw).
- [ ] `packages/game/src/session/lifecycle.ts`: `visibilitychange` hidden → `pause("visibility")` + `sound.suspend()`; `pagehide` with `persisted` → suspend only, without → dispose audio; `pageshow` with `persisted` → re-arm unlock + pause menu; pause keys plus Gamepad standard-mapping button 9 polling through `game.input`. Tests with jsdom: `document.hidden` mock, and `PageTransitionEvent` with `persisted: true/false`.
- [ ] `packages/game/src/session/accessibility.ts`: `matchMedia` sources with change listeners plus settings override persisted at `localStorage["a3g:<id>:settings:v1"]`. Test that both override precedence and the media change event apply.
- [ ] `packages/game/src/capture/captureFromUrl.ts` per §7.4. `?capture=review|overview` → `mode:"play"` + `console.warn` once. Test with URLs covering every param.
- [ ] (day 0) `packages/game/src/capture/lookSignature.ts`: `lookSignature(game)`/`lookManifest(game)` over the authored snapshot `createGame` holds (from `options.scene()` and every `game.setScene`): lights, materials, effects, environment, background, renderer options, node id → asset/material/authored scale/authored visible; camera excluded; keys sorted; `crypto.subtle.digest("SHA-256")`, rejecting outside a secure context. Tests (`tests/unit/game/look-signature.test.ts`): two snapshots differing only in camera have equal hashes; differing in one `emissiveIntensity`, one light intensity, one authored `scale`, one authored `visible`, or the tone-map exposure each produce a different hash; runtime-handle `setPosition` after mount does not change the hash; object key order does not change the hash.
- [ ] After PR 0b-1: `packages/engine/src/agent-api/nodes/game/lookSignature.ts` implements the same canonicalization over the normalized bridge snapshot for the C-38 `app.lookSignature()`/`lookManifest()` methods; wire it through CCR-09-1 (and Q-15-3 for `normalizeSceneSnapshot` access). The same test file runs it when the slot is provided; until then `app.lookSignature()` is the C-38 stub and no PRD 09 gate reads it.
- [ ] `packages/game/src/evidence/beacon.ts`: install `window.__AURA3D_GAME__` (frozen object replaced on state change, frame counter updated at most 4×/s). Test size: the minified beacon module is < 0.5 KB gz (size-limit check in `packages/game/size-limit.json`).
- [ ] `packages/game/src/evidence/channel.ts`: getter on `window.__AURA3D_GAME_EVIDENCE__[id]`, 250 ms memo, lazy `sections()` import gated by `?evidence=1` or `__AURA3D_EVIDENCE_OPT_IN__`, `legacyGlobals` aliases. Built-in `perf` section from a rAF ring buffer (240 samples). Test: no section function runs in 600 simulated frames without a read.
- [ ] (day 0) `tools/showcase-library/game-capture-parity.mjs` (today: only `--json` and `--fail-on-art`, `:15-17`): add `--routes <id[,id…]>`, `--root <dir>` (scan a scratch checkout), `--fail-on-framing`, `--fail-on-transient`, `--fail-on-unknown`, and `--fail-on-any` (= all four classes). Exempt `src/scenarios/**` files that import only `@aura3d/game/capture`. Leave `package.json:691` unchanged (root manifest is PRD 15's; Q-15-4 adds `--fail-on-any`). Fixture test in `tests/unit/tools/game-capture-parity.test.ts`: one fixture route per class exits 1 under the matching flag and 0 without it; a scenario file is exempt; `--routes` limits scanning; `--root` scans the given tree.
- [ ] (day 0) `eslint/qr/no-route-capture-flags.js`: export flat-config objects with `no-restricted-syntax` (messages prefixed `aura3d/no-route-capture-flags:`) for `CallExpression[callee.property.name="get"][arguments.0.value="capture"]` and `Identifier[name=/^(visualReviewCapture|visualCaptureCamera|reviewCapture|captureMode|isCapture|CAPTURE_REVIEW)$/]`, plus `no-restricted-imports` of `@aura3d/game/capture` outside `**/src/scenarios/**`, with `files` globs `apps/*/src/**` and `packages/create-aura3d/templates/*/src/**`. Severity `error` for routes whose `src/main.ts` imports `@aura3d/game` (computed at config load, plus a static override array), `warn` otherwise. Verify in `tests/unit/tools/no-route-capture-flags.test.ts` with ESLint's `Linter` API: `apps/showcase-bank-shot/src/main.ts:49` reports a warning on `main`, and the patched scratch file reports 0.
- [ ] `packages/game/src/createGame.ts`: compose `createGameApp` (`agent-api/app/createGameApp.ts` after PR 0b-1; root export before) + session + capture + evidence (sound/hud/juice/touch minimal until later phases). Scene decorator wraps `game.setScene`. Run scenario `setup` after `firstPresentedFrame` when `capture.mode === "scenario"`.
- [ ] (day 0) `packages/game/fixtures/table/`: a small billiards-shaped reference game on `createGame` (one table, 3 balls, `pot` scenario), served by `qr-prd09-game.yml` for browser specs. It never imports route code.
- [ ] Bank Shot patch set `migration/patches/showcase-bank-shot/` (§10 steps 1–3, 8, 10): delete `main.ts:49` and all 21 branches keeping the play values; add `src/scenarios/{pocket,foul,eight-finish,rack-fail}.ts` replacing `__BS_SCENARIO__`. Prove it in `qr-prd09-routes.yml` (shadow migration), then file Q-14-1 (bank-shot). No `games.json` edit: C-33 readiness uses the beacon once the route publishes it.
- [ ] CI: `.github/workflows/qr-prd09-game.yml` runs `pnpm exec vitest run tests/unit/game tests/unit/audio tests/unit/math tests/unit/tools tests/unit/contracts/impl/prd09-*`, `node tools/showcase-library/game-capture-parity.mjs --fail-on-any --routes <MIGRATED_ROUTES>`, and the `tests/browser/game-shell/*` specs on macos-14.

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
- [ ] `packages/engine/src/game/GameAudio.ts`: reimplement `createGameAudio` as an adapter over `createGameSoundEngine`, keeping the `GameAudio` interface (`:138-155`) and evidence shape. Delete `playDefaultCue` (`:485-503`). Cues without `asset`/`play` throw when `A3D_QR_GAME` is on and warn with the same message when off (C-25). First add `tests/unit/engine/route-cue-maps.test.ts` that imports every route and template cue map read-only and asserts each cue has `asset` or `play` (must pass before the throw lands; a failing route becomes a patch in its Q-14-1 set). Update `tests/unit/engine/*audio*` expectations.
- [ ] Format probe: `packages/audio/src/game-sound/formatProbe.ts` decodes bundled 20 ms Opus/WebM and AAC/M4A probes once and picks the URL variant. Test with a mocked `decodeAudioData` rejecting Opus.
- [ ] `aura3d sfx admit <dir> --pack game-sfx-core` in `packages/aura3d-cli/src/commands/prd09/sfx-admit.ts` (registered via C-39 `registerCliCommand`): require `license`, `sourceUrl` and `author` per file; compute loudness (integrated LUFS, true peak) with `packages/audio/src/game-sound/loudness.ts`; transcode Opus + AAC with `ffmpeg` on the remote runner; write C-17-named fields into `assets/packs/game-sfx-core/manifest.json`. `packages/audio/scripts/validate-sfx-pack.mjs` fails when any entry lacks a field or when a route/template cue map has `provenance: "synth"` outside the allowlist. File Q-05-1 so PRD 05's `assets add --type audio` / `validate --release` adopt the same rule.
- [ ] Assemble `assets/packs/game-sfx-core/` per the §6.9 table (≥ 269 files): admit files with licenses, normalize loudness (§6.9 targets), and transcode to Opus + AAC on the remote runner. Write `LICENSES.md` with per-file attribution. Generate typed ids in `packages/game/src/sfx.ts`. Acceptance: `node packages/audio/scripts/validate-sfx-pack.mjs` passes on the pack, asserting every manifest entry has `license`, `sourceUrl`, `author`, `lufs`, `truePeak` and both encodings.
- [ ] Bank Shot sound patch (`migration/patches/showcase-bank-shot/05-sound.patch`): cues from `billiards-audio.ts` → `src/sound.ts` using `sports/table` ids; deletes `billiards-audio.ts`, `scripts/build-sfx.mjs` and the generated WAVs. Proven by shadow migration; part of Q-14-1.
- [ ] Courier Rush sound patch: engine loop via `sound.engine({...van layers})`, `setRpm` from van speed and `setLoad` from throttle every frame; `city-night` ambience bed on `playing`; deletes `courier-audio.ts`. Same proof and hand-off. The `packages/game/fixtures/courier/` fixture exercises the same engine loop for the `audio-live.spec.ts` RPM assertion.
- [ ] Aura Clash: verify on a shadow-migrated scratch build that the adapter path preserves its 11 CC0 samples on 4 buses; the patch adds a music track and announcer cues (`round`, `fight`, `ko`) from `creature/voice`.

### Phase 3: Juice, tween, FX, overlay
- [ ] `packages/math/src/Easing.ts`: extend the existing 4-function `Easing` (`:1-24`, keeps its `[0,1]` assertion) to the 31 functions in `EaseName` (§7.6) + `Easing.spring(stiffness, damping)` (closed-form critically/under-damped, returns `(t) => number`). `packages/game/src/util/ease.ts` re-exports it keyed by `EaseName`. Tests in `tests/unit/math/easing.test.ts`: `f(0)=0`, `f(1)=1` (±1e-9) for all 31; monotonic non-decreasing on 101 samples for every ease except `back*`, `elastic*`, `bounce*`.
- [ ] `packages/math/src/Random.ts`: add `int(min, maxExclusive)`, `pick(array)`, `shuffle(array)` (Fisher–Yates), `fork(label)` to `SeededRandom`. Tests: fixed sequences for seed 42; `fork("a")` and `fork("b")` diverge; `shuffle` is a permutation.
- [ ] `packages/game/src/juice/tween.ts`: tween engine on session time (or wall time with `unscaled`), ≤ 64 active (pool), property paths for `position/scale/rotation` on `TweenableNode` and numeric fields on objects. `done` promise; `cancel/finish`. Tests: a 0.5 s position tween reaches its target at tick 30 at 60 Hz; it pauses while the session is paused.
- [ ] `packages/game/src/juice/Juice.ts`: facade per §7.6. `fire()` resolves presets and applies reduced-motion/flash scaling (§6.6). `shake` → `app.camera.shake.add(trauma)`, `punch` → `app.camera.punch.trigger(...)` (C-22); after a trigger, read `app.camera.evidence().layers` and record `shake: "applied" | "not-applied"` in the `juice` section. Tests for preset composition, reduced-motion scaling (trauma ×0.25, punch ×0.5) and the not-applied report with a fake camera whose layer energy stays 0.
- [ ] `packages/game/src/juice/overlay.ts`: drives C-05 `app.setOutputOverlay({ flash, vignette, shape, fade })` (§7.8) and records the returned `reason` (`"dom-fallback"` → `juice.backend = "dom"`, none → `"shader"`); `shell.overlay: "dom"` bypasses it and drives `.a3g-overlay` directly. Envelope: attack 0, `amount(t) = peak · exp(-5t/ms)` for `t < ms`, then exactly 0 (so the idle path is reached). Unit test with an injected clock: values at t = 0, ms/2, ms−ε, ms match the formula and the last is 0.
- [ ] Attach the §8 reference GLSL/WGSL and the `overlay-identity` / `juice-pixels` expectations to requests Q-01-1 and Q-11-1. PRD 09 edits neither `WebGL2Device.ts` nor `WebGPUDevice.ts`.
- [ ] After PR 0b-1: `packages/engine/src/agent-api/nodes/game/instanceTransforms.ts` exports the C-37 `NodeHandleExtension<"setInstanceTransforms">` (§7.8) for the instanced kinds created by `instances.*` (`index.ts:2222`), registered from `packages/engine/src/lanes/prd09.ts`. It validates sizes, throws `INSTANCE_NODE_REQUIRED` on non-instanced kinds and `INSTANCE_CAPACITY_EXCEEDED` when `count > capacity`, and writes the node's C-07 `InstanceBufferLike` (accessor via Q-15-2; until then it delegates to the C-37 stub). Tests: unit (`tests/unit/contracts/impl/prd09-instance-transforms.test.ts`: validation and throws, flag-off returns the stub member); browser (`fx-instances.spec.ts`: moving one instance changes pixels at the new position, draw-call count for the node stays 1).
- [ ] `packages/game/src/juice/fx.ts`: FX layer backend A, with an instanced pool per kind (sphere for spark/debris/bubble, quad for dust/ring/streak), preset tables, deterministic seeded bursts, gravity/drag integration on session dt, and capacity per tier (§17). Scene decorator adds the pool nodes at mount with `castShadow:false` and `visible:false`, at `[0,0,0]` scale 1 (§9.1). Per frame: integrate, write `setInstanceTransforms`, set `visible = count > 0`. Unit test: a 24-spark burst integrates deterministically for seed 7; `liveCount` returns to 0 after the longest `life`.
- [ ] `packages/game/src/juice/rumble.ts`: thin adapter over `packages/input/src/Haptics.ts` (which already probes `vibrationActuator.playEffect` and `navigator.vibrate`); maps `{ ms, strong, weak }` to its API, honors the settings toggle, and reports Haptics' `via` in the `juice` evidence section. Unit test with stubbed navigator/gamepad.
- [ ] `packages/game/src/juice/fxParticlePass.ts`: backend B adapter mapping `burst`/`trail` to C-20 `app.effects.burst/trail` (kind names are identical to `AuraVfxKind` for the 10 `GameFxKind`s). Unit test with a fake `AuraAppEffects`: calls forwarded with position/count/seed; `liveCount` read from `app.effects.liveCount`.
- [ ] Courier Rush juice patch: `juice.define({ strike, pickup, deliver, combo })`; removes the DOM strike flash and the `game.effects` pool (`main.ts:113`) with its spawns (`ringShockwave` `:846`, `hitSpark` `:1191`) and `update` (`:1402`), replacing them with `fx.burst`. Shadow-migrated, handed off in Q-14-1.
- [ ] Bank Shot juice patch: `juice.define({ pot, foul, cushion, combo })` with `sports/table` cues, `fx.burst("ring")` at the pocket and a small `hitStop(0.045)` on a pot.
- [ ] Aura Clash juice patch: route its hit-stop to `session.hitStop(…, { actors })`. Replace the app-local spark path in `rendering/HitSparkVfx.ts` with `fx.burst("spark")` only if the scratch-build comparison (§16.1 screening) is not worse; otherwise leave it in the route and note it in the guide for PRD 07/14.

### Phase 4: HUD, shell, touch
- [ ] `packages/game/src/hud/HudKit.ts`: mount once, slot grid with `env(safe-area-inset-*)`, a batched write phase on rAF, and no `innerHTML` after mount (dev assertion that wraps `Element.prototype.innerHTML` setter under `.a3g-hud` in dev builds). Widgets per §7.7 in `src/hud/widgets/*.ts`.
- [ ] `packages/game/src/hud/screenFraction.ts`: compute the union of widget rects ∩ canvas rect / canvas area. Publish it in `hud.snapshot()`. Dev warning when it exceeds `maxScreenFraction`.
- [ ] `packages/game/src/styles/themes/*.css`: 6 theme presets + `plain` as `--a3g-*` custom properties. `src/fonts/` with OFL woff2 Latin subsets (≤ 40 KB each) and `OFL.txt`; `FontFace` loading in the shell before title.
- [ ] `packages/game/src/shell/GameShell.ts` + `screens/{Loading,Title,Pause,Settings,Results,About,ContextLost}.ts`: layers per §6.2. Keyboard/gamepad/touch navigable menus (roving tabindex, `aria-modal`, focus trap, Escape closes). Loading progress from resolved asset promises. Title doubles as the audio unlock.
- [ ] `packages/game/src/shell/transition.ts`: overlay fade out → run → `await runtime.firstPresentedFrame()` → fade in. Test that no frame is presented with the overlay transparent between `setScene` and the first new frame (browser test).
- [ ] `packages/game/src/shell/contextLoss.ts`: subscribe to `app.onDeviceLost` → session `context-lost`, HUD hidden, ContextLost menu; `app.onDeviceRestored` → close menu, stay paused until the player resumes; after 3 s without restore, show a Reload button. (The engine already owns `webglcontextlost` handling behind `onDeviceLost`, `WebGL2Device.ts:444`; the shell does not attach its own canvas listeners.) Add `tests/unit/game/context-loss.test.ts` with a fake app whose `onDeviceLost` fires. WebGPU `device.lost` → `onDeviceLost` wiring is request Q-11-2 (PRD 11 file); the WebGPU row of `context-loss.spec.ts` is integrated until it lands.
- [ ] Promote the Aura Clash `src/ui/{TitleScreen,LoadingShell,PauseMenu,ResultsPanel}.ts` patterns into the shell screens (PRD 09 code, written fresh in `packages/game/src/shell/screens/`; the route files are read, not edited). The Clash patch set deletes the app copies once Clash runs on the shell; `CharacterSelect` stays route-local as a custom menu registered through `shell.pause.items`/a route screen hook.
- [ ] `packages/input/src/TouchLayouts.ts`: add `TouchLayoutGenre` entries for `twin-stick`, `aim-drag`, `flight`, `lane-swipe`, `flippers` (existing: `fight`, `race`, `platform`, `:3`), each with button/stick rects in safe-area-relative units and a unit test that all targets are ≥ 48 CSS px at 390×844.
- [ ] `packages/game/src/touch/TouchControls.ts`: presets per §6.11 built on `packages/input/src/VirtualTouchControls.ts` (read-only, PRD 08) and `TouchLayouts.ts`, writing into `GameInputController` actions/axes. Visibility rule; ≥ 48 px targets; hide keyboard-hint elements marked `data-a3g-keyhint`.
- [ ] Pilot HUD/touch patches: Bank Shot `hud.widgets` (score, combo, objective, prompt) with the `tabletop` theme and `aim-drag` touch; Courier (`motorsport` widgets: timer, score, strikes as lives, objective, indicator to drop-off, speedometer; `steer-pedals`); Aura Clash (`fighting`: two meters with ghost, timer, combo at edge, banner ROUND/FIGHT/KO; `dpad-4btn`). The patches delete `courier-rush/src/hud.ts` and the Bank/Clash HUD code and move nav/prose to `about`. The three `packages/game/fixtures/*` carry the same widget lists so `layout.spec.ts` and `touch.spec.ts` run without any route.

### Phase 5: Fleet migration packages
- [ ] For each wave-2 route (rooftop, pulse, neon, gravity, skyline, blockfall), produce `migration/patches/<id>/` and `migration/guides/<id>.md` for §10 steps 1–11, prove them by shadow migration, and file Q-14-1 for the route. The patches specifically delete: rooftop's review pavilion world and its `?debug=animation` hidden-athletes branch (`main.ts:502-536`), keeping the play-mode athlete visibility as-is (if athletes are hidden in play, that is filed as a PRD 06/14 task, not resolved here); pulse's `main.ts:1373-1467` review builders and 15 `art-review/*` probe entries; neon `main.ts:254,688,878` swaps (and either feed `cameraDirector` output into C-22 `app.camera.setPose`/`use` or delete it, `main.ts:1667-1671`); gravity's freightway/`compositionPresentationOverride` (`main.ts:1369,2441-2443`); skyline `__AURA3D_COMPOSITION_PROBE__`/density/ghost capture globals; blockfall's room-node drop and backdrop enlargement (`main.ts:528,628`) and 5 probe globals.
- [ ] For each wave-3 route (aurora, deep, patrol, gallery, siege, mech, vault, turbo), produce, prove and hand off the patch set the same way. Specifically: deep replaces raw `HTMLAudioElement` with `sound`; patrol, turbo, aurora and deep get `sound.engine`/thruster loops with live pitch; turbo removes the `?capture=overview` camera (`main.ts:564`) and the review-only smoothing disable (`main.ts:2826-2830`); mech deletes the "ASSET PASSPORT" panel; gallery removes "Backend rapier / LOS rays" HUD text; turbo and blockfall remove `rapier-physics-proof` imports.
- [ ] Mark `apps/common/src/rapier-physics-proof.ts` `@deprecated` now; delete it in the first PRD 09 PR after `rg -l rapier-physics-proof apps` returns 0 (the blockfall/turbo patches remove the imports).
- [ ] Add `aura3d perf-report --route <id> --telemetry <json>` in `packages/aura3d-cli/src/commands/prd09/perf-report.ts` (C-39), consuming the `perf` evidence section (rAF intervals, never engine fps). Unit test on a fixture telemetry JSON. The route patches delete the 13 `apps/*/scripts/write-performance-report.ts` and their `package.json` scripts and replace them with `aura3d perf-report`.
- [ ] Register the codemods `prd09-capture-branches`, `prd09-audio-wrapper`, `prd09-evidence-globals`, `prd09-perf-script` from `packages/aura3d-cli/src/commands/prd09/codemods/` (C-39 `registerCodemod`, pure `source → code + rows`), with fixture tests under `tests/qr/prd09/codemods/`; the patch sets are regenerated from them when a route's HEAD moves.
- [ ] Run `game-capture-parity.mjs --fail-on-any` over all routes and the look-signature comparison (default vs every scenario vs `?capture=review`, artifact = `look-signature.json` + manifest diffs) in `qr-prd09-routes.yml` against both `main` and the shadow-migrated tree; file Q-12-1 for the same jobs at checkpoint level in `quality-rebuild-capture.yml`. The lint rule needs no switch: it is `error` for each route as soon as PRD 14 applies its patch (§6.4).
- [ ] File Q-14-3 for `games.json` `evidenceGlobal` → `__AURA3D_GAME_EVIDENCE__` and `captureContractMigrated: true` per applied route (readiness already prefers the beacon via C-33).
- [ ] Re-run `route-composition.mjs` on `main` and on the shadow-migrated tree. Every shadow-migrated route must be ≤ 10% evidence LOC. Commit `migration/after.json` with deltas against `baseline.json` (both trees recorded).

### Phase 6: Removal and tool migration
- [ ] Migrate `tools/showcase-library/{route-gates,route-primary-probes,showcase-game-release-gates,game-play-probe,game-viewport-probe,game-mobile-touch-audit}.mjs` to the beacon + evidence channel, falling back to the legacy globals for routes not yet applied. Remove `legacyGlobals` support from `@aura3d/game` once `rg` finds no consumer in `tools/` and `tests/`; the per-route `legacyGlobals` option lines are removed by a final patch in each route's Q-14-1 set.
- [ ] Remove deprecated `game.hud`, `game.accessibility`, `game.evidence` and `game.touchControls` from `agent-api/nodes/game/index.ts` (carved from `index.ts:8250, 8280-8306`) after `A3D_QR_GAME` has been `default-on` for two checkpoints and `rg "game\.hud\.|game\.accessibility\.|game\.evidence\(|game\.touchControls\(" apps packages/create-aura3d` returns 0. Update `tools/public-api-contract`.
- [ ] Template patches for `packages/create-aura3d/templates/{mini-game,racing-starter,falling-blocks-starter,fighting-game,character-controller}` on `createGame` with sound cues from `game-sfx-core`, `juice.define` events, a HUD theme and a touch preset, proven in `qr-prd09-game.yml` by generating each template into a scratch directory and asserting 0 capture branches and 0 synth cues; hand off as Q-13-1 with facts `F-09-*` (C-40).

## 15. Test requirements

All browser and GPU tests run remotely on **GitHub Actions `macos-14`** (ANGLE Metal, per policy and
the existing `quality-rebuild-capture.yml`). Never use local browsers, and never use SwiftShader
(ubuntu) for visual gates (research 14 §3.9). Unit tests run with `vitest` (`pnpm test:unit`,
`maxWorkers=2`), and they may run on ubuntu runners.

Workflows: `qr-contracts.yml` (PRD 15) runs typecheck, lint, unit and the C-24/C-25 conformance suites on every
PR; PRD 09's lane workflows `qr-prd09-game.yml` (unit + browser on fixtures, capture-parity, size-limit) and
`qr-prd09-routes.yml` (shadow migration, divergence and look-signature captures, scratch-build vision
screening) run on PRs touching PRD 09 paths and nightly against `main`. Both lane workflows use only stubs for
other lanes' contracts unless the flag set says otherwise; a run with `qr_flags=all` is recorded but never gates.

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

Browser (Playwright on macos-14, `tests/browser/game-shell/*.spec.ts`, run by `qr-prd09-game.yml` against the
`packages/game/fixtures/*` reference games and by `qr-prd09-routes.yml` against shadow-migrated pilot routes,
served from the workflow on `localhost`). **Deterministic clock rule:** every pixel- or timing-sensitive spec
loads the route with `?scenario=<name>&freezeAt=<t>&evidence=1` and drives time through a test-build
hook `window.__AURA3D_GAME_TEST__.stepFrames(n, dt = 1/60)` that advances the session clock by exactly
`dt` and calls `app.step(dt)` once per frame, then awaits `firstPresentedFrame`-style presentation
before reading pixels. Real rAF timing is never used for these assertions, because measured runner
fps is 0.5–60 (§1) and a 200 ms envelope could otherwise fall between two frames. The hook is
compiled only when `import.meta.env.MODE === "test"` and its absence in production builds is asserted
by `layout.spec.ts` (`window.__AURA3D_GAME_TEST__ === undefined` on the production bundle).
- `overlay-identity.spec.ts`: render the table fixture and benchmark `18-game-scene` through `createGame` with
  juice idle (overlay amounts 0) vs juice disabled, on WebGL2 and on WebGPU (Chromium with WebGPU enabled). Max
  per-channel abs diff = 0 on the canvas readback and on the page screenshot (the C-05 stub's DOM element
  must be absent or fully transparent at zero). With C-05 real the same spec covers the shader path (integrated).
- `fx-instances.spec.ts`: moving one instance of an instanced node via `setInstanceTransforms`
  changes pixels at the new projected position and not at the old one; the node's draw count stays 1
  (`app.diagnostics()` draw-call counter).
- `audio-dsp.spec.ts`: the OfflineAudioContext DSP assertions listed under Sound DSP above.
- `juice-pixels.spec.ts`: frozen scenario (static frame), then `juice.flash("#ffffff", { peak: 0.6, ms: 200 })`
  at frame N, stepping 1/60 s per frame. Frame N+1 mean luma (Rec. 709, 8-bit, full canvas)
  increases by ≥ 25 over frame N. Frame N+13 (≥ 200 ms later, envelope exactly 0) has max per-channel
  abs diff = 0 versus frame N. Standalone: run on the C-05 stub (DOM path; the screenshot is a page screenshot,
  not a canvas readback) and with `shell.overlay: "dom"`. Integrated: the same assertions on a canvas readback once
  `setOutputOverlay` returns no `reason` (C-05 real, PRD 01). `fx.burst("spark", p, { count: 24 })` → frames N+1…N+6 have ≥ 0.15% of canvas pixels within
  ΔE2000 < 12 of the spark color inside a 120 px radius of the projected point.
- `hitstop.spec.ts`: fighter fixture scenario "light-hit" (and the shadow-migrated Aura Clash), stepping 1/60 s per frame → after contact,
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
  closes and state is `paused`; with restore withheld for 3 s, a Reload button is visible. WebGL2 is
  standalone; the WebGPU variant (`GPUDevice.destroy()` to force `device.lost`) is integrated until Q-11-2 lands.
- `layout.spec.ts`: desktop 1920×1080, 1280×720 and mobile 390×844 → canvas ≥ 95% viewport area on
  desktop and ≥ 70% on mobile portrait (excluding the safe area). HUD fraction ≤ 0.15 / 0.22. 0
  banned tokens in `document.body.innerText` while `state === "playing"`.
- `touch.spec.ts` (mobile emulation, `hasTouch: true`): each pilot's capture playbook completes using
  touch events only.
- `capture-parity.spec.ts`: for each fixture and each shadow-migrated route, `@aura3d/game/capture`
  `lookSignature(game)` at the default URL equals the signature at each `?scenario=` URL and at `?capture=review`.
  When CCR-09-1 has merged, the same check also runs on `app.lookSignature()`.
- `audio-live.spec.ts`: after a gesture, the AudioContext is `running`, `sound.proof()` shows ≥ 1 voice
  on cue, provenance all `sample`, and a master limiter is present. Courier: `setRpm` changes the live
  `playbackRate.value`.

## 16. Visual acceptance tests

### 16.1 Standalone acceptance (this lane alone, with stubs; gates PRD 09 merges and `standalone-accepted`)

Evaluated in PRD 09's own CI on the `packages/game/fixtures/*` games and on shadow-migrated pilot routes (§10),
with `A3D_QR_GAME` on and every other lane flag off (stubs). All are engineering or non-visual gates; none is a
visual-quality or three.js-parity claim.
1. C-24 and C-25 conformance suites green for `stub` and `real`; `prd09-*` impl tests green.
2. Capture contract: `game-capture-parity.mjs --fail-on-any` = 0 for every shadow-migrated route (0 ART,
   FRAMING, TRANSIENT, UNKNOWN); `@aura3d/game` look signatures equal across default / every scenario /
   `?capture=review`; the lint rule reports 0 on every patched route source.
3. Beacon: the capture harness reaches readiness through `window.__AURA3D_GAME__?.state === "playing"` on every
   fixture and shadow-migrated pilot (C-33).
4. Shell: canvas ≥ 95% desktop / ≥ 70% mobile-portrait viewport; HUD fraction ≤ 0.15 desktop / ≤ 0.22 mobile
   (passed explicitly per viewport, §7.0); 0 banned debug tokens in `document.body.innerText` and in OCR of the
   4 shots; no blank frame between `setScene` and the first new frame (`shell-flow.spec.ts`).
5. Sound: 100% `sample` provenance on pilots; master-chain, panning, occlusion and engine-loop DSP assertions
   (§15); a named human (not the implementer) scores `sound_audio` ≥ 6 on each pilot scratch build (2 min,
   headphones, `audio.webm`).
6. Feel plumbing: `juice-pixels.spec.ts` on the DOM path (C-05 stub), `fx-instances.spec.ts`, `hitstop.spec.ts`,
   `overlay-identity.spec.ts` green; on each impact pilot the action shot shows FX coverage ≥ 0.15% of canvas
   near the event or a flash luma delta ≥ 15.
7. `loading_transitions` ≥ 7 by a named human on each pilot scratch build (designed loader/title, no step-before-
   mount empty frame).
8. Performance: §17 budgets for PRD 09 systems hold on the fixtures; per-pilot rAF p50 no worse than baseline
   +0.5 ms at equal canvas size.
9. Vision **screening** of the pilot scratch builds with the research 21 rubric is recorded in
   `evidence/prd09/<id>/review.md`. It is informative only and cannot pass or fail the lane.

### 16.2 Integrated acceptance (checkpoints only; never blocks)

Evaluated at CONTRACTS §7 G-PANEL rounds (IC-4, IC-8, IC-12, …) on the routes PRD 14 has applied, with
`A3D_QR_GAME` on inside `qr_flags=all`. A miss becomes a `qr-ic-regression` issue and keeps `A3D_QR_GAME` from
`integrated-accepted`; it never holds a PRD 09 merge. Criteria that depend on other lanes' real implementations
(in-shader juice via C-05, particle-pass FX via C-20, route camera feel via C-22, WebGPU context loss via C-29) are
evaluated here only.

Reference and judgment method: the `21-game-vision-judgment.md` rubric (same categories and
calibration prompt, same Kiro Prism vision model run, 3 desktop shots + 1 mobile shot from the
`quality-rebuild-capture` workflow at the default URL), **plus** the human judges of the G-PANEL round (C-32:
2 humans + 1 vision model, median is the score of record) scoring the
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

Tiers come from C-27 `app.quality.tier` (PR 0a data is real; `"auto"` resolves to `high` on desktop and
`medium` on `(pointer: coarse)`; routes may pass `low` explicitly for phones). Numbers are budgets for
**this PRD's systems only**, measured at 1920×1080 on the macos-14 runner (Apple M1 virtual,
ANGLE Metal) and on the mobile devices in §19. They are not frame totals. Rows that depend on another lane's
real implementation (in-shader overlay) are checked at integration checkpoints; all other rows are standalone.

| Budget | Low | Medium | High | Ultra |
|---|---|---|---|---|
| GPU: juice overlay via C-05 stub (DOM, compositor) | 0 | 0 | 0 | 0 |
| GPU: juice overlay, C-05 real WebGL2 (in OutputPass, active frames; integrated) | 0 (DOM forced) | ≤ 0.08 ms | ≤ 0.12 ms | ≤ 0.15 ms |
| GPU: juice overlay, C-05 real WebGPU (extra pass, active frames only; integrated) | 0 (DOM forced) | ≤ 0.25 ms | ≤ 0.3 ms | ≤ 0.3 ms |
| CPU: `setInstanceTransforms` via C-37 stub path (p95, all live kinds) | ≤ 0.30 ms | ≤ 0.40 ms | ≤ 0.60 ms | ≤ 0.80 ms |
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
  separately and attributed to C-27 tier pixel-ratio policy.
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
- Real devices (standalone: Phase 4 on preview deploys of the pilot scratch builds and fixtures; integrated: each
  applied route at its next G-PANEL round): iPhone 13 or newer (iOS Safari 17+) and a mid-range
  Android (Pixel 6a/7 class, Chrome stable). No device farm exists in the repo today. Use AWS Device Farm
  (only region `us-west-2`) remote-access sessions on the `auraone-production-operator` profile, set up
  through `/Users/gurbakshchahal/AuraOne/scripts/setup-auraone-shared-aws.sh`; the deployed preview URL of
  each migrated route is opened in Safari/Chrome on the device and the checks below are run by the
  named human reviewer, with a screen recording saved to `evidence/prd09/<id>/device-{ios,android}.mp4`.
  If Device Farm is blocked (IAM deny such as `devicefarm:CreateRemoteAccessSession`), record the exact
  action, resource and profile plus the minimal grant, and keep the PRD's mobile completion criterion
  open. Do not substitute emulation.
- Mobile checks: audio unlock from the title tap (iOS mute-switch caveat documented in the settings
  hint), touch target size ≥ 48 px, HUD ≤ 22%, no keyboard hints visible, pause on app switch, and
  resume without an audio glitch.

## 20. Screenshots and evidence required

Per shadow-migrated route and per fixture, committed under the lane-owned
`docs/project/aura3d-quality-rebuild/evidence/prd09/<id>/` (standalone; JPEG ≤ 1100 px for review, full PNGs as
workflow artifacts with SHA-256 in `report.json`, plus the scratch-build commit and capture run id). After PRD 14
applies a route, the same set for the applied route is captured at checkpoints into PRD 14's
`evidence/games-after/<id>/` (integrated; PRD 09 does not write there):
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

**Lane complete (`standalone-accepted`, PRD 09 alone):** all §16.1 items pass in PRD 09's CI; every task in §14
is checked; patch sets and guides exist for all 18 routes (or the PRD 14 portfolio) and pass shadow migration;
every §12.3 request is filed with its attachment; facts `F-09-*` are in CONTRACTS Appendix B.

**Program complete for PRD 09's scope (integrated, evaluated at checkpoints; never blocks the lane):**
1. All 18 routes (or the PRD 14 portfolio, if Orbital Defense is deleted) run on `createGame` (PRD 14 applied Q-14-1).
2. `game-capture-parity.mjs --fail-on-any` exits 0 on `main` for every route (0 ART, FRAMING, TRANSIENT and UNKNOWN branches). The ESLint
   capture rule is `error`. Look signatures are equal across default/scenario/`?capture=review` for
   every route.
3. 0 synth-provenance cues in any route outside an explicit allowlist. The default oscillator cue
   no longer exists. `playPositional` produces real panning (browser test).
4. Every route's evidence share is ≤ 10% of classified LOC. The 16 audio wrappers, 13 perf scripts,
   `build-sfx.mjs` scripts, `rapier-physics-proof.ts` and all route `publishEvidence` blocks are deleted.
5. The §16.2 per-game thresholds are met on the default-URL captures at a G-PANEL round (vision model
   **and** human judges, C-32). Fleet medians are met.
6. The §17 budgets hold on the macos-14 runner and on both real mobile devices.
7. Templates (PRD 13, Q-13-1) generate games on `createGame` with sampled sound and visible juice.
8. A reviewer shown the shipped play frames answers "yes" to: *does this look and feel like a
   competitive modern browser game in its genre?* for the PRD-09-owned aspects (HUD, flow, sound,
   feedback, mobile layout). A green CI run alone does not satisfy this criterion.

## 22. Rollback considerations

- Lane kill switch: `A3D_QR_GAME` off (or `?a3d-qr=-game`) resolves `createGame` to the C-24 stub and
  `createGameAudio` to today's path for every app at once; sub-flags `A3D_QR_GAME_SOUND` / `_SHELL` roll back
  sound or shell alone. Flag-off behaviour is unchanged by every PRD 09 merge (CONTRACTS §6.1).
- Route application is PRD 14's PR per route; rollback is `git revert` of that PR by PRD 14. The engine
  keeps `createGameApp`, and the deprecated shims stay available until Phase 6, so a reverted route
  still builds. PRD 09's patch sets stay in `migration/` and can be re-applied.
- Juice overlay kill switch: `createGame({ shell: { overlay: "dom" } })` forces the DOM path. C-05's zero-overlay
  identity means an idle overlay is bit-identical either way.
- Sound: if `GameSoundEngine` regresses on a browser, `createGame({ sound: { engine: "legacy" } })`
  routes through the pre-PRD `createGameAudio` path (kept until Phase 6, with real panning off).
- FX layer: `fx: false` disables the pool for a route. Juice events then fall back to sound + flash.
- Capture contract: rollback is **not** allowed to reintroduce look-changing branches. If a route
  looks worse after deleting review branches, the fix goes to PRD 14 (art/camera, Q-14-2). The lint rule
  stays at `error` for applied routes.
- Evidence: `legacyGlobals` let old gates run during rollback windows. Gates removed in Phase 6 are
  not restored. They measured liveness, not quality (research 14 §3.9).

## 23. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Deleting review branches makes the published screenshots visibly worse (the review look was tuned brighter/closer) | High | Stakeholder pushback, perceived regression | Expected and honest. Each lost improvement is filed as a PRD 14 task with the review value as a hint; before/after contact sheets are published together |
| Route cameras bypass `app.camera`, so C-22 shake/punch layers have nothing to act on and juice looks incomplete | Medium | Feel scores stall below 6 | Flash/hit-stop/FX/sound ship first; juice reports `shake: "not-applied"` honestly instead of faking it; route patches move cameras to `app.camera`; camera feel quality is integrated (C-22 real) |
| Migration patches drift as PRD 14 edits routes, so a handed-off patch no longer applies | High | Re-work, delayed integrated results (never a PRD 09 block) | Patches are regenerated from the `prd09-*` codemods against the current HEAD nightly in `qr-prd09-routes.yml`; Q-14-1 always links the latest passing patch set |
| A CCR (CCR-09-1..5) is declined | Low | Package types and contract diverge | Package types extend the contract, so callers of the contract type are unaffected; a declined item is dropped or becomes a `C-24v2` per CONTRACTS §6.4 |
| Shadow-migration evidence differs from the applied route (PRD 14 also changes art in the same PR) | Medium | Standalone pass, integrated miss | Integrated results are attributed per lane by leave-one-out; PRD 09's scratch-capture run id is kept with each hand-off |
| Sample licensing/procurement for engine RPM layers and announcer lines | Medium | Vehicle games stay on weak engine audio | Kenney/CC0 first; budget for a royalty-free pack with web-redistribution terms; record licenses per file; no unlicensed admission |
| Safari audio quirks (gesture unlock, Opus decode, MediaElement streaming) | Medium | Silent games on iOS | Title-screen gesture unlock, decode-probe format choice, WebKit browser tests, real-device check |
| Full-bleed canvas raises pixel count and lowers fps on already-slow games | High | 5–15 fps games get slower | C-27 tier pixel-ratio caps; shell measures and reports; letterbox option; perf exit criterion compares at equal canvas size |
| 340 existing tools depend on route globals | High | Broken CI gates mid-migration | `legacyGlobals` for one release; inventory consumers with `rg "__[A-Z_]+__" tools tests` in Phase 0; migrate in Phase 6 |
| Look signature misses a look-relevant field, so divergence slips through | Low | Fake parity returns | Signature built from the normalized bridge input; lint + static audit are independent layers; test that each look field changes the hash |
| HUD themes become a new generic look across all games | Medium | Games read as one template | Themes are token sets; per-route token overrides; PRD 14 art direction owns the final choice per game |
| Evidence pull model changes timing that gates relied on (e.g. per-frame counters) | Low | Flaky probes | Beacon frame counter at 4 Hz; harness waits on `state` not counters |
| Removing the oscillator default breaks third-party/user code with asset-less cues | Low | Runtime error | Clear error message naming the fix; changelog; templates updated in the same PR |
| Juice stays on the DOM overlay because C-05's in-shader overlay is not real yet | Medium | Flash/vignette composited in sRGB over the canvas, slightly different curve | DOM path is honest and visible in page screenshots; it has its own pixel test; Q-01-1 carries the reference shader; the shader path is an integrated criterion only |
| `setInstanceTransforms` real path waits on Q-15-2 | Medium | FX pool update costs more CPU on the stub path | Stub is still 1 draw per kind; its CPU cost has its own §17 row; explicit degraded mode (≤ 16 nodes per kind) with re-measured draw budget if instancing fails |
| Deterministic test hook (`__AURA3D_GAME_TEST__`) leaks into production | Low | A new debug global ships to players | Compiled only in `MODE === "test"`; `layout.spec.ts` asserts it is absent from the production bundle |

## 24. Explicitly out of scope

- Renderer, lighting, IBL, shadows, materials, tone mapping, AA, DPR policy (PRDs 01–04, 11). This PRD
  adds no shader; the juice overlay is consumed through C-05.
- Camera rig math, damping, shake/punch application, loop interpolation, render-once-per-rAF (PRD 08).
  This PRD consumes them through C-22/C-23.
- Particle/flipbook/trail rendering pipeline and additive blending (PRD 07). This PRD ships backend A
  and the spawn API; backend B delegates to C-20.
- Writing route or template source (PRDs 14, 13). This PRD ships patches, codemods and guides.
- Per-game art, environment, assets, camera framing choices, and which games survive (PRDs 05, 10, 14).
- Agent skill and template content beyond adopting `createGame` (PRD 13).
- Final package/subpath layout and the 340-tool consolidation (PRD 15, PRD 12).
- Physics feel (vehicle slip model, platformer acceleration). Research 10 §6 is PRD 08/14.
- Networking/multiplayer, cloud saves, accounts, leaderboards beyond local `best` storage,
  localization beyond a single shell string table, analytics.





