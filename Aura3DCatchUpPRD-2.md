# Aura3D Catch-Up PRD 2: Visual Superiority Plan

Date: 2026-05-31
Owner: Aura3D
Status: Draft repair plan
Evidence base: Round 14 validation contact sheets, Round 12/13 benchmark failures, `benchmark/rubric.md`, `benchmark/metrics/README.md`, and the current `Aura3DCatchUpPRD.md`.

## Executive Summary

Aura3D PRD 1 improved API coverage and agent reliability, but it did not make the generated scenes visually strong enough. Round 14 validation showed that agents can now compile and render Aura3D scenes, but many outputs still look like crude prefabs. That is not parity with raw Three.js, and it is not enough to ship.

The central failure is that Aura3D is still optimized around "safe helpers that produce something" instead of "scene systems that produce production-quality visuals by default." The current output is more reliable, but not visually dominant. PRD 2 replaces the checkbox-driven catch-up plan with a visual-superiority plan.

This PRD is intentionally stricter than the benchmark. The benchmark requires Aura3D to win 7/10 prompts. PRD 2 targets visual wins on all 10 prompts so scorer noise, agent variance, and raw Three.js improvements do not erase the margin.

## What We Learned

The current Aura3D work did produce real technical progress:

- Agents can now find root-level helpers instead of inventing missing APIs.
- Aura3D prompt apps compile and run more consistently.
- Physics, particles, charts, city, product, humanoid, and mini-golf helpers exist at the public API level.
- Source audits catch unavailable imports and unsafe asset use.

But that progress is insufficient because the benchmark is visual and comparative. The fresh outputs still expose major gaps:

- The humanoid still looks unacceptable. It reads as a crude disconnected puppet, not a character.
- The mini-golf scene looks like toy primitives on a flat green plane, not an interactive game hole.
- The data scene is cleaner than before but still reads like generic pastel bars, not a polished data visualization.
- The material lab is often overexposed, clipped, or staged poorly.
- The neon tunnel can be blown out and visually less controlled than raw Three.js.
- Product staging is better, but still depends on a basic room/plinth composition.
- Many scenes look like "the helper was called" rather than "a designer composed a scene."

PRD 1 failed because it treated "API exists" as meaningful progress. PRD 2 treats only visual outcome as meaningful progress.

## Release Target

Aura3D is not live until a future clean signed benchmark proves all of the following:

- Codex + Aura3D wins at least 7/10 prompts against Codex + raw Three.js.
- Claude + Aura3D wins at least 7/10 prompts against Claude + raw Three.js.
- Each agent gets at least 2 Aura3D wins among prompts 07, 08, and 10.
- No Aura3D visual score is below 4 in the release candidate round.
- At least 7 Aura3D prompt visuals score 5 for each agent, or the human reviewer explicitly signs that the lower scores are still visually superior to raw Three.js.
- Humanoid, mini-golf, data, material lab, and product viewer each score at least 4 for both agents.
- The official run is built from freshly compiled `dist`, not stale package output.

## Non-Negotiable Principles

- Do not run another full benchmark until the visual blockers in this PRD are implemented and smoke-reviewed.
- Do not count "helper exists" as done. Count only screenshot-backed visual quality.
- Do not accept programmer-art humanoids, disconnected limbs, box-body characters, or primitive puppets.
- Do not accept scenes where labels, markers, legends, or helper geometry look like stray artifacts.
- Do not accept blown-out bloom, washed-out white rooms, invisible materials, or black scenes with unreadable detail.
- Do not hide weakness behind curated camera angles. The default agent path must produce a strong screenshot.
- Do not weaken the benchmark bar or fabricate approval.
- Do not create a loop of rerunning prompts without code changes mapped to specific visual failures.

## Fresh Validation Diagnosis

### Prompt 01: Physics Playground

Current state:

- Aura3D now compiles and shows actual cube/ramp/contact evidence.
- The scene still looks like a pile of colored cubes on a basic ramp.
- Debug rods/contact patches can look decorative rather than physically explanatory.

What Three.js can still beat:

- More natural physics composition.
- Cleaner lighting, shadows, and camera.
- More believable collision state and object settling.

Required outcome:

- The default physics playground must read as a polished physics demo: stable stack, falling objects, contact points, trajectory/velocity cues, reset UI, and good lighting.

### Prompt 02: Particle Fountain

Current state:

- Aura3D now produces dense particles.
- The output still looks like many white/pastel points, not a high-quality particle system.

What Three.js can still beat:

- Textured particles, additive glow, trails, turbulence, color over lifetime, and emitter styling.

Required outcome:

- Aura3D particles must look like a real VFX system, not point noise.

### Prompt 03: Solar System

Current state:

- Aura3D is competitive but still prefab-like.
- Labels and orbit rings can look busy or artificial.

What Three.js can still beat:

- Planet shaders, atmosphere glow, sun bloom, shadows, scale cues, and clean label composition.

Required outcome:

- Aura3D solar must feel like a small polished planetarium scene, not labeled primitives.

### Prompt 04: Neon Tunnel

Current state:

- Aura3D can look striking, but bloom/exposure can blow out the tunnel.
- The output can become white/purple overload instead of controlled neon depth.

What Three.js can still beat:

- Tone mapping, bloom restraint, tunnel depth, fog, reflections, and cinematic camera movement.

Required outcome:

- Aura3D neon must have controlled bloom, visible geometry, vanishing-point depth, reflections, and motion cues.

### Prompt 05: 3D Data Visualization

Current state:

- Aura3D improved from broken artifacts to defensible bars.
- It still reads as decorative pastel geometry, not a professional data visualization.

What Three.js can still beat:

- Clean axes, readable labels, crisp hover state, tooltip, chart title, value scale, and visual hierarchy.

Required outcome:

- Aura3D charts must look like a dashboard-quality 3D chart with a real interaction model.

### Prompt 06: Mini-Golf Hole

Current state:

- Aura3D mini-golf still looks like a toy scene.
- Interaction and physics evidence are weak.
- Course geometry is flat, sparse, and not satisfying.

What Three.js can still beat:

- Ball rolling, shot arrow, obstacle collisions, score state, camera follow, course detail, and game feel.

Required outcome:

- Aura3D mini-golf must look and behave like a playable mini-game slice.

### Prompt 07: Material Lab

Current state:

- Aura3D can show five material classes, but staging and exposure are weak.
- Glass/metal/clearcoat can be hard to read.

What Three.js can still beat:

- Physical material response under environment lighting, clean labels, controlled reflections, and inspector-style material parameters.

Required outcome:

- Aura3D material lab must be a physically lit material showroom, not a row of spheres.

### Prompt 08: Procedural City

Current state:

- Aura3D city is one of the stronger helpers.
- It still risks looking like generic towers with repeated vertical window bars.

What Three.js can still beat:

- Facade variation, road markings, sidewalks, traffic, street furniture, volumetric night lighting, and readable day/night transition.

Required outcome:

- Aura3D city must look like a real procedural city block with streets and life, not a cluster of boxes.

### Prompt 09: Animated Primitive Humanoid

Current state:

- This is the most serious visual blocker.
- The humanoid still looks like a crude mannequin.
- Limbs and props can read as detached or bolted-on.
- The result is not visually competitive with even a competent low-poly Three.js character.

What Three.js can still beat:

- Connected skeletons, skinned meshes, joint hierarchy, believable proportions, gait, foot planting, hands/feet, and character silhouette.

Required outcome:

- Aura3D must stop treating the humanoid as independent primitive bars. The default character must be a connected procedural character or built-in skinned low-poly model with real animation.

### Prompt 10: Product Viewer

Current state:

- Aura3D product viewer is one of the stronger outputs.
- The stage can still look like a toy room with white panels.

What Three.js can still beat:

- Clean product photography composition, contact shadow, reflections, material readability, studio lighting, and turntable polish.

Required outcome:

- Aura3D product viewer must look like a product page render, not a sample scene.

## P0 Workstream A: Build And Benchmark Integrity

The official run must never test stale package output.

- [x] A3D2-A001: Add a mandatory benchmark preflight command that runs `pnpm build` before `npm pack`.
- [x] A3D2-A002: Add a tarball audit that extracts the packed package and verifies required helper markers exist in the exact `dist` paths used by consumers.
- [x] A3D2-A003: Add a tarball audit that fails if `packages/engine/src/agent-api/index.ts` is newer than the packed `dist/engine/agent-api/index.js`.
- [x] A3D2-A004: Add a benchmark metadata field recording git SHA, build timestamp, package tarball hash, dist helper hash, and context manifest hash.
- [x] A3D2-A005: Add screenshot timestamp verification so reports cannot accidentally show hour-old PNGs.
- [x] A3D2-A006: Add a "no full benchmark rerun" guard unless a code diff touches one of the failed workstream areas or the user explicitly overrides.
- [x] A3D2-A007: Add a one-command validation workflow: build, pack, setup, generate, capture, contact-sheet, audits, summary.
- [x] A3D2-A008: Add a hard stop after one validation pass. If it fails, record failures and return to implementation.

Acceptance:

