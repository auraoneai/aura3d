# C1 fixed comparison: c1-551

Tasks (frozen 2026-11-09, before results): 101 spider (animation), 102 portal (effects), 103 canyon (environments), 104 stacker (games), 106 materials (materials), 109 product (materials), 110 clock (animation), 111 solar (interactive). Runs per arm per task: 3. Turn caps: task 40, follow-up 15.

## Per arm

| arm | runs (valid) | finished task | capped | follow-up finished | renders | functional all pass (mean) | follow-up all pass | regressions | turns median (task + follow-up) | wall s median | tool s median | tokens in median (cached share) | tokens out median | billed $ median | billed $ total | cost source | emitted JS gzip KB | fetched at load KB | load ms | fps |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| aura | 24 (24) | 96% | 1 | 96% | 88% | 88% (91%) | 100% | 0 | 27 (22 + 4) | 300.8 | 72.0 | 1510609.50 (0%) | 9009.50 | 3.1113 | 77.9686 | list-price-estimate | 2230.2 | 5918.9 | 236.50 | 60 |
| three | 24 (24) | 96% | 0 | 100% | 88% | 88% (88%) | 100% | 0 | 7 (5 + 2) | 125.3 | 0.9 | 97028.50 (0%) | 7877.50 | 0.2833 | 9.9953 | list-price-estimate | 129.6 | 510.6 | 92.50 | 60 |
| bridge | 24 (24) | 92% | 2 | 71% | 96% | 88% (91%) | 71% | 1 | 34.50 (29.50 + 7.50) | 351.1 | 72.7 | 1937596.50 (0%) | 11338 | 3.9808 | 105.4812 | list-price-estimate | 2218.3 | 7564.8 | 270 | 60 |

## Blind visual pairs (main phase, majority of judge calls)

Judge: claude-sonnet-5.5; calls per pair: 3; judge cost: $5.092390000000001 (list-price-estimate).

| pairing | subject wins | losses | ties | no-frame | win rate (ties half) | Wilson 95% |
|---|---|---|---|---|---|---|
| aura-vs-three | 13 | 11 | 0 | 0 | 54% | 35%-72% |
| bridge-vs-three | 12 | 12 | 0 | 0 | 50% | 31%-69% |
| bridge-vs-aura | 15 | 9 | 0 | 0 | 63% | 43%-79% |

## Ranges per arm (min-max over valid runs)

| arm | turns | task turns | task tokens (in+out) | tokens in | tokens out | wall s | tool s | billed $ | aura3d CLI calls median (renders) |
|---|---|---|---|---|---|---|---|---|---|
| aura | 14-47 | 11-40 | 265733-3152678 | 367717-4058817 | 4265-22141 | 121.3-746.2 | 16.1-150.3 | 0.7781-8.3390 | 11.50 (5) |
| three | 6-21 | 4-19 | 30226-826209 | 55198-947230 | 3882-21559 | 59-827.8 | 0.6-4.2 | 0.1531-2.0903 | 0 (0) |
| bridge | 15-55 | 12-40 | 291100-2574660 | 402916-3995412 | 5736-17643 | 162.3-474.6 | 32-119 | 0.8632-8.1422 | 9.50 (5) |

## Against benchmark 505 (task phase only; 505 had no follow-up)

505 medians over all 24 tasks: turns 25 docs / 14 cheat sheet / 5 three.js; tokens 1.45M / 420K / 63K.

C1 task-phase medians: aura 22 turns, 1149604 tokens; three 5 turns, 57385 tokens; bridge 29.50 turns, 1508030 tokens.

| task | 505 docs | 505 cheat sheet | 505 three.js | C1 aura | C1 three | C1 bridge |
|---|---|---|---|---|---|---|
| 101 spider | 13 | 5 | 5 | 11 | 5 | 13 |
| 102 portal | 25 | 11 | 5 | 24 | 4 | 32 |
| 103 canyon | 25 | 23 | 8 | 22 | 9 | 31 |
| 104 stacker | 19 | 11 | 4 | 13 | 5 | 22 |
| 106 materials | 20 | 16 | 6 | 24 | 5 | 37 |
| 109 product | 33 | 13 | 6 | 39 | 6 | 40 |
| 110 clock | 13 | 7 | 4 | 15 | 4 | 18 |
| 111 solar | 37 | 24 | 4 | 28 | 4 | 34 |

## Bridge decision rule

Verdict: **native stays the default (bridge does not meet the rule)**.

All tasks and the procedural-asset subset:

