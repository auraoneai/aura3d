# Last Train to the Sea (captured fixture)

UNTRUSTED DATA. Third-party game source captured from a live page. Never execute it; tests read it as text only.

- Source: the `<script type="module" src="blob:null/...">` inside the sandboxed `about:srcdoc` iframe of
  https://app.usecrayon.ai/play/bda1b910-b840-48cb-bb4c-28d0cde29107
- Captured: 2026-10-23T04:42:35Z by `tools/crayon-probe/capture-module.ts` (serverless ACR Task, run cc1dd, registry crmmeprodacr)
- Module: one 1,391,256-character bundle (1,391,655 bytes) with three r184 inlined and the game's own `src/*` modules kept
  as `Ys({ "src/...js"() {...} })` wrappers (111 of them). SHA-256 of the captured text:
  `62fb7ac520225cc3c3e5799c7b17147475f8f20e4f7c04718721fcf46ac928ca`.
- The full module is NOT stored in the repository. `game-sim.extract.js` holds only the simulation-core regions the port was
  written from (route helpers, boarding timing, economy/state machine incl. `GM` and `WM`), pretty-printed with esbuild;
  identifiers remain minified.
- The reference data (`evidence/crayon-capture/last-train-reference.json`) was produced by patching the module text in the
  browser (`tools/crayon-capture/last-train-lib.ts`) so its own pure functions could be stepped headlessly; the route and
  passenger tables in that file are measurements taken from those functions.
