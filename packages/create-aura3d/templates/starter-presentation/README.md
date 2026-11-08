# Aura3D animated presentation starter

GPU-verified starter for a animated presentation (`src/main.ts`). A 15 s looping keynote in three beats on one dark stage under the `night-city` look: a centred `text3D` headline rises in, a chrome sculpture spins on a glowing plinth while the camera arcs, then five data bars grow. One clock in `onFrame` drives everything through small easing helpers; `?t=7.5` freezes the clock for captures.

```bash
npm install
npm run dev        # Vite on 127.0.0.1
npm run build      # typecheck + vite build
npx @aura3d/cli@latest check-deploy --dist dist
```

Retime the beats or add new ones in the `onFrame` block; put your numbers in `BARS`.

The five starters (`starter-product`, `starter-outdoor`, `starter-interior`, `starter-game`, `starter-presentation`) share one shape: a look preset first, then the subject, then the camera, then per-frame updates. Patterns: `docs/agents/first-screen.md`; signatures: `docs/agents/api-signatures.md`; more scenes: `docs/agents/recipes.md`.

Browser specs (`npm run test:browser`) run on a remote runner, not on your machine. Label this route `starter` until a judged capture supports a stronger claim.
