import { describe, expect, it } from "vitest";
import { resolveQrFlags } from "@aura3d/engine";
import { BOOT_SKY, KEY_SHADOW, SKY_LOOKS, SODIUM, SKY_ORDER, hazeAt, hdriUrl, keyLightPosition, nextSky, skyFromParam, sunDirection } from "../../../apps/showcase-teleoperator/src/look";
import { GRID_DISPATCH_FLAGS, SODIUM_POINT_MAX, WEATHER, buildGridDispatchScene, nearestLamps, skyOutput, tailLampMaterial, windowGlowOverride } from "../../../apps/showcase-teleoperator/src/scene";

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

describe("grid dispatch GD-04 real sky node per sky", () => {
  type SkyNode = Node & { spec?: { model: string; zenith?: string; horizon?: string; turbidity?: number; sun?: { elevationDeg: number; azimuthDeg: number }; stars?: { count: number }; bands?: unknown[] }; captureEnvironment?: boolean };
  for (const sky of SKY_ORDER) {
    it(`${sky}: one sky node, no emissive box sky and no sun sphere`, () => {
      const nodes = flatNodes(sky) as SkyNode[];
      const skies = nodes.filter((n) => n.kind === "sky");
      expect(skies).toHaveLength(1);
      expect(skies[0]!.captureEnvironment).toBe(false);
      expect(skies[0]!.spec?.model).toBe(SKY_LOOKS[sky].sky.model);
      expect(nodes.some((n) => n.name === "sf-horizon-sky" || n.name === "sf-sun-disc")).toBe(false);
      const sun = skies[0]!.spec?.sun;
      if (SKY_LOOKS[sky].sun.intensity > 0) {
        expect(sun).toMatchObject({ elevationDeg: SKY_LOOKS[sky].sun.elevationDeg, azimuthDeg: SKY_LOOKS[sky].sun.azimuthDeg });
      } else {
        expect(sun).toBeUndefined();
      }
    });
  }

  it("dusk is the #2b3a55 to #f2a65e gradient, noon Preetham turbidity 3, night dark with typed stars", () => {
    const spec = (sky: (typeof SKY_ORDER)[number]) => (flatNodes(sky) as SkyNode[]).find((n) => n.kind === "sky")!.spec!;
    expect(spec("golden")).toMatchObject({ model: "gradient", zenith: "#2b3a55", horizon: "#f2a65e" });
    expect(spec("noon")).toMatchObject({ model: "preetham", turbidity: 3 });
    expect(spec("fog").model).toBe("gradient");
    expect(spec("night")).toMatchObject({ model: "gradient", zenith: "#060a14", stars: { count: 220 } });
    expect(spec("night").bands).toHaveLength(1);
  });
});

describe("grid dispatch GD-05 marine haze (engine height fog)", () => {
  type FogNode = Node & { effect?: string; mode?: string; heightReference?: number; affectsBackground?: boolean };
  for (const sky of SKY_ORDER) {
    it(`${sky}: one height-fog node in the row's colour that also fogs the sky`, () => {
      const fogs = (flatNodes(sky) as FogNode[]).filter((n) => n.kind === "effect" && n.effect === "fog");
      expect(fogs).toHaveLength(1);
      expect(fogs[0]).toMatchObject({ mode: "height", color: SKY_LOOKS[sky].fog.color, heightReference: SKY_LOOKS[sky].fog.heightReference, affectsBackground: true });
    });
  }

  it("marine fog keeps the lane lines at 40 m clear and swallows the bay at 250 m", () => {
    expect(hazeAt(SKY_LOOKS.fog, 40)).toBeLessThan(0.3);
    expect(hazeAt(SKY_LOOKS.fog, 250)).toBeGreaterThan(0.8);
    expect(SKY_LOOKS.fog.fog.heightReference).toBe(12);
    expect(SKY_LOOKS.golden.fog.heightReference).toBe(28);
  });

  it("dusk greys the skyline but not the near street; night is the thinnest haze after noon", () => {
    expect(hazeAt(SKY_LOOKS.golden, 20)).toBeLessThan(0.06);
    expect(hazeAt(SKY_LOOKS.golden, 250)).toBeGreaterThan(0.6);
    expect(hazeAt(SKY_LOOKS.night, 250)).toBeLessThan(hazeAt(SKY_LOOKS.golden, 250));
    expect(hazeAt(SKY_LOOKS.noon, 250)).toBeLessThan(hazeAt(SKY_LOOKS.night, 250));
  });
});

