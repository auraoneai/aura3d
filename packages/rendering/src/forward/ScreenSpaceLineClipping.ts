import type { PortableShaderBinding, ShaderSources } from "../RenderDevice";
import { DEFAULT_SCREEN_SPACE_LINE_SHADER_MARKER, DEFAULT_SCREEN_SPACE_LINE_SHADER_NAME } from "../ShaderLibraryCore";
import { rasterClipDepthWgsl } from "../webgpu/ProjectionClip";

/** The inverse maps the GL clip position of an expanded line corner back to object space. */
export const LINE_CLIP_INVERSE_TRANSFORM = "u_a3dClipInverseLineTransform";
export const CLIPPED_SCREEN_SPACE_LINE_SUFFIX = ":clipped";

const CLIPPING_BINDINGS: readonly PortableShaderBinding[] = [
  { name: LINE_CLIP_INVERSE_TRANSFORM, kind: "mat4" },
  { name: "u_a3dClipPlanes", kind: "vec4", arrayLength: 8 },
  { name: "u_a3dClipGroups", kind: "vec4", arrayLength: 2 },
  { name: "u_a3dClipGroupCount", kind: "float" }
];

const GLSL_CLIPPING = `
uniform vec4 u_a3dClipPlanes[8];
uniform vec4 u_a3dClipGroups[2];
uniform float u_a3dClipGroupCount;
in vec3 v_a3dLineClipLocal;
in vec3 v_a3dLineClipWorld;
in float v_a3dLineClipInvalid;

bool a3dLineIsClipped(vec3 localPosition, vec3 worldPosition) {
  for (int groupIndex = 0; groupIndex < 2; ++groupIndex) {
    if (float(groupIndex) >= u_a3dClipGroupCount) break;
    vec4 group = u_a3dClipGroups[groupIndex];
    vec3 point = group.w > 0.5 ? localPosition : worldPosition;
    bool unionMode = group.z > 0.5;
    bool retained = !unionMode;
    for (int planeIndex = 0; planeIndex < 8; ++planeIndex) {
      if (float(planeIndex) < group.x || float(planeIndex) >= group.x + group.y) continue;
      bool inside = dot(u_a3dClipPlanes[planeIndex], vec4(point, 1.0)) >= 0.0;
      retained = unionMode ? retained || inside : retained && inside;
    }
    if (!retained) return true;
  }
  return false;
}
`;

const WGSL_CLIPPING = `
fn a3dLineIsClipped(localPosition: vec3f, worldPosition: vec3f) -> bool {
  for (var groupIndex = 0u; groupIndex < 2u; groupIndex++) {
    if (f32(groupIndex) >= aura.u_a3dClipGroupCount) { break; }
    let group = aura.u_a3dClipGroups[groupIndex];
    let point = select(worldPosition, localPosition, group.w > 0.5);
    let unionMode = group.z > 0.5;
    var retained = !unionMode;
    for (var planeIndex = 0u; planeIndex < 8u; planeIndex++) {
      if (f32(planeIndex) < group.x || f32(planeIndex) >= group.x + group.y) { continue; }
      let inside = dot(aura.u_a3dClipPlanes[planeIndex], vec4f(point, 1.0)) >= 0.0;
      if (unionMode) { retained = retained || inside; } else { retained = retained && inside; }
    }
    if (!retained) { return true; }
  }
  return false;
}
`;

function replaceExactlyOnce(source: string, anchor: string, replacement: string, label: string): string {
  const index = source.indexOf(anchor);
  if (index < 0 || source.indexOf(anchor, index + anchor.length) >= 0) {
    throw new Error(`Screen-space line shader contract changed at ${label}`);
  }
  return source.slice(0, index) + replacement + source.slice(index + anchor.length);
}

