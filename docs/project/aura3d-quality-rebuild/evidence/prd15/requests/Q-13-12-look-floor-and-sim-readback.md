# Q-13-12 → to:prd13 (qr-request, CONTRACTS §6.5)

**GitHub issue:** #705

**Files:** `tools/agent-docs/simulation.ts`, `tools/agent-templates/index.ts`,
`packages/create-aura3d/templates/*/tests/look-floor.ts` (all 13-owned)
**Contract served:** PRD-15 T8.2 — the restored `check:agent-docs` /
`check:templates` gates (deleted by T7's script sweep) exposed three latent
breakages in lane-13's spec helpers. All three were fixed by lane 15 as
courtesy fixes because they block the restored gates.

## 1. `look-floor.ts` (all 20 templates, byte-identical)

Two bugs in `assertTemplateLookFloor`:

- `BRIGHT_LUMA` was referenced inside `page.evaluate(...)` while declared at
  module scope — Playwright serializes the callback into the browser, so the
  reference threw `ReferenceError` on every run. Moved inside the callback.
- `gl.readPixels` after compositing reads a cleared buffer because the app's
  WebGL context is created without `preserveDrawingBuffer` (see
  `packages/rendering/src/renderer/PixelRatio.ts` §6.9 note: `capture()` reads
  the framebuffer in-task). Every pixel profile returned all-black on
  SwiftShader. The helper now profiles `canvas.screenshot()` (browser-
  composited pixels) decoded via an in-page `Image` + 2d canvas — the same
  assertions (bright fraction, unique buckets, central subject bbox,
  `__AURA3D_LIVE_APPS__` diagnostics) run unchanged.
  `subjectBounds.y` keeps the old convention (fraction from the top).

## 2. `tools/agent-docs/simulation.ts`

- The simulation overwrites `src/main.ts` with the llms.txt hello-world, so
  the template's own `route-health.spec.ts` (extended in `ed2c4b6aa` to assert
  `__AURA3D_PRODUCT_VIEWER__`, a global only the template main.ts sets) can
  never pass there. The playwright invocation now runs only the generated
  `tests/screenshot.spec.ts`; the template spec still runs via
  `check:templates` against real template main.ts.
- The generated screenshot spec's `gl.readPixels` profile had the same
  cleared-buffer bug — replaced with the same composited-screenshot profiling.
- The `@aura3d/engine` alias no longer overrides to `agent-api/index.ts`; the
  generated alias table (`vite.aliases.generated.ts`, from
  `aura.exports.json` §6.9) already carries the right target
  (`public/index.ts`) and browser conditions.

## 3. `tools/agent-templates/index.ts`

Same hardcoded override: `@aura3d/engine` aliased to
`packages/engine/src/agent-api/index.ts`, skipping `public/index.ts`'s
`import "../lanes/index.js"` side-effect — which is what registers the
`prd12.appliedLook` diagnostics section the look floor asserts on. Repointed
to `packages/engine/src/public/index.ts`.

## Follow-ups for lane 13

- The `agent-templates` alias block still hand-codes browser-condition targets
  for `@aura3d/animation` and `@aura3d/assets`; consider consuming
  `vite.aliases.generated.ts` directly so template resolution can never drift
  from `aura.exports.json` again.
