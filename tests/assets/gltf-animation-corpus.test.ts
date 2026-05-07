import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GLTFLoader, LoadContext, createGLTFCorpusReport, validateGLTFCorpusManifest, type GLTFCorpusManifest } from "../../packages/assets/src";

const externalCharacterManifestPath = resolve("tests/assets/corpus/animated-character-corpus.manifest.json");
const externalCharacterFixturePaths = {
  "cesium-man": resolve("tests/assets/corpus/khronos/CesiumMan/CesiumMan.glb"),
  fox: resolve("tests/assets/corpus/khronos/Fox/Fox.glb")
} as const;

describe("glTF animation corpus fixture", () => {
  it("imports an inline skinned glTF animation and preserves clip, skin, and vertex influences", async () => {
    const { url } = createInlineSkinnedAnimationFixture();
    const asset = await new GLTFLoader().load({ url }, new LoadContext());

    expect(asset.meshes).toHaveLength(1);
    expect(asset.meshes[0]?.name).toBe("corpus-skinned-triangle");
    expect(asset.meshes[0]?.skinIndex).toBe(0);
    expect(asset.meshes[0]?.joints[0]).toEqual([0, 1, 0, 0]);
    expect(asset.meshes[0]?.weights[1]?.map((value) => Number(value.toFixed(3)))).toEqual([0.25, 0.75, 0, 0]);

    expect(asset.skins[0]?.name).toBe("corpus-armature");
    expect(asset.skins[0]?.joints).toEqual([0, 1]);
    expect(asset.skins[0]?.skeleton.bones.map((bone) => bone.name)).toEqual(["character-root", "tip-joint"]);
    expect(asset.skins[0]?.skeleton.bones[1]?.parentIndex).toBe(0);
    expect(asset.skins[0]?.skeleton.matrixPalette()).toHaveLength(2);

    const clip = asset.animations[0];
    expect(clip?.name).toBe("corpus-arm-swing");
    expect(clip?.duration).toBe(1);
    expect(clip?.tracks.map((track) => `${track.target}:${track.valueType}`)).toEqual([
      "tip-joint.rotation:quaternion",
      "character-root.translation:vector3"
    ]);
    expect(clip?.tracks[0]?.sample(0.5)).toEqual([0, 0, 0.7071067690849304, 0.7071067690849304]);
    expect(clip?.tracks[1]?.sample(0.5)).toEqual([0.5, 0, 0]);

    const scene = asset.createScene();
    expect(scene.findByName("character-root")[0]?.children.map((node) => node.name)).toContain("tip-joint");

    const serialized = asset.toJSON();
    expect(serialized.animations[0]?.tracks[0]?.target).toBe("tip-joint.rotation");
    expect(serialized.skins[0]?.bones[1]?.name).toBe("tip-joint");
  });

  it("imports pinned externally authored skinned character corpus entries", async () => {
    const manifest = readExternalCharacterManifest();
    const validation = validateGLTFCorpusManifest(manifest);
    expect(validation.diagnostics).toEqual([]);
    expect(validation.ok).toBe(true);

    const report = createGLTFCorpusReport(validation.manifest!, "2026-05-06T00:00:00.000Z");
    expect(report.sourceManifest.assetCount).toBe(2);
    expect(report.summary).toEqual({ pass: 1, warn: 1, expectedFail: 0 });
    expect(report.assets.find((asset) => asset.id === "cesium-man")).toMatchObject({
      id: "cesium-man",
      expectedStatus: "warn",
      sourceSha256: "b7001eaeea8254bd44773bcd247e78696d94169388fbb2a1800fc69434e777d9"
    });
    expect(report.assets.find((asset) => asset.id === "cesium-man")?.diagnostics[0]?.code).toBe("ANIMATION_CORPUS_TRADEMARK_LIMIT");
    expect(report.assets.find((asset) => asset.id === "fox")).toMatchObject({
      id: "fox",
      expectedStatus: "pass",
      sourceSha256: "d97044e701822bac5a62696459b27d7b375aada5de8574ed4362edbba94771f7"
    });

    const cesiumBytes = readFileSync(externalCharacterFixturePaths["cesium-man"]);
    expect(createHash("sha256").update(cesiumBytes).digest("hex")).toBe(manifest.assets.find((asset) => asset.id === "cesium-man")?.source.sha256);

    const cesium = await new GLTFLoader().load({ url: `data:model/gltf-binary;base64,${cesiumBytes.toString("base64")}` }, new LoadContext());
    const cesiumMesh = cesium.meshes.find((entry) => entry.skinIndex === 0 && entry.joints.length > 0 && entry.weights.length > 0);
    const cesiumSkin = cesium.skins[0];
    const cesiumClip = cesium.animations[0];

    expect(cesium.meshes).toHaveLength(1);
    expect(cesiumMesh?.name).toBe("Cesium_Man");
    expect(cesiumMesh?.positions.length).toBe(3273);
    expect(cesiumMesh?.indices?.length).toBeGreaterThan(10_000);
    expect(cesiumMesh?.joints).toHaveLength(cesiumMesh?.positions.length ?? 0);
    expect(cesiumMesh?.weights).toHaveLength(cesiumMesh?.positions.length ?? 0);
    expect(cesiumMesh?.joints.some((joint) => joint.some((index) => index > 0))).toBe(true);
    expect(cesiumMesh?.weights.every((weight) => weight.some((value) => value > 0))).toBe(true);

    expect(cesiumSkin?.name).toBe("Armature");
    expect(cesiumSkin?.joints).toHaveLength(19);
    expect(cesiumSkin?.skeleton.bones).toHaveLength(19);
    expect(cesiumSkin?.skeleton.bones.map((bone) => bone.name)).toContain("Skeleton_torso_joint_1");

    expect(cesiumClip?.name).toBe("animation-0");
    expect(cesiumClip?.duration).toBe(2);
    expect(cesiumClip?.tracks).toHaveLength(57);
    expect(cesiumClip?.tracks.some((track) => track.target.endsWith(".rotation"))).toBe(true);
    expect(cesiumClip?.tracks.some((track) => track.target.endsWith(".translation"))).toBe(true);
    expect(cesiumClip?.tracks.some((track) => track.target.endsWith(".scale"))).toBe(true);
    expect(cesiumClip?.tracks.find((track) => track.target === "Skeleton_torso_joint_1.translation")?.sample(1)).toHaveLength(3);
    expect(cesiumClip?.tracks.find((track) => track.target === "Skeleton_torso_joint_1.rotation")?.sample(1)).toHaveLength(4);

    const cesiumScene = cesium.createScene();
    expect(cesiumScene.findByName("Cesium_Man")).toHaveLength(1);

    const foxBytes = readFileSync(externalCharacterFixturePaths.fox);
    expect(createHash("sha256").update(foxBytes).digest("hex")).toBe(manifest.assets.find((asset) => asset.id === "fox")?.source.sha256);

    const fox = await new GLTFLoader().load({ url: `data:model/gltf-binary;base64,${foxBytes.toString("base64")}` }, new LoadContext());
    const foxMesh = fox.meshes.find((entry) => entry.skinIndex === 0 && entry.joints.length > 0 && entry.weights.length > 0);
    expect(foxMesh?.name).toBe("fox1");
    expect(foxMesh?.positions.length).toBe(1728);
    expect(foxMesh?.joints).toHaveLength(foxMesh?.positions.length ?? 0);
    expect(foxMesh?.weights).toHaveLength(foxMesh?.positions.length ?? 0);
    expect(fox.skins[0]?.skeleton.bones.map((bone) => bone.name)).toContain("b_Spine01_02");
    expect(fox.animations.map((clip) => clip.name).sort()).toEqual(["Run", "Survey", "Walk"]);
    expect(fox.animations.every((clip) => clip.tracks.some((track) => track.target.endsWith(".rotation")))).toBe(true);
    expect(fox.createScene().findByName("fox")).toHaveLength(1);
  });
});

