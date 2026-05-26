import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { GPUPointCloudThreeCompat, LineThreeCompatRenderer, ParticleSystemThreeCompat, SpriteSystemThreeCompat, TrailThreeCompatRenderer, createThreeCompatVfxDiagnostics } from "../../packages/rendering/src";

const requiredFiles = [
  "packages/rendering/src/threejs-compatibility/vfx/ParticleSystem.ts",
  "packages/rendering/src/threejs-compatibility/vfx/GPUPointCloud.ts",
  "packages/rendering/src/threejs-compatibility/vfx/SpriteSystem.ts",
  "packages/rendering/src/threejs-compatibility/vfx/LineRenderer.ts",
  "packages/rendering/src/threejs-compatibility/vfx/TrailRenderer.ts",
  "packages/rendering/src/threejs-compatibility/vfx/VFXDiagnostics.ts",
  "tests/unit/rendering/three-compat-vfx.test.ts",
  "tests/browser/three-compat-vfx.spec.ts"
] as const;

const particles = new ParticleSystemThreeCompat();
particles.emit(2048);
const pointCloud = new GPUPointCloudThreeCompat(50000);
const sprites = new SpriteSystemThreeCompat();
sprites.add({ id: "flare", x: 0, y: 0, size: 64 });
const lines = new LineThreeCompatRenderer();
lines.addSegment({ from: [0, 0, 0], to: [1, 1, 1], width: 2 });
const trails = new TrailThreeCompatRenderer();
for (let index = 0; index < 32; index++) trails.push([index, 0, 0]);
const diagnostics = createThreeCompatVfxDiagnostics({ particles, pointCloud, sprites, lines, trails });
const checks = [
  { name: "required-files-present", pass: requiredFiles.every((file) => existsSync(resolve(file))), detail: requiredFiles.filter((file) => !existsSync(resolve(file))).join(", ") || "all Three.js compatibility VFX files exist" },
  { name: "vfx-counts", pass: diagnostics.particleCount >= 2000 && diagnostics.pointCount >= 50000 && diagnostics.spriteCount >= 1 && diagnostics.lineSegmentCount >= 1 && diagnostics.trailPointCount >= 32, detail: JSON.stringify(diagnostics) },
  { name: "diagnostics", pass: diagnostics.warnings.length === 0, detail: diagnostics.warnings.join(", ") || "no VFX warnings" }
];
const pass = checks.every((item) => item.pass);
const report = { schema: "a3d-three-compat-vfx-readiness", generatedAt: new Date().toISOString(), pass, diagnostics, checks };
const reportPath = resolve("tests/reports/three-compat-vfx-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(`Three.js compatibility VFX readiness passed: ${diagnostics.particleCount} particles, ${diagnostics.pointCount} points.`);
