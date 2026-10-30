// GU47 WP-16 (G06): the diorama scene per world (PBL-L1, L2, E1, E2, E3, P1, P2, P3, M1, M2, W1, PF1) and
// the PRD D8 guarantee that the collision world is identical in the diorama and the original look.
import { describe, expect, it } from "vitest";
import { buildWorld, nodeName } from "../../../apps/showcase-pips-big-leap/src/game/world";
import { dioramaName, floraLayers, hazardMaterial, SURFACES } from "../../../apps/showcase-pips-big-leap/src/game/diorama";
import { WORLD_IDS, WORLD_LOOKS, baseDepthFor } from "../../../apps/showcase-pips-big-leap/src/game/looks";
import { worldSpec } from "../../../apps/showcase-pips-big-leap/src/game/worlds";

type Node = {
  readonly kind: string;
  readonly name?: string;
  readonly light?: string;
  readonly effect?: string;
  readonly shadow?: unknown;
  readonly primitive?: string;
  readonly castShadow?: boolean;
  readonly instances?: readonly unknown[];
  readonly material?: { readonly emissiveIntensity?: number; readonly practical?: boolean; readonly color?: string };
  readonly children?: readonly Node[];
  readonly runtime?: { readonly id?: string };
  readonly spec?: { readonly model?: string; readonly stars?: unknown };
  readonly captureEnvironment?: boolean;
  readonly rate?: number;
  readonly maxParticles?: number;
  readonly attachTo?: unknown;
  readonly focusDistance?: number;
  readonly fStop?: number;
  readonly godRayDensity?: number;
};

const flat = (nodes: readonly Node[]): Node[] => nodes.flatMap((n) => [n, ...(n.kind === "group" ? flat(n.children ?? []) : [])]);
const sceneOf = (id: (typeof WORLD_IDS)[number], options?: Parameters<typeof buildWorld>[1]) =>
  flat((buildWorld(worldSpec(id), options).scene.toJSON() as unknown as { nodes: Node[] }).nodes);

