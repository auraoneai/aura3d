import { describe, expect, it } from "vitest";
import { buildWorld, bellLightIntensity } from "../../../examples/where-the-wind-wanders-port/world";
import { PAPER_GLSL, paperPass } from "../../../examples/where-the-wind-wanders-port/paper-pass";
import { paintSpec, propSpec, shaftPatch, SHAFT_INTENSITY } from "../../../examples/where-the-wind-wanders-port/world";
import { PAINT_FRAGMENT, PROP_FRAGMENT } from "../../../examples/where-the-wind-wanders-port/shaders";
import { DAYLIGHT_KEYS } from "../../../examples/where-the-wind-wanders-port/daylight";

interface Node { readonly kind?: string; readonly effect?: string; readonly saturation?: number; readonly contrast?: number; readonly intensity?: number; readonly postAuthored?: readonly string[]; readonly children?: readonly Node[] }
const effectsOf = (options: Parameters<typeof buildWorld>[0]): Node[] => {
  const out: Node[] = [];
  const walk = (n: Node): void => { if (n.kind === "effect") out.push(n); (n.children ?? []).forEach(walk); };
  (buildWorld(options).scene.toJSON() as unknown as { nodes: readonly Node[] }).nodes.forEach(walk);
  return out;
};

const modelsOf = (options: Parameters<typeof buildWorld>[0]): { name?: string; materialOverrides?: readonly { replaceTextures?: boolean; metallic?: number }[] }[] => {
  const out: { name?: string; materialOverrides?: readonly { replaceTextures?: boolean; metallic?: number }[] }[] = [];
  const walk = (n: Node & { name?: string }): void => { if (n.kind === "model") out.push(n as never); (n.children ?? []).forEach(walk); };
  (buildWorld(options).scene.toJSON() as unknown as { nodes: readonly Node[] }).nodes.forEach(walk);
  return out;
};

describe("where-the-wind-wanders-port painted GLB materials (WW47-M1)", () => {
  it("the bell is brass and no override replaces a GLB's textures", () => {
    const models = modelsOf({});
    expect(models.find((m) => m.name === "belltower-bell")?.materialOverrides?.[0]?.metallic).toBe(0.9);
    for (const m of models) for (const o of m.materialOverrides ?? []) expect(o.replaceTextures).not.toBe(true);
    expect(modelsOf({ look: "original" }).every((m) => m.materialOverrides === undefined)).toBe(true);
  });
});

describe("where-the-wind-wanders-port painted detail (WW47-M2)", () => {
  it("paintAmt defaults to 0 (the 4.6 surfaces) and gates the wind-aligned strokes, ochre path and prop grain", () => {
    expect(paintSpec().uniforms?.paintAmt).toEqual({ type: "f32", value: 0 });
    expect(propSpec().uniforms?.paintAmt).toEqual({ type: "f32", value: 0 });
    expect(PAINT_FRAGMENT).toMatch(/dot\(p, WIND_DIR\)/);
    expect(PAINT_FRAGMENT).toMatch(/pathEdge \* 0\.42 \* paintAmt/);
    expect(PROP_FRAGMENT).toMatch(/paintAmt > 0\.0 && k != 7 && k != 8/);
  });
});

describe("where-the-wind-wanders-port golden shafts per key (WW47-P2)", () => {
  it("density rises toward golden hour at a fixed low strength and the stage is off on the moonlit voyage", () => {
    const by = Object.fromEntries(DAYLIGHT_KEYS.map((k) => [k.id, shaftPatch(k.godRays)]));
    expect(by.found0).toEqual({ intensity: SHAFT_INTENSITY, godRayDensity: 0.12 });
    expect(by.found3!.godRayDensity).toBeGreaterThan(by.found0!.godRayDensity);
    expect(by.bell!.godRayDensity).toBeLessThan(by.found3!.godRayDensity);
    expect(by.epilogue).toBeNull();
    expect(shaftPatch(0.01)).toBeNull();
    expect(shaftPatch(0.03)!.godRayDensity).toBe(0.05);
  });
});

describe("where-the-wind-wanders-port post (WW47-P1..P3)", () => {
  it("GU47 grade is the softer gouache palette; bloom authors no radius", () => {
    const fx = effectsOf({});
    const grade = fx.find((e) => e.effect === "color-grade")!;
    expect(grade.saturation).toBe(1.05);
    expect(grade.contrast).toBe(1.06);
    expect(fx.find((e) => e.effect === "bloom")!.postAuthored).not.toContain("radius");
    expect(fx.find((e) => e.effect === "vignette")!.intensity).toBe(0.22);
    expect(fx.some((e) => e.effect === "volumetric-fog")).toBe(true);
    expect(fx.some((e) => e.effect === "film-grain")).toBe(true);
  });

  it("Low drops god rays and grain; ?look=original keeps the 4.6 post", () => {
    const low = effectsOf({ quality: "low" });
    expect(low.some((e) => e.effect === "volumetric-fog" || e.effect === "film-grain")).toBe(false);
    const orig = effectsOf({ look: "original" });
    expect(orig.find((e) => e.effect === "color-grade")!.saturation).toBe(1.28);
    expect(orig.some((e) => e.effect === "volumetric-fog")).toBe(false);
  });

  it("the paper pass runs after tonemapping at 4%", () => {
    const pass = paperPass(1280, 720) as unknown as { name: string; insertAt: string };
    expect(pass.name).toBe("wind-gouache-paper");
    expect(pass.insertAt).toBe("after-tonemap");
    expect(PAPER_GLSL).toMatch(/texture\(u_color, v_uv\)/);
  });

  it("the bell's brass light is dark before the bell and pulses with the swing after", () => {
    expect(bellLightIntensity(false, 0.3, 1)).toBe(0);
    expect(bellLightIntensity(true, 0.32, 1)).toBeGreaterThan(bellLightIntensity(true, 0, 1));
  });
});
