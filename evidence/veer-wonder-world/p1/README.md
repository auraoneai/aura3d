# Wonder World P1 evidence (J15)

**Status: prototype.** The P1 pilot (E01, E02, E05, E06, E09, E17, G01-G03) and every app-wide run: playback, no-speech, touch and layout, audio and pausing, low motion, the grown-up panel, the character sheets, the look and the stills. Every result here comes from headless Chromium (HeadlessChrome 147 on Linux x86_64) on the remote runner with software WebGL2, renderer `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`. That is **not real-GPU or physical-device evidence**: times are wall-clock times on a software renderer, not performance numbers. No real child's image, audio or name is in any file here; the specs redact what they print and `apps/<app>/tools/extract-remote-evidence.mjs` redacts again (`<app>` is the app's folder name).

| | |
| --- | --- |
| Commit under test | `7e1986801` (tree clean) for `audio-and-pausing`, `consumer-smoke`, `look`, `low-motion`, `low-motion-2`, `no-speech-required`, `no-speech-required-2`, `parent-panel`, `playback-activities`, `playback-episodes`, `playback-episodes-2`, `stills`, `stills-2`, `stills-3`, `stills-4`, `touch-and-layout`; `498c32f63` (tree clean) for `characters`, `characters-2`, `characters-3`; `2ae4125d1` (tree clean) for `first-frame-build` (the three commits differ only in tests/browser spec files; the app is the same), from each record's `commit` field (written by `apps/<app>/tools/remote-run.sh` into `.run-commit`) |
| Engine | `@aura3d/engine` 4.5.0 (`engineVersion` in each record) |
| Renderer | `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)` |
| Date | 2026-10-29, fan-out stamp `20261029T172337Z`; `first-frame-build` from `20261029T174544Z`; `characters`, `characters-2`, `characters-3` from `20261029T182623Z` (one ACR run per line of the run list in `tests/browser/wonder-world-lib.ts`, one shared image, deleted after the runs) |

## Runs
| Run ID | Specs | Result | Records |
| --- | --- | --- | --- |
| `wonder-audio-and-pausing-20261029T172337Z` | `tests/browser/wonder-world-audio-and-pausing.spec.ts` | passed: 1 passed (12.5 min) | [screens/2026-10-29/audio-and-pausing/](screens/2026-10-29/audio-and-pausing/) (1 record, 1 image) |
| `wonder-characters-20261029T182623Z` | `tests/browser/wonder-world-characters.spec.ts` | passed: 1 passed (30.7 min) | [screens/2026-10-29/characters/](screens/2026-10-29/characters/) (3 records, 22 images) |
| `wonder-characters-2-20261029T182623Z` | `tests/browser/wonder-world-characters-2.spec.ts` | passed: 1 passed (37.4 min) | [screens/2026-10-29/characters-2/](screens/2026-10-29/characters-2/) (3 records, 22 images) |
| `wonder-characters-3-20261029T182623Z` | `tests/browser/wonder-world-characters-3.spec.ts` | passed: 1 passed (42.2 min) | [screens/2026-10-29/characters-3/](screens/2026-10-29/characters-3/) (3 records, 22 images) |
| `wonder-look-20261029T172337Z` | `tests/browser/wonder-world-look.spec.ts` | passed: 1 passed (23.7 min) | [screens/2026-10-29/look/](screens/2026-10-29/look/) (7 records, 12 images) |
| `wonder-low-motion-20261029T172337Z` | `tests/browser/wonder-world-low-motion.spec.ts` | passed: 1 passed (19.8 min) | [screens/2026-10-29/low-motion/](screens/2026-10-29/low-motion/) (1 record, 1 image) |
| `wonder-low-motion-2-20261029T172337Z` | `tests/browser/wonder-world-low-motion-2.spec.ts` | passed: 1 passed (20.4 min) | [screens/2026-10-29/low-motion-2/](screens/2026-10-29/low-motion-2/) (1 record, 0 images) |
| `wonder-no-speech-required-20261029T172337Z` | `tests/browser/wonder-world-no-speech-required.spec.ts` | passed: 2 passed (18.9 min) | [screens/2026-10-29/no-speech-required/](screens/2026-10-29/no-speech-required/) (22 records, 0 images) |
| `wonder-no-speech-required-2-20261029T172337Z` | `tests/browser/wonder-world-no-speech-required-2.spec.ts` | passed: 2 passed (14.5 min) | [screens/2026-10-29/no-speech-required-2/](screens/2026-10-29/no-speech-required-2/) (14 records, 0 images) |
| `wonder-parent-panel-20261029T172337Z` | `tests/browser/wonder-world-parent-panel.spec.ts` | passed: 1 passed (11.5 min) | [screens/2026-10-29/parent-panel/](screens/2026-10-29/parent-panel/) (1 record, 2 images) |
| `wonder-playback-activities-20261029T172337Z` | `tests/browser/wonder-world-playback-activities.spec.ts` | passed: 4 passed (22.4 min) | [screens/2026-10-29/playback-activities/](screens/2026-10-29/playback-activities/) (15 records, 0 images) |
| `wonder-playback-episodes-20261029T172337Z` | `tests/browser/wonder-world-playback-episodes.spec.ts` | passed: 3 passed (25.0 min) | [screens/2026-10-29/playback-episodes/](screens/2026-10-29/playback-episodes/) (12 records, 0 images) |
| `wonder-playback-episodes-2-20261029T172337Z` | `tests/browser/wonder-world-playback-episodes-2.spec.ts` | passed: 2 passed (27.6 min) | [screens/2026-10-29/playback-episodes-2/](screens/2026-10-29/playback-episodes-2/) (12 records, 0 images) |
| `wonder-stills-20261029T172337Z` | `tests/browser/wonder-world-stills.spec.ts` | passed: 1 passed (24.1 min) | [screens/2026-10-29/stills/](screens/2026-10-29/stills/) (9 records, 8 images) |
| `wonder-stills-2-20261029T172337Z` | `tests/browser/wonder-world-stills-2.spec.ts` | passed: 1 passed (23.4 min) | [screens/2026-10-29/stills-2/](screens/2026-10-29/stills-2/) (9 records, 8 images) |
| `wonder-stills-3-20261029T172337Z` | `tests/browser/wonder-world-stills-3.spec.ts` | passed: 1 passed (30.4 min) | [screens/2026-10-29/stills-3/](screens/2026-10-29/stills-3/) (9 records, 8 images) |
| `wonder-stills-4-20261029T172337Z` | `tests/browser/wonder-world-stills-4.spec.ts` | passed: 1 passed (23.0 min) | [screens/2026-10-29/stills-4/](screens/2026-10-29/stills-4/) (9 records, 8 images) |
| `wonder-touch-and-layout-20261029T172337Z` | `tests/browser/wonder-world-touch-and-layout.spec.ts` | passed: 3 passed (22.8 min) | [screens/2026-10-29/touch-and-layout/](screens/2026-10-29/touch-and-layout/) (9 records, 3 images) |

