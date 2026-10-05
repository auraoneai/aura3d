# Parallel-readiness check (final): 15 PRDs + master plan

Date 2026-10-05, branch `aura3d-quality-rebuild/audit` (base `b9194706` plus working-tree edits listed below).
Method: read-only `rg`/`awk`/Python scans over `PRD-*.md`, `AURA3D-QUALITY-MASTER-PLAN.md`, `CONTRACTS.md` (§2.0 index
`:156-199`, §4.1 `:2424-2444`, §4.2 `:2446-2521`), `00-AURA3D-AUTOPSY.md`, `_sections/B-game-scorecard.md`, `research/19`,
`research/23`. Nothing was built or run in a browser. All path:line references are post-edit.

Verdict: **all 15 lanes can start on 2026-10-05 against PR 0a stubs, with no lane holding another.** 6 checks:
1 pass, 5 fixed, plus 1 open item that belongs to lane 15 (it owns `CONTRACTS.md`).

## Summary

| # | Check | Result |
|---|---|---|
| a | No blocking cross-PRD dependency phrases | **fixed** (6 real edges rewritten; 33 remaining hits are attributions, stub fallbacks or integrated-only criteria) |
| b | Every PRD has "Parallel execution", "Standalone acceptance", "Integrated acceptance", "Contracts consumed" | **pass** (15/15); consumed tables **fixed** in 3 PRDs (5 missing rows added) |
| c | Owned paths match CONTRACTS §4, and each hot file has exactly one owner | **pass** (sampled 14 hot paths, 1 owner each, no PRD claims a non-owned hot file) |
| d | Master plan has no lane→lane blocking edges | **fixed** (Gantt was already date-anchored; lane 15 P0 bar moved from 10-07 to 10-05 to match `PRD-15:1465-1468`) |
| e | Numbers consistent across autopsy, master plan and PRD 14; all 18 games incl. Orbital Defense | **pass** (stale "master plan not present" note in the autopsy document map **fixed**) |
| f | No claim of three.js quality from engineering gates | **fixed** (explicit no-claim sentence added to 7 standalone sections that had none) |

## (a) Blocking cross-PRD dependencies — fixed

Scan: `rg -n -i 'depends on PRD|after PRD|blocked by PRD|requires PRD|once PRD|until PRD|wait(s|ing)? (for|on) PRD|before PRD'`
over `PRD-*.md` and the master plan: 39 hits before, 33 after. The master plan had 0 hits. A wider scan
(`gated on/by`, `needs PRD`, `cannot start`, `must land first`, `starts after`) found 2 more real edges.

Real ordering edges, now rewritten as contract, stub or integrated language:

| Where | Before | After |
|---|---|---|
| `PRD-04:1032` | tangent frame "after PRD 06's `vertex:deform`" | "ordered after the C-18 `vertex:deform` hook; identity under the C-18 stub" |
| `PRD-04:1098-1101` | pass order "requires PRD 01's ForwardPass split (C-01 real)" | integrated order, active when C-01 is real plus non-blocking Q-01-6; standalone proof against the C-01 stub in lane scenes |
| `PRD-04:414` | "needs PRD 01's ForwardPass split" | "needs C-01 real (ForwardPass split, provider 01)"; the existing standalone/integrated split is kept |
| `PRD-04:1740` | program-completion item "after PRD 14's rebuild pass" | judged at a G-PANEL round on whatever v2 routes lane 14 has on main; never gates lane 04 |
| `PRD-02:2354-2355` | integrated item 9 "after PRD 13 applies Q-13-1" | integrated; evaluated on lane 13's template state on main; Q-13-1 is a non-blocking request |
| `PRD-14:1273` | atmosphere shell "needs PRD 01 blend modes" | C-04 `additive`; under the C-04 stub it resolves to `alpha` (`CONTRACTS.md:529-534`), so the additive look is integrated |

The remaining 33 hits are not blocking and were left alone:
- Already rewritten disclaimers: `PRD-02:8`, `PRD-04:1187`, `PRD-10:8, 1545`, `PRD-15:27`, `PRD-07:1519`.
- Day-0 fallbacks ("until PRD X", the lane runs a stub or its own path meanwhile): `PRD-02:1489`, `PRD-04:375, 586, 848`,
  `PRD-07:404, 1178`, `PRD-08:919, 1818`, `PRD-14:351, 386`, `PRD-13:377`, `PRD-14:517, 1081`.
