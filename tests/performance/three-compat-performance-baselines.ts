import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  BVHThreeCompat,
  InstancingThreeCompat,
  TextureStreamingThreeCompat,
  createThreeCompatRendererProfile,
  estimateThreeCompatAcceleratedRaycast,
  runThreeCompatFrustumCulling,
  runThreeCompatOcclusionCulling
} from "../../packages/rendering/src";

const frustum = runThreeCompatFrustumCulling(12000);
const occlusion = runThreeCompatOcclusionCulling(frustum);
const instancing = new InstancingThreeCompat(50000);
const bvh = new BVHThreeCompat(250000);
const raycast = estimateThreeCompatAcceleratedRaycast(bvh, 128);
const textures = new TextureStreamingThreeCompat(48, 2);
const profile = createThreeCompatRendererProfile({
  objectCount: occlusion.total,
  instanceCount: instancing.instanceCount,
  triangleCount: bvh.triangleCount,
  drawCalls: 180,
  textureMemoryBytes: textures.estimatedMemoryBytes,
  cpuFrameMs: 11.4
});

const report = {
  schema: "a3d-three-compat-performance-baselines",
  generatedAt: new Date().toISOString(),
  frustum,
  occlusion,
  instancing: { instanceCount: instancing.instanceCount, transformsBytes: instancing.transformsBytes },
  raycast,
  profile,
  claimBoundary: "Broad performance superiority cannot be claimed without external same-scene evidence."
};
const path = resolve("tests/reports/three-compat-performance-baselines.json");
mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
