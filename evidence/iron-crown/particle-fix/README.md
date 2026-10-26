# Iron Crown particle bubbles: before and after

Software WebGL2 on the remote runner, 1280x720, autopilot bout with hits. Before: production 4.3.0 (`before-4.3.0-dpr1.jpg`), a stream of large gold orbs over the throne. After: this checkout (`after-dpr1.jpg`), a few small sparks at the hit point.

Root cause: `app.effects.spawn("kind")` started a continuous emitter, and `spawn` and `burst` dropped the preset's life, size and spread, so each effect lived 1.2 to 2.4 s as a 5 to 14 cm glow disc. Fixed in `packages/engine/src/agent-api/vfx/effects-api.ts`; unit test `tests/qr/prd07/unit/preset-lifetime.test.ts` (5 of 6 cases fail without the fix). The code was unchanged from v4.1.3 to v4.3.0, so this is not a 4.2.0 or 4.3.0 regression. It reproduces at devicePixelRatio 1.

DPR 2 and the FC frames were still running when this was written (`tests/browser/partfix*.spec.ts`).
