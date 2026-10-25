# UI fix: Thermal Drift (apps/showcase-heatsink)

Branch `game-rework`. What changed:

- The top command bar (overlapping the position and time block on desktop, and docked at the bottom over the speedometer on phones) is now the shared strip at the top; the HUD starts below it.
- Phone HUD: the radar shrinks, the telemetry card hides, the chip row wraps, the bottom-left item and ability pills wrap, and the speed panel scales (`08-phone-hud`).

## Shared changes
- One quick-switcher bar for all of these games: `apps/showcase-port-shared/quickbar.css` (single row, scrolls sideways, never wraps, reserves its height in `--a3d-bar-space`, opt-in centred pill on wide screens). Test: `tests/unit/quickbar/shared-quickbar.test.ts`.
- The 'AURA3D ENGINE' chip is removed from every game page; one 'Built with Aura3D' link sits at the end of the bar on desktop.

## Evidence
- `before/`: the 2026-10-24 retake (`../../screens/2026-10-24/`), `after/`: frames from the same capture specs after the change, `compare-*.jpg`: before on the left, after on the right.
- Remote run on software WebGL2 (SwiftShader, `tools/remote-acr/run.sh` ids `fixd-*`, `fixd2`, `fixd3`, `fixd4`); not real-GPU evidence. Frames were looked at by eye; there is no automated overlap metric beyond the unit test above.
