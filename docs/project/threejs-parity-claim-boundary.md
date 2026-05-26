# Three.js parity Claim Boundary

Generated from the Three.js parity Three.js inventory.

## Current Claim

A3D is not yet a full Three.js replacement. This inventory is a code backlog, not a parity proof.

## Blocked Claims

- Full Three.js parity.
- Exceeds Three.js.
- Exceeds Three.js in every sense.

## Why

- High-priority open examples: 0
- Unsupported examples: 0
- Partial examples: 0

Claims can advance only after construction tracks A through K produce real package/runtime code and Track L verification proves the result.

## Binding Code Parity Floor

The following systems are hard blockers for global parity and cannot be replaced by tests, screenshots, dashboards, or generated reports.

- First-party math engine: vectors, matrices, quaternions, rays, bounds, frustums, projection, and transform math.
- Scene graph: Object3D-style hierarchy, inherited transforms, matrix auto-update traversal, cameras, lights, visibility, render order, and disposal.
- Geometry and GPU buffers: vertex attributes, interleaved buffers, index buffers, dynamic updates, GLTF attributes, instancing attributes, and buffer disposal.
- Shader/material/state system: GLSL compile/link/validate, uniform/attribute/texture binding, public materials, and CPU-side WebGL state caching.
- Renderer/camera/draw pipeline: render loop, resize/DPR, view-projection updates, frustum culling, render queue construction, sorting, and drawElements/drawArrays dispatch.
- Advanced render management: opaque front-to-back sorting, transparent back-to-front sorting, batching where valid, instanced rendering, per-instance attributes, and draw/state diagnostics.
- Hardware animation: bone hierarchy, inverse bind matrices, JOINTS/WEIGHTS import, GPU skinning palette upload, shader skinning, normal/tangent skinning, and multi-character palette diagnostics.
- PBR and IBL: Cook-Torrance BRDF, GGX, Smith, Fresnel-Schlick, metallic/roughness, normal/AO/emissive/physical extensions, HDR environment preparation, irradiance, prefiltered specular, and BRDF LUT or documented equivalent.
- Postprocess and render targets: FBO abstraction, render-to-texture, fullscreen passes, ping-pong composer chain, depth texture routing, bloom bright/blur/composite passes, and resize/disposal behavior.
- Spatial scale and memory: bounds, BVH/octree or equivalent acceleration, broad-phase culling, raycast acceleration, explicit dispose(), WebGL delete calls, ownership rules, teardown, diagnostics, and leak tests.

Any missing blocker forces a scoped claim that names the excluded system explicitly.
