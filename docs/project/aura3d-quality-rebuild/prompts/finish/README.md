# Finish phase: how to run it

Plan of record: `../../PRD-16-FINAL-REMAINING-WORK.md` (PRD-16). Base: `main` @ `afb475c2` (2026-10-08). Inputs:
`../../_sections/{integration-findings,issues-triage,process-remediation}.md`, `CONTRACTS.md`, `CI-ROUTING.md`. The
per-lane audit is summarized in PRD-16 §1.2 (the raw audit JSON files are no longer available).

## State this phase starts from

None of this is done. The 2026-10-08 audit rated all 15 PRDs PARTIAL, and every lane flag is still `dev`
(`packages/rendering/src/contracts/flags.state.ts`).

- **Flags none:** pixel-identical to baseline (IC-0 pass).
- **Benchmark, 13 lane flags on** (GitLab pipeline 2926601350): **0/18** scenes rendered.
  - 12 hit the 240 s timeout.
  - 6 reported `ready` but had `drawCalls 0` and black frames.
  - 10/13 lane scenes failed.
- **Strict mode:** every Aura scene throws `AuraMigrationError`, because the harness passes `renderer.mode` (T0-13).
- **All-flags games** (pipeline 2926540757): 9/9 crashed or never drew.
- **CI:** `main` has no protection and no required checks (PRD-16 §3.3). 109/136 merged PRs had a failing check.

Only a passing remote run whose id is cited next to a task counts as proof. These do not:
- merged code or ticked boxes;
- local runs;
- jobs that are green only because they are masked.

## Run exactly 5 agents, all at hour 0

Paste one group prompt into one lead agent. That is 5 agents in total, all started at the same moment. There is no
sequencing between groups.

Each lead is an orchestrator. It creates one worktree per lane in its group, runs one subagent per lane in parallel, and
fans out further inside a lane when tasks are independent. It serializes PR merges inside its group and owns cross-lane
coordination inside the group.

`briefs/` holds the detailed per-lane task lists (the former FINISH-00, FINISH-PROCESS and FINISH-LANE-01..15 prompts,
kept verbatim). **They are not prompts to run separately.** A lead hands each lane subagent its lane brief. Each group
prompt has a "Brief override" table that maps the old agent names in the briefs to groups; see also the ownership table
below.

