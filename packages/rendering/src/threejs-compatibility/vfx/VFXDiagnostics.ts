import type { GPUPointCloudThreeCompat } from "./GPUPointCloud";
import type { LineThreeCompatRenderer } from "./LineRenderer";
import type { ParticleSystemThreeCompat } from "./ParticleSystem";
import type { SpriteSystemThreeCompat } from "./SpriteSystem";
import type { TrailThreeCompatRenderer } from "./TrailRenderer";

export function createThreeCompatVfxDiagnostics(input: {
  readonly particles: ParticleSystemThreeCompat;
  readonly pointCloud: GPUPointCloudThreeCompat;
  readonly sprites: SpriteSystemThreeCompat;
  readonly lines: LineThreeCompatRenderer;
  readonly trails: TrailThreeCompatRenderer;
}) {
  return {
    particleCount: input.particles.particles.length,
    pointCount: input.pointCloud.pointCount,
    pointCloudBytes: input.pointCloud.estimatedBytes,
    spriteCount: input.sprites.sprites.length,
    lineSegmentCount: input.lines.segments.length,
    trailPointCount: input.trails.points.length,
    warnings: input.pointCloud.pointCount < 10000 ? ["Point cloud below ThreeCompat showcase density."] : []
  };
}