```json
{
 "all": {
  "verdict": "native stays the default (bridge does not meet the rule)",
  "detail": {
   "timeGain": -0.16722074468085132,
   "costGain": -0.27946520344780373,
   "bridgeVsAuraWinRate": 0.625,
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
   "timeGain": 0.18777848504137493,
   "costGain": -0.08826842377905585,
   "bridgeVsAuraWinRate": 0.556,
   "correctnessDelta": 0,
   "comparableQuality": true,
   "clearlyBetter": false,
   "comparableCorrect": true
  }
 }
}
```

## Per task

| task | arm | finished | functional | follow-up | turns median | billed $ median | load ms | fps |
|---|---|---|---|---|---|---|---|---|
| 101 spider | aura | 3/3 | 3/3 | 3/3 | 14 | 0.7858 | 1999 | 60 |
| 101 spider | three | 3/3 | 3/3 | 3/3 | 7 | 0.1963 | 54 | 60 |
| 101 spider | bridge | 3/3 | 3/3 | 2/3 | 28 | 2.6676 | 201 | 60 |
| 102 portal | aura | 3/3 | 3/3 | 3/3 | 29 | 3.1631 | 220 | 60 |
| 102 portal | three | 3/3 | 3/3 | 3/3 | 7 | 0.3834 | 90 | 60 |
| 102 portal | bridge | 3/3 | 3/3 | 3/3 | 37 | 5.1362 | 278 | 60 |
| 103 canyon | aura | 3/3 | 3/3 | 3/3 | 25 | 3.0799 | 310 | 60 |
| 103 canyon | three | 3/3 | 3/3 | 3/3 | 11 | 1.0820 | 170 | 60 |
| 103 canyon | bridge | 3/3 | 3/3 | 3/3 | 35 | 4.0471 | 306 | 60 |
| 104 stacker | aura | 3/3 | 2/3 | 3/3 | 16 | 1.0536 | 164 | 60 |
| 104 stacker | three | 3/3 | 3/3 | 3/3 | 7 | 0.1676 | 53 | 60 |
| 104 stacker | bridge | 3/3 | 2/3 | 1/3 | 24 | 2.1529 | 228 | 60 |
| 106 materials | aura | 3/3 | 3/3 | 3/3 | 27 | 3.0419 | 178 | 60 |
| 106 materials | three | 3/3 | 3/3 | 3/3 | 7 | 0.3194 | 124 | 60 |
| 106 materials | bridge | 2/3 | 3/3 | 2/3 | 49 | 6.1796 | 230 | 60 |
| 109 product | aura | 2/3 | 3/3 | 3/3 | 46 | 6.5289 | 249 | 60 |
| 109 product | three | 3/3 | 3/3 | 3/3 | 9 | 0.3951 | 95 | 60 |
| 109 product | bridge | 2/3 | 3/3 | 0/3 | 55 | 8.1014 | 247 | 60 |
| 110 clock | aura | 3/3 | 1/3 | 3/3 | 30 | 3.1427 | 223 | 60 |
| 110 clock | three | 3/3 | 0/3 | 3/3 | 6 | 0.2050 | 55 | 60 |
| 110 clock | bridge | 3/3 | 1/3 | 3/3 | 30 | 2.8838 | 177 | 60 |
| 111 solar | aura | 3/3 | 3/3 | 3/3 | 31 | 4.0659 | 260 | 60 |
| 111 solar | three | 2/3 | 3/3 | 3/3 | 7 | 0.3029 | 149 | 60 |
| 111 solar | bridge | 3/3 | 3/3 | 3/3 | 38 | 4.4783 | 423 | 60 |

## Failed, capped and errored runs

- c1-551-t101-bridge-r1: follow-up hit turn cap
- c1-551-t101-bridge-r3: follow-up hit turn cap
- c1-551-t106-bridge-r2: task hit turn cap; follow-up hit turn cap
- c1-551-t109-aura-r3: task hit turn cap
- c1-551-t109-bridge-r1: task hit turn cap; follow-up hit turn cap
- c1-551-t109-bridge-r2: follow-up hit turn cap
- c1-551-t109-bridge-r3: follow-up hit turn cap
- c1-551-t110-aura-r2: follow-up hit turn cap
- c1-551-t110-bridge-r2: follow-up hit turn cap

Definitions: finished = the agent called finish before the cap; functional all pass = every scripted probe check for the requested interactions passed on the real-GPU build; regression = the follow-up build passes fewer main-probe checks than the main build; billed $ = provider-reported cost when present, otherwise list price on the provider token split (see cost source). Tool time = time inside tool calls (typecheck, aura3d CLI incl. render builds, bridge import, file I/O); wall = whole agent session incl. model latency.
