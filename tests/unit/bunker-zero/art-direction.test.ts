import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
// The light builders main.ts passes to the rig, by their module path: the engine barrel costs minutes to transform
// on a loaded machine and the suite only needs these.
import { lights } from "../../../packages/engine/src/agent-api/nodes/lights";
import { auditArtDirection, snapshotForAudit, type ArtDirectionSnapshot } from "@aura3d/game/art";
import direction from "../../../apps/showcase-bunker-zero/src/art/direction";
import {
  BZ_ENV_INTENSITY, BZ_FIXTURE_LIGHTS, BZ_FLOOR_PARAMS, BZ_HDRI, BZ_HDRI_URL, BZ_LOOK, BZ_PALETTE, BZ_POST, BZ_PRACTICALS,
  BZ_VARIANTS, FOG_LAMP_FRACTION, cellWorld, fixtureCells, floorDefOfSlot, fogFromLamp, hueDeg, hueDistance, lookOfSlot,
  parseFloorParam, scaleColor
} from "../../../apps/showcase-bunker-zero/src/art/look";
import {
  BZ_MOON, FIXTURE_POOL_SIZE, RIG_IDS, assignPool, beaconYaw, buildLightRig, fixtureHeight, fixtureLightId, flickerAt,
  gridLineOfSight, moonDirection, rankFixtures, visibleRigLights, type QualityTierName
} from "../../../apps/showcase-bunker-zero/src/art/lightRig";
import {
  BZ_PARTICLE_BUDGET, BZ_VFX_EVENTS, BZ_VFX_KINDS, atmosphereEmitters, atmosphereParticleCap, bunkerVfxPresets, presetParticleCount, registerBunkerVfx
} from "../../../apps/showcase-bunker-zero/src/art/vfx";
import { VIEWMODEL_ASSET } from "../../../apps/showcase-bunker-zero/src/weapons-view";
import { isSolid } from "../../../apps/showcase-bunker-zero/src/maps";
import { BUNKER_FLOORS } from "../../browser/game-luma-targets";
import { writeArtDirectionAudit } from "../../../tools/game-checks/lib/art-direction.mjs";

const APP = path.resolve("apps/showcase-bunker-zero");
const MAIN = readFileSync(path.join(APP, "src/main.ts"), "utf8");

