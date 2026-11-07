Build a single-page browser app with the provided framework, served by vite, drawing into the existing canvas with id #app (640x360 CSS pixels; do not resize it or add another canvas). Make a complete small 3D tower-stacking game.

Rules:
1. A flat slab slides back and forth horizontally above the top of a growing tower of slabs. Pressing Space, or clicking/tapping the canvas, drops it onto the tower.
2. Only the part of the slab that overlaps the slab beneath it stays; the overhanging part is cut off and falls away visibly. The next slab is the width of the remaining part and slides a little faster every few levels.
3. A perfect drop (within a small tolerance) keeps the full width and gives a bonus. Score is the number of slabs successfully stacked plus bonuses.
4. If a slab misses the tower entirely, the status becomes `lost`. Reaching 25 stacked slabs sets the status `won`.
5. The camera rises with the tower so the top stays in view. Slab colors change gradually from level to level.
6. R, or a click on the canvas after the game ends, restarts with a fresh base slab (score 0, status `playing`).
7. A DOM HUD outside the canvas shows score, best score for this page session and status.
8. Expose `window.__TASK_STATE__` kept up to date with: `{ status: 'playing' | 'won' | 'lost', score: number, height: number }` where height is the number of stacked slabs.
9. Render continuously with requestAnimationFrame and set `window.__TASK_READY__ = true` after the first frame is drawn. Code goes in `src/` (TypeScript, strict), entry `src/main.ts`; it must typecheck and build with `vite build`. No network access; do not load anything from CDNs. When you are done, call `finish`.
