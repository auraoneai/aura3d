/**
 * Provides smooth-normal sculpted procedural multi-material car meshes (`art/proceduralModels.ts`)
 * normalized into the unit box [-0.5, 0.5]^3 with the vehicle front at -Z, so one instance matrix
 * `scale(width, height, length)` fits the sim's collision box exactly. Groups are drawn with different
 * materials (paint takes the per-instance colour; trim, glass and lights have fixed physical looks).
 */
import { BAKED_CARS } from "./cars.baked";
import { getProceduralCarGroup } from "./art/proceduralModels";

export type CarKey = keyof typeof BAKED_CARS;
export type CarGroup = "paint" | "trim" | "glass" | "head" | "tail";
export const CAR_GROUPS: readonly CarGroup[] = ["paint", "trim", "glass", "head", "tail"];

export interface GroupGeometry { readonly positions: Float32Array; readonly normals: Float32Array; readonly indices: Uint32Array }

export function carGroup(car: CarKey, group: CarGroup): GroupGeometry | undefined {
  return getProceduralCarGroup(car, group);
}

/** Native proportions (width, height, length in metres) of the source model, for scaling the player car. */
export const carNativeSize = (car: CarKey): readonly [number, number, number] => BAKED_CARS[car].size;

/** Which baked car stands in for each of the sim's passenger-car pieces. */
export const CAR_FOR_PIECE: Readonly<Record<string, CarKey>> = { sedan: "sedan", hatch: "hatch", suv: "taxi", pickup: "taxi" };
