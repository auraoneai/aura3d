export interface NativePointRasterInputs {
  readonly size: number;
  readonly targetHeight: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly attenuated: boolean;
}

/** Reject inputs whose selected point-size and pixel-to-clip math is not representable in f32. */
export function validateNativePointRasterInputs(input: NativePointRasterInputs): void {
  const { size, targetHeight, viewportWidth, viewportHeight, attenuated } = input;
  const raw = [size, targetHeight, viewportWidth, viewportHeight];
  if (typeof attenuated !== "boolean" || !raw.every(value => typeof value === "number" && Number.isFinite(value)) || !Number.isSafeInteger(targetHeight)) {
    throw new RangeError("Native point raster inputs must be positive and representable in f32");
  }
  const values = raw.map(Math.fround);
  if (values.some(value => !Number.isFinite(value) || value <= 0 || value >= 1e30)) {
    throw new RangeError("Native point raster inputs must be positive and representable in f32");
  }
  const [size32, height32, width32, viewportHeight32] = values as [number, number, number, number];
  const pixels = attenuated ? Math.fround(Math.fround(0.12) * height32) : Math.min(size32, 256);
  const product = Math.fround(size32 * Math.fround(0.5 * height32));
  const worstDistance = Math.fround(product / Math.fround(0.05));
  const scaleX = Math.fround(Math.fround(2 * pixels) / width32), scaleY = Math.fround(Math.fround(2 * pixels) / viewportHeight32);
  if (!Number.isFinite(pixels) || pixels <= 0 || pixels >= 1e30 || (attenuated && (!Number.isFinite(product) || !Number.isFinite(worstDistance)))
    || !Number.isFinite(scaleX) || scaleX <= 0 || scaleX >= 1e30 || !Number.isFinite(scaleY) || scaleY <= 0 || scaleY >= 1e30) {
    throw new RangeError("Native point raster arithmetic is not representable in f32");
  }
}

/**
 * Shared point-quad math for generated forward and specialized depth shaders.
 *
 * `center` and the returned clip position use the scene camera's OpenGL-style
 * homogeneous depth range. A caller remaps depth only after its final camera
 * projection. `corner` is the top-left-origin point coordinate in [0, 1].
 * Target height supplies the existing attenuation law; the effective raster
 * viewport, which may be smaller than the target, sets pixel-to-clip scale.
 *
 * Forward and camera-depth callers use both visibility predicates. A shadow
 * caller must omit the scene-clip predicate so an offscreen center can cast
 * into the view; the shadow projection then performs its own clipping.
 * Callers must validate finite positive size and viewport uniforms on the CPU,
 * and propagate/interpolate `invalid` to a fragment discard. The finite
 * magnitude bound is conservative for extreme inputs; it is not a claim of
 * pixel parity at floating-point limits.
 */
export const NATIVE_POINT_WGSL = `
struct A3dPointExpansion {
  clip: vec4f,
  invalid: f32,
};

fn a3dPointCanExpand(center: vec4f, attenuated: bool) -> bool {
  if (!all(abs(center) < vec4f(1e30)) || !(center.w > 0.0)) { return false; }
  return !attenuated || center.w >= 0.05;
}

fn a3dPointCenterInSceneClip(center: vec4f) -> bool {
  return center.w > 0.0 && all(abs(center.xyz) <= vec3f(center.w));
}

fn a3dPointPixelSize(size: f32, targetHeight: f32, clipW: f32, attenuated: bool) -> f32 {
  if (attenuated) {
    return min(size * (0.5 * targetHeight) / max(clipW, 1e-3), 0.12 * targetHeight);
  }
  return min(size, 256.0);
}

fn a3dPointExpandSceneClip(center: vec4f, corner: vec2f, pixels: f32, viewport: vec2f) -> A3dPointExpansion {
  let invalid = A3dPointExpansion(vec4f(2.0, 2.0, 2.0, 1.0), 1.0);
  if (!all(abs(center) < vec4f(1e30)) || !all(abs(corner) < vec2f(1e30)) ||
      !(pixels > 0.0 && pixels < 1e30) || !all(viewport > vec2f(0.0)) || !all(viewport < vec2f(1e30))) {
    return invalid;
  }
  let direction = vec2f(corner.x - 0.5, 0.5 - corner.y);
  let offset = direction * (vec2f(2.0 * pixels) / viewport) * center.w;
  let expanded = vec4f(center.xy + offset, center.zw);
  if (!all(abs(expanded) < vec4f(1e30))) { return invalid; }
  return A3dPointExpansion(expanded, 0.0);
}

fn a3dPointInRoundFootprint(uv: vec2f) -> bool {
  return length(uv - vec2f(0.5)) <= 0.5;
}
`;
