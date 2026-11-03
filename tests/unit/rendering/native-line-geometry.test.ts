import { describe, expect, it } from "vitest";
import { Geometry, type ScreenSpaceLineSegment } from "../../../packages/rendering/src/Geometry";
import { Geometry as PublicLineGeometry } from "../../../packages/rendering/src/LineGeometry";
import { MockRenderDevice, type RenderBuffer } from "../../../packages/rendering/src/RenderDevice";

class CountingDevice extends MockRenderDevice {
  creates = 0;
  updates = 0;

  override createBuffer(...args: Parameters<MockRenderDevice["createBuffer"]>): RenderBuffer {
    this.creates += 1;
    return super.createBuffer(...args);
  }

  override updateBuffer(...args: Parameters<MockRenderDevice["updateBuffer"]>): void {
    this.updates += 1;
    super.updateBuffer(...args);
  }
}

describe("retained screen-space line geometry", () => {
  it("keeps the LineGeometry entrypoint bound to the retained implementation", () => {
    expect(PublicLineGeometry).toBe(Geometry);
    const geometry = PublicLineGeometry.screenSpaceLineSegments([{ start: [0, 0, 0], end: [1, 0, 0] }]);
    geometry.updateScreenSpaceLineSegments([{ start: [0, 0, 0], end: [3, 0, 0] }]);
    expect(geometry.bounds.max).toEqual([3, 0, 0]);
    geometry.dispose();
  });
  it("updates the uploaded buffer in place with colors, distances and bounds", () => {
    const device = new CountingDevice();
    const geometry = Geometry.screenSpaceLineSegments([
      { start: [0, 0, 0], end: [3, 0, 0] },
      { start: [3, 0, 0], end: [3, 4, 0] }
    ]);
    const vertices = geometry.vertexBuffer.upload(device);
    const indices = geometry.indexBuffer!.upload(device);
    const next: ScreenSpaceLineSegment[] = [
      { start: [5, -1, 2], end: [5, 2, 2], startColor: [1, 0, 0, 0.5], endColor: [0, 0, 1, 1], startDistance: 10, endDistance: 16 },
      { start: [5, 2, 2], end: [9, 2, 2], startColor: [0, 1, 0, 1], endColor: [1, 1, 0, 1] }
    ];
    geometry.updateScreenSpaceLineSegments(next);
    expect(geometry.bounds).toEqual({ min: [5, -1, 2], max: [9, 2, 2] });
    expect(geometry.drawRange).toEqual({ start: 0, count: 12 });
    expect(geometry.vertexBuffer.getAttribute(0, "color")).toEqual([1, 0, 0, 0.5]);
    expect(geometry.vertexBuffer.getAttribute(2, "color")).toEqual([0, 0, 1, 1]);
    expect(geometry.vertexBuffer.getAttribute(0, "custom:lineOtherColor")).toEqual([0, 0, 1, 1]);
    expect(geometry.vertexBuffer.getAttribute(2, "custom:lineOtherColor")).toEqual([1, 0, 0, 0.5]);
    expect(geometry.vertexBuffer.getAttribute(0, "lineDistance")).toEqual([10]);
    expect(geometry.vertexBuffer.getAttribute(0, "custom:lineOtherDistance")).toEqual([16]);
    expect(geometry.vertexBuffer.getAttribute(4, "lineDistance")).toEqual([16]);
    expect(geometry.vertexBuffer.getAttribute(6, "lineDistance")).toEqual([20]);
    expect(geometry.vertexBuffer.upload(device)).toBe(vertices);
    expect(geometry.indexBuffer!.upload(device)).toBe(indices);
    expect(device.creates).toBe(2);
    expect(device.updates).toBe(1);
    const uploaded = new Float32Array(device.readBuffer(vertices).buffer);
    expect(Array.from(uploaded.slice(0, 3))).toEqual([5, -1, 2]);
    geometry.dispose();
    device.dispose();
  });

  it("releases replaced buffers on growth and keeps only active segments in bounds and draw range", () => {
    const device = new CountingDevice();
    const geometry = Geometry.screenSpaceLineSegments([{ start: [0, 0, 0], end: [1, 0, 0] }]);
    const firstVertex = geometry.vertexBuffer.upload(device);
    const firstIndex = geometry.indexBuffer!.upload(device);
    geometry.updateScreenSpaceLineSegments([
      { start: [10, 0, 0], end: [11, 0, 0] },
      { start: [11, 0, 0], end: [12, 3, 0] },
      { start: [-100, 0, 0], end: [-99, 0, 0] }
    ]);
    expect(firstVertex.disposed).toBe(true);
    expect(firstIndex.disposed).toBe(true);
    const grownVertex = geometry.vertexBuffer.upload(device);
    const grownIndex = geometry.indexBuffer!.upload(device);
    expect(device.creates).toBe(4);
    geometry.updateScreenSpaceLineSegments([{ start: [10, 0, 0], end: [11, 0, 0] }]);
    expect(geometry.drawRange).toEqual({ start: 0, count: 6 });
    expect(geometry.bounds).toEqual({ min: [10, 0, 0], max: [11, 0, 0] });
    expect(geometry.vertexBuffer.upload(device)).toBe(grownVertex);
    expect(geometry.indexBuffer!.upload(device)).toBe(grownIndex);
    geometry.updateScreenSpaceLineSegments([]);
    expect(geometry.drawRange).toEqual({ start: 0, count: 0 });
    expect(geometry.bounds).toEqual({ min: [0, 0, 0], max: [0, 0, 0] });
    geometry.updateScreenSpaceLineSegments([{ start: [2, 0, 0], end: [3, 0, 0] }]);
    expect(geometry.vertexBuffer.upload(device)).toBe(grownVertex);
    expect(geometry.indexBuffer!.upload(device)).toBe(grownIndex);
    expect(device.creates).toBe(4);
    geometry.dispose();
    geometry.dispose();
    expect(grownVertex.disposed).toBe(true);
    expect(grownIndex.disposed).toBe(true);
    expect(() => geometry.updateScreenSpaceLineSegments([])).toThrow(/disposed/);
    device.dispose();
  });

  it("rejects a bad update before changing any retained vertices or bounds", () => {
    const geometry = Geometry.screenSpaceLineSegments([{ start: [0, 0, 0], end: [2, 0, 0] }]);
    const before = geometry.vertexBuffer.data.slice(0);
    const bounds = geometry.bounds;
    expect(() => geometry.updateScreenSpaceLineSegments([
      { start: [4, 0, 0], end: [5, 0, 0] },
      { start: [5, 0, 0], end: [6, 0, 0], startDistance: 2 }
    ])).toThrow(/both startDistance and endDistance/);
    expect(() => geometry.updateScreenSpaceLineSegments([{ start: [0, 0, 0], end: [1, 0, 0], startDistance: 4, endDistance: 2 }])).toThrow(/nondecreasing/);
    expect(() => geometry.updateScreenSpaceLineSegments([{ start: [0, 0, 0], end: [1, 0, 0], startColor: [1, 0, 0, Infinity] }])).toThrow(/startColor/);
    expect(() => geometry.updateScreenSpaceLineSegments([{ start: [0, 0, 0], end: [1e40, 0, 0] }])).toThrow(/finite components/);
    expect(geometry.vertexBuffer.data).toEqual(before);
    expect(geometry.bounds).toBe(bounds);
    expect(geometry.drawRange).toEqual({ start: 0, count: 6 });
    geometry.dispose();
  });

  it("refreshes generic geometry bounds after an in-place position edit", () => {
    const geometry = Geometry.lineSegments([[0, 0, 0], [1, 1, 1]]);
    geometry.vertexBuffer.setAttribute(1, "position", [8, -2, 3]);
    expect(geometry.refreshBounds()).toEqual({ min: [0, -2, 0], max: [8, 0, 3] });
    expect(geometry.bounds).toEqual({ min: [0, -2, 0], max: [8, 0, 3] });
    expect(() => geometry.updateScreenSpaceLineSegments([])).toThrow(/requires screen-space/);
    geometry.dispose();
  });

  it("updates native line positions and colors within capacity, then releases on growth", () => {
    const device = new CountingDevice();
    const geometry = Geometry.lineSegments([[0, 0, 0], [1, 0, 0], [1, 0, 0], [2, 0, 0]]);
    const buffer = geometry.vertexBuffer.upload(device);
    expect(geometry.vertexBuffer.getAttribute(0, "color")).toEqual([1, 1, 1, 1]);
    geometry.updateLineSegments([[3, 2, 0], [4, 2, 0]], [[1, 0, 0, 1], [0, 0, 1, 1]]);
    expect(geometry.vertexBuffer.upload(device)).toBe(buffer);
    expect(geometry.vertexBuffer.getAttribute(0, "color")).toEqual([1, 0, 0, 1]);
    expect(geometry.vertexBuffer.getAttribute(1, "color")).toEqual([0, 0, 1, 1]);
    expect(geometry.drawRange).toEqual({ start: 0, count: 2 });
    expect(geometry.bounds).toEqual({ min: [3, 2, 0], max: [4, 2, 0] });
    geometry.updateLineSegments([]);
    expect(geometry.drawRange?.count).toBe(0);
    geometry.updateLineSegments([[0, 0, 0], [1, 0, 0], [1, 0, 0], [2, 0, 0], [2, 0, 0], [3, 0, 0]]);
    expect(buffer.disposed).toBe(true);
    const replacement = geometry.vertexBuffer.upload(device);
    expect(device.creates).toBe(2);
    expect(geometry.vertexBuffer.getAttribute(0, "color")).toEqual([1, 1, 1, 1]);
    expect(() => geometry.updateLineSegments([[0, 0, 0], [1, 0, 0]], [[1, 1, 1, 1]])).toThrow(/colors must match/);
    expect(geometry.drawRange?.count).toBe(6);
    geometry.dispose();
    expect(replacement.disposed).toBe(true);
    device.dispose();
  });

  it("selects 32-bit indices when expanded line capacity exceeds 65,536 vertices", () => {
    const geometry = Geometry.screenSpaceLineSegments([{ start: [0, 0, 0], end: [1, 0, 0] }]);
    const segments: ScreenSpaceLineSegment[] = Array.from({ length: 16_385 }, (_, i) => ({
      start: [i, 0, 0], end: [i + 1, 0, 0]
    }));
    geometry.updateScreenSpaceLineSegments(segments);
    expect(geometry.indexBuffer!.type).toBe("uint32");
    expect(geometry.indexBuffer!.data.at(-1)).toBe(65_539);
    expect(geometry.drawRange?.count).toBe(16_385 * 6);
    geometry.dispose();
  });
});
