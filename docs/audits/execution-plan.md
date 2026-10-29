# Execution plan: live-games and 4.5.0 audit fixes

Source of truth: [`live-games-4.5.0-audit-2026-10-29.md`](live-games-4.5.0-audit-2026-10-29.md). Base: `origin/main` 31f8945ad. Integration branch: `audit-fix/integration`. Every lane works in its own worktree under `.claude/worktrees/audit-<lane>` on branch `audit-fix/<lane>`, cut from `audit-fix/integration`.

Scope is every row in the audit: every Fix and Enhance row (P0 to P3) of the 25 games, every release-audit row (RP, LIGHT, SI, anim-phys, RH) and the cross-cutting issues. A row is closed as **done** (with the commit) or **not done** (with the reason it cannot be done in code, for example an owner-only action).

## Ownership rules

- A lane edits only the files it owns. A change needed in a file owned by another lane goes into that lane's handoff list in the lane report (`docs/audits/lanes/<lane>.md`), and is applied in wave 2 by the owning lane.
- Engine rows that appear inside a game section (LIGHT-*, RP-*, SI-*, anim-phys-*, RH-*, ENG-*) belong to the engine lane named below. The game lane does only the game-side part (for example the capture and the per-game tuning in LIGHT-03).
- Shared files owned by lane E5: `aura.assets.json`, `docs/workflows/game-inventory.json`, `CHANGELOG.md`, `README.md`, `AGENTS.md`, `llms*.txt`, `marketing/**`, `tools/game-checks/**`, `packages/*/README.md`, `public/aura-assets/**` shared by several games.
- Never stage the five LFS-mismatch fixture files (`fixtures/asset-corpus/{avocado,damaged-helmet}.glb`, `fixtures/environment-corpus/hdri/*_1k.hdr`); stage owned paths explicitly.

## Engine and shared lanes

| Lane | Rows | Owns |
|------|------|------|
| E1 render path and app core | RP-01..RP-08, ENG-FPS, string `renderer.quality` warning (top-tennis C11 engine part) | `packages/engine/src/agent-api/compiler/renderPath.ts`, `rendererOptions.ts`, `packages/rendering/**/DirectPath.ts`, `packages/engine/src/agent-api/app/createAuraApp.ts`, `frameLoop.ts`, `renderInput.ts`, `runtimeNodes.ts`, `compiler/renderer.ts` `resolveMountQuality` |
| E2 lighting and forward pass | LIGHT-04, LIGHT-05, LIGHT-07, LIGHT-08, LIGHT-09, SSAO `ssao:normals` drop (cross-cutting), SI-3, SI-8 | `environment.ts`, `EnvUniforms.ts`, `ForwardPass.ts`, `InterleavedTransparentPass.ts`, `scene.ts` look-fill yield, `lookPresets.ts`, `looks.ts`, the SSAO pass, `compiler/renderer.ts` environment knob |
| E3 shadows and instancing | SI-1, SI-2, SI-4, SI-5, SI-6 | `Lighting.ts`, `ShaderLibrary.ts` cascade lookup, `InstanceFrustumCull.ts`, `DepthPass.ts`, `MultiDraw.ts`, `ShadowSystem.ts`, `shadows.ts`, instance-buffer tests |
| E4 animation, physics and API | anim-phys-01..10, SI-7 | `PoseMixer.ts`, `animationMask.ts`, `BoneMask.ts`, `RetargetWorker.ts`, `physics.ts`, `Clock.ts`, `primitives.ts`, `interactions.ts`, `instances.*`, `packages/react/**`, the `physics.bindNodes` path |
| E5 docs, claims, site and tooling | RH-01..RH-14, LIGHT-02 (harness), LIGHT-10, LIGHT-11, touch-input game-check, credit-link placement (cross-cutting), CHANGELOG entry for this work | shared files listed above, `tests/browser/game-luma-capture.spec.ts`, `docs/prds/**`, `evidence/vs-threejs/**`, `evidence/exposure-parity/**` |

## Game lanes

Each game lane owns `apps/<appFolder>/**`, the `examples/<dir>/**` the app mounts (when no other live game mounts it), the unit tests named after the game, the game's evidence folder, `docs/upgrade-4.5.0/<slug>.md`, its new remote spec `tests/browser/audit-fix/<slug>.spec.ts`, and assets used only by that game.

