/**
 * PRD-05 §6.4 G2 — texel-density measurement over real accessor data.
 *
 * For every TRIANGLES primitive with POSITION + TEXCOORD_0 (+ indices), the
 * per-triangle density is:
 *
 *   texelsPerMeter(tri) = sqrt(uvArea × textureW × textureH) / sqrt(worldArea)
 *   texelsPerPixel(tri) = texelsPerMeter × metersPerPixel(camera, viewport)
 *   metersPerPixel      = 2 × distance × tan(fovY / 2) / viewportHeightPx
 *
 * Quantiles (p10/p50/p90) are area-weighted across triangles sharing a
 * material's base-colour texture, per §6.4 "the ratio of texels per screen
 * pixel on the asset's median-area triangles ... reported as p10/p50/p90".
 *
 * Texture dimensions are sniffed from image headers inside the GLB binary
 * chunk (PNG IHDR / JPEG SOF / KTX2 header) — no image decode, no deps.
 * Untextured materials contribute no triangles to the report (G3/G5 already
 * cover missing textures).
 */
import type { AdmissionGltfJson } from "./glb.js";

export interface TexelCamera {
  /** Camera-to-bounds-centre distance (m). */
  readonly distance: number;
  readonly fovDegrees: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
}

export interface TexelDensityReport {
  readonly trianglesMeasured: number;
  /** Triangles skipped (no UVs, non-triangle mode, or untextured material). */
  readonly trianglesSkipped: number;
  /** texels/screen-pixel quantiles at the evaluated camera+viewport. */
  readonly p10?: number;
  readonly p50?: number;
  readonly p90?: number;
  /** Median texels/metre (camera-independent density of the mesh). */
  readonly texelsPerMeterP50?: number;
  readonly camera: TexelCamera;
  /** Texture resolution the median was measured against. */
  readonly textureSize?: readonly [number, number];
}

interface AccessorView {
  readonly componentType: number;
  readonly count: number;
  readonly type: string;
  readonly offset: number;
  readonly stride: number;
}

const COMPONENT_BYTES: Readonly<Record<number, number>> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COUNT: Readonly<Record<string, number>> = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

interface GltfBufferViewLike {
  readonly buffer?: number;
  readonly byteOffset?: number;
  readonly byteLength: number;
  readonly byteStride?: number;
  readonly extensions?: Readonly<Record<string, unknown>>;
}

interface GltfJsonFull extends AdmissionGltfJson {
  readonly bufferViews?: readonly GltfBufferViewLike[];
  readonly images?: readonly { readonly bufferView?: number; readonly mimeType?: string; readonly uri?: string }[];
  readonly textures?: readonly { readonly source?: number; readonly extensions?: Readonly<Record<string, { readonly source?: number }>> }[];
  readonly samplers?: readonly unknown[];
}

function accessorView(json: GltfJsonFull, index: number): AccessorView | undefined {
  const accessor = (json.accessors as readonly { readonly componentType?: number; readonly count?: number; readonly type?: string; readonly bufferView?: number; readonly byteOffset?: number }[] | undefined)?.[index];
  if (!accessor || accessor.count === undefined || accessor.type === undefined || accessor.componentType === undefined) return undefined;
  const view = json.bufferViews?.[accessor.bufferView ?? -1];
  // EXT_meshopt_compression bufferViews address a virtual decoded buffer —
  // byteOffset is not an offset into the file's BIN chunk. Treat those
  // accessors as unmeasurable (skipped) rather than indexing out of range.
  if (view?.extensions?.EXT_meshopt_compression !== undefined) return undefined;
  const componentBytes = COMPONENT_BYTES[accessor.componentType];
  const count = TYPE_COUNT[accessor.type];
  if (componentBytes === undefined || count === undefined) return undefined;
  const stride = view?.byteStride ?? componentBytes * count;
  return { componentType: accessor.componentType, count: accessor.count, type: accessor.type, offset: (view?.byteOffset ?? 0) + (accessor.byteOffset ?? 0), stride };
}

