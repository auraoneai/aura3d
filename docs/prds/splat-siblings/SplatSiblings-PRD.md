# SplatSiblings-PRD: five new Splat-style casual games (Aura3D 5.0.3)

Execution Policy: Authorized for immediate autonomous product code implementation (CODE_COMPLETE_GO).

- Status: ready for execution
- Date: 2026-11-07
- Target: `@aura3d/engine` **5.0.3** (tag `v5.0.3` = `f73a2bfaf`, contained in `origin/main` and `release/5.0.3`). The authoring checkout was a detached worktree at `c0158f2fa` (5.0.2 base + 4 render-gate commits); every version-sensitive claim below was re-verified against `v5.0.3` via `git show`/`git diff HEAD v5.0.3`. Execute on a checkout that contains `v5.0.3`.
- Slate: **Shape Shift Sprint**, **Number Surge**, **Splat Turf**, **Polarity Orbs**, **Beat Hopper** — five original games modeled on the Splat Rush formula (`examples/splat-rush-port/`), not ports of any existing title.
- Stable denominator: **8 work packages (WP-1 … WP-8)**. Frozen at authoring; executing agents must not add or remove work packages or checkboxes.

**Anti-loop contract (binding during execution):** this PRD is a read-only engineering blueprint while it is being executed. Do not edit/commit this file to tick checkboxes or append run logs. Never call external LLM/critic reviews mid-execution. Bound any failing-test fix to 2 targeted attempts; classify pre-existing/flaky/environment failures and report them honestly instead of expanding scope.

---

## 1. Executive summary and autonomous decisions

### 1.1 Objective

Build five new casual 3D browser games as siblings of Splat Rush: one-input, auto-forward, bright toon 3D, session scoring with combo/multiplier and a persisted best score. Each changes the core decision (shape fit, arithmetic choice, paint coverage, polarity flip, rhythm timing) so the slate does not duplicate the portfolio's existing obstacle/lane runners (cloud-runner, cross-hop, ninja-runner, serpentine-sky-run). All five ship as self-contained showcase apps with pure deterministic sims, a shared runner kit extracted from Splat's presentation layer, unit suites, remote browser specs, and full site registration.

### 1.2 The five games (approved scope, do not substitute)

| # | Title | slug | Core decision | Fail state |
| --- | --- | --- | --- | --- |
| 1 | Shape Shift Sprint | `shape-shift-sprint` | Steer into the wall hole matching your current shape; morph tokens change your shape | 3 lives, wrong hole = −1 |
| 2 | Number Surge | `number-surge` | Steer through the better arithmetic gate to grow your number; smash boss walls | number ≤ wall HP at a wall |
| 3 | Splat Turf | `splat-turf` | Maximize road paint coverage over a 1200 m run; solvent/erasers wipe work | paint tank ≤ 0 |
| 4 | Polarity Orbs | `polarity-orbs` | Tap to flip polarity; collect matching orbs, dodge opposite | 3 lives, wrong orb = −1 |
| 5 | Beat Hopper | `beat-hopper` | Hop/duck on a 132 BPM obstacle grid with PERFECT/GOOD timing windows | 3 lives, missed obstacle = −1 |

Build order: **WP-2 Shape Shift Sprint first** (smallest delta from Splat; validates the runner kit), then the other four in any order.

### 1.3 Autonomous decisions (resolved from repo conventions; zero ambiguity left for the executor)

- **D1 — App layout:** originals follow the self-contained pattern of `apps/showcase-cross-hop/` (own `src/`, `index.html`, `package.json`, `vite.config.ts`, `scripts/write-route-health.mjs`), **not** the `examples/<slug>-port/` + thin-wrapper port pattern. No `-port` suffix, no `tools/showcase-port-pages/names.json` entry (that registry is ports-only). Public URL: `/apps/showcase-<slug>/`.
- **D2 — Shared code:** generic Splat presentation modules are **copied** (not moved) into a new `examples/shared/runner-kit/`. `examples/splat-rush-port/` and `apps/showcase-splat-rush-port/` are **not modified** — its reference-replay tests must stay green. Apps may import `examples/shared/` relatively (port wrappers already import examples); examples must never import from `apps/` (5.0.3 rule, commit `e458fd7d6`).
- **D3 — Sim architecture:** every game has a pure `src/sim.ts` (no DOM, no engine, no three.js imports) with a seeded counted RNG, fixed 1/60 s steps driven by `createFixedStepLoop`, scripted-input `replay()` determinism, and object pools sized from the sim's measured peak. These are originals: verification class is `playable` (like cross-hop), **not** `replay-verified` (no external reference run exists).
- **D4 — Assets:** procedural geometry only (`geometry.dynamic`, `texture.canvas`) plus the licensed **GT Walsheim Bold** font copied with its provenance from `examples/splat-rush-port/assets/`. No Meshy generation (owner-gated; pool credits exhausted), no catalog GLBs, no external URLs.
- **D5 — Audio:** `@aura3d/engine/audio` synth kit (`createCueBank`, `createStepSequencer`); cues derived from sim-state diffs (`diffSounds(prev, next)` pattern), never fired from the sim; silent until first user gesture; mute persisted per game.
- **D6 — 5.0.3 shell requirements:** splash has the `createLoadingProgress` readiness bar (`examples/shared/loading-progress.ts`) under PLAY NOW with `aria-busy` start button; lab flags come from `examples/shared/lab-flags.ts` (`?backend/?worker/?depth/?gamut`, all off by default); any custom shader using `uTime` gets `.runtime({ id, mutable: true })` or an `app.onFrame(...)` registration (5.0.3 llms.txt rule).
- **D7 — Registration:** one integration owner (WP-7) edits all shared registries; generators are run, never hand-edited (`gen-game-inventory.mjs`, `gen-showcase-index.mjs`, `gen-seo.mjs`).
- **D8 — Claims:** classification `prototype`, claimStatus `bounded`, catalog verification `playable`. Public copy uses genre descriptions only — no trademarked game names, no "same simulation as X" claims, never describe Aura3D as built on three.js. Software-WebGL2 evidence is labelled as such.
- **D9 — Hosting:** Cloudflare Pages is the canonical production host (repo AGENTS.md). No Vercel deploys. Deployment happens only on explicit user request (Phase B).
- **D10 — Look identity:** each game gets its own palette, sky treatment and signature effect (§6.3) so it reads as a distinct game next to Splat and its siblings (`look-identity` game check; Phase B sibling distinctness judging).
- **D11 — Versions:** new app `package.json` version `5.0.3`, dependency `"@aura3d/engine": "workspace:*"`, private, type module.
- **D12 — QA surface:** `installQaHooks("<key>", …)` → `window.__AURA_<KEY>__` with the same extras contract as Splat (`stepFrames`, `runAutopilot`, `replay`, `frame`, `pixels`, `reset`, `diagnostics`, `routeHealth`, `nodeCount`); query params `seed, manual, autostart, autopilot, warmup, dpr`; per-game autopilot for attract mode and tests.

