# Glint Courier: final screenshots (4.7.1, GU47 lane g13 phase 3)

Retaken 2026-10-31 on `gu47/g13` (commit d7fed5422: the GU47 "night shift on the workbench" look plus the phase-3
presentation pass) with runs `g13p3-r3-s1280`, `g13p3-r3-s390` and `g13p3-r3-scard` (one test per viewport), remote
ACR on crmmeprodacr, software WebGL2 (SwiftShader). Decoded with
`evidence/game-upgrades-47/dot-dash-3d/tools/decode-g13-jpg.mjs`. The history below is the 4.5.0 set these replace.

## 4.5.0 set (history)

Route: `apps/showcase-dot-dash-3d`. Built from `audit-fix/g13` merged with `audit-fix/e2` (the per-normal hemisphere the game's lighting is tuned for), on top of `origin/main` 31f8945ad. These frames replace the set built from `0d965903c`, which predated the Glint Courier rework (`b7503eaf1`) and showed the old arcade-clone look.

**Runner:** remote Azure ACR Task (`tools/remote-acr/run.sh`, run `g13w3-screens-final`), headless Chromium, **software WebGL2 (SwiftShader)**. This is not real-GPU evidence: it shows layout and content, not GPU look or frame rate. Tool: the `g13-screens` test in `tests/browser/audit-fix/dot-dash-3d.spec.ts`; frames are taken through the game's own buttons and keys, 30 to 60 s after each step so the judged frame is a steady one. Per-frame luma and sim state: `evidence/dot-dash-3d/audit-fix/wave3/screens-metrics.jsonl`.

## Frames

| Viewport | State | Meaning |
|---|---|---|
| 1280x720 and 390x844 | 01-title | `?autostart=0`: title menu over board 1 |
| 1280x720 and 390x844 | 02-early | Quick Play pressed, board waiting for the first direction ("Press a direction to move") |
| 1280x720 and 390x844 | 03-action | after right, down, left key holds |
| 1280x720 and 390x844 | 04-mid | `?autoplay=1`, 60 s in |
| 1280x720 and 390x844 | 05-modes | Board Map panel |

Card images: `card-2x.jpg` (1440x900, `?autoplay=1`, 60 s in) and `card-1x.jpg` (720x450, downscaled). The site index posters `public/previews/showcase-index/dot-dash-3d.webp` (720x450) and `dot-dash-3d@2x.webp` (1440x900) are made from the same card frame.

## Checked in the frames

- The whole 19 x 21 board is in frame at both sizes (aspect-fit camera, audit row DD-3).
- HUD, pause button, first-run hint (phone) and the Board Map panel are readable; no end card is left over the board.
