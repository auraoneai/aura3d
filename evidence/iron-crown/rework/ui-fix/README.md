# UI fix: Iron Crown (apps/showcase-iron-crown)

Branch `game-rework`. What changed:

- The two-row panel (modes plus fighter and venue pickers) became the shared single-row bar with the modes; fighter and venue pickers moved into a 'Fighter & Venue' panel that opens under the bar, closes after a pick or Escape (`06-setup-open` frames; `SETUP_CLOSED_AFTER_PICK false` at both sizes).
- The fight HUD now sits below the bar (`top: calc(var(--a3d-bar-space) + 2px)`); on mobile the bar no longer covers a quarter of the screen.
- Element ids (`ic-modes`, `ic-fighters`, `ic-venues`) are unchanged, so the game's handlers still work.

## Shared changes
- One quick-switcher bar for all of these games: `apps/showcase-port-shared/quickbar.css` (single row, scrolls sideways, never wraps, reserves its height in `--a3d-bar-space`, opt-in centred pill on wide screens). Test: `tests/unit/quickbar/shared-quickbar.test.ts`.
- The 'AURA3D ENGINE' chip is removed from every game page; one 'Built with Aura3D' link sits at the end of the bar on desktop.

## Evidence
- `before/`: the 2026-10-24 retake (`../../screens/2026-10-24/`), `after/`: frames from the same capture specs after the change, `compare-*.jpg`: before on the left, after on the right.
- Remote run on software WebGL2 (SwiftShader, `tools/remote-acr/run.sh` ids `fixd-*`, `fixd2`, `fixd3`, `fixd4`); not real-GPU evidence. Frames were looked at by eye; there is no automated overlap metric beyond the unit test above.
