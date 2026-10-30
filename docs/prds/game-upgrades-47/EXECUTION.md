# GameUpgrades47 execution plan (swarm rules)

Source of truth: [`GameUpgrades47-PRD.md`](GameUpgrades47-PRD.md) and its capability maps [`cap-render.md`](cap-render.md), [`cap-content.md`](cap-content.md), [`cap-proof.md`](cap-proof.md). Base: `main` at ae19dd54d (4.6.1, already contains `audit-fix/integration`). Integration branch: `gu47/integration`. Every lane works in its own git worktree `/Users/gurbakshchahal/platforms/aura3d-gu47/<lane>` on branch `gu47/<lane>`, cut from `gu47/integration`. This file is binding for every lane; where it is silent the PRD decides.

## Phases (PRD D10, machine policy)

1. **Phase 1, code.** Implement product code (engine APIs, game look tables, art directions, VFX packs, lighting, post, camera, HUD) with interim paths, plus unit tests, contracts and static checks. Commit on the lane branch.
   - **Wave 1:** all lanes in parallel.
   - **Merge 1:** engine lanes into `gu47/integration` first (E-A ... E-J), then game lanes, then the WP-36 asset catalogue.
   - **Wave 2:** every lane re-cuts from the merged integration branch, applies the handoffs addressed to it, swaps interim paths to the merged engine APIs, admits its WP-36 assets, and E-I merges the luma-target rows the game lanes listed.
   - **Merge 2 and gate:** typecheck (58-error baseline, 0 new), touched unit suites (no new failures vs base), `node tools/game-checks/run.mjs --all` (0 errors), app typechecks (0 new). Then freeze: tag `gu47-code-complete-go` on `gu47/integration`. Progress is reported as code-completion %.
2. **Phase 2, acceptance** (only after the freeze): remote before/after steady-state captures, tuning into the acceptance bands, receipts, budgets, rubric panel, sibling distinctness, final screens, posters, 4.7.0 release notes, deploy, live smoke. Owner-only: real-GPU runs.

No phase-1 lane runs `tools/remote-acr/run.sh`, `tools/real-gpu/run.sh`, a judge, a poster build or a deploy.

**Revision (2026-10-29, after the first 38-lane swarm stopped on the agent usage quota within an hour, with machine load near 100):** the waves are re-ordered for economy. (1) The ten engine lanes run first (lean briefs, targeted tests only) and merge. (2) The game lanes then run in batches of about six, cut from the merged integration branch, and code directly against the merged engine APIs, so they need no interim adapters and no wave-2 swap; the interim-path rule still applies to any engine item that slipped. (3) WP-36 asset generation runs beside the game batches. (4) The before-captures of the unchanged build (WP-38) run as a script on the remote runner, not as an agent. Every lane resumes from its predecessor's commits, uncommitted files and lane report. `node_modules/.bin/vitest` in every lane worktree is a guard that adds `--maxWorkers=2` when no cap is given and allows at most 12 concurrent vitest runs on the machine.

## Lanes

| Lane | WP | PRD lines (WP; contract) | Owns |
|---|---|---|---|
| ea | WP-1 E-A looks, HDRI catalogue, HDRI delivery | 382-388; 129-156 | PRD §4.1 E-A row |
| eb | WP-2 E-B runtime light/env/fog, multi-caster shadows | 389-396; 157-178 | PRD §4.1 E-B row |
| ec | WP-3 E-C post | 397-407; 179-200 | PRD §4.1 E-C row |
| ed | WP-4 E-D materials, custom-shader access | 408-417; 201-220 | PRD §4.1 E-D row |
| ee | WP-5 E-E outline targets, toon ink | 418-421; 221-230 | PRD §4.1 E-E row |
| ef | WP-6 E-F runtime VFX | 422-425; 231-252 | PRD §4.1 E-F row |
| eg | WP-7 E-G flags, world, sky, instancing | 426-433; 253-262 | PRD §4.1 E-G row |
| eh | WP-8 E-H camera, animation, crowd kit, GLB cache | 434-439; 263-278 | PRD §4.1 E-H row |
| ei | WP-9 E-I proof tooling and checks | 440-447; 279-290 | PRD §4.1 E-I row and §4.3 |
| ej | WP-10 E-J HUD themes, art-direction genre | 448-451; 291-296 | PRD §4.1 E-J row |
| g01 ... g25 | WP-11 ... WP-35 | see the WP header in PRD §5.2 | PRD §4.2 row of the lane, plus `evidence/game-upgrades-47/<slug>/` |
| wp36 | WP-36 Meshy and asset batch | 1355-1363 | `artifacts/gu47-meshy/**` (ignored), `evidence/game-upgrades-47/meshy-ledger.md`, `docs/prds/game-upgrades-47/lanes/wp36-catalogue.md`; root `aura.assets.json`, `public/aura-assets/`, `.gitattributes` only in wave 2 |
| wp37, wp38 | WP-37 site/posters, WP-38 proof/release | 1365-1379 | phase 2 |

