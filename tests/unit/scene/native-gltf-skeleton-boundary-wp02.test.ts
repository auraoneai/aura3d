import { describe, expect, it } from "vitest";
import { AnimationClip, AnimationLayer, AnimationTrack } from "@aura3d/animation";
import { compileClip } from "@aura3d/animation/lanes";
import { Renderable, Scene, deserializeScene, serializeScene, type Mat4, type SerializedScene } from "@aura3d/scene";
import { GLTFLoader, LoadContext, createGLTFSceneAnimationMixer, createGLTFSceneAnimationRuntime, type GLTFAsset } from "../../../packages/assets/src";

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const translation = (x: number) => identity.map((value, index) => index === 12 ? x : value);

function skinAsset(joints: number[], jointNames: string[], inverseBindMatrices = joints.map(() => identity)) {
  return {
    meshes: [{ name: "rigged", skinIndex: 0 }],
    skins: [{ name: "skin", joints, jointNames, inverseBindMatrices }]
  } as unknown as Pick<GLTFAsset, "meshes" | "skins">;
}

function addSkinnedMesh(scene: Scene, name = "mesh", jointCount = 2) {
  const mesh = scene.createNode(name);
  mesh.renderable = new Renderable({
    geometry: "rigged", material: "material",
    skinning: { jointCount, matrices: new Float32Array(jointCount * 16) }
  });
  return mesh;
}

