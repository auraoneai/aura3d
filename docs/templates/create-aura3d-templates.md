# create-aura3d Templates

Vite 3D templates for AI coding agents, browser 3D apps, GLB/glTF product viewers, cinematic WebGL scenes, interactive mini-games, route health tests, screenshot tests, and static deployment checks.

## Starter templates

- `product-viewer`: 3D product viewer template for a user-provided GLB/glTF asset, orbit camera, studio lighting, diagnostics, route health, and screenshot tests.
- `cinematic-scene`: cinematic WebGL scene template for camera motion, lights, atmosphere, imported assets, and realtime previs-style browser scenes. Use `docs/agents/cinematic-scene-quality.md` before presenting a cinematic route as product proof.
- `mini-game`: interactive browser mini-game template for primitives, follow-camera behavior, score/HUD state, route health, and deployable output.

## Scaffold

```bash
npx create-aura3d@latest my-app --template product-viewer
```

Each template includes:

- `npm run dev`
- `npm run build`
- `npm run test`
- `tests/route-health.spec.ts`
- `tests/screenshot.spec.ts`
- `README.md` for humans and agents
- public `@aura3d/engine` imports only

Additional template ideas are held in `archive/held-back-create-aura3d-templates/` until they have the same docs, tests, scaffold smoke coverage, and package manifest support as the active starter templates.
