# Benchmark Round 9 Decision

Date: 2026-05-30
Commit SHA: d6c23ea14043fd4fbb99a97b650186ff1c7e7df2
User signature: `gchahal1982`, active-goal authorization to execute all tasks in
`REMAINING.md` without additional permission. Round 9 remains failed and
invalid for shipping.

## Decision

Do not ship Aura3D as a proven Three.js competitor from Round 9.

Round 9 completed clean prompt generation, runtime capture, engine capture, and neutral scoring. It failed both required release gates:

- Prompt benchmark failed: Codex reached 6/10 Aura3D wins and Claude Code reached 2/10 Aura3D wins; required 7/10 for each.
- Engine benchmark failed: visual parity passed, but FPS thresholds failed.

## Next Required Work

Do not rerun the same benchmark unchanged. The next pass must target these concrete gaps first:

1. Improve Aura3D visual output for Claude-losing prompts 03, 04, 05, 06, and 09.
2. Improve hard-prompt outcomes for prompts 08 and 10 so they become Aura3D wins, not ties/losses.
3. Investigate engine FPS capture/scene performance; Round 9 cannot pass while material/city/physics scenes report below 30 FPS.
4. Add draw-call explanations or reduce draw-call gaps for engine result files.
5. Run a new amended proof round only after targeted fixes are committed and signed.
