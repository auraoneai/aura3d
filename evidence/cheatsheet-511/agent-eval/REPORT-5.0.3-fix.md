# lane/511 general first-screen sheet: unseen-task trial (tasks 31-36, n=3, docs-only Aura arm, claude-sonnet-5.5 through Prism, published engine 5.0.2)

## Pooled

| group | n | finished | hit 40-turn cap | first-try tsc | final build+render clean | turns median (range) | input tokens median | output tokens median | docs files opened | search calls | checklist median | agent wall median |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| baseline docs (b511-base) | 18 | 16/18 | 2 | 14/18 | 16/18 | 16 (8-40) | 656K | 3K | 6 | 8 | 1 (mean 0.94) | 78.85s |
| general sheet (b511-sheet2-final) | 18 | 18/18 | 0 | 17/18 | 17/18 | 10.5 (7-36) | 255K | 2K | 4 | 7.5 | 1 (mean 1) | 46.35s |

## Per task

| group | n | finished | hit 40-turn cap | first-try tsc | final build+render clean | turns median (range) | input tokens median | output tokens median | docs files opened | search calls | checklist median | agent wall median |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| task 31 baseline | 3 | 3/3 | 0 | 3/3 | 3/3 | 16 (12-16) | 562K | 3K | 6 | 7 | 1 (mean 1) | 77.1s |
| task 31 sheet | 3 | 3/3 | 0 | 3/3 | 3/3 | 10 (9-20) | 246K | 3K | 4 | 7 | 1 (mean 1) | 59.1s |
| task 32 baseline | 3 | 3/3 | 0 | 3/3 | 3/3 | 29 (23-30) | 1524K | 3K | 4 | 21 | 1 (mean 1) | 100.3s |
| task 32 sheet | 3 | 3/3 | 0 | 3/3 | 3/3 | 12 (9-12) | 258K | 2K | 3 | 8 | 1 (mean 1) | 37.4s |
| task 33 baseline | 3 | 3/3 | 0 | 3/3 | 3/3 | 13 (8-13) | 372K | 2K | 6 | 7 | 1 (mean 1) | 51.1s |
| task 33 sheet | 3 | 3/3 | 0 | 3/3 | 3/3 | 7 (7-10) | 135K | 2K | 3 | 4 | 1 (mean 1) | 34.5s |
| task 34 baseline | 3 | 1/3 | 2 | 1/3 | 2/3 | 40 (37-40) | 2587K | 14K | 8 | 24 | 1 (mean 0.67) | 245.1s |
| task 34 sheet | 3 | 3/3 | 0 | 3/3 | 3/3 | 28 (23-36) | 1552K | 5K | 4 | 17 | 1 (mean 1) | 140.9s |
| task 35 baseline | 3 | 3/3 | 0 | 1/3 | 2/3 | 16 (13-16) | 662K | 5K | 6 | 5 | 1 (mean 1) | 78.7s |
| task 35 sheet | 3 | 3/3 | 0 | 2/3 | 2/3 | 18 (10-21) | 685K | 5K | 4 | 11 | 1 (mean 1) | 90.3s |
| task 36 baseline | 3 | 3/3 | 0 | 3/3 | 3/3 | 15 (11-18) | 610K | 2K | 4 | 8 | 1 (mean 1) | 54.3s |
| task 36 sheet | 3 | 3/3 | 0 | 3/3 | 3/3 | 9 (9-11) | 182K | 2K | 5 | 5 | 1 (mean 1) | 37s |

## Per run

| run | end | turns | tsc1 | render | checklist | tokens in | probe frame lit/std/diff |
|---|---|---|---|---|---|---|---|
| b511-base-t31-aura-r1 | finished | 12 | y | y | 1 | 436K | |
| b511-base-t31-aura-r2 | finished | 16 | y | y | 1 | 649K | |
| b511-base-t31-aura-r3 | finished | 16 | y | y | 1 | 562K | |
| b511-sheet2-t31-aura-r1 | finished | 20 | y | y | 1 | 552K | |
| b511-sheet2-t31-aura-r2 | finished | 10 | y | y | 1 | 246K | |
| b511-sheet2-t31-aura-r3 | finished | 9 | y | y | 1 | 219K | |
| b511-base-t32-aura-r1 | finished | 29 | y | y | 1 | 1630K | |
| b511-base-t32-aura-r2 | finished | 23 | y | y | 1 | 1030K | |
| b511-base-t32-aura-r3 | finished | 30 | y | y | 1 | 1524K | |
| b511-sheet2-t32-aura-r1 | finished | 12 | y | y | 1 | 282K | |
| b511-sheet2-t32-aura-r2 | finished | 9 | y | y | 1 | 231K | |
| b511-sheet2-t32-aura-r3 | finished | 12 | y | y | 1 | 258K | |
| b511-base-t33-aura-r1 | finished | 8 | y | y | 1 | 239K | |
| b511-base-t33-aura-r2 | finished | 13 | y | y | 1 | 447K | |
| b511-base-t33-aura-r3 | finished | 13 | y | y | 1 | 372K | |
| b511-sheet2-t33-aura-r1 | finished | 7 | y | y | 1 | 135K | |
| b511-sheet2-t33-aura-r2 | finished | 10 | y | y | 1 | 248K | |
| b511-sheet2-t33-aura-r3 | finished | 7 | y | y | 1 | 126K | |
| b511-base-t34-aura-r1 | finished | 37 | n | y | 1 | 2578K | |
| b511-base-t34-aura-r2 | max_turns | 40 | y | y | 1 | 2587K | |
| b511-base-t34-aura-r3 | max_turns | 40 | n | n | 0 | 2872K | |
| b511-sheet2r34-t34-aura-r1 | finished | 36 | y | y | 1 | 2085K | |
| b511-sheet2r34-t34-aura-r2 | finished | 28 | y | y | 1 | 1552K | |
| b511-sheet2r34-t34-aura-r3 | finished | 23 | y | y | 1 | 850K | |
| b511-base-t35-aura-r1 | finished | 13 | y | n | 1 | 472K | |
| b511-base-t35-aura-r2 | finished | 16 | n | y | 1 | 662K | |
| b511-base-t35-aura-r3 | finished | 16 | n | y | 1 | 778K | |
| b511-sheet2-t35-aura-r1 | finished | 18 | n | y | 1 | 685K | |
| b511-sheet2-t35-aura-r2 | finished | 21 | y | n | 1 | 842K | |
| b511-sheet2-t35-aura-r3 | finished | 10 | y | y | 1 | 251K | |
| b511-base-t36-aura-r1 | finished | 18 | y | y | 1 | 771K | |
| b511-base-t36-aura-r2 | finished | 15 | y | y | 1 | 610K | |
| b511-base-t36-aura-r3 | finished | 11 | y | y | 1 | 308K | |
| b511-sheet2-t36-aura-r1 | finished | 9 | y | y | 1 | 176K | |
| b511-sheet2-t36-aura-r2 | finished | 9 | y | y | 1 | 182K | |
| b511-sheet2-t36-aura-r3 | finished | 11 | y | y | 1 | 279K | |
