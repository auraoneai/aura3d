import { RenderDeviceError, type PortableShaderBinding, type ShaderSources } from "../RenderDevice";
import { CLIPPED_SCREEN_SPACE_LINE_SUFFIX } from "../forward/ScreenSpaceLineClipping";
import { rasterClipDepthWgsl } from "../webgpu/ProjectionClip";
import { DEFAULT_SCREEN_SPACE_LINE_SHADER_MARKER, DEFAULT_SCREEN_SPACE_LINE_SHADER_NAME } from "../ShaderLibraryCore";

/**
 * Dependency-free WGSL helper for a future point-quad depth/shadow program.
 *
 * The scene corner is the forward point helper's expanded GL-range clip
 * position, before the WebGPU z conversion. A draw must supply the inverse of
 * the *actual* scene raster view-projection and this pass's separate depth
 * view-projection. The result is already converted to WebGPU clip depth. The
 * returned world point describes the expanded corner, for depth evaluation;
 * clipping planes for a point use its unexpanded source center instead.
 *
 * A non-positive or tiny homogeneous divisor cannot represent this scene clip
 * corner with the same positive raster orientation after normalization. Such a
 * corner, or one that overflows at shader precision, returns a finite off-screen
 * position and `invalid = 1`. The caller must propagate/interpolate that flag
 * and discard affected fragments. This is conservative omission, not a repair.
 *
 * This function intentionally does not select visibility, sample a point map,
 * perform round/alpha coverage, bind resources, or lease the expanded geometry.
 * Camera depth must follow forward's center clipping; shadow passes must retain
 * offscreen casters rather than applying the scene's x/y clip test. Until those
 * contracts and the shared point expansion are wired, the depth guards remain.
 */
export const SPECIALIZED_POINT_DEPTH_REPROJECTION_WGSL = `
struct A3dPointDepthProjection {
  position: vec4f,
  world: vec3f,
  invalid: f32,
};

fn a3dPointDepthReproject(
  expandedSceneClip: vec4f,
  inverseSceneRasterViewProjection: mat4x4f,
  depthViewProjection: mat4x4f,
  depthZeroToOne: bool
) -> A3dPointDepthProjection {
  var result = A3dPointDepthProjection(vec4f(2.0, 2.0, 2.0, 1.0), vec3f(0.0), 1.0);
  if (!all(abs(expandedSceneClip) < vec4f(1e30))) { return result; }
  let worldH = inverseSceneRasterViewProjection * expandedSceneClip;
  if (!(worldH.w >= 1e-8) || !all(abs(worldH) < vec4f(1e30))) { return result; }
  let world = worldH.xyz / worldH.w;
  if (!all(abs(world) < vec3f(1e30))) { return result; }
  let depthClip = depthViewProjection * vec4f(world, 1.0);
  if (!all(abs(depthClip) < vec4f(1e30))) { return result; }
  result.position = vec4f(depthClip.xy, select((depthClip.z + depthClip.w) * 0.5, depthClip.z, depthZeroToOne), depthClip.w);
  result.world = world;
  result.invalid = 0.0;
  return result;
}
`;

/** Validate the declared projection range against the backend. This does not inspect the matrix itself. */
export function assertSpecializedLineDepthClipRange(
  backend: "webgl2" | "webgpu",
  clipRange: "minus-one-to-one" | "zero-to-one"
): void {
  if ((backend !== "webgl2" && backend !== "webgpu")
    || (clipRange !== "minus-one-to-one" && clipRange !== "zero-to-one")
    || (backend === "webgl2" && clipRange !== "minus-one-to-one")) {
    throw new RenderDeviceError("Specialized line depth projection does not match the backend clip range", "DEPTH_SPECIALIZED_CLIP_RANGE_UNSUPPORTED", { backend, clipRange });
  }
}

