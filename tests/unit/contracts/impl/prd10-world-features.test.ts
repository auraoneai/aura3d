/**
 * #1143 follow-up: the prd10 frame contributor feeds the generated-path
 * `prd10.wind` / `prd10.caustics` features. World-owned items opt in through
 * the label contract, wind state comes from the `world.wind` node (or the
 * §7.1.3 defaults), caustic state from the water body — and both reach the
 * features' uniform bindings. Non-world items are untouched.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "../../../../packages/engine/src/lanes/prd10";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { frameContributors } from "../../../../packages/rendering/src/contracts/frameGraph";
import { shaderFeaturesFor } from "../../../../packages/rendering/src/contracts/program";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts";
import { packWindUbo } from "../../../../packages/rendering/src/world/vegetation/WindField";
import { windRecords } from "../../../../packages/engine/src/agent-api/compiler/world";
import { worldWind } from "../../../../packages/engine/src/agent-api/world/timeOfDay";
import { normalizeWind } from "../../../../packages/engine/src/agent-api/world/wind";
import { worldWater, clearWaterRecords } from "../../../../packages/engine/src/agent-api/world/water";

const FLAGS = resolveQrFlags({ options: ["world"], env: {} });

function collect(labels: readonly string[], timeSeconds = 2.5): readonly { label: string }[] {
  const con = frameContributors(FLAGS).find((c) => c.id === "prd10.world")!;
  const ctx = { flags: FLAGS, timeSeconds, tier: QUALITY_TIERS.high, blackboard: new Map(), camera: null } as never;
  return con.collect!(labels.map((label) => ({ label })) as never, ctx) as never;
}

function bound(featureId: string): Map<string, unknown> {
  const feature = shaderFeaturesFor(FLAGS).find((f) => f.id === featureId)!;
  const out = new Map<string, unknown>();
  feature.bindUniforms!(1, {} as never, (name: string, value: unknown) => out.set(name, value));
  return out;
}

describe("prd10 world features reach generated-path draws", () => {
  beforeEach(() => windRecords.clear());
  afterEach(() => {
    windRecords.clear();
    clearWaterRecords();
  });

  it("labels world foliage/grass/scatter for wind and leaves other items alone", () => {
    const items = collect(["prd10.scatter.pines", "prd10.grass.meadow", "helmet", "prd10.terrain.a"]);
    expect(items.map((i) => i.label)).toEqual(["prd10.wind:prd10.scatter.pines", "prd10.wind:prd10.grass.meadow", "helmet", "prd10.terrain.a"]);
  });

  it("publishes the world.wind node's spec to the prd10.wind uniforms", () => {
    const node = worldWind({ strength: 1.7, directionDeg: 90, gustStrength: 0.4 }).toJSON() as unknown as { id: string; wind: ReturnType<typeof normalizeWind> };
    windRecords.set(node.id, node as never);
    collect(["prd10.scatter.x"], 4);
    const expected = packWindUbo(node.wind, 4);
    expect(Array.from(bound("prd10.wind").get("u_windDirStrength") as Float32Array)).toEqual(Array.from(expected.subarray(0, 4)));
    expect(Array.from(bound("prd10.wind").get("u_windGust") as Float32Array)).toEqual(Array.from(expected.subarray(4, 8)));
  });

  it("falls back to the default wind when no wind node exists", () => {
    collect(["prd10.grass.y"], 1);
    const expected = packWindUbo(normalizeWind(), 1);
    expect(Array.from(bound("prd10.wind").get("u_windDirStrength") as Float32Array)).toEqual(Array.from(expected.subarray(0, 4)));
  });

  it("with water: terrain beds opt into caustics and the water state reaches the uniforms", () => {
    worldWater({ id: "caustic-lake", kind: "lake", shape: { kind: "circle", center: [0, 0], radius: 5 }, height: 1.25, waves: "calm" });
    const items = collect(["prd10.terrain.bed", "rock"]);
    expect(items.map((i) => i.label)).toEqual(["prd10.caustics:prd10.terrain.bed", "rock"]);
    const uniforms = bound("prd10.caustics");
    expect(uniforms.get("u_causticStrength")).toBeGreaterThan(0);
    expect(uniforms.get("u_waterHeight")).toBe(1.25);
  });

  it("without water: no caustics opt-in and strength 0", () => {
    const items = collect(["prd10.terrain.bed"]);
    expect(items.map((i) => i.label)).toEqual(["prd10.terrain.bed"]);
    expect(bound("prd10.caustics").get("u_causticStrength")).toBe(0);
  });
});
