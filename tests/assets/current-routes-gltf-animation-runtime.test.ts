import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  createGLTFRenderResourceDiagnostics,
  createGLTFRenderResources,
  createGLTFSceneAnimationMixer,
  createGLTFSceneAnimationRuntime,
  GLTFLoader,
  loadCurrentRoutesAssetManifest
} from "../../packages/assets/src";
import { LoadContext } from "../../packages/assets/src/LoadContext";

describe("CurrentRoutes GLTF animation runtime", () => {
  it("samples imported skinned keyframes continuously and updates skinning palettes", async () => {
    const soldier = await loadAsset("soldier");
    const scene = soldier.createScene();
    const runtime = createGLTFSceneAnimationRuntime({
      scene,
      clips: soldier.animations,
      asset: soldier
    });
    const clip = soldier.animations[0];

    expect(clip).toBeDefined();
    expect(runtime.snapshot().skinningBindingCount).toBeGreaterThan(0);

    const first = runtime.applyClip(clip!, 0.05);
    const second = runtime.applyClip(clip!, Math.min(clip!.duration, 0.35));

    expect(first.transformTracksApplied).toBeGreaterThan(0);
    expect(second.transformTracksApplied).toBeGreaterThan(0);
    expect(second.skinningPalettesUpdated).toBeGreaterThan(0);
    expect(second.time).toBeGreaterThan(first.time);
    expect(second.missingTargets).toEqual([]);
    expect(second.unsupportedTracks).toEqual([]);
  }, 20000);

  it("blends imported GLTF clips without per-frame target discovery failures", async () => {
    const soldier = await loadAsset("soldier");
    const scene = soldier.createScene();
    const runtime = createGLTFSceneAnimationRuntime({
      scene,
      clips: soldier.animations,
      asset: soldier
    });
    const [base, overlay] = soldier.animations;

    expect(base).toBeDefined();
    expect(overlay).toBeDefined();

    const blended = runtime.applyClips([
      { clipName: base!.name, time: 0.2, weight: 0.7 },
      { clipName: overlay!.name, time: 0.2, weight: 0.3, additive: true }
    ]);

    expect(blended.blendedClipCount).toBe(2);
    expect(blended.transformTracksApplied).toBeGreaterThan(0);
    expect(blended.skinningPalettesUpdated).toBeGreaterThan(0);
    expect(runtime.snapshot().lastApply?.clipName).toMatch(/^blend:/);
    expect(blended.missingTargets).toEqual([]);
  }, 20000);

  it("applies imported morph target tracks from GLB animation data", async () => {
    const morph = await loadAsset("animated-morph-cube");
    const scene = morph.createScene();
    const runtime = createGLTFSceneAnimationRuntime({
      scene,
      clips: morph.animations,
      asset: morph
    });
    const clip = morph.animations[0];

    expect(clip).toBeDefined();
    expect(runtime.snapshot().morphTargetNodeCount).toBeGreaterThan(0);

    const result = runtime.applyClip(clip!, Math.min(clip!.duration, 0.5));
    const morphRenderables = scene.collectRenderables().filter(({ renderable }) => renderable.morphWeights.length > 0);

    expect(result.morphWeightTracksApplied).toBeGreaterThan(0);
    expect(result.missingTargets).toEqual([]);
    expect(morphRenderables.length).toBeGreaterThan(0);
    expect(morphRenderables.some(({ renderable }) => renderable.morphWeights.some((weight) => Math.abs(weight) > 0.0001))).toBe(true);
  });

  it("runs the mixer update path so animated routes can advance every frame", async () => {
    const cesium = await loadAsset("cesium-man-skinned");
    const binding = createGLTFSceneAnimationMixer({
      scene: cesium.createScene(),
      clips: cesium.animations,
      asset: cesium
    });

    const before = binding.snapshot();
    const first = binding.update(1 / 60);
    const second = binding.update(1 / 30);
    const after = binding.snapshot();

    expect(before.mixerActionCount).toBeGreaterThan(0);
    expect(first.applyResult.transformTracksApplied).toBeGreaterThan(0);
    expect(second.applyResult.transformTracksApplied).toBeGreaterThan(0);
    expect(second.applyResult.skinningPalettesUpdated).toBeGreaterThan(0);
    expect(after.lastApply?.time).toBeGreaterThan(first.applyResult.time);
  });

  it("reports seeked clip time when routes sample a mixer with update(0)", async () => {
    const cesium = await loadAsset("cesium-man-skinned");
    const scene = cesium.createScene();
    const binding = createGLTFSceneAnimationMixer({
      scene,
      clips: cesium.animations,
      asset: cesium,
      autoPlay: false
    });
    const clip = cesium.animations[0];
    expect(clip).toBeDefined();

    binding.playExclusive(clip!.name, { loopMode: "repeat", weight: 1, timeScale: 0 });
    binding.seek(clip!.name, 0.05);
    const first = binding.update(0);
    const firstMatrices = firstSkinningPalette(scene);

    const targetTime = Math.min(clip!.duration, 0.45);
    binding.seek(clip!.name, targetTime);
    const second = binding.update(0);
    const secondMatrices = firstSkinningPalette(scene);
    const action = binding.getAction(clip!.name);

    expect(second.applyResult.transformTracksApplied).toBeGreaterThan(0);
    expect(second.applyResult.skinningPalettesUpdated).toBeGreaterThan(0);
    expect(second.applyResult.time).toBeCloseTo(targetTime, 4);
    expect(binding.snapshot().elapsedTime).toBeCloseTo(targetTime, 4);
    expect(action?.time).toBeCloseTo(targetTime, 4);
    expect(matrixDelta(firstMatrices, secondMatrices)).toBeGreaterThan(0.001);
  }, 20000);

  it("caches repeated GLTF accessor reads and exposes load-profile diagnostics", async () => {
    const vertices = new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0
    ]);
    const asset = await new GLTFLoader().load({
      url: dataGltf({
        asset: { version: "2.0" },
        buffers: [{ uri: bufferDataUri(new Uint8Array(vertices.buffer)), byteLength: vertices.byteLength }],
        bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: vertices.byteLength }],
        accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }],
        materials: [{ name: "matte", pbrMetallicRoughness: { baseColorFactor: [0.4, 0.5, 0.6, 1] } }],
        meshes: [{
          name: "reused-accessor",
          primitives: [{ attributes: { POSITION: 0, NORMAL: 0 }, material: 0 }]
        }],
        nodes: [{ name: "root", mesh: 0 }],
        scenes: [{ nodes: [0] }],
        scene: 0
      }),
      type: "gltf"
    }, new LoadContext());

    const profile = asset.loaderDiagnostics.loadProfile;
    expect(profile).toBeDefined();
    expect(profile?.schemaVersion).toBe("gltf-loader-load-profile");
    expect(profile?.accessorReadCount).toBe(2);
    expect(profile?.uniqueAccessorReadCount).toBe(1);
    expect(profile?.accessorCacheHitCount).toBe(1);
    expect(profile?.dataViewCacheEntries).toBe(1);
    expect(profile?.largestAccessors[0]).toMatchObject({
      accessorIndex: 0,
      count: 3,
      type: "VEC3",
      componentType: 5126,
      componentCount: 3
    });
    expect(asset.toJSON().loaderDiagnostics.loadProfile).toEqual(profile);
  });

  it("shares one decoded texture across materials that reference the same GLTF image", async () => {
    const vertices = new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0
    ]);
    const asset = await new GLTFLoader().load({
      url: dataGltf({
        asset: { version: "2.0" },
        buffers: [{ uri: bufferDataUri(new Uint8Array(vertices.buffer)), byteLength: vertices.byteLength }],
        bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: vertices.byteLength }],
        accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }],
        images: [{ name: "shared-pixel", uri: "data:image/png;base64,AA==" }],
        textures: [{ name: "shared-base-color", source: 0 }],
        materials: [
          { name: "red-shell", pbrMetallicRoughness: { baseColorTexture: { index: 0 }, baseColorFactor: [1, 0.2, 0.2, 1] } },
          { name: "blue-shell", pbrMetallicRoughness: { baseColorTexture: { index: 0 }, baseColorFactor: [0.2, 0.3, 1, 1] } }
        ],
        meshes: [
          { name: "red-mesh", primitives: [{ attributes: { POSITION: 0 }, material: 0 }] },
          { name: "blue-mesh", primitives: [{ attributes: { POSITION: 0 }, material: 1 }] }
        ],
        nodes: [{ name: "red", mesh: 0 }, { name: "blue", mesh: 1 }],
        scenes: [{ nodes: [0, 1] }],
        scene: 0
      }),
      type: "gltf"
    }, new LoadContext());
    let decodeCount = 0;
    const resources = await createGLTFRenderResources(asset, {
      imageDecoder: () => {
        decodeCount += 1;
        return {
          width: 1,
          height: 1,
          colorSpace: "srgb" as const,
          data: new Uint8Array([220, 180, 120, 255])
        };
      }
    });

    try {
      const diagnostics = createGLTFRenderResourceDiagnostics(resources, { label: "shared-texture" });
      expect(decodeCount).toBe(1);
      expect(diagnostics.textureCount).toBe(1);
      expect(diagnostics.texturedDrawItems).toBe(2);
      expect(diagnostics.missingGeometryLabels).toEqual([]);
      expect(diagnostics.missingMaterialLabels).toEqual([]);
      expect(diagnostics.fallbackWhiteLabels).toEqual([]);
    } finally {
      resources.dispose();
    }
  });

  it("diagnoses Kira animation, skinning, texture, and static mesh limitations", async () => {
    expect(readGlbJson("fixtures/threejs-parity/assets/showcase/kira-ik-room.glb").animations ?? []).toEqual([]);
    const kira = await new GLTFLoader().load({
      url: toGlbDataUri("fixtures/threejs-parity/assets/showcase/kira-ik-room-animated.glb"),
      type: "gltf"
    }, new LoadContext());
    const scene = kira.createScene();
    const runtime = createGLTFSceneAnimationRuntime({
      scene,
      clips: kira.animations,
      asset: kira
    });
    const clip = kira.animations.find((candidate) => candidate.name === "Kira_Attention_Reach");

    expect(clip).toBeDefined();
    expect(kira.skins[0]?.name).toBe("Kira");
    expect(runtime.snapshot().skinningBindingCount).toBe(3);
    expect(runtime.inspectClipBindings("Kira_Attention_Reach")[0]).toMatchObject({
      clipName: "Kira_Attention_Reach",
      trackCount: 70,
      boundTrackCount: 70,
      missingTargetCount: 0,
      unsupportedTrackCount: 0,
      skinningBindingCount: 3,
      animatesSkeleton: true
    });

    const sample = runtime.applyClip(clip!, 0.35);
    expect(sample.tracksApplied).toBeGreaterThan(0);
    expect(sample.skinningPalettesUpdated).toBe(3);
    expect(sample.missingTargets).toEqual([]);

    const resources = await createGLTFRenderResources(kira, { imageDecoder: decodeDiagnosticTexture });
    try {
      const diagnostics = createGLTFRenderResourceDiagnostics(resources, {
        label: "kira-ik-room-animated",
        suspectStaticNodePattern: /^Kira_/i
      });

      expect(diagnostics.skinnedDrawItems).toBe(3);
      expect(diagnostics.texturedSkinnedDrawItems).toBe(3);
      expect(diagnostics.missingGeometryDrawItems).toBe(0);
      expect(diagnostics.missingMaterialDrawItems).toBe(0);
      expect(diagnostics.missingGeometryLabels).toEqual([]);
      expect(diagnostics.missingMaterialLabels).toEqual([]);
      expect(diagnostics.fallbackWhiteLabels).toEqual(["boule:Sphere.003"]);
      expect(diagnostics.suspectStaticLabels).toEqual([
        "Kira_Feet:Kira_Feet.002",
        "Kira_Pants_B:Kira_Pants_B.001",
        "Kira_Shirt_right:Kira_Shirt.001"
      ]);
    } finally {
      resources.dispose();
    }
  }, 20000);
});

