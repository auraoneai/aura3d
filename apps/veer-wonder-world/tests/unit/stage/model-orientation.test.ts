// Model orientation (07 B33 & PRD 5.5.1 §3.4): the stage's forward axis is +Z.
// Every procedural rig — including GoGo, GoGo's carriage, and the retro car — is
// sculpted facing +Z natively so `MODEL_FRONT_YAW` is empty, `face viewer` turns
// yaw to 0, and `style: "drive"` leads cleanly with the vehicle's front.

import { describe, expect, it } from "vitest";
import { episode as E04 } from "../../../src/content/episodes/gogo-abc-train.js";
import { PROCEDURAL_RIGS } from "../../../src/scenes/procedural-rigs/index.js";
import { MODEL_FRONT_YAW, buildStoryScene, createStage } from "../../../src/scenes/stage.js";
import type { EpisodeSpec } from "../../../src/types.js";

/** Assembled unit-height bounding box `[spanX, spanY, spanZ]` of a procedural rig. */
function rigSpans(key: "gogo" | "gogoCarriage" | "car"): readonly [number, number, number] {
  const rig = PROCEDURAL_RIGS[key];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const part of rig.parts) {
    for (const lobe of part.lobes) {
      const pos = lobe.geometry.positions;
      const ox = part.anchor[0];
      const oy = part.anchor[1];
      const oz = part.anchor[2];
      for (let i = 0; i < pos.length; i += 3) {
        const x = ox + Number(pos[i] ?? 0);
        const y = oy + Number(pos[i + 1] ?? 0);
        const z = oz + Number(pos[i + 2] ?? 0);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
    }
  }
  return [maxX - minX, maxY - minY, maxZ - minZ];
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
  it("sculpts every vehicle rig facing +Z natively so MODEL_FRONT_YAW needs zero yaw patches", () => {
    expect(MODEL_FRONT_YAW).toEqual({});
    for (const key of ["gogo", "gogoCarriage", "car"] as const) {
      const [spanX, , spanZ] = rigSpans(key);
      expect(spanZ, `${key} length along +Z exceeds width along X`).toBeGreaterThan(spanX * 1.15);
    }
  });

  it("builds GoGo and its carriage unturned (+Z forward) at rest", () => {
    const snapshot = buildStoryScene(E04).builder.toJSON();
    const gogo = nodesWithId(snapshot, "gogo")[0];
    if (!gogo) throw new Error("no gogo node");
    const rotation = gogo["rotation"];
    const yaw = Array.isArray(rotation) ? Number(rotation[1]) : 0;
    expect(yaw).toBeCloseTo(0, 6);
  });

  it("keeps a vehicle facing the way it drove, and a face action still turns it", async () => {
    const probe: EpisodeSpec = {
      ...E04,
      id: "probe-vehicle-heading",
      cast: [{ id: "gogo", at: "offRight" }],
      props: [{ id: "car", asset: "car", at: "offRight", size: 0.6 }],
      beats: []
    };
    const stage = await createStage({ target: null, reducedMotion: false, mountTimeoutMs: 50 });
    const run = (seconds: number): void => {
      for (let i = 0; i < Math.round(seconds * 20); i += 1) stage.update(0.05);
    };
    try {
      await stage.load(probe);
      const app = stage.game().app;
      const car = app.nodes.get("car");
      const gogo = app.nodes.get("gogo");
      if (!car || !gogo) throw new Error("missing nodes");
      stage.apply([
        { do: "enter", actor: "car", at: "left", from: "offRight", style: "drive" },
        { do: "enter", actor: "gogo", at: "right", from: "offRight", style: "drive" }
      ]);
      run(8);
      expect(stage.snapshot().nodes.find((n) => n.id === "car")?.moving).toBe(false);
      expect(car.rotation[1]).toBeCloseTo(-Math.PI / 2, 2);
      expect(gogo.rotation[1]).toBeCloseTo(-Math.PI / 2, 2);
      stage.apply([{ do: "face", actor: "gogo", toward: "viewer" }]);
      run(3);
      expect(gogo.rotation[1]).toBeCloseTo(0, 2);
      expect(car.rotation[1]).toBeCloseTo(-Math.PI / 2, 2);
    } finally {
      stage.dispose();
    }
  });
});
