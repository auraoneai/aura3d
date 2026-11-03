import { describe, expect, it } from "vitest";
import { deserializeScene, Renderable, Scene, serializeScene, type SerializedScene } from "@aura3d/scene";
import type { GLTFAsset } from "../../../packages/assets/src";
import { createGLTFSceneAnimationRuntime, GLTFLoader, LoadContext } from "../../../packages/assets/src";

/**
 * PRD-06 T0.11 — the runtime keeps ONE palette Float32Array per skinned binding
 * (allocated at bind, written in place each frame) and stamps the C-18
 * `paletteKey` (the binding itself) onto `renderable.skinning` so the renderer's
 * palette cache can key its texture pair per skin instance. Across N frames the
 * key and buffer identities must be identical; a different actor must produce a
 * different key. Flag-off safety: `paletteKey` is extra metadata on the same
 * `{jointCount, matrices}` shape — `MAX_UNIFORM_SKINNING_JOINTS` consumers only
 * read those two fields.
 */
const IDENTITY_MAT4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function buildRiggedScene() {
  const scene = new Scene();
  const jointA = scene.createNode("JointA");
  const jointB = scene.createNode("JointB");
  const meshNode = scene.createNode("skinned-geometry");
  scene.root.addChild(jointA);
  scene.root.addChild(jointB);
  scene.root.addChild(meshNode);
  const renderable = new Renderable({
    geometry: "skinned-geometry",
    material: "skinned-material",
    skinning: { jointCount: 2, matrices: new Float32Array(32) }
  });
  scene.addRenderable(meshNode, renderable);
  const asset = {
    meshes: [{ name: "skinned-geometry", skinIndex: 0 }],
    skins: [{
      name: "skin",
      joints: [0, 1],
      jointNames: ["JointA", "JointB"],
      inverseBindMatrices: [IDENTITY_MAT4, IDENTITY_MAT4]
    }]
  } as unknown as Pick<GLTFAsset, "meshes" | "skins">;
  return { scene, renderable, asset, jointA };
}

type StampedSkinning = { jointCount: number; matrices: Float32Array; paletteKey?: object };

describe("runtime skinning palette identity (T0.11)", () => {
  it("keeps one palette buffer + one paletteKey per binding across 10 frames", () => {
    const { scene, renderable, asset, jointA } = buildRiggedScene();
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [], asset });

    runtime.applyPose({ bones: {} });
    const first = renderable.skinning as StampedSkinning;
    expect(first.paletteKey).toBeTypeOf("object");
    const firstMatrices = first.matrices;
    expect(firstMatrices.length).toBe(2 * 16);

    for (let frame = 0; frame < 9; frame += 1) {
      jointA.transform.setPosition(frame * 0.1, 0, 0);
      runtime.applyPose({ bones: {} });
      const skinning = renderable.skinning as StampedSkinning;
      expect(skinning.paletteKey).toBe(first.paletteKey);
      expect(skinning.matrices).toBe(firstMatrices);
    }
    expect(runtime.snapshot().skinningBindingCount).toBe(1);
  });

  it("writes joint world x inverseBind into the persistent buffer", () => {
    const { scene, renderable, asset, jointA } = buildRiggedScene();
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [], asset });
    jointA.transform.setPosition(0, 2, 0);
    runtime.applyPose({ bones: {} });
    const skinning = renderable.skinning as StampedSkinning;
    // Column-major: translation lives at indices 12..14 of the first matrix.
    expect(skinning.matrices[13]).toBeCloseTo(2);
    expect(skinning.matrices[16 + 13]).toBeCloseTo(0);
  });

  it("produces a different paletteKey for a second actor's binding", () => {
    const first = buildRiggedScene();
    const second = buildRiggedScene();
    const runtimeA = createGLTFSceneAnimationRuntime({ scene: first.scene, clips: [], asset: first.asset });
    const runtimeB = createGLTFSceneAnimationRuntime({ scene: second.scene, clips: [], asset: second.asset });
    runtimeA.applyPose({ bones: {} });
    runtimeB.applyPose({ bones: {} });
    const keyA = (first.renderable.skinning as StampedSkinning).paletteKey;
    const keyB = (second.renderable.skinning as StampedSkinning).paletteKey;
    expect(keyA).toBeTypeOf("object");
    expect(keyB).toBeTypeOf("object");
    expect(keyA).not.toBe(keyB);
  });
});

