import { describe, expect, it } from "vitest";
import { auditArtDirection, type ArtDirectionSnapshot } from "@aura3d/game/art";
import direction from "../../../examples/kid-goku-beyond-the-clouds-port/art/direction";
import { ACTIVE_LOOK, CUMULUS_LOOK, CUMULUS_PALETTE, lookIdFrom, lookRow } from "../../../examples/kid-goku-beyond-the-clouds-port/art/look";
import { CUMULUS_VFX_EVENTS, CUMULUS_VFX_KINDS, CUMULUS_VFX_LIVE_CAP, cumulusVfxFor, cumulusVfxPresets, registerCumulusVfx } from "../../../examples/kid-goku-beyond-the-clouds-port/art/vfx";
import {
  CUMULUS_MATERIALS,
  HERO_PART_IDS,
  INSTANCED_MATERIALS,
  applySkyKidHeroPose,
  buildCarvedBoulderNode,
  buildGoldenSkyCloudNode,
  buildHoneyRoastPickupNode,
  buildInstancedBonsaiPines,
  buildInstancedCanopyTrees,
  buildInstancedKarstMesas,
  buildInstancedShoulderRocks,
  buildInstancedStormTowers,
  buildSanctuaryToriiNode,
  buildSkyCoinNode,
  buildSkyHermitCottageNode,
  buildSkyKidHeroNode,
  buildSkyPterosaurNode,
  buildSkyStaffNode,
  buildStarSphereNode,
  buildStormTyrantNode,
  computeHeroRestWorldBounds,
  computeSkyKidHeroPose
} from "../../../examples/kid-goku-beyond-the-clouds-port/art/proceduralModels";
import { writeArtDirectionAudit } from "../../../tools/game-checks/lib/art-direction.mjs";

/**
 * GU47 WP-35 look contract. The snapshot mirrors what world.ts mounts for the storm-washed row: the look's one shadowed key
 * and its unshadowed cool rim (no hemisphere, no ambient), the spruit_sunrise IBL behind the custom dome (background off),
 * and zero external GLB models (100% procedural multi-material assemblies). The sky pearls and orbs are the only
 * emissive-looking materials and both are light sources by design.
 */
function mountedSceneMirror(): ArtDirectionSnapshot {
  const row = CUMULUS_LOOK[0];
  return {
    lights: [
      { type: "directional", shadow: true, intensity: row.sun.intensity },
      ...(row.rim ? [{ type: "directional", shadow: false, intensity: row.rim.intensity }] : [])
    ],
    hasAmbient: row.hemisphere !== null,
    environment: { kind: "hdri", background: false },
    models: [],
    materials: [
      { node: "ball", emissiveIntensity: 1.6, lightSource: true },
      { node: "orbs", emissiveIntensity: 1.2, lightSource: true }
    ],
    drawCalls: 0
  };
}

