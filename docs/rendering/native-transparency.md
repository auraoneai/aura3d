# Weighted transparency

Status: source and mock-tested functionality; browser pixels, performance and
physical-device behavior have not yet been verified.

A lower-level `Renderer` source can request weighted transparency with
`transparencyMode: "weighted"`. For eligible frames, the renderer draws
transparent items into accumulation and revealage targets, samples opaque
depth, and composites the result. Inspect `renderer.transparencyDiagnostics`
for the reported `weighted`, `sorted`, or `failed` outcome.

The current path supports generated unlit alpha triangles on WebGL2 when
`EXT_float_blend` is available and the frame already has a full-view, linear,
single-sample postprocess target with sampleable depth. A group may contain at
most 1,024 submitted triangles. Direct-canvas frames, WebGPU, multisampling,
temporal effects, clipping, transmission, custom or premultiplied blending,
other materials and arbitrary contributors use the existing sorted path.
When a group is ineligible, the renderer keeps the whole group on that path.

Weighted transparency approximates the final ordering of transparent surfaces.
It does not reproduce every depth-sorted composition; use the sorted path when
the scene depends on exact draw order.
