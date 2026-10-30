import { describe, expect, it } from "vitest";
import { createDaylight, linear, lookFrame } from "../../../examples/drift-and-deliver-port/daylight";
import { PHASES, phaseAt } from "../../../examples/drift-and-deliver-port/phases";
import { carBox, project, shiftCrops } from "../../../examples/drift-and-deliver-port/qa";
import { WET, paintWetRoughness, puddles } from "../../../examples/drift-and-deliver-port/wet";
import { QUAY_Z, WATER_FRAGMENT, waterSpec } from "../../../examples/drift-and-deliver-port/water";
import { SHIFT_FAR_FRAGMENT, SHIFT_SKY_FRAGMENT, shiftSkySpec } from "../../../examples/drift-and-deliver-port/sky";
import { reducedMotion, setChaseFraming, setReducedMotion, snapChase, stepChase } from "../../../examples/drift-and-deliver-port/chase";

function recorder() {
  const log: string[] = [];
  const node = (id: string) => ({
    setLight: (p: Record<string, unknown>) => { log.push(`${id}.light:${Object.keys(p).join(",")}`); },
    setUniform: (n: string) => { log.push(`${id}.${n}`); }
  });
  return {
    log,
    targets: {
      node,
      setFog: () => { log.push("fog"); },
      setPostEffect: (n: string) => { log.push(`post.${n}`); },
      setEnvironmentIntensity: () => { log.push("env"); },
      setWindows: (v: number) => { log.push(`windows:${v.toFixed(2)}`); }
    }
  };
}

describe("gridlock courier daylight driver (GU47 WP-28 GC-L6)", () => {
  it("writes every channel on the first frame and nothing on a repeated (pinned ?at=) frame", () => {
    const r = recorder();
    const d = createDaylight(r.targets);
    const first = d.apply(lookFrame(phaseAt(120)));
    expect(first).toBeGreaterThan(10);
    expect(r.log).toContain("sun.light:color,intensity,direction");
    expect(r.log).toContain("sky-dome.skyTop");
    expect(r.log).toContain("harbour.waterGlitter");
    expect(r.log).toContain("post.colorGrade");
    expect(d.apply(lookFrame(phaseAt(120)))).toBe(0);
    d.reset();
    expect(d.apply(lookFrame(phaseAt(120)))).toBe(first);
  });

  it("quantises the window emissive so setMaterial runs at most once per 0.05 step", () => {
    const r = recorder();
    const d = createDaylight(r.targets);
    for (let t = 0; t <= 180; t += 0.25) d.apply(lookFrame(phaseAt(t)));
    const steps = r.log.filter((l) => l.startsWith("windows:"));
    expect(steps.length).toBeLessThanOrEqual(Math.ceil((1.4 - 0.15) / 0.05) + 2);
    expect(steps[0]).toBe("windows:0.15");
    expect(steps.at(-1)).toBe("windows:1.40");
  });

  it("aims the key down along the light and decodes sky colours to linear", () => {
    const f = lookFrame(PHASES[0]!);
    expect(f.key.direction[1]).toBeLessThan(0);
    expect(linear("#ffffff")).toEqual([1, 1, 1]);
    expect(f.sky.skyStars).toBe(0);
    expect(lookFrame(PHASES[2]!).sky.skyStars).toBe(1);
  });
});

describe("gridlock courier shaders", () => {
  it("declare every uniform the GLSL reads and avoid the time built-in", () => {
    const spec = shiftSkySpec({ ...lookFrame(PHASES[0]!).sky, skyDrift: 0 });
    for (const u of Object.keys(spec.uniforms ?? {})) expect(SHIFT_SKY_FRAGMENT + " sunDirection").toContain(u);
    const water = waterSpec({ ...lookFrame(PHASES[1]!).water, waterTime: 0 });
    for (const u of Object.keys(water.uniforms ?? {})) expect(WATER_FRAGMENT).toContain(u);
    expect(WATER_FRAGMENT).toContain(QUAY_Z.toFixed(1));
    for (const src of [SHIFT_SKY_FRAGMENT, SHIFT_FAR_FRAGMENT, WATER_FRAGMENT]) expect(src).not.toMatch(/\btime\b/);
  });
});

describe("gridlock courier wet road (GC-M1)", () => {
  it("paints puddles at roughness 0.04 over damp asphalt", () => {
    const fills: string[] = [];
    const g = { fillStyle: "", globalAlpha: 1, globalCompositeOperation: "source-over" as GlobalCompositeOperation, fillRect: () => fills.push(String(g.fillStyle)), beginPath: () => undefined, ellipse: () => undefined, fill: () => fills.push(String(g.fillStyle)) };
    paintWetRoughness(g as never, 1024);
    expect(fills).toContain(`rgb(${Math.round(WET.puddle * 255)},${Math.round(WET.puddle * 255)},${Math.round(WET.puddle * 255)})`);
    expect(puddles().length).toBeGreaterThanOrEqual(10);
    expect(puddles()).toEqual(puddles());
  });
});

describe("gridlock courier QA crops", () => {
  const pose = { eye: [0, 2.1, -5] as const, target: [0, 1.25, 5] as const, fovDeg: 60, aspect: 16 / 9 };
  it("projects the point ahead to the centre and the car box near the bottom middle", () => {
    const c = project([0, 1.25, 5], pose)!;
    expect(c[0]).toBeCloseTo(0.5, 5);
    expect(c[1]).toBeCloseTo(0.5, 5);
    expect(project([0, 1, -10], pose)).toBeNull();
    const box = carBox(0, 0, 0, pose)!;
    expect(box.x + box.w / 2).toBeCloseTo(0.5, 2);
    expect(box.y + box.h).toBeGreaterThan(0.6);
    expect(box.h).toBeGreaterThan(0.1);
  });

  it("publishes named, normalised crops with the beacon when a job is open", () => {
    const crops = shiftCrops({ x: 0, z: 0, heading: 0 }, pose, { x: 0, z: 200 });
    const names = crops.map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(["road-bottom", "sky-top", "horizon", "courier", "under-car", "beacon"]));
    for (const c of crops) {
      expect(c.name).toMatch(/^[a-z0-9][a-z0-9_-]{0,31}$/);
      for (const v of [c.x, c.y, c.x + c.w, c.y + c.h]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1.0001);
      }
    }
    expect(crops.length).toBeLessThanOrEqual(16);
  });
});

describe("gridlock courier chase framing (GC-C2) and reduced motion", () => {
  it("the shift framing sits closer and lower at fov 60; reduced motion keeps it calm", () => {
    const input = { x: 0, z: 0, y: 0, heading: 0, speed: 0, boosting: false, shake: 0 };
    const settle = () => {
      const cam = snapChase(input);
      for (let i = 0; i < 600; i++) stepChase(cam, input, 1 / 60);
      return cam;
    };
    setChaseFraming("original");
    const original = settle();
    setChaseFraming("shift");
    const shifted = settle();
    expect(Math.hypot(shifted.eye[0], shifted.eye[2])).toBeCloseTo(5.0, 1);
    expect(shifted.eye[1]).toBeCloseTo(2.1, 1);
    expect(shifted.fov).toBeCloseTo(60, 3);
    expect(Math.hypot(original.eye[0], original.eye[2])).toBeCloseTo(5.9, 1);
    setReducedMotion(true);
    expect(reducedMotion()).toBe(true);
    const calm = settle();
    expect(calm.fov).toBeCloseTo(60, 3);
    setReducedMotion(false);
    setChaseFraming("original");
  });
});
