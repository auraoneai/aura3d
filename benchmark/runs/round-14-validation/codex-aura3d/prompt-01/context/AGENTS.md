# Aura3D Agent Instructions

Read `llms.txt` first. Use the public Aura3D API: AI coding agents write normal
TypeScript/JavaScript against `@aura3d/engine`; Aura3D provides typed assets,
templates, diagnostics, screenshots, and deployment checks.

Do not invent assets. Run:

```bash
npx @aura3d/cli@latest assets add ./assets/model.glb --name model
```

Then import `assets` from `./src/aura-assets` and use `model(assets.model)`.
Do not use string asset ids in the safe API.
