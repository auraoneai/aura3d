/**
 * prd02 ChunkHarness page (02-S14, PRD-02 §15). Built into the lane bundle
 * (vite.lane.config.ts input `chunks`) and driven by
 * tests/qr/prd02/browser/chunks.spec.ts on macos-14.
 *
 * Publishes `window.__A3D_PRD02_CHUNKS__`:
 *  - compile: every a3d_prd02_* chunk compiled in ChunkHarness, plus the
 *    composed forward set (sh9 + ibl + shadow lookup + punctual) linked, with
 *    default-block uniform vec4 slots and sampler counts (budget 224 / 16);
 *  - lambert: a white Lambert plane lit by one directional light (E = 1)
 *    evaluated through a3d_punctualRadiance — expected 1/π;
 *  - lights32: 32 directional lights (E = 1 each) through the same loop —
 *    expected 32/π (a 16-light cap would give 16/π).
 */
import "../../../../packages/rendering/src/lanes/prd02";
import { shaderChunk } from "../../../../packages/rendering/src/contracts/program";
import { buildChunkHarnessProgram } from "../../../../packages/rendering/src/contracts/testing/ChunkHarness";
import { AURA_LIGHTS_MAX, packAuraLightsStd140, type AuraLightData } from "../../../../packages/rendering/src/LightUniforms";

const CHUNK_NAMES = [
  "a3d_prd02_sh9",
  "a3d_prd02_lighting_ibl",
  "a3d_prd02_shadow_lookup",
  "a3d_prd02_lighting_punctual",
  "a3d_prd02_shadow_caster",
  "a3d_prd02_contact_shadow"
] as const;
const FORWARD_SET = ["a3d_prd02_sh9", "a3d_prd02_lighting_ibl", "a3d_prd02_shadow_lookup", "a3d_prd02_lighting_punctual"] as const;

interface CompileRow {
  readonly name: string;
  readonly fragmentOk: boolean;
  readonly vertexOk: boolean;
  readonly linkOk: boolean | null;
  readonly uniformVectors: number | null;
  readonly samplers: number | null;
  readonly log: string;
}

declare global {
  interface Window {
    __A3D_PRD02_CHUNKS__?: unknown;
  }
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): { shader: WebGLShader; ok: boolean; log: string } {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return { shader, ok: gl.getShaderParameter(shader, gl.COMPILE_STATUS) === true, log: gl.getShaderInfoLog(shader) ?? "" };
}

/** vec4 slots per default-block uniform type (GLSL ES 3.00 §packing, conservative). */
function vectorSlots(gl: WebGL2RenderingContext, type: number): number {
  switch (type) {
    case gl.FLOAT_MAT4: return 4;
    case gl.FLOAT_MAT3: return 3;
    case gl.FLOAT_MAT2: return 2;
    default: return 1;
  }
}

function isSampler(gl: WebGL2RenderingContext, type: number): boolean {
  const samplerTypes: readonly number[] = [
    gl.SAMPLER_2D, gl.SAMPLER_CUBE, gl.SAMPLER_3D, gl.SAMPLER_2D_ARRAY,
    gl.SAMPLER_2D_SHADOW, gl.SAMPLER_CUBE_SHADOW, gl.SAMPLER_2D_ARRAY_SHADOW
  ];
  return samplerTypes.includes(type);
}

function link(gl: WebGL2RenderingContext, vertex: WebGLShader, fragment: WebGLShader): Pick<CompileRow, "linkOk" | "uniformVectors" | "samplers" | "log"> {
  const program = gl.createProgram()!;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  const linkOk = gl.getProgramParameter(program, gl.LINK_STATUS) === true;
  if (!linkOk) return { linkOk, uniformVectors: null, samplers: null, log: gl.getProgramInfoLog(program) ?? "" };
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
  const indices = Array.from({ length: count }, (_, i) => i);
  const blocks = count > 0 ? (gl.getActiveUniforms(program, indices, gl.UNIFORM_BLOCK_INDEX) as number[]) : [];
  let uniformVectors = 0;
  let samplers = 0;
  for (const index of indices) {
    if (blocks[index] !== -1) continue; // uniform-block members do not use default-block vectors
    const info = gl.getActiveUniform(program, index);
    if (!info) continue;
    if (isSampler(gl, info.type)) samplers += info.size;
    else uniformVectors += vectorSlots(gl, info.type) * info.size;
  }
  return { linkOk, uniformVectors, samplers, log: "" };
}

