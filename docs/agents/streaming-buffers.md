# Streaming buffers: typed point clouds and dense instance writes

Use this when data arrives faster than a scene can be rebuilt: lidar or depth frames, telemetry, simulation output at 10-20 Hz or every frame. The scene declares *what exists* (capacity, layout, material, identity); the runtime handle owns *what the buffers contain this frame*. Bulk data never goes through builders, tuple arrays, CSS color strings or `setScene`.

Origin: `docs/project/e6-00-spatial-runtime-assessment.md` section 4, gaps U-06, P-01, P-02, I-07 (and P-05 for point size). Everything below is additive: `points({ positions: [[x, y, z]], colors: ["#fff"] })`, `geometry.dynamic` and every existing instance call behave as before.

## Live point cloud: `points.stream` + `pointStreamOf`

```ts
import { camera, createAuraApp, pointStreamOf, points, scene } from "@aura3d/engine";

const stage = scene({ background: "#05070b" })
  .camera(camera.perspective({ position: [0, 12, 40], target: [0, 0, 0], fov: 50 }))
  .add(points.stream({ capacity: 250_000, colors: "u8x4n", size: 1.5, sizeAttenuation: false, runtime: { id: "lidar" } }));

const app = createAuraApp("#app", { scene: stage });
// Never `await app.ready()` at module top level: a production build deadlocks on it and the page stays black.
void app.ready().then(() => {
  const lidar = pointStreamOf(app.nodes.require("lidar"));   // typed handle, no optional chaining
  // Per sensor frame (positions: Float32Array xyz, colors: Uint8Array rgba, 4 bytes per point):
  lidar.write(positions, { colors });          // replace the cloud; draw count = positions.length / 3
});
```

The node serialises as `{ capacity, colors, runtimeId }`: no payload. `runtime: { id }` is required (the id is the handle key).

### Handle surface (`AuraPointStreamHandle`)

| Member | Meaning |
|---|---|
| `write(positions, { count?, offset?, colors?, validate? })` | Copy-in write. The caller keeps ownership of its arrays; the engine never retains them. No `offset` = replace (draw count becomes `count`, bounds become exact). With `offset` (even 0) = partial update of `[offset, offset + count)`: the draw count only grows and bounds only grow. `validate: true` adds an O(count) finite scan (off by default). |
| `lease()` | Engine-owned views for decoders that can write in place. Without per-point colors `positions` is the CPU mirror itself (zero copy); with colors it is a staging array that `commit` interleaves. Fill, then `lease.commit(count, dirty?)`. The same lease object is returned on every call. |
| `setDrawCount(n)` | Change the drawn count without touching data. `0` draws nothing. This is a draw-range change, never a reallocation. |
| `capacity`, `drawCount` | Declared capacity; points drawn now. |
| `stats` | `{ commits, bytesCopied, allocations, dirtyBytes }`. `allocations` stays flat in steady state (lease staging counts once). |

Errors are coded: `POINT_STREAM_CAPACITY_EXCEEDED`, `POINT_STREAM_RANGE`, `POINT_STREAM_SHORT_INPUT`, `POINT_STREAM_TYPE`, `POINT_STREAM_NO_COLORS`, `POINT_STREAM_NON_FINITE`, `POINT_STREAM_NOT_MOUNTED`, `POINT_STREAM_DISPOSED`, `POINT_STREAM_REQUIRED` (`pointStreamOf` on another node kind).

### Formats and colors

- `colors: "u8x4n"` (4 bytes per point, the compact default) or `"f32x4"` (linear RGBA floats). Omit for one uniform color from `material`.
- Source arrays may be `Uint8Array`/`Uint8ClampedArray` (4 per point), `Uint32Array` (one little-endian RGBA word per point) or `Float32Array` (4 per point); conversion to the stored format happens inside the single copy loop, with no per-call allocation.
- Values are linear (the same convention as three.js vertex colors). `colorSpace: "srgb"` (u8 only) decodes sRGB bytes through a 256-entry table on write; alpha is never decoded.
- On WebGPU the node stores colors as f32 (the layout the native point-quad path is verified with); the stream API itself does not change. WebGPU keeps its existing per-draw point expansion and its arena budgets (`WEBGPU_POINT_QUAD_BUDGET_EXCEEDED`); P-03 is not part of this change.

### What a write costs, and what it never does

- One pass into the node's CPU vertex mirror (one `memcpy` when there are no per-point colors), exact byte-range dirty marking, and nothing else. The renderer uploads only the dirty range (`bufferSubData` / `writeBuffer`); a partial update of K points uploads `K x stride` bytes (stride 12 without colors, 16 with `u8x4n`, 28 with `f32x4`).
- No scene recompile, no GPU buffer re-creation, no re-upload of unchanged attributes, no `handle.snapshot()`, no per-point JS objects. The handle `version` bumps once per write or commit.
- Bounds: exact on replace, grow-only on partial writes, or the fixed `bounds: { min, max }` hint (positions are then never scanned). A visible cloud is never culled by stale bounds.
- Context loss: the CPU mirror is the source of truth. A new device generation re-creates the GPU buffer from it (`VertexBuffer.upload`).
- Capacity is fixed per mount. Growing means mounting a bigger stream (`setScene`); the old handle then throws `POINT_STREAM_DISPOSED` / `POINT_STREAM_NOT_MOUNTED`. Handles are invalid after `setScene` or node removal, like every handle.
- Worker mode has no mutable node path (U-05) and is unchanged.

## Static typed clouds: `points()`

