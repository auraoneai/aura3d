/**
 * W3 — WGSL screen-space reflections for the native WebGPU post chain.
 *
 * A port of the v2 S3 stage (`ssr.glsl.ts`): same half-res trace and
 * full-res additive composite, same march, refinement, thickness test and
 * confidence terms (Schlick fresnel F0 0.04, screen-edge fade, refined
 * march-distance fade, camera-facing fade, roughness gate). Differences:
 *
 *   - depth: WebGPU has no S1 linear-depth target here, so the trace reads
 *     the forward target's sampleable depth attachment directly and
 *     linearises it through the frame's inverse projection. `depthZeroToOne`
 *     selects the clip mapping of the raster (native zero-to-one reversed
 *     frames write clip z, minus-one-to-one frames write (z + 1) / 2);
 *     pixels at `clearDepth` are background (sky) and read as `far`;
 *   - texture space: WebGPU texture v grows downward, so uv <-> NDC flips y;
 *   - no history reprojection: the hit colour is always this frame's HDR
 *     colour (the GLSL `u_reproject = 0` branch).
 *
 * `SSR_TRACE_MSAA_WGSL` is the same trace over a 4x depth attachment
 * (`texture_depth_multisampled_2d`, sample 0): WebGPU cannot resolve depth,
 * so an MSAA forward target keeps its attachment and the trace reads it.
 *
 * Binding convention of `runWebGPUFullscreenPass`: 0 uniform block,
 * 1 filtering sampler, 2.. textures. Every binding is referenced (the auto
 * layout strips unreferenced bindings and invalidates the bind group).
 */

/** Byte size of `SsrTraceUniforms` (two mat4 + 12 scalars, 16-byte aligned). */
export const SSR_TRACE_UNIFORM_BYTES = 176;