describe("grid dispatch GD-08 tone mapping and post per sky", () => {
  type PostNode = Node & { effect?: string; threshold?: number; contrast?: number; saturation?: number; temperature?: number };
  const post = (sky: (typeof SKY_ORDER)[number], effect: string) => (flatNodes(sky) as PostNode[]).find((n) => n.kind === "effect" && n.effect === effect);

  it("Marine dusk asks for AgX with an ACES fallback; the other skies use ACES", () => {
    expect(skyOutput(SKY_LOOKS.golden)).toEqual({ toneMapping: "agx", exposure: SKY_LOOKS.golden.output.exposure });
    expect(skyOutput(SKY_LOOKS.golden, ["aces", "reinhard"]).toneMapping).toBe("aces");
    for (const sky of ["noon", "fog", "night"] as const) expect(skyOutput(SKY_LOOKS[sky]).toneMapping).toBe("aces");
  });

  it("noon bloom threshold 0.95 (no white-pod halo), fog low bloom, night bloom 0.55", () => {
    expect(post("noon", "bloom")).toMatchObject({ threshold: 0.95 });
    expect(post("night", "bloom")!.intensity).toBe(0.55);
    expect(post("fog", "bloom")!.intensity).toBeLessThan(post("golden", "bloom")!.intensity!);
    expect(post("fog", "bloom")!.intensity).toBeLessThan(post("noon", "bloom")!.intensity!);
  });

  it("every sky carries its own E-C grade (white balance) and vignette, and the four grades differ", () => {
    const grades = SKY_ORDER.map((sky) => post(sky, "color-grade")!);
    for (const [i, sky] of SKY_ORDER.entries()) expect(grades[i]).toMatchObject({ contrast: SKY_LOOKS[sky].grade.contrast, saturation: SKY_LOOKS[sky].grade.saturation, temperature: SKY_LOOKS[sky].grade.temperature });
    expect(new Set(grades.map((g) => JSON.stringify([g.contrast, g.saturation, g.temperature]))).size).toBe(4);
    for (const sky of SKY_ORDER) expect(post(sky, "vignette")).toBeDefined();
  });
});

describe("grid dispatch GD-21 Marine dusk boot sky", () => {
  it("boots Marine dusk, `?sky=` picks a row, T cycles every sky once", () => {
    expect(skyFromParam(null)).toBe("golden");
    expect(skyFromParam("dusk")).toBe("golden");
    expect(skyFromParam("NIGHT")).toBe("night");
    expect(skyFromParam("bogus")).toBe(BOOT_SKY);
    const seen = new Set<string>();
    let sky = BOOT_SKY;
    for (let i = 0; i < SKY_ORDER.length; i++) { seen.add(sky); sky = nextSky(sky); }
    expect(sky).toBe(BOOT_SKY);
    expect(seen.size).toBe(4);
  });

  it("labels: Marine dusk and Sodium night (scene toast labels match the look table)", () => {
    expect(SKY_LOOKS.golden.label).toBe("Marine dusk");
    expect(SKY_LOOKS.night.label).toBe("Sodium night");
    for (const sky of SKY_ORDER) expect(WEATHER[sky].label).toBe(SKY_LOOKS[sky].label);
  });
});

describe("grid dispatch GD-03 headlights and tail lamps", () => {
  it("two headlight spots on dusk, fog and night (none at noon); tail-lamp pair on every sky", () => {
    for (const sky of SKY_ORDER) {
      const spots = flatNodes(sky).filter((n) => n.kind === "light" && n.light === "spot");
      expect(spots.length, sky).toBe(sky === "noon" ? 0 : 2);
      for (const s of spots) expect(s.shadow ?? false).toBeFalsy();
      expect(flatNodes(sky).some((n) => n.name === "player-tail-lamps"), sky).toBe(true);
    }
  });
  it("brake lights are brighter than the tail lamps", () => {
    const tail = tailLampMaterial(SKY_LOOKS.night, false) as { emissiveIntensity?: number };
    const brake = tailLampMaterial(SKY_LOOKS.night, true) as { emissiveIntensity?: number };
    expect(brake.emissiveIntensity!).toBeGreaterThan(tail.emissiveIntensity! * 2);
  });
});

describe("grid dispatch GD-02 sodium night street", () => {
  it("sodium points per sky from the look table, never above the cap of 3 (6 non-key lights); none at noon", () => {
    for (const sky of SKY_ORDER) {
      const points = flatNodes(sky).filter((n) => n.kind === "light" && n.light === "point");
      expect(points.length, sky).toBe(SKY_LOOKS[sky].street.sodiumPoints);
      expect(points.length).toBeLessThanOrEqual(SODIUM_POINT_MAX);
      for (const p of points) expect(p.color).toBe(SODIUM);
    }
    expect(SKY_LOOKS.night.street.sodiumPoints).toBe(3);
  });
  it("night lamp globes emissive 3.0, hemisphere ground #3a2a1c", () => {
    expect(SKY_LOOKS.night.street.lampEmissive).toBe(3);
    expect(SKY_LOOKS.night.hemisphere.ground).toBe("#3a2a1c");
  });
  it("nearestLamps: the closest rows in front of the camera, both sides, nearest first", () => {
    expect(nearestLamps([20, 2, -36, -74], 3)).toEqual([[-10.8, 2], [10.8, 2], [-10.8, -36]]);
  });
  it("window glow is off at noon and strongest at night", () => {
    expect(windowGlowOverride(SKY_LOOKS.noon).emissiveIntensity).toBe(0);
    expect(windowGlowOverride(SKY_LOOKS.night).emissiveIntensity).toBeGreaterThan(windowGlowOverride(SKY_LOOKS.golden).emissiveIntensity);
  });
});
