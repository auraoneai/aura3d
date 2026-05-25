import type { BVHV5 } from "./BVH";

export function estimateV5AcceleratedRaycast(bvh: BVHV5, rays: number) {
  const bruteForceTests = bvh.triangleCount * rays;
  const acceleratedTests = Math.ceil(Math.log2(bvh.nodes.length + 1) * rays * 8);
  return {
    rays,
    bruteForceTests,
    acceleratedTests,
    speedup: bruteForceTests / acceleratedTests
  };
}
