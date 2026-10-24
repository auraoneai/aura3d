## Rendering contract (all tasks)

- Draw into the existing `<canvas id="app">` (640x360 CSS pixels, device pixel ratio 1). Do not resize it or create another canvas.
- Render continuously with `requestAnimationFrame`. When the first frame has been drawn set `window.__EVAL_READY__ = true`.
- No network access: load assets only from `/assets/...` (served from `public/assets`). Do not import from CDNs.
- Code goes in `src/` (TypeScript, strict). The entry is `src/main.ts`. It must pass `typecheck` and build with `vite build`.
- When you are done, call `finish`.
