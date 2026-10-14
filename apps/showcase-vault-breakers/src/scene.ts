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

export const PLAYFIELD_BED = material.reflectiveFloor({
  name: "playfield lacquered bed",
  color: "#0b1120",
  roughness: 0.1,
  metallic: 0.42,
  clearcoat: 0.9,
  clearcoatRoughness: 0.04
});
export const CABINET_LACQUER = material.lacquer({
  name: "cabinet lacquer",
  color: "#1e1b4b",
  roughness: 0.22,
  clearcoat: 1
});
export const VAULT_BRASS_RAIL = material.brushedMetal({
  name: "vault brass rail",
  color: "#eab308",
  roughness: 0.22,
  anisotropy: 0.85
});
export const PINBALL_CHROME = material.chrome({
  name: "pinball mirror steel",
  color: "#f8fafc",
  roughness: 0.02
});
export const FLIPPER_CAR_PAINT = material.carPaint({
  name: "flipper car paint",
  color: "#ef4444",
  clearcoat: 1
});
export const FLIPPER_TIP_RUBBER = material.blackRubber({
  name: "flipper tip rubber",
  color: "#111827",
  roughness: 0.92
});
export const GUIDE_RAMP_GLASS = material.frostedGlass({
  name: "guide ramp frosted glass",
  color: "#38bdf8",
  opacity: 0.42
});
const FELT = PLAYFIELD_BED;
const SHELL = CABINET_LACQUER;
const RAIL = VAULT_BRASS_RAIL;
const FLOOR = material.reflectiveFloor({
  name: "arcade floor",
  color: "#060913",
  roughness: 0.18,
  metallic: 0.3,
  clearcoat: 0.72,
  clearcoatRoughness: 0.06
});
const BUMPER_NEON_RING = material.neon({
  name: "bumper neon ring",
  color: "#1e1b4b",
  emissive: "#ffd24d",
  emissiveIntensity: 2.4
});
const SLING_NEON_ACCENT = material.neon({
  name: "slingshot neon accent",
  color: "#1e1b4b",
  emissive: "#ff6a00",
  emissiveIntensity: 2.1
});
const VAULT_PORTAL_NEON = material.neon({
  name: "vault portal neon",
  color: "#0b1120",
  emissive: "#38bdf8",
  emissiveIntensity: 2.3
});
export const TARGET_ON = material.emissive({ name: "target insert lit", color: "#ffb830", emissive: "#ff6a00", emissiveIntensity: 1.8 });
export const TARGET_DOWN = material.emissive({ name: "target insert down", color: "#1e1824", emissive: "#28f5cc", emissiveIntensity: 0.45 });
export const BANK_LAMP_ON = material.emissive({ name: "bank lamp on", color: "#087d77", emissive: "#28f5cc", emissiveIntensity: 2.5 });
export const BANK_LAMP_OFF = material.emissive({ name: "bank lamp off", color: "#1e1824", emissive: "#805030", emissiveIntensity: 0.28 });

function box(
  name: string,
  mat: AuraMaterialSpec,
  at: readonly [number, number, number],
  size: readonly [number, number, number],
  rotY = 0
): AuraNodeInput {
  return primitives.box({ name, material: mat, castShadow: true, receiveShadow: true })
    .position(at[0], at[1], at[2])
    .rotate(0, rotY, 0)
    .scale([size[0], size[1], size[2]]);
}

function cylinder(
  name: string,
  mat: AuraMaterialSpec,
  at: readonly [number, number, number],
  size: readonly [number, number, number]
): AuraNodeInput {
  return primitives.cylinder({ name, material: mat, castShadow: true, receiveShadow: true })
    .position(at[0], at[1], at[2])
    .scale([size[0], size[1], size[2]]);
}