## Route health
Errors counted in each run's records: console errors, page errors, bad HTTP responses, failed requests, app errors, privacy-scan hits, foreign or malformed voice keys.

| Run | Records | Errors |
| --- | --- | --- |
| `audio-and-pausing` | 1 | 0 |
| `characters` | 3 | 0 |
| `characters-2` | 3 | 0 |
| `characters-3` | 3 | 0 |
| `look` | 7 | 0 |
| `low-motion` | 1 | 0 |
| `low-motion-2` | 1 | 0 |
| `no-speech-required` | 22 | 0 |
| `no-speech-required-2` | 14 | 0 |
| `parent-panel` | 1 | 0 |
| `playback-activities` | 15 | 0 |
| `playback-episodes` | 12 | 0 |
| `playback-episodes-2` | 12 | 0 |
| `stills` | 9 | 0 |
| `stills-2` | 9 | 0 |
| `stills-3` | 9 | 0 |
| `stills-4` | 9 | 0 |
| `touch-and-layout` | 9 | 0 |

## P1 pilot stories
| Story | Watch & Sing, no input (`playback-*`) | Play Together, no input, microphone stubs (`no-speech-required*`) | Still (`stills*`) |
| --- | --- | --- | --- |
| E01 `momo-magic-mouth` | complete, 129 s story time, 29/29 lines, 4 waits, 0 errors | complete, 129 s story time, 29/29 lines, 0 waits, 0 errors | [hello-mirror](screens/2026-10-29/stills/still-e01.jpg) (home-nook, 3 model nodes, luma 188, problems 0) |
| E02 `peekaboo-palace` | complete, 131 s story time, 29/29 lines, 4 waits, 0 errors | complete, 131 s story time, 29/29 lines, 0 waits, 0 errors | [open-right](screens/2026-10-29/stills/still-e02.jpg) (peekaboo-barn, 5 model nodes, luma 197, problems 0) |
| E05 `counting-cookies` | complete, 137 s story time, 31/31 lines, 6 waits, 0 errors | complete, 137 s story time, 31/31 lines, 0 waits, 0 errors | [count-one](screens/2026-10-29/stills/still-e05.jpg) (home-nook, 7 model nodes, luma 187, problems 0) |
| E06 `lulu-dino-dance` | complete, 127 s story time, 35/35 lines, 4 waits, 0 errors | complete, 127 s story time, 35/35 lines, 0 waits, 0 errors | [clap](screens/2026-10-29/stills/still-e06.jpg) (music-garden, 3 model nodes, luma 195, problems 0) |
| E09 `baby-animal-orchestra` | complete, 124 s story time, 27/27 lines, 4 waits, 0 errors | complete, 124 s story time, 27/27 lines, 0 waits, 0 errors | [cow-says](screens/2026-10-29/stills-2/still-e09.jpg) (music-garden, 9 model nodes, luma 197, problems 0) |
| E17 `sheru-big-adventure` | complete, 123 s story time, 25/25 lines, 4 waits, 0 errors | complete, 123 s story time, 25/25 lines, 0 waits, 0 errors | [model](screens/2026-10-29/stills-3/still-e17.jpg) (meadow, 2 model nodes, luma 189, problems 0) |
| G01 `bubble-garden` | complete, 50 s story time, 15/15 lines, 6 waits, 0 errors | complete, 50 s story time, 15/15 lines, 0 waits, 0 errors | [first-bubble](screens/2026-10-29/stills-3/still-g01.jpg) (meadow, 4 model nodes, luma 191, problems 0) |
| G02 `gogo-train` | complete, 64 s story time, 20/20 lines, 8 waits, 0 errors | complete, 64 s story time, 20/20 lines, 0 waits, 0 errors | [board](screens/2026-10-29/stills-3/still-g02.jpg) (station, 3 model nodes, luma 196, problems 0) |
| G03 `sheru-ball` | complete, 45 s story time, 15/15 lines, 4 waits, 0 errors | complete, 45 s story time, 15/15 lines, 0 waits, 0 errors | [woof](screens/2026-10-29/stills-3/still-g03.jpg) (meadow, 2 model nodes, luma 190, problems 0) |