/**
 * The same glTF mesh is attached to two different, equally sized skins. All
 * joints deliberately have the same authored name, so neither a geometry name,
 * a joint name nor joint count identifies the authored node/skin binding.
 */
async function loadReusedMeshFixture(primitiveCount = 1, withInstanceColors = false) {
  const chunks = [
    new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]),
    new Float32Array([0, 1]),
    new Float32Array([1, 0, 0, 5, 0, 0]),
    new Float32Array([10, 0, 0, 30, 0, 0])
  ];
  if (withInstanceColors) chunks.push(new Uint8Array([255, 0, 0, 255, 0, 0, 255, 128]));
  let byteLength = 0;
  const bufferViews = chunks.map((chunk) => {
    const view = { buffer: 0, byteOffset: byteLength, byteLength: chunk.byteLength };
    byteLength += chunk.byteLength;
    return view;
  });
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength), offset);
    offset += chunk.byteLength;
  }
  const document = {
    asset: { version: "2.0" },
    ...(withInstanceColors ? { extensionsUsed: ["EXT_mesh_gpu_instancing"] } : {}),
    buffers: [{ uri: `data:application/octet-stream;base64,${Buffer.from(bytes).toString("base64")}`, byteLength }],
    bufferViews,
    accessors: [
      { bufferView: 0, componentType: 5126, type: "VEC3", count: 3, min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5121, type: "VEC4", count: 3 },
      { bufferView: 2, componentType: 5126, type: "VEC4", count: 3 },
      { bufferView: 3, componentType: 5126, type: "SCALAR", count: 2, min: [0], max: [1] },
      { bufferView: 4, componentType: 5126, type: "VEC3", count: 2 },
      { bufferView: 5, componentType: 5126, type: "VEC3", count: 2 },
      ...(withInstanceColors ? [{ bufferView: 6, componentType: 5121, normalized: true, type: "VEC4", count: 2 }] : [])
    ],
    meshes: [{
      name: "shared-geometry",
      primitives: Array.from({ length: primitiveCount }, () => ({ attributes: { POSITION: 0, JOINTS_0: 1, WEIGHTS_0: 2 } }))
    }],
    nodes: [
      { name: "Joint", translation: [1, 0, 0] },
      { name: "Joint", translation: [2, 0, 0] },
      { name: "Joint", translation: [10, 0, 0] },
      { name: "Joint", translation: [20, 0, 0] },
      { name: "FirstMesh", mesh: 0, skin: 0 },
      { name: "SecondMesh", mesh: 0, skin: 1 },
      {
        name: "UnskinnedMesh", mesh: 0,
        ...(withInstanceColors ? { extensions: { EXT_mesh_gpu_instancing: { attributes: { _COLOR_0: 6 } } } } : {})
      }
    ],
    skins: [{ name: "same-skin-name", joints: [0, 1] }, { name: "same-skin-name", joints: [2, 3] }],
    scenes: [{ nodes: [0, 1, 2, 3, 4, 5, 6] }],
    scene: 0,
    animations: [
      { name: "same-animation-name", samplers: [{ input: 3, output: 4 }], channels: [{ sampler: 0, target: { node: 0, path: "translation" } }] },
      { name: "same-animation-name", samplers: [{ input: 3, output: 5 }], channels: [{ sampler: 0, target: { node: 2, path: "translation" } }] }
    ]
  };
  const url = `data:model/gltf+json;base64,${Buffer.from(JSON.stringify(document)).toString("base64")}`;
  return new GLTFLoader().load({ url, type: "gltf" }, new LoadContext());
}

function renderablesFor(scene: Scene, authoredName: string) {
  const owner = scene.findByName(authoredName)[0]!;
  return scene.collectRenderables().filter(({ node }) => node === owner || node.parent === owner);
}

