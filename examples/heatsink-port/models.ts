/**
 * Procedural multi-material models for Ion Circuit (`WP-23`), replacing static `.glb` mounts
 * while preserving `MODELS` / `MODELS_LITE` tier descriptors and deterministic track placement.
 */
import { defineModelAssets } from "@aura3d/engine";
import {
  buildBarrelNode,
  buildDroneCanopyNode,
  buildDroneFlapNode,
  buildDroneHullNode,
  buildDroneNozzleNode,
  buildDroneRotorNode,
  buildDroneTrimNode,
  buildGatePylonInstancedNodes,
  buildHeavyTargetNode,
  buildPickupNode,
  buildSceneryInstancedNodes,
  buildSentryTargetNode,
  type ProceduralNodeBuilder,
  type ScenerySpot
} from "./art/proceduralModels";
import { seededRandom } from "./rng";
import type { Frame, Track } from "./track";

type NodeB = ProceduralNodeBuilder;
const LICENSE = "Meshy generated asset (AuraOne account plan terms at generation time), original text prompt, 2026-10-23";
const glb = (name: string): string => new URL(`./assets/models/${name}.glb`, import.meta.url).pathname;
const entry = (name: string, sha256: string) => ({ url: glb(name), sha256 });
const liteGlb = (name: string): string => new URL(`./assets/models-lite/${name}.glb`, import.meta.url).pathname;
const lite = (name: string, sha256: string) => ({ url: liteGlb(name), sha256 });

export const MODELS = defineModelAssets({
  drone: entry("drone2", "sha256-52931d5e54b29b4ca8a26e8ec9a8bc41cbef11c61d149c58d02aec1850af8c41"),
  barrel: entry("barrel", "sha256-8625604ee3c67a56fb2a584715f6b5495c8174657a8f569433de15ba457f9f89"),
  pickupShield: entry("pickup-shield", "sha256-dabd71858e03ddc34a790bf7e14db53321084794f5e5771fdde595c0753b0b1d"),
  plantCap: entry("plant-cap", "sha256-028a45df884369e4e4703329322c4bb92857086b02492150381f90ecbc7cb223"),
  plantCoral: entry("plant-coral", "sha256-d3f503fff9947f4d61d24bfc893185bd1637328b106e08726c88f79db48d04d7"),
  pylon: entry("pylon", "sha256-e8cf27c19fb713c4fd9d7938e8eb7d76482d9a84a2717d0d64b19a0b26b0f335"),
  ruinArch: entry("ruin-arch", "sha256-c0abd976ddbdf2e301c4d8400a03c9ade7c3cfb5cf52f85a00e87a6055283b21"),
  pickupRepair: entry("pickup-repair", "sha256-884e0b311177e6c45e7fad2c6af7c10d0b4ee748478daee41bb454954f5d9b27"),
  ruinMonolith: entry("ruin-monolith", "sha256-49711ae57d13f48205f007592c7f755e43363629633e379d1bd791401104c8e8"),
  /* GU47 WP-36 (IC-13): the sentry target, admitted with `aura3d assets import-meshy` (provenance/heatsink_port_ionSentryDrone.*) */
  ionSentryDrone: entry("heatsink_port_ionSentryDrone", "sha256-7af110b660a44dac0e457b86e4eac10a4b47620743a3ba5d79aea07dde3c3f44"),
  /* GU47 wave 2 (IC-13): the heavy target, admitted with `aura3d assets import-meshy` (provenance/heatsink_port_ionHeavyDrone.*) */
  ionHeavyDrone: entry("heatsink_port_ionHeavyDrone", "sha256-d1ef5d347eb44725b7b21a87c21faad8e1529e83792369efd9436f9976c6c346")
}, { license: LICENSE, queryParam: null }).refs;

/**
 * The low-quality set (HP-12), built from MODELS by `assets/provenance/make-lite.mjs`: 512 px maps (a quarter of the
 * texture memory) and the drone at 15k triangles instead of 55.7k. Same bounds, same materials. Used when the game runs
 * at `quality: "low"`, which coarse-pointer devices get by default.
 */
