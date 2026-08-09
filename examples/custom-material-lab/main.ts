import {
  Geometry,
  PortableShaderMaterial,
  Renderer,
  ShaderLibrary,
  Texture,
  TextureBinding,
  createDefaultShaderLibrary,
  type PortableShaderSources
} from "@aura3d/rendering";

const canvas = document.querySelector<HTMLCanvasElement>("#stage");
if (!canvas) throw new Error("Portable material lab canvas is missing");

const backend = new URLSearchParams(location.search).get("backend") === "webgpu" ? "webgpu" : "webgl2";
const library = createDefaultShaderLibrary();
const renderer = await Renderer.create({ backend, canvas, width: canvas.width, height: canvas.height, clearColor: [0.018, 0.024, 0.07, 1], shaderLibrary: library });
const texture = new Texture({
  width: 4,
  height: 4,
  colorSpace: "linear",
  label: "portable-dissolve-signal",
  data: new Uint8Array([
    255, 94, 68, 255, 255, 187, 73, 255, 55, 231, 211, 255, 109, 113, 255, 255,
    91, 51, 215, 255, 231, 72, 170, 255, 65, 204, 255, 255, 255, 129, 72, 255,
    42, 223, 183, 255, 94, 116, 255, 255, 255, 70, 143, 255, 255, 203, 75, 255,
    116, 84, 241, 255, 46, 220, 236, 255, 246, 87, 112, 255, 139, 243, 126, 255
  ])
});

const COMMON_GLSL_VERTEX = `#version 300 es
precision highp float;
layout(location = 0) in vec3 a_position;
layout(location = 1) in vec3 a_normal;
layout(location = 2) in vec2 a_uv;
uniform mat4 u_modelViewProjection;
uniform mat4 u_modelMatrix;
uniform mat4 u_normalMatrix;
out vec3 v_position;
out vec3 v_normal;
out vec2 v_uv;
void main() {
  v_position = a_position;
  v_normal = normalize(mat3(u_normalMatrix) * a_normal);
  v_uv = a_uv;
  gl_Position = u_modelViewProjection * vec4(a_position, 1.0);
}`;

const COMMON_WGSL_VERTEX = `/* @aura3d-bindings */
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) objectPosition: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>,
};
@vertex fn vs_main(
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) uv: vec2<f32>
) -> VertexOutput {
  var output: VertexOutput;
  let clip = aura.u_modelViewProjection * vec4<f32>(position, 1.0);
  output.position = vec4<f32>(clip.xy, clip.z * 0.5 + clip.w * 0.5, clip.w);
  output.objectPosition = position;
  output.normal = normalize((aura.u_normalMatrix * vec4<f32>(normal, 0.0)).xyz);
  output.uv = uv;
  return output;
}`;

function stages(glslFragment: string, wgslFragment: string): PortableShaderSources {
  return { glsl: { vertex: COMMON_GLSL_VERTEX, fragment: glslFragment }, wgsl: { vertex: COMMON_WGSL_VERTEX, fragment: wgslFragment } };
}

const plasmaSources = (hot = false) => stages(`#version 300 es
precision highp float;
uniform float u_time;
uniform vec3 u_colorA;
uniform vec3 u_colorB;
in vec3 v_position; in vec3 v_normal; in vec2 v_uv;
out vec4 outColor;
void main() {
  float field = sin(v_position.x * 11.0 + u_time * ${hot ? "2.4" : "1.7"}) * cos(v_position.y * 9.0 - u_time) + sin(v_position.z * 13.0);
  float rim = pow(1.0 - abs(normalize(v_normal).z), 2.2);
  vec3 color = mix(u_colorA, u_colorB, field * 0.25 + 0.5) + rim * vec3(0.28, 0.42, 0.9);
  outColor = vec4(color, 1.0);
}`, `/* @aura3d-bindings */
struct FragmentInput { @location(0) objectPosition: vec3<f32>, @location(1) normal: vec3<f32>, @location(2) uv: vec2<f32> };
@fragment fn fs_main(input: FragmentInput) -> @location(0) vec4<f32> {
  let field = sin(input.objectPosition.x * 11.0 + aura.u_time * ${hot ? "2.4" : "1.7"}) * cos(input.objectPosition.y * 9.0 - aura.u_time) + sin(input.objectPosition.z * 13.0);
  let rim = pow(1.0 - abs(normalize(input.normal).z), 2.2);
  let color = mix(aura.u_colorA, aura.u_colorB, field * 0.25 + 0.5) + rim * vec3<f32>(0.28, 0.42, 0.9);
  return vec4<f32>(color, 1.0);
}`);

