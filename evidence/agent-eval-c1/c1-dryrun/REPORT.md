# C1 fixed comparison: c1-dryrun

**DRY RUN with the stub model.** Agent output, tokens and cost are synthetic (scripted solutions, made-up usage); build, real-GPU load/fps, frames and functional probes are real measurements of the stub solutions. The visual judge is a frame-statistics stand-in. No number here says anything about Aura3D versus three.js.

Tasks (frozen 2026-11-08, before results): 101 spider (animation), 102 portal (effects), 103 canyon (environments), 104 stacker (games), 105 garden (interactive), 106 materials (materials), 107 lighthouse (models), 108 plinko (physics). Runs per arm per task: 3. Turn caps: task 40, follow-up 15.

## Per arm

| arm | runs (valid) | finished task | capped | follow-up finished | renders | functional all pass (mean) | follow-up all pass | regressions | turns median (task + follow-up) | wall s median | tool s median | tokens in median (cached share) | tokens out median | billed $ median | billed $ total | cost source | emitted JS gzip KB | fetched at load KB | load ms | fps |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| aura | 1 (1) | 100% | 0 | 100% | 100% | 100% (100%) | 100% | 0 | 8 (5 + 3) | 6.5 | 6.3 | 85900 (82%) | 2800 | 0.0755 | 0.0755 | list-price-estimate | 2141.7 | 5654.1 | 427 | 60 |
| three | 2 (2) | 100% | 0 | 100% | 100% | 100% (100%) | 100% | 0 | 7 (4 + 3) | 4.5 | 4.3 | 66000 (80%) | 2450 | 0.0635 | 0.1270 | list-price-estimate | 127 | 503.7 | 126 | 60 |
| bridge | 1 (1) | 100% | 0 | 100% | 100% | 100% (100%) | 100% | 0 | 9 (6 + 3) | 9 | 8.7 | 108450 (83%) | 3150 | 0.0882 | 0.0882 | list-price-estimate | 3201.8 | 8912.9 | 609 | 47.4 |

## Blind visual pairs (main phase, majority of judge calls)

Judge: stub-frame-statistics; calls per pair: 1; judge cost: -.

| pairing | subject wins | losses | ties | no-frame | win rate (ties half) | Wilson 95% |
|---|---|---|---|---|---|---|
| aura-vs-three | 0 | 1 | 0 | 0 | 0% | 0%-79% |
| bridge-vs-three | 0 | 1 | 0 | 0 | 0% | 0%-79% |
| bridge-vs-aura | 0 | 0 | 1 | 0 | 50% | 6%-95% |

## Bridge decision rule

Verdict: **native stays the default (bridge does not meet the rule)** (meaningless on a dry run).

```json
{
 "timeGain": -0.38461538461538464,
 "costGain": -0.16898608349900593,
 "bridgeVsAuraWinRate": 0.5,
 "correctnessDelta": 0,
 "comparableQuality": true,
 "clearlyBetter": false,
 "comparableCorrect": true
}
```

## Per task

| task | arm | finished | functional | follow-up | turns median | billed $ median | load ms | fps |
|---|---|---|---|---|---|---|---|---|
| 105 garden | three | 1/1 | 1/1 | 1/1 | 7 | 0.0635 | 142 | 60 |
| 107 lighthouse | aura | 1/1 | 1/1 | 1/1 | 8 | 0.0755 | 427 | 60 |
| 107 lighthouse | three | 1/1 | 1/1 | 1/1 | 7 | 0.0635 | 110 | 60 |
| 107 lighthouse | bridge | 1/1 | 1/1 | 1/1 | 9 | 0.0882 | 609 | 47.4 |

## Failed, capped and errored runs

None.

Definitions: finished = the agent called finish before the cap; functional all pass = every scripted probe check for the requested interactions passed on the real-GPU build; regression = the follow-up build passes fewer main-probe checks than the main build; billed $ = provider-reported cost when present, otherwise list price on the provider token split (see cost source). Tool time = time inside tool calls (typecheck, bridge export, file I/O); wall = whole agent session incl. model latency.
