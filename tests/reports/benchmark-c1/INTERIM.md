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

## Task 102 portal replicate 3 (shader / effect)

| arm | end (task/follow-up) | turns (task) | input tokens | output tokens | wall s | list $ | Kiro credits | builds | main checks | follow-up checks | frames |
|---|---|---|---|---|---|---|---|---|---|---|---|
| aura | finished/finished | 29 (24) | 1.53M | 11K | 287 | 3.16 | 8.0 | yes | 4/4 | 4/4 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t102-aura-r3-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t102-aura-r3-main-2.png) |
| three | finished/finished | 6 (4) | 103K | 11K | 256 | 0.32 | 3.3 | yes | 4/4 | 4/4 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t102-three-r3-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t102-three-r3-main-2.png) |
| bridge | finished/finished | 31 (27) | 1.77M | 12K | 251 | 3.66 | 8.4 | yes | 4/4 | 4/4 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t102-bridge-r3-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t102-bridge-r3-main-2.png) |

Running medians over the 12 complete replicate(s) so far: aura n=11 turns 26 (task 22) in 1.48M out 9K $3.04 main-all 91% fu-all 100% | three n=12 turns 7 (task 4) in 84K out 8K $0.26 main-all 92% fu-all 100% | bridge n=12 turns 35 (task 29.5) in 2.13M out 12K $4.40 main-all 92% fu-all 67%

## Task 111 solar replicate 2 (animated presentation)

| arm | end (task/follow-up) | turns (task) | input tokens | output tokens | wall s | list $ | Kiro credits | builds | main checks | follow-up checks | frames |
|---|---|---|---|---|---|---|---|---|---|---|---|
| aura | finished/finished | 26 (23) | 1.75M | 14K | 512 | 3.64 | 10.4 | yes | 8/8 | 3/3 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t111-aura-r2-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t111-aura-r2-main-2.png) |
| three | finished/finished | 7 (4) | 133K | 12K | 161 | 0.38 | 3.6 | yes | 8/8 | 3/3 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t111-three-r2-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t111-three-r2-main-2.png) |
| bridge | finished/finished | 38 (34) | 2.17M | 14K | 356 | 4.48 | 10.8 | yes | 8/8 | 3/3 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t111-bridge-r2-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t111-bridge-r2-main-2.png) |

Running medians over the 13 complete replicate(s) so far: aura n=12 turns 26 (task 22.5) in 1.51M out 10K $3.10 main-all 92% fu-all 100% | three n=13 turns 7 (task 4) in 87K out 8K $0.26 main-all 92% fu-all 100% | bridge n=13 turns 37 (task 32) in 2.17M out 12K $4.48 main-all 92% fu-all 69%

## Task 101 spider replicate 2 (character / animation)

| arm | end (task/follow-up) | turns (task) | input tokens | output tokens | wall s | list $ | Kiro credits | builds | main checks | follow-up checks | frames |
|---|---|---|---|---|---|---|---|---|---|---|---|
| aura | finished/finished | 14 (11) | 368K | 4K | 186 | 0.78 | 2.7 | yes | 1/1 | 4/4 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t101-aura-r2-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t101-aura-r2-main-2.png) |
| three | finished/finished | 7 (5) | 76K | 5K | 84 | 0.20 | 1.7 | yes | 1/1 | 4/4 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t101-three-r2-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t101-three-r2-main-2.png) |
| bridge | finished/finished | 28 (13) | 1.17M | 7K | 255 | 2.41 | 6.2 | yes | 1/1 | 4/4 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t101-bridge-r2-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t101-bridge-r2-main-2.png) |

Running medians over the 14 complete replicate(s) so far: aura n=13 turns 26 (task 22) in 1.48M out 9K $3.04 main-all 92% fu-all 100% | three n=14 turns 7 (task 4) in 84K out 8K $0.26 main-all 93% fu-all 100% | bridge n=14 turns 35 (task 29.5) in 1.97M out 12K $4.07 main-all 93% fu-all 71%

## Task 103 canyon replicate 2 (outdoor)

| arm | end (task/follow-up) | turns (task) | input tokens | output tokens | wall s | list $ | Kiro credits | builds | main checks | follow-up checks | frames |
|---|---|---|---|---|---|---|---|---|---|---|---|
| aura | finished/finished | 29 (26) | 1.49M | 9K | 280 | 3.08 | 7.6 | yes | 1/1 | 3/3 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t103-aura-r2-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t103-aura-r2-main-2.png) |
| three | finished/finished | 11 (9) | 269K | 11K | 495 | 0.65 | 5.4 | yes | 1/1 | 3/3 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t103-three-r2-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t103-three-r2-main-2.png) |
| bridge | finished/finished | 41 (39) | 2.76M | 13K | 429 | 5.66 | 12.4 | yes | 1/1 | 3/3 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t103-bridge-r2-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t103-bridge-r2-main-2.png) |