## 2. Current codebase state (grounding)

### 2.1 The Splat reference implementation

- `examples/splat-rush-port/sim.ts` — pure sim: `CONFIG` (:16), `SplatRushSim` (:121), gate-row spawner (:248, exactly one matching gate per row), nearest-gate row resolution (:373-385, audit fix C16), power-ups (:439-459), phases `splash/playing/bursting/gameOver`, `traceRow()` (:543), `replay()` (:581). Pools: 220 segments / 30 gates / 10 power-ups / 90 particles / 20 splatters (:48).
- `examples/splat-rush-port/main.ts` — boot (:340+): `createAuraApp(canvas, { autoStart:false, resize:true, pixelRatio:{max,min:1}, renderer:{mode:"production",qualityProfile:"production",fallback:"safe-basic"}, output:{toneMapping:"none",dither:false}, scene })`; `createFixedStepLoop({manual, isActive, step, render})`; `installQaHooks` (:513); `createAuraRouteHealthSnapshot` (:520); adaptive DPR (90-frame median >28 ms → `setPixelRatio(1)`); pause on hidden tab; pointer capture steering + keyboard. At 5.0.3 it also wires `createLoadingProgress` and imports shared helpers from `examples/shared/`.
- `examples/splat-rush-port/world.ts` — `Batch` (:300, dirty-range attribute uploads), `Slots` (:421), scrolling-frame trick (vertices written once at `z − scroll`, node moved per frame), sky dome, clouds, contact shadow, `WorldRuntime{update,warm,nodeCount,…}` (:591).
- `examples/splat-rush-port/shaders.ts` — `TOON_VERTEX/toonFragment` (:10/:53), `SKY_*` (:83/:90), `FLAT_*` (:108), `SHADOW_*` (:130), carnival family (:163+). GLSL 300 es via `material.custom`.
- `examples/splat-rush-port/audio.ts` — `createCueBank({cues,noiseSeed,muteKey:false})`, `createStepSequencer(bank,{bpm,step})`, `diffSounds` (:37), `SplatSound{unlock,play,setIntensity,suspend}` (:120).
- `examples/splat-rush-port/{hud,presentation,fx,look,autopilot,rng}.ts` — HUD contrast helpers (:22-35), `drainPopups` (presentation :101, generic over `{seq}`), `ScreenFx` (fx :42), look table + `hexSrgb/hexToLinear/sunDirection` (look :232-247), `GameRng` (rng :9, wraps engine `createCountedRng`).

### 2.2 Engine surface used (all public, no engine changes needed)

- `@aura3d/engine`: `createAuraApp, createAuraRouteHealthSnapshot, createFixedStepLoop, installQaHooks, readQaParams, createCountedRng` (`packages/engine/src/public/index.ts:33`); node builders `camera, effects, geometry, material, scene, texture`; `.runtime({id, mutable:true})` → `app.nodes.require(id)`; `app.camera.setPose`; `app.step(0)`; `app.setPixelRatio`.
- `@aura3d/engine/game`: `warmPrograms` (`packages/game/src/session/warmPrograms.ts:73`), `createFixedStepPresenter` (`packages/game/src/motion/presenter.ts:28`), `runMotionGate` (`packages/game/src/motion/motionGate.ts:44`, re-exported via `shared.ts` → `motion/index`).
- `@aura3d/engine/audio`: `createCueBank, createStepSequencer, noteFrom` + types (`packages/audio/src/synth/index.ts`).
- `examples/shared/` at 5.0.3: `lab-flags.ts`, `loading-progress.ts`, `backend-report.ts`, `exampleHarness.ts`, `visualCheck.ts`.

### 2.3 How a game is registered and built (verified wiring)

- `marketing/scripts/build-showcase-routes.mjs:54-81` — `showcaseRoutes` is a plain string array of app folder names; one Vite build with a rollup input per route; copies `route-health.json` into `marketing/dist`.
- `apps/showcase-index/src/main.ts` — `const apps` entries: `{ id, route, routeHealth, classification, publicShowcase, primaryAssetStatus, primitiveStatus, claimStatus, notes }` (splat entry at :215).
- `tools/site/games.catalog.json` — `games[]` entries: `{ appFolder, previewSlug, url, title, genre, verification, evidenceFolder, text }`; then `node tools/site/gen-game-inventory.mjs` writes `docs/workflows/game-inventory.json` (live = folder exists AND in showcaseRoutes; today `liveGameCount: 25`), and `node tools/site/gen-showcase-index.mjs` regenerates cards/counts.
- `apps/showcase-cross-hop/vite.config.ts` — app config template: inherits root plugins/aliases, own `publicDir`, ports, `build.target es2022`, rollup input `index.html`.
- `apps/showcase-cross-hop/scripts/write-route-health.mjs` — probes `dist/index.html` (`#app` mount, `#hud` root, module script), `public/aura-assets/`, `aura.assets.json`, `src/aura-assets.ts`; prints report, exits non-zero on failure.
- Gates: `node tools/game-checks/run.mjs <slug|--all>` (29 per-game checks incl. fonts, touch-input, fixed-step-presenter, art-direction, look-identity, no-three, no-removed-5-0-apis, counts), `node marketing/scripts/check-site.mjs`, `node scripts/check-route-health.mjs`.
- Tests: unit in `tests/unit/<slug>/` (vitest, node env, root `vitest.config.ts`); browser specs in `tests/browser/<slug>.spec.ts`, **remote only**: `SPECS="tests/browser/<slug>.spec.ts" tools/remote-acr/run.sh`.
- Done-gate doc: `docs/agents/new-game-checklist.md` §3; lessons: `docs/agents/lessons-learned.md`; claims: `docs/agents/claims-and-boundaries.md`.

## 3. Data model, API and interface contracts

### 3.1 Common sim contract (every game)

```ts
// src/sim.ts — pure: no DOM, no engine, no three.js imports.
export const CONFIG = { /* per-game constants, §3.2-3.6 */ } as const;
export type Phase = "splash" | "playing" | "bursting" | "gameOver"; // splat-turf adds "finished"
export interface Input { start: boolean; down: boolean; up: boolean; dx: number; tap: boolean }
export const IDLE: Input = { start:false, down:false, up:false, dx:0, tap:false };
export class <Game>Sim {
  constructor(seed: number);            // counted RNG (runner-kit GameRng)
  readonly o: GameState;                // plain data, all fields serializable
  readonly popups: Popup[];             // { n, seq, text, color, size, at }, seq monotonic, keep last 64
  advance(input?: Input): void;         // one fixed 1/60 s step
  begin(): void;                        // start/restart: resets steering target AND drag state (Splat C4)
  traceRow(index: number): number[];    // fixed column order, exported as TRACE_COLUMNS
}
export function replay(seed: number, warmup: number, inputs: readonly Input[]): { sim, trace };
```

