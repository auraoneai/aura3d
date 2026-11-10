# Benchmark C1: interim results (appended while the batch runs)

Batch `c1-551`. One section per task replicate once all three arms (aura = Aura3D 5.5.1 native, three = three.js 0.185.1, bridge = three.js content via `aura3d import-three` + native behaviour) have finished and been scored. Turns and tokens cover the task plus the follow-up edit. Cost is list price (Prism reports Kiro credits only, and no cache fields, so every input token is priced uncached). Checks = scripted probe checks passed on the real-GPU build (main / follow-up). Frames: two main-phase frames 3 s apart. These are preliminary: blind visual judging, the checklist judge and the final rescore (fps and load measured with no agent runs going) come in `REPORT.md`. Spec: `SPEC.md` (frozen).

## Task 101 spider replicate 1 (character / animation)

| arm | end (task/follow-up) | turns (task) | input tokens | output tokens | wall s | list $ | Kiro credits | builds | main checks | follow-up checks | frames |
|---|---|---|---|---|---|---|---|---|---|---|---|
| aura | finished/finished | 20 (17) | 731K | 6K | 202 | 1.52 | 4.6 | yes | 1/1 | 4/4 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t101-aura-r1-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t101-aura-r1-main-2.png) |
| three | finished/finished | 6 (4) | 55K | 4K | 62 | 0.15 | 1.4 | yes | 1/1 | 4/4 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t101-three-r1-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t101-three-r1-main-2.png) |
| bridge | finished/max_turns | 33 (18) | 1.68M | 6K | 235 | 3.42 | 7.7 | yes | 1/1 | 0/4 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t101-bridge-r1-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t101-bridge-r1-main-2.png) |

Running medians over the 1 complete replicate(s) so far: aura n=1 turns 20 (task 17) in 731K out 6K $1.52 main-all 100% fu-all 100% | three n=1 turns 6 (task 4) in 55K out 4K $0.15 main-all 100% fu-all 100% | bridge n=1 turns 33 (task 18) in 1.68M out 6K $3.42 main-all 100% fu-all 0%

## Task 104 stacker replicate 3 (small game)

| arm | end (task/follow-up) | turns (task) | input tokens | output tokens | wall s | list $ | Kiro credits | builds | main checks | follow-up checks | frames |
|---|---|---|---|---|---|---|---|---|---|---|---|
| aura | finished/finished | 16 (12) | 568K | 6K | 164 | 1.20 | 4.1 | yes | 5/5 | 5/5 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t104-aura-r3-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t104-aura-r3-main-2.png) |
| three | finished/finished | 7 (4) | 64K | 4K | 59 | 0.17 | 1.3 | yes | 5/5 | 5/5 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t104-three-r3-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t104-three-r3-main-2.png) |
| bridge | finished/finished | 26 (24) | 1.20M | 8K | 251 | 2.49 | 6.7 | yes | 5/5 | 4/5 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t104-bridge-r3-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t104-bridge-r3-main-2.png) |

Running medians over the 2 complete replicate(s) so far: aura n=2 turns 18 (task 14.5) in 649K out 6K $1.36 main-all 100% fu-all 100% | three n=2 turns 6.5 (task 4) in 60K out 4K $0.16 main-all 100% fu-all 100% | bridge n=2 turns 29.5 (task 21) in 1.44M out 7K $2.96 main-all 100% fu-all 0%

## Task 102 portal replicate 2 (shader / effect)

| arm | end (task/follow-up) | turns (task) | input tokens | output tokens | wall s | list $ | Kiro credits | builds | main checks | follow-up checks | frames |
|---|---|---|---|---|---|---|---|---|---|---|---|
| aura | finished/finished | 44 (38) | 2.93M | 15K | 414 | 6.01 | 13.1 | yes | 4/4 | 4/4 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t102-aura-r2-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t102-aura-r2-main-2.png) |
| three | finished/finished | 12 (9) | 277K | 15K | 472 | 0.70 | 5.0 | yes | 4/4 | 4/4 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t102-three-r2-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t102-three-r2-main-2.png) |
| bridge | finished/finished | 37 (32) | 2.50M | 14K | 324 | 5.14 | 11.4 | yes | 4/4 | 4/4 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t102-bridge-r2-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t102-bridge-r2-main-2.png) |

Running medians over the 3 complete replicate(s) so far: aura n=3 turns 20 (task 17) in 731K out 6K $1.52 main-all 100% fu-all 100% | three n=3 turns 7 (task 4) in 64K out 4K $0.17 main-all 100% fu-all 100% | bridge n=3 turns 33 (task 24) in 1.68M out 8K $3.42 main-all 100% fu-all 33%

## Task 109 product replicate 1 (product viewer)

