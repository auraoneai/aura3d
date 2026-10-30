import { describe, expect, it } from "vitest";
import { applyPostAccessibility, buildFcScene, weatherParticleCount } from "../../../apps/showcase-aura-fc-3d/src/game/scene";
import { VENUE_LOOKS } from "../../../apps/showcase-aura-fc-3d/src/game/look";
import { VENUE_ORDER } from "../../../apps/showcase-aura-fc-3d/src/game/content";
import { FC_VFX_KINDS, fcVfxForEvent, fcVfxPack, fireFcVfx, registerFcVfxPack } from "../../../apps/showcase-aura-fc-3d/src/game/vfx";
import type { VenueId } from "../../../apps/showcase-aura-fc-3d/src/game/types";

/** GU47 WP-19 (lane g09): look table, weather, post, VFX pack and the reduced-motion / reduced-flash paths. */
type Node = { kind?: string; effect?: string; name?: string; particleCount?: number; children?: Node[] };
function flat(nodes: readonly Node[]): Node[] {
  return nodes.flatMap((n) => [n, ...flat(n.children ?? [])]);
}
function sceneNodes(venue: VenueId, reducedMotion = false): Node[] {
  return flat((buildFcScene(venue, { reducedMotion }).toJSON() as { nodes: Node[] }).nodes);
}
const effectsOf = (nodes: Node[]) => nodes.filter((n) => n.kind === "effect").map((n) => n.effect);

describe("aura-fc-3d GU47 look table", () => {
  it("has one row per venue and a distinct (look, post, weather, sky) tuple for every venue", () => {
    expect(Object.keys(VENUE_LOOKS).sort()).toEqual([...VENUE_ORDER].sort());
    const tuples = VENUE_ORDER.map((v) => {
      const l = VENUE_LOOKS[v];
      return `${l.look}|${l.post}|${l.weather}|${l.background}|${l.nightIbl?.source ?? l.skyHdri ?? ""}`;
    });
    expect(new Set(tuples).size).toBe(VENUE_ORDER.length);
  });

  it("FC47-L1: night venues use night-city / polar-night, never interior-industrial, and keep their sky colour", () => {
    for (const v of ["munich", "kyoto", "favela"] as const) expect(VENUE_LOOKS[v].look).toBe("night-city");
    expect(VENUE_LOOKS.glacier.look).toBe("polar-night");
    for (const v of VENUE_ORDER) expect(VENUE_LOOKS[v].look).not.toBe("interior-industrial");
  });

  it("FC47-S3: rain on Munich, drizzle on Kyoto, snow on Glacier, dust on Favela; none on the day venues", () => {
    expect(effectsOf(sceneNodes("munich"))).toContain("rain");
    expect(effectsOf(sceneNodes("glacier"))).toContain("snow");
    expect(effectsOf(sceneNodes("kyoto"))).toContain("rain");
    expect(effectsOf(sceneNodes("favela"))).toContain("snow");
    for (const v of ["lagos", "uyuni"] as const) {
      const fx = effectsOf(sceneNodes(v));
      expect(fx).not.toContain("rain");
      expect(fx).not.toContain("snow");
    }
  });

  it("FC47-S2: haze shafts with a light position on Munich and Glacier only", () => {
    for (const v of VENUE_ORDER) {
      const haze = sceneNodes(v).filter((n) => n.effect === "volumetric-fog" && n.name === "fc-flood-haze");
      expect({ v, n: haze.length }).toEqual({ v, n: v === "munich" || v === "glacier" ? 1 : 0 });
    }
  });

  it("FC47-P1: vignette everywhere, grain on Favela only, chromatic aberration on Kyoto only", () => {
    for (const v of VENUE_ORDER) {
      const names = sceneNodes(v).map((n) => n.name);
      expect(names).toContain("fc-vignette");
      expect(names.includes("fc-grain")).toBe(v === "favela");
      expect(names.includes("fc-ca")).toBe(v === "kyoto");
    }
  });
});

describe("aura-fc-3d GU47 reduced motion (PRD 6.3)", () => {
  it("halves weather emission", () => {
    expect(weatherParticleCount("rain", true)).toBe(weatherParticleCount("rain") / 2);
    expect(weatherParticleCount("snow", true)).toBe(weatherParticleCount("snow") / 2);
    expect(weatherParticleCount("none", true)).toBe(0);
    const rain = sceneNodes("munich", true).find((n) => n.effect === "rain");
    expect(rain?.particleCount).toBe(weatherParticleCount("rain", true));
  });

  it("drops motion blur and chromatic aberration from the scene", () => {
    expect(effectsOf(sceneNodes("kyoto"))).toContain("motion-blur");
    const reduced = sceneNodes("kyoto", true);
    expect(effectsOf(reduced)).not.toContain("motion-blur");
    expect(reduced.map((n) => n.name)).not.toContain("fc-ca");
  });

  it("switches off the presets' DOF always, plus CA and motion blur under reduced motion", () => {
    const calls: [string, boolean][] = [];
    const app = { post: { setEffectEnabled: (name: string, on: boolean) => { calls.push([name, on]); } } };
    expect(applyPostAccessibility(app, false)).toEqual(["depthOfField"]);
    expect(applyPostAccessibility(app, true)).toEqual(["depthOfField", "chromaticAberration", "motionBlur"]);
    expect(calls.every(([, on]) => on === false)).toBe(true);
    expect(() => applyPostAccessibility({}, true)).not.toThrow();
  });

  it("halves VFX pack particle counts", () => {
    const full = fcVfxPack("munich")["fc-goal-pyro"]!.layers[0] as { count: number };
    const reduced = fcVfxPack("munich", { reducedMotion: true })["fc-goal-pyro"]!.layers[0] as { count: number };
    expect(reduced.count).toBe(Math.round(full.count / 2));
  });
});

