import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GLTFLoader, LoadContext, createGLTFRenderResources } from "../../../../packages/assets/src";
import type { GLTFAsset, GLTFRenderResourceOptions } from "../../../../packages/assets/src";
import type { Material } from "../../../../packages/rendering/src";
import {
  QUALITY_TIERS,
  materialLobes,
  type MaterialFeatureContext,
  type QrFlagName,
  type QrFlagValue,
  type QrFlags
} from "../../../../packages/rendering/src/contracts";
import { registerPrd04MaterialLobes } from "../../../../packages/rendering/src/lanes/prd04";

const COMPARE_TRANSMISSION_GLB = "fixtures/asset-corpus/compare-transmission.glb";
const DUCK_GLB = "fixtures/threejs-parity/assets/physics/duck.glb";

registerPrd04MaterialLobes();

const flagsOf = (values: Partial<Record<QrFlagName, QrFlagValue>>): QrFlags => ({
  values,
  on: (name) => values[name] === true
});
const FLAGS_ON = flagsOf({ A3D_QR_MATERIALS: true, A3D_QR_MATERIALS_TRANSMISSION: true });
const FLAGS_OFF = flagsOf({});
const featureCtx = (flags: QrFlags): MaterialFeatureContext => ({ flags, tier: QUALITY_TIERS.high });

interface GlbJson {
  materials?: { name?: string; extensions?: Record<string, unknown>; emissiveFactor?: number[] }[];
  meshes?: { primitives: { material?: number }[] }[];
  [key: string]: unknown;
}

function readGlb(file: string): { json: GlbJson; bin: Buffer } {
  const buf = readFileSync(file);
  const jsonLength = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString("utf8")) as GlbJson;
  const binStart = 20 + jsonLength;
  const binLength = buf.readUInt32LE(binStart);
  return { json, bin: buf.subarray(binStart + 8, binStart + 8 + binLength) };
}

