import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { createInstancedModelNode } from "../../../packages/engine/src/instances-model/InstancedModel.js";

const asset = { id: "fixture-tree", type: "model" as const };

function gridTransforms(count: number) {
  return Array.from({ length: count }, (_, i) => ({ position: [i % 64, 0, Math.floor(i / 64)] as const }));
}

describe("P2 root instances.model wiring source", () => {
  test("validates like the primitive instancing path", () => {
    assert.throws(() => createInstancedModelNode({ asset, transforms: [] }), /at least one transform/);
    assert.throws(
      () => createInstancedModelNode({ asset, transforms: gridTransforms(2), colors: ["#fff"] }),
      /color count must match/
    );
    assert.throws(
      () => createInstancedModelNode({ asset, transforms: gridTransforms(1), maxInstancesPerDraw: 0 }),
      /positive integer/
    );
    assert.throws(
      () => createInstancedModelNode({
        asset,
        transforms: gridTransforms(1),
        lod: { levels: [{ maxDistance: 50 }, { maxDistance: 20 }] }
      }),
      /must ascend/
    );
  });

  test("4k-instance GLB scene reaches 1-draw class with an instancing-aware material", () => {
    const { node, diagnostics } = createInstancedModelNode({
      asset,
      name: "forest",
      transforms: gridTransforms(4000),
      materialName: "instanced-pbr",
      materialInstancingAware: true
    });
    assert.equal(node.kind, "model");
    assert.equal(node.instances.length, 4000);
    assert.equal(diagnostics.instanceCount, 4000);
    assert.equal(diagnostics.estimatedDrawCallsWithoutInstancing, 4000);
    assert.equal(diagnostics.estimatedDrawCallsWithInstancing, 1);
    assert.equal(diagnostics.oneDrawClass, true);
    assert.equal(diagnostics.fallbackWarning, undefined);
  });

  test("fallback warning fires from root when the material rejects instancing", () => {
    const { diagnostics } = createInstancedModelNode({
      asset,
      transforms: gridTransforms(8),
      materialName: "plain-pbr"
    });
    assert.equal(diagnostics.estimatedDrawCallsWithInstancing, 8);
    assert.equal(diagnostics.oneDrawClass, false);
    assert.equal(diagnostics.fallbackWarning?.reason, "material-rejects-instancing");
    assert.match(diagnostics.fallbackWarning?.diagnostic ?? "", /8 instances requested but the material is not in the instancing-aware registry/);
    assert.match(diagnostics.fallbackWarning?.diagnostic ?? "", /\(material-rejects-instancing\)/);
  });

  test("per-instance color + LOD + culling telemetry ride the node", () => {
    const transforms = gridTransforms(4);
    const { node, diagnostics } = createInstancedModelNode({
      asset,
      transforms,
      colors: ["#fff", "#000", "#fff", "#000"],
      materialInstancingAware: true,
      lod: { levels: [{ maxDistance: 20 }, { maxDistance: 60 }], hysteresis: 2 }
    });
    assert.equal(node.instanceColors?.length, 4);
    assert.equal(node.instanceLod?.levels.length, 2);
    assert.equal(diagnostics.lodLevels, 2);
    assert.equal(diagnostics.lodHysteresis, 2);
    assert.equal(diagnostics.culling.instanceCount, 4);
    assert.equal(diagnostics.culling.cullable, true);
    assert.ok(diagnostics.culling.boundingRadius >= 0);
    assert.ok(diagnostics.culling.centroid.every((v) => Number.isFinite(v)));
    // P2 diagnostics surfacing: the node carries the same culling input the mount draws.
    assert.deepEqual(node.instanceCulling, diagnostics.culling);
    assert.equal(node.instanceCulling.instanceCount, 4);
  });

  test("culling centroid + radius track the instance layout", () => {
    const { node } = createInstancedModelNode({
      asset,
      transforms: [{ position: [0, 0, 0] }, { position: [4, 0, 0] }],
      materialInstancingAware: true
    });
    assert.deepEqual([...node.instanceCulling.centroid], [2, 0, 0]);
    assert.equal(node.instanceCulling.boundingRadius, 2);
  });
});
