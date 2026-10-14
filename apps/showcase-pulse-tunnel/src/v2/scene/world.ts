// apps/showcase-pulse-tunnel/src/v2/scene/world.ts — synthwave tunnel (T2.2).
// §6.9.9: the established neonTunnel backdrop (minus its thick concentric
// tube rings, which hid the lane at phone width), three lane-guide rails, the
// typed pulseRunnerCraft hero with engine glow + shield plane, a four-slot
// gate-frame pool driven by live gate geometry, and the graze/beat fx nodes.
import {
  game, instances, material, model, prefabs, primitives, type AuraNodeInput
} from "@aura3d/engine";
import { assets } from "../../../../../src/aura-assets";
import { PULSE_PLAYER_Z } from "../../gameplay/gates";
import { PULSE_LANE_X } from "../../gameplay/player";
import type { PulseConveyor } from "../../gameplay/conveyor";
import {
  BEAT_RING, CONVEYOR_CYAN, CONVEYOR_MAGENTA, CRAFT_ACCENT, GATE_MATERIALS,
  GRAZE_FLASH, HULL_DARK, LANE_GUIDE, SHIELD_PLANE
} from "./materials";
import type { PulseGateKind } from "../../gameplay/patterns";

const TUNNEL_FLOOR_Y = -0.54;
const GATE_POOL_SIZE = 4;

export interface PulseWorldNodes {
  readonly nodes: AuraNodeInput[];
  readonly gateNodeNames: readonly string[];
}

/**
 * Keep the public neonTunnel rails, wall washes, streaks, braces, sparks and
 * fog, omitting only its decorative concentric torus bands — the route's thin
 * per-gate frames own anticipation and the thick rings hid the player lane
 * and incoming obstacle at phone width (same call legacy made).
 */
function tunnelBackdropNodes(): AuraNodeInput[] {
  return [...prefabs.neonTunnel({ rings: 8, palette: "cyan-magenta" })].filter((node) => {
    const name = "name" in node ? String((node as { name?: string }).name ?? "") : "";
    return !name.includes("true circular neon tunnel tube ring");
  });
}

/** One glowing rail per lane so switches read at speed. */
function laneRailNodes(): AuraNodeInput[] {
  return PULSE_LANE_X.map((x, index) =>
    primitives.box({
      name: `pulse lane guide ${index + 1}`,
      material: LANE_GUIDE
    })
      .position(x, TUNNEL_FLOOR_Y + 0.02, (PULSE_PLAYER_Z - 13.5) / 2)
      .scale([0.05, 0.02, 8.0])
      .runtime(game.runtimeNode(`pulse-lane-guide-${index + 1}`, {
        tags: ["lane-guide", "set-dressing", "renderer-owned"]
      }))
      .toJSON());
}

/**
 * The four-slot gate-frame pool. Each slot is one stretched emissive box that
 * boot.ts re-fits to the live gate's geometry bounds (centerX ± halfWidth,
 * bottomY..topY) and z every frame; hidden when no gate owns the slot.
 */
function gatePoolNodes(): AuraNodeInput[] {
  const nodes: AuraNodeInput[] = [];
  const kinds: PulseGateKind[] = ["wall", "low", "high", "pylon"];
  for (let index = 0; index < GATE_POOL_SIZE; index += 1) {
    nodes.push(
      primitives.box({
        name: `pulse gate frame ${index + 1}`,
        material: GATE_MATERIALS[kinds[index % kinds.length]!]
      })
        .position(0, -30, -30)
        .scale([0.1, 0.1, 0.1])
        .runtime(game.runtimeNode(`pulse-gate-${index + 1}`, {
          tags: ["gate-frame", "sim-synced", "renderer-owned"]
        }))
        .toJSON());
  }
  return nodes;
}

export function pulseWorldNodes(conveyor?: PulseConveyor): PulseWorldNodes {
  const nodes: AuraNodeInput[] = [
    ...tunnelBackdropNodes(),
    // §14.4 segment conveyor: the live hoops (cyan/magenta alternating like
    // the prefab's rings) recycle through the tunnel — one draw per tone.
    ...(conveyor ? [
      instances.torus({
        name: "tunnel conveyor hoops cyan",
        material: CONVEYOR_CYAN,
        transforms: conveyor.segments.filter((_, index) => index % 2 === 0)
      }),
      instances.torus({
        name: "tunnel conveyor hoops magenta",
        material: CONVEYOR_MAGENTA,
        transforms: conveyor.segments.filter((_, index) => index % 2 === 1)
      })
    ] : []),
    ...laneRailNodes(),
    // -- hero: typed runner craft + engine glow + shield impact plane. -------
    model(assets.pulseRunnerCraft, {
      name: "pulse runner craft",
      targetMaxDimension: 2.4
    })
      .position(0, 0.08, PULSE_PLAYER_Z)
      .scale(0.8)
      .runtime(game.runtimeNode("pulse-runner-craft", {
        tags: ["player", "craft", "typed-primary"]
      })),
    primitives.sphere({ name: "pulse craft engine glow", material: CRAFT_ACCENT })
      .position(0, 0.2, PULSE_PLAYER_Z + 0.32)
      .scale([0.2, 0.2, 0.2])
      .runtime(game.runtimeNode("pulse-craft-glow", {
        tags: ["player", "craft", "renderer-owned"]
      })),
    primitives.torus({ name: "pulse shield impact plane", material: SHIELD_PLANE })
      .position(0, 0.35, PULSE_PLAYER_Z + 0.15)
      .scale([0.85, 0.62, 1])
      .runtime(game.runtimeNode("pulse-shield-plane", {
        tags: ["player", "shield", "renderer-owned"]
      })),
    // -- hull floor plate: gives the craft something to shadow against. ------
    primitives.box({ name: "pulse runner hull plate", material: HULL_DARK })
      .position(0, TUNNEL_FLOOR_Y - 0.02, PULSE_PLAYER_Z)
      .scale([2.6, 0.02, 2.0])
      .runtime(game.runtimeNode("pulse-hull-plate", {
        tags: ["set-dressing", "renderer-owned"]
      })),
    ...gatePoolNodes(),
    // -- event fx ------------------------------------------------------------
    primitives.sphere({ name: "pulse graze flash", material: GRAZE_FLASH })
      .position(0, -20, -20)
      .scale([0.22, 0.22, 0.22])
      .runtime(game.runtimeNode("pulse-graze-flash", {
        tags: ["event-feedback", "renderer-owned"]
      })),
    primitives.torus({ name: "pulse beat ring", material: BEAT_RING })
      .position(0, 0.35, PULSE_PLAYER_Z + 0.15)
      .scale([0.9, 0.66, 1])
      .runtime(game.runtimeNode("pulse-beat-ring", {
        tags: ["beat-feedback", "renderer-owned"]
      })),
    primitives.box({ name: "pulse section far glow", material: material.emissive({
      color: "#8b5cf6", emissive: "#a78bfa", emissiveIntensity: 0.7, opacity: 0.5
    }) })
      .position(0, 0.9, -13.2)
      .scale([3.4, 2.0, 0.05])
      .runtime(game.runtimeNode("pulse-far-glow", {
        tags: ["set-dressing", "renderer-owned"]
      }))
  ];
  return {
    nodes,
    gateNodeNames: Array.from({ length: GATE_POOL_SIZE }, (_, i) => `pulse-gate-${i + 1}`)
  };
}