/** Re-pack a GLB (JSON chunk padded with spaces, BIN chunk with zeros — glTF 2.0 §4.4.3). */
function packGlb(json: GlbJson, bin: Buffer): Buffer {
  const pad = (n: number) => (4 - (n % 4)) % 4;
  const jsonBytes = Buffer.from(JSON.stringify(json), "utf8");
  const jsonChunk = Buffer.concat([jsonBytes, Buffer.alloc(pad(jsonBytes.length), 0x20)]);
  const binChunk = Buffer.concat([bin, Buffer.alloc(pad(bin.length), 0)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + binChunk.length, 8);
  const chunkHeader = (length: number, type: number) => {
    const h = Buffer.alloc(8);
    h.writeUInt32LE(length, 0);
    h.writeUInt32LE(type, 4);
    return h;
  };
  return Buffer.concat([
    header,
    chunkHeader(jsonChunk.length, 0x4e4f534a),
    jsonChunk,
    chunkHeader(binChunk.length, 0x004e4942),
    binChunk
  ]);
}

async function loadGlbBytes(bytes: Buffer): Promise<GLTFAsset> {
  return new GLTFLoader().load(
    { url: `data:model/gltf-binary;base64,${bytes.toString("base64")}`, type: "gltf" },
    new LoadContext()
  );
}

async function loadAsset(file: string): Promise<GLTFAsset> {
  return new GLTFLoader().load(
    { url: `data:model/gltf-binary;base64,${readFileSync(file).toString("base64")}`, type: "gltf" },
    new LoadContext()
  );
}

async function materialsFor(asset: GLTFAsset, options: GLTFRenderResourceOptions): Promise<Map<string, Material>> {
  const resources = await createGLTFRenderResources(asset, {
    imageDecoder: () => ({ width: 1, height: 1, data: new Uint8Array(4).fill(255), colorSpace: "srgb" }),
    ...options
  });
  return new Map(resources.materialLibrary);
}

describe("gltf material mapping spec-exact (CompareTransmission)", () => {
  it("keeps the real transmission path under the P4-3 gate (flags + env mode)", async () => {
    const materials = await materialsFor(await loadAsset(COMPARE_TRANSMISSION_GLB), {
      materialsR185: true,
      materialsTransmission: true,
      transmission: "env"
    });
    const transmission = materials.get("glTF Transmission")!;

    // Generated-path material keeps authored transmission: no unbacked-scalar rewrite —
    // no cullBack, no dark baseColor fallback, factor and fallback energy stay authored.
    expect(transmission.getParameter("u_transmissionFactor")).toBe(1);
    expect(transmission.getParameter("u_transmissionFallbackEnergy")).toBe(0.08);
    expect(transmission.getParameter("u_baseColor")).toEqual([1, 1, 1, 1]);
    expect(transmission.renderState.blend).toBe(false); // scalar transmission renders in the transmission queue, not blend

    const alpha = materials.get("glTF Alpha")!;
    expect(alpha.renderState.blend).toBe(true);
    expect(alpha.renderState.depthWrite).toBe(false);

    const gold = materials.get("gold")!;
    expect(gold.renderState.cullMode).toBe("none"); // doubleSided
    expect((gold.getParameter("u_baseColor") as readonly number[] | undefined)?.[0]).toBeCloseTo(0.8824, 3);
    expect(gold.getParameter("u_roughness")).toBeCloseTo(0.2, 6);
    expect(gold.getParameter("u_metallic")).toBe(1);
  });

  it("still applies the unbacked-scalar rewrite when the QR path is off", async () => {
    const materials = await materialsFor(await loadAsset(COMPARE_TRANSMISSION_GLB), {});
    const transmission = materials.get("glTF Transmission")!;

    // Legacy path: scalar transmission on an OPAQUE material is approximated — dark
    // transmission stand-in color, culled backfaces, zeroed factor and fallback energy.
    expect(transmission.getParameter("u_transmissionFactor")).toBe(0);
    expect(transmission.getParameter("u_transmissionFallbackEnergy")).toBe(0);
    const baseColor = transmission.getParameter("u_baseColor") as readonly number[];
    expect(baseColor[0]).toBeCloseTo(0.028, 3);
  });

  it("keeps the unbacked-scalar rewrite when the sub-flag is off but materialsR185 is on", async () => {
    const materials = await materialsFor(await loadAsset(COMPARE_TRANSMISSION_GLB), { materialsR185: true });
    const transmission = materials.get("glTF Transmission")!;
    expect(transmission.getParameter("u_transmissionFactor")).toBe(0);
    const baseColor = transmission.getParameter("u_baseColor") as readonly number[];
    expect(baseColor[0]).toBeCloseTo(0.028, 3);
  });

  it("maps metallicRoughness/occlusion texture slots and samplers", async () => {
    const materials = await materialsFor(await loadAsset(COMPARE_TRANSMISSION_GLB), {
      materialsR185: true, materialsTransmission: true, transmission: "env"
    });
    const alpha = materials.get("glTF Alpha")!;
    expect(alpha.getParameter("u_metallicRoughnessTexture")).toBeDefined();
    expect(alpha.getParameter("u_emissiveTexture")).toBeDefined();
    expect(alpha.getParameter("u_emissiveColor")).toEqual([0.25, 0.25, 0.25]);
    const checker = materials.get("checker")!;
    expect(checker.getParameter("u_baseColorTexture")).toBeDefined();
    expect(checker.getParameter("u_metallic")).toBe(0);
  });
});

/**
 * 04-S4 (PRD-04 §16.1 S4, phase-4 exit): CompareTransmission on the GENERATED
 * path. The generated program is keyed off `material.programFeatures(ctx)`:
 * every KHR_materials_* extension the glTF JSON authors must reach it as its
 * lobe (none dropped), and no lobe may appear that the material does not
 * author, except the two lobes that also carry core-glTF/derived data by
 * design (lobes.ts `active`): `emissive-strength` (applies a non-zero core
 * emissiveFactor) and `ior` (the specular/IOR F0 layer that transmission,
 * specular and clearcoat build on).
 */
describe("gltf material mapping spec-exact on generated-path materials (04-S4)", () => {
  const CORE_CARRIER_LOBES = new Set(["emissive-strength", "ior"]);
  const authoredLobeIds = (spec: { extensions?: Record<string, unknown> }): string[] => {
    const byExtension = new Map(materialLobes(FLAGS_ON).map((lobe) => [lobe.glTFExtension, lobe.id]));
    return Object.keys(spec.extensions ?? {})
      .filter((name) => name.startsWith("KHR_materials_"))
      .map((name) => {
        const id = byExtension.get(name);
        expect(id, `${name} has a registered lobe`).toBeDefined();
        return id!;
      })
      .sort();
  };

  it("every authored KHR_materials_* lobe reaches the generated path; none is invented", async () => {
    const { json } = readGlb(COMPARE_TRANSMISSION_GLB);
    const materials = await materialsFor(await loadAsset(COMPARE_TRANSMISSION_GLB), {
      materialsR185: true,
      materialsTransmission: true,
      transmission: "env"
    });
    const authored = json.materials ?? [];
    expect(authored.length).toBeGreaterThan(0);
    for (const spec of authored) {
      const material = materials.get(spec.name ?? "");
      expect(material, `runtime material for ${spec.name}`).toBeDefined();
      const lobes = material!.programFeatures(featureCtx(FLAGS_ON)).extensions.map((e) => e.lobe);
      const expected = authoredLobeIds(spec);
      for (const id of expected) expect(lobes, `${spec.name}: authored lobe ${id} dropped`).toContain(id);
      const invented = lobes.filter((id) => !expected.includes(id) && !CORE_CARRIER_LOBES.has(id));
      expect(invented, `${spec.name}: lobes not authored in glTF JSON`).toEqual([]);
      if ((spec.emissiveFactor ?? [0, 0, 0]).some((v) => v !== 0)) {
        expect(lobes, `${spec.name}: non-zero emissiveFactor reaches the emissive chunk`).toContain("emissive-strength");
      }
    }
    // The transmissive material must reach the generated path with its lobe:
    // the E22 rewrite is skipped on the real path, so a missing lobe would
    // render the glass as an opaque white shell.
    const glass = materials.get("glTF Transmission")!.programFeatures(featureCtx(FLAGS_ON));
    expect(glass.extensions.map((e) => e.lobe)).toContain("transmission");
    expect(glass.alphaMode).toBe("opaque");
  });

  it("flag-off control: no lobe reaches the generated path (differs from flag-on)", async () => {
    const materials = await materialsFor(await loadAsset(COMPARE_TRANSMISSION_GLB), {});
    expect(materialLobes(FLAGS_OFF)).toHaveLength(0);
    const glass = materials.get("glTF Transmission")!;
    const off = glass.programFeatures(featureCtx(FLAGS_OFF));
    expect(off.extensions).toEqual([]);
    // Same material object, flags on: the lobe appears — the control is not vacuous.
    const on = (await materialsFor(await loadAsset(COMPARE_TRANSMISSION_GLB), {
      materialsR185: true,
      materialsTransmission: true,
      transmission: "env"
    })).get("glTF Transmission")!.programFeatures(featureCtx(FLAGS_ON));
    expect(on.extensions.map((e) => e.lobe)).not.toEqual(off.extensions.map((e) => e.lobe));
  });

  it("flag-off control: the missing-material default differs from the glTF-spec default (Duck, materials stripped)", async () => {
    const { json, bin } = readGlb(DUCK_GLB);
    const stripped: GlbJson = {
      ...json,
      materials: undefined,
      meshes: (json.meshes ?? []).map((mesh) => ({
        ...mesh,
        primitives: mesh.primitives.map(({ material: _drop, ...primitive }) => primitive)
      }))
    };
    delete stripped.materials;
    const asset = await loadGlbBytes(packGlb(stripped, bin));
    const on = [...(await materialsFor(asset, { materialsR185: true })).values()];
    const off = [...(await materialsFor(asset, {})).values()];
    expect(on.length).toBeGreaterThan(0);
    expect(off.length).toBe(on.length);
    // Flag on: glTF 2.0 §3.9.2 default baseColor [1,1,1,1], roughness 1
    // (metallic 0 per T0-18(a) until a C-09 probe is guaranteed).
    for (const material of on) {
      expect(material.getParameter("u_baseColor")).toEqual([1, 1, 1, 1]);
      expect(material.getParameter("u_roughness")).toBe(1);
    }
    // Flag off: the legacy neutral grey — the control must differ, or S4 is vacuous.
    for (const material of off) {
      expect(material.getParameter("u_baseColor")).not.toEqual([1, 1, 1, 1]);
      expect(material.getParameter("u_roughness")).not.toBe(1);
    }
  });
});
