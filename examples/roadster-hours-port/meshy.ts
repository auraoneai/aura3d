/**
 * Decodes the baked Meshy models (`meshy.baked.ts`, produced by `tools/bake-meshy.mjs`) into engine geometry. Vehicles fill the
 * unit box [-0.5, 0.5]^3 with the front at -Z (one instance matrix `scale(width, height, length)` fits the sim's collision box);
 * props have height 1, their base at y = 0 and a centred footprint. Each model carries one base-colour texture, so every model
 * is its own batched mesh with its own textured material.
 */
import { material } from "@aura3d/engine";
import { MESHY_ASSETS, MESHY_BINS, MESHY_MODELS, type MeshyBaked } from "./meshy.baked";

export type MeshyKey = string;
export interface MeshyGeometry { readonly positions: Float32Array; readonly normals: Float32Array; readonly uvs: Float32Array; readonly indices: Uint32Array }

function decode(model: MeshyBaked, buffer: ArrayBuffer): MeshyGeometry {
  const n = model.vertices;
  let offset = 0;
  const p = new Int16Array(buffer, offset, n * 3); offset += n * 6;
  const nr = new Int8Array(buffer, offset, n * 3); offset += n * 3; offset += (4 - ((n * 3) % 4)) % 4;
  const uvs = new Float32Array(buffer.slice(offset, offset + n * 8)); offset += n * 8;
  const count = model.triangles * 3;
  const raw = model.uint32 ? new Uint32Array(buffer.slice(offset, offset + count * 4)) : Uint32Array.from(new Uint16Array(buffer.slice(offset, offset + count * 2)));
  const positions = new Float32Array(p.length), normals = new Float32Array(nr.length);
  for (let k = 0; k < p.length; k++) positions[k] = (p[k]! / 32767) * model.ext;
  for (let v = 0; v < nr.length; v += 3) {
    const x = nr[v]! / 127, y = nr[v + 1]! / 127, z = nr[v + 2]! / 127, l = Math.hypot(x, y, z) || 1;
    normals[v] = x / l; normals[v + 1] = y / l; normals[v + 2] = z / l;
  }
  return { positions, normals, uvs, indices: raw };
}

const cache = new Map<string, MeshyGeometry>();
/** Fetches every baked model's binary geometry; models that fail to load stay absent so the port falls back to its baked CC0 cars and procedural scenery. */
export async function loadMeshy(): Promise<{ loaded: string[]; failed: string[] }> {
  const loaded: string[] = [], failed: string[] = [];
  await Promise.all(Object.keys(MESHY_MODELS).map(async (key) => {
    try {
      const res = await fetch(MESHY_BINS[key]!);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      cache.set(key, decode(MESHY_MODELS[key]!, await res.arrayBuffer()));
      loaded.push(key);
    } catch (error) {
      failed.push(key);
      console.warn(`roadster-hours-port: Meshy model "${key}" failed to load (${String(error)}); using the procedural fallback`);
    }
  }));
  return { loaded, failed };
}
/** Test hook: registers a geometry decoded elsewhere (unit tests read the bins from disk). */
export function registerMeshyForTest(key: MeshyKey, buffer: ArrayBuffer): void {
  const model = MESHY_MODELS[key];
  if (model) cache.set(key, decode(model, buffer));
}
export function hasMeshy(key: MeshyKey): boolean {
  return cache.has(key);
}
export function meshyGeometry(key: MeshyKey): MeshyGeometry | undefined {
  return cache.get(key);
}
/** Native size in metres: [width, height, length] for vehicles, [width, height, depth] for props. */
export const meshySize = (key: MeshyKey): readonly [number, number, number] => MESHY_MODELS[key]!.size;
export const meshyTriangles = (key: MeshyKey): number => MESHY_MODELS[key]?.triangles ?? 0;

type TextureKey = keyof typeof MESHY_ASSETS;
/** Textured PBR material for one baked model (`tint` multiplies the texture per mesh; per-instance colours also multiply). */
export function meshyMaterial(key: MeshyKey, options: { roughness?: number; metallic?: number; doubleSided?: boolean; specular?: number; clearcoat?: number; clearcoatRoughness?: number } = {}) {
  const texture = MESHY_ASSETS[key as TextureKey];
  return material.pbr({ color: "#ffffff", roughness: options.roughness ?? 0.55, metallic: options.metallic ?? 0.1, texture, ...(options.specular !== undefined ? { specularIntensity: options.specular } : {}), ...(options.clearcoat ? { clearcoat: options.clearcoat, clearcoatRoughness: options.clearcoatRoughness ?? 0.1 } : {}), ...(options.doubleSided ? { side: "double" } : {}) } as never);
}
