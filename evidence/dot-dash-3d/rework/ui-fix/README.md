# UI fix: Dot Dash 3D (apps/showcase-dot-dash-3d)

Branch `game-rework`. What changed:

- Desktop: all controls fit one row. Mobile: the 4-row bar is one scrolling row.
- Mobile HUD: the chip stack flattened into two compact rows and the objective is a single ellipsised line, so the maze is no longer covered.

## Shared changes
- One quick-switcher bar for all of these games: `apps/showcase-port-shared/quickbar.css` (single row, scrolls sideways, never wraps, reserves its height in `--a3d-bar-space`, opt-in centred pill on wide screens). Test: `tests/unit/quickbar/shared-quickbar.test.ts`.
- The 'AURA3D ENGINE' chip is removed from every game page; one 'Built with Aura3D' link sits at the end of the bar on desktop.

## Evidence
- `before/`: the 2026-10-24 retake (`../../screens/2026-10-24/`), `after/`: frames from the same capture specs after the change, `compare-*.jpg`: before on the left, after on the right.
- Remote run on software WebGL2 (SwiftShader, `tools/remote-acr/run.sh` ids `fixd-*`, `fixd2`, `fixd3`, `fixd4`); not real-GPU evidence. Frames were looked at by eye; there is no automated overlap metric beyond the unit test above.