- Integrated-only or claim gates: `PRD-04:364, 390, 521, 536, 1255, 1608`, `PRD-07:728, 2070`, `PRD-08:951`, `PRD-09:2065`,
  `PRD-13:1343, 1387`, `PRD-14:313, 1927`.
- In-lane sequencing: `PRD-02:2133, 2359`.

## (b) Required sections — pass; consumed tables fixed

All 15 PRDs contain all four phrases. Section anchors (post-edit, ±3 lines):

| PRD | Contracts consumed | Parallel execution | Standalone acceptance | Integrated acceptance |
|---|---|---|---|---|
| 01 | §13.2 `:880` | §13A `:952` | §17.1 `:1190` | §17.2 `:1213` |
| 02 | §12.2 `:1612` | `:1680` | §16.1 `:2048` | §16.2-16.4 `:2075-2169` |
| 03 | §12.2 `:1387` | `:1469` | `:2214` | `:2249` |
| 04 | §12.2 `:1207` | `:1289` | §16.1 `:1534` | §16.2-16.3 `:1559-1586` |
| 05 | §12.2 `:1066` | `:1141` | §16.0 `:1496` | §16.4 `:1586` |
| 06 | §12.2 `:866` | `:930` | §17.0 `:1384` | §17.1, §17.4 `:1404, 1445` |
| 07 | §12.1 `:1515` | §13 `:1563` | §17.1 `:2031` | §17.2 `:2057` |
| 08 | §12.2 `:1049` | `:1120` | §16 `:1718` | §16A `:1762` |
| 09 | §12.2 `:1427` | `:1508` | §16.1 `:1875` | §16.2 `:1902` |
| 10 | §12.2 `:1581` | `:1651` | §16.1 `:1995` | §16.2 `:2023` |
| 11 | §12.2 `:855` | `:929` | §16.0 `:1187` | §16.1 `:1206` |
| 12 | §12.2 `:1296` | `:1345` | §16.1 `:1713` | §16.2 `:1746` |
| 13 | §13.2 `:886` | §14 `:926` | §18.1 `:1283` | §18.2 `:1302` |
| 14 | §12.2 `:1409` | §12A `:1475` | §16.1 `:1848` | §16.2 `:1868` |
| 15 | §12.3 `:1389` | `:1461` | §16 `:1795` | §16A `:1871` |

Cross-check of consumed tables against the CONTRACTS §2.0 "Consumers" column: an index consumer with no table row was a gap.
Fixed by adding rows that state the contract, the stub behaviour relied on (with a CONTRACTS citation) and the effect on
acceptance:
- `PRD-06` §12.2: **C-03** (read-only lobes; legacy `SkinnedLitMaterial` path standalone).
- `PRD-11` §12.2: **C-14** (history reset on device restore) and **C-18** (batch exclusion of deformed items; WGSL deform twin integrated).
- `PRD-13` §13.2: **C-03** (facts-driven lobe text) and **C-25** (template audio on the stub).
Not a gap: `PRD-06` vs C-33 (the lane provides `steps/burst.mjs` as a C-33 plugin, cited in §12.1). `PRD-12` vs C-38
(the index says "all engine lanes"; 12 is tooling).

## (c) Owned paths vs CONTRACTS §4 — pass

Every PRD's "Owned files and directories" subsection says it must match §4.1. For each hot path, the owner's PRD lists it
as owned, and every other PRD mentions it only in a "not owned / moved to requests / extension point" list.