describe("pips-big-leap diorama scene", () => {
  it("keeps the collision world byte-identical between the diorama and the original look (PRD D8)", () => {
    for (const id of WORLD_IDS) {
      const spec = worldSpec(id);
      const a = buildWorld(spec);
      const b = buildWorld(spec, { look: "original" });
      const strip = (w: typeof a) => JSON.stringify({ solids: w.solids, hazards: w.hazards, waters: w.waters, obstacles: w.cameraObstacles, spin: w.spinNodes, moving: w.movingSolids.map((s) => s.id), timed: w.timedSolids.map((s) => s.id), boss: w.bossArenaZ });
      expect(strip(a), id).toBe(strip(b));
    }
  });

  it("keeps every runtime node main.ts drives (movers, pickups, gate, hero, boss)", () => {
    for (const id of WORLD_IDS) {
      const spec = worldSpec(id);
      const ids = new Set(sceneOf(id).map((n) => n.runtime?.id).filter((v): v is string => typeof v === "string"));
      for (const p of spec.platforms.filter((p) => p.mover || p.timed)) {
        expect(ids.has(nodeName.platform(p.id)), `${id} ${p.id}`).toBe(true);
        expect(ids.has(nodeName.platformTop(p.id)), `${id} ${p.id} top`).toBe(true);
      }
      for (const s of spec.seeds) expect(ids.has(nodeName.seed(s.id))).toBe(true);
      for (const name of [nodeName.gate, nodeName.gateRing, nodeName.gateLock, nodeName.hero, nodeName.heroCape]) expect(ids.has(name), `${id} ${name}`).toBe(true);
      if (spec.boss) expect(ids.has(nodeName.boss)).toBe(true);
    }
  });

  it("lights each world with one shadowed key, a rim, a hemisphere and at most 6 practicals (PBL-L1, PBL-L2)", () => {
    for (const id of WORLD_IDS) {
      const lights = sceneOf(id).filter((n) => n.kind === "light");
      expect(lights.filter((l) => l.shadow === true || (typeof l.shadow === "object" && l.shadow !== null)), id).toHaveLength(1);
      expect(lights.some((l) => l.name === "look rim light")).toBe(true);
      expect(lights.filter((l) => l.light === "hemisphere")).toHaveLength(1);
      expect(lights.filter((l) => l.light === "ambient")).toHaveLength(0);
      const practicals = lights.filter((l) => l.light === "point" || l.light === "spot");
      expect(practicals.length).toBe(WORLD_LOOKS[id].practicals.length);
      expect(practicals.length).toBeLessThanOrEqual(6);
      for (const p of practicals) expect(p.runtime?.id).toBe(p.name);
    }
    expect(sceneOf("w2").some((n) => n.kind === "lensflare")).toBe(true);
  });

  it("builds the diorama base 3-6 m down with height fog pooled at its top (PBL-E1)", () => {
    for (const id of WORLD_IDS) {
      const built = buildWorld(worldSpec(id));
      expect(built.presentation.baseTop).toBe(-baseDepthFor(worldSpec(id)));
      const nodes = sceneOf(id);
      for (const name of [dioramaName.baseFelt, dioramaName.baseClay, dioramaName.baseSkirt, dioramaName.baseMounds]) {
        const node = nodes.find((n) => n.name === name);
        expect(node, `${id} ${name}`).toBeDefined();
        expect(node?.castShadow).toBe(false);
      }
      const fog = nodes.filter((n) => n.kind === "effect" && n.effect === "fog");
      expect(fog.map((n) => n.name)).toEqual(["look fog"]);
    }
  });

  it("adds a real sky only in w2 (Preetham), w3 (gradient) and w6 (gradient + stars), never capturing the environment (PBL-E2)", () => {
    const skyOf = (id: (typeof WORLD_IDS)[number]) => sceneOf(id).find((n) => n.kind === "sky");
    expect(skyOf("w2")?.spec?.model).toBe("preetham");
    expect(skyOf("w3")?.spec?.model).toBe("gradient");
    expect(skyOf("w6")?.spec?.stars).toBeDefined();
    for (const id of ["w2", "w3", "w6"] as const) expect(skyOf(id)?.captureEnvironment).toBe(false);
    for (const id of ["academy", "w1", "w4", "w5"] as const) expect(skyOf(id)).toBeUndefined();
  });

  it("mounts exactly one seeded ambient emitter per world that follows Pip, within 600 particles (PBL-E3)", () => {
    for (const id of WORLD_IDS) {
      const emitters = sceneOf(id).filter((n) => n.kind === "effect" && n.effect === "particles");
      expect(emitters, id).toHaveLength(1);
      expect(emitters[0]!.name).toBe(dioramaName.ambient);
      expect(emitters[0]!.attachTo).toBe(nodeName.hero);
      expect(emitters[0]!.maxParticles).toBeLessThanOrEqual(600);
    }
  });

  it("halves the ambient emission under reduced motion (PRD 6.3)", () => {
    const rate = (reducedMotion: boolean) => sceneOf("w1", { reducedMotion }).find((n) => n.name === dioramaName.ambient)?.rate ?? 0;
    expect(rate(true)).toBeCloseTo(rate(false) / 2, 5);
  });

  it("drops the authored extra bloom and adds the vignette and the f/2 miniature DOF (PBL-P1, PBL-P2)", () => {
    for (const id of WORLD_IDS) {
      const effects = sceneOf(id).filter((n) => n.kind === "effect");
      expect(effects.filter((n) => n.effect === "bloom"), id).toHaveLength(1);
      expect(effects.some((n) => n.name === dioramaName.vignette)).toBe(true);
      const dof = effects.find((n) => n.effect === "depth-of-field");
      expect(dof?.fStop).toBe(2);
      expect(dof?.focusDistance).toBeCloseTo(4.63, 1);
    }
  });

  it("adds sun shafts before the look group in w1, w2 and w5 only (PBL-P3)", () => {
    for (const id of WORLD_IDS) {
      const top = (buildWorld(worldSpec(id)).scene.toJSON() as unknown as { nodes: Node[] }).nodes;
      const shaftsAt = top.findIndex((n) => n.name === dioramaName.shafts);
      const lookAt = top.findIndex((n) => (n.name ?? "").startsWith("aura-look:"));
      if (WORLD_LOOKS[id].shafts) {
        expect(shaftsAt, id).toBeGreaterThanOrEqual(0);
        expect(shaftsAt).toBeLessThan(lookAt);
      } else {
        expect(shaftsAt, id).toBe(-1);
      }
    }
  });

  it("draws static platforms through instanced rounded slabs and keeps the clearcoat toadstool caps (PBL-M1, PBL-PF1)", () => {
    for (const id of WORLD_IDS) {
      const nodes = sceneOf(id);
      const statics = worldSpec(id).platforms.filter((p) => !p.mover && !p.timed);
      const instanced = nodes.filter((n) => (n.name ?? "").startsWith("plats:") || (n.name ?? "").startsWith("plat-tops:"));
      expect(instanced.every((n) => n.primitive === "roundedBox")).toBe(true);
      const kinds = new Set(statics.map((p) => p.kind ?? "grass"));
      expect(instanced.length, id).toBe(kinds.size * 2);
      expect(buildWorld(worldSpec(id)).presentation.instancedPlatforms).toBe(statics.length);
    }
    expect(SURFACES.mushroom.top.clearcoat).toBeGreaterThan(0);
    expect(SURFACES.mushroom.body.color).toBe("#b8a58a");
  });

  it("has no emissive fill: thorns are a matte plum bramble, lava and the gate ring are practicals (PBL-M2 interim)", () => {
    expect(hazardMaterial("thorns").emissiveIntensity ?? 0).toBeLessThanOrEqual(0.1);
    expect(hazardMaterial("lava").practical).toBe(true);
    for (const id of WORLD_IDS) {
      const glowing = sceneOf(id).filter((n) => (n.kind === "primitive" || n.kind === "model") && (n.material?.emissiveIntensity ?? 0) > 0.1 && n.material?.practical !== true);
      expect(glowing.map((n) => n.name), id).toEqual([]);
    }
  });

  it("scatters 150-400 seeded flora tufts per world in five instanced draws that cast no shadows (PBL-W1)", () => {
    for (const id of WORLD_IDS) {
      const spec = worldSpec(id);
      const layers = floraLayers(spec, WORLD_LOOKS[id], 9100 + spec.order * 31);
      const count = layers.reduce((sum, l) => sum + l.transforms.length, 0);
      expect(count, id).toBeGreaterThanOrEqual(150);
      expect(count, id).toBeLessThanOrEqual(400);
      expect(JSON.stringify(floraLayers(spec, WORLD_LOOKS[id], 9100 + spec.order * 31))).toBe(JSON.stringify(layers));
      const flora = sceneOf(id).filter((n) => (n.name ?? "").startsWith("pbl-flora-"));
      expect(flora.length).toBeLessThanOrEqual(5);
      expect(flora.every((n) => n.castShadow === false)).toBe(true);
    }
  });

  it("keeps ?look=original exactly today's scene shape (looks.preset with fog 0, own fog, no diorama nodes)", () => {
    const nodes = sceneOf("w1", { look: "original" });
    expect(nodes.some((n) => (n.name ?? "").startsWith("pbl-"))).toBe(false);
    expect(nodes.filter((n) => n.kind === "effect" && n.effect === "fog").length).toBe(1);
    expect(nodes.some((n) => n.name === nodeName.platform("w1-p1") || (n.name ?? "").startsWith("plat:"))).toBe(true);
  });
});