- Steering model (all games): drag `dx` moves a private target `ye` clamped to the lane; `laneOffset += (ye - laneOffset) * min(1, 10*dt)`; keyboard arrows/A/D synthesize `dx`. Restart re-centres (C4). Gate rows resolve once against the nearest gate (C16).
- Camera: chase pose lerped 0.1/frame, look-ahead −10 z; shake on damage; intro ease 2 s. Presentation interpolates via `createFixedStepPresenter` (never feeds interpolated values back into the sim).
- Milestone every 750 score: +100 bonus, gold popup, particle burst, FOV punch (presentation only).
- Persistence keys: `splatSiblings.<slug>.best`, `.mute`, `.motion` (localStorage; guarded try/catch).
- Determinism requirement: `replay(seed, warmup, script)` run twice produces identical traces (integers exact; floats compared at 1e-9). Every gameplay RNG draw comes from the counted stream; presentation randomness (particles jitter, camera shake visuals) must not consume gameplay draws — keep separate streams like Splat's game/library split.

### 3.2 Shape Shift Sprint sim

- `CONFIG`: `SHAPES: ["sphere","cube","cone"]`, lanes `[-2.3,0,2.3]`, `SPEED_INIT 16, MAX_SPEED 29, SPEED_INCREMENT 0.26`, `ROW_SPACING 15` (min 13, −7e-3·distance), `PERFECT_WINDOW 0.55`, `POINTS_GATE 40, POINTS_PERFECT 60`, `MAX_MULT 5, COMBO_PER_MULT 3`, `MAX_LIVES 3`, `SHRINK 0.8, GROW 1.1` (perfect 1.15×, cap 1.6, floor 0.4), `WILDCARD_DURATION 5, X2_DURATION 7`, `MILESTONE 750`. Pools: segments 220, walls 30 (10 rows × 3 holes), tokens 10, particles 90.
- Wall row: one wall with **all three shaped holes**, lane order Fisher-Yates-shuffled per row; exactly one hole matches the player's current shape by construction. Hole hit window `|laneOffset − laneX| < 1.2`; nearest-hole resolution once per row.
- Match: +40 (+60 perfect) ×mult ×(x2?2:1), combo++, grow, speed +0.3 (+0.45 perfect), squash. Mismatch: shield? consume+BLOCKED : −1 life, shrink, combo reset, shake; 0 lives → bursting (1.15 s) → gameOver.
- Tokens (spawn p=0.2 per row, type draw): `morph` (shape ← random different; burst; existing walls keep their holes — the matching hole is always present), `wildcard` (any hole fits 5 s), `shield`, `x2`.
- `GameState` adds: `shapeIndex`, `wildcardTimer`, `shieldActive`, `scoreX2Timer`, `ballScale`. Trace adds entity counts walls/tokens/segments.
- Input: `{start,down,up,dx}` (`tap` unused).

### 3.3 Number Surge sim

- `CONFIG`: `START_NUMBER 10`, gate lanes `[-1.6,1.6]` (2 gates/row, hit window 1.6), `SPEED_INIT 16, MAX_SPEED 29`, `ROW_SPACING 18`, `WALL_SPACING 400` (metres), `MAX_MULT 5, COMBO_PER_MULT 3`, `MILESTONE 750`. Pools: segments 220, gates 24, walls 4, powerups 8, particles 90, shards 40.
- Gate ops (drawn per gate, scaled by distance tier): `+n` (n 5–50), `×2`, `−n`, `÷2` (ceil). Guarantee ≥1 non-negative-op gate per row; result clamped ≥1. Row resolves once against the nearest gate.
- Pick quality: chosen result ≥ alternative result → combo++ (mult = 1+⌊combo/3⌋ cap 5), score += positive delta ×mult; worse pick → combo reset, no life loss.
- Boss wall every 400 m: `HP = 40 + 30·wallsPassed + floor(rng·20)`. `number > HP` → smash: `number −= HP`, `score += HP·10·mult`, `biggestSmash = max(...)`, shard burst. Otherwise: shield? consume, wall breaks, no bonus : bursting → gameOver.
- Power-ups: `+25` number, `×2` number, `shield`, `x2` score 7 s.
- `GameState` adds: `number`, `wallHp`, `wallsSmashed`, `biggestSmash`, `shieldActive`, `scoreX2Timer`. Ball number repainted via `texture.canvas` only when the value changes. Results card shows score, distance, walls smashed, biggest smash (persisted).

### 3.4 Splat Turf sim

- `CONFIG`: `RUN_LENGTH 1200` (m), `SPEED_INIT 16, MAX_SPEED 24, SPEED_INCREMENT 0.2`, grid 6 columns × 1 m rows, `TANK_MAX 100, TANK_DRAIN 0.06/m`, `CAN_REFILL 35`, `SOLVENT_PENALTY 20`, `ERASER_PENALTY 15`, `ERASER_WIPE_METERS 15`, `STRETCH_METERS 25, STRETCH_COVERAGE 0.8`, `MAX_MULT 5, COMBO_PER_MULT 2`. Pools: segments 220, cans 8, solvent strips 10, eraser bots 3, particles 90. Grid state: `Uint8Array(1200*6)` in the sim.
- Painting is always on while moving: the cell under the ball paints (deterministic). Coverage = painted passed cells / passed cells. Each passed row scores `5 × paintedCellsInRow × mult`.
- Solvent strip: 1 lane × 10 m, spawns ahead; contact → tank −20, wipes that lane's cells across the strip, combo reset. Eraser bot: pooled lateral mover at fixed z intervals; contact → tank −15, wipes the last 15 m of trail, combo reset. Paint can: +35 tank (cap 100).
- Combo: each completed 25 m stretch with ≥80% coverage → combo++, mult = 1+⌊combo/2⌋ cap 5.
- End: distance ≥ 1200 → phase `finished` → results (coverage %, grade S ≥85 / A ≥70 / B ≥50 / C, score, best coverage persisted). Tank ≤0 → bursting → gameOver (coverage still shown).
- `GameState` adds: `tank`, `paintedCells`, `passedCells`, `coverage`, `stretchProgress`. Trace adds tank/coverage counts. Input: `{start,down,up,dx}`.

### 3.5 Polarity Orbs sim

- `CONFIG`: `POLARITIES: [+1,-1]` (red/blue), lanes `[-2.3,0,2.3]`, `SPEED_INIT 14, MAX_SPEED 26`, `ROW_SPACING 12`, `COLLECT_RADIUS 1.2`, `POINTS_ORB 20`, `MAX_LIVES 3`, `GROW 1.02` (cap 1.6), `SHRINK 0.85`, `MAX_MULT 5, COMBO_PER_MULT 3`, `RAINBOW 5, X2 7, MAGNET 6, MAGNET_RADIUS 3.5`, `MILESTONE 750`. Pools: segments 220, orbs 36, powerups 10, particles 90.
- Row spawn: 3 orbs; 70% mixed (≥1 of each polarity), 30% uniform **opposite** of the player's current polarity (forces a flip). Matching collect: +20×mult, combo++, grow. Wrong contact: shield? consume : −1 life, shrink, combo reset; 0 → bursting → gameOver.
- Flip: `tap` input flips polarity (pointer down+up with total |dx| < 8 px = tap; Space/Enter). Flip has no cooldown but consumes no RNG.
- Power-ups (Splat types drop in unchanged): `rainbow` (both polarities collect 5 s), `shield`, `x2`, `magnet` (matching orbs within 3.5 m slide to the player for 6 s).
- `GameState` adds: `polarity`, `rainbowTimer`, `magnetTimer`, `shieldActive`, `scoreX2Timer`, `ballScale`. Input: full `{start,down,up,dx,tap}`.

