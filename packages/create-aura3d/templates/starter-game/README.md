# Aura3D small game starter

GPU-verified starter for a small game (`src/main.ts`). "Gem Grove": walk the rigged Kenney archer (CC0, `idle`/`walk` clips) around a grassy island and collect ten gems before the 45 s timer ends. WASD or arrow keys move, R restarts. Deterministic fixed-step simulation, DOM HUD, follow camera via `app.camera.setPose`, under the `outdoor-day` look.

```bash
npm install
npm run dev        # Vite on 127.0.0.1
npm run build      # typecheck + vite build
npx @aura3d/cli@latest check-deploy --dist dist
```

Change the rules in `step()`, keep simulation in `step` and node updates in `render`. Full games with pause, touch and results screens: `createGame` in `docs/agents/build-a-game.md`.

The five starters (`starter-product`, `starter-outdoor`, `starter-interior`, `starter-game`, `starter-presentation`) share one shape: a look preset first, then the subject, then the camera, then per-frame updates. Patterns: `docs/agents/first-screen.md`; signatures: `docs/agents/api-signatures.md`; more scenes: `docs/agents/recipes.md`.

Browser specs (`npm run test:browser`) run on a remote runner, not on your machine. Label this route `starter` until a judged capture supports a stronger claim.