function readExternalCharacterManifest(): GLTFCorpusManifest {
  return JSON.parse(readFileSync(externalCharacterManifestPath, "utf8")) as GLTFCorpusManifest;
}

function createInlineSkinnedAnimationFixture(): { readonly url: string } {
  const chunks = [
    floatBytes([-0.2, -0.25, 0, 0.2, -0.25, 0, 0, 0.3, 0]),
    floatBytes([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uint16Bytes([0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0]),
    floatBytes([1, 0, 0, 0, 0.25, 0.75, 0, 0, 0, 1, 0, 0]),
    floatBytes([
      1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
      1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -0.4, 0, 0, 1
    ]),
    floatBytes([0, 0.5, 1]),
    floatBytes([0, 0, 0, 1, 0, 0, 0.70710677, 0.70710677, 0, 0, 0, 1]),
    floatBytes([0, 0.5, 1]),
    floatBytes([0, 0, 0, 0.5, 0, 0, 1, 0, 0])
  ];
  const offsets: number[] = [];
  let cursor = 0;
  for (const chunk of chunks) {
    offsets.push(cursor);
    cursor += chunk.byteLength;
  }
  const binary = Buffer.concat(chunks);
  const gltf = {
    asset: { version: "2.0", generator: "Galileo3D inline animation corpus" },
    buffers: [{ byteLength: binary.byteLength }],
    bufferViews: chunks.map((chunk, index) => ({ buffer: 0, byteOffset: offsets[index], byteLength: chunk.byteLength })),
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.2, -0.25, 0], max: [0.2, 0.3, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 2, componentType: 5123, count: 3, type: "VEC4" },
      { bufferView: 3, componentType: 5126, count: 3, type: "VEC4" },
      { bufferView: 4, componentType: 5126, count: 2, type: "MAT4" },
      { bufferView: 5, componentType: 5126, count: 3, type: "SCALAR", min: [0], max: [1] },
      { bufferView: 6, componentType: 5126, count: 3, type: "VEC4" },
      { bufferView: 7, componentType: 5126, count: 3, type: "SCALAR", min: [0], max: [1] },
      { bufferView: 8, componentType: 5126, count: 3, type: "VEC3" }
    ],
    meshes: [
      {
        name: "corpus-skinned-triangle",
        primitives: [{ attributes: { POSITION: 0, NORMAL: 1, JOINTS_0: 2, WEIGHTS_0: 3 } }]
      }
    ],
    nodes: [
      { name: "character-root", children: [1, 2] },
      { name: "tip-joint", translation: [0.4, 0, 0] },
      { name: "rendered-body", mesh: 0, skin: 0 }
    ],
    skins: [{ name: "corpus-armature", skeleton: 0, joints: [0, 1], inverseBindMatrices: 4 }],
    animations: [
      {
        name: "corpus-arm-swing",
        samplers: [
          { input: 5, output: 6, interpolation: "LINEAR" },
          { input: 7, output: 8, interpolation: "LINEAR" }
        ],
        channels: [
          { sampler: 0, target: { node: 1, path: "rotation" } },
          { sampler: 1, target: { node: 0, path: "translation" } }
        ]
      }
    ],
    scenes: [{ nodes: [0] }],
    scene: 0
  };
  const glb = createGLB(gltf, binary);
  return { url: `data:model/gltf-binary;base64,${glb.toString("base64")}` };
}

