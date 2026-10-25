# Meshy credit reconciliation (2026-10-25)

Question: does the Meshy ledger match what Kiro Prism says was spent, and why do five game tags sit above the 420-credit guideline?

Method: read-only `GET /admin/meshy` on Kiro Prism (per-key balances, masked ids) compared with the ledger of every paid call. No credits were spent and no credential was printed. The ledger moved from `/tmp/meshy/ledger.jsonl` (ephemeral, outside the repo) to `~/.aura3d/meshy-ledger.jsonl`, the file `aura3d meshy ledger` owns. Record format is identical, so no row was changed; a baseline record and one adjustment record were appended.

## Result

| | Credits |
| --- | ---: |
| Ledger (all paid calls since 2026-10-23, 514 reservations) | 4,530 |
| Prism: pool balance fall since the first paid call | 4,855 |
| **Delta (Prism higher)** | **+325 (6.7%)** |
| Prism pool remaining today (30 keys, usable) | 13,343 |
| Owner cap (total authorised) | 10,000 |
| Left under the cap after booking the delta | 5,145 |

Prism-side number: the pool held 16,888 credits across 28 keys before the first paid call (`/tmp/meshy/HOWTO.md`, measured). Today it holds 13,343 across 30 keys, but keys `meshy-29-11698f` (310) and `meshy-30-3a6332` (1,000) joined later and are untouched, so the comparable 28 keys hold 12,033. 16,888 - 12,033 = 4,855. No key balance rose (no top-up or monthly reset in the compared keys).

## Why the ledger was 325 credits short

The old helper (`/tmp/meshy/meshy.mjs`) settled any non-zero exit with no task id as `failed`, which counts 0. A Meshy 429 on a **poll** (`/text-to-3d/<id>`) means the task was created and is charged; the helper logged it as failed anyway.

| Failed rows in the ledger | Rows | Estimated credits | Charged? |
| --- | ---: | ---: | --- |
| 429 on a poll (task existed) | 66 | 1,011 | Probably, when the task was not retried and reached SUCCEEDED |
| 429 on a create (rejected before a task existed) | 16 | 260 | No |
| Validation, unknown task, bad flag (exit 1, 2, 4, 5) | 24 | 201 | No |
| 503 `quota_exhausted` | 7 | 140 | No |

Only about a third of the poll-429 rows were charged and uncounted (+325 net). The rest were resumed with `get` and re-ledgered as a later call, or the task ended FAILED. Prism exposes per-key balances and a task count, not a per-task history, so the split between rows cannot be proven from the pool.

Small offsets that push the other way (about 58 credits): four reservations that were never settled (53 credits, process died after reserving: `last-train` 20, `roadster` 20, `cloud-runner` 3, `ninja` 10) and one ninja rigging task ledgered twice (5). They stay counted (conservative) until someone settles them with `aura3d meshy ledger reconcile --rid <id> --status ok|failed`.

Caveats on the delta: it is pool-wide (Prism cannot attribute spend to a game tag), so any other consumer of the same 28 keys since 2026-10-23 would also show up in it; the baseline total is a measured figure from the HOWTO, not a stored per-key snapshot.

## Credits per game tag (ledger, before the adjustment)

| Tag | Credits | vs 420 | Calls ok | Failed (0 credits) | Reserved, never settled |
|---|---:|---:|---:|---:|---:|
| drift | 500 | +80 | 44 | 9 (105 est.) | 0 |
| ninja | 496 | +76 | 60 | 10 (101 est.) | 1 |
| silt | 453 | +33 | 32 | 10 (190 est.) | 0 |
| cloud-runner | 446 | +26 | 61 | 15 (155 est.) | 1 |
| roadster | 445 | +25 | 40 | 11 (185 est.) | 1 |
| wind | 362 | under | 32 | 11 (143 est.) | 0 |
| last-train | 340 | under | 20 | 11 (170 est.) | 1 |
| apex | 300 | under | 20 | 2 (40 est.) | 0 |
| serpentine | 268 | under | 23 | 6 (63 est.) | 0 |
| heatsink | 260 | under | 17 | 12 (170 est.) | 0 |
| teleoperator | 255 | under | 19 | 3 (60 est.) | 0 |
| strange-orbit | 175 | under | 13 | 6 (100 est.) | 0 |
| splat-rush | 170 | under | 12 | 7 (130 est.) | 0 |
| pipeline | 30 | under | 2 | 0 | 0 |
| bunker-zero | 30 | under | 2 | 0 | 0 |
| **Total attributed** | **4,530** | | | | |
| `unattributed` (Prism delta, booked by `reconcile --apply`) | 325 | | | | |
| **Ledger total after reconcile** | **4,855** | | | | |

Prism cannot split the 325 by tag, so it sits under `unattributed` and counts toward the global cap only.

## Over-cap tags and why they overshot

Five tags exceed 420: drift +80, ninja +76, silt +33, cloud-runner +26, roadster +25 (total 240 credits over). The old helper did refuse a call that would pass the `--cap` it was given, but the cap was whatever each agent passed, the guideline of 420 was never enforced anywhere, and `drift` was regenerated after a car rework (`preview` 280, `remesh` 75). All five are recorded in `tools/game-checks/data/terms.json` as `meshyCapAcknowledged` ceilings equal to today's spend; the game-checks `meshy-cap` finding is informational up to that ceiling and a warning above it. New spend on those tags is refused by the CLI.

## What changed in the CLI (`aura3d meshy ledger`)

- `reserve` hard-stops at the per-tag cap (default 420, `$AURA3D_MESHY_GAME_CAP`, `--game-cap`, or `config --game-cap`) and at the global cap. A refusal exits 3, writes nothing, and prints the credits left and the exact flag or env var that raises the cap.
- `reserve --dry-run --op preview,refine,rigging` prices a chain and shows the credits left without writing; exit 3 when it would be refused.
- `settle --exit-code 6 --error-text "<meshy stderr>"` separates a 429 on a poll (unconfirmed, task id kept, counted) from a 429 on a create (failed, 0).
- `baseline` stores the Prism pool as the zero point (per key, or `--pool-remaining N --exclude-keys ...` for a total-only legacy figure). `reconcile` (no `--rid`) reads `GET /admin/meshy` (`AURA3D_PRISM_KEY` or `AURA3D_PRISM_KEY_FILE`; the key is only sent as a header and scrubbed from errors) or a saved `--pool-json`, and prints ledger vs Prism, keys added since the baseline and keys topped up. `--apply` books the delta once as an `unattributed` adjustment.
- `config --global-cap N` persists the owner-authorised total in the ledger (flag, then env, then stored, then default 1000/420). The shared ledger now stores `global_cap: 10000`.
- The ledger default path is `~/.aura3d/meshy-ledger.jsonl` (override: `--ledger` or `$AURA3D_MESHY_LEDGER`), not `/tmp`. `/tmp/meshy/meshy.mjs` now writes to the same file so the two cannot diverge; use the CLI for new work.

## Commands to repeat this check

```sh
export AURA3D_PRISM_KEY_FILE=<path to the approved Prism key file>   # read-only GET /admin/meshy
aura3d meshy ledger status          # spent, left, byGame, overCap
aura3d meshy ledger reconcile       # ledger vs Prism since the baseline; add --apply to book the delta
node tools/game-checks/run.mjs --all --only meshy-cap
```