describe("scene and glTF skeleton binding boundary", () => {
  it.each(["original", "restored"] as const)("binds duplicate-named joints by imported node index in the %s scene", (mode) => {
    const scene = new Scene();
    const first = scene.createNode("joint");
    const second = scene.createNode("joint");
    first.userData.gltfNodeIndex = 4;
    second.userData.gltfNodeIndex = 9;
    first.transform.setPosition(1, 0, 0);
    second.transform.setPosition(5, 0, 0);
    const mesh = scene.createNode("mesh");
    mesh.renderable = new Renderable({
      geometry: "rigged", material: "material",
      skinning: { jointCount: 2, matrices: new Float32Array(32) }
    });
    scene.root.addChild(first).addChild(second).addChild(mesh);
    const document = JSON.parse(JSON.stringify(serializeScene(scene))) as SerializedScene;
    const target = mode === "original" ? scene : deserializeScene(document);
    expect(target.getNodeById(first.id)?.userData.gltfNodeIndex).toBe(4);
    expect(target.getNodeById(second.id)?.userData.gltfNodeIndex).toBe(9);
    const asset = {
      meshes: [{ name: "rigged", skinIndex: 0 }],
      skins: [{
        name: "skin", joints: [4, 9], jointNames: ["joint", "joint"],
        inverseBindMatrices: [identity, identity]
      }]
    } as unknown as Pick<GLTFAsset, "meshes" | "skins">;
    const runtime = createGLTFSceneAnimationRuntime({ scene: target, clips: [], asset });
    try {
      runtime.applyPose({ bones: {} });
      const palette = target.getNodeById(mesh.id)!.renderable!.skinning!.matrices;
      expect(palette[12]).toBeCloseTo(1);
      expect(palette[28]).toBeCloseTo(5);
    } finally {
      runtime.dispose();
    }
  });

  it.each(["original", "restored"] as const)("keeps matching node indices within each imported scene container in the %s scene", (mode) => {
    const scene = new Scene();
    const unrelated = scene.createNode("joint");
    unrelated.userData.gltfNodeIndex = 9;
    unrelated.transform.setPosition(-100, 0, 0);
    scene.root.addChild(unrelated);
    const meshes = [0, 1].map((actor) => {
      const container = scene.createNode(`actor-${actor}`);
      container.userData.gltfSceneContainer = true;
      container.transform.setPosition(actor === 0 ? 10 : -8, 0, 0);
      const first = scene.createNode("joint");
      first.userData.gltfNodeIndex = 4;
      first.transform.setPosition(actor === 0 ? 1 : 7, 0, 0);
      const second = scene.createNode("joint");
      second.userData.gltfNodeIndex = 9;
      second.transform.setPosition(actor === 0 ? 5 : 12, 0, 0);
      const owner = scene.createNode("mesh-owner");
      owner.userData.gltfNodeIndex = 20;
      const mesh = addSkinnedMesh(scene);
      mesh.transform.setPosition(actor === 0 ? 2 : 0, 0, 0);
      owner.addChild(mesh);
      container.addChild(first).addChild(second).addChild(owner);
      scene.root.addChild(container);
      return mesh;
    });
    const document = JSON.parse(JSON.stringify(serializeScene(scene))) as SerializedScene;
    const target = mode === "original" ? scene : deserializeScene(document);
    const asset = skinAsset([9, 4], ["joint", "joint"], [translation(-2), translation(1)]);
    const runtime = createGLTFSceneAnimationRuntime({ scene: target, clips: [], asset });
    try {
      const result = runtime.applyPose({ bones: {} });
      expect(result.skinningPalettesUpdated).toBe(2);
      expect(result.missingTargets).toEqual([]);
      const first = target.getNodeById(meshes[0]!.id)!.renderable!.skinning!.matrices;
      const second = target.getNodeById(meshes[1]!.id)!.renderable!.skinning!.matrices;
      expect([first[12], first[28]]).toEqual([1, 0]);
      expect([second[12], second[28]]).toEqual([10, 8]);
      expect(first).not.toBe(second);
    } finally {
      runtime.dispose();
    }
  });

  it("does not use a same-named node when indexed identity is missing and resolves it after reindexing", () => {
    const scene = new Scene();
    const first = scene.createNode("joint");
    first.userData.gltfNodeIndex = 4;
    first.transform.setPosition(1, 0, 0);
    const second = scene.createNode("joint");
    second.transform.setPosition(5, 0, 0);
    const mesh = addSkinnedMesh(scene);
    scene.root.addChild(first).addChild(second).addChild(mesh);
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [], asset: skinAsset([4, 9], ["joint", "joint"]) });
    try {
      const initial = mesh.renderable!.skinning!.matrices;
      const missing = runtime.applyPose({ bones: {} });
      expect(missing.skinningPalettesUpdated).toBe(0);
      expect(missing.missingTargets).toEqual(["skin.joint"]);
      expect(mesh.renderable!.skinning!.matrices).toBe(initial);
      expect(Array.from(initial)).toEqual(Array(32).fill(0));
      second.userData.gltfNodeIndex = 9;
      runtime.reindexScene();
      const repaired = runtime.applyPose({ bones: {} });
      expect(repaired.skinningPalettesUpdated).toBe(1);
      expect(repaired.missingTargets).toEqual([]);
      expect([mesh.renderable!.skinning!.matrices[12], mesh.renderable!.skinning!.matrices[28]]).toEqual([1, 5]);
    } finally {
      runtime.dispose();
    }
  });

  it("reports duplicate node indices as unresolved rather than selecting one", () => {
    const scene = new Scene();
    const first = scene.createNode("joint");
    const second = scene.createNode("other");
    first.userData.gltfNodeIndex = 4;
    second.userData.gltfNodeIndex = 4;
    first.transform.setPosition(1, 0, 0);
    second.transform.setPosition(5, 0, 0);
    const mesh = addSkinnedMesh(scene, "mesh", 1);
    scene.root.addChild(first).addChild(second).addChild(mesh);
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [], asset: skinAsset([4], ["joint"]) });
    try {
      const result = runtime.applyPose({ bones: {} });
      expect(result.skinningPalettesUpdated).toBe(0);
      expect(result.missingTargets).toEqual(["skin.joint"]);
    } finally {
      runtime.dispose();
    }
  });

  it("retains unique legacy name bindings without choosing between duplicate legacy names", () => {
    const scene = new Scene();
    const first = scene.createNode("first");
    const second = scene.createNode("second");
    first.transform.setPosition(1, 0, 0);
    second.transform.setPosition(5, 0, 0);
    const mesh = addSkinnedMesh(scene);
    scene.root.addChild(first).addChild(second).addChild(mesh);
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [], asset: skinAsset([4, 9], ["first", "second"]) });
    try {
      expect(runtime.applyPose({ bones: {} }).missingTargets).toEqual([]);
      expect([mesh.renderable!.skinning!.matrices[12], mesh.renderable!.skinning!.matrices[28]]).toEqual([1, 5]);
      const duplicate = scene.createNode("second");
      duplicate.transform.setPosition(10, 0, 0);
      scene.root.addChild(duplicate);
      runtime.reindexScene();
      const result = runtime.applyPose({ bones: {} });
      expect(result.skinningPalettesUpdated).toBe(0);
      expect(result.missingTargets).toEqual(["skin.second"]);
    } finally {
      runtime.dispose();
    }
  });

  it("does not partially rewrite an existing palette when an inverse bind matrix is missing", () => {
    const scene = new Scene();
    const first = scene.createNode("first");
    const second = scene.createNode("second");
    first.userData.gltfNodeIndex = 4;
    second.userData.gltfNodeIndex = 9;
    first.transform.setPosition(1, 0, 0);
    second.transform.setPosition(5, 0, 0);
    const mesh = addSkinnedMesh(scene);
    scene.root.addChild(first).addChild(second).addChild(mesh);
    const inverseBindMatrices = [identity, identity];
    const runtime = createGLTFSceneAnimationRuntime({
      scene, clips: [], asset: skinAsset([4, 9], ["first", "second"], inverseBindMatrices)
    });
    try {
      expect(runtime.applyPose({ bones: {} }).skinningPalettesUpdated).toBe(1);
      const palette = mesh.renderable!.skinning!.matrices;
      const before = Array.from(palette);
      first.transform.setPosition(8, 0, 0);
      inverseBindMatrices.pop();
      const result = runtime.applyPose({ bones: {} });
      expect(result.skinningPalettesUpdated).toBe(0);
      expect(result.missingTargets).toEqual(["skin.second"]);
      expect(mesh.renderable!.skinning!.matrices).toBe(palette);
      expect(Array.from(palette)).toEqual(before);
    } finally {
      runtime.dispose();
    }
  });

  it("reports ambiguous mesh provenance instead of choosing a duplicate geometry name", () => {
    const scene = new Scene();
    const joint = scene.createNode("joint");
    joint.userData.gltfNodeIndex = 4;
    const mesh = addSkinnedMesh(scene, "mesh", 1);
    scene.root.addChild(joint).addChild(mesh);
    const original = skinAsset([4], ["joint"]);
    const asset = { ...original, meshes: [...original.meshes, ...original.meshes] };
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [], asset });
    try {
      const result = runtime.applyPose({ bones: {} });
      expect(result.skinningPalettesUpdated).toBe(0);
      expect(result.missingTargets).toContain("mesh.skinning");
      expect(Array.from(mesh.renderable!.skinning!.matrices)).toEqual(Array(16).fill(0));
    } finally {
      runtime.dispose();
    }
  });

  it("rejects an asset skin whose joint count disagrees with the node's existing skin", () => {
    const scene = new Scene();
    const joint = scene.createNode("joint");
    joint.userData.gltfNodeIndex = 4;
    const mesh = addSkinnedMesh(scene);
    scene.root.addChild(joint).addChild(mesh);
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [], asset: skinAsset([4], ["joint"]) });
    try {
      const result = runtime.applyPose({ bones: {} });
      expect(result.skinningPalettesUpdated).toBe(0);
      expect(result.missingTargets).toContain("mesh.skinning");
      expect(Array.from(mesh.renderable!.skinning!.matrices)).toEqual(Array(32).fill(0));
    } finally {
      runtime.dispose();
    }
  });

  it("binds and restores a loaded skinned glTF with duplicate authored joint names", async () => {
    const chunks = [
      new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      new Uint8Array([0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0]),
      new Float32Array([0.25, 0.75, 0, 0, 0.25, 0.75, 0, 0, 0.25, 0.75, 0, 0]),
      new Float32Array([0, 1]),
      new Float32Array([4, 0, 0, 8, 0, 0]),
      new Float32Array([...identity, ...identity])
    ];
    let byteOffset = 0;
    const bufferViews = chunks.map((chunk) => {
      const view = { buffer: 0, byteOffset, byteLength: chunk.byteLength };
      byteOffset += chunk.byteLength;
      return view;
    });
    const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength)));
    const document = {
      asset: { version: "2.0" },
      buffers: [{ uri: `data:application/octet-stream;base64,${bytes.toString("base64")}`, byteLength: bytes.byteLength }],
      bufferViews,
      accessors: [
        { bufferView: 0, componentType: 5126, type: "VEC3", count: 3, min: [0, 0, 0], max: [1, 1, 0] },
        { bufferView: 1, componentType: 5121, type: "VEC4", count: 3 },
        { bufferView: 2, componentType: 5126, type: "VEC4", count: 3 },
        { bufferView: 3, componentType: 5126, type: "SCALAR", count: 2, min: [0], max: [1] },
        { bufferView: 4, componentType: 5126, type: "VEC3", count: 2 },
        { bufferView: 5, componentType: 5126, type: "MAT4", count: 2 }
      ],
      meshes: [{ name: "rigged", primitives: [{ attributes: { POSITION: 0, JOINTS_0: 1, WEIGHTS_0: 2 } }] }],
      nodes: [
        { name: "joint", translation: [1, 0, 0], children: [1] },
        { name: "joint", translation: [4, 0, 0] },
        { name: "mesh", mesh: 0, skin: 0 }
      ],
      skins: [{ name: "skin", joints: [1, 0], inverseBindMatrices: 5 }],
      scenes: [{ nodes: [0, 2] }],
      scene: 0,
      animations: [{
        name: "move",
        samplers: [{ input: 3, output: 4 }],
        channels: [{ sampler: 0, target: { node: 1, path: "translation" } }]
      }]
    };
    const url = `data:model/gltf+json;base64,${Buffer.from(JSON.stringify(document)).toString("base64")}`;
    const asset = await new GLTFLoader().load({ url, type: "gltf" }, new LoadContext());
    const scene = asset.createScene();
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: asset.animations, asset });
    try {
      expect(asset.skins[0]!.joints).toEqual([1, 0]);
      expect(runtime.applyClipByName("move", 0.5).missingTargets).toEqual([]);
      const palette = scene.collectRenderables()[0]!.renderable.skinning!.matrices;
      expect([palette[12], palette[28]]).toEqual([7, 1]);
      const restored = deserializeScene(JSON.parse(JSON.stringify(serializeScene(scene))) as SerializedScene);
      const restoredRuntime = createGLTFSceneAnimationRuntime({ scene: restored, clips: asset.animations, asset });
      try {
        expect(restoredRuntime.applyClipByName("move", 0.75).missingTargets).toEqual([]);
        const restoredPalette = restored.collectRenderables()[0]!.renderable.skinning!.matrices;
        expect([restoredPalette[12], restoredPalette[28]]).toEqual([8, 1]);
        expect([palette[12], palette[28]]).toEqual([7, 1]);
      } finally {
        restoredRuntime.dispose();
      }
      scene.traverse((node) => {
        if (node.userData.gltfNodeIndex === 0 || node.userData.gltfNodeIndex === 1) node.name = "joint";
      });
      runtime.reindexScene();
      expect(runtime.applyPose({ bones: {} }).missingTargets).toEqual([]);
      const renamedPalette = scene.collectRenderables()[0]!.renderable.skinning!.matrices;
      expect([renamedPalette[12], renamedPalette[28]]).toEqual([7, 1]);
      const renamedRestored = deserializeScene(JSON.parse(JSON.stringify(serializeScene(scene))) as SerializedScene);
      const renamedRuntime = createGLTFSceneAnimationRuntime({ scene: renamedRestored, clips: [], asset });
      try {
        expect(renamedRuntime.applyPose({ bones: {} }).missingTargets).toEqual([]);
        const renamedRestoredPalette = renamedRestored.collectRenderables()[0]!.renderable.skinning!.matrices;
        expect([renamedRestoredPalette[12], renamedRestoredPalette[28]]).toEqual([7, 1]);
      } finally {
        renamedRuntime.dispose();
      }
    } finally {
      runtime.dispose();
    }
  });

  it.each(["clip", "blend", "pose-mixer", "action-mixer"] as const)("refreshes indexed palettes through %s playback", (mode) => {
    const scene = new Scene();
    const first = scene.createNode("first");
    const second = scene.createNode("second");
    first.userData.gltfNodeIndex = 4;
    second.userData.gltfNodeIndex = 9;
    first.transform.setPosition(1, 0, 0);
    second.transform.setPosition(5, 0, 0);
    const mesh = addSkinnedMesh(scene);
    scene.root.addChild(first).addChild(second).addChild(mesh);
    const asset = skinAsset([4, 9], ["first", "second"]);
    const clip = new AnimationClip({
      name: "move",
      duration: 1,
      tracks: [new AnimationTrack({
        target: "second.translation", valueType: "vector3",
        keyframes: [{ time: 0, value: [5, 0, 0] }, { time: 1, value: [9, 0, 0] }]
      })]
    });
    const binding = mode === "action-mixer" ? createGLTFSceneAnimationMixer({ scene, clips: [clip], asset }) : undefined;
    const runtime = binding?.runtime ?? createGLTFSceneAnimationRuntime({ scene, clips: [clip], asset });
    try {
      if (mode === "pose-mixer") runtime.mixer().play("move");
      const result = mode === "clip" ? runtime.applyClip(clip, 0.5)
        : mode === "blend" ? runtime.applyClips([{ clipName: "move", time: 0.5 }])
          : mode === "pose-mixer" ? runtime.applyPoseMixer(0.5)
            : binding!.update(0.5).applyResult;
      expect(result.missingTargets).toEqual([]);
      expect(result.skinningPalettesUpdated).toBe(1);
      expect(mesh.renderable!.skinning!.matrices[12]).toBeCloseTo(1);
      expect(mesh.renderable!.skinning!.matrices[28]).toBeCloseTo(7);
      const document = JSON.parse(JSON.stringify(serializeScene(scene))) as SerializedScene;
      const restored = deserializeScene(document);
      expect(restored.getNodeById(mesh.id)!.renderable!.skinning!.matrices[28]).toBeCloseTo(7);
      const restoredRuntime = createGLTFSceneAnimationRuntime({ scene: restored, clips: [clip], asset });
      try {
        expect(restoredRuntime.applyClip(clip, 0.75).missingTargets).toEqual([]);
        expect(restored.getNodeById(mesh.id)!.renderable!.skinning!.matrices[28]).toBeCloseTo(8);
        expect(mesh.renderable!.skinning!.matrices[28]).toBeCloseTo(7);
      } finally {
        restoredRuntime.dispose();
      }
    } finally {
      if (binding) binding.dispose();
      else runtime.dispose();
    }
  });

  it.each((["clip", "blend", "pose-mixer", "action-mixer"] as const).flatMap(
    (mode) => (["original", "restored"] as const).map((state) => [mode, state] as const)
  ))("binds a renamed indexed joint only in the selected actor through %s in the %s scene", (mode, state) => {
    const scene = new Scene();
    const actors = [0, 1].map((actor) => {
      const container = scene.createNode(`actor-${actor}`);
      container.userData.gltfSceneContainer = true;
      const first = scene.createNode("joint");
      const second = scene.createNode("joint");
      first.userData.gltfNodeIndex = 4;
      second.userData.gltfNodeIndex = 9;
      first.transform.setPosition(1 + actor * 10, 0, 0);
      second.transform.setPosition(5 + actor * 10, 0, 0);
      const mesh = addSkinnedMesh(scene);
      container.addChild(first).addChild(second).addChild(mesh);
      scene.root.addChild(container);
      return { container, first, second, mesh };
    });
    const track = new AnimationTrack({
      target: "source-second.translation", valueType: "vector3",
      keyframes: [{ time: 0, value: [5, 0, 0] }, { time: 1, value: [9, 0, 0] }]
    });
    const clip = new AnimationClip({ name: "move", duration: 1, tracks: [track] });
    const asset = { ...skinAsset([4, 9], ["source-first", "source-second"]), animations: [clip] };
    const target = state === "original" ? scene : deserializeScene(JSON.parse(JSON.stringify(serializeScene(scene))) as SerializedScene);
    const targetActors = actors.map((actor) => ({
      container: target.getNodeById(actor.container.id)!,
      first: target.getNodeById(actor.first.id)!,
      second: target.getNodeById(actor.second.id)!,
      mesh: target.getNodeById(actor.mesh.id)!
    }));
    const options = { scene: target, clips: [clip], asset, actorRoot: targetActors[1]!.container };
    const binding = mode === "action-mixer" ? createGLTFSceneAnimationMixer(options) : undefined;
    const runtime = binding?.runtime ?? createGLTFSceneAnimationRuntime(options);
    try {
      if (mode === "pose-mixer") runtime.mixer().play("move");
      const result = mode === "clip" ? runtime.applyClip(clip, 0.5)
        : mode === "blend" ? runtime.applyClips([{ clipName: "move", time: 0.5, mask: { include: ["source-second"] } }])
          : mode === "pose-mixer" ? runtime.applyPoseMixer(0.5)
            : binding!.update(0.5).applyResult;
      expect(result.missingTargets).toEqual([]);
      expect(targetActors[0]!.first.transform.position[0]).toBe(1);
      expect(targetActors[0]!.second.transform.position[0]).toBe(5);
      expect(targetActors[1]!.first.transform.position[0]).toBe(11);
      expect(targetActors[1]!.second.transform.position[0]).toBeCloseTo(7);
      expect(targetActors[1]!.mesh.renderable!.skinning!.matrices[28]).toBeCloseTo(7);
    } finally {
      if (binding) binding.dispose();
      else runtime.dispose();
    }
  });

  it.each(["clip", "blend", "pose-mixer", "action-mixer"] as const)("rejects ambiguous actor and legacy name binding through %s", (mode) => {
    const scene = new Scene();
    const nodes = [1, 5].map((x, actor) => {
      const container = scene.createNode(`actor-${actor}`);
      container.userData.gltfSceneContainer = true;
      const node = scene.createNode("joint");
      node.userData.gltfNodeIndex = 4;
      node.transform.setPosition(x, 0, 0);
      container.addChild(node);
      scene.root.addChild(container);
      return node;
    });
    const track = new AnimationTrack({
      target: "joint.translation", valueType: "vector3",
      keyframes: [{ time: 0, value: [0, 0, 0] }, { time: 1, value: [8, 0, 0] }]
    });
    const clip = new AnimationClip({ name: "move", duration: 1, tracks: [track] });
    const asset = { ...skinAsset([4], ["joint"]), animations: [clip] };
    const binding = mode === "action-mixer" ? createGLTFSceneAnimationMixer({ scene, clips: [clip], asset }) : undefined;
    const runtime = binding?.runtime ?? createGLTFSceneAnimationRuntime({ scene, clips: [clip], asset });
    try {
      if (mode === "pose-mixer") runtime.mixer().play("move");
      const result = mode === "clip" ? runtime.applyClip(clip, 0.5)
        : mode === "blend" ? runtime.applyClips([{ clipName: "move", time: 0.5 }])
          : mode === "pose-mixer" ? runtime.applyPoseMixer(0.5)
            : binding!.update(0.5).applyResult;
      expect(result.missingTargets).toContain("joint.translation");
      expect(nodes.map((node) => node.transform.position[0])).toEqual([1, 5]);
    } finally {
      if (binding) binding.dispose();
      else runtime.dispose();
    }
  });

  it.each(["clip", "blend", "pose-mixer", "action-mixer"] as const)("rejects a duplicate source index without falling back to a unique name through %s", (mode) => {
    const scene = new Scene();
    const first = scene.createNode("first");
    const second = scene.createNode("second");
    first.userData.gltfNodeIndex = 4;
    second.userData.gltfNodeIndex = 4;
    first.transform.setPosition(1, 0, 0);
    second.transform.setPosition(5, 0, 0);
    scene.root.addChild(first).addChild(second);
    const track = new AnimationTrack({
      target: "first.translation", valueType: "vector3",
      keyframes: [{ time: 0, value: [0, 0, 0] }, { time: 1, value: [8, 0, 0] }]
    });
    const clip = new AnimationClip({ name: "move", duration: 1, tracks: [track] });
    const options = { scene, clips: [clip], nodeIndexForTrack: () => 4 };
    const binding = mode === "action-mixer" ? createGLTFSceneAnimationMixer(options) : undefined;
    const runtime = binding?.runtime ?? createGLTFSceneAnimationRuntime(options);
    try {
      if (mode === "pose-mixer") runtime.mixer().play("move");
      const result = mode === "clip" ? runtime.applyClip(clip, 0.5)
        : mode === "blend" ? runtime.applyClips([{ clipName: "move", time: 0.5 }])
          : mode === "pose-mixer" ? runtime.applyPoseMixer(0.5)
            : binding!.update(0.5).applyResult;
      expect(result.missingTargets).toContain("first.translation");
      expect([first.transform.position[0], second.transform.position[0]]).toEqual([1, 5]);
    } finally {
      if (binding) binding.dispose();
      else runtime.dispose();
    }
  });

  it("uses unique legacy names only when indexed scene identity is absent", () => {
    const scene = new Scene();
    const joint = scene.createNode("joint");
    scene.root.addChild(joint);
    const track = new AnimationTrack({
      target: "joint.translation", valueType: "vector3",
      keyframes: [{ time: 0, value: [2, 0, 0] }, { time: 1, value: [4, 0, 0] }]
    });
    const clip = new AnimationClip({ name: "move", duration: 1, tracks: [track] });
    const asset = { ...skinAsset([4], ["joint"]), animations: [clip] };
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [clip], asset });
    try {
      expect(runtime.applyClip(clip, 0.5).missingTargets).toEqual([]);
      expect(joint.transform.position[0]).toBe(3);
      const other = scene.createNode("other");
      other.userData.gltfNodeIndex = 9;
      scene.root.addChild(other);
      runtime.reindexScene();
      expect(runtime.applyClip(clip, 1).missingTargets).toContain("joint.translation");
      expect(joint.transform.position[0]).toBe(3);
    } finally {
      runtime.dispose();
    }
  });

  it("uses per-track source indices for duplicate targets without combining the joints", () => {
    const scene = new Scene();
    const nodes = [4, 9].map((index) => {
      const node = scene.createNode("joint");
      node.userData.gltfNodeIndex = index;
      scene.root.addChild(node);
      return node;
    });
    const first = new AnimationTrack({ target: "joint.translation", valueType: "vector3", keyframes: [{ time: 0, value: [2, 0, 0] }] });
    const second = new AnimationTrack({ target: "joint.translation", valueType: "vector3", keyframes: [{ time: 0, value: [8, 0, 0] }] });
    const clip = new AnimationClip({ name: "move", duration: 1, tracks: [first, second] });
    const runtime = createGLTFSceneAnimationRuntime({
      scene, clips: [clip], nodeIndexForTrack: (track) => track === first ? 4 : track === second ? 9 : undefined
    });
    try {
      expect(runtime.applyClip(clip, 0).missingTargets).toEqual([]);
      expect(nodes.map((node) => node.transform.position[0])).toEqual([2, 8]);
      nodes[0]!.transform.setPosition(0, 0, 0);
      nodes[1]!.transform.setPosition(0, 0, 0);
      expect(runtime.applyClips([{ clipName: "move", time: 0 }]).missingTargets).toEqual([]);
      expect(nodes.map((node) => node.transform.position[0])).toEqual([2, 8]);
      nodes[0]!.transform.setPosition(0, 0, 0);
      nodes[1]!.transform.setPosition(0, 0, 0);
      const action = runtime.mixer().play("move");
      expect(action.clip.tracks.map((track) => track.target)).toEqual(["joint.translation", "joint.translation"]);
      expect(runtime.applyPoseMixer(0.5).missingTargets).toEqual([]);
      expect(nodes.map((node) => node.transform.position[0])).toEqual([2, 8]);
    } finally {
      runtime.dispose();
    }
    nodes[0]!.transform.setPosition(0, 0, 0);
    nodes[1]!.transform.setPosition(0, 0, 0);
    const binding = createGLTFSceneAnimationMixer({
      scene, clips: [clip], nodeIndexForTrack: (track) => track === first ? 4 : track === second ? 9 : undefined
    });
    try {
      expect(binding.update(0.5).applyResult.missingTargets).toContain("joint.translation");
      expect(nodes.map((node) => node.transform.position[0])).toEqual([0, 0]);
    } finally {
      binding.dispose();
    }
  });

  it.each(["clip", "blend", "pose-mixer", "action-mixer"] as const)("keeps position and quaternion aliases indexed through %s", (mode) => {
    const scene = new Scene();
    const nodes = [4, 9].map((index) => {
      const node = scene.createNode("joint");
      node.userData.gltfNodeIndex = index;
      scene.root.addChild(node);
      return node;
    });
    const position = new AnimationTrack({
      target: "joint.position", valueType: "vector3",
      keyframes: [{ time: 0, value: [0, 0, 0] }, { time: 1, value: [8, 0, 0] }]
    });
    const rotation = new AnimationTrack({
      target: "joint.quaternion", valueType: "quaternion",
      keyframes: [{ time: 0, value: [0, 0, 0, 1] }, { time: 1, value: [0, 0, 1, 0] }]
    });
    const clip = new AnimationClip({ name: "move", duration: 1, tracks: [position, rotation] });
    const options = { scene, clips: [clip], nodeIndexForTrack: () => 9 };
    const binding = mode === "action-mixer" ? createGLTFSceneAnimationMixer(options) : undefined;
    const runtime = binding?.runtime ?? createGLTFSceneAnimationRuntime(options);
    try {
      if (mode === "pose-mixer") runtime.mixer().play("move");
      const result = mode === "clip" ? runtime.applyClip(clip, 0.5)
        : mode === "blend" ? runtime.applyClips([{ clipName: "move", time: 0.5 }])
          : mode === "pose-mixer" ? runtime.applyPoseMixer(0.5)
            : binding!.update(0.5).applyResult;
      expect(result.missingTargets).toEqual([]);
      expect(nodes[0]!.transform.position[0]).toBe(0);
      expect(nodes[0]!.transform.rotation).toEqual([0, 0, 0, 1]);
      expect(nodes[1]!.transform.position[0]).toBeCloseTo(4);
      expect(nodes[1]!.transform.rotation[2]).toBeCloseTo(Math.SQRT1_2);
      expect(nodes[1]!.transform.rotation[3]).toBeCloseTo(Math.SQRT1_2);
    } finally {
      if (binding) binding.dispose();
      else runtime.dispose();
    }
  });

  it("keeps scoped identity when a clip is registered through the exposed pose mixer", () => {
    const scene = new Scene();
    const nodes = [4, 9].map((index) => {
      const node = scene.createNode("joint");
      node.userData.gltfNodeIndex = index;
      scene.root.addChild(node);
      return node;
    });
    const track = new AnimationTrack({
      target: "joint.translation", valueType: "vector3",
      keyframes: [{ time: 0, value: [0, 0, 0] }, { time: 1, value: [6, 0, 0] }]
    });
    const clip = new AnimationClip({ name: "added", duration: 1, tracks: [track] });
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [], nodeIndexForTrack: () => 9 });
    try {
      runtime.mixer().addClip("added", clip).play("added");
      expect(runtime.applyPoseMixer(0.5).missingTargets).toEqual([]);
      expect(nodes.map((node) => node.transform.position[0])).toEqual([0, 3]);
    } finally {
      runtime.dispose();
    }
  });

  it("does not conflate source identity when a compiled clip object is registered twice", () => {
    const scene = new Scene();
    const nodes = [4, 9].map((index) => {
      const node = scene.createNode("joint");
      node.userData.gltfNodeIndex = index;
      scene.root.addChild(node);
      return node;
    });
    const track = () => new AnimationTrack({
      target: "joint.translation", valueType: "vector3",
      keyframes: [{ time: 0, value: [0, 0, 0] }, { time: 1, value: [6, 0, 0] }]
    });
    const firstTrack = track();
    const secondTrack = track();
    const first = new AnimationClip({ name: "first", duration: 1, tracks: [firstTrack] });
    const second = new AnimationClip({ name: "second", duration: 1, tracks: [secondTrack] });
    const runtime = createGLTFSceneAnimationRuntime({
      scene, clips: [], nodeIndexForTrack: (candidate) => candidate === firstTrack ? 4 : candidate === secondTrack ? 9 : undefined
    });
    try {
      const compiled = compileClip(first);
      const mixer = runtime.mixer();
      mixer.addCompiledClip("first", compiled, first);
      mixer.addCompiledClip("second", compiled, second);
      const action = mixer.play("first");
      expect(runtime.applyPoseMixer(0.5, { restPoseReset: false }).missingTargets).toEqual([]);
      expect(nodes.map((node) => node.transform.position[0])).toEqual([3, 0]);
      action.stop();
      mixer.play("second");
      expect(runtime.applyPoseMixer(0.5, { restPoseReset: false }).missingTargets).toEqual([]);
      expect(nodes.map((node) => node.transform.position[0])).toEqual([3, 3]);
    } finally {
      runtime.dispose();
    }
  });

  it("keeps an unambiguous indexed node binding through a generic mixer layer", () => {
    const scene = new Scene();
    const nodes = [4, 9].map((index) => {
      const node = scene.createNode("joint");
      node.userData.gltfNodeIndex = index;
      scene.root.addChild(node);
      return node;
    });
    const track = new AnimationTrack({
      target: "joint.translation", valueType: "vector3",
      keyframes: [{ time: 0, value: [0, 0, 0] }, { time: 1, value: [6, 0, 0] }]
    });
    const clip = new AnimationClip({ name: "layered", duration: 1, tracks: [track] });
    const binding = createGLTFSceneAnimationMixer({ scene, clips: [clip], nodeIndexForTrack: () => 9 });
    try {
      const layer = new AnimationLayer("upper", { mask: ["joint"] });
      layer.add(binding.getAction("layered")!);
      binding.mixer.addLayer(layer);
      expect(binding.update(0.5).applyResult.missingTargets).toEqual([]);
      expect(nodes.map((node) => node.transform.position[0])).toEqual([0, 3]);
    } finally {
      binding.dispose();
    }
  });

  it("fails closed when one bone receives contradictory track-name mask decisions", () => {
    const scene = new Scene();
    const joint = scene.createNode("joint");
    joint.userData.gltfNodeIndex = 4;
    scene.root.addChild(joint);
    const clip = new AnimationClip({
      name: "move", duration: 1, tracks: [
        new AnimationTrack({ target: "arm.translation", valueType: "vector3", keyframes: [
          { time: 0, value: [0, 0, 0] }, { time: 1, value: [4, 0, 0] }
        ] }),
        new AnimationTrack({ target: "hand.rotation", valueType: "quaternion", keyframes: [
          { time: 0, value: [0, 0, 0, 1] }, { time: 1, value: [0, 0, 1, 0] }
        ] })
      ]
    });
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [clip], nodeIndexForTrack: () => 4 });
    try {
      const result = runtime.applyClips([{ clipName: "move", time: 0.5, mask: { include: ["arm"] } }]);
      expect(result.missingTargets).toContain("arm.translation");
      expect(joint.transform.position).toEqual([0, 0, 0]);
      expect(joint.transform.rotation).toEqual([0, 0, 0, 1]);
    } finally {
      runtime.dispose();
    }
  });

  it("solves duplicate joint names by skin indices only in the selected actor", () => {
    const scene = new Scene();
    const actors = [0, 1].map((actor) => {
      const container = scene.createNode(`actor-${actor}`);
      container.userData.gltfSceneContainer = true;
      const joints = [4, 9, 12].map((index, slot) => {
        const node = scene.createNode("joint");
        node.userData.gltfNodeIndex = index;
        node.transform.setPosition(0, slot === 0 ? 0 : 1, 0);
        return node;
      });
      joints[0]!.addChild(joints[1]!);
      joints[1]!.addChild(joints[2]!);
      const mesh = addSkinnedMesh(scene, "mesh", 3);
      container.addChild(joints[0]!).addChild(mesh);
      scene.root.addChild(container);
      return { container, joints };
    });
    const asset = skinAsset([4, 9, 12], ["joint", "joint", "joint"]);
    const ambiguous = createGLTFSceneAnimationRuntime({ scene, clips: [], asset });
    expect(ambiguous.solveImportedSkeletonTwoBoneIK({ target: [0.8, 1.6, 0] }).applied).toBe(false);
    ambiguous.dispose();
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [], asset, actorRoot: actors[1]!.container });
    try {
      const result = runtime.solveImportedSkeletonTwoBoneIK({ target: [0.8, 1.6, 0], pole: [0, 0, 1] });
      expect(result.applied).toBe(true);
      expect(result.missingTargets).toEqual([]);
      expect(actors[0]!.joints[2]!.transform.worldMatrix[12]).toBeCloseTo(0);
      expect(actors[1]!.joints[2]!.transform.worldMatrix[12]).toBeCloseTo(0.8, 4);
      expect(runtime.solveImportedSkeletonTwoBoneIK({ jointNames: ["joint", "joint", "joint"], target: [0, 2, 0] }).applied).toBe(false);
      const reversed = runtime.solveImportedSkeletonTwoBoneIK({ jointIndices: [9, 4, 12], target: [0, 2, 0] });
      expect(reversed.applied).toBe(false);
      expect(reversed.missingTargets).toContain("skin.invalid-chain");
      const controller = runtime.createTwoBoneIKController({ jointIndices: [4, 9, 12], target: [0, 2, 0], apply: false });
      expect(controller.solve().missingTargets).toEqual([]);
      expect(controller.snapshot().jointIndices).toEqual([4, 9, 12]);
      const duplicate = scene.createNode("other");
      duplicate.userData.gltfNodeIndex = 9;
      actors[1]!.container.addChild(duplicate);
      runtime.reindexScene();
      const unresolved = runtime.solveImportedSkeletonTwoBoneIK({ target: [0, 2, 0] });
      expect(unresolved.applied).toBe(false);
      expect(unresolved.missingTargets).toContain("skin.joint");
    } finally {
      runtime.dispose();
    }
  });

  it.each(["whole-scene", "selected-actor"] as const)("isolates palettes when two actors share one renderable instance in %s mode", (mode) => {
    const scene = new Scene();
    const shared = new Renderable({
      geometry: "rigged", material: "material", skinning: { jointCount: 1, matrices: new Float32Array(16) }
    });
    const actors = [1, 5].map((x, actor) => {
      const container = scene.createNode(`actor-${actor}`);
      container.userData.gltfSceneContainer = true;
      const joint = scene.createNode("joint");
      joint.userData.gltfNodeIndex = 4;
      joint.transform.setPosition(x, 0, 0);
      const mesh = scene.createNode("mesh");
      mesh.renderable = shared;
      container.addChild(joint).addChild(mesh);
      scene.root.addChild(container);
      return { container, mesh };
    });
    const runtime = createGLTFSceneAnimationRuntime({
      scene, clips: [], asset: skinAsset([4], ["joint"]),
      ...(mode === "selected-actor" ? { actorRoot: actors[1]!.container } : {})
    });
    try {
      expect(runtime.applyPose({ bones: {} }).skinningPalettesUpdated).toBe(mode === "whole-scene" ? 2 : 1);
      expect(actors[0]!.mesh.renderable).not.toBe(actors[1]!.mesh.renderable);
      expect(actors.map((actor) => actor.mesh.renderable!.skinning!.matrices[12])).toEqual(mode === "whole-scene" ? [1, 5] : [0, 5]);
    } finally {
      runtime.dispose();
    }
  });

  it.each(["concurrent", "prior-disposed"] as const)("isolates an animated renderable shared between separate scenes with %s ownership", (mode) => {
    const shared = new Renderable({
      geometry: "rigged", material: "material", skinning: { jointCount: 1, matrices: new Float32Array(16) }
    });
    const actors = [1, 5].map((x) => {
      const scene = new Scene();
      const joint = scene.createNode("joint");
      joint.userData.gltfNodeIndex = 4;
      joint.transform.setPosition(x, 0, 0);
      const mesh = scene.createNode("mesh");
      mesh.renderable = shared;
      scene.root.addChild(joint).addChild(mesh);
      return { scene, mesh };
    });
    const asset = skinAsset([4], ["joint"]);
    const first = createGLTFSceneAnimationRuntime({ scene: actors[0]!.scene, clips: [], asset });
    expect(first.applyPose({ bones: {} }).skinningPalettesUpdated).toBe(1);
    if (mode === "prior-disposed") first.dispose();
    const second = createGLTFSceneAnimationRuntime({ scene: actors[1]!.scene, clips: [], asset });
    try {
      expect(second.applyPose({ bones: {} }).skinningPalettesUpdated).toBe(1);
      expect(actors[0]!.mesh.renderable).not.toBe(actors[1]!.mesh.renderable);
      expect(actors.map(({ mesh }) => mesh.renderable!.skinning!.matrices[12])).toEqual([1, 5]);
    } finally {
      first.dispose();
      second.dispose();
    }
  });

  it("does not clone or mutate a shared renderable subclass with unknown private state", () => {
    class SpecializedRenderable extends Renderable {
      #value = 7;
      value(): number { return this.#value; }
    }
    const scene = new Scene();
    const shared = new SpecializedRenderable({
      geometry: "rigged", material: "material", skinning: { jointCount: 1, matrices: new Float32Array(16) }
    });
    const actors = [1, 5].map((x, index) => {
      const container = scene.createNode(`actor-${index}`);
      container.userData.gltfSceneContainer = true;
      const joint = scene.createNode("joint");
      joint.userData.gltfNodeIndex = 4;
      joint.transform.setPosition(x, 0, 0);
      const mesh = scene.createNode("mesh");
      mesh.renderable = shared;
      container.addChild(joint).addChild(mesh);
      scene.root.addChild(container);
      return mesh;
    });
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [], asset: skinAsset([4], ["joint"]) });
    try {
      const result = runtime.applyPose({ bones: {} });
      expect(result.skinningPalettesUpdated).toBe(0);
      expect(result.missingTargets).toEqual(["mesh.skinning", "mesh.skinning"]);
      expect(actors[0]!.renderable).toBe(shared);
      expect(actors[1]!.renderable).toBe(shared);
      expect(shared.value()).toBe(7);
      expect(Array.from(shared.skinning!.matrices)).toEqual(Array(16).fill(0));
    } finally {
      runtime.dispose();
    }
  });

  it.each(["clip", "blend", "pose-mixer", "action-mixer"] as const)("isolates shared morph renderables within the selected actor through %s", (mode) => {
    const scene = new Scene();
    const shared = new Renderable({ geometry: "face", material: "material", morphWeights: [0] });
    const actors = [0, 1].map((actor) => {
      const container = scene.createNode(`actor-${actor}`);
      container.userData.gltfSceneContainer = true;
      const owner = scene.createNode("face");
      owner.userData.gltfNodeIndex = 4;
      const mesh = scene.createNode("primitive");
      mesh.renderable = shared;
      owner.addChild(mesh);
      container.addChild(owner);
      scene.root.addChild(container);
      return { container, mesh };
    });
    const track = new AnimationTrack({
      target: "face.weights", valueType: "number-array",
      keyframes: [{ time: 0, value: [0] }, { time: 1, value: [1] }]
    });
    const clip = new AnimationClip({ name: "morph", duration: 1, tracks: [track] });
    const options = { scene, clips: [clip], actorRoot: actors[1]!.container, nodeIndexForTrack: () => 4 };
    const binding = mode === "action-mixer" ? createGLTFSceneAnimationMixer(options) : undefined;
    const runtime = binding?.runtime ?? createGLTFSceneAnimationRuntime(options);
    try {
      if (mode === "pose-mixer") runtime.mixer().play("morph");
      const result = mode === "clip" ? runtime.applyClip(clip, 0.5)
        : mode === "blend" ? runtime.applyClips([{ clipName: "morph", time: 0.5 }])
          : mode === "pose-mixer" ? runtime.applyPoseMixer(0.5)
            : binding!.update(0.5).applyResult;
      expect(result.missingTargets).toEqual([]);
      expect(actors[0]!.mesh.renderable).not.toBe(actors[1]!.mesh.renderable);
      expect(actors[0]!.mesh.renderable!.morphWeights[0]).toBe(0);
      expect(actors[1]!.mesh.renderable!.morphWeights[0]).toBeCloseTo(0.5);
    } finally {
      if (binding) binding.dispose();
      else runtime.dispose();
    }
  });

  it("does not commit root motion for an ambiguous actor and consumes it for a selected actor", () => {
    const scene = new Scene();
    const actors = [0, 1].map((actor) => {
      const container = scene.createNode(`actor-${actor}`);
      container.userData.gltfSceneContainer = true;
      const joint = scene.createNode("joint");
      joint.userData.gltfNodeIndex = 4;
      joint.transform.setPosition(actor + 1, 0, 0);
      container.addChild(joint);
      scene.root.addChild(container);
      return { container, joint };
    });
    const track = new AnimationTrack({
      target: "joint.translation", valueType: "vector3",
      keyframes: [{ time: 0, value: [0, 0, 0] }, { time: 1, value: [4, 0, 0] }]
    });
    const clip = new AnimationClip({ name: "move", duration: 1, tracks: [track] });
    const asset = { ...skinAsset([4], ["joint"]), animations: [clip] };
    let commits = 0;
    const motion = { target: track.target, fromTime: 0, toTime: 1, worldFromLocal: identity as Mat4, move: (delta: readonly [number, number, number]) => {
      commits += 1;
      return delta;
    } };
    const ambiguous = createGLTFSceneAnimationRuntime({ scene, clips: [clip], asset });
    expect(() => ambiguous.applyRootMotionClip("move", motion)).toThrow(/missing or ambiguous/);
    expect(commits).toBe(0);
    ambiguous.dispose();
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: [clip], asset, actorRoot: actors[1]!.container });
    try {
      const result = runtime.applyRootMotionClip("move", motion);
      expect(result.applyResult.missingTargets).toEqual([]);
      expect(result.motion.accepted[0]).toBeCloseTo(4);
      expect(commits).toBe(1);
      expect(actors[0]!.joint.transform.position[0]).toBe(1);
      expect(actors[1]!.joint.transform.position[0]).toBe(0);
    } finally {
      runtime.dispose();
    }
    const mixerOptions = {
      scene, clips: [clip], asset,
      mixer: { applyRootMotion: true, rootMotionTrack: track.target, consumeRootMotionTrack: true },
      consumeRootMotion: () => { commits += 1; }
    };
    const ambiguousMixer = createGLTFSceneAnimationMixer(mixerOptions);
    try {
      expect(() => ambiguousMixer.update(0.5)).toThrow(/missing or ambiguous/);
      expect(commits).toBe(1);
    } finally {
      ambiguousMixer.dispose();
    }
    const scopedMixer = createGLTFSceneAnimationMixer({ ...mixerOptions, actorRoot: actors[1]!.container });
    try {
      expect(scopedMixer.update(0.5).applyResult.missingTargets).toEqual([]);
      expect(commits).toBe(2);
      expect(actors[0]!.joint.transform.position[0]).toBe(1);
      expect(actors[1]!.joint.transform.position[0]).toBe(0);
    } finally {
      scopedMixer.dispose();
    }
  });

  it("does not blend root motion from different indexed nodes into one movement", () => {
    const scene = new Scene();
    for (const index of [4, 9]) {
      const node = scene.createNode("joint");
      node.userData.gltfNodeIndex = index;
      scene.root.addChild(node);
    }
    const track = () => new AnimationTrack({
      target: "joint.translation", valueType: "vector3",
      keyframes: [{ time: 0, value: [0, 0, 0] }, { time: 1, value: [4, 0, 0] }]
    });
    const firstTrack = track();
    const secondTrack = track();
    const first = new AnimationClip({ name: "first", duration: 1, tracks: [firstTrack] });
    const second = new AnimationClip({ name: "second", duration: 1, tracks: [secondTrack] });
    const runtime = createGLTFSceneAnimationRuntime({
      scene, clips: [first, second], nodeIndexForTrack: (candidate) => candidate === firstTrack ? 4 : candidate === secondTrack ? 9 : undefined
    });
    let commits = 0;
    try {
      expect(() => runtime.applyRootMotionClips([
        { clipName: "first", target: firstTrack.target, fromTime: 0, toTime: 0.5 },
        { clipName: "second", target: secondTrack.target, fromTime: 0, toTime: 0.5 }
      ], {
        worldFromLocal: identity as Mat4,
        move: (delta) => { commits += 1; return delta; }
      })).toThrow(/missing or ambiguous/);
      expect(commits).toBe(0);
    } finally {
      runtime.dispose();
    }
  });
});