const FORWARD_MAIN = `
void main() {
  vec3 worldPos = vec3(gl_FragCoord.xy * 0.01, 0.0);
  vec3 n = normalize(vec3(0.1, 1.0, 0.2));
  vec3 v = normalize(vec3(0.0, 0.5, 1.0));
  vec3 color = a3dIndirectDiffuseIrradiance(n) + a3dEnvSpecularRadiance(n, v, 0.5) + a3d_sh9Irradiance(n);
  for (int i = 0; i < A3D_MAX_LIGHTS; i += 1) {
    if (i >= u_prd02LightCount) break;
    vec3 l;
    float atten;
    color += a3d_punctualRadiance(i, worldPos, n, l, atten) * a3d_punctualShadowFactor(i, worldPos, n, 5.0);
  }
  fragColor = vec4(color, 1.0);
}`;

/**
 * The C-02 ChunkHarness declares a stub `AuraLights { vec4 u_lightData[8]; }`
 * block; the prd02 punctual chunk declares the flattened default-block
 * `u_lightData[A3D_MAX_LIGHTS * 6]` itself (PRD-02 §8.1), so with both the
 * fragment fails "'u_lightData' : redefinition" (GPU run 38186219765). Drop the
 * stub block when the chunk brings its own declaration — in the vertex stage
 * too, or the link fails "Name conflicts between a uniform and a uniform block
 * field: u_lightData" (GPU run 38187586433).
 */
