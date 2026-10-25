# Slingshot Siege: final screenshots (2026-10-25)

- **Build:** `origin/game-rework` head `8da9c05d3` (play-fix, sports UI fix and shared quick bar included). Hoops and Links 390x844 and card frames, and the Links cards, come from the same head plus commit `4d9546a03` (venue chip hidden on phones). Desktop frames of Hoops and Links predate that CSS change.
- **Runner:** remote ACR task (`tools/remote-acr/run.sh`), headless Chromium on **software WebGL2 (SwiftShader), not real-GPU frames**. RUN_IDs `fina-*`. A frame costs about 3 s there, so game time runs slow and "late" states are far fewer than on a real GPU.
- **Specs:** `tests/browser/shotsa-<slug>.spec.ts` (+ `finam-*.spec.ts` for the mobile and card re-captures); decoder `tools/shots/decode-frames.mjs`. `status.txt` holds the capture log lines.
- **Layout:** `1280x720/`, `390x844/`, `card/` (720x450 at 1x and 2x).
- **Reviewed:** I opened the frames listed under "Seen"; the rest were not opened.
- **Results screens were not reached in any game.**

## Seen
- Desktop (`1280x720/03-action-01-state-aiming...jpg`): the island scene renders fully (cliffs, windmill, arch, crates, slingshot, flags) with the ammo tray and a single hint footer; no overlap. The app keeps its own header bar, single row, no wrapping.
- Phone (`390x844/03-action-02-state-shot-in-flight...jpg`): a shot in flight, score card, ammo tray above the hint line.
- No old names; 0 console errors.

## Problems still visible
- **Low:** on 390 wide the hint footer is cut off at the right edge ("...mid-flight t").
- **Low-medium:** only the aiming state was captured on desktop; launch, impact and level complete were not reached.