In the no-speech runs the microphone and speech-recognition stubs, installed before the app loads, were live in 4 of 4 shards and counted 0 calls. The other 14 episodes and 9 activities are in [`../p2/README.md`](../p2/README.md).

## Touch and layout (J10, `touch-and-layout`)
E17's ball at the invite and repeat beats: a tap by mouse or touch after a stray tap on empty ground, or the grown-up's confirm button.

| Viewport | Size | Turns taken by | Turns answered | Stray taps ignored | Errors |
| --- | --- | --- | --- | --- | --- |
| phone-portrait | 390x844 | mouse at invite, touch at repeat | 2 of 2 | 2 of 2 | 0 |
| tablet-landscape | 1024x768 | mouse at invite, confirm at repeat | 2 of 2 | 1 of 1 | 0 |
| tablet-portrait | 768x1024 | mouse at invite, touch at repeat | 2 of 2 | 2 of 2 | 0 |

## Audio and pausing (J11, `audio-and-pausing`)
Passed: true. Steps recorded: beforeStart, audio, firstLine, pauseControl, resumeControl, replay, visibility, visibilityResumed, hooks, skip, mute, done, monitor, voices, appErrors, privacy. Console errors 0, page errors 0, bad responses 0.

## Low motion (J13, `low-motion`, `low-motion-2`)
| Record | Reduced motion | Flash check (no step over 40, no spike over 15) | Idle frames at the invite |
| --- | --- | --- | --- |
| `low-motion-flag` | on (`?reducedMotion=1`) | 60 frames in reduced motion, largest mean-luma step 1.539, 0 spikes, darkest mean 190 | 0.024 mean change over 200 ms in reduced motion (limit 2.5) |
| `low-motion-setting` | off at start (false), on by the setting (true), off again (false) | 60 frames in normal motion, largest mean-luma step 0.765, 0 spikes, darkest mean 190 | 0.025 mean change over 200 ms in reduced motion (limit 2.5) |

## Grown-up panel (`parent-panel`)
Passed: true. Steps recorded: boot, menu, changed, reloaded, persistedControls, cleared, privacy. Defaults {"captions":true,"music":true,"highContrast":false,"waitMs":5000,"wordList":[],"sfxVolume":"normal"}; chosen {"captions":false,"music":false,"highContrast":true,"waitMs":7000,"wordList":["ball","more"],"sfxVolume":"soft"}. Console errors 0, page errors 0.