/**
 * Build the depth-stage counterpart of the clipped screen-space line program.
 *
 * `clippedLine` must be produced by the forward line clipping adapter, so its
 * world varying describes the *expanded*, near-clipped line rather than the
 * source segment. Expansion still uses the scene raster camera and its exact
 * line resolution / pixel ratio; only the final projection uses this pass's
 * view-projection. The caller must validate and bind both camera contracts
 * before selecting this shader. In particular, a shadow tile's dimensions are
 * not the scene raster dimensions.
 *
 * GLSL expects a minus-one-to-one depth projection, as required by WebGL2.
 * WGSL accepts either projection range; `u_a3dClipRange` is 0 for the former
 * and 1 for zero-to-one. Call `assertSpecializedLineDepthClipRange` during
 * preflight; creating this backend-neutral pair cannot validate a draw's
 * camera or device. Scene-camera expansion still uses the forward line
 * program's own GL clip-coordinate contract.
 * Invalid reconstructed corners retain the forward variant's invalid flag;
 * those fragments are discarded. An invalid depth projection gets a finite
 * off-screen placeholder and the same flag. This avoids emitting non-finite
 * depth positions, but does not reconstruct the affected triangle.
 *
 * This factory is deliberately not a capability test: source availability
 * does not imply that a caller can reproduce per-item raster matrices,
 * instances, deformation, source geometry, or the scene's temporal jitter.
 * Those cases must remain rejected until the draw path supplies them.
 */
