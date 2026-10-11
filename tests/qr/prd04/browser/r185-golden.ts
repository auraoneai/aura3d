/**
 * r185-golden.ts — PRD-04 §14 P1-3 browser golden generator. Compiles three's
 * own `THREE.ShaderChunk` GLSL (common, lights_physical_pars_fragment,
 * transmission_pars_fragment, iridescence_fragment) on a real GPU, evaluates
 * the 20 cases of `r185-golden-cases.ts` on the 16×16×8 grid into RGBA32F and
 * publishes a document with the exact `fixtures/bsdf/r185-golden.json`
 * schema on `window.__A3D_PRD04_R185_GOLDEN__`.
 *
 * Every case's function set is first wrapped as `ShaderChunk`s and compiled
 * through the C-02 ChunkHarness (`buildChunkHarnessProgram`); the numeric
 * program then follows the python generator's layout (`make_shader`) exactly.
 * The DFG LUT is three's own `DFGLUTData.js` half-float table (RG16F).
 * The page never writes the fixture; the spec stores the result as a CI
 * artifact so the fixture can be regenerated from a remote run.
 */
import { REVISION, ShaderChunk as THREE_SHADER_CHUNK } from "three";
import { buildChunkHarnessProgram } from "/packages/rendering/src/contracts/testing/ChunkHarness.js";
import type { ShaderChunk } from "/packages/rendering/src/contracts/program.js";
import { R185_GOLDEN_CASES, type R185GoldenCase } from "/tests/qr/prd04/browser/r185-golden-cases.js";
import { caseDecls, caseFragment, chunkSources, linspace, type Sources } from "/tests/qr/prd04/browser/r185-golden-glsl.js";

interface CaseReport {
  fn: string;
  harnessCompileOk: boolean;
  compileOk: boolean;
  log: string;
  total: number;
}

declare global {
  interface Window {
    __A3D_PRD04_R185_GOLDEN__?: {
      status: "running" | "ready" | "error";
      error?: string;
      renderer?: string;
      glVersion?: string;
      threeRevision?: string;
      report?: CaseReport[];
      golden?: unknown;
    };
  }
}

const state: NonNullable<Window["__A3D_PRD04_R185_GOLDEN__"]> = { status: "running", report: [] };
window.__A3D_PRD04_R185_GOLDEN__ = state;

const VERTEX = `#version 300 es
void main() {
	vec2 p = vec2( float( ( gl_VertexID << 1 ) & 2 ), float( gl_VertexID & 2 ) );
	gl_Position = vec4( p * 2.0 - 1.0, 0.0, 1.0 );
}
`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): { shader: WebGLShader; ok: boolean; log: string } {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  return { shader, ok: gl.getShaderParameter(shader, gl.COMPILE_STATUS) === true, log: gl.getShaderInfoLog(shader) ?? "" };
}

/** C-02 ChunkHarness compile of the case's three functions (as `ShaderChunk`s). */
function harnessCompiles(gl: WebGL2RenderingContext, c: R185GoldenCase, s: Sources): { ok: boolean; log: string } {
  const glsl = [
    "#define texture2D texture",
    "#ifndef saturate\n#define saturate( a ) clamp( a, 0.0, 1.0 )\n#endif",
    "#define PI 3.141592653589793\n#define RECIPROCAL_PI 0.3183098861837907\n#define EPSILON 1e-6",
    ...(c.defines ?? []).map((d) => `#define ${d}`),
    ...caseDecls(c, s)
  ].join("\n");
  const chunk: ShaderChunk = { name: `three_r185_${c.fn}`, owner: "prd04" as ShaderChunk["owner"], stage: "fragment", glsl };
  const { fragment } = buildChunkHarnessProgram([chunk]);
  const result = compile(gl, gl.FRAGMENT_SHADER, fragment);
  gl.deleteShader(result.shader);
  return { ok: result.ok, log: result.log };
}

