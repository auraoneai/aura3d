// PRD-07 P4-T2 — compiles the a3d_prd07_fog chunk + the sky program fog
// variants on a real WebGL2 context (remote macos-14 runner; compile+link
// only, no draw).
import { PRD07_FOG_CHUNK_GLSL } from "/packages/rendering/src/atmosphere/shaders/fog.glsl.js";
import { skyFragmentSource, skyVertexSource } from "/packages/rendering/src/atmosphere/sky.glsl.js";
import type { SkyProgramDefines } from "/packages/rendering/src/atmosphere/SkyEval.js";

interface CompileResult {
  readonly status: "ready" | "error";
  readonly combinations?: number;
  readonly failures?: readonly { key: string; stage: string; log: string }[];
  readonly error?: string;
}

declare global {
  interface Window {
    __QR_PRD07_FOG_SHADER__?: CompileResult;
  }
}

const VERT = `#version 300 es
precision highp float;
out vec3 vWorld;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
  vWorld = vec3(p * 10.0, -20.0);
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

// Minimal fragment embedding the chunk and exercising every entry point.
const CHUNK_FRAG = (froxel: boolean) => `#version 300 es
precision highp float;
${froxel ? "#define FOG_VOLUMETRIC 1\n" : ""}
in vec3 vWorld;
out vec4 fragColor;
${froxel ? `uniform sampler3D u_froxel;\nuniform mat4 u_froxelTransform;\n` : ""}
${PRD07_FOG_CHUNK_GLSL}
void main() {
  vec3 c = a3dApplyFog(vec3(0.5, 0.4, 0.3), vWorld);
  float f = a3dFogAmount(vWorld);
  fragColor = vec4(c, f);
}
`;

function compile(gl: WebGL2RenderingContext, type: number, source: string): string | null {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? "compile failed";
    gl.deleteShader(shader);
    return log;
  }
  return null;
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): string | null {
  const vsh = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(vsh, vs);
  gl.compileShader(vsh);
  const fsh = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(fsh, fs);
  gl.compileShader(fsh);
  const program = gl.createProgram()!;
  gl.attachShader(program, vsh);
  gl.attachShader(program, fsh);
  gl.linkProgram(program);
  const ok = gl.getProgramParameter(program, gl.LINK_STATUS);
  const log = ok ? null : (gl.getProgramInfoLog(program) ?? "link failed").slice(0, 500);
  gl.deleteProgram(program);
  gl.deleteShader(vsh);
  gl.deleteShader(fsh);
  return log;
}

function main(): void {
  const canvas = document.getElementById("glstage") as HTMLCanvasElement;
  const gl = canvas.getContext("webgl2", { antialias: false, depth: false });
  if (!gl) {
    window.__QR_PRD07_FOG_SHADER__ = { status: "error", error: "WebGL2 context unavailable" };
    return;
  }
  const failures: { key: string; stage: string; log: string }[] = [];
  let combinations = 0;

  // 1) Chunk standalone (no env-uniform guard) + FOG_VOLUMETRIC variant.
  for (const froxel of [false, true]) {
    const key = `a3d_prd07_fog${froxel ? ".froxel" : ""}`;
    const vLog = compile(gl, gl.VERTEX_SHADER, VERT);
    const fLog = compile(gl, gl.FRAGMENT_SHADER, CHUNK_FRAG(froxel));
    if (vLog) failures.push({ key, stage: "vertex", log: vLog.slice(0, 500) });
    else if (fLog) failures.push({ key, stage: "fragment", log: fLog.slice(0, 500) });
    else {
      const lLog = link(gl, VERT, CHUNK_FRAG(froxel));
      if (lLog) failures.push({ key, stage: "link", log: lLog });
      else combinations += 1;
    }
  }

  // 2) Sky program × {fog off, fog on} for every model — fog on must compile
  // with the env-uniform guard active (sky declares them itself).
  for (const model of ["PREETHAM", "GRADIENT", "COLOR", "NONE"] as const) {
    for (const fog of [false, true]) {
      const d: SkyProgramDefines = { model, stars: true, clouds: true, sunDisc: model === "PREETHAM", moon: false, fog };
      const key = `prd07.sky.${model}${fog ? ".fog" : ""}`;
      const vLog = compile(gl, gl.VERTEX_SHADER, skyVertexSource());
      const fLog = compile(gl, gl.FRAGMENT_SHADER, skyFragmentSource(d));
      if (vLog) failures.push({ key, stage: "vertex", log: vLog.slice(0, 500) });
      else if (fLog) failures.push({ key, stage: "fragment", log: fLog.slice(0, 500) });
      else {
        const lLog = link(gl, skyVertexSource(), skyFragmentSource(d));
        if (lLog) failures.push({ key, stage: "link", log: lLog });
        else combinations += 1;
      }
    }
  }

  window.__QR_PRD07_FOG_SHADER__ = { status: "ready", combinations, failures };
}

main();
