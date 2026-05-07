# Basic App From A Starter Template

Version: 0.0.0-rebuild

This path is for a new developer who wants a minimal browser app without reading source tests. It uses the checked starter templates and the same WebGL2 renderer entrypoint verified by `pnpm verify:templates`.

## Choose A Template

Copy one template directory into a new app directory:

```sh
cp -R templates/vite-vanilla /tmp/galileo3d-basic-app
cd /tmp/galileo3d-basic-app
```

The available templates are:

```text
templates/vite-vanilla
templates/react
templates/vue
templates/svelte
```

Each template contains:

- `index.html`
- a Vite `build` script
- a public `@galileo3d/rendering` import
- a WebGL2 starter scene that draws a triangle

## Install And Build

The current repository version is `0.0.0-rebuild`. The package is not published as a public registry release, so `pnpm verify:templates` uses local built package artifacts for the Galileo runtime package while installing framework and Vite dependencies from npm.

For repository validation, run:

```sh
pnpm build
pnpm verify:templates
```

The verifier copies each template into a fresh temporary directory, installs the external dependencies, copies sanitized local Galileo runtime package artifacts into `node_modules`, runs `npm run build`, and checks the generated `dist` bundle for the starter renderer path.

## Minimal App Code

The vanilla template starts from this shape:

```ts
import { Geometry, Renderer, UnlitMaterial } from "@galileo3d/rendering";

const canvas = document.querySelector<HTMLCanvasElement>("#app");
if (!canvas) {
  throw new Error("Missing starter canvas.");
}

void renderStarterScene();

async function renderStarterScene(): Promise<void> {
  const renderer = await Renderer.create({
    backend: "webgl2",
    canvas,
    width: canvas.width,
    height: canvas.height,
    clearColor: [0.02, 0.025, 0.03, 1],
    preserveDrawingBuffer: true
  });

  renderer.render([
    {
      geometry: Geometry.triangle(),
      material: new UnlitMaterial({ color: [1, 0.36, 0.12, 1] }),
      label: "starter-triangle"
    }
  ]);
}
```

## Current Boundary

This is starter-template evidence only. It does not prove package publishing, registry installation, repeated release gates, external demos, or independent clean-checkout reproduction on another machine.