| Prompt | Lanes (audit %) | Flags | Headline T0 / P rows |
|---|---|---|---|
| `GROUP-1-RENDER-PIPELINE.prompt.md` | 01 core/colour/HDR/PBR (38), 02 lighting/IBL/shadows (40), 03 post/AA/tonemap (50), 04 materials/glTF (50) | `A3D_QR_CORE` (+`_OUTPUT`, `_GENERATOR`), `A3D_QR_LIGHTING`, `A3D_QR_POST`, `A3D_QR_MATERIALS`, `_TRANSMISSION`, `_KTX2` | T0-01..T0-07 (renderer mount; T0-01 MSAA mount fix first), T0-08, T0-09, T0-15..18, T0-24..27; §4.1-§4.4; P-06, P-07, P-08, P-20, P-22, P-26, P-29 (lane 04 part), P-35, P-51, P-54, P-55, P-56, P-58, P-61, P-64 |
| `GROUP-2-GPU-WORLD-FX.prompt.md` | 07 VFX/sky/fog/volumetric/decals (45), 10 world/terrain/water/biome (35), 11 WebGPU/tiers/perf (40-45) | `A3D_QR_VFX` + `_SKY/_FOG/_VOLUMETRIC/_DECALS`, `A3D_QR_WORLD` + `_TERRAIN/_WATER/_BIOME`, `A3D_QR_TIERS`, `A3D_QR_WEBGPU` | T0-33 (FIX-P0-graph/-tier/-compile-cache), T0-34 (FIX-softdepth-feedback/-volumetric-target/-transient-lights), T0-35 (T11-POOL/-TIMING/-COUNTERS/-RESET), T0-23 lane-10 side; §4.7, §4.10, §4.11; P-03, P-04, P-09, P-22 (07/10/11 sites), P-23 (`tools/bundle-size` hunk), P-30, P-31, P-33, P-34, P-50 (run ids), P-54, P-55, P-58 (#313), P-61, P-64 |
| `GROUP-3-CONTENT-AUTHORING.prompt.md` | 05 asset pipeline/decoders/LOD/lookdev (50), 06 animation/skinning/IK (55), 13 authoring/skills/templates/looks (45) | `A3D_QR_ASSETS`, `_DECODERS`, `_LOD`, `_LOOKDEV`, `A3D_QR_ANIMATION`, `A3D_QR_LOOKS` | T0-20, T0-21 (decoder `.wasm` dropped by `.gitignore:273`), T0-22, T0-13 prd05/prd06 adapter copies; §4.5, §4.6, §4.13; P-10 (`template-lookdev.yml:83` hunk), P-21, P-22, P-24, P-27..29, P-36, P-37 (lane-13 hunks), P-38 (files), P-51, P-54, P-55, P-56, P-57, P-61, P-64 |
| `GROUP-4-GAMES.prompt.md` | 08 camera/game feel (40), 09 shared game runtime (40-55), 14 18-game rebuild (25-30) | `A3D_QR_CAMERA`, `A3D_QR_GAME`, 18 × `A3D_QR_ROUTE_<ID>` | T0-29 (game code), T0-30, T0-32 lane-08 half; P-05 + the 22 `existsSync(v2/boot.ts)` guards; §4.8, §4.9, §4.14; P-22, P-25, P-38, P-52, P-53, P-54, P-61, P-64 |
| `GROUP-5-GATEKEEPER.prompt.md` | 12 benchmark/regression harness (40-45), 15 API/packages + custodian (60-65) | `A3D_QR_COMPILER`, `A3D_QR_STRICT`; sole writer of `flags.state.ts` | All of Track 0 not owned by a lane above: T0-10..T0-14 harness honesty, T0-19, T0-23, T0-28, T0-31, T0-32 lane-15 half, §2.3 harness inputs, §2.4 bisection rounds, §2.5 `qr-required.yml` all-flags gate, P-01, ruleset proposal, Track 0 tracking issue. All of Track P custody: P-02, P-10, P-23 (`BUNDLE_SIZES.md`; G2 writes the `tools/bundle-size` hunk), P-29 (#357 timeout), P-32, P-37 (custody; G3 writes the lane-13 hunks), P-50..52, P-56 (12/15 parts), P-57/P-58 (verify only), P-60, `requireOrSkip()` helper, ownership checker, checklist-lint, `process/OWNER-ACTIONS.md`, `qr-request`s for other-group P rows. §4.12 (V1-V20, panel, IC-0 re-record), §4.15 (CCRs, root-manifest batch). Checkpoints, leave-one-out, flag-state changes |

## Quick start

From the repo root, create one lead worktree per group and start one agent session in each, all at once:

```bash
git fetch origin
git worktree add ../aura3d-finish-g1 -b qr/finish-g1 origin/main   # paste GROUP-1-RENDER-PIPELINE
git worktree add ../aura3d-finish-g2 -b qr/finish-g2 origin/main   # paste GROUP-2-GPU-WORLD-FX
git worktree add ../aura3d-finish-g3 -b qr/finish-g3 origin/main   # paste GROUP-3-CONTENT-AUTHORING
git worktree add ../aura3d-finish-g4 -b qr/finish-g4 origin/main   # paste GROUP-4-GAMES
git worktree add ../aura3d-finish-g5 -b qr/finish-g5 origin/main   # paste GROUP-5-GATEKEEPER
```

You do not create lane worktrees. Each lead creates its own, one per lane, for example
`git worktree add ../aura3d-finish-prd02 -b qr/prd02-finish origin/main`, and gives each lane subagent its own worktree.

- **One agent per worktree.** Never share a worktree between agents, and never run two subagents on the same lane files.
- **Rebase onto `origin/main` before every PR.** Base every PR on `main`. Lane PRs use the `qr/prdNN-*` branch prefix.
- **Hour 0:** G5 opens the `Track 0 — integration recovery` tracking issue (label `qr-ic-regression`) and the Track P
  tracking issue, and files a `qr-request` for every other-group P row. G1 writes T0-01 first, then T0-02..T0-07. G5 does
  harness honesty (T0-10..14) first, so a failure costs about 2 s and is reported as a failure. Every T0 PR cites the §2.4
  bisect round it unblocks. Removing masks will turn today's green jobs **red**. That is the intended result.
- **Days 1-2 (to 2026-10-10):** lanes write freely in their own files, but may **merge only Track 0/P rows** until
  `qr-required.yml` exists on `main` (PRD-16 §6.1 `:825-827`). Every group does its T0 rows first.
- **Days 3-7 (to IC-1):** every lane removes its own masks (§3.1-3.2), fixes its workflow triggers (§4.0 `:361-363`:
  `push: main`, `schedule`, widened `paths`, macos-14, artifacts on `always()`), files its outbound requests (P-64) and
  confirms or closes its "Y?" issues (Issues below).
- **All browser, GPU, capture and heavy-build work runs remotely:** GitHub macos-14, or the GitLab macOS pipeline
  (`CI-ROUTING.md`). Nothing runs on the Mac except editing, git and orchestration: no local Docker, browsers or full suites.

## Group ownership

File ownership stays single-writer per `.github/QR_OWNERSHIP.json` `lanePatterns`; the groups own disjoint lane sets.

| Row(s) | Writer |
|---|---|
| T0-01..T0-07 (incl. T0-05 chunk splice, now internal to G1), T0-08, T0-09, T0-15..T0-18, T0-24..T0-27; T0-28 renderer seam (`renderer/FrameGraph.ts:30-35`) and lane-02 `prd02LightingOn()` reader (`compiler/lights.ts:414`); T0-10/T0-13 adapter copies in `aura3d/scenes/prd{01,04}/common.ts`; T0-31 `prd02-lighting-legacy-golden.test.ts:10`; P-58 QR-03-22 | G1 |
| T0-23 lane-10 side, T0-33, T0-34, T0-35; T0-28 07/11 global-writer removals; T0-13 adapter copies in `prd07/common.ts:331` and 3 `prd11/` scenes; P-23 `tools/bundle-size/index.ts` cap hunk (owner 11); P-58 #313 | G2 |
| T0-13 adapter copies in `prd05/common.ts` and 3 `prd06/` scenes, T0-20 source fix (`RetargetWorker.ts:16`), T0-21 (commits the `.wasm`), T0-22; P-37 and P-10 `template-lookdev.yml:83` hunks (lane-13 files; G5 keeps custody) | G3 |
| T0-29 game code, T0-30 beacon, T0-32 lane-08 half, T0-31 restored `apps/showcase-*` audio modules only; P-05 + 22 `existsSync` guards | G4 |
| T0-10..T0-14 (shared harness), T0-19, T0-20 lane-15 half (`finalize-dist`, pack-check, packed-consumer fixture), T0-23, T0-28 engine side, T0-29/T0-30 `capture-games.mjs` halves + games loop, T0-31 coordination + owner-15/12 files (incl. `route-cue-maps.test.ts`), T0-32 lane-15 half, `.gitignore` negations (T0-21/P-38), §2.3, §2.4, §2.5, P-01, P-22 `tests/browser/**` sites, ruleset JSON, Track 0 + Track P tracking issues, all Track P custody rows (see table above) | G5 |
| Every other T0 / P row | The group that owns the row's lane. G5 files the `qr-request` + `to:prdNN` issue and verifies it with a bisect run |

When a brief says another agent writes a row, the group that owns that row writes it. A row that crosses groups (T0-13,
T0-20, T0-23, T0-28, T0-29, T0-30, T0-32, P-23, P-38) has one PR per half; the other group reviews and records acceptance in the PR body. T0-31 (repo Type Check)
is coordinated by G5, but each failing file is fixed by the group that owns it per `check.mjs` (G5 `route-cue-maps.test.ts`,
which resolves to owner 15, with G4 restoring any `apps/showcase-*` audio module it needs; G3
lane-13 files and `route-bundle-no-asset-metadata.test.ts`; G1 `prd02-lighting-legacy-golden.test.ts`, with G5's acceptance). When ownership is
unclear, the first lead to need the row comments on the Track 0 or Track P tracking issue, and the other lead confirms
there before anyone writes code. Nobody edits another group's files without the owner's recorded acceptance (PRD-16
§3.3.3).

## Gate: no promotion until Track 0's all-flags gate is green

No group may open a promotion PR, and G5 may not change any state in `flags.state.ts`, until **every** condition below
holds. Each condition needs a cited run id.

- The **Track 0 exit** (PRD-16 §2.5 `:252-253`) is met:
  - Round 5 renders 18/18 base scenes in both `none` and `$ALL`, with `drawCalls > 0`, no blank frame and ready ≤ 30 s;
  - every lane scene is `ready`;
  - 9/9 games draw with `all`;
  - `$ALL,strict` mounts every scene;
  - `allflags-smoke` is green on **two consecutive** main commits.
- `qr-required / qr-required` is a required check, and the ruleset is live. This is an owner action, prepared in
  `process/OWNER-ACTIONS.md`.
- The lane's own §4.0 `dev → standalone-accepted` criteria hold (`:353-356`):
  - every S-row is green in **one** lane-workflow run on main, with `--strict` and no masks;
  - sentinel identity (`qr_flags=none`) is recorded;
  - every lane C-40 fact is `verified` with a run id;
  - checklist-lint is green;
  - requests are filed;
  - no open issue in the §5.3 blocking list (`:798-810`) applies to the lane. #156 blocks every lane.

Before the gate opens, lanes keep working: fixes, S-row implementation, evidence runs with flags on, and issue work. While
Track 0 is open, the `$ALL` arms report **expected-red with an issue link**. A PR that turns a previously green arm red fails.

## Weekly checkpoints (Thursdays, PRD-16 §6.2 `:834-849`)

| Checkpoint | Date | Gate |
|---|---|---|
| IC-0 re-record | 2026-10-10 | `history/rounds/IC-0.json` + noise floor (G5, lane 12) |
| **IC-1** | 2026-10-15 | Track 0 exit; Track P §3.1-3.4 merged; ruleset live; `qr-no-cross-lane-import` = error; requests filed |
| IC-2 | 2026-10-22 | first `standalone-accepted`. Likely: 15 compiler/strict (G5), 02, 03 (G1), 05 (G3) |
| IC-3 | 2026-10-29 | generator keys on base scenes (01 S7); material lobes visible (04); remaining standalone promotions |
| **IC-4 G-PANEL 1** | 2026-11-05 | first `integrated-accepted`; wave-1 games; panel round 1 |
| IC-5..7 | 11-12, 11-19, 11-26 | `default-on` after two clean checkpoints |
| **IC-8 G-PANEL 2** | 2026-12-03 | wave-2 games; goldens blocking; templates on looks |
| IC-9..11 | 12-10, 12-17, 12-24 | removals for flags that have been `default-on` for two checkpoints |
| **IC-12 G-PANEL 3** | 2026-12-31 | waves 3 + 4 games |
| **IC-16 G-PANEL final** | 2027-01-28 | final acceptance (PRD-16 §6.3) |

Each checkpoint follows the same procedure:
1. G5 runs the nightly-on-main capture (18 base + lane scenes, both engines, `none` and `$ALL`; games 9/9 with `all`).
   From IC-1 on it also runs leave-one-out (`all,-<lane>`, §2.4 Round 3).
2. Every lead posts one "Report back" block per lane in its group (as defined at the end of each brief) to its tracking
   issue. The block must carry run ids, and any claim that was not reproduced is marked *(code-read)*.
3. For each regression, G5 files a `qr-ic-regression` + `to:prdNN` issue against the lane that leave-one-out names.
4. G5 is the **only** writer of flag state changes. It applies them in `flags.state.ts` from the checkpoint record
   (`evidence/prdNN/checkpoints/IC-<k>.md`), and each change cites the run that met the criteria.
5. A promoted lane that gets an attributed regression goes back one state. The default-on clock restarts.

## Issues (https://github.com/auraoneai/aura3d/issues)

There are 195 open issues: 115 `qr-request`, 35 `handoff-14`, 17 removal, 15 CCR, 8 fact-13 and 5 other. The full triage is
in `_sections/issues-triage.md`, with a summary in PRD-16 §5 (`:758-810`). Each lane brief has an "Issues to action / close"
section for its own issues; the group lead actions them.

- **Close in week 1:**
  - done or obsolete: #74, #155, #164, #225, #232 (check against §8 first), #236, #247, #251, #261, #339;
  - verify, then close: #161, #211;
  - close with the T0-28 PR (G5; not before, it is also a Track 0 blocker): #145;
  - duplicates: #172 → #72, #314 → #254, #77/#78/#79.
  - who closes (one closer each; G5 verifies the list): #232, #314, #78, #245 (G2 consumes and comments) → G1; #261, #77, #79 → G2; #211 → G4 (lane 09);
    #74 (G4 lane 14 confirms the inputs), #155, #164, #225, #236, #247, #251, #339, #161, #172, #145 → G5.
- **Track 0 blockers:** #156 (lane 12, G5), #54 (lane 09, G4), #145 (lane 15, G5), and #313. Withdraw the #313 flag
  promotion until the S-rows pass.
- **Spot-check the 107 "Y?" rows.** Nobody has checked them yet. Each lane confirms or closes its rows in its first PR
  of the Track 0 week.
- **#137** (Kiro Prism Actions secret) blocks lane 13 (G3). It is an owner action.

## Owner actions (Gurbaksh; agents prepare these, never apply them)

G5 prepares these in `process/OWNER-ACTIONS.md` and `process/ruleset-main.proposal.json`:
- the `main` ruleset and required contexts (PRD-16 §2.5 `:246-250`, §3.3);
- the #137 secret;
- the P-62 release order, or a signed waiver;
- the P-63 lean-fixture scope cut.

## Program done

All of PRD-16 §6.3 (`:851-869`) must hold, each item with a run id and a panel record:
- the Quality Bar passes on the shipped default path;
- every flag has gone through `standalone → integrated → default-on → removed`;
- G-PANEL passes;
- all 18 games score ≥ 7, or the owner has withdrawn them;
- the required checks have been active since IC-1 with zero bypasses.