Running medians over the 15 complete replicate(s) so far: aura n=14 turns 26 (task 22.5) in 1.49M out 9K $3.06 main-all 93% fu-all 100% | three n=15 turns 7 (task 4) in 87K out 8K $0.26 main-all 93% fu-all 100% | bridge n=15 turns 37 (task 32) in 2.17M out 12K $4.48 main-all 93% fu-all 73%

## Task 104 stacker replicate 2 (small game)

| arm | end (task/follow-up) | turns (task) | input tokens | output tokens | wall s | list $ | Kiro credits | builds | main checks | follow-up checks | frames |
|---|---|---|---|---|---|---|---|---|---|---|---|
| aura | finished/finished | 16 (13) | 452K | 5K | 121 | 0.96 | 3.1 | yes | 4/5 | 5/5 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t104-aura-r2-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t104-aura-r2-main-2.png) |
| three | finished/finished | 8 (5) | 92K | 5K | 81 | 0.23 | 1.8 | yes | 5/5 | 5/5 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t104-three-r2-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t104-three-r2-main-2.png) |
| bridge | finished/finished | 15 (12) | 403K | 6K | 162 | 0.86 | 3.1 | yes | 5/5 | 4/5 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t104-bridge-r2-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t104-bridge-r2-main-2.png) |

Running medians over the 16 complete replicate(s) so far: aura n=15 turns 26 (task 22) in 1.48M out 9K $3.04 main-all 87% fu-all 100% | three n=16 turns 7 (task 4.5) in 89K out 8K $0.26 main-all 94% fu-all 100% | bridge n=16 turns 35 (task 29.5) in 1.97M out 12K $4.07 main-all 94% fu-all 69%

## Task 109 product replicate 2 (product viewer)

| arm | end (task/follow-up) | turns (task) | input tokens | output tokens | wall s | list $ | Kiro credits | builds | main checks | follow-up checks | frames |
|---|---|---|---|---|---|---|---|---|---|---|---|
| aura | finished/finished | 27 (21) | 1.56M | 13K | 328 | 3.25 | 9.5 | yes | 4/4 | 5/5 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t109-aura-r2-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t109-aura-r2-main-2.png) |
| three | finished/finished | 6 (4) | 86K | 7K | 319 | 0.24 | 2.6 | yes | 4/4 | 5/5 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t109-three-r2-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t109-three-r2-main-2.png) |
| bridge | finished/max_turns | 47 (32) | 2.73M | 11K | 393 | 5.57 | 11.9 | yes | 4/4 | 3/5 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t109-bridge-r2-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t109-bridge-r2-main-2.png) |

Running medians over the 17 complete replicate(s) so far: aura n=16 turns 26 (task 21.5) in 1.49M out 9K $3.06 main-all 88% fu-all 100% | three n=17 turns 7 (task 4) in 87K out 7K $0.25 main-all 94% fu-all 100% | bridge n=17 turns 37 (task 32) in 2.17M out 12K $4.48 main-all 94% fu-all 65%

## Task 110 clock replicate 2 (interior)

| arm | end (task/follow-up) | turns (task) | input tokens | output tokens | wall s | list $ | Kiro credits | builds | main checks | follow-up checks | frames |
|---|---|---|---|---|---|---|---|---|---|---|---|
| aura | finished/max_turns | 30 (15) | 1.53M | 9K | 314 | 3.14 | 8.1 | yes | 1/1 | 5/5 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t110-aura-r2-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t110-aura-r2-main-2.png) |
| three | finished/finished | 6 (4) | 69K | 7K | 124 | 0.21 | 2.1 | yes | 0/1 | 5/5 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t110-three-r2-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t110-three-r2-main-2.png) |
| bridge | finished/max_turns | 33 (18) | 1.74M | 10K | 414 | 3.57 | 8.7 | yes | 1/1 | 5/5 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t110-bridge-r2-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t110-bridge-r2-main-2.png) |

Running medians over the 18 complete replicate(s) so far: aura n=17 turns 26 (task 21) in 1.49M out 9K $3.08 main-all 88% fu-all 100% | three n=18 turns 7 (task 4) in 87K out 7K $0.24 main-all 89% fu-all 100% | bridge n=18 turns 35 (task 29.5) in 1.97M out 11K $4.07 main-all 94% fu-all 67%

## Task 103 canyon replicate 3 (outdoor)

| arm | end (task/follow-up) | turns (task) | input tokens | output tokens | wall s | list $ | Kiro credits | builds | main checks | follow-up checks | frames |
|---|---|---|---|---|---|---|---|---|---|---|---|
| aura | finished/finished | 24 (20) | 1.14M | 8K | 252 | 2.36 | 6.4 | yes | 1/1 | 3/3 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t103-aura-r3-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t103-aura-r3-main-2.png) |
| three | finished/finished | 21 (19) | 947K | 20K | 828 | 2.09 | 11.0 | yes | 1/1 | 3/3 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t103-three-r3-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t103-three-r3-main-2.png) |
| bridge | finished/finished | 35 (31) | 1.97M | 10K | 332 | 4.05 | 9.2 | yes | 1/1 | 3/3 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t103-bridge-r3-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t103-bridge-r3-main-2.png) |

