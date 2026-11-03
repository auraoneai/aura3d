import { describe, expect, it, vi } from "vitest";
import { AnimationClip, AnimationTrack } from "@aura3d/animation";
import { Material, PBRMaterial, SkinnedLitMaterial } from "@aura3d/rendering";
import { Scene } from "@aura3d/scene";
import { createGLTFSceneAnimationRuntime } from "../../../packages/assets/src/GLTFAnimationRuntime";
import { gltfRuntimeMaterialKey } from "../../../packages/assets/src/GLTFLoader";
import { createTypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor";
import { createGLBActorAnimationMaterialResolver } from "../../../packages/engine/src/production-runtime/actor/TypedGLBActorAnimation";
import { QUALITY_TIERS } from "../../../packages/rendering/src/contracts/quality";

const name = "paint.layer";
const paths = [
  ["extensions.KHR_materials_specular.specularFactor", "u_specularFactor", 0.6],
  ["extensions.KHR_materials_sheen.sheenRoughnessFactor", "u_sheenRoughnessFactor", 0.4],
  ["extensions.KHR_materials_iridescence.iridescenceFactor", "u_iridescenceFactor", 0.7],
  ["extensions.KHR_materials_iridescence.iridescenceIor", "u_iridescenceIor", 1.7]
] as const;
const definition = { name, specular: {}, sheen: {}, iridescence: {} };

function clip(path: string, targetValue: number): AnimationClip {
  return new AnimationClip({ name: path, tracks: [new AnimationTrack({
    target: `material:${name}.${path}`, valueType: "scalar",
    keyframes: [{ time: 0, value: targetValue }, { time: 1, value: targetValue }]
  })] });
}

function runtime(library: Map<string, Material>, materials: readonly { name: string; specular?: unknown; sheen?: unknown; iridescence?: unknown }[] = [definition], overridden = false) {
  return createGLTFSceneAnimationRuntime({
    scene: new Scene(), clips: paths.map(([path, , value]) => clip(path, value)),
    resolveAnimationMaterial: createGLBActorAnimationMaterialResolver(
      { materialLibrary: library }, { materials }, { importedMaterialOverridden: overridden }
    )
  });
}

/** Self-contained glTF data with independent scalar pointer outputs. */
function animatedGltfUrl(): string {
  const data = new Float32Array([
    0, 0, 0, 1, 0, 0, 0, 1, 0,
    0, 0, 1, 0, 0, 1, 0, 0, 1,
    0, 1,
    1, 0.6,
    0.1, 0.4,
    0.2, 0.7,
    1.3, 1.7
  ]);
  const bytes = Buffer.from(data.buffer);
  const document = {
    asset: { version: "2.0" },
    extensionsUsed: ["KHR_animation_pointer", "KHR_materials_specular", "KHR_materials_sheen", "KHR_materials_iridescence"],
    buffers: [{ uri: `data:application/octet-stream;base64,${bytes.toString("base64")}`, byteLength: bytes.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 36 },
      { buffer: 0, byteOffset: 72, byteLength: 8 },
      ...[80, 88, 96, 104].map((byteOffset) => ({ buffer: 0, byteOffset, byteLength: 8 }))
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" },
      ...[2, 3, 4, 5, 6].map((bufferView) => ({ bufferView, componentType: 5126, count: 2, type: "SCALAR" }))
    ],
    materials: [{ name, extensions: {
      KHR_materials_specular: { specularFactor: 1 },
      KHR_materials_sheen: { sheenColorFactor: [0.5, 0.5, 0.5], sheenRoughnessFactor: 0.1 },
      KHR_materials_iridescence: { iridescenceFactor: 0.2, iridescenceIor: 1.3 }
    } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, material: 0 }] }],
    nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0,
    animations: paths.map(([path], index) => ({
      name: path, samplers: [{ input: 2, output: index + 3 }],
      channels: [{ sampler: 0, target: { path: "pointer", extensions: {
        KHR_animation_pointer: { pointer: `/materials/0/${path.replaceAll(".", "/")}` }
      } } }]
    }))
  };
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(document))}`;
}

describe("live physical material pointer animation", () => {
  it("loads and samples four optional pointer leaves through the real typed actor path", async () => {
    const actor = await createTypedGLBActor({ id: "pointer-extra", asset: { url: animatedGltfUrl(), format: "gltf" }, width: 8, height: 8 });
    try {
      for (const [path, parameter, expected] of paths) {
        const result = actor.playClip(path, 1);
        expect(result).toMatchObject({ materialTracksApplied: 1, missingTargets: [] });
        expect(actor.pipeline.resources.materialLibrary.get(name)?.getParameter(parameter)).toBeCloseTo(expected);
      }
    } finally { actor.dispose(); }
  });

  it("updates all variants for a dotted source name without mutating a separate actor", () => {
    const plain = new PBRMaterial({ name });
    const skin = new SkinnedLitMaterial({ name });
    const other = new PBRMaterial({ name });
    const animation = runtime(new Map<string, Material>([[name, plain], [gltfRuntimeMaterialKey(name, { skinned: true }), skin]]));
    for (const [path, parameter, expected] of paths) {
      expect(animation.applyClipByName(path, 1)).toMatchObject({ materialTracksApplied: 1, missingTargets: [] });
      expect(plain.getParameter(parameter)).toBeCloseTo(expected);
      expect(skin.getParameter(parameter)).toBeCloseTo(expected);
      expect(other.getParameter(parameter)).not.toBeCloseTo(expected);
    }
    plain.dispose(); skin.dispose(); other.dispose();
  });

  it("rejects missing or ambiguous source definitions, overrides, alien shaders and disposed variants", () => {
    const plain = new PBRMaterial({ name });
    const path = paths[0][0];
    const target = `material:${name}.${path}`;
    const assertIssue = (animation: ReturnType<typeof runtime>, reason: string) => {
      expect(animation.applyClipByName(path, 1)).toMatchObject({
        materialTracksApplied: 0, materialBindingIssues: [{ target, reason }]
      });
    };
    assertIssue(runtime(new Map([[name, plain]]), [{ name, specular: undefined, sheen: {}, iridescence: {} }]), "unsupported");
    assertIssue(runtime(new Map([[name, plain]]), [definition, definition]), "ambiguous");
    assertIssue(runtime(new Map([[name, plain]]), [definition], true), "unsupported");
    assertIssue(runtime(new Map([[name, plain], ["other", plain]])), "ambiguous");
    const alien = new Material({ name, shaderKey: "custom", parameters: { u_specularFactor: 1 }, uniformSchema: [{ name: "u_specularFactor", kind: "float" }] });
    assertIssue(runtime(new Map([[name, alien]])), "unsupported");
    const disposed = new PBRMaterial({ name }); disposed.dispose();
    assertIssue(runtime(new Map([[name, plain], [gltfRuntimeMaterialKey(name, { skinned: true }), disposed]])), "disposed");
    expect(plain.getParameter("u_specularFactor")).toBe(1);
    alien.dispose(); plain.dispose();
  });

  it("rejects invalid sampled ranges before writing", () => {
    const material = new PBRMaterial({ name });
    const animation = runtime(new Map([[name, material]]));
    const invalid = [
      [paths[0][0], 1.01], [paths[1][0], -0.01], [paths[2][0], 2],
      [paths[3][0], 0.99], [paths[3][0], 1e100]
    ] as const;
    for (const [path, value] of invalid) {
      expect(() => animation.applyAnimationValues("invalid", 0, new Map([[`material:${name}.${path}`, value]]))).toThrow(/out-of-range/);
    }
    expect(material.getParameter("u_specularFactor")).toBe(1);
    expect(material.getParameter("u_iridescenceIor")).toBeCloseTo(1.3);
    material.dispose();
  });

  it("selects the generated physical lobes from the live animated values", () => {
    const material = new PBRMaterial({ name });
    const animation = runtime(new Map([[name, material]]));
    const flags = { values: { A3D_QR_MATERIALS: true }, on: (key: string) => key === "A3D_QR_MATERIALS" };
    expect(material.programFeatures({ flags, tier: QUALITY_TIERS.high }).extensions.map((item) => item.lobe)).not.toContain("iridescence");
    for (const [path] of paths.slice(0, 3)) animation.applyClipByName(path, 1);
    const selected = material.programFeatures({ flags, tier: QUALITY_TIERS.high }).extensions.map((item) => item.lobe);
    expect(selected).toEqual(expect.arrayContaining(["specular", "sheen", "iridescence"]));
    material.dispose();
  });

  it("does not claim support for an incorrectly typed track or an unguarded legacy sink", () => {
    const path = paths[0][0];
    const target = `material:${name}.${path}`;
    const malformed = new AnimationClip({ name: "malformed", tracks: [new AnimationTrack({
      target, valueType: "number-array", keyframes: [{ time: 0, value: [0.5, 0.5] }]
    })] });
    const write = vi.fn();
    const animation = createGLTFSceneAnimationRuntime({
      scene: new Scene(), clips: [malformed, clip(path, 0.6)],
      resolveAnimationMaterial: () => ({ name, setAnimationParameter: write })
    });
    expect(animation.inspectClipBindings("malformed")[0]).toMatchObject({
      unsupportedTracks: [target]
    });
    expect(animation.applyClipByName(path, 0)).toMatchObject({
      materialTracksApplied: 0, materialBindingIssues: [{ target, reason: "unsupported" }]
    });
    expect(write).not.toHaveBeenCalled();
  });

  it("restores already touched variants if a setter throws after mutating", () => {
    const first = new PBRMaterial({ name });
    const second = new PBRMaterial({ name });
    const original = second.setParameter.bind(second);
    vi.spyOn(second, "setParameter").mockImplementationOnce((parameter, value) => {
      original(parameter, value); throw new Error("test write failure");
    });
    const animation = runtime(new Map([[name, first], [gltfRuntimeMaterialKey(name, { instanced: true }), second]]));
    expect(() => animation.applyClipByName(paths[0][0], 1)).toThrow("test write failure");
    expect(first.getParameter("u_specularFactor")).toBe(1);
    expect(second.getParameter("u_specularFactor")).toBe(1);
    first.dispose(); second.dispose();
  });
});