export const MODELS_LITE = defineModelAssets({
  drone: lite("drone2", "sha256-2b0021628a699a015d8ae878e0e1623dfd4694c35330efa8dcb0dc38a1c8897e"),
  barrel: lite("barrel", "sha256-7202c86897ac4bc1da5116901f99a9fbc2e4ce5779b09ba7fb52cd1e06fc872e"),
  pickupShield: lite("pickup-shield", "sha256-05422f9b575cb93b4ef1ab35cab3ecd0f07e64a3baca5f1e2f7c9b9aed285753"),
  plantCap: lite("plant-cap", "sha256-13fafd9f8379c4c334314606293f7296e39d984b09a610bb372a6880f07d6b6f"),
  plantCoral: lite("plant-coral", "sha256-eca92843a0e495a675dfbfeded62a76d68c660025fc15f2e3ab47938ef98ac22"),
  pylon: lite("pylon", "sha256-d9e6698839c37c0eacbcff762a8393c012c7a8e3d649ce6fe00a156ad1c63886"),
  ruinArch: lite("ruin-arch", "sha256-34d6774bbd3b2a1aa1cd76b3741564c070650cb134add40592be7705753b41d9"),
  pickupRepair: lite("pickup-repair", "sha256-6b31f37cf7c13f2f4b7a071462b9adb9d10a24d83bb152f15e609b9955eab2b3"),
  ruinMonolith: lite("ruin-monolith", "sha256-1b9d87322a320075cc659dc32a8dc7eee69a875e55d890db3cb5920486789b94"),
  ionSentryDrone: lite("heatsink_port_ionSentryDrone", "sha256-9ad8177417df8fa6c8cd13f92f614144d230d77e6e8da9a2bb229ce92568ab9f"),
  ionHeavyDrone: lite("heatsink_port_ionHeavyDrone", "sha256-e9faec2358b1a056ef64fc47e520b3c55e071a2071b4eb01e066f613ce690ed3")
}, { license: LICENSE, queryParam: null }).refs;

export type ModelSet = typeof MODELS;
export const modelSet = (quality: "high" | "low"): ModelSet => (quality === "low" ? MODELS_LITE : MODELS);

/** the quad-rotor drone's largest dimension in metres (the old primitive craft was ~4.6 m across the arms) */
export const DRONE_LENGTH = 4.2;

const isLiteSet = (set: ModelSet): boolean => set === MODELS_LITE;

/** `casts` (IC-03, twilight look): the drone hull is the root shadow caster under the key; `?look=original` keeps the blob only */
export const droneHull = (set: ModelSet = MODELS, casts = false): NodeB =>
  buildDroneHullNode(isLiteSet(set), casts);

export const droneTrim = (set: ModelSet = MODELS): NodeB =>
  buildDroneTrimNode(isLiteSet(set));

export const droneCanopy = (set: ModelSet = MODELS): NodeB =>
  buildDroneCanopyNode(isLiteSet(set));

export const droneFlap = (index: number, set: ModelSet = MODELS): NodeB =>
  buildDroneFlapNode(index, isLiteSet(set));

export const droneNozzle = (index: number, set: ModelSet = MODELS): NodeB =>
  buildDroneNozzleNode(index, isLiteSet(set));

export const droneRotor = (index: number, set: ModelSet = MODELS): NodeB =>
  buildDroneRotorNode(index, isLiteSet(set));

/** Procedural rotary interceptor sentry drone as a strike target's core (twilight; presentation only, hit radius unchanged) */
export const sentryModel = (id: number, size: number, set: ModelSet = MODELS, casts = false): NodeB =>
  buildSentryTargetNode(id, size, isLiteSet(set), casts);

/** Procedural twin-nacelle heavy gunship as the heavy strike target's core (twilight; presentation only, hit radius unchanged) */
export const heavyModel = (id: number, size: number, set: ModelSet = MODELS, casts = false): NodeB =>
  buildHeavyTargetNode(id, size, isLiteSet(set), casts);

export const barrelModel = (i: number, set: ModelSet = MODELS, casts = false): NodeB =>
  buildBarrelNode(i, isLiteSet(set), casts);

