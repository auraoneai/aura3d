/**
 * `program-compile` harness tool (PRD-01 §15 Phase-3): generates every
 * representative C-02 feature record through the lane-01 generator and
 * compiles + links each pair on a real WebGL2 context. Reports per-case
 * compile/link status so the spec can assert every snapshot compiles.
 */

import type { ProgramFeatures } from "../../../../packages/rendering/src/contracts/program";

export interface ProgramCompileCase {
  readonly name: string;
  readonly vertexOk: boolean;
  readonly fragmentOk: boolean;
  readonly linked: boolean;
  readonly infoLog?: string;
}

export interface ProgramCompileReport {
  readonly cases: readonly ProgramCompileCase[];
  readonly errors: readonly string[];
}

const CASES: readonly [string, Partial<ProgramFeatures>][] = [
  ["unlit-opaque", {}],
  ["unlit-blend", { alphaMode: "blend" }],
  ["lit-1dir", { lighting: "lit", lights: { dir: 1, point: 0, spot: 0, rect: 0, clustered: false, hemisphere: false } }],
  ["lit-full8", { lighting: "lit", lights: { dir: 2, point: 4, spot: 2, rect: 0, clustered: false, hemisphere: false } }],
  ["lit-clustered", { lighting: "lit", lights: { dir: 2, point: 8, spot: 0, rect: 0, clustered: true, hemisphere: false } }],
  ["lit-maps", { lighting: "lit", maps: { baseColor: { uvSet: 0, transform: false }, normal: { uvSet: 0, transform: false }, metallicRoughness: { uvSet: 0, transform: false }, occlusion: { uvSet: 1, transform: false }, emissive: { uvSet: 0, transform: false } } }],
  ["lit-env-equirect", { lighting: "lit", environment: "equirect", lights: { dir: 1, point: 0, spot: 0, rect: 0, clustered: false, hemisphere: false } }],
  ["mask-instanced", { alphaMode: "mask", instancing: { color: true } }],
  ["vertex-colors", { vertexColors: true, lighting: "lit", lights: { dir: 1, point: 0, spot: 0, rect: 0, clustered: false, hemisphere: false } }],
  ["flat-fog", { flatShading: true, fog: "exp2", lighting: "lit", lights: { dir: 1, point: 0, spot: 0, rect: 0, clustered: false, hemisphere: false } }],
  ["depth-mask", { pass: "depth", alphaMode: "mask", maps: { baseColor: { uvSet: 0, transform: false } } }],
  ["distance", { pass: "distance" }],
  ["background-coverage", { backgroundCoverage: true }]
];

export async function runProgramCompileTool(): Promise<ProgramCompileReport> {
  const errors: string[] = [];
  const { generateProgramImpl } = await import("../../../../packages/rendering/src/program/ProgramGenerator");
  const { normalizeProgramFeatures } = await import("../../../../packages/rendering/src/program/ProgramFeatures");
  const { resolveQrFlags } = await import("../../../../packages/engine/src/contracts/flags");
  await import("../../../../packages/rendering/src/lanes/prd01");

  const flags = resolveQrFlags({ env: { A3D_QR_CORE: "v2" } });
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2");
  if (!gl) return { cases: [], errors: ["webgl2 unavailable"] };

  const compile = (type: number, source: string): { shader: WebGLShader | null; log: string } => {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    const log = gl.getShaderInfoLog(shader) ?? "";
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return { shader: null, log };
    return { shader, log };
  };

  const cases: ProgramCompileCase[] = [];
  for (const [name, partial] of CASES) {
    const program = generateProgramImpl(normalizeProgramFeatures(partial), { flags });
    const vs = compile(gl.VERTEX_SHADER, program.vertex);
    const fs = compile(gl.FRAGMENT_SHADER, program.fragment);
    let linked = false;
    let infoLog: string | undefined;
    if (vs.shader && fs.shader) {
      const prog = gl.createProgram()!;
      gl.attachShader(prog, vs.shader);
      gl.attachShader(prog, fs.shader);
      gl.linkProgram(prog);
      linked = gl.getProgramParameter(prog, gl.LINK_STATUS) as boolean;
      infoLog = gl.getProgramInfoLog(prog) ?? undefined;
      gl.deleteProgram(prog);
    } else {
      infoLog = [vs.log, fs.log].filter(Boolean).join(" | ");
      if (infoLog) errors.push(`${name}: ${infoLog.slice(0, 400)}`);
    }
    cases.push({ name, vertexOk: !!vs.shader, fragmentOk: !!fs.shader, linked, infoLog });
  }
  return { cases, errors };
}
