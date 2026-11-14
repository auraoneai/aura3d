import { describe, expect, it } from "vitest";
import { buildWorld, bellLightIntensity, eulerZYXFromYawPitchRoll, paintSpec, propSpec, shaftPatch, SHAFT_INTENSITY } from "../../../examples/where-the-wind-wanders-port/world";
import { PAPER_GLSL, paperPass } from "../../../examples/where-the-wind-wanders-port/paper-pass";
import { PAINT_FRAGMENT, PROP_FRAGMENT } from "../../../examples/where-the-wind-wanders-port/shaders";
import { DAYLIGHT_KEYS } from "../../../examples/where-the-wind-wanders-port/daylight";
import { BELLKEEPER_JOINT_IDS, MAT, getHighlandMaterials } from "../../../examples/where-the-wind-wanders-port/art/proceduralModels";

interface Node {
  readonly kind?: string;
  readonly name?: string;
  readonly effect?: string;
  readonly mode?: string;
  readonly near?: number;
  readonly far?: number;
  readonly maxOpacity?: number;
  readonly saturation?: number;
  readonly contrast?: number;
  readonly intensity?: number;
  readonly rotationOrder?: string;
  readonly postAuthored?: readonly string[];
  readonly material?: { metallic?: number; sheen?: number };
  readonly materials?: readonly { metallic?: number; sheen?: number }[];
  readonly children?: readonly Node[];
}

const sceneNodesCache = new Map<string, readonly Node[]>();
const sceneNodesOf = (options: Parameters<typeof buildWorld>[0] = {}): readonly Node[] => {
  const key = JSON.stringify({
    density: options.density ?? 0.15,
    look: options.look ?? "gu47",
    daylightKey: options.daylightKey ?? null,
    quality: options.quality ?? "high",
    title: Boolean(options.titleVisible?.())
  });
  let cached = sceneNodesCache.get(key);
  if (!cached) {
    cached = (buildWorld({ density: 0.15, ...options }).scene.toJSON() as unknown as { nodes: readonly Node[] }).nodes;
    sceneNodesCache.set(key, cached);
  }
  return cached;
};

const effectsOf = (options: Parameters<typeof buildWorld>[0]): Node[] => {
  const out: Node[] = [];
  const walk = (n: Node): void => { if (n.kind === "effect") out.push(n); (n.children ?? []).forEach(walk); };
  sceneNodesOf(options).forEach(walk);
  return out;
};

const modelsOf = (options: Parameters<typeof buildWorld>[0]): Node[] => {
  const out: Node[] = [];
  const walk = (n: Node): void => { if (n.kind === "model") out.push(n); (n.children ?? []).forEach(walk); };
  sceneNodesOf(options).forEach(walk);
  return out;
};

const findNamedNode = (options: Parameters<typeof buildWorld>[0], targetName: string): Node | undefined => {
  let hit: Node | undefined;
  const walk = (n: Node): void => {
    if (n.name === targetName) hit = n;
    (n.children ?? []).forEach(walk);
  };
  sceneNodesOf(options).forEach(walk);
  return hit;
};

