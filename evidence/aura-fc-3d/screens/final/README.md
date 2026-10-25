# Aura FC 3D: final screenshots (2026-10-25)

- **Build:** `origin/game-rework` head `8da9c05d3` (play-fix, sports UI fix and shared quick bar included). Hoops and Links 390x844 and card frames, and the Links cards, come from the same head plus commit `4d9546a03` (venue chip hidden on phones). Desktop frames of Hoops and Links predate that CSS change.
- **Runner:** remote ACR task (`tools/remote-acr/run.sh`), headless Chromium on **software WebGL2 (SwiftShader), not real-GPU frames**. RUN_IDs `fina-*`. A frame costs about 3 s there, so game time runs slow and "late" states are far fewer than on a real GPU.
- **Specs:** `tests/browser/shotsa-<slug>.spec.ts` (+ `finam-*.spec.ts` for the mobile and card re-captures); decoder `tools/shots/decode-frames.mjs`. `status.txt` holds the capture log lines.
- **Layout:** `1280x720/`, `390x844/`, `card/` (720x450 at 1x and 2x).
- **Reviewed:** I opened the frames listed under "Seen"; the rest were not opened.
- **Results screens were not reached in any game.**

## Seen
- Tighter broadcast camera works: players are readable at 1280x720 and 390x844, the ball and the goal are in frame (`03-action-04`, `03-action-06`).
- Team kits: red and white versus navy and white; referee in a yellow and black kit (small, top of frame); goalkeeper in yellow.
- Shared quick bar one row; no old names; 0 console errors.

## Problems still visible
- **Medium:** a ragged white fringe at the hips of the red-team players and dark noise fragments on the navy shorts. This is the known "hip slab" mesh problem noted by the earlier FC lane; the repaint did not remove it.
- **Medium:** no frame shows a clear kick (plant, swing, contact, follow-through). The demo capture shows running and ball control; the kick work is verified by unit test only.
- **Low-medium:** players look crouched in the run animation at kickoff.
- Half-time and results were not reached.
