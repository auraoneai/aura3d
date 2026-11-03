import { describe, expect, it, vi } from "vitest";
import { AnimationClip } from "@aura3d/animation";
import { GLTFLoader, type GLTFAsset } from "../../../packages/assets/src/GLTFLoader";
import { LoadContext } from "../../../packages/assets/src/LoadContext";
import {
  inspectExportPointerChannelProvenance,
  sceneFromGLTFAsset,
  type AuraExportScene
} from "../../../packages/assets/src/exporters/ExportContext";
import { exportGLTF } from "../../../packages/assets/src/exporters/GLTFExporter";

const field = "extensions/KHR_materials_emissive_strength/emissiveStrength";
const pointer = `/materials/1/${field}`;

// Authored independently of the exporter. "absent" and the default-valued
// extension produce indistinguishable GLTFMaterialAsset values in the loader.
function authored(required: boolean, strength: "absent" | "implicit" | number): Record<string, any> {
  const values = new Float32Array([0, 1, 1, 4]);
  const bytes = Buffer.from(values.buffer);
  return {
    asset: { version: "2.0" },
    extensionsUsed: ["KHR_animation_pointer", "KHR_materials_emissive_strength", "KHR_materials_sheen"],
    ...(required ? { extensionsRequired: ["KHR_animation_pointer"] } : {}),
    buffers: [{ uri: `data:application/octet-stream;base64,${bytes.toString("base64")}`, byteLength: bytes.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 8 },
      { buffer: 0, byteOffset: 8, byteLength: 8 }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, type: "SCALAR", count: 2, min: [0], max: [1] },
      { bufferView: 1, componentType: 5126, type: "SCALAR", count: 2 }
    ],
    materials: [
      { name: "Other" },
      {
        name: "Glow",
        emissiveFactor: [0.25, 0.5, 1],
        extensions: {
          KHR_materials_sheen: { sheenRoughnessFactor: 0.25 },
          ...(strength === "absent" ? {} : {
            KHR_materials_emissive_strength: strength === "implicit" ? {} : { emissiveStrength: strength }
          })
        }
      }
    ],
    nodes: [{ name: "Root" }],
    scenes: [{ nodes: [0] }],
    scene: 0,
    animations: [{
      name: "glow",
      samplers: [{ input: 0, output: 1, interpolation: "LINEAR" }],
      channels: [{ sampler: 0, target: { path: "pointer", extensions: { KHR_animation_pointer: { pointer } } } }]
    }]
  };
}

function url(document: unknown): string {
  return `data:model/gltf+json;base64,${Buffer.from(JSON.stringify(document)).toString("base64")}`;
}

async function load(loader: GLTFLoader, document: unknown): Promise<GLTFAsset> {
  return loader.load({ url: url(document), type: "gltf" }, new LoadContext());
}

function json(result: ReturnType<typeof exportGLTF>): Record<string, any> {
  if (!(result.data instanceof Uint8Array)) throw new Error("Expected glTF JSON bytes");
  return JSON.parse(new TextDecoder().decode(result.data));
}

function resultUrl(result: ReturnType<typeof exportGLTF>): string {
  if (!(result.data instanceof Uint8Array)) throw new Error("Expected glTF JSON bytes");
  return `data:model/gltf+json;base64,${Buffer.from(result.data).toString("base64")}`;
}

function expectRequiredLoss(snapshot: AuraExportScene): void {
  expect(snapshot.materials![1]!.gltf?.emissiveStrength).toBeUndefined();
  expect(snapshot.materials![1]!.gltf?.sheen?.roughnessFactor).toBe(0.25);
  expect(snapshot.sourceWarnings).toContainEqual(expect.objectContaining({
    code: "REQUIRED_ANIMATION_POINTER_LOST", path: "animations[0].tracks[0]"
  }));
  expect(() => exportGLTF(snapshot)).toThrowError(expect.objectContaining({
    code: "GLTF_REQUIRED_ANIMATION_POINTER_LOST", path: "animations[0].tracks[0]", pointer
  }));
}

