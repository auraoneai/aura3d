# C1 fixed comparison: c1-dryrun-551

**DRY RUN with the stub model.** Agent output, tokens and cost are synthetic (scripted solutions, made-up usage); build, real-GPU load/fps, frames and functional probes are real measurements of the stub solutions. The visual judge is a frame-statistics stand-in. No number here says anything about Aura3D versus three.js.

Tasks (frozen 2026-11-09, before results): 101 spider (animation), 102 portal (effects), 103 canyon (environments), 104 stacker (games), 106 materials (materials), 109 product (materials), 110 clock (animation), 111 solar (interactive). Runs per arm per task: 3. Turn caps: task 40, follow-up 15.

## Per arm

| arm | runs (valid) | finished task | capped | follow-up finished | renders | functional all pass (mean) | follow-up all pass | regressions | turns median (task + follow-up) | wall s median | tool s median | tokens in median (cached share) | tokens out median | billed $ median | billed $ total | cost source | emitted JS gzip KB | fetched at load KB | load ms | fps |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| aura | 1 (1) | 100% | 0 | 100% | 100% | 100% (100%) | 100% | 0 | 10 (7 + 3) | 13.8 | 13.6 | 133650 (84%) | 3500 | 0.1017 | 0.1017 | list-price-estimate | 2203 | 8624.3 | 243 | 60 |
| three | 1 (1) | 100% | 0 | 100% | 100% | 100% (100%) | 100% | 0 | 7 (4 + 3) | 0.8 | 0.6 | 66000 (80%) | 2450 | 0.0635 | 0.0635 | list-price-estimate | 128.9 | 513.8 | 168 | 60 |
| bridge | 1 (1) | 100% | 0 | 100% | 100% | 100% (100%) | 100% | 0 | 11 (8 + 3) | 13.9 | 13.6 | 161500 (85%) | 3850 | 0.1161 | 0.1161 | list-price-estimate | 3263.2 | 8883.6 | 213 | 60 |

## Blind visual pairs (main phase, majority of judge calls)

Judge: stub-frame-statistics; calls per pair: 1; judge cost: -.

| pairing | subject wins | losses | ties | no-frame | win rate (ties half) | Wilson 95% |
|---|---|---|---|---|---|---|
| aura-vs-three | 1 | 0 | 0 | 0 | 100% | 21%-100% |
| bridge-vs-three | 0 | 1 | 0 | 0 | 0% | 0%-79% |
| bridge-vs-aura | 0 | 1 | 0 | 0 | 0% | 0%-79% |

## Ranges per arm (min-max over valid runs)

| arm | turns | task turns | task tokens (in+out) | tokens in | tokens out | wall s | tool s | billed $ | aura3d CLI calls median (renders) |
|---|---|---|---|---|---|---|---|---|---|
| aura | 10-10 | 7-7 | 68450-68450 | 133650-133650 | 3500-3500 | 13.8-13.8 | 13.6-13.6 | 0.1017-0.1017 | 3 (1) |
| three | 7-7 | 4-4 | 23600-23600 | 66000-66000 | 2450-2450 | 0.8-0.8 | 0.6-0.6 | 0.0635-0.0635 | 0 (0) |
| bridge | 11-11 | 8-8 | 88700-88700 | 161500-161500 | 3850-3850 | 13.9-13.9 | 13.6-13.6 | 0.1161-0.1161 | 3 (1) |

## Against benchmark 505 (task phase only; 505 had no follow-up)

505 medians over all 24 tasks: turns 25 docs / 14 cheat sheet / 5 three.js; tokens 1.45M / 420K / 63K.

C1 task-phase medians: aura 7 turns, 68450 tokens; three 4 turns, 23600 tokens; bridge 8 turns, 88700 tokens.

| task | 505 docs | 505 cheat sheet | 505 three.js | C1 aura | C1 three | C1 bridge |
|---|---|---|---|---|---|---|
| 101 spider | 13 | 5 | 5 | - | - | - |
| 102 portal | 25 | 11 | 5 | - | - | - |
| 103 canyon | 25 | 23 | 8 | - | - | - |
| 104 stacker | 19 | 11 | 4 | - | - | - |
| 106 materials | 20 | 16 | 6 | - | - | - |
| 109 product | 33 | 13 | 6 | 7 | 4 | 8 |
| 110 clock | 13 | 7 | 4 | - | - | - |
| 111 solar | 37 | 24 | 4 | - | - | - |

## Bridge decision rule

Verdict: **native stays the default (bridge does not meet the rule)** (meaningless on a dry run).

All tasks and the procedural-asset subset:

```json
{
 "all": {
  "verdict": "native stays the default (bridge does not meet the rule)",
  "detail": {
   "timeGain": -0.007246376811594177,
   "costGain": -0.14103194103194105,
   "bridgeVsAuraWinRate": 0,
   "correctnessDelta": 0,
   "comparableQuality": false,
   "clearlyBetter": false,
   "comparableCorrect": true
  }
 },
 "assets": {
  "tasks": [
   101,
   109,
   110
  ],
  "verdict": "native stays the default (bridge does not meet the rule)",
  "detail": {
   "timeGain": -0.007246376811594177,
   "costGain": -0.14103194103194105,
   "bridgeVsAuraWinRate": 0,
   "correctnessDelta": 0,
   "comparableQuality": false,
   "clearlyBetter": false,
   "comparableCorrect": true
  }
 }
}
```

## Per task

| task | arm | finished | functional | follow-up | turns median | billed $ median | load ms | fps |
|---|---|---|---|---|---|---|---|---|
| 109 product | aura | 1/1 | 1/1 | 1/1 | 10 | 0.1017 | 243 | 60 |
| 109 product | three | 1/1 | 1/1 | 1/1 | 7 | 0.0635 | 168 | 60 |
| 109 product | bridge | 1/1 | 1/1 | 1/1 | 11 | 0.1161 | 213 | 60 |

## Failed, capped and errored runs

None.

Definitions: finished = the agent called finish before the cap; functional all pass = every scripted probe check for the requested interactions passed on the real-GPU build; regression = the follow-up build passes fewer main-probe checks than the main build; billed $ = provider-reported cost when present, otherwise list price on the provider token split (see cost source). Tool time = time inside tool calls (typecheck, aura3d CLI incl. render builds, bridge import, file I/O); wall = whole agent session incl. model latency.
