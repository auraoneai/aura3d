import { camera, createAuraApp, material, primitives, scene } from "@aura3d/engine";
import { A3D_AUTHOR_GLSL_CHUNKS } from "../../packages/rendering/src";

/** Compiles every author chunk on a real WebGL2 context, and renders known-value probes through `#include`. */
interface CompileResult { readonly name: string; readonly stage: "vertex" | "fragment" | "all"; readonly ok: boolean; readonly log: string }
interface Probe { readonly id: string; readonly centre: readonly [number, number, number, number]; readonly errors: readonly string[] }

const PROBES: Record<string, { readonly includes: readonly string[]; readonly body: string }> = {
  saturate: { includes: ["a3d_math"], body: "a3dSaturate(vec3(1.5, 0.5, -1.0))" },
  safeNormalizeZero: { includes: ["a3d_math"], body: "a3dSafeNormalize(vec3(0.0)) * 0.5 + 0.5" },
  safeDivZero: { includes: ["a3d_math"], body: "vec3(clamp(a3dSafeDiv(0.0, 0.0), 0.0, 1.0), 0.5, 0.5)" },
  finite: { includes: ["a3d_math"], body: "a3dFinite(vec3(uTimeZero / uTimeZero, 0.5, 1.0))" },
  toonRamp: { includes: ["a3d_math", "a3d_toon"], body: "vec3(a3dToonRamp(0.5, 4.0, 0.001))" },
  fogLinear: { includes: ["a3d_fog"], body: "a3dFogLinear(vec3(1.0, 0.0, 0.0), vec3(0.0, 0.0, 1.0), 5.0, 0.0, 10.0)" },
  skyZenith: { includes: ["a3d_sky"], body: "a3dSkyGradient(vec3(0.0, 1.0, 0.0), vec3(1.0, 0.0, 0.0), vec3(0.0, 0.0, 1.0), vec3(0.0, 1.0, 0.0))" },
  noiseRange: { includes: ["a3d_noise"], body: "vec3(clamp(a3dFbm(vec2(3.7, 1.2), 4), 0.0, 1.0) * 0.5 + 0.25, clamp(a3dSimplex2(vec2(0.3, 0.9)) * 0.5 + 0.5, 0.0, 1.0), clamp(a3dValueNoise(vec3(1.5, 2.5, 3.5)), 0.0, 1.0))" }
};

declare global {
  interface Window { __GLSL_CHUNKS__?: { compileAll(): CompileResult[]; probeIds: readonly string[]; probe(id: string): Promise<Probe> } }
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): { ok: boolean; log: string } {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  const ok = gl.getShaderParameter(shader, gl.COMPILE_STATUS) === true;
  const log = gl.getShaderInfoLog(shader) ?? "";
  gl.deleteShader(shader);
  return { ok, log: log.slice(0, 400) };
}

function link(gl: WebGL2RenderingContext, vertex: string, fragment: string): CompileResult["ok"] extends boolean ? { ok: boolean; log: string } : never {
  const vs = gl.createShader(gl.VERTEX_SHADER)!; gl.shaderSource(vs, vertex); gl.compileShader(vs);
  const fs = gl.createShader(gl.FRAGMENT_SHADER)!; gl.shaderSource(fs, fragment); gl.compileShader(fs);
  const program = gl.createProgram()!;
  gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
  const ok = gl.getProgramParameter(program, gl.LINK_STATUS) === true;
  const log = `${gl.getShaderInfoLog(vs) ?? ""} ${gl.getShaderInfoLog(fs) ?? ""} ${gl.getProgramInfoLog(program) ?? ""}`.trim().slice(0, 400);
  gl.deleteProgram(program); gl.deleteShader(vs); gl.deleteShader(fs);
  return { ok, log };
}

const VS_BASE = "in vec3 position;\nvoid main() { gl_Position = vec4(position, 1.0); }";
const FS_BASE = "out vec4 o;\nvoid main() { o = vec4(1.0); }";

function compileAll(): CompileResult[] {
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2")!;
  const results: CompileResult[] = [];
  for (const chunk of A3D_AUTHOR_GLSL_CHUNKS) {
    if (chunk.stages.includes("vertex")) {
      const r = link(gl, `#version 300 es\n${chunk.source}\n${VS_BASE}`, `#version 300 es\nprecision highp float;\n${FS_BASE}`);
      results.push({ name: chunk.name, stage: "vertex", ...r });
    }
    const r = link(gl, `#version 300 es\n${VS_BASE}`, `#version 300 es\nprecision highp float;\n${chunk.source}\n${FS_BASE}`);
    results.push({ name: chunk.name, stage: "fragment", ...r });
  }
  const all = A3D_AUTHOR_GLSL_CHUNKS.filter((c) => c.stages.includes("fragment")).map((c) => c.source).join("\n");
  const sampler = "uniform sampler2D uTex;\nout vec4 o;\nvoid main() { o = a3dTriplanar(uTex, vec3(1.0), vec3(0.0, 1.0, 0.0), 0.5, 0.2) + vec4(a3dSafeNormalize(vec3(0.0)), 1.0) + vec4(a3dFbm(vec3(1.0), 5), a3dSimplex2(vec2(1.0)), a3dRidged(vec2(2.0), 3), a3dToonRim(vec3(0.0, 1.0, 0.0), vec3(0.0, 1.0, 0.0), 0.5)); }";
  const combined = link(gl, `#version 300 es\n${VS_BASE}`, `#version 300 es\nprecision highp float;\n${all}\n${sampler}`);
  results.push({ name: "all-together+sampler", stage: "all", ...combined });
  void compile;
  return results;
}

async function probe(id: string): Promise<Probe> {
  const spec = PROBES[id]!;
  const stage = document.querySelector<HTMLElement>("#stage")!;
  stage.replaceChildren();
  const fragment = [
    ...spec.includes.map((name) => `#include <${name}>`),
    "out vec4 outColor;",
    `uniform float uTimeZero;`,
    `void main() { vec3 c = ${spec.body}; outColor = vec4(c, 1.0); }`
  ].join("\n");
  const surface = material.custom({ glsl: { fragment }, uniforms: { uTimeZero: { type: "f32", value: 0 } }, side: "double" });
  const app = createAuraApp(stage, {
    autoStart: false, pixelRatio: 1, resize: false,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    output: { toneMapping: "none", dither: false } as never,
    scene: scene().background("#202020")
      .camera(camera.perspective({ position: [0, 0, 3], target: [0, 0, 0], fov: 40 }))
      .add(primitives.plane({ name: "quad", size: [12, 1, 12], material: surface }).rotate(Math.PI / 2, 0, 0))
  });
  await app.ready();
  for (let i = 0; i < 6; i += 1) app.step(1 / 60);
  const blob = (await app.capture?.({ type: "png-blob" })) as Blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  const px = ctx.getImageData(bitmap.width >> 1, bitmap.height >> 1, 1, 1).data;
  const errors = (app.diagnostics().errors ?? []).map(String).slice(0, 4);
  app.dispose();
  return { id, centre: [px[0]!, px[1]!, px[2]!, px[3]!], errors };
}

window.__GLSL_CHUNKS__ = { compileAll, probeIds: Object.keys(PROBES), probe };
