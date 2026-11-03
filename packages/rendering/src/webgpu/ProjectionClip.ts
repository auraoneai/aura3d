/**
 * Native zero-to-one projection specialization for WebGPU scene programs.
 *
 * WebGPU rasterizes clip z in [0, w]. Standard and logarithmic frames hand
 * programs a minus-one-to-one projection, so the vertex stage writes
 * (z + w) / 2. For reversed depth that remap cancels the float precision
 * gain: near the far plane z is about -w and the sum loses the low bits that
 * a floating-point depth buffer could otherwise keep. A reversed frame
 * negotiated with `projectionClipRange: "zero-to-one"` therefore hands its
 * programs a native zero-to-one projection (near -> 1, far -> 0) and the
 * device sets this override, which makes the vertex stage pass clip z through.
 */

/** Pipeline-overridable constant name; the device sets it to 1 for zero-to-one reversed frames. */
export const ZERO_TO_ONE_PROJECTION_OVERRIDE = "a3dZeroToOneProjection";

/** Declaration every opted-in vertex module carries exactly once. */
export const ZERO_TO_ONE_PROJECTION_WGSL = `override ${ZERO_TO_ONE_PROJECTION_OVERRIDE}: bool = false;`;

/** WGSL expression for the raster clip z of `clip` (a vec4 expression without side effects). */
export function rasterClipDepthWgsl(clip: string): string {
  return `select(${clip}.z * 0.5 + ${clip}.w * 0.5, ${clip}.z, ${ZERO_TO_ONE_PROJECTION_OVERRIDE})`;
}

const DECLARATION = new RegExp(`\\boverride\\s+${ZERO_TO_ONE_PROJECTION_OVERRIDE}\\s*:\\s*bool\\b`);

/** True when a WGSL vertex source declares the zero-to-one projection override. */
export function declaresZeroToOneProjectionOverride(vertexSource: string): boolean {
  return DECLARATION.test(vertexSource);
}
