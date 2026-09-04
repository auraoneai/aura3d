import {
  createHeightFieldGround,
  createMovingPlatformGround,
  type GroundRaycaster
} from "@aura3d/animation";

/**
 * Root foot-planting bridge (muse3jsparity-PRD E2 box 2).
 *
 * `@aura3d/animation` is a regular engine dependency (unlike the optional Recast peer),
 * so the ground builders below are plain re-exporting wrappers. The planting post-pass
 * itself lives in `GLTFSceneAnimationRuntime.setFootPlanting`; this module shapes the
 * root-facing options, and the animation-controller binding carries the resolved config
 * (in-memory; ground functions never serialize) to the typed GLB actor.
 *
 * Units: the runtime skeleton lives in import units (glTF centimeters are common) while
 * `ground` speaks world meters. At apply time the engine attaches the actor's live model
 * matrix as the post-pass `worldFromLocal`, so the solve happens in the same world space
 * the renderer draws — normalized model nodes included. Refreshing the matrix never
 * resets foot locks; only a new leg set, ground, or solve parameter does.
 */

export type AuraFootSide = "left" | "right";
export type AuraFootVec3 = readonly [number, number, number];

export interface AuraFootPlantingLegOptions {
  readonly side: AuraFootSide;
  /** glTF node names of the hip (root), knee (mid), and ankle (end) of the leg chain. */
  readonly hip: string;
  readonly knee: string;
  readonly ankle: string;
  readonly pole?: AuraFootVec3;
}

export interface AuraHeightfieldSpec {
  readonly heightAt: (x: number, z: number) => { height: number; normal?: AuraFootVec3 };
}

export interface AuraMovingPlatformSpec {
  readonly base: AuraFootPlantingGroundLike | AuraHeightfieldSpec;
  readonly platformHeightAt: (x: number, z: number) => number | undefined;
}

/** Structural ground surface: the real `GroundRaycaster` satisfies this. */
export interface AuraFootPlantingGroundLike {
  raycastDown(
    origin: AuraFootVec3,
    maxDistance: number
  ): { point: AuraFootVec3; normal: AuraFootVec3; distance: number } | undefined;
}

export type AuraFootPlantingGround = AuraHeightfieldSpec | AuraMovingPlatformSpec | AuraFootPlantingGroundLike;

export interface AuraFootPlantingOptions {
  readonly legs: readonly AuraFootPlantingLegOptions[];
  readonly ground: AuraFootPlantingGround;
  readonly ankleHeight?: number;
  readonly rayStartHeight?: number;
  readonly maxRayDistance?: number;
  readonly plantThreshold?: number;
  readonly hipDropFactor?: number;
}

export interface AuraResolvedFootPlanting {
  readonly legs: readonly AuraFootPlantingLegOptions[];
  readonly ground: GroundRaycaster;
  readonly ankleHeight?: number | undefined;
  readonly rayStartHeight?: number | undefined;
  readonly maxRayDistance?: number | undefined;
  readonly plantThreshold?: number | undefined;
  readonly hipDropFactor?: number | undefined;
}

function isMovingPlatformSpec(ground: AuraFootPlantingGround): ground is AuraMovingPlatformSpec {
  const candidate = ground as Partial<AuraMovingPlatformSpec>;
  return typeof candidate.platformHeightAt === "function" && typeof candidate.base === "object";
}

function isRaycaster(ground: AuraFootPlantingGround): ground is AuraFootPlantingGroundLike {
  return typeof (ground as Partial<AuraFootPlantingGroundLike>).raycastDown === "function";
}

/**
 * Resolves root foot-planting options into the runtime config. Heightfield and
 * moving-platform specs become live raycasters here; an already-built raycaster
 * (structural `raycastDown`) passes through untouched.
 */
export function resolveFootPlanting(options: AuraFootPlantingOptions): AuraResolvedFootPlanting {
  if (options.legs.length === 0) {
    throw new Error("footPlanting requires at least one leg.");
  }
  const ground = options.ground;
  let raycaster: GroundRaycaster;
  if (isMovingPlatformSpec(ground)) {
    raycaster = createMovingPlatformGround(toRaycaster(ground.base), ground.platformHeightAt);
  } else if (isRaycaster(ground)) {
    raycaster = ground as GroundRaycaster;
  } else if (typeof ground.heightAt === "function") {
    raycaster = createHeightFieldGround(ground.heightAt);
  } else {
    throw new Error("footPlanting.ground must be a heightfield spec, a moving-platform spec, or a raycaster.");
  }
  return {
    legs: options.legs.map((leg) => ({ ...leg })),
    ground: raycaster,
    ...(options.ankleHeight !== undefined ? { ankleHeight: options.ankleHeight } : {}),
    ...(options.rayStartHeight !== undefined ? { rayStartHeight: options.rayStartHeight } : {}),
    ...(options.maxRayDistance !== undefined ? { maxRayDistance: options.maxRayDistance } : {}),
    ...(options.plantThreshold !== undefined ? { plantThreshold: options.plantThreshold } : {}),
    ...(options.hipDropFactor !== undefined ? { hipDropFactor: options.hipDropFactor } : {})
  };
}

function toRaycaster(ground: AuraFootPlantingGroundLike | AuraHeightfieldSpec): GroundRaycaster {
  if (isRaycaster(ground)) {
    return ground as GroundRaycaster;
  }
  if (typeof ground.heightAt === "function") {
    return createHeightFieldGround(ground.heightAt);
  }
  throw new Error("footPlanting platform base must be a heightfield spec or a raycaster.");
}

export const footPlanting = {
  heightfieldGround(heightAt: AuraHeightfieldSpec["heightAt"]): GroundRaycaster {
    return createHeightFieldGround(heightAt);
  },
  movingPlatformGround(
    base: AuraFootPlantingGroundLike | AuraHeightfieldSpec,
    platformHeightAt: (x: number, z: number) => number | undefined
  ): GroundRaycaster {
    return createMovingPlatformGround(toRaycaster(base), platformHeightAt);
  },
  resolve: resolveFootPlanting
} as const;