/**
 * Make a separate clipping variant of Aura's existing line shader. Expansion,
 * near-plane treatment, vertex colors, distance-based dashes and end caps all
 * remain the original implementation. Fragment clipping uses interpolated
 * positions of the expanded corners, rather than the unexpanded centerline.
 *
 * For a pixel-width line the caller must bind inverse(u_modelViewProjection).
 * For a world-width line it must bind inverse(u_projectionMatrix *
 * u_viewMatrix * u_modelMatrix). Use the matrices actually bound to this draw,
 * and reject non-finite or singular transforms before submitting it. The GL
 * clip coordinate is used before the WebGPU depth-range conversion.
 *
 * An invertible transform alone is insufficient: its expanded corner may be
 * at infinity, or overflow when evaluated in shader precision. An unsafe
 * homogeneous divisor or reconstructed position produces finite placeholder
 * varyings and an invalid-corner flag. Interpolating that flag discards the
 * interior of every affected triangle; only a shared edge at zero contribution
 * from an invalid vertex can survive. The omitted geometry is not a claim of
 * correct reconstruction and should be avoided by validating the draw inputs.
 * The divisor must also be positive: dividing by a negative w reverses the
 * reconstructed clip vector and changes the camera's clip half-spaces.
 *
 * These shaders intentionally do not implement geometry-matrix transforms,
 * instanced attributes or a shadow-camera re-projection. Their draw integration
 * must reject any unsupported contract rather than silently dropping it.
 */
