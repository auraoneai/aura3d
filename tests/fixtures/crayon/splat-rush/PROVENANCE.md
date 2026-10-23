# Splat Rush game module (captured fixture)

UNTRUSTED DATA. Third-party game source captured from a live page. Never execute
this file; tests read it as text only.

- Source: `<script type="module" src="blob:null/...">` inside the sandboxed `about:srcdoc` iframe of https://app.usecrayon.ai/play/e53a6e07-a4a1-465e-b546-0fb6c9b787c0
- Captured: 2026-10-23T04:41:48Z by `tools/crayon-probe/capture-module.ts` (serverless ACR Task, run cc1dc, registry crmmeprodacr)
- Size: 43212 bytes (matches `moduleBytes` in `tools/crayon-probe/games.json`)
- SHA-256: cfc5248970ad5722545337dff775e4c2ffa28101fc38332823513ab2328f8ff0
- Imports: `three` (importmap, r184) and `playlabs-boot` (a `data:` module in the same importmap). Unlike Strange Orbit, the game logic is
  INLINE in this module (no separate bundle): config, state, gate/pickup logic, rendering and HUD.
- `game-module.formatted.js` is `game-module.mjs` run through prettier (derived, same tokens, no renaming).