describe("where-the-wind-wanders-port zero-GLB procedural Bellkeeper & sanctuary bell (WW47-M1)", () => {
  it("mounts zero external GLB models in both GU47 and original looks and sculpts the articulated multi-material Bellkeeper and bronze bell", () => {
    expect(modelsOf({})).toEqual([]);
    expect(modelsOf({ look: "original" })).toEqual([]);

    const heroGroup = findNamedNode({}, "hero");
    expect(heroGroup?.kind).toBe("group");
    for (const jointName of BELLKEEPER_JOINT_IDS) {
      const joint = findNamedNode({}, jointName);
      expect(joint?.kind).toBe("group");
    }
    const torsoMesh = findNamedNode({}, "hero-torso-mesh");
    const torsoSheens = (torsoMesh?.children ?? []).map((c) => c.material?.sheen ?? 0);
    expect(Math.max(...torsoSheens)).toBeGreaterThan(0.6);

    const chimeMesh = findNamedNode({}, "hero-staff-chime-mesh");
    const chimeMetals = (chimeMesh?.children ?? []).map((c) => c.material?.metallic ?? 0);
    expect(Math.max(...chimeMetals)).toBeGreaterThanOrEqual(0.9);

    const bellGroup = findNamedNode({}, "belltower-bell");
    expect(bellGroup?.kind).toBe("group");
    const bellChildMetals = (bellGroup?.children ?? []).map((c) => c.material?.metallic ?? 0);
    expect(Math.max(...bellChildMetals)).toBeGreaterThanOrEqual(0.9);

    // Matte-soft cloak/hood/scarf/skin anti-twig-reflection invariant + ZYX Euler heading/lean stability
    expect(heroGroup?.rotationOrder ?? "ZYX").toBe("ZYX");
    expect(findNamedNode({}, "kite")?.rotationOrder ?? "ZYX").toBe("ZYX");
    const mats = getHighlandMaterials();
    for (const idx of [
      MAT.LINEN_CLOTH,
      MAT.SILK_ACCENT,
      MAT.CLOAK_SAFFRON,
      MAT.CLOAK_INDIGO,
      MAT.CLOAK_SAGE,
      MAT.TUNIC_SLATE,
      MAT.REED_STRAW,
      MAT.SKIN_SERENE,
      MAT.LEATHER_SUPPLE
    ]) {
      const m = mats[idx]!;
      expect(m.roughness).toBeGreaterThanOrEqual(0.56);
      expect(m.roughness).toBeLessThanOrEqual(0.74);
      expect((m as { clearcoat?: number }).clearcoat ?? 0).toBe(0);
      expect(m.envMapIntensity).toBeGreaterThanOrEqual(0.04);
      expect(m.envMapIntensity).toBeLessThanOrEqual(0.12);
    }
    const [rx, ry, rz] = eulerZYXFromYawPitchRoll(1.35, 0.08, -0.14);
    const cy = Math.cos(1.35), sy = Math.sin(1.35), cp = Math.cos(0.08), sp = Math.sin(0.08);
    // Forward +Z under Ry(yaw)*Rx(pitch)*Rz(roll) vs Rz(rz)*Ry(ry)*Rx(rx) must match identically
    const cx = Math.cos(rx), sx = Math.sin(rx), cy2 = Math.cos(ry), sy2 = Math.sin(ry), cz = Math.cos(rz), sz = Math.sin(rz);
    expect(cz * sy2 * cx + sz * sx).toBeCloseTo(sy * cp, 6);
    expect(sz * sy2 * cx - cz * sx).toBeCloseTo(-sp, 6);
    expect(cy2 * cx).toBeCloseTo(cy * cp, 6);
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

describe("where-the-wind-wanders-port crisp distance fog & zero blur (WW47-P1..P3)", () => {
  it("uses crisp linear distance fog (near >= 155, far >= 480, maxOpacity <= 0.24) and keeps depthOfField, motion-blur, and cinematic-film disabled", () => {
    const dusk = effectsOf({ daylightKey: 4 });
    const grade = dusk.find((e) => e.effect === "color-grade")!;
    expect(grade.saturation).toBe(1.14);
    expect(grade.contrast).toBe(1.1);
    expect(dusk.find((e) => e.effect === "vignette")!.intensity).toBe(0.16);

    const fx = effectsOf({});
    const fog = fx.find((e) => e.effect === "fog")!;
    expect(fog.mode).toBe("linear");
    expect(fog.near).toBeGreaterThanOrEqual(155);
    expect(fog.far).toBeGreaterThanOrEqual(480);
    expect(fog.maxOpacity).toBeLessThanOrEqual(0.24);

    expect(fx.find((e) => e.effect === "color-grade")!.saturation).toBe(1.22);
    expect(fx.find((e) => e.effect === "vignette")!.intensity).toBe(0.12);
    expect(fx.find((e) => e.effect === "bloom")!.postAuthored).not.toContain("radius");
    expect(fx.some((e) => e.effect === "volumetric-fog")).toBe(false);
    expect(fx.some((e) => e.effect === "film-grain")).toBe(true);

    for (const opts of [{}, { daylightKey: 4 }, { daylightKey: 5 }, { titleVisible: () => true }, { quality: "low" as const }, { look: "original" as const }]) {
      const list = effectsOf(opts);
      expect(list.some((e) => e.effect === "depth-of-field" || e.effect === "motion-blur" || e.effect === "cinematic-film")).toBe(false);
    }
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
