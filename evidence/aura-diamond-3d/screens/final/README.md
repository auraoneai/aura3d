# Aura Diamond 3D: final screenshots (2026-10-25)

- **Build:** `origin/game-rework` head `8da9c05d3` (play-fix, sports UI fix and shared quick bar included). Hoops and Links 390x844 and card frames, and the Links cards, come from the same head plus commit `4d9546a03` (venue chip hidden on phones). Desktop frames of Hoops and Links predate that CSS change.
- **Runner:** remote ACR task (`tools/remote-acr/run.sh`), headless Chromium on **software WebGL2 (SwiftShader), not real-GPU frames**. RUN_IDs `fina-*`. A frame costs about 3 s there, so game time runs slow and "late" states are far fewer than on a real GPU.
- **Specs:** `tests/browser/shotsa-<slug>.spec.ts` (+ `finam-*.spec.ts` for the mobile and card re-captures); decoder `tools/shots/decode-frames.mjs`. `status.txt` holds the capture log lines.
- **Layout:** `1280x720/`, `390x844/`, `card/` (720x450 at 1x and 2x).
- **Reviewed:** I opened the frames listed under "Seen"; the rest were not opened.
- **Results screens were not reached in any game.**

## Seen
- Batter holds the bat upright at the shoulder in stance (`03-action-01-stance.jpg`), hand at the grip; fielders wear gloves; athletes are clean flat-colour models.
- Swing sequence (`03-action-02..10`): the bat leaves the shoulder and sweeps out to the side. In the 700 ms frames the bat sits beside the head and I cannot confirm the grip from the frame (the batter is small; software GL runs several sim steps per frame). The earlier lane measured 9 to 15 cm during fast swings.
- Strike zone is a thin outline, not a slab. Shared quick bar one row; no old names; 0 console errors.

## Problems still visible
- **Low-medium:** bat-to-hand attachment during the swing is not provable from these frames.
- **Low:** the "PLAY BALL" overlay stays up for the whole capture (game time is slow on software GL).
- **Low:** the batter is small at the default camera, so hands and bat read poorly on phones.