describe("Cumulus Dash art direction (GU47 WP-35)", () => {
  it("passes the C-35 audit against the mounted-scene mirror and writes the audit record", () => {
    const snapshot = mountedSceneMirror();
    const violations = auditArtDirection(direction, snapshot);
    writeArtDirectionAudit("examples/kid-goku-beyond-the-clouds-port/art/direction.ts", { direction, snapshot, violations });
    expect(violations).toEqual([]);
  });

  it("names the identity palette, the IBL and the signature effect", () => {
    expect(direction.palette.primary).toEqual(["#2f6fb8", "#b5643c", "#6f8f4a"]);
    expect(direction.palette.accent).toBe("#ffb347");
    expect(direction.lighting.environment.hdri).toBe("spruit_sunrise");
    expect(direction.lighting.environment.background).toBe("sky");
    expect(direction.signatureEffect).toMatch(/rainbow over silver-lined storm towers/i);
  });

  it("has one look row per variant, the storm row with the WP's numbers", () => {
    expect(CUMULUS_LOOK.map((row) => row.id)).toEqual(["storm-washed", "original"]);
    const storm = CUMULUS_LOOK[0];
    expect(storm.sun.elevationDeg).toBe(28);
    expect(storm.sun.color).toBe("#ffe2b8");
    expect(storm.sun.cascades).toBe(4);
    expect(storm.sun.maxDistance).toBe(160);
    expect(storm.sun.filter).toBe("pcss");
    expect(storm.environmentIntensity).toBe(0.8);
    expect(storm.hemisphere).toBeNull();
    expect(storm.rim).toMatchObject({ color: "#9fc8ff", intensity: 0.8 });
    expect(storm.fog.color).toBe("#9fb8cf");
    expect(storm.fog.mode).toBe("linear");
    expect(storm.fog.near).toBeGreaterThanOrEqual(150);
    expect(storm.fog.far).toBeGreaterThanOrEqual(520);
    expect(storm.fog.maxOpacity).toBeLessThanOrEqual(0.28);
    expect(storm.fog.density).toBeLessThanOrEqual(0.0006);
    expect(storm.grade.temperature).toBe(0.08);
    expect(storm.vignette.intensity).toBe(0.2);
    expect(storm.signature.rainbowDeg).toEqual([40, 42]);
    expect(CUMULUS_PALETTE.amber).toBe("#ffb347");
  });

  it("keeps ?look=original as today's look and boots storm-washed by default", () => {
    expect(lookIdFrom("?look=original")).toBe("original");
    expect(lookIdFrom("?autostart=1&look=original&x=1")).toBe("original");
    expect(lookIdFrom("?look=originals")).toBe("storm-washed");
    expect(lookIdFrom("")).toBe("storm-washed");
    expect(lookIdFrom(undefined)).toBe("storm-washed");
    expect(ACTIVE_LOOK.id).toBe("storm-washed");
    const original = lookRow("original");
    expect(original.authoredSunPos).toEqual([48, 78, 38]);
    expect(original.fog.lookScale).toBe(0);
    expect(original.sky.rainbow).toBe(0);
    expect(original.grade).toEqual({ exposure: 1.02, contrast: 1.07, saturation: 1.16 });
  });

  it("registers all seven presets; reduced motion halves every emission; a dense moment stays under the cap", () => {
    const registered: string[] = [];
    const kinds = registerCumulusVfx({ registerPreset: (kind) => registered.push(kind) });
    expect(kinds).toEqual(CUMULUS_VFX_KINDS);
    expect(registered).toEqual(["pearl-spark", "cloud-puff", "puddle-splash", "storm-mist", "speed-lines", "landing-dust", "falls-spray"]);
    const full = cumulusVfxPresets(false), reduced = cumulusVfxPresets(true);
    let total = 0;
    for (const kind of CUMULUS_VFX_KINDS) {
      expect(full[kind].name).toBe(kind);
      full[kind].layers.forEach((layer, i) => {
        if (layer.type !== "emitter") return;
        const count = Number(layer.count);
        total += count;
        expect(Number(reduced[kind].layers[i]!.count)).toBeLessThanOrEqual(Math.max(1, Math.ceil(count / 2)));
        // colours come from the identity palette, not the engine defaults
        expect(typeof layer.color).toBe("string");
      });
    }
    expect(total).toBeLessThanOrEqual(CUMULUS_VFX_LIVE_CAP);
    for (const kind of Object.values(CUMULUS_VFX_EVENTS).flat()) expect(CUMULUS_VFX_KINDS).toContain(kind);
    expect(registerCumulusVfx(undefined)).toEqual([]);
  });

  it("CD-15: a landing fires the puddle splash on the wet stretch and the landing dust off it; launches throw speed lines", () => {
    expect(cumulusVfxFor("land", true)).toEqual(["puddle-splash"]);
    expect(cumulusVfxFor("land", false)).toEqual(["landing-dust"]);
    expect(cumulusVfxFor("launch", false)).toEqual(["storm-mist", "speed-lines"]);
    expect(cumulusVfxFor("glider-mount", true)).toContain("speed-lines");
    expect(cumulusVfxFor("not-an-event", false)).toEqual([]);
    const presets = cumulusVfxPresets(false);
    for (const kind of ["speed-lines", "landing-dust"] as const) {
      expect(presets[kind].layers.some((l) => l.type === "camera" || l.type === "light")).toBe(false); // no shake, no flash
    }
  });

  it("WP-29: zero external GLBs, sculpted Sky Kid Cloud-Surfer Hero grounded at minY=0, and all procedural node IDs intact", () => {
    expect(direction.assets).toEqual([]);
    expect(direction.standIns).toEqual([]);

    const heroJson = buildSkyKidHeroNode(CUMULUS_LOOK[0].heroRim).toJSON() as unknown as {
      kind?: string;
      name: string;
      runtime?: { id?: string };
      children?: readonly Record<string, unknown>[];
      [k: string]: unknown;
    };
    expect(heroJson.kind).toBe("group");
    expect(heroJson.name).toBe("hero");
    expect(heroJson.runtime?.id).toBe("hero");
    expect(Array.isArray(heroJson.children) && heroJson.children.length).toBe(1);

    const seenIds = new Set<string>();
    const collectIds = (n: unknown): void => {
      if (!n || typeof n !== "object") return;
      const rec = n as { runtime?: { id?: string }; children?: readonly unknown[] };
      if (rec.runtime?.id) seenIds.add(rec.runtime.id);
      for (const c of rec.children ?? []) collectIds(c);
    };
    collectIds(heroJson);
    for (const partId of Object.values(HERO_PART_IDS)) {
      expect(seenIds.has(partId)).toBe(true);
    }

    const heroBounds = computeHeroRestWorldBounds();
    expect(Math.abs(heroBounds.min[1])).toBeLessThanOrEqual(1e-4);
    expect(heroBounds.max[1]).toBeGreaterThanOrEqual(1.45);
    expect(heroBounds.max[1]).toBeLessThanOrEqual(1.6);

    for (const clip of ["idle", "run", "sit", "jump", "block", "attack", "hit", "cheer", "dead"] as const) {
      const pose = computeSkyKidHeroPose({
        clip,
        clock: 10000.37,
        animT: 0.45,
        gaitPhase: 128.25,
        groundSpeed: clip === "run" ? 14.5 : 0,
        lean: 0.14,
        boostTimer: clip === "run" ? 0.5 : 0,
        jumpVelocity: clip === "jump" ? 6.5 : 0,
        laneVelocity: 1.8,
        onPole: clip === "block"
      });
      expect(pose.showBackPole).toBe(clip !== "block");
      const applied = new Map<string, { pos?: [number, number, number]; rot?: [number, number, number]; vis?: boolean }>();
      applySkyKidHeroPose(
        (id) => ({
          setPosition: (x, y, z) => { applied.set(id, { ...applied.get(id), pos: [x, y, z] }); },
          setRotation: (x, y, z) => { applied.set(id, { ...applied.get(id), rot: [x, y, z] }); },
          setVisible: (v) => { applied.set(id, { ...applied.get(id), vis: v }); }
        }),
        pose
      );
      for (const entry of applied.values()) {
        for (const v of [...(entry.pos ?? []), ...(entry.rot ?? [])]) {
          expect(Number.isFinite(v)).toBe(true);
          expect(Math.abs(v)).toBeLessThan(Math.PI * 2);
        }
      }
    }

    const cloudJson = buildGoldenSkyCloudNode().toJSON() as unknown as Record<string, unknown>;
    expect(cloudJson.name).toBe("sky-cloud");
    expect((cloudJson.runtime as { id?: string } | undefined)?.id).toBe("sky-cloud");

    const boulderJson = buildCarvedBoulderNode(0).toJSON() as unknown as {
      name: string;
      runtime?: { id?: string };
      children?: readonly { customGeometry?: { bounds?: { min: number[]; max: number[] } } }[];
      customGeometry?: { bounds?: { min: number[]; max: number[] } };
    };
    expect(boulderJson.name).toBe("boulder-0");
    expect(boulderJson.runtime?.id).toBe("boulder-0");
    const bBounds = boulderJson.customGeometry?.bounds ?? boulderJson.children?.[0]?.customGeometry?.bounds;
    if (bBounds) {
      expect(bBounds.min[1]).toBeGreaterThanOrEqual(-0.02);
      expect(bBounds.min[1]).toBeLessThanOrEqual(0.08);
      expect(bBounds.max[1]).toBeGreaterThan(1.88);
      expect(bBounds.max[1]).toBeLessThanOrEqual(2.05);
    }

    const hutJson = buildSkyHermitCottageNode([0, 0, 0], 0).toJSON() as unknown as {
      name: string;
      castShadow?: boolean;
      children?: readonly { customGeometry?: { bounds?: { min: number[]; max: number[] } } }[];
      customGeometry?: { bounds?: { min: number[]; max: number[] } };
    };
    expect(hutJson.name).toBe("home-hut");
    const hBounds = hutJson.customGeometry?.bounds ?? hutJson.children?.[0]?.customGeometry?.bounds;
    if (hBounds) {
      expect(Math.max(Math.abs(hBounds.min[0]), Math.abs(hBounds.max[0]), Math.abs(hBounds.min[2]), Math.abs(hBounds.max[2]))).toBeLessThan(3.9);
      expect(hBounds.max[1]).toBeLessThan(6.4);
    }

    expect(buildSkyStaffNode().toJSON().name).toBe("staff");
    expect(buildSkyPterosaurNode(0).toJSON().name).toBe("ptera-body-0");
    expect(buildStormTyrantNode().toJSON().name).toBe("rex-body");
    expect(buildStarSphereNode(4).toJSON().name).toBe("ball-4");
    expect(buildHoneyRoastPickupNode(0).toJSON().name).toBe("meat-0");
    expect(buildSkyCoinNode(0).toJSON().name).toBe("sky-coin-0");
    expect(buildSanctuaryToriiNode("sanctuary-torii-0", [0, 0, 0], 0).toJSON().name).toBe("sanctuary-torii-0");

    const sampleTransforms = [{ position: [0, 0, 0] as const, scale: 1 }];
    expect(buildInstancedCanopyTrees(sampleTransforms).length).toBeGreaterThanOrEqual(2);
    expect(buildInstancedBonsaiPines(sampleTransforms).length).toBeGreaterThanOrEqual(2);
    expect(buildInstancedShoulderRocks(sampleTransforms).length).toBeGreaterThanOrEqual(2);
    expect(buildInstancedKarstMesas(sampleTransforms).length).toBeGreaterThanOrEqual(2);
    expect(buildInstancedStormTowers("storm-towers", sampleTransforms).length).toBeGreaterThanOrEqual(2);

    for (const mat of Object.values(INSTANCED_MATERIALS)) {
      const m = mat as unknown as { clearcoat?: number; sheen?: number };
      expect(m.clearcoat ?? 0).toBe(0);
      expect(m.sheen ?? 0).toBe(0);
    }
  });

  it("sculpts an organic, non-boxy hero & companion cast with rich sheenColor materials and luminous vertexColors", () => {
    const heroBounds = computeHeroRestWorldBounds();
    // Grounded plantar sole contact at y=0, ~1.53m stature, and compact <=0.64m lateral span (including diagonal Sky Staff)
    expect(Math.abs(heroBounds.min[1])).toBeLessThanOrEqual(1e-4);
    expect(heroBounds.max[1]).toBeGreaterThanOrEqual(1.48);
    expect(heroBounds.max[1]).toBeLessThanOrEqual(1.58);
    const heroSpanX = heroBounds.max[0] - heroBounds.min[0];
    expect(heroSpanX).toBeGreaterThanOrEqual(0.45);
    expect(heroSpanX).toBeLessThanOrEqual(0.64);

    type CustomPrim = {
      kind?: string;
      name?: string;
      ignoredOptions?: readonly unknown[];
      material?: Record<string, unknown>;
      geometry?: {
        positions?: ArrayLike<number>;
        normals?: ArrayLike<number>;
        colors?: ArrayLike<number>;
        indices?: ArrayLike<number>;
      };
      children?: readonly CustomPrim[];
    };
    const collectPrims = (node: CustomPrim, out: CustomPrim[] = []): CustomPrim[] => {
      if (node.kind === "primitive" && node.geometry) out.push(node);
      for (const c of node.children ?? []) collectPrims(c, out);
      return out;
    };

    const heroJson = buildSkyKidHeroNode(CUMULUS_LOOK[0].heroRim).toJSON() as unknown as CustomPrim;
    const heroPrims = collectPrims(heroJson);
    expect(heroPrims.length).toBeGreaterThanOrEqual(25);

    let totalTris = 0;
    let sheenTunicSeen = false;
    let sheenIndigoSeen = false;
    let sheenHairSeen = false;
    let coloredSlotCount = 0;

    for (const prim of heroPrims) {
      expect(prim.ignoredOptions).toBeUndefined();
      const g = prim.geometry!;
      const pos = g.positions!;
      const nrm = g.normals!;
      const idx = g.indices!;
      expect(pos.length).toBeGreaterThan(0);
      expect(nrm.length).toBe(pos.length);
      expect(idx.length).toBeGreaterThanOrEqual(3);
      totalTris += idx.length / 3;

      for (let i = 0; i < nrm.length; i += 3) {
        const len = Math.hypot(nrm[i]!, nrm[i + 1]!, nrm[i + 2]!);
        expect(Math.abs(len - 1)).toBeLessThan(2e-3);
      }

      if (g.colors && g.colors.length > 0) {
        coloredSlotCount += 1;
        for (let i = 0; i < g.colors.length; i += 4) {
          // Luminous tonal modulation only: never baked dark (<0.75) at limb bottoms
          expect(g.colors[i]!).toBeGreaterThanOrEqual(0.75);
          expect(g.colors[i]!).toBeLessThanOrEqual(1.001);
          expect(g.colors[i + 1]!).toBeGreaterThanOrEqual(0.75);
          expect(g.colors[i + 1]!).toBeLessThanOrEqual(1.001);
          expect(g.colors[i + 2]!).toBeGreaterThanOrEqual(0.75);
          expect(g.colors[i + 2]!).toBeLessThanOrEqual(1.001);
        }
      }

      const mat = prim.material ?? {};
      if ((mat.color === "#1ea388" || mat.color === "#f06228") && typeof mat.sheenColor === "string" && (mat.sheen as number) >= 0.85) {
        sheenTunicSeen = true;
      }
      if (mat.color === "#25438c" && typeof mat.sheenColor === "string" && (mat.sheen as number) >= 0.85) {
        sheenIndigoSeen = true;
      }
      if (mat.color === "#22293d" && typeof mat.sheenColor === "string" && (mat.sheen as number) >= 0.8) {
        sheenHairSeen = true;
      }
    }

    expect(totalTris).toBeGreaterThanOrEqual(12000);
    expect(coloredSlotCount).toBeGreaterThanOrEqual(10);
    expect(sheenTunicSeen).toBe(true);
    expect(sheenIndigoSeen).toBe(true);
    expect(sheenHairSeen).toBe(true);

    // Clean stylized satin/cloth gradients (roughness 0.50..0.68, clearcoat 0, envMapIntensity <= 0.12 — zero outdoor HDRI twig reflections)
    expect((CUMULUS_MATERIALS.heroSaffronTunic as unknown as { roughness?: number }).roughness).toBe(0.62);
    expect((CUMULUS_MATERIALS.heroIndigoCloth as unknown as { roughness?: number }).roughness).toBe(0.62);
    expect((CUMULUS_MATERIALS.heroBootCreamCuff as unknown as { roughness?: number }).roughness).toBe(0.6);
    const hairMat = CUMULUS_MATERIALS.heroObsidianHair as unknown as { color?: string; sheenColor?: string; clearcoat?: number; roughness?: number; envMapIntensity?: number };
    expect(hairMat.color).toBe("#22293d");
    expect(hairMat.sheenColor).toBe("#2b3d70");
    expect(hairMat.roughness).toBeGreaterThanOrEqual(0.5);
    expect(hairMat.roughness).toBeLessThanOrEqual(0.68);
    expect(hairMat.clearcoat).toBe(0);
    expect(hairMat.envMapIntensity).toBeLessThanOrEqual(0.12);

    // Companion cloud & sky creatures preserve full multi-material slots and smooth unit normals
    const cloudPrims = collectPrims(buildGoldenSkyCloudNode().toJSON() as unknown as CustomPrim);
    expect(cloudPrims.length).toBe(3);
    const pteraPrims = collectPrims(buildSkyPterosaurNode(0).toJSON() as unknown as CustomPrim);
    expect(pteraPrims.length).toBe(5);
    const rexPrims = collectPrims(buildStormTyrantNode().toJSON() as unknown as CustomPrim);
    expect(rexPrims.length).toBe(5);
    for (const prim of [...cloudPrims, ...pteraPrims, ...rexPrims]) {
      expect(prim.ignoredOptions).toBeUndefined();
      const nrm = prim.geometry!.normals!;
      for (let i = 0; i < nrm.length; i += 9) {
        expect(Math.abs(Math.hypot(nrm[i]!, nrm[i + 1]!, nrm[i + 2]!) - 1)).toBeLessThan(2e-3);
      }
    }
  });
});
