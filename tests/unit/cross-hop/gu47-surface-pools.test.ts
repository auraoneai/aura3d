import { describe, expect, it } from "vitest";
import { bindApp, startRun, st, step, syncVisuals } from "../../../apps/showcase-cross-hop/src/game/core";

// GU47 phase 2: the diorama surface pools (felt, asphalt, water, gravel, lava) are painted only when the static key
// changes, so they must be static pools; as dynamic pools they were emptied on the next frame (beige frames).
describe("cross-hop diorama surface pools", () => {
  it("keep their instances on frames without a static rebuild", () => {
    const visible: Record<string, number> = {};
    const mk = (id: string) => ({
      setPosition() {}, setScale() {}, setRotation() {}, setAnimation() {}, setVisible() {}, setMaterial() {},
      setInstances(specs: { position: number[] }[], cols?: string[]) {
        const n = specs.filter((s) => s.position[1] > -900).length;
        visible[id] = n;
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
    startRun("quick", null, 7, 0);
    syncVisuals(1);
    const f1 = { ...visible };
    syncVisuals(1);
    const f2 = { ...visible };
    for (let i = 0; i < 30; i++) step(1 / 60, { buffered: () => false });
    syncVisuals(1);
    const f3 = { ...visible };
    for (const k of ["pool-felt", "pool-asphalt", "pool-water"]) {
      expect(f1[k] ?? 0).toBeGreaterThan(0);
      expect(f2[k]).toBe(f1[k]);
      expect(f3[k] ?? 0).toBeGreaterThan(0);
    }
    expect(st.mode).toBeDefined();
  });
});
