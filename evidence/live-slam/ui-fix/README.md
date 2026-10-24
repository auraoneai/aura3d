# Aura Slam menu and portrait quick-bar fix (2026-10-24)

Defects from `evidence/live-slam/README.md`: (1) Modes menu cramped and unstyled; (2) portrait quick-switch bar covering the scoreboard.

Root cause of (1): `examples/aura-slam/ui/styles.css` reads `--text-small|body|title|section|page|display`, `--space-1..4`, `--leading-*`, `--content-width|gutter`, which no stylesheet defined. An undefined `var()` makes the whole declaration invalid at computed-value time, so menu padding fell to 0, headings to the inherited 16px and card gaps to 0. Fix: define the tokens (dense preset: 13/14px text) and guard with `tests/unit/aura-slam/ui-css-tokens.test.ts`. Also styled the masthead `.site-brand`, hid the controls hint while the menu is open, moved `.menu-location` below the bar.

Fix for (2): in portrait the bar is one scrollable row (`top:0`, 38px, venue chips and badge dropped; venues stay in the setup step) and `--quick-bar-space` pushes the scoreboard, serve feedback, pause and sound buttons and the canvas down by its height. On desktop the bar now ends left of the pause button (it overlapped it by 1,500 px2).

Method: `tests/browser/slamui.spec.ts` on the remote CPU runner (software WebGL2, ACR runs `slamui-2` before and `slamui-4` after), production builds from `tools/aura-slam/build-wrapper.mjs`. 0 console errors in both targets. Frames: `{before,after}-{play,menu,setup}-{1280,390}.jpg` (1280x720; 390x844 at DPR 2). Numbers: `metrics.json` (overlaps are device-px2).

| Check | Before | After |
|---|---|---|
| Desktop menu padding / h1 | 0px / 16px | 24px 50px / 56px |
| Mobile menu padding / h1 | 0px / 16px | 54px 24px 16px / 38px |
| Mobile bar vs scoreboard overlap | 32,200 | 0 |
| Mobile bar vs pause overlap | 1,444 | 0 |
| Desktop bar vs pause overlap | 1,500 | 0 |
| Horizontal scroll at 390 | none | none |

Not fixed (outside the UI lane): in portrait the court is still cropped on the left. The camera uses a fixed 15 degree vertical FOV, identical to the original and pinned by the G3 render gate, so a narrow canvas shows less width. Widening it needs a view/camera change.

Software GL only: not real-GPU evidence. No deploy was done; the live route changes at the next production deploy.
