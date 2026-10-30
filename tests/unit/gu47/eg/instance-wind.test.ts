/**
 * GU47 E-G (WP-7 item 6): `instances.model({ wind })` without the WORLD
 * lane and `wind` on `instances.custom` / `instances.<primitive>`. Wind runs
 * on the generated-program `prd10.wind` deform, now gated on the
 * `A3D_QR_WORLD_WIND` sub-flag (implied by `world`); the instance-wind
 * contributor labels the nodes' items and publishes the frame's wind.
 */
import { describe, expect, it } from "vitest";
import "../../../../packages/engine/src/lanes/prd10";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import {
  INSTANCE_WIND_CONTRIBUTOR,
  instances,
  labelInstanceWindItems,
  resolveInstanceWind
} from "../../../../packages/engine/src/agent-api/nodes/instances";
import { normalizeWind } from "../../../../packages/engine/src/agent-api/world/wind";
import type { AuraAssetRef, AuraTransformSpec } from "../../../../packages/engine/src/agent-api/nodes/types";
import { frameContributors, type FrameContributorContext } from "../../../../packages/rendering/src/contracts/frameGraph";
import { shaderFeaturesFor } from "../../../../packages/rendering/src/contracts/program";
import { selectShaderFeatureBits } from "../../../../packages/rendering/src/program/FeatureSelect";

const asset = { kind: "asset", type: "model", key: "tree", url: "/tree.glb", format: "glb" } as unknown as AuraAssetRef<"model">;
const transforms: AuraTransformSpec[] = [{ position: [0, 0, 0] }, { position: [4, 0, 0] }];
type Loose = Record<string, any>;
const json = (builder: { toJSON(): unknown }): Loose => builder.toJSON() as Loose;
const WIND_ONLY = resolveQrFlags({ options: ["world.wind"] });

describe("GU47 E-G A3D_QR_WORLD_WIND", () => {
  it("is implied by world, can run alone and has its own kill switch", () => {
    expect(resolveQrFlags({ options: ["world"] }).on("A3D_QR_WORLD_WIND")).toBe(true);
    expect(resolveQrFlags({ options: ["world", "-world.wind"] }).on("A3D_QR_WORLD_WIND")).toBe(false);
    expect(WIND_ONLY.on("A3D_QR_WORLD_WIND")).toBe(true);
    expect(WIND_ONLY.on("A3D_QR_WORLD")).toBe(false);
  });

  it("gates the prd10.wind feature, which still selects only labelled draws", () => {
    expect(shaderFeaturesFor(WIND_ONLY).some((f) => f.id === "prd10.wind")).toBe(true);
    expect(shaderFeaturesFor(resolveQrFlags({ options: ["world"] })).some((f) => f.id === "prd10.wind")).toBe(true);
    expect(shaderFeaturesFor(resolveQrFlags({ options: ["-world.wind"] })).some((f) => f.id === "prd10.wind")).toBe(false);
    // Same lane exclusions as prd10/generated-path-features (other features need a full select input).
    const selectFlags = resolveQrFlags({ options: ["world.wind", "-lighting", "-core"] });
    const select = (label: string) => selectShaderFeatureBits({ item: { label } as never, pass: "forward" as never, tier: {} as never, flags: selectFlags } as never);
    expect(select("prd10.wind:primitive-0:tree")["prd10.wind"]).toBe(1);
    expect(select("primitive-0:tree")).not.toHaveProperty("prd10.wind");
  });
});

