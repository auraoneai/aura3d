# Drift & Deliver: what is (and is not) kept from the captured game

The game's code is third-party. This directory keeps **no game source**: only a census and hashes, so the port's
tests and notes can cite measured facts without republishing the code in a public repository.

- Source page: https://app.usecrayon.ai/play/54a355cc-d8e4-4d14-bab4-1b6db1618242. The game runs in a sandboxed
  `about:srcdoc` iframe; its logic is one `<script type="module" src="blob:null/...">` of 1,332,481 bytes.
- Captured by `tools/crayon-probe/capture-module.ts` (ACR Task run `cc1de`, registry `crmmeprodacr`), which records
  every Blob passed to `URL.createObjectURL` from a hook installed before any game script runs. The captured text was
  read as data only and never executed outside the browser capture.
- `census.json`: sizes and SHA-256 of the raw and image-stripped module, and a count of every three construct the
  module builds (materials, geometries, other). 19 embedded base64 JPEG surface textures (566,167 characters) make up
  42% of the module and are not kept.
- The raw module is deliberately not committed. To re-derive: run the capture recipe in
  `evidence/crayon-probes/README.md` with `--only drift-and-deliver`, compare its SHA-256 with `census.json`.

## What the port took from reading it

Facts, not code: the physics constants and update order (`zr`), the world constants (`Wt` 60, `Yt` 8.5, `Lt` 21.5,
`Ft` 450), the seeded noise formula, the district table, the park rule, the pickup generator, the chase camera rules,
and the QA hooks (`__sim`, `__tp`, `__dbg.nearSolids`). All are re-implemented in `examples/drift-and-deliver-port/`
and checked against the recorded reference in `evidence/crayon-capture/drift-and-deliver-reference.json`.
