// Vault Breakers — fresh single-path scene builder (B4 port).
//
// One pure builder, shared headless and in the browser: it renders only the
// salvaged sim state (`sim.visuals` registrations + `kinematics()` /
// `poses()`), so the unit tests can construct the exact scene the browser
// mounts without a DOM. Geometry the sim does not register a visual for
// (felt, cabinet shell, bank lamps) is sized from the physics box the
// salvaged table builds: felt 5.7 x 8.3 m with its top at sim y=0, walls at
// x=±2.7 and z=±4.0, drain gap x in [-0.7, 0.7].
import {
  camera,
  game,
  lights,
  looks,
  material,
  model,
  primitives,
  scene,
  type AuraMaterialSpec,
  type AuraNodeInput
} from "@aura3d/engine";
import { assets } from "./aura-assets";
import { quatToEuler, type Euler, type PropVisual, type TableSimulation } from "./gameplay/table";

export const LOOK_ID = "neon-arcade" as const;

/** Visual plane offset: sim felt top is y=0; the rendered felt top sits at
 *  this height so the mechanisms assembly (centred at 0.34) rides on it. */
export const VISUAL_Y_OFFSET = 0.28;

export const CAMERA_POSITION: readonly [number, number, number] = [0, 5.15, 7.35];
export const CAMERA_TARGET: readonly [number, number, number] = [0, -0.05, -0.38];
export const CAMERA_FOV = 50;

const FELT = material.pbr({ color: "#12241c", roughness: 0.42, metalness: 0.08 });
const SHELL = material.pbr({ color: "#171120", roughness: 0.5, metalness: 0.25 });
const RAIL = material.pbr({ color: "#2a2030", roughness: 0.35, metalness: 0.5, emissive: "#ffd24d", emissiveIntensity: 0.08 });
const FLOOR = material.pbr({ color: "#0b0a0e", roughness: 0.55, metalness: 0.1 });
export const TARGET_ON = material.emissive({ name: "target insert lit", color: "#ffb830", emissive: "#ff6a00", emissiveIntensity: 1.4 });
export const TARGET_DOWN = material.emissive({ name: "target insert down", color: "#1e1824", emissive: "#28f5cc", emissiveIntensity: 0.35 });
export const BANK_LAMP_ON = material.emissive({ name: "bank lamp on", color: "#087d77", emissive: "#28f5cc", emissiveIntensity: 2.2 });
export const BANK_LAMP_OFF = material.emissive({ name: "bank lamp off", color: "#1e1824", emissive: "#805030", emissiveIntensity: 0.22 });

function box(name: string, mat: AuraMaterialSpec, at: readonly [number, number, number], size: readonly [number, number, number]): AuraNodeInput {
  return primitives.box({ name, material: mat, castShadow: false, receiveShadow: true })
    .position(at[0], at[1], at[2])
    .scale([size[0], size[1], size[2]]);
}

/** Cabinet shell + felt fitted to the salvaged physics box. */
function shellNodes(): AuraNodeInput[] {
  return [
    box("arcade-floor", FLOOR, [0, -1.15, 0], [16, 0.1, 16]),
    // Felt: physics half-extents [2.85, 0.1, 4.15] at y=-0.1 -> top at sim 0.
    box("playfield-felt", FELT, [0, VISUAL_Y_OFFSET - 0.06, 0], [5.7, 0.12, 8.3]),
    box("cabinet-left-rail", RAIL, [-2.85, VISUAL_Y_OFFSET + 0.2, 0], [0.3, 0.4, 8.6]),
    box("cabinet-right-rail", RAIL, [2.85, VISUAL_Y_OFFSET + 0.2, 0], [0.3, 0.4, 8.6]),
    box("cabinet-back-rail", RAIL, [0, VISUAL_Y_OFFSET + 0.2, -4.15], [6.0, 0.4, 0.3]),
    // Apron segments leave the physics drain gap (x in [-0.7, 0.7]) open.
    box("cabinet-apron-left", SHELL, [-1.8, VISUAL_Y_OFFSET + 0.1, 4.15], [2.2, 0.2, 0.3]),
    box("cabinet-apron-right", SHELL, [1.8, VISUAL_Y_OFFSET + 0.1, 4.15], [2.2, 0.2, 0.3]),
    box("cabinet-body-left", SHELL, [-3.1, -0.5, 0], [0.5, 1.4, 8.8]),
    box("cabinet-body-right", SHELL, [3.1, -0.5, 0], [0.5, 1.4, 8.8]),
    box("cabinet-backbox", SHELL, [0, 0.9, -4.45], [6.2, 2.2, 0.4])
  ];
}

/** Sim visual registration -> scene node. Model ids map onto the fresh
 *  typed assets; the salvaged flipper id renders the FlipperReal GLB (the
 *  tuned bat the table's 0.95 m target dimension was authored against). */