const contourSources = stages(`#version 300 es
precision highp float;
uniform float u_time;
uniform float u_frequency;
uniform vec3 u_ink;
in vec3 v_position; in vec3 v_normal; in vec2 v_uv;
out vec4 outColor;
void main() {
  float height = v_position.y + sin(v_position.x * 5.0 + u_time) * 0.14;
  float wave = abs(fract(height * u_frequency) - 0.5);
  float line = 1.0 - smoothstep(0.035, 0.13, wave);
  float grid = 1.0 - smoothstep(0.015, 0.055, min(abs(fract(v_uv.x * 12.0) - 0.5), abs(fract(v_uv.y * 12.0) - 0.5)));
  outColor = vec4(mix(vec3(0.018, 0.035, 0.075), u_ink, max(line, grid * 0.35)), 1.0);
}`, `/* @aura3d-bindings */
struct FragmentInput { @location(0) objectPosition: vec3<f32>, @location(1) normal: vec3<f32>, @location(2) uv: vec2<f32> };
@fragment fn fs_main(input: FragmentInput) -> @location(0) vec4<f32> {
  let height = input.objectPosition.y + sin(input.objectPosition.x * 5.0 + aura.u_time) * 0.14;
  let wave = abs(fract(height * aura.u_frequency) - 0.5);
  let line = 1.0 - smoothstep(0.035, 0.13, wave);
  let gridDistance = min(abs(fract(input.uv.x * 12.0) - 0.5), abs(fract(input.uv.y * 12.0) - 0.5));
  let grid = 1.0 - smoothstep(0.015, 0.055, gridDistance);
  return vec4<f32>(mix(vec3<f32>(0.018, 0.035, 0.075), aura.u_ink, max(line, grid * 0.35)), 1.0);
}`);

const dissolveSources = stages(`#version 300 es
precision highp float;
uniform float u_time;
uniform float u_threshold;
uniform vec3 u_edgeColor;
uniform sampler2D u_signal;
in vec3 v_position; in vec3 v_normal; in vec2 v_uv;
out vec4 outColor;
void main() {
  vec3 signal = texture(u_signal, v_uv).rgb;
  float noise = fract(sin(dot(v_position.xy + v_position.z, vec2(12.9898, 78.233))) * 43758.5453);
  float threshold = u_threshold + sin(u_time) * 0.08;
  if (noise < threshold - 0.16) discard;
  float edge = 1.0 - smoothstep(0.0, 0.16, noise - threshold + 0.16);
  outColor = vec4(mix(signal, u_edgeColor, edge), 1.0);
}`, `/* @aura3d-bindings */
struct FragmentInput { @location(0) objectPosition: vec3<f32>, @location(1) normal: vec3<f32>, @location(2) uv: vec2<f32> };
@fragment fn fs_main(input: FragmentInput) -> @location(0) vec4<f32> {
  let signal = textureSample(u_signalTexture, u_signalSampler, input.uv).rgb;
  let noise = fract(sin(dot(input.objectPosition.xy + input.objectPosition.zz, vec2<f32>(12.9898, 78.233))) * 43758.5453);
  let threshold = aura.u_threshold + sin(aura.u_time) * 0.08;
  if (noise < threshold - 0.16) { discard; }
  let edge = 1.0 - smoothstep(0.0, 0.16, noise - threshold + 0.16);
  return vec4<f32>(mix(signal, aura.u_edgeColor, edge), 1.0);
}`);

