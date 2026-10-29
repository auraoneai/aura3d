// Model orientation (07 B33): the stage's forward is +Z, as in every stand-in recipe. Meshy made the vehicles side-on
// with their front toward -X, so the stage gives those models a quarter turn: `face viewer` shows GoGo's face, and a
// drive leads with the front.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MODEL_KEYS, type ModelKey } from "../../../src/aura-assets.js";
import { episode as E04 } from "../../../src/content/episodes/gogo-abc-train.js";
import { MODEL_FRONT_YAW, buildStoryScene, createStage } from "../../../src/scenes/stage.js";
import type { EpisodeSpec } from "../../../src/types.js";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** The admitted GLB's inspected bounds (width x, height y, depth z) from its provenance record. */
function bounds(key: ModelKey): readonly [number, number, number] {
  const record: unknown = JSON.parse(readFileSync(join(appRoot, "provenance", "models", `${key}.json`), "utf8"));
  if (typeof record !== "object" || record === null || !("inspection" in record)) throw new Error(`${key}: no inspection`);
  const inspection: unknown = record.inspection;
  if (typeof inspection !== "object" || inspection === null || !("bounds" in inspection) || !Array.isArray(inspection.bounds)) {
    throw new Error(`${key}: no bounds`);
  }
  const [x, y, z] = inspection.bounds.map(Number);
  return [x ?? 0, y ?? 0, z ?? 0];
}

/** Every node object in a scene snapshot whose runtime id is `id`. */
function nodesWithId(snapshot: unknown, id: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    if (typeof value !== "object" || value === null) return;
    const record = Object.fromEntries(Object.entries(value));
    const runtime = record["runtime"];
    if (typeof runtime === "object" && runtime !== null && "id" in runtime && runtime.id === id) out.push(record);
    for (const child of Object.values(record)) walk(child);
  };
  walk(snapshot);
  return out;
}

describe("model orientation (07 B33)", () => {
  it("turns only side-on vehicle models, whose GLB runs along X", () => {
    const turned = Object.keys(MODEL_FRONT_YAW).sort();
    expect(turned).toEqual(["car", "gogo", "gogoCarriage"]);
    for (const key of MODEL_KEYS) {
      const yaw = MODEL_FRONT_YAW[key];
      if (yaw === undefined) continue;
      const [x, , z] = bounds(key);
      expect(x / z, `${key} is longer along X than along Z`).toBeGreaterThan(1.4);
      expect(yaw, key).toBeCloseTo(Math.PI / 2, 6);
    }
  });

  it("builds GoGo and its carriage a quarter turn round, and a stand-in GoGo unturned", () => {
    for (const withModels of [true, false]) {
      const snapshot = buildStoryScene(E04, { modelAvailable: () => withModels }).builder.toJSON();
      const gogo = nodesWithId(snapshot, "gogo")[0];
      if (!gogo) throw new Error("no gogo node");
      const rotation = gogo["rotation"];
      expect(Array.isArray(rotation), JSON.stringify(gogo).slice(0, 300)).toBe(true);
      const yaw = Array.isArray(rotation) ? Number(rotation[1]) : NaN;
      expect(yaw, withModels ? "the model is turned" : "the stand-in faces +Z already").toBeCloseTo(withModels ? Math.PI / 2 : 0, 6);
    }
  });

  it("keeps a vehicle facing the way it drove, and a face action still turns it", async () => {
    const probe: EpisodeSpec = {
      ...E04,
      id: "probe-vehicle-heading",
      cast: [{ id: "gogo", at: "offRight" }],
      props: [{ id: "car", asset: "car", at: "offRight", size: 0.6 }],
      beats: []
    };
    const stage = await createStage({ target: null, reducedMotion: false, models: false, mountTimeoutMs: 50 });
    const run = (seconds: number): void => {
      for (let i = 0; i < Math.round(seconds * 20); i += 1) stage.update(0.05);
    };
    try {
      await stage.load(probe);
      const app = stage.game().app;
      const car = app.nodes.get("car");
      const gogo = app.nodes.get("gogo");
      if (!car || !gogo) throw new Error("missing nodes");
      // Both drive in from the right, heading toward -X, and keep that heading once parked.
      stage.apply([
        { do: "enter", actor: "car", at: "left", from: "offRight", style: "drive" },
        { do: "enter", actor: "gogo", at: "right", from: "offRight", style: "drive" }
      ]);
      run(8);
      expect(stage.snapshot().nodes.find((n) => n.id === "car")?.moving).toBe(false);
      expect(car.rotation[1]).toBeCloseTo(-Math.PI / 2, 2);
      expect(gogo.rotation[1]).toBeCloseTo(-Math.PI / 2, 2);
      // Facing the viewer turns GoGo's front (+Z for the stand-in, the turned model) to the camera.
      stage.apply([{ do: "face", actor: "gogo", toward: "viewer" }]);
      run(3);
      expect(gogo.rotation[1]).toBeCloseTo(0, 2);
      expect(car.rotation[1]).toBeCloseTo(-Math.PI / 2, 2);
    } finally {
      stage.dispose();
    }
  });
});
