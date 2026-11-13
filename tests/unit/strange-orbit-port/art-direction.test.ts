import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { auditArtDirection, snapshotForAudit } from "@aura3d/game/art";
import type { AuraApp } from "@aura3d/engine";
import direction from "../../../examples/strange-orbit-port/art/direction";
import { LOOKS, SECTORS, lookFromSearch, sectorAt } from "../../../examples/strange-orbit-port/art/look";
import { EXHAUST_FLAME, EXHAUST_SMOKE, ORBIT_VFX_PRESETS, orbitVfxFor, registerOrbitVfx } from "../../../examples/strange-orbit-port/art/vfx";
import { GOUACHE_LIVERIES, buildWorld, riderSuitTint } from "../../../examples/strange-orbit-port/world";
import { writeArtDirectionAudit } from "../../../tools/game-checks/lib/art-direction.mjs";

/** GU47 WP-25 (lane g15): the art direction audits clean against the authored gouache scene (E-I compliance recipe). */
describe("strange-orbit-port art direction", () => {
  it("audits clean on the authored scene and writes the audit record", () => {
    const world = buildWorld({ vehicle: "bike", rider: 0, quality: "high" });
    const snapshot = snapshotForAudit({ scene: world.scene.toJSON() } as unknown as AuraApp, { assets: {} });
    const violations = auditArtDirection(direction, snapshot);
    writeArtDirectionAudit("examples/strange-orbit-port/art/direction.ts", { direction, snapshot, violations });
    expect(violations).toEqual([]);
  });

  it("keeps one row per variant, ?look=original selecting today's look", () => {
    expect(Object.keys(LOOKS).sort()).toEqual(["gouache", "original"]);
    expect(lookFromSearch("?look=original")).toBe("original");
    expect(lookFromSearch("")).toBe("gouache");
    expect(LOOKS.gouache.key.elevationDeg).toBe(18);
    expect(LOOKS.gouache.key.cascades).toBe(3);
    expect(LOOKS.gouache.key.filter).toBe("pcss");
  });

  it("maps PALETTE_STOPS to the four painted sectors", () => {
    expect(sectorAt(100)).toBe("warm");
    expect(sectorAt(450)).toBe("violet");
    expect(sectorAt(1190)).toBe("jade");
    expect(sectorAt(1220)).toBe("opal");
    expect(Object.keys(SECTORS).sort()).toEqual(["jade", "opal", "violet", "warm"]);
  });

  it("registers a preset per race event, halving emission under reduced motion", () => {
    const names: string[] = [];
    registerOrbitVfx({ registerPreset: (kind) => { names.push(kind); } });
    // SO47-V2: the event pack first, then the two atlas exhaust sequences that replace the old point exhaust
    expect(names).toEqual([...ORBIT_VFX_PRESETS.map((p) => p.name), EXHAUST_SMOKE, EXHAUST_FLAME]);
    for (const event of ["land", "hit", "dust", "gate", "sling"]) {
      const full = orbitVfxFor(event)!;
      const reduced = orbitVfxFor(event, true)!;
      expect(full.kind).toMatch(/^craterline-/);
      expect(reduced.count).toBeLessThanOrEqual(Math.ceil(full.count / 2));
    }
    expect(orbitVfxFor("tick")).toBeNull();
  });

  it("tints the hero model per rider so Sol, Ciel and Ember read as three distinct colours", () => {
    const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const dist = (a: string, b: string) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]!));
    for (const [a, b] of [[0, 1], [0, 2], [1, 2]] as const) expect(dist(riderSuitTint(a), riderSuitTint(b))).toBeGreaterThanOrEqual(40);
    type RiderGroup = { name?: string; children?: readonly { material?: { color?: string } }[] };
    for (const rider of [0, 1, 2]) {
      const nodes = buildWorld({ vehicle: "skate", rider, quality: "high" }).scene.toJSON().nodes as readonly RiderGroup[];
      const hero = nodes.find((n) => n.name === "rider-0-model")!;
      expect(hero.children?.[0]?.material?.color).toBe(riderSuitTint(rider));
    }
  });

  it("gives the five rivals pairwise-distinct liveries away from the objective colours (SO47-M2)", () => {
    const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const dist = (a: string, b: string) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]!));
    expect(GOUACHE_LIVERIES).toHaveLength(5);
    for (let i = 0; i < 5; i++) {
      for (let j = i + 1; j < 5; j++) expect(dist(GOUACHE_LIVERIES[i]!, GOUACHE_LIVERIES[j]!)).toBeGreaterThanOrEqual(35);
      expect(dist(GOUACHE_LIVERIES[i]!, direction.palette.accent)).toBeGreaterThanOrEqual(35);
      expect(dist(GOUACHE_LIVERIES[i]!, direction.palette.reservedObjective!)).toBeGreaterThanOrEqual(35);
    }
    type RiderGroup = { name?: string; children?: readonly { material?: { rim?: unknown; clearcoat?: number } }[] };
    const json = buildWorld({ vehicle: "bike", rider: 0, quality: "high" }).scene.toJSON();
    const nodes = json.nodes as readonly RiderGroup[];
    expect(nodes.filter((n) => (n as { kind?: string }).kind === "model")).toHaveLength(0);
    const riders = nodes.filter((n) => /^rider-\d-model$/.test(n.name ?? ""));
    expect(riders).toHaveLength(6);
    for (const r of riders) expect(r.children?.[0]?.material?.rim).toBeDefined();
    expect(riders.find((r) => r.name === "rider-0-model")!.children![0]!.material!.clearcoat).toBeGreaterThanOrEqual(0.6);
  });

  it("mounts 100% procedural multi-material vehicles, gantry & lunar colony props with WebGPU-safe materials", () => {
    const src = readFileSync(resolve(__dirname, "../../../examples/strange-orbit-port/art/proceduralModels.ts"), "utf8");
    expect(src.split(/\r?\n/).length).toBeGreaterThanOrEqual(550);
    expect(src).not.toMatch(/from\s+["']three(?:\/[^"']*)?["']|\bTHREE\./);
    expect(src).not.toMatch(/material\.studioGlass\s*\(/);
    const presets = new Set([...src.matchAll(/\bmaterial\.([a-zA-Z0-9_]+)\s*\(/g)].map((m) => m[1]!));
    expect(presets.size).toBeGreaterThanOrEqual(5);

    type AnyNode = {
      kind?: string;
      name?: string;
      effect?: string;
      transforms?: readonly unknown[];
      material?: { clearcoat?: number; sheen?: number };
    };
    for (const vehicle of ["bike", "skate"] as const) {
      const nodes = buildWorld({ vehicle, rider: 0, quality: "high", ghost: true }).scene.toJSON().nodes as readonly AnyNode[];
      const names = new Set(nodes.map((n) => n.name));
      expect(nodes.filter((n) => n.kind === "model")).toHaveLength(0);
      expect(nodes.filter((n) => n.effect === "motion-blur" || n.effect === "depth-of-field")).toHaveLength(0);
      for (let i = 0; i < 6; i++) {
        for (const sub of ["model", "fairing", "wheelF", "wheelR", "nozzleL", "nozzleR", "coneL", "coneR", "torso", "visor"]) {
          expect(names.has(`rider-${i}-${sub}`)).toBe(true);
        }
      }
      for (const prop of [
        "ghost-rider",
        "start-finish-gantry",
        "dress-lander",
        "dress-observatory",
        "colony-habitat-grid",
        "colony-dish-grid",
        "colony-solar-grid",
        "colony-trailer-grid",
        "colony-fuel-grid"
      ]) {
        expect(names.has(prop)).toBe(true);
      }
      for (const inst of nodes.filter((n) => (n.transforms?.length ?? 0) > 16)) {
        expect(inst.material?.clearcoat ?? 0, `${inst.name} clearcoat`).toBe(0);
        expect(inst.material?.sheen ?? 0, `${inst.name} sheen`).toBe(0);
      }

      // Hero Cosmic Moto-Racer torso & aero-visor helmet mount multi-material armor + emissive telemetry (zero white snowman spheres)
      const heroTorso = nodes.find((n) => n.name === "rider-0-torso") as { children?: readonly { material?: { emissiveIntensity?: number; clearcoat?: number } }[] } | undefined;
      const heroVisor = nodes.find((n) => n.name === "rider-0-visor") as { children?: readonly { material?: { emissiveIntensity?: number; clearcoat?: number; opacity?: number } }[] } | undefined;
      expect((heroTorso?.children?.length ?? 0)).toBeGreaterThanOrEqual(3);
      expect(heroTorso?.children?.some((c) => (c.material?.emissiveIntensity ?? 0) > 1.5)).toBe(true);
      expect((heroVisor?.children?.length ?? 0)).toBeGreaterThanOrEqual(4);
      expect(heroVisor?.children?.some((c) => (c.material?.emissiveIntensity ?? 0) > 1.5)).toBe(true);
      expect(heroVisor?.children?.some((c) => (c.material?.opacity ?? 1) < 1)).toBe(true);
    }
  });
});
