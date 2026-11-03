import { Scene, SceneMetadata, deserializeScene, serializeScene } from "@aura3d/scene";
import { describe, expect, it } from "vitest";

describe("native scene metadata replacement", () => {
  function populated(): SceneMetadata {
    return new SceneMetadata({ deterministicSeed: 13 })
      .registerAsset({ id: "asset", nodeIds: ["node"], materialIds: ["material"] })
      .assignMaterial({ nodeId: "node", materialId: "material", unsupportedFeatures: ["feature"] })
      .addPlan({ id: "plan", kind: "animation", description: "move", evidence: ["test"] })
      .discloseUnsupportedFeature("effect", "not available", { evidence: ["source"] })
      .recordRevision({ id: "revision-2", summary: "initial" });
  }

  it("preserves every entry when replacing from itself or its exposed arrays", () => {
    const metadata = populated();
    const expected = metadata.toJSON();
    const assets = metadata.assets;
    expect(metadata.replace(metadata)).toBe(metadata);
    expect(metadata.toJSON()).toEqual(expected);
    expect(metadata.assets).toBe(assets);
    metadata.replace({
      deterministicSeed: metadata.deterministicSeed,
      assets: metadata.assets,
      materialAssignments: metadata.materialAssignments,
      plans: metadata.plans,
      capabilities: metadata.capabilities,
      revisions: metadata.revisions
    });
    expect(metadata.toJSON()).toEqual(expected);
    expect(metadata.assets).toBe(assets);
  });

  it("leaves the existing snapshot untouched if replacement validation fails", () => {
    const metadata = populated();
    const before = metadata.toJSON();
    expect(() => metadata.replace({
      deterministicSeed: 99,
      assets: [{ id: "new" }, { id: "" }],
      materialAssignments: [{ nodeId: "other", materialId: "other" }]
    })).toThrow(/asset id/i);
    expect(metadata.toJSON()).toEqual(before);
  });

  it("allocates a fresh generated revision id when an explicit id occupies the next candidate", () => {
    const metadata = populated();
    metadata.recordRevision({ summary: "second" });
    expect(metadata.revisions.map((revision) => [revision.id, revision.summary])).toEqual([
      ["revision-2", "initial"],
      ["revision-3", "second"]
    ]);
    metadata.recordRevision({ id: "revision-2", summary: "edited" });
    expect(metadata.revisions.map((revision) => [revision.id, revision.summary])).toEqual([
      ["revision-2", "edited"],
      ["revision-3", "second"]
    ]);
  });

  it("keeps serialized, restored and original metadata arrays independent", () => {
    const scene = new Scene();
    scene.metadata.replace(populated());
    const serialized = serializeScene(scene);
    const restored = deserializeScene(JSON.parse(JSON.stringify(serialized)));
    (restored.metadata.assets[0]!.nodeIds as string[]).push("restored");
    (restored.metadata.plans[0]!.evidence as string[]).push("restored");
    expect(scene.metadata.assets[0]!.nodeIds).toEqual(["node"]);
    expect(scene.metadata.plans[0]!.evidence).toEqual(["test"]);
    expect(serialized.metadata?.assets?.[0]?.nodeIds).toEqual(["node"]);
    expect(serialized.metadata?.plans?.[0]?.evidence).toEqual(["test"]);
  });

  it.each(["scene", "plan", "revision", "slot"] as const)(
    "rejects non-finite %s metadata numbers before JSON can change them",
    (field) => {
      const scene = new Scene();
      if (field === "scene") scene.metadata.deterministicSeed = NaN;
      if (field === "plan") scene.metadata.addPlan({ id: "plan", kind: "animation", description: "move", deterministicSeed: Infinity });
      if (field === "revision") scene.metadata.recordRevision({ summary: "edit", deterministicSeed: NaN });
      if (field === "slot") scene.metadata.assignMaterial({ nodeId: "node", materialId: "material", slot: Infinity });
      expect(() => serializeScene(scene)).toThrow(/metadata/i);
    }
  );

  it("rejects a corrupted numeric metadata field while reading a serialized scene", () => {
    const scene = new Scene();
    scene.metadata.deterministicSeed = 4;
    const serialized = JSON.parse(JSON.stringify(serializeScene(scene)));
    serialized.metadata.deterministicSeed = null;
    expect(() => deserializeScene(serialized)).toThrow(/metadata/i);
  });
});
