# Removed in Aura3D 1.6 — retrieval record

Every file 1.6 deleted, with the commit that removed it and the exact command to get it back.

## Nothing you can install was removed

**No public package, and no reachable public symbol, was removed in 1.6.** §9 of the PRD
anticipated this document covering removed *packages* — `packages/ecs` and `packages/scripting`
were candidates — and R8 refused both deletions. ADR 0001 records why: both are published subpaths
with live consumers, and one is proven through a real WebGL2 production path.

The one package-directory removal is `packages/test-utils`: a private, unexported workspace with
zero source consumers. Its apparent blockers were obsolete tool aliases and deletion-test
calibration references. After those were removed, R8 cleared its manifest and source file at all
six evidence points. `MIGRATION-1.6.md` has the measured public-surface matrix.

So what follows is documentation and tooling, not product surface.

## Retrieval

Git is the archive. For any row below:

```bash
# read it without touching your tree
git show <commit>^:<path>

# restore it
git checkout <commit>^ -- <path>
```

`<commit>^` is the parent of the deleting commit, i.e. the last revision where the file existed.

## Deleted files

### Private zero-consumer workspace — 1.6 release preparation

| Path | Retrieval | Why removed |
| --- | --- | --- |
| `packages/test-utils/package.json` | `git show c1c5c8a8:packages/test-utils/package.json` | Private, unexported package manifest with no product consumer |
| `packages/test-utils/src/index.ts` | `git show c1c5c8a8:packages/test-utils/src/index.ts` | 62 lines of unused mock-clock and pixel-buffer helpers |

### Prompt scratch — `c9d6044a` (§7)

Working prompts and checklists, superseded by `Aura3D-1.6-Replatform-PRD.md`. Deleted after
`tools/deletion-safety` cleared all six R8 points for each.

| Path | Size | Why removed |
| --- | --- | --- |
| `resetprompt.md` | 60,894 B | Superseded instructions |
| `anotherprompt.md` | 37,746 B | Superseded instructions |
| `gameenginefinishprompt.md` | 17,546 B | Superseded instructions (was untracked) |
| `shipprompt.md` | 17,007 B | Superseded instructions |
| `FixUpNewPRD.md` | 73,267 B | Superseded by the 1.6 PRD |
| `finalfixesatlibrarylevel.md` | 18,203 B | Superseded instructions |
| `GoLiveCheckList.md` | 7,838 B | Superseded by §10/§11 of the 1.6 PRD |
| `QuickFixes.md` | 46,098 B | 1.3.3-era fix list. Required clearing an exclusion entry in `tools/product-cutover/index.ts` first |
| `tools/release/finish-133.sh` | — | 1.3.3 post-publish script, referenced only by itself and the PRD |

### Superseded tooling

| Path | Commit | Why removed |
| --- | --- | --- |
| `tools/physics-test-classification/index.ts` | `3058dfec` | Its input was the `backend: "aura-js"` test pins, and WS-4.3 removed them. The tool cannot run, so it was retired; the **measured report it produced is retained** at `tests/reports/physics-test-classification/report.json` as the evidence. |

### Earlier §7 batch — `05305a34`

Screenshot scratch scripts (`_gallery.mjs`, `_shot.mjs`, `_shot7.mjs`, `_shot8.mjs`,
`_shot9.mjs`) and `logs.txt`, a stale session transcript.

## Moved, not deleted

Prior architectural reasoning is preserved. §7 is explicit that it must not simply be erased.

| Path now | Was | What it decided |
| --- | --- | --- |
| `docs/archive/AURA3D_KILL_OR_REPAIR_AUDIT.md` | repo root | Per-component kill-or-repair audit. **Overturned** on the renderer by `Aura3D-1.6-Architecture-Decision.md`: keep and finish it. |
| `docs/archive/aura3d-game-examples-stop-decision.md` | repo root | Decision to stop work on the game example routes. **Overturned** by Phase 5, which fixed the engine defects behind the symptoms instead of stopping. |

`docs/archive/README.md` states the rule that governs that directory: a document is archived if it
*decided* something, and deleted if it was a working prompt.

## Retained after R8 refused deletion

Recorded here because "we tried to delete this and could not" is the useful fact, and because a
future attempt should start from the measurement rather than repeat it.

| Candidate | Blocking references | Decision |
| --- | --- | --- |
| `packages/ecs`, `packages/scripting` | 61 of 68 files blocked across 300 references; both are published subpaths; `scripting` is proven through a real WebGL2 path | Retained — ADR 0001 |
| 38 `*Fixtures.ts` files | R8 refused all 38 | 8 renamed to their real responsibility, 30 retained, **0 lines removed** |
| `examples/data-galaxy` | 370 `runtime-consumer` references inside retained launch evidence | Retained and labelled — see `docs/project/showcase/apps-classification.md` |
| `examples/material-showroom` | 11 release gates read its `main.ts` for static composition analysis | Retained, and **broken**: it imports the deleted `examples/_quarantine/`. Named in `README.md` |