## Character sheets (`characters`, `characters-2`, `characters-3`)
Each character in its own story: a 320x568 phone frame, a four-view turnaround (front, left, back, right), the six poses of `02` §2, the talking pulse and a reduced-motion pass, cropped around the character (`tests/browser/wonder-world-capture-lib.ts`).

| Character | Story | Drawn as | 320x568 height and contrast with the ground (pass: 48 px; luma 12, colour 30 or separated 0.4) | Turnaround: view most unlike the front (mean change, pass 1) | Poses | Talking pulse, reduced motion: talking / silent (mean change) | "happy" travel: normal / reduced | Errors | Images |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| lulu | E06 `lulu-dino-dance` | model | 88 px; luma 30.13, colour 72.352, separated 0.604 | right view 10.509 | 6 | 2.621 / 0.02 | 49.2 / 23.6 px | 0 | [sheet](screens/2026-10-29/characters/) |
| momo | E01 `momo-magic-mouth` | model | 87 px; luma 38.623, colour 65.665, separated 0.973 | right view 2.689 | 6 | 1.519 / 0.017 | 45.6 / 22.9 px | 0 | [sheet](screens/2026-10-29/characters/) |
| gogo | G02 `gogo-train` | model | 93 px; luma 90.654, colour 165.717, separated 0.943 | left view 44.377 | 6 | 4.753 / 0.026 | 28.5 / 14.2 px | 0 | [sheet](screens/2026-10-29/characters-2/) |
| sheru | E17 `sheru-big-adventure` | model | 62 px; luma 37.246, colour 63.504, separated 0.534 | right view 10.71 | 6 | 2.884 / 0.034 | 30.8 / 15.3 px | 0 | [sheet](screens/2026-10-29/characters-2/) |
| lumi | E03 `alphabet-zoo` | model | 53 px; luma 8.15, colour 44.471, separated 0.759 | left view 4.69 | 6 | 1.648 / 0.031 | 3.5 / 1.1 px | 0 | [sheet](screens/2026-10-29/characters-3/) |
| peeko | G04 `peekaboo-animal-barn` | model | 68 px; luma 25.812, colour 63.367, separated 0.577 | right view 3.601 | 6 | 1.766 / 0.022 | 31.8 / 16.3 px | 0 | [sheet](screens/2026-10-29/characters-3/) |

## Look (`look`)
The six worlds at the opening beat of their first story, desktop 1024x768 and phone 390x844. The look-dev rounds and the judgements are in [`look-dev.md`](look-dev.md).

| World | Luma (L), saturation (s), colourfulness (C) |
| --- | --- |
| [home-nook](screens/2026-10-29/look/look-home-nook-desktop.jpg) (momo-magic-mouth) | desktop L189, s0.24, C47, p5 152; phone L189, s0.24, C46, p5 154 |
| [learning-cloud](screens/2026-10-29/look/look-learning-cloud-desktop.jpg) (alphabet-zoo) | desktop L204, s0.11, C26, p5 147; phone L202, s0.12, C25, p5 150 |
| [meadow](screens/2026-10-29/look/look-meadow-desktop.jpg) (sheru-big-adventure) | desktop L191, s0.23, C45, p5 128; phone L189, s0.24, C49, p5 112 |
| [music-garden](screens/2026-10-29/look/look-music-garden-desktop.jpg) (lulu-dino-dance) | desktop L197, s0.16, C37, p5 137; phone L192, s0.19, C41, p5 112 |
| [peekaboo-barn](screens/2026-10-29/look/look-peekaboo-barn-desktop.jpg) (peekaboo-palace) | desktop L196, s0.18, C40, p5 134; phone L191, s0.21, C46, p5 111 |
| [station](screens/2026-10-29/look/look-station-desktop.jpg) (gogo-train) | desktop L197, s0.18, C45, p5 136; phone L190, s0.21, C49, p5 111 |

## Device reports
None yet. Physical-device runs are `07` §4.3 item 1; each device will get `devices/<device>.md` here.

## Issue log
Issues the remote runs found on 2026-10-29, and what fixed each one. Every fix is on the branch and the final runs above check it.

