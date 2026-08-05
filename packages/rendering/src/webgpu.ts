/**
 * WS-2.2 — `WebGPUDevice` as its own entry point, so the barrel does not force it onto every bundle.
 *
 * ## The problem this solves
 *
 * `createRenderDevice` already loads the WebGPU device with `await import("./WebGPUDevice")`,
 * deliberately, and says so: *"a statically imported branch is retained by bundlers even when the
 * caller only ever asks for `webgl2`"*. That care was being undone one file away, because
 * `packages/rendering/src/index.ts` re-exported `WebGPUDevice` as a **value**. A value re-export is a
 * static edge, so every consumer of the barrel pulled in the device regardless.
 *
 * Measured on scenario 1 (one cube, no WebGPU): a **18,689-byte gzip chunk** on the critical path,
 * `WebGPUDevice.ts` at 74,438 bytes raw.
 *
 * ## Why a new entry rather than dropping the export
 *
 * `WebGPUDevice` is a documented public export and WS-2.8 requires low-level escape hatches to stay
 * reachable — a developer writing a custom WebGPU path must still be able to construct one. So it
 * moves to `@aura3d/engine/rendering/webgpu`, and the barrel keeps only the **type**, which erases at
 * build time. Nothing is removed from the public surface; one import specifier changes, recorded in
 * `MIGRATION-1.6.md`.
 */
export { WebGPUDevice } from "./WebGPUDevice";
export type {
  WebGPUAdapterLike,
  WebGPUBufferDescriptorLike,
  WebGPUBufferLike,
  WebGPUDeviceLike,
  WebGPUDeviceOptions,
  WebGPULike,
  WebGPUQueueLike,
  WebGPUSamplerDescriptorLike
} from "./WebGPUDevice";