/** Model keys of the app's asset subset (root + local catalogue modules type every entry). */
function modelKeys(): Set<string> {
  const src = ["src/aura-assets.root.ts", "src/aura-assets.local.ts"].map((f) => readFileSync(path.join(APP, f), "utf8")).join("\n");
  return new Set([...src.matchAll(/readonly "([A-Za-z0-9]+)": AuraAssetDefinition & \{ readonly type: "model"/g)].map((m) => m[1]!));
}

/** Every model asset main.ts mounts (`assets.<key>` reads plus the viewmodels). */
function mountedModelKeys(): string[] {
  const models = modelKeys();
  const used = new Set<string>(Object.values(VIEWMODEL_ASSET));
  for (const m of MAIN.matchAll(/assets\.([A-Za-z0-9]+)/g)) if (models.has(m[1]!)) used.add(m[1]!);
  return [...used].sort();
}

const toJSON = (b: { toJSON(): unknown }) => b.toJSON() as { kind: string; runtime?: { id?: string }; shadow?: unknown };
/** `game.runtimeNode` (GameSceneBridge.createRuntimeNodeSpec) is `{ mutable: true, ...options, id }`. */
const FACTORIES = { lights, runtimeNode: (id: string, options: { tags: string[] }) => ({ mutable: true, ...options, id }) };

/** The mounted scene of one floor as the audit sees it: the rig lights shown on that floor, the IBL node and the models. */
function floorSnapshot(slot: number, tier: QualityTierName): ArtDirectionSnapshot {
  const shown = new Set(visibleRigLights(slot, tier));
  const rig = buildLightRig(FACTORIES, lookOfSlot(slot)).map(toJSON).filter((n) => n.runtime?.id !== undefined && shown.has(n.runtime.id));
  // the node main.ts mounts with environments.hdri({ texture, intensity: 0.35, background: false })
  const env = { kind: "environment", environment: "hdri", name: "bunker ibl", texture: { type: "texture", format: "hdr", url: BZ_HDRI_URL }, intensity: BZ_ENV_INTENSITY, background: false };
  const models = mountedModelKeys().map((key) => ({ kind: "model", name: key, asset: { id: key } }));
  const fakeApp = { scene: { nodes: [env, ...rig, ...models] }, diagnostics: () => ({ drawCalls: 0 }) } as never;
  return snapshotForAudit(fakeApp, { assets: {} });
}

describe("Bunker Zero art direction (GU47 WP-21, PRD §3.2)", () => {
  it("is a valid contract: arena-shooter, one shadowed spot key, IBL fill, the hangar_interior IBL enclosed, a unique signature", () => {
    expect(direction.id).toBe("showcase-bunker-zero");
    expect(direction.genre).toBe("arena-shooter");
    expect(direction.lighting.key).toEqual({ type: "spot", colorTemperatureK: 2700, shadow: true });
    expect(direction.lighting.fill).toBe("ibl");
    expect(direction.lighting.practicals).toBe(BZ_PRACTICALS);
    expect(direction.lighting.environment).toEqual({ hdri: BZ_HDRI, background: "enclosed" });
    expect(direction.palette).toEqual({ primary: [BZ_PALETTE.concrete, BZ_PALETTE.olive, BZ_PALETTE.rust], accent: BZ_PALETTE.hazard, reservedObjective: BZ_PALETTE.objective });
    expect(direction.signatureEffect).toMatch(/^Gunfire lights the room/);
  });

  it("names every model main.ts mounts and every registered effect kind", () => {
    const contracted = new Set(direction.assets.map((a) => a.assetKey));
    for (const key of mountedModelKeys()) expect(contracted.has(key), key).toBe(true);
    const kinds = new Set(direction.vfx.map((v) => v.kind));
    for (const kind of BZ_VFX_KINDS) expect(kinds.has(kind), kind).toBe(true);
    for (const [event, kind] of Object.entries(BZ_VFX_EVENTS)) expect(direction.vfx.find((v) => v.event === event)?.kind, event).toBe(kind);
  });

  it("auditArtDirection passes on every floor at High and Low: one shadowed key, at most six practicals, no ambient", () => {
    for (const { slot } of BZ_LOOK) {
      for (const tier of ["high", "low"] as const) {
        const snapshot = floorSnapshot(slot, tier);
        expect(snapshot.hasAmbient, `${slot} ${tier}`).toBe(false);
        expect(snapshot.environment.kind, `${slot} ${tier}`).toBe("hdri");
        expect(snapshot.lights.filter((l) => l.shadow).length, `${slot} ${tier}`).toBe(1);
        expect(auditArtDirection(direction, snapshot), `${slot} ${tier}`).toEqual([]);
      }
    }
  });

  it("writes src/art/direction.audit.json for the art-direction and look-identity game-checks (floor 1, High)", () => {
    const snapshot = floorSnapshot(0, "high");
    const violations = auditArtDirection(direction, snapshot);
    const record = writeArtDirectionAudit(path.join(APP, "src/art/direction.ts"), { direction, snapshot, violations });
    expect(record.violations).toEqual([]);
    expect(record.signatureEffect).toBe(direction.signatureEffect);
  });
});

describe("Bunker Zero look table (BZ-01, BZ-02, BZ-05, BZ-08, BZ-20)", () => {
  it("has one row per capture variant, in the BUNKER_FLOORS order E-I's targets use", () => {
    expect(BZ_LOOK.map((r) => r.variant)).toEqual([...BZ_VARIANTS]);
    expect(BUNKER_FLOORS.map(([v, f]) => [v, f])).toEqual(BZ_LOOK.map((r) => [r.variant, r.floorParam]));
    expect(BZ_LOOK.map((r) => r.slot)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(BZ_FLOOR_PARAMS).toEqual(["1", "2", "3", "4", "5", "6", "kh"]);
  });

  it("gives each floor its own lamp colour: adjacent floors' lamp hues differ by >= 25 deg (BZ-02)", () => {
    const descent = BZ_LOOK.filter((r) => r.slot < 6);
    for (let i = 1; i < descent.length; i++) {
      const a = descent[i - 1]!, b = descent[i]!;
      expect(hueDistance(hueDeg(a.lamp.color), hueDeg(b.lamp.color)), `${a.variant} vs ${b.variant}`).toBeGreaterThanOrEqual(25);
    }
    expect(new Set(BZ_LOOK.map((r) => r.lamp.color)).size).toBe(BZ_LOOK.length);
  });

  it("sets the fog at 30% of the lamp value and the IBL per floor at 0.04-0.15 (BZ-02, BZ-05)", () => {
    expect(FOG_LAMP_FRACTION).toBe(0.3);
    for (const r of BZ_LOOK) {
      expect(r.fog.color, r.variant).toBe(fogFromLamp(r.lamp.color));
      expect(r.fog.color).toBe(scaleColor(r.lamp.color, 0.3));
      expect(r.fog.density).toBeGreaterThan(0);
      // GU47 phase 2: fill only (0.35 washed every floor evenly in the recap2 frames)
      expect(r.environmentIntensity).toBeGreaterThanOrEqual(0.04);
      expect(r.environmentIntensity).toBeLessThanOrEqual(0.15);
    }
    expect(BZ_ENV_INTENSITY).toBe(0.07);
    expect(BZ_HDRI_URL).toBe("/hdri/hangar_interior_1k.hdr");
    expect(scaleColor("#ffad5c", 0.3)).toBe("#4d341c");
  });

  it("carries the BZ-08 post numbers (GU47 phase 3 AO, contrast and vignette)", () => {
    expect(BZ_POST).toEqual({
      ao: { intensity: 0.9, radius: 1.2 }, bloom: { threshold: 0.82, intensity: 0.45 }, grade: { contrast: 1.2, saturation: 0.82 },
      vignette: 0.42, grain: 0.04, toneMapping: "aces"
    });
  });

  it("puts every spot and reference viewpoint over an open cell of its own floor", () => {
    for (const r of BZ_LOOK) {
      const def = floorDefOfSlot(r.slot);
      const open = (c: readonly [number, number]) => !isSolid(def.rows[c[1]]![c[0]]!);
      for (const c of [r.key.cell, r.key.target, r.fill.cell, r.fill.target, r.reference.cell]) expect(open(c), `${r.variant} ${c.join(",")}`).toBe(true);
    }
  });

  it("parses ?floor=1..6|kh (BZ-20) and ignores anything else", () => {
    expect(parseFloorParam("?floor=1")).toEqual({ slot: 0, mode: "descent", floorIdx: 0 });
    expect(parseFloorParam("?floor=6")).toEqual({ slot: 5, mode: "descent", floorIdx: 5 });
    expect(parseFloorParam("?floor=kh")).toEqual({ slot: 6, mode: "killhouse", floorIdx: 0 });
    expect(parseFloorParam("?floor=KH")).toEqual({ slot: 6, mode: "killhouse", floorIdx: 0 });
    for (const bad of ["", "?floor=0", "?floor=7", "?floor=x", "?demo=1"]) expect(parseFloorParam(bad), bad).toBeNull();
  });
});

describe("Bunker Zero light rig (BZ-01, BZ-02, BZ-07)", () => {
  it("shows one key per floor (the moon on F6), the fill spot or F5's tube, the carried lamp and the tier's fixture pool", () => {
    for (const { slot } of BZ_LOOK) {
      const shown = visibleRigLights(slot, "high");
      expect(shown.filter((id) => id === RIG_IDS.key || id === RIG_IDS.moon), String(slot)).toHaveLength(1);
      expect(shown.length - 1).toBe(BZ_PRACTICALS);
      expect(shown).toContain(RIG_IDS.player);
    }
    expect(visibleRigLights(5)).toContain(RIG_IDS.moon);
    expect(visibleRigLights(4)).toContain(RIG_IDS.tube);
    expect(visibleRigLights(4)).not.toContain(RIG_IDS.fill);
    expect(visibleRigLights(0, "low").filter((id) => id.startsWith("bz-fixture-light-"))).toHaveLength(BZ_FIXTURE_LIGHTS.low);
    expect(FIXTURE_POOL_SIZE).toBe(4);
  });

  it("builds the rig with no ambient, hemisphere or look preset; the key spot and the moon are the only shadow requests", () => {
    const nodes = buildLightRig(FACTORIES).map(toJSON) as { kind: string; light?: string; runtime?: { id?: string }; shadow?: unknown; intensity?: number }[];
    expect(nodes.every((n) => n.kind === "light")).toBe(true);
    expect(nodes.some((n) => n.light === "ambient" || n.light === "hemisphere")).toBe(false);
    expect(nodes.filter((n) => n.shadow).map((n) => n.runtime?.id).sort()).toEqual([RIG_IDS.key, RIG_IDS.moon].sort());
    expect(nodes.find((n) => n.runtime?.id === RIG_IDS.key)?.shadow).toMatchObject({ filter: "pcss", mapSize: 1024 });
    expect(nodes.find((n) => n.runtime?.id === RIG_IDS.player)?.intensity).toBe(1.2);
    expect(nodes.filter((n) => n.runtime?.id?.startsWith("bz-fixture-light-"))).toHaveLength(FIXTURE_POOL_SIZE);
    expect(fixtureLightId(2)).toBe("bz-fixture-light-2");
  });

  it("lights F3 from the grates and every other floor from under the ceiling", () => {
    expect(fixtureHeight(lookOfSlot(2))).toBe(0.35);
    for (const slot of [0, 1, 3, 4, 6]) expect(fixtureHeight(lookOfSlot(slot))).toBeCloseTo(3 - 0.45, 6);
    expect(fixtureHeight(lookOfSlot(5))).toBeCloseTo(5.4 - 0.45, 6);
  });

  it("aims the moon steeply down into the hatch (BZ-07)", () => {
    const d = moonDirection();
    expect(Math.hypot(...d)).toBeCloseTo(1, 6);
    expect((Math.asin(-d[1]) * 180) / Math.PI).toBeCloseTo(BZ_MOON.elevationDeg, 6);
  });

  it("ranks fixtures nearest first, prefers what the camera faces and sees, and keeps held fixtures in their slots", () => {
    // camera in cell (3,3) facing +x: ahead 6 m, behind 6 m, beside 9 m, ahead 18 m, and one 60 m away
    const cells = [[5, 3], [1, 3], [3, 6], [9, 3], [20, 14]] as const;
    const cam = { x: 10.5, z: 10.5, fx: 1, fz: 0 };
    expect(rankFixtures(cells, cam, 3)).toEqual([0, 1, 2]);
    // a wall in column 4 hides the two fixtures ahead: the visible ones win
    expect(rankFixtures(cells, cam, 3, (cx) => cx !== 4)).toEqual([1, 2, 0]);
    expect(rankFixtures(cells, cam, 9)).toEqual([0, 1, 2, 3]); // the 60 m fixture is beyond the pool's reach
    expect(assignPool([3, -1, 1, 0], [0, 1, 2])).toEqual([2, -1, 1, 0]);
    expect(assignPool([-1, -1], [4, 2])).toEqual([4, 2]);
    expect(gridLineOfSight(() => true, 0, 0, 30, 30)).toBe(true);
    expect(gridLineOfSight((cx) => cx !== 3, 1.5, 1.5, 19.5, 1.5)).toBe(false);
    const f1 = fixtureCells(floorDefOfSlot(0));
    expect(f1.length).toBe(26);
    expect(cellWorld(f1[0]!, 2)).toEqual([(f1[0]![0] + 0.5) * 3, 2, (f1[0]![1] + 0.5) * 3]);
  });

  it("flickers deterministically within its amount and holds steady under reduced motion", () => {
    for (let t = 0; t < 4; t += 0.05) {
      const v = flickerAt(t, 3, 0.35);
      expect(v).toBeGreaterThanOrEqual(0.65 - 1e-9);
      expect(v).toBeLessThanOrEqual(1);
      expect(flickerAt(t, 3, 0.35)).toBe(v);
      expect(flickerAt(t, 3, 0.35, true)).toBe(1);
    }
    expect(flickerAt(1.2, 0, 0)).toBe(1);
    expect(beaconYaw(2.5, true)).toBe(0);
    expect(beaconYaw(0.5)).toBeCloseTo(Math.PI * 0.6, 6);
  });
});

describe("Bunker Zero effect pack (BZ-03, BZ-09 concrete-chip)", () => {
  it("registers every preset; each carries a light layer where gunfire or a blast should light the room", () => {
    const registered: string[] = [];
    expect(registerBunkerVfx({ registerPreset: (kind) => registered.push(kind) })).toEqual(BZ_VFX_KINDS);
    expect(registered).toEqual([...BZ_VFX_KINDS]);
    expect(registerBunkerVfx(undefined)).toEqual([]);
    const presets = bunkerVfxPresets();
    for (const kind of BZ_VFX_KINDS) expect(presets[kind].name).toBe(kind);
    for (const kind of ["bz-muzzle", "bz-enemy-muzzle", "bz-impact", "bz-blast"] as const) {
      expect(presets[kind].layers.some((l) => l.type === "light"), kind).toBe(true);
    }
    expect(presets["concrete-chip"].layers.every((l) => l.type === "emitter")).toBe(true);
  });

  it("halves emissions and cuts camera shake to 30% under reduced motion; reduced flash caps the lights at a third", () => {
    const full = bunkerVfxPresets();
    const reduced = bunkerVfxPresets({ reducedMotion: true });
    const dim = bunkerVfxPresets({ reducedFlash: true });
    for (const kind of BZ_VFX_KINDS) {
      full[kind].layers.forEach((layer, i) => {
        if (layer.type === "emitter") expect(Number(reduced[kind].layers[i]!.count)).toBeLessThanOrEqual(Math.max(1, Math.ceil(Number(layer.count) / 2)));
        if (layer.type === "light") expect(Number(dim[kind].layers[i]!.intensity)).toBeCloseTo(Number(layer.intensity) / 3, 2);
        if (layer.type === "camera") expect(Number(reduced[kind].layers[i]!.shake)).toBeCloseTo(Number(layer.shake) * 0.3, 3);
      });
    }
  });

  it("keeps one burst of every preset well under the 600-particle budget", () => {
    const presets = bunkerVfxPresets();
    const total = BZ_VFX_KINDS.reduce((sum, kind) => sum + presetParticleCount(presets[kind]), 0);
    expect(total).toBeLessThanOrEqual(BZ_PARTICLE_BUDGET / 3);
  });
});

describe("Bunker Zero atmosphere (BZ-09)", () => {
  it("spawns 2-3 emitters per floor on Medium and up, one on Low, all inside the 600-particle budget with a burst of every preset", () => {
    const burst = BZ_VFX_KINDS.reduce((sum, kind) => sum + presetParticleCount(bunkerVfxPresets()[kind]), 0);
    for (const look of BZ_LOOK) {
      const high = atmosphereEmitters(look, 3);
      expect(high.length, look.variant).toBeGreaterThanOrEqual(2);
      expect(high.length, look.variant).toBeLessThanOrEqual(3);
      expect(atmosphereParticleCap(high) + burst, look.variant).toBeLessThanOrEqual(BZ_PARTICLE_BUDGET);
      expect(atmosphereEmitters(look, 3, { tier: "low" })).toHaveLength(1);
      expect(high.every((e) => e.spec.layers.every((l) => l.type === "emitter" && l.loop === true))).toBe(true);
    }
    expect(atmosphereEmitters(lookOfSlot(2), 3).some((e) => e.spec.name === "bz-atmo-embers")).toBe(true);
    expect(atmosphereEmitters(lookOfSlot(1), 3).some((e) => e.spec.name === "bz-atmo-drips")).toBe(true);
    expect(atmosphereEmitters(lookOfSlot(4), 3).some((e) => e.spec.name === "bz-atmo-sparks")).toBe(true);
  });

  it("halves every atmosphere cap under reduced motion (PRD §6.3)", () => {
    for (const look of BZ_LOOK) {
      const full = atmosphereParticleCap(atmosphereEmitters(look, 3));
      const reduced = atmosphereParticleCap(atmosphereEmitters(look, 3, { reducedMotion: true }));
      expect(reduced, look.variant).toBeLessThanOrEqual(Math.ceil(full / 2) + 3);
    }
  });
});
