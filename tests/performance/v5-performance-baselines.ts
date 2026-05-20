import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  BVHV5,
  InstancingV5,
  TextureStreamingV5,
  createV5RendererProfile,
  estimateV5AcceleratedRaycast,
  runV5FrustumCulling,
  runV5OcclusionCulling
} from "../../packages/rendering/src";

const frustum = runV5FrustumCulling(12000);
const occlusion = runV5OcclusionCulling(frustum);
const instancing = new InstancingV5(50000);
const bvh = new BVHV5(250000);
const raycast = estimateV5AcceleratedRaycast(bvh, 128);
const textures = new TextureStreamingV5(48, 2);
const profile = createV5RendererProfile({
  objectCount: occlusion.total,
  instanceCount: instancing.instanceCount,
  triangleCount: bvh.triangleCount,
  drawCalls: 180,
  textureMemoryBytes: textures.estimatedMemoryBytes,
  cpuFrameMs: 11.4
});

const report = {
  schema: "g3d-v5-performance-baselines/v1",
  generatedAt: new Date().toISOString(),
  frustum,
  occlusion,
  instancing: { instanceCount: instancing.instanceCount, transformsBytes: instancing.transformsBytes },
  raycast,
  profile,
  claimBoundary: "Broad performance superiority cannot be claimed without external same-scene evidence."
};
const path = resolve("tests/reports/v5-performance-baselines.json");
mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
