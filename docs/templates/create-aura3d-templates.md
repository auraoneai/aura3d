# create-aura3d templates

`create-aura3d` scaffolds Vite apps that use the public `@aura3d/engine` API, typed GLB/glTF assets, route health checks, screenshot contracts, and static deployment workflows.

## Starter templates

- `product-viewer`: A GLB/glTF product viewer with typed asset references, orbit camera, studio lighting, diagnostics, route health, and screenshot tests.
- `cinematic-scene`: A cinematic browser scene with camera motion, lighting, atmosphere, imported assets, and presentation-ready visual composition. Use `docs/agents/cinematic-scene-quality.md` before presenting a cinematic route as product proof.
- `mini-game`: A playable platformer-style starter for input, HUD state, route health, screenshot tests, and deployable output. It uses `game.platformer(...)`, typed asset imports, keyboard movement, jump, scoring, reset, and visible browser state tests. It is not a production-quality game or art-direction claim.
- `fighting-game`: A playable browser fighting-game starter with runtime nodes, input, combat state, HUD evidence, and route health checks.
- `animation-channel`: A prompt-driven animation episode scaffold with AuraVoice bridge metadata, shot playback, captions, visemes, render queue evidence, and typed animation asset placeholders.
- `prompt-animation-channel`: Alias-style prompt animation scaffold for episode plans, dialogue/caption timing, viseme tracks, and animation render metadata.
- `animation-studio`: A animation production scaffold with shot/dialogue/render timeline data, asset slot metadata, render pipeline evidence, and the same typed asset rules as the animation-channel template.
- `episode-builder`: A guided prompt-to-episode scaffold with format choices, wizard state, compiled episode proof, typed asset placeholders, and route tests.

## Scaffold

```bash
npx create-aura3d@latest my-app --template product-viewer
npx create-aura3d@latest my-scene --template cinematic-scene
npx create-aura3d@latest my-starter --template mini-game
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

## Mini-game status

The `mini-game` template is now a browser-tested playable starter. It is the
smallest platformer-style reference for using a source-level game kit from the
root safe API, wiring keyboard input into runtime nodes, publishing HUD/event
evidence, and proving visible behavior with Playwright.

It is still not a production reference for commercial platformer, racing,
falling-block, or action-game claims. Before calling a derived route
production-quality, add:

- primary actor/world assets registered through the CLI and used as
  `model(assets.x)` where the game claims real characters, vehicles, products,
  or environments;
- keyboard input tests for every claimed mechanic, not only movement and reset;
- restart/reset tests;
- scoring, fail, completion, or loop tests that match the route's actual
  objective;
- desktop and mobile screenshots with readable main subject;
- route-health/evidence output naming renderer backend, fallback state, primary
  assets, primitive count, and claims;
- source checks that block raw asset strings, GLB URLs, `three`, `GLTFLoader`,
  and primitive-only primary subjects.

## Held-back templates

Additional template ideas stay in `archive/held-back-create-aura3d-templates/` until they have documentation, tests, scaffold smoke coverage, package manifest support, and the same production-grade route evidence as the active starter templates.
