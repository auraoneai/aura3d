import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnimationAction, AnimationLayer } from "@aura3d/animation";
import { deserializeScene, deserializeSceneAsync, Scene, serializeScene, type SceneNode, type SerializedScene } from "@aura3d/scene";
import {
  createGLTFSceneAnimationMixer,
  createGLTFSceneAssetResolver,
  createGLTFSceneSerializationAdapter,
  GLTF_SCENE_SERIALIZATION_ADAPTER_ID,
  GLTFSceneAnimationMixerBinding,
  loadVerifiedGLTFSceneAsset,
  type GLTFSceneAssetIdentity,
  type RestoredGLTFScene,
  type VerifiedGLTFSceneAsset
} from "@aura3d/assets/gltf-runtime";

const sha = (bytes: Uint8Array | string) => `sha256-${createHash("sha256").update(bytes).digest("hex")}`;

/** Independently authored glTF: two same-named joints, one real skin and one node track. */
function fixture(external = false) {
  const chunks = [
    new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    new Uint8Array([0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0]),
    new Float32Array([0.75, 0.25, 0, 0, 0.75, 0.25, 0, 0, 0.75, 0.25, 0, 0]),
    new Float32Array([0, 1]),
    new Float32Array([0, 0, 0, 4, 0, 0])
  ];
  let size = 0;
  const bufferViews = chunks.map((chunk) => {
    const entry = { buffer: 0, byteOffset: size, byteLength: chunk.byteLength };
    size += chunk.byteLength;
    return entry;
  });
  const bytes = Buffer.alloc(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength), offset);
    offset += chunk.byteLength;
  }
  const document = {
    asset: { version: "2.0" },
    buffers: [{ byteLength: size, uri: external ? "rig.bin" : `data:application/octet-stream;base64,${bytes.toString("base64")}` }],
    bufferViews,
    accessors: [
      { bufferView: 0, componentType: 5126, type: "VEC3", count: 3, min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5121, type: "VEC4", count: 3 },
      { bufferView: 2, componentType: 5126, type: "VEC4", count: 3 },
      { bufferView: 3, componentType: 5126, type: "SCALAR", count: 2, min: [0], max: [1] },
      { bufferView: 4, componentType: 5126, type: "VEC3", count: 2 }
    ],
    meshes: [{ name: "body", primitives: [{ attributes: { POSITION: 0, JOINTS_0: 1, WEIGHTS_0: 2 } }] }],
    nodes: [
      { name: "joint" },
      { name: "joint", translation: [0, 2, 0] },
      { name: "body-node", mesh: 0, skin: 0 }
    ],
    skins: [{ name: "rig", joints: [0, 1] }],
    scenes: [{ nodes: [0, 1, 2] }],
    scene: 0,
    animations: [{
      name: "move",
      samplers: [{ input: 3, output: 4 }],
      channels: [{ sampler: 0, target: { node: 0, path: "translation" } }]
    }]
  };
  const json = Buffer.from(JSON.stringify(document));
  const uri = external ? "https://assets.example.test/rig.gltf" : `data:model/gltf+json;base64,${json.toString("base64")}`;
  const identity: GLTFSceneAssetIdentity = {
    id: "rig-v1",
    uri,
    digest: sha(json),
    dependencies: external ? { "rig.bin": sha(bytes) } : {}
  };
  return { identity, json, bytes };
}

function installFixtureFetch(data: ReturnType<typeof fixture>, bytes = data.bytes) {
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request) => {
    const path = String(url);
    if (path.endsWith("/rig.gltf")) return new Response(data.json);
    if (path.endsWith("/rig.bin")) return new Response(bytes);
    return new Response("missing", { status: 404 });
  }));
}

async function setup(actorCount = 1, external = false) {
  const data = fixture(external);
  if (external) installFixtureFetch(data);
  const asset = await loadVerifiedGLTFSceneAsset(data.identity);
  const scene = new Scene();
  scene.metadata.registerAsset({ id: data.identity.id, uri: data.identity.uri, digest: data.identity.digest });
  const actors = Array.from({ length: actorCount }, (_, index) => {
    const template = asset.asset.createScene();
    const root = scene.cloneNode(template.root);
    template.dispose();
    root.name = `actor-${index}`;
    scene.root.addChild(root);
    const animation = createGLTFSceneAnimationMixer({
      scene, actorRoot: root, asset: asset.asset, clips: asset.asset.animations, autoPlay: false
    });
    return { root, animation, asset };
  });
  return { ...data, asset, scene, actors };
}