- [x] The validation runner refuses to run if `dist` is stale.
- [x] The validation runner prints the exact contact sheet paths before scoring.
- [x] The validation runner records fresh PNG modified times later than the run start.
- [x] The official benchmark cannot start from a dirty or unbuilt package unless explicitly marked as non-release validation.

Evidence note: `benchmark/runner/setup-engine.mjs` runs `pnpm build` before `npm pack` unless `AURA3D_SKIP_PACKAGE_BUILD=1` is paired with explicit non-release validation. `benchmark/runner/tarball-audit.mjs` extracts the packed package, checks required consumer `dist` files and helper markers in `package/dist/engine/agent-api/index.js`, compares source and repo `dist` mtimes, compares packed-vs-repo `dist` hashes, and writes package metadata with git SHA, dirty status, build timestamp, tarball hash, dist helper hash, and context manifest hash. `benchmark/runner/validate-engine-round.mjs` provides the one-command validation flow, writes a one-pass state file that blocks reruns without `AURA3D_ALLOW_VALIDATION_RERUN=1`, runs context verification/setup/capture/contact-sheet generation, records screenshot freshness relative to validation start, writes `screenshot-freshness.json`, prints exact contact sheet paths, and writes `validation-summary.json`. `benchmark/runner/full-benchmark-guard.mjs` refuses official full benchmark reruns from dirty or stale packages unless explicitly marked non-release or overridden, and also requires a relevant workstream diff plus human review notes for release reruns. Validation evidence includes `AURA3D_NON_RELEASE_VALIDATION=1 node benchmark/runner/setup-engine.mjs --round=round-prd2-context-api-1` and `AURA3D_NON_RELEASE_VALIDATION=1 node benchmark/runner/setup-engine.mjs --round=round-prd2-performance-api-1`, both of which built, packed, verified manifests, and passed the tarball audit with fresh `dist`.

## P0 Workstream B: Rendering Quality Foundation

Aura3D cannot beat raw Three.js visually if the renderer defaults are weak.

Visual truth reset (2026-06-01): implementation metadata, node-name QA, nonblank screenshots, and generated human-review templates are not visual acceptance evidence. Any visual row below remains open until a fresh PNG is reviewed by image-based gates and, where required, a human or neutral scorer.

- [x] A3D2-B001: Implement a production color-management preset: linear workflow, sRGB output, ACES or filmic tone mapping, calibrated exposure.
- [x] A3D2-B002: Add scene-category exposure presets for product, material, neon, city-night, city-day, space, physics, chart, and game scenes.
- [x] A3D2-B003: Add an HDR/IBL environment system with shipped procedural or generated environment maps suitable for metal, glass, product, and studio scenes.
- [x] A3D2-B004: Add root API helpers for softbox/rect lights that create physically plausible highlights.
- [x] A3D2-B005: Add contact shadows that work across product, character, mini-golf, material, and physics scenes.
- [x] A3D2-B006: Add ambient occlusion or screen-space/contact occlusion for grounding.
- [x] A3D2-B007: Add bloom with threshold, intensity, radius, and anti-blowout safeguards.
- [x] A3D2-B008: Add fog/depth falloff presets for neon tunnels, city blocks, and particle scenes.
- [x] A3D2-B009: Add anti-aliasing default strong enough for thin labels, axes, and neon rings.
- [x] A3D2-B010: Add screenshot-quality rendering preset that keeps performance reasonable but prioritizes benchmark visual quality.
- [x] A3D2-B011: Add a renderer diagnostic overlay/report with tone mapping, exposure, bloom, shadow, and environment status.

Acceptance:

- [ ] Product and material scenes show readable reflections without blown-out whites.
- [ ] Neon scenes retain visible ring geometry and do not become white screens.
- [ ] Dark scenes keep detail in shadows.
- [ ] Objects visibly sit on surfaces through shadows or occlusion.
- [ ] A neutral reviewer can identify metal, glass, rubber, emissive, and clearcoat without reading labels.

Evidence note: added the public `renderer` namespace with linear/sRGB/ACES color-management metadata, nine scene-category exposure presets, screenshot-quality presets, and `renderer.diagnostics(scene)`. The Three renderer now uses `SRGBColorSpace`, `ACESFilmicToneMapping`, calibrated category exposure, PCF soft shadows, and antialiasing; diagnostics and the overlay report tone mapping, exposure, bloom, shadows, occlusion, and environment status. Added material/product/studio/night/metal/glass IBL presets through `environments.presets()`, `environments.metalStudio()`, and `environments.glassStudio()`. Existing root `lights.rect()`, `lights.softbox()`, `lights.productStudio()`, `lights.materialLab()`, and `shadows.contact()` are covered, and new `effects.ambientOcclusion()`, `effects.contactOcclusion()`, `effects.neonBloom()`, and `effects.depthFog()` provide grounding, anti-whiteout bloom, and depth falloff presets. Focused validation ran `pnpm build`, `node --check benchmark/runner/render-material-quality-smoke.mjs`, and `node benchmark/runner/render-material-quality-smoke.mjs`; the smoke passed color-management, complete exposure preset, IBL preset, material-scene renderer diagnostics, scene evidence renderer report, bloom clamp, screenshot-quality, and material scene-kit QA checks. The neutral reviewer line remains open because it requires explicit human review.

Evidence correction (2026-06-01): the previous evidence note above is structural/API evidence, not rendered visual acceptance evidence. Bloom/postprocess, AO, contact shadow, material distinctness, neon exposure, and humanoid quality rows were reopened because current screenshots and code inspection show metadata/primitive composition, not accepted pixels.

Progress update (2026-06-01): `effects.bloom()` is now consumed by the browser renderer through a real Three.js `EffectComposer` pipeline with `RenderPass` and `UnrealBloomPass`, using the effect node's threshold, intensity, radius, and max-intensity values. This completes the renderer-code portion of A3D2-B007 only; neon/product/material visual acceptance rows remain open until fresh PNGs pass pixel gates and review.

Progress update (2026-06-01): A3D2-B003 is code-complete through preset-specific procedural PMREM/IBL generation in the Three renderer. `environments.studio()`, `materialLab()`, `productHero()`, `nightCinematic()`, `metalStudio()`, and `glassStudio()` now resolve to distinct generated reflection scenes with softbox/contrast-card profiles instead of all collapsing to one generic room environment. This is renderer implementation evidence only; product/material reflection acceptance rows remain open until fresh PNGs and neutral review prove the result.

Progress update (2026-06-01): the browser renderer now routes requested postprocess effects through a pixel-backed composer path instead of treating them as metadata. The path uses `RenderPass`, optional `SSAOPass` for ambient/contact occlusion requests, optional `UnrealBloomPass`, optional `OutputPass`, ACES/sRGB renderer settings, and a `ShadowMaterial` contact receiver for contact-occlusion scenes. Fake additive bloom halo sprites now run only as a fallback when the real composer is unavailable, so they cannot stack on top of real bloom and create false whiteout. The renderer also plays GLB animation clips with `THREE.AnimationMixer`, which is required before an authored humanoid asset can replace the primitive placeholder. These complete B005/B006/B008/B010/B011 as renderer-code rows only. Visual acceptance rows remain open until fresh PNGs prove product/material grounding, readable reflections, non-white neon, dark-scene detail, and human material identification.

Progress update (2026-06-01): renderer diagnostics were tightened so structural scene metadata can no longer masquerade as pixel proof. `renderer.diagnostics(scene)` now reports requested postprocess passes as a plan with `runtimeStatus: "not-mounted"`, `pixelBacked: false`, and empty `actualPasses`. `createAuraApp(...).diagnostics()` is updated by the mounted browser renderer with actual initialized pass names, composer fallback names, contact-shadow receiver status, runtime PMREM status, and warnings when a requested pass did not initialize. Validation: `pnpm typecheck` passed, and the isolated renderer-diagnostics unit assertion passed. The full `tests/unit/agent-api/agent-api.test.ts` file still has unrelated stale expectation failures for existing particle/neon/mini-golf/city/product defaults, so those results were not used as visual acceptance evidence.

## P0 Workstream C: Material System Upgrade

Material quality is currently too easy for raw Three.js to beat.

- [x] A3D2-C001: Expose MeshPhysicalMaterial-class controls at the safe API level: metalness, roughness, clearcoat, clearcoatRoughness, transmission, thickness, ior, sheen, iridescence, anisotropy, emissive, normal, and envMap intensity.
- [x] A3D2-C002: Add high-quality material presets: chrome, brushed metal, frosted glass, clear glass, black rubber, matte clay, ceramic, glowing emissive, clearcoat paint, sneaker mesh, sneaker rubber, fabric.
- [x] A3D2-C003: Add procedural normal/roughness texture helpers for fabric, rubber, brushed metal, and plastic.
- [x] A3D2-C004: Add material swatch plinths with labels, reflection cards, and controlled backdrop.
- [x] A3D2-C005: Add material inspector UI helper with live parameter values.
- [x] A3D2-C006: Add material visual QA that flags if material classes are visually indistinguishable in the capture.

Acceptance:

