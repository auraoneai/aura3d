# bench505-effects: fireworks harbor (effects-1) and magic portal (effects-2)

Harness: tools/agent-eval at origin/exp/turn-gap-504 plus tasks 10 and 11 (prompts verbatim, `tasks505.json`), claude-sonnet-5.5 via Prism, 40-turn cap, `AGENT_EVAL_AURA_VERSION=5.0.2`, n=3 per arm per task.
Arms: aura = docs503 entry docs bundle (docs sha 4181339...), no cheat sheet (batch `bench505-effects`); aura-sheet = condition A cheat sheet (batch `bench505-effects-sheet`); three = three.js 0.185.1 (batch `bench505-effects`).
Scoring: stock vite build (score-local), two REA frames 3 s apart (Chrome, real GPU, 640x360, serialized lock), checklist judge (score.mjs, Prism), 2-frame motion probe (`motion-probe.json`), blind visual judge with 3 calls per pair, random A/B order per call, majority vote (`visual-judge-505.json`).

## Tables
See `tables.md` (per-run rows and visual tallies). Summary medians (turns): effects-1 aura 40 (29-40), aura-sheet 15 (14-24), three 6 (3-9); effects-2 aura 25 (24-40), aura-sheet 11 (11-21), three 5 (4-8).

## Honest notes and harness faults
- First launch of the aura arms installed the shared /tmp/agent-eval-base/aura without @aura3d/engine (another lane rewrote it); all aura builds failed with "cannot resolve @aura3d/engine" and tsc failed. Those runs (superseded-shared-base-fault/) were discarded and all 12 aura/aura-sheet runs were rerun in full with a private base (/tmp/b505-effects-base, engine 5.0.2). Harness fault, not cherry-picking; original run.json kept.
- Prism 504s (infra_error) forced reruns of: t10 aura r1/r2/r3, t10 sheet r1 (rerun with lower concurrency). Three arm t11 r1/r3 were infra_error and were rerun once. No run was rerun for its outcome.
- effects-1 aura: r1 ended max_output_tokens at turn 29 with no file written, r2 hit the 40-turn cap with failing tsc/build; neither has frames. three r2 stopped after 3 turns without writing code (model ended its turn). All counted as failures; pairs for them are missing from the visual judge.
- Probes: REA has no page-evaluate action, so window.__TASK_STATE__ bursts/particles/time could not be read. Only a static presence check (grep of src) was done: all runs with source define it except aura t10 r1/r2 and three t10 r2 (no source). Motion probe is a 2-frame variant (frames 3 s apart), not 6 frames; t10 failures are mostly the brightest-1%>200 and mean-luminance bands, the three.js portal frames pass the centre-over-border rule but fail the mean-luminance cap (mean 123-174 against a limit of 120).
- Frames are real-GPU on one Mac, not software WebGL2. Visual judge: single model, n small (pairs only where both frames exist). The checklist judge is source-plus-frame-stats and was not given page-probe values for __TASK_STATE__.