/** Cabinet shell + lacquered reflective playfield bed + brass rails + frosted-glass guide ramps. */
function shellNodes(): AuraNodeInput[] {
  const y = VISUAL_Y_OFFSET;
  return [
    primitives.box({ name: "arcade-floor", material: FLOOR, castShadow: false, receiveShadow: true })
      .position(0, -1.15, 0)
      .scale([16, 0.1, 16]),
    // Playfield bed: lacquered reflective surface under the mechanisms assembly.
    primitives.box({ name: "playfield-felt", material: FELT, castShadow: false, receiveShadow: true })
      .position(0, y - 0.06, 0)
      .scale([5.7, 0.12, 8.3]),
    // Brushed gold/brass cabinet rails & vault trim.
    box("cabinet-left-rail", RAIL, [-2.85, y + 0.22, 0], [0.3, 0.42, 8.6]),
    box("cabinet-right-rail", RAIL, [2.85, y + 0.22, 0], [0.3, 0.42, 8.6]),
    box("cabinet-back-rail", RAIL, [0, y + 0.24, -4.15], [6.0, 0.45, 0.32]),
    box("shooter-lane-rail", RAIL, [2.2, y + 0.16, 0.7], [0.14, 0.28, 6.5]),
    box("vault-arch-left", RAIL, [-0.85, y + 0.28, -3.55], [0.16, 0.52, 0.68]),
    box("vault-arch-right", RAIL, [0.85, y + 0.28, -3.55], [0.16, 0.52, 0.68]),
    box("vault-arch-crown", RAIL, [0, y + 0.58, -3.32], [1.86, 0.16, 0.28]),
    box("vault-portal-trim", VAULT_PORTAL_NEON, [0, y + 0.48, -3.28], [1.45, 0.08, 0.12]),
    // High-gloss lacquered cabinet walls, apron & backbox.
    box("cabinet-apron-left", SHELL, [-1.8, y + 0.12, 4.15], [2.2, 0.24, 0.34]),
    box("cabinet-apron-right", SHELL, [1.8, y + 0.12, 4.15], [2.2, 0.24, 0.34]),
    box("cabinet-body-left", SHELL, [-3.1, -0.48, 0], [0.52, 1.44, 8.8]),
    box("cabinet-body-right", SHELL, [3.1, -0.48, 0], [0.52, 1.44, 8.8]),
    box("cabinet-backbox", SHELL, [0, 0.92, -4.45], [6.2, 2.24, 0.42]),
    // Translucent frosted-glass habitrail & orbit/inlane guide ramps.
    box("guide-ramp-habitrail", GUIDE_RAMP_GLASS, [2.35, y + 0.22, -3.15], [1.5, 0.34, 0.18], -0.785),
    box("guide-ramp-orbit-left", GUIDE_RAMP_GLASS, [-1.85, y + 0.22, -2.8], [1.78, 0.34, 0.16], -2.03),
    box("guide-ramp-inlane-left", GUIDE_RAMP_GLASS, [-1.65, y + 0.2, 3.72], [1.62, 0.3, 0.14], -0.245),
    box("guide-ramp-inlane-right", GUIDE_RAMP_GLASS, [1.65, y + 0.2, 3.72], [1.62, 0.3, 0.14], 0.245),
    // Pop-bumper chrome crowns + neon bumper rings.
    cylinder("bumper-crown-left", PINBALL_CHROME, [-0.9, y + 0.18, -1.7], [0.52, 0.24, 0.52]),
    cylinder("bumper-ring-left", BUMPER_NEON_RING, [-0.9, y + 0.31, -1.7], [0.58, 0.06, 0.58]),
    cylinder("bumper-crown-right", PINBALL_CHROME, [0.9, y + 0.18, -1.7], [0.52, 0.24, 0.52]),
    cylinder("bumper-ring-right", BUMPER_NEON_RING, [0.9, y + 0.31, -1.7], [0.58, 0.06, 0.58]),
    cylinder("bumper-crown-center", PINBALL_CHROME, [0, y + 0.18, -0.7], [0.52, 0.24, 0.52]),
    cylinder("bumper-ring-center", BUMPER_NEON_RING, [0, y + 0.31, -0.7], [0.58, 0.06, 0.58]),
    // Slingshot black-rubber rebound cushions + neon accent strips.
    box("sling-rubber-left", FLIPPER_TIP_RUBBER, [-1.2, y + 0.14, 2.1], [1.28, 0.22, 0.16], -0.67),
    box("sling-neon-left", SLING_NEON_ACCENT, [-1.2, y + 0.27, 2.1], [1.22, 0.06, 0.12], -0.67),
    box("sling-rubber-right", FLIPPER_TIP_RUBBER, [1.2, y + 0.14, 2.1], [1.28, 0.22, 0.16], 0.67),
    box("sling-neon-right", SLING_NEON_ACCENT, [1.2, y + 0.27, 2.1], [1.22, 0.06, 0.12], 0.67),
    // Black-rubber flipper tip cushions synced with left/right flipper bats.
    cylinder("flipper-left-tip", FLIPPER_TIP_RUBBER, [-0.2, y + 0.16, 2.68], [0.18, 0.2, 0.18])
      .runtime(game.runtimeNode("flipper-left-tip", { tags: ["flipper-tip", "physics-synced"] })),
    cylinder("flipper-right-tip", FLIPPER_TIP_RUBBER, [0.2, y + 0.16, 2.68], [0.18, 0.2, 0.18])
      .runtime(game.runtimeNode("flipper-right-tip", { tags: ["flipper-tip", "physics-synced"] }))
  ];
}

