// 5.1 lane 511: opt-in look helpers (heroRig, heroStage, fogForExtent). They are additive: existing presets must expand
// exactly as before and never contain a helper node.
import { describe, expect, it } from "vitest";
import { looks } from "../../../packages/engine/src/agent-api/looks/looks.js";
import { fogDensityForExtent } from "../../../packages/engine/src/agent-api/looks/lookStage.js";
import type { AuraGroupNode } from "../../../packages/engine/src/agent-api/index.js";

const names = (node: AuraGroupNode): string[] => (node.children ?? []).map((c) => String((c as { name?: string }).name));

describe("fogForExtent", () => {
  it("reaches the requested opacity at the extent", () => {
    for (const mode of ["exp", "exp2"] as const) {
      const d = fogDensityForExtent(100, 0.4, mode);
      const opacity = mode === "exp" ? 1 - Math.exp(-d * 100) : 1 - Math.exp(-((d * 100) ** 2));
      expect(opacity).toBeCloseTo(0.4, 6);
    }
  });
  it("scales inversely with extent", () => {
    expect(fogDensityForExtent(200)).toBeCloseTo(fogDensityForExtent(100) / 2, 9);
  });
  it("rejects nonsense", () => {
    expect(() => fogDensityForExtent(0)).toThrow(RangeError);
    expect(() => fogDensityForExtent(10, 1)).toThrow(RangeError);
  });
  it("builds an effect node carrying the derived density", () => {
    const node = looks.fogForExtent({ extent: 260, haze: 0.4, mode: "exp2", color: "#b9cbd9" }).toJSON() as unknown as Record<string, unknown>;
    expect(node.effect).toBe("fog");
    expect(node.density).toBeCloseTo(fogDensityForExtent(260, 0.4, "exp2"), 9);
  });
});

describe("heroRig / heroStage", () => {
  it("heroRig emits key, fill and rim directional lights aimed at the target", () => {
    const rig = looks.heroRig({ target: [0, 1, 0], radius: 2 }).toJSON() as AuraGroupNode;
    expect(names(rig)).toEqual(["hero key", "hero fill", "hero rim"]);
    for (const light of rig.children as unknown as { light: string; target: number[] }[]) {
      expect(light.light).toBe("directional");
      expect(light.target).toEqual([0, 1, 0]);
    }
  });
  it("heroStage defaults to studio IBL, three lights, a floor and an edge-hiding fog", () => {
    const stage = looks.heroStage({ target: [0, 1, 0] }).toJSON() as AuraGroupNode;
    expect(names(stage)).toEqual(expect.arrayContaining(["hero studio environment", "hero key", "hero fill", "hero rim", "hero floor", "hero floor fade"]));
  });
  it("floor:false drops the floor and fog", () => {
    const stage = looks.heroStage({ floor: false }).toJSON() as AuraGroupNode;
    expect(names(stage).some((n) => n.includes("floor"))).toBe(false);
  });
  it("rejects a bad radius", () => {
    expect(() => looks.heroRig({ radius: 0 })).toThrow(RangeError);
  });
});

describe("existing looks are untouched", () => {
  it("no preset expansion contains a 5.1 helper node", () => {
    for (const id of looks.list()) {
      const json = JSON.stringify(looks.preset(id).toJSON());
      expect(json).not.toMatch(/hero (key|fill|rim|floor|studio)|extent fog/);
    }
  });
  it("preset expansion is deterministic and unchanged by the helpers existing", () => {
    const id = looks.list()[0]!;
    expect(JSON.stringify(looks.preset(id, { fogDensityScale: 0.15 }).toJSON())).toBe(JSON.stringify(looks.preset(id, { fogDensityScale: 0.15 }).toJSON()));
  });
});
