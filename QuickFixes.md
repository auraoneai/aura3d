# QuickFixes — Required Fixes Before Next npm Push

Source: full review of all changes in the last 36 hours — the 22 commits since `v1.3.2` (last npm publish, tagged 2026-06-08 23:00) **plus** the 3 in-window commits before the tag (`d584fbe7` Studio prompt-driven scene generation, `199ec20d` 1.3.2 release, `f74ebe76` 1.3.1 release), whose code already shipped in 1.3.2.
Review date: 2026-06-09. Repo gates were green at review time (typecheck pass; unit suite 307 files / 1,882 tests pass), but several gates were weakened to get there and the gates do not cover `apps/`.
Working tree: clean (no untracked/uncommitted changes other than this file). One stale stash exists (`stash@{0}` from 2026-05-21, `pre-switch-to-preserve-g3d-v2-execution-state`, touches `examples/` + root `package.json`) — see hygiene section.
Verified clean (no action needed): `199ec20d` release engineering (all 26 public packages at 1.3.2 on npm, no `workspace:*` leaks in published artifacts, Studio bundling paths correct); `Inspector.tsx`, `Stage.tsx`, `mapDocument.ts`/`types.ts`, `backend.ts`, `HitboxSystem.ts` damage values, round-50 evidence JSONs, HDRI manifest hash, `prompt-source-audit.d.mts`, ECS wiring in root/engine `package.json`/`vitest.config.ts`.

Priority legend:
- **P0** — ship-blocker: broken compile, runtime crash, or published-package breakage.
- **P1** — major correctness bug or hollowed-out test gate.
- **P2** — minor bug, docs error, or coverage/hygiene gap.

---

## P0 — Ship Blockers

### `apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts`

The app **does not compile** (verified: `pnpm exec tsc --noEmit` inside the app fails). Root `tsconfig.build.json` excludes `apps/`, which is why repo-wide typecheck stayed green.

- [x] **Fix broken import paths** (TS2307 ×5). The modules live at `src/fighters/` and `src/state/`, one level above `src/playable/`:
  - [x] Line 61: `from "./fighters/ComboSystem"` → `from "../fighters/ComboSystem"`
  - [x] Line 66: `from "./fighters/GuardBreakSystem"` → `from "../fighters/GuardBreakSystem"`
  - [x] Line 71: `from "./fighters/KnockdownRecovery"` → `from "../fighters/KnockdownRecovery"`
  - [x] Line 76: `from "./state/MatchState"` → `from "../state/MatchState"`
  - [x] Line 1658: `import("./state/HitRegistry")` → `import("../state/HitRegistry")`
- [x] **Fix non-existent animation clip keys** (TS2551/TS2339). `AuraClashFighterClipMap` (`src/playable/animation/auraClashClipMaps.ts`) has `hurtHeavy` (camelCase) and **no** `knockdown` key:
  - [x] Line 1689: `defender.clips.knockdown ?? defender.clips.hurt_heavy` → use `hurtHeavy` (and add a real `knockdown` clip to the clip map, or drop the lookup)
  - [x] Line 1717: same fix
  - [x] Line 1812: same fix
- [x] **Fix null-access** (TS18047, from `f3238f38`). Line 1439: `playerAttacking && (player.attack.id === "heavy" ...)` — `player.attack` is possibly `null`; guard it (`player.attack?.id`).
- [x] **Remove double damage application** (reintroduces the bug `62b2baf9` fixed). The engine already subtracts damage (`packages/engine/src/agent-api/GameRuntime.ts:2922`) and `syncFighterFromCombatSnapshot` (line 1654) copies the reduced health onto the fighter *before* `applyEngineCombatEvents` runs. Then lines 1713 and 1720 subtract `scaledDamage` again locally — every hit deals ~2× damage and the inflated value is pushed back into the engine at line 1611 via `combatWorld.setActor(...)`.
  - [x] Delete the local `defender.health = Math.max(0, defender.health - scaledDamage)` mutations at lines 1713 and 1720.
  - [x] If combo damage scaling is wanted, apply it **inside the engine hit resolution** (or pre-scale the damage sent to the engine), not as a second local subtraction. Note: as written, scaling *adds* up to 100% extra damage; the conventional intent is to *reduce* repeat-hit damage — decide and implement the intended curve.
