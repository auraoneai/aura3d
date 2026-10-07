import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { migrateThreeToA3D } from "../../packages/aura3d-cli/src/migrate-three/ThreeToA3DAdapter";

const requiredFiles = [
  // PRD-15 T6.2: migration surface moved from the deleted @aura3d/three-compat package
  // into `aura3d migrate three` (packages/aura3d-cli).
  "packages/aura3d-cli/src/migrate-three/parse.ts",
  "packages/aura3d-cli/src/migrate-three/mappings.ts",
  "packages/aura3d-cli/src/migrate-three/emit.ts",
  "packages/aura3d-cli/src/migrate-three/report.ts",
  "packages/aura3d-cli/src/migrate-three/ImportMap.ts",
  "packages/aura3d-cli/src/migrate-three/ThreeToA3DAdapter.ts",
  "packages/aura3d-cli/src/migrate-three/CompatibilityWarnings.ts",
  "tools/three-compat-migrate-three/index.ts",
  "tests/unit/aura3d-cli/migrate-three.test.ts"
] as const;
const source = 'import * as THREE from "three"; import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"; import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"; const renderer = new THREE.WebGLRenderer(); renderer.setSize(800,600); new GLTFLoader(); new OrbitControls();';
const result = migrateThreeToA3D(source);
const checks = [
  { name: "required-files-present", pass: requiredFiles.every((file) => existsSync(resolve(file))), detail: requiredFiles.filter((file) => !existsSync(resolve(file))).join(", ") || "all migration files exist" },
  { name: "rewrites", pass: result.rewrittenImports >= 3 && result.code.includes("createThreeCompatRenderer") && result.code.includes("renderer.resize"), detail: result.code },
  { name: "warnings", pass: result.warnings.length >= 3, detail: result.warnings.map((warning) => warning.code).join(", ") }
];
const pass = checks.every((item) => item.pass);
const report = { schema: "a3d-three-compat-migration-readiness", generatedAt: new Date().toISOString(), pass, result, checks };
const reportPath = resolve("tests/reports/three-compat-migration-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(`Three.js compatibility migration readiness passed: ${result.rewrittenImports} import groups rewritten.`);
