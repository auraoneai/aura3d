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

const LIT1 = { lighting: "lit", environment: "equirect", lights: { dir: 1, point: 0, spot: 0, rect: 0, clustered: false, hemisphere: false } } as const;
const lobe = (id: string, bits: Record<string, boolean> = {}) => ({ lobe: id, maps: [] as string[], bits });

/**
 * T0-05 / 04-LOBES: records that splice prd04 chunks (compiled with
 * `core,materials,materials_transmission`). Done-when: every case compiles and
 * links with `programs.failed == 0`.
 */
const LOBE_CASES: readonly [string, Partial<ProgramFeatures>][] = [
  ["lobe-clearcoat", { ...LIT1, extensions: [lobe("clearcoat"), lobe("ior")] }],
  ["lobe-sheen", { ...LIT1, extensions: [lobe("sheen")] }],
  ["lobe-transmission", { ...LIT1, extensions: [lobe("transmission"), lobe("volume"), lobe("ior")], features: { "prd04.transmissionTarget": true } }],
  ["lobe-dispersion", { ...LIT1, extensions: [lobe("transmission"), lobe("dispersion")], features: { "prd04.transmissionTarget": true } }],
  ["lobe-iridescence", { ...LIT1, extensions: [lobe("iridescence", { film: true })] }],
  ["lobe-anisotropy-tangent", { ...LIT1, extensions: [lobe("anisotropy")], features: { "prd04.tangentFrame": true } }],
  ["lobe-all", { ...LIT1, extensions: ["clearcoat", "sheen", "transmission", "volume", "dispersion", "iridescence", "anisotropy", "ior", "specular", "emissive-strength"].map((id) => lobe(id)), features: { "prd04.transmissionTarget": true, "prd04.tangentFrame": true } }],
  ["feature-debug-view-lit", { ...LIT1, extensions: [lobe("clearcoat")], features: { "prd04.debugView": 8 } }],
  ["feature-debug-view-unlit", { features: { "prd04.debugView": 1 } }],
  ["feature-a2c-mask", { ...LIT1, alphaMode: "mask", features: { "prd04.alphaToCoverage": true } }],
  ["feature-uv-transform", { ...LIT1, maps: { baseColor: { uvSet: 0, transform: true } }, features: { "prd04.uvTransform": 1 } }]
];

export async function runProgramCompileTool(): Promise<ProgramCompileReport> {
  const errors: string[] = [];
  const { generateProgramImpl } = await import("../../../../packages/rendering/src/program/ProgramGenerator");
  const { normalizeProgramFeatures } = await import("../../../../packages/rendering/src/program/ProgramFeatures");
  const { resolveQrFlags } = await import("../../../../packages/engine/src/contracts/flags");
  await import("../../../../packages/rendering/src/lanes/prd01");
  await import("../../../../packages/rendering/src/lanes/prd04");

  const flags = resolveQrFlags({ env: { A3D_QR_CORE: "v2" } });
  const lobeFlags = resolveQrFlags({ env: { A3D_QR: "core,materials,materials_transmission" } });
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
  const all: [string, Partial<ProgramFeatures>, typeof flags][] = [
    ...CASES.map(([name, partial]) => [name, partial, flags] as [string, Partial<ProgramFeatures>, typeof flags]),
    ...LOBE_CASES.map(([name, partial]) => [name, partial, lobeFlags] as [string, Partial<ProgramFeatures>, typeof flags])
  ];
  for (const [name, partial, caseFlags] of all) {
    let program: { vertex: string; fragment: string };
    try {
      program = generateProgramImpl(normalizeProgramFeatures(partial), {
        flags: caseFlags,
        onDegradation: (d) => errors.push(`${name}: ${d.code}: ${d.message}`)
      });
    } catch (error) {
      errors.push(`${name}: generate: ${error instanceof Error ? error.message : String(error)}`);
      cases.push({ name, vertexOk: false, fragmentOk: false, linked: false, infoLog: String(error) });
      continue;
    }
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
      if (!linked) errors.push(`${name}: link: ${(infoLog ?? "").slice(0, 400)}`);
      gl.deleteProgram(prog);
    } else {
      infoLog = [vs.log, fs.log].filter(Boolean).join(" | ");
      if (infoLog) errors.push(`${name}: ${infoLog.slice(0, 400)}`);
    }
    cases.push({ name, vertexOk: !!vs.shader, fragmentOk: !!fs.shader, linked, infoLog });
  }
  return { cases, errors };
}
