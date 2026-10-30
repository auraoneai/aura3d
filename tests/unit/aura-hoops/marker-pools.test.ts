import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AuraTransformSpec } from "@aura3d/engine";
import { MarkerPool, parkedTransforms } from "../../../apps/showcase-aura-hoops-3d/src/markerPools";

const MAIN = readFileSync(path.resolve(__dirname, "../../../apps/showcase-aura-hoops-3d/src/main.ts"), "utf8");

function fakeHandle() {
  const calls: { instances: AuraTransformSpec[][]; visible: boolean[] } = { instances: [], visible: [] };
  const handle = {
    setInstances(t: readonly AuraTransformSpec[]) {
      calls.instances.push(t.map((s) => JSON.parse(JSON.stringify(s)) as AuraTransformSpec));
      return handle;
    },
    setVisible(v: boolean) {
      calls.visible.push(v);
      return handle;
    }
  };
  return { handle: handle as never, calls };
}

describe("Aura Hoops marker pools (H47-PF1)", () => {
  it("parks the build-time capacity out of view", () => {
    const t = parkedTransforms(4);
    expect(t).toHaveLength(4);
    for (const s of t) expect(s.position?.[1]).toBeLessThan(-10);
  });

  it("submits only visible slots, with the base rotation and slot scale", () => {
    const { handle, calls } = fakeHandle();
    const pool = new MarkerPool(handle, 3, [Math.PI / 2, 0, 0]);
    pool.slot(0).setPosition(1, 0.018, 2).setScale(1.06).setVisible(true);
    pool.slot(1).setVisible(false);
    pool.slot(2).setPosition(-3, 0.018, 4).setScale([0.82, 0.82, 0.82]);
    pool.flush();
    expect(calls.instances).toHaveLength(1);
    const sent = calls.instances[0]!;
    expect(sent).toHaveLength(2);
    expect(sent[0]).toEqual({ position: [1, 0.018, 2], rotation: [Math.PI / 2, 0, 0], scale: [1.06, 1.06, 1.06] });
    expect(sent[1]!.position).toEqual([-3, 0.018, 4]);
  });

  it("skips unchanged frames and hides an empty pool", () => {
    const { handle, calls } = fakeHandle();
    const pool = new MarkerPool(handle, 2, [0, 0, 0], 0.0001, false);
    pool.flush();
    expect(calls.visible).toEqual([false]);
    pool.flush();
    expect(calls.instances).toHaveLength(0);
    pool.slot(1).setVisible(true).setPosition(0, 0.26, 5).setScale(1);
    pool.flush();
    expect(calls.instances).toHaveLength(1);
    expect(calls.visible).toEqual([false, true]);
    pool.slot(1).setPosition(0, 0.26, 5);
    pool.flush();
    expect(calls.instances).toHaveLength(1);
  });

  it("main.ts pools markers on the new look and keeps the primitives on ?look=original", () => {
    expect(MAIN).toMatch(/const POOLED_MARKERS = !LOOK_ORIGINAL;/);
    expect(MAIN).toMatch(/POOLED_MARKERS \? \[\] : buildAthleteAccessories/);
    expect(MAIN).toMatch(/frameBoundary\.run\(flushMarkerPools\)/);
  });
});
