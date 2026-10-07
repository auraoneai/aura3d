/**
 * §6.3 step 12 — before/after measurement: file bytes, triangles, vertices,
 * primitives, materials, draw-call estimate, texture count, max texture
 * dimension, estimated GPU bytes per tier, download bytes.
 */

import type { Document } from "@gltf-transform/core";
import type { DocMeasure, Ktx2Codec, OptimizeStepContext } from "./types.js";

type AuraQualityTier = "low" | "medium" | "high" | "ultra";

export interface AssetBudgetMeasurement {
  readonly triangles: number;
  readonly drawCalls: number;
  readonly gpuBytesByTier: Readonly<Record<AuraQualityTier, number>>;
  readonly downloadBytes: number;
}

const BYTES_PER_PIXEL: Record<Exclude<Ktx2Codec, "none">, number> = {
  // GPU-resident bytes per texel after transcode (mip chain ×4/3 applied by caller).
  uastc: 1, // BC7 / ASTC-4x4 / ETC2-RGBA target ≈ 1 B/px
  etc1s: 0.5 // ETC2-RGB target ≈ 0.5 B/px (RGBA targets read 1 B/px — mid estimate)
};

function codecOf(ctx: OptimizeStepContext, textureName: string): Ktx2Codec {
  return ctx.ktxFlags.find((f) => f.texture === textureName)?.codec ?? "none";
}

export function measureDocument(doc: Document): Omit<DocMeasure, never> {
  let triangles = 0, vertices = 0, primitives = 0, bytes = 0;
  for (const accessor of doc.getRoot().listAccessors()) bytes += accessor.getArray()?.byteLength ?? 0;
  for (const texture of doc.getRoot().listTextures()) bytes += texture.getImage()?.byteLength ?? 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      primitives += 1;
      vertices += prim.getAttribute("POSITION")?.getCount() ?? 0;
      triangles += Math.floor((prim.getIndices()?.getCount() ?? prim.getAttribute("POSITION")?.getCount() ?? 0) / 3);
    }
  }
  let maxTextureDimension = 0;
  for (const texture of doc.getRoot().listTextures()) {
    const size = texture.getSize();
    if (size) maxTextureDimension = Math.max(maxTextureDimension, ...size);
  }
  return {
    bytes,
    triangles,
    vertices,
    primitives,
    materials: doc.getRoot().listMaterials().length,
    textures: doc.getRoot().listTextures().length,
    maxTextureDimension,
    drawCallsEstimate: primitives
  };
}

/** Texture GPU-resident estimate: mips = 4/3 × texels × bpp; cap dims per tier. */
function textureGpuBytes(
  doc: Document,
  ctx: OptimizeStepContext | undefined,
  cap: number
): number {
  let bytes = 0;
  for (const texture of doc.getRoot().listTextures()) {
    const size = texture.getSize() ?? [0, 0];
    const w = Math.min(size[0] || cap, cap), h = Math.min(size[1] || cap, cap);
    const codec = ctx ? codecOf(ctx, texture.getName() || texture.getURI() || "unnamed") : "none";
    const bpp = codec === "none" ? 4 : BYTES_PER_PIXEL[codec];
    bytes += w * h * bpp * (4 / 3);
  }
  return Math.round(bytes);
}

/** Geometry GPU-resident bytes ≈ post-compression decoded buffers. */
function geometryGpuBytes(doc: Document): number {
  let bytes = 0;
  for (const accessor of doc.getRoot().listAccessors()) bytes += accessor.getArray()?.byteLength ?? 0;
  return bytes;
}

export function measureBudget(doc: Document, ctx?: OptimizeStepContext): AssetBudgetMeasurement {
  const m = measureDocument(doc);
  const geo = geometryGpuBytes(doc);
  return {
    triangles: m.triangles,
    drawCalls: m.drawCallsEstimate,
    gpuBytesByTier: {
      low: geo + textureGpuBytes(doc, ctx, 512),
      medium: geo + textureGpuBytes(doc, ctx, 1024),
      high: geo + textureGpuBytes(doc, ctx, ctx?.profile.textures.maxSize ?? 2048),
      ultra: geo + textureGpuBytes(doc, ctx, ctx?.profile.textures.ultraMaxSize ?? ctx?.profile.textures.maxSize ?? 4096)
    },
    downloadBytes: m.bytes
  };
}
