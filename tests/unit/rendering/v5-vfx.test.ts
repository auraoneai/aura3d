import { describe, expect, it } from "vitest";
import { GPUPointCloudV5, LineRendererV5, ParticleSystemV5, SpriteSystemV5, TrailRendererV5, createV5VfxDiagnostics } from "../../../packages/rendering/src";

describe("V5 VFX", () => {
  it("covers particles, point clouds, sprites, lines, trails, and diagnostics", () => {
    const particles = new ParticleSystemV5();
    particles.emit(2048);
    particles.update(0.16);
    const pointCloud = new GPUPointCloudV5(50000);
    const sprites = new SpriteSystemV5();
    sprites.add({ id: "flare", x: 0, y: 0, size: 64 });
    sprites.add({ id: "spark", x: 1, y: 1, size: 16 });
    const lines = new LineRendererV5();
    lines.addSegment({ from: [0, 0, 0], to: [1, 1, 1], width: 2 });
    const trails = new TrailRendererV5();
    for (let index = 0; index < 32; index++) trails.push([index, Math.sin(index), 0]);
    const diagnostics = createV5VfxDiagnostics({ particles, pointCloud, sprites, lines, trails });

    expect(diagnostics.particleCount).toBe(2048);
    expect(diagnostics.pointCount).toBe(50000);
    expect(diagnostics.spriteCount).toBe(2);
    expect(diagnostics.lineSegmentCount).toBe(1);
    expect(diagnostics.trailPointCount).toBe(32);
    expect(diagnostics.warnings).toEqual([]);
  });
});