### 3.6 Beat Hopper sim

- `CONFIG`: `BPM 132` (`BEAT = 60/132` s), `SPEED_INIT 16, MAX_SPEED 24` (+1 per 8-bar phrase), `PERFECT_WINDOW 0.09`, `GOOD_WINDOW 0.16` (seconds around the ideal action moment), `POINTS_PERFECT 60, POINTS_GOOD 30`, `MAX_LIVES 3`, `MAX_MULT 5, COMBO_PER_MULT 4`, `JUMP_VY 8.5, GRAVITY 22`, `DUCK_HOLD 0.18` (s), `MILESTONE 750`. Pools: segments 220, obstacles 24, particles 90, pulse rings 8.
- Obstacle schedule: seeded per 8-bar phrase (32 beats) on the beat grid; types `gap`/`block` (hop) and `bar` (duck); min spacing 1 beat; density ramps from one per 2 beats to one per beat. Obstacle z derived from beat index × beat duration × speed (deterministic scroll).
- Input: `press` = hop if grounded; hold ≥0.18 s = duck while held; `release` ends duck. Keyboard Space/ArrowUp = press, ArrowDown/S = duck hold. Touch: tap = hop, press-hold = duck. Maps onto `Input{start,down,up,dx,tap}` with `down`→press, `up`→release, `dx` unused.
- Judgement at crossing: correct pose (airborne over gap/block, ducking under bar) and |actionStart − idealMoment| ≤0.09 → PERFECT 60×mult; ≤0.16 → GOOD 30×mult; else MISS → −1 life, combo reset, shake; 0 lives → bursting → gameOver. PERFECT/GOOD increment combo (mult = 1+⌊combo/4⌋ cap 5).
- Music determinism: sim exposes `beatIndex`/`phraseIndex`; `audio.ts` schedules sequencer steps from sim state diffs (never wall-clock), intensity = multiplier via `bank.setMusicLevel`.
- `GameState` adds: `beatIndex`, `pose` (`grounded|air|duck`), `y`, `vy`, `holdT`, `judgement` counters. Trace adds pose/beat fields.

### 3.7 Registration entry contracts (exact shapes)

```jsonc
// tools/site/games.catalog.json → games[] (one per game; example for WP-2)
{ "appFolder": "showcase-shape-shift-sprint", "previewSlug": "shape-shift-sprint",
  "url": "/apps/showcase-shape-shift-sprint/", "title": "Shape Shift Sprint",
  "genre": "platformer", "verification": "playable", "evidenceFolder": "shape-shift-sprint",
  "text": "<one-sentence genre description, no trademarked names>" }
// marketing/scripts/build-showcase-routes.mjs → showcaseRoutes: append the 5 folder-name strings.
// apps/showcase-index/src/main.ts → const apps (one per game):
{ id: "showcase-shape-shift-sprint", route: "/apps/showcase-shape-shift-sprint/",
  routeHealth: "/apps/showcase-shape-shift-sprint/route-health.json", classification: "prototype",
  publicShowcase: true, primaryAssetStatus: "primitive-only", primitiveStatus: "primary-subject-proxy",
  claimStatus: "bounded", notes: "<bounded description + evidence pointer>" }
```

- Genres: `platformer` for shape-shift-sprint, number-surge, beat-hopper; `arcade` for splat-turf, polarity-orbs (inventory genre set: racing/sports/action/platformer/arcade).
- `route-health.json` per app: output of `scripts/write-route-health.mjs` (dist probes: `#app` mount, `#hud` root, module script, `public/aura-assets/` dir, manifest assets ≥1, typegen exists), plus `appId` and `route` fields; committed after a green build.
- QA hook globals: `__AURA_SHAPE_SHIFT__`, `__AURA_NUMBER_SURGE__`, `__AURA_SPLAT_TURF__`, `__AURA_POLARITY_ORBS__`, `__AURA_BEAT_HOPPER__` (via `installQaHooks("shape-shift", …)` etc.).

## 4. File-by-file breakdown

Owner lanes: **K** = WP-1 (kit), **G2…G6** = WP-2…WP-6 (one game each, disjoint), **I** = WP-7 (integration, sole owner of shared registries), **V** = WP-8 (verification/evidence). All paths repo-relative. Every file below is CREATE unless marked MODIFY. No DELETEs.

### 4.1 WP-1 — shared runner kit (lane K)

| File | Exact changes |
| --- | --- |
| `examples/shared/runner-kit/index.ts` | Re-export all kit modules. |
| `examples/shared/runner-kit/rng.ts` | Copy of `examples/splat-rush-port/rng.ts` (`GameRng` wrapping `createCountedRng`; `next()`, `count`). |
| `examples/shared/runner-kit/shaders.ts` | Copy toon/flat/sky/shadow GLSL from `examples/splat-rush-port/shaders.ts` (`TOON_VERTEX`, `toonFragment`, `SKY_*`, `FLAT_*`, `SHADOW_*`); strip Splat-only gate-wobble/carnival variants. Keep the P-01 rolloff above 0.82. |
| `examples/shared/runner-kit/batch.ts` | Extract `Batch` + `Slots` from `examples/splat-rush-port/world.ts:300/:421` as engine-only modules (`geometry.dynamic`, `handle.updateAttribute`, dirty-range flush, scrolling-frame helper `z − scroll`). |
| `examples/shared/runner-kit/popups.ts` | `Popup{ n, seq, text, color, size, at }` + `drainPopups` (from `presentation.ts:101`), monotonic-seq contract. |
| `examples/shared/runner-kit/screen-fx.ts` | Generic `ScreenFx` from `fx.ts:42` (flash, burst reveal, vignette) with injectable event→flash mapping; `flashStrength`, `vignetteOpacity`; reduced-motion caps (flash ≤0.1, no vignette/FOV punch). |
| `examples/shared/runner-kit/hud-utils.ts` | `luminance`, `contrastRatio`, `letterbox` from `hud.ts:22-35`; combo-tube fill helper parameterized by CONFIG. |
| `examples/shared/runner-kit/look-utils.ts` | `hexSrgb`, `hexToLinear`, `sunDirection` from `look.ts:232-247`. |
| `examples/shared/runner-kit/audio-kit.ts` | Thin wrapper over `@aura3d/engine/audio`: `createGameSound({cues, bpm, sequence})` → `{unlock, play, setIntensity, suspend, resume, setMuted}`; silent-until-unlock; shared `AudioContextManager`; state-diff `diffSounds` helper type. |
| `examples/shared/runner-kit/README.md` | One-paragraph module map + the "copied from Splat, Splat untouched" provenance note. |
| `tests/unit/shared-runner-kit/rng.test.ts` | Seeded stream equality + draw counting. |
| `tests/unit/shared-runner-kit/batch.test.ts` | Dirty-range flush correctness; scrolling-frame invariant (entity z − scroll constant). |
| `tests/unit/shared-runner-kit/popups.test.ts` | Seq drain past 64 entries (C2 regression). |
| `tests/unit/shared-runner-kit/hud-utils.test.ts` | Contrast ≥4.5:1 fixtures; letterbox edges. |
| `tests/unit/shared-runner-kit/shaders-compile.test.ts` | Every kit GLSL compiles via glslangValidator (skip if absent, mirroring `tests/unit/splat-rush-port/shaders-compile.test.ts`). |

