import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  BloomPassV5,
  ColorGradingPassV5,
  DepthOfFieldPassV5,
  EffectComposerV5,
  FXAAPassV5,
  MotionBlurPassV5,
  OutlinePassV5,
  RenderPassV5,
  SMAAPassV5,
  SSAOPassV5,
  TAAPassV5,
  VignettePassV5,
  createV5BaseFrame
} from "../../packages/rendering/src";

interface V5PostprocessCheck {
  readonly name: string;
  readonly pass: boolean;
  readonly detail: string;
}

const requiredFiles = [
  "packages/rendering/src/threejs-compatibility/postprocess/EffectComposer.ts",
  "packages/rendering/src/threejs-compatibility/postprocess/RenderPass.ts",
  "packages/rendering/src/threejs-compatibility/postprocess/ShaderPass.ts",
  "packages/rendering/src/threejs-compatibility/postprocess/BloomPass.ts",
  "packages/rendering/src/threejs-compatibility/postprocess/SSAOPass.ts",
  "packages/rendering/src/threejs-compatibility/postprocess/TAAPass.ts",
  "packages/rendering/src/threejs-compatibility/postprocess/FXAAPass.ts",
  "packages/rendering/src/threejs-compatibility/postprocess/SMAAPass.ts",
  "packages/rendering/src/threejs-compatibility/postprocess/DepthOfFieldPass.ts",
  "packages/rendering/src/threejs-compatibility/postprocess/MotionBlurPass.ts",
  "packages/rendering/src/threejs-compatibility/postprocess/ColorGradingPass.ts",
  "packages/rendering/src/threejs-compatibility/postprocess/VignettePass.ts",
  "packages/rendering/src/threejs-compatibility/postprocess/OutlinePass.ts",
  "packages/three-compat/src/postprocessing/index.ts",
  "docs/project/three-compat-roadmap-postprocess-migration.md",
  "tests/unit/rendering/three-compat-postprocess.test.ts",
  "tests/browser/three-compat-postprocess.spec.ts"
] as const;

function check(name: string, pass: boolean, detail: string): V5PostprocessCheck {
  return { name, pass, detail };
}

const composer = new EffectComposerV5()
  .addPass(new RenderPassV5())
  .addPass(new BloomPassV5())
  .addPass(new SSAOPassV5())
  .addPass(new TAAPassV5())
  .addPass(new FXAAPassV5())
  .addPass(new SMAAPassV5())
  .addPass(new DepthOfFieldPassV5())
  .addPass(new MotionBlurPassV5())
  .addPass(new ColorGradingPassV5())
  .addPass(new VignettePassV5())
  .addPass(new OutlinePassV5());
const output = composer.render(createV5BaseFrame());
const checks: V5PostprocessCheck[] = [
  check("required-files-present", requiredFiles.every((file) => existsSync(resolve(file))), requiredFiles.filter((file) => !existsSync(resolve(file))).join(", ") || "all V5 postprocess files exist"),
  check("composer-chain", composer.passes.length >= 11 && output.label === "rendered-scene", `${composer.passes.length} passes`),
  check("cinematic-effects", output.bloom > 0 && output.ambientOcclusion > 0 && output.blur > 0 && output.contrast > 1 && output.vignette > 0, JSON.stringify(output)),
  check("antialiasing", output.sharpness > 0.4, `sharpness=${output.sharpness}`),
  check("migration-doc", existsSync(resolve("docs/project/three-compat-roadmap-postprocess-migration.md")), "postprocess migration doc exists"),
  check("browser-screenshots", existsSync(resolve("tests/reports/three-compat-postprocess-before.png")) && existsSync(resolve("tests/reports/three-compat-postprocess-after.png")), "before/after screenshots exist")
];

const pass = checks.every((item) => item.pass);
const report = {
  schema: "g3d-three-compat-postprocess-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass,
  output,
  passNames: composer.passes.map((item) => item.name),
  checks
};

const reportPath = resolve("tests/reports/three-compat-postprocess-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(`V5 postprocess readiness passed: ${composer.passes.length} passes.`);
