import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { migrateThreeToA3D } from "../../packages/three-compat/src";

const requiredFiles = [
  "packages/three-compat/src/index.ts",
  "packages/three-compat/src/migration/ImportMap.ts",
  "packages/three-compat/src/migration/ThreeToA3DAdapter.ts",
  "packages/three-compat/src/migration/CompatibilityWarnings.ts",
  "tools/three-compat-migrate-three/index.ts",
  "tools/three-compat-threejs-example-migrator/index.ts",
  "tests/unit/three-compat/three-compat-migration.test.ts",
  "tests/integration/three-compat-threejs-migration.test.ts",
  "tests/browser/three-compat-threejs-migration.spec.ts"
] as const;
const source = 'import * as THREE from "three"; import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"; import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"; const renderer = new THREE.WebGLRenderer(); renderer.setSize(800,600); new GLTFLoader(); new OrbitControls();';
const result = migrateThreeToA3D(source);
const checks = [
  { name: "required-files-present", pass: requiredFiles.every((file) => existsSync(resolve(file))), detail: requiredFiles.filter((file) => !existsSync(resolve(file))).join(", ") || "all migration files exist" },
  { name: "rewrites", pass: result.rewrittenImports >= 3 && result.code.includes("createRendererV5") && result.code.includes("renderer.resize"), detail: result.code },
  { name: "warnings", pass: result.warnings.length >= 3, detail: result.warnings.map((warning) => warning.code).join(", ") }
];
const pass = checks.every((item) => item.pass);
const report = { schema: "a3d-three-compat-migration-readiness/v1", generatedAt: new Date().toISOString(), pass, result, checks };
const reportPath = resolve("tests/reports/three-compat-migration-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(`V5 migration readiness passed: ${result.rewrittenImports} import groups rewritten.`);