| arm | end (task/follow-up) | turns (task) | input tokens | output tokens | wall s | list $ | Kiro credits | builds | main checks | follow-up checks | frames |
|---|---|---|---|---|---|---|---|---|---|---|---|
| aura | finished/finished | 46 (39) | 3.17M | 19K | 746 | 6.53 | 17.1 | yes | 4/4 | 5/5 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t109-aura-r1-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t109-aura-r1-main-2.png) |
| three | finished/finished | 9 (7) | 157K | 8K | 277 | 0.40 | 3.4 | yes | 4/4 | 5/5 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t109-three-r1-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t109-three-r1-main-2.png) |
| bridge | max_turns/max_turns | 55 (40) | 4.00M | 15K | 410 | 8.14 | 16.0 | yes | 4/4 | 4/5 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t109-bridge-r1-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t109-bridge-r1-main-2.png) |

Running medians over the 4 complete replicate(s) so far: aura n=4 turns 32 (task 27.5) in 1.83M out 11K $3.77 main-all 100% fu-all 100% | three n=4 turns 8 (task 5.5) in 111K out 6K $0.28 main-all 100% fu-all 100% | bridge n=4 turns 35 (task 28) in 2.09M out 11K $4.28 main-all 100% fu-all 25%

## Task 101 spider replicate 3 (character / animation)

| arm | end (task/follow-up) | turns (task) | input tokens | output tokens | wall s | list $ | Kiro credits | builds | main checks | follow-up checks | frames |
|---|---|---|---|---|---|---|---|---|---|---|---|
| aura | finished/finished | 14 (11) | 370K | 4K | 256 | 0.79 | 2.9 | yes | 1/1 | 4/4 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t101-aura-r3-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t101-aura-r3-main-2.png) |
| three | finished/finished | 7 (5) | 73K | 5K | 81 | 0.20 | 1.7 | yes | 1/1 | 4/4 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t101-three-r3-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t101-three-r3-main-2.png) |
| bridge | finished/max_turns | 28 (13) | 1.30M | 7K | 232 | 2.67 | 6.7 | yes | 1/1 | 4/4 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t101-bridge-r3-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t101-bridge-r3-main-2.png) |

Running medians over the 5 complete replicate(s) so far: aura n=5 turns 20 (task 17) in 731K out 6K $1.52 main-all 100% fu-all 100% | three n=5 turns 7 (task 5) in 73K out 5K $0.20 main-all 100% fu-all 100% | bridge n=5 turns 33 (task 24) in 1.68M out 8K $3.42 main-all 100% fu-all 40%

## Task 106 materials replicate 3 (materials (metal / glass))

| arm | end (task/follow-up) | turns (task) | input tokens | output tokens | wall s | list $ | Kiro credits | builds | main checks | follow-up checks | frames |
|---|---|---|---|---|---|---|---|---|---|---|---|
| aura | invalid (infra) | - (-) | - | - | - | - | - | no | 0 (no probe result) | 0 (no probe result) | none |
| three | finished/finished | 6 (4) | 72K | 6K | 87 | 0.21 | 2.0 | yes | 2/2 | 4/4 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t106-three-r3-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t106-three-r3-main-2.png) |
| bridge | finished/finished | 49 (37) | 2.54M | 12K | 387 | 5.21 | 11.8 | yes | 2/2 | 4/4 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t106-bridge-r3-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t106-bridge-r3-main-2.png) |

Running medians over the 6 complete replicate(s) so far: aura n=5 turns 20 (task 17) in 731K out 6K $1.52 main-all 100% fu-all 100% | three n=6 turns 7 (task 4.5) in 73K out 6K $0.20 main-all 100% fu-all 100% | bridge n=6 turns 35 (task 28) in 2.09M out 10K $4.28 main-all 100% fu-all 50%

## Task 104 stacker replicate 1 (small game)

| arm | end (task/follow-up) | turns (task) | input tokens | output tokens | wall s | list $ | Kiro credits | builds | main checks | follow-up checks | frames |
|---|---|---|---|---|---|---|---|---|---|---|---|
| aura | finished/finished | 16 (13) | 500K | 5K | 161 | 1.05 | 3.4 | yes | 5/5 | 5/5 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t104-aura-r1-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t104-aura-r1-main-2.png) |
| three | finished/finished | 7 (5) | 63K | 4K | 59 | 0.17 | 1.4 | yes | 5/5 | 5/5 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t104-three-r1-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t104-three-r1-main-2.png) |
| bridge | finished/finished | 24 (22) | 1.03M | 8K | 451 | 2.15 | 6.2 | yes | 5/5 | 5/5 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t104-bridge-r1-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t104-bridge-r1-main-2.png) |

Running medians over the 7 complete replicate(s) so far: aura n=6 turns 18 (task 15) in 649K out 6K $1.36 main-all 100% fu-all 100% | three n=7 turns 7 (task 5) in 72K out 5K $0.20 main-all 100% fu-all 100% | bridge n=7 turns 33 (task 24) in 1.68M out 8K $3.42 main-all 100% fu-all 57%

## Task 111 solar replicate 1 (animated presentation)