`points({ positions: Float32Array, colors?: typed, size })` now stays typed end to end: one validation pass, one copy of the caller's array (the builder never aliases it), a direct vertex-buffer build with no tuple objects and no CSS color parsing. `colors` may be `Uint8Array` / `Uint8ClampedArray` (4 per point), `Uint32Array` or `Float32Array`; typed colors require a `Float32Array` for `positions`. Tuple / flat-number positions and string colors take the existing path unchanged.

## Dense instance writes

- Primitive instances (`instances.box`, ... `instances.custom`): `handle.setInstanceMatrices(matrices, count, rgba?)` is the dense path; storage is reused while `count` is stable. Unchanged.
- `instances.model(...)`: dense writes were silently dropped before (I-07). `setInstanceMatrices` now drives model instances too. Contract: each 4x4 column-major matrix is the instance's world T·R·S; the model's own normalization and centering (the "base placement", the matrix of an identity-transform instance) is applied inside it, and a parent's world matrix is applied outside it, so `instance = [parentWorld ·] dense · base`. For translation plus uniform scale this equals the matrix the spec path (`setInstances([{ position, scale }])`) produces for the same transform (unit test). A count of 0 draws nothing (`INSTANCES_EMPTY` warning); the count may not exceed the declared capacity. Optional `rgba` (4 linear floats per instance) is honored.
- Not changed here: `InstanceBuffer` still compares and uploads the whole range on a dense write (no `dirty` sub-range), and `instances.mesh` per-compile allocation (I-02) is untouched.

## Point size and dpr (P-05)

Default (attenuated) points use `size * 0.5 * deviceHeight / viewDepth`, which already carries dpr through the device-pixel height; fixed-size points multiply by dpr in the node handler. The register's "1/dpr" suspicion (P-05) was checked on a real GPU (Apple M4 Max, ANGLE/Metal, WebGL2) with the same 640x360 CSS canvas at dpr 1 and dpr 2: the lit footprint in CSS pixels at dpr 2 relative to dpr 1 was 0.885 (default attenuated points), 0.955 (fixed size) and 0.955 (`points.stream`), where a 1/dpr defect would give 0.25. So the suspected defect is not present on WebGL2 and no shader or handler change was made; the residual 5-12% is small-point rasterization at the lit-pixel threshold. Probe, frames and numbers: `evidence/buffers-515/dpr/` (`tools/dpr-probe.mjs`). WebGPU was not probed. Hardware clamps still apply (`ALIASED_POINT_SIZE_RANGE`; the default shader caps at 256 px and attenuated points at 12% of the render-target height).

## Measuring it

`tools/spatial-bench` (merged from `lane/510-e6-baseline`) has `-typed` variants of every points config (`pts-<n>-<hz>hz-<fps>fps-typed`, `ctl-static-pts-<n>-typed`, `mixed-...-typed`), Aura3D only. Numbers and the comparison with the baseline are in `tools/spatial-bench/results/2026-11-06-515/REPORT.md`; do not quote them without the labels in `claims-and-boundaries.md`.

### Measured on one machine, 20 Hz stream at a 60 fps target (medians of 3 runs)

Apple M4 Max, Chrome 156 headless, ANGLE/Metal WebGL2, 1280x720 at DPR 1, shared with other agent lanes. Baseline = `results/2026-11-06` (legacy `geometry.dynamic` + `updateAttribute`, and three.js r185 with a direct array write); typed = `results/2026-11-06-515`. The typed run happened under a higher machine load (median 1-minute load 21-51 at run start versus 9-15 for the baseline), so its numbers are if anything pessimistic.

| points | Aura3D legacy frame p50 / cpu per frame / tick | three.js frame p50 / cpu / tick | Aura3D typed frame p50 / cpu / tick | typed upload per rendered frame |
|---|---|---|---|---|
| 100K | 83.3 ms / 85.6 ms / 25.5 ms | 16.7 ms / 0.1 ms / 0.1 ms | 16.7 ms / 2.1 ms / 0.8 ms | 535 KB (three.js 534 KB) |
| 250K | 233.3 ms / 231.2 ms / 70.5 ms | 16.7 ms / 0.1 ms / 0.1 ms | 16.7 ms / 3.3 ms / 2.6 ms | 1.34 MB (three.js 1.34 MB) |
| 1M | 616.6 ms / 607.9 ms / 185.8 ms | 16.7 ms / 0.4 ms / 0.4 ms | 16.7 ms / 5.7 ms / 10.1 ms | 5.34 MB (three.js 5.33 MB) |

Read as: the typed path removes the CPU cost that made the legacy path miss every frame, and uploads the same bytes as three.js (one dirty range per tick). It is not equal to three.js CPU time (per-tick strided copy and heap are higher), and the JS heap of the typed 1M run is 148 MB versus 80 MB for three.js (CPU mirror plus the benchmark's own sensor ring). The mixed scene (250K points + 1K instances + 20K trail segments + 50 labels) improved from 200 ms to 16.7 ms p50 but kept a 33.3 ms p95 (18.5 ms mean CPU); the remaining cost there is the line-trail and label paths, which this change does not touch. Static `points()` mount for 1M points: 843 ms legacy to 153 ms typed; the 1.4-2.0 ms of per-frame CPU for a static cloud is the frame loop (U-03), unchanged. Full tables: `tools/spatial-bench/results/2026-11-06-515/REPORT.md` and `COMPARISON.md`. These are measurements on one machine, not a performance claim.

## Tests

`tests/unit/agent-api/point-stream.test.ts` covers: replace vs partial semantics, exact vs grow-only bounds, capacity and input errors, color conversions, zero-copy lease, dirty-range upload accounting (K x stride bytes at the right offset, no upload when clean), no GPU buffer re-creation and flat allocation counters across 200 ticks, context-loss re-upload, handle/handler integration (draw range, zero points draws nothing, dispose), typed static points, and the dense model-instance matrix contract.
