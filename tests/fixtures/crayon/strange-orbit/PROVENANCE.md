# Strange Orbit game module (captured fixture)

UNTRUSTED DATA. Third-party game source captured from a live page. Never execute
this file; the codemod tests read it as text only.

- Source: `<script type="module" src="blob:null/...">` inside the sandboxed `about:srcdoc` iframe of https://app.usecrayon.ai/play/47df78e2-1410-45d1-833c-196e1161c0b8
- Captured: 2026-10-22T19:08:37.218Z by `tools/crayon-probe/capture-module.ts` (serverless ACR Task, run cc1ap, registry crmmeprodacr)
- Size: 19300 bytes (matches `moduleBytes` in `tools/crayon-probe/games.json`)
- SHA-256: 1fe6c7c2d7ce0bc23abca4742cfee158b90be87bf2da777ccec44b07b4e4cade
- Importmap (from the same frame): three 0.184.0, `three/addons/`, `@dimforge/rapier3d-compat` 0.12.0, and a `playlabs-boot` data: module

## The game logic is NOT in the 19 KB module

`game-module.mjs` is only the bootstrap shell (title, CSS, `#app`); it ends with
`await import(".../releases/20260912-synthwave-v1/runtime/game.js")`. The three.js game
code lives in that 864,545-byte Rolldown bundle (three r184 + addons + the game's own `src/*`
regions, identifiers minified). It is not stored here.

- Fetched: 2026-10-22, `curl` (public S3 object, `Cache-Control: public,max-age=31536000,immutable`)
- Size / SHA-256: 864545 bytes / 7d99cfeddc9696e97b7c9174de0e20a8a36ea96d1076bff19ede385b0459d293
- Matches the object's own `x-amz-meta-sha256` header: 7d99cfeddc9696e97b7c9174de0e20a8a36ea96d1076bff19ede385b0459d293
- Derived fixtures (by `demangle.mjs`; re-run with `node demangle.mjs <game.js> .`):
  - `game-logic.demangled.js`: only the game's own `src/*` regions, minified three class ids rewritten to `THREE.<Name>`
  - `census.json`: independent count of every three construct the game constructs, and the unresolved `new` ids
