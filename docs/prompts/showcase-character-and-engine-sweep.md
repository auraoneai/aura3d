# Showcase Character 10/10 & `@aura3d/engine` Library Sweep

Audit and upgrade all 30 public Aura3D showcase games (`apps/showcase-*`, `examples/*-port`, and `examples/aura-slam`) so every hero character, NPC, boss, creature, and hero vehicle is a 10/10 organic/sculpted `@aura3d/engine` procedural model—and ensure every game is fully utilizing the latest `@aura3d/engine` (`5.5.5+`) rendering, material, camera, VFX, and runtime capabilities.

## Ground Rules

- **Frozen denominator:** Resolve the exact 30 game slugs from the showcase catalog (`apps/showcase-index` / `tools/game-checks` `--all` set) before starting and list them in the first status update. Non-game showcases (`showcase-kits`, `showcase-asset-audition`, `showcase-product-configurator`, `showcase-data-galaxy`, `showcase-digital-twin-ops`, `showcase-smart-city-control`, `showcase-material-asset-inspector`, `showcase-cinematic-architecture`, `showcase-port-shared`, `showcase-index`) are out of scope unless they are in that list.
- **Aura3D only:** No Three.js/R3F or other engines (`--only no-three` must stay green). No removed 5.0 APIs (`--only no-removed-5-0-apis`).
- **Don't clobber concurrent work:** The working tree has unrelated in-flight changes (e.g. `apps/veer-wonder-world/**`, `tests/browser/wonder-world-*`, `evidence/veer-wonder-world/**`). Never edit, stage, revert, or commit them. Stage by explicit path only (no `git add -A` / `git add .`).
- **Shared kernel changes are coupled:** Any edit to `apps/showcase-port-shared/proceduralKernel.ts` is owned by one agent and must be re-verified against every game that imports it, not just the one that motivated the change.
- **Fix budget:** Max 2 fix attempts per failing check or visual defect; after that, record it as a residual with evidence instead of looping.

## Phase 1: Parallel Audit of All 30 Showcase Games

Split the 30 games across parallel subagents (grouping by genre/shared files, never splitting coupled files) to inspect:

1. **Character / Creature / Hero Vehicle Quality (10/10 Bar):** A model scores 10/10 only if *all* of these hold at gameplay camera distance and at a close crop:
   - No raw primitives (`box`, `sphere`, `cone`, `cylinder`) on any character/NPC/boss/creature/hero-vehicle body part (small props and level geometry are fine).
   - No visible lathe ring creases, faceted low-poly silhouettes, flat-shaded organic surfaces (skin/fur/shells), or gaps/disconnected joints at shoulders, hips, knees, elbows, and necks in any animation pose.
   - No harsh outdoor HDRI reflections (`envMapIntensity` / `clearcoat` streaking tree branches or sky onto glossy heads/caps/shells).
   - Zero mid-animation transparency, z-fighting, or alpha-clipping flicker.
   - Stable `"ZYX"` Euler composition on articulated rigs (`writeEulerZYXMatrix` / `placeYawPart`, currently in `showcase-pips-big-leap`; promote to the shared kernel if two or more games need it) with no gimbal flips or limb popping during turns.
   - Silhouette is readable and distinct from other games' heroes (`--only likeness,look-identity,borrowed-asset`).