export function createClippedScreenSpaceLineShader(source: ShaderSources): ShaderSources {
  if (source.label !== DEFAULT_SCREEN_SPACE_LINE_SHADER_NAME || source.marker !== DEFAULT_SCREEN_SPACE_LINE_SHADER_MARKER ||
      !source.webgpu || !source.portableBindings || source.generatedProgram ||
      [source.vertex, source.fragment, source.webgpu.vertex, source.webgpu.fragment].some((stage) => !stage.includes(source.marker))) {
    throw new Error("Clipping requires the native screen-space line shader contract");
  }
  const names = new Set(source.portableBindings.map((binding) => binding.name));
  if (CLIPPING_BINDINGS.some((binding) => names.has(binding.name))) {
    throw new Error("Screen-space line clipping bindings already exist");
  }

  let vertex = source.vertex;
  vertex = replaceExactlyOnce(vertex, "uniform mat4 u_modelMatrix;", "uniform mat4 u_modelMatrix;\nuniform mat4 u_a3dClipInverseLineTransform;", "GLSL inverse transform");
  vertex = replaceExactlyOnce(vertex, "out float v_lineCapFraction;", "out float v_lineCapFraction;\nout vec3 v_a3dLineClipLocal;\nout vec3 v_a3dLineClipWorld;\nout float v_a3dLineClipInvalid;", "GLSL varyings");
  vertex = replaceExactlyOnce(vertex, "    v_lineCapFraction = 0.0;\n    return;", "    v_lineCapFraction = 0.0;\n    v_a3dLineClipLocal = vec3(0.0);\n    v_a3dLineClipWorld = vec3(0.0);\n    v_a3dLineClipInvalid = 1.0;\n    return;", "GLSL near-plane rejection");
  vertex = replaceExactlyOnce(vertex, "  v_lineCapFraction = capFraction;", `  vec4 a3dLineLocalH = u_a3dClipInverseLineTransform * gl_Position;
  v_a3dLineClipLocal = vec3(0.0);
  v_a3dLineClipWorld = vec3(0.0);
  v_a3dLineClipInvalid = 1.0;
  if (a3dLineLocalH.w >= 1e-8 && all(lessThan(abs(a3dLineLocalH), vec4(1e30)))) {
    vec3 a3dLineLocal = a3dLineLocalH.xyz / a3dLineLocalH.w;
    if (all(lessThan(abs(a3dLineLocal), vec3(1e30)))) {
      vec3 a3dLineWorld = (u_modelMatrix * vec4(a3dLineLocal, 1.0)).xyz;
      if (all(lessThan(abs(a3dLineWorld), vec3(1e30)))) {
        v_a3dLineClipLocal = a3dLineLocal;
        v_a3dLineClipWorld = a3dLineWorld;
        v_a3dLineClipInvalid = 0.0;
      }
    }
  }
  v_lineCapFraction = capFraction;`, "GLSL expanded corner");

  let fragment = replaceExactlyOnce(source.fragment, "precision highp float;", `precision highp float;\n${GLSL_CLIPPING}`, "GLSL clipping declarations");
  fragment = replaceExactlyOnce(fragment, "void main() {", "void main() {\n  if (v_a3dLineClipInvalid > 0.0) discard;\n  if (a3dLineIsClipped(v_a3dLineClipLocal, v_a3dLineClipWorld)) discard;", "GLSL fragment entry");

  let webgpuVertex = source.webgpu.vertex;
  webgpuVertex = replaceExactlyOnce(webgpuVertex, "  @location(3) capFraction: f32,", "  @location(3) capFraction: f32,\n  @location(4) clipLocal: vec3f,\n  @location(5) clipWorld: vec3f,\n  @location(6) clipInvalid: f32,", "WGSL varyings");
  webgpuVertex = replaceExactlyOnce(webgpuVertex, "    out.capFraction = 0.0;\n    return out;", "    out.capFraction = 0.0;\n    out.clipLocal = vec3f(0.0);\n    out.clipWorld = vec3f(0.0);\n    out.clipInvalid = 1.0;\n    return out;", "WGSL near-plane rejection");
  webgpuVertex = replaceExactlyOnce(webgpuVertex, `  out.position = vec4f(clip.xy, ${rasterClipDepthWgsl("clip")}, clip.w);`, `  let a3dLineLocalH = aura.u_a3dClipInverseLineTransform * clip;
  out.clipLocal = vec3f(0.0);
  out.clipWorld = vec3f(0.0);
  out.clipInvalid = 1.0;
  if (a3dLineLocalH.w >= 1e-8 && all(abs(a3dLineLocalH) < vec4f(1e30))) {
    let a3dLineLocal = a3dLineLocalH.xyz / a3dLineLocalH.w;
    if (all(abs(a3dLineLocal) < vec3f(1e30))) {
      let a3dLineWorld = (aura.u_modelMatrix * vec4f(a3dLineLocal, 1.0)).xyz;
      if (all(abs(a3dLineWorld) < vec3f(1e30))) {
        out.clipLocal = a3dLineLocal;
        out.clipWorld = a3dLineWorld;
        out.clipInvalid = 0.0;
      }
    }
  }
  out.position = vec4f(clip.xy, ${rasterClipDepthWgsl("clip")}, clip.w);`, "WGSL expanded corner");

  let webgpuFragment = replaceExactlyOnce(source.webgpu.fragment, "/* @aura3d-bindings */", `/* @aura3d-bindings */\n${WGSL_CLIPPING}`, "WGSL clipping declarations");
  const fragmentSignature = "@fragment fn fs_main(@location(0) color: vec4f, @location(1) distance: f32, @location(2) cap: vec2f, @location(3) capFraction: f32) -> @location(0) vec4f {";
  webgpuFragment = replaceExactlyOnce(webgpuFragment, fragmentSignature,
    "@fragment fn fs_main(@location(0) color: vec4f, @location(1) distance: f32, @location(2) cap: vec2f, @location(3) capFraction: f32, @location(4) clipLocal: vec3f, @location(5) clipWorld: vec3f, @location(6) clipInvalid: f32) -> @location(0) vec4f {\n  if (clipInvalid > 0.0) { discard; }\n  if (a3dLineIsClipped(clipLocal, clipWorld)) { discard; }", "WGSL fragment entry");

  return {
    ...source,
    label: `${source.label}${CLIPPED_SCREEN_SPACE_LINE_SUFFIX}`,
    vertex,
    fragment,
    webgpu: { ...source.webgpu, vertex: webgpuVertex, fragment: webgpuFragment },
    portableBindings: [...source.portableBindings, ...CLIPPING_BINDINGS]
  };
}