describe("loaded glTF per-node skin provenance", () => {
  it.each([1, 2])("retains node, asset and primitive identity for %s primitive(s), including clone and scene serialization", async (primitiveCount) => {
    const asset = await loadReusedMeshFixture(primitiveCount);
    const otherAsset = await loadReusedMeshFixture(primitiveCount);
    const original = asset.createScene();
    const clone = original.clone();
    const restored = deserializeScene(JSON.parse(JSON.stringify(serializeScene(original))) as SerializedScene);
    const other = otherAsset.createScene();
    expect(asset.gltfAssetId).toBeTypeOf("string");
    expect(otherAsset.gltfAssetId).not.toBe(asset.gltfAssetId);
    expect(other.root.userData.gltfAssetId).toBe(otherAsset.gltfAssetId);
    expect(asset.skinBindingForNode?.(4)).toEqual({ meshIndex: 0, skinIndex: 0 });
    expect(asset.skinBindingForNode?.(5)).toEqual({ meshIndex: 0, skinIndex: 1 });
    expect(asset.skinBindingForNode?.(6)).toBeUndefined();
    expect(asset.skinBindingForNode?.(-1)).toBeUndefined();

    for (const scene of [original, clone, restored]) {
      expect(scene.root.userData.gltfSceneContainer).toBe(true);
      expect(scene.root.userData.gltfAssetId).toBe(asset.gltfAssetId);
      for (const [name, nodeIndex, skinIndex] of [["FirstMesh", 4, 0], ["SecondMesh", 5, 1]] as const) {
        const bindings = renderablesFor(scene, name);
        expect(bindings).toHaveLength(primitiveCount);
        for (const [primitiveIndex, { node, renderable }] of bindings.entries()) {
          expect(node.userData.gltfSkinBinding).toEqual({
            assetId: asset.gltfAssetId,
            nodeIndex,
            meshIndex: 0,
            primitiveIndex,
            skinIndex
          });
          expect(renderable.skinning?.jointCount).toBe(2);
        }
      }
      expect(renderablesFor(scene, "UnskinnedMesh").every(({ node, renderable }) =>
        node.userData.gltfSkinBinding === undefined && renderable.skinning === undefined
      )).toBe(true);
    }
    // The original public mesh-level field remains available to older callers;
    // it is not a reliable node binding when a mesh has more than one skin.
    expect(asset.meshes[0]?.skinIndex).toBe(0);
  });

  it.each([1, 2])("updates each reused mesh from its own same-sized skin for %s primitive(s)", async (primitiveCount) => {
    const asset = await loadReusedMeshFixture(primitiveCount);
    const scene = asset.createScene();
    const runtime = createGLTFSceneAnimationRuntime({
      scene, clips: asset.animations, asset, nodeIndexForTrack: asset.nodeIndexForTrack
    });
    try {
      expect(runtime.applyPose({ bones: {} })).toMatchObject({
        skinningPalettesUpdated: primitiveCount * 2,
        missingTargets: []
      });
      const translations = (name: string) => renderablesFor(scene, name).map(({ renderable }) => [
        renderable.skinning!.matrices[12],
        renderable.skinning!.matrices[28]
      ]);
      expect(translations("FirstMesh")).toEqual(Array.from({ length: primitiveCount }, () => [1, 2]));
      expect(translations("SecondMesh")).toEqual(Array.from({ length: primitiveCount }, () => [10, 20]));
      expect(runtime.applyClip(asset.animations[1]!, 1).missingTargets).toEqual([]);
      expect(translations("FirstMesh")).toEqual(Array.from({ length: primitiveCount }, () => [1, 2]));
      expect(translations("SecondMesh")).toEqual(Array.from({ length: primitiveCount }, () => [30, 20]));
    } finally {
      runtime.dispose();
    }
  });

  it("keeps independent instance-color loading and scene copies alongside skin provenance", async () => {
    const asset = await loadReusedMeshFixture(1, true);
    const first = asset.createScene();
    const second = asset.createScene();
    const firstRenderable = renderablesFor(first, "UnskinnedMesh")[0]!.renderable;
    const secondRenderable = renderablesFor(second, "UnskinnedMesh")[0]!.renderable;
    expect(firstRenderable.skinning).toBeUndefined();
    expect(firstRenderable.instanceTransforms).toHaveLength(32);
    expect(Array.from(firstRenderable.instanceColors!)).toEqual([1, 0, 0, 1, 0, 0, 1, expect.closeTo(128 / 255)]);
    expect(firstRenderable.instanceColors).not.toBe(secondRenderable.instanceColors);
    firstRenderable.instanceColors![0] = 0.25;
    expect(secondRenderable.instanceColors![0]).toBe(1);
  });

  it("isolates two instances of the same asset by their actor containers", async () => {
    const asset = await loadReusedMeshFixture();
    const scene = new Scene();
    const first = asset.createScene();
    const second = asset.createScene();
    scene.root.addChild(first.root).addChild(second.root);
    const runtime = createGLTFSceneAnimationRuntime({
      scene, actorRoot: second.root, clips: asset.animations, asset
    });
    try {
      expect(first.root).not.toBe(second.root);
      expect(first.root.userData.gltfAssetId).toBe(second.root.userData.gltfAssetId);
      expect(runtime.applyClip(asset.animations[1]!, 1)).toMatchObject({ skinningPalettesUpdated: 2, missingTargets: [] });
      expect(renderablesFor(first, "SecondMesh")[0]!.renderable.skinning!.matrices[12]).toBe(10);
      expect(renderablesFor(second, "FirstMesh")[0]!.renderable.skinning!.matrices[12]).toBe(1);
      expect(renderablesFor(second, "SecondMesh")[0]!.renderable.skinning!.matrices[12]).toBe(30);
    } finally {
      runtime.dispose();
    }
  });

  it("does not bind a scene to a different loaded asset with the same names and skin sizes", async () => {
    const asset = await loadReusedMeshFixture();
    const foreignAsset = await loadReusedMeshFixture();
    const scene = asset.createScene();
    const second = renderablesFor(scene, "SecondMesh")[0]!.renderable;
    const before = [...second.skinning!.matrices];
    const foreignTrack = foreignAsset.animations[1]!.tracks[0]!;
    const joint = scene.root.children.find((node) => node.userData.gltfNodeIndex === 2)!;
    const runtime = createGLTFSceneAnimationRuntime({
      scene, clips: foreignAsset.animations, asset: foreignAsset,
      nodeIndexForTrack: foreignAsset.nodeIndexForTrack
    });
    try {
      const result = runtime.applyPose({ bones: {} });
      expect(result.skinningPalettesUpdated).toBe(0);
      expect(result.missingTargets.length).toBeGreaterThan(0);
      expect([...second.skinning!.matrices]).toEqual(before);
      const applied = runtime.applyClip(foreignAsset.animations[1]!, 1);
      expect(applied.transformTracksApplied).toBe(0);
      expect(applied.missingTargets).toContain(foreignTrack.target);
      expect(joint.transform.position[0]).toBe(10);
    } finally {
      runtime.dispose();
    }
  });

  it("does not replace the canonical source skin with edited scene metadata", async () => {
    const asset = await loadReusedMeshFixture();
    const scene = asset.createScene();
    const second = renderablesFor(scene, "SecondMesh")[0]!;
    second.node.userData.gltfSkinBinding = {
      ...(second.node.userData.gltfSkinBinding as object),
      skinIndex: 0
    };
    const before = [...second.renderable.skinning!.matrices];
    expect(asset.skinBindingForNode?.(5)).toEqual({ meshIndex: 0, skinIndex: 1 });
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [], asset });
    try {
      const result = runtime.applyPose({ bones: {} });
      expect(result.skinningPalettesUpdated).toBe(1);
      expect(result.missingTargets).toContain("SecondMesh.skinning");
      expect([...second.renderable.skinning!.matrices]).toEqual(before);
    } finally {
      runtime.dispose();
    }
  });
});
