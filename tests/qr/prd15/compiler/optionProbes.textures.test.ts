// S5-WP19-04: material.pbr / material.metal texture-map rows. Each map slot is
// loaded for real: two tiny RGBA PNGs (1x1 and 2x2, stored deflate) are
// generated here, served by a stubbed fetch, verified against the SHA-256 the
// registry declares (typed bitmap loads reject a mismatch) and bound by the
// production primitive textured upgrade. A row must change the named
// TexturedPBRMaterial parameter between its A and B values. The material
// capability diagnostics and depth-preview rows are exercised here too.
// Compile/upgrade output is not pixel evidence.
import "@aura3d/engine";
import { createHash, webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { compileScene } from "@aura3d/engine-runtime/contracts";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import type { OptionCoverageRow } from "../../../../packages/engine/src/contracts/compiler";
import { scene } from "../../../../packages/engine/src/agent-api/nodes/scene";
import { primitives } from "../../../../packages/engine/src/agent-api/nodes/primitives";
import { material } from "../../../../packages/engine/src/agent-api/nodes/material";
import { createMaterialCapabilityDiagnostics } from "../../../../packages/engine/src/agent-api/nodes/materialTools";
import { OPTION_COVERAGE_ROWS } from "../../../../packages/engine/src/agent-api/compiler/optionCoverage";
import type { MountSceneCompileContext } from "../../../../packages/engine/src/agent-api/compiler/compileScene";
import { createProductionRuntimePrimitiveEntries } from "../../../../packages/engine/src/agent-api/compiler/primitives";
import { upgradeProductionPrimitiveTextures } from "../../../../packages/engine/src/agent-api/compiler/textures";
import type { AuraAssetRef, AuraMaterialSpec, AuraPrimitiveNode } from "../../../../packages/engine/src/agent-api/nodes/types";

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes: readonly number[]): number => {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 255]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const u32 = (n: number): number[] => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const chunk = (type: string, data: readonly number[]): number[] => {
  const tag = [...type].map((ch) => ch.charCodeAt(0));
  return [...u32(data.length), ...tag, ...data, ...u32(crc32([...tag, ...data]))];
};

/** A solid RGBA8 PNG with one stored (uncompressed) deflate block, so its bytes and digest are fixed. */
function probePng(width: number, height: number, rgba: readonly [number, number, number, number]): Uint8Array {
  const raw: number[] = [];
  for (let y = 0; y < height; y++) { raw.push(0); for (let x = 0; x < width; x++) raw.push(...rgba); }
  let a = 1, b = 0;
  for (const value of raw) { a = (a + value) % 65521; b = (b + a) % 65521; }
  const zlib = [0x78, 0x01, 0x01, raw.length & 255, raw.length >>> 8, ~raw.length & 255, (~raw.length >>> 8) & 255, ...raw, ...u32(((b << 16) | a) >>> 0)];
  return Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, ...chunk("IHDR", [...u32(width), ...u32(height), 8, 6, 0, 0, 0]), ...chunk("IDAT", zlib), ...chunk("IEND", [])]);
}

const SERVED: Record<string, Uint8Array> = {
  "/aura-option-probe/map-a.png": probePng(1, 1, [200, 120, 40, 255]),
  "/aura-option-probe/map-b.png": probePng(2, 2, [40, 160, 220, 128])
};
const digest = (bytes: Uint8Array): string => `sha256-${createHash("sha256").update(bytes).digest("hex")}`;

beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const bytes = SERVED[String(url)];
    return bytes ? new Response(bytes.slice(), { headers: { "content-type": "image/png" } }) : new Response("absent", { status: 404 });
  }));
  // Node has no image decoder: the double reports the PNG's own IHDR size. CPU
  // pixel reads (metal-rough composite) decode the PNG bytes with the engine's decoder.
  vi.stubGlobal("createImageBitmap", vi.fn(async (blob: Blob) => {
    const view = new DataView(await blob.arrayBuffer());
    return { width: view.getUint32(16), height: view.getUint32(20), close: () => {} };
  }));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function flatten(value: unknown, path: string, out: Map<string, string>, seen = new Set<unknown>()): Map<string, string> {
  if (ArrayBuffer.isView(value)) {
    out.set(path, JSON.stringify(Array.from(value as Uint8Array, (n) => Math.round(n * 1e4) / 1e4)));
  } else if (value instanceof Map) {
    for (const [key, entry] of value) flatten(entry, `${path}.${String(key)}`, out, seen);
  } else if (value && typeof value === "object") {
    if (seen.has(value)) return out;
    seen.add(value);
    if (Array.isArray(value) && value.every((entry) => typeof entry !== "object")) out.set(path, JSON.stringify(value));
    else for (const [key, entry] of Object.entries(value)) if (key !== "revision" && key !== "dirty") flatten(entry, `${path}.${key}`, out, seen);
  } else if (typeof value !== "function" && value !== undefined) {
    out.set(path, JSON.stringify(value));
  }
  return out;
}

