# Archived decision context

Historical architectural audits, preserved rather than deleted.

§7 of `Aura3D-1.6-Replatform-PRD.md` is explicit: *"Do not simply erase prior architectural
reasoning."* These documents recorded why particular components were kept, repaired or stopped,
and a later reader deciding the same question deserves the earlier answer and its evidence — even
where the conclusion has since changed.

Nothing here is current. For current state read
`Aura3D-1.6-Replatform-PRD.md`, `Aura3D-1.6-Architecture-Decision.md`, and the ADRs under
`docs/architecture/adr/`.

| Document | What it recorded |
| --- | --- |
| `AURA3D_KILL_OR_REPAIR_AUDIT.md` | Per-component kill-or-repair audit predating the 1.6 re-platform. Superseded by `Aura3D-1.6-Architecture-Decision.md`, which reached a different conclusion on the renderer: keep and finish it. |
| `aura3d-game-examples-stop-decision.md` | The decision to stop work on the game example routes. Superseded by Phase 5, which tiered every route and fixed the engine defects behind the reported symptoms instead of stopping. |

## Deleted rather than archived

Seven prompt-scratch documents were deleted in the §7 cleanup after
`tools/deletion-safety` cleared all six R8 points for each: `resetprompt.md`,
`anotherprompt.md`, `gameenginefinishprompt.md`, `shipprompt.md`, `FixUpNewPRD.md`,
`finalfixesatlibrarylevel.md`, `GoLiveCheckList.md`.

They were working prompts rather than decision records — superseded instructions, not reasoning
about the codebase — and Git history retains them if a specific line is ever needed. The
distinction that governs this directory is whether a document *decided* something.
