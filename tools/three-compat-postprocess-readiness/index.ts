import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  BloomPassThreeCompat,
  ColorGradingPassThreeCompat,
  DepthOfFieldPassThreeCompat,
  EffectComposerThreeCompat,
  FXAAPassThreeCompat,
  MotionBlurPassThreeCompat,
  OutlinePassThreeCompat,
  RenderPassThreeCompat,
  SMAAPassThreeCompat,
  SSAOPassThreeCompat,
  TAAPassThreeCompat,
  VignettePassThreeCompat,
  createThreeCompatBaseFrame,
  createThreeCompatDemoFrame
} from "../../packages/rendering/src";

interface ThreeCompatPostprocessCheck {
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
  "docs/project/migration.md",
  "tests/unit/rendering/three-compat-postprocess.test.ts",
  "tests/browser/three-compat-postprocess.spec.ts"
] as const;

function check(name: string, pass: boolean, detail: string): ThreeCompatPostprocessCheck {
  return { name, pass, detail };
}

const composer = new EffectComposerThreeCompat()
  .addPass(new RenderPassThreeCompat())
  .addPass(new BloomPassThreeCompat())
  .addPass(new SSAOPassThreeCompat())
  .addPass(new TAAPassThreeCompat())
  .addPass(new FXAAPassThreeCompat())
  .addPass(new SMAAPassThreeCompat())
  .addPass(new DepthOfFieldPassThreeCompat())
  .addPass(new MotionBlurPassThreeCompat())
  .addPass(new ColorGradingPassThreeCompat())
  .addPass(new VignettePassThreeCompat())
  .addPass(new OutlinePassThreeCompat());
const output = composer.render(createThreeCompatBaseFrame());
const visualOutput = composer.render(createThreeCompatDemoFrame("visual-source"));
const checks: ThreeCompatPostprocessCheck[] = [
  check("required-files-present", requiredFiles.every((file) => existsSync(resolve(file))), requiredFiles.filter((file) => !existsSync(resolve(file))).join(", ") || "all Three.js compatibility postprocess files exist"),
  check("composer-chain", composer.passes.length >= 11 && output.label === "rendered-scene", `${composer.passes.length} passes`),
  check("cinematic-effects", output.bloom > 0 && output.ambientOcclusion > 0 && output.blur > 0 && output.contrast > 1 && output.vignette > 0, JSON.stringify(output)),
  check("pixel-kernel-output", (visualOutput.visualChangedPixels ?? 0) > 1000 && (visualOutput.visualPasses?.length ?? 0) >= 8, `visualChangedPixels=${visualOutput.visualChangedPixels ?? 0}; passes=${visualOutput.visualPasses?.join(",") ?? ""}`),
  check("antialiasing", output.sharpness > 0.4, `sharpness=${output.sharpness}`),
  check("migration-doc", existsSync(resolve("docs/project/migration.md")), "postprocess migration doc exists"),
  check("browser-screenshots", existsSync(resolve("tests/reports/three-compat-postprocess-before.png")) && existsSync(resolve("tests/reports/three-compat-postprocess-after.png")), "before/after screenshots exist")
];

const pass = checks.every((item) => item.pass);
const report = {
  schema: "a3d-three-compat-postprocess-readiness",
  generatedAt: new Date().toISOString(),
  pass,
  output,
  visualOutput: {
    visualChangedPixels: visualOutput.visualChangedPixels,
    visualPasses: visualOutput.visualPasses,
    visualDiagnostics: visualOutput.visualDiagnostics
  },
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

console.log(`Three.js compatibility postprocess readiness passed: ${composer.passes.length} passes.`);