describe("aura-fc-3d GU47 VFX pack (FC47-V1)", () => {
  it("registers the pack names from FC_VFX_KINDS; lightning on Munich only, splash on wet venues only", () => {
    for (const v of VENUE_ORDER) {
      const registered: string[] = [];
      const names = registerFcVfxPack({ registerPreset: (k) => { registered.push(k); } }, v);
      expect(registered).toEqual(names);
      for (const n of names) expect(FC_VFX_KINDS).toContain(n);
      expect(names.includes("fc-lightning")).toBe(v === "munich");
      expect(names.includes("fc-wet-splash")).toBe(v === "munich" || v === "kyoto");
      expect(names).toEqual(expect.arrayContaining(["fc-turf-divot", "fc-net-spark", "fc-goal-pyro"]));
    }
  });

  it("reduced flash drops the lightning and every light layer", () => {
    const pack = fcVfxPack("munich", { reducedFlash: true });
    expect(pack["fc-lightning"]).toBeUndefined();
    for (const spec of Object.values(pack)) expect(spec!.layers.some((l) => l.type === "light")).toBe(false);
    expect(fcVfxForEvent("goal", [29, 0.5, 0], "munich", { reducedFlash: true }).map((b) => b.kind)).not.toContain("fc-lightning");
  });

  it("a goal fires pyro on both corners behind the scored goal plus a net spark (and lightning on Munich)", () => {
    const fired: string[] = [];
    const bursts = fireFcVfx({ burst: (k) => { fired.push(k); } }, "goal", [29.5, 0.6, 1], "munich");
    expect(fired).toEqual(["fc-net-spark", "fc-goal-pyro", "fc-goal-pyro", "fc-lightning"]);
    const pyro = bursts.filter((b) => b.kind === "fc-goal-pyro");
    expect(pyro.every((b) => b.position[0] > 30)).toBe(true);
    expect(pyro[0].position[2]).toBe(-pyro[1].position[2]);
    expect(fcVfxForEvent("goal", [-29.5, 0.6, 1], "lagos").map((b) => b.kind)).toEqual(["fc-net-spark", "fc-goal-pyro", "fc-goal-pyro"]);
  });

  it("touches throw a splash on wet turf and a divot elsewhere", () => {
    expect(fcVfxForEvent("kick", [0, 0.2, 0], "kyoto").map((b) => b.kind)).toEqual(["fc-wet-splash", "fc-turf-divot"]);
    expect(fcVfxForEvent("kick", [0, 0.2, 0], "favela").map((b) => b.kind)).toEqual(["fc-turf-divot"]);
    expect(() => fireFcVfx(undefined, "tackle", [0, 0, 0], "uyuni")).not.toThrow();
  });
});

describe("aura-fc-3d GU47 materials (FC47-M1)", () => {
  type Mat = { texture?: { url?: string }; normal?: { url?: string }; roughnessMap?: unknown; roughness?: number; clearcoat?: number; opacity?: number; texTransforms?: { baseColor?: { scale?: readonly number[] } } };
  const byName = (venue: VenueId, name: string) => sceneNodes(venue).find((n) => n.name === name) as (Node & { material?: Mat }) | undefined;

  it("grass venues get the tiled acg-grass005 set with the wet roughness; stripes become a 30% tint", () => {
    for (const v of ["munich", "kyoto"] as const) {
      const m = byName(v, "fc-pitch")!.material!;
      expect(m.texture?.url).toMatch(/fcTurfColor\.[0-9a-f]{8}\.jpg$/);
      expect(m.normal?.url).toMatch(/fcTurfNormal/);
      expect(m.roughnessMap).toBeTruthy();
      expect(m.roughness).toBe(0.35);
      expect(m.texTransforms?.baseColor?.scale).toEqual([24, 16]);
    }
    expect(byName("munich", "fc-stripes")!.material!.opacity).toBe(0.3);
  });

  it("Glacier ice is clearcoat; dirt, sand and salt stay untextured", () => {
    expect(byName("glacier", "fc-pitch")!.material!.clearcoat).toBe(1);
    for (const v of ["favela", "lagos", "uyuni"] as const) expect(byName(v, "fc-pitch")!.material!.texture).toBeUndefined();
  });

  it("Favela cage walls use the acg-concrete034 set", () => {
    expect((byName("favela", "cage-n")!.material!.texture?.url ?? "")).toMatch(/fcConcreteColor/);
  });
});

describe("aura-fc-3d GU47 draw budget (FC47-PF1)", () => {
  type Inst = Node & { instances?: unknown[] };
  const find = (venue: VenueId, name: string) => sceneNodes(venue).find((n) => n.name === name) as Inst | undefined;

  it("stands are one instanced batch holding only the venue's tiers; hoardings one batch of 4", () => {
    expect(find("munich", "fc-stands")?.instances?.length).toBe(14);
    expect(find("glacier", "fc-stands")?.instances?.length).toBe(14);
    expect(find("kyoto", "fc-stands")?.instances?.length).toBe(11);
    expect(find("lagos", "fc-stands")?.instances?.length).toBe(6);
    expect(find("favela", "fc-stands")).toBeUndefined();
    expect(find("munich", "fc-hoardings")?.instances?.length).toBe(4);
    for (const v of VENUE_ORDER) {
      const names = sceneNodes(v).map((n) => n.name ?? "");
      expect(names.filter((n) => /^stand-|^hoard-/.test(n))).toEqual([]);
    }
  });
});
