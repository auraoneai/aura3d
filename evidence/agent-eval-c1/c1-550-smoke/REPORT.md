# C1 fixed comparison: c1-550-smoke

Tasks (frozen 2026-11-09, before results): 101 spider (animation), 102 portal (effects), 103 canyon (environments), 104 stacker (games), 106 materials (materials), 109 product (materials), 110 clock (animation), 111 solar (interactive). Runs per arm per task: 3. Turn caps: task 40, follow-up 15.

## Per arm

| arm | runs (valid) | finished task | capped | follow-up finished | renders | functional all pass (mean) | follow-up all pass | regressions | turns median (task + follow-up) | wall s median | tool s median | tokens in median (cached share) | tokens out median | billed $ median | billed $ total | cost source | emitted JS gzip KB | fetched at load KB | load ms | fps |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| aura | 1 (1) | 0% | 1 | 100% | 100% | 100% (100%) | 100% | 0 | 48 (40 + 8) | 621.8 | 147.8 | 3675601 (0%) | 27092 | 7.6221 | 7.6221 | list-price-estimate | 2228.4 | 5739.8 | 251 | 60 |

## Blind visual pairs (main phase, majority of judge calls)

Judge: not run; calls per pair: -; judge cost: -.

| pairing | subject wins | losses | ties | no-frame | win rate (ties half) | Wilson 95% |
|---|---|---|---|---|---|---|

## Ranges per arm (min-max over valid runs)

| arm | turns | task turns | task tokens (in+out) | tokens in | tokens out | wall s | tool s | billed $ | aura3d CLI calls median (renders) |
|---|---|---|---|---|---|---|---|---|---|
| aura | 48-48 | 40-40 | 2656261-2656261 | 3675601-3675601 | 27092-27092 | 621.8-621.8 | 147.8-147.8 | 7.6221-7.6221 | 25 (14) |

## Against benchmark 505 (task phase only; 505 had no follow-up)

505 medians over all 24 tasks: turns 25 docs / 14 cheat sheet / 5 three.js; tokens 1.45M / 420K / 63K.

C1 task-phase medians: aura 40 turns, 2656261 tokens.

| task | 505 docs | 505 cheat sheet | 505 three.js | C1 aura | C1 three | C1 bridge |
|---|---|---|---|---|---|---|
| 101 spider | 13 | 5 | 5 | - | - | - |
| 102 portal | 25 | 11 | 5 | - | - | - |
| 103 canyon | 25 | 23 | 8 | - | - | - |
| 104 stacker | 19 | 11 | 4 | - | - | - |
| 106 materials | 20 | 16 | 6 | - | - | - |
| 109 product | 33 | 13 | 6 | 40 | - | - |
| 110 clock | 13 | 7 | 4 | - | - | - |
| 111 solar | 37 | 24 | 4 | - | - | - |

## Bridge decision rule

Verdict: **insufficient data**.

All tasks and the procedural-asset subset:

```json
{
 "all": {
  "verdict": "insufficient data",
  "detail": {}
 },
 "assets": {
  "tasks": [
   101,
   109,
   110
  ],
  "verdict": "insufficient data",
  "detail": {}
 }
}
```

## Per task

| task | arm | finished | functional | follow-up | turns median | billed $ median | load ms | fps |
|---|---|---|---|---|---|---|---|---|
| 109 product | aura | 0/1 | 1/1 | 1/1 | 48 | 7.6221 | 251 | 60 |

## Failed, capped and errored runs

- c1-550-smoke-t109-aura-r1: task hit turn cap

Definitions: finished = the agent called finish before the cap; functional all pass = every scripted probe check for the requested interactions passed on the real-GPU build; regression = the follow-up build passes fewer main-probe checks than the main build; billed $ = provider-reported cost when present, otherwise list price on the provider token split (see cost source). Tool time = time inside tool calls (typecheck, aura3d CLI incl. render builds, bridge import, file I/O); wall = whole agent session incl. model latency.
