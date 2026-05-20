import type { GPUPointCloudV5 } from "./GPUPointCloud";
import type { LineRendererV5 } from "./LineRenderer";
import type { ParticleSystemV5 } from "./ParticleSystem";
import type { SpriteSystemV5 } from "./SpriteSystem";
import type { TrailRendererV5 } from "./TrailRenderer";

export function createV5VfxDiagnostics(input: {
  readonly particles: ParticleSystemV5;
  readonly pointCloud: GPUPointCloudV5;
  readonly sprites: SpriteSystemV5;
  readonly lines: LineRendererV5;
  readonly trails: TrailRendererV5;
}) {
  return {
    particleCount: input.particles.particles.length,
    pointCount: input.pointCloud.pointCount,
    pointCloudBytes: input.pointCloud.estimatedBytes,
    spriteCount: input.sprites.sprites.length,
    lineSegmentCount: input.lines.segments.length,
    trailPointCount: input.trails.points.length,
    warnings: input.pointCloud.pointCount < 10000 ? ["Point cloud below V5 showcase density."] : []
  };
}
