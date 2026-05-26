# create-aura3d Templates

Version: `0.1.0-alpha.0`

The local `create-aura3d` package scaffolds starter Vite projects that consume public `@aura3d/engine` APIs. Templates are proof paths for package consumption and workflow ergonomics, not production product guarantees.

## Available Templates

The current template API supports:

| Template | Intent |
|---|---|
| `external-parity-product-viewer` | Product-viewer proof using the high-level app/workflow API. |
| `external-parity-material-studio` | Material review starter. |
| `external-parity-asset-gallery` | Asset gallery starter. |
| `external-parity-interactive-scene` | Interaction and picking starter. |
| `production-product-viewer` | Product viewer with V6 renderer/workflow defaults. |
| `production-product-configurator` | Product variant/configurator starter. |
| `production-asset-inspector` | Asset inspection starter. |
| `production-material-studio` | Material studio starter. |
| `production-architecture-viewer` | Architecture/interior viewer starter. |
| `production-webgpu-starter` | WebGPU-oriented starter with fallback boundaries. |

There are also V5 template directories in the repo used by verification and legacy migration evidence. The public scaffolding API currently exposes the V4 and V6 list above.

## Programmatic Usage

```ts
import { createA3DProject } from "@aura3d/engine/create-aura3d";

const result = createA3DProject({
  targetDir: "my-a3d-app",
  template: "production-product-viewer",
  packageVersion: "0.1.0-alpha.0"
});

console.log(result.files);
```

The generated project includes:

- `package.json`;
- `index.html`;
- `src/main.ts`;
- template `README.md`.

## CLI Shape

The intended consumer flow is:

```sh
npm create aura3d@latest my-a3d-app -- --template production-product-viewer
cd my-a3d-app
npm install
npm run build
```

Until publication is fully gated, local verification uses packed/workspace package artifacts and temporary Vite consumers.

## Template Rules

Templates should:

- import from public `@aura3d/engine` entrypoints;
- avoid monorepo-only source paths;
- build with Vite outside the repo;
- include explicit lifecycle disposal where an app owns a renderer;
- expose diagnostics when route health matters;
- state their own boundaries when using WebGPU, migration helpers, or asset fixtures.

Templates should not:

- claim production readiness;
- hide failures behind placeholder screenshots;
- depend on private test fixtures unless the template is explicitly internal;
- imply full Three.js, Unity, Unreal, glTF, WebGPU, or browser-device parity.

## Verification

Use:

```sh
pnpm build
pnpm verify:templates
pnpm test:templates
```

Template verification checks that scaffolded projects can be copied, wired to public package artifacts, and built. It does not prove broad runtime compatibility.