export const pickupModel = (i: number, shield: boolean, set: ModelSet = MODELS): NodeB =>
  buildPickupNode(i, shield, isLiteSet(set));

type Spot = ScenerySpot;

const SHOULDER_OFFSETS = [0, 3, 10, 24, 50, 100] as const;
const SHOULDER_DROPS = [-0.55, -0.75, -1.5, -3.2, -7.5, -17] as const;

/** Exact shoulder height offset matching `buildShoulders` so canyon architecture sits flush on banked shoulders. */
function shoulderDrop(offset: number, s: number): number {
  for (let j = 0; j < SHOULDER_OFFSETS.length - 1; j++) {
    const a = SHOULDER_OFFSETS[j]!, b = SHOULDER_OFFSETS[j + 1]!;
    if (offset <= b) {
      const t = (offset - a) / (b - a);
      const wobA = j >= 2 ? Math.sin(s * 0.013 + j * 1.9) * 0.9 + Math.sin(s * 0.041 + j) * 0.4 : 0;
      const wobB = j + 1 >= 2 ? Math.sin(s * 0.013 + (j + 1) * 1.9) * 0.9 + Math.sin(s * 0.041 + (j + 1)) * 0.4 : 0;
      return SHOULDER_DROPS[j]! + (SHOULDER_DROPS[j + 1]! - SHOULDER_DROPS[j]!) * t + wobA + (wobB - wobA) * t;
    }
  }
  return SHOULDER_DROPS[SHOULDER_DROPS.length - 1]!;
}

/** Static canyon & reactor scenery beyond the guard rails: basalt mesas, cryo-vents, coolant towers & boost arches. */
export function sceneryNodes(track: Track, seed = 733, set: ModelSet = MODELS, casts = false): NodeB[] {
  const rng = seededRandom(seed);
  const f: Partial<Frame> = {};
  const caps: Spot[] = [], corals: Spot[] = [], ruins: Spot[] = [], arches: Spot[] = [];
  for (let s = 0; s < track.length; s += 34 + rng() * 38) {
    const fr = track.frame(s, f) as Frame;
    for (const side of [-1, 1] as const) {
      const pick = rng();
      if (pick > 0.78) continue;
      const offset = 11 + rng() * 22;
      const lat = side * (fr.hw + offset);
      const x = fr.x + fr.rx * lat, z = fr.z + fr.rz * lat;
      const edgeY = fr.y + track.latY(s, side * fr.hw);
      const y = edgeY + shoulderDrop(offset, s) - 0.55;
      const slopeTilt = side * Math.atan2(shoulderDrop(offset + 2, s) - shoulderDrop(offset - 2, s), 4) * 0.28;
      const yaw = rng() * Math.PI * 2;
      const spot: Spot = {
        position: [x, y, z],
        rotation: [Math.sin(yaw) * slopeTilt, yaw, -Math.cos(yaw) * slopeTilt],
        scale: 0.8 + rng() * 0.5
      };
      if (pick < 0.3) caps.push(spot);
      else if (pick < 0.6) corals.push(spot);
      else if (pick < 0.7) arches.push(spot);
      else ruins.push(spot);
    }
  }
  return buildSceneryInstancedNodes({ caps, corals, ruins, arches }, isLiteSet(set), casts);
}

/** Two electromagnetic pylons with holographic chevron gantries per checkpoint gate, standing on the road edge. */
export function gatePylonNodes(track: Track, rotationOf: (fr: Frame) => readonly [number, number, number], set: ModelSet = MODELS, casts = false): NodeB[] {
  const transforms: { position: [number, number, number]; rotation: [number, number, number] }[] = [];
  const f: Partial<Frame> = {};
  for (const s of track.checkpoints) {
    const fr = track.frame(s, f) as Frame;
    const rot = rotationOf(fr);
    for (const side of [-1, 1] as const) {
      const lat = side * (fr.hw + 0.6);
      transforms.push({ position: [fr.x + fr.rx * lat, fr.y + track.latY(s, side * fr.hw) - 0.25, fr.z + fr.rz * lat], rotation: [rot[0], rot[1], rot[2]] });
    }
  }
  return buildGatePylonInstancedNodes(transforms, isLiteSet(set), casts);
}
