import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  THREE_COMPAT_COMPAT_GEOMETRY_TYPES,
  THREE_COMPAT_COMPAT_MATERIAL_TYPES,
  THREE_COMPAT_COMPAT_TEXTURE_SETTINGS,
  WebGLMultipleRenderTargetsCompat,
  WebGLRenderTargetCompat
} from "../../packages/three-compat/src";

interface ThreeCompatMaterialGeometryCompatCheck {
  readonly name: string;
  readonly pass: boolean;
  readonly detail: string;
}

const requiredFiles = [
  "packages/three-compat/src/geometries/index.ts",
  "packages/three-compat/src/textures/index.ts",
  "packages/three-compat/src/materials/index.ts",
  "packages/three-compat/src/render-targets/index.ts",
  "tests/unit/three-compat/three-compat-material-geometry-compat.test.ts",
  "tests/browser/three-compat-material-geometry-compat.spec.ts"
] as const;

function check(name: string, pass: boolean, detail: string): ThreeCompatMaterialGeometryCompatCheck {
  return { name, pass, detail };
}

const target = new WebGLRenderTargetCompat(128, 128, 4);
const mrt = new WebGLMultipleRenderTargetsCompat(128, 128, 4);
const checks: ThreeCompatMaterialGeometryCompatCheck[] = [
  check("required-files-present", requiredFiles.every((file) => existsSync(resolve(file))), requiredFiles.filter((file) => !existsSync(resolve(file))).join(", ") || "all material/geometry compat files exist"),
  check("geometry-coverage", THREE_COMPAT_COMPAT_GEOMETRY_TYPES.length >= 9, THREE_COMPAT_COMPAT_GEOMETRY_TYPES.join(", ")),
  check("material-coverage", THREE_COMPAT_COMPAT_MATERIAL_TYPES.length >= 9, THREE_COMPAT_COMPAT_MATERIAL_TYPES.join(", ")),
  check("texture-settings", THREE_COMPAT_COMPAT_TEXTURE_SETTINGS.length >= 6, THREE_COMPAT_COMPAT_TEXTURE_SETTINGS.join(", ")),
  check("render-targets", target.depthTexture !== null && mrt.textures.length >= 4, `${target.type}, ${mrt.type}:${mrt.textures.length}`)
];

const pass = checks.every((item) => item.pass);
const report = {
  schema: "a3d-three-compat-material-geometry-compat-readiness",
  generatedAt: new Date().toISOString(),
  pass,
  geometryTypes: THREE_COMPAT_COMPAT_GEOMETRY_TYPES,
  materialTypes: THREE_COMPAT_COMPAT_MATERIAL_TYPES,
  textureSettings: THREE_COMPAT_COMPAT_TEXTURE_SETTINGS,
  checks
};

const reportPath = resolve("tests/reports/three-compat-material-geometry-compat-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(`Three.js compatibility material/geometry compat readiness passed: ${THREE_COMPAT_COMPAT_GEOMETRY_TYPES.length} geometries, ${THREE_COMPAT_COMPAT_MATERIAL_TYPES.length} materials.`);
