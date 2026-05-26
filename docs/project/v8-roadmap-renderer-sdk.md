# V8 Renderer SDK

> Historical note: This V8 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


This document states the intended public SDK surface for V8. It is a product contract target, not a claim that every item is complete.

## Public Renderer API

The renderer SDK should make the common real-scene path short and explicit:

```ts
import { Renderer, createProductionScene } from "@aura3d/engine";

const renderer = await Renderer.create({
  canvas,
  backend: "webgl2",
  powerPreference: "high-performance"
});

const scene = await createProductionScene(renderer, {
  assetUrl: "/assets/model.glb",
  environmentUrl: "/environments/studio.hdr",
  camera: "orbit-product",
  toneMapping: "aces",
  exposure: 1
});

renderer.setScene(scene);
renderer.start();
```

The API must not require application code to assemble proof-only render paths, fake diagnostics, or readback gates before the first interactive frame.

## Backend Selection

Backend selection should be explicit:

- `webgl2`: required production backend.
- `webgpu`: optional backend when supported by the browser and feature gates.
- `auto`: allowed only when it reports the chosen backend and fallback reason.

Apps must publish diagnostics that identify the backend, canvas context type, draw calls, frame count, loaded asset, loaded environment, and visible error text.

## GLTF And HDR Setup

The SDK should provide a one-call setup path for:

- loading `.glb` and `.gltf` assets
- reporting unsupported extensions
- applying PBR material defaults
- loading HDR environments
- building IBL/PMREM resources
- framing the camera around the asset
- choosing orbit controls

Asset load failures must surface as visible UI errors and runtime diagnostics.

## Render Loop

The normal render loop must start without `readPixels`. Readback is allowed only for explicit capture/export actions or dedicated tests.

Required runtime state:

- `status`: `loading`, `ready`, `running`, or `error`
- `drawCalls`
- `frameCount`
- `assetUrl`
- `environmentUrl`
- `backend`
- `error`

An app cannot display `Running` until it has rendered at least one visible frame and has nonzero draw calls.

## Capture And Export

Capture/export should be an explicit user action:

```ts
const png = await renderer.captureFrame({
  format: "png",
  includeAlpha: false,
  colorSpace: "srgb"
});
```

Capture may use GPU readback, but route startup and normal animation must not.

## Current Boundary

V8 docs can describe this SDK target, but completion requires browser evidence and generated reports. A helper API is not enough unless at least one production route consumes it and passes route health plus visual review.