function createGLB(json: unknown, binary: Buffer): Buffer {
  const jsonBytes = pad4(Buffer.from(JSON.stringify(json), "utf8"), 0x20);
  const binaryBytes = pad4(binary, 0);
  const totalLength = 12 + 8 + jsonBytes.byteLength + 8 + binaryBytes.byteLength;
  const glb = Buffer.alloc(totalLength);
  let offset = 0;
  glb.writeUInt32LE(0x46546c67, offset);
  offset += 4;
  glb.writeUInt32LE(2, offset);
  offset += 4;
  glb.writeUInt32LE(totalLength, offset);
  offset += 4;
  glb.writeUInt32LE(jsonBytes.byteLength, offset);
  offset += 4;
  glb.writeUInt32LE(0x4e4f534a, offset);
  offset += 4;
  jsonBytes.copy(glb, offset);
  offset += jsonBytes.byteLength;
  glb.writeUInt32LE(binaryBytes.byteLength, offset);
  offset += 4;
  glb.writeUInt32LE(0x004e4942, offset);
  offset += 4;
  binaryBytes.copy(glb, offset);
  return glb;
}

function pad4(buffer: Buffer, fill: number): Buffer {
  const remainder = buffer.byteLength % 4;
  return remainder === 0 ? buffer : Buffer.concat([buffer, Buffer.alloc(4 - remainder, fill)]);
}

function floatBytes(values: readonly number[]): Buffer {
  const buffer = Buffer.alloc(values.length * 4);
  new Float32Array(buffer.buffer, buffer.byteOffset, values.length).set(values);
  return buffer;
}

function uint16Bytes(values: readonly number[]): Buffer {
  const buffer = Buffer.alloc(values.length * 2);
  new Uint16Array(buffer.buffer, buffer.byteOffset, values.length).set(values);
  return pad4(buffer, 0);
}
