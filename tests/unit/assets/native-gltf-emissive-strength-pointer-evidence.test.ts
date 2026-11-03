import { describe, expect, it } from "vitest";
import { AnimationClip } from "@aura3d/animation";
import { GLTFLoader, type GLTFAsset } from "../../../packages/assets/src/GLTFLoader";
import { LoadContext } from "../../../packages/assets/src/LoadContext";
import {
  inspectExportPointerChannelProvenance,
  sceneFromGLTFAsset,
  type AuraExportScene
} from "../../../packages/assets/src/exporters/ExportContext";
import { exportGLTF } from "../../../packages/assets/src/exporters/GLTFExporter";

const strengthPath = "extensions/KHR_materials_emissive_strength/emissiveStrength";
const strengthPointer = `/materials/1/${strengthPath}`;
const metallicPointer = "/materials/1/pbrMetallicRoughness/metallicFactor";

// An independently authored glTF, not a document produced by exportGLTF.
// One material has a default emissive extension and several other extensions;
// the other materials include a core default, a nondefault and an unlit material.
function authored(options: {
  required?: boolean;
  strength?: "explicit" | "implicit" | "absent";
  metallicPointer?: boolean;
  strengthPointer?: boolean;
} = {}): Record<string, any> {
  const { required = true, strength = "explicit", metallicPointer: includeMetallic = true, strengthPointer: includeStrength = true } = options;
  const parts = [
    new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    new Float32Array([0, 1]),
    new Float32Array([0.125, 0.75]),
    new Float32Array([1, 4]),
    new Float32Array([0, 0, 0, 2, 4, 6])
  ];
  let offset = 0;
  const bufferViews = parts.map((part) => {
    const view = { buffer: 0, byteOffset: offset, byteLength: part.byteLength };
    offset += part.byteLength;
    return view;
  });
  const bytes = Buffer.concat(parts.map((part) => Buffer.from(part.buffer, part.byteOffset, part.byteLength)));
  const pointerChannel = (sampler: number, pointer: string) => ({
    sampler, target: { path: "pointer", extensions: { KHR_animation_pointer: { pointer } } }
  });
  return {
    asset: { version: "2.0" },
    extensionsUsed: [
      "KHR_animation_pointer", "KHR_materials_emissive_strength", "KHR_materials_clearcoat",
      "KHR_materials_specular", "KHR_materials_sheen", "KHR_materials_unlit"
    ],
    ...(required ? { extensionsRequired: ["KHR_animation_pointer"] } : {}),
    buffers: [{ uri: `data:application/octet-stream;base64,${bytes.toString("base64")}`, byteLength: bytes.length }],
    bufferViews,
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 2, componentType: 5126, count: 2, type: "SCALAR", min: [0], max: [1] },
      { bufferView: 3, componentType: 5126, count: 2, type: "SCALAR" },
      { bufferView: 4, componentType: 5126, count: 2, type: "SCALAR" },
      { bufferView: 5, componentType: 5126, count: 2, type: "VEC3" }
    ],
    materials: [
      { name: "Core" },
      { name: "Paint.layer", emissiveFactor: [0.25, 0.5, 0.75], extensions: {
        KHR_materials_clearcoat: { clearcoatFactor: 0.25, clearcoatRoughnessFactor: 0.5 },
        KHR_materials_specular: { specularFactor: 0.75 },
        KHR_materials_sheen: { sheenColorFactor: [0.125, 0.25, 0.5], sheenRoughnessFactor: 0.375 },
        ...(strength === "absent" ? {} : { KHR_materials_emissive_strength: strength === "explicit" ? { emissiveStrength: 1 } : {} })
      } },
      { name: "Bright", extensions: { KHR_materials_emissive_strength: { emissiveStrength: 3 } } },
      { name: "Unlit", extensions: { KHR_materials_unlit: {} } }
    ],
    meshes: [{ name: "Triangle", primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, material: 1 }] }],
    nodes: [{ name: "Model", mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0,
    animations: [{
      name: "glow-and-move",
      samplers: [
        { input: 2, output: 3, interpolation: "LINEAR" },
        { input: 2, output: 4, interpolation: "LINEAR" },
        { input: 2, output: 5, interpolation: "LINEAR" }
      ],
      channels: [
        ...(includeMetallic ? [pointerChannel(0, metallicPointer)] : []),
        ...(includeStrength ? [pointerChannel(1, strengthPointer)] : []),
        { sampler: 2, target: { node: 0, path: "translation" } }
      ]
    }]
  };
}

