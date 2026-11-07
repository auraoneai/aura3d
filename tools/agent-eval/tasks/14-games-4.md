Build a single-page browser app with the provided framework, served by vite, drawing into the existing canvas with id #app (640x360 CSS pixels; do not resize it or add another canvas). Make a complete small 3D pointer-driven reaction game.

Rules:
1. A 3 by 3 grid of holes or pedestals is shown in the scene. Every so often one glowing lantern (or another simple object of your choice) pops up from a random cell, stays visible for a short time that gets shorter as the score rises, then drops back down.
2. Clicking or tapping a raised lantern pops it: +10 points, with a visible burst or flash. Clicking an empty cell or a lantern that is already lowered costs 5 points (score never goes below 0) and gives visible feedback. A hover highlight shows which cell the pointer is over.
3. Occasionally a different colored bomb object appears instead; clicking it ends the run with status `lost`. Letting a normal lantern drop without popping it does not cost lives.
4. The round lasts 45 seconds. When the timer reaches 0 the status is `won` if the score is at least 150, otherwise `lost`. The game starts in status `ready` and begins on the first click on a Start button or the Enter key.
5. R, or a Restart button shown on the end overlay, begins a new round (score 0, timer 45, status `playing`). Use a seeded random generator so a seed repeats the spawn order.
6. A DOM HUD outside the canvas shows score, time left and status, and an overlay on round end.
7. Expose `window.__TASK_STATE__` kept up to date with: `{ status: 'ready' | 'playing' | 'won' | 'lost', score: number, timeLeft: number, activeCells: number[] }` (cell indices 0-8 currently raised).
8. Render continuously with requestAnimationFrame and set `window.__TASK_READY__ = true` after the first frame is drawn. Code goes in `src/` (TypeScript, strict), entry `src/main.ts`; it must typecheck and build with `vite build`. No network access; do not load anything from CDNs. When you are done, call `finish`.
