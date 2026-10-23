# Kid Goku: Beyond the Clouds (captured fixtures)

UNTRUSTED DATA. Third-party game source captured from a live page. Never execute these files; the tests read them as text only.

- Page: https://app.usecrayon.ai/play/3a9001a5-28fa-4ae0-ba5c-3b068d1912a4 ("Unofficial fan game")
- Captured 2026-10-23 with `tools/crayon-probe/capture-module.ts` (serverless ACR Task `cc1fd`, registry crmmeprodacr)
- `blob-0.mjs` (13,619 chars), `blob-1.mjs`, `blob-2.mjs`: the `blob:null/...` module scripts in the `about:srcdoc` frame (bootstrap shell, a seeded worker, a procedural audio worker)
- `importmap.json` (117,479 chars): three 0.184.0, `three/addons/`, rapier3d-compat 0.12.0, and four `playlabs-*` data: modules
- `inline-1.js`..`inline-3.js`: tiny inline scripts
- `game.js`: the runtime bundle `assets/index-DhF_BuDt.js` from the public S3 release path named in `blob-0.mjs`
  (`.../releases/20261022-compact-ui-v3/`). Served gzip-encoded: fetched with `curl --compressed`.
  Size 1,278,835 bytes decompressed; SHA-256 `ddc83300ba064611a4ef7782ecf668d22b7724b0f8e99e4d8df9b47b159d57ae`, equal to the object's own `x-amz-meta-sha256`.
- `hdr.txt`: the response headers of that fetch
- `obstacles.json`: the original's own obstacle layout read from `window.__LAB__.world.obstacles` at the title screen (ACR obstacles-only session)

Derived: the chapter data and run simulation were transcribed by hand into `examples/kid-goku-beyond-the-clouds-port/` after reading a
pretty-printed copy of the bundle (not stored).


> **Raw bundle not committed.** The full third-party bundle captured for this game is intentionally not stored in this public repository. Re-capture it with `tools/crayon-capture/kid-goku-beyond-the-clouds*.ts` / `tools/crayon-probe/capture-module.ts` on the remote runner (see `evidence/crayon-probes/README.md`); the hash recorded above identifies the exact bytes.