const read = (flat: Map<string, string>, key: string): string | undefined => {
  const parts = [...flat].filter(([path]) => path === key || path.startsWith(`${key}.`)).map(([path, value]) => `${path}=${value}`);
  return parts.length > 0 ? parts.join(";") : undefined;
};

const rowsWith = (predicate: (row: OptionCoverageRow) => boolean) => OPTION_COVERAGE_ROWS.filter(predicate).map((row) => [`${row.builder}.${row.field}`, row] as const);
const row = (builder: string, field: string): OptionCoverageRow => OPTION_COVERAGE_ROWS.find((r) => r.builder === builder && r.field === field)!;
const mapA = row("material.pbr", "texture").probeValueA as AuraAssetRef<"texture">;
const factory = (builder: string) => (builder === "material.metal" ? material.metal : material.pbr);

/** A map modifier acts only on a bound map. */
const TEXTURE_BASE: Record<string, AuraMaterialSpec> = {
  normalScale: { normal: mapA }, occlusionStrength: { occlusionMap: mapA }, clearcoatNormalScale: { clearcoatNormalMap: mapA },
  texCoords: { texture: mapA }, texTransforms: { texture: mapA }, sampling: { texture: mapA }, slotSampling: { texture: mapA },
  textureAnisotropy: { texture: mapA }
};

/** The production textured upgrade with a mounted app's flags (`resolveQrFlags({})`, as createAuraApp passes the renderer). */
async function upgraded(spec: AuraMaterialSpec) {
  const node = primitives.box({ name: "probe", material: spec }).toJSON() as AuraPrimitiveNode;
  const [entry] = createProductionRuntimePrimitiveEntries([node]);
  const warnings: string[] = [];
  await upgradeProductionPrimitiveTextures([entry!], (message) => warnings.push(message), 4096, undefined, undefined, undefined, undefined, undefined, 4096, resolveQrFlags({}));
  return { resource: entry!.resources[0]!, warnings };
}

async function texturedMaterial(builder: string, field: string, value: unknown): Promise<Map<string, string>> {
  const { resource, warnings } = await upgraded(factory(builder)({ ...(TEXTURE_BASE[field] ?? {}), [field]: value } as AuraMaterialSpec));
  try {
    expect(resource.textureStatus, warnings.join("; ")).toBe("textured");
    return flatten(resource.texturedMaterial, "texturedMaterial", new Map());
  } finally {
    resource.texturedMaterial?.dispose();
    resource.textureDisposer?.();
    resource.material.dispose();
  }
}

/** `texturedMaterial.u_x[.sub]` names the upgraded material's parameter `parameters.u_x[.sub]`. */
const texturedKey = (observation: string): string => observation.replace(/^texturedMaterial\./, "texturedMaterial.parameters.");