| Hot path | §4 owner (`CONTRACTS.md`) | Owner PRD lists it | Non-owners |
|---|---|---|---|
| `packages/engine/src/agent-api/index.ts` | 15 (`:2442`, `:2452`) | `PRD-15:1478-1508` | carve-outs only (02, 03, 10, 13 cite §3.2 / owner 15) |
| `packages/rendering/src/Renderer.ts` | 01 (`:2428`, `:2461`) | `PRD-01:961-966` | 02, 03, 06, 07, 11, 15 list it as not owned / C-01 / C-29 |
| `packages/rendering/src/WebGL2Device.ts` | 01 (`:2458`) | `PRD-01:961-966` | 02-06, 09, 11, 15 not owned / carve-outs (`webgl2/TextureFormats.ts` → 05, `webgl2/TextureUpload.ts` → 06) |
| `packages/rendering/src/ForwardPass.ts` | 01 (`:2460`) | `PRD-01:961-966` | 02, 03, 04, 06, 10, 11 not owned (`forward/Deform.ts` → 06, `forward/Transmission.ts` → 04) |
| `packages/rendering/src/WebGPUDevice.ts` | 11 (`:2438`, `:2470`) | `PRD-11:938-944` | 01-06, 08-10 requests Q-11-* |
| `packages/rendering/src/ShaderLibrary.ts`, `ShaderLibraryCore.ts` | 01, frozen legacy (`:2463`, §3.7) | `PRD-01:961-966` | 02-06, 08, 15 via C-02/C-03/C-11/C-18 |
| `benchmarks/quality-rebuild/shared/scenes.ts` | 12 (`:2481`) | `PRD-12:1366-1397` (`benchmarks/quality-rebuild/` default) | lanes use `scenes/prdNN/` (C-30) |
| `tools/quality-rebuild-capture/` | 12, except `games.json` → 14, `route-composition.mjs` → 09, `steps/burst.mjs` → 06 (`:2439`) | `PRD-12:1370` (exceptions stated) | `PRD-14:1493` games.json; `PRD-09:1537` route-composition; `PRD-06:943` burst; `PRD-14:1498` lists capture-games/steps/schema as not owned |
| `tools/quality-rebuild-capture/capture-games.mjs` | 12 (`:2486`) | via the directory row | 01, 02, 06, 11, 14 use plugins (C-33) |
| `.github/workflows/quality-rebuild-capture.yml` | 12 (`.github/workflows/` default, `:2439`, `:2488`) | `PRD-12:1373` | 04, 09, 11, 14, 15 list it as not owned; lanes add `qr-prdNN-*.yml` |

`PRD-12:293` adds a lane-12 overlay, `tools/quality-rebuild-capture/games.prd12.json`. Lane 12 owns it under the directory
default, and the merge rule says `games.json` (14) wins per field, so this is not a second writer.

## (d) Master plan lane→lane edges — fixed

- `AURA3D-QUALITY-MASTER-PLAN.md:145` states the Gantt is date-anchored. The mermaid block (`:150-235`) uses no `after`
  syntax. The only `crit` items are PR 0a/0b-1/0b-2/0b-3, which are the bootstrap, not a lane.
- Fixed: `l15a` started on 2026-10-07 even though lane 15 executes PR 0a on day 0 and "Phase 1 (day 0, standalone)"
  (`PRD-15:841, 1465-1468`). It now starts on 2026-10-05, matching ":145 All lanes start on 2026-10-05".
- P1 bars starting 10-07 (≤ day 2) follow the 0b-merge wiring rule (`:61`). That rule is the PR 0 seam, not another lane.
  `l12b` starting 10-15 is a date anchor. Waves 1-4 are lane 14's internal review targets (`PRD-14` §6.5 "review targets,
  not start gates"). PRD 11 Phases 6-8 depend on the G-WGPU checkpoint decision, not on a lane.
- The §9 risk list ("C-02/C-03 slip …") describes integrated-outcome risks, not ordering edges.

## (e) Numeric consistency — pass

| Figure | Autopsy | Master plan | PRD 14 | Source check |
|---|---|---|---|---|
| Benchmark vision mean Aura / three | 3.6 / 5.4 (`:10`, `:314-316`) | 3.6 (≈3.5; 65/18) / 5.4 (98/18) (`:294`) | n/a (games only) | research 23 recomputed: 14 table rows + 4 bullet scores (04, 05, 07, 15) = 65.0/18 = 3.61 and 98.0/18 = 5.44 |
| Games overall range / median / mean | 1.5-4, median 3, mean 3.0 (`:10`) | same, 53.5/18 (`:298`) | 1.5 (Orbital) to 4, fleet mean 3.0 (`:56`) | per-game overall sum 53.5 from `B-game-scorecard` headers |
| Ambient-kills-IBL | 15 of 18 (`:14`, `:411`, `:1028`, `:1088`) | 15 of 18 (`:423`) | 15 of 18, not Aura Clash (`:38`, `:113`) | research 19 C1 correction; `PRD-02:40` agrees |
| Per-game overall / mean / fps (18 rows) | autopsy has 18 game headers | Orbital 59.6, Vault 57.4, Deep Recovery 0.5-1, typical 5-15 (`:300`) | §6.9.1-6.9.18 `Now:` lines (`:403-893`) | all 18 PRD 14 rows equal `B-game-scorecard` (e.g. Orbital 1.5/1.8/59.6, Deep Recovery 2.5/2.6/0.5, Rooftop 4/3.8/7.6) |

