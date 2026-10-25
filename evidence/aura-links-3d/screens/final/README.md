# Aura Links 3D: final screenshots (2026-10-25)

- **Build:** `origin/game-rework` head `8da9c05d3` (play-fix, sports UI fix and shared quick bar included). Hoops and Links 390x844 and card frames, and the Links cards, come from the same head plus commit `4d9546a03` (venue chip hidden on phones). Desktop frames of Hoops and Links predate that CSS change.
- **Runner:** remote ACR task (`tools/remote-acr/run.sh`), headless Chromium on **software WebGL2 (SwiftShader), not real-GPU frames**. RUN_IDs `fina-*`. A frame costs about 3 s there, so game time runs slow and "late" states are far fewer than on a real GPU.
- **Specs:** `tests/browser/shotsa-<slug>.spec.ts` (+ `finam-*.spec.ts` for the mobile and card re-captures); decoder `tools/shots/decode-frames.mjs`. `status.txt` holds the capture log lines.
- **Layout:** `1280x720/`, `390x844/`, `card/` (720x450 at 1x and 2x).
- **Reviewed:** I opened the frames listed under "Seen"; the rest were not opened.
- **Results screens were not reached in any game.**

## Seen
- Golfer at address is upright with flexed knees (not the old whole-body slant), club in hand, ball on the tee (`03-action-01-address.jpg`); a second golfer stands by a plain green bag.
- **Stroke counter verified from state, not only from pixels:** `strokes` is 0 before the swing, 1 right after the first swing (HUD `h-strokes` 1), and still 1 eleven seconds later (`status.txt`: `@@FINA links-state ...`, `@@FINA links-hud-strokes 1`). The old bug reached about 19.
- The venue chip no longer covers the scoreboard on phones (`390x844/02-early.jpg`). Cards 1x and 2x render (the first 1x card was black and was re-captured).
- Shared quick bar one row; no old names; 0 console errors.

## Problems still visible
- **Medium:** under the sky environment the golfer and the cart show a glossy blue-silver sheen with speckles. In flat lighting (captured before the environment map loaded, `card/flat-lighting-card-2x.jpg`) the golfer is clean and matte, so this comes from environment reflections on the mesh normals, not from the texture. The model material is already non-metallic (roughness 0.74); raising roughness or fixing normals would need a re-hashed asset.
- **Medium:** on phones the golfer is cropped at the left edge (camera framing).
- **Low:** the second golfer's club points horizontally in the swing frames.
- Hole-out and the scorecard were not reached.
