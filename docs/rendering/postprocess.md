# Renderer Postprocess

Postprocess support exists in lower-level rendering packages and selected
runtime paths, but public root examples must distinguish requested effects from
pixel-backed passes.

## Public Root Boundary

`effects.bloom(...)`, ambient/contact occlusion nodes, fog, and renderer
diagnostics can describe postprocess intent in a root `createAuraApp` scene.
That is not enough to claim a pixel-backed postprocess stack. A root route can
claim a rendered postprocess effect only when:

- the route imports only `@aura3d/engine`;
- `createAuraApp(...).diagnostics()` after mount reports a pixel-backed pass
  status for the requested effect;
- before/after screenshots or mode-change screenshots show pixel differences
  caused by the pass;
- evidence records the backend and any fallback state.

## Lower-Level Package Surface

`@aura3d/rendering` contains postprocess/composer classes and production-runtime
passes such as bloom, FXAA-facing paths, SSAO, depth of field, color grading,
and related render-target helpers. Those are package-level capabilities until
they are proven through the public root app path.

## Verification

Useful focused package checks:

```sh
pnpm exec vitest run tests/unit/rendering/postprocess-composer.test.ts tests/unit/rendering/renderer-postprocess-plan.test.ts
```

Package tests do not replace browser screenshots for public showcase claims.
Each postprocess claim needs a named pass, route, test/report, and generated
image evidence.