function visualNode(v: PropVisual): AuraNodeInput {
  const y = v.position[1] + VISUAL_Y_OFFSET;
  if (v.source === "model") {
    const asset = v.typedAsset === "vaultBreakersFlipper"
      ? assets.vaultBreakersFlipperReal
      : v.typedAsset === "vaultBreakersVaultDoor"
        ? assets.vaultBreakersVaultDoor
        : assets.vaultBreakersBall;
    return model(asset, {
      name: v.name,
      role: v.typedAsset === "vaultBreakersBall" ? "primaryCharacter" : "setDressing",
      scaleMode: "fit",
      targetMaxDimension: v.targetMaxDimension ?? 1,
      castShadow: true
    })
      .position(v.position[0], y, v.position[2])
      .rotate(v.rotation.x, v.rotation.y, v.rotation.z)
      .runtime(game.runtimeNode(v.name, { tags: ["typed-asset", "physics-synced"] }));
  }
  // The sim registers target inserts as 0.01 m handle placeholders (the
  // mechanisms GLB carries their faces); the fresh scene authors a visible
  // insert at the same sim position so target-down state reads in-world.
  return primitives.box({ name: v.name, material: TARGET_ON })
    .position(v.position[0], y, v.position[2])
    .rotate(v.rotation.x, v.rotation.y, v.rotation.z)
    .scale([0.24, 0.32, 0.05])
    .runtime(game.runtimeNode(v.name, { tags: ["target-insert"] }));
}

export function buildVaultScene(sim: TableSimulation) {
  const nodes: AuraNodeInput[] = [
    ...shellNodes(),
    // Typed mechanism assembly (bumpers, slings, lane guides, target faces)
    // at the placement tuned against this physics box.
    model(assets.vaultBreakersMechanisms, {
      name: "vault-mechanisms",
      role: "primaryWorld",
      scaleMode: "fit",
      targetMaxDimension: 5.05,
      receiveShadow: true
    }).position(0, 0.34, 0),
    ...sim.visuals.map(visualNode),
    // Five bank lamps over the backbox rail (runtime: banksDown swaps them).
    ...Array.from({ length: 5 }, (_, index) =>
      primitives.box({ name: `bank-status-${index}`, material: BANK_LAMP_OFF })
        .position(-1.4 + index * 0.7, 1.5, -4.2)
        .scale([0.28, 0.16, 0.12])
        .runtime(game.runtimeNode(`bank-status-${index}`, { tags: ["mission-progress", "bank-lamp"] }))
    ),
    // The one shadowed key: 3800 K-class spot over the playfield. No fills.
    lights.spot({
      name: "playfield key spot",
      color: "#ffe2b8",
      intensity: 520,
      position: [0, 6.2, 0.6],
      target: [0, 0, -0.4],
      angle: 0.82,
      penumbra: 0.55,
      decay: 1.7,
      shadow: true
    }).toJSON()
  ];
  return scene()
    .background("#050408")
    .add(looks.preset(LOOK_ID))
    .addMany(nodes)
    .camera(camera.perspective({ position: CAMERA_POSITION, target: CAMERA_TARGET, fov: CAMERA_FOV }));
}

export interface VaultPoseTransform {
  readonly name: string;
  readonly position: readonly [number, number, number];
  readonly rotation: Euler;
  readonly visible: boolean;
}

/**
 * Per-frame render transforms from sim state. Balls pose from
 * `kinematics()` — the solver's real quaternion — because `poses()`
 * reports identity rotation for balls and a chrome ball posed from it
 * would never visibly roll. Flippers and the vault door pose from their
 * solver bodies. Pure: the same transforms are asserted headless.
 */
export function vaultPoseTransforms(sim: TableSimulation): VaultPoseTransform[] {
  const out: VaultPoseTransform[] = [];
  for (const pose of sim.poses()) {
    if (pose.name.startsWith("ball-")) continue; // balls come from kinematics below
    out.push({
      name: pose.name,
      position: [pose.position[0], pose.position[1] + VISUAL_Y_OFFSET, pose.position[2]],
      rotation: quatToEuler(pose.rotation),
      visible: true
    });
  }
  // All eight pre-registered ball nodes get a transform every frame: solver
  // balls pose from kinematics(), and indices the sim has not created yet
  // (balls are made on serve) are explicitly hidden at their mount pose —
  // otherwise the mount-time nodes would sit visible on the felt.
  const liveBalls = new Map(sim.kinematics().map((ball) => [ball.index, ball]));
  for (const visual of sim.visuals) {
    if (!visual.name.startsWith("ball-")) continue;
    const index = Number(visual.name.slice("ball-".length));
    const ball = liveBalls.get(index);
    if (!ball) {
      out.push({
        name: visual.name,
        position: [visual.position[0], visual.position[1] + VISUAL_Y_OFFSET, visual.position[2]],
        rotation: visual.rotation,
        visible: false
      });
      continue;
    }
    // The salvaged kinematics() implementation returns the solver quaternion
    // (`rotation: readBallRotation(...)`) but its declared type omits the
    // field; read it defensively rather than editing the salvaged surface.
    const rotation = (ball as { readonly rotation?: readonly number[] }).rotation ?? [0, 0, 0, 1];
    out.push({
      name: visual.name,
      position: [ball.position[0], ball.position[1] + VISUAL_Y_OFFSET, ball.position[2]],
      rotation: quatToEuler(rotation),
      visible: ball.state !== "drained"
    });
  }
  const door = sim.vaultDoor.position;
  out.push({
    name: "vault-door-visual",
    position: [door[0], door[1] + VISUAL_Y_OFFSET, door[2]],
    rotation: quatToEuler(sim.vaultDoor.rotation),
    visible: true
  });
  return out;
}
