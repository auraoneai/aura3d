# V4 Getting Started

> Historical note: This V4 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


V4 is the local release track for the installable `@galileo3d/engine` SDK, the `create-g3d` scaffolder, and the supported V4 app workflows.

## Start From A Template

```sh
npm create g3d@latest my-product-viewer
cd my-product-viewer
npm install
npm run dev
```

The local release proof verifies the same path from a packed package through:

- `tests/reports/v4-create-g3d-templates.json`
- `tests/reports/external-parity-external-vite-build.json`
- `tests/reports/external-parity-static-preview-smoke.json`
- `tests/reports/external-parity-package-smoke.json`

## Use The Public API

```ts
import { createG3DApp, workflows } from "@galileo3d/engine";

const app = await createG3DApp({ canvas, quality: "production" });
const scene = await workflows.productConfigurator({
  asset: "/assets/product.glb",
  environment: "studio-softbox-hdr"
});
await app.renderWorkflow("product-configurator", scene);
```

Use `docs/api/app-api.md` for the stable API surface and `docs/project/v4-roadmap-known-gaps.md` for unsupported claims.