## Ownership and handoffs

- Edit only the files your lane owns (PRD §4.1, §4.2, §4.3 and the table above). A change you need in a file another lane owns goes into the **Handoffs** section of your lane report: target lane, exact file and symbol, the change, and why. Never edit that file yourself.
- Owner assignments the PRD leaves implicit:
  - `packages/engine/src/agent-api/nodes/types.ts`: **E-D**. E-D also adds `bloom?: number` to `AuraMaterialSpec` (contract owned by E-C) and `triangles` / `textureBytes` to `AuraDiagnostics`.
  - `packages/engine/src/agent-api/nodes/effects.ts`: **E-F**. E-F adds the option fields DOF `tiltShift`, outline `targets` and volumetricFog `godRayDensity` exactly as PRD §3.1 types them; the behaviour lives in the E-C / E-E files.
  - `packages/engine/src/public/index.ts`: **E-G**. Other lanes list any export they need as a handoff.
  - `packages/aura3d-cli/src/cli-help.ts`: **E-C** (E-A hands over its `--hdri` help line).
  - `packages/engine/src/agent-api/nodes/instances.ts`: **E-G** (E-D owns the instance-emissive shader, E-H the crowd kit in `packages/engine/src/instances-model/`).
  - `evidence/receipts/<name>/`: the lane PRD §4.1 names for that receipt. `evidence/game-upgrades-47/flag-promotion/`: E-G.
  - `docs/prds/game-upgrades-47/lanes/<lane>.md`: that lane.
  - New engine unit tests: the path the PRD names, else `tests/unit/gu47/<lane>/`. New game unit tests: the test folder PRD §4.2 gives the game, else `tests/unit/gu47/<slug>/`.
  - `CHANGELOG.md`, `README.md`, release notes: WP-38. Lanes write their CHANGELOG text in their report.
  - `tests/browser/game-luma-targets.ts`, `tests/unit/game-luma-targets.test.ts`, `tools/game-checks/**`, `tools/real-gpu/scenarios.json`: E-I. Game lanes list their new variant rows and real-GPU scenario in their report.
  - Game HUD fonts: a game copies the licensed `.woff2` files it needs into its own app folder; `packages/game/src/hud/themes.ts` is E-J's.
- Stage owned paths explicitly (`git add <paths>`). Never `git add -A`, `git add .` or `git commit -a`. Never stage `fixtures/asset-corpus/{avocado,damaged-helmet}.glb` or `fixtures/environment-corpus/hdri/*_1k.hdr` (LFS mismatch files).
- Never run `aura3d assets import-meshy`, `assets validate` or `assets typegen` from the repo root without `--into` / an app-local manifest: they rewrite the root `aura.assets.json` and `src/aura-assets.ts`.

## Interim-path rule (PRD D6)

When a game item needs a NEW engine API from lane E-x, implement it now on 4.6.x APIs wherever possible, behind a small adapter in the game's own folder (for example `art/engineCompat.ts`), and mark the swap point with a `// GU47(E-x): ...` comment so wave 2 is a one-line change. Items with no interim path are recorded as `blocked (E-x)`. Items that need a new Meshy asset are written so the asset key drops in later (keep today's asset or a clearly named placeholder; never a primitive hero subject) and recorded as `blocked (WP-36)` for the asset part. Items that are measurements, captures, judging or posters are `phase 2`.

## HDRI catalogue convention (E-A and every game)

- E-A ships one 1k copy per catalogued id at `public/hdri/<id>_1k.hdr`, served at `/hdri/<id>_1k.hdr`. The ids are the `AuraHdriId` union in PRD §3.1 E-A: the corpus or library file stem without its size suffix (`belfast_sunset_puresky`, `venice_sunset`, `rooftop_night`, `outdoor-midday`, `sunset-dramatic`, `indoor-workshop`, ...). A game that needs a 2k copy asks E-A for `public/hdri/<id>_2k.hdr` in a handoff (`aura3d assets optimize --hdri 2k`).
- Look-preset games use the NEW look override `hdri: "<id>"` behind their `art/engineCompat.ts` adapter until E-A merges. Hand-built games declare `{ type: "texture", format: "hdr", url: "/hdri/<id>_1k.hdr" }` in their asset table and pass it to `environments.hdri(...)`.
- Those files 404 until E-A merges; that is expected in phase 1 (nothing runs). Do not vendor 2k HDRIs into game folders.
- `public/hdri/*.hdr` is not LFS-tracked today. In wave 1, E-A owns the `.gitattributes` lines for `public/hdri/` (it may add LFS rules that match only the new catalogue files; the existing `autumn_field_puresky_1k`, `kloppenheim_06_puresky_1k`, `studio_small_08_1k` and `night-2k` stay regular blobs). WP-36 owns the rest of `.gitattributes`.
- Primary-sky duplicates across games are resolved by WP-38 (PRD §6.1, last paragraph); use the HDRI your WP names.