### 4.2 Canonical per-game file set (lanes G2–G6)

Every game creates exactly this set under its own slug (exact paths enumerated per game in §4.3–4.7). Contents per file:

| File (relative to repo root) | Exact contents |
| --- | --- |
| `apps/showcase-<slug>/package.json` | Name `@aura3d/showcase-<slug>`, version 5.0.3, private, type module, description (§6.1 copy); scripts `dev` (vite 127.0.0.1, unique port), `typecheck` (`tsc -p tsconfig.json --noEmit`), `build` (`vite build`), `evidence:route-health`, `preview`; dep `@aura3d/engine: workspace:*`; devDeps typescript ^5.8.3, vite ^7.3.2. Ports (verified free): G2 5198/4198, G3 5199/4199, G4 5200/4200, G5 5201/4201, G6 5202/4202, `strictPort: true`. |
| `apps/showcase-<slug>/tsconfig.json` | Copy `apps/showcase-cross-hop/tsconfig.json` verbatim (extends `../../tsconfig.base.json`, strict, Bundler resolution, `include: ["src/**/*.ts"]`). |
| `apps/showcase-<slug>/vite.config.ts` | Copy `apps/showcase-cross-hop/vite.config.ts` verbatim, changing only the two ports. |
| `apps/showcase-<slug>/index.html` | DOM shell: `<canvas id="app">`, `#hud` (score, best, combo tube, lives/tank/number per §6.2), `#popups` column, `#splash-screen` (title, instructions, `#splash-best`, `#btn-start` PLAY NOW, `#load-bar` progressbar, settings toggles), `#gameover-screen` (score count-up, per-game stats, `#btn-restart`), `#pause-screen`, `#btn-mute`/`#btn-pause`; safe-area `env()` insets; GT Walsheim `@font-face`; reduced-motion media query; `.no-steer` guard class on UI. |
| `apps/showcase-<slug>/src/sim.ts` | §3.1 common contract + the game's §3.2–3.6 constants/state/spawners/judgement. Pure; exports CONFIG, TRACE_COLUMNS, Sim, replay. |
| `apps/showcase-<slug>/src/meshes.ts` | Procedural builders via `geometry.dynamic` with exact dimensions pinned by unit tests (ball/hole/wall/orb/obstacle geometries per game). |
| `apps/showcase-<slug>/src/look.ts` | Game look table: palette, sky gradient stops, sun direction, signature-effect params (§6.3); uses kit `look-utils`. |
| `apps/showcase-<slug>/src/world.ts` | `buildWorld({sim, aspect, look})` → `{scene, bind(app) → WorldRuntime{update, warm, nodeCount}}`; kit `Batch`/`Slots` for road + entities; sky dome; contact shadow; scrolling-frame uploads; game entity meshes/uniforms. |
| `apps/showcase-<slug>/src/presentation.ts` | `createFixedStepPresenter` wrapper; `SteadyCamera` chase + shake; popup drain; title/results camera poses. |
| `apps/showcase-<slug>/src/hud.ts` | DOM updates only when values change; combo tube; per-game meter (lives pips / number / tank bar / polarity icon / beat pulse); contrast-safe ink via kit `hud-utils`. |
| `apps/showcase-<slug>/src/fx.ts` | Game event→flash mapping over kit `ScreenFx` (match/perfect/flip/smash/wipe/miss colours). |
| `apps/showcase-<slug>/src/audio.ts` | Cue table + `diffSounds(prev,next)`; kit `createGameSound`; per-game BPM (§6.3); milestone arpeggio; mute persistence. |
| `apps/showcase-<slug>/src/autopilot.ts` | Deterministic policy per game (§5 per-game steps); used by attract mode and browser specs. |
| `apps/showcase-<slug>/src/main.ts` | Splat boot pattern: loading bar → buildWorld → createAuraApp (production options + lab flags) → bind → warm → `warmPrograms(app,{maxFrames:6})` → `createFixedStepLoop`; pointer/keyboard input (§3 per game); pause/visibility; adaptive DPR; `installQaHooks`; `createAuraRouteHealthSnapshot(app,{parityIds:[]})`; `window.__AURA_<KEY>__` extras; localStorage best/mute/motion. |
| `apps/showcase-<slug>/src/art/direction.ts` | `defineArtDirection` (`@aura3d/engine/game/art`): id = slug, genre, fantasy, references with licence fields (pattern: `examples/splat-rush-port/art/direction.ts`); drives the art-direction game check. |
| `apps/showcase-<slug>/src/aura-assets.ts` | Typed manifest for the font asset (CLI typegen output shape). |
| `apps/showcase-<slug>/aura.assets.json` | Admission manifest: the admitted font file (same-origin `/aura-assets/…` pathname + sha256). |
| `apps/showcase-<slug>/public/aura-assets/GT-Walsheim-Bold.woff2` | Byte copy of `examples/splat-rush-port/assets/GT-Walsheim-Bold.woff2`. |
| `apps/showcase-<slug>/public/aura-assets/PROVENANCE.md` | Font license/provenance note copied from `examples/splat-rush-port/assets/ATTRIBUTION.md` (font rows only). |
| `apps/showcase-<slug>/scripts/write-route-health.mjs` | Adapt `apps/showcase-cross-hop/scripts/write-route-health.mjs`: same dist probes; manifest threshold ≥1; add `appId`/`route`; exit non-zero on any failed check. |
| `apps/showcase-<slug>/route-health.json` | Generated by the script after a green build; committed. |
| `apps/showcase-<slug>/README.md` | Short: fantasy, controls, mechanics, evidence path, claim label (bounded/prototype). |
| `tests/unit/<slug>/sim.test.ts` | Seeded determinism (double replay identical); scripted run covering start/steer/match/mismatch/power-up/death/restart; scoring/combo/mult/fail-state assertions; pool-exhaustion skip behavior; C4 restart re-centres; C16 single-resolution per row. |
| `tests/unit/<slug>/meshes.test.ts` | Dimensions + vertex counts pinned for every procedural mesh. |
| `tests/unit/<slug>/motion.test.ts` | `runMotionGate` at 60/120/144 Hz over the real loop+presenter (pattern: `tests/unit/splat-rush-port/interpolation.test.ts`). |
| `tests/unit/<slug>/hud-contrast.test.ts` | Every HUD ink/paper pair ≥4.5:1 (kit helpers). |
| `tests/unit/<slug>/shaders-compile.test.ts` | Game `material.custom` GLSL compiles (glslangValidator, skip if absent). |
| `tests/unit/<slug>/audio.test.ts` | Silent until unlock; every sim event maps to exactly one cue; mute persisted. |
| `tests/unit/<slug>/art-direction.test.ts` | `auditArtDirection` (`@aura3d/game/art`) passes over the game's `src/art/direction.ts` + look (pattern: `tests/unit/splat-rush-port/art-direction.test.ts`). |
| `tests/browser/<slug>.spec.ts` | Remote-only header; boots `/apps/showcase-<slug>/?manual=1`; waits QA ready; asserts pixel regions (sky/road/player/entity), frame progression, autopilot scoring, death/gameOver path, scripted replay equality, `routeHealth().status==="ready"`, zero console errors, nodeCount floor; logs JPEG frames (pattern: `tests/browser/splat-rush-port.spec.ts`). |
| `evidence/<slug>/README.md` | Created in Phase A pinning the claim label and capture method; WP-8 appends build SHA, RUN_IDs, viewports, software-GL caveat. |

