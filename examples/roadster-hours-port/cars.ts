/**
 * Decodes the baked CC0 car meshes (`cars.baked.ts`, produced by `tools/bake-cars.mjs`) into engine geometry specs.
 * Every group is normalised into the unit box [-0.5, 0.5]^3 with the vehicle front at -Z, so one instance matrix
 * `scale(width, height, length)` fits the sim's collision box exactly. Groups are drawn with different materials
 * (paint takes the per-instance colour; trim, glass and lights have fixed looks).
 */
import { BAKED_CARS, type BakedGroup } from "./cars.baked";

export type CarKey = keyof typeof BAKED_CARS;
export type CarGroup = "paint" | "trim" | "glass" | "head" | "tail";
export const CAR_GROUPS: readonly CarGroup[] = ["paint", "trim", "glass", "head", "tail"];

export interface GroupGeometry { readonly positions: Float32Array; readonly normals: Float32Array; readonly indices: Uint32Array }

function bytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeGroup(group: BakedGroup): GroupGeometry {
  const p = new Int16Array(bytes(group.p).buffer), n = new Int8Array(bytes(group.n).buffer), i = new Uint16Array(bytes(group.i).buffer);
  const positions = new Float32Array(p.length), normals = new Float32Array(n.length);
  for (let k = 0; k < p.length; k++) positions[k] = p[k]! / 32767 / 2;
  for (let v = 0; v < n.length; v += 3) {
    const x = n[v]! / 127, y = n[v + 1]! / 127, z = n[v + 2]! / 127, l = Math.hypot(x, y, z) || 1;
    normals[v] = x / l; normals[v + 1] = y / l; normals[v + 2] = z / l;
  }
  return { positions, normals, indices: Uint32Array.from(i) };
}

const cache = new Map<string, GroupGeometry>();
export function carGroup(car: CarKey, group: CarGroup): GroupGeometry | undefined {
  const baked = BAKED_CARS[car].groups[group];
  if (!baked) return undefined;
  const key = `${car}:${group}`;
  let g = cache.get(key);
  if (!g) cache.set(key, g = decodeGroup(baked));
  return g;
}

/** Native proportions (width, height, length in metres) of the source model, for scaling the player car. */
export const carNativeSize = (car: CarKey): readonly [number, number, number] => BAKED_CARS[car].size;

/** Which baked car stands in for each of the sim's passenger-car pieces. */
export const CAR_FOR_PIECE: Readonly<Record<string, CarKey>> = { sedan: "sedan", hatch: "hatch", suv: "taxi", pickup: "taxi" };