- [x] **Fix inverted wakeup invulnerability.** `startAttack` (line 1576) rejects attacks while `invulnerableTimer > 0`, so the knocked-down victim can't act for ~1.02 s — but nothing checks `invulnerableTimer` when *applying* hits, so they still take full damage. The timer punishes the victim and protects no one.
  - [x] Gate incoming damage in `applyEngineCombatEvents` (or in the engine's `resolveAttack` path) on the defender's `invulnerableTimer`.
  - [x] Remove the `invulnerableTimer > 0` rejection in `startAttack` (or keep only `knockdownTimer` as the act-gate).
- [x] **Make input buffering actually work.** Currently dead code:
  - [x] Lines 1389–1393: buffer expiry is `performance.now() + 120` ms, but hitstun is 340–520 ms + 180 ms recovery — buffered inputs always expire. Raise the buffer window (or start the window when the fighter becomes actionable, not when the input is pressed).
  - [x] Lines 1484–1492: presses during an active attack are never buffered — `bufferInput` only fires on `hitstun/recovery/moveCooldown/ko`, and `ATTACK_COOLDOWN` (0.06 s, `combat/auraClashMoveData.ts:49`) is shorter than attack durations (0.34–0.68 s). Add "mid-attack" as a buffering condition.
- [x] **Wire or delete the imported-but-unused systems** (lines 62–76): `applyGuardDamage`, `recoverGuard`, `maybeApplyKnockdown`, `recoverFromKnockdown`, `createRoundRuntimeState`, `updateRoundWinner`, `RoundRuntimeState` are imported and never called; the logic is re-implemented inline and already drifts from the modules (e.g. `maybeApplyKnockdown` knocks down on `nextHealth === 0`; the inline code at line 1712 does not). Either call the modules or remove the imports — the commit message "wire up ComboSystem, GuardBreakSystem, KnockdownRecovery, MatchState" currently overstates.
- [x] **Pause gate ordering** (lines 867–873): the 2.5 s intermission timer runs before the `paused` check, so pausing during intermission still auto-resets the round and overwrites the "PAUSE" callout with "FIGHT". Move the intermission tick behind the pause gate.
- [x] **Test-driver state reset** (lines 852–860): `queuePlayerAttack`/`setPositions` zero `hitstun`/`moveCooldown` but not `recovery`, `knockdownTimer`, `invulnerableTimer` — all of which now gate `startAttack`. Reset all gating timers so driver-queued attacks don't silently fail after a knockdown.
- [x] **Determinism** (lines 1448–1450, from `f3238f38`): `Math.random()` was added to rival AI intents while the HUD/proof still advertises "deterministic combat replay". Either use a seeded RNG or update the proof/HUD claim.
- [x] **Verification:** `cd apps/aura-clash-showcase && pnpm exec tsc --noEmit` must pass; run the playable smoke spec (`tests/playable-smoke.spec.ts`) and manually verify a hit deals exactly the move-data damage once.

### `packages/create-aura3d/package.json` + `packages/create-aura3d/templates/three-compat-*/` (8 templates)

Published-package breakage: the templates can't ship and a future `dist` rebuild would brick template discovery for **all** templates.

- [x] **`packages/create-aura3d/package.json` (lines ~9–19):** add all 8 `three-compat-*` template directories to the `"files"` array (currently only the original 9 template dirs are listed, so the published npm package omits them).
- [x] **Rebuild `dist/index.js`:** it still contains the old template list (0 occurrences of "three-compat"). Danger: `findDefaultTemplateRoot()` in `src/index.ts` requires `CREATE_AURA3D_TEMPLATES.every(t => existsSync(templates/t))` — if dist is rebuilt with the new list but `files` isn't fixed, the installed CLI never finds a valid template root and falls back to `process.cwd()`, breaking **every** template.
- [x] **Fix all 8 `three-compat-*/package.json`:**
  - [x] `"@aura3d/engine": "^0.1.0-alpha.0"` → `"1.3.2"` (the version every other template pins; `src/cli.ts:22` passes no `packageVersion`, so the placeholder ships as-is and `npm install` fails).
  - [x] Add `name` and `version` fields (all other templates have them).
  - [x] Add missing devDependencies for the declared scripts: `vite`, `typescript` (and `@playwright/test` if the specs are kept).
  - [x] Add a `tsconfig.json` to each template.
- [x] **Fix all 8 `three-compat-*/index.html`:** currently a one-line fragment (`<div id="app"></div><script ...>`); replace with a full HTML document matching the other templates.
- [x] **Fix all 8 `three-compat-*/src/main.ts`:** currently two lines that import `@aura3d/engine/rendering` and set a dataset attribute — they never create an app, never render, never set `data-aura3d-ready`. Implement a minimal real scene per template (or explicitly descope the templates and remove them entirely).
- [x] **`three-compat-*/asset-manifest.json` (all 8):** the `"public-sample-glb"` / `"public-hdri"` ids reference no file in the template (no `public/` dir) and nothing in the repo consumes them; no other template even has an `asset-manifest.json`. Either wire real assets or delete the manifests.
- [x] **`three-compat-*/tests/route-health.spec.ts` + `tests/screenshot.spec.ts` (all 8):** the specs assert `data-aura3d-ready === "true"`, `drawCalls > 0`, `backend === "webgl2"` — behavior the current `main.ts` can never produce — and the templates have no `playwright.config.ts` or `test` script, so the specs cannot run. After fixing `main.ts`, add a playwright config + `test` script and verify the specs pass; otherwise delete the stubs (they exist only to satisfy file-existence checks).
- [x] **Verification:** scaffold each three-compat template via the CLI into a temp dir, `npm install && npm run build`, and run its tests.

### `packages/create-aura3d/templates/animation-studio/studio/` — bundled Studio copy is a stale fork (SHIPPED BROKEN in 1.3.2)

The Studio bundled into the template (what `npx create-aura3d` users actually get — verified present in the published `create-aura3d-1.3.2.tgz`) is a snapshot of `apps/animation-studio-web` taken **before** the bug-fix commits, and there is no sync mechanism or test comparing the two trees.

- [x] **`templates/animation-studio/studio/src/App.tsx:227-234`** — still the pre-`18836901` version: `doRender("sequence")` is fire-and-forgot, so the spinner clears and "New scene built" shows while the Stage still displays the OLD scene — the exact bug `18836901` fixed in the apps copy only.
- [x] **Diff the whole tree:** `studio/src/{sceneTool.ts, mapDocument.ts, Stage.tsx, Timeline.tsx, types.ts, Inspector.tsx}` have all drifted from their `apps/animation-studio-web/src` counterparts. Re-sync the bundled copy after the apps-copy fixes in this document land.
- [x] **Add a drift guard:** a unit test (or build step that copies instead of forking) asserting the template studio files match the apps versions, so the next release can't ship a stale fork again.
- [x] **Verification:** scaffold animation-studio via the CLI, run `npm run studio`, generate a scene, and confirm the preview shown is the NEW scene.

### `packages/rendering/src/SkinnedLitMaterial.ts` (lines ~133–150) + `packages/rendering/src/ShaderLibrary.ts`

Extension-texture support is inert and still crashes for real assets.

- [x] The skinned-lit fragment shader (`ShaderLibrary.ts:1081+`) declares **none** of the 18 extension-texture uniforms (`u_clearcoatTexture`, `u_sheenColorTexture`, …, `u_*TextureEnabled`) — it only has scalar factors. Decide: implement actual sampling in the skinned shader, or stop declaring the uniforms.
- [x] If keeping the uniforms: add `required: false` to the `u_${name}TextureEnabled` schema entries (the texture entries got it in `3af79c49`, the Enabled floats did not — `MaterialBinding.ts:33-36` treats entries as required unless `required === false`). As-is, **any skinned glTF with a clearcoat/sheen/transmission/iridescence/anisotropy/volume texture throws `MaterialBindingError` at first render** (the extension textures are wired up by `GLTFRenderResources.ts` from `89778ff3`).
- [x] Add a regression test: bind a skinned material whose glTF carries a clearcoat texture and assert it renders (the current tests only cover the no-extension-texture path, which is why the crash survived).

### `packages/assets/src/KTX2BasisTextureTranscoder.ts` (line 79)

- [x] Revert `worker: true` → `worker: false`, or make worker mode production-safe. With `worker: true`, loaders.gl resolves transcoder scripts via `defaultLoadersGLCdn()`/`defaultLoadersGLModules()` (lines 104–120) which point at `${window.location.origin}/node_modules/@loaders.gl/...` — paths only a dev server serves. Also the Node file hooks installed on `globalThis.loaders` (line 170+) exist only on the main thread, not in workers. Likely breaks KTX2 transcoding in all production browser builds.
- [x] Verification: production build (`vite build` + preview) of a route using a KTX2 texture; confirm transcode succeeds.

---

## P1 — Major Correctness Bugs

### `packages/ecs/src/systems/TransformSystem.ts` (lines 61–73)

- [x] **`computeNormalMatrix` is missing the transpose.** It computes `inverse(world)` and copies the upper-left 3×3 unchanged (an identity copy in column-major layout), so it returns `R⁻¹ = Rᵀ` instead of the inverse-transpose. Any rotated ECS mesh gets normals rotated opposite to the geometry (wrong lighting). Match the engine's reference implementation `normalMatrixFromModel` (`packages/rendering/src/Renderer.ts:2498`): `transpose(invert(modelMatrix))` before extracting the 3×3. `ForwardPass.ts:1178-1183` does consume `item.normalMatrix` when provided, so the bug is live.
- [x] **Strengthen the vacuous test** `tests/unit/ecs/ecs-render-integration.test.ts:78-100` ("computes normal matrix from world matrix"): it uses an identity transform, and `WorldTransformComponent.normalMatrix` is initialized to identity, so it passes even if `computeNormalMatrix` never runs. Use a non-uniform-scale + rotation transform and assert against the known inverse-transpose.

### `packages/engine/src/ecs/ECSRenderSource.ts`

- [x] **Line 153 — light `source: null as any` crash.** The comment "not consumed by renderer" is wrong: `Renderer.ts:1522` and `:1529` evaluate `light.castsShadow && light.source.visible`. The moment an ECS light sets `castsShadow: true`, this throws `TypeError: Cannot read properties of null (reading 'visible')`. Provide a real (or minimal stub) `Light` source object satisfying the non-nullable `CollectedLight.source` contract, or change the renderer to null-guard.
- [x] **Lines 66–72 — `collectRenderItems` throws on fresh worlds.** It calls `world.query({ include: [MeshComponent, WorldTransformComponent] })` unguarded; `Query`'s constructor does `registry.require(ctor)` (`packages/ecs/src/Query.ts:28`) which throws `UNREGISTERED_COMPONENT` for any world that never `add`ed a mesh. Apply the same `safeQueryComponents(...)` guard the `collectedLights` getter (lines 51–55) already uses, returning `[]`.
- [x] **Line 164 — `getECSCameraPosition` same problem:** `world.get(cameraEntity, CameraComponent)` throws if `CameraComponent` is unregistered or the entity was destroyed (`World.assertAlive`), defeating its own `if (!cam || !wt) return undefined` fallback. Wrap in the safe-query guard / try-catch and return `undefined`.
- [x] **Lines 32, 48–59 — `frustumCulling` option silently dropped:** `ECSRenderSourceOptions.frustumCulling` is declared but never forwarded onto the returned `RenderSource` (which has a `frustumCulling?: boolean` field, `Renderer.ts:255`). Forward it.
- [x] **Lines 46–47 — false doc comment:** claims the camera entity supplies `viewProjectionMatrix` to the renderer; only `cameraPosition` is wired. Fix the comment (or wire the matrices if the renderer can accept them).
- [x] **Line 139 — ambient lights silently become directional:** `light.kind === "ambient" ? "directional" : light.kind` turns an ambient light into a full-intensity directional light along the entity's -Z. Either map ambient to the renderer's environment/ambient path, or warn-and-skip; silent conversion renders scenes wrong.
- [x] **Add tests** for: ECS light with `castsShadow: true` renders without throwing; `collectRenderItems` on an empty/fresh world returns `[]`.

### `packages/ecs/src/systems/CameraSystem.ts` (line 18)

- [x] `after = ["TransformSystem"]` is a **hard** scheduler dependency — `SystemScheduler.addEdge` (line 67) throws `MISSING_ECS_SYSTEM_DEPENDENCY` if `TransformSystem` isn't registered, so adding `CameraSystem` alone makes `world.update()` throw. The priorities (-80/-70) already provide soft ordering; drop the `after` edge or make the scheduler treat missing `after` targets as soft.
- [x] Strengthen the ordering test `tests/unit/ecs/ecs-render-integration.test.ts:196-212` — it only asserts `world.update()` doesn't throw; make it actually verify TransformSystem ran before CameraSystem (e.g. via a recorded execution order or a transform-then-view assertion).

### `packages/engine/src/agent-api/index.ts`

- [x] **Lines 1277 + 5540–5548 — false humanoid GLB metadata** (`1ca640ed`). `builtInCharacterAssets.humanoid.metadata.animations` now lists `["Idle","Run","TPose","Walk","Walking","Wave"]` and `mapAuraClipToBuiltInHumanoidClip` maps `benchmark-pose → "Walking"`, `wave → "Wave"` — but the actual GLB (`packages/engine/src/agent-api/assets/humanoid-fixture.glb`, hash unchanged) contains exactly `Idle, Run, TPose, Walk`. Either re-export the GLB with the new clips (and update the declared sha256), or revert the metadata/mapping to the four real clips.
- [x] **`tests/unit/agent-api/agent-api.test.ts:245-254`** asserts the false metadata (`animation.clip === "Walking"`) — update it to assert against the GLB's real clip list once the source is fixed (and consider a test that parses the GLB and cross-checks `metadata.animations` so this can't drift again).
- [x] **Line 3596 — `particleFountain` count unclamped:** `Math.max(320, options.count ?? 420)` has no upper bound despite the advertised "up to 2400" cap (previous code clamped to [320, 560]); downstream consumers clamp independently (1200 / 2200), so the scene JSON over-reports what renders. Add `Math.min(2400, ...)` and align the downstream clamps.
- [x] **Decision needed (not a bug):** `1ca640ed` reversed a documented constraint — the deleted comment in `createLowPolyHumanoid` said benchmark humanoids "must not default to the armored/soldier bundled GLB... so Prompt 09 stays asset-free", and the commit switched the default back to the bundled soldier GLB. Confirm the reversal is intended; if not, restore the asset-free default.

