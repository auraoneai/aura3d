# Getting Started

Version: `1.0.0`

Aura3D, or A3D, is a production TypeScript-first browser 3D engine and workflow SDK. The current repo includes public package exports, WebGL2 renderer paths, WebGPU backend coverage, asset loading, animation/skinning, scene/runtime APIs, editor-runtime primitives, migration helpers, app routes, and V10 verification reports showing parity or better results against Three.js in the measured categories.

## Prerequisites

- Node.js compatible with the repo toolchain.
- `pnpm`.
- A browser with WebGL2 for the main route set.
- Optional WebGPU-capable browser/device for WebGPU proof routes.

## Install The Repo

```sh
pnpm install
```

## Start Local Apps

```sh
pnpm dev
```

Open:

```text
http://127.0.0.1:5180/
```

Useful current routes include:

- `/apps/flagship-viewer/`
- `/apps/animation-keyframes/`
- `/apps/animation-multiple/`
- `/apps/skinning-blending/`
- `/apps/skinning-additive/`
- `/apps/skinning-ik/`
- `/apps/skinning-morph/`
- `/apps/decals/`
- `/apps/physics-showcase/`
- `/apps/interactive-picking/`
- `/apps/postprocessing-bloom/`
- `/apps/postprocessing-depth-outline/`
- `/apps/instancing-performance/`
- `/apps/loader-compression/`
- `/apps/loader-material-extensions/`
- `/apps/loader-gltf-variants/`
- `/apps/webgpu-rtt/`
- `/apps/webgpu-compute/`
- `/apps/webgpu-materials/`
- `/apps/public-scene/`

Routes are evidence and diagnostics surfaces. A route loading correctly proves that route and its scoped behavior, and the V10 reports aggregate those route results into the published parity/exceeds decisions.

## Use The Package API

For a high-level browser app:

```ts
import { createA3DApp } from "@aura3d/engine";

const app = await createA3DApp({
  canvas,
  quality: "balanced"
});

await app.renderWorkflow("scene-showcase", { preset: "gallery" });
console.log(app.diagnostics());
await app.dispose();
```

For direct advanced rendering:

```ts
import { A3DRenderer, A3DScene } from "@aura3d/engine/advanced-runtime";
import { Geometry, PBRMaterial } from "@aura3d/engine/rendering";

const renderer = await A3DRenderer.create({ backend: "webgl2", canvas });
const scene = new A3DScene();

scene.addGeometry("cube", Geometry.box());
scene.addMaterial("paint", new PBRMaterial({ baseColor: [0.8, 0.7, 0.55, 1] }));
scene.createRenderableMesh({ geometry: "cube", material: "paint" });

renderer.render(scene);
renderer.dispose();
```

For asset-backed scenes:

```ts
import { createRenderableScene, loadRenderableAsset } from "@aura3d/engine/assets";
import { A3DRenderer } from "@aura3d/engine/advanced-runtime";

const renderer = await A3DRenderer.create({ backend: "webgl2", canvas });
const asset = await loadRenderableAsset("/fixtures/engine-readiness/canonical-product-scene.json");
const scene = await createRenderableScene(asset, {
  camera: "auto-frame",
  lighting: "studio-product",
  shadows: true,
  postprocess: "product-default"
});

renderer.render(scene.source, scene.camera);
```

## Scaffold A Template

Programmatic scaffolding is available through:

```ts
import { createA3DProject } from "@aura3d/engine/create-aura3d";

createA3DProject({
  targetDir: "my-a3d-app",
  template: "production-product-viewer"
});
```

Template docs live at `docs/templates/create-aura3d-templates.md`.

## Learn The Package Surface

- API overview: `docs/api/readme.md`
- Generated public exports: `docs/api/public-api.md`
- App API: `docs/api/app-api.md`
- Rendering concept: `docs/concepts/rendering.md`
- Asset concept: `docs/concepts/assets.md`
- Animation concept: `docs/concepts/animation.md`
- Migration from Three.js: `docs/project/migration.md`

## Verify Locally

Core checks:

```sh
pnpm typecheck
pnpm test:unit
pnpm build
```

Browser and docs checks:

```sh
pnpm test:browser
pnpm verify:api-docs
pnpm verify:templates
pnpm verify:claims
```

Current V8/V9 sweeps:

```sh
pnpm v8
pnpm v9
```

These commands can be expensive. For focused work, run the narrower script that matches the package or route you changed.

## Claim Evidence

Approved description:

> A3D is a production TypeScript-first browser 3D engine and workflow SDK that matches or exceeds Three.js across the measured graphics, animation, asset, physics, performance, and developer-workflow categories documented by the A3D superiority audit.

Use `tests/reports/v10/claim-defense.json`, `tests/reports/v10/superiority-audit.json`, `docs/project/v10-superiority-status.md`, and `docs/project/competitive-positioning.md` before writing public claims.