Running medians over the 19 complete replicate(s) so far: aura n=18 turns 26 (task 20.5) in 1.49M out 9K $3.06 main-all 89% fu-all 100% | three n=19 turns 7 (task 4) in 87K out 7K $0.25 main-all 89% fu-all 100% | bridge n=19 turns 35 (task 31) in 1.97M out 11K $4.05 main-all 95% fu-all 68%

## Task 106 materials replicate 1 (materials (metal / glass))

| arm | end (task/follow-up) | turns (task) | input tokens | output tokens | wall s | list $ | Kiro credits | builds | main checks | follow-up checks | frames |
|---|---|---|---|---|---|---|---|---|---|---|---|
| aura | finished/finished | 35 (31) | 2.55M | 9K | 330 | 5.18 | 10.9 | yes | 2/2 | 4/4 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t106-aura-r1-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t106-aura-r1-main-2.png) |
| three | finished/finished | 7 (5) | 121K | 8K | 153 | 0.32 | 3.3 | yes | 2/2 | 4/4 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t106-three-r1-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t106-three-r1-main-2.png) |
| bridge | finished/finished | 45 (36) | 3.03M | 12K | 380 | 6.18 | 13.4 | yes | 2/2 | 4/4 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t106-bridge-r1-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t106-bridge-r1-main-2.png) |

Running medians over the 20 complete replicate(s) so far: aura n=19 turns 26 (task 21) in 1.49M out 9K $3.08 main-all 89% fu-all 100% | three n=20 turns 7 (task 4.5) in 89K out 7K $0.26 main-all 90% fu-all 100% | bridge n=20 turns 36 (task 31.5) in 2.07M out 11K $4.26 main-all 95% fu-all 70%

## Task 109 product replicate 3 (product viewer)

| arm | end (task/follow-up) | turns (task) | input tokens | output tokens | wall s | list $ | Kiro credits | builds | main checks | follow-up checks | frames |
|---|---|---|---|---|---|---|---|---|---|---|---|
| aura | max_turns/finished | 47 (40) | 4.06M | 22K | 640 | 8.34 | 19.8 | yes | 4/4 | 5/5 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t109-aura-r3-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t109-aura-r3-main-2.png) |
| three | finished/finished | 10 (6) | 237K | 10K | 332 | 0.57 | 4.6 | yes | 4/4 | 5/5 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t109-three-r3-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t109-three-r3-main-2.png) |
| bridge | finished/max_turns | 55 (40) | 3.98M | 14K | 475 | 8.10 | 16.8 | yes | 4/4 | 3/5 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t109-bridge-r3-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t109-bridge-r3-main-2.png) |

Running medians over the 21 complete replicate(s) so far: aura n=20 turns 26.5 (task 21.5) in 1.51M out 9K $3.11 main-all 90% fu-all 100% | three n=21 turns 7 (task 5) in 92K out 8K $0.26 main-all 90% fu-all 100% | bridge n=21 turns 37 (task 32) in 2.17M out 12K $4.48 main-all 95% fu-all 67%

## Task 110 clock replicate 1 (interior)

| arm | end (task/follow-up) | turns (task) | input tokens | output tokens | wall s | list $ | Kiro credits | builds | main checks | follow-up checks | frames |
|---|---|---|---|---|---|---|---|---|---|---|---|
| aura | finished/finished | 28 (14) | 1.29M | 8K | 261 | 2.66 | 7.0 | yes | 1/1 | 5/5 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t110-aura-r1-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t110-aura-r1-main-2.png) |
| three | finished/finished | 6 (4) | 63K | 6K | 93 | 0.18 | 1.8 | yes | 0/1 | 5/5 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t110-three-r1-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t110-three-r1-main-2.png) |
| bridge | finished/finished | 27 (14) | 1.30M | 11K | 252 | 2.71 | 7.8 | yes | 0/1 | 5/5 | [1](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t110-bridge-r1-main-1.png) [2](../../../evidence/agent-eval-c1/c1-551/frames/c1-551-t110-bridge-r1-main-2.png) |

Running medians over the 22 complete replicate(s) so far: aura n=21 turns 27 (task 21) in 1.49M out 9K $3.08 main-all 90% fu-all 100% | three n=22 turns 7 (task 4.5) in 89K out 7K $0.26 main-all 86% fu-all 100% | bridge n=22 turns 36 (task 31.5) in 2.07M out 12K $4.26 main-all 91% fu-all 68%
