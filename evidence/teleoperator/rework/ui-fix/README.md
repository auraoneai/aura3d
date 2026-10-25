# UI fix: Grid Dispatch / Teleoperator (apps/showcase-teleoperator)

Branch `game-rework`. What changed:

- Phone layout: the district card, fare total, menu chips, trip cards and speed dial stack instead of overlapping; the dial scales to 70%; the minimap hides.
- The fleet, camera and sky dock collapses into one 'Fleet · Cam · Sky' chip; opened it shows two sideways-scrolling rows above the dial (`07-dock-open`).
- The loading text no longer says 'AURA3D' and the page title no longer carries 'Aura3D 4.0.2'.

## Shared changes
- One quick-switcher bar for all of these games: `apps/showcase-port-shared/quickbar.css` (single row, scrolls sideways, never wraps, reserves its height in `--a3d-bar-space`, opt-in centred pill on wide screens). Test: `tests/unit/quickbar/shared-quickbar.test.ts`.
- The 'AURA3D ENGINE' chip is removed from every game page; one 'Built with Aura3D' link sits at the end of the bar on desktop.

## Evidence
- `before/`: the 2026-10-24 retake (`../../screens/2026-10-24/`), `after/`: frames from the same capture specs after the change, `compare-*.jpg`: before on the left, after on the right.
- Remote run on software WebGL2 (SwiftShader, `tools/remote-acr/run.sh` ids `fixd-*`, `fixd2`, `fixd3`, `fixd4`); not real-GPU evidence. Frames were looked at by eye; there is no automated overlap metric beyond the unit test above.
