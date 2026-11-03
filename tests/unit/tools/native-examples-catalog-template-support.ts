// Source-only reconstruction helpers for template catalog expectations. They
// feed a template's own mounted scene snapshot and its real typed GLB bytes
// through the production actor loader and frame-input builder, then project the
// resulting vertices with the frame's own view-projection. No browser, GPU,
// network, image capture or rendered pixel is involved.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import sharp from "sharp";
import { createProductionRuntimeRendererInput, setPrd01ModelMatrixCache } from "../../../packages/engine/src/agent-api/compiler/renderInput.js";
import { modelMatrixFor } from "../../../packages/engine/src/agent-api/compiler/sceneGraph.js";
import { createModelMatrixCache } from "../../../packages/engine/src/agent-api/sceneGraph.js";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags.js";
import { createTypedGLBActor, type TypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor.js";
import { clearTypedGLBActorQrFlags, setTypedGLBActorQrFlags } from "../../../packages/engine/src/production-runtime/actor/extensions.js";
import type { AuraModelNode, AuraRuntimeNodeRegistry, AuraSceneSnapshot } from "../../../packages/engine/src/agent-api/nodes/types.js";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem.js";

export const WIDTH = 1280;
export const HEIGHT = 720;
export type Vec3 = readonly [number, number, number];
export interface ScreenBox { minX: number; maxX: number; minY: number; maxY: number; minDepth: number; samples: Array<{ x: number; y: number }> }

const root = process.cwd();

/** sRGB 8-bit encoding of a linear channel. */
export function srgb(value: number): number {
  return Math.round(255 * (value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055));
}

export interface ReconstructedFrame {
  readonly snapshot: AuraSceneSnapshot;
  readonly items: readonly RenderItem[];
  readonly viewProjection: ArrayLike<number>;
  /** Rebuild the frame input at `time` (runtime handles, animation and bounds advance). */
  frame(time: number): { readonly items: readonly RenderItem[]; readonly viewProjection: ArrayLike<number> };
  dispose(): void;
}

export interface ReconstructOptions {
  /** Offline fetch installer; it receives the only bytes the loader may read. */
  readonly stubFetch: (handler: (url: string) => Uint8Array | undefined) => void;
  readonly registry?: AuraRuntimeNodeRegistry;
  readonly flags?: ReturnType<typeof resolveQrFlags>;
  readonly time?: number;
  readonly width?: number;
  readonly height?: number;
}

/**
 * Load every typed model node of `snapshot` from the template's `public/`
 * directory through an offline fetch stub (GLB plus its declared, digest-pinned
 * texture dependencies), then build a frame input at `time`.
 */
export async function reconstructTemplateFrame(template: string, snapshot: AuraSceneSnapshot, options: ReconstructOptions): Promise<ReconstructedFrame> {
  const owner = {};
  const flags = options.flags ?? resolveQrFlags({ env: {} });
  const width = options.width ?? WIDTH, height = options.height ?? HEIGHT;
  setTypedGLBActorQrFlags(flags, owner);
  const releaseMatrix = setPrd01ModelMatrixCache(createModelMatrixCache(modelMatrixFor(flags)), owner);
  const base = `https://${template}-fixture.invalid`;
  const files = new Map<string, Uint8Array>();
  const nodes = snapshot.nodes.filter((node): node is AuraModelNode => node.kind === "model");
  for (const node of nodes) {
    const url = new URL(node.asset.url, base);
    files.set(url.href, readFileSync(resolve(root, `packages/create-aura3d/templates/${template}/public${url.pathname}`)));
    const dependencies = (node.asset as { integrity?: { dependencies?: Record<string, string> } }).integrity?.dependencies ?? {};
    for (const dependency of Object.keys(dependencies)) {
      const dependencyUrl = new URL(dependency, url);
      files.set(dependencyUrl.href, readFileSync(resolve(root, `packages/create-aura3d/templates/${template}/public${dependencyUrl.pathname}`)));
    }
  }
  options.stubFetch((url) => files.get(url));
  const actors: TypedGLBActor[] = [];
  const cleanup = () => {
    for (const actor of actors) actor.dispose();
    releaseMatrix();
    clearTypedGLBActorQrFlags(owner);
  };
  try {
    for (const node of nodes) {
      actors.push(await createTypedGLBActor({
        asset: { ...node.asset, url: new URL(node.asset.url, base).href },
        id: node.runtime?.id ?? node.asset.id, name: node.name, width, height,
        runtimeOwner: owner, shareTextures: false,
        // Geometry and placement are the real GLB; texture colors are read
        // independently from the bytes, never from a decoded GPU texture.
        imageDecoder: async () => ({ width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) })
      }));
    }
    const frame = (time: number) => {
      const input = createProductionRuntimeRendererInput(
        snapshot, { width, height } as HTMLCanvasElement, nodes.map((node, index) => ({ node, actor: actors[index]! })), [],
        time, options.registry, new Set(), { color: [0, 0, 0], intensity: 0 }, [], undefined, undefined, undefined, owner
      );
      const viewProjection = input.camera?.viewProjectionMatrix;
      if (!viewProjection) throw new Error("missing frame view-projection");
      return { items: [...(input.source.collectRenderItems?.() ?? [])], viewProjection };
    };
    const first = frame(options.time ?? 0);
    return { snapshot, items: first.items, viewProjection: first.viewProjection, frame, dispose: cleanup };
  } catch (error) {
    cleanup();
    throw error;
  }
}

