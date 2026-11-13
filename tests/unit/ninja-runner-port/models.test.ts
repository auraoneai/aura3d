import { existsSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MESHY_MANIFEST } from "../../../examples/ninja-runner-port/assets/meshy/manifest";
import { buildProceduralActorNodes, createProceduralActorAssets } from "../../../examples/ninja-runner-port/art/proceduralActors";
import { CHARACTER_URLS, EVENING_SLOT_MODEL, MESHY07_ENEMY_CLIPS, SLOT_MODEL } from "../../../examples/ninja-runner-port/models";
import { buildScenery, type ModelSink } from "../../../examples/ninja-runner-port/scenery";

describe("procedural Sengoku character & prop assets", () => {
  it("ships zero .glb files under examples/ninja-runner-port/assets/ and keeps manifest budgets finite", () => {
    for (const sub of ["examples/ninja-runner-port/assets/meshy", "examples/ninja-runner-port/assets/models"]) {
      if (!existsSync(sub)) continue;
      const glbs = readdirSync(sub).filter((f) => f.endsWith(".glb"));
      expect(glbs, sub).toEqual([]);
    }
    const total = Object.values(MESHY_MANIFEST).reduce((n, m) => n + m.bytes, 0);
    expect(total).toBeLessThan(32 * 1024 * 1024);
  });

  it("assigns a character model to every actor slot (hero + clones, soldiers, brutes, sage)", () => {
    expect(SLOT_MODEL).toHaveLength(13);
    const count = (id: string): number => SLOT_MODEL.filter((m) => m === id).length;
    expect([count("hero"), count("soldier"), count("brute"), count("sage")]).toEqual([4, 6, 2, 1]);
    expect(SLOT_MODEL[0]).toBe("hero");
    expect(SLOT_MODEL[12]).toBe("sage");
    expect(SLOT_MODEL.slice(10, 12)).toEqual(["brute", "brute"]);
  });

  it("evening appends three caster and three scout slots and keeps the base slots as they are", () => {
    expect(EVENING_SLOT_MODEL.slice(0, 13)).toEqual(SLOT_MODEL);
    expect(EVENING_SLOT_MODEL.slice(13)).toEqual(["caster", "caster", "caster", "scout", "scout", "scout"]);
    expect(SLOT_MODEL).not.toContain("caster");
    expect(SLOT_MODEL).not.toContain("scout");
    expect(MESHY07_ENEMY_CLIPS.caster).toEqual({ attack: "cast", death: "death" });
    expect(MESHY07_ENEMY_CLIPS.scout).toEqual({ attack: "throw", death: "death" });
  });

  it("builds articulated multi-material procedural rigs with canonical clips and bone transforms", () => {
    const assets = createProceduralActorAssets(undefined, "evening");
    expect(assets.actors).toHaveLength(EVENING_SLOT_MODEL.length);
    expect(CHARACTER_URLS.caster).toContain("ninja_runner_port_ninjaCasterAnimR2");
    expect(CHARACTER_URLS.scout).toContain("ninja_runner_port_ninjaScoutAnimR2");

    for (const [idx, id] of EVENING_SLOT_MODEL.entries()) {
      const nodes = buildProceduralActorNodes(idx, id, idx >= 1 && idx <= 3);
      expect(nodes).toHaveLength(6);
      const actor = assets.actors[idx]!;
      if (id === "caster") expect(actor.evidence.clips).toEqual(expect.arrayContaining(["idle", "run", "cast", "hit", "death"]));
      else if (id === "scout") expect(actor.evidence.clips).toEqual(expect.arrayContaining(["idle", "run", "throw", "hit", "death"]));
      else expect(actor.evidence.clips).toEqual(expect.arrayContaining(["run", "jump", "idle", "slide", "punch", "sword", "hit", "death"]));
      actor.playClip("run", 0.25);
      actor.pipeline.resources.scene.updateWorldTransforms();
      expect(actor.pipeline.resources.scene.findByName("Spine02")).toHaveLength(1);
      expect(actor.pipeline.resources.scene.findByName("RightHand")).toHaveLength(1);
    }

    // Verify COLOR_0 vertex colors are preserved across every character archetype + clone + ember form (zero white clay)
    const variantsToCheck = [
      buildProceduralActorNodes(0, "hero", true, "std"),
      buildProceduralActorNodes(1, "hero", false, "clone"),
      buildProceduralActorNodes(12, "sage", true, "std"),
      buildProceduralActorNodes(19, "sage", true, "ember"),
      buildProceduralActorNodes(4, "soldier", false, "std"),
      buildProceduralActorNodes(10, "brute", false, "std"),
      buildProceduralActorNodes(13, "caster", false, "std"),
      buildProceduralActorNodes(16, "scout", false, "std")
    ];
    for (const rigNodes of variantsToCheck) {
      expect(rigNodes).toHaveLength(6);
      const bodyJson = rigNodes[0]!.toJSON() as {
        name?: string;
        material?: { roughness?: number };
        geometry?: { positions: Float32Array; colors?: Float32Array };
      };
      const cols = bodyJson.geometry?.colors;
      const pos = bodyJson.geometry?.positions;
      expect(cols, `${bodyJson.name} body colors`).toBeInstanceOf(Float32Array);
      expect(cols!.length).toBe((pos!.length / 3) * 4);
      expect(bodyJson.material?.roughness).toBeDefined();
      let maxChroma = 0;
      for (let i = 0; i < cols!.length; i += 4) {
        const r = cols![i]!, g = cols![i + 1]!, b = cols![i + 2]!;
        maxChroma = Math.max(maxChroma, Math.max(r, g, b) - Math.min(r, g, b));
      }
      expect(maxChroma, `${bodyJson.name} must have rich chromatic vertex colors`).toBeGreaterThan(0.1);
    }
  });

  it("sculpts high-density anatomical Sengoku rigs with matte 0.84 cloth, satin 0.54 skin, lacquered 0.28 armor, and distinct silhouettes", () => {
    interface RawJsonNode {
      name?: string;
      material?: { roughness?: number };
      geometry?: { positions: Float32Array; normals: Float32Array; indices: Uint16Array | Uint32Array; colors?: Float32Array };
      children?: RawJsonNode[];
    }
    const measureRig = (nodes: ReturnType<typeof buildProceduralActorNodes>) => {
      let verts = 0;
      let tris = 0;
      const materialsBySuffix = new Map<string, number>();
      const walk = (n: RawJsonNode) => {
        if (n.geometry?.positions) {
          const v = n.geometry.positions.length / 3;
          verts += v;
          tris += n.geometry.indices.length / 3;
          expect(n.geometry.colors?.length, `${n.name} colors`).toBe(v * 4);
          expect(n.geometry.positions.every(Number.isFinite)).toBe(true);
          expect(n.geometry.normals.every(Number.isFinite)).toBe(true);
          if (n.name && typeof n.material?.roughness === "number") {
            materialsBySuffix.set(n.name, n.material.roughness);
          }
        }
        for (const ch of n.children ?? []) walk(ch);
      };
      for (const builder of nodes) walk(builder.toJSON() as unknown as RawJsonNode);
      return { verts, tris, materialsBySuffix };
    };

    const archetypes = [
      { key: "hero", nodes: buildProceduralActorNodes(0, "hero", true, "std") },
      { key: "clone", nodes: buildProceduralActorNodes(1, "hero", false, "clone") },
      { key: "sage", nodes: buildProceduralActorNodes(12, "sage", true, "std") },
      { key: "ember", nodes: buildProceduralActorNodes(19, "sage", true, "ember") },
      { key: "soldier", nodes: buildProceduralActorNodes(4, "soldier", false, "std") },
      { key: "brute", nodes: buildProceduralActorNodes(10, "brute", false, "std") },
      { key: "caster", nodes: buildProceduralActorNodes(13, "caster", false, "std") },
      { key: "scout", nodes: buildProceduralActorNodes(16, "scout", false, "std") }
    ] as const;

    const headSignatures = new Set<number>();
    for (const { key, nodes } of archetypes) {
      const { verts, tris, materialsBySuffix } = measureRig(nodes);
      expect(verts, `${key} sculpted vertex density`).toBeGreaterThanOrEqual(2500);
      expect(tris, `${key} minTriangles >= 2000`).toBeGreaterThanOrEqual(2000);
      expect(tris, `${key} maxTriangles <= 15000`).toBeLessThanOrEqual(15000);

      if (key !== "clone") {
        const slotMatch = (nodes[0]!.toJSON() as { name: string }).name.replace(/-body$/, "");
        expect(materialsBySuffix.get(`${slotMatch}-head-main`)).toBeCloseTo(0.84, 2);
        expect(materialsBySuffix.get(`${slotMatch}-head-skin`)).toBeCloseTo(0.54, 2);
        expect(materialsBySuffix.get(`${slotMatch}-head-armor`)).toBeCloseTo(0.28, 2);
      }
      if (key !== "clone") {
        const headJson = nodes[1]!.toJSON() as unknown as RawJsonNode;
        const headVerts = (headJson.children ?? []).reduce((sum, ch) => sum + (ch.geometry?.positions.length ?? 0) / 3, 0);
        headSignatures.add(headVerts);
      }
    }
    // Distinct sculpted headgear/masks across hero, sage, ember, soldier, brute, caster, scout
    expect(headSignatures.size).toBeGreaterThanOrEqual(6);

    // Bilateral mirror symmetry across left/right arms & split-toe tabi legs
    const heroNodes = archetypes[0].nodes;
    const xBounds = (pos: Float32Array): [number, number] => {
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < pos.length; i += 3) {
        if (pos[i]! < lo) lo = pos[i]!;
        if (pos[i]! > hi) hi = pos[i]!;
      }
      return [lo, hi];
    };
    const [armLMinX, armLMaxX] = xBounds((heroNodes[4]!.toJSON() as unknown as RawJsonNode).children![0]!.geometry!.positions);
    const [armRMinX, armRMaxX] = xBounds((heroNodes[5]!.toJSON() as unknown as RawJsonNode).children![0]!.geometry!.positions);
    expect(armLMinX).toBeCloseTo(-armRMaxX, 4);
    expect(armLMaxX).toBeCloseTo(-armRMinX, 4);
  });
});

