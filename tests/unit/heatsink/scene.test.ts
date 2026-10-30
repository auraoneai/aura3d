/**
 * Thermal Drift scene (C12 look and lights, C13 instancing, RH-06 per-app manifest, route budget).
 */
import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildThermalDriftScene, INSTANCE_COUNTS, MODEL_NODE_COUNT } from "../../../apps/showcase-heatsink/src/scene";
import { CIRCUITS } from "../../../apps/showcase-heatsink/src/data";
import { CIRCUIT_LOOKS } from "../../../apps/showcase-heatsink/src/look";
import { assets, HEATSINK_ASSET_KEYS } from "../../../apps/showcase-heatsink/src/aura-assets";

type Node = { kind: string; name?: string; light?: string; type?: string; effect?: string; shadow?: unknown; castShadow?: boolean; instances?: unknown[]; children?: Node[]; nodes?: Node[] };
const flatten = (nodes: readonly Node[]): Node[] => nodes.flatMap((n) => [n, ...flatten((n.children ?? n.nodes ?? []) as Node[])]);

describe("heatsink scene", () => {
  const snapshot = buildThermalDriftScene({ circuit: CIRCUITS.grand }).toJSON() as unknown as { nodes: Node[] };
  const nodes = flatten(snapshot.nodes);
  const lightsOf = (kind: string) => nodes.filter((n) => n.kind === "light" && (n.light === kind || n.type === kind));
  const sceneOf = (id: keyof typeof CIRCUITS) => flatten((buildThermalDriftScene({ circuit: CIRCUITS[id] }).toJSON() as unknown as { nodes: Node[] }).nodes);
  it("replaces the night-city look with the circuit rig and draws the circuit HDRI as the sky (HS-01, HS-03)", () => {
    expect(JSON.stringify(snapshot.nodes)).not.toContain("night-city");
    expect(JSON.stringify(snapshot.nodes)).not.toContain("aura-look:");
    const skies = (id: keyof typeof CIRCUITS) => sceneOf(id).filter((n) => n.kind === "environment") as unknown as { environment: string; background: boolean; intensity: number; texture: { url: string } }[];
    expect(skies("grand").map((e) => [e.environment, e.background, e.intensity, e.texture.url])).toEqual([["hdri", true, 0.55, "/hdri/rooftop_night_1k.hdr"]]);
    expect(skies("dustfall").map((e) => [e.intensity, e.texture.url])).toEqual([[0.9, "/hdri/industrial_sunset_puresky_1k.hdr"]]);
    expect(skies("vesper").map((e) => [e.intensity, e.texture.url])).toEqual([[0.7, "/hdri/spruit_sunrise_1k.hdr"]]);
  });
  it("has no backdrop wall, no horizon bands and no point lights (HS-01, HS-03)", () => {
    for (const name of ["sky-backdrop", "horizon-band-a", "horizon-band-b"]) expect(nodes.find((n) => n.name === name), name).toBeUndefined();
    expect(lightsOf("point")).toHaveLength(0);
    expect(lightsOf("ambient")).toHaveLength(0);
  });
  it("has one shadowed key (PCSS, 3 cascades), an unshadowed cyan rim, and the up-fill only on VESPER (HS-01)", () => {
    for (const id of ["grand", "dustfall", "vesper"] as const) {
      const all = sceneOf(id);
      const shadowed = all.filter((n) => n.kind === "light" && n.shadow);
      expect(shadowed, id).toHaveLength(1);
      expect(shadowed[0]!.shadow).toMatchObject({ filter: "pcss", cascades: 3 });
      const directional = all.filter((n) => n.kind === "light" && n.light === "directional") as unknown as { name: string; color: string; intensity: number }[];
      expect(directional.find((l) => l.name === "td coolant rim")).toMatchObject({ color: "#35d6ff", intensity: 0.35 });
      expect(directional.some((l) => l.name === "td vent up-fill"), id).toBe(id === "vesper");
    }
    const key = nodes.find((n) => n.name === "td key light") as unknown as { color: string; intensity: number };
    expect(key).toMatchObject({ color: "#ffb070", intensity: 1.6 });
  });
  it("has no hemisphere, one bloom, one colour grade, one fog and an explicit AO pass", () => {
    expect(lightsOf("hemisphere")).toHaveLength(0);
    expect(nodes.filter((n) => n.kind === "effect" && n.effect === "bloom")).toHaveLength(1);
    expect(nodes.filter((n) => n.kind === "effect" && (n.effect === "colorGrade" || n.effect === "color-grade"))).toHaveLength(1);
    expect(nodes.filter((n) => n.kind === "effect" && n.effect === "fog")).toHaveLength(1);
    expect(nodes.filter((n) => n.kind === "effect" && n.effect === "ambient-occlusion")).toHaveLength(1);
  });
  it("authors the per-circuit fog, volumetric god rays on DUSTFALL only, and grain on MEGACITY only (HS-05, HS-12)", () => {
    const effectsOf = (id: keyof typeof CIRCUITS, effect: string) => sceneOf(id).filter((n) => n.kind === "effect" && n.effect === effect) as unknown as Record<string, unknown>[];
    expect(effectsOf("grand", "fog")[0]).toMatchObject({ color: "#2a1d14", density: 0.011 });
    expect(effectsOf("dustfall", "fog")[0]).toMatchObject({ color: "#8a5a2e", density: 0.02 });
    expect(effectsOf("vesper", "fog")[0]).toMatchObject({ color: "#2a2348", density: 0.008 });
    expect((["grand", "dustfall", "vesper"] as const).map((id) => effectsOf(id, "volumetric-fog").length)).toEqual([0, 1, 0]);
    expect(effectsOf("dustfall", "volumetric-fog")[0]).toHaveProperty("godRayDensity");
    expect((["grand", "dustfall", "vesper"] as const).map((id) => effectsOf(id, "film-grain").length)).toEqual([1, 0, 0]);
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
      const probesOf = all.filter((n) => n.kind === "probe") as unknown as { options: { update: unknown } }[];
      expect(probesOf.length, id).toBe(id === "dustfall" ? 0 : 1);
      for (const p of probesOf) expect(p.options.update).toEqual({ everyNFrames: 6 });
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
    for (const name of ["road-spine-a", "road-spine-b", "road-lanes", "wall-chevrons-a", "wall-chevrons-b", "rain-streaks", "laser-bolts"]) {
      expect(nodes.find((n) => n.name === name)?.castShadow, name).toBe(false);
    }
    const primitives = nodes.filter((n) => n.kind === "primitive" && !Array.isArray(n.instances));
    expect(primitives.length).toBeLessThan(10);
  });
  it("stays inside the route budget of 32 model nodes", () => {
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
  it("lists exactly the 26 heatsink models with full sha256 hashes, matching aura.assets.json", () => {
    expect(HEATSINK_ASSET_KEYS).toHaveLength(26);
    const manifest = JSON.parse(readFileSync("aura.assets.json", "utf8")).assets as { key?: string; id?: string; url: string; hash?: string; sha256?: string }[];
    for (const key of HEATSINK_ASSET_KEYS) {
      const def = (assets as unknown as Record<string, { url: string; hash?: string }>)[key]!;
      expect(def.url, key).toMatch(/^\/aura-assets\/heatsink/);
      const row = manifest.find((a) => a.url === def.url);
      expect(row, key).toBeDefined();
    }
  });
  it("the app no longer imports the shared root catalog", () => {
    for (const file of ["main.ts", "scene.ts", "view.ts"]) {
      expect(readFileSync(`apps/showcase-heatsink/src/${file}`, "utf8"), file).not.toMatch(/\.\.\/\.\.\/\.\.\/src\/aura-assets/);
    }
  });
});
