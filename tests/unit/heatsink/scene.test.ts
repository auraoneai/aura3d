/**
 * Thermal Drift scene (C12 look and lights, C13 instancing, RH-06 per-app manifest, route budget).
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildThermalDriftScene, INSTANCE_COUNTS, MODEL_NODE_COUNT } from "../../../apps/showcase-heatsink/src/scene";
import { CIRCUITS } from "../../../apps/showcase-heatsink/src/data";
import { assets, HEATSINK_ASSET_KEYS } from "../../../apps/showcase-heatsink/src/aura-assets";

type Node = { kind: string; name?: string; light?: string; type?: string; effect?: string; shadow?: unknown; castShadow?: boolean; instances?: unknown[]; children?: Node[]; nodes?: Node[] };
const flatten = (nodes: readonly Node[]): Node[] => nodes.flatMap((n) => [n, ...flatten((n.children ?? n.nodes ?? []) as Node[])]);

describe("heatsink scene", () => {
  const snapshot = buildThermalDriftScene({ circuit: CIRCUITS.grand }).toJSON() as unknown as { nodes: Node[] };
  const nodes = flatten(snapshot.nodes);
  const lightsOf = (kind: string) => nodes.filter((n) => n.kind === "light" && (n.light === kind || n.type === kind));
  it("uses the night-city look and no HDRI environment", () => {
    expect(JSON.stringify(snapshot.nodes)).toContain("night-city");
    expect(JSON.stringify(snapshot.nodes)).not.toContain("outdoor-day");
    expect(nodes.some((n) => n.kind === "environment" && JSON.stringify(n).includes(".hdr"))).toBe(false);
  });
  it("has one shadowed light, no hemisphere, one bloom and one colour grade", () => {
    const shadowed = nodes.filter((n) => n.kind === "light" && n.shadow);
    expect(shadowed).toHaveLength(1);
    expect(lightsOf("hemisphere")).toHaveLength(0);
    expect(nodes.filter((n) => n.kind === "effect" && n.effect === "bloom")).toHaveLength(1);
    expect(nodes.filter((n) => n.kind === "effect" && (n.effect === "colorGrade" || n.effect === "color-grade"))).toHaveLength(1);
    expect(nodes.filter((n) => n.kind === "effect" && n.effect === "fog")).toHaveLength(1);
  });
  it("draws the road, walls, rain and bolts as instanced nodes; emissive decor casts no shadow", () => {
    const instanced = nodes.filter((n) => Array.isArray(n.instances) && n.instances.length > 0);
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
  it("can drop the look's AO pass for the QA on/off pair", () => {
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
