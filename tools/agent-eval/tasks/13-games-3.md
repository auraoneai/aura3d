Build a single-page browser app with the provided framework, served by vite, drawing into the existing canvas with id #app (640x360 CSS pixels; do not resize it or add another canvas). Make a complete small 3D endless runner where a character runs forward automatically along a single straight track and jumps over hurdles.

Rules:
1. The runner moves forward continuously (the track and scenery scroll or the camera follows). Space, ArrowUp, W, or a pointer click/tap makes it jump; it cannot jump again while airborne. Jumps follow a gravity arc.
2. Hurdles of varying heights and spacing appear ahead at random (use a seeded random generator so a given seed repeats). Colliding with a hurdle ends the run with status `lost`.
3. Distance in meters is the score. Speed increases gradually with distance. Reaching 500 m sets status `won` (the run ends).
4. The game starts in status `ready` and begins on the first jump input. R, or a jump input after the run ends, restarts at distance 0.
5. Visible scenery that conveys speed (for example track markings, side posts or trees moving past) and a clearly visible runner (a simple character built from shapes is fine).
6. A DOM HUD outside the canvas shows distance, best distance for this page session and status, plus an overlay on game over with a restart hint.
7. Expose `window.__TASK_STATE__` kept up to date with: `{ status: 'ready' | 'playing' | 'won' | 'lost', score: number, speed: number, airborne: boolean }` (score = distance in meters).
8. Render continuously with requestAnimationFrame and set `window.__TASK_READY__ = true` after the first frame is drawn. Code goes in `src/` (TypeScript, strict), entry `src/main.ts`; it must typecheck and build with `vite build`. No network access; do not load anything from CDNs. When you are done, call `finish`.