export const SSR_TRACE_WGSL = /* wgsl */ `
struct SsrTraceUniforms {
  projection: mat4x4<f32>,
  inverseProjection: mat4x4<f32>,
  size: vec2<f32>,
  far: f32,
  maxDistance: f32,
  thickness: f32,
  roughness: f32,
  steps: f32,
  ortho: f32,
  depthZeroToOne: f32,
  clearDepth: f32,
  _pad0: f32,
  _pad1: f32,
};

@group(0) @binding(0) var<uniform> u_ssr: SsrTraceUniforms;
@group(0) @binding(1) var u_sampler: sampler;
@group(0) @binding(2) var u_color: texture_2d<f32>;
@group(0) @binding(3) var u_depth: texture_depth_2d;

fn ssrNdc(uv: vec2<f32>) -> vec2<f32> {
  return vec2<f32>(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0);
}

fn linearDepthAt(uv: vec2<f32>) -> f32 {
  let size = vec2<i32>(textureDimensions(u_depth));
  let p = clamp(vec2<i32>(uv * vec2<f32>(size)), vec2<i32>(0), size - vec2<i32>(1));
  let d = textureLoad(u_depth, p, 0);
  if (d == u_ssr.clearDepth) { return u_ssr.far; }
  let clipZ = select(d * 2.0 - 1.0, d, u_ssr.depthZeroToOne > 0.5);
  let v = u_ssr.inverseProjection * vec4<f32>(ssrNdc(uv), clipZ, 1.0);
  if (v.w == 0.0) { return u_ssr.far; }
  return -v.z / v.w;
}

fn viewPosition(uv: vec2<f32>, z: f32) -> vec3<f32> {
  let ndc = ssrNdc(uv);
  let m = u_ssr.projection;
  if (u_ssr.ortho > 0.5) {
    return vec3<f32>((ndc.x - m[3][0]) / m[0][0], (ndc.y - m[3][1]) / m[1][1], -z);
  }
  return vec3<f32>(ndc.x * z / m[0][0], ndc.y * z / m[1][1], -z);
}

fn projectToUv(viewPos: vec3<f32>) -> vec2<f32> {
  let clip = u_ssr.projection * vec4<f32>(viewPos, 1.0);
  if (clip.w == 0.0) { return vec2<f32>(-1.0); }
  let ndc = clip.xy / clip.w;
  return vec2<f32>(ndc.x * 0.5 + 0.5, 0.5 - ndc.y * 0.5);
}

@fragment
fn fs_ssr_trace(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
  // The full-res pixel under this half-res texel, and its +x / +y neighbours, at exact pixel centres: the GLSL
  // gl_FragCoord / halfSize lands on a pixel boundary, and the nearest-pixel lookup then picks either side by
  // rounding, which flips the reconstructed normal on whole rows (the trace dropped those rows: horizontal stripes).
  let pixel = floor(fragCoord.xy * 2.0);
  let uv = (pixel + vec2<f32>(0.5)) / u_ssr.size;
  let z = linearDepthAt(uv);
  if (z <= 0.0 || z >= u_ssr.far * 0.999) { return vec4<f32>(0.0); }
  let p = viewPosition(uv, z);
  let uvx = (pixel + vec2<f32>(1.5, 0.5)) / u_ssr.size;
  let uvy = (pixel + vec2<f32>(0.5, 1.5)) / u_ssr.size;
  let px = viewPosition(uvx, linearDepthAt(uvx));
  let py = viewPosition(uvy, linearDepthAt(uvy));
  var n = normalize(cross(px - p, py - p));
  let v = select(normalize(p), vec3<f32>(0.0, 0.0, -1.0), u_ssr.ortho > 0.5);
  if (dot(n, v) > 0.0) { n = -n; }
  let r = normalize(reflect(v, n));

  let roughnessGate = 1.0 - smoothstep(0.35, 0.5, u_ssr.roughness);
  let facing = 1.0 - smoothstep(0.0, 0.6, r.z);
  if (roughnessGate <= 0.0 || facing <= 0.0) { return vec4<f32>(0.0); }

  let steps = i32(u_ssr.steps);
  let stepLength = u_ssr.maxDistance / f32(steps);
  var prev = p;
  var hitPos = p;
  var hitUv = vec2<f32>(-1.0);
  var travelled = 0.0;
  var prevBehind = false;
  for (var i = 1; i <= steps; i = i + 1) {
    let q = p + r * (stepLength * f32(i));
    let quv = projectToUv(q);
    if (quv.x < 0.0 || quv.x > 1.0 || quv.y < 0.0 || quv.y > 1.0) { break; }
    let sceneZ = linearDepthAt(quv);
    let rayZ = -q.z;
    let behind = rayZ > sceneZ;
    if (behind && !prevBehind) {
      var a = prev;
      var b = q;
      for (var j = 0; j < 4; j = j + 1) {
        let mid = 0.5 * (a + b);
        let muv = projectToUv(mid);
        if (-mid.z > linearDepthAt(muv)) { b = mid; } else { a = mid; }
      }
      let buv = projectToUv(b);
      if (-b.z - linearDepthAt(buv) < u_ssr.thickness) {
        hitPos = b;
        hitUv = buv;
        travelled = clamp(length(b - p) / u_ssr.maxDistance, 0.0, 1.0);
        break;
      }
    }
    prevBehind = behind;
    prev = q;
  }
  if (hitUv.x < 0.0) { return vec4<f32>(0.0); }

  let edge = abs(hitUv * 2.0 - 1.0);
  let edgeFade = 1.0 - smoothstep(0.85, 1.0, max(edge.x, edge.y));
  let distanceFade = 1.0 - travelled * travelled;
  let cosTheta = clamp(dot(-v, n), 0.0, 1.0);
  let fresnel = 0.04 + 0.96 * pow(1.0 - cosTheta, 5.0);
  let confidence = clamp(edgeFade * distanceFade * facing * roughnessGate * fresnel, 0.0, 1.0);
  let radiance = textureSampleLevel(u_color, u_sampler, clamp(hitUv, vec2<f32>(0.0), vec2<f32>(1.0)), 0.0).rgb;
  return vec4<f32>(radiance, confidence);
}
`;

export const SSR_COMPOSITE_WGSL = /* wgsl */ `
struct SsrCompositeUniforms {
  intensity: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
};

@group(0) @binding(0) var<uniform> u_composite: SsrCompositeUniforms;
@group(0) @binding(1) var u_sampler: sampler;
@group(0) @binding(2) var u_color: texture_2d<f32>;
@group(0) @binding(3) var u_reflection: texture_2d<f32>;

@fragment
fn fs_ssr_composite(@builtin(position) fragCoord: vec4<f32>) -> @location(0) vec4<f32> {
  let pixel = vec2<i32>(fragCoord.xy);
  let src = textureLoad(u_color, pixel, 0);
  let refl = textureSampleLevel(u_reflection, u_sampler, fragCoord.xy / vec2<f32>(textureDimensions(u_color)), 0.0);
  return vec4<f32>(src.rgb + refl.rgb * refl.a * u_composite.intensity, src.a);
}
`;

/** The trace over a multisampled depth attachment (sample 0; `textureLoad` takes the sample index where the mip was). */
export const SSR_TRACE_MSAA_WGSL = SSR_TRACE_WGSL.replace("var u_depth: texture_depth_2d;", "var u_depth: texture_depth_multisampled_2d;");
