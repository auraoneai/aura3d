/**
 * `tools/shader-lint` (PRD-01 §15 / §16.1, row 01-S7): fails when a generated
 * or registered GLSL source carries one of the legacy look hacks that the
 * C-02 generator replaced. The frozen legacy files (`ShaderLibrary*.ts`,
 * `ShaderChunks.ts`, `production-runtime/shaders/**`) are not linted until
 * the flag-removal phase; this lints what the generator emits and what lanes
 * register through `registerShaderChunk`.
 *
 * Run: `pnpm exec tsx tools/shader-lint/index.ts` (exit 1 on any violation).
 * The unit `tests/qr/prd01/unit/shader-lint.test.ts` runs it in `pnpm test:unit`.
 */

export interface ShaderLintRule {
  readonly id: string;
  readonly pattern: RegExp;
  readonly why: string;
}

export const SHADER_LINT_RULES: readonly ShaderLintRule[] = [
  { id: "fudge-mix-1.1", pattern: /mix\(\s*1\.1\s*,/, why: "legacy brightness fudge `mix(1.1, …)`" },
  { id: "fudge-mix-1.0-0.18", pattern: /mix\(\s*1\.0\s*,\s*0\.18/, why: "legacy grey-floor fudge `mix(1.0, 0.18 …)`" },
  { id: "rough-environment-floor", pattern: /roughEnvironmentFloor/, why: "legacy rough-environment floor" },
  { id: "source-paint", pattern: /sourcePaint/, why: "legacy source-paint tint" },
  { id: "material-red-paint-gate", pattern: /materialRedPaintGate/, why: "legacy red-paint gate" },
  { id: "advanced-pbr-lobes", pattern: /a3dApplyAdvancedPbrLobes/, why: "legacy lobe patch; lobes are C-03 chunks" },
  { id: "apply-metal-rough", pattern: /a3dApplyMetalRough/, why: "legacy metal-rough patch" },
  { id: "output-color-space-uniform", pattern: /u_outputColorSpace/, why: "output encoding belongs to OutputPass (C-05)" },
  { id: "aces-inline", pattern: /2\.51\s*\*\s*color/, why: "inline ACES fit; tone mapping belongs to OutputPass (C-05)" },
  { id: "step-uniform-feature-gate", pattern: /step\(\s*0\.5\s*,\s*u_/, why: "runtime uniform feature gate; features are compile-time defines" }
];

export interface ShaderLintViolation {
  readonly source: string;
  readonly rule: string;
  readonly line: number;
  readonly text: string;
  readonly why: string;
}

export interface ShaderLintInput {
  readonly name: string;
  readonly glsl: string;
}

/** Lint one GLSL source. Comment-only lines are still linted (a hack in a comment is a TODO to delete). */
export function lintShaderSource(input: ShaderLintInput): ShaderLintViolation[] {
  const violations: ShaderLintViolation[] = [];
  const lines = input.glsl.split("\n");
  lines.forEach((text, index) => {
    for (const rule of SHADER_LINT_RULES) {
      if (rule.pattern.test(text)) {
        violations.push({ source: input.name, rule: rule.id, line: index + 1, text: text.trim(), why: rule.why });
      }
    }
  });
  return violations;
}

export function lintShaderSources(inputs: readonly ShaderLintInput[]): ShaderLintViolation[] {
  return inputs.flatMap((input) => lintShaderSource(input));
}

export function formatViolations(violations: readonly ShaderLintViolation[]): string {
  return violations.map((v) => `${v.source}:${v.line} [${v.rule}] ${v.why}\n    ${v.text}`).join("\n");
}

/**
 * Generated sources for a representative record set: every forward/depth
 * variant the program-compile browser tool covers, under `A3D_QR_CORE=v2`.
 */
export async function generatedProgramSources(): Promise<ShaderLintInput[]> {
  const { generateProgramImpl } = await import("../../packages/rendering/src/program/ProgramGenerator");
  const { normalizeProgramFeatures } = await import("../../packages/rendering/src/program/ProgramFeatures");
  const { resolveQrFlags } = await import("../../packages/engine/src/contracts/flags");
  await import("../../packages/rendering/src/lanes/prd01");
  const flags = resolveQrFlags({ env: { A3D_QR_CORE: "v2" } });
  const lit = { dir: 1, point: 0, spot: 0, rect: 0, clustered: false, hemisphere: false } as const;
  const records: readonly [string, Record<string, unknown>][] = [
    ["unlit-opaque", {}],
    ["unlit-blend", { alphaMode: "blend" }],
    ["lit-1dir", { lighting: "lit", lights: lit }],
    ["lit-full8", { lighting: "lit", lights: { dir: 2, point: 4, spot: 2, rect: 0, clustered: false, hemisphere: false } }],
    ["lit-clustered", { lighting: "lit", lights: { dir: 2, point: 8, spot: 0, rect: 0, clustered: true, hemisphere: false } }],
    ["lit-maps", { lighting: "lit", lights: lit, maps: { baseColor: { uvSet: 0, transform: false }, normal: { uvSet: 0, transform: false }, metallicRoughness: { uvSet: 0, transform: false }, occlusion: { uvSet: 1, transform: false }, emissive: { uvSet: 0, transform: false } } }],
    ["lit-env-equirect", { lighting: "lit", environment: "equirect", lights: lit }],
    ["mask-instanced", { alphaMode: "mask", instancing: { color: true } }],
    ["vertex-colors", { vertexColors: true, lighting: "lit", lights: lit }],
    ["flat-fog", { flatShading: true, fog: "exp2", lighting: "lit", lights: lit }],
    ["depth-mask", { pass: "depth", alphaMode: "mask", maps: { baseColor: { uvSet: 0, transform: false } } }],
    ["distance", { pass: "distance" }],
    ["background-coverage", { backgroundCoverage: true }]
  ];
  const out: ShaderLintInput[] = [];
  for (const [name, partial] of records) {
    const program = generateProgramImpl(normalizeProgramFeatures(partial), { flags });
    out.push({ name: `generated:${name}:vertex`, glsl: program.vertex }, { name: `generated:${name}:fragment`, glsl: program.fragment });
  }
  return out;
}

async function main(): Promise<void> {
  const violations = lintShaderSources(await generatedProgramSources());
  if (violations.length > 0) {
    console.error(`shader-lint: ${violations.length} violation(s)\n${formatViolations(violations)}`);
    process.exitCode = 1;
    return;
  }
  console.log("shader-lint: generated sources clean");
}

const invokedDirectly = typeof process !== "undefined" && process.argv[1] !== undefined && /tools[\\/]shader-lint[\\/]index\.ts$/.test(process.argv[1]);
if (invokedDirectly) {
  void main();
}