## Hard rules

- No local browsers, no local Playwright, no local Docker, no dev server opened in a browser. Phase 1 has no remote runs either.
- No `git push`. Do not touch `/Users/gurbakshchahal/platforms/aura3d` (the main checkout) or another lane's worktree. Do not delete, rebase or reset any branch but your own. Do not change git config.
- No Meshy or other paid generation outside lane wp36.
- PRD D8: presentation only. Sims, physics, collision, scoring, input, replays and reference hashes stay byte-identical. Run the game's sim/replay/parity/motion/shader-compile unit tests before and after your change.
- Fonts (PRD D9, machine policy): licensed faces from `/Users/gurbakshchahal/fonts` only (read its `README.md` and the family's license notes); self-host `.woff2` copies; never Inter, Roboto, Google Fonts (including Barlow), Geist or a system stack as the face.
- Aura3D is never described as built on three.js. Every visual number is "software WebGL2".
- No secrets in code, logs, commits or evidence (`PRISM_API_KEY`, `MESHY_*` come from the environment).
- Budgets are never raised to pass (PRD D7, `BUNDLE_SIZES.md`).
- Low tier and reduced motion (PRD §6.3, §6.4) are part of every item, not an afterthought.

## Local verification (light, static and unit only)

- Typecheck gate (holds one of 6 machine-wide slots; prints `NEW_ERRORS <n>`, must be 0):
  - engine and tools: `node /Users/gurbakshchahal/platforms/aura3d-gu47/bin/typecheck-delta.mjs`
  - a game app (covers the `examples/` it imports): `node /Users/gurbakshchahal/platforms/aura3d-gu47/bin/typecheck-delta.mjs --app apps/<appFolder>` (baseline: 0 errors for every live game unless the baseline file says otherwise)
- Unit tests: `node_modules/.bin/vitest run <files or dirs> --maxWorkers=2`. Run the suites you will touch on the base commit before your first edit, so the report can say "no test fails on the branch that passes on the base".
- Lint: `node_modules/.bin/eslint <touched files>`.
- Game lanes: `node tools/game-checks/run.mjs <slug>` (0 errors; record warnings).
- Skill docs: `pnpm check:skills` after editing anything under `packages/aura3d-cli/skills/`.
- Prefer `node_modules/.bin/<tool>` over `pnpm exec <tool>`. Never run the whole unit suite; never raise worker counts.
- The `aura3d` CLI runs from source in a worktree (no `dist` is built there): `node_modules/.bin/tsx --tsconfig tsconfig.base.json packages/aura3d-cli/src/cli.ts <command> ...`.

## Commits

Small commits per row group, in the `git log` style (`<area>: <what and why>`, lower-case area such as `engine:`, `looks:`, `post:`, `games(aura-slam):`), naming the row ids. Trailer on every commit:

```
Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>
```

## Lane report (required): `docs/prds/game-upgrades-47/lanes/<lane>.md`

1. Header: branch, base commit, wave.
2. Rows table: `ID | Pri | Status | Commit | Notes / evidence`. Status is one of `done`, `done-interim (E-x)`, `partial`, `blocked (E-x | WP-36)`, `phase 2`, `not done (reason)`.
3. Handoffs: `to lane | file:symbol | change | why`.
4. Game lanes: new luma-target rows for E-I (id, URL with params, group tag, settle times, crops), the real-GPU scenario row, and the wave-2 asset needs (key, Meshy prompt, profile, size, used by row).
5. CHANGELOG text for WP-38 (software WebGL2 wording, no three.js lineage).
6. Phase-2 plan: the captures, crops and acceptance numbers each row needs.
7. Verification: typecheck delta, suites run with base-vs-branch results, lint, game-checks.

Update and commit the report after every row group so a successor can resume from it.

## Per-game look contract (PRD §3.2), phase-1 part

Every game lane ships in its own folder: `art/direction.ts` (`defineArtDirection`, with a unit test that runs `auditArtDirection` on it), the look table file(s) the WP names (one row per variant), the VFX preset pack (`vfx.ts` or `fx.ts`), and under `evidence/game-upgrades-47/<slug>/`: `identity.md` (palette with hex, variants with time of day and HDRI or sky, signature effect; frames and judge results are added in phase 2), `budget.json` (`before` rows from the newest committed evidence, `after: null` until phase 2) and `checklist.md` (every acceptance line of the WP with its status).

## Definition of done for phase 1 (per lane)

Every M and S row is `done`, `done-interim`, or `blocked`/`phase 2` with a reason; C rows done where cheap. Typecheck `NEW_ERRORS 0` (engine and, for game lanes, the app). No new failures in the touched suites. Game-checks 0 errors. Lane report committed.
