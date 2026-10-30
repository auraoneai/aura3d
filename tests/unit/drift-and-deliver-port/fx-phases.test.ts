import { describe, expect, it } from "vitest";
import { FX_KINDS, SKID_LIFE, SKID_QUADS, SkidMarks, courierFxPresets, deliveryKind, fxScale, registerCourierFx, skidSpec } from "../../../examples/drift-and-deliver-port/fx";
import { SODIUM_POOL, nearestLamps } from "../../../examples/drift-and-deliver-port/lamps";

describe("gridlock courier VFX pack (GU47 WP-28 GC-V1/V2)", () => {
  it("registers every preset once with the engine registry", () => {
    const seen: string[] = [];
    const kinds = registerCourierFx({ registerPreset: (k, spec) => { expect(spec.name).toBe(k); seen.push(k); } });
    expect(seen).toEqual([...kinds]);
    expect(new Set(seen)).toEqual(new Set(Object.values(FX_KINDS)));
    expect(registerCourierFx(null)).toEqual([]);
  });

  it("gives the delivery ring a teal flash and a camera punch, and the calm variant neither punch nor a full flash", () => {
    const p = courierFxPresets();
    const full = p[FX_KINDS.delivery].layers;
    expect(full.some((l) => l.type === "camera")).toBe(true);
    const calm = p[FX_KINDS.deliveryCalm].layers;
    expect(calm.some((l) => l.type === "camera")).toBe(false);
    const fullLight = full.find((l) => l.type === "light")!.intensity as number;
    const calmLight = calm.find((l) => l.type === "light")!.intensity as number;
    expect(calmLight).toBeLessThanOrEqual(0.3 * fullLight);
  });

  it("reduced motion halves emission, drops camera feedback and takes the calm delivery burst", () => {
    expect(fxScale(true)).toEqual({ count: 0.5, camera: false });
    expect(fxScale(false)).toEqual({ count: 1, camera: true });
    expect(deliveryKind(true, false)).toBe(FX_KINDS.deliveryCalm);
    expect(deliveryKind(false, true)).toBe(FX_KINDS.deliveryCalm);
    expect(deliveryKind(false, false)).toBe(FX_KINDS.delivery);
  });
});

describe("gridlock courier skid marks", () => {
  it("lays two quads per step while drifting and keeps >= 100 live after a 3 s drift", () => {
    const skid = new SkidMarks();
    let x = 0;
    let t = 0;
    for (let i = 0; i < 180; i++) {
      x += 25 / 60;
      t += 1 / 60;
      skid.lay(x, 0, Math.PI / 2 + 0.3, t);
    }
    expect(skid.liveCount(t)).toBeGreaterThanOrEqual(100);
    expect(skid.liveCount(t + SKID_LIFE + 0.1)).toBe(0);
  });

  it("wraps in its fixed ring and resets", () => {
    const skid = new SkidMarks(8);
    for (let i = 0; i < 40; i++) skid.lay(i * 2, 0, 0, i);
    expect(skid.written).toBeGreaterThan(8);
    expect(skid.liveCount(40)).toBeLessThanOrEqual(8);
    skid.reset();
    expect(skid.liveCount(40)).toBe(0);
    expect(new SkidMarks().indices.length).toBe(SKID_QUADS * 6);
    expect(Object.keys(skidSpec().uniforms ?? {})).toEqual(["skidNow", "skidLife"]);
  });

  it("starts a new mark after lift", () => {
    const skid = new SkidMarks();
    skid.lay(0, 0, 0, 0);
    expect(skid.lay(0, 1, 0, 0.1)).toBe(2);
    skid.lift();
    expect(skid.lay(0, 30, 0, 0.2)).toBe(0);
  });
});

describe("gridlock courier sodium pool (GU47 WP-28 GC-L4)", () => {
  it("picks the nearest lamps, preferring the road ahead", () => {
    const lamps = [{ x: 0, z: 10 }, { x: 0, z: -10 }, { x: 0, z: 30 }, { x: 0, z: 200 }, { x: 5, z: 0 }, { x: -20, z: 0 }, { x: 0, z: 50 }];
    const pick = nearestLamps(lamps, 0, 0, 0);
    expect(pick.length).toBe(SODIUM_POOL);
    expect(pick[0]).toBe(4);
    expect(pick).not.toContain(3);
    expect(pick.indexOf(0)).toBeLessThan(pick.indexOf(1));
  });
});
