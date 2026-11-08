# Aura3D interior scene starter

GPU-verified starter for a interior scene (`src/main.ts`). A furnished living room under the `interior-warm` look: walls, ceiling and a window as layout, furniture in the named surface materials (`fabric`, `lacquer`, `brushedMetal`, `ceramic`, `felt`, `glass`), an instanced bookshelf, and a floor lamp with a real point light that casts shadows.

```bash
npm install
npm run dev        # Vite on 127.0.0.1
npm run build      # typecheck + vite build
npx @aura3d/cli@latest check-deploy --dist dist
```

Move or restyle the pieces; keep the look, the lamp light and the camera. For real props run `npx @aura3d/cli@latest assets resolve "<object>"` and place `model(assets.x)`.

The five starters (`starter-product`, `starter-outdoor`, `starter-interior`, `starter-game`, `starter-presentation`) share one shape: a look preset first, then the subject, then the camera, then per-frame updates. Patterns: `docs/agents/first-screen.md`; signatures: `docs/agents/api-signatures.md`; more scenes: `docs/agents/recipes.md`.

Browser specs (`npm run test:browser`) run on a remote runner, not on your machine. Label this route `starter` until a judged capture supports a stronger claim.