/** World-space vertices of one render item (skinned, and each instance when instanced). */
export function worldVertices(item: RenderItem): Vec3[] {
  const matrix = item.modelMatrix;
  if (!matrix) throw new Error(`missing model matrix for ${item.label}`);
  const instances = item.instanceTransforms;
  const geometry = item.geometry;
  const positions = geometry.getAttributeBuffer("position");
  const skin = item.skinning;
  const joints = skin ? geometry.getAttributeBuffer("joints") : undefined;
  const weights = skin ? geometry.getAttributeBuffer("weights") : undefined;
  const local: Vec3[] = [];
  for (let index = 0; index < geometry.vertexBuffer.vertexCount; index += 1) {
    const p = positions.getDecodedAttribute(index, "position");
    if (!skin) { local.push([p[0]!, p[1]!, p[2]!]); continue; }
    const js = joints!.getDecodedAttribute(index, "joints");
    const ws = weights!.getDecodedAttribute(index, "weights");
    const out = [0, 0, 0];
    for (let k = 0; k < 4; k += 1) {
      const offset = js[k]! * 16, m = skin.matrices, w = ws[k]!;
      for (let axis = 0; axis < 3; axis += 1) {
        out[axis]! += w * (m[offset + axis]! * p[0]! + m[offset + 4 + axis]! * p[1]! + m[offset + 8 + axis]! * p[2]! + m[offset + 12 + axis]!);
      }
    }
    local.push([out[0]!, out[1]!, out[2]!]);
  }
  const apply = (m: ArrayLike<number>, o: number, [x, y, z]: Vec3): Vec3 => [
    m[o]! * x + m[o + 4]! * y + m[o + 8]! * z + m[o + 12]!,
    m[o + 1]! * x + m[o + 5]! * y + m[o + 9]! * z + m[o + 13]!,
    m[o + 2]! * x + m[o + 6]! * y + m[o + 10]! * z + m[o + 14]!
  ];
  if (!instances || instances.length === 0) return local.map((p) => apply(matrix, 0, p));
  const out: Vec3[] = [];
  for (let offset = 0; offset + 16 <= instances.length; offset += 16) {
    for (const p of local) out.push(apply(matrix, 0, apply(instances, offset, p)));
  }
  return out;
}

/** Page pixel coordinates (top-left origin) of world points under a column-major view-projection, inside `viewport`. */
export function projectToScreen(points: readonly Vec3[], matrix: ArrayLike<number>, viewport = { x: 0, y: 0, width: WIDTH, height: HEIGHT }): ScreenBox {
  const box: ScreenBox = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minDepth: Infinity, samples: [] };
  for (const [x, y, z] of points) {
    const w = matrix[3]! * x + matrix[7]! * y + matrix[11]! * z + matrix[15]!;
    const sx = viewport.x + ((matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]!) / w + 1) / 2 * viewport.width;
    const sy = viewport.y + (1 - (matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]!) / w) / 2 * viewport.height;
    box.minX = Math.min(box.minX, sx); box.maxX = Math.max(box.maxX, sx);
    box.minY = Math.min(box.minY, sy); box.maxY = Math.max(box.maxY, sy);
    box.minDepth = Math.min(box.minDepth, w);
    box.samples.push({ x: sx, y: sy });
  }
  return box;
}

interface GlbJson {
  images?: Array<{ uri?: string; bufferView?: number }>;
  textures?: Array<{ source: number }>;
  materials: Array<{ name?: string; pbrMetallicRoughness?: { baseColorFactor?: number[]; baseColorTexture?: { index: number } } }>;
  meshes: Array<{ primitives: Array<{ material?: number; attributes: Record<string, number> }> }>;
  accessors: Array<{ bufferView: number; byteOffset?: number; componentType: number; count: number; normalized?: boolean }>;
  bufferViews: Array<{ byteOffset?: number; byteLength: number; byteStride?: number }>;
}

