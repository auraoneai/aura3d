import { describe, expect, it } from "vitest";
import { buildWorld, bellLightIntensity } from "../../../examples/where-the-wind-wanders-port/world";
import { PAPER_GLSL, paperPass } from "../../../examples/where-the-wind-wanders-port/paper-pass";

interface Node { readonly kind?: string; readonly effect?: string; readonly saturation?: number; readonly contrast?: number; readonly intensity?: number; readonly postAuthored?: readonly string[]; readonly children?: readonly Node[] }
const effectsOf = (options: Parameters<typeof buildWorld>[0]): Node[] => {
  const out: Node[] = [];
  const walk = (n: Node): void => { if (n.kind === "effect") out.push(n); (n.children ?? []).forEach(walk); };
  (buildWorld(options).scene.toJSON() as unknown as { nodes: readonly Node[] }).nodes.forEach(walk);
  return out;
};

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