| arm | end (task/follow-up) | turns (task) | input tokens | output tokens | wall s | list $ | Kiro credits | builds | main checks | follow-up checks | frames |
|---|---|---|---|---|---|---|---|---|---|---|---|
| aura | finished/finished | 31 (28) | 1.96M | 15K | 366 | 4.07 | 10.2 | yes | 8/8 | 3/3 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t111-aura-r1-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t111-aura-r1-main-2.png) |
| three | stopped_without_finish/finished | 6 (4) | 87K | 9K | 108 | 0.26 | 2.7 | yes | 8/8 | 3/3 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t111-three-r1-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t111-three-r1-main-2.png) |
| bridge | finished/finished | 40 (37) | 2.62M | 18K | 447 | 5.42 | 13.2 | yes | 8/8 | 3/3 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t111-bridge-r1-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t111-bridge-r1-main-2.png) |

Running medians over the 8 complete replicate(s) so far: aura n=7 turns 20 (task 17) in 731K out 6K $1.52 main-all 100% fu-all 100% | three n=8 turns 7 (task 4.5) in 73K out 6K $0.20 main-all 100% fu-all 100% | bridge n=8 turns 35 (task 28) in 2.09M out 10K $4.28 main-all 100% fu-all 63%

## Task 106 materials replicate 2 (materials (metal / glass))

| arm | end (task/follow-up) | turns (task) | input tokens | output tokens | wall s | list $ | Kiro credits | builds | main checks | follow-up checks | frames |
|---|---|---|---|---|---|---|---|---|---|---|---|
| aura | finished/finished | 26 (22) | 1.48M | 7K | 216 | 3.04 | 7.2 | yes | 2/2 | 4/4 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t106-aura-r2-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t106-aura-r2-main-2.png) |
| three | finished/finished | 9 (7) | 132K | 7K | 127 | 0.34 | 2.9 | yes | 2/2 | 4/4 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t106-three-r2-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t106-three-r2-main-2.png) |
| bridge | max_turns/max_turns | 55 (40) | 3.74M | 12K | 403 | 7.59 | 14.6 | yes | 2/2 | 3/4 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t106-bridge-r2-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t106-bridge-r2-main-2.png) |

Running medians over the 9 complete replicate(s) so far: aura n=8 turns 23 (task 19.5) in 1.11M out 7K $2.28 main-all 100% fu-all 100% | three n=9 turns 7 (task 5) in 73K out 6K $0.21 main-all 100% fu-all 100% | bridge n=9 turns 37 (task 32) in 2.50M out 12K $5.14 main-all 100% fu-all 56%

## Task 110 clock replicate 3 (interior)

| arm | end (task/follow-up) | turns (task) | input tokens | output tokens | wall s | list $ | Kiro credits | builds | main checks | follow-up checks | frames |
|---|---|---|---|---|---|---|---|---|---|---|---|
| aura | finished/finished | 37 (29) | 1.75M | 9K | 462 | 3.58 | 8.7 | yes | 0/1 | 5/5 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t110-aura-r3-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t110-aura-r3-main-2.png) |
| three | finished/finished | 6 (4) | 82K | 8K | 106 | 0.25 | 2.6 | yes | 0/1 | 5/5 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t110-three-r3-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t110-three-r3-main-2.png) |
| bridge | finished/finished | 30 (21) | 1.39M | 10K | 238 | 2.88 | 7.1 | yes | 0/1 | 5/5 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t110-bridge-r3-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t110-bridge-r3-main-2.png) |

Running medians over the 10 complete replicate(s) so far: aura n=9 turns 26 (task 22) in 1.48M out 7K $3.04 main-all 89% fu-all 100% | three n=10 turns 7 (task 4.5) in 77K out 7K $0.23 main-all 90% fu-all 100% | bridge n=10 turns 35 (task 28) in 2.09M out 11K $4.28 main-all 90% fu-all 60%

## Task 102 portal replicate 1 (shader / effect)

| arm | end (task/follow-up) | turns (task) | input tokens | output tokens | wall s | list $ | Kiro credits | builds | main checks | follow-up checks | frames |
|---|---|---|---|---|---|---|---|---|---|---|---|
| aura | finished/finished | 24 (20) | 1.17M | 10K | 346 | 2.44 | 6.8 | yes | 4/4 | 4/4 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t102-aura-r1-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t102-aura-r1-main-2.png) |
| three | finished/finished | 7 (4) | 132K | 12K | 806 | 0.38 | 3.5 | yes | 4/4 | 4/4 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t102-three-r1-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t102-three-r1-main-2.png) |
| bridge | finished/finished | 38 (34) | 2.87M | 16K | 431 | 5.90 | 13.4 | yes | 4/4 | 4/4 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t102-bridge-r1-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t102-bridge-r1-main-2.png) |

Running medians over the 11 complete replicate(s) so far: aura n=10 turns 25 (task 21) in 1.33M out 8K $2.74 main-all 90% fu-all 100% | three n=11 turns 7 (task 4) in 82K out 7K $0.25 main-all 91% fu-all 100% | bridge n=11 turns 37 (task 32) in 2.50M out 12K $5.14 main-all 91% fu-all 64%
