import { instances, model, game, type AuraAssetRef, type AuraApp } from "@aura3d/engine";
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

/** Static typed spectator cards: native GLB instances, never skinned-instancing claims. */
export function createPublicCrowdNodes(asset: AuraAssetRef<"model">, mode: "native" | "individual" | "hidden" = "native") {
  const node = instances.model(asset, {
    name: "aura clash typed spectator crowd",
    targetMaxDimension: 0.28,
    castShadow: false,
    receiveShadow: true,
    transforms: FANS.map((fan, index) => ({
      // Clamp the old negative wobble so the authored figure cannot enter the fighter lane.
      position: [Math.abs(fan.x) >= 2.85 ? Math.sign(fan.x) * Math.max(3.02, Math.abs(fan.x)) : fan.x,
        0.15 + Math.sin(index * 0.735) * 0.008, fan.z] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      scale: fan.scale / 0.55
    }))
  }).runtime(game.runtimeNode("aura-clash-public-spectator-pool", { tags: ["crowd", "static-typed-instances"] }));
  const snapshot = node.toJSON();
  const nodes = mode === "hidden" ? [] : mode === "native" ? [node] : snapshot.instances!.map((transform, index) =>
    model(asset, { name: `aura clash typed spectator crowd copy ${index}`, targetMaxDimension: 0.28, castShadow: false, receiveShadow: true })
      .position(...(transform.position ?? [0, 0, 0]))
      .rotate(...(transform.rotation ?? [0, 0, 0]))
      .scale(transform.scale ?? 1)
      .runtime(game.runtimeNode(`aura-clash-public-spectator-${index}`))
  );
  return {
    nodes,
    instanceCount: mode === "hidden" ? 0 : FANS.length,
    update(app: AuraApp, input: { elapsedSeconds: number; cheer: number; reducedMotion: boolean }) {
      const strength = Math.max(0, Math.min(1, input.cheer));
      const displacement = input.reducedMotion ? 0 : Math.sin(input.elapsedSeconds * 2) * 0.008 +
        strength * 0.06 * Math.abs(Math.sin(input.elapsedSeconds * 3 * Math.PI));
      // Presentation-only rigid group motion. Navigation and fighter collision are untouched.
      if (mode === "native") app.nodes.require("aura-clash-public-spectator-pool").setPosition(0, displacement, 0);
      if (mode === "individual") snapshot.instances!.forEach((transform, index) => {
        const position = transform.position ?? [0, 0, 0];
        app.nodes.require(`aura-clash-public-spectator-${index}`).setPosition(position[0], position[1] + displacement, position[2]);
      });
    }
  };
}