const STUB_AURA_LIGHTS = /layout\(std140\)\s*uniform\s+AuraLights\s*\{[^}]*\};\s*/;
function declaresOwnLightData(fragment: string): boolean {
  return /uniform\s+vec4\s+u_lightData\s*\[\s*A3D_MAX_LIGHTS/.test(fragment);
}
function harnessFragment(fragment: string): string {
  return declaresOwnLightData(fragment) ? fragment.replace(STUB_AURA_LIGHTS, "") : fragment;
}
function harnessVertex(program: { readonly vertex: string; readonly fragment: string }): string {
  return declaresOwnLightData(program.fragment) ? program.vertex.replace(STUB_AURA_LIGHTS, "") : program.vertex;
}

function compileRows(gl: WebGL2RenderingContext): CompileRow[] {
  const rows: CompileRow[] = [];
  for (const name of CHUNK_NAMES) {
    const chunk = shaderChunk(name);
    if (!chunk) {
      rows.push({ name, fragmentOk: false, vertexOk: false, linkOk: null, uniformVectors: null, samplers: null, log: "chunk not registered" });
      continue;
    }
    const program = buildChunkHarnessProgram([chunk]);
    const vs = compile(gl, gl.VERTEX_SHADER, harnessVertex(program));
    const fs = compile(gl, gl.FRAGMENT_SHADER, harnessFragment(program.fragment));
    rows.push({ name, fragmentOk: fs.ok, vertexOk: vs.ok, linkOk: null, uniformVectors: null, samplers: null, log: `${vs.log}${fs.log}` });
  }
  const forward = FORWARD_SET.map((name) => shaderChunk(name)).filter((c): c is NonNullable<typeof c> => c !== undefined);
  const program = buildChunkHarnessProgram(forward);
  // The harness main writes a constant, so the linker would strip every chunk
  // uniform; swap in a main that exercises the forward lighting path so the
  // active-uniform census reflects the real budget.
  const fragmentSource = harnessFragment(program.fragment)
    .replace("precision highp float;", "precision highp float;\nprecision highp int;\n#define A3D_PUNCTUAL_SHADOWS 1")
    .replace("void main() { fragColor = vec4(1.0); }", FORWARD_MAIN);
  const vs = compile(gl, gl.VERTEX_SHADER, harnessVertex(program));
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const linked = vs.ok && fs.ok ? link(gl, vs.shader, fs.shader) : { linkOk: false, uniformVectors: null, samplers: null, log: "" };
  rows.push({ name: "forward-set", fragmentOk: fs.ok, vertexOk: vs.ok, ...linked, log: `${vs.log}${fs.log}${linked.log}` });
  return rows;
}

const QUAD_VS = `#version 300 es
in vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`;

function evalFragment(punctualGlsl: string): string {
  return `#version 300 es
precision highp float;
precision highp int;
${punctualGlsl}
uniform vec3 u_albedo;
layout(location = 0) out vec4 fragColor;
void main() {
  vec3 n = vec3(0.0, 1.0, 0.0);
  vec3 radiance = vec3(0.0);
  for (int i = 0; i < A3D_MAX_LIGHTS; i += 1) {
    if (i >= u_prd02LightCount) break;
    vec3 l;
    float atten;
    radiance += a3d_punctualRadiance(i, vec3(0.0), n, l, atten);
  }
  // Lambert: f = albedo / π.
  fragColor = vec4(u_albedo / 3.14159265358979 * radiance, 1.0);
}
`;
}

function sun(): AuraLightData {
  return { kind: "directional", color: [1, 1, 1], intensity: 1, position: [0, 10, 0], direction: [0, -1, 0], range: 0, spotAngle: 0, penumbra: 0, decay: 2 };
}

function evaluateLights(gl: WebGL2RenderingContext, lightCount: number): { value: number; ok: boolean; log: string } {
  const punctual = shaderChunk("a3d_prd02_lighting_punctual");
  if (!punctual) return { value: Number.NaN, ok: false, log: "punctual chunk not registered" };
  const vs = compile(gl, gl.VERTEX_SHADER, QUAD_VS);
  const fs = compile(gl, gl.FRAGMENT_SHADER, evalFragment(punctual.glsl));
  if (!vs.ok || !fs.ok) return { value: Number.NaN, ok: false, log: `${vs.log}${fs.log}` };
  const program = gl.createProgram()!;
  gl.attachShader(program, vs.shader);
  gl.attachShader(program, fs.shader);
  gl.bindAttribLocation(program, 0, "a_position");
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return { value: Number.NaN, ok: false, log: gl.getProgramInfoLog(program) ?? "" };

  const packed = packAuraLightsStd140(Array.from({ length: lightCount }, sun));
  const target = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, target);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, 1, 1);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) return { value: Number.NaN, ok: false, log: "RGBA32F target incomplete" };
  gl.viewport(0, 0, 1, 1);
  gl.useProgram(program);
  gl.uniform4fv(gl.getUniformLocation(program, "u_lightData"), packed.data);
  gl.uniform1i(gl.getUniformLocation(program, "u_prd02LightCount"), packed.lightCount);
  gl.uniform3f(gl.getUniformLocation(program, "u_albedo"), 1, 1, 1);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  const out = new Float32Array(4);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, out);
  return { value: out[0]!, ok: true, log: "" };
}

function run(): void {
  const canvas = document.getElementById("harness") as HTMLCanvasElement | null;
  const gl = canvas?.getContext("webgl2");
  if (!gl) throw new Error("WebGL2 unavailable");
  if (!gl.getExtension("EXT_color_buffer_float")) throw new Error("EXT_color_buffer_float unavailable (needed for the float readback)");
  window.__A3D_PRD02_CHUNKS__ = {
    status: "ready",
    limits: {
      maxFragmentUniformVectors: gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS),
      maxTextureImageUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)
    },
    compile: compileRows(gl),
    lambert: evaluateLights(gl, 1),
    lights32: evaluateLights(gl, AURA_LIGHTS_MAX)
  };
}

try {
  run();
} catch (error) {
  window.__A3D_PRD02_CHUNKS__ = { status: "error", error: String(error instanceof Error ? error.stack ?? error : error) };
}