export function createSpecializedLineDepthShader(
  clippedLine: ShaderSources,
  options: { readonly logarithmic?: boolean } = {}
): ShaderSources {
  const logarithmic = options.logarithmic === true;
  if (clippedLine.label !== `${DEFAULT_SCREEN_SPACE_LINE_SHADER_NAME}${CLIPPED_SCREEN_SPACE_LINE_SUFFIX}`
    || clippedLine.marker !== DEFAULT_SCREEN_SPACE_LINE_SHADER_MARKER
    || !clippedLine.vertex.includes("v_a3dLineClipWorld") || !clippedLine.fragment.includes("v_a3dLineClipWorld")
    || !clippedLine.vertex.includes("v_a3dLineClipInvalid") || !clippedLine.fragment.includes("if (v_a3dLineClipInvalid > 0.0) discard;")) {
    throw new Error("Specialized line depth requires the clipped forward line source");
  }
  if (!clippedLine.webgpu || !clippedLine.portableBindings) {
    throw new Error("Specialized line depth requires paired WGSL stages and portable bindings");
  }

  let vertex = replaceOnce(clippedLine.vertex, "void main() {", `uniform mat4 u_a3dDepthViewProjection;
void main() {`, "GLSL vertex entry");
  vertex = replaceOnce(vertex, "  v_lineCapFraction = capFraction;", `  // The forward expansion and clipping varyings above remain scene-camera based.
  vec4 a3dDepthClip = u_a3dDepthViewProjection * vec4(v_a3dLineClipWorld, 1.0);
  if (v_a3dLineClipInvalid > 0.0 || !all(lessThan(abs(a3dDepthClip), vec4(1e30)))) {
    v_a3dLineClipInvalid = 1.0;
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  } else {
    gl_Position = a3dDepthClip;
  }
  v_lineCapFraction = capFraction;`, "GLSL expanded position");

  let fragment = clippedLine.fragment;
  if (logarithmic) {
    fragment = replaceOnce(fragment, "void main() {", `uniform mat4 u_a3dLogDepthView;
uniform vec2 u_a3dLogDepthRange;
void main() {`, "GLSL fragment entry");
  }
  fragment = replaceOnce(fragment, "  outColor = u_baseColor * v_lineColor;", logarithmic
    ? `  float a3dDistance = -(u_a3dLogDepthView * vec4(v_a3dLineClipWorld, 1.0)).z;
  float a3dLogNear = log(u_a3dLogDepthRange.x);
  float a3dDepth = clamp((log(max(a3dDistance, u_a3dLogDepthRange.x)) - a3dLogNear) /
    (log(u_a3dLogDepthRange.y) - a3dLogNear), 0.0, 1.0);
  gl_FragDepth = a3dDepth;
  outColor = vec4(vec3(a3dDepth), 1.0);`
    : "  outColor = vec4(vec3(gl_FragCoord.z), 1.0);", "GLSL fragment output");

  if (!clippedLine.webgpu.vertex.includes("out.clipWorld") || !clippedLine.webgpu.fragment.includes("clipWorld")
    || !clippedLine.webgpu.vertex.includes("out.clipInvalid") || !clippedLine.webgpu.fragment.includes("if (clipInvalid > 0.0) { discard; }")) {
    throw new Error("Specialized line depth requires the clipped forward WGSL source");
  }
  const nativeVertex = replaceOnce(clippedLine.webgpu.vertex,
    `  out.position = vec4f(clip.xy, ${rasterClipDepthWgsl("clip")}, clip.w);`,
    `  let a3dDepthClip = aura.u_a3dDepthViewProjection * vec4f(out.clipWorld, 1.0);
  if (out.clipInvalid > 0.0 || !all(abs(a3dDepthClip) < vec4f(1e30))) {
    out.clipInvalid = 1.0;
    out.position = vec4f(2.0, 2.0, 2.0, 1.0);
  } else {
    out.position = vec4f(a3dDepthClip.xy, select((a3dDepthClip.z + a3dDepthClip.w) * 0.5, a3dDepthClip.z, aura.u_a3dClipRange > 0.5), a3dDepthClip.w);
  }`,
    "WGSL expanded position");
  let nativeFragment = replaceOnce(clippedLine.webgpu.fragment, "@fragment fn fs_main(",
    "@fragment fn fs_main(@builtin(position) a3dDepthFragmentPosition: vec4f, ", "WGSL fragment entry");
  if (logarithmic) {
    nativeFragment = replaceOnce(nativeFragment, "@fragment fn fs_main(", `struct A3dLineDepthOutput {
  @location(0) color: vec4f,
  @builtin(frag_depth) depth: f32,
};
@fragment fn fs_main(`, "WGSL fragment result declaration");
    nativeFragment = replaceOnce(nativeFragment, ") -> @location(0) vec4f {", ") -> A3dLineDepthOutput {", "WGSL fragment result type");
  }
  nativeFragment = replaceOnce(nativeFragment, "  return aura.u_baseColor * color;", logarithmic
    ? `  let a3dDistance = -(aura.u_a3dLogDepthView * vec4f(clipWorld, 1.0)).z;
  let a3dLogNear = log(aura.u_a3dLogDepthRange.x);
  let a3dDepth = clamp((log(max(a3dDistance, aura.u_a3dLogDepthRange.x)) - a3dLogNear) /
    (log(aura.u_a3dLogDepthRange.y) - a3dLogNear), 0.0, 1.0);
  var result: A3dLineDepthOutput;
  result.color = vec4f(vec3f(a3dDepth), 1.0);
  result.depth = a3dDepth;
  return result;`
    : "  return vec4f(vec3f(a3dDepthFragmentPosition.z), 1.0);", "WGSL fragment output");

  const additions: PortableShaderBinding[] = [
    { name: "u_a3dDepthViewProjection", kind: "mat4" },
    { name: "u_a3dClipRange", kind: "float" },
    ...(logarithmic ? [
      { name: "u_a3dLogDepthView", kind: "mat4" as const },
      { name: "u_a3dLogDepthRange", kind: "vec2" as const }
    ] : [])
  ];
  const existingNames = new Set(clippedLine.portableBindings.map((binding) => binding.name));
  for (const binding of additions) {
    if (existingNames.has(binding.name)) throw new Error(`Specialized line depth binding already exists: ${binding.name}`);
  }
  return {
    ...clippedLine,
    label: `${clippedLine.label}:depth${logarithmic ? ":log" : ""}`,
    vertex,
    fragment,
    webgpu: { ...clippedLine.webgpu, vertex: nativeVertex, fragment: nativeFragment },
    portableBindings: [...clippedLine.portableBindings, ...additions]
  };
}

/** Fail closed on a changed or already-transformed source, never emit a partial shader. */
function replaceOnce(source: string, anchor: string, replacement: string, description: string): string {
  const index = source.indexOf(anchor);
  if (index < 0 || source.indexOf(anchor, index + anchor.length) >= 0) {
    throw new Error(`Specialized line depth source has an incompatible ${description}`);
  }
  return source.slice(0, index) + replacement + source.slice(index + anchor.length);
}
