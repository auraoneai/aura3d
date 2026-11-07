# lane/511 general first-screen sheet: unseen-task trial (tasks 31-36, n=3, docs-only Aura arm, claude-sonnet-5.5 through Prism, published engine 5.0.2)

## Pooled

| group | n | finished | hit 40-turn cap | first-try tsc | final build+render clean | turns median (range) | input tokens median | output tokens median | docs files opened | search calls | checklist median | agent wall median |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| baseline docs (b511-base) | 18 | 16/18 | 2 | 14/18 | 16/18 | 16 (8-40) | 656K | 3K | 6 | 8 | 1 (mean 0.94) | 78.85s |
| general sheet (b511-sheet) | 18 | 18/18 | 0 | 12/18 | 16/18 | 15.5 (5-37) | 472K | 3K | 3 | 9.5 | 1 (mean 1) | 65.95s |

## Per task

| group | n | finished | hit 40-turn cap | first-try tsc | final build+render clean | turns median (range) | input tokens median | output tokens median | docs files opened | search calls | checklist median | agent wall median |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| task 31 baseline | 3 | 3/3 | 0 | 3/3 | 3/3 | 16 (12-16) | 562K | 3K | 6 | 7 | 1 (mean 1) | 77.1s |
| task 31 sheet | 3 | 3/3 | 0 | 1/3 | 3/3 | 17 (12-17) | 570K | 3K | 4 | 9 | 1 (mean 1) | 68.1s |
| task 32 baseline | 3 | 3/3 | 0 | 3/3 | 3/3 | 29 (23-30) | 1524K | 3K | 4 | 21 | 1 (mean 1) | 100.3s |
| task 32 sheet | 3 | 3/3 | 0 | 3/3 | 3/3 | 16 (14-18) | 377K | 2K | 3 | 12 | 1 (mean 1) | 64.7s |
| task 33 baseline | 3 | 3/3 | 0 | 3/3 | 3/3 | 13 (8-13) | 372K | 2K | 6 | 7 | 1 (mean 1) | 51.1s |
| task 33 sheet | 3 | 3/3 | 0 | 3/3 | 3/3 | 6 (5-7) | 115K | 2K | 2 | 3 | 1 (mean 1) | 30.2s |
| task 34 baseline | 3 | 1/3 | 2 | 1/3 | 2/3 | 40 (37-40) | 2587K | 14K | 8 | 24 | 1 (mean 0.67) | 245.1s |
| task 34 sheet | 3 | 3/3 | 0 | 3/3 | 3/3 | 22 (15-37) | 1070K | 4K | 3 | 11 | 1 (mean 1) | 108.2s |
| task 35 baseline | 3 | 3/3 | 0 | 1/3 | 2/3 | 16 (13-16) | 662K | 5K | 6 | 5 | 1 (mean 1) | 78.7s |
| task 35 sheet | 3 | 3/3 | 0 | 0/3 | 1/3 | 19 (13-22) | 647K | 5K | 4 | 11 | 1 (mean 1) | 81.5s |
| task 36 baseline | 3 | 3/3 | 0 | 3/3 | 3/3 | 15 (11-18) | 610K | 2K | 4 | 8 | 1 (mean 1) | 54.3s |
| task 36 sheet | 3 | 3/3 | 0 | 2/3 | 3/3 | 15 (8-18) | 406K | 2K | 3 | 8 | 1 (mean 1) | 54.7s |

## Per run

| run | end | turns | tsc1 | render | checklist | tokens in | probe frame lit/std/diff |
|---|---|---|---|---|---|---|---|
| b511-base-t31-aura-r1 | finished | 12 | y | y | 1 | 436K | |
| b511-base-t31-aura-r2 | finished | 16 | y | y | 1 | 649K | |
| b511-base-t31-aura-r3 | finished | 16 | y | y | 1 | 562K | |
| b511-sheet-t31-aura-r1 | finished | 12 | n | y | 1 | 259K | |
| b511-sheet-t31-aura-r2 | finished | 17 | y | y | 1 | 581K | |
| b511-sheet-t31-aura-r3 | finished | 17 | n | y | 1 | 570K | |
| b511-base-t32-aura-r1 | finished | 29 | y | y | 1 | 1630K | |
| b511-base-t32-aura-r2 | finished | 23 | y | y | 1 | 1030K | |
| b511-base-t32-aura-r3 | finished | 30 | y | y | 1 | 1524K | |
| b511-sheet-t32-aura-r1 | finished | 14 | y | y | 1 | 345K | |
| b511-sheet-t32-aura-r2 | finished | 18 | y | y | 1 | 580K | |
| b511-sheet-t32-aura-r3 | finished | 16 | y | y | 1 | 377K | |
| b511-base-t33-aura-r1 | finished | 8 | y | y | 1 | 239K | |
| b511-base-t33-aura-r2 | finished | 13 | y | y | 1 | 447K | |
| b511-base-t33-aura-r3 | finished | 13 | y | y | 1 | 372K | |
| b511-sheet-t33-aura-r1 | finished | 5 | y | y | 1 | 85K | |
| b511-sheet-t33-aura-r2 | finished | 7 | y | y | 1 | 144K | |
| b511-sheet-t33-aura-r3 | finished | 6 | y | y | 1 | 115K | |
| b511-base-t34-aura-r1 | finished | 37 | n | y | 1 | 2578K | |
| b511-base-t34-aura-r2 | max_turns | 40 | y | y | 1 | 2587K | |
| b511-base-t34-aura-r3 | max_turns | 40 | n | n | 0 | 2872K | |
| b511-sheet-t34-aura-r1 | finished | 37 | y | y | 1 | 2049K | |
| b511-sheet-t34-aura-r2 | finished | 22 | y | y | 1 | 1070K | |
| b511-sheet-t34-aura-r3 | finished | 15 | y | y | 1 | 485K | |
| b511-base-t35-aura-r1 | finished | 13 | y | n | 1 | 472K | |
| b511-base-t35-aura-r2 | finished | 16 | n | y | 1 | 662K | |
| b511-base-t35-aura-r3 | finished | 16 | n | y | 1 | 778K | |
| b511-sheet-t35-aura-r1 | finished | 13 | n | y | 1 | 460K | |
| b511-sheet-t35-aura-r2 | finished | 22 | n | n | 1 | 849K | |
| b511-sheet-t35-aura-r3 | finished | 19 | n | n | 1 | 647K | |
| b511-base-t36-aura-r1 | finished | 18 | y | y | 1 | 771K | |
| b511-base-t36-aura-r2 | finished | 15 | y | y | 1 | 610K | |
| b511-base-t36-aura-r3 | finished | 11 | y | y | 1 | 308K | |
| b511-sheet-t36-aura-r1 | finished | 18 | n | y | 1 | 489K | |
| b511-sheet-t36-aura-r2 | finished | 8 | y | y | 1 | 175K | |
| b511-sheet-t36-aura-r3 | finished | 15 | y | y | 1 | 406K | |