Orbital Defense is present in the PRD 14 rebuild (§6.9.4, `:515`, wave 1 pilot), in the scorecard (`B-game-scorecard:528`)
and in the autopsy (`:133`, `:368`). Fixed: the autopsy document map (`00-AURA3D-AUTOPSY.md:2154`) said the master plan
was "not present at this HEAD". It now describes the file.

## (f) No three.js-quality claim from engineering gates — fixed

- Already explicit: `PRD-03:2247`, `PRD-04:1536`, `PRD-08:1723`, `PRD-09:1879`, `PRD-10:1998, 2021`, `PRD-13:1287, 1299, 1428`,
  `PRD-14:1851`, `PRD-15:1868`, `PRD-02:2031`. Master plan `:353-354` keeps "behind three.js r185, by measured margins" until
  a G-PANEL round id is cited. §9 is a conditional forecast, not a claim.
- Added a no-claim sentence to the standalone sections that lacked one: `PRD-01:1192-1194`, `PRD-02:2050-2052`, `PRD-05:1498-1499`,
  `PRD-06:1385-1386`, `PRD-07:2033-2034`, `PRD-11:1189-1191` (also no G3 frame-rate claim), `PRD-12:1716-1717`.
- Remaining "matches three" hits are narrow metric rows, e.g. `PRD-03:1656` ACES ΔE2000 and `PRD-06` S5 pose parity
  1e-4. They are scoped numeric checks, not quality claims.

## Per-PRD readiness table

Owned paths = backtick path entries in the lane's CONTRACTS §4.1 row (`:2428-2442`), excluding the generic "lane NN"
row. Provided = contracts the §2.0 index assigns to the lane. C-40 facts are provided by every lane and are not counted.
Consumed = distinct contract rows in the PRD's consumed table, post-edit.

| PRD | Start day | Owned paths (§4.1) | Provided | Consumed | Remaining open items |
|---|---|---|---|---|---|
| 01 Core | 2026-10-05 (PR 0a branch) | 37 | 7 (C-01, 02, 04-08) | 20 | none |
| 02 Lighting | 2026-10-05 | 28 | 4 (C-09-12) | 20 | none |
| 03 Post | 2026-10-05 | 15 | 2 (C-13, 14) | 19 | none |
| 04 Materials | 2026-10-05 | 25 | 2 (C-03, 15) | 20 | none |
| 05 Assets | 2026-10-05 | 41 | 2 (C-16, 17) | 18 | none |
| 06 Animation | 2026-10-05 | 23 | 2 (C-18, 19) | 22 | none |
| 07 VFX | 2026-10-05 | 20 | 2 (C-20, 21) | 27 | none |
| 08 Camera | 2026-10-05 | 13 | 2 (C-22, 23) | 23 | none |
| 09 Game runtime | 2026-10-05 | 18 | 2 (C-24, 25) | 23 | none |
| 10 World | 2026-10-05 | 19 | 1 (C-26) | 25 | none |
| 11 GPU/tiers | 2026-10-05 (Phases 6-8 conditional on G-WGPU) | 28 | 3 (C-27-29) | 20 | none |
| 12 Bench | 2026-10-05 | 32 | 4 (C-30-33) | 10 | none |
| 13 Authoring | 2026-10-05 | 25 | 1 (C-34) | 26 | none |
| 14 Games | 2026-10-05 | 12 | 1 (C-35) | 21 | O-1 (C-04 consumer listing) |
| 15 Architecture | 2026-10-05 (executes PR 0a day 0, 0b days 1-2) | 67 | 4 (C-36-39) | 13 | O-1 (owner of `CONTRACTS.md`) |

## Open items (non-blocking)

- **O-1 — RESOLVED 2026-10-05 (coordinator, planning stage).** The §2.0 "Consumers" column was regenerated from every PRD's
  consumed tables (union of the previous list and the PRD tables, provider excluded); 35 of 40 rows changed. The IC-0 baseline
  row in §7 was also corrected to the research 23 vision means (Aura 3.6 vs three 5.4). The single-writer rule governs
  implementation; these were planning-document corrections made before PR 0.
- `_sections/0-executive.md` is a pre-assembly copy of the autopsy opening. Its figures match (3.6/5.4, 3.0, 15/18), and
  it was not edited.

## Files changed by this check

`PRD-01`, `PRD-02`, `PRD-04`, `PRD-05`, `PRD-06`, `PRD-07`, `PRD-11`, `PRD-12`, `PRD-13`, `PRD-14` (targeted edits above);
`AURA3D-QUALITY-MASTER-PLAN.md` (Gantt `l15a`); `00-AURA3D-AUTOPSY.md` (document map); this file.
