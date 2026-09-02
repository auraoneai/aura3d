import { sampleCrowdAnimation, type CrowdAnimationAgent } from "@aura3d/animation";
import { Geometry, InstancedUnlitMaterial, type RenderItem } from "@aura3d/engine/rendering";
import { composeMat4, quatFromEuler, type Mat4 } from "@aura3d/scene";

/**
 * AC-A3 — instanced rooftop crowd.
 *
 * Crowd silhouettes around the stage rim as **two instanced pools**: a torso pool and a head pool,
 * each carrying `instanceTransforms`. That remains two fixed draw submissions regardless of crowd
 * size, without per-fan nodes or draw calls. Idle bob is a deterministic per-instance phase (shared
 * `@aura3d/animation` crowd sampler), and big hits drive a synchronized cheer bounce.
 * Presentation only: the crowd never touches combat state and never enters the fighter lane.
 */

/**
 * Nearest fan center to the fight plane. Fighters clamp at |x| ≤ 2.85 (`stage.minX/maxX`); the
 * closest fan sits at |x| = 3.02 with a 0.14-unit radius, so even at full bob/cheer amplitude no
 * silhouette crosses into the lane. The back row instead stands behind the lane's z bound (-0.62).
 */
export const CROWD_MIN_LANE_DISTANCE_X = 3.02;
export const CROWD_BACK_ROW_Z = -0.78;
export const CROWD_MAX_RADIUS = 0.1;

interface CrowdFan {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Deterministic per-instance scale variation in [0.85, 1.15]. */
  readonly scale: number;
}

function buildFans(): CrowdFan[] {
  const fans: CrowdFan[] = [];
  // Side rows flank the stage rim; back rows stand behind the fight plane.
  const sideSlots = 9;
  for (let index = 0; index < sideSlots; index += 1) {
    const t = index / (sideSlots - 1);
    const z = -0.52 + t * 1.04;
    const wobble = Math.sin(index * 2.39) * 0.12;
    fans.push({ id: `crowd-left-${index}`, x: -(CROWD_MIN_LANE_DISTANCE_X + wobble + (index % 3) * 0.34), y: 0, z, scale: 0.48 + ((index * 37) % 17) / 100 });
    fans.push({ id: `crowd-right-${index}`, x: CROWD_MIN_LANE_DISTANCE_X + wobble + ((index + 1) % 3) * 0.34, y: 0, z: -z, scale: 0.48 + ((index * 53) % 17) / 100 });
  }
  const backSlots = 10;
  for (let index = 0; index < backSlots; index += 1) {
    const t = index / (backSlots - 1);
    fans.push({ id: `crowd-back-${index}`, x: -2.6 + t * 5.2, y: 0, z: CROWD_BACK_ROW_Z - (index % 2) * 0.16, scale: 0.46 + ((index * 41) % 19) / 100 });
  }
  return fans;
}

const FANS = buildFans();
const FAN_AGENTS: readonly CrowdAnimationAgent[] = FANS.map((fan, index) => ({
  id: fan.id,
  clip: "idle-bob",
  phase: index * 0.735,
  speed: 0.9 + ((index * 17) % 23) / 100
}));

export interface CrowdInstancesPool {
  readonly instanceCount: number;
  collect(input: {
    elapsedSeconds: number;
    /** Synchronized cheer strength in [0, 1], decaying outside; big hits raise it. */
    readonly cheer: number;
    readonly reducedMotion: boolean;
  }): RenderItem[];
}

export function createCrowdInstances(): CrowdInstancesPool {
  const torsoGeometry = Geometry.capsule({ radius: 0.12, height: 0.44, segments: 10, rings: 5 });
  const headGeometry = Geometry.uvSphere(0.12, 10, 7);
  const torsoMaterial = new InstancedUnlitMaterial({
    name: "aura-clash-crowd-torsos",
    // Lift the near-row value just enough to separate the crowd from the brick and floor.  These
    // remain low-contrast set-dressing silhouettes, not a competing primary subject.
    color: [0.034, 0.105, 0.125, 1]
  });
  const headMaterial = new InstancedUnlitMaterial({
    name: "aura-clash-crowd-heads",
    color: [0.075, 0.19, 0.205, 1]
  });
  const torsoTransforms = new Float32Array(FANS.length * 16);
  const headTransforms = new Float32Array(FANS.length * 16);
  return {
    instanceCount: FANS.length,
    collect({ elapsedSeconds, cheer, reducedMotion }) {
      // Reduced motion freezes both the idle bob and the cheer bounce at their rest pose.
      const samples = reducedMotion
        ? FAN_AGENTS.map((agent) => ({ id: agent.id, clip: agent.clip, time: agent.phase }))
        : sampleCrowdAnimation(FAN_AGENTS, elapsedSeconds);
      const cheerStrength = reducedMotion ? 0 : Math.min(1, Math.max(0, cheer));
      for (const [index, fan] of FANS.entries()) {
        const sample = samples[index]!;
        const idleBob = Math.sin(sample.time * Math.PI * 2) * 0.03;
        // Synchronized cheer bounce: one shared beat on top of each fan's idle phase.
        const cheerBounce = cheerStrength * 0.11 * Math.abs(Math.sin(sample.time * Math.PI * 2 * 1.5));
        const height = fan.scale * (1 + idleBob + cheerBounce);
        const torsoHeight = height * 0.72;
        const torsoMatrix = composeMat4(
          [fan.x, fan.y + torsoHeight * 0.42, fan.z],
          quatFromEuler(0, fan.x < 0 ? 0.5 : -0.5, 0),
          [fan.scale * 0.72, torsoHeight, fan.scale * 0.6]
        ) as Mat4;
        const headMatrix = composeMat4(
          [fan.x, fan.y + torsoHeight * 0.87, fan.z],
          quatFromEuler(0, 0, 0),
          [fan.scale * 0.68, fan.scale * 0.68, fan.scale * 0.68]
        ) as Mat4;
        torsoTransforms.set(torsoMatrix, index * 16);
        headTransforms.set(headMatrix, index * 16);
      }
      return [
        {
          label: "aura-clash-rendered-stage:crowd-fan-torso-pool",
          geometry: torsoGeometry,
          material: torsoMaterial,
          instanceTransforms: torsoTransforms,
          includeInAutoFrame: false
        },
        {
          label: "aura-clash-rendered-stage:crowd-fan-head-pool",
          geometry: headGeometry,
          material: headMaterial,
          instanceTransforms: headTransforms,
          includeInAutoFrame: false
        }
      ];
    }
  };
}