function readIndex(bin: Buffer, view: AccessorView, i: number): number {
  const at = view.offset + i * view.stride;
  return view.componentType === 5123 ? bin.readUInt16LE(at) : view.componentType === 5125 ? bin.readUInt32LE(at) : bin.readUInt8(at);
}

function readVec2(bin: Buffer, view: AccessorView, i: number): readonly [number, number] {
  const at = view.offset + i * view.stride;
  return [bin.readFloatLE(at), bin.readFloatLE(at + 4)];
}

function readVec3(bin: Buffer, view: AccessorView, i: number): readonly [number, number, number] {
  const at = view.offset + i * view.stride;
  return [bin.readFloatLE(at), bin.readFloatLE(at + 4), bin.readFloatLE(at + 8)];
}

/** Image header sniff: PNG IHDR (BE u32 @16,20), JPEG SOF (BE u16 height/width), KTX2 (LE u32 @20,24). */
export function sniffImageSize(bytes: Buffer, mime?: string): readonly [number, number] | undefined {
  if (bytes.length >= 24 && bytes.readUInt32BE(0) === 0x89504e47) {
    return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    for (let at = 2; at + 9 < bytes.length;) {
      if (bytes[at] !== 0xff) { at += 1; continue; }
      const marker = bytes[at + 1]!;
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return [bytes.readUInt16BE(at + 7), bytes.readUInt16BE(at + 5)];
      }
      at += 2 + (bytes.readUInt16BE(at + 2) || 2);
    }
    return undefined;
  }
  // KTX2: \xABKTX 20\xBB\r\n\x1A\n magic, then LE u32 fields; pixelWidth @20, pixelHeight @24.
  if (bytes.length >= 28 && bytes.readUInt32LE(0) === 0xbb3254ab) {
    return [bytes.readUInt32LE(20), bytes.readUInt32LE(24)];
  }
  // KTX1 magic 0xAB 4B 54 58 20 31 31 BB: pixelWidth @36, pixelHeight @40.
  if (bytes.length >= 44 && bytes.readUInt32LE(0) === 0xbb313554) {
    return [bytes.readUInt32LE(36), bytes.readUInt32LE(40)];
  }
  void mime;
  return undefined;
}

/** Resolves the base-colour texture's pixel size for a material index. */
function materialTextureSize(json: GltfJsonFull, bin: Buffer, materialIndex: number | undefined): readonly [number, number] | undefined {
  if (materialIndex === undefined) return undefined;
  const material = (json.materials as readonly { readonly pbrMetallicRoughness?: { readonly baseColorTexture?: { readonly index?: number; readonly extensions?: Readonly<Record<string, { readonly index?: number }>> } } }[] | undefined)?.[materialIndex];
  const info = material?.pbrMetallicRoughness?.baseColorTexture;
  const textureIndex = info?.extensions?.KHR_texture_basisu?.index ?? info?.index;
  if (textureIndex === undefined) return undefined;
  const sourceIndex = json.textures?.[textureIndex]?.extensions?.KHR_texture_basisu?.source ?? json.textures?.[textureIndex]?.source;
  if (sourceIndex === undefined) return undefined;
  const image = json.images?.[sourceIndex];
  if (image?.bufferView === undefined) return undefined;
  const view = json.bufferViews?.[image.bufferView];
  if (!view) return undefined;
  const bytes = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
  return sniffImageSize(bytes, image.mimeType);
}

function metersPerPixel(camera: TexelCamera): number {
  const fovRadians = (camera.fovDegrees * Math.PI) / 180;
  return (2 * camera.distance * Math.tan(fovRadians / 2)) / camera.viewportHeight;
}

/**
 * Measures the texel-density report for a GLB against `camera`. Returns a
 * report with `trianglesMeasured: 0` when no primitive can be measured —
 * the gate treats that as "no evidence" rather than a pass.
 */