| Lane | Game | Slug | Source |
|------|------|------|--------|
| G01 | Aura Slam 3D | top-tennis | apps/showcase-top-tennis, examples/aura-slam |
| G02 | Apex Overdrive | roadster-rush | apps/showcase-roadster-rush |
| G03 | Thermal Drift | heatsink | apps/showcase-heatsink |
| G04 | Grid Dispatch | teleoperator | apps/showcase-teleoperator |
| G05 | Iron Crown | iron-crown | apps/showcase-iron-crown (+ anim-phys-11) |
| G06 | Pip's Big Leap | pips-big-leap | apps/showcase-pips-big-leap |
| G07 | Aura Hoops 3D | aura-hoops-3d | apps/showcase-aura-hoops-3d |
| G08 | Aura Diamond 3D | aura-diamond-3d | apps/showcase-aura-diamond-3d |
| G09 | Aura FC 3D | aura-fc-3d | apps/showcase-aura-fc-3d |
| G10 | Aura Links 3D | aura-links-3d | apps/showcase-aura-links-3d |
| G11 | Bunker Zero | bunker-zero | apps/showcase-bunker-zero |
| G12 | Slingshot Siege | slingshot-siege | apps/showcase-slingshot-siege |
| G13 | Glint Courier | dot-dash-3d | apps/showcase-dot-dash-3d |
| G14 | Cross Hop | cross-hop | apps/showcase-cross-hop |
| G15 | Craterline GP | strange-orbit-port | apps/showcase-strange-orbit-port, examples/strange-orbit-port (LIGHT-01) |
| G16 | Chroma Roll | splat-rush-port | apps/showcase-splat-rush-port, examples/splat-rush-port (LIGHT-01) |
| G17 | Serpentine Sky Run | serpentine-sky-run-port | apps/showcase-serpentine-sky-run-port, examples/saiyan-snake-way-port (LIGHT-01, RH-07 game part) |
| G18 | Gridlock Courier | drift-and-deliver-port | apps/showcase-drift-and-deliver-port, examples/drift-and-deliver-port |
| G19 | Ion Circuit | heatsink-port | apps/showcase-heatsink-port, examples/heatsink-port (LIGHT-01) |
| G20 | Shadowstep Gauntlet | ninja-runner-port | apps/showcase-ninja-runner-port, examples/ninja-runner-port |
| G21 | Lamplight Line | last-train-port | apps/showcase-last-train-port, examples/last-train-port (RP-07) |
| G22 | Saltwind Highway | roadster-hours-port | apps/showcase-roadster-hours-port, examples/roadster-hours-port |
| G23 | The Bellkeeper's Walk | where-the-wind-wanders-port | apps/showcase-where-the-wind-wanders-port, examples/where-the-wind-wanders-port |
| G24 | Duneglide | silt-and-signal-port | apps/showcase-silt-and-signal-port, examples/silt-and-signal-port |
| G25 | Cumulus Dash | cloud-runner-port | apps/showcase-cloud-runner-port, examples/kid-goku-beyond-the-clouds-port (RH-07 game part) |

## Waves

1. **Wave 1:** all 30 lanes in parallel, scheduled by the workflow's concurrency cap.
2. **Wave 2:** handoffs. Each owning lane applies the handoffs other lanes recorded for its files, on the same branch.
3. **Merge:** every lane branch merges into `audit-fix/integration` (E lanes first, then games).
4. **Gate on integration:** typecheck (`tsc -p tsconfig.check.json`, compared with the 58-error baseline), unit tests (compared with the origin/main baseline), `node tools/game-checks/run.mjs --all`, and the remote browser sweep of all 25 games (`tools/remote-acr/run.sh`, steady state). Fix whatever breaks.
5. **Close-out:** mark every audit row done (commit) or not done (reason) in the audit doc; open the PR `audit-fix/integration` to `main`; release and deploy with the 4.5.0 recipe.

## Lane definition of done

- Every owned row is fixed, or the lane report gives the reason it cannot be.
- `node tools/game-checks/run.mjs <slug>` passes (game lanes).
- The relevant unit tests pass; new tests cover each fixed bug where a unit test is possible.
- Browser checks ran on the remote runner (`tools/remote-acr/run.sh`, never local Playwright or Docker), measured at steady state (the later shots, not the first frame), before (base commit) and after (lane branch). Before/after numbers and frames go in the game's evidence folder.
- The lane report `docs/audits/lanes/<lane>.md` lists each row with status and commit, the remote run ids, and the handoffs.