/**
 * Area-weighted histogram (fraction of the summed local triangle area) of the
 * sRGB base colors the GLB's own UVs address: texel x base-color factor, or the
 * factor alone for untextured materials. `meshNames` limits it to named meshes.
 */
export async function glbBaseColorHistogram(glbPath: string, meshNames?: readonly string[]): Promise<Map<string, number>> {
  const bytes = readFileSync(resolve(root, glbPath));
  if (bytes.toString("ascii", 0, 4) !== "glTF") throw new Error(`not a GLB: ${glbPath}`);
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8")) as GlbJson;
  const binStart = 20 + jsonLength + 8;
  const images = new Map<number, { data: Buffer; width: number; height: number }>();
  const image = async (index: number) => {
    if (images.has(index)) return images.get(index)!;
    const source = json.images![index]!;
    let data: Buffer;
    if (source.bufferView !== undefined) {
      const view = json.bufferViews[source.bufferView]!;
      data = bytes.subarray(binStart + (view.byteOffset ?? 0), binStart + (view.byteOffset ?? 0) + view.byteLength);
    } else if (source.uri?.startsWith("data:")) {
      data = Buffer.from(source.uri.split(",")[1]!, "base64");
    } else {
      data = readFileSync(resolve(root, glbPath, "..", decodeURIComponent(source.uri!)));
    }
    const decoded = await sharp(data).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const entry = { data: decoded.data, width: decoded.info.width, height: decoded.info.height };
    images.set(index, entry);
    return entry;
  };
  const element = (accessorIndex: number, n: number, components: number): number[] => {
    const accessor = json.accessors[accessorIndex]!;
    const view = json.bufferViews[accessor.bufferView]!;
    const size = accessor.componentType === 5126 || accessor.componentType === 5125 ? 4 : accessor.componentType === 5123 ? 2 : 1;
    const offset = binStart + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + n * (view.byteStride ?? size * components);
    const out: number[] = [];
    for (let c = 0; c < components; c += 1) {
      const at = offset + c * size;
      if (accessor.componentType === 5126) out.push(bytes.readFloatLE(at));
      else if (accessor.componentType === 5125) out.push(bytes.readUInt32LE(at));
      else if (accessor.componentType === 5123) out.push(bytes.readUInt16LE(at) / (accessor.normalized ? 65535 : 1));
      else out.push(bytes.readUInt8(at) / (accessor.normalized ? 255 : 1));
    }
    return out;
  };
  const linear = (value: number) => { const c = value / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const histogram = new Map<string, number>();
  let total = 0;
  for (const mesh of json.meshes) {
    if (meshNames && !meshNames.includes((mesh as { name?: string }).name ?? "")) continue;
    for (const primitive of mesh.primitives) {
      const material = json.materials[primitive.material ?? -1];
      const factor = material?.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1];
      const textureIndex = material?.pbrMetallicRoughness?.baseColorTexture?.index;
      const texture = textureIndex === undefined || primitive.attributes.TEXCOORD_0 === undefined
        ? undefined : await image(json.textures![textureIndex]!.source);
      const color = (vertex: number): string => {
        if (!texture) return factor.slice(0, 3).map(srgb).join(",");
        const [u, v] = element(primitive.attributes.TEXCOORD_0!, vertex, 2) as [number, number];
        const x = Math.min(texture.width - 1, Math.floor(((u % 1 + 1) % 1) * texture.width));
        const y = Math.min(texture.height - 1, Math.floor(((v % 1 + 1) % 1) * texture.height));
        const pixel = (y * texture.width + x) * 4;
        return [0, 1, 2].map((channel) => srgb(linear(texture.data[pixel + channel]!) * factor[channel]!)).join(",");
      };
      const count = json.accessors[primitive.attributes.POSITION!]!.count;
      const indices = (primitive as { indices?: number }).indices;
      const triangles = indices === undefined ? count / 3 : json.accessors[indices]!.count / 3;
      for (let t = 0; t < triangles; t += 1) {
        const corner = [0, 1, 2].map((k) => indices === undefined ? t * 3 + k : element(indices, t * 3 + k, 1)[0]!);
        const [a, b, c] = corner.map((vertex) => element(primitive.attributes.POSITION!, vertex, 3)) as [number[], number[], number[]];
        const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!], w = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
        const area = Math.hypot(u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!) / 2;
        for (const vertex of corner) {
          const key = color(vertex);
          histogram.set(key, (histogram.get(key) ?? 0) + area / 3);
        }
        total += area;
      }
    }
  }
  for (const [key, value] of histogram) histogram.set(key, value / total);
  return histogram;
}
