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
