# New game checklist (pre-flight and acceptance)

One page, current for 5.7.2. Entry ids (R1, M2, ...) point into [`lessons-learned.md`](lessons-learned.md). A game is accepted on a real GPU with a full `?autoplay=1` run; software-GL evidence is not real-GPU evidence: say which one you have in every report.

## 1. Before coding

- [ ] Idea is your own: mechanics may follow a genre, but name, hero, enemies, pickups, level layout, text and lore are original (G2, A4). No brand, product, character or place names from other games, in code, text, prompts or asset keys.
- [ ] Pick a unique public name; add it to `docs/workflows/game-names.md` (N1). The game goes into `tools/site/games.catalog.json`; the site count is generated (`node tools/site/gen-game-inventory.mjs`), never typed (N3).
- [ ] State the objective, the score and the end screen in one paragraph (G1). Player must see the objective from second one.
- [ ] Start from the kits, not from scratch (P8): `installQaHooks`, `createFixedStepLoop` + `createFixedStepPresenter`, `installGameBeacon`, `installSafetyNet`, `createCueBank`, the impact kit, `attachToBone`, `createLocomotion`, the shared quick bar `apps/showcase-port-shared/quickbar.css`. See `docs/agents/build-a-game.md`.
- [ ] 5.7.0 kits replace code every game used to hand-roll; use them, do not write your own (P8):

  | Need | Use (import) | Doc |
  | --- | --- | --- |
  | `?autoplay=1` flag and results-hold-then-restart loop | `readAutoplayFlag`, `createAutoplayHarness` (`@aura3d/engine/game`) | [game-autoplay](../api/game-autoplay.md) |
  | Fixed-step render interpolation with a snap rule | `createSnapshotInterpolator`, `mixNumber`, `mixVec3` (`@aura3d/engine/game`) | [motion-snapshot-interpolator](../api/motion-snapshot-interpolator.md) |
  | Humanoid clip playback, cross-fades, distance-driven feet | `createHumanoidAnimator`, `humanoidLocomotionTime` (`@aura3d/engine/animation`) | [humanoid-motion](../api/humanoid-motion.md) |
  | Hit-stop, camera trauma, FOV kick, zero-asset SFX, screen flash, popups, seeded RNG | `createImpactRig`, `createProceduralSfx`, `ScreenFx`, `drainPopups`, `GameRng` (`@aura3d/engine/game`) | [game-feel](../api/game-feel.md) |
  | Flipbook VFX sheets and grading LUTs with no image assets | `createFlipbookAtlas`, `createGradingLut` (`@aura3d/engine/game`) | [game-vfx-sheets](../api/game-vfx-sheets.md) |
  | Painted game sky (bands, horizon, haze, sun glow) | `sky.gradient({ mid, haze, sun: { glow } })` | [sky-gradient](../api/sky-gradient.md) |
  | Soft or hard sun shadow edge; a shadow box fixed to the arena | `shadow: { softness, fit: { center, extent } }` | [shadow-softness](../api/shadow-softness.md) |
  | Transparent canvas over the page | `output: { alphaMode: "premultiplied", inputAlphaMode: "premultiplied" }` | [transparent-canvas](../api/transparent-canvas.md) |
- [ ] Hero readability: the hero separates from the set by value (rim or back light, or a lighter accent) in a back-view frame at gameplay distance (R23); HUD words (colours, names, counts) describe the drawn frame, not the authored hex (G9).
- [ ] Assets: catalog first, then the fal.ai lane below; isolated admission, sha256 + same-origin + provenance (A5, A6). Never name a brand, product or model in a prompt. Check licences (A9).
- [ ] Lifelike custom models and motion: `aura3d assets generate "<subject>" --name <key> --kind character --rig --dry-run` (prints the fal.ai cost), then the paid run, `aura3d assets normalize` if facing or size is off, `aura3d assets validate --skin <file.glb>`, and `aura3d animation generate "<motion>" --onto <rig.glb> --out <hero.glb>` for clips (`aura3d animation import` for BVH/FBX/GLB motion). Spend is ledgered in `.aura3d/fal/ledger.jsonl`; reruns resume and never pay twice. Look at the `assets preview` sheet (a CPU base-colour preview, not a render) and then real frames. Never trust generated PBR maps as delivered (A11): run `aura3d assets inspect <file.glb> --pbr` (metalness, roughness and normal-tilt statistics, `PBR_*` warnings), make painted bodies dielectric with a clearcoat, split paint, glass, chrome and tyres into separate materials, keep normal maps lossless PNG, lower `normalScale`, and never `assets slim --allow-glossy` a glossy or mirror surface (A12; plain `assets slim` and `assets generate` keep glossy normals PNG).
- [ ] Plan `?autoplay=1` from the start; every game must support it: the computer plays the player side competently, starts by itself, reaches the results screen and loops. Read the flag with `readAutoplayFlag(location.search)` (accepts `autoplay`, `autopilot`, `demo`) and run the results-hold-then-restart loop on `createAutoplayHarness`; the bot stays game code and feeds the normal input path. It is a hands-free demo and QA mode, never a substitute for player input (claims-and-boundaries section 3).
- [ ] Fonts from the licensed set only (U3).

## 2. While building

