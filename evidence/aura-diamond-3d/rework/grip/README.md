# Diamond bat grip through the swing (software WebGL2, remote)

Run `gripv-1` (ACR run `ch2f2`, 13.1 min, 1 passed) on `origin/game-rework` head `a08220619`, which includes the engine fix `9e1e3442a` (attachments read the final pose) and `9d3dc50a1` (knob and palm compared in the same frame). 960x540, real-time sampling of the game's `bat.knobToHand` (metres) after `triggerSwing(0.84)`. Software GL only; not real-GPU evidence. The local log stopped streaming but the run finished on the server: the data below comes from `az acr task logs --run-id ch2f2`.

Raw rows: `knob-to-palm-gripv-1.json`. Frames: `00-stance.jpg`, `01-swing-*.jpg` (the 480 ms and 700 ms frames were missed: wall-clock screenshots are slower than those steps).

## Knob-to-palm distance (target: under 5 cm throughout)

| Phase | t (of swing) | knob to palm |
|---|---|---|
| stance | 0 | 3.2 cm |
| load | 0.06 to 0.24 | 3.0 to 4.2 cm |
| stride | 0.30 to 0.36 | 4.0 to 4.7 cm |
| contact | 0.42 | 3.5 cm |
| contact | 0.48 | 0.8 cm |
| contact (one sample) | 0.54 | **16.6 cm** |
| follow-through | 0.59 to 0.76 | 2.6 to 4.8 cm |
| follow-through | 0.81 | 8.7 cm |
| follow-through, held to the end | 0.87 to 1.0 | **14.4 to 14.6 cm** |

Result: under 5 cm for stance, load, stride and most of the swing (the bat stays in the hands, unlike the pre-fix behaviour where it left the hands about 120 ms in). Two excursions remain: a one-sample spike just after contact (the palm moves about 0.4 m between samples there, so part of it may be sampling lag) and a steady 14.6 cm offset once the follow-through finishes (palm and knob both stand still, so this one is a real geometric mismatch, mainly 14 cm along z).

The engine-bone columns in the first run's output read zeros: the diagnostic called `actor.socket` detached from its object. That is fixed in the follow-up run (`gripv-2`).