### 4.3 WP-2 exact paths — Shape Shift Sprint (lane G2)

All §4.2 files with `<slug>` = `shape-shift-sprint`: `apps/showcase-shape-shift-sprint/{package.json,tsconfig.json,vite.config.ts,index.html,aura.assets.json,route-health.json,README.md}`, `apps/showcase-shape-shift-sprint/src/{sim,meshes,look,world,presentation,hud,fx,audio,autopilot,main,aura-assets}.ts`, `apps/showcase-shape-shift-sprint/src/art/direction.ts`, `apps/showcase-shape-shift-sprint/scripts/write-route-health.mjs`, `apps/showcase-shape-shift-sprint/public/aura-assets/{GT-Walsheim-Bold.woff2,PROVENANCE.md}`, `tests/unit/shape-shift-sprint/{sim,meshes,motion,hud-contrast,shaders-compile,audio,art-direction}.test.ts`, `tests/browser/shape-shift-sprint.spec.ts`, `evidence/shape-shift-sprint/README.md`. Game-specific: wall-with-holes mesh (3 hole shapes cut as separate hole rims + wall panels, no CSG), morph-token entity, shape-swap burst; sim per §3.2.

### 4.4 WP-3 exact paths — Number Surge (lane G3)

`<slug>` = `number-surge`: same file set under `apps/showcase-number-surge/`, `tests/unit/number-surge/`, `tests/browser/number-surge.spec.ts`, `evidence/number-surge/README.md`. Game-specific: 2-gate operation panels with canvas-text op labels, boss wall + pooled shard burst, ball number canvas repaint; sim per §3.3.

### 4.5 WP-4 exact paths — Splat Turf (lane G4)

`<slug>` = `splat-turf`: same file set under `apps/showcase-splat-turf/`, `tests/unit/splat-turf/`, `tests/browser/splat-turf.spec.ts`, `evidence/splat-turf/README.md`. Game-specific: paintable cell grid overlay (one batch, per-cell colour attribute), solvent strips, eraser bots, tank HUD bar, coverage results grade; sim per §3.4.

### 4.6 WP-5 exact paths — Polarity Orbs (lane G5)

`<slug>` = `polarity-orbs`: same file set under `apps/showcase-polarity-orbs/`, `tests/unit/polarity-orbs/`, `tests/browser/polarity-orbs.spec.ts`, `evidence/polarity-orbs/README.md`. Game-specific: dual-polarity orbs, flip shockwave ring, magnet attraction streams, tap-vs-drag input discrimination; sim per §3.5.

### 4.7 WP-6 exact paths — Beat Hopper (lane G6)

`<slug>` = `beat-hopper`: same file set under `apps/showcase-beat-hopper/`, `tests/unit/beat-hopper/`, `tests/browser/beat-hopper.spec.ts`, `evidence/beat-hopper/README.md`. Game-specific: beat-grid obstacle scheduler, hop/duck pose state, PERFECT/GOOD judgement rings, beat-pulse world sync, sim-driven sequencer; sim per §3.6.

### 4.8 WP-7 — registration and site integration (lane I, sole owner of these files)

| File | Action | Exact changes |
| --- | --- | --- |
| `tools/site/games.catalog.json` | MODIFY | Append 5 `games[]` entries (§3.7 shapes; titles/genres/slugs per §1.2/§3.7). |
| `marketing/scripts/build-showcase-routes.mjs` | MODIFY | Append 5 folder strings to `showcaseRoutes` (:54-81). |
| `apps/showcase-index/src/main.ts` | MODIFY | Append 5 `const apps` entries (§3.7 shape). |
| `docs/workflows/game-inventory.json` | MODIFY (generated) | Run `node tools/site/gen-game-inventory.mjs`; `liveGameCount` 25 → 30. Never hand-edit. |
| `apps/showcase-index/index.html` | MODIFY (generated) | Run `node tools/site/gen-showcase-index.mjs` (cards + count). |
| `docs/workflows/game-names.md` | MODIFY | Add 5 name rows (title = working title, slug, url). |
| `marketing/scripts/gen-seo.mjs` | MODIFY | Add 5 sitemap map entries (:121 area); regenerate `sitemap.xml`. |
| `scripts/visual-qa.routes.json` | MODIFY | Add 5 routes. |
| `tests/browser/game-luma-targets.ts` | MODIFY | Add 5 luma targets (pattern of existing entries). |
| `tools/real-gpu/scenarios.json` | MODIFY | Add 5 scenarios (owner-run later; entry only). |
| `README.md`, `llms.txt`, `llms-full.txt`, `marketing/index.html` | MODIFY | Update hand-typed game counts 25 → 30 only where the `counts` game check flags them; no other text changes. |
| `marketing/public/previews/showcase-index/<slug>.webp` (+`@2x`) | CREATE (WP-8) | Derived from final screens; placeholders forbidden — WP-7 leaves these to WP-8 and the checks that need them stay phase-2. |
| `vercel.json` | MODIFY (only if required) | Legacy rewrites: touch only if `node marketing/scripts/check-site.mjs` fails without them; canonical deploy remains Cloudflare Pages. |

## 5. Detailed implementation tasklist (phased and parallelizable)

