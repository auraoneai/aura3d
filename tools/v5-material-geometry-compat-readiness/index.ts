import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  V5_COMPAT_GEOMETRY_TYPES,
  V5_COMPAT_MATERIAL_TYPES,
  V5_COMPAT_TEXTURE_SETTINGS,
  WebGLMultipleRenderTargetsCompat,
  WebGLRenderTargetCompat
} from "../../packages/three-compat/src";

interface V5MaterialGeometryCompatCheck {
  readonly name: string;
  readonly pass: boolean;
  readonly detail: string;
}

const requiredFiles = [
  "packages/three-compat/src/geometries/index.ts",
  "packages/three-compat/src/textures/index.ts",
  "packages/three-compat/src/materials/index.ts",
  "packages/three-compat/src/render-targets/index.ts",
  "tests/unit/three-compat/v5-material-geometry-compat.test.ts",
  "tests/browser/v5-material-geometry-compat.spec.ts"
] as const;

function check(name: string, pass: boolean, detail: string): V5MaterialGeometryCompatCheck {
  return { name, pass, detail };
}

const target = new WebGLRenderTargetCompat(128, 128, 4);
const mrt = new WebGLMultipleRenderTargetsCompat(128, 128, 4);
const checks: V5MaterialGeometryCompatCheck[] = [
  check("required-files-present", requiredFiles.every((file) => existsSync(resolve(file))), requiredFiles.filter((file) => !existsSync(resolve(file))).join(", ") || "all material/geometry compat files exist"),
  check("geometry-coverage", V5_COMPAT_GEOMETRY_TYPES.length >= 9, V5_COMPAT_GEOMETRY_TYPES.join(", ")),
  check("material-coverage", V5_COMPAT_MATERIAL_TYPES.length >= 9, V5_COMPAT_MATERIAL_TYPES.join(", ")),
  check("texture-settings", V5_COMPAT_TEXTURE_SETTINGS.length >= 6, V5_COMPAT_TEXTURE_SETTINGS.join(", ")),
  check("render-targets", target.depthTexture !== null && mrt.textures.length >= 4, `${target.type}, ${mrt.type}:${mrt.textures.length}`)
];

const pass = checks.every((item) => item.pass);
const report = {
  schema: "g3d-v5-material-geometry-compat-readiness/v1",
  generatedAt: new Date().toISOString(),
  pass,
  geometryTypes: V5_COMPAT_GEOMETRY_TYPES,
  materialTypes: V5_COMPAT_MATERIAL_TYPES,
  textureSettings: V5_COMPAT_TEXTURE_SETTINGS,
  checks
};

const reportPath = resolve("tests/reports/v5-material-geometry-compat-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(`V5 material/geometry compat readiness passed: ${V5_COMPAT_GEOMETRY_TYPES.length} geometries, ${V5_COMPAT_MATERIAL_TYPES.length} materials.`);
