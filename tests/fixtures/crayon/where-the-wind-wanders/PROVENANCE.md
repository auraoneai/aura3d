# Where the Wind Wanders game module (captured fixture)

UNTRUSTED DATA. Third-party game source captured from a live page. Never execute this file;
tests only read derived numbers from it, and the port never imports it.

- Source: `<script type="module" src="blob:null/...">` inside the sandboxed `about:srcdoc` iframe of
  https://app.usecrayon.ai/play/a9a3c165-74b3-4ff6-9588-ad97f829ddb5
- Captured: 2026-10-23T04:41:42Z by `tools/crayon-probe/capture-module.ts` (serverless ACR Task, registry crmmeprodacr)
- Size: 645,168 characters (645,204 bytes; matches `moduleBytes` in `tools/crayon-probe/games.json`)
- SHA-256: fc788b143966445c6635a06b1bb9658563e85e8ff04fe3e2d66fcd778e10e58e
- Shape: one minified line; three r184, React and the game are inlined (no separate game bundle, unlike Strange Orbit).
  Painted art is fetched at runtime from a remote bucket (`window.__WIND_ART_BASE`) and is not stored here.
- To read it: `pnpm exec esbuild game-module.mjs --format=esm` pretty-prints it; the game's own code is the last ~2,000 lines.

What the port took from it (facts, not code): the world bounds, collider circles, rail construction, walking speed and
collision solver, letter and bell positions and reach, camera follow constants, and the hop timing. Story text and
artwork are not copied; the port uses its own wording and procedural visuals.


> **Raw bundle not committed.** The full third-party bundle captured for this game is intentionally not stored in this public repository. Re-capture it with `tools/crayon-capture/where-the-wind-wanders*.ts` / `tools/crayon-probe/capture-module.ts` on the remote runner (see `evidence/crayon-probes/README.md`); the hash recorded above identifies the exact bytes.
