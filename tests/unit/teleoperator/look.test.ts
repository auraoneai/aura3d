import { describe, expect, it } from "vitest";
import { resolveQrFlags } from "@aura3d/engine";
import { BOOT_SKY, KEY_SHADOW, SKY_LOOKS, SKY_ORDER, hdriUrl, keyLightPosition, sunDirection } from "../../../apps/showcase-teleoperator/src/look";
import { GRID_DISPATCH_FLAGS, buildGridDispatchScene } from "../../../apps/showcase-teleoperator/src/scene";

type Node = { kind?: string; light?: string; name?: string; environment?: string; texture?: { url?: string }; shadow?: unknown; position?: number[]; color?: string; intensity?: number; children?: Node[] };
const flatNodes = (sky: (typeof SKY_ORDER)[number]): Node[] => {
  const out: Node[] = [];
  const walk = (nodes: readonly Node[]): void => {
    for (const n of nodes) {
      out.push(n);
      if (n.children) walk(n.children);
    }
  };
  walk((buildGridDispatchScene(sky).toJSON() as unknown as { nodes: Node[] }).nodes);
  return out;
};

describe("grid dispatch look: GD-00 record-form flags", () => {
  it("keeps A3D_QR_GAME and names the sky and fog node flags explicitly", () => {
    expect(GRID_DISPATCH_FLAGS).toEqual({ A3D_QR_GAME: true, A3D_QR_VFX_SKY: true, A3D_QR_VFX_FOG: true });
  });

  it("resolves to exactly the flag set of the old [\"game\"] list (same draws before the new nodes exist)", () => {
    const before = resolveQrFlags({ options: ["game"] });
    const after = resolveQrFlags({ options: GRID_DISPATCH_FLAGS });
    expect({ ...after.values }).toEqual({ ...before.values });
    for (const name of ["A3D_QR_GAME", "A3D_QR_VFX", "A3D_QR_VFX_SKY", "A3D_QR_VFX_FOG", "A3D_QR_LIGHTING", "A3D_QR_POST"] as const) {
      expect(after.on(name), name).toBe(before.on(name));
    }
    expect(after.on("A3D_QR_VFX_SKY")).toBe(true);
    expect(after.on("A3D_QR_VFX_FOG")).toBe(true);
  });
});

describe("grid dispatch look table", () => {
  it("has one row per sky; Marine dusk is the boot sky and night is Sodium night", () => {
    expect([...SKY_ORDER].sort()).toEqual(["fog", "golden", "night", "noon"]);
    expect(BOOT_SKY).toBe("golden");
    expect(SKY_LOOKS.golden.label).toBe("Marine dusk");
    expect(SKY_LOOKS.night.label).toBe("Sodium night");
    for (const sky of SKY_ORDER) expect(SKY_LOOKS[sky].id).toBe(sky);
  });

  it("keeps the PRD key values (dusk 9 deg #ffb070 2.2; noon 62 deg 3.0; fog 0.8; night moon 0.25)", () => {
    expect(SKY_LOOKS.golden.sun.elevationDeg).toBe(9);
    expect(SKY_LOOKS.golden.key).toEqual({ color: "#ffb070", intensity: 2.2 });
    expect(SKY_LOOKS.noon.sun.elevationDeg).toBe(62);
    expect(SKY_LOOKS.noon.key.intensity).toBe(3.0);
    expect(SKY_LOOKS.fog.key.intensity).toBe(0.8);
    expect(SKY_LOOKS.night.key.intensity).toBe(0.25);
    expect(SKY_LOOKS.night.hemisphere.ground).toBe("#3a2a1c");
  });
});

describe("grid dispatch GD-01 explicit rig per sky", () => {
  for (const sky of SKY_ORDER) {
    it(`${sky}: own HDRI as IBL, one shadowed key on the sun ray (2048, 3 cascades, pcss), a hemisphere, no teal fill`, () => {
      const nodes = flatNodes(sky);
      const look = SKY_LOOKS[sky];
      const envs = nodes.filter((n) => n.kind === "environment");
      expect(envs).toHaveLength(1);
      expect(envs[0]!.environment).toBe("hdri");
      expect(envs[0]!.texture?.url).toBe(hdriUrl(look.hdri.id));
      const lightNodes = nodes.filter((n) => n.kind === "light");
      const shadowed = lightNodes.filter((n) => n.shadow !== undefined && n.shadow !== false);
      expect(shadowed).toHaveLength(1);
      expect(shadowed[0]!.light).toBe("directional");
      expect(shadowed[0]!.shadow).toEqual(KEY_SHADOW);
      expect((shadowed[0]!.shadow as { cascades: number }).cascades).toBe(3);
      expect(shadowed[0]!.color).toBe(look.key.color);
      expect(shadowed[0]!.intensity).toBe(look.key.intensity);
      const p = shadowed[0]!.position!;
      const len = Math.hypot(p[0]!, p[1]!, p[2]!);
      const dir = sunDirection(look.sun.elevationDeg, look.sun.azimuthDeg);
      for (let i = 0; i < 3; i++) expect(p[i]! / len).toBeCloseTo(dir[i]!, 6);
      expect(keyLightPosition(look)[1]).toBeGreaterThan(0);
      expect(lightNodes.filter((n) => n.light === "hemisphere")).toHaveLength(1);
      expect(lightNodes.some((n) => n.light === "ambient")).toBe(false);
      expect(lightNodes.some((n) => n.color === "#3fd6c6")).toBe(false);
      expect(nodes.some((n) => n.kind === "look" || (n.kind === "group" && String(n.name ?? "").startsWith("aura-look:")))).toBe(false);
    });
  }

  it("puts every sun or moon azimuth in front of the fixed camera (it looks down -z), so the key backlights the street", () => {
    for (const sky of SKY_ORDER) {
      const d = sunDirection(SKY_LOOKS[sky].sun.elevationDeg, SKY_LOOKS[sky].sun.azimuthDeg);
      expect(d[2] / Math.hypot(d[0], d[2]), sky).toBeLessThan(-0.8);
    }
    // the low dusk sun sits inside the 56 deg frame (above the horizon, below the top edge)
    const dusk = sunDirection(SKY_LOOKS.golden.sun.elevationDeg, SKY_LOOKS.golden.sun.azimuthDeg);
    expect(dusk[1]).toBeGreaterThan(0);
    expect(Math.atan2(dusk[1], -dusk[2]) * (180 / Math.PI)).toBeLessThan(18);
  });
});
