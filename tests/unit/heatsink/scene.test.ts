/**
 * Thermal Drift scene (C12 look and lights, C13 instancing, RH-06 per-app manifest, route budget).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildThermalDriftScene, INSTANCE_COUNTS, MODEL_NODE_COUNT } from "../../../apps/showcase-heatsink/src/scene";
import { CIRCUITS, DRONE_SPECS } from "../../../apps/showcase-heatsink/src/data";
import { CIRCUIT_LOOKS } from "../../../apps/showcase-heatsink/src/look";
import { assets, HEATSINK_ASSET_KEYS } from "../../../apps/showcase-heatsink/src/aura-assets";

type Node = {
  kind: string;
  primitive?: string;
  name?: string;
  light?: string;
  type?: string;
  effect?: string;
  shadow?: unknown;
  castShadow?: boolean;
  material?: { color?: string; clearcoat?: number; opacity?: number; ior?: number; sheen?: number };
  instances?: unknown[];
  children?: Node[];
  nodes?: Node[];
};
const flatten = (nodes: readonly Node[]): Node[] => nodes.flatMap((n) => [n, ...flatten((n.children ?? n.nodes ?? []) as Node[])]);

describe("heatsink scene", () => {
  const snapshot = buildThermalDriftScene({ circuit: CIRCUITS.grand }).toJSON() as unknown as { nodes: Node[] };
  const nodes = flatten(snapshot.nodes);
  const lightsOf = (kind: string) => nodes.filter((n) => n.kind === "light" && (n.light === kind || n.type === kind));
  const sceneOf = (id: keyof typeof CIRCUITS) => flatten((buildThermalDriftScene({ circuit: CIRCUITS[id] }).toJSON() as unknown as { nodes: Node[] }).nodes);
  it("replaces the night-city look with the circuit rig, prefiltered HDRI IBL (background: false) and a night sky dome (HS-01, WP-07)", () => {
    expect(JSON.stringify(snapshot.nodes)).not.toContain("night-city");
    expect(JSON.stringify(snapshot.nodes)).not.toContain("aura-look:");
    const skies = (id: keyof typeof CIRCUITS) => sceneOf(id).filter((n) => n.kind === "environment") as unknown as { environment: string; background: boolean; intensity: number; texture: { url: string } }[];
    expect(skies("grand").map((e) => [e.environment, e.background, e.intensity, e.texture.url])).toEqual([["hdri", false, 0.7, "/hdri/kloppenheim_02_1k.hdr"]]);
    expect(skies("dustfall").map((e) => [e.background, e.intensity, e.texture.url])).toEqual([[false, 1.1, "/hdri/industrial_sunset_puresky_1k.hdr"]]);
    expect(skies("vesper").map((e) => [e.background, e.intensity, e.texture.url])).toEqual([[false, 0.7, "/hdri/spruit_sunrise_1k.hdr"]]);
    for (const id of ["grand", "dustfall", "vesper"] as const) {
      expect(sceneOf(id).some((n) => n.kind === "sky"), id).toBe(true);
    }
  });
  it("has no backdrop wall, no horizon bands, and no point lights besides the HS-02 sodium lamps (HS-01, HS-03)", () => {
    for (const name of ["sky-backdrop", "horizon-band-a", "horizon-band-b"]) expect(nodes.find((n) => n.name === name), name).toBeUndefined();
    expect(lightsOf("point").map((n) => n.name)).toEqual(["td-sodium-gantry-l", "td-sodium-gantry-r"]);
    expect(lightsOf("ambient")).toHaveLength(0);
  });
  it("has one shadowed key (PCSS, 2 tight cascades), an unshadowed cyan rim, and the up-fill only on VESPER (HS-01, WP-07)", () => {
    for (const id of ["grand", "dustfall", "vesper"] as const) {
      const all = sceneOf(id);
      const shadowed = all.filter((n) => n.kind === "light" && n.shadow);
      expect(shadowed, id).toHaveLength(1);
      expect(shadowed[0]!.shadow).toMatchObject({ filter: "pcss", cascades: 2, mapSize: 2048, maxDistance: 65 });
      const directional = all.filter((n) => n.kind === "light" && n.light === "directional") as unknown as { name: string; color: string; intensity: number }[];
      expect(directional.find((l) => l.name === "td coolant rim")).toMatchObject({ color: "#35d6ff", intensity: id === "grand" ? 0.55 : 0.35 });
      expect(directional.some((l) => l.name === "td vent up-fill"), id).toBe(id === "vesper");
    }
    const key = nodes.find((n) => n.name === "td key light") as unknown as { color: string; intensity: number };
    expect(key).toMatchObject({ color: "#ffb070", intensity: 2 });
  });
  it("has no hemisphere, one bloom, one colour grade, one fog and an explicit AO pass", () => {
    expect(lightsOf("hemisphere")).toHaveLength(0);
    expect(nodes.filter((n) => n.kind === "effect" && n.effect === "bloom")).toHaveLength(1);
    expect(nodes.filter((n) => n.kind === "effect" && (n.effect === "colorGrade" || n.effect === "color-grade"))).toHaveLength(1);
    expect(nodes.filter((n) => n.kind === "effect" && n.effect === "fog")).toHaveLength(1);
    expect(nodes.filter((n) => n.kind === "effect" && n.effect === "ambient-occlusion")).toHaveLength(1);
  });
  it("authors the per-circuit fog, volumetric god rays on DUSTFALL only, and grain on every circuit (HS-05, HS-12, GU47 phase 3)", () => {
    const effectsOf = (id: keyof typeof CIRCUITS, effect: string) => sceneOf(id).filter((n) => n.kind === "effect" && n.effect === effect) as unknown as Record<string, unknown>[];
    expect(effectsOf("grand", "fog")[0]).toMatchObject({ color: "#4a3a30", density: 0.02 });
    expect(effectsOf("dustfall", "fog")[0]).toMatchObject({ color: "#8a5a2e", density: 0.02 });
    expect(effectsOf("vesper", "fog")[0]).toMatchObject({ color: "#4a4670", density: 0.014 });
    expect((["grand", "dustfall", "vesper"] as const).map((id) => effectsOf(id, "volumetric-fog").length)).toEqual([0, 1, 0]);
    expect(effectsOf("dustfall", "volumetric-fog")[0]).toHaveProperty("godRayDensity");
    expect((["grand", "dustfall", "vesper"] as const).map((id) => effectsOf(id, "film-grain").length)).toEqual([1, 1, 1]);
    for (const id of ["grand", "dustfall", "vesper"] as const) {
      expect(effectsOf(id, "bloom")[0], id).toMatchObject({ intensity: 0.55, threshold: 0.8 });
      expect(effectsOf(id, "vignette")[0], id).toMatchObject({ intensity: 0.28 });
    }
  });
  it("paves the road with the CC0 asphalt set at the circuit roughness, probes it 1 frame in 6 and adds SSR when wet (HS-07)", () => {
    for (const id of ["grand", "dustfall", "vesper"] as const) {
      const all = sceneOf(id);
      const deck = all.find((n) => n.name === "road-deck-even") as unknown as { material: { texture?: { url: string }; normal?: { url: string }; roughnessMap?: { url: string }; roughness: number } };
      expect(deck.material.texture?.url, id).toMatch(/asphalt033\/color-512\.webp$/);
      expect(deck.material.normal?.url, id).toMatch(/asphalt033\/normal-gl-512\.webp$/);
      expect(deck.material.roughnessMap?.url, id).toMatch(/asphalt033\/roughness-512\.webp$/);
      expect(deck.material.roughness * 0.745, id).toBeCloseTo(CIRCUIT_LOOKS[id].road.roughness, 3);
      const probesOf = all.filter((n) => n.kind === "probe");
      expect(probesOf.length, id).toBe(0);
      expect(all.some((n) => n.kind === "effect" && n.effect === "screen-space-reflections"), id).toBe(id !== "dustfall");
    }
    const bytes = ["color-512.webp", "normal-gl-512.webp", "roughness-512.webp"].reduce((sum, f) => sum + statSync(`apps/showcase-heatsink/textures/asphalt033/${f}`).size, 0);
    expect(bytes).toBeLessThanOrEqual(1.5 * 1024 * 1024);
  });
  it("draws the road, walls, rain and bolts as instanced nodes; emissive decor casts no shadow", () => {
    const instanced = nodes.filter((n) => Array.isArray(n.instances) && n.instances.length > 0 && !String(n.name).startsWith("td skyline"));
    const total = instanced.reduce((sum, n) => sum + n.instances!.length, 0);
    expect(instanced.length).toBe(Object.keys(INSTANCE_COUNTS).length);
    expect(total).toBe(Object.values(INSTANCE_COUNTS).reduce((a, b) => a + b, 0));
    for (const name of ["road-spine-a", "road-spine-b", "road-lanes", "wall-chevrons-a", "wall-chevrons-b", "laser-bolts"]) {
      expect(nodes.find((n) => n.name === name)?.castShadow, name).toBe(false);
    }
    const primitives = nodes.filter((n) => n.kind === "primitive" && n.primitive !== "custom" && !Array.isArray(n.instances));
    expect(primitives.length).toBeLessThan(10);
    for (const inst of instanced.filter((n) => n.instances!.length > 16)) {
      expect(inst.material?.clearcoat ?? 0, `${inst.name} clearcoat`).toBe(0);
      expect(inst.material?.sheen ?? 0, `${inst.name} sheen`).toBe(0);
    }
  });
  it("mounts rain only on MEGACITY, dust only on DUSTFALL, embers only on VESPER, and no weather on reduced motion (HS-06)", () => {
    const weatherOf = (id: keyof typeof CIRCUITS, reducedMotion = false) =>
      flatten((buildThermalDriftScene({ circuit: CIRCUITS[id], reducedMotion }).toJSON() as unknown as { nodes: Node[] }).nodes)
        .filter((n) => n.kind === "effect" && ["rain", "snow", "particles"].includes(String(n.effect)))
        .map((n) => n.effect);
    expect(weatherOf("grand")).toEqual(["rain"]);
    expect(weatherOf("dustfall")).toEqual(["snow"]);
    expect(weatherOf("vesper")).toEqual(["particles"]);
    for (const id of ["grand", "dustfall", "vesper"] as const) expect(weatherOf(id, true), id).toEqual([]);
    expect(nodes.find((n) => n.name === "rain-streaks")).toBeUndefined();
    // The embers rise (positive y acceleration) from a disc below the deck, capped well under the VFX live budget.
    const embers = sceneOf("vesper").find((n) => n.kind === "effect" && n.effect === "particles") as unknown as { position: number[]; radius: number; gravity: number; maxParticles: number; blend: string };
    expect(embers.position[1]).toBeLessThan(0);
    expect(embers.radius).toBeGreaterThan(11.2);
    expect(embers.gravity).toBeGreaterThan(0);
    expect(embers.maxParticles).toBeLessThanOrEqual(96);
    expect(embers.blend).toBe("additive");
  });
  it("drops the shadow casters of far towers, emissive pieces and canopies, keeps them on arches, tunnels and drone hulls (HS-20, WP-03)", () => {
    const castsShadow = (name: string): boolean => {
      const root = nodes.find((n) => n.name === name);
      expect(root, name).toBeDefined();
      const prims = flatten([root!]).filter((n) => n.kind === "primitive");
      expect(prims.length, `${name} primitives`).toBeGreaterThan(0);
      return prims.some((p) => p.castShadow !== false);
    };
    for (const name of ["batch-heatsink_thermalTowerLIron", "prop-tower-t-left", "prop-tower-x-right", "batch-heatsinkHoloBillboard", "prop-checkpoint-ring", "prop-lava-fall"]) {
      expect(castsShadow(name), name).toBe(false);
    }
    for (const name of ["batch-heatsink_thermalArchIron", "batch-heatsinkTunnelFrame", "prop-overpass", "prop-gantry-start", "drone-orion"]) {
      expect(castsShadow(name), name).toBe(true);
    }
    for (const glass of nodes.filter((n) => n.kind === "primitive" && (n.material?.opacity ?? 1) < 1)) {
      expect(glass.castShadow, glass.name).toBe(false);
    }
  });
  it("sculpts every drone as a multi-material craft tinted towards its DRONE_SPECS colour (hue within 20 deg) under a clearcoat (HS-10, WP-03)", () => {
    const hue = (hex: string) => {
      const n = Number.parseInt(hex.slice(1), 16);
      const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255) as [number, number, number];
      const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
      if (d === 0) return 0;
      const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return (h * 60 + 360) % 360;
    };
    for (const id of Object.keys(DRONE_SPECS) as (keyof typeof DRONE_SPECS)[]) {
      const spec = DRONE_SPECS[id];
      const hullGroup = nodes.find((n) => n.name === `${spec.nodeId}-hull`);
      const canopy = nodes.find((n) => n.name === `${spec.nodeId}-canopy`);
      expect(hullGroup?.children?.length ?? 0, `${id} multi-material slots`).toBeGreaterThanOrEqual(4);
      expect(canopy?.castShadow, `${id} canopy shadow`).toBe(false);
      expect(canopy?.material?.opacity, `${id} canopy opacity`).toBeCloseTo(0.42, 2);
      const primaryMat = hullGroup?.children?.[0]?.material;
      expect(primaryMat?.clearcoat ?? 0, id).toBeGreaterThan(0.5);
      const delta = Math.abs(hue(primaryMat!.color!) - hue(spec.color));
      expect(Math.min(delta, 360 - delta), id).toBeLessThanOrEqual(20);
    }
  });
  it("mounts zero static GLB models and stays inside the route budget of 32 model nodes (WP-03)", () => {
    expect(MODEL_NODE_COUNT).toBe(0);
    expect(nodes.filter((n) => n.kind === "model")).toHaveLength(MODEL_NODE_COUNT);
    const budget = JSON.parse(readFileSync("apps/showcase-heatsink/route-health.json", "utf8")).budgets.maxModelNodes;
    expect(MODEL_NODE_COUNT).toBeLessThanOrEqual(budget);
  });
  it("can drop the explicit AO pass for the QA on/off pair", () => {
    const off = flatten((buildThermalDriftScene({ circuit: CIRCUITS.grand, ambientOcclusion: false }).toJSON() as unknown as { nodes: Node[] }).nodes);
    expect(off.filter((n) => n.kind === "effect" && /ambient/i.test(String(n.effect)))).toHaveLength(0);
    expect(nodes.filter((n) => n.kind === "effect" && /ambient/i.test(String(n.effect)))).toHaveLength(1);
  });
});

describe("heatsink asset manifest (RH-06)", () => {
  it("lists zero GLB models (100% @aura3d/engine procedural geometry)", () => {
    expect(HEATSINK_ASSET_KEYS).toEqual([]);
    expect(Object.keys(assets)).toEqual([]);
  });
  it("the app no longer imports the shared root catalog", () => {
    for (const file of ["main.ts", "scene.ts", "view.ts"]) {
      // invariant: source must not reintroduce `../../../src/aura-assets` — Heatsink resolves models from its own app manifest, not the shared root asset catalog
      expect(readFileSync(`apps/showcase-heatsink/src/${file}`, "utf8"), file).not.toMatch(/\.\.\/\.\.\/\.\.\/src\/aura-assets/);
    }
  });
});
