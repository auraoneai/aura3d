# V5 Postprocess Migration

> Historical note: This V5 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


Three.js `EffectComposer` style:

```ts
import { EffectComposerCompat, RenderPassCompat, UnrealBloomPassCompat, SSAOPassCompat, FXAAPassCompat } from "@galileo3d/three-compat";

const composer = new EffectComposerCompat();
composer
  .addPass(new RenderPassCompat())
  .addPass(new SSAOPassCompat())
  .addPass(new UnrealBloomPassCompat())
  .addPass(new FXAAPassCompat());
```

Native V5 rendering exposes the same chain through `@galileo3d/rendering`.
