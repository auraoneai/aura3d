# Cross Hop and Iron Crown near-black frames on production 4.1.0: root cause

Live verification of 4.1.0 (`evidence/live-410/`) showed Cross Hop (mean luma 13.8, one colour, only the "Quick Play" HUD) and Iron Crown (HUD only, no arena) with the black-frame guard having stepped down 2 and 1 rungs. Remote runs `pinregress-1` and `pinregress-2` (software WebGL2, 640x400, `tests/browser/pinregress.spec.ts`, config in `pinregress-config.json`) loaded the DEPLOYED 4.1.0 pages with the guard disabled (`?heal=0`) and a 20 s (run 1) / 30 s (run 2) boot wait.

## Result: the games render; the guard escalated on a slow load

| Game | Variant (`a3d-qr`) | Non-black | Mean luma | Colours |
|---|---|---|---|---|
| cross-hop | default (heal=0) | 0.995 | 97.1 | 3,477 |
| cross-hop | old pin `game,-compiler,-post,-vfxFog` | 0.998 | 126.9 | 4,277 |
| cross-hop | `game,-post` | 0.999 | 159.1 | 5,101 |
| cross-hop | `game,-compiler` | 0.952 | 79.5 | 2,574 |
| cross-hop | `game,-vfxFog` | 0.995 | 95.1 | 3,521 |
| iron-crown | default (heal=0) | 0.980 | 54.4 | 1,753 |
| iron-crown | old pin | 0.956 | 72.8 | 2,503 |
| iron-crown | `game,-post` | 0.987 | 73.8 | 2,700 |
| iron-crown | `game,-compiler` | 0.944 | 53.5 | 1,696 |
| iron-crown | `game,-vfxFog` | 0.980 | 54.2 | 1,811 |

Frames (run 2, JPEG, own game): `cross-hop-{default,oldpin,nopost}.jpg`, `iron-crown-{default,oldpin,nopost}.jpg`. In every variant the full 3D world is visible (Cross Hop: traffic lanes, trains, the frog; Iron Crown: arena floor, both fighters, crowd), with no console errors and no shader failures.

Root cause: not a rendering bug. Both games load a lot (Cross Hop 95 MB, Iron Crown 38 MB of public assets), so under software rendering (and on a slow connection) the canvas stays one flat clear colour for well over four seconds before the first model frame. The 4.1.0 guard sampled from page start, saw >= 40 black samples over >= 4 s and reloaded one rung down; every reload restarted the load, so after 2 (Cross Hop) or 1 (Iron Crown) rungs the smoke test captured a page that was still loading. The old pin also stayed black in that capture for the same reason, which is why it looked like a regression of the pin removal. Fixed in `02292fb23` (guard waits for readiness: loaded document, no loading overlay, no asset fetches in flight; black vs dark detection; one step per load). Confirm on the next deploy by running the probe with a `guard` variant (keeps the guard on, records the final `a3d-qr` and `__AURA3D_HEAL__`; set `PINREG_VARIANTS` to `guard:` in `pinregress-config.json`): no rung should fire.

## Finding that remains (not a black frame): post-on frames are darker

With the post chain on (the engine default now that the pin is gone) the same scene is 25-40% darker and less saturated than with `-post` (Cross Hop 97 vs 159 mean luma, Iron Crown 54 vs 74; compare `*-default.jpg` with `*-nopost.jpg`). `packages/rendering/src/renderer/coreOutputPostRoute.ts` documents why: a configured legacy postprocess chain "still tone-maps and encodes itself" and OutputPass is bypassed for the frame, so the tone mapping differs from the direct output path until PostGraph v2 migrates the chain. This is engine-level (every game with bloom/vignette is affected, 3-25% across the 15 games in the pin-removal A/B); it was not patched per game here.