### SSE render-progress pipeline

#### `apps/animation-studio-web/vite.config.ts` (lines 201–217)
- [x] **Stale `progress.json` ends every re-render instantly.** The file is never deleted when a new render starts; on any render after the first it still says `{label:"finishing", pct:100}`, the 200 ms interval reads it, sends 100%, then `clearInterval + res.end()`. The browser EventSource then auto-reconnects in a ~3 s loop receiving stale-100/end until the writer overwrites the file. Fix: delete (or version-stamp) `progress.json` in the POST `/api/render` handler before spawning the render, and/or include a render-run id in the payload that the SSE stream filters on.

#### `packages/create-aura3d/templates/animation-studio/scripts/render-live.ts` (lines ~510–512)
- [x] **Non-atomic progress write:** `writeFileSync(PROGRESS_PATH, JSON.stringify(...))` directly — the reader can hit a partially written file (its catch emits `{label:"unknown", pct:0}`, snapping the bar to 0 mid-render). Write to a temp file in the same dir, then `renameSync`.
- [x] **Division-by-zero:** `Math.round((current / total) * 100)` yields `Infinity → null` when `LAST_FRAME === FIRST_FRAME`. Guard `total <= 0 ? 100 : ...`.
- [x] Write an initial `{pct: 0, label: "starting"}` as the very first action of the script (before browser/page setup) to shrink the stale-file window.