const documentUrl = (document: unknown): string =>
  `data:model/gltf+json;base64,${Buffer.from(JSON.stringify(document)).toString("base64")}`;

async function load(loader: GLTFLoader, document: unknown): Promise<GLTFAsset> {
  return loader.load({ url: documentUrl(document), type: "gltf" }, new LoadContext());
}

function json(result: ReturnType<typeof exportGLTF>): Record<string, any> {
  if (!(result.data instanceof Uint8Array)) throw new Error("Expected glTF JSON bytes");
  return JSON.parse(new TextDecoder().decode(result.data));
}

function resultUrl(result: ReturnType<typeof exportGLTF>): string {
  if (!(result.data instanceof Uint8Array)) throw new Error("Expected glTF JSON bytes");
  return `data:model/gltf+json;base64,${Buffer.from(result.data).toString("base64")}`;
}

function scalarAccessor(doc: Record<string, any>, index: number): number[] {
  const accessor = doc.accessors[index], view = doc.bufferViews[accessor.bufferView];
  expect(accessor).toMatchObject({ componentType: 5126, type: "SCALAR", count: 2 });
  const uri = doc.buffers[view.buffer].uri as string;
  const bytes = Buffer.from(uri.slice(uri.indexOf(",") + 1), "base64");
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Array.from({ length: accessor.count }, (_, i) =>
    data.getFloat32((view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + 4 * i, true));
}

function remapMaterials(snapshot: AuraExportScene): AuraExportScene {
  const destination = [1, 3, 0, 2];
  return {
    ...snapshot,
    materials: [snapshot.materials![2]!, snapshot.materials![0]!, snapshot.materials![3]!, snapshot.materials![1]!],
    meshes: snapshot.meshes!.map((mesh) => ({
      ...mesh,
      primitives: mesh.primitives.map((primitive) => ({
        ...primitive,
        ...(primitive.material === undefined ? {} : { material: destination[primitive.material]! })
      }))
    }))
  };
}

describe("default emissive-strength pointer source evidence", () => {
  it.each(["explicit", "implicit"] as const)(
    "round-trips a required %s default with other pointers, extensions, a core channel and material remapping",
    async (strength) => {
      const loader = new GLTFLoader();
      const asset = await load(loader, authored({ strength }));
      try {
        const [metallic, emission, core] = asset.animations[0]!.tracks;
        expect(asset.animationPointerForTrack?.(metallic!)).toMatchObject({ pointer: metallicPointer, required: true });
        expect(asset.animationPointerForTrack?.(emission!)).toMatchObject({ pointer: strengthPointer, required: true });
        expect(asset.animationPointerForTrack?.(core!)).toBeUndefined();
        expect(asset.materials[1]!.emissiveStrength).toBe(1);

        const snapshot = sceneFromGLTFAsset(asset);
        expect(snapshot.materials![1]!.gltf).toMatchObject({
          emissiveStrength: 1,
          clearcoat: { factor: 0.25, roughnessFactor: 0.5 },
          specular: { factor: 0.75 },
          sheen: { roughnessFactor: 0.375 }
        });
        expect(snapshot.materials![0]!.gltf?.emissiveStrength).toBeUndefined();
        expect(snapshot.materials![3]!.gltf?.emissiveStrength).toBeUndefined();
        expect(snapshot.sourceWarnings?.map((warning) => warning.code)).not.toContain("REQUIRED_ANIMATION_POINTER_LOST");

        const remapped = remapMaterials(snapshot);
        const [metallicChannel, strengthChannel] = snapshot.animations![0]!.pointerChannels!;
        expect(inspectExportPointerChannelProvenance(remapped, metallicChannel!)).toMatchObject({
          status: "verified", resolvedPointer: "/materials/3/pbrMetallicRoughness/metallicFactor"
        });
        expect(inspectExportPointerChannelProvenance(remapped, strengthChannel!)).toMatchObject({
          status: "verified", resolvedPointer: `/materials/3/${strengthPath}`,
          provenance: { pointer: strengthPointer, required: true }
        });

        const result = exportGLTF(remapped);
        const doc = json(result), material = doc.materials[3];
        expect(doc.materials.map((entry: any) => entry.name)).toEqual(["Bright", "Core", "Unlit", "Paint.layer"]);
        expect(material.extensions).toMatchObject({
          KHR_materials_emissive_strength: { emissiveStrength: 1 },
          KHR_materials_clearcoat: { clearcoatFactor: 0.25, clearcoatRoughnessFactor: 0.5 },
          KHR_materials_specular: { specularFactor: 0.75 },
          KHR_materials_sheen: { sheenColorFactor: [0.125, 0.25, 0.5], sheenRoughnessFactor: 0.375 }
        });
        expect(doc.materials[1].extensions?.KHR_materials_emissive_strength).toBeUndefined();
        expect(doc.materials[2].extensions).toEqual({ KHR_materials_unlit: {} });
        expect(doc.materials[0].extensions.KHR_materials_emissive_strength.emissiveStrength).toBe(3);
        expect(doc.meshes[0].primitives[0].material).toBe(3);
        expect(doc.extensionsUsed).toEqual(expect.arrayContaining([
          "KHR_animation_pointer", "KHR_materials_emissive_strength", "KHR_materials_clearcoat",
          "KHR_materials_specular", "KHR_materials_sheen", "KHR_materials_unlit"
        ]));
        expect(doc.extensionsRequired).toContain("KHR_animation_pointer");
        const clip = doc.animations[0], paths = clip.channels.map((channel: any) => channel.target.path);
        expect(paths).toEqual(["translation", "pointer", "pointer"]);
        const pointers = clip.channels.slice(1).map((channel: any) => channel.target.extensions.KHR_animation_pointer.pointer);
        expect(pointers).toEqual(["/materials/3/pbrMetallicRoughness/metallicFactor", `/materials/3/${strengthPath}`]);
        const strengthSampler = clip.samplers[clip.channels[2].sampler];
        expect(strengthSampler.interpolation).toBe("LINEAR");
        expect(scalarAccessor(doc, strengthSampler.input)).toEqual([0, 1]);
        expect(scalarAccessor(doc, strengthSampler.output)).toEqual([1, 4]);

        const reloaded = await loader.load({ url: resultUrl(result), type: "gltf" }, new LoadContext());
        try {
          const [reloadedCore, reloadedMetallic, reloadedEmission] = reloaded.animations[0]!.tracks;
          expect(reloaded.animationPointerForTrack?.(reloadedCore!)).toBeUndefined();
          expect(reloaded.animationPointerForTrack?.(reloadedMetallic!)).toMatchObject({
            pointer: "/materials/3/pbrMetallicRoughness/metallicFactor", required: true
          });
          expect(reloaded.animationPointerForTrack?.(reloadedEmission!)).toMatchObject({
            pointer: `/materials/3/${strengthPath}`, required: true
          });
          expect(reloadedEmission!.target).toBe("material:Paint.layer.extensions.KHR_materials_emissive_strength.emissiveStrength");
          for (const time of [0, 0.25, 0.5, 1]) {
            expect(reloadedEmission!.sample(time)).toBeCloseTo(emission!.sample(time) as number, 6);
            expect(reloadedMetallic!.sample(time)).toBeCloseTo(metallic!.sample(time) as number, 6);
            expect(reloadedCore!.sample(time)).toEqual(core!.sample(time));
          }
        } finally {
          loader.dispose(reloaded);
        }
      } finally {
        loader.dispose(asset);
      }
    }
  );

  it("does not infer a default extension for an optional pointer, whether the source object existed or not", async () => {
    const loader = new GLTFLoader();
    const present = await load(loader, authored({ required: false, strength: "explicit" }));
    const absent = await load(loader, authored({ required: false, strength: "absent" }));
    try {
      // At this boundary both source documents have the same target value and
      // document-level extension declarations; only the required loader path
      // checks whether this particular material contained the extension.
      expect(present.materials[1]!.emissiveStrength).toBe(1);
      expect(absent.materials[1]!.emissiveStrength).toBe(1);
      expect(present.loaderDiagnostics.extensionsUsed).toEqual(absent.loaderDiagnostics.extensionsUsed);
      for (const asset of [present, absent]) {
        const snapshot = sceneFromGLTFAsset(asset);
        expect(snapshot.materials![1]!.gltf?.emissiveStrength).toBeUndefined();
        expect(snapshot.sourceWarnings).toContainEqual(expect.objectContaining({ code: "ANIMATION_TRACK_LOST" }));
        expect(snapshot.animations![0]!.pointerChannels!.map((channel) => channel.pointer)).toEqual([metallicPointer]);
        const output = json(exportGLTF(snapshot));
        expect(output.extensionsRequired ?? []).not.toContain("KHR_animation_pointer");
        expect(output.materials[1].extensions.KHR_materials_emissive_strength).toBeUndefined();
        expect(output.materials[1].extensions).toMatchObject({
          KHR_materials_clearcoat: { clearcoatFactor: 0.25 },
          KHR_materials_specular: { specularFactor: 0.75 }
        });
      }
    } finally {
      loader.dispose(present);
      loader.dispose(absent);
    }
  });

  it("keeps distinct required defaults and animation curves bound to their own materials after remapping", async () => {
    const loader = new GLTFLoader();
    const document = authored({ metallicPointer: false });
    document.materials[0].extensions = { KHR_materials_emissive_strength: { emissiveStrength: 1 } };
    document.animations[0].channels.unshift({
      sampler: 0,
      target: { path: "pointer", extensions: { KHR_animation_pointer: { pointer: `/materials/0/${strengthPath}` } } }
    });
    const asset = await load(loader, document);
    try {
      const snapshot = sceneFromGLTFAsset(asset);
      expect(snapshot.materials![0]!.gltf?.emissiveStrength).toBe(1);
      expect(snapshot.materials![1]!.gltf?.emissiveStrength).toBe(1);
      const output = exportGLTF(remapMaterials(snapshot)), doc = json(output);
      const channels = doc.animations[0].channels.slice(1);
      expect(channels.map((channel: any) => channel.target.extensions.KHR_animation_pointer.pointer)).toEqual([
        `/materials/1/${strengthPath}`, `/materials/3/${strengthPath}`
      ]);
      expect(doc.materials[1].name).toBe("Core");
      expect(doc.materials[3].name).toBe("Paint.layer");
      expect(doc.meshes[0].primitives[0].material).toBe(3);
      expect(scalarAccessor(doc, doc.animations[0].samplers[channels[0].sampler].output)).toEqual([0.125, 0.75]);
      expect(scalarAccessor(doc, doc.animations[0].samplers[channels[1].sampler].output)).toEqual([1, 4]);
      const reloaded = await loader.load({ url: resultUrl(output), type: "gltf" }, new LoadContext());
      try {
        const tracks = reloaded.animations[0]!.tracks.slice(1);
        expect(tracks.map((track) => track.target)).toEqual([
          "material:Core.extensions.KHR_materials_emissive_strength.emissiveStrength",
          "material:Paint.layer.extensions.KHR_materials_emissive_strength.emissiveStrength"
        ]);
        expect(tracks.map((track) => reloaded.animationPointerForTrack?.(track)?.required)).toEqual([true, true]);
        expect(tracks.map((track) => track.sample(1))).toEqual([0.75, 4]);
      } finally {
        loader.dispose(reloaded);
      }
    } finally {
      loader.dispose(asset);
    }
  });

  it("rejects a reconstructed required track without inferring a default, while leaving core animation unchanged", async () => {
    const loader = new GLTFLoader();
    const source = await load(loader, authored());
    const core = await load(loader, authored({ required: false, metallicPointer: false, strengthPointer: false }));
    try {
      const reconstructed = AnimationClip.fromJSON(source.animations[0]!.toJSON());
      expect(source.animationPointerForTrack?.(reconstructed.tracks[1]!)).toBeUndefined();
      const snapshot = sceneFromGLTFAsset({ ...source, animations: [reconstructed] });
      expect(snapshot.materials![1]!.gltf?.emissiveStrength).toBeUndefined();
      expect(snapshot.sourceWarnings?.map((warning) => warning.code)).toEqual(expect.arrayContaining([
        "ANIMATION_POINTER_ORIGIN_UNAVAILABLE", "REQUIRED_ANIMATION_POINTER_LOST"
      ]));
      expect(() => exportGLTF(snapshot)).toThrowError(expect.objectContaining({
        code: "GLTF_REQUIRED_ANIMATION_POINTER_LOST", pointer: strengthPointer
      }));

      const noLookup = sceneFromGLTFAsset({ ...source, animationPointerForTrack: undefined });
      const noLookupOutput = exportGLTF(noLookup), noLookupDocument = json(noLookupOutput);
      expect(noLookupOutput.warnings.map((warning) => warning.code)).toContain("ANIMATION_POINTER_ORIGIN_UNAVAILABLE");
      expect(noLookupDocument.materials[1].extensions.KHR_materials_emissive_strength).toBeUndefined();
      expect(noLookupDocument.extensionsRequired ?? []).not.toContain("KHR_animation_pointer");

      const coreSnapshot = sceneFromGLTFAsset(core);
      const coreDocument = json(exportGLTF(coreSnapshot));
      expect(coreSnapshot.materials![1]!.gltf?.emissiveStrength).toBeUndefined();
      expect(coreDocument.materials[1].extensions.KHR_materials_emissive_strength).toBeUndefined();
      expect(coreDocument.animations[0].channels.map((channel: any) => channel.target.path)).toEqual(["translation"]);
    } finally {
      loader.dispose(source);
      loader.dispose(core);
    }
  });

  it("preserves a modified snapshot value without losing unrelated extensions", async () => {
    const loader = new GLTFLoader();
    const asset = await load(loader, authored({ metallicPointer: false }));
    try {
      const snapshot = sceneFromGLTFAsset(asset), material = snapshot.materials![1]!;
      expect(Reflect.set(material.gltf!, "emissiveStrength", 2.5)).toBe(true);
      const doc = json(exportGLTF(remapMaterials(snapshot)));
      expect(doc.materials[3].extensions).toMatchObject({
        KHR_materials_emissive_strength: { emissiveStrength: 2.5 },
        KHR_materials_clearcoat: { clearcoatFactor: 0.25 },
        KHR_materials_specular: { specularFactor: 0.75 },
        KHR_materials_sheen: { sheenRoughnessFactor: 0.375 }
      });
      expect(doc.animations[0].channels[1].target.extensions.KHR_animation_pointer.pointer).toBe(`/materials/3/${strengthPath}`);
    } finally {
      loader.dispose(asset);
    }
  });

  it("retains a changed nondefault material value and required track in a snapshot independent of source disposal", async () => {
    const loader = new GLTFLoader();
    const asset = await load(loader, authored({ metallicPointer: false }));
    expect(Reflect.set(asset.materials[1]!, "emissiveStrength", 2.5)).toBe(true);
    const snapshot = sceneFromGLTFAsset(asset);
    loader.dispose(asset);
    const result = exportGLTF(snapshot), doc = json(result);
    expect(doc.materials[1].extensions).toMatchObject({
      KHR_materials_emissive_strength: { emissiveStrength: 2.5 },
      KHR_materials_clearcoat: { clearcoatFactor: 0.25 },
      KHR_materials_specular: { specularFactor: 0.75 }
    });
    expect(doc.extensionsRequired).toContain("KHR_animation_pointer");
    const reloaded = await loader.load({ url: resultUrl(result), type: "gltf" }, new LoadContext());
    try {
      const track = reloaded.animations[0]!.tracks[1]!;
      expect(reloaded.animationPointerForTrack?.(track)).toMatchObject({ pointer: strengthPointer, required: true });
      expect(track.sample(1)).toBe(4);
      expect(reloaded.materials[1]!.emissiveStrength).toBe(2.5);
    } finally {
      loader.dispose(reloaded);
    }
  });

  it("does not recover a default from an undeclared material extension", async () => {
    const loader = new GLTFLoader();
    const document = authored({ metallicPointer: false });
    document.extensionsUsed = document.extensionsUsed.filter((name: string) => name !== "KHR_materials_emissive_strength");
    const asset = await load(loader, document);
    try {
      const snapshot = sceneFromGLTFAsset(asset);
      expect(snapshot.materials![1]!.gltf?.emissiveStrength).toBeUndefined();
      expect(() => exportGLTF(snapshot)).toThrowError(expect.objectContaining({
        code: "GLTF_REQUIRED_ANIMATION_POINTER_LOST", pointer: strengthPointer
      }));
    } finally {
      loader.dispose(asset);
    }
  });

  it("fails closed when document-level requiredness no longer corroborates the source track", async () => {
    const loader = new GLTFLoader();
    const asset = await load(loader, authored({ metallicPointer: false }));
    try {
      const incomplete = {
        ...asset,
        loaderDiagnostics: { ...asset.loaderDiagnostics, extensionsRequired: [] }
      };
      const snapshot = sceneFromGLTFAsset(incomplete);
      expect(snapshot.materials![1]!.gltf?.emissiveStrength).toBeUndefined();
      expect(() => exportGLTF(snapshot)).toThrowError(expect.objectContaining({
        code: "GLTF_REQUIRED_ANIMATION_POINTER_LOST", pointer: strengthPointer
      }));
    } finally {
      loader.dispose(asset);
    }
  });

  it.each(["track-target", "track-value", "duplicate-name", "wrong-source-index", "unlit"] as const)(
    "does not assign a required default extension after an invalid or ambiguous source edit: %s",
    async (edit) => {
      const loader = new GLTFLoader();
      const asset = await load(loader, authored({ metallicPointer: false }));
      try {
        if (edit === "track-target") {
          expect(Reflect.set(asset.animations[0]!.tracks[0]!, "target", `material:Core.${strengthPath.replaceAll("/", ".")}`)).toBe(true);
        } else if (edit === "track-value") {
          expect(Reflect.set(asset.animations[0]!.tracks[0]!.keyframes[1]!, "value", -1)).toBe(true);
        } else if (edit === "duplicate-name") {
          expect(Reflect.set(asset.materials[0]!, "name", "Paint.layer")).toBe(true);
        } else if (edit === "wrong-source-index") {
          const materials = [...asset.materials];
          [materials[0], materials[1]] = [materials[1]!, materials[0]!];
          expect(Reflect.set(asset, "materials", materials)).toBe(true);
        } else {
          expect(Reflect.set(asset.materials[1]!, "unlit", true)).toBe(true);
        }
        const snapshot = sceneFromGLTFAsset(asset);
        expect(snapshot.materials?.every((material) => material.name !== "Paint.layer" || material.gltf?.emissiveStrength === undefined)).toBe(true);
        expect(snapshot.sourceWarnings).toContainEqual(expect.objectContaining({ code: "REQUIRED_ANIMATION_POINTER_LOST" }));
        expect(() => exportGLTF(snapshot)).toThrowError(expect.objectContaining({
          code: "GLTF_REQUIRED_ANIMATION_POINTER_LOST", pointer: strengthPointer
        }));
      } finally {
        loader.dispose(asset);
      }
    }
  );

  it("fails closed if the required snapshot material is replaced or its emitted extension is removed", async () => {
    const loader = new GLTFLoader();
    const asset = await load(loader, authored({ metallicPointer: false }));
    try {
      const snapshot = sceneFromGLTFAsset(asset), material = snapshot.materials![1]!;
      const replaced = { ...snapshot, materials: snapshot.materials!.map((value, i) => i === 1 ? { ...value } : value) };
      expect(() => exportGLTF(replaced)).toThrowError(expect.objectContaining({
        code: "GLTF_REQUIRED_ANIMATION_POINTER_LOST", pointer: strengthPointer
      }));
      expect(Reflect.deleteProperty(material.gltf!, "emissiveStrength")).toBe(true);
      expect(material.gltf).toMatchObject({ clearcoat: { factor: 0.25 }, specular: { factor: 0.75 } });
      expect(() => exportGLTF(snapshot)).toThrowError(expect.objectContaining({
        code: "GLTF_REQUIRED_ANIMATION_POINTER_LOST", pointer: strengthPointer
      }));
    } finally {
      loader.dispose(asset);
    }
  });

  it("does not admit a required emissive pointer whose source material lacks the extension", async () => {
    const loader = new GLTFLoader();
    await expect(load(loader, authored({ strength: "absent" }))).rejects.toThrow(/unsupported required animation pointer/);
  });
});
