# Silt & Signal captured game code (fixtures)

UNTRUSTED DATA. Third-party game source captured from a live page. Never execute these files; the tools here
only read them as text (`extract.mjs` parses them with the TypeScript AST and evaluates only literals and two
data helpers with its own interpreter).

- Source: the about:srcdoc game iframe of https://app.usecrayon.ai/play/b42413e5-669e-4fb3-87d3-a3285567736c
  (release `20261002-canonical-4b-homecoming-v21`)
- Captured: 2026-10-23 by `tools/crayon-probe/capture-module.ts` (serverless ACR Task, run `cc1dh`, registry `crmmeprodacr`).
  The hook records every Blob passed to `URL.createObjectURL`; the textual blobs are the two modules below.

## What is stored here

| File | What | Size | SHA-256 |
| --- | --- | --- | --- |
| `game-shell.mjs` | the bootstrap module (loader CSS, asset base URL, `import(base + "boot.js?run=...")`) | 32,882 bytes | `8d126c0213dbad2db2a446f935fbf1f515ab6334e096c56915b505252aa5b647` |
| `chapters.json` | the seven chapters' objective data (`Mt`, plus the start states `yo`/`ym`), extracted by `extract.mjs` | generated | derived |
| `logic-extract.js` | text excerpts of the minified gameplay functions the port is derived from (`Eo`, `e0`, `Mx`, `zn`, `zi`, `$T`, `uc`, `_o`, `jn`, `wo`, `E0`) | generated | derived |
| `extract.mjs` | the extractor | | |

## What is NOT stored

The 1,053,594-byte game bundle (the second textual blob; three r184 inlined with minified identifiers, plus the
game's own code and level data; SHA-256 `261aca2c02cedd00e2c70bdc03247a2c550a595c84151903aabdadaad777cc93`) is not
committed. Re-capture it with the same tool and run
`node extract.mjs <bundle.js> tests/fixtures/crayon/silt-and-signal` to regenerate `chapters.json` and `logic-extract.js`.
The six GLB models (1.5 to 8 MB) and 22 images seen as blobs were not read.

## Hooks the original exposes

The game defines `window.silt = { inspect(), qa? }`: `inspect()` returns the live state (`Z`: chapter, objective, point, hold,
x/y/z/yaw, ...), the flight state (`rn`), the current target and objective, and the clock; `silt.qa` (`chapter`, `pose`, `scene`,
`physicalWorld`, ...) exists only when the frame's `location.search` has `qa`. A srcdoc frame has an empty search string, so the
reference capture patches `URLSearchParams` before the game runs (`tools/crayon-capture/silt-and-signal-lib.ts` `HOOK_SOURCE`).