#### `apps/animation-studio-web/src/App.tsx` (lines ~271–283)
- [x] **EventSource leak on unmount:** `es.close()` only happens in `runRender`'s `.then()`; the EventSource is created in an event handler with no `useEffect` cleanup, so unmounting mid-render leaves a perpetually reconnecting connection. Store the EventSource in a ref and close it in a `useEffect` cleanup.
- [x] **Indeterminate state defeated:** the server's initial "waiting, pct 0" event immediately overwrites the intentional `setRenderPct(-1)` indeterminate state. Ignore `waiting`-label events (or keep -1 until the first real progress label arrives).

### `apps/animation-studio-web/src/App.tsx` — generate/render flow state bugs (from `d584fbe7`, shipped in 1.3.2)

- [x] **Lines 212–235 — no try/finally in `generateScene`:** `hydrate()` → `fetchDocument`/`fetchHistory` (`src/state/backend.ts:34-44`) have no catch, so a transient fetch/JSON failure rejects after the command commits; `setGenerating(false)` is never reached and the rejection is discarded by `void generateScene()` (lines 341, 348). The UI is permanently stuck on the "Building your scene…" spinner until reload. Wrap the body in try/finally and surface the error as a toast.
- [x] **Lines 263–264 + 347 — generate-during-render race:** `doRender` no-ops when `rendering` is true (`if (rendering) return Promise.resolve();`) and the Generate button is only disabled on `generating`, not `rendering`. Clicking Generate mid-render silently skips the auto-render, shows "Scene ready", and then the in-flight render of the **old** document completes and puts the old scene's video on the Stage. Disable Generate while rendering (or cancel/queue), and don't no-op silently.
- [x] **Lines 232–234 — failure masked by success toast:** `doRender` resolves `void` even on failure (`runRender` returns `{ok:false}`), so `generateScene` unconditionally shows "Scene ready — click Play…" right after `doRender`'s own "Render failed" toast. Make `doRender` return success/failure and branch the toast.
- [x] Line 299 — auto-render card label uses closure-captured `DUR` from before the new document hydrated (shows the OLD scene's duration). Recompute after hydrate.
- [x] Lines 160–163 — `showToast` never clears the previous `setTimeout`, so an earlier timer can dismiss a later toast early (visible with the new back-to-back toasts). Keep the timer id in a ref and clear it.
- [x] Lines 253–254 — `continueScene`: a `hydrate()` rejection after the shot commit is an unhandled rejection (no toast). Add a catch.

### `apps/animation-studio-web/src/components/Console.tsx` (lines ~307–326) + `src/state/sceneTool.ts` (lines 19–36)

- [x] **The "Top commands — click one to use it" UI advertises commands the real CLI rejects.** Verified against the CLI (`packages/create-aura3d/templates/animation-studio/scripts/animation-scene.ts`): `cam`, `light add`, `fx add`, `cast remove`, `cast rename` don't exist at all, and most advertised syntaxes are wrong — the CLI requires flag forms (`cast add --id <id> --query "…"` not `cast add <name>`; `shot add --id` not `--after`; `prop add --id --query`; `dialogue --line --speaker --text --start`; `block --character --shot --to`; `gesture --character --shot --clip`). Every inserted command except `set`/`shot retime`/`show`/`render` yields a usage error. Fix the `VERBS` table in `sceneTool.ts` to the CLI's actual grammar (these strings are also surfaced verbatim to LLMs).
- [x] Minor: advertised flags `--profile <rig>` (cast add) and `--quality preview|final` (render) are read by nothing in the CLI (render only reads `--range`) — remove or implement.

### Aura Clash evidence/proof integrity (`f3238f38`, `89778ff3`)

- [x] **`apps/aura-clash-showcase/tests/playable-smoke.spec.ts:97` — guaranteed-failing assertion:** the test still asserts `expect(proof.release).toBe("1.1.0")` while the app emits `AURA_CLASH_ARENA_PROOF_RELEASE = "1.3.2"` (`auraClashArenaProof.ts:10`). `f3238f38` updated the proof *type* on line 6 but not the assertion. Fix the assertion to `"1.3.2"` (and consider asserting against the imported constant so it can't drift).
- [x] **`AuraClashArenaApp.ts:1058, 2316` — `deterministicCombat: true` proof claim is false:** rival AI intents use `Math.random()` (lines 1448–1450, added in `f3238f38`). Either seed the RNG (preferred — see the determinism item in P0) or set the proof claim to false until it's true. Note `createDeterministicReplayProof()` (line 2408) stays honest only because it runs a self-contained toy simulation, not the real combat loop.

### `benchmark/results/aura3d-106-peer-benchmark-report.json` — evidence record no longer pins real evidence

- [x] **`f3238f38` edited one evidence record's hash by hand** (`apps-camera-path.png`: sha256 `31ee40ac…`/63147 → `2b0795eb…`/63218) — and at HEAD that recorded hash/size does NOT match the artifact on disk (`93b6946c…` / 72172 bytes), while every other hashed artifact in the report matches exactly. The screenshot lives under gitignored `tests/reports/`, so the recorded value is unverifiable from the repo, and the edit landed in an unrelated `feat(aura-clash)` commit. Re-run the benchmark capture (or the report generator) so the record reflects a real, current artifact — do NOT hand-edit hashes. This pairs with restoring the deleted sha256 checks in `tests/unit/tools/peer-benchmark-report.test.ts` (see below): the test deletion is what let this mismatch go unnoticed.

### Weakened test gates — restore them

#### `tests/integration/external-parity-create-aura3d.test.ts` (line 31)
- [x] For `three-compat-*` templates the assertion is now literally `toContain("import")` — vacuous (any file with the word "import", even in a comment, passes). Restore a meaningful assertion: require an import from `"@aura3d/engine"` (or, if three-compat templates legitimately use a different entry, assert `from "@aura3d/engine/rendering"` / `from "three"` explicitly — what the templates actually do).

#### `packages/create-aura3d/templates/animation-studio/src/render-live-route.ts` (line 17) and `packages/create-aura3d/templates/character-controller/src/main.ts` (line 4)
- [x] Remove the dead `import { createAuraApp } from "@aura3d/engine";` lines — `createAuraApp` is never used in either file; they were added solely to satisfy the string-match test above. (Note `render-live-route.ts` is in the template tsconfig `exclude` list, so its token import is never even typechecked in scaffolded projects.) If the test still needs the public-API guarantee, make the files genuinely use the public API.

#### `tests/integration/production-runtime-create-aura3d.test.ts` (lines 21–23)
- [x] The `main.ts OR render-live-route.ts` relaxation was motivated by animation-studio but applies to all 17 templates. Narrow it: require `src/main.ts` for every template except an explicit allowlist (`animation-studio`).

#### `tests/unit/tools/peer-benchmark-report.test.ts` (lines 44–51)
- [x] sha256/byteSize integrity verification for screenshots was **deleted** (replaced with `actualSize > 0`), contradicting the test's own line-58 claim-boundary assertion ("must include their own screenshot hashes and runner metrics"). Restore the hash check and **regenerate the report JSON's recorded hashes** (`benchmark/results/aura3d-106-peer-benchmark-report.json` was touched in `f3238f38` — that's the honest fix that should have happened).

#### `tests/unit/public-api-contracts.test.ts`
- [x] The audit was loosened to allow example sources to import `apps/` internals and node builtins (`vite`,`path`,`fs`,`url`,`os`,`crypto`) everywhere, accommodating `examples/data-galaxy/src/main.ts:1-3` importing `../../../apps/v9-advanced-examples-gallery/src/dataGalaxyScene`. This is the opposite of the repo's own CLAUDE.md mandate ("Build scenes with @aura3d/engine public imports only"). Fix the example to use public `@aura3d/engine` imports, then revert the loosening (keep the `vite`/`path` exemption only for `*.config.ts` files).

#### `tests/unit/engine/external-parity-public-api-stability.test.ts`
- [x] Restore the deleted `"./engine": "./dist/engine/index.js"` export assertion — the export still exists in `package.json` with exactly the asserted value; the deletion was pure coverage loss.

#### `tests/unit/agent-api/agent-api.test.ts` (lines ~638, ~805)
- [x] Two tolerances were widened with no same-commit source justification: `simulatedBallNode.position[1]` `< 0.18 → < 0.22` and materials-showcase max-Y `≤ 2.18 → ≤ 2.3`. Trace the actual numeric drift (likely the physics backend/prefab changes), document the cause in the test, and tighten back to the smallest passing bound.

### `packages/animation/src/library/performanceStateGraph.ts` (lines 72, 93–94, 125–126)

- [x] `sit` and `cross_arms` are documented (line 72) as "held loops that return to idle when their flag clears" but declared as 0.6 s one-shots with non-consumed triggers — so with the flag held, the 3-second `sit` clip restarts from t=0 every 0.6 s with a crossfade pop. Make them true held states: loop while the flag is truthy, exit to idle on flag clear (and add an exit transition from the state itself).

---

## P2 — Minor Bugs, Docs, Hygiene

### `apps/advanced-examples-gallery/src/main.ts` (+ `src/styles.css`)
- [x] **Lines 445 + 640 (major): loader reappears permanently after any camera-preset click.** Clicking a camera-preset button calls `renderShell()` which recreates `<div class="gallery-loading">` un-hidden, but the only hide site (line 445) is gated by `fpsReadyResetDemoId !== selectedDemo.id` — already false for the current demo — so "Loading authored asset…" reappears and is never hidden again. (Reset/spawn/hotspot paths clear `fpsReadyResetDemoId`; the camera path does not.)
- [x] Lines 696–701: home loading indicator is inserted and hidden synchronously in the same `renderShell()` call — it can never be seen. Hide it on content-ready instead, or remove it.
- [x] Line 705 + `styles.css`: `.gallery-loading` has no CSS rule anywhere — the "overlay" is an unstyled in-flow div. Add the styles.
- [x] Lines 439–447: the loader is hidden only on `status === "ready"`; on `"error"` (`authoredLayer.ts:372`) "Loading authored asset…" displays forever. Also hide on error (and show an error message).

### `apps/advanced-examples-gallery/src/physicsSimulation.ts` (line 279)
- [x] `backend: "aura-js"` was forced in a `test:` commit (`3af79c49`), changing the gallery app's runtime physics from the cannon-es default to align with the test suite. Decide intentionally: if aura-js is the desired production backend here, keep it and note why; otherwise revert and pin the backend only in tests.

### Test-coverage gaps created by `3af79c49` (no action strictly required, but note)
- [x] `tests/unit/physics/constraints-stress.test.ts` + `tests/unit/workstream4.physics-animation.test.ts` now pin `backend: "aura-js"` everywhere (28 sites) — the **default cannon-es path has no coverage** in these suites. Add at least one cannon-es smoke test.
- [x] `tests/unit/workstream5-runtime.test.ts`: the "transparent-double-sided" fixture is now flattened to opaque by `isEffectivelyOpaqueBlendMaterial`, so no test exercises a genuinely blended material path. Add a fixture with `alpha < 1` or a baseColorTexture.

### `packages/create-aura3d/templates/animation-studio/src/director/prompt-to-scene.ts`
- [x] `OBJECT_PROPS` bare-word matching spawns props on ambiguous English words: "she **saw** the tower" spawns a saw; "the hero **can** jump" spawns a tin can (also `log`, `sign`, `picture`, `ball`). Require noun-context (article/determiner before the word) or remove the ambiguous entries.

### Docs / version strings
- [x] **`README.md`** — revert the package count 28 → **26**: the two extras (`@aura3d/engine-runtime` i.e. `packages/engine`, and `@aura3d/test-utils`) are `"private": true` and 404 on npm. The "all 28 packages on npm latest" claim is false; 26 was correct (matches CHANGELOG 1.3.1 history and the release playbook).
- [x] **`README.md:18`** — "`@aura3d/engine@1.3.2` is the **prepared** release" → published wording (the same README's line 28 says it's live).
- [x] **`CHANGELOG.md`** — fix the matching "28 packages" claim in the 1.3.2 entry.
- [x] **`docs/project/release-tracks.md:3`** — header still reads `Version: 1.2.0` → `1.3.2` (the body was fixed in `f4b70739`, the header was missed).
- [x] **`docs/project/current-state.md:35`** — 1.3 track still marked "(version bump publish-pending)" → published.
- [x] **`llms.txt:347-348`** — claim rules still reference **1.3.1** ("Treat 1.3.1 as a scoped runtime-foundation release…") → update to 1.3.2. This is the agent-facing instructions file, so staleness here propagates into LLM behavior.

### `apps/animation-studio-web/src/components/Timeline.tsx`
- [x] Line 74 + `App.tsx:391`: the entire +51-line drag-retime feature from `89778ff3` is dead code — `App.tsx` never passes `onRetime`, so the drag handle never renders. Wire it up or remove it.
- [x] Lines 217–219 (latent): `onRetime` is passed to clips on ALL tracks (Dialogue/Gestures/Camera/FX), so when wired it will fire with beat/gesture/fx ids, not just shot ids. Restrict to the Shots track.

### `packages/create-aura3d/templates/animation-studio/scripts/asset-motion-probe.ts` (from `91440b79`)
- [x] Lines 211/214 + 354: the new `wave` vocabulary entry is shadowed — the intent loop iterates `STANDARD_CLIP_IDS` in order and `gesture`'s keywords already contain `"wave"/"waving"/"greet"/"hello"`, so a clip named "Wave" always maps to `gesture`; `wave` is only reachable via `"goodbye"/"farewell"`. Reorder or remove the overlapping keywords.
- [x] Lines 222/224: broad single tokens `"head"` (shake_head) and `"cross"`/`"arms"` (cross_arms) token-match unrelated clips ("HeadBang" → shake_head, "CrossPunch" → cross_arms) before the motion-shape fallback runs. Tighten to multi-word matches.

### Release/publish hygiene
- [x] `packages/aura3d-cli/package.json:25`: `"@aura3d/asset-index": "workspace:^1.0.10"` is the only inter-package dep not pinned `workspace:*`-style consistently with the 1.3.2 lockstep (caret resolves correctly today, but it's drift-prone). Align it.
- [x] **Publish-flow guard:** the pnpm-pack publish flow that fixed the `workspace:*` leak in `199ec20d` is not checked in anywhere — a future plain `npm publish` from a package dir would silently reintroduce the exact bug 1.3.2 fixed. Add a publish script (or `prepublishOnly` guard) to the repo.
- [x] **Stale stash:** `stash@{0}` (`pre-switch-to-preserve-g3d-v2-execution-state`, 2026-05-21, touches `examples/` + root `package.json`) predates the v4 cutover. Inspect with `git stash show -p stash@{0}`; drop it if obsolete.

### `packages/ecs` minor hardening
- [x] `TransformSystem.ts:24-28`: depth-sorted traversal silently breaks (one-frame lag) if `HierarchyComponent.parent` is mutated directly instead of via `HierarchySystem.setParent` (depth stays 0). Either make `parent` read-only/managed, recompute depth defensively, or document the constraint on the field.
- [x] `MeshComponent.layerMask` is declared but unused by the render bridge — wire it into `collectRenderItems` filtering or remove it.
- [x] `tests/unit/ecs/ecs-render-integration.test.ts:134`: `expect(cam.viewProjectionMatrix).toBeDefined()` is always true (allocated in the constructor) — replace with a value assertion.

---

## Final Verification Checklist (run after all fixes)

- [x] `pnpm typecheck:raw` — green
- [x] `cd apps/aura-clash-showcase && pnpm exec tsc --noEmit` — green (this is NOT covered by the root typecheck; consider adding apps to a CI typecheck step so this class of breakage can't recur)
- [x] `pnpm vitest run tests/unit` — 100% pass with the **restored** (un-weakened) assertions
- [x] `pnpm vitest run tests/integration` — green
- [x] Scaffold every template (including all 8 three-compat) via create-aura3d into a temp dir: `npm install && npm run build` succeed; template tests run
- [x] Production build of a KTX2-consuming route — textures transcode
- [x] Animation-studio: trigger two renders back-to-back — progress bar starts at 0 both times, no instant-100% on the second
- [x] Animation-studio: generate a scene and confirm the NEW scene's preview appears (both in `apps/animation-studio-web` AND in a freshly scaffolded template's bundled Studio); generate while a render is in flight — no stale-video swap, no stuck spinner on a failed hydrate
- [x] Console "Top commands": every suggested command, inserted verbatim, is accepted by the scene CLI
- [x] `apps/aura-clash-showcase` smoke suite passes, including `proof.release === AURA_CLASH_ARENA_PROOF_RELEASE (1.3.3)`
- [x] `tests/unit/tools/peer-benchmark-report.test.ts` passes with sha256 checks restored and every recorded hash matching the on-disk artifact
- [x] Gallery: click a camera preset after load — the "Loading authored asset…" overlay does not reappear
- [x] Aura Clash: one hit deals exactly the move-data damage; knockdown plays `hurtHeavy`; wakeup invulnerability blocks incoming damage; buffered input during hitstun executes on recovery
- [x] ECS: rotated mesh lights correctly (normal-matrix test with non-identity rotation); ECS light with `castsShadow: true` doesn't crash; empty world renders `[]`
- [x] Docs: `pnpm vitest run tests/unit/tools/docs-version-alignment.test.ts` green; grep `1\.3\.1|1\.2\.0|28 packages` over README/CHANGELOG/llms.txt/docs returns only legitimate historical entries

---

## FINAL PHASE — Ship 1.3.3 (only after EVERY box above is checked)

This phase releases everything that landed since 1.3.2 — the ECS components/systems/render bridge, the 14-clip animation vocabulary, the Aura Clash combat systems, the SSE render-progress pipeline, the agent-api prefab features, the physics fixes, the three-compat templates — **plus all the fixes in this document**. Do not start it until the Final Verification Checklist above is fully green; 1.3.3 must not ship any of the bugs catalogued here.

### Step 1 — Version bump (code)

- [x] Bump `version` to `1.3.3` in the root `package.json` (`@aura3d/engine`) and all 25 other publishable `packages/*/package.json` (26 total; `packages/engine` = `@aura3d/engine-runtime` and `@aura3d/test-utils` are private — leave them workspace-consistent). Keep inter-package deps in exact lockstep (including the `@aura3d/asset-index` pin in `packages/aura3d-cli` — see the hygiene item above).
- [x] Bump every template's `"@aura3d/engine"` dependency in `packages/create-aura3d/templates/*/package.json` to `1.3.3` (all 17 templates, including the 8 fixed three-compat ones).
- [x] Bump the create-aura3d engine-version fallback literal in `packages/create-aura3d/src/index.ts` (`options.packageVersion ?? packageJson.dependencies?.["@aura3d/engine"] ?? "<release>"`) to `1.3.3` — this stale literal is exactly what broke 1.3.0.
- [x] Bump `AURA_CLASH_ARENA_PROOF_RELEASE` in `apps/aura-clash-showcase/src/playable/evidence/auraClashArenaProof.ts` to `1.3.3` and the matching assertion in `tests/playable-smoke.spec.ts` (use the imported constant so they can't drift again).
- [x] Bump the `@aura3d/engine` dep in `marketing/package.json` (the docs-claims gate enforces it).
- [x] Rebuild all dist artifacts (`pnpm build`), including `packages/create-aura3d/dist/index.js` so the published template list matches `files` (see P0).

### Step 2 — Docs bump to 1.3.3 (all of `docs/*`, `README.md`, and agent-facing files)

- [x] **`CHANGELOG.md`** — add a full `1.3.3` entry covering: ECS camera/light/mesh components + Transform/Camera systems + `ECSRenderSource` render bridge; 14-clip standard humanoid vocabulary; Aura Clash combat systems (combo, guard break, knockdown/recovery, input buffering — as fixed); Studio prompt-driven scene generation + SSE render progress (as fixed); 12 agent-api prefab/character features (with corrected GLB metadata); physics constraint/shape fixes; 8 three-compat templates (now functional); KTX2/SkinnedLitMaterial fixes; restored test gates; corrected package count (26).
- [x] **`README.md`** — version references → 1.3.3, "published" wording, package count 26.
- [x] **`llms.txt`** — claim rules → 1.3.3 (currently stale at 1.3.1; this file steers LLM behavior).
- [x] **`docs/project/*`** — `release-checklist.md`, `release-process.md`, `release-tracks.md` (incl. the line-3 header), `current-state.md` (drop "publish-pending"), `support-policy.md`, `security-policy.md`, `compatibility.md`, `migration.md`, `site-map.md`, `claim-guidelines.md`, `known-limits.md`, `aura-clash-showcase.md`, `aura3d-109-release-gates.md` → 1.3.3.
- [x] **`docs/concepts/*`** (animation, assets, editor-runtime, engine-lifecycle, physics, rendering, scene-vs-ecs) — version headers → 1.3.3; update `scene-vs-ecs.md` ECS parity inventory to reflect the fixed ECS render bridge (normal matrix, shadow-light support, ambient handling).
- [x] **`docs/api/public-api.md`** — regenerate via the api-docs tool after all source fixes (the test asserts exact file equality).
- [x] **`docs/agents/*`** + `CONTRIBUTING.md` — version references → 1.3.3.
- [x] **Gate:** `pnpm vitest run tests/unit/tools/docs-version-alignment.test.ts` green at 1.3.3, then the full `tests/unit/tools/` suite (docs-claims, webgpu-docs, api-docs, verify-tools) green.
- [x] **Sweep:** `grep -rEn "1\.3\.2|1\.3\.1|1\.2\.0" README.md CHANGELOG.md llms.txt docs/` — every remaining hit must be a legitimate historical reference (CHANGELOG history, migration guides), nothing normative.

### Step 3 — Readiness gates (evidence proofs)

- [ ] `pnpm aura3d110:prepublish-readiness` derives the report dir from the version: 1.3.3 → `tests/reports/aura3d133/`. Regenerate all 4 evidence proofs into it (reports are gitignored; use `pnpm exec tsx`, NOT global tsx):
  - [x] `tools/aura3d106-docs-claims/index.ts` → `docs-claims.json` (enforces exact 1.3.3 wording in README, llms.txt, claim-guidelines.md, aura3d-109-release-gates.md, marketing/package.json)
  - [x] `tools/aura3d106-performance-budget/index.ts` → `performance-budget.json`
  - [x] `tools/aura3d106-local-cli-pack-proof/index.ts` → `local-cli-catalog-pack-proof.json`
  - [ ] `tools/aura3d106-deployed-visual-proof/index.ts` → `deployed-visual-proof.json` — passes only AFTER the live deploy (Step 6); run it last.
- [ ] Re-run the full gate suite one final time on the release commit: `pnpm typecheck`, `pnpm test`, `cd apps/aura-clash-showcase && pnpm exec tsc --noEmit`.

### Step 4 — Git: commit, tag, push to GitHub

- [ ] Commit the release on branch `main` (tracks `origin/main`, even though `origin/HEAD` is `master`): `release: Aura3D 1.3.3 — <one-line summary>`.
- [ ] Tag `v1.3.3` on that commit.
- [ ] Push branch + tag: `git push origin main --follow-tags`. (Network gotcha in this env: if the push stalls, use `GIT_SSH_COMMAND="ssh -o ServerAliveInterval=10 ..."`.)

### Step 5 — npm publish (26 packages)

- [ ] Use a transient `.npmrc` OUTSIDE the repo via `NPM_CONFIG_USERCONFIG` — the repo `.npmrc` is NOT gitignored; never write the token into it.
- [ ] **create-aura3d trap:** move `packages/create-aura3d/templates/animation-studio/node_modules` aside before publishing create-aura3d (pnpm symlinks dereference under `npm pack` → 722 MB tarball that fails upload); restore it after.
- [ ] **Publish-loop trap:** if iterating a package list file with `while read`, `printf '\n' >>` the file first — a missing trailing newline silently skips the last package (this is how `@aura3d/workflows` went unpublished in 1.3.0 and made the engine uninstallable).
- [ ] **Verify against the registry afterward:** all **26** packages (25 `@aura3d/*` + `create-aura3d`) show `latest = 1.3.3`. The count must be 26, not 25.
- [ ] **Lockstep proof:** run the published-create proof — scaffold from the *published* `create-aura3d@1.3.3` and assert the project's `@aura3d/engine` === `1.3.3`, then `npm install && npm run build` in the scaffold (catches the three-compat/template pin class of bug for good).

### Step 6 — Deploy + close the loop

- [ ] Deploy the showcase so the deployed-visual-proof gate can pass: build `apps/aura-clash-showcase` → build `marketing` (its closeBundle copies the showcase dist in) → copy `dist` into `marketing/.vercel/output/static` → `vercel deploy --prebuilt --prod` on the **"marketing"** Vercel project (NOT the root "aura3d" project). TLS gotcha: `NODE_OPTIONS=--tls-max-v1.2` and retry in a loop (Vercel dedups blobs across attempts).
- [ ] The custom domain never auto-reassigns: `vercel alias set <deployment-url> aura3d.auraone.ai`.
- [ ] Run `tools/aura3d106-deployed-visual-proof/index.ts` (it compares the live showcase's embedded release to 1.3.3), then `pnpm aura3d110:prepublish-readiness` end-to-end — all green.
- [ ] Final smoke from a clean machine/dir: `npx create-aura3d@latest` with one classic and one three-compat template; both install, build, and run.
