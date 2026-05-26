import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const requiredFiles = [
  "packages/rendering/src/threejs-compatibility/performance/Instancing.ts",
  "packages/rendering/src/threejs-compatibility/performance/FrustumCulling.ts",
  "packages/rendering/src/threejs-compatibility/performance/OcclusionCulling.ts",
  "packages/rendering/src/threejs-compatibility/performance/BVH.ts",
  "packages/rendering/src/threejs-compatibility/performance/RaycastAcceleration.ts",
  "packages/rendering/src/threejs-compatibility/performance/LODSystem.ts",
  "packages/rendering/src/threejs-compatibility/performance/TextureStreaming.ts",
  "packages/rendering/src/threejs-compatibility/performance/RendererProfiler.ts",
  "tests/performance/three-compat-performance-baselines.ts",
  "tests/browser/three-compat-large-scene.spec.ts",
  "tests/browser/three-compat-raycast-bvh.spec.ts"
] as const;

const baselinePath = resolve("tests/reports/three-compat-performance-baselines.json");
const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as {
  readonly occlusion: { readonly total: number; readonly visible: number };
  readonly instancing: { readonly instanceCount: number };
  readonly raycast: { readonly speedup: number };
  readonly profile: { readonly cpuFrameMs: number; readonly drawCalls: number; readonly triangleCount: number; readonly textureMemoryBytes: number; readonly warnings: readonly string[] };
  readonly claimBoundary: string;
};
const checks = [
  { name: "required-files-present", pass: requiredFiles.every((file) => existsSync(resolve(file))), detail: requiredFiles.filter((file) => !existsSync(resolve(file))).join(", ") || "all Three.js compatibility performance files exist" },
  { name: "large-scene-floor", pass: baseline.occlusion.total >= 10000, detail: `${baseline.occlusion.total} objects` },
  { name: "instancing-floor", pass: baseline.instancing.instanceCount >= 50000, detail: `${baseline.instancing.instanceCount} instances` },
  { name: "bvh-raycast", pass: baseline.raycast.speedup > 100, detail: `${baseline.raycast.speedup}x speedup` },
  { name: "frame-budget", pass: baseline.profile.cpuFrameMs <= 16.6 && baseline.profile.warnings.length === 0, detail: `${baseline.profile.cpuFrameMs}ms CPU, ${baseline.profile.drawCalls} draw calls` },
  { name: "claim-boundary", pass: /cannot be claimed without external/i.test(baseline.claimBoundary), detail: baseline.claimBoundary }
];
const pass = checks.every((item) => item.pass);
const report = { schema: "a3d-three-compat-performance-readiness", generatedAt: new Date().toISOString(), pass, baseline, checks };
const reportPath = resolve("tests/reports/three-compat-performance-readiness.json");
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (!pass) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(`Three.js compatibility performance readiness passed: ${baseline.occlusion.total} objects, ${baseline.instancing.instanceCount} instances.`);
