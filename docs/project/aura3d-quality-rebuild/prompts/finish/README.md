# Finish phase: how to run it

Plan of record: `../../PRD-16-FINAL-REMAINING-WORK.md` (PRD-16). Base: `main` @ `afb475c2` (2026-10-08). Inputs:
`../../_sections/{integration-findings,issues-triage,process-remediation}.md`, `CONTRACTS.md`, `CI-ROUTING.md`, the
per-lane audits (`/tmp/qrfinal/audit-NN.json`).

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

## Prompts

| Prompt | Lane / scope | Flag(s) | Owns | Audit % |
|---|---|---|---|---|
| `FINISH-00-integration-recovery.prompt.md` | Track 0. Single agent acting for lanes 01 + 12 + 15 | (blocks all promotions) | PRD-16 §2. Writes T0-01 if it claims it first, T0-02..07 (lane-01 halves), T0-10..14, T0-19, T0-23, T0-28, T0-31 (15 files), §2.3, §2.5 `qr-required.yml`, P-01, `process/ruleset-main.proposal.json`. Files and verifies issues for the other-lane T0 rows | — |
| `FINISH-PROCESS-remediation.prompt.md` | Track P. Lane 15 custodian with lane 12 tooling | — | PRD-16 §3: P-02, P-10, P-23, P-29 (#357 timeout), P-32, P-37, P-50..52, P-56/57 (12/15 parts), P-60, the `requireOrSkip()` helper, ownership checker, checklist-lint, `process/OWNER-ACTIONS.md`. Files a `qr-request` for every other-lane P row | — |
| `FINISH-LANE-01.prompt.md` | Lane 01, rendering core/colour/HDR/PBR | `A3D_QR_CORE` (+`_OUTPUT`, `_GENERATOR`) | §4.1 (01-GENTEST … 01-I); T0-01 if it claims it first; reviews FINISH-00's T0-02..T0-07 PRs (writes them only if FINISH-00 is not running); P-07, P-51 (F-01-02), P-55, P-56 (IC-0 TBD), P-61, P-64 | 38 |
| `FINISH-LANE-02.prompt.md` | Lane 02, lighting/IBL/shadows | `A3D_QR_LIGHTING` | §4.2; T0-08, T0-09, T0-24..27; P-06, P-51, P-54, P-64 | 40 |
| `FINISH-LANE-03.prompt.md` | Lane 03, post/AA/tonemap | `A3D_QR_POST` | §4.3; T0-15..17, T0-07 (PostGraph half); P-08, P-22, P-26, P-54, P-58, P-64 | 50 |
| `FINISH-LANE-04.prompt.md` | Lane 04, materials/glTF | `A3D_QR_MATERIALS`, `_TRANSMISSION`, `_KTX2` | §4.4; T0-05 (co-PR with 01), T0-18; P-20, P-29, P-35, P-56, P-64 | 50 |
| `FINISH-LANE-05.prompt.md` | Lane 05, asset pipeline | `A3D_QR_ASSETS`, `_DECODERS`, `_LOD`, `_LOOKDEV` | §4.5; T0-21 (decoder `.wasm` dropped by `.gitignore:273`), T0-22, T0-13 (prd05 adapter) | 50 |
| `FINISH-LANE-06.prompt.md` | Lane 06, animation | `A3D_QR_ANIMATION` | §4.6; T0-20; P-21, P-22, P-27..29, P-51, P-54, P-61, P-64 | 55 |
| `FINISH-LANE-07.prompt.md` | Lane 07, VFX | `A3D_QR_VFX` + `_SKY/_FOG/_VOLUMETRIC/_DECALS` | §4.7; T0-34 (FIX-softdepth-feedback/-volumetric-target/-transient-lights); P-03, P-33, P-34 | 45 |
| `FINISH-LANE-08.prompt.md` | Lane 08, camera/game feel | `A3D_QR_CAMERA` | §4.8; T0-32 (with 15); P-38, P-52, P-54 | 40 |
| `FINISH-LANE-09.prompt.md` | Lane 09, shared game runtime | `A3D_QR_GAME` | §4.9; T0-30; P-22, P-25, P-53, P-54, P-61 | 40-55 |
| `FINISH-LANE-10.prompt.md` | Lane 10, world/environment | `A3D_QR_WORLD` + `_TERRAIN/_WATER/_BIOME` | §4.10; T0-33 (FIX-P0-graph/-tier/-compile-cache), T0-23 lane side; P-04 | 35 |
| `FINISH-LANE-11.prompt.md` | Lane 11, WebGPU/tiers | `A3D_QR_TIERS`, `A3D_QR_WEBGPU` | §4.11; T0-35 (T11-POOL/-TIMING/-COUNTERS/-RESET); P-09, P-30, P-31 | 40-45 |
| `FINISH-LANE-12.prompt.md` | Lane 12, benchmark/regression infra | (none) | §4.12 lane work: V1-V20, panel rounds, IC-0 re-record, issues | 40-45 |
| `FINISH-LANE-13.prompt.md` | Lane 13, authoring/skills/templates | `A3D_QR_LOOKS` | §4.13; P-24, P-36, P-57 | 45 |
| `FINISH-LANE-14.prompt.md` | Lane 14, 18-game rebuild | 18 × `A3D_QR_ROUTE_<ID>` | §4.14; T0-29 (game code); P-05 + the 22 `existsSync(v2/boot.ts)` guards | 25-30 |
| `FINISH-LANE-15.prompt.md` | Lane 15, API/packages (custodian) | `A3D_QR_COMPILER`, `A3D_QR_STRICT` | §4.15 lane work, CCRs, `flags.state.ts` custody, root-manifest batch | 60-65 |

Lane 01 has its own prompt, `FINISH-LANE-01.prompt.md`. FINISH-00 stays the writer of the lane-01 halves of T0-02..T0-07;
the lane 01 agent reviews those PRs, writes P-07 (FINISH-PROCESS files it as a `qr-request` to:prd01) and every non-Track-0
§4.1 row (01-GENTEST … 01-I, PRD-16 §4.1), and does not edit the T0-touched lines until each T0 PR merges.

T0-01 (the MSAA mount fix) is claimed, not assigned. Both FINISH-00 and FINISH-LANE-01 do the same thing first: look for an
open PR or a `qr/prd01-t0-01*` branch. If one exists, they review it and do not write T0-01. If neither exists, they open a
draft PR on `qr/prd01-t0-01-msaa-mount` within 15 minutes. That draft PR is the claim, and the other agent only reviews it.

## Overlaps between prompts

The lane 12 and lane 15 prompts also list rows that FINISH-00 or FINISH-PROCESS own. The prompts do not mention each other,
so these rules decide who writes each row:

| Row(s) | Writer | Others |
|---|---|---|
| T0-01 | First claimant (FINISH-00 or FINISH-LANE-01), see claim rule above | The other agent reviews |
| T0-02..T0-07 (lane-01 halves) | FINISH-00 | FINISH-LANE-01 reviews and records lane-01 acceptance in each PR; writes them only if FINISH-00 is not running |
| T0-10..T0-14, §2.3, §2.5, P-01 | FINISH-00 | FINISH-LANE-12 skips these. It works on V-rows, the panel and IC-0, and reviews FINISH-00's harness PRs |
| T0-19, T0-23, T0-28, T0-31 (15 files), T0-32 (15 half), ruleset JSON | FINISH-00 | FINISH-LANE-15 reviews; it does not write these |
| P-02, P-10, P-23, P-29 (#357 timeout), P-32, P-37, P-50..52, P-60, ownership checker, checklist-lint, OWNER-ACTIONS.md | FINISH-PROCESS | FINISH-LANE-15 and FINISH-LANE-12 do not write these. They pick up their remaining rows from §4.12 / §4.15 |
| T0-05 | One co-PR: lane 01 (FINISH-00) + lane 04 | Branch `qr/prd01-t0-05-chunk-splice`. Lane 04 accepts in the PR body |
| Every other-lane T0 / P row | The owning lane agent | FINISH-00 or FINISH-PROCESS files the `qr-request` + `to:prdNN` issue and verifies it with a bisect run |

When a row's owner is unclear, the first agent to need it comments on the Track 0 or Track P tracking issue. The other agent
confirms there before anyone writes code. Nobody edits another lane's files without the owner's recorded acceptance
(PRD-16 §3.3.3, `.github/QR_OWNERSHIP.json`).

## Run order

### 1. Hour 0: start FINISH-00 and FINISH-PROCESS

1. Start both agents at once, each in its own worktree (step 2).
2. FINISH-00 opens the tracking issue `Track 0 — integration recovery` (label `qr-ic-regression`). It follows the order in
   PRD-16 §2.1:
   - harness honesty first (T0-10..14), so a failure costs about 2 s and is reported as a failure;
   - then renderer mount (T0-01..07);
   - then RT/state hygiene, then build breakers, then second-layer interactions.
   - It ships one PR per step, and each PR cites the §2.4 bisect round it unblocks.
3. FINISH-PROCESS opens the Track P tracking issue and files one `qr-request` for every other-lane P row. Removing masks
   will turn today's green jobs **red**. That is the intended result.

### 2. Same moment: start all 15 lane prompts (01-15), one worktree each, from `main`

Run this from the repo root, once per lane. Use the branch prefix the prompt asks for (`qr/prdNN-*`).

```bash
git fetch origin
git worktree add ../aura3d-finish-prd02 -b qr/prd02-finish origin/main   # repeat per lane: 01..15, plus 00 and process
```

- **One agent per worktree, and one worktree per lane.** Never share a worktree between agents, and never run two agents
  on the same lane (see the lane 13 note above).
- **Rebase onto `origin/main` before every PR.** Base every PR on `main`.
- **Days 1-2 (to 2026-10-10):** lanes write freely in their own files, but they may **merge only Track 0/P rows** until
  `qr-required.yml` exists on `main` (PRD-16 §6.1 `:825-827`). Lanes 02, 03, 04, 05, 06, 07, 08, 09, 10, 11 and 14 do their T0 rows (07: T0-34, 10: T0-33, 11: T0-35)
  first.
- **Days 3-7 (to IC-1):**
  - every lane removes its own masks (§3.1-3.2);
  - every lane fixes its workflow triggers (§4.0 `:361-363`: `push: main`, `schedule`, widened `paths`, macos-14, artifacts on
    `always()`);
  - every lane files its outbound requests (P-64) and confirms or closes its "Y?" issues (step 5).
- **All browser, GPU, capture and heavy-build work runs remotely:** GitHub macos-14, or the GitLab macOS pipeline
  (`CI-ROUTING.md`). Nothing runs on the Mac except editing, git and orchestration. This means no local Docker, browsers or
  full suites.

### 3. Gate: no promotion until Track 0's all-flags gate is green

A lane may not open a promotion PR, and lane 15 may not change any state in `flags.state.ts`, until **every** condition
below holds. Each condition needs a cited run id.

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

### 4. Weekly checkpoints (Thursdays, PRD-16 §6.2 `:834-849`)

| Checkpoint | Date | Gate |
|---|---|---|
| IC-0 re-record | 2026-10-10 | `history/rounds/IC-0.json` + noise floor (lane 12) |
| **IC-1** | 2026-10-15 | Track 0 exit; Track P §3.1-3.4 merged; ruleset live; `qr-no-cross-lane-import` = error; requests filed |
| IC-2 | 2026-10-22 | first `standalone-accepted`. Likely: 15 compiler/strict, 02, 03, 05 |
| IC-3 | 2026-10-29 | generator keys on base scenes (01 S7); material lobes visible (04); remaining standalone promotions |
| **IC-4 G-PANEL 1** | 2026-11-05 | first `integrated-accepted`; wave-1 games; panel round 1 |
| IC-5..7 | 11-12, 11-19, 11-26 | `default-on` after two clean checkpoints |
| **IC-8 G-PANEL 2** | 2026-12-03 | wave-2 games; goldens blocking; templates on looks |
| IC-9..11 | 12-10, 12-17, 12-24 | removals for flags that have been `default-on` for two checkpoints |
| **IC-12 G-PANEL 3** | 2026-12-31 | waves 3 + 4 games |
| **IC-16 G-PANEL final** | 2027-01-28 | final acceptance (PRD-16 §6.3) |

Each checkpoint follows the same procedure:
1. Lane 12 runs the nightly-on-main capture (18 base + lane scenes, both engines, `none` and `$ALL`; games 9/9 with `all`).
   From IC-1 on it also runs leave-one-out (`all,-<lane>`, §2.4 Round 3).
2. Every agent posts its "Report back" block, as defined at the end of each prompt, to its tracking issue. The block must
   carry run ids, and any claim that was not reproduced is marked *(code-read)*.
3. For each regression, lane 15 files a `qr-ic-regression` + `to:prdNN` issue against the lane that leave-one-out names.
4. Lane 15 is the **only** writer of flag state changes. It applies them in `flags.state.ts` from the checkpoint record
   (`evidence/prdNN/checkpoints/IC-<k>.md`), and each change cites the run that met the criteria.
5. A promoted lane that gets an attributed regression goes back one state. The default-on clock restarts.

### 5. Issues (https://github.com/auraoneai/aura3d/issues)

There are 195 open issues: 115 `qr-request`, 35 `handoff-14`, 17 removal, 15 CCR, 8 fact-13 and 5 other. The full triage is
in `_sections/issues-triage.md`, with a summary in PRD-16 §5 (`:758-810`). Each lane prompt has an "Issues to action / close"
section for its own issues.

- **Close in week 1:**
  - done or obsolete: #74, #155, #164, #225, #232 (check against §8 first), #236, #247, #251, #261, #339;
  - verify, then close: #161, #211;
  - close with the T0-28 PR (not before; it is also a Track 0 blocker): #145;
  - duplicates: #172 → #72, #314 → #254, #77/#78/#79.
- **Track 0 blockers:** #156 (12), #54 (09), #145 (15), and #313. Withdraw the #313 flag promotion until the S-rows pass.
- **Spot-check the 107 "Y?" rows.** Nobody has checked them yet. Each owner confirms or closes its rows in its first PR
  of the Track 0 week.
- **#137** (Kiro Prism Actions secret) blocks lane 13. It is an owner action.

## Owner actions (Gurbaksh; agents prepare these, never apply them)

These come from `process/OWNER-ACTIONS.md` and `process/ruleset-main.proposal.json`:
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
