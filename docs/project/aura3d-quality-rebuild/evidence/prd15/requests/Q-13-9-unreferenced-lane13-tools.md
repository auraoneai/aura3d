# Q-13-9 — 2 unreferenced lane-13-owned tools/ directories

**GitHub issue:** #692

**From:** Lane 15 (PRD-15, Phase 7 T7.5)
**To:** Lane 13 (owner per `.github/QR_OWNERSHIP.json`)
**Status:** filed

Same mechanism as Q-12-3: lane-15's script/tool prune removed every unreferenced
15-owned dir; the following 13-owned dirs have zero in-repo references
(script, workflow, test, or source). Please delete them (or flag the live
reference) so `ls tools | wc -l` converges toward the §6.11 ≤60 target:

- `tools/agent-devtools`
- `tools/agent-deployment`