- [ ] Sim is pure and deterministic (seeded RNG, fixed step: `GameRng`); render draws between the last two steps with `createSnapshotInterpolator` or `createFixedStepPresenter` (M1).
- [ ] Timers that must run while the game is frozen (hit-stop, countdowns) use real frame time (`createImpactRig` or `createHitStop`) (M2).
- [ ] Pose bones are `{x,y,z,w}` objects; props use `attachToBone`; verify the pose applied from a frame (M3, M4). Handles of models nested in a moving group are parent-local since 5.7.0; before 5.7.0 they took world coordinates (M18), so convert any 5.6 code that fed them world values or make the node top-level (M22); humanoid clips play through `createHumanoidAnimator`; pick clips by their pose, not their name, and never ship a T-posed or frozen character (M19).
- [ ] Wheels, rotors and sails are separate nodes that spin about their measured hub (M20); keep drawn road ripple, rider sway and camera trauma small enough that a flat sim never reads as a bounce (M21). Generated models get the right scale against the players (`model()` normalises to 1 m unless you pass `targetHeight`/`targetMaxDimension` or `scaleMode: "world"`).
- [ ] Walkers use `createLocomotion`; keep `createFootSlideMeter` under the threshold (M5). No double skeletons: `checkDoubleFrame` clean (M7).
- [ ] Every solid obstacle has a collider and a consequence (impact kit: stop or bounce, hit-stop, shake, sound, penalty) (M6). Decor that reads solid inside the play path blocks or is moved out (V12).
- [ ] Flashes come from emissive or sprite effects, not short-lived point lights; warm VFX once behind the loading screen (V11).
- [ ] Counters count transitions, not states (M8). Camera never inside scenery (`createCameraClearance`) (M9).
- [ ] Renderer node pools are sized from the simulation's measured peak by a seeded replay test, and fill nearest-ahead first (G8).
- [ ] Never assign canvas size after `app.ready()` (R1). `await warmPrograms(app)` before showing the game (R2). Give the canvas a fixed-size container (R3).
- [ ] After every generated or downloaded model: render four sides, look for emblems, lettering, faces, atlas shards, stretched scale, noisy normals (A1 to A3, R6 to R8).
- [ ] Phone layout at 390x844: one-row quick bar, HUD below it, collapsible panels, 44 px touch targets, safe-area insets (U1, U2).
- [ ] Every gameplay action works by touch: engine touch preset bound to declared action names, shown on `(pointer: coarse)`; no fixed overlay over a control (U4, U5; check `touch-input`).
- [ ] Lighting: authored lights come with an environment or a look (R17; check `lighting`); a hemisphere, a runtime look swap and contact shadows are captured at steady state before and after tuning (R18 to R20), and `app.diagnostics().warnings` has no `CONTACT_SHADOWS_WEAK_KEY`. Compare steady-state luma against the previous release with `tests/browser/game-luma-capture.spec.ts` (R20).
- [ ] No old names, "port" wording, version text or engine chip in visible text (N1, N2). One neutral "Built with Aura3D" link.

## 3. Before shipping (commands)

```bash
node tools/game-checks/run.mjs <game-slug>          # static checks (errors fail, warnings need a reason)
node tools/game-checks/run.mjs --all                # whole repo incl. .vercelignore and counts
node_modules/.bin/vitest run tests/unit/<game>      # sim, replay, likeness (tests/unit/likeness-audit)
node_modules/.bin/tsc -p tsconfig.build.json        # after merges (P7)
node marketing/scripts/check-site.mjs               # counts, links, claims guards
```

- [ ] Real-GPU acceptance (V7, V10): build the site (`pnpm build && pnpm --dir marketing build`, early: it must copy the model GLBs) and capture the game in headless Chrome on the real GPU over loopback CDP (`tools/release/render-gate/cdp-capture.mjs`, `--query "?autoplay=1"`; hold `/tmp/a3d-rea.lock` when other agents share the Mac). Watch the whole `?autoplay=1` run, not opening stills: a frame about every 3 s through every stage to the results screen, and 50 ms bursts that show every actor type and moving part (characters, wheels, rotors) actually moving. 0 console errors.
- [ ] Optional software-GL run (never local Playwright): `tools/remote-acr/run.sh` with your own RUN_ID prefix. Stage the app folder, `apps/showcase-port-shared`, `public/aura-assets` and the game's model files or the capture is black (V1). Wait for the ready flag and texture status, not blind polling; cancel runs hung past about 20 minutes (V2, V3).
- [ ] Frames at 1280x720 and 390x844: title, early, key action, mid, results; look at every frame (V5). Card images 720x450 at 1x and 1440x900 at 2x, retaken after every minor release (B11; check `screens-fresh`). Commit them under `evidence/<game>/screens/final/` (`git add -f`; `screens-tracked` must pass) (V4, B2).
- [ ] Motion gate at 60, 120 and 144 Hz (`runMotionGate`) (M1). Report what only the owner can judge: feel and 120 Hz smoothness on their display.
- [ ] Claims: only what the code does, with a source (N4, G3). Draw calls, asset MB and triangle counts recorded.
- [ ] Deploy through the site-only fast lane in [`shipping-and-deploy.md`](shipping-and-deploy.md): Cloudflare Pages (never Vercel), from a clean worktree, no ACR pass or version bump; keep `/evidence/` out of the deploy (B1, B3, B4) and run the prod check after promotion. Regenerate derived files (catalog digests, showcase-port pages, `seo-meta-pass.mjs --check`).

## 4. Working in the monorepo with other agents

- [ ] Separate worktree; never `pnpm` in a symlinked worktree; no broad `pkill`; no `git stash -u`; do not delete files you did not create (P1 to P4).
- [ ] `git pull --rebase` before every push; push at each green step; say what is unverified (P5, P6).
