import type { BVHThreeCompat } from "./BVH";

export function estimateThreeCompatAcceleratedRaycast(bvh: BVHThreeCompat, rays: number) {
  const bruteForceTests = bvh.triangleCount * rays;
  const acceleratedTests = Math.ceil(Math.log2(bvh.nodes.length + 1) * rays * 8);
  return {
    rays,
    bruteForceTests,
    acceleratedTests,
    speedup: bruteForceTests / acceleratedTests
  };
}
