# Worker renderer texture snapshots

Status: source and mock-tested functionality; browser and GPU behavior have
not yet been verified.

`createWorkerRenderer` is exposed by `@aura3d/engine/worker`. Its initial
scene and later `setScene` calls can include eligible live, CPU-backed 2D
`rgba8`, `rgba16f`, `rgba32f`, and `r32f` texture handles. The host copies
their supplied pixels and mip levels synchronously into the scene request;
the worker recreates and owns its own handles. Allocated mip counts and sparse
mip overrides are retained. Shared references to the same handle within a
snapshot stay shared, and supported color-space, sampler, and UV settings are
preserved. Worker-local handle IDs may differ from host IDs and can change
when a new scene snapshot is submitted.

Changing the host texture does not update an existing worker snapshot. Call
`setScene` again to send the new pixels. Do not include those texture backing
buffers in `sceneTransfer`; the renderer owns the snapshot copy. A failed
replacement or recovery retains the previous scene when it can be restored,
and the worker releases its handles after renderer teardown.

One scene can contain at most 128 unique texture handles and 16 MiB of texture
pixels. In-flight snapshots are limited to 32 MiB per worker, and the request
queue is limited to 128 operations. A cancelled request keeps its reservation
and queue slot until the worker settles the original operation or terminates;
budget or queue exhaustion rejects before another snapshot is copied.

Canvas and video sources, GPU-owned handles, compressed or depth textures,
cube, array or 3D textures, storage textures, render attachments, shared
buffers, and distinct handles sharing one mutable backing are not accepted by
this snapshot path. Depending on the resource, use a typed texture asset or
create it inside the worker; the chosen resource path has its own format and
backend limits.