describe("GU47 E-G instance wind builders", () => {
  it("resolveInstanceWind: true → default wind, options tune it, false/absent → none", () => {
    expect(resolveInstanceWind(true)).toEqual({ wind: normalizeWind(), assetHeight: 1 });
    const tuned = resolveInstanceWind({ strength: 1.2, directionDeg: 90, assetHeight: 3 })!;
    expect(tuned.wind.strength).toBe(1.2);
    expect(tuned.wind.direction[0]).toBeCloseTo(1, 9);
    expect(tuned.assetHeight).toBe(3);
    expect(resolveInstanceWind({ assetHeight: -2 })!.assetHeight).toBe(1);
    expect(resolveInstanceWind(false)).toBeNull();
    expect(resolveInstanceWind(undefined)).toBeNull();
  });

  it("instances.model({ wind }) stamps the wind and gives the node its own userData copy", () => {
    const userData = { kind: "tree" };
    const node = json(instances.model(asset, { transforms, wind: true, userData }));
    expect(node.instanceWind).toEqual({ wind: normalizeWind(), assetHeight: 1 });
    expect(node.userData).toEqual({ kind: "tree" });
    expect(node.userData).not.toBe(userData);
    // The PRD-10 placements block keeps its boolean wind flag.
    expect(node.placements.wind).toBe(true);
    expect(node.ignoredOptions).toBeUndefined();
  });

  it("instances.custom and instanced primitives take wind", () => {
    const custom = json(instances.custom({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0], indices: [0, 1, 2] } as never, { transforms, wind: { strength: 0.8, assetHeight: 2 } }));
    expect(custom.instanceWind.wind.strength).toBe(0.8);
    expect(custom.instanceWind.assetHeight).toBe(2);
    expect(custom.ignoredOptions).toBeUndefined();
    const cones = json(instances.cone({ transforms, wind: true }));
    expect(cones.instanceWind).toBeDefined();
  });

  it("nodes without wind are unchanged (no instanceWind, authored userData kept)", () => {
    const userData = { a: 1 };
    const node = json(instances.box({ transforms, userData }));
    expect(node.instanceWind).toBeUndefined();
    expect(node.userData).toBe(userData);
    expect(json(instances.model(asset, { transforms })).instanceWind).toBeUndefined();
  });
});

describe("GU47 E-G instance wind contributor", () => {
  it("is registered after a wind build and active only under A3D_QR_WORLD_WIND", () => {
    instances.box({ transforms, wind: true });
    expect(frameContributors(WIND_ONLY)).toContain(INSTANCE_WIND_CONTRIBUTOR);
    expect(frameContributors(resolveQrFlags({ options: ["-world.wind"] }))).not.toContain(INSTANCE_WIND_CONTRIBUTOR);
    expect(INSTANCE_WIND_CONTRIBUTOR.passes).toBeUndefined();
  });

  it("labels only the items of wind nodes and returns the same array when nothing changes", () => {
    const windNode = json(instances.box({ transforms, wind: { strength: 1.5 } }));
    const plain = json(instances.box({ transforms, userData: { a: 1 } }));
    const items = [
      { label: "primitive-0:box:a", userData: windNode.userData },
      { label: "primitive-1:box:b", userData: plain.userData },
      { label: "primitive-2:box:c" }
    ] as never[];
    const out = labelInstanceWindItems(items);
    expect((out.items[0] as Loose).label).toBe("prd10.wind:primitive-0:box:a");
    expect(out.items[1]).toBe(items[1]);
    expect(out.items[2]).toBe(items[2]);
    expect(out.wind?.wind.strength).toBe(1.5);
    // Idempotent: an already-labelled item is not prefixed twice.
    expect(labelInstanceWindItems(out.items).items).toBe(out.items);
    const none = [{ label: "x" }] as never[];
    expect(labelInstanceWindItems(none).items).toBe(none);
  });

  it("publishes the wind for the deform without WORLD (and defers to WORLD when it is on)", () => {
    const windNode = json(instances.box({ transforms, wind: { strength: 1.7, directionDeg: 90 } }));
    const items = [{ label: "primitive-0:box:w", userData: windNode.userData }] as never[];
    const ctx = (flags: ReturnType<typeof resolveQrFlags>, timeSeconds: number) => ({ flags, timeSeconds }) as unknown as FrameContributorContext;
    const values = new Map<string, unknown>();
    const bind = () => shaderFeaturesFor(WIND_ONLY).find((f) => f.id === "prd10.wind")!.bindUniforms?.(1, {} as never, (name, value) => values.set(name, value));
    const out = INSTANCE_WIND_CONTRIBUTOR.collect!(items, ctx(WIND_ONLY, 2.5));
    expect((out[0] as Loose).label.startsWith("prd10.wind:")).toBe(true);
    bind();
    const dirStrength = Array.from(values.get("u_windDirStrength") as Float32Array);
    expect(dirStrength[0]).toBeCloseTo(1, 5);
    expect(dirStrength[2]).toBeCloseTo(1.7, 5);
    expect(dirStrength[3]).toBeCloseTo(2.5, 5);
    // WORLD on: the world contributor owns the wind state; this one only labels.
    INSTANCE_WIND_CONTRIBUTOR.collect!(items, ctx(resolveQrFlags({ options: ["world"] }), 9));
    bind();
    expect(Array.from(values.get("u_windDirStrength") as Float32Array)[3]).toBeCloseTo(2.5, 5);
  });
});