- [ ] Material lab default scores at least 4 before labels are considered.
- [ ] Chrome reflects environment shapes.
- [ ] Glass is visibly transparent with highlights/refraction cues.
- [ ] Rubber is rough and non-reflective.
- [ ] Emissive visibly glows without destroying exposure.
- [ ] Clearcoat shows layered specular highlight.

Evidence note: expanded `AuraMaterialSpec` with safe MeshPhysicalMaterial-class controls including `metalness`, `sheen`, `iridescence`, `anisotropy`, procedural/typed `normal`, roughness/metalness texture inputs, and environment intensity while preserving `metallic` compatibility. Added material presets `chrome`, `brushedMetal`, `frostedGlass`, `clearGlass`, `blackRubber`, `matteClay`, `ceramic`, `glowingEmissive`, `clearcoatPaint`, `sneakerMesh`, `sneakerRubber`, and `fabric`, plus `material.proceduralTextures.fabric/rubber/brushedMetal/plastic()`. The Three material bridge now maps physical controls and generated procedural textures into MeshPhysicalMaterial/MeshStandardMaterial fields. Added `material.inspector()` for live parameter values and `material.visualQA()` for class distinctness, reflection-card, transparency/refraction, rough rubber, emissive glow, and clearcoat layered-highlight checks. `sceneKits.materialLab()` now includes material-lab IBL, rect/softbox lighting, contact occlusion, and material distinctness QA. Focused validation ran `node benchmark/runner/render-material-quality-smoke.mjs`, which passed with material QA score 5, five classes detected, 7 reflection cards, chrome/glass/rubber/emissive/clearcoat cue checks true, minimum material feature distance 0.348, and material scene-kit visual score 5.

Progress update (2026-06-01): material QA is now covered at both scene-graph and capture-gate levels. `material.visualQA(sceneKits.materialLab().nodes)` detects chrome/glass/rubber/emissive/clearcoat class coverage and cue separation, while `benchmark/runner/visual-qa-gates.mjs` rejects material-lab captures that lack colored swatch/emissive pixels, multiple material color families, central swatch geometry/detail, or highlight/shadow contrast. Built-runtime verification passed with material QA score 5, classes `chrome`, `glass`, `rubber`, `emissive`, and `clearcoat`, and no material QA problems. Screenshot visual-score rows remain open until a fresh PNG and human review prove the materials read correctly without labels.

## P0 Workstream D: Character And Humanoid System

This is the largest blocker. The current humanoid is not acceptable.

Requirement:

Aura3D must ship a character system that produces a visually coherent animated humanoid without agents hand-placing disconnected primitives.

- [x] A3D2-D001: Deprecate the current benchmark-facing primitive humanoid as the default output.
- [x] A3D2-D002: Add `character.lowPolyHumanoid()` that returns a connected, skinned, low-poly humanoid mesh or generated mesh hierarchy.
- [x] A3D2-D003: Add a built-in procedural human mesh generator: torso, pelvis, neck, head, upper/lower arms, upper/lower legs, hands, feet, shoulders, hips.
- [x] A3D2-D004: Replace box/bar limbs with capsules, tapered cylinders, or generated mesh limbs.
- [x] A3D2-D005: Add shoulder/hip sockets that visually connect limbs to the torso.
- [x] A3D2-D006: Add wrists, hands, ankles, and feet. Do not use floating rods as arms.
- [x] A3D2-D007: Add a simple face or head orientation cue so the character reads as a person.
- [x] A3D2-D008: Add clothing or color zones that make the silhouette readable.
- [x] A3D2-D009: Add a real skeleton/joint hierarchy with transforms around anatomical joint anchors.
- [x] A3D2-D010: Add procedural gait clips: idle, walk, run, wave, turn-in-place, and benchmark-pose.
- [x] A3D2-D011: Add foot planting so feet contact the ground during screenshot capture.
- [x] A3D2-D012: Add root motion and body bob that move the torso as one connected body.
- [x] A3D2-D013: Add IK or constraint correction to prevent elbows, knees, shoulders, and hips from disconnecting.
- [x] A3D2-D014: Add deterministic capture pose selection that avoids broken in-between frames.
- [x] A3D2-D015: Add character shadow/contact grounding.
- [x] A3D2-D016: Add character path/stride markers that support the animation but do not mask bad anatomy.
- [x] A3D2-D017: Add `character.visualQA()` thresholds that fail detached limbs, impossible proportions, missing feet, floating hands, and disconnected torso chains.
- [x] A3D2-D018: Add a browser visual smoke test that compares two animation frames and confirms the character stays connected.
- [x] A3D2-D019: Add a neutral human review gate specifically for humanoid. This cannot be auto-checked.

Acceptance:

- [ ] The humanoid screenshot reads as a connected character at thumbnail size.
- [ ] No limb visibly floats away from the torso.
- [ ] No shoulder, elbow, hip, knee, wrist, or ankle has a daylight gap unless intentionally stylized by a joint.
- [ ] The character has hands and feet.
- [ ] The character casts or receives a grounding shadow.
- [ ] The walk pose does not look like an exploded primitive assembly.
- [ ] Human reviewer writes: "This no longer looks like placeholder programmer art."
- [ ] Neutral scorer visual score is at least 4 for both Codex and Claude outputs.

Evidence note: added character.lowPolyHumanoid() and prefabs.lowPolyHumanoid() backed by the existing hierarchical humanoid generator, added a deterministic benchmark-pose clip, added centered low-poly socket/cuff connectors, tightened character.visualQA() checks for wrist-hand and ankle-foot gaps, moved the repair smoke harness and agent docs/context to the low-poly helper, and added humanoid structural QA into the two-frame browser smoke summary. The focused smoke harness regenerated `/tmp/aura3d-task12-repair-smoke/humanoid-frame-1.png` with connected humanoid diagnostics score 5 for both frames. A3D2-D019 remains open because it requires a neutral human reviewer.

Progress update (2026-06-01): `character.lowPolyHumanoid()` no longer routes through `createHierarchicalPrimitiveHumanoid()` / `prefabs.primitiveHumanoid()` as the default benchmark-facing output. The new default is a cohesive generated low-poly body layout with debug joints and motion trails disabled by default, explicit head/face cues, clothing zones, shoulder/hip sockets, connected arms/legs, hands/feet, contact shadow, and a minimal stride marker. This completes the listed code-level default-output rows only. The authored/skinned mesh requirement, animation/IK rows, screenshot acceptance rows, neutral scorer rows, and human review rows remain open until a fresh rendered PNG and reviewer evidence prove the character no longer reads as placeholder programmer art.

Progress update (2026-06-01): `character.lowPolyHumanoid()` now defaults to a bundled typed skinned humanoid GLB instead of a procedural primitive puppet. The asset is the existing Aura3D mini-game player fixture promoted into `packages/engine/src/agent-api/assets/player-fixture.glb`; GLB inspection shows 74 nodes, 14 meshes, 2 skins, and 14 embedded clips including `Idle`, `Walking`, `Running`, `Standing`, and `Wave`. `sceneKits.humanoidWalk()` uses this authored model by default, maps Aura clip names to embedded GLB clips, adds deterministic benchmark capture timing, contact shadow/contact-occlusion grounding, and relies on the renderer's `THREE.AnimationMixer` support to play the actual asset animation. The old procedural body remains available only as a `style: "simple"` fallback/debug path. This completes the code-level replacement, skeleton, clip, and deterministic-pose rows. D003, D011-D013, D018-D019 and all screenshot/human acceptance rows remain open until fresh rendered PNGs prove the character no longer reads as placeholder programmer art.

Progress update (2026-06-01): `character.visualQA()` now validates the authored humanoid model path and still validates the primitive fallback without requiring optional debug joint spheres. It checks authored asset bounds, embedded animation clips, active clip assignment, shadow participation, contact grounding, primitive limb detachment, missing feet, missing hands, and impossible primitive proportions. Focused validation ran `pnpm exec vitest run tests/unit/agent-api/agent-api.test.ts --reporter=dot` and passed 33/33 tests after updating stale assertions to the current PRD2 defaults. This completes D017 as a code-level QA row only; screenshot, browser frame comparison, neutral human review, and visual-score rows remain open.

Progress update (2026-06-01): authored humanoid motion metadata now explicitly covers foot planting, root motion/body bob, and skeleton constraint correction. `character.lowPolyHumanoid({ clip: "benchmark-pose" })` sets the GLB animation capture time to a planted-foot frame, records planted-foot/groundY evidence, records connected root-motion/body-bob evidence, and records corrected spine/arm/leg chains with a max joint-gap budget. `character.visualQA()` now fails authored humanoids that omit this motion/constraint metadata. Focused validation passed the bundled-skinned-GLB unit assertion. This completes D011-D013 as code-level implementation rows only; D018-D019 and all screenshot/human acceptance rows remain open.

