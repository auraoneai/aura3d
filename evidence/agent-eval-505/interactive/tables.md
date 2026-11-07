# bench505 interactive: per-task, per-arm rows (n=3)

Probe = page-level injected probe (functional, excluding build/blank/animated/page-error items). Motion ok = REA frames 3 s apart differ (framestats diff > 0.1).

| task | arm | turns (runs) | finished | first-try tsc | final tsc | built | checklist (judge, mean of 8) | motion ok | probe checks (mean) | tokens in (median) | tokens out (median) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| interactive-1 garden | aura | 25/22/40 | 3/3 | 3/3 | 3/3 | 3/3 | 8/8/8/8/8/8 | 2/3 | 17/17 17/17 17/17 | 1718191 | 24594 |
| interactive-1 garden | aura-sheet | 16/11/15 | 3/3 | 2/3 | 3/3 | 3/3 | 8/8/8/8/8/8 | 3/3 | 17/17 17/17 17/17 | 377388 | 12082 |
| interactive-1 garden | three | 4/5/4 | 3/3 | 3/3 | 3/3 | 3/3 | 8/8/8/8/8/8 | 3/3 | 17/17 17/17 17/17 | 32620 | 4176 |
| interactive-2 solar | aura | 37/40/32 | 1/3 | 1/3 | 1/3 | 1/3 | 8/8/0/8/0/8 | 1/3 | 17/17 0/1 0/1 | 2961483 | 16259 |
| interactive-2 solar | aura-sheet | 24/16/32 | 3/3 | 3/3 | 3/3 | 3/3 | 7/8/8/8/8/8 | 3/3 | 16/17 17/17 17/17 | 1556033 | 14710 |
| interactive-2 solar | three | 4/4/4 | 2/3 | 3/3 | 3/3 | 3/3 | 8/8/8/8/8/8 | 3/3 | 17/17 17/17 17/17 | 48799 | 9058 |

## Blind visual judge (3 independent calls per pair, majority; forfeit = Aura3D run produced no frames)

| task | comparison | pair wins subject (Aura3D) | pair wins three.js | ties | forfeits | call-level wins subject/three/tie |
|---|---|---|---|---|---|---|
| 10 | aura-vs-three | 1 | 2 | 0 | 0 | 2/7/0 |
| 10 | aura-sheet-vs-three | 0 | 3 | 0 | 0 | 1/8/0 |
| 11 | aura-vs-three | 0 | 3 | 0 | 2 | 0/3/0 |
| 11 | aura-sheet-vs-three | 1 | 2 | 0 | 0 | 2/7/0 |

## Per-run detail

| run | turns | end | tsc1 | tscF | built | motion | failed probe items |
|---|---|---|---|---|---|---|---|
| t10-aura-r1 | 25 | finished | true | true | true | true | - |
| t10-aura-r2 | 22 | finished | true | true | true | true | - |
| t10-aura-r3 | 40 | finished | true | true | true | false | - |
| t11-aura-r1 | 37 | finished | true | true | true | true | - |
| t11-aura-r2 | 40 | max_turns | false | false | false | false | probeMissing |
| t11-aura-r3 | 32 | max_output_tokens | false | false | false | false | probeMissing |
| t10-three-r1 | 4 | finished | true | true | true | true | - |
| t10-three-r2 | 5 | finished | true | true | true | true | - |
| t10-three-r3 | 4 | finished | true | true | true | true | - |
| t11-three-r1 | 4 | finished | true | true | true | true | - |
| t11-three-r2 | 4 | finished | true | true | true | true | - |
| t11-three-r3 | 4 | stopped_without_finish | true | true | true | true | - |
| sheet-t10-aura-r1 | 16 | finished | false | true | true | true | - |
| sheet-t10-aura-r2 | 11 | finished | true | true | true | true | - |
| sheet-t10-aura-r3 | 15 | finished | true | true | true | true | - |
| sheet-t11-aura-r1 | 24 | finished | true | true | true | true | panelHiddenAfter |
| sheet-t11-aura-r2 | 16 | finished | true | true | true | true | - |
| sheet-t11-aura-r3 | 32 | finished | true | true | true | true | - |
