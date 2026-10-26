# Shadowstep Gauntlet (Ninja Runner): sun shadows stay off

Result of the 4.3.0 parity-closeout attempt to re-enable the sun's cascaded shadow. All runs are software WebGL2 on the remote runner (`tools/remote-acr/run.sh`, run ids `pcrender-nr-*`), 960x540, high quality, village frame, `ninja-runner-budget-a` and `ninja-runner-art-a` specs. Not real-GPU evidence.

**Decision: shadows stay off.** Turning the sun shadow on darkens the whole frame by about 8 mean luma points (baseline 115.1, shadow on 107.1 at the village; the same 8 to 10 points at all eight art frames: run-start, intro, village, alley, stairs, clones, shuriken, spiralorb). The shipping bar was mean luma within about 3 points of baseline apart from the cast shadow itself.

## What was tried (draw calls and mean luma, village frame)

| Variant | Draw calls | Mean luma |
|---|---|---|
| Shadow off (shipping) | 56 | 115.1 |
| 2 cascades, 100 m, 2048, hero + barriers + instanced buildings and trees cast | 111 | 107.1 |
| Same, `bias -0.0004` | 111 | 107.1 |
| Same, `normalBias 0.05` | 111 | 107.1 |
| Same, `filter: "hard"` | 111 | 107.1 |
| Same, no caster at all (hero, scenery layers) | 77 | 107.1 |
| 1 cascade, 60 m | 83 | 107.1 |
| 3 cascades, 300 m | 139 | 107.1 |

Luma is identical to the decimal in every variant, so the darkening does not depend on casters, cascade count, fit distance, bias or filter. The post pipeline (`post`, `lighting` diagnostics) is identical with shadows on or off; the only diagnostic that changes is `shadows` (`sampled: true`). Whole-frame darkening of every lit receiver with the shadow lookup enabled and nothing casting is an engine-side defect in the directional shadow receive path, not something a port-side fit can tune out. The hero's own cast shadow is also not visible on the cobbles in the shadow-on frames.

Frames: `village-shadow-off.jpg`, `village-shadow-on.jpg`, `village-diff-x8.png` (absolute difference, amplified 8x: a uniform lift across all ground, walls and foliage, not a localized shadow).

## Still open

- Engine: reproduce with a one-light, one-plane scene (directional `shadow: { cascades: 2 }`, no caster) and compare mean luma with `shadow: false`; fix, then re-try this port with the settings in row 2 above (draw calls 111, inside the 133 budget in `PORTING-NOTES.md`). The port keeps blob shadows meanwhile.