describe("scenery with generated models", () => {
  const sink: ModelSink = {};
  const layers = buildScenery(sink);

  it("places houses, towers, lamp posts, gates and pines as model instances", () => {
    for (const id of ["houseA", "houseB", "houseC", "houseD", "tower", "lantern", "gate", "pine", "oak", "teahouse", "marketStall", "boulder", "cliffA", "cliffB", "bush", "ridge", "fenceRail"]) expect(sink[id]?.length ?? 0, id).toBeGreaterThan(0);
    expect(sink.gate).toHaveLength(3);
  });

  it("every placement is finite with positive scales", () => {
    for (const list of Object.values(sink)) for (const p of list) {
      for (const v of [...p.position, p.yaw, ...p.scale]) expect(Number.isFinite(v)).toBe(true);
      for (const s of p.scale) expect(s).toBeGreaterThan(0);
    }
  });

  it("never stretches a model more than about 1.65x on one axis against another (texture stretch)", () => {
    let worst = 1;
    /* the distant ridge is a landform (fogged, stretched freely); every other model keeps its proportions */
    for (const [id, list] of Object.entries(sink)) if (id !== "ridge" && id !== "fenceRail") for (const p of list) {
      const lo = Math.min(...p.scale), hi = Math.max(...p.scale);
      worst = Math.max(worst, hi / lo);
    }
    expect(worst).toBeLessThanOrEqual(1.28 / 0.78 + 1e-9);
  });

  it("replaces the procedural wall, roof and trunk pieces the models stand in for", () => {
    const plain = buildScenery();
    const count = (ls: ReturnType<typeof buildScenery>, id: string): number => ls.find((l) => l.id === id)?.placements.length ?? 0;
    expect(count(layers, "roofs")).toBeLessThan(count(plain, "roofs"));
    expect(count(layers, "trunks")).toBeLessThan(count(plain, "trunks"));
    expect(count(layers, "cones")).toBeLessThan(count(plain, "cones"));
  });
});