Progress update (2026-06-01): D018 is code-complete in the smoke/gate infrastructure. `benchmark/runner/task12-repair-smoke.mjs` captures `humanoid-frame-1.png` and `humanoid-frame-2.png` from the browser route, while `benchmark/runner/visual-qa-gates.mjs` now includes explicit `humanoidFrameContinuityChecks`: both frames must exist, each frame must pass humanoid connected-pixel heuristics for anatomy edges, silhouette range, skin/head/hand pixels, clothing/body pixels, and lower-body/foot pixels, and the two frames must pass the humanoid animation-delta comparison. This is still not human acceptance; D019 and all humanoid screenshot/reviewer acceptance rows remain open until fresh PNGs and review exist.

Progress update (2026-06-01): D003 is code-complete as a built-in procedural mesh descriptor generator, not as the benchmark default. `character.proceduralHumanMesh()` emits vertex/index mesh parts for torso, pelvis, neck, head, shoulders, hips, upper/lower arms, upper/lower legs, hands, and feet, plus skeleton/clip/evidence metadata. `character.lowPolyHumanoid()` still defaults to the authored skinned GLB so benchmark scenes do not fall back to procedural programmer-art primitives.

Progress update (2026-06-01): D019 is complete as gate infrastructure only. `benchmark/runner/visual-qa-gates.mjs` now emits and requires a dedicated `humanoidReview` section in `human-review.json` with `reviewerType: "neutral-human"`, `reviewerAffiliation: "independent"`, explicit confirmation that the reviewer is not the author or an agent, thumbnail readability, no detached limbs, no broken joint chains, visible hands/feet, visible grounding shadow, score at least 4, and the required statement: "This no longer looks like placeholder programmer art." The gate also allows that exact required sentence without treating the word "placeholder" as contradictory rejection language. Validation passed `node --check benchmark/runner/visual-qa-gates.mjs`, `pnpm typecheck`, `pnpm build`, and `node benchmark/runner/visual-qa-gates.mjs --mode=structural --requireHumanReview=false` against an empty round. This does not close any humanoid screenshot acceptance rows; those remain open until fresh PNGs and a real neutral human review file satisfy the gate.

## P0 Workstream E: Physics And Game Feel

Current physics is useful but not visually convincing enough across prompts.

- [x] A3D2-E001: Select and integrate a real rigid-body backend for benchmark-visible physics. Prefer a proven engine over hand-rolled demos.
- [x] A3D2-E002: Keep a JS fallback if the chosen backend uses WASM, but benchmark scenes must use the more physically convincing backend by default.
- [x] A3D2-E003: Add stable stacking, rolling, sliding, friction, restitution, mass, damping, and sleep states.
- [x] A3D2-E004: Add debug visualization for contacts, normals, trajectories, and active/sleep states that looks intentional.
- [x] A3D2-E005: Add scene-to-physics binding for ramps, walls, cups, obstacles, and plinths.
- [x] A3D2-E006: Add physics-to-scene binding for simulated object transforms.
- [x] A3D2-E007: Add deterministic replay and capture time.
- [x] A3D2-E008: Add raycast and spherecast helpers.
- [x] A3D2-E009: Add constraints/joints for future characters, chains, and mechanical demos.
- [x] A3D2-E010: Add a polished physics playground scene kit with falling cubes, settled pile, ramp, reset, contact counter, and explanatory visual cues.

Mini-golf requirements:

- [x] A3D2-E020: Replace flat toy mini-golf with a complete course kit.
- [x] A3D2-E021: Add ball rolling physics with tuned friction and wall bounce.
- [x] A3D2-E022: Add aim arrow, power meter, shot line, and pointer-drag input.
- [x] A3D2-E023: Add cup sensor and scoring state.
- [x] A3D2-E024: Add obstacle collision feedback driven by real contacts.
- [x] A3D2-E025: Add camera follow after shot and overview reset.
- [x] A3D2-E026: Add course geometry: rails, bevels, cup rim, flag, obstacle, start marker, score UI, and surface variation.
- [x] A3D2-E027: Add deterministic benchmark pose: ball, aim arrow, obstacle, cup, and score all visible.

Acceptance:

- [ ] Physics playground visual score is at least 4 for both agents.
- [ ] Mini-golf visual score is at least 4 for both agents.
- [ ] Mini-golf screenshot shows ball, cup, aim/power state, score, obstacle, and course boundaries.
- [ ] No mini-golf scene looks like random primitives on a flat green plane.

Evidence note: integrated `cannon-es` as the default `PhysicsWorld` backend with an `aura-js` fallback, surfaced backend selection in physics snapshots and engine summaries, kept raycast/spherecast/constraints APIs, and verified runtime behavior with a built physics smoke that reported `backend.active="cannon-es"`, a sphere resting on a plane after 90 steps, one live contact, and sleep state. Mini-golf now exposes `prefabs.miniGolfCourse()`, course surface variation, front gate rails, bevel highlights, start chevrons, score/backend badges, raised cup rim, deterministic replay metadata, Cannon-backed state snapshots, contact-driven obstacle feedback, aim/power UI, cup scoring, and follow-camera target evidence. 
Progress update (2026-06-01): `prefabs.physicsPlayground()` now presents the default physics scene as a cleaner lab-style ramp/catch-tray composition with a polished contact floor, transparent catch walls, subtle contact patches, fewer/smaller normal vectors, HUD contact-counter text, overhead softbox lighting, contact occlusion, deterministic falling cubes, and a settled pile. This completes the code-level intentional-debug-visualization and polished-scene-kit rows only. Physics visual score and prompt-level rendered acceptance remain open until fresh `physics-playground.png` evidence is captured and reviewed.

Visual-score and rendered-screenshot acceptance remain open until a rendered mini-golf capture is scored.

Progress update (2026-06-01): `prefabs.miniGolfHole()` no longer defaults to the prior flat-green/toy-course layout. The default course now includes shaped fairway lanes, boundary rails with bevel highlights, sand/water hazards, a windmill obstacle, tee mat, ball, aim ring/line, power meter, cup/hole/rim, flag, shot-preview markers, HUD score/shot text, and drag/impulse interactions. This completes the code-level course-kit/geometry/benchmark-pose rows only. Mini-golf visual score, screenshot proof, human review, and playable-scene acceptance remain open until fresh captures pass review.

Progress update (2026-06-01): public scene/physics binding now syncs rotations as well as positions. `ScenePhysicsBridge` accepts quaternion rotation on bound scene nodes, pushes kinematic node rotation into bodies, pulls dynamic body rotation back to nodes using shortest-path normalized interpolation, and `physics.worldFromScene(...)` now binds dynamic/kinematic authored scene nodes back to the public bridge so stepped worlds update source-node `position`, Euler `rotation`, and `physicsRotation`. Validation: `pnpm typecheck` passed, `node --check benchmark/runner/visual-qa-gates.mjs` passed, and focused rotation binding tests passed via `pnpm exec vitest run tests/unit/physics/scene-physics-bridge.test.ts tests/unit/agent-api/agent-api.test.ts -t "scene-bound physics world|public scene-bound physics world|scene physics bridge" --reporter=dot`. Mini-golf browser pointer playability remains open because current public scene-kit evidence is still state-backed/programmatic plus interaction metadata, not a mounted pointer-input proof.

Progress update (2026-06-01): mounted mini-golf scenes now have a real browser runtime bridge instead of only interaction metadata. The Three renderer detects the `white physics golf ball` drag/click interaction nodes, installs canvas pointer handlers, converts drag distance into a shot vector/power through `games.miniGolfPointerShot(...)`, drives `games.createMiniGolfState()` as the single source of truth for shots/ball position/score/cup state, publishes `window.__AURA3D_MINI_GOLF__` plus canvas data attributes for runtime inspection, and updates the rendered ball/aim/follow objects during the render loop. Generic runtime physics is disabled for this specific mini-golf scene so it does not fight the mini-golf state world. Validation: `pnpm typecheck` passed, the focused mini-golf state/pointer helper test passed via `pnpm exec vitest run tests/unit/agent-api/agent-api.test.ts -t "simulates mini-golf shot" --reporter=dot`, and `pnpm build` passed. Rendered mini-golf visual score, browser pointer-input screenshot proof, and human review remain open until fresh captures and review exist.

## P0 Workstream F: VFX And Particles

Point clouds are not enough.

- [x] A3D2-F001: Implement a GPU or batched particle renderer with textured billboards.
- [x] A3D2-F002: Add particle material modes: additive glow, soft alpha, spark, smoke, splash, dust, star.
- [x] A3D2-F003: Add color-over-life, size-over-life, alpha-over-life, velocity-over-life, and gravity curves.
- [x] A3D2-F004: Add noise/turbulence fields.
- [x] A3D2-F005: Add collision/splash cues for fountain particles hitting the ground.
- [x] A3D2-F006: Add emitter meshes: nozzle, ring, cone, fountain base, vent, portal.
- [x] A3D2-F007: Add particle trails and streaks for motion evidence.
- [x] A3D2-F008: Add emission-rate UI helper wired to real emitter state.
- [x] A3D2-F009: Add particle budget diagnostics: count, draw calls, update cost.

Acceptance:

- [ ] Particle fountain visual score is at least 4 for both agents.
- [ ] Fountain screenshot shows dense upward flow, color/lifetime variation, emitter base, ground/collision context, and emission-rate UI.
- [ ] The fountain does not look like white point noise.

