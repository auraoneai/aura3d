# New game checklist (pre-flight and acceptance)

One page. Entry ids (R1, M2, ...) point into [`lessons-learned.md`](lessons-learned.md). Software-GL evidence is not real-GPU evidence: say so in every report.

## 1. Before coding

- [ ] Idea is your own: mechanics may follow a genre, but name, hero, enemies, pickups, level layout, text and lore are original (G2, A4). No brand, product, character or place names from other games, in code, text, prompts or asset keys.
- [ ] Pick a unique public name; add it to `docs/workflows/game-names.md` (N1). The game goes into `tools/site/games.catalog.json`; the site count is generated (`node tools/site/gen-game-inventory.mjs`), never typed (N3).
- [ ] State the objective, the score and the end screen in one paragraph (G1). Player must see the objective from second one.
- [ ] Start from the kits, not from scratch (P8): `installQaHooks`, `createFixedStepLoop` + `createFixedStepPresenter`, `installGameBeacon`, `installSafetyNet`, `createCueBank`, the impact kit, `attachToBone`, `createLocomotion`, the shared quick bar `apps/showcase-port-shared/quickbar.css`. See `docs/agents/build-a-game.md`.
- [ ] Assets: catalog or Meshy with a text prompt only, every paid call reserved in the ledger for the game tag (uncapped; credits tracked for visibility), isolated admission, sha256 + same-origin + provenance (A5, A6). Never name a brand or model in a prompt. Check licences (A9).
- [ ] Fonts from the licensed set only (U3).

## 2. While building

- [ ] Sim is pure and deterministic (seeded RNG, fixed step); render draws between the last two steps with the presenter (M1).
- [ ] Timers that must run while the game is frozen (hit-stop, countdowns) use real frame time (`createHitStop`) (M2).
- [ ] Pose bones are `{x,y,z,w}` objects; props use `attachToBone`; verify the pose applied from a frame (M3, M4).
- [ ] Walkers use `createLocomotion`; keep `createFootSlideMeter` under the threshold (M5). No double skeletons: `checkDoubleFrame` clean (M7).
- [ ] Every solid obstacle has a collider and a consequence (impact kit: stop or bounce, hit-stop, shake, sound, penalty) (M6).
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
node tools/game-checks/run.mjs --all                # whole repo incl. .vercelignore, counts, Meshy credits per tag (information)
node_modules/.bin/vitest run tests/unit/<game>      # sim, replay, likeness (tests/unit/likeness-audit)
node_modules/.bin/tsc -p tsconfig.build.json        # after merges (P7)
node marketing/scripts/check-site.mjs               # counts, links, claims guards
```

- [ ] Remote run (software GL, never local Playwright): `tools/remote-acr/run.sh` with your own RUN_ID prefix. Stage the app folder, `apps/showcase-port-shared`, `public/aura-assets` and the game's model files or the capture is black (V1). Wait for the ready flag and texture status, not blind polling; cancel runs hung past about 20 minutes (V2, V3).
- [ ] Frames at 1280x720 and 390x844: title, early, key action, mid, results; look at every frame (V5). Card images 720x450 at 1x and 1440x900 at 2x, retaken after every minor release (B11; check `screens-fresh`). Commit them under `evidence/<game>/screens/final/` (`git add -f`; `screens-tracked` must pass) (V4, B2).
- [ ] Motion gate at 60, 120 and 144 Hz (`runMotionGate`) (M1). Report what only the owner can check on real hardware: feel, 120 Hz smoothness, GPU look (V7).
- [ ] Claims: only what the code does, with a source (N4, G3). Draw calls, asset MB and triangle counts recorded.
- [ ] Deploy: from a clean worktree, `/evidence/` anchored in `.vercelignore`, tracked-file count under 15,000 (B1, B3, B4).

## 4. Working in the monorepo with other agents

- [ ] Separate worktree; never `pnpm` in a symlinked worktree; no broad `pkill`; no `git stash -u`; do not delete files you did not create (P1 to P4).
- [ ] `git pull --rebase` before every push; push at each green step; say what is unverified (P5, P6).
