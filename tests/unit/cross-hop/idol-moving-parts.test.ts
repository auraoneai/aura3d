/**
 * Idol moving-parts pass: the Idol vehicle bodies are generated without wheels, and separate Idol wheels spin by
 * distance travelled / radius. Asserts every wheeled body's hubs sit in its measured arches (road) or under its body
 * (rail), the wheels touch the road, and that advancing real frames turns every drawn wheel.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bindApp, startRun, step, syncVisuals } from "../../../apps/showcase-cross-hop/src/game/core";
import {
  IDOL_ALONG_X, IDOL_POOL_ASSET, idolBodyLift, idolScale, idolWheelLayout, vehicleWheelPoses, type IdolPoolKey
} from "../../../apps/showcase-cross-hop/src/game/idolModels";

const WHEELED: IdolPoolKey[] = ["car", "hatch", "suv", "taxi", "van", "pickup", "truck", "tram", "train", "coach"];

describe("cross hop Idol vehicle wheels", () => {
  for (const pool of WHEELED) {
    it(`${pool}: hubs sit in the body's arches and the wheels touch the road`, () => {
      const layout = idolWheelLayout(pool)!;
      expect(layout, pool).toBeDefined();
      const [w, , l] = IDOL_POOL_ASSET[pool].bounds;
      expect(layout.hubs.length).toBeGreaterThanOrEqual(4);
      expect(layout.radius).toBeGreaterThan(0.05);
      expect(layout.radii.length).toBe(layout.hubs.length);
      layout.hubs.forEach(([hx, hy, hz], i) => {
        const r = layout.radii[i]!;
        expect(Math.abs(hx), `${pool} hub x inside the body width`).toBeLessThanOrEqual(w / 2 + 1e-3);
        expect(Math.abs(hz), `${pool} hub z inside the body length`).toBeLessThanOrEqual(l / 2);
        // wheel bottom on the road: hub height above the road (hy + lift) equals the wheel's radius
        expect(hy + layout.lift).toBeCloseTo(r, 2);
        if (!layout.rail) {
          const arch = layout.arches.find(([z0, z1]) => hz > z0 && hz < z1);
          expect(arch, `${pool} hub z=${hz} lies in a measured arch`).toBeDefined();
          // the tyre fits inside its arch opening and clears the crown (both in the unlifted body frame)
          expect(Math.abs(hz - (arch![0] + arch![1]) / 2)).toBeLessThan(1e-2);
          // one wheel size per body, set by its widest arch: fits that opening and clears its crown, and fills a good
          // part of every arch (no tiny wheels under a floating body)
          const widest = layout.arches.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a));
          expect(2 * r).toBeLessThanOrEqual(widest[1] - widest[0]);
          expect(hy + r).toBeLessThanOrEqual(widest[2] + 1e-3);
          expect(2 * r).toBeGreaterThan(0.6 * (arch![1] - arch![0]));
          expect(layout.lift).toBeLessThanOrEqual(0.0601);
        } else {
          // bogie wheels peek out under the body, which rides on them
          expect(hy).toBeLessThan(0);
          expect(hy + r).toBeGreaterThan(0);
        }
      });
      // both sides of the body carry wheels
      expect(layout.hubs.some(([hx]) => hx > 0) && layout.hubs.some(([hx]) => hx < 0)).toBe(true);
      expect(idolBodyLift(pool)).toBe(layout.lift);
    });

    it(`${pool}: wheels turn by distance / radius and stay on their hubs`, () => {
      const yaw = IDOL_ALONG_X;
      const a = vehicleWheelPoses(pool, 3, 0.12, -4, yaw, 3);
      const b = vehicleWheelPoses(pool, 3.4, 0.12, -4, yaw, 3.4);
      expect(a.length).toBe(idolWheelLayout(pool)!.hubs.length);
      const sx = idolScale(pool)[0];
      for (let i = 0; i < a.length; i++) {
        const [hx, hy, hz] = idolWheelLayout(pool)!.hubs[i]!;
        // yaw +90 deg: body-local z runs along world +X, local x along world -Z
        expect(a[i]!.position[0]).toBeCloseTo(3 + hz, 5);
        expect(a[i]!.position[2]).toBeCloseTo(-4 - hx * sx, 5);
        expect(a[i]!.position[1]).toBeCloseTo(0.12 + hy + idolBodyLift(pool), 5);
        expect(b[i]!.position[0] - a[i]!.position[0]).toBeCloseTo(0.4, 5);
        expect(b[i]!.rotation).not.toEqual(a[i]!.rotation);
      }
    });
  }

  it("the wheel GLBs are centred on their hub, so they spin and scale about the axle", () => {
    for (const key of ["hopWheel", "hopRailWheel"]) {
      const b = readFileSync(`apps/showcase-cross-hop/assets/idol/${key}.glb`);
      const j = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString()) as { meshes: { primitives: { attributes: { POSITION: number } }[] }[]; accessors: { min: number[]; max: number[] }[] };
      const acc = j.accessors[j.meshes[0]!.primitives[0]!.attributes.POSITION]!;
      for (let i = 0; i < 3; i++) expect(Math.abs(acc.min[i]! + acc.max[i]!), `${key} axis ${i}`).toBeLessThan(0.01);
    }
  });

  it("the hover car has no wheels (its glowing hover pads do not rotate) and no lift", () => {
    expect(idolWheelLayout("hover")).toBeUndefined();
    expect(vehicleWheelPoses("hover", 0, 0, 0, 0, 1)).toEqual([]);
    expect(idolBodyLift("hover")).toBe(0);
  });

  it("advancing frames turns every drawn road and rail wheel", () => {
    const frames: Record<string, { position: number[]; rotation: number[] }[]> = {};
    const mk = (id: string) => ({
      setPosition() {}, setScale() {}, setRotation() {}, setAnimation() {}, setVisible() {}, setMaterial() {},
      setInstances(specs: { position: number[]; rotation: number[] }[]) {
        frames[id] = specs.filter((s) => s.position[1] > -900).map((s) => ({ position: [...s.position], rotation: [...s.rotation] }));
      }
    });
    const handles = new Map<string, ReturnType<typeof mk>>();
    const get = (id: string) => { if (!handles.has(id)) handles.set(id, mk(id)); return handles.get(id)!; };
    bindApp({
      nodes: { add: () => undefined, remove: () => undefined, require: get, get },
      camera: { setPose() {} },
      output: { setOutputOverlay() {} },
      effects: { burst() {} }
    } as never);
    let checked = 0;
    for (const drill of [
      { id: "w-road", label: "Wheels", desc: "", script: ["meadow", "road", "road", "road", "meadow"] as const },
      { id: "w-rail", label: "Wheels", desc: "", script: ["meadow", "rail", "meadow", "rail", "meadow"] as const }
    ]) {
      startRun("drill", { ...drill, script: [...drill.script] }, 11);
      const key = drill.id === "w-road" ? "wheel" : "railWheel";
      const id = `pool-${key}`;
      // advance until this lane type has a vehicle in view (a train passes every few seconds), then two frames apart
      for (let f = 0; f < 600 && (frames[id] ?? []).length === 0; f++) { step(1 / 60, { buffered: () => false }); syncVisuals(1); }
      const first = frames[id] ?? [];
      for (let s = 0; s < 3; s++) step(1 / 60, { buffered: () => false });
      syncVisuals(1);
      const last = frames[id] ?? [];
      expect(first.length, `${key} wheels drawn`).toBeGreaterThan(0);
      // the same slot holds the same wheel while the lane's movers keep their order; every one has turned
      const n = Math.min(first.length, last.length);
      let turned = 0;
      for (let i = 0; i < n; i++) if (first[i]!.rotation.some((v, k) => Math.abs(v - last[i]!.rotation[k]!) > 1e-6)) turned++;
      expect(turned, `${key}: ${turned} of ${n} wheels turned`).toBe(n);
      checked += n;
    }
    expect(checked).toBeGreaterThan(8);
  });
});