Evidence note: added particle material modes, textured billboard defaults, size/alpha/velocity-over-life defaults, turbulence/noise fields, sprite texture generation for Three.js particles, four layered fountain effects, emitter base/nozzle/portal/vent meshes, splash/contact/trail cues, emission-rate UI markers, and `particles.diagnostics()`. A focused built-runtime check verified `prefabs.particleFountain({ count: 2200, emissionRate: 180 })` contains the required emitter/UI/trail/budget evidence nodes and `particles.diagnostics()` reports 4 particle effects, 4,444 total particles, four estimated draw calls, four textured billboard layers, and modes `additive-glow`, `splash`, `smoke`, and `star`. Rendered visual-score acceptance remains open until screenshot review/scoring is run.

Progress update (2026-06-01): the browser renderer now consumes `texturedBillboard` particle effects through `THREE.InstancedMesh` plane sprites with generated sprite textures, per-instance color, per-life sizing, material-mode blending, turbulence/noise-driven positions, and gravity/ground-collision position updates. The non-textured path remains a fallback. This completes the renderer-backed portions of F001-F004; fountain screenshot score, point-noise rejection, and human/neutral acceptance remain open until fresh PNG evidence is captured and reviewed.

Progress update (2026-06-01): built-runtime verification now confirms the remaining particle code rows. `prefabs.particleFountain({ count: 2200, emissionRate: 180 })` exposes splash/collision cues, nozzle/emitter/portal/vent meshes, trail/streak evidence, emission-rate UI/slider evidence, and `particles.diagnostics()` reports 4 particle effects, 4,444 total particles, 4 estimated draw calls, 0.96 ms estimated update cost, 4 textured billboard layers, modes `additive-glow`, `smoke`, `splash`, and `star`, and `gpuReady: true`. This completes F005-F009 as code/diagnostic rows only. Fountain screenshot score, point-noise rejection, and human visual review remain open.

## P0 Workstream G: Data Visualization System

The chart helper must become a real chart system.

- [x] A3D2-G001: Add `charts.barGrid3D()` as a semantic chart API, not only a prefab.
- [x] A3D2-G002: Add axis layout: X labels, Z labels, Y ticks, title, subtitle, units, and value range.
- [x] A3D2-G003: Add high-quality text rendering for axis labels and values.
- [x] A3D2-G004: Add hover/raycast selection that changes bar color, cap, outline, and readout.
- [x] A3D2-G005: Add a grounded legend with swatches and value mapping.
- [x] A3D2-G006: Add chart camera presets that keep the 6x6 grid readable.
- [x] A3D2-G007: Add dashboard-quality theme presets: dark analytics, light analytics, neon analytics.
- [x] A3D2-G008: Add no-stray-geometry visual QA that fails floating labels, detached ticks, cobweb lines, and orphaned planes.
- [x] A3D2-G009: Add modifiability API for changing dataset, selected cell, color scale, title, and units.

Acceptance:

- [ ] Data chart visual score is at least 4 for both agents.
- [ ] Screenshot shows a readable 6x6 bar grid, axis labels, ticks, title, grounded legend, and highlighted selected cell.
- [ ] No floating orphan geometry appears.
- [ ] Hover state is visibly different from default.

Evidence note: extended `charts.barGrid3D()` / `charts.dataBars3D()` with dataset, selected-cell, title, subtitle, units, value-range, theme, and color-scale options; added `charts.configure()`, `charts.withDataset()`, `charts.themes()`, `charts.cameraPreset()`, and `charts.visualQA()`. The chart now emits title/subtitle/unit labels and selected value callouts in addition to the existing axis labels, ticks, legend swatches, selected outline, cap highlight, hover leader, and readout. A focused built-runtime check verified a 6x6 dataset chart with `theme="neon-analytics"` and selected row 4 / col 6 has QA score 5, 36 bars, 23 label/evidence nodes, 3 legend swatches, 1 selected outline, no QA problems, and no missing title/subtitle/value labels. Rendered screenshot and visual-score acceptance remain open until browser capture/scoring is run.

Progress update (2026-06-01): the data smoke route now uses `sceneKits.dataViz({ dataset })` with a deterministic 6x6 dataset and row 4 / col 6 value `100`, while `prefabs.dataBars3D()` now adds larger chart/title/axis/legend labels, a grounded dashboard legend panel, stronger summary labels, and lower bloom/overbright emphasis. The visual gate also now has data-only obvious-failure checks for central bar/axis detail, title/legend detail, chart color, and hover-state contrast. This completes G002, G003, and G005 as code-level chart layout/readability/legend work only. Data visual score, screenshot acceptance, hover interaction proof, and human review remain open until fresh captures are reviewed.

Progress update (2026-06-01): `sceneKits.dataViz()` now declares a real hover interaction for the selected row 4 / col 6 bar, and the Three renderer mounts a canvas pointer/raycast hover runtime for requested hover targets. Hover-target primitives are kept out of static primitive batching so the runtime can mutate the actual Three object, publish `window.__AURA3D_HOVER__`, and set `data-aura-hover-*` canvas attributes. This is mounted runtime code evidence only; hover screenshot proof and human visual acceptance remain open until fresh PNGs demonstrate the interaction state.

## P0 Workstream H: Neon And Cinematic Scene System

The current neon output is visually loud but not reliably good.

- [x] A3D2-H001: Add a cinematic tunnel scene kit with real tube geometry, receding rings, rails, floor/wall surfaces, and vanishing-point composition.
- [x] A3D2-H002: Add controlled bloom presets with anti-whiteout limits.
- [x] A3D2-H003: Add reflective floor/wall surfaces for neon.
- [x] A3D2-H004: Add volumetric/fog depth cues.
- [x] A3D2-H005: Add speed streaks and particle motes.
- [x] A3D2-H006: Add camera flythrough with deterministic capture frame.
- [x] A3D2-H007: Add palette presets that are not over-dominated by one hue.
- [x] A3D2-H008: Add visual QA for overexposure and tunnel-depth readability.

Acceptance:

- [ ] Neon visual score is at least 4 for both agents.
- [ ] Screenshot shows a clear tunnel, foreground/mid/background ring depth, reflections or fog, and controlled bloom.
- [ ] The tunnel is not blown out to white.

Evidence note: implemented `prefabs.neonTunnel()` options, the public `neon` namespace, palette presets, anti-whiteout bloom preset controls, reflective floor/wall cues, fog depth cues, speed streaks, particle motes, deterministic camera flythrough capture time, and `neon.visualQA()`. Focused validation ran `pnpm build`, verified `neon.visualQA()` score 5 with 56 ring/depth elements, fog, bloom, reflections, depth cues, no overexposure problems, and then ran the non-release packed tarball setup/audit for `round-prd2-neon-api`, which found the `neon` marker in packed `dist/engine/agent-api/index.js`. Rendered screenshot and human visual-score gates remain open until screenshot review/scoring is run.

Progress update (2026-06-01): neon defaults now clamp benchmark rings lower, reduce emissive intensities inside the tunnel prefab, route smoke capture through `sceneKits.neonTunnel()`, avoid injecting strong fallback lights into emissive bloom scenes, and feed bloom nodes into the real Three.js composer path. H002 is complete as renderer/default code. H008 and all neon screenshot/human visual acceptance rows remain open until fresh PNGs prove controlled bloom and tunnel depth.

Progress update (2026-06-01): neon overexposure/depth QA is now code-complete. `neon.visualQA(sceneKits.neonTunnel().nodes)` passes with score 5, no overexposure risk, depth cues present, bloom/fog/reflection evidence present, and ring-depth evidence present. The PNG gate also rejects neon captures when average luma or overexposed-pixel ratio indicates uncontrolled bloom. This completes H008 as a code/gate row only. Neon screenshot and human visual-score rows remain open until fresh PNGs prove controlled bloom and tunnel depth.

## P0 Workstream I: Procedural City System

City is stronger than most, but it must become a clear win.

- [x] A3D2-I001: Add modular facade generator: windows, frames, ledges, roofs, doors, storefronts, balconies.
- [x] A3D2-I002: Add road system: lanes, sidewalks, curbs, crosswalks, intersections, lane markings.
- [x] A3D2-I003: Add city props: streetlights, traffic lights, signs, benches, trees, cars.
- [x] A3D2-I004: Add night state: emissive windows, streetlight pools, headlights, sky color, moon or city glow.
- [x] A3D2-I005: Add day state: sun, sky, shadows, non-emissive windows, readable roads.
- [x] A3D2-I006: Add real day/night toggle controller that mutates the 3D scene.
- [x] A3D2-I007: Add instancing for windows, props, road markings, and lights.
- [x] A3D2-I008: Add camera presets: overview, street-level, cinematic night.
- [x] A3D2-I009: Add city visual QA: minimum building count, window count, street count, crosswalk count, light count, day/night changed-state evidence.

Acceptance:

- [ ] City visual score is at least 4 for both agents.
- [ ] Screenshot shows about 20 buildings, readable streets, windows, crosswalks, lights, and scale cues.
- [ ] Day/night toggle changes actual sky, lighting, windows, and streetlights.

Evidence note: expanded `prefabs.cityBlock()` with modular window columns, separate frame rails/mullions/ledges, roof caps, storefronts, awnings, balconies, road lanes, sidewalks, curbs, crosswalks, dashed lane markings, bike-lane paint, turn arrows, streetlights, traffic signals, signs, benches, trees, cars, night moon/glow state, and day sun/haze state. Added `city.scene()`, `city.cameraPreset()`, `city.cameras()`, `city.instancing()`, day/night controller revision/change evidence, and `city.visualQA()`. Focused validation ran `pnpm build` and a built-runtime check: QA score 5 with 20 buildings, 80 window columns, 20 crosswalk stripes, 28 day-scene light cues, 91 props, 204 facade detail nodes, day/night changed-state evidence, instancing evidence for windows/props/road markings/lights, camera modes `orbit`, `perspective`, and `dolly`, and a city scene snapshot with 448 nodes. Rendered screenshot and human visual-score gates remain open until screenshot review/scoring is run.

## P0 Workstream J: Product Viewer And Asset Presentation

Product viewer is close, but it must look shipped.

- [x] A3D2-J001: Add product photography stage preset: cyclorama, softboxes, rim light, fill light, reflection cards.
- [x] A3D2-J002: Add auto-center, auto-scale, and plinth-seat based on model bounds.
- [x] A3D2-J003: Add contact shadow from product footprint.
- [x] A3D2-J004: Add material-readability lighting for sneaker mesh, rubber sole, laces, and detail.
- [x] A3D2-J005: Add clean hero mode with no decorative inspection clutter.
- [x] A3D2-J006: Add optional inspection mode with labels and bounds, disabled by default for benchmark product scenes.
- [x] A3D2-J007: Add deterministic turntable capture frame.
- [x] A3D2-J008: Add orbit and turntable diagnostics.
- [x] A3D2-J009: Add typed asset provenance badge/report, but do not put noisy provenance text over the product render unless requested.

Acceptance:

- [ ] Product visual score is at least 4 for both agents.
- [ ] Sneaker is centered, scaled, seated on plinth, lit, and visually readable.
- [ ] Stage looks like product photography, not a box room.
- [x] Asset audit passes with zero invented paths.

Progress update (2026-06-01): product hero defaults no longer render the previous box-room wall/card/softbox clutter in benchmark-facing hero mode. `prefabs.productStage()` now builds a cleaner matte floor/backdrop/plinth/contact-shadow composition, moves softbox/reflection-card/material-readability cues into off-camera lights, keeps visible studio cards behind `inspection` mode, and `task12-repair-smoke` keeps product capture on `sceneKits.productViewer(assets.sneaker)`. Product screenshot/human/neutral acceptance remains open until fresh PNGs prove the stage reads as product photography, not a box room.

Progress update (2026-06-01): product footprint/contact and material-readability rows are now code-complete. `sceneKits.productViewer(typedProduct).nodes` includes `soft product contact shadow from footprint`, centered/seated placement diagnostics, turntable/orbit evidence, and three off-camera material-readability lights for sneaker mesh grazing, lace detail fill, and rubber sole rim/kicker. `product.visualQA()` was updated to recognize the cleaner hero path instead of requiring old visible inspection cards; built-runtime verification passes with contact shadow count 1, material readability cue count 3, reflection-card cue count 2, orbit enabled, turntable enabled, and no product QA problems. Product screenshot/human/neutral acceptance remains open until fresh PNGs prove the stage reads as product photography, not a box room.

Evidence update (2026-06-01): product asset-audit acceptance is complete for existing round-14 Aura outputs. `benchmark/runs/round-14-validation/codex-aura3d/prompt-10/asset-audit.json` and `benchmark/runs/round-14-validation/claude-aura3d/prompt-10/asset-audit.json` both report `inventedAssetPaths: 0`, no failures, generated `src/aura-assets` evidence, typed sneaker asset usage, no `unsafeModelUrl`, and canonical asset hash matching. This closes only the asset-audit rows; product screenshot and human visual acceptance remain open.

## P0 Workstream K: Solar And Labels

Solar scenes need polish and annotation quality.

- [x] A3D2-K001: Add planet material presets: rocky, gas giant, ice, moon, ringed planet, lava/venus style.
- [x] A3D2-K002: Add sun shader with bloom and corona.
- [x] A3D2-K003: Add orbit rings with smooth curves and depth fading.
- [x] A3D2-K004: Add attached labels that stay readable and do not collide.
- [x] A3D2-K005: Add label leader lines with consistent thickness and anchoring.
- [x] A3D2-K006: Add starfield and dust background.
- [x] A3D2-K007: Add whole-system camera framing.
- [x] A3D2-K008: Add orbit animation with deterministic capture phase.

Acceptance:

- [ ] Solar visual score is at least 4 for both agents.
- [ ] Screenshot shows sun, six planets, orbit paths, labels, starfield, and scale/depth cues.
- [ ] Labels do not look like stray boxes or bars.

Progress update (2026-06-01): `prefabs.solarSystem()` now reduces default orbit clutter by lowering orbit segment count and opacity, thinning segment geometry, lowering sun bloom/glow intensity, keeping a darker space backdrop, and making attached labels/leader lines smaller and less box-like while retaining screenshot-visible planet/orbit/label evidence. The smoke runner also records solar capture intent/timing and the visual gate now has solar-specific smoke guards. This completes K003-K005 as code-level default/label/orbit work only. Solar visual score, fresh screenshot proof, readable-label acceptance, and human review remain open until `solar-system.png` is captured and reviewed.

Progress update (2026-06-01): A3D2-K002 is code-complete through explicit `material.solarSun()` and `material.solarCorona()` shader material helpers, a Three `ShaderMaterial` render path for solar sun/corona materials, and a tuned solar bloom pass. `solar.visualQA()` now requires shader-tagged sun/corona materials plus bloom instead of accepting only node names. Solar visual acceptance remains open until fresh `solar-system.png` evidence is captured and reviewed.

## P1 Workstream L: Agent-Facing Scene Kits

Agents should not be expected to compose benchmark-winning visuals from low-level primitives.

- [x] A3D2-L001: Create scene kits instead of loose prefabs: `sceneKits.physicsPlayground`, `sceneKits.particleFountain`, `sceneKits.solarSystem`, `sceneKits.neonTunnel`, `sceneKits.dataViz`, `sceneKits.miniGolf`, `sceneKits.materialLab`, `sceneKits.cityBlock`, `sceneKits.humanoidWalk`, `sceneKits.productViewer`.
- [x] A3D2-L002: Each scene kit returns scene nodes, camera, lights, effects, interactions, UI, diagnostics, and acceptance evidence.
- [x] A3D2-L003: Each scene kit supports small prompt-required edits without agents rebuilding systems.
- [x] A3D2-L004: Add `sceneKits.<name>().toAppOptions()` for one-call strong defaults.
- [x] A3D2-L005: Add `sceneKits.<name>().customize(...)` for dataset, colors, camera, time of day, particle count, material settings, and animation state.
- [x] A3D2-L006: Update `llms.txt` to push agents toward scene kits first, then prefabs, then low-level primitives.
- [x] A3D2-L007: Add fresh-package snippet tests for every scene kit.

Acceptance:

- [x] Each benchmark prompt can be answered in less than 80 maintained LOC using the relevant scene kit.
- [ ] Each scene kit renders a visually acceptable default without extra CSS or camera tuning.
- [x] Agents no longer need to hand-roll physics, chart, game, character, or city systems.

Progress update (2026-06-01): fresh-package scene-kit coverage is now verified by `pnpm verify:package-install-smoke:fresh`. The packed tarball installs into a clean external npm project, imports the root public API, instantiates all ten `sceneKits.*` one-call paths, exercises `customize(...)` and `toAppOptions()`, uses `defineAuraAssets(...)` for the product viewer instead of string asset ids, and compiles the same scene-kit calls through a Vite browser build. Local snippet coverage also passed via `pnpm benchmark:scene-kits`, with all ten benchmark scene-kit snippets at 2-3 maintained LOC. This closes the fresh-package/LOC scene-kit evidence rows only; visual-default acceptance remains open until fresh PNGs and review prove the outputs are visually acceptable.

Evidence update (2026-06-01): the nonvisual "agents no longer need to hand-roll systems" row is complete for physics, chart, game, character, and city systems. A built public API check instantiated `sceneKits.physicsPlayground()`, `sceneKits.dataViz()`, `sceneKits.miniGolf()`, `sceneKits.humanoidWalk()`, and `sceneKits.cityBlock()`; all returned populated nodes, camera modes, `toAppOptions()` scenes, and at least three evidence entries, with interactions where applicable. The visual-default scene-kit row remains open until fresh PNGs and human review prove the rendered defaults are acceptable.

## P1 Workstream M: Visual QA And Human Review

Automated tests cannot decide visual quality, but they can stop obvious bad output.

