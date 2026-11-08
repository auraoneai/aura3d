| task | arm | n valid/planned | turns median (range) | finished (not at cap, valid) | first-try tsc | final tsc | checklist median (runs) | motion ok (frame diff) | no page errors (non-404) | visual wins vs three (3-judge majority) | input tokens median | output tokens median | src lines median |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 10 | aura (docs) | 3/3 | 26 (22-27) | 3/3 | 2/3 | 3/3 | 1 (1/1/1) | 3/3 | see notes | 0 aura / 3 three / 0 tie of 3 | 1488427 | 8640 | 193 |
| 10 | aura-sheet | 3/3 | 10 (8-15) | 3/3 | 3/3 | 3/3 | 1 (1/1/1) | 3/3 | see notes | 1 aura / 2 three / 0 tie of 3 | 187398 | 7945 | 138 |
| 10 | three | 3/3 | 5 (5-7) | 3/3 | 3/3 | 3/3 | 1 (1/1/1) | 3/3 | see notes | n/a | 60814 | 7466 | 373 |
| 11 | aura (docs) | 3/3 | 16 (15-18) | 3/3 | 2/3 | 3/3 | 1 (1/1/1) | 3/3 | see notes | 0 aura / 3 three / 0 tie of 3 | 686568 | 9302 | 222 |
| 11 | aura-sheet | 3/3 | 13 (8-14) | 3/3 | 2/3 | 3/3 | 1 (1/1/1) | 3/3 | see notes | 2 aura / 1 three / 0 tie of 3 | 298799 | 8465 | 233 |
| 11 | three | 3/3 | 8 (6-8) | 3/3 | 3/3 | 3/3 | 1 (1/1/1) | 3/3 | see notes | n/a | 149138 | 13295 | 616 |
| 12 | aura (docs) | 3/3 | 33 (28-35) | 3/3 | 2/3 | 3/3 | 1 (1/1/1) | 3/3 | see notes | 1 aura / 0 three / 0 tie of 1 | 2243961 | 17336 | 547 |
| 12 | aura-sheet | 3/3 | 6 (4-31) | 3/3 | 3/3 | 3/3 | 1 (1/1/1) | 3/3 | see notes | 1 aura / 0 three / 0 tie of 1 | 127855 | 7893 | 265 |
| 12 | three | 1/3 | 7 (7-7) | 1/1 | 1/1 | 1/1 | 1 (1) | 1/1 | see notes | n/a | 140019 | 13312 | 658 |

Notes (bench505-models, claude-sonnet-5.5 via Prism, Aura3D 5.0.2, three@0.185.1, 40-turn cap, n=3 planned per cell):
- Tasks are tasks/10-12 in tools/agent-eval (prompt text verbatim from the brief; contract section appended as in all tasks). Visual rubric and probe text are in tasks/models-visual.json.
- Harness faults: first launch used a base dir without the engine installed (all aura runs failed typecheck on module resolution); discarded and fully rerun (kept under superseded-base-missing-engine-install/). Task 12 three-arm runs r2 and r3 failed 4 times each with Prism HTTP 504 (gateway) and are reported as missing, not retried further; task 12 three therefore has n=1 and only one visual pair (idx 1) exists for task 12. Also 4 task-12 three attempts were rerun after infra_error only.
- Scoring is local (stock vite build, REA capture_browser_scenario on real-GPU Chrome 156), frames cropped to the 640x360 canvas; two frames 2 s apart (t=1 s and t=3 s). "motion ok" = more than 0.5% of pixels changed by more than 8/255.
- Not measured: window.__TASK_STATE__ values and the task-12 reload-determinism probe (REA capture cannot evaluate page JS). The checklist judge decided those items from source only, so checklist 1.0 everywhere is source-based and optimistic on those items.
- Page errors: console events contained only 404s (favicon), except t11 aura (docs) r1 which logged three 404s on one load (possible external fetch, not investigated). No uncaught page errors were recorded.
- Visual judge: three independent Prism judge calls per pair, A/B order randomised per call, labels hidden, majority vote; all votes in vis/*.json. Task 12 sheet r1 had one judge error (2 votes). Aura-sheet r1-3 pair counts above use 3-judge majorities.
- Evidence: runs/*/run.json + transcript, metrics.json (checklist judge), local-build.json, remote/results.json, frames/ (cropped) and frames-full/, framestats.json, vis/.
