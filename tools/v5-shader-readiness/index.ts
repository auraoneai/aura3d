import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { NodeMaterialV5, RawShaderMaterialV5, SHADER_CHUNKS_V5, ShaderMaterialV5, diagnoseV5Shader } from "../../packages/rendering/src";

interface V5ShaderCheck {
  readonly name: string;
  readonly pass: boolean;
  readonly detail: string;
}

const requiredFiles = [
  "packages/rendering/src/v5/shaders/ShaderMaterial.ts",
  "packages/rendering/src/v5/shaders/RawShaderMaterial.ts",
  "packages/rendering/src/v5/shaders/Uniforms.ts",
  "packages/rendering/src/v5/shaders/ShaderChunksV5.ts",
  "packages/rendering/src/v5/shaders/NodeMaterial.ts",
  "packages/rendering/src/v5/shaders/ShaderDiagnostics.ts",
  "packages/three-compat/src/shaders/index.ts",
  "apps/v5-shader-lab-pro/index.html",
  "apps/v5-shader-lab-pro/src/main.ts",
  "tests/unit/rendering/v5-shaders.test.ts",
  "tests/browser/v5-shader-lab.spec.ts"
] as const;

function check(name: string, pass: boolean, detail: string): V5ShaderCheck {
  return { name, pass, detail };
}

const vertex = "void main() { gl_Position = vec4(0.0, 0.0, 0.0, 1.0); }";
const fragment = "precision highp float; out vec4 fragColor; void main() { fragColor = vec4(1.0); }";
const material = new ShaderMaterialV5(vertex, fragment).setUniform("uTime", 1).setUniform("uColor", [1, 1, 1]);
const raw = new RawShaderMaterialV5(vertex, fragment);
const node = new NodeMaterialV5().addNode({ id: "color", kind: "color" }).addNode({ id: "output", kind: "output" });
const diagnostics = material.diagnose();
const compileError = diagnoseV5Shader(vertex, "precision highp float;");
const checks: V5ShaderCheck[] = [
  check("required-files-present", requiredFiles.every((file) => existsSync(resolve(file))), requiredFiles.filter((file) => !existsSync(resolve(file))).join(", ") || "all V5 shader files exist"),
  check("shader-material", diagnostics.pass && material.uniforms.entries().length === 2, JSON.stringify(diagnostics)),
  check("raw-shader-material", raw.glslVersion === "300 es", raw.glslVersion),
  check("node-material", node.compileGraph().hasOutput && node.compileGraph().nodeCount === 2, JSON.stringify(node.compileGraph())),
  check("chunks", Object.keys(SHADER_CHUNKS_V5).length >= 4, Object.keys(SHADER_CHUNKS_V5).join(", ")),
  check("compile-errors", !compileError.pass && compileError.errors.length > 0, compileError.errors.join(", ")),
  check("shader-lab-app", existsSync(resolve("apps/v5-shader-lab-pro/index.html")) && existsSync(resolve("apps/v5-shader-lab-pro/src/main.ts")), "shader lab app exists")
];

const pass = checks.every((item) => item.pass);
const report = {
  schema: "g3d-v5-shader-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass,
  diagnostics,
  compileError,
  checks
};

const reportPath = resolve("tests/reports/v5-shader-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log("V5 shader readiness passed: shader material, raw material, uniforms, nodes, diagnostics, and app are wired.");
