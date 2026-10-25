# Red Zone 3D: final screenshots (2026-10-25)

- **Build:** `origin/game-rework` head `8da9c05d3` (play-fix, sports UI fix and shared quick bar included). Hoops and Links 390x844 and card frames, and the Links cards, come from the same head plus commit `4d9546a03` (venue chip hidden on phones). Desktop frames of Hoops and Links predate that CSS change.
- **Runner:** remote ACR task (`tools/remote-acr/run.sh`), headless Chromium on **software WebGL2 (SwiftShader), not real-GPU frames**. RUN_IDs `fina-*`. A frame costs about 3 s there, so game time runs slow and "late" states are far fewer than on a real GPU.
- **Specs:** `tests/browser/shotsa-<slug>.spec.ts` (+ `finam-*.spec.ts` for the mobile and card re-captures); decoder `tools/shots/decode-frames.mjs`. `status.txt` holds the capture log lines.
- **Layout:** `1280x720/`, `390x844/`, `card/` (720x450 at 1x and 2x).
- **Reviewed:** I opened the frames listed under "Seen"; the rest were not opened.
- **Results screens were not reached in any game.**

## Seen
- Players are small but readable; the repainted quarterback and linemen look like flat-colour football players with no marks.
- Play cards are a compact strip with a PLAYS collapse chip (`1280x720/04-mid.jpg`); on phones they form one row of three (`390x844/04-mid.jpg`).
- Shared quick bar one row, single line on phones; no old names; 0 console errors.

## Problems still visible
- **Low-medium:** only one state frame was captured on desktop (autoplay produced few state changes in the time budget), so the key actions (snap, throw, tackle) are not covered.
- **Low:** on phones the play strip covers the lower third of the field and cuts off the nearest players.
- **Low:** the title capture is the field itself (no title card); the rain overlay is heavy.
- Touchdown and results were not reached.
