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
