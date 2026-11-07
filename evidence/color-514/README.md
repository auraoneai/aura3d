# lane/514-color-and-preset evidence

Method: headless Chrome on the Metal GPU via loopback CDP (`tools/cap.mjs`), virtual clock `tools/shim.js` (from `origin/lane/504-bellkeeper`),
1280x720, Vite dev servers on two worktrees (origin/main vs this branch), 1k HDRIs and GLBs served from the main checkout's real files.
`tools/diff.py` / `tools/summarize.py` compute mean absolute difference (0..255, RGB average) and frame sanity.

## B. looks.preset("golden-hour") with its HDRI removed (`probe/`, source `probe-main.ts`)

The HDRI request is answered with 404 through CDP `Fetch`. Same page, same clock.

| pair | mean abs diff |
| --- | --- |
| base HDRI present vs branch HDRI present | 0.000 (identical) |
| reference (base, HDRI present) vs base HDRI 404 | 15.82 |
| reference (base, HDRI present) vs branch HDRI 404 | 9.27 |

`base-hdri-404.png` shows the wash (flat white chrome ball, no reflection, warm cast on the clay ball); `branch-hdri-404.png` shows banded
sky reflections and shading close to the reference. Console on the branch: one `console.error` `LOOK_HDRI_MISSING ... Fix: put kloppenheim_06_puresky_1k.hdr
under public/hdri/ ...`; `diagnostics-branch-hdri-404.json` shows the same code present in `app.diagnostics()` (warnings). The fallback is an approximation of
exposure and colour cast (measured band means of the real HDRI), with no sun disc and no softbox shapes.

## Games (`games/`, `summary.json`, `games-contact-sheet-branch.png`)

Five real game frames (not black, not the marketing page; verified by eye on the contact sheet), base captured twice or more, branch once or twice.
Games with present hex colours and present HDRIs:

| game | base vs base | base vs branch (best base pair) |
| --- | --- | --- |
| showcase-bank-shot | 0.012 | 0.001 |
| showcase-aurora-lander | 0.000 | 0.000 |
| showcase-top-tennis | 0.372 (base1 vs base3) | 0.366 (equal to its own branch vs branch2 noise) |
| showcase-blockfall-reactor | 10.75 (falling piece differs) | 8.75 to 10.96 (inside the noise floor, inconclusive) |
| showcase-strange-orbit-port | 34.8 (cold first load) | 4.79 vs the warm base run (animated, inconclusive) |

Three games are pixel-identical or at the noise floor; two animate nondeterministically even base-vs-base, so they show no regression but cannot prove neutrality.
Other games tried (roadster-rush, serpentine-sky-run, iron-crown, aura-hoops, vault-breakers, pips-big-leap, aura-diamond, kart-havoc, bean-brawl, cross-hop,
dot-dash, turbo-ball) rendered only a loading screen, a black canvas or a mount failure in this checkout (git-LFS pointer GLBs) and are excluded.
