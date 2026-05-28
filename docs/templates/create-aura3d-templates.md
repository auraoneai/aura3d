# create-aura3d Templates

Starter templates:

- `product-viewer`
- `cinematic-scene`
- `mini-game`

Scaffold:

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

Additional template ideas are held in `archive/held-back-create-aura3d-templates/`
until they have the same docs, tests, scaffold smoke coverage, and package
manifest support as the active starter templates.
