# Wonder World look-dev record (2026-10-29)

**Status: prototype.** The captures are headless Chromium with software WebGL2 (SwiftShader) on the remote runner, so they are not real-GPU or device evidence. Each world is captured at desktop 1024x768 and phone 390x844 by `tests/browser/wonder-world-look.spec.ts`, with each world's first story at its opening beat. Models may take up to 180 s to load (`?modelWaitMs=180000`), so the frames show the models, not their stand-ins.

The look-dev rounds ran in a separate worktree on the code of `27e18263d`, so they still show the earlier Momo v2. The final looks are on this branch (see "Final" below), and the final remote suite captures them with Momo v3.

## Brief
Calm, low-stimulus pastel worlds with rich, saturated object accents (`02` §4). Morning daylight outdoors and warm daylight indoors, with soft contact shadows, no vignette and nothing that flashes. The cast reads clearly at toddler distance on a tablet and a phone.

## Rounds
Columns: mean luma (L, 0-255), mean saturation (s), colourfulness (C), and p5/p95 luma, desktop then phone, from each capture's `colourStats`. Each round's capture folder holds its frames, the per-world records and a `look-judgement.json` (schema `aura3d.look-judgement/1`, self-judged, valid under `aura3d look judge --validate`). Judgement round N judges the capture taken after change N-1.

| Capture | Change before it | Meadow | Learning cloud | Home nook | Weakest category |
| --- | --- | --- | --- | --- | --- |
| [`look-round0`](screens/2026-10-29/look-round0/) | none (the presets with a small exposure lift) | L227/226, s0.12, C30/34, p5 186 | L241/240, s0.02, C6/5, p5 223 | L233, s0.09, C22/20, p5 217 | lighting 5 (washed out) |
| [`look-round1`](screens/2026-10-29/look-round1/) | exposure about one stop under the presets (`exposureEv` -1.0, home nook -0.8) | L191/189, s0.23, C46/49, p5 127 | L215/213, s0.04, C11 | L198/200, s0.17, C34/32, p5 169 | composition 5.5 |
| [`look-round2`](screens/2026-10-29/look-round2/) | tighter wide and medium framing; learning cloud on `outdoor-day` with a periwinkle floor, a deeper sky and a richer rainbow | L191/189, s0.23, C45/49 | L211/209, s0.08, C22, p5 150 | L198/199, s0.17, C34/33 | composition 6.5 |
| [`look-round3`](screens/2026-10-29/look-round3/) | portrait framing closer (wide `minHalfWidth` 1.95 to 1.7, medium 1.75 to 1.6); deeper cloud floor; warmer home floor and rug | L191/189, s0.23, C45/49 (desktop unchanged) | L204/202, s0.11, C24/26, p5 148 | L189/189, s0.24, C48/48, p5 152 | composition 6.5 (Momo's arm cut on a 390 px phone) |

`aura3d look lint` over the app's `src`: 0 errors, 0 warnings.

## Final
Committed in `3f7822cf4` and checked by the final remote suite, whose `look` run (`wonder-look-20261029T172337Z`, [frames and numbers](README.md#look-look)) captures the six worlds again with Momo v3, the larger Peeko and the warm-yellow Lumi (`07` B34):
- exposure about one stop under the presets (round 1);
- the learning cloud on `outdoor-day` with a periwinkle floor (`#B3BDEB`), a deeper sky and a richer rainbow (rounds 2 and 3);
- the home nook's warmer floor (`#D6B07E`) and deeper rug (`#EE9F8C`) (round 3);
- the round 2 framing: wide and medium closer and narrower on desktop, and wide `minHalfWidth` 1.95 and medium 1.9 on portrait. Round 3's tighter portrait framing (1.7 and 1.6) is not kept: it cut Momo's raised arm at the edge of a 390 px phone. `tests/unit/stage/spots.test.ts` "keeps the core of the stage in frame on portrait phones and tablets, arms included" now catches that.

The loop stopped after round 3. Two rounds (2 and 3) moved only the weakest category, composition, from 5.5 to 6.5, and its remaining gap is structural (below). The final weakest categories are composition and shadows (6.5 and 6). Every category is at 6 or above, so the frames are prototype quality and not a panel pass.

## Remaining gaps
- Portrait phones show a large ground area below the cast: a tall frame keeps the stage's full width, so the cast cannot get bigger without leaving the frame. A lower or closer camera for portrait only would need a second set of framing rules; not done in this build.
- Shadows stay soft by design (calm look). On phones the contact shadows are faint.
- Faint green and cyan specks sit in the meadow sky, at the same screen spots in every capture (the round 0 to 3 frames and the first-frame runs). The published `create-aura3d@4.5.0` mini-game scaffold shows the same specks in its own sky on the same runner (`p0/` consumer smoke screenshot), so they come from the engine's sky on software WebGL2, not from this app; whether a real GPU shows them is part of the device runs (`07` §4.3 item 1).
- Judgements are the build agent's own (`judge: "self"`); no panel round has scored these frames.
