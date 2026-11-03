import { describe, expect, it } from "vitest";
import { NativeLightProbeGrid } from "../../../packages/rendering/src/lighting/NativeLightProbeGrid";
import { VoxelIndirectLighting } from "../../../packages/rendering/src/lighting/VoxelIndirectLighting";

describe("advanced lighting resource notifications", () => {
  it("delivers committed probe edits in order to independent subscribers, even after a nested edit", () => {
    const grid = new NativeLightProbeGrid({ min: [0, 0, 0], max: [1, 1, 1], dimensions: [1, 1, 1] });
    const seen: string[] = [];
    grid.onChange(({ revision, disposed }) => {
      seen.push(`first:${revision}:${disposed}`);
      if (revision === 1 && !disposed) grid.setProbeIrradiance(0, 0, 0, [0, 2, 0]);
    });
    // A failed listener must not prevent a second app from observing the edit.
    grid.onChange(() => { throw new Error("observer failed"); });
    grid.onChange(({ revision, disposed }) => { seen.push(`second:${revision}:${disposed}`); });

    grid.setProbeIrradiance(0, 0, 0, [1, 0, 0]);
    expect(seen).toEqual(["first:1:false", "second:1:false", "first:2:false", "second:2:false"]);
    expect(grid.evaluate([0.5, 0.5, 0.5], [0, 1, 0])![1]).toBeCloseTo(2);
    expect(grid.revision).toBe(2);

    const invalid = new Float32Array(27);
    invalid[26] = NaN;
    expect(() => grid.setProbe(0, 0, 0, invalid)).toThrow(/finite/);
    expect(seen).toHaveLength(4);
    expect(grid.revision).toBe(2);
    grid.dispose();
  });

  it("keeps duplicate subscriptions independent and detaches without disposing the resource", () => {
    const grid = new NativeLightProbeGrid({ min: [0, 0, 0], max: [1, 1, 1], dimensions: [1, 1, 1] });
    const revisions: number[] = [];
    const listener = ({ revision }: { readonly revision: number }) => { revisions.push(revision); };
    const detachFirst = grid.onChange(listener);
    const detachSecond = grid.onChange(listener);
    const texture = grid.renderData().texture;

    grid.setProbeIrradiance(0, 0, 0, [1, 0, 0]);
    detachFirst();
    detachFirst();
    grid.setProbeIrradiance(0, 0, 0, [0, 1, 0]);
    expect(revisions).toEqual([1, 1, 2]);
    expect(texture.disposed).toBe(false);
    detachSecond();
    grid.setProbeIrradiance(0, 0, 0, [0, 0, 1]);
    expect(revisions).toEqual([1, 1, 2]);
    grid.dispose();
    expect(texture.disposed).toBe(true);
  });

  it("notifies voxel updates, committed collection, clear, and disposal but not rejected or empty collection", () => {
    const volume = new VoxelIndirectLighting({ bounds: { min: [0, 0, 0], max: [2, 2, 2] }, quality: "low", resolution: 2 });
    const events: Array<{ revision: number; disposed: boolean }> = [];
    let usableDuringDisposal = true;
    volume.onChange((event) => {
      events.push(event);
      if (event.disposed) {
        try { volume.snapshot(); } catch { usableDuringDisposal = false; }
      }
    });
    volume.updateVoxel([0, 0, 0], { radiance: [1, 0, 0], opacity: 1 });
    expect(() => volume.collectTriangles([{ vertices: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], radiance: [1, 1, 1] }])).toThrow(/degenerate/i);
    volume.collectTriangles([]);
    volume.collectTriangles([{ vertices: [[0.2, 0.2, 0.5], [1.8, 0.2, 0.5], [0.2, 1.8, 0.5]], radiance: [0, 1, 0] }]);
    volume.clear();
    volume.dispose();
    volume.dispose();
    expect(usableDuringDisposal).toBe(false);
    expect(events).toEqual([
      { revision: 1, disposed: false },
      { revision: 2, disposed: false },
      { revision: 3, disposed: false },
      { revision: 3, disposed: true }
    ]);
    const late: Array<{ revision: number; disposed: boolean }> = [];
    volume.onChange((event) => late.push(event))();
    expect(late).toEqual([{ revision: 3, disposed: true }]);
    expect(() => volume.onChange(() => { throw new Error("late observer failed"); })).not.toThrow();
  });

  it("finishes notifying an edit before a nested disposal and never publishes after disposal", () => {
    const grid = new NativeLightProbeGrid({ min: [0, 0, 0], max: [1, 1, 1], dimensions: [1, 1, 1] });
    const seen: string[] = [];
    grid.onChange(({ revision, disposed }) => {
      seen.push(`first:${revision}:${disposed}`);
      if (!disposed) grid.dispose();
    });
    grid.onChange(({ revision, disposed }) => { seen.push(`second:${revision}:${disposed}`); });
    grid.setProbeIrradiance(0, 0, 0, [1, 0, 0]);
    expect(seen).toEqual(["first:1:false", "second:1:false", "first:2:true", "second:2:true"]);
    expect(() => grid.setProbeIrradiance(0, 0, 0, [1, 0, 0])).toThrow(/disposed/);
    grid.dispose();
    expect(seen).toHaveLength(4);
    const late: Array<{ revision: number; disposed: boolean }> = [];
    grid.onChange((event) => late.push(event))();
    expect(late).toEqual([{ revision: 2, disposed: true }]);
  });
});