async function loadAsset(id: string) {
  const manifest = loadCurrentRoutesAssetManifest();
  const asset = manifest.assets.find((entry) => entry.id === id);
  expect(asset).toBeDefined();
  return await new GLTFLoader().load({ url: toGlbDataUri(asset!.localPath), type: "gltf" }, new LoadContext());
}

function toGlbDataUri(localPath: string): string {
  return `data:model/gltf-binary;base64,${readFileSync(localPath).toString("base64")}`;
}

function dataGltf(gltf: Record<string, unknown>): string {
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
}

function bufferDataUri(bytes: Uint8Array): string {
  return `data:application/octet-stream;base64,${Buffer.from(bytes).toString("base64")}`;
}

function decodeDiagnosticTexture() {
  return {
    width: 1,
    height: 1,
    colorSpace: "srgb" as const,
    data: new Uint8Array([180, 120, 90, 255])
  };
}

function readGlbJson(localPath: string): { readonly animations?: readonly unknown[] } {
  const bytes = readFileSync(localPath);
  const magic = bytes.toString("utf8", 0, 4);
  if (magic !== "glTF") throw new Error(`${localPath} is not a GLB file`);
  const jsonLength = bytes.readUInt32LE(12);
  return JSON.parse(bytes.toString("utf8", 20, 20 + jsonLength).trim()) as { readonly animations?: readonly unknown[] };
}

function firstSkinningPalette(scene: ReturnType<Awaited<ReturnType<typeof loadAsset>>["createScene"]>): readonly number[] {
  const renderable = scene.collectRenderables().find((entry) => entry.renderable.skinning !== undefined)?.renderable;
  expect(renderable?.skinning).toBeDefined();
  return Array.from(renderable!.skinning!.matrices);
}

function matrixDelta(a: readonly number[], b: readonly number[]): number {
  let total = 0;
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    total += Math.abs((a[index] ?? 0) - (b[index] ?? 0));
  }
  return total;
}
