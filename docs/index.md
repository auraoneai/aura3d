# Aura3D 4.0.0 Documentation Hub

Welcome to the documentation for **Aura3D 4.0.0** (`@aura3d/engine@4.0.0`, `@aura3d/cli@4.0.0`, `create-aura3d@4.0.0`)—the open-source (MIT), zero-dependency TypeScript 3D engine built for shipping web products, interactive worlds, and AI-assisted 3D workflows.

---

## Why Teams Choose Aura3D 4.0.0 Over Raw Three.js

**Stop assembling 14 Fragile npm Packages to Render a 3D Scene.**

Three.js is a legendary low-level rendering kernel—not a complete application engine. The moment you step beyond a spinning cube, raw Three.js forces your team to hand-wire `WebGLRenderer`, `PerspectiveCamera`, `OrbitControls`, `GLTFLoader`, `DRACOLoader`, `KTX2Loader`, `RGBELoader`, `EffectComposer`, `PMREMGenerator`, `Rapier3D`, `Recast`, manual resize observers, and manual `geometry.dispose()` / `material.dispose()` / `texture.dispose()` traversal loops just to keep a single route from leaking GPU memory.

**Aura3D 4.0.0 (`@aura3d/engine@4.0.0`)** replaces that fragile ~120-line assembly with **18 lines of declarative, type-safe TypeScript**:

- **[Read the full Aura3D 4.0.0 vs. Raw Three.js comparison](./aura3d-vs-threejs.md)** — 10-point architectural breakdown, side-by-side ~120-line vs. 18-line code comparison, and Three.js codemod migration workflow.
- **[Quickstart Guide](./quickstart.md)** — Scaffold a verified 3D project, admit typed assets, and run `aura3d check-deploy` in under 2 minutes.

---

## Documentation Guides

### Core Workflow

1. **[Quickstart](./quickstart.md)** — Scaffold with `npx create-aura3d@4.0.0`, boot `createAuraApp`, and inspect live routes.
2. **[Aura3D 4.0.0 vs. Raw Three.js](./aura3d-vs-threejs.md)** — Architectural comparison, code reduction, and `aura3d migrate three` AST codemods.
3. **[Agent Onboarding (`/llms.txt`)](../llms.txt)** — Machine-readable entry point for coding agents (`aura3d agent init`).

### Agent & Engine Reference (`docs/agents/`)

- **[Scene Recipes](./agents/scene-recipes.md)** — Declarative `createAuraApp` recipes for product viewers, cinematic routes, and interactive worlds.
- **[API Surface](./agents/api-surface.md)** — Complete public exports of `@aura3d/engine@4.0.0`.
- **[Asset Workflow](./agents/asset-workflow.md)** — Searching, admitting, validating, and generating typed `src/aura-assets.ts` bindings.
- **[Animation Studio Workflow](./agents/animation-studio-workflow.md)** — Skeletal clips, root motion, morph targets, look-at/aim IK, and audio-driven facial visemes.
- **[Deployment & Evidence](./agents/deployment.md)** — Pre-ship verification with `aura3d check-deploy` and `aura3d evidence`.
- **[Troubleshooting](./agents/troubleshooting.md)** — Resolving asset digest mismatches, WebGL2/WebGPU context recovery, and CI evidence gates.
