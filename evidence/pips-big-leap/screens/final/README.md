# Pip's Big Leap: final screens (4.5.0 engine, audit fixes, 2026-10-29)

Route: `apps/showcase-pips-big-leap`. Built from branch `audit-fix/g06` at ed0eea745 (all lane G06 fixes) on the 4.5.0 engine. Replaces the 2026-10-25 set (RH-05); same file names and pixel sizes, plus `1280-06-results.jpg` and `390-06-results.jpg`, which the old set never reached.

**Runner:** remote Azure ACR Task, headless Chromium, software WebGL2 (SwiftShader). This shows layout, content and look on software GL, not real-GPU look or frame rate. Tool: `tests/browser/audit-fix/pips-big-leap.spec.ts`, frames decoded from the run log with `evidence/pips-big-leap/audit-2026-10-29/decode.mjs`. Frames come from the game's own buttons, held keys, a touch tap on the pause button, and `?autoplay=1` for mid and results. The app's own GLBs are served from `apps/showcase-pips-big-leap/public/aura-assets` through `page.route` (the example dev server only serves the root `public/`). Shots are full page (HUD included) and taken after at least a 20 s settle.

`card-1x.jpg` (720x450) is a Lanczos downscale of `card-2x.jpg` (1440x900, captured natively).

| File | Run, target, shot | Canvas mean luma | Draw calls | World / mode | Sim seconds |
|---|---|---|---|---|---|
| 1280-01-title.jpg | g06-after2-A d1280 01-title | 165.11 | 782 | w1 quick | 0 |
| 1280-02-early.jpg | g06-after2-A d1280 02-early | 165.27 | 782 | w1 quick | 0 |
| 1280-03-action.jpg | g06-after2-A d1280 03-action | 156.32 | 784 | w1 quick | 0.22 |
| 1280-04-mid.jpg | g06-after2-B a1280 04-mid | 155.89 | 433 | w1 quick | 0.57 |
| 1280-05-modes.jpg | g06-after2-A d1280 05-modes | 167.77 | 782 | w1 quick | 3.92 |
| 1280-06-results.jpg | g06-after2-B a1280 06-results | 172.45 | 25 | w1 quick | 32.7 |
| 390-01-title.jpg | g06-after2-B p390 01-title | 167.21 | 684 | w1 quick | 0 |
| 390-02-early.jpg | g06-after2-B p390 02-early | 167.22 | 684 | w1 quick | 0 |
| 390-03-action.jpg | g06-after2-B p390 03-action | 170.08 | 304 | w1 quick | 0.45 |
| 390-04-mid.jpg | g06-after2-B p390 04-mid | 168.37 | 218 | w1 quick | 1.38 |
| 390-05-modes.jpg | g06-after2-B p390 05-modes | 157.32 | 298 | w1 quick | 5.92 |
| 390-06-results.jpg | g06-after2-B p390 06-results | 161.58 | 27 | w1 quick | 32.7 |
| card-2x.jpg | g06-after2-A c1440 card-2x | 163.42 | 782 | w1 quick | 0 |

## Capture health

- Console errors: one 404, `/apps/common/src/fonts.css` (harness only: the remote build context did not include `apps/common`; the file exists in the repo and the production build bundles it, so Graphik falls back to sans-serif in these frames). No page errors.
- Render path `hdr-msaa`, bloom fusion `separable`, contact shadows `passExecuted: true` in every shot that reports them.
- Results reached by autoplay in 32.7 s of sim time at both 1280x720 and 390x844.

## Checked in the frames

- 390x844: the platforms ahead are in view (portrait FOV 67.9 deg, boom 5.6 m) and the 44 px pause button sits at top right.
- The Studio cape shows on Pip's back while he runs; it no longer covers his face.
- The sidekick runner is a blocky low-poly character from the shared catalog (`showcaseSidekickRunner`); it is intentional dressing, not a placeholder.
