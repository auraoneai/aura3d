# Aura Hoops 3D: final screenshots

## Retake 2026-10-29 (4.5.0 render, audit-fix lane G07)

Every frame in `1280x720/`, `390x844/` and `card/` was replaced with the same file name and pixel size from remote run
`g07-final2-screens-144440` (`audit-fix/g07` at 72f27e589, `tests/browser/audit-fix/aura-hoops-3d.spec.ts` `@screens`;
software WebGL2, not real-GPU frames). Gameplay frames are taken 25 s after ready and then every 14 s, autopilot on.
They show the 4.5.0 render (contact mask, real-depth AO), team kits (home orange, away light alternate with purple
shorts, square away rings), the fixed check prompt, the phone touch controls and the clear-sight chase camera. Numbers
per frame: `evidence/aura-hoops-3d/audit-fix-2026-10-29/after-screens/meta.jsonl`. The results screen is in
`evidence/aura-hoops-3d/audit-fix-2026-10-29/after-results/`.

## Earlier set (2026-10-25)


- **Build:** `origin/game-rework` head `8da9c05d3` (play-fix, sports UI fix and shared quick bar included). Hoops and Links 390x844 and card frames, and the Links cards, come from the same head plus commit `4d9546a03` (venue chip hidden on phones). Desktop frames of Hoops and Links predate that CSS change.
- **Runner:** remote ACR task (`tools/remote-acr/run.sh`), headless Chromium on **software WebGL2 (SwiftShader), not real-GPU frames**. RUN_IDs `fina-*`. A frame costs about 3 s there, so game time runs slow and "late" states are far fewer than on a real GPU.
- **Specs:** `tests/browser/shotsa-<slug>.spec.ts` (+ `finam-*.spec.ts` for the mobile and card re-captures); decoder `tools/shots/decode-frames.mjs`. `status.txt` holds the capture log lines.
- **Layout:** `1280x720/`, `390x844/`, `card/` (720x450 at 1x and 2x).
- **Reviewed:** I opened the frames listed under "Seen"; the rest were not opened.
- **Results screens were not reached in any game.**

## Seen
- Athletes read as clean flat-colour players: no photographic faces, lettering or logos, no shard noise; faces are flat shapes with dark eye bars; jersey and shorts regions are distinct.
- Shared quick bar: one row, scrolls sideways on phones, "Built with Aura3D" link on desktop. Old names: none. 0 console errors in every pass.
- Game not frozen: a shot at the rim with the ball in the air and the scoreboard reading SHOT was captured (`03-action-06`), then play continued. The first-basket freeze is covered by the unit and remote work of the earlier lane, not re-measured here.
- Phone: the venue chip no longer covers the scoreboard (`390x844/04-mid.jpg`).

## Problems still visible
- **Low:** the dark flat eye bars read like sunglasses.
- **Low:** jersey hems are slightly jagged on the grey jerseys.
- **Low:** two players clip into each other under the basket in the shot frame.
- **Low-medium:** the "SPACE - CHECK BALL" prompt sits over the ball at the centre circle in the card frames.
- **Low:** on 390 wide the quick bar is cut at the right edge by design (it scrolls).
- Dribble contact distance and foot slide cannot be judged from stills on software GL.
