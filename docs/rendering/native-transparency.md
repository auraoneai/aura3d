# Weighted transparency

Status: source and mock-tested functionality; browser pixels, performance and
physical-device behavior have not yet been verified.

A lower-level `Renderer` source can request weighted transparency with
`transparencyMode: "weighted"`. For eligible frames, the renderer draws
transparent items into accumulation and revealage targets, samples opaque
depth, and composites the result. Inspect `renderer.transparencyDiagnostics`
for the reported `weighted`, `sorted`, or `failed` outcome.

The current path supports generated unlit (`UnlitMaterial`) and lit
(`PBRMaterial`, untextured, no fog) alpha triangles on WebGL2 when
`EXT_float_blend` is available and the frame already has a full-view, linear,
single-sample postprocess target with sampleable depth. A group may contain at
most 1,024 submitted triangles. Direct-canvas frames, temporal effects,
clipping, transmission, custom or premultiplied blending, other materials and
arbitrary contributors use the existing sorted path. WebGPU, multi-view and
multisampled frames are refused explicitly: `transparencyDiagnostics` reports
`mode: "sorted"` with the stable `code`
`WEIGHTED_TRANSPARENCY_WEBGPU_UNSUPPORTED`,
`WEIGHTED_TRANSPARENCY_MULTIVIEW_UNSUPPORTED` or
`WEIGHTED_TRANSPARENCY_MSAA_UNSUPPORTED`; a frame with refractive transmission
keeps sorted transparency after the renderer's transmission capture and
reports `WEIGHTED_TRANSPARENCY_TRANSMISSION_SORTED`.
When a group is ineligible, the renderer keeps the whole group on that path.

Explicit `renderOrder` is honored across the split frame phases. Opaque items
ordered after the first transmissive item draw after the transmission capture
(they are not part of the refraction backdrop), and transmissive items
interleave with blended items in one `renderOrder`-sorted queue when their
orders overlap. Orders that would require blended color inside the opaque
capture, or opaque geometry moved past an opaque-phase consumer, fail with
`RENDER_ORDER_PHASE_CONFLICT`.

Weighted transparency approximates the final ordering of transparent surfaces.
It does not reproduce every depth-sorted composition; use the sorted path when
the scene depends on exact draw order.
