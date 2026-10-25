import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MESHY_MANIFEST } from "../../../examples/ninja-runner-port/assets/meshy/manifest";
import { SLOT_MODEL } from "../../../examples/ninja-runner-port/models";
import { buildScenery, type ModelSink } from "../../../examples/ninja-runner-port/scenery";

const DIR = "examples/ninja-runner-port/assets/meshy/";

describe("generated model assets", () => {
  it("the manifest matches the shipped GLBs byte for byte (regenerate with tools/crayon-capture/ninja-runner-meshy-manifest.mjs)", () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith(".glb")).map((f) => f.replace(/\.glb$/, "")).sort();
    expect(Object.keys(MESHY_MANIFEST).sort()).toEqual(files);
    for (const id of files) {
      const buf = readFileSync(`${DIR}${id}.glb`);
      expect(createHash("sha256").update(buf).digest("hex"), id).toBe(MESHY_MANIFEST[id]!.sha256);
      expect(statSync(`${DIR}${id}.glb`).size).toBe(MESHY_MANIFEST[id]!.bytes);
    }
  });

  it("stays inside the asset and triangle budgets", () => {
    const total = Object.values(MESHY_MANIFEST).reduce((n, m) => n + m.bytes, 0);
    expect(total).toBeLessThan(20 * 1024 * 1024);
    for (const [id, m] of Object.entries(MESHY_MANIFEST)) {
      const budget = ["hero", "sage", "soldier"].includes(id) ? 30000 : id === "brute" ? 40000 : 8000;
      expect(m.triangles, id).toBeLessThanOrEqual(budget);
    }
  });

  it("assigns a character model to every actor slot (hero + clones, soldiers, brutes, sage)", () => {
    expect(SLOT_MODEL).toHaveLength(13);
    const count = (id: string): number => SLOT_MODEL.filter((m) => m === id).length;
    expect([count("hero"), count("soldier"), count("brute"), count("sage")]).toEqual([4, 6, 2, 1]);
    expect(SLOT_MODEL[0]).toBe("hero");
    expect(SLOT_MODEL[12]).toBe("sage");
    expect(SLOT_MODEL.slice(10, 12)).toEqual(["brute", "brute"]);
  });
});

describe("scenery with generated models", () => {
  const sink: ModelSink = {};
  const layers = buildScenery(sink);

  it("places houses, towers, lamp posts, gates and pines as model instances", () => {
    for (const id of ["houseA", "houseB", "tower", "lantern", "gate", "pine", "oak"]) expect(sink[id]?.length ?? 0, id).toBeGreaterThan(0);
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
    for (const list of Object.values(sink)) for (const p of list) {
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