Parallelism: **WP-1 first** (kit). Then **WP-2 … WP-6 fully parallel** (disjoint directories; five lanes). **WP-7** after the five games pass their Phase-A gates (single owner of shared registries). **WP-8** last, parent-coordinated remote runs (one shared runner, never one per lane). Subagents do local edits + scoped local checks only; the parent owns every remote invocation.

### WP-1 — Shared runner kit (lane K)

1. Create `examples/shared/runner-kit/` modules per §4.1 by copying the cited Splat sources and stripping game-specifics; no imports from `apps/` or from `examples/splat-rush-port/` (copies, not references).
2. Write the 5 kit unit test files; run `node_modules/.bin/vitest run tests/unit/shared-runner-kit`.
3. Run `pnpm exec eslint examples/shared/runner-kit tests/unit/shared-runner-kit` and the scoped typecheck (root `pnpm typecheck` covers examples; expect 0 new errors).
4. Verify Splat untouched: `git status --short examples/splat-rush-port apps/showcase-splat-rush-port` is empty; `node_modules/.bin/vitest run tests/unit/splat-rush-port` still passes.

### WP-2 — Shape Shift Sprint (lane G2; first game, validates the kit)

1. Scaffold the app files (§4.3): package.json/tsconfig/vite.config/index.html shell with load-bar.
2. Implement `src/sim.ts` per §3.2 (wall rows with all 3 holes shuffled; morph/wildcard/shield/x2 tokens; Splat scoring/fail rules; C4/C16 fixes baked in).
3. Implement `src/meshes.ts` (ball tri-mesh, wall panels + hole rims, tokens) and pin dimensions in `tests/unit/<slug>/meshes.test.ts`.
4. Implement `src/look.ts` + `src/world.ts` (kit Batch road, walls as pooled batches, sky, contact shadow) and `src/presentation.ts`/`hud.ts`/`fx.ts`.
5. Implement `src/audio.ts` (124 BPM, cues: match/perfect/morph/hit/shield/wildcard/x2/milestone/gameover) and `src/autopilot.ts` (steer to the matching-hole lane; ignore morph tokens unless already aligned).
6. Implement `src/main.ts` (boot/loop/input/QA/route-health; keyboard Space/Enter start, ←/→/A/D steer, M mute, C symbols, P/Esc pause).
7. Admit the font (copy + manifest + typegen shape), write `scripts/write-route-health.mjs`, build, generate `route-health.json`.
8. Write the 7 unit test files + browser spec; run the Phase-A battery (§7.1). Fix kit gaps by editing the kit (lane K handoff note in the final report, not by importing Splat directly).

### WP-3 — Number Surge (lane G3)

Same steps as WP-2 with §3.3 specifics: 2-gate op rows (guaranteed ≥1 non-negative op; result clamp ≥1), pick-quality combo, boss walls every 400 m (HP formula, smash/shield/fail), shard pool, ball-number canvas repaint on change only, power-ups +25/×2-number/shield/x2. Autopilot: evaluate both ops, steer to the better result. Audio 128 BPM; cues pick-good/pick-bad/smash/wall-fail/powerup/milestone/gameover. Results: score, distance, walls smashed, biggest smash (persisted).

### WP-4 — Splat Turf (lane G4)

§3.4 specifics: 1200 m finite run, 6-column paint grid in-sim (`Uint8Array`), always-on trail painting, tank drain/refill, solvent strips + eraser bots (wipe logic), stretch combo, `finished` phase + coverage grade results. World: per-cell colour attribute batch (one draw), wipe flash effect. Autopilot: steer toward unpainted cells, avoid strips/bots. Audio 112 BPM; cues can/solvent/eraser/stretch/finish/gameover. HUD: tank bar + live coverage %.

### WP-5 — Polarity Orbs (lane G5)

§3.5 specifics: tap-vs-drag discrimination (|dx|<8 px on pointerup = tap; Space/Enter flip), orb rows (70% mixed / 30% uniform-opposite), collect/damage rules, rainbow/shield/x2/magnet power-ups, flip shockwave. Autopilot: flip when the next row is uniform-opposite, steer to nearest matching orb. Audio 126 BPM; cues flip/collect/wrong/powerup/milestone/gameover. HUD: polarity icon + lives.

### WP-6 — Beat Hopper (lane G6)

§3.6 specifics: beat-grid phrase scheduler, hop/duck physics, PERFECT/GOOD/MISS judgement, sim-driven music (beatIndex diffs, intensity = mult), beat-pulse world. Autopilot: read next obstacle type/crossing time, act at the ideal moment. Audio 132 BPM 8-step bass + arp layers by level; cues hop/duck/perfect/good/miss/milestone/gameover. HUD: beat pulse + combo; results include perfect/good/miss counts.

### WP-7 — Registration and integration (lane I)

1. Apply every §4.8 MODIFY/CREATE in one lane; run the three generators (`gen-game-inventory.mjs`, `gen-showcase-index.mjs`, `gen-seo.mjs`).
2. Gates: `node tools/game-checks/run.mjs --all` (0 errors), `node marketing/scripts/check-site.mjs`, `node scripts/check-route-health.mjs`, root `pnpm typecheck` (0 new errors vs pre-WP baseline).
3. Confirm `docs/workflows/game-inventory.json` shows `liveGameCount: 30` with the 5 new rows `status: "live"`, `verification: "playable"`.
4. Update hand-typed counts only where the `counts` check flags them.

### WP-8 — Remote verification and evidence (lane V, parent-coordinated; Phase B)

Only when the user requests acceptance/deploy. One shared remote runner context for all five games (never 5 parallel cloud builds):
1. `SPECS="tests/browser/shape-shift-sprint.spec.ts tests/browser/number-surge.spec.ts tests/browser/splat-turf.spec.ts tests/browser/polarity-orbs.spec.ts tests/browser/beat-hopper.spec.ts" tools/remote-acr/run.sh` — all green.
2. Capture final screens per game at 1280×720 and 390×844 (title / early / key-action / mid / results) into `evidence/<slug>/screens/final/`; cards 720×450 + 1440×900; commit via `git add -f`; derive `marketing/public/previews/showcase-index/<slug>.webp` + `@2x`.
3. Complete each `evidence/<slug>/README.md` (build SHA, ACR RUN_IDs, viewports, software-WebGL2 label); re-run `node tools/game-checks/run.mjs --all` to clear the phase-2 screens warnings.
4. `pnpm build && pnpm --dir marketing build`, then `npx @aura3d/cli@latest check-deploy --dist marketing/dist`; deploy to Cloudflare Pages only on explicit user request (repo AGENTS.md command).

## 6. UI/UX and edge-case specifications

### 6.1 Shell copy (per game)