export function measureTexelDensity(json: AdmissionGltfJson, bin: Buffer | undefined, camera: TexelCamera): TexelDensityReport {
  const full = json as GltfJsonFull;
  const skipped = { triangles: 0 };
  if (!bin) {
    return { trianglesMeasured: 0, trianglesSkipped: 0, camera };
  }
  /** Area-weighted samples per material texture size. */
  const samples: { texelsPerMeter: number; worldArea: number; textureSize: readonly [number, number] }[] = [];
  for (const mesh of full.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const mode = (primitive as { mode?: number }).mode ?? 4;
      const attrs = primitive.attributes ?? {};
      if (mode !== 4 || attrs.POSITION === undefined || attrs.TEXCOORD_0 === undefined) {
        const primTriangles = mode !== 4 ? 0 : Math.floor(((full.accessors?.[attrs.POSITION]?.count ?? 0) as number) / 3);
        skipped.triangles += primTriangles;
        continue;
      }
      const positions = accessorView(full, attrs.POSITION);
      const uvs = accessorView(full, attrs.TEXCOORD_0);
      const textureSize = materialTextureSize(full, bin, primitive.material);
      if (!positions || !uvs || !textureSize || textureSize[0] <= 0 || textureSize[1] <= 0) {
        skipped.triangles += Math.floor((positions?.count ?? 0) / 3);
        continue;
      }
      const indexView = typeof primitive.indices === "number" ? accessorView(full, primitive.indices) : undefined;
      const indexCount = indexView?.count ?? positions.count;
      for (let i = 0; i + 2 < indexCount; i += 3) {
        const [a, b, c] = indexView
          ? [readIndex(bin, indexView, i), readIndex(bin, indexView, i + 1), readIndex(bin, indexView, i + 2)]
          : [i, i + 1, i + 2];
        if (a >= positions.count || b >= positions.count || c >= positions.count) continue;
        const [p0, p1, p2] = [readVec3(bin, positions, a), readVec3(bin, positions, b), readVec3(bin, positions, c)];
        const [t0, t1, t2] = [readVec2(bin, uvs, a), readVec2(bin, uvs, b), readVec2(bin, uvs, c)];
        const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
        const e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
        const cross = [
          e1[1] * e2[2] - e1[2] * e2[1],
          e1[2] * e2[0] - e1[0] * e2[2],
          e1[0] * e2[1] - e1[1] * e2[0]
        ];
        const worldArea = 0.5 * Math.hypot(cross[0]!, cross[1]!, cross[2]!);
        const uvArea = 0.5 * Math.abs((t1[0] - t0[0]) * (t2[1] - t0[1]) - (t2[0] - t0[0]) * (t1[1] - t0[1]));
        if (worldArea <= 0 || uvArea <= 0) continue;
        // Texels spanned by the triangle's UV footprint (area-units → texels).
        const uvTexels = Math.sqrt(uvArea * textureSize[0] * textureSize[1]);
        samples.push({ texelsPerMeter: uvTexels / Math.sqrt(worldArea), worldArea, textureSize });
      }
    }
  }
  const measured = samples.length;
  if (measured === 0) return { trianglesMeasured: 0, trianglesSkipped: skipped.triangles, camera };
  const sorted = [...samples].sort((x, y) => x.texelsPerMeter - y.texelsPerMeter);
  const totalArea = samples.reduce((sum, s) => sum + s.worldArea, 0);
  const quantile = (q: number) => {
    let acc = 0;
    for (const s of sorted) {
      acc += s.worldArea;
      if (acc >= q * totalArea) return s.texelsPerMeter;
    }
    return sorted[sorted.length - 1]!.texelsPerMeter;
  };
  const median = quantile(0.5);
  const mpp = metersPerPixel(camera);
  const medianSize = sorted[Math.floor((sorted.length - 1) / 2)]!.textureSize;
  return {
    trianglesMeasured: measured,
    trianglesSkipped: skipped.triangles,
    p10: quantile(0.1) * mpp,
    p50: median * mpp,
    p90: quantile(0.9) * mpp,
    texelsPerMeterP50: median,
    camera,
    textureSize: medianSize
  };
}