const plasma = new PortableShaderMaterial({ shaderLibrary: library, name: "ion-plasma", sources: plasmaSources(), requiredAttributes: ["a_position", "a_normal", "a_uv"], uniforms: [
  { name: "u_time", kind: "float", value: 0 },
  { name: "u_colorA", kind: "vec3", value: [0.07, 0.18, 0.95] },
  { name: "u_colorB", kind: "vec3", value: [0.93, 0.08, 0.62] }
] });
const contour = new PortableShaderMaterial({ shaderLibrary: library, name: "topographic-signal", sources: contourSources, requiredAttributes: ["a_position", "a_normal", "a_uv"], uniforms: [
  { name: "u_time", kind: "float", value: 0 },
  { name: "u_frequency", kind: "float", value: 8 },
  { name: "u_ink", kind: "vec3", value: [0.05, 0.95, 0.72] }
] });
const dissolve = new PortableShaderMaterial({ shaderLibrary: library, name: "digital-dissolve", sources: dissolveSources, requiredAttributes: ["a_position", "a_normal", "a_uv"], uniforms: [
  { name: "u_time", kind: "float", value: 0 },
  { name: "u_threshold", kind: "float", value: 0.38 },
  { name: "u_edgeColor", kind: "vec3", value: [1, 0.28, 0.04] },
  { name: "u_signal", kind: "texture2d", value: new TextureBinding({ name: "u_signal", texture, required: true, expectedDimension: "2d" }) }
] });

const geometry = Geometry.uvSphere(0.58, 48, 28, { textured: true });
const materials = [plasma, contour, dissolve] as const;
const xPositions = [-0.66, 0, 0.66] as const;

function matrix(x: number, rotation: number): readonly number[] {
  const scale = 0.47;
  const c = Math.cos(rotation) * scale;
  const s = Math.sin(rotation) * scale;
  return [c, 0, -s, 0, 0, scale, 0, 0, s, 0, c, 0, x, 0.04, 0, 1];
}

let frame = 0;
let hotReloaded = false;
let animationEnabled = true;
function render(timeSeconds: number) {
  materials.forEach((material) => material.setParameter("u_time", timeSeconds));
  const diagnostics = renderer.render({ renderItems: materials.map((material, index) => {
    const transform = matrix(xPositions[index]!, timeSeconds * (0.18 + index * 0.06));
    return { geometry, material, label: material.name, modelMatrix: transform, modelViewProjectionMatrix: transform };
  }) });
  frame += 1;
  const state = {
    ready: true,
    backend: renderer.device.kind,
    materialCount: materials.length,
    frame,
    hotReloaded,
    diagnostics,
    sourceKinds: ["GLSL", "WGSL"],
    publicApiOnly: true
  };
  Object.assign(window as unknown as Record<string, unknown>, { __AURA_PORTABLE_MATERIAL_LAB__: state });
  document.querySelector("#backend")!.textContent = `${renderer.device.kind.toUpperCase()} · 3 portable programs`;
  document.querySelector("#evidence")!.textContent = `${diagnostics.drawCalls} draws · ${diagnostics.nativeSubmissions ?? 0} native submissions`;
  return state;
}

const started = performance.now();
function tick(now: number) {
  if (!animationEnabled) return;
  render((now - started) / 1000);
  if (animationEnabled && frame < 24) requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

Object.assign(window as unknown as Record<string, unknown>, {
  __AURA_PORTABLE_MATERIAL_RENDER_FIXED__: () => {
    animationEnabled = false;
    return render(1.75);
  },
  __AURA_PORTABLE_MATERIAL_HOT_RELOAD__: () => {
    animationEnabled = false;
    plasma.hotReload(plasmaSources(true));
    hotReloaded = true;
    return render(1.75);
  },
  __AURA_PORTABLE_MATERIAL_DISPOSE__: () => {
    materials.forEach((material) => material.dispose());
    geometry.dispose();
    texture.dispose();
    renderer.dispose();
    return { materialsDisposed: materials.every((material) => material.disposed), rendererDisposed: true };
  }
});