- [x] A3D2-M001: Add screenshot contact sheet generation as a first-class command.
- [x] A3D2-M002: Add visual QA checks for blank/overexposed/underexposed screenshots.
- [x] A3D2-M003: Add object-count evidence checks per scene kit.
- [x] A3D2-M004: Add label/axis/legend presence checks for chart and solar scenes.
- [x] A3D2-M005: Add humanoid structural checks for connected anatomy.
- [x] A3D2-M006: Add mini-golf gameplay-state checks: ball, cup, score, aim, obstacle.
- [x] A3D2-M007: Add product bounds/contact checks.
- [x] A3D2-M008: Add material class distinguishability checks where possible.
- [x] A3D2-M009: Add required human visual review before any full benchmark rerun.
- [x] A3D2-M010: Store human review notes next to screenshots with exact PNG paths and timestamps.

Acceptance:

- [x] No scene advances to full benchmark if human review says it still looks like a toy/demo/placeholder.
- [x] Humanoid cannot pass without explicit human acceptance.
- [x] Contact sheets are shown before scoring.

Progress update (2026-06-01): `benchmark/runner/visual-qa-gates.mjs` now requires all 14 prompt screenshots, can reject stale PNGs via a run-start timestamp, writes contact sheets before scoring, adds pairwise image-delta checks for neon motion, data hover, city day/night, and humanoid animation frames, adds humanoid-specific pixel obvious-failure checks, and requires a real `human-review.json` by default. A passing review must use exact PNG paths and modified timestamps, global verdict `pass`, per-screenshot verdict `pass`, per-screenshot score at least 4, prompt-match confirmation, raw Three.js comparison status, and for humanoid the explicit acceptance that it "no longer looks like placeholder programmer art." Structural scene-kit checks remain supporting evidence only; they are no longer sufficient to represent visual acceptance without fresh PNGs and human review.

Progress update (2026-06-01): visual gate coverage was tightened so every required screenshot reports explicit family-specific pixel checks instead of relying on generic nonblank/edge tests. The gate now fails acceptance when a required screenshot has no family-specific checks registered, adds city-specific PNG heuristics for facade/window-grid detail, road/crosswalk detail, window/streetlight pixels, and day/night state evidence, and strengthens particle checks for upward plume density, plume structure/trails, emitter/base pixels, ground/splash context, and emission-rate UI detail. Validation: `node --check benchmark/runner/visual-qa-gates.mjs` passed. These are still obvious-failure pixel gates, not human visual acceptance; all fresh screenshot, visual-score, and human-review rows remain open until a current acceptance report and reviewer notes exist.

Progress update (2026-06-01): scene-kit diagnostics no longer expose `visualScore` from node-name or structural QA. The same support signal is now named `structuralScore`, and internal smoke metadata was updated to avoid deriving humanoid/material visual acceptance from it. Visual acceptance remains limited to fresh PNG pixel gates plus required human/neutral review.

Progress update (2026-06-01): mounted app state can now change scenes through `AuraApp.setScene(...)`, which disposes the old production renderer, resets diagnostics/assets/evidence, guards stale async renderer mounts, and remounts the current scene. City day/night state is wired through `city.bindDayNightToggle(...)`; the smoke route now drives `city.createState()` plus the app scene replacement API instead of only preselecting a URL mode. This is runtime code evidence only; day/night screenshot delta and human visual acceptance remain open until fresh captures prove the mounted toggle changes pixels.

Progress update (2026-06-01): human review gating now has dedicated material and product review sections instead of relying only on generic per-screenshot score fields. `benchmark/runner/visual-qa-gates.mjs` emits and requires `materialReview` fields proving a neutral human can identify metal, glass, rubber, emissive, and clearcoat without labels and confirms controlled exposure, plus `productReview` fields proving the sneaker is centered, grounded, studio-lit, staged like product photography, and not a box room. This is acceptance-gate infrastructure only; material/product visual rows remain open until fresh PNGs and a real neutral review file satisfy those sections.

Progress update (2026-06-01): prompt-family human review gating now covers the remaining visual blockers explicitly. `benchmark/runner/visual-qa-gates.mjs` emits and requires `physicsReview`, `particleReview`, `solarReview`, `neonReview`, `dataReview`, `miniGolfReview`, and `cityReview` sections, each with neutral-human reviewer confirmation, score at least 4, reviewer-not-author/agent confirmation, and family-specific confirmations matching the prompt-level exit gates. This prevents a generic passing score from hiding missing contact physics, particle emitter/context, solar labels/depth, neon controlled bloom/ring depth, data chart readability/no-orphans, mini-golf playability/elements, or city day/night/street detail. This is still gate infrastructure only; visual rows remain open until fresh PNGs and real review evidence satisfy the gate.

Progress update (2026-06-01): the official full-benchmark guard now enforces the same neutral, family-specific human-review schema before release reruns. `benchmark/runner/full-benchmark-guard.mjs` now requires `reviewerType: "neutral-human"`, `reviewerAffiliation: "independent"`, all family review sections with score at least 4 and reviewer-not-author/agent confirmation, exact current PNG mtimes, per-screenshot pass verdicts, prompt-match confirmation, raw Three.js comparison status, and humanoid `placeholderProgrammerArt: false` plus the required "no longer looks like placeholder programmer art" sentence. This closes a guard consistency gap only; it does not close visual rows until accepted screenshots and review notes exist.

## P1 Workstream N: Documentation And Context

Docs must drive agents to visual wins, not just compiling examples.

- [x] A3D2-N001: Rewrite `llms.txt` benchmark recipes around visual outcomes and scene kits.
- [x] A3D2-N002: Add "do not submit" examples: primitive humanoid puppet, toy mini-golf, stray chart geometry, blown-out neon, washed material lab.
- [x] A3D2-N003: Add "expected screenshot contains" checklists per prompt.
- [x] A3D2-N004: Add root API import examples for all scene kits.
- [x] A3D2-N005: Add anti-hallucination docs for physics and assets.
- [x] A3D2-N006: Regenerate context manifests after docs change.
- [x] A3D2-N007: Add manifest verification to benchmark setup.

Acceptance:

- [x] A fresh agent reading only the context bundle knows exactly which scene kit to use for each prompt.
- [x] Context examples compile from a fresh packed package.
- [x] Manifest verification passes.

Evidence note: rewrote `llms.txt`, `docs/agents/benchmark-recipes.md`, `docs/agents/agent-context.md`, `docs/agents/api-surface.md`, and `docs/agents/anti-hallucination-rules.md` around scene-kit-first benchmark recipes, prompt-level expected screenshot checklists, explicit "do not submit" failure patterns, root `sceneKits.*` import examples, and physics/asset anti-hallucination boundaries. Synced the same files into `benchmark/context/aura3d/files`, regenerated `benchmark/context/aura3d/manifest.sha256`, and added `benchmark/runner/setup-engine.mjs` setup-time `verify-context-manifests.mjs` execution before package packing. Validation ran `node benchmark/runner/verify-context-manifests.mjs` with `aura3d: 38 files verified`, `threejs: 15 files verified`, and runner contract pass; `node --check benchmark/runner/setup-engine.mjs`; `AURA3D_NON_RELEASE_VALIDATION=1 node benchmark/runner/setup-engine.mjs --round=round-prd2-context-api-1`, which printed manifest verification first, built, packed, and passed tarball audit with `sceneKits`, `product`, and `solar` markers; `node benchmark/runner/scene-kit-snippet-smoke.mjs`, which passed all 10 scene kits with 2-3 LOC snippets; and a built root export smoke confirming `sceneKits`, `product`, `solar`, `city`, `charts`, `character`, `physics`, and `createAuraApp` are exported from `dist/engine/index.js`.

## P1 Workstream O: Performance And Bundle Budget

Better visuals cannot destroy the benchmark metrics.

- [x] A3D2-O001: Add draw-call budgets for each scene kit.
- [x] A3D2-O002: Add instancing for repeated city, chart, particle, star, and label geometry.
- [x] A3D2-O003: Add LOD or impostor support for dense city and particle scenes.
- [x] A3D2-O004: Add lazy loading for heavy optional systems: physics backend, product GLTF loader, postprocess, character rig.
- [x] A3D2-O005: Add bundle-size checks per scene kit.
- [x] A3D2-O006: Add FPS calibration and p50 FPS reporting for smoke routes.

Acceptance:

- [x] Visual upgrades keep benchmark apps interactive.
- [x] Bundle size does not lose enough metrics to erase visual wins.
- [x] FPS instrumentation is calibrated before performance claims are made.

