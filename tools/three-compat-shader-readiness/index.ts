import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { NodeMaterialThreeCompat, RawShaderMaterialThreeCompat, SHADER_CHUNKS_THREE_COMPAT, ShaderMaterialThreeCompat, diagnoseThreeCompatShader } from "../../packages/rendering/src";

interface ThreeCompatShaderCheck {
  readonly name: string;
  readonly pass: boolean;
  readonly detail: string;
}

const requiredFiles = [
  "packages/rendering/src/threejs-compatibility/shaders/ShaderMaterial.ts",
  "packages/rendering/src/threejs-compatibility/shaders/RawShaderMaterial.ts",
  "packages/rendering/src/threejs-compatibility/shaders/Uniforms.ts",
  "packages/rendering/src/threejs-compatibility/shaders/ThreeCompatShaderChunks.ts",
  "packages/rendering/src/threejs-compatibility/shaders/NodeMaterial.ts",
  "packages/rendering/src/threejs-compatibility/shaders/ShaderDiagnostics.ts",
  "packages/three-compat/src/shaders/index.ts",
  "apps/three-compat-shader-lab-pro/index.html",
  "apps/three-compat-shader-lab-pro/src/main.ts",
  "tests/unit/rendering/three-compat-shaders.test.ts",
  "tests/browser/three-compat-shader-lab.spec.ts"
] as const;

function check(name: string, pass: boolean, detail: string): ThreeCompatShaderCheck {
  return { name, pass, detail };
}

const vertex = "void main() { gl_Position = vec4(0.0, 0.0, 0.0, 1.0); }";
const fragment = "precision highp float; out vec4 fragColor; void main() { fragColor = vec4(1.0); }";
const material = new ShaderMaterialThreeCompat(vertex, fragment).setUniform("uTime", 1).setUniform("uColor", [1, 1, 1]);
const raw = new RawShaderMaterialThreeCompat(vertex, fragment);
const node = new NodeMaterialThreeCompat().addNode({ id: "color", kind: "color" }).addNode({ id: "output", kind: "output" });
const diagnostics = material.diagnose();
const compileError = diagnoseThreeCompatShader(vertex, "precision highp float;");
const checks: ThreeCompatShaderCheck[] = [
  check("required-files-present", requiredFiles.every((file) => existsSync(resolve(file))), requiredFiles.filter((file) => !existsSync(resolve(file))).join(", ") || "all Three.js compatibility shader files exist"),
  check("shader-material", diagnostics.pass && material.uniforms.entries().length === 2, JSON.stringify(diagnostics)),
  check("raw-shader-material", raw.glslVersion === "300 es", raw.glslVersion),
  check("node-material", node.compileGraph().hasOutput && node.compileGraph().nodeCount === 2, JSON.stringify(node.compileGraph())),
  check("chunks", Object.keys(SHADER_CHUNKS_THREE_COMPAT).length >= 4, Object.keys(SHADER_CHUNKS_THREE_COMPAT).join(", ")),
  check("compile-errors", !compileError.pass && compileError.errors.length > 0, compileError.errors.join(", ")),
  check("shader-lab-app", existsSync(resolve("apps/three-compat-shader-lab-pro/index.html")) && existsSync(resolve("apps/three-compat-shader-lab-pro/src/main.ts")), "shader lab app exists")
];

const pass = checks.every((item) => item.pass);
const report = {
  schema: "a3d-three-compat-shader-readiness",
  generatedAt: new Date().toISOString(),
  pass,
  diagnostics,
  compileError,
  checks
};

const reportPath = resolve("tests/reports/three-compat-shader-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log("Three.js compatibility shader readiness passed: shader material, raw material, uniforms, nodes, diagnostics, and app are wired.");
