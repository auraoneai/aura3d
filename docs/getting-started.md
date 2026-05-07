# Getting Started

Version: 0.1.0-alpha.0

This guide is the top-level entry point for using the current Galileo3D prototype without reading source tests first.

## Run A Browser Example

Use a TypeScript-aware static server rooted at this repository, then open one of the committed examples:

```text
examples/00-basic-triangle/index.html
examples/01-basic-scene/index.html
examples/product-configurator/index.html
examples/pbr-camera-comparison/index.html
```

The browser validation suite opens these examples through the local test server:

```sh
pnpm test:browser
pnpm test:visual
```

## Build A Starter App

For a minimal app path, use the starter-template tutorial:

```text
docs/tutorials/basic-app.md
```

The template verifier copies each template into a temporary app, installs external dependencies, wires local Galileo runtime package artifacts, builds the app, and checks the generated bundle:

```sh
pnpm build
pnpm verify:templates
```

## Learn With A Real Scene

For renderer-backed scene code, use:

```text
docs/tutorials/getting-started-real-scene.md
```

That guide covers the current `Renderer.create({ backend: "webgl2" })` path and links to checked examples.

## Current Boundary

This is an experimental prototype checkout. The current local examples do not prove public package release readiness, production PBR parity, full WebGPU support, external hosted demos, or independent clean-checkout reproduction. Those gates are tracked in `docs/v2/filename-level-execution-checklist.md`.
