# Continuation State — Handover (`2026-10-14`, `main` @ `7216c5979`)

## 1. Original `.md` Files & Policy Runbooks in Scope

1. **Primary Execution Log & Plan of Attack**:
   - `/Users/gurbakshchahal/Downloads/aura3d-logs.md`
2. **Governing 4.0 Live Fix Plan**:
   - `/Users/gurbakshchahal/platforms/aura3d/docs/project/aura3d-quality-rebuild/4.0LiveFixPlan.md`
3. **Handover Evidence Directory**:
   - `/Users/gurbakshchahal/platforms/aura3d/docs/project/aura3d-quality-rebuild/evidence/handover-2026-10-12/CONTINUATION-STATE.md` (this file)
   - `/Users/gurbakshchahal/platforms/aura3d/docs/project/aura3d-quality-rebuild/evidence/handover-2026-10-12/LIVE-IDENTITY.md`
   - `/Users/gurbakshchahal/platforms/aura3d/docs/project/aura3d-quality-rebuild/evidence/handover-2026-10-12/SALVAGE.md`
   - `/Users/gurbakshchahal/platforms/aura3d/docs/project/aura3d-quality-rebuild/evidence/handover-2026-10-12/STEP4-SUMMARY.md`
   - `/Users/gurbakshchahal/platforms/aura3d/docs/project/aura3d-quality-rebuild/evidence/handover-2026-10-12/GAME-GATES.md`
4. **Mandatory Machine-Wide Agent Policy & Deploy Runbooks**:
   - `/Users/gurbakshchahal/.claude/CLAUDE.md`
   - `/Users/gurbakshchahal/AuraOne/AuraOne-Deploy-Final-PERMANENT.md`
   - `/Users/gurbakshchahal/.config/agent-policy/reference/remote-execution.md`
   - `/Users/gurbakshchahal/.config/agent-policy/reference/parallelism.md`
   - `/Users/gurbakshchahal/.config/agent-policy/reference/ci-selection.md`
   - `/Users/gurbakshchahal/.config/agent-policy/reference/vercel-neon.md`

---

## 2. Critical Post-Mortem: What Happened & How It Was Reversed

1. **Why the live games looked "worse than Atari" after merging `#1360` and `#1365`–`#1385`**:
   - Prior sessions' PRs `#1360` and `#1365`–`#1385` deleted ~150,000 lines of the real 3D games (`apps/*/src/legacy/**`, `examples/neon-corridor-strike/src/game/**`, real Tsukuba/Formula circuit GLBs, the 4,293-line `AuraClashArenaApp.ts` + downtown rooftop stage, the 15-module sci-fi FPS corridor in `neon-corridor-strike`, the winter alpine forest in `skyline-runner`, etc.) and replaced them with ~300-line `createGame` template stubs built out of `primitives.box`, brown `quaterniusWallModular` medieval blocks, brown `quaterniusCubeCrate` wooden crates, and the flat beige Mario-Kart track (`showcaseReadableKartCircuit.5cbb912e.glb`).
2. **What was actually wrong with the real games originally (before `#1360`–`#1385` deleted them)**:
   - Between commit `4489da315` (after `#1309` audio-buzz-fix and `#1310` turbo-drift-fix) and `c492d8719`, Era-1 commits (`#1311`, `#1321`, `#1322`, `#1329`, `#1333`, `#1337`–`#1340`) added 23 `effects-pass.ts` and `post-v2-retune.ts` files across `apps/*/src/legacy/**` that cranked `POST_V2_BLOOM_INTENSITY = 2.5–3.0`, `POST_V2_BLOOM_KNEE = 1.0`, `POST_V2_EXPOSURE = 1.3–1.6`, and dumped thick gray height-fog + blinding additive sun-mote columns in front of the camera.
   - In addition, when `1bd84e394` promoted `A3D_QR_COMPILER` to `"default-on"`, `packages/engine/src/agent-api/index.ts` (which `marketing/scripts/build-showcase-routes.mjs` aliases `@aura3d/engine` to) did **not** register `compilerSlot.provide(realCompilerImpl)`! As a result, `packages/engine/src/agent-api/compiler/renderer.ts` saw `flags.on("A3D_QR_COMPILER") === true` while `compilerSlot.provided === false`, set `actorEntries = []` and `primitiveEntries = []`, and crashed WebGL mount with `"Error: Production render path requires at least one real mesh primitive."` (leaving 17 of 18 games on a black canvas).
   - Finally, `marketing/scripts/build-showcase-routes.mjs` did not copy `public/aura-environments` or `public/aura-decoders` into `marketing/dist/`, causing `404`s on `/aura-environments/*.manifest.json`.