/** Sim visual registration -> scene node. Model ids map onto the fresh
 *  typed assets; the salvaged flipper id renders the FlipperReal GLB (the
 *  tuned bat the table's 0.95 m target dimension was authored against). */
function visualNode(v: PropVisual): AuraNodeInput {
  const y = v.position[1] + VISUAL_Y_OFFSET;
  if (v.source === "model") {
    const isFlipper = v.typedAsset === "vaultBreakersFlipper";
    const isVaultDoor = v.typedAsset === "vaultBreakersVaultDoor";
    const asset = isFlipper
      ? assets.vaultBreakersFlipperReal
      : isVaultDoor
        ? assets.vaultBreakersVaultDoor
        : assets.vaultBreakersBall;
    const mat = isFlipper
      ? FLIPPER_CAR_PAINT
      : isVaultDoor
        ? undefined
        : PINBALL_CHROME;
    return model(asset, {
      name: v.name,
      role: v.typedAsset === "vaultBreakersBall" ? "primaryCharacter" : "setDressing",
      scaleMode: "fit",
      targetMaxDimension: isVaultDoor ? 0.72 : (v.targetMaxDimension ?? 1),
      ...(mat ? { material: mat } : {}),
      castShadow: true,
      receiveShadow: true
    })
      .position(v.position[0], y, v.position[2])
      .rotate(v.rotation.x, v.rotation.y, v.rotation.z)
      .runtime(game.runtimeNode(v.name, { tags: ["typed-asset", "physics-synced"] }));
  }
  // The sim registers target inserts as 0.01 m handle placeholders (the
  // mechanisms GLB carries their faces); the fresh scene authors a visible
  // insert at the same sim position so target-down state reads in-world.
  return primitives.box({ name: v.name, material: TARGET_ON, castShadow: true, receiveShadow: true })
    .position(v.position[0], y, v.position[2])
    .rotate(v.rotation.x, v.rotation.y, v.rotation.z)
    .scale([0.26, 0.34, 0.07])
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
      castShadow: true,
      receiveShadow: true
    }).position(0, 0.34, 0),
    // Plunger-lane captive mirror-steel ball so the chrome pinball reads on the
    // shooter lane even before the first serve.
    model(assets.vaultBreakersBall, {
      name: "plunger-captive-ball",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 0.3,
      material: PINBALL_CHROME,
      castShadow: true,
      receiveShadow: true
    }).position(2.44, VISUAL_Y_OFFSET + 0.15, 3.25),
    ...sim.visuals.map(visualNode),
    // Five bank lamps over the backbox rail (runtime: banksDown swaps them).
    ...Array.from({ length: 5 }, (_, index) =>
      primitives.box({ name: `bank-status-${index}`, material: BANK_LAMP_OFF })
        .position(-1.4 + index * 0.7, 1.5, -4.2)
        .scale([0.3, 0.18, 0.14])
        .runtime(game.runtimeNode(`bank-status-${index}`, { tags: ["mission-progress", "bank-lamp"] }))
    ),
    // Playfield practical lights (looks.preset(LOOK_ID) provides the 1 shadowed key;
    // these 3 unshadowed practicals stay within art/direction.ts practicals: 4).
    lights.spot({
      name: "playfield key spot",
      color: "#ffe2b8",
      intensity: 520,
      position: [0, 6.2, 0.6],
      target: [0, 0, -0.4],
      angle: 0.82,
      penumbra: 0.55,
      decay: 1.7,
      shadow: false
    }).toJSON(),
    lights.point({
      name: "vault chamber practical",
      color: "#38bdf8",
      intensity: 26,
      position: [0, 1.4, -2.9],
      distance: 5.5,
      decay: 1.6,
      shadow: false
    }).toJSON(),
    lights.point({
      name: "flipper deck practical",
      color: "#ffd24d",
      intensity: 22,
      position: [0, 1.3, 2.75],
      distance: 5.0,
      decay: 1.6,
      shadow: false
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
    const euler = quatToEuler(pose.rotation);
    out.push({
      name: pose.name,
      position: [pose.position[0], pose.position[1] + VISUAL_Y_OFFSET, pose.position[2]],
      rotation: euler,
      visible: true
    });
    if (pose.name === "flipper-left" || pose.name === "flipper-right") {
      const tipX = pose.position[0] + Math.cos(euler.y) * 0.38;
      const tipZ = pose.position[2] - Math.sin(euler.y) * 0.38;
      out.push({
        name: `${pose.name}-tip`,
        position: [tipX, pose.position[1] + VISUAL_Y_OFFSET, tipZ],
        rotation: euler,
        visible: true
      });
    }
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
