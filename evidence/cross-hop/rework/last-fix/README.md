# Cross Hop: shared quick bar

Branch `game-rework`. Remote runner (software WebGL2); spec `tests/browser/fixdl-cross-hop.spec.ts`; run `fixdl-ch`. Not real-GPU evidence.

| Measure | Result |
|---|---|
| Bar | one row, 32 px, at 1280 and 390; HUD starts at y = 48 (no overlap) |
| Buttons | Quick Play plus six world buttons (Meadow, Downtown, Riverbend, Emberline, Neon, Critter Core) |
| Credit link | "Built with Aura3D" visible at 1280, hidden on phones (shared rule) |
| Click "Neon" | starts a World Tour run in Neon District; the Neon button shows active |
| Click "Quick Play" | back to a quick run in Meadow Roads |
| Console errors | 0 |

The bar is `apps/showcase-port-shared/quickbar.css`, the same component as Pips Big Leap, Dot Dash and Thermal Drift.
Frames: `after-*.jpg` and `compare-*.jpg` (left before from `screens/final`, right after).
