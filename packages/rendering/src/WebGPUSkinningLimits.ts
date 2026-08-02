/**
 * WebGPU skinning capacity, kept in its own module on purpose.
 *
 * `WebGPUDevice` is ~139 KB of source including WGSL shader text. `createRenderDevice` imports it
 * dynamically so a WebGL2-only route can drop it, but Rollup keeps a dynamically imported module in
 * the eager graph if *anything* also imports it statically. The public barrel did exactly that, to
 * re-export this constant, which alone was enough to defeat the split ("dynamic import will not move
 * module into another chunk").
 *
 * Holding the value here lets the barrel keep exporting it while the device itself stays lazy.
 */

/** Joint-palette capacity of the WebGPU skinning path — parity with the WebGL2 `u_jointMatrices[96]`. */
export const MAX_WEBGPU_SKINNING_JOINTS = 96;
