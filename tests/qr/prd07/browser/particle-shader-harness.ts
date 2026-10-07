// PRD-07 P1-T9 — compiles every particle program define combination on a real
// WebGL2 context (remote macos-14 runner; no draw, compile+link only).
import {
  particleFragmentSource,
  particleProgramKey,
  particleVertexSource,
  type ParticleProgramDefines
} from "/packages/rendering/src/vfx/shaders/particle.glsl.js";

interface ShaderCompileResult {
  readonly status: "ready" | "error";
  readonly combinations?: number;
  readonly failures?: readonly { key: string; stage: string; log: string }[];
  readonly error?: string;
}

declare global {
  interface Window {
    __QR_PRD07_SHADER__?: ShaderCompileResult;
  }
}

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

function main(): void {
  const canvas = document.getElementById("glstage") as HTMLCanvasElement;
  const gl = canvas.getContext("webgl2", { antialias: false, depth: false });
  if (!gl) {
    window.__QR_PRD07_SHADER__ = { status: "error", error: "WebGL2 context unavailable" };
    return;
  }
  const bits = ["stretch", "frameBlend", "softParticles", "blendAdditive", "blendAdditiveFallback", "unpremultiplyOutput", "proceduralSoftDot", "fogAnalytic"] as const;
  const failures: { key: string; stage: string; log: string }[] = [];
  let combinations = 0;
  for (let mask = 0; mask < (1 << bits.length); mask += 1) {
    const defines: Record<string, boolean> = {};
    bits.forEach((bit, i) => { defines[bit] = ((mask >> i) & 1) === 1; });
    const d = defines as unknown as ParticleProgramDefines;
    const key = particleProgramKey(d);
    const vLog = compile(gl, gl.VERTEX_SHADER, particleVertexSource(d));
    if (vLog) {
      failures.push({ key, stage: "vertex", log: vLog.slice(0, 500) });
      continue;
    }
    const fLog = compile(gl, gl.FRAGMENT_SHADER, particleFragmentSource(d));
    if (fLog) {
      failures.push({ key, stage: "fragment", log: fLog.slice(0, 500) });
      continue;
    }
    // Link each combo to catch mismatched varyings / unbound outputs.
    const vsh = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vsh, particleVertexSource(d));
    gl.compileShader(vsh);
    const fsh = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fsh, particleFragmentSource(d));
    gl.compileShader(fsh);
    const program = gl.createProgram()!;
    gl.attachShader(program, vsh);
    gl.attachShader(program, fsh);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      failures.push({ key, stage: "link", log: (gl.getProgramInfoLog(program) ?? "link failed").slice(0, 500) });
    }
    gl.deleteProgram(program);
    gl.deleteShader(vsh);
    gl.deleteShader(fsh);
    combinations += 1;
  }
  window.__QR_PRD07_SHADER__ = { status: "ready", combinations, failures };
}

main();