describe("typed option probes: material texture maps", () => {
  it("serves probe maps whose bytes match the registry digests", () => {
    for (const field of ["texture"]) for (const value of [row("material.pbr", field).probeValueA, row("material.pbr", field).probeValueB] as AuraAssetRef<"texture">[]) {
      expect(digest(SERVED[value.url!]!)).toBe(value.hash);
    }
  });

  it.each(rowsWith((r) => r.disposition === "runtime" && r.observation?.startsWith("texturedMaterial.") === true))(
    "%s changes its textured-material parameter", async (_key, r) => {
      const key = texturedKey(r.observation!);
      const a = read(await texturedMaterial(r.builder, r.field, r.probeValueA), key);
      const b = read(await texturedMaterial(r.builder, r.field, r.probeValueB), key);
      expect(a, `${key} missing for A`).toBeDefined();
      expect(b, `${key} missing for B`).toBeDefined();
      expect(a).not.toEqual(b);
    });

  it("binds the authored map into its slot (not a default texture)", async () => {
    const flat = await texturedMaterial("material.pbr", "specularIntensityMap", row("material.pbr", "specularIntensityMap").probeValueB);
    expect(flat.get("texturedMaterial.parameters.u_specularTextureEnabled")).toBe("1");
    expect(flat.get("texturedMaterial.parameters.u_specularTexture.texture.width")).toBe("2");
    const thickness = await texturedMaterial("material.metal", "thicknessMap", row("material.metal", "thicknessMap").probeValueA);
    expect(thickness.get("texturedMaterial.parameters.u_volumeThicknessTextureEnabled")).toBe("1");
  });

  it("applies authored sampling only through the mounting app's flags (native 5.0 owner-scoped flags)", async () => {
    const flat = await texturedMaterial("material.pbr", "sampling", { wrap: "clamp" });
    expect(flat.get("texturedMaterial.parameters.u_baseColorTexture.sampler.addressU")).toBe(JSON.stringify("clamp-to-edge"));
    // Without the app's flags the upgrade falls back to the process default (no A3D_QR_MATERIALS),
    // which never reads `sampling`: that was the 5.0 owner-scoped-flags regression the renderer now avoids.
    const legacySampler = async (wrap: "repeat" | "mirror"): Promise<string | undefined> => {
      const node = primitives.box({ name: "probe", material: material.pbr({ texture: mapA, sampling: { wrap } }) }).toJSON() as AuraPrimitiveNode;
      const [entry] = createProductionRuntimePrimitiveEntries([node]);
      await upgradeProductionPrimitiveTextures([entry!], () => {});
      const legacy = entry!.resources[0]!;
      try { return read(flatten(legacy.texturedMaterial, "t", new Map()), "t.parameters.u_baseColorTexture.sampler"); }
      finally { legacy.texturedMaterial?.dispose(); legacy.textureDisposer?.(); legacy.material.dispose(); }
    };
    expect(await legacySampler("repeat")).toEqual(await legacySampler("mirror"));
  });

  it("draws an unlit textured material with the textured unlit program, reporting maps it cannot use", async () => {
    const { resource, warnings } = await upgraded(material.pbr({ unlit: true, texture: mapA, normal: mapA }));
    expect(warnings).toEqual([]);
    expect(resource.textureStatus).toBe("textured");
    expect(resource.texturedMaterial?.shaderKey).toBe("aura3d/textured-unlit");
    expect(resource.textureWarnings).toContainEqual(expect.stringContaining("does not use its normal texture"));
    const unlitOnlyNormal = await upgraded(material.pbr({ unlit: true, normal: mapA }));
    expect(unlitOnlyNormal.resource.textureStatus).toBe("fallback");
    expect(unlitOnlyNormal.warnings).toContainEqual(expect.stringContaining("is unlit; only a base-colour texture applies"));
  });
});

describe("typed option probes: material diagnostics and rejected routes", () => {
  it.each(rowsWith((r) => r.disposition === "runtime" && r.observation === "materialDiagnostics.warnings"))(
    "%s changes the material capability warnings", (_key, r) => {
      const warnings = (value: unknown) => createMaterialCapabilityDiagnostics(scene().add(primitives.box({ name: "probe", material: factory(r.builder)({ [r.field]: value } as AuraMaterialSpec) }))).warnings;
      expect(warnings(r.probeValueA)).not.toEqual(warnings(r.probeValueB));
      expect(warnings(r.probeValueB)).toContainEqual(expect.stringContaining(String((r.probeValueB as string[])[0])));
    });

  const mountCtx = (): MountSceneCompileContext => ({
    renderer: undefined, assets: undefined, quality: { tier: "high" } as MountSceneCompileContext["quality"], strict: false,
    flags: resolveQrFlags({ options: ["compiler"] }), degrade: () => {}, canvas: { width: 800, height: 600 } as unknown as HTMLCanvasElement,
    environmentLighting: () => ({ color: [0, 0, 0], intensity: 0 }) as never, collectedLights: [], runtimeWarnings: new Set<string>()
  });

  it.each(rowsWith((r) => r.disposition === "unsupported" && r.observation === "compile.DEPTH_PREVIEW_OPTION_UNSUPPORTED"))(
    "%s is rejected with DEPTH_PREVIEW_OPTION_UNSUPPORTED", async (_key, r) => {
      expect(r.reason).toContain(r.field);
      for (const value of [r.probeValueA, r.probeValueB]) {
        const snapshot = scene().add(primitives.box({ name: "probe", material: factory(r.builder)({ kind: "depth-preview", [r.field]: value } as AuraMaterialSpec) })).toJSON();
        await expect(compileScene(snapshot, mountCtx())).rejects.toThrow(/DEPTH_PREVIEW_OPTION_UNSUPPORTED/);
      }
      // The supported route: material.depth builds the preview spec on its own.
      const supported = scene().add(primitives.box({ name: "probe", material: material.depth({ near: 0.1, far: 10 }) })).toJSON();
      (await compileScene(supported, mountCtx())).dispose();
    });
});
