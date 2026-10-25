# Game checks baseline (2026-10-25)

Command: `node tools/game-checks/run.mjs --all` (see `docs/agents/new-game-checklist.md`). Branch `game-rework`, 26 live games from `docs/workflows/game-inventory.json`, 644 source files scanned in under a second. 23 errors and 32 warnings at the time of writing; 15 of 26 games are clean.

These are static, heuristic checks. A clean result means "none of the known mistakes found by these scans", not "the game is good": frames, replay and the likeness tests still apply. Heuristic limits: visible text is read from HTML and string literals (not rendered DOM), the quick bar check only knows common class names, and the pose-array and hit-stop checks are hints (warnings).

## Results per game

| Game | Findings |
|---|---|
| `aura-diamond-3d` | names (warn) x1 |
| `aura-fc-3d` | fonts (warn) x2 |
| `aura-hoops-3d` | names (warn) x1 |
| `aura-links-3d` | names (warn) x1 |
| `cloud-runner-port` | names x2, likeness x3, runtime-masking x1 |
| `iron-crown` | fonts (warn) x4 |
| `ninja-runner-port` | likeness x8, runtime-masking x1 |
| `red-zone-3d` | names (warn) x1, likeness (warn) x1 |
| `serpentine-sky-run-port` | names x1, likeness x6, runtime-masking x1 |
| `teleoperator` | names (warn) x1 |
| `top-tennis` | fonts (warn) x3 |

Clean on every check (15): `roadster-rush`, `heatsink`, `pips-big-leap`, `bunker-zero`, `slingshot-siege`, `dot-dash-3d`, `cross-hop`, `strange-orbit-port`, `splat-rush-port`, `drift-and-deliver-port`, `heatsink-port`, `last-train-port`, `roadster-hours-port`, `where-the-wind-wanders-port`, `silt-and-signal-port`.

Global: vercelignore (warn) x12, meshy-cap (warn) x5.

## What the errors are (not fixed here)

1. **Runtime label masking hides borrowed lore instead of removing it** (`runtime-masking`, `likeness`, `names`; Cumulus Dash `cloud-runner-port`, Serpentine Sky Run, Shadowstep Gauntlet `ninja-runner-port`). Each `apps/showcase-*-port/src/labels.ts` calls `installNeutralLabels` with a table such as `["Goku","Runner"]`, `["Saiyan","Sky"]`, `["Naruto","Runner"]`, `["Hidden Leaf Village","Lantern Village"]`. The simulation sources still contain the terms (`examples/saiyan-snake-way-port/sim.ts:974` "King Kai", `examples/ninja-runner-port/course.ts:81` "Hidden Leaf", `examples/ninja-runner-port/sim.ts:35` "Rasengan", about 30 lore references in `examples/kid-goku-beyond-the-clouds-port`). The masking layer is exactly the patch-style code the owner asked to remove, and the terms are in the shipped bundle. Fix: rename in source (strings, identifiers, comments that ship in the bundle), delete `installNeutralLabels` and `apps/showcase-port-shared/neutralLabels.ts`, keep replay tests green. Estimate: 1 to 2 days across three games, highest priority of this list.
2. All 23 errors above are these three games; no other game has an error.

## Fixed in this pass

- `examples/aura-slam/index.html`: removed the "AURA3D ENGINE" chip (example page, not the shipped page).

## Warnings (not fixed)

| Finding | Where | Why not fixed |
|---|---|---|
| Hand-typed stale `engineVersion: "4.0.2"` in evidence objects | Diamond, Hoops, Links, Red Zone main/evidence code; Teleoperator `version` text | There is no exported engine version constant; needs one (small library addition) then the five edits |
| Fonts outside the licensed set (`Arial Black`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI` as fallbacks) | FC hud and modes, Iron Crown, Aura Slam example styles | Changing the display face of FC's heavy numerals needs a visual check |
| Asset key names a real product (`rzLombardiCupMeshy`) | Red Zone | Renaming the key touches typegen, manifests and tests; the trophy model itself is flagged in `docs/audit/likeness-brand-audit.md` |
| Meshy tags over the 420 guideline: ninja 496, silt 453, cloud-runner 446, roadster 445, drift 440 | `/tmp/meshy/ledger.jsonl` | Credits are spent; the helper does not hard-stop per game (add a hard cap to `meshy.mjs`) |
| 12 unanchored `.vercelignore` patterns (`artifacts/`, `benchmark/`, `archive/`, `tmp/`, ...) | `.vercelignore` | Anchoring would add files to the deploy and the repo is near the 15,000-file limit (`docs/archive/` is excluded by `archive/` on purpose); the one dangerous pattern (`evidence/`) is already anchored |

## Checks that found nothing on this branch (and why that is expected)

`fixed-step-presenter` (the interpolation rollout landed), `canvas-resize`, `hitstop-time`, `pose-array`, `kits`, `asset-provenance`, `no-three`, `quickbar`, `screens-tracked`, `counts`. They are regression guards: run them before every release.