describe("required default emissive-strength source material identity", () => {
  it.each(["implicit", 1] as const)(
    "retains an authored %s default for the original track and material through repeated reloads",
    async (strength) => {
      const loader = new GLTFLoader();
      const asset = await load(loader, authored(true, strength));
      try {
        const track = asset.animations[0]!.tracks[0]!;
        const origin = asset.animationPointerForTrack?.(track);
        expect(origin).toEqual({ animationIndex: 0, channelIndex: 0, pointer, required: true });
        expect(Object.isFrozen(origin)).toBe(true);
        expect(Object.keys(origin!)).toEqual(["animationIndex", "channelIndex", "pointer", "required"]);
        expect(asset.materials[1]!.emissiveStrength).toBe(1);

        const snapshot = sceneFromGLTFAsset(asset);
        expect(snapshot.materials![1]!.gltf).toMatchObject({ emissiveStrength: 1, sheen: { roughnessFactor: 0.25 } });
        expect(snapshot.sourceWarnings?.map((warning) => warning.code)).not.toContain("REQUIRED_ANIMATION_POINTER_LOST");
        const output = exportGLTF(snapshot), document = json(output);
        expect(document.materials[1].extensions.KHR_materials_emissive_strength).toEqual({ emissiveStrength: 1 });
        expect(document.extensionsRequired).toContain("KHR_animation_pointer");
        expect(document.animations[0].channels[0].target.extensions.KHR_animation_pointer.pointer).toBe(pointer);

        const reloaded = await loader.load({ url: resultUrl(output), type: "gltf" }, new LoadContext());
        try {
          const reloadedTrack = reloaded.animations[0]!.tracks[0]!;
          expect(reloadedTrack).not.toBe(track);
          expect(asset.animationPointerForTrack?.(reloadedTrack)).toBeUndefined();
          expect(reloaded.animationPointerForTrack?.(reloadedTrack)).toMatchObject({ pointer, required: true });
          expect(reloadedTrack.sample(0.5)).toBe(track.sample(0.5));
          const secondOutput = exportGLTF(sceneFromGLTFAsset(reloaded));
          expect(json(secondOutput).materials[1].extensions.KHR_materials_emissive_strength).toEqual({ emissiveStrength: 1 });
          const secondReload = await loader.load({ url: resultUrl(secondOutput), type: "gltf" }, new LoadContext());
          try {
            const secondTrack = secondReload.animations[0]!.tracks[0]!;
            expect(secondReload.animationPointerForTrack?.(secondTrack)).toMatchObject({ pointer, required: true });
            expect(secondTrack.sample(0.5)).toBe(2.5);
          } finally {
            loader.dispose(secondReload);
          }
        } finally {
          loader.dispose(reloaded);
        }
      } finally {
        loader.dispose(asset);
      }
    }
  );

  it("does not transfer a required source extension to a different same-named material", async () => {
    const loader = new GLTFLoader();
    const required = await load(loader, authored(true, 1));
    const absent = await load(loader, authored(false, "absent"));
    try {
      const original = required.materials[1]!;
      const foreign = absent.materials[1]!;
      expect(foreign).not.toBe(original);
      expect(foreign).toEqual(original);
      expect(required.loaderDiagnostics.extensionsUsed).toEqual(absent.loaderDiagnostics.extensionsUsed);
      // Public provenance is unchanged, but the private track evidence still
      // points to the original material object observed during loading.
      expect(Reflect.set(required.materials, "1", foreign)).toBe(true);
      expect(required.animationPointerForTrack?.(required.animations[0]!.tracks[0]!)).toMatchObject({
        pointer, required: true
      });
      expectRequiredLoss(sceneFromGLTFAsset(required));
    } finally {
      loader.dispose(required);
      loader.dispose(absent);
    }
  });

  it.each(["clone", "foreign-authored-default"] as const)(
    "rejects a %s material even when its value and extension are indistinguishable",
    async (replacement) => {
      const loader = new GLTFLoader();
      const asset = await load(loader, authored(true, 1));
      const other = await load(loader, authored(true, 1));
      try {
        const material = asset.materials[1]!;
        const substitute = replacement === "clone" ? { ...material } : other.materials[1]!;
        expect(substitute).not.toBe(material);
        expect(substitute).toEqual(material);
        expect(Reflect.set(asset.materials, "1", substitute)).toBe(true);
        const snapshot = sceneFromGLTFAsset(asset);
        expectRequiredLoss(snapshot);
        // A display warning is not the required-pointer loss contract.
        expect(Reflect.set(snapshot, "sourceWarnings", [])).toBe(true);
        expect(() => exportGLTF(snapshot)).toThrowError(expect.objectContaining({
          code: "GLTF_REQUIRED_ANIMATION_POINTER_LOST", pointer
        }));
      } finally {
        loader.dispose(asset);
        loader.dispose(other);
      }
    }
  );

  it("rejects replacing a required-default material with a same-named nondefault material", async () => {
    const loader = new GLTFLoader();
    const asset = await load(loader, authored(true, 1));
    const other = await load(loader, authored(false, 2));
    try {
      expect(other.materials[1]!.name).toBe(asset.materials[1]!.name);
      expect(Reflect.set(asset.materials, "1", other.materials[1]!)).toBe(true);
      const snapshot = sceneFromGLTFAsset(asset);
      // The replacement's own nondefault data is not erased, but it must not
      // acquire the original required track's identity.
      expect(snapshot.materials![1]!.gltf?.emissiveStrength).toBe(2);
      expect(snapshot.sourceWarnings).toContainEqual(expect.objectContaining({
        code: "REQUIRED_ANIMATION_POINTER_LOST", path: "animations[0].tracks[0]"
      }));
      expect(() => exportGLTF(snapshot)).toThrowError(expect.objectContaining({
        code: "GLTF_REQUIRED_ANIMATION_POINTER_LOST", pointer
      }));
    } finally {
      loader.dispose(asset);
      loader.dispose(other);
    }
  });

  it("rejects duplicated source material references and coherently renamed targets", async () => {
    const loader = new GLTFLoader();
    const duplicate = await load(loader, authored(true, 1));
    const renamed = await load(loader, authored(true, 1));
    try {
      expect(Reflect.set(duplicate.materials, "0", duplicate.materials[1]!)).toBe(true);
      expectRequiredLoss(sceneFromGLTFAsset(duplicate));

      const material = renamed.materials[1]!;
      const track = renamed.animations[0]!.tracks[0]!;
      expect(Reflect.set(material, "name", "Renamed")).toBe(true);
      expect(Reflect.set(track, "target", `material:Renamed.${field.replaceAll("/", ".")}`)).toBe(true);
      expectRequiredLoss(sceneFromGLTFAsset(renamed));
    } finally {
      loader.dispose(duplicate);
      loader.dispose(renamed);
    }
  });

  it("does not accept a reconstructed or foreign track with borrowed required provenance", async () => {
    const loader = new GLTFLoader();
    const asset = await load(loader, authored(true, 1));
    const other = await load(loader, authored(true, 1));
    try {
      const original = asset.animations[0]!.tracks[0]!;
      const origin = asset.animationPointerForTrack!(original)!;
      const reconstructed = AnimationClip.fromJSON(asset.animations[0]!.toJSON());
      const foreign = other.animations[0]!;
      expect(reconstructed.tracks[0]).not.toBe(original);
      expect(foreign.tracks[0]).not.toBe(original);
      expect(other.animationPointerForTrack!(foreign.tracks[0]!)).toEqual(origin);
      for (const clip of [reconstructed, foreign]) {
        const claimed = { ...asset, animations: [clip], animationPointerForTrack: () => origin };
        expectRequiredLoss(sceneFromGLTFAsset(claimed));
      }
    } finally {
      loader.dispose(asset);
      loader.dispose(other);
    }
  });

  it.each(["reconstructed", "foreign", "duplicate", "removed"] as const)(
    "rejects an original required track that was %s while its loader lookup remains",
    async (edit) => {
      const loader = new GLTFLoader();
      const asset = await load(loader, authored(true, 1));
      const other = await load(loader, authored(true, 1));
      try {
        const clip = asset.animations[0]!;
        const original = clip.tracks[0]!;
        const reconstructed = AnimationClip.fromJSON(clip.toJSON()).tracks[0]!;
        const replacement = edit === "reconstructed" ? [reconstructed]
          : edit === "foreign" ? [other.animations[0]!.tracks[0]!]
          : edit === "duplicate" ? [original, original] : [];
        expect(Reflect.set(clip, "tracks", replacement)).toBe(true);
        const snapshot = sceneFromGLTFAsset(asset);
        expect(snapshot.sourceWarnings).toContainEqual(expect.objectContaining({
          code: "REQUIRED_ANIMATION_POINTER_LOST", path: "animations[0].tracks[0]"
        }));
        expect(() => exportGLTF(snapshot)).toThrowError(expect.objectContaining({
          code: "GLTF_REQUIRED_ANIMATION_POINTER_LOST", path: "animations[0].tracks[0]", pointer
        }));
        if (edit !== "duplicate") expect(snapshot.materials![1]!.gltf?.emissiveStrength).toBeUndefined();
      } finally {
        loader.dispose(asset);
        loader.dispose(other);
      }
    }
  );

  it("leaves source objects and author-owned provenance untouched", async () => {
    const loader = new GLTFLoader();
    const asset = await load(loader, authored(true, "implicit"));
    try {
      const material = asset.materials[1]!;
      const track = asset.animations[0]!.tracks[0]!;
      const origin = asset.animationPointerForTrack!(track)!;
      const materialKeys = Reflect.ownKeys(material);
      const trackKeys = Reflect.ownKeys(track);
      const before = asset.toJSON();
      expect(Reflect.set(origin, "required", false)).toBe(false);
      expect(Reflect.set(asset, "animationPointerForTrack", () => undefined)).toBe(false);
      Object.freeze(material);
      Object.freeze(track);
      Object.freeze(asset.materials);

      const snapshot = sceneFromGLTFAsset(asset);
      expect(snapshot.materials![1]!.gltf?.emissiveStrength).toBe(1);
      expect(json(exportGLTF(snapshot)).extensionsRequired).toContain("KHR_animation_pointer");
      expect(Reflect.ownKeys(material)).toEqual(materialKeys);
      expect(Reflect.ownKeys(track)).toEqual(trackKeys);
      expect(asset.toJSON()).toEqual(before);

      // A structural adapter owns this otherwise equal provenance object. It
      // cannot forge loader evidence, and inspection must not freeze or edit it.
      const authorOwned = { ...origin, note: "author-owned" };
      const descriptors = Object.getOwnPropertyDescriptors(authorOwned);
      const claimed = { ...asset, animationPointerForTrack: () => authorOwned };
      expectRequiredLoss(sceneFromGLTFAsset(claimed));
      expect(Object.isExtensible(authorOwned)).toBe(true);
      expect(Object.isFrozen(authorOwned)).toBe(false);
      expect(Object.getOwnPropertyDescriptors(authorOwned)).toEqual(descriptors);
    } finally {
      loader.dispose(asset);
    }
  });

  it.each(["foreign-before", "foreign-after", "foreign-before-overridden-slice"] as const)(
    "rejects a material swap during an author-owned provenance callback: %s",
    async (swap) => {
      const loader = new GLTFLoader();
      const asset = await load(loader, authored(true, 1));
      const other = await load(loader, authored(false, "absent"));
      try {
        const genuine = asset.materials[1]!;
        const foreign = other.materials[1]!;
        expect(foreign).toEqual(genuine);
        const materials = [...asset.materials];
        const foreignBefore = swap !== "foreign-after";
        if (foreignBefore) materials[1] = foreign;
        if (swap === "foreign-before-overridden-slice") {
          Object.defineProperty(materials, "slice", { value: () => materials, configurable: true });
        }
        const claimed = {
          ...asset,
          materials,
          animationPointerForTrack: (track: (typeof asset.animations)[number]["tracks"][number]) => {
            materials[1] = foreignBefore ? genuine : foreign;
            return asset.animationPointerForTrack?.(track);
          }
        };
        expectRequiredLoss(sceneFromGLTFAsset(claimed));
        expect(asset.materials[1]).toBe(genuine);
      } finally {
        loader.dispose(asset);
        loader.dispose(other);
      }
    }
  );

  it("does not recover an out-of-date default when a provenance callback edits the source value", async () => {
    const loader = new GLTFLoader();
    const asset = await load(loader, authored(true, 1));
    try {
      const material = asset.materials[1]!;
      const claimed = {
        ...asset,
        animationPointerForTrack: (track: (typeof asset.animations)[number]["tracks"][number]) => {
          expect(Reflect.set(material, "emissiveStrength", 2)).toBe(true);
          return asset.animationPointerForTrack?.(track);
        }
      };
      expectRequiredLoss(sceneFromGLTFAsset(claimed));
    } finally {
      loader.dispose(asset);
    }
  });

  it("does not admit a required pointer to a material without the extension", async () => {
    const loader = new GLTFLoader();
    const document = authored(true, "absent");
    document.materials[0].extensions = { KHR_materials_emissive_strength: { emissiveStrength: 2 } };
    await expect(load(loader, document)).rejects.toThrow(/unsupported required animation pointer/);
  });

  it("does not mistake a folded nondefault source strength for an authored default", async () => {
    const loader = new GLTFLoader();
    const explicitDefault = authored(true, 1);
    const folded = authored(true, 0.5);
    explicitDefault.materials[1].emissiveFactor = [1, 0.5, 0];
    folded.materials[1].emissiveFactor = [2, 1, 0];
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    let first: GLTFAsset | undefined;
    let second: GLTFAsset | undefined;
    try {
      first = await load(loader, explicitDefault);
      second = await load(loader, folded);
      // resolveEmissive folds the HDR factor into the strength. The public
      // provenance and runtime materials look identical despite different
      // authored values, so only the genuine source default is recoverable.
      expect(first.materials[1]).toEqual(second.materials[1]);
      expect(first.materials[1]!.emissiveStrength).toBe(1);
      expect(first.animationPointerForTrack?.(first.animations[0]!.tracks[0]!))
        .toEqual(second.animationPointerForTrack?.(second.animations[0]!.tracks[0]!));
      const snapshot = sceneFromGLTFAsset(first);
      expect(snapshot.materials![1]!.gltf?.emissiveStrength).toBe(1);
      expect(json(exportGLTF(snapshot)).materials[1].extensions.KHR_materials_emissive_strength).toEqual({ emissiveStrength: 1 });
      expectRequiredLoss(sceneFromGLTFAsset(second));
    } finally {
      warning.mockRestore();
      if (first) loader.dispose(first);
      if (second) loader.dispose(second);
    }
  });

  it.each([null, -1, "1"] as const)(
    "does not turn a repaired authored strength %s into default evidence",
    async (strength) => {
      const loader = new GLTFLoader();
      const document = authored(true, 1);
      document.materials[1].extensions.KHR_materials_emissive_strength.emissiveStrength = strength;
      const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
      let asset: GLTFAsset | undefined;
      try {
        asset = await load(loader, document);
        expect(asset.materials[1]!.emissiveStrength).toBe(1);
        expectRequiredLoss(sceneFromGLTFAsset(asset));
      } finally {
        warning.mockRestore();
        if (asset) loader.dispose(asset);
      }
    }
  );

  it("does not trust a fabricated declaration for an originally undeclared extension", async () => {
    const loader = new GLTFLoader();
    const document = authored(true, 1);
    document.extensionsUsed = document.extensionsUsed.filter((extension: string) => extension !== "KHR_materials_emissive_strength");
    const asset = await load(loader, document);
    try {
      const claimed = {
        ...asset,
        loaderDiagnostics: {
          ...asset.loaderDiagnostics,
          extensionsUsed: [...asset.loaderDiagnostics.extensionsUsed, "KHR_materials_emissive_strength"]
        }
      };
      expectRequiredLoss(sceneFromGLTFAsset(claimed));
    } finally {
      loader.dispose(asset);
    }
  });

  it("does not fabricate a default for a structural adapter claiming required provenance", async () => {
    const loader = new GLTFLoader();
    const optional = await load(loader, authored(false, "absent"));
    try {
      const claimed = {
        ...optional,
        loaderDiagnostics: { ...optional.loaderDiagnostics, extensionsRequired: ["KHR_animation_pointer"] },
        animationPointerForTrack: () => Object.freeze({ animationIndex: 0, channelIndex: 0, pointer, required: true })
      };
      expectRequiredLoss(sceneFromGLTFAsset(claimed));
    } finally {
      loader.dispose(optional);
    }
  });

  it("does not infer an extension from optional or reconstructed tracks without a loader lookup", async () => {
    const loader = new GLTFLoader();
    const present = await load(loader, authored(false, 1));
    const absent = await load(loader, authored(false, "absent"));
    const required = await load(loader, authored(true, 1));
    try {
      for (const asset of [present, absent]) {
        const snapshot = sceneFromGLTFAsset(asset);
        const output = exportGLTF(snapshot), document = json(output);
        expect(snapshot.materials![1]!.gltf?.emissiveStrength).toBeUndefined();
        expect(snapshot.sourceWarnings).toContainEqual(expect.objectContaining({ code: "ANIMATION_TRACK_LOST" }));
        expect(document.materials[1].extensions?.KHR_materials_emissive_strength).toBeUndefined();
        expect(document.extensionsRequired ?? []).not.toContain("KHR_animation_pointer");
        expect(document.extensionsUsed ?? []).not.toContain("KHR_animation_pointer");
      }
      const clip = AnimationClip.fromJSON(required.animations[0]!.toJSON());
      expect(required.animationPointerForTrack?.(clip.tracks[0]!)).toBeUndefined();
      const snapshot = sceneFromGLTFAsset({ ...required, animations: [clip] });
      expectRequiredLoss(snapshot);
      const unknown = sceneFromGLTFAsset({ ...required, animations: [clip], animationPointerForTrack: undefined });
      const output = exportGLTF(unknown), document = json(output);
      expect(unknown.materials![1]!.gltf?.emissiveStrength).toBeUndefined();
      expect(document.materials[1].extensions?.KHR_materials_emissive_strength).toBeUndefined();
      expect(document.extensionsRequired ?? []).not.toContain("KHR_animation_pointer");
      expect(output.warnings).toContainEqual(expect.objectContaining({ code: "ANIMATION_POINTER_ORIGIN_UNAVAILABLE" }));
    } finally {
      loader.dispose(present);
      loader.dispose(absent);
      loader.dispose(required);
    }
  });

  it("still round-trips a retained nondefault required value through material remapping", async () => {
    const loader = new GLTFLoader();
    const asset = await load(loader, authored(true, 2));
    try {
      const track = asset.animations[0]!.tracks[0]!;
      const snapshot = sceneFromGLTFAsset(asset);
      const channel = snapshot.animations![0]!.pointerChannels![0]!;
      const reordered: AuraExportScene = {
        ...snapshot,
        materials: [snapshot.materials![1]!, snapshot.materials![0]!]
      };
      expect(inspectExportPointerChannelProvenance(reordered, channel)).toMatchObject({
        status: "verified", resolvedPointer: `/materials/0/${field}`,
        provenance: { pointer, required: true }
      });
      const output = exportGLTF(reordered), document = json(output);
      expect(document.materials[0].extensions).toMatchObject({
        KHR_materials_emissive_strength: { emissiveStrength: 2 },
        KHR_materials_sheen: { sheenRoughnessFactor: 0.25 }
      });
      expect(document.extensionsRequired).toContain("KHR_animation_pointer");
      expect(document.animations[0].channels[0].target.extensions.KHR_animation_pointer.pointer).toBe(`/materials/0/${field}`);
      const reloaded = await loader.load({ url: resultUrl(output), type: "gltf" }, new LoadContext());
      try {
        const reloadedTrack = reloaded.animations[0]!.tracks[0]!;
        expect(reloaded.animationPointerForTrack?.(reloadedTrack)).toMatchObject({
          pointer: `/materials/0/${field}`, required: true
        });
        expect(reloadedTrack.sample(0.5)).toBe(track.sample(0.5));
      } finally {
        loader.dispose(reloaded);
      }
    } finally {
      loader.dispose(asset);
    }
  });

  it("retains an explicitly edited snapshot default and its verified required pointer", async () => {
    const loader = new GLTFLoader();
    const asset = await load(loader, authored(true, 2));
    try {
      const snapshot = sceneFromGLTFAsset(asset);
      const material = snapshot.materials![1]!;
      const channel = snapshot.animations![0]!.pointerChannels![0]!;
      expect(Reflect.set(material.gltf!, "emissiveStrength", 1)).toBe(true);
      expect(inspectExportPointerChannelProvenance(snapshot, channel)).toMatchObject({
        status: "verified", provenance: { pointer, required: true }
      });
      const output = exportGLTF(snapshot), document = json(output);
      expect(document.materials[1].extensions.KHR_materials_emissive_strength).toEqual({ emissiveStrength: 1 });
      expect(document.extensionsRequired).toContain("KHR_animation_pointer");
      expect(document.animations[0].channels[0].target.extensions.KHR_animation_pointer.pointer).toBe(pointer);
      const reloaded = await loader.load({ url: resultUrl(output), type: "gltf" }, new LoadContext());
      try {
        const track = reloaded.animations[0]!.tracks[0]!;
        expect(reloaded.animationPointerForTrack?.(track)).toMatchObject({ pointer, required: true });
        expect(reloaded.materials[1]!.emissiveStrength).toBe(1);
        expect(track.sample(0.5)).toBe(2.5);
      } finally {
        loader.dispose(reloaded);
      }
    } finally {
      loader.dispose(asset);
    }
  });

  it("exports an explicitly authored snapshot default with a valid optional pointer, without inventing provenance", async () => {
    const scene: AuraExportScene = {
      nodes: [{ name: "Root" }],
      roots: [0],
      materials: [{ name: "Glow", gltf: { emissiveStrength: 1 } }],
      animations: [{
        channels: [],
        pointerChannels: [{
          pointer: `/materials/0/${field}`,
          times: { itemSize: 1, values: new Float32Array([0, 1]) },
          values: { itemSize: 1, values: new Float32Array([1, 4]) }
        }]
      }]
    };
    const output = exportGLTF(scene), document = json(output);
    expect(document.materials[0].extensions.KHR_materials_emissive_strength).toEqual({ emissiveStrength: 1 });
    expect(document.extensionsUsed).toEqual(expect.arrayContaining(["KHR_animation_pointer", "KHR_materials_emissive_strength"]));
    expect(document.extensionsRequired ?? []).not.toContain("KHR_animation_pointer");
    expect(output.warnings).toContainEqual(expect.objectContaining({ code: "ANIMATION_POINTER_REQUIREDNESS_UNAVAILABLE" }));
    const loader = new GLTFLoader();
    const reloaded = await loader.load({ url: resultUrl(output), type: "gltf" }, new LoadContext());
    try {
      const track = reloaded.animations[0]!.tracks[0]!;
      expect(reloaded.animationPointerForTrack?.(track)).toMatchObject({
        pointer: `/materials/0/${field}`, required: false
      });
      expect(track.sample(1)).toBe(4);
    } finally {
      loader.dispose(reloaded);
    }
  });
});
