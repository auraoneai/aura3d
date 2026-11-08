# Aura3D product viewer starter

GPU-verified starter for a product viewer (`src/main.ts`). A typed GLB (CC-BY-4.0 sports car, JUFF via Objaverse) on a slow turntable in a dark softbox studio under the `product-studio` look. `camera.frame(product, { fill: 0.5 })` places the orbit camera from the model bounds, so a swapped product is framed without new camera numbers.

```bash
npm install
npm run dev        # Vite on 127.0.0.1
npm run build      # typecheck + vite build
npx @aura3d/cli@latest check-deploy --dist dist
```

Swap the product with `npx @aura3d/cli@latest assets resolve "<object>" --name car` (or a new name, then rename `assets.car` in `src/main.ts`). Keep the look overrides: a dark backdrop and trimmed exposure keep paint and metal from washing out.

The five starters (`starter-product`, `starter-outdoor`, `starter-interior`, `starter-game`, `starter-presentation`) share one shape: a look preset first, then the subject, then the camera, then per-frame updates. Patterns: `docs/agents/first-screen.md`; signatures: `docs/agents/api-signatures.md`; more scenes: `docs/agents/recipes.md`.

Browser specs (`npm run test:browser`) run on a remote runner, not on your machine. Label this route `starter` until a judged capture supports a stronger claim.