function evaluate(gl: WebGL2RenderingContext, c: R185GoldenCase, s: Sources, dfg: WebGLTexture): { values: (number | null)[] | null; log: string } {
  const total = c.argorder.reduce((acc, k) => acc * c.axes[k]![2], 1);
  if (total > 4096) throw new Error(`${c.fn}: ${total} samples > 4096`);
  const width = Math.min(1024, total);
  const height = Math.ceil(total / width);
  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = compile(gl, gl.FRAGMENT_SHADER, caseFragment(c, s, width));
  if (!vs.ok || !fs.ok) return { values: null, log: `compile failed: ${vs.log}${fs.log}` };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs.shader);
  gl.attachShader(prog, fs.shader);
  gl.linkProgram(prog);
  if (gl.getProgramParameter(prog, gl.LINK_STATUS) !== true) {
    return { values: null, log: `link failed: ${gl.getProgramInfoLog(prog) ?? ""}` };
  }
  const fb = gl.createFramebuffer()!;
  const rb = gl.createRenderbuffer()!;
  gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA32F, width, height);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb);
  gl.useProgram(prog);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, dfg);
  const lut = gl.getUniformLocation(prog, "dfgLUT");
  if (lut) gl.uniform1i(lut, 0);
  gl.viewport(0, 0, width, height);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  const pixels = new Float32Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, pixels);
  gl.deleteProgram(prog);
  gl.deleteFramebuffer(fb);
  gl.deleteRenderbuffer(rb);
  gl.deleteShader(vs.shader);
  gl.deleteShader(fs.shader);
  const values: (number | null)[] = [];
  for (let i = 0; i < total; i++) {
    for (let k = 0; k < c.out; k++) {
      const v = pixels[i * 4 + k]!;
      values.push(Number.isFinite(v) ? v : null); // JSON has no NaN/Inf: null, as in the python generator
    }
  }
  return { values, log: "" };
}

/** three's own DFG LUT (`src/renderers/shaders/DFGLUTData.js`, 16×16 RG half floats). */
async function threeDfgLut(gl: WebGL2RenderingContext): Promise<WebGLTexture> {
  const src = await (await fetch("/node_modules/three/src/renderers/shaders/DFGLUTData.js")).text();
  const body = /const DATA = new Uint16Array\(\s*\[([\s\S]*?)\]\s*\)/.exec(src)?.[1];
  if (!body) throw new Error("DFGLUTData.js: DATA table not found");
  const data = Uint16Array.from(body.split(",").map((x) => x.trim()).filter(Boolean).map((x) => Number.parseInt(x, 16)));
  if (data.length !== 512) throw new Error(`DFGLUTData.js: expected 512 halves, got ${data.length}`);
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, 16, 16, 0, gl.RG, gl.HALF_FLOAT, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

async function main(): Promise<void> {
  const gl = document.createElement("canvas").getContext("webgl2", { failIfMajorPerformanceCaveat: false });
  if (!gl) throw new Error("WebGL2 context unavailable");
  if (!gl.getExtension("EXT_color_buffer_float")) throw new Error("EXT_color_buffer_float unavailable");
  state.glVersion = gl.getParameter(gl.VERSION) as string;
  const dbg = gl.getExtension("WEBGL_debug_renderer_info");
  state.renderer = dbg ? (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) as string) : "unmasked";
  state.threeRevision = REVISION;

  const sources = chunkSources(THREE_SHADER_CHUNK as unknown as Record<string, string>);
  const dfg = await threeDfgLut(gl);
  const cases: unknown[] = [];
  for (const c of R185_GOLDEN_CASES) {
    const harness = harnessCompiles(gl, c, sources);
    const { values, log } = evaluate(gl, c, sources, dfg);
    const total = c.argorder.reduce((acc, k) => acc * c.axes[k]![2], 1);
    state.report!.push({
      fn: c.fn,
      harnessCompileOk: harness.ok,
      compileOk: values !== null,
      log: [harness.ok ? "" : `harness: ${harness.log}`, log].filter(Boolean).join("\n"),
      total
    });
    if (values === null) continue;
    cases.push({
      fn: c.fn,
      desc: c.desc,
      out: c.out,
      argorder: c.argorder,
      axes: Object.fromEntries(Object.entries(c.axes).map(([k, v]) => [k, linspace(v)])),
      fixed: c.fixed,
      values
    });
  }
  state.golden = {
    meta: {
      threeVersion: `0.${REVISION}.x`,
      threeRevision: REVISION,
      generatedBy: "tests/qr/prd04/browser/generate-r185-golden.spec.ts",
      renderer: state.renderer,
      sources: {
        "lights_physical_pars_fragment.glsl.js": "THREE.ShaderChunk.lights_physical_pars_fragment",
        "transmission_pars_fragment.glsl.js": "THREE.ShaderChunk.transmission_pars_fragment",
        "iridescence_fragment.glsl.js": "THREE.ShaderChunk.iridescence_fragment",
        "common.glsl.js": "THREE.ShaderChunk.common",
        "DFGLUTData.js": "/node_modules/three/src/renderers/shaders/DFGLUTData.js"
      }
    },
    cases
  };
  state.status = "ready";
  document.getElementById("status")!.textContent = "ready";
}

main().catch((error: unknown) => {
  state.status = "error";
  state.error = error instanceof Error ? error.stack ?? error.message : String(error);
  document.getElementById("status")!.textContent = "error";
});
