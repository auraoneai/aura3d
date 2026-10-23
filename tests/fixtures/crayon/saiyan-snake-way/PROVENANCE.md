# Saiyan Snake Way game module (captured fixture)

UNTRUSTED DATA. Third-party game source captured from a live page. Never execute
this file; tests and the porting work read it as text only.

- Source: `<script type="module" src="blob:null/...">` inside the sandboxed `about:srcdoc` iframe of https://app.usecrayon.ai/play/8cbeaf74-b632-4cfb-aec0-ee26ff75d6d6
- Captured: 2026-10-23 by `tools/crayon-probe/capture-module.ts` (serverless ACR Task, run cc1df, registry crmmeprodacr)
- Size:   513393 bytes (matches `moduleBytes` 513393 in `tools/crayon-probe/games.json`)
- SHA-256: 2f389ab3a0bdbc597229825344dc758631c1bc8b7f56b08bfe8cb4704623bc44
- Shape: one self-contained minified module (three r184 comes from the importmap: `import*as A from"three"`, GLTFLoader and SkeletonUtils from `three/addons/`). Unlike Strange Orbit there is no second bundle.
- QA hooks: the page's inline script makes `window.__TEST` a no-op unless `window.__HARNESS` is set before boot; with it set the module exposes `window.__TEST` (status, sim, tap, run, goto, ...) and `window.__START`.


> **Raw bundle not committed.** The full third-party bundle captured for this game is intentionally not stored in this public repository. Re-capture it with `tools/crayon-capture/saiyan-snake-way*.ts` / `tools/crayon-probe/capture-module.ts` on the remote runner (see `evidence/crayon-probes/README.md`); the hash recorded above identifies the exact bytes.
