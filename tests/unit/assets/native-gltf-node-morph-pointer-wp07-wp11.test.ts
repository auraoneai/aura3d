import { describe, expect, it } from "vitest";
import { createGLTFSceneAnimationMixer, createGLTFSceneAnimationRuntime } from "../../../packages/assets/src/GLTFAnimationRuntime";
import { GLTFLoader } from "../../../packages/assets/src/GLTFLoader";
import { LoadContext } from "../../../packages/assets/src/LoadContext";

type FixtureOptions = {
  readonly required?: boolean;
  readonly interpolation?: "LINEAR" | "STEP" | "CUBICSPLINE";
  readonly values?: readonly number[];
  readonly outputType?: "SCALAR" | "VEC2";
  readonly missingMorphs?: boolean;
  readonly targetWeights?: readonly number[];
  readonly otherWeights?: readonly number[];
  readonly primitiveCount?: number;
  readonly times?: readonly number[];
  readonly inputNormalized?: boolean;
  readonly outputNormalized?: boolean;
  readonly pointer?: string;
  readonly targetName?: string;
};

function fixtureUrl(options: FixtureOptions = {}): string {
  const chunks = [
    new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    new Float32Array([0, 0, 0.2, 0, 0, 0.2, 0, 0, 0.2]),
    new Float32Array([0.1, 0, 0, 0.1, 0, 0, 0.1, 0, 0]),
    new Float32Array(options.times ?? [0, 1]),
    new Float32Array(options.values ?? [0, 0, 1, 0.5])
  ];
  let length = 0;
  const bufferViews = chunks.map((chunk) => {
    const result = { buffer: 0, byteOffset: length, byteLength: chunk.byteLength };
    length += chunk.byteLength;
    return result;
  });
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(new Uint8Array(chunk.buffer), offset);
    offset += chunk.byteLength;
  }
  const outputType = options.outputType ?? "SCALAR";
  const document = {
    asset: { version: "2.0" },
    extensionsUsed: ["KHR_animation_pointer"],
    ...(options.required ? { extensionsRequired: ["KHR_animation_pointer"] } : {}),
    buffers: [{ uri: `data:application/octet-stream;base64,${Buffer.from(bytes).toString("base64")}`, byteLength: bytes.byteLength }],
    bufferViews,
    accessors: [
      { bufferView: 0, componentType: 5126, type: "VEC3", count: 3, min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5126, type: "VEC3", count: 3 },
      { bufferView: 2, componentType: 5126, type: "VEC3", count: 3 },
      { bufferView: 3, componentType: 5126, type: "SCALAR", count: chunks[3]!.length, normalized: options.inputNormalized },
      { bufferView: 4, componentType: 5126, type: outputType, count: chunks[4]!.length / (outputType === "VEC2" ? 2 : 1), normalized: options.outputNormalized }
    ],
    meshes: [{
      name: "FaceMesh",
      weights: [0, 0],
      primitives: Array.from({ length: options.primitiveCount ?? 1 }, () => ({
        attributes: { POSITION: 0 }, targets: [{ POSITION: 1 }, { POSITION: 2 }]
      }))
    }],
    nodes: [
      { name: options.targetName ?? "Target", ...(options.missingMorphs ? {} : { mesh: 0, weights: options.targetWeights ?? [0, 0] }) },
      { name: "Other", mesh: 0, weights: options.otherWeights ?? [0, 0] }
    ],
    scenes: [{ nodes: [0, 1] }],
    scene: 0,
    animations: [{
      name: "expression",
      samplers: [{ input: 3, output: 4, interpolation: options.interpolation ?? "LINEAR" }],
      channels: [{ sampler: 0, target: {
        path: "pointer", extensions: { KHR_animation_pointer: { pointer: options.pointer ?? "/nodes/0/weights" } }
      } }]
    }]
  };
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(document))}`;
}

const load = (options: FixtureOptions = {}) => new GLTFLoader().load({ url: fixtureUrl(options), type: "gltf" }, new LoadContext());

describe("node morph-weight animation pointers", () => {
  it.each([false, true] as const)("animates only the addressed node from packed scalar weights, required=%s", async (required) => {
    const asset = await load({ required });
    const scene = asset.createScene();
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: asset.animations, asset });
    expect(runtime.applyClipByName("expression", 0.5)).toMatchObject({ morphWeightTracksApplied: 1, missingTargets: [] });
    expect(scene.findByName("Target")[0]?.renderable?.morphWeights).toEqual([0.5, 0.25]);
    expect(scene.findByName("Other")[0]?.renderable?.morphWeights).toEqual([0, 0]);
  });

  it("preserves step and cubic-spline weights and tangents", async () => {
    for (const [interpolation, values, expected] of [
      ["STEP", [0, 0, 1, 0.5], [0, 0]],
      ["CUBICSPLINE", [0, 0, 0, 0, 1, 0, 0, 0, 1, 0.5, 0, 0], [0.625, 0.25]]
    ] as const) {
      const asset = await load({ required: true, interpolation, values });
      const scene = asset.createScene();
      const runtime = createGLTFSceneAnimationRuntime({ scene, clips: asset.animations, asset });
      expect(runtime.applyClipByName("expression", 0.5)).toMatchObject({ morphWeightTracksApplied: 1, missingTargets: [] });
      expect(scene.findByName("Target")[0]?.renderable?.morphWeights).toEqual(expected);
      expect(scene.findByName("Other")[0]?.renderable?.morphWeights).toEqual([0, 0]);
    }
  });

  it("preserves separate authored node defaults before and after animating one instance", async () => {
    const asset = await load({ required: true, targetWeights: [0.1, 0.2], otherWeights: [0.6, 0.7] });
    const scene = asset.createScene();
    const untouchedScene = asset.createScene();
    expect(scene.findByName("Target")[0]?.renderable?.morphWeights).toEqual([0.1, 0.2]);
    expect(scene.findByName("Other")[0]?.renderable?.morphWeights).toEqual([0.6, 0.7]);
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: asset.animations, asset });
    expect(runtime.applyClipByName("expression", 1).morphWeightTracksApplied).toBe(1);
    expect(scene.findByName("Target")[0]?.renderable?.morphWeights).toEqual([1, 0.5]);
    expect(scene.findByName("Other")[0]?.renderable?.morphWeights).toEqual([0.6, 0.7]);
    expect(untouchedScene.findByName("Target")[0]?.renderable?.morphWeights).toEqual([0.1, 0.2]);
  });

  it("applies packed weights through both blended and pose-mixer playback", async () => {
    const asset = await load({ required: true });
    const scene = asset.createScene();
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: asset.animations, asset });
    expect(runtime.applyClips([{ clipName: "expression", time: 0.25 }]).morphWeightTracksApplied).toBe(1);
    expect(scene.findByName("Target")[0]?.renderable?.morphWeights).toEqual([0.25, 0.125]);
    runtime.mixer().play("expression");
    expect(runtime.applyPoseMixer(0.5, { restPoseReset: false }).morphWeightTracksApplied).toBe(1);
    expect(scene.findByName("Target")[0]?.renderable?.morphWeights).toEqual([0.5, 0.25]);
    expect(scene.findByName("Other")[0]?.renderable?.morphWeights).toEqual([0, 0]);
  });

  it("applies packed weights through the generic scene animation mixer", async () => {
    const asset = await load({ required: true });
    const scene = asset.createScene();
    const mixer = createGLTFSceneAnimationMixer({ scene, clips: asset.animations, asset });
    expect(mixer.update(0.5).applyResult.morphWeightTracksApplied).toBe(1);
    expect(scene.findByName("Target")[0]?.renderable?.morphWeights).toEqual([0.5, 0.25]);
    expect(scene.findByName("Other")[0]?.renderable?.morphWeights).toEqual([0, 0]);
  });

  it("initializes and animates every primitive of only the addressed mesh instance", async () => {
    const asset = await load({ required: true, primitiveCount: 2, targetWeights: [0.1, 0.2], otherWeights: [0.6, 0.7] });
    const scene = asset.createScene();
    const weightsFor = (name: string) => scene.collectRenderables()
      .filter(({ node }) => node.parent?.name === name)
      .map(({ renderable }) => renderable.morphWeights);
    expect(weightsFor("Target")).toEqual([[0.1, 0.2], [0.1, 0.2]]);
    expect(weightsFor("Other")).toEqual([[0.6, 0.7], [0.6, 0.7]]);
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: asset.animations, asset });
    expect(runtime.applyClipByName("expression", 0.5).morphWeightTracksApplied).toBe(1);
    expect(weightsFor("Target")).toEqual([[0.5, 0.25], [0.5, 0.25]]);
    expect(weightsFor("Other")).toEqual([[0.6, 0.7], [0.6, 0.7]]);
  });

  it.each([false, true] as const)("rejects incorrect packed weight counts and accessor types, required=%s", async (required) => {
    await expect(load({ required, values: [0, 1] })).rejects.toThrow(/weights output count does not match morph target count/);
    await expect(load({ required, outputType: "VEC2" })).rejects.toThrow(/requires a float SCALAR output accessor/);
    await expect(load({ required, inputNormalized: true })).rejects.toThrow(/requires a float SCALAR input accessor/);
    await expect(load({ required, outputNormalized: true })).rejects.toThrow(/requires a float SCALAR output accessor/);
    await expect(load({ required, values: [0, 0, 1, Number.NaN] })).rejects.toThrow(/requires finite scalar values and tangents/);
    await expect(load({ required, times: [0, 0] })).rejects.toThrow(/strictly increasing input times/);
  });

  it("rejects malformed unanimated instance defaults instead of creating a broken scene", async () => {
    const asset = await load({ required: true, otherWeights: [0.1] });
    expect(() => asset.createScene()).toThrow(/glTF node 1 weights must contain one finite number per morph target/);
  });

  it("rejects a required morph pointer when its node has no morph targets", async () => {
    await expect(load({ required: true, missingMorphs: true })).rejects.toThrow(/unsupported required animation pointer/);
  });

  it("diagnoses and drops an optional morph pointer when its node has no morph targets", async () => {
    const asset = await load({ missingMorphs: true });
    expect(asset.animations[0]?.tracks).toEqual([]);
    expect(asset.loaderDiagnostics.unsupportedFeatures).toContain("animation-pointer-unsupported:/nodes/0/weights");
  });

  it("does not misbind an optional mesh-weight pointer to a same-named node", async () => {
    const pointer = "/meshes/0/weights";
    const asset = await load({ pointer, targetName: "FaceMesh", values: [0, 1] });
    const scene = asset.createScene();
    const runtime = createGLTFSceneAnimationRuntime({ scene, clips: asset.animations, asset });
    expect(runtime.applyClipByName("expression", 1).morphWeightTracksApplied).toBe(0);
    expect(scene.findByName("FaceMesh")[0]?.renderable?.morphWeights).toEqual([0, 0]);
    expect(asset.animations[0]?.tracks).toEqual([]);
    expect(asset.loaderDiagnostics.unsupportedFeatures).toContain(`animation-pointer-unsupported:${pointer}`);
    await expect(load({ pointer, required: true, values: [0, 1] })).rejects.toThrow(/unsupported required animation pointer/);
  });

  it.each(["/meshes/00/weights", "/meshes/0/weights\n"] as const)("diagnoses a noncanonical mesh pointer %s", async (pointer) => {
    const asset = await load({ pointer, values: [0, 1] });
    expect(asset.animations[0]?.tracks).toEqual([]);
    expect(asset.loaderDiagnostics.unsupportedFeatures).toContain(`animation-pointer-unsupported:${pointer}`);
  });
});