| Game | Splash instruction line | Results stats |
| --- | --- | --- |
| Shape Shift Sprint | "Drag to steer. Fit your shape through the matching hole. Grab morph tokens to switch!" | Score, best, best combo, perfects, distance |
| Number Surge | "Drag to steer. Pick the better gate. Grow your number and smash the wall!" | Score, best, distance, walls smashed, biggest smash |
| Splat Turf | "Drag to steer. Paint the road. Avoid solvent and erasers — watch your tank!" | Coverage % + grade, score, best coverage, cans grabbed |
| Polarity Orbs | "Drag to steer. Tap to flip polarity. Collect your colour, dodge the rest!" | Score, best, best combo, orbs collected, distance |
| Beat Hopper | "Tap to hop. Hold to duck. Ride the beat — PERFECT timing builds combos!" | Score, best, perfects, goods, misses, max combo |

### 6.2 Shell states (all games, inherited from Splat)

- Splash: title, instruction, best score, PLAY NOW + load-bar (button `aria-busy` until first frame ready), settings toggles (reduced motion; colour/shape symbols where applicable), controls hint. Loading failure shows the engine error card, never a blank canvas.
- Playing HUD: score (tnum), best, combo tube, game meter (lives pips / big number / tank bar / polarity icon / beat pulse), popup column (no overlap, CSS-expiry), mute/pause corner buttons respecting `env(safe-area-inset-*)`.
- Pause: P/Esc or hidden tab → overlay + audio suspend + `loop.resetAccumulator()` on resume.
- Game over / finished: 800 ms score count-up, persisted best, solid accent backdrop, gold PLAY AGAIN; keyboard Space/Enter restarts.
- Edge cases: restart re-centres steering (C4); row resolves once (C16); popups drain by seq past 64 (C2); reduced motion follows `prefers-reduced-motion` until toggled (flash ≤0.1, no vignette/FOV punch, no camera shake); slow first 90 frames → DPR 1; WebGL2 unavailable → `render-error` fallback card; all HUD text ≥4.5:1 contrast; GT Walsheim Bold only (no system/Google fonts).

### 6.3 Look identity (distinctness requirement)

| Game | Palette / sky | Signature effect |
| --- | --- | --- |
| Shape Shift Sprint | Candy primaries on cream; per-shape colour coding (sphere red, cube yellow, cone blue); day gradient sky | Morph burst + shape-confetti trail; hole rims glow on match |
| Number Surge | Neon-arcade dusk (deep indigo sky, cyan/magenta gates); number decals | Wall shatter shards + score-geyser on smash |
| Splat Turf | Paint-world carnival: white road, saturated paint, plum ink HUD | Persistent coverage map + solvent wipe wash |
| Polarity Orbs | Dual-tone world halves (warm red / cool blue) that shift on flip | Flip shockwave ring + magnet attraction streams |
| Beat Hopper | Night neon with equalizer skyline | Whole-world beat pulse + PERFECT timing rings |

## 7. Verification and acceptance checklist

### Phase A — CODE_COMPLETE_GO gate (deterministic, local, required)

Per game (repeat for each of the 5 slugs):

- [ ] Every §4.2 file for the slug exists with no TODOs, placeholders or mock stubs; `git status` shows `examples/splat-rush-port/` and `apps/showcase-splat-rush-port/` untouched.
- [ ] `pnpm --dir apps/showcase-<slug> typecheck` — 0 errors.
- [ ] `pnpm exec eslint apps/showcase-<slug> tests/unit/<slug> tests/browser/<slug>.spec.ts` — 0 errors.
- [ ] `node_modules/.bin/vitest run tests/unit/<slug>` — all pass (determinism, mechanics, meshes, motion 60/120/144 Hz, HUD contrast, shaders, audio, art direction).
- [ ] `pnpm --dir apps/showcase-<slug> build` succeeds; `node apps/showcase-<slug>/scripts/write-route-health.mjs` exits 0 and its report is committed as `route-health.json`.
- [ ] `node tools/game-checks/run.mjs <slug>` — 0 errors (phase-2 screens/capture warnings allowed until WP-8).

Kit (WP-1):

- [ ] `node_modules/.bin/vitest run tests/unit/shared-runner-kit` passes; `node_modules/.bin/vitest run tests/unit/splat-rush-port` still passes (Splat untouched).

Integration (WP-7):

- [ ] All §4.8 files updated; generators run; `docs/workflows/game-inventory.json` has `liveGameCount: 30` and 5 new `live`/`playable` rows.
- [ ] `node tools/game-checks/run.mjs --all` — 0 errors; `node marketing/scripts/check-site.mjs` passes; `node scripts/check-route-health.mjs` passes.
- [ ] Root `pnpm typecheck` — 0 new errors vs the pre-execution baseline; hand-typed counts updated where flagged.

### Phase B — post-CODE_COMPLETE_GO acceptance (only on explicit user request; remote-only)

- [ ] One shared remote run: `SPECS="<5 spec paths>" tools/remote-acr/run.sh` — all 5 specs green (pixels, replay, routeHealth ready, zero console errors).
- [ ] Final screens (1280×720 + 390×844 × 5 shots) and cards (720×450 + 1440×900) committed per game; preview webps generated; evidence READMEs pin SHA + RUN_IDs + software-GL label.
- [ ] `node tools/game-checks/run.mjs --all` — 0 errors and phase-2 screens warnings cleared.
- [ ] `pnpm build && pnpm --dir marketing build && npx @aura3d/cli@latest check-deploy --dist marketing/dist` passes.
- [ ] Sibling distinctness: each game's look judged distinct from Splat and the other four (repo `aura3d evidence judge --mode sibling` flow); misses retuned before any public claim.
- [ ] Cloudflare Pages deploy + live smoke (200s on all 5 URLs, render-gate clean) **only if the user explicitly asks to deploy**.

## 8. Out of scope and anti-stall guardrails

- **No engine/package changes** (`packages/**` is read-only for this PRD); no new engine APIs; no `@aura3d/rendering` imports; no three.js runtime imports; never describe Aura3D as built on three.js.
- **No edits to Splat** (`examples/splat-rush-port/`, `apps/showcase-splat-rush-port/`) or to any existing game; kit code is copied, never moved.
- **No Meshy generation or spend** (owner-gated; pool credits exhausted); procedural art + licensed font only. No external asset URLs; assets are same-origin `/aura-assets/` pathnames listed in `aura.assets.json`.
- **No local Playwright, no local Docker, no browsers on this Mac**; browser specs run only via `tools/remote-acr/run.sh`; parent coordinates all remote runs (one shared context).
- **No deployment, npm publish, git push, or production changes** without explicit user request; Cloudflare Pages only when asked (never Vercel).
- **No trademarked names in public copy** (describe genres, not "Count Masters" etc.); claim label stays prototype/bounded + `playable`; no pixel-parity or real-GPU claims from software-GL evidence.
- **No platform SDKs, leaderboards, accounts, or saved cloud state**; localStorage best/mute/motion only.
- **Frozen denominator:** 8 work packages; no new checkboxes, no external critic/LLM review gates, no recursive test expansion; max 2 targeted fix attempts per in-scope failure; pre-existing unrelated failures are reported, not fixed.
- **No status churn:** do not commit run-by-run updates into this or other Git-tracked markdown during execution; report progress in the conversation against the 8-WP denominator.