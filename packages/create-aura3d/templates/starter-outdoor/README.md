# Aura3D outdoor scene starter

GPU-verified starter for a outdoor scene (`src/main.ts`). A valley with a winding lake at golden hour: one heightfield mesh coloured by height, a glossy water plane, about 140 instanced typed trees and rocks (Kenney Mini Forest, CC0) seated on the terrain, under the `golden-hour` look with its fog trimmed for a 90 m scene.

```bash
npm install
npm run dev        # Vite on 127.0.0.1
npm run build      # typecheck + vite build
npx @aura3d/cli@latest check-deploy --dist dist
```

Change `height()`, the `shade()` palette and the scatter rules. Keep `fogDensityScale` low at this scale: the look's fog is tuned for kilometre views and turns a small valley into orange haze.

The five starters (`starter-product`, `starter-outdoor`, `starter-interior`, `starter-game`, `starter-presentation`) share one shape: a look preset first, then the subject, then the camera, then per-frame updates. Patterns: `docs/agents/first-screen.md`; signatures: `docs/agents/api-signatures.md`; more scenes: `docs/agents/recipes.md`.

Browser specs (`npm run test:browser`) run on a remote runner, not on your machine. Label this route `starter` until a judged capture supports a stronger claim.