function closeSource(source: Awaited<ReturnType<typeof setup>>) {
  for (const actor of source.actors) actor.animation.dispose();
  source.scene.dispose();
  source.asset.dispose();
}

function snapshot(source: Awaited<ReturnType<typeof setup>>): SerializedScene {
  return JSON.parse(JSON.stringify(serializeScene(source.scene, {
    adapters: [createGLTFSceneSerializationAdapter({ actors: source.actors })]
  }))) as SerializedScene;
}

function actorNode(root: SceneNode, index: number): SceneNode {
  let found: SceneNode | undefined;
  root.traverse((node) => { if (node.userData.gltfNodeIndex === index) found = node; });
  if (!found) throw new Error(`Missing node ${index}`);
  return found;
}

type Palette = { readonly jointCount: number; readonly matrices: Float32Array; readonly paletteKey?: object };

function causeText(error: unknown): string {
  const parts: string[] = [];
  let current = error;
  while (current instanceof Error) {
    parts.push(current.message);
    current = current.cause;
  }
  return parts.join(" | ");
}

async function rejection(promise: Promise<unknown>, pattern: RegExp) {
  try {
    await promise;
    throw new Error("Expected rejection");
  } catch (error) {
    expect(causeText(error)).toMatch(pattern);
  }
}

afterEach(() => vi.unstubAllGlobals());

