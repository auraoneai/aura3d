# create-aura3d templates

`create-aura3d` scaffolds Vite apps that use the public `@aura3d/engine` API, typed GLB/glTF assets, route health checks, screenshot contracts, and static deployment workflows.

## Starter templates

- `product-viewer`: A GLB/glTF product viewer with typed asset references, orbit camera, studio lighting, diagnostics, route health, and screenshot tests.
- `cinematic-scene`: A cinematic browser scene with camera motion, lighting, atmosphere, imported assets, and presentation-ready visual composition. Use `docs/agents/cinematic-scene-quality.md` before presenting a cinematic route as product proof.
- `mini-game`: An interactive browser game starter for input, HUD state, primitives, follow-camera behavior, scoring, route health, screenshot tests, and deployable output.
- `fighting-game`: A playable browser fighting-game starter with runtime nodes, input, combat state, HUD evidence, and route health checks.
- `animation-channel`: A prompt-driven animation episode scaffold with AuraVoice bridge metadata, shot playback, captions, visemes, render queue evidence, and typed animation asset placeholders.
- `prompt-animation-channel`: Alias-style prompt animation scaffold for episode plans, dialogue/caption timing, viseme tracks, and animation render metadata.
- `animation-studio`: A animation production scaffold with shot/dialogue/render timeline data, asset slot metadata, render pipeline evidence, and the same typed asset rules as the animation-channel template.
- `episode-builder`: A guided prompt-to-episode scaffold with format choices, wizard state, compiled episode proof, typed asset placeholders, and route tests.

## Scaffold

```bash
npx create-aura3d@latest my-app --template product-viewer
npx create-aura3d@latest my-studio --template animation-studio
npx create-aura3d@latest my-episode --template episode-builder
```

Every active template includes:

- `npm run dev`
- `npm run build`
- `npm run test`
- `tests/route-health.spec.ts`
- a route-specific screenshot or storyboard playback spec;
- typed asset guidance;
- public `@aura3d/engine` imports only;
- a README for humans and AI coding agents.

## Mini-game quality target

The World War X showcase is the production reference for the `mini-game` direction. It demonstrates how a browser-native Aura3D game can combine:

- a 10-fighter roster;
- generated GLB fighter assets;
- typed asset members from `src/aura-assets.ts`;
- `model(assets.x)` runtime usage;
- primitives, materials, lighting, effects, and camera composition;
- arcade physics, hitboxes, projectiles, guard state, meter, and results;
- Summit Remix prompt presets;
- route evidence, accessibility settings, poster capture, and Playwright contracts;
- marketing integration through a poster-first homepage section.

Use World War X as the documentation bar for future game templates: production copy, inspectable TypeScript, typed assets, evidence routes, screenshot states, and static-deploy readiness.

## Held-back templates

Additional template ideas stay in `archive/held-back-create-aura3d-templates/` until they have documentation, tests, scaffold smoke coverage, package manifest support, and the same production-grade route evidence as the active starter templates.
