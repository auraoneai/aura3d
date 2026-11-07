Build a single-page browser app with the provided framework, served by vite, drawing into the existing canvas with id #app (640x360 CSS pixels; do not resize it or add another canvas). Make a complete small 3D breakout game.

Rules:
1. A paddle sits at the bottom of the play field and moves left and right with the Left/Right arrow keys or A/D. A ball bounces off the walls, the ceiling, the paddle and the bricks. The paddle changes the ball's horizontal direction depending on where it is hit.
2. At least 5 columns by 4 rows of bricks. Each row has a different color. A hit removes the brick and adds points (top rows are worth more).
3. The player has 3 lives. If the ball falls below the paddle a life is lost and the ball is re-served from the paddle on Space. At 0 lives the status becomes `lost`. Clearing every brick sets the status to `won`.
4. Space serves the ball. R restarts from a fresh board at any time (score 0, 3 lives, all bricks, status `ready`).
5. A DOM HUD outside the canvas shows score, lives and status, and a visible overlay appears on win or loss with a restart hint.
6. Expose `window.__TASK_STATE__` as a getter or an object kept up to date with: `{ status: 'ready' | 'playing' | 'won' | 'lost', score: number, lives: number, bricksLeft: number }`.
7. Render continuously with requestAnimationFrame and set `window.__TASK_READY__ = true` after the first frame is drawn. Code goes in `src/` (TypeScript, strict), entry `src/main.ts`; it must typecheck and build with `vite build`. No network access; do not load anything from CDNs. When you are done, call `finish`.