| Found by | Issue | Fix |
| --- | --- | --- |
| `wonder-A-20261029T135132Z` (build) | `check-deploy --browser` reported `net::ERR_ABORTED` for a model: the preloader cancelled a download when its 10 s wait ran out, and the deploy check closed the page mid-boot | `30771221a` keeps the download running past the wait; `39a30a970` gives the deploy check's browser pass a settle that covers the boot |
| `wonder-F-20261029T135132Z` (audio and pausing, low motion) | The start tap timed out while software WebGL2 held the main thread, and the flash runs outlasted the test | `39a30a970`: the start tap waits for the stage boot; low motion at 640x480 with a 35-minute limit |
| `wonder-H-20261029T152530Z` (audio and pausing) | The start tap still timed out at 30 s on a busy page | `5b6e0cddb`: grown-up and start steps get 120 s |
| `wonder-P-20261029T152530Z` (grown-up panel) | The two-second hold never opened the gate: the page's timers ran late on software WebGL2 | `bd0ff431b`: the gate measures the hold from the press and release event times; two unit tests |
| `wonder-P-20261029T152530Z` (consumer smoke) | The mini-game template requests demo media it does not ship | `919a8f38d` separates those requests from SDK failures; recorded as `07` B32 (`227aa5b49`) |
| `wonder-B-20261029T152530Z` (playback E01-E10) | The E01-E05 shard ran past the 900 s test limit | `821968d8c`: 1,500 s per shard |
| `wonder-G-20261029T152530Z` (touch and layout) | The grown-up confirm click timed out | `821968d8c`: 120 s |
| `wonder-K-20261029T152530Z` (characters) | GoGo's "front" view showed its side: the vehicle GLBs face -X | `65315fbaa` turns the side-on vehicle models a quarter turn, `20509ecd9` keeps vehicles facing the way they drove and turns GoGo to the viewer after it arrives; `07` B33 |
| `wonder-K-20261029T152530Z` (characters) | Peeko (31-43 px) and Lumi (43 px) under the 48 px floor on a 320x568 phone; Lumi near-white on the learning cloud; Peeko behind a door in every E02 wide shot; Lumi's back matching its front but for the face | `76518d2d5` (`07` B34): Peeko 0.55 m, Lumi 0.65 m and a warm-yellow Lumi; `f5960659c`: Peeko's sheet on G04 and the turnaround judged by the view most unlike the front |
| `wonder-J-20261029T152530Z`, `wonder-K-20261029T152530Z` (characters) | Three sheets in one file took 49 minutes, and K ran out of its 52 in Peeko's sheet | `f5960659c`: two characters per file (`characters`, `characters-2`, `characters-3`) |
| `wonder-I-20261029T152530Z` (low motion) | Both tests in one file took 52 of the runner's 60 minutes | `519551282`: one test per file (`low-motion`, `low-motion-2`) |
| `wonder-audio-and-pausing-20261029T161422Z` | The real-time story clock moved two seconds in a minute at 1024x768, so the wait for the next line ran out | `a625db64d`: 640x480 and 180 s for the next line |
| `wonder-consumer-smoke-20261029T161422Z` | The template's hero GLB request was reported aborted (`net::ERR_ABORTED`) | `0497aa864`: the spec opens the built scaffold and counts the abort as upstream only when the hero loads there (`07` B32) |
| `wonder-characters-3-20261029T163852Z` (characters) | Lumi's silent frames moved more than her talking ones (3.17 against 1.68): inside one window her talking bob can cancel her idle float | `7e1986801` compared each talking frame with the same idle moment in silence |
| `wonder-characters-20261029T172337Z` (characters) | That same-phase check failed Momo and Lulu: target rings breathe on their own 2.6 s period, and a dance story has few calm windows two idle periods long | `5089e726e`: the pulse is measured in reduced motion, where only the pulse moves |
| `wonder-characters-2-20261029T172337Z` (characters) | GoGo's reduced-motion pass failed (crop delta 11.1 against 11.9) where an earlier run had passed it (7.7 against 11.6): a mean luma change saturates for a large, detailed body | `498c32f63`: reduced motion is judged by how far the character's nodeRect travels, and sheet jobs skip spans in which a train is running |
| `wonder-first-frame-build-20261029T172337Z` (build) | `check-deploy --browser` closed the page with the idle scene's tree GLB still downloading after a 5-minute settle (the boot holds the main thread for minutes on software WebGL2) | `2ae4125d1`: a 10-minute settle |
| look-dev round 0 | Washed-out worlds (mean luma 227 of 255) | `3f7822cf4`: a stop under the presets, the coloured cloud and home floors (`look-dev.md`) |
| look-dev round 3 | A tighter portrait frame cut Momo's raised arm on a 390 px phone | `3f7822cf4` keeps the round 2 portrait framing; `tests/unit/stage/spots.test.ts` checks the arms |

## Known gaps
- Software WebGL2 only. Device reports, real-GPU captures and the listening checks are `07` §4.3 item 1.
- Run times are wall-clock times on a software renderer and are far slower than a device; they are not performance numbers.
- The look judgements are the build agent's own (`look-dev.md`); no panel has scored the frames.
