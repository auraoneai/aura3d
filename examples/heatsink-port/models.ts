/**
 * Meshy-generated models for the HEATSINK port (own text prompts; see assets/ATTRIBUTION.md and PORTING-NOTES.md).
 * Loaded through the production-safe path: same-origin pathname + sha256 hash, never an http(s) URL.
 */
import { defineModelAssets, instances, model } from "@aura3d/engine";
import { seededRandom } from "./rng";
import type { Frame, Track } from "./track";

type NodeB = ReturnType<typeof model>;
const LICENSE = "Meshy generated asset (AuraOne account plan terms at generation time), original text prompt, 2026-10-23";
const glb = (name: string): string => new URL(`./assets/models/${name}.glb`, import.meta.url).pathname;
const entry = (name: string, sha256: string) => ({ url: glb(name), sha256 });

export const MODELS = defineModelAssets({
  drone: entry("drone2", "sha256-52931d5e54b29b4ca8a26e8ec9a8bc41cbef11c61d149c58d02aec1850af8c41"),
  barrel: entry("barrel", "sha256-8625604ee3c67a56fb2a584715f6b5495c8174657a8f569433de15ba457f9f89"),
  pickupShield: entry("pickup-shield", "sha256-dabd71858e03ddc34a790bf7e14db53321084794f5e5771fdde595c0753b0b1d"),
  plantCap: entry("plant-cap", "sha256-028a45df884369e4e4703329322c4bb92857086b02492150381f90ecbc7cb223"),
  plantCoral: entry("plant-coral", "sha256-d3f503fff9947f4d61d24bfc893185bd1637328b106e08726c88f79db48d04d7"),
  pylon: entry("pylon", "sha256-e8cf27c19fb713c4fd9d7938e8eb7d76482d9a84a2717d0d64b19a0b26b0f335"),
  ruinArch: entry("ruin-arch", "sha256-c0abd976ddbdf2e301c4d8400a03c9ade7c3cfb5cf52f85a00e87a6055283b21"),
  pickupRepair: entry("pickup-repair", "sha256-884e0b311177e6c45e7fad2c6af7c10d0b4ee748478daee41bb454954f5d9b27"),
  ruinMonolith: entry("ruin-monolith", "sha256-49711ae57d13f48205f007592c7f755e43363629633e379d1bd791401104c8e8")
}, { license: LICENSE, queryParam: null }).refs;

/** the quad-rotor drone's largest dimension in metres (the old primitive craft was ~4.6 m across the arms) */
export const DRONE_LENGTH = 4.2;

export const droneHull = (): NodeB =>
  model(MODELS.drone, { name: "drone-hull", targetMaxDimension: DRONE_LENGTH, castShadow: false, receiveShadow: false });

export const barrelModel = (i: number): NodeB =>
  model(MODELS.barrel, { name: `barrel-${i}`, targetHeight: 2.2, castShadow: false, receiveShadow: false });

export const pickupModel = (i: number, shield: boolean): NodeB =>
  model(shield ? MODELS.pickupShield : MODELS.pickupRepair, { name: `pickup-${i}`, targetHeight: shield ? 2.4 : 2.0, castShadow: false, receiveShadow: false });

type Spot = { position: [number, number, number]; rotation: [number, number, number]; scale: number };

/** Static scenery scattered beyond the guard rails: alien flora and ruin pieces. Deterministic (seeded), sim-independent. */
export function sceneryNodes(track: Track, seed = 733): NodeB[] {
  const rng = seededRandom(seed);
  const f: Partial<Frame> = {};
  const caps: Spot[] = [], corals: Spot[] = [], ruins: Spot[] = [], arches: Spot[] = [];
  for (let s = 0; s < track.length; s += 34 + rng() * 38) {
    const fr = track.frame(s, f) as Frame;
    for (const side of [-1, 1] as const) {
      const pick = rng();
      if (pick > 0.78) continue;
      const lat = side * (fr.hw + 11 + rng() * 22);
      const x = fr.x + fr.rx * lat, z = fr.z + fr.rz * lat;
      const y = fr.y + track.latY(s, lat) - 0.4;
      const spot = { position: [x, y, z] as [number, number, number], rotation: [0, rng() * Math.PI * 2, 0] as [number, number, number], scale: 0.8 + rng() * 0.5 };
      if (pick < 0.3) caps.push(spot);
      else if (pick < 0.6) corals.push(spot);
      else if (pick < 0.7) arches.push(spot);
      else ruins.push(spot);
    }
  }
  const nodes: NodeB[] = [];
  const add = (name: string, asset: (typeof MODELS)[keyof typeof MODELS], spots: Spot[], height: number): void => {
    if (spots.length === 0) return;
    nodes.push(instances.model(asset, {
      name,
      transforms: spots.map((p) => ({ position: p.position, rotation: p.rotation, scale: [p.scale, p.scale, p.scale] as [number, number, number] })),
      targetHeight: height,
      castShadow: false
    }));
  };
  add("scenery-caps", MODELS.plantCap, caps, 9);
  add("scenery-corals", MODELS.plantCoral, corals, 4.5);
  add("scenery-ruins", MODELS.ruinMonolith, ruins, 14);
  add("scenery-arches", MODELS.ruinArch, arches, 11);
  return nodes;
}

/** two pylons per checkpoint gate, standing on the road edge (static transforms, one instanced draw class) */
export function gatePylonNodes(track: Track, rotationOf: (fr: Frame) => readonly [number, number, number]): NodeB[] {
  const transforms: { position: [number, number, number]; rotation: [number, number, number] }[] = [];
  const f: Partial<Frame> = {};
  for (const s of track.checkpoints) {
    const fr = track.frame(s, f) as Frame;
    const rot = rotationOf(fr);
    for (const side of [-1, 1] as const) {
      const lat = side * (fr.hw + 0.6);
      transforms.push({ position: [fr.x + fr.rx * lat, fr.y, fr.z + fr.rz * lat], rotation: [rot[0], rot[1], rot[2]] });
    }
  }
  if (transforms.length === 0) return [];
  return [instances.model(MODELS.pylon, { name: "gate-pylons", transforms, targetHeight: 22, castShadow: false })];
}