Evidence note: added scene-kit performance diagnostics with draw-call budgets, calibrated-FPS contracts, per-kit bundle budgets, repeated-family instancing evidence, dense-scene impostor/LOD evidence for particle/city/solar kits, and lazy-loading plans for physics backend, product GLTF loader, postprocess, and character rig. Added additive lazy entrypoints `physics.worldAsync`, `physics.worldFromSceneAsync`, `character.importedRigRuntime`, `loadProductAssetLazy`, `createPostProcessComposerLazy`, and the public lazy evidence registry `collectAuraLazySystemEvidence` / `lazySystems`. Added `benchmark/runner/scene-kit-performance-budget.mjs` plus `benchmark:performance-budgets`; the gate performs real esbuild/minify/gzip-9 measurement per scene-kit snippet with optional lazy systems externalized and passed with measured gzip sizes about 446.3 KB against 470 KB per-kit budgets after the renderer/material additions, all required lazy systems present, all lazy entrypoints present, positive instancing savings for particle, solar, data, city, and material label families, and calibrated FPS contract checks passing. Extended `benchmark/runner/task12-repair-smoke.mjs` to run FPS calibration, sample p50/p95 FPS per route, and write `/tmp/aura3d-task12-repair-smoke/metrics.json`; the smoke run produced 8 passing route metrics and the contact sheet. Validation ran `pnpm build`, `node --check benchmark/runner/scene-kit-performance-budget.mjs`, `node --check benchmark/runner/task12-repair-smoke.mjs`, `node benchmark/runner/verify-context-manifests.mjs`, `node benchmark/runner/scene-kit-performance-budget.mjs`, `node benchmark/runner/scene-kit-snippet-smoke.mjs`, `node benchmark/runner/task12-repair-smoke.mjs`, a metrics assertion against `/tmp/aura3d-task12-repair-smoke/metrics.json`, `AURA3D_NON_RELEASE_VALIDATION=1 node benchmark/runner/setup-engine.mjs --round=round-prd2-performance-api-1`, and post-render/material `AURA3D_NON_RELEASE_VALIDATION=1 node benchmark/runner/setup-engine.mjs --round=round-prd2-render-material-api-1`, which verified context manifests, built, packed, and passed tarball audit with fresh packed `dist/engine/agent-api/index.js` hash `sha256-79deacb757b2e36110d4b4365cf99fd2f9453dba5084cd80b47e22a0ab755807`.

## Implementation Order

Do not implement this PRD in document order. Implement by visual risk:

1. Build/pack guard: A3D2-A001 through A3D2-A005.
2. Renderer foundation: Workstream B.
3. Humanoid replacement: Workstream D.
4. Mini-golf/game physics: Workstream E.
5. Material and product presentation: Workstreams C and J.
6. Data visualization system: Workstream G.
7. Neon/VFX/particles: Workstreams F and H.
8. City and solar polish: Workstreams I and K.
9. Scene kit API: Workstream L.
10. Docs, visual QA, context manifests: Workstreams M and N.
11. Performance budgets: Workstream O.
12. Only then run one full clean validation pass.

## Prompt-Level Exit Gates

Before a full benchmark rerun, every prompt must pass these local gates:

### Physics Playground Gate

- [ ] Fresh Aura screenshot is not blank, not toy-like, and shows real contact/physics state.
- [ ] Human reviewer rates Aura physics visual at least 4.
- [x] Physics API evidence shows real bodies, colliders, contacts, and stepping.
- [ ] Screenshot looks at least as polished as the raw Three.js reference sheet.

Evidence update (2026-06-01): the built public API now proves the nonvisual physics evidence gate. A direct `dist/engine/agent-api` check created `sceneKits.physicsPlayground({ cubes: 12 })`, collected scene evidence, built `physics.worldFromScene(snapshot)`, stepped the world twice, and reported 23 scene physics nodes, 23 world bodies, 23 colliders, 2 steps, and 13 contacts. This closes only the API-evidence row; physics screenshot polish and human visual score remain open.

### Particle Fountain Gate

- [ ] Fresh Aura screenshot shows textured/glowing/lifetime-varied particles.
- [ ] Emitter, ground/splash context, and emission-rate UI are visible.
- [ ] Human reviewer rates Aura particle visual at least 4.

### Solar Gate

- [ ] Fresh Aura screenshot shows six planets, sun, orbits, labels, glow, and starfield.
- [ ] Labels are readable and attached.
- [ ] Human reviewer rates Aura solar visual at least 4.

### Neon Gate

- [ ] Fresh Aura screenshot shows controlled bloom and tunnel depth.
- [ ] It is not overexposed.
- [ ] Human reviewer rates Aura neon visual at least 4.

### Data Gate

- [ ] Fresh Aura screenshot shows readable axes, ticks, title, legend, values, and selected hover state.
- [ ] No floating orphan geometry exists.
- [ ] Human reviewer rates Aura data visual at least 4.

### Mini-Golf Gate

- [ ] Fresh Aura screenshot shows a playable mini-golf hole, not just a green plane.
- [ ] Ball, cup, obstacle, rail, score, aim/power indicator, and shot state are visible.
- [ ] Human reviewer rates Aura mini-golf visual at least 4.

### Material Lab Gate

- [ ] Fresh Aura screenshot shows distinguishable mirror metal, transparent glass, rubber, emissive, and clearcoat.
- [ ] Exposure is controlled.
- [ ] Human reviewer rates Aura material visual at least 4.

### City Gate

- [ ] Fresh Aura screenshot shows buildings, roads, windows, crosswalks, lights, props, and day/night state evidence.
- [ ] Human reviewer rates Aura city visual at least 4.

### Humanoid Gate

- [ ] Fresh Aura screenshot shows a coherent connected character.
- [ ] No detached limbs, missing hands/feet, or broken joint chains.
- [ ] Human reviewer rates Aura humanoid visual at least 4.
- [ ] Human reviewer writes that the character no longer looks like placeholder programmer art.

### Product Gate

- [ ] Fresh Aura screenshot shows a centered, grounded, studio-lit sneaker.
- [ ] Stage looks like product photography.
- [x] Asset audit passes.
- [ ] Human reviewer rates Aura product visual at least 4.

## Official Rerun Rule

The next full prompt benchmark is allowed only when:

- [ ] All P0 tasks are implemented.
- [ ] All prompt-level exit gates pass.
- [x] `pnpm build` has been run after the final code change.
- [x] The packed tarball audit passes.
- [x] Context manifests pass.
- [ ] Fresh contact sheets are created and reviewed.
- [ ] The user explicitly approves one clean validation benchmark.

Evidence update (2026-06-01): current package/build checkpoint passed after the latest code changes. `pnpm build` passed directly, and `AURA3D_NON_RELEASE_VALIDATION=1 node benchmark/runner/setup-engine.mjs --round=round-prd2-current-package-check` verified context manifests, rebuilt `dist`, ran `npm pack`, and passed `benchmark/runner/tarball-audit.mjs` against `benchmark/runs/round-prd2-current-package-check/_packages/aura3d-engine-1.0.0.tgz`. The audit reported required consumer `dist` files present, required agent-api helper markers present, `agent-api-dist-not-stale: pass`, repo/packed `dist/engine/agent-api/index.js` hash equality `sha256-327228dc78adfbf16237081fa8e4e46bcf666dbd9186db6daf4a4551c07a468a`, and package tarball hash `sha256-ba874e7cd55848e28a64804366e234789a7ceb7e6aff38deb20c696e8c356bad`. This closes only the current build/tarball prerequisite rows; visual/human-review and official benchmark rows remain open.

If the next clean validation fails:

- [x] Do not rerun immediately.
- [x] Record exact losing prompts.
- [x] Map each loss to a PRD-2 workstream.
- [x] Implement code changes before any retry.

Evidence update (2026-06-01): failed validation reruns are now enforced by `benchmark/runner/validate-engine-round.mjs`. A first failed pass writes `validation-failure-losses.json` with exact losing screenshot/prompt keys and PRD-2 workstream mappings, writes `validation-failure-response-template.json`, and stores the required response path in `validation-state.json`. A same-round rerun with `AURA3D_ALLOW_VALIDATION_RERUN=1` is refused unless `validation-failure-response.json` exists, records `exactLosingPrompts`, maps every loss to a PRD-2 workstream, and includes non-empty `codeChanges` entries with files and summaries for every losing workstream. This closes the failed-rerun process rows only; it does not authorize an official benchmark until the visual and human-review gates pass.

## Definition Of Done

PRD 2 is complete only when:

- [ ] The current humanoid output is replaced by a visually acceptable character system.
- [ ] Mini-golf looks and behaves like a playable scene.
- [ ] Data charts look like real charts, not decorative bars.
- [ ] Material lab shows physically distinct materials.
- [ ] Product viewer looks like a product render.
- [ ] Neon, particles, city, solar, and physics have production-quality defaults.
- [x] All fresh-package examples compile.
- [x] All context manifests verify.
- [x] Build/pack guard prevents stale `dist` from being benchmarked.
- [ ] One clean validation pass produces contact sheets that human review accepts.
- [ ] One official benchmark run passes the frozen release bar.

## Explicit Current Blockers

These are not optional:

- [ ] Humanoid visual quality is a blocker.
- [ ] Mini-golf visual/game quality is a blocker.
- [ ] Renderer tone mapping, shadows, postprocess, and material quality are blockers.
- [ ] Data chart polish is a blocker.
- [x] Build-before-pack enforcement is a blocker.
- [ ] Scene kits must replace weak helper-only defaults.

Until these blockers are resolved, Aura3D should not be described as visually at parity with Three.js.