2. **Latest `@aura3d/engine` Library Utilization Sweep:**
   - **Looks & Lighting:** `looks.preset(...)` with calibrated `exposureEv`, `PCSS` shadows, hemisphere + rim fill, and studio/clean IBL (`--only lighting,luma-band,art-direction`).
   - **Materials & Shaders:** Built-in `material.lacquer`, `material.fabric`, `material.felt`, `material.matteClay`, `material.studioMetal`, `material.clearcoat`, `material.emissive({ practical: true })`, plus dual-backend GLSL + WGSL twins for any custom shaders (`backend: "auto"` WebGPU-ready). Flag hand-rolled material params that duplicate a built-in preset.
   - **Geometry & Sculpting:** Shared `apps/showcase-port-shared/proceduralKernel.ts` primitives (`sculptOrganicSdfMesh`, `sculptStylizedHeadMesh`, `sculptAnatomicalLimbMesh`, `sculptHumanoidLimbMesh`, `sculptCurvedHairLockMesh`, `sculptDrapedGarmentMesh`, `sculptStreamlinedHullMesh`, `taubinSmoothMesh`, `subdivideSmoothMesh`, `bakeMeshCavityAO`, and analytic SDF normals). Flag per-game copies of logic the kernel already provides.
   - **Gameplay, Camera & Juice:** `createFixedStepLoop`, `camera.rigs` / directional `computeCameraClearance` (never clipping into walls or zooming into the hero's back; full-body framing through checkpoints, archways, and tight corridors), `effects` (VFX bursts, trails, flipbook sprites), `post` (`bloom`, `colorGrade`, `depthOfField`), and `game.*` kits (`--only fixed-step-presenter,hitstop-time,kits`).
3. **Audit output:** Each subagent returns one row per game: slug, each hero/NPC/boss/vehicle with a score (0–10) and the specific failing criteria, engine-usage gaps, a baseline screenshot path, and the current `node tools/game-checks/run.mjs <slug>` error count. Games already at 10/10 with no engine gaps are marked "no change" and skipped in Phase 2.

## Phase 2: Upgrade Non-10/10 Characters & Modernize Engine Usage

1. Rebuild every flagged character/NPC/boss/vehicle in `proceduralModels.ts` (and shared helpers in `apps/showcase-port-shared/proceduralKernel.ts` where reusable) using SDF sculpting, $G^1$ continuous limb capsules, Taubin fairing, and cavity AO.
2. Tune material `roughness`, `clearcoat`, `clearcoatRoughness`, `sheen`, and `envMapIntensity` so characters read cleanly under each world's look without harsh HDRI artifacts.
3. Upgrade any legacy/suboptimal engine calls (camera framing/clearance, post-processing, VFX, or shader twins) surfaced in Phase 1.
4. **Preserve gameplay:** Keep collision bounds, hitboxes, spawn points, and grounding unchanged unless the audit shows they were wrong (`--only fit-grounding,pose-array`). A visual rebuild must not change how the game plays.
5. **Performance guard:** Sculpted meshes must not regress frame time. Cache/bake sculpted geometry at load (never re-sculpt per frame), instance repeated NPCs, and keep draw calls and triangle counts within each game's existing budget; report before/after numbers for any game whose triangle count grows more than 2×.

## Phase 3: Verification, Build, LIVE Deploy & Real-GPU Visual QA

1. **Unit & Game Checks:**
   - Run `npx vitest run` for all modified game test suites (100% pass); add or update a test when a shared kernel function's signature or output changes.
   - Run `node tools/game-checks/run.mjs --all --strict` (`0` errors across all 30 games).
   - Regenerate derived outputs: `node tools/showcase-port-pages/sync.mjs`, `node tools/agent-examples/refresh-catalog-digests.mjs`, then `node tools/site/seo-meta-pass.mjs --check`. Refresh screenshots so `--only screens-fresh,screens-tracked` passes.
2. **Build & Deploy LIVE:**
   - Build `marketing` (`pnpm --dir marketing build`), handle the dist-only `boom-box.glb` size limit if needed, and deploy LIVE to Cloudflare Pages (`wrangler pages deploy marketing/dist --project-name aura3d --branch main`).
   - Commit and push all changes to `origin/main` by explicit path (leaving any unrelated concurrent working-tree files untouched). Rebase on `origin/main` first if it moved; never force-push.
3. **Real-GPU Chrome CDP Verification:**
   - Capture live screenshots on `https://aura3d.auraone.ai/apps/<slug>/` (desktop + mobile viewport + active gameplay/motion, including at least one mid-animation frame and one camera turn) via headless Chrome (`--use-angle=metal`) with `0` runtime exceptions and `0` failed asset requests.
   - Confirm the LIVE build serves the new commit (cache-busted asset hashes match `marketing/dist`) before judging screenshots.
   - Visually inspect every upgraded character and scene crop against its Phase 1 baseline; iterate immediately on any remaining seam, silhouette, reflection, or camera-framing issue (within the fix budget) before reporting done.

## Done Criteria & Final Report

Report done only when every in-scope game is 10/10 on the Phase 1 rubric or listed as a residual with evidence. Final report (short numbered list):

1. Games changed vs. "no change", with before → after character scores.
2. Shared kernel changes and which games they affect.
3. Check results: vitest, `game-checks --all --strict`, SEO/catalog checks.
4. Deploy URL, pushed commit SHA, and screenshot evidence paths.
5. Residuals (anything that hit the fix budget) and pre-existing or flaky failures, stated honestly.
