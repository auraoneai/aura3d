/**
 * Lane prd06 scene `prd06-ik-slope` (PRD-06 T3.9): Soldier Idle on a 20° ramp
 * plus 18 cm stairs with foot IK on. The aura3d adapter binds `footPlanting`
 * against an analytic `GroundRaycaster` derived from `spec.terrain` (the
 * shared ramp/stairs height function); the three adapter drives the same two
 * leg chains through `CCDIKSolver` against identical targets.
 *
 * `admittedAsReference: false` per the PRD: acceptance is the engine-reported
 * contact metric (§17.0 `extra.footIk`), not image parity — the solvers run
 * different algorithms on purpose.
 *
 * Terrain splits along z = 0: the smooth ramp covers z < 0, stairs cover
 * z >= 0, so one soldier straddles both surfaces (it faces +x; its feet land
 * on either side of the seam at slightly different planted heights).
 */
import type { SceneSpec } from "../../shared/types";
import { RESOLUTION } from "../../shared/types";
import type { RampStairsTerrainSpec } from "../../shared/terrain";
import { rampStairsRise } from "../../shared/terrain";

export const PRD06_IK_SLOPE_TERRAIN: RampStairsTerrainSpec = {
  kind: "ramp-stairs",
  slopeDeg: 20,
  rampStartX: 0,
  rampLength: 2,
  stepHeight: 0.18,
  stepCount: 4,
  stepDepth: 0.5,
  splitZ: 0
} as const;

const SLOPE_RAD = (PRD06_IK_SLOPE_TERRAIN.slopeDeg * Math.PI) / 180;
const RISE = rampStairsRise(PRD06_IK_SLOPE_TERRAIN);

export interface IkSlopeSpec extends SceneSpec {
  readonly owner: "prd06";
  /** Never a reference baseline — acceptance is the foot-IK metric (T3.9). */
  readonly admittedAsReference: false;
  readonly ikSlope: {
    /** Name of the model object whose foot-IK metric is reported. */
    readonly modelName: string;
    /** Engine-reported max per-foot contact error tolerance (meters). */
    readonly maxContactError: number;
  };
}

const LEG = {
  left: { side: "left", hip: "mixamorig:LeftUpLeg", knee: "mixamorig:LeftLeg", ankle: "mixamorig:LeftFoot", ankleHeight: 0.115 },
  right: { side: "right", hip: "mixamorig:RightUpLeg", knee: "mixamorig:RightLeg", ankle: "mixamorig:RightFoot", ankleHeight: 0.115 }
} as const;

export const prd06IkSlope: IkSlopeSpec = {
  id: "prd06-ik-slope",
  index: 109,
  title: "IK on slope + stairs",
  purpose:
    "Soldier Idle straddling a 20° ramp and 18 cm stairs with foot IK on — " +
    "analytic ground on both engines; acceptance is the engine-reported " +
    "foot contact error, not parity",
  resolution: RESOLUTION,
  camera: { position: [2.7, 1.6, 3.4], target: [0.9, 0.8, 0], fov: 40, near: 0.05, far: 50 },
  background: { kind: "color", color: "#202329" },
  environment: { hdri: "studioSmall08", intensity: 0.6, rotation: 0 },
  toneMapping: "aces-filmic",
  exposure: 1,
  lights: [{ kind: "directional", name: "sun", color: "#fff2e0", intensity: 2.5, position: [2.5, 5, 3], target: [0.9, 0.4, 0], castShadow: true }],
  objects: [
    // Flat approach + under-terrain base.
    {
      kind: "primitive",
      name: "ground base",
      shape: "box",
      size: [6, 0.04, 4],
      position: [1, -0.021, 0],
      material: { color: "#6d7076", roughness: 0.9, metalness: 0 },
      castShadow: false,
      receiveShadow: true
    },
    // Smooth ramp (z < 0 half).
    {
      kind: "primitive",
      name: "ramp",
      shape: "box",
      size: [2.2, 0.08, 2],
      position: [1.0, RISE / 2 - 0.035, -1],
      rotation: [0, 0, SLOPE_RAD],
      material: { color: "#7d8490", roughness: 0.85, metalness: 0 },
      castShadow: false,
      receiveShadow: true
    },
    // Stairs (z >= 0 half) — four 0.5 m treads at 18 cm rises.
    ...[0, 1, 2, 3].map(i => ({
      kind: "primitive" as const,
      name: `stair ${i + 1}`,
      shape: "box" as const,
      size: [0.5, (i + 1) * 0.18, 2] as const,
      position: [i * 0.5 + 0.25, ((i + 1) * 0.18) / 2, 1] as const,
      material: { color: "#8b93a1", roughness: 0.85, metalness: 0 },
      castShadow: false,
      receiveShadow: true
    })),
    // Top plateau after the ramp/stairs.
    {
      kind: "primitive",
      name: "plateau",
      shape: "box",
      size: [1.0, RISE, 4],
      position: [2.5, RISE / 2, 0],
      material: { color: "#7d8490", roughness: 0.85, metalness: 0 },
      castShadow: false,
      receiveShadow: true
    },
    {
      kind: "model",
      name: "soldier",
      asset: "soldier",
      // Faces +x so the feet straddle the ramp/stairs seam at z = 0; y sits
      // just above the local surfaces (ramp ≈ 0.346, stair tread 0.36).
      position: [0.95, 0.4, 0],
      rotation: [0, Math.PI / 2, 0],
      castShadow: true,
      receiveShadow: true,
      animation: { clip: "Idle", time: 0.5, footIk: { legs: [LEG.left, LEG.right], pelvis: "mixamorig:Hips", runtimeId: "prd06-ik-slope-soldier" } }
    }
  ],
  shadows: { mapSize: 2048, type: "pcf-soft", directionalExtent: 3.5, bias: -0.0005, normalBias: 0.02 },
  time: 0,
  settleFrames: 6,
  owner: "prd06",
  qrFlags: ["animation"],
  terrain: PRD06_IK_SLOPE_TERRAIN,
  admittedAsReference: false,
  ikSlope: {
    modelName: "soldier",
    maxContactError: 0.03
  },
  masks: ["silhouette-edge"],
  primaryRegion: "silhouette-edge"
};