3. **What we restored and fixed on `main` (`e839e662f` → `8fbc89b22` → `efd4a6d1a` → `5913c6c58` → `e1da3e91d` → `8a6d81396` → `e74d39f59` → `7216c5979`)**:
   - **Restored all 19 real 3D games and custom HUDs** from `4489da315` (pre-Era-1 pollution, deleting all 23 `effects-pass.ts` and `post-v2-retune.ts` files while keeping all Phase-1 engine fixes E1–E6 in `packages/*`).
   - **Fixed `A3D_QR_COMPILER` in `agent-api` builds (`efd4a6d1a`)**:
     - `packages/engine/src/agent-api/compiler/compileScene.ts` now self-registers `if (!compilerSlot.provided) compilerSlot.provide(realCompilerImpl);` and is imported by `packages/engine/src/agent-api/compiler/renderer.ts` (with `flags.on("A3D_QR_COMPILER") && compilerSlot.provided` guard and zero circular imports).
   - **Published `aura-environments` and `aura-decoders` in `marketing/dist/` (`8fbc89b22`)**:
     - `marketing/scripts/build-showcase-routes.mjs` now mirrors `public/aura-environments` and `public/aura-decoders` into `marketing/dist/`, and `packages/rendering/src/environment/EnvironmentCache.ts` retries `/aura-environments/...` from root when relative fetch 404s.
   - **Targeted fixes on the real 3D scenes (`e839e662f`..`7216c5979`)**:
     - `examples/neon-corridor-strike`: Wired `canvas.requestPointerLock()` + left-click fire (`state.lmbHeld = true`) in `src/game/input.ts`, wired E5 raw mouse-look delta (`pointer.dx` / `pointer.dy`) in `src/game/player.ts`, replaced `looks.preset("outdoor-day")` (which caused `/hdri/autumn_field_puresky_1k.hdr` 404 and grey sky) with `environments.preset("night", { intensity: 0.45, background: false })` in `src/game/level.ts`, and raised `maxSubSteps: 64` + guarded `physics.step` in `src/main.ts`.
     - `apps/showcase-turbo-drift-circuit`: Seated tires cleanly (`contactClearance: wheelRadius * 0.24`), hid the two detached grey bubble spheres (`leftDriftSmoke`/`rightDriftSmoke`), the tall smoke column (`driftParticleCloudNode`), the two brown stick boxes (`leftDriftRibbon`/`rightDriftRibbon`), and the road-overlapping primitive lollipop spheres (`roadsideTreeTransforms` scaled to `0.001`), removed clearcoat specular streak on `layered asphalt`, toned down `TURBO_LATE_AFTERNOON_MOOD` intensities (`0.65 / 0.55 / 1.65`), and enabled `reviewFestivalNode` (`turboHairpinVenueKit`) + `buildTurboTreelineBands()` in normal play.
     - `apps/aura-clash-showcase`: Hid the 28-centimeter miniature spectator models (`CrowdInstances.ts`), filtered all `"AuraClash_Sign_*"` floating grey backing slabs, and widened/shifted `arenaBackdropTransforms` (`composeMat4([-0.55, 0, 0], quatFromEuler(0, 0, 0), [1.35, 1.15, 1.15])`) in `src/legacy/playable/AuraClashArenaApp.ts`.

---

## 3. Exact Current State & Immediate Next Steps for the Next AI

- **Git HEAD on `main`**: `7216c5979` (`fix(turbo-drift,aura-clash,neon-corridor): keep non-empty instancing array for hidden roadside trees, filter all AuraClash_Sign_* backing slabs, and guard Neon Corridor CCD step`).
- **Completed GitHub Actions runs on `7216c5979`**:
  - `Lead site build` (`38616806518`) — check completion/download `marketing-dist`.
  - `Release plan dry-run` (`38616810234`) — check completion/download `release-tarballs-7216c5979...`.
- **Step-by-step remaining work**:
  1. Download `marketing-dist` from `lead-site-build.yml` run `38616806518` (on `7216c5979`), copy to `.vercel/output/static/`, and deploy to `https://aura3d.auraone.ai` via `vercel-auraone deploy --prebuilt --prod --yes`.
  2. Dispatch `.github/workflows/qr-azure-gpu.yml` (`suite=games`, `runner=azure-gpu`, `gpu_class=any`, `source=production`, `viewports=1920x1080`, `qr_flags="core,lighting,post,materials,assets,animation,vfx,camera,compiler"`), download the 1920×1080 PNGs for **all 18 showcase games + `examples/neon-corridor-strike`** (`alt2-1920x1080` under `aura-clash-showcase`), and visually inspect every single frame with `Read`.
  3. Audit all 19 games' 1920×1080 screenshots: if any game still has a visual, lighting, framing, or geometry defect on its real `src/legacy/**` scene, fix it surgically on the real scene (NEVER replace a real game with a primitive-box or template stub!), rebuild via `lead-site-build.yml`, and redeploy via `vercel-auraone deploy --prebuilt --prod --yes`.
  4. Once all 19 games are visually verified on `https://aura3d.auraone.ai`, restage `/Users/gurbakshchahal/platforms/aura3d/.local-evidence/handover/release-4.0.0` from the matching `release-plan-dryrun.yml` run and publish the 24 `4.0.0` npm packages.
