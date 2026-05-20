# V9 Geometry And Buffer Management

G3D has real geometry and GPU-buffer infrastructure. Full Three.js `BufferGeometry` parity is still not claimed.

## Real Code

- `packages/rendering/src/Geometry.ts`
- `packages/rendering/src/VertexBuffer.ts`
- `packages/rendering/src/IndexBuffer.ts`
- `packages/rendering/src/RenderDevice.ts`
- `packages/rendering/src/WebGL2Device.ts`
- `packages/rendering/src/v6/resources/*`
- `packages/rendering/src/v9/RendererV9.ts`

## What Is Supported

- Vertex attributes for positions, normals, UVs, colors, tangents, joints, and weights where routes require them.
- Interleaved vertex-buffer layouts.
- Indexed and non-indexed geometry.
- Dynamic dirty-range updates.
- Primitive builders for common demo geometry.
- Bounds calculation for framing, culling, morphs, and skinning.
- Explicit disposal through geometry and resource lifecycle code.

## Current Evidence

- V9 matched inventory entries for GLTF, instancing, animation/skinning, morph targets, decals, and instancing performance.
- V9 partial entries for draw range, points/sprites, fat lines, and helpers.
- Browser evidence under `tests/reports/v9/*-parity/`.

## Remaining Deltas

- `webgl_buffergeometry_drawrange` remains partial.
- `webgl_points_sprites`, `webgl_lines_fat`, and `misc_helpers` remain partial.
- Full Three.js-style mutable `BufferGeometry` ergonomics are not complete.
- Fat-line and sprite parity require more than the current primitive/topology support.