describe("real glTF scene restoration (WP-02 / WP-11)", () => {
  it("restores independently loaded, actor-scoped skins and strict mixer state with explicitly rebound events", async () => {
    const source = await setup(2);
    let restored: Awaited<ReturnType<typeof deserializeSceneAsync>> | undefined;
    try {
      const [first, second] = source.actors;
      const a = first!.animation.playClip("move", { loopMode: "pingpong", repetitions: 5 });
      a.warp(1, 1.7, 1.5).fadeTo(0.6, 1.25);
      second!.animation.playClip("move", { loopMode: "repeat", timeScale: 0.8 });
      first!.animation.update(0.55);
      second!.animation.update(0.3);
      const document = snapshot(source);
      expect(document.version).toBe(3);
      expect(() => deserializeScene(document)).toThrow(/deserializeSceneAsync/i);

      const sourceEvents: string[][] = [[], []];
      const destinationEvents: string[][] = [[], []];
      source.actors.forEach((actor, i) => actor.animation.mixer.addEventListener("loop", (event) => {
        sourceEvents[i]!.push(`${event.type}:${event.loopDelta}`);
      }));
      const destinationCallbacks = source.actors.map((_, i) => (event: { type: string; loopDelta: number }) => {
        destinationEvents[i]!.push(`${event.type}:${event.loopDelta}`);
      });
      restored = await deserializeSceneAsync(document, {
        resolveAsset: createGLTFSceneAssetResolver([source.identity]),
        adapters: [createGLTFSceneSerializationAdapter({
          rebind: ({ root }) => {
            const i = source.actors.findIndex((actor) => actor.root.id === root.id);
            return { onLoop: destinationCallbacks[i]! };
          }
        })]
      });
      const result = restored.extensions.get(GLTF_SCENE_SERIALIZATION_ADAPTER_ID) as RestoredGLTFScene;
      expect(result.actors).toHaveLength(2);
      expect(result.actors[0]!.asset).toBe(result.actors[1]!.asset);
      expect(result.actors[0]!.asset.asset).not.toBe(source.asset.asset);
      expect(result.actors[0]!.asset.asset.gltfAssetId).not.toBe(source.asset.asset.gltfAssetId);
      expect(result.actors[0]!.root).not.toBe(first!.root);
      const restoredSkin = actorNode(result.actors[0]!.root, 2).renderable!.skinning! as Palette;
      const originalSkin = actorNode(first!.root, 2).renderable!.skinning! as Palette;
      const secondSkin = actorNode(result.actors[1]!.root, 2).renderable!.skinning! as Palette;
      expect(restoredSkin.matrices).not.toBe(originalSkin.matrices);
      expect(restoredSkin.matrices).not.toBe(secondSkin.matrices);
      expect(restoredSkin.paletteKey).not.toBe(originalSkin.paletteKey);
      expect(restoredSkin.paletteKey).not.toBe(secondSkin.paletteKey);
      expect(actorNode(result.actors[0]!.root, 2).userData.gltfSkinBinding).toMatchObject({
        assetId: result.actors[0]!.asset.asset.gltfAssetId, nodeIndex: 2, skinIndex: 0, meshIndex: 0, primitiveIndex: 0
      });

      for (const delta of [0.2, 0.55, -0.3, 0.8, 1.4]) {
        for (let i = 0; i < 2; i++) {
          const expected = source.actors[i]!.animation.update(delta);
          const actual = result.actors[i]!.animation.update(delta);
          expect(actual.events).toEqual(expected.events);
          expect(actual.eventOverflow).toBe(expected.eventOverflow);
          expect(actual.activeActions).toEqual(expected.activeActions);
          expect(actorNode(result.actors[i]!.root, 0).transform.position).toEqual(actorNode(source.actors[i]!.root, 0).transform.position);
          expect(Array.from(actorNode(result.actors[i]!.root, 2).renderable!.skinning!.matrices))
            .toEqual(Array.from(actorNode(source.actors[i]!.root, 2).renderable!.skinning!.matrices));
        }
      }
      expect(sourceEvents).toEqual(destinationEvents);
      expect(sourceEvents[0]!.length + sourceEvents[1]!.length).toBeGreaterThan(0);
      const ownedAsset = result.actors[0]!.asset.asset;
      await restored.dispose();
      expect(ownedAsset.disposed).toBe(true);
      expect(source.asset.asset.disposed).toBe(false);
      expect(() => result.actors[0]!.animation.update(0.1)).toThrow(/disposed/i);
    } finally {
      await restored?.dispose();
      closeSource(source);
    }
  });

  it("rejects callbacks, untracked actions and PoseAction state rather than silently dropping them", async () => {
    const source = await setup();
    try {
      const actor = source.actors[0]!;
      actor.animation.play("move");
      actor.animation.update(0.25);
      const unsubscribe = actor.animation.mixer.onEvent(() => {});
      try { snapshot(source); throw new Error("Expected rejection"); }
      catch (error) { expect(causeText(error)).toMatch(/listeners|callbacks/i); }
      unsubscribe();
      actor.animation.mixer.addAction(new AnimationAction(source.asset.asset.animations[0]!));
      try { snapshot(source); throw new Error("Expected rejection"); }
      catch (error) { expect(causeText(error)).toMatch(/untracked/i); }
    } finally { closeSource(source); }

    const poseSource = await setup();
    try {
      poseSource.actors[0]!.animation.runtime.mixer().play("move");
      try { snapshot(poseSource); throw new Error("Expected rejection"); }
      catch (error) { expect(causeText(error)).toMatch(/PoseAction|PoseMixer/i); }
    } finally { closeSource(poseSource); }
  });

  it("reconstructs built-in mixer layers, their masks and saved action weights", async () => {
    const source = await setup();
    let restored: Awaited<ReturnType<typeof deserializeSceneAsync>> | undefined;
    try {
      const actor = source.actors[0]!;
      const action = actor.animation.playClip("move", { weight: 0.8, loopMode: "pingpong" });
      const layer = new AnimationLayer("upper", { weight: 0.5, additive: false, mask: ["joint"] });
      layer.add(action);
      actor.animation.mixer.addLayer(layer);
      actor.animation.update(0.4);
      const document = snapshot(source);
      restored = await deserializeSceneAsync(document, {
        resolveAsset: createGLTFSceneAssetResolver([source.identity]),
        adapters: [createGLTFSceneSerializationAdapter()]
      });
      const target = (restored.extensions.get(GLTF_SCENE_SERIALIZATION_ADAPTER_ID) as RestoredGLTFScene).actors[0]!;
      expect(target.animation.serialize()).toEqual(actor.animation.serialize());
      for (const delta of [0.3, 0.8, -0.4]) {
        expect(target.animation.update(delta).activeActions).toEqual(actor.animation.update(delta).activeActions);
        expect(actorNode(target.root, 0).transform.position).toEqual(actorNode(actor.root, 0).transform.position);
      }
    } finally {
      await restored?.dispose();
      closeSource(source);
    }
  });

  it("requires a new root-motion sink and restores signed motion without invoking the old callback", async () => {
    const source = await setup();
    let restored: Awaited<ReturnType<typeof deserializeSceneAsync>> | undefined;
    try {
      const actor = source.actors[0]!;
      actor.animation.dispose();
      const oldMotion: number[] = [];
      const animation = createGLTFSceneAnimationMixer({
        scene: source.scene, actorRoot: actor.root, asset: source.asset.asset, clips: source.asset.asset.animations,
        autoPlay: false,
        mixer: { applyRootMotion: true, rootMotionTrack: "joint.translation", consumeRootMotionTrack: true },
        consumeRootMotion: (sample) => { oldMotion.push(sample.delta[0]); }
      });
      actor.animation = animation;
      animation.play("move");
      animation.update(0.4);
      const document = snapshot(source);
      await rejection(deserializeSceneAsync(document, {
        resolveAsset: createGLTFSceneAssetResolver([source.identity]),
        adapters: [createGLTFSceneSerializationAdapter()]
      }), /root-motion callback.*rebound/i);
      const newMotion: number[] = [];
      restored = await deserializeSceneAsync(document, {
        resolveAsset: createGLTFSceneAssetResolver([source.identity]),
        adapters: [createGLTFSceneSerializationAdapter({
          rebind: () => ({ consumeRootMotion: (sample) => { newMotion.push(sample.delta[0]); } })
        })]
      });
      const target = (restored.extensions.get(GLTF_SCENE_SERIALIZATION_ADAPTER_ID) as RestoredGLTFScene).actors[0]!;
      oldMotion.length = 0;
      for (const delta of [0.3, 0.6, -0.2]) {
        animation.update(delta);
        target.animation.update(delta);
      }
      expect(newMotion).toEqual(oldMotion);
      expect(newMotion.length).toBeGreaterThan(0);
      expect(newMotion).not.toBe(oldMotion);
    } finally {
      await restored?.dispose();
      closeSource(source);
    }
  });

  it("rejects glTF material resources that this scene adapter cannot recreate", async () => {
    const data = fixture();
    const document = JSON.parse(data.json.toString("utf8"));
    document.materials = [{ name: "paint", pbrMetallicRoughness: { metallicFactor: 0.5 } }];
    document.meshes[0].primitives[0].material = 0;
    const json = Buffer.from(JSON.stringify(document));
    const identity = {
      ...data.identity,
      uri: `data:model/gltf+json;base64,${json.toString("base64")}`,
      digest: sha(json)
    };
    await rejection(loadVerifiedGLTFSceneAsset(identity), /does not restore.*material/i);
  });

  it("rejects spoofed leases, stale asset data, altered track provenance, skin provenance and stale palettes", async () => {
    const source = await setup();
    try {
      const actor = source.actors[0]!;
      actor.animation.play("move");
      actor.animation.update(0.4);
      const document = snapshot(source);
      const restore = (value: SerializedScene, resolver = createGLTFSceneAssetResolver([source.identity])) => deserializeSceneAsync(value, {
        resolveAsset: resolver, adapters: [createGLTFSceneSerializationAdapter()]
      });
      await rejection(restore(document, async () => ({ asset: source.asset.asset, identity: source.identity })), /verified.*lease/i);
      const alteredTracks = structuredClone(document);
      const trackActor = (alteredTracks.extensions![0]!.payload as unknown as { actors: { clips: { nodes: number[] }[] }[] }).actors[0]!;
      trackActor.clips[0]!.nodes[0] = 1;
      await rejection(restore(alteredTracks), /clip and track provenance/i);

      const alteredSkin = structuredClone(document);
      const visit = (node: typeof alteredSkin.root): void => {
        const skin = node.userData?.gltfSkinBinding as Record<string, number> | undefined;
        if (skin) skin.skinIndex = 1;
        node.children.forEach(visit);
      };
      visit(alteredSkin.root);
      await rejection(restore(alteredSkin), /skin layout|skin.*provenance/i);

      const stalePalette = structuredClone(document);
      const alterPalette = (node: typeof stalePalette.root): void => {
        if (node.renderable?.skinning) (node.renderable.skinning.matrices as number[])[12] += 10;
        node.children.forEach(alterPalette);
      };
      alterPalette(stalePalette.root);
      await rejection(restore(stalePalette), /palette.*pose/i);

      (source.asset.asset.skins[0]!.joints as number[])[0] = 1;
      try { snapshot(source); throw new Error("Expected rejection"); }
      catch (error) { expect(causeText(error)).toMatch(/unchanged.*verified/i); }
    } finally { closeSource(source); }
  });

  it("verifies trusted document and dependency bytes rather than accepting an opaque load ID", async () => {
    const source = await setup(1, true);
    try {
      source.actors[0]!.animation.play("move");
      source.actors[0]!.animation.update(0.4);
      const document = snapshot(source);
      const adapter = createGLTFSceneSerializationAdapter();
      const wrongTrusted = { ...source.identity, digest: sha("different document") };
      await rejection(deserializeSceneAsync(document, {
        resolveAsset: createGLTFSceneAssetResolver([wrongTrusted]), adapters: [adapter]
      }), /trusted.*manifest/i);
      installFixtureFetch(source, Buffer.from(source.bytes.map((byte, i) => i === 0 ? byte ^ 1 : byte)));
      await rejection(deserializeSceneAsync(document, {
        resolveAsset: createGLTFSceneAssetResolver([source.identity]), adapters: [adapter]
      }), /integrity mismatch/i);
      installFixtureFetch(source);
      const noDependency = { ...source.identity, dependencies: {} };
      await rejection(deserializeSceneAsync(document, {
        resolveAsset: createGLTFSceneAssetResolver([noDependency]), adapters: [adapter]
      }), /dependency integrity/i);
      installFixtureFetch(source);
      const valid = await deserializeSceneAsync(document, {
        resolveAsset: createGLTFSceneAssetResolver([source.identity]), adapters: [adapter]
      });
      const actor = (valid.extensions.get(GLTF_SCENE_SERIALIZATION_ADAPTER_ID) as RestoredGLTFScene).actors[0]!;
      expect(actor.asset.asset.gltfAssetId).not.toBe(source.asset.asset.gltfAssetId);
      await valid.dispose();
    } finally { closeSource(source); }
  });

  it("rolls back verified leases, callbacks, newly created bindings and the restored scene on a later actor failure", async () => {
    const source = await setup(2);
    const dispose = vi.spyOn(GLTFSceneAnimationMixerBinding.prototype, "dispose");
    try {
      source.actors.forEach((actor) => { actor.animation.play("move"); actor.animation.update(0.5); });
      const document = snapshot(source);
      const cleanup: string[] = [];
      let restoredScene: Scene | undefined;
      let verified: VerifiedGLTFSceneAsset | undefined;
      const restoredRoots: SceneNode[] = [];
      let count = 0;
      await rejection(deserializeSceneAsync(document, {
        resolveAsset: createGLTFSceneAssetResolver([source.identity]),
        adapters: [createGLTFSceneSerializationAdapter({
          rebind: (context) => {
            restoredScene = context.scene;
            verified = context.asset;
            restoredRoots.push(context.root);
            context.deferDispose(() => { cleanup.push(`callback-${++count}`); });
            if (context.root.id === source.actors[1]!.root.id) throw new Error("rebind failed");
            return {};
          }
        })]
      }), /rebind failed/i);
      expect(cleanup).toEqual(["callback-1", "callback-2"]);
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(restoredRoots.every((root) => root.disposed)).toBe(true);
      expect(restoredScene!.root.children).toHaveLength(0);
      expect(verified!.asset.disposed).toBe(true);
      expect(source.asset.asset.disposed).toBe(false);
    } finally {
      dispose.mockRestore();
      closeSource(source);
    }
  });
});
