# Thermal Drift: final screenshots (2026-11-18)

Route: `/apps/showcase-heatsink/` (app `apps/showcase-heatsink`).

**Runner:** headed Chrome on a real GPU (Apple Metal) via REA, production build served from the QA snapshot. Title from the plain URL; play frames from `?autoplay=1` (AI demo flight), second and third circuits from `?autoplay=1&circuit=dustfall|vesper`.

| Viewport | State | Meaning |
|---|---|---|
| 1280 | 01-title | title card over the Megacity grid |
| 1280 | 02-early | 3.5 s into the race under the boost-pad gantry, P1 |
| 1280 | 03-action | rivals in the Industrial Tunnel arch |
| 1280 | 04-mid | contact with a rival, Geothermal Foundry section |
| 1280 | 05-dustfall | Dustfall circuit, Dust Basin |
| 1280 | 06-vesper | Vesper circuit, Shard Ascent |
| 390 | 01-05 | title, early, action, mid, Vesper on a 390 x 844 phone |

Card: `card-2x.jpg` (1440x900 native capture, Vesper at 10 s: reactor ring, arch, rival drone) and `card-1x.jpg` (720x450 LANCZOS).

## Checked in the frames

- Rival drones hover with ground shadows under them; their four lift-fan ducts carry the spinning rotor-blur discs (spin is code-driven at about 7.6 rev/s; stills show the blurred discs, not the rotation itself).
- The player view is the cockpit-less chase camera (no player hull on screen), as before.
- Autoplay: the AI flies the racing line, holds P1-P2 and the race restarts by itself after the results.
- No blank/frozen frames after load; no page errors.

## Known issues

- Results not captured (race too long for this pass).
