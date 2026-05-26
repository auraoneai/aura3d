import { describe, expect, it } from "vitest";
import { GPUPointCloudThreeCompat, LineThreeCompatRenderer, ParticleSystemThreeCompat, SpriteSystemThreeCompat, TrailThreeCompatRenderer, createThreeCompatVfxDiagnostics } from "../../../packages/rendering/src";

describe("ThreeCompat VFX", () => {
  it("covers particles, point clouds, sprites, lines, trails, and diagnostics", () => {
    const particles = new ParticleSystemThreeCompat();
    particles.emit(2048);
    particles.update(0.16);
    const pointCloud = new GPUPointCloudThreeCompat(50000);
    const sprites = new SpriteSystemThreeCompat();
    sprites.add({ id: "flare", x: 0, y: 0, size: 64 });
    sprites.add({ id: "spark", x: 1, y: 1, size: 16 });
    const lines = new LineThreeCompatRenderer();
    lines.addSegment({ from: [0, 0, 0], to: [1, 1, 1], width: 2 });
    const trails = new TrailThreeCompatRenderer();
    for (let index = 0; index < 32; index++) trails.push([index, Math.sin(index), 0]);
    const diagnostics = createThreeCompatVfxDiagnostics({ particles, pointCloud, sprites, lines, trails });

    expect(diagnostics.particleCount).toBe(2048);
    expect(diagnostics.pointCount).toBe(50000);
    expect(diagnostics.spriteCount).toBe(2);
    expect(diagnostics.lineSegmentCount).toBe(1);
    expect(diagnostics.trailPointCount).toBe(32);
    expect(diagnostics.warnings).toEqual([]);
  });
});
