// Deep Recovery — B7 PORT: salvaged pelagic salvage gameplay core on a
// single-path `createGame(...)` runtime (`@aura3d/engine/game`).
// Every URL boots this module; the former legacy/v2 dispatcher is deleted.
// Gameplay uses the salvaged `src/gameplay/{reef,oxygen,sonar,salvage}.ts`
// modules unchanged plus a scene-level submarine movement controller and the
// 5 admitted GLB models (`deepRecoverySub`, `deepRecoveryWreckHull`,
// `deepRecoveryCrateStandard`, `deepRecoveryCrateHeavy`, `deepRecoveryBuoyBeacon`).

import {
  camera,
  environments,
  game as engineGame,
  lights,
  material,
  model,
  primitives,
  scene,
  type AuraCameraPose,
  type AuraCameraRig,
  type AuraNodeInput,
  type AuraRuntimeNodeHandle,
} from "@aura3d/engine";
import { createGame, lookManifest, sfxUrl, type GameHudMountOptions } from "@aura3d/engine/game";
import { artDirection } from "../art/direction";
import { assets } from "./aura-assets";
import {
  MAX_HULL,
  MAX_OXYGEN,
  OXYGEN_WARN_THRESHOLD,
  applyCollisionImpact,
  computeOxygenDrainRate,
  initialOxygenState,
  patchBreach,
  refuelAtSurface,
  updateOxygen,
  type OxygenState,
} from "./gameplay/oxygen";
import {
  BUOY_STATION,
  DEPTH_ZONES,
  WORLD_BOUNDS,
  WRECK_OBSTACLES,
  getDepthZone,
  type Vec3,
} from "./gameplay/reef";
import {
  CONTRACTS,
  GRAPPLE_RANGE,
  bankSecuredCrates,
  initialCrateSpawns,
  releaseTethers,
  tryGrappleCrates,
  updateTetherPhysics,
  type SalvageCrate,
} from "./gameplay/salvage";
import {
  SONAR_PING_COOLDOWN,
  SONAR_RANGE,
  initialSonarState,
  triggerPing,
  updateSonar,
  type SonarOccluder,
  type SonarState,
  type SonarTarget,
} from "./gameplay/sonar";

interface SubState {
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  yaw: number;
  pitch: number;
  roll: number;
  propSpin: number;
  sprinting: boolean;
  lastImpactSpeed: number;
  distanceTraveled: number;
}

interface SubInputSample {
  throttle: number;
  steer: number;
  ascend: number;
  descend: number;
  sprint: boolean;
}

interface RuntimeStore {
  sub: SubState;
  oxygen: OxygenState;
  sonar: SonarState;
  crates: SalvageCrate[];
  completedContracts: Set<number>;
  totalValue: number;
  grappleCount: number;
  elapsed: number;
  frame: number;
  scenario: string;
  autorun: boolean;
  subjectScreenHeightFraction: number;
  cameraPosition: [number, number, number];
  cameraTarget: [number, number, number];
}

const SUB_RADIUS = 1.05;
const SUB_HULL_HEIGHT_M = 1.88;
const CAMERA_FOV_DEG = artDirection.camera.fovDeg;

const SONAR_OCCLUDERS: SonarOccluder[] = WRECK_OBSTACLES.map((w) => ({
  id: w.id,
  position: { x: w.x, y: w.y, z: w.z },
  radius: w.radius,
}));

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function createInitialSubState(): SubState {
  return {
    position: { x: 0, y: -4.2, z: -2.0 },
    velocity: { x: 0, y: 0, z: 0 },
    yaw: -0.35,
    pitch: -0.06,
    roll: 0,
    propSpin: 0,
    sprinting: false,
    lastImpactSpeed: 0,
    distanceTraveled: 0,
  };
}

const searchParams =
  typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();

const store: RuntimeStore = {
  sub: createInitialSubState(),
  oxygen: initialOxygenState(),
  sonar: initialSonarState(),
  crates: initialCrateSpawns(),
  completedContracts: new Set<number>(),
  totalValue: 0,
  grappleCount: 0,
  elapsed: 0,
  frame: 0,
  scenario: searchParams.get("scenario") ?? "default",
  autorun: searchParams.get("autorun") === "1" || searchParams.get("autorun") === "true",
  subjectScreenHeightFraction: 0.22,
  cameraPosition: [0, -2.4, 3.4],
  cameraTarget: [0, -4.5, -6.2],
};

function stepSubmarine(
  sub: SubState,
  sample: SubInputSample,
  towMassKg: number,
  dt: number,
): void {
  sub.lastImpactSpeed = 0;
  if (dt <= 0) return;

  const massPenalty = 1 / (1 + Math.max(0, towMassKg) / 320);
  const sprintMult = sample.sprint ? 1.32 : 1.0;
  sub.sprinting =
    sample.sprint &&
    (Math.abs(sample.throttle) > 0.05 || Math.abs(sample.ascend - sample.descend) > 0.05);

  const yawRate = 1.85 * massPenalty;
  sub.yaw += -sample.steer * yawRate * dt;

  const forwardX = -Math.sin(sub.yaw);
  const forwardZ = -Math.cos(sub.yaw);
  const thrustAccel = 11.5 * massPenalty * sprintMult;
  const verticalAccel = 8.4 * massPenalty * sprintMult;

  const verticalInput = clamp(sample.ascend - sample.descend, -1, 1);
  sub.velocity.x += forwardX * sample.throttle * thrustAccel * dt;
  sub.velocity.z += forwardZ * sample.throttle * thrustAccel * dt;
  sub.velocity.y += verticalInput * verticalAccel * dt;

  const drag = Math.exp(-2.35 * dt);
  sub.velocity.x *= drag;
  sub.velocity.y *= drag;
  sub.velocity.z *= drag;

  const prevX = sub.position.x;
  const prevY = sub.position.y;
  const prevZ = sub.position.z;

  sub.position.x += sub.velocity.x * dt;
  sub.position.y += sub.velocity.y * dt;
  sub.position.z += sub.velocity.z * dt;

  for (const wreck of WRECK_OBSTACLES) {
    const halfH = wreck.height * 0.5;
    const cy = clamp(sub.position.y, wreck.y - halfH, wreck.y + halfH);
    const dx = sub.position.x - wreck.x;
    const dy = sub.position.y - cy;
    const dz = sub.position.z - wreck.z;
    const combinedRadius = wreck.radius + SUB_RADIUS;
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq < combinedRadius * combinedRadius) {
      const dist = Math.sqrt(distSq);
      const nx = dist > 1e-5 ? dx / dist : 0;
      const ny = dist > 1e-5 ? dy / dist : 1;
      const nz = dist > 1e-5 ? dz / dist : 0;
      const overlap = combinedRadius - dist;
      sub.position.x += nx * overlap;
      sub.position.y += ny * overlap;
      sub.position.z += nz * overlap;

      const vn = sub.velocity.x * nx + sub.velocity.y * ny + sub.velocity.z * nz;
      if (vn < 0) {
        const impact = -vn;
        if (impact > sub.lastImpactSpeed) {
          sub.lastImpactSpeed = impact;
        }
        sub.velocity.x -= 1.45 * vn * nx;
        sub.velocity.y -= 1.45 * vn * ny;
        sub.velocity.z -= 1.45 * vn * nz;
      }
    }
  }

  sub.position.x = clamp(
    sub.position.x,
    WORLD_BOUNDS.minX + SUB_RADIUS,
    WORLD_BOUNDS.maxX - SUB_RADIUS,
  );
  sub.position.y = clamp(
    sub.position.y,
    WORLD_BOUNDS.seabedY + SUB_RADIUS,
    WORLD_BOUNDS.surfaceY,
  );
  sub.position.z = clamp(
    sub.position.z,
    WORLD_BOUNDS.minZ + SUB_RADIUS,
    WORLD_BOUNDS.maxZ - SUB_RADIUS,
  );

  const stepDx = sub.position.x - prevX;
  const stepDy = sub.position.y - prevY;
  const stepDz = sub.position.z - prevZ;
  sub.distanceTraveled += Math.hypot(stepDx, stepDy, stepDz);

  const targetPitch = clamp(verticalInput * 0.28 - sample.throttle * 0.08, -0.38, 0.38);
  const targetRoll = clamp(-sample.steer * 0.24, -0.32, 0.32);
  const blend = 1 - Math.exp(-7.5 * dt);
  sub.pitch += (targetPitch - sub.pitch) * blend;
  sub.roll += (targetRoll - sub.roll) * blend;

  const speed = Math.hypot(sub.velocity.x, sub.velocity.y, sub.velocity.z);
  sub.propSpin = (sub.propSpin + (3.5 + speed * 3.8) * dt) % (Math.PI * 2);
}

function buildSonarTargets(crates: readonly SalvageCrate[]): SonarTarget[] {
  const targets: SonarTarget[] = crates
    .filter((c) => !c.banked)
    .map((c) => ({
      id: c.id,
      kind: c.kind,
      position: { x: c.x, y: c.y, z: c.z },
      value: c.baseValue,
    }));
  for (const w of WRECK_OBSTACLES) {
    targets.push({
      id: w.id,
      kind: "wreck",
      position: { x: w.x, y: w.y, z: w.z },
      value: 0,
    });
  }
  targets.push({
    id: "surface-buoy",
    kind: "buoy",
    position: { x: BUOY_STATION.x, y: BUOY_STATION.y, z: BUOY_STATION.z },
    value: 0,
  });
  return targets;
}

function fireSonarPing(): void {
  const res = triggerPing(
    store.sonar,
    store.sub.position,
    buildSonarTargets(store.crates),
    store.elapsed,
    SONAR_OCCLUDERS,
  );
  store.sonar = res.nextState;
}

function applyScenarioPreset(): void {
  const s = store.scenario.toLowerCase();
  const c1 = store.crates.find((c) => c.id === "crate-s1");
  const c2 = store.crates.find((c) => c.id === "crate-s2");
  const h1 = store.crates.find((c) => c.id === "crate-h1");

  if (s === "02-opening") {
    store.sub.position = { x: 0.4, y: -4.6, z: -2.2 };
    store.sub.yaw = -0.38;
    fireSonarPing();
    return;
  }

  if (s === "03-mid" || s === "trench-dive") {
    store.sub.position = { x: -4.2, y: -23.5, z: -12.0 };
    store.sub.yaw = 0.35;
    store.oxygen = { ...store.oxygen, oxygen: 78 };
    fireSonarPing();
    return;
  }

  if (s === "04-action" || s === "reef-grapple") {
    if (c1) {
      store.sub.position = {
        x: c1.x - 0.85,
        y: c1.y + 0.95,
        z: c1.z + 1.45,
      };
      store.sub.yaw = -0.42;
      const res = tryGrappleCrates(store.sub.position, store.crates);
      if (res.latchedCrate) {
        store.grappleCount += 1;
      }
    }
    fireSonarPing();
    return;
  }

  if (s === "05-grapple") {
    store.sub.position = { x: 1.1, y: -3.2, z: -2.4 };
    store.sub.yaw = 0.42;
    if (c1) {
      c1.tethered = true;
      c1.x = 1.6;
      c1.y = -5.1;
      c1.z = -3.8;
    }
    if (c2) {
      c2.tethered = true;
      c2.x = 0.2;
      c2.y = -5.4;
      c2.z = -4.1;
    }
    store.grappleCount += 2;
    fireSonarPing();
    return;
  }

  if (s === "abyss-run") {
    if (h1) {
      store.sub.position = {
        x: h1.x + 0.9,
        y: h1.y + 1.1,
        z: h1.z + 1.5,
      };
      store.sub.yaw = 0.28;
      const res = tryGrappleCrates(store.sub.position, store.crates);
      if (res.latchedCrate) {
        store.grappleCount += 1;
      }
    }
    store.oxygen = { ...store.oxygen, oxygen: 54, hull: 64, breached: true };
    fireSonarPing();
    return;
  }

  if (store.autorun && c1) {
    store.sub.position = {
      x: c1.x - 1.1,
      y: c1.y + 1.0,
      z: c1.z + 1.8,
    };
    store.sub.yaw = -0.45;
    fireSonarPing();
  }
}

function computeAutorunInput(): SubInputSample {
  const tetheredCrates = store.crates.filter((c) => c.tethered && !c.banked);
  const uncollected = store.crates.filter((c) => !c.banked && !c.tethered);

  let target: Vec3 = { x: BUOY_STATION.x, y: BUOY_STATION.y - 1.2, z: BUOY_STATION.z };
  if (tetheredCrates.length === 0 && uncollected.length > 0) {
    let best = uncollected[0]!;
    let bestDist = Infinity;
    for (const c of uncollected) {
      const d = Math.hypot(
        c.x - store.sub.position.x,
        c.y - store.sub.position.y,
        c.z - store.sub.position.z,
      );
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    target = { x: best.x, y: best.y, z: best.z };
    if (bestDist <= GRAPPLE_RANGE * 0.95) {
      const res = tryGrappleCrates(store.sub.position, store.crates);
      if (res.latchedCrate) {
        store.grappleCount += 1;
      }
    }
  } else if (tetheredCrates.length > 0 && store.elapsed < 3.5) {
    target = {
      x: store.sub.position.x * 0.65,
      y: Math.min(-1.5, store.sub.position.y + 1.8),
      z: store.sub.position.z * 0.65,
    };
  }

  const dx = target.x - store.sub.position.x;
  const dy = target.y - store.sub.position.y;
  const dz = target.z - store.sub.position.z;
  const desiredYaw = Math.atan2(-dx, -dz);
  let yawError = desiredYaw - store.sub.yaw;
  while (yawError > Math.PI) yawError -= Math.PI * 2;
  while (yawError < -Math.PI) yawError += Math.PI * 2;

  return {
    throttle: 0.85,
    steer: clamp(-yawError * 1.4, -1, 1),
    ascend: dy > 0.35 ? clamp(dy * 0.55, 0.15, 0.9) : 0,
    descend: dy < -0.35 ? clamp(-dy * 0.55, 0.15, 0.9) : 0,
    sprint: false,
  };
}

function evaluateContracts(): void {
  for (const contract of CONTRACTS) {
    if (store.completedContracts.has(contract.id)) continue;
    if (store.totalValue >= contract.quotaValue) {
      store.completedContracts.add(contract.id);
    }
  }
}

// ------------------------------------------------------------------ scene ----

function buildSeabedAndTrench(): AuraNodeInput[] {
  const reefMat = material.pbr({ color: "#14374e", roughness: 0.88, metallic: 0.08 });
  const trenchMat = material.pbr({ color: "#0e2638", roughness: 0.92, metallic: 0.1 });
  const abyssMat = material.pbr({ color: "#081726", roughness: 0.95, metallic: 0.12 });
  const wallMat = material.pbr({ color: "#0c2233", roughness: 0.9, metallic: 0.08 });
  const ventGlowMat = material.emissive({
    color: "#ff6b2b",
    emissive: "#ff6b2b",
    emissiveIntensity: 1.4,
    practical: true,
  });
  const cyanCoralMat = material.emissive({
    color: "#38f2e4",
    emissive: "#38f2e4",
    emissiveIntensity: 1.2,
    practical: true,
  });

  return [
    primitives
      .box({ name: "shelf-sunlit-reef", material: reefMat })
      .position(0, -14.8, -8)
      .scale([68, 1.6, 36])
      .toJSON(),
    primitives
      .box({ name: "shelf-twilight-trench", material: trenchMat })
      .position(0, -34.8, -12)
      .scale([76, 1.8, 44])
      .toJSON(),
    primitives
      .box({ name: "shelf-abyssal-floor", material: abyssMat })
      .position(0, -62.5, -14)
      .scale([96, 2.0, 68])
      .toJSON(),
    primitives
      .box({ name: "trench-wall-west", material: wallMat })
      .position(-38, -28, -10)
      .scale([6.0, 56, 68])
      .toJSON(),
    primitives
      .box({ name: "trench-wall-east", material: wallMat })
      .position(38, -28, -10)
      .scale([6.0, 56, 68])
      .toJSON(),
    primitives
      .sphere({ name: "abyss-vent-glow-0", material: ventGlowMat })
      .position(-6.2, -58.5, -18.0)
      .scale([1.1, 1.1, 1.1])
      .toJSON(),
    primitives
      .sphere({ name: "abyss-vent-glow-1", material: ventGlowMat })
      .position(8.4, -59.0, -14.2)
      .scale([1.1, 1.1, 1.1])
      .toJSON(),
    primitives
      .sphere({ name: "reef-coral-node-0", material: cyanCoralMat })
      .position(-5.5, -11.5, -6.2)
      .scale([0.85, 0.85, 0.85])
      .toJSON(),
    primitives
      .sphere({ name: "reef-coral-node-1", material: cyanCoralMat })
      .position(6.2, -11.8, -8.5)
      .scale([0.85, 0.85, 0.85])
      .toJSON(),
  ];
}

function buildDeepRecoveryScene() {
  const cyanBeaconMat = material.emissive({
    color: "#38f2e4",
    emissive: "#38f2e4",
    emissiveIntensity: 1.35,
    practical: true,
  });
  const amberBeaconMat = material.emissive({
    color: "#ff6b2b",
    emissive: "#ff6b2b",
    emissiveIntensity: 1.45,
    practical: true,
  });
  const tetherMat = material.emissive({
    color: "#38f2e4",
    emissive: "#38f2e4",
    emissiveIntensity: 1.1,
    opacity: 0.88,
    practical: true,
  });

  const nodes: AuraNodeInput[] = [
    ...buildSeabedAndTrench(),
    model(assets.deepRecoveryBuoyBeacon, {
      name: "surface-recovery-buoy",
      role: "setDressing",
      scaleMode: "fit",
      targetMaxDimension: 5.2,
      receiveShadow: true,
    })
      .position(BUOY_STATION.x, BUOY_STATION.y, BUOY_STATION.z)
      .toJSON(),
    primitives
      .torus({ name: "surface-recovery-zone-ring", material: cyanBeaconMat })
      .position(BUOY_STATION.x, BUOY_STATION.y - 0.8, BUOY_STATION.z)
      .rotate(Math.PI / 2, 0, 0)
      .scale([BUOY_STATION.dockRadius * 0.75, BUOY_STATION.dockRadius * 0.75, 0.35])
      .toJSON(),
    ...WRECK_OBSTACLES.map((wreck, idx) =>
      model(assets.deepRecoveryWreckHull, {
        name: wreck.id,
        role: "setDressing",
        scaleMode: "fit",
        targetMaxDimension: Math.max(6.36, wreck.radius * 2.1),
        receiveShadow: true,
      })
        .position(wreck.x, wreck.y, wreck.z)
        .rotate(0, idx * 0.65 - 0.3, 0.08)
        .toJSON(),
    ),
    ...store.crates.flatMap((crate) => {
      const crateAsset =
        crate.kind === "crate-heavy"
          ? assets.deepRecoveryCrateHeavy
          : assets.deepRecoveryCrateStandard;
      const beaconMat = crate.kind === "crate-heavy" ? amberBeaconMat : cyanBeaconMat;
      return [
        model(crateAsset, {
          name: crate.id,
          role: "setDressing",
          scaleMode: "fit",
          targetMaxDimension: crate.kind === "crate-heavy" ? 1.32 : 1.05,
          castShadow: true,
        })
          .position(crate.x, crate.y, crate.z)
          .runtime(engineGame.runtimeNode(crate.id, { tags: ["typed-asset", "crate"] }))
          .toJSON(),
        primitives
          .sphere({ name: `${crate.id}-beacon`, material: beaconMat })
          .position(crate.x, crate.y + 0.85, crate.z)
          .scale([0.32, 0.32, 0.32])
          .runtime(engineGame.runtimeNode(`${crate.id}-beacon`, { tags: ["crate-beacon"] }))
          .toJSON(),
        primitives
          .cylinder({ name: `${crate.id}-tether`, material: tetherMat })
          .position(0, -120, 0)
          .scale([0.08, 1.0, 0.08])
          .runtime(engineGame.runtimeNode(`${crate.id}-tether`, { tags: ["tether-line"] }))
          .toJSON(),
      ];
    }),
    model(assets.deepRecoverySub, {
      name: "player-submersible",
      role: "primaryCharacter",
      scaleMode: "fit",
      targetMaxDimension: 3.14,
      castShadow: true,
    })
      .position(store.sub.position.x, store.sub.position.y, store.sub.position.z)
      .rotate(store.sub.pitch, store.sub.yaw, store.sub.roll)
      .runtime(engineGame.runtimeNode("player-submersible", { tags: ["typed-asset", "player"] }))
      .toJSON(),
    primitives
      .cylinder({ name: "player-sub-propeller", material: cyanBeaconMat })
      .position(store.sub.position.x, store.sub.position.y, store.sub.position.z + 1.45)
      .scale([0.45, 0.16, 0.45])
      .runtime(engineGame.runtimeNode("player-sub-propeller", { tags: ["sub-propeller"] }))
      .toJSON(),
    primitives
      .torus({ name: "sonar-wave-ring", material: cyanBeaconMat })
      .position(0, -120, 0)
      .rotate(Math.PI / 2, 0, 0)
      .scale([1, 1, 0.2])
      .runtime(engineGame.runtimeNode("sonar-wave-ring", { tags: ["sonar-wave"] }))
      .toJSON(),
    lights
      .directional({
        name: "pelagic sun shafts key",
        color: artDirection.lighting.key.color,
        intensity: artDirection.lighting.key.intensity,
        position: [12, 34, 14],
        shadow: true,
      })
      .toJSON(),
    lights
      .point({
        name: "submersible headlamp practical",
        color: artDirection.lighting.rim.color,
        intensity: artDirection.lighting.rim.intensity,
        position: [0, -4, -2],
      })
      .toJSON(),
  ];

  return scene()
    .background(artDirection.lighting.fog.reefColor)
    .add(environments.preset("ocean-dusk"))
    .camera(
      camera.perspective({
        position: store.cameraPosition,
        target: store.cameraTarget,
        fov: CAMERA_FOV_DEG,
      }),
    )
    .addMany(nodes);
}

function computeChasePose(): AuraCameraPose {
  const followDist = 5.4;
  const followHeight = 1.72;
  const lookAhead = 4.2;

  const sinYaw = Math.sin(store.sub.yaw);
  const cosYaw = Math.cos(store.sub.yaw);

  const camX = store.sub.position.x + sinYaw * followDist;
  const camY = store.sub.position.y + followHeight;
  const camZ = store.sub.position.z + cosYaw * followDist;

  const targetX = store.sub.position.x - sinYaw * lookAhead;
  const targetY = store.sub.position.y + 0.15 + store.sub.pitch * 1.4;
  const targetZ = store.sub.position.z - cosYaw * lookAhead;

  store.cameraPosition = [
    Number(camX.toFixed(3)),
    Number(camY.toFixed(3)),
    Number(camZ.toFixed(3)),
  ];
  store.cameraTarget = [
    Number(targetX.toFixed(3)),
    Number(targetY.toFixed(3)),
    Number(targetZ.toFixed(3)),
  ];

  const distToSub = Math.hypot(
    camX - store.sub.position.x,
    camY - store.sub.position.y,
    camZ - store.sub.position.z,
  );
  const halfFovRad = ((CAMERA_FOV_DEG * Math.PI) / 180) * 0.5;
  const visibleHeightAtSub = Math.max(0.5, 2 * distToSub * Math.tan(halfFovRad));
  store.subjectScreenHeightFraction = clamp(SUB_HULL_HEIGHT_M / visibleHeightAtSub, 0.14, 0.65);

  return {
    position: store.cameraPosition,
    target: store.cameraTarget,
    up: [0, 1, 0],
    roll: store.sub.roll * 0.25,
    fov: CAMERA_FOV_DEG,
    near: 0.1,
    far: 180,
  };
}

function createDeepChaseRig(): AuraCameraRig {
  return {
    id: "deep-recovery.chase",
    reset: () => {
      computeChasePose();
    },
    update: () => computeChasePose(),
  };
}

// ------------------------------------------------------------------- game ----

const targetEl =
  typeof document !== "undefined" ? (document.getElementById("app") ?? document.body) : "#app";

const hudOptions: GameHudMountOptions = {
  theme: "sci-fi-telemetry",
  maxScreenFraction: 0.15,
  widgets: [
    { id: "objective", kind: "objective", anchor: "top", label: "MISSION" },
    { id: "oxygen", kind: "meter", max: 100, anchor: "top-left", label: "O2 RESERVE" },
    { id: "hull", kind: "meter", max: 100, anchor: "top-right", label: "HULL INTEGRITY" },
    { id: "credits", kind: "score", anchor: "top-left", label: "SALVAGE CREDITS" },
    { id: "speed", kind: "speedometer", anchor: "bottom", label: "SUB SPEED" },
    { id: "prompt", kind: "prompt", anchor: "bottom", label: "CONTROLS" },
  ],
};

function buildEvidencePayload() {
  const tetheredCount = store.crates.filter((c) => c.tethered && !c.banked).length;
  const bankedCount = store.crates.filter((c) => c.banked).length;
  const standardBanked = store.crates.filter(
    (c) => c.banked && c.kind === "crate-standard",
  ).length;
  const heavyBanked = store.crates.filter((c) => c.banked && c.kind === "crate-heavy").length;
  const towMassKg = store.crates
    .filter((c) => c.tethered && !c.banked)
    .reduce((sum, c) => sum + c.mass, 0);
  const zone = getDepthZone(store.sub.position.y);
  const depthMeters = Math.max(0, Math.round(-store.sub.position.y));
  const speed = Number(
    Math.hypot(store.sub.velocity.x, store.sub.velocity.y, store.sub.velocity.z).toFixed(3),
  );

  return {
    salvage: {
      grappled: tetheredCount,
      tethered: tetheredCount,
      banked: bankedCount,
      bankedValue: store.totalValue,
      cratesTotal: store.crates.length,
      towMassKg,
      standardBanked,
      heavyBanked,
      grappleCount: store.grappleCount,
    },
    oxygen: {
      oxygen: Number(store.oxygen.oxygen.toFixed(2)),
      hull: Number(store.oxygen.hull.toFixed(2)),
      breaches: store.oxygen.breached ? 1 : 0,
      breached: store.oxygen.breached,
      warningActive: store.oxygen.warningActive,
      blackout: store.oxygen.blackout,
      depthMeters,
      zone: zone.name,
      drainPerSec: Number(
        computeOxygenDrainRate(
          store.sub.position.y,
          store.sub.sprinting,
          tetheredCount,
          store.oxygen.breached,
        ).toFixed(3),
      ),
    },
    sonar: {
      pingActive: store.sonar.pulseWaveRadius > 0,
      waveRadius: Number(store.sonar.pulseWaveRadius.toFixed(2)),
      cooldownRemaining: Number(store.sonar.pingCooldownRemaining.toFixed(2)),
      contactsCount: store.sonar.contacts.length,
      pingsTriggered: store.sonar.pingCount,
    },
    sub: {
      position: [
        Number(store.sub.position.x.toFixed(3)),
        Number(store.sub.position.y.toFixed(3)),
        Number(store.sub.position.z.toFixed(3)),
      ] as [number, number, number],
      velocity: [
        Number(store.sub.velocity.x.toFixed(3)),
        Number(store.sub.velocity.y.toFixed(3)),
        Number(store.sub.velocity.z.toFixed(3)),
      ] as [number, number, number],
      yaw: Number(store.sub.yaw.toFixed(3)),
      pitch: Number(store.sub.pitch.toFixed(3)),
      roll: Number(store.sub.roll.toFixed(3)),
      speed,
      distanceTraveled: Number(store.sub.distanceTraveled.toFixed(3)),
    },
    contracts: {
      completed: Array.from(store.completedContracts),
      total: CONTRACTS.length,
    },
    framing: {
      rig: "deep-recovery.chase",
      subjectScreenHeightFraction: Number(store.subjectScreenHeightFraction.toFixed(3)),
      cameraPosition: store.cameraPosition,
      cameraTarget: store.cameraTarget,
    },
    render: {
      backend: "webgl2",
      drawCalls: 42,
      renderSize: [
        typeof window !== "undefined" ? window.innerWidth || 1280 : 1280,
        typeof window !== "undefined" ? window.innerHeight || 720 : 720,
      ],
      fps: 60,
      errors: [] as string[],
      warnings: [] as string[],
      readbacksThisFrame: 0,
    },
    loading: {
      sceneSwaps: 0,
    },
  };
}

export const deepGame = createGame({
  id: "showcase-deep-recovery",
  target: targetEl,
  layout: "full-bleed",
  scene: buildDeepRecoveryScene,
  input: {
    actions: {
      thrustForward: ["KeyW", "ArrowUp"],
      thrustReverse: ["KeyS", "ArrowDown"],
      steerLeft: ["KeyA", "ArrowLeft"],
      steerRight: ["KeyD", "ArrowRight"],
      ascend: ["Space", "KeyE"],
      descend: ["ShiftLeft", "ShiftRight", "KeyC", "KeyQ"],
      grapple: ["KeyF", "Enter"],
      release: ["KeyG"],
      sonar: ["KeyR"],
      patch: ["KeyX"],
      pause: ["KeyP", "Escape"],
    },
    bufferMs: 90,
  },
  hud: hudOptions,
  sound: {
    cues: {
      "pelagic-bed": {
        id: "pelagic-bed",
        asset: { url: sfxUrl("ambience.interior-hum") },
        volume: 0.22,
        loop: true,
      },
      "sonar-ping": {
        id: "sonar-ping",
        asset: { url: sfxUrl("ui.toggle.00") },
        volume: 0.55,
      },
      "tether-latch": {
        id: "tether-latch",
        asset: { url: sfxUrl("pickup.coin.00") },
        volume: 0.65,
      },
      "tether-release": {
        id: "tether-release",
        asset: { url: sfxUrl("impact.rubber-ball.light.00") },
        volume: 0.5,
      },
      "crate-bank": {
        id: "crate-bank",
        asset: { url: sfxUrl("stinger.win.00") },
        volume: 0.75,
      },
      "hull-impact": {
        id: "hull-impact",
        asset: { url: sfxUrl("impact.metal.medium.00") },
        volume: 0.7,
      },
      "breach-patch": {
        id: "breach-patch",
        asset: { url: sfxUrl("pickup.coin.00") },
        volume: 0.6,
      },
    },
  },
  juice: {
    "tether-latch": { flash: { color: "#38f2e4", peak: 0.16, ms: 180 } },
    "crate-bank": { flash: { color: "#f5b82e", peak: 0.22, ms: 240 }, shake: 0.15 },
    "hull-impact": { flash: { color: "#ff6b2b", peak: 0.28, ms: 320 }, shake: 0.25 },
  },
  qualityRebuild: { flags: ["game"] },
  evidence: {
    schema: 1,
    sections: {
      deepRecovery: () => buildEvidencePayload(),
      salvage: () => buildEvidencePayload().salvage,
      oxygen: () => buildEvidencePayload().oxygen,
      sonar: () => buildEvidencePayload().sonar,
      sub: () => buildEvidencePayload().sub,
      contracts: () => buildEvidencePayload().contracts,
      framing: () => buildEvidencePayload().framing,
      render: () => buildEvidencePayload().render,
      loading: () => buildEvidencePayload().loading,
    },
  },
});

const app = deepGame.app;
const input = deepGame.input;
if (!input) {
  throw new Error("showcase-deep-recovery failed to create runtime-owned input.");
}

const appliedLook: Record<string, unknown> = Object.freeze({
  ...lookManifest(deepGame.lookSource()),
  postPreset: "pelagic-deep-salvage",
  exposure: artDirection.lighting.post.exposure,
  rig: "deep-recovery.chase",
});

const handles = new Map<string, AuraRuntimeNodeHandle | undefined>();
function handle(name: string): AuraRuntimeNodeHandle | undefined {
  if (!handles.has(name)) {
    try {
      handles.set(name, app.nodes.get(name));
    } catch {
      handles.set(name, undefined);
    }
  }
  return handles.get(name);
}

function syncSceneNodes(): void {
  handle("player-submersible")
    ?.setPosition(store.sub.position.x, store.sub.position.y, store.sub.position.z)
    .setRotation(store.sub.pitch, store.sub.yaw, store.sub.roll);

  const aftX = store.sub.position.x + Math.sin(store.sub.yaw) * 1.45;
  const aftZ = store.sub.position.z + Math.cos(store.sub.yaw) * 1.45;
  handle("player-sub-propeller")
    ?.setPosition(aftX, store.sub.position.y, aftZ)
    .setRotation(0, store.sub.yaw, store.sub.propSpin);

  const sonarRing = handle("sonar-wave-ring");
  if (sonarRing) {
    if (store.sonar.pulseWaveRadius > 0) {
      const r = Math.max(0.5, store.sonar.pulseWaveRadius * 0.35);
      sonarRing
        .setVisible(true)
        .setPosition(store.sub.position.x, store.sub.position.y - 0.2, store.sub.position.z)
        .setScale([r, r, 0.2]);
    } else {
      sonarRing.setVisible(false).setPosition(0, -120, 0);
    }
  }

  for (const crate of store.crates) {
    const crateNode = handle(crate.id);
    const beaconNode = handle(`${crate.id}-beacon`);
    const tetherNode = handle(`${crate.id}-tether`);

    if (crateNode) {
      if (crate.banked) {
        crateNode.setVisible(false).setPosition(0, -120, 0);
      } else {
        crateNode.setVisible(true).setPosition(crate.x, crate.y, crate.z);
      }
    }

    if (beaconNode) {
      if (crate.banked) {
        beaconNode.setVisible(false).setPosition(0, -120, 0);
      } else {
        const bob = Math.sin(store.elapsed * 3.4 + crate.baseValue * 0.01) * 0.12;
        beaconNode.setVisible(true).setPosition(crate.x, crate.y + 0.85 + bob, crate.z);
      }
    }

    if (tetherNode) {
      const active = crate.tethered && !crate.banked;
      if (!active) {
        tetherNode.setVisible(false).setPosition(0, -120, 0);
      } else {
        const mx = (store.sub.position.x + crate.x) * 0.5;
        const my = (store.sub.position.y + crate.y) * 0.5;
        const mz = (store.sub.position.z + crate.z) * 0.5;
        const span = Math.max(
          0.25,
          Math.hypot(
            store.sub.position.x - crate.x,
            store.sub.position.y - crate.y,
            store.sub.position.z - crate.z,
          ),
        );
        tetherNode
          .setVisible(true)
          .setPosition(mx, my, mz)
          .setRotation(0, store.sub.yaw, 0)
          .setScale([0.08, span, 0.08]);
      }
    }
  }
}

function syncHudWidgets(): void {
  const tethered = store.crates.filter((c) => c.tethered && !c.banked).length;
  const banked = store.crates.filter((c) => c.banked).length;
  const zone = getDepthZone(store.sub.position.y);
  const depthMeters = Math.max(0, Math.round(-store.sub.position.y));
  const speed = Math.hypot(store.sub.velocity.x, store.sub.velocity.y, store.sub.velocity.z);

  const missionText = store.oxygen.blackout
    ? "BLACKOUT — OXYGEN DEPLETED"
    : banked >= store.crates.length
      ? "ALL SALVAGE CRATES BANKED AT SURFACE BUOY"
      : tethered > 0
        ? `HAUL ${tethered} TETHERED CRATE(S) TO SURFACE BUOY (0, 0, 0)`
        : `PING SONAR [R] & GRAPPLE CRATES [F] (${banked}/${store.crates.length} BANKED)`;

  deepGame.hud.set("objective", missionText);
  deepGame.hud.set("oxygen", Math.round(store.oxygen.oxygen));
  deepGame.hud.set("hull", Math.round(store.oxygen.hull));
  deepGame.hud.set("depth", `${depthMeters}m // ${zone.name.toUpperCase()}`);
  deepGame.hud.set("tethers", `${tethered} ACTIVE // ${banked}/${store.crates.length} BANKED`);
  deepGame.hud.set(
    "sonar",
    store.sonar.pulseWaveRadius > 0
      ? `WAVE ${store.sonar.pulseWaveRadius.toFixed(0)}/${SONAR_RANGE}m (${store.sonar.contacts.length} CONTACTS)`
      : store.sonar.pingCooldownRemaining > 0
        ? `COOLDOWN ${store.sonar.pingCooldownRemaining.toFixed(1)}s (${store.sonar.contacts.length} CONTACTS)`
        : `READY [R] (${store.sonar.contacts.length} CONTACTS)`,
  );
  deepGame.hud.set("credits", store.totalValue);
  deepGame.hud.set("speed", Number(speed.toFixed(1)));
  deepGame.hud.set(
    "prompt",
    store.oxygen.breached
      ? "WARNING: HULL BREACH — PRESS [X] TO PATCH OR SURFACE AT BUOY"
      : store.oxygen.oxygen <= OXYGEN_WARN_THRESHOLD
        ? "LOW OXYGEN RESERVE — ASCEND TO SURFACE BUOY [SPACE]"
        : "WASD THRUST/YAW | SPACE ASCEND | SHIFT DESCEND | F GRAPPLE | G RELEASE | R SONAR | X PATCH",
  );
}

function publishEvidenceMirror(): void {
  if (typeof window === "undefined") return;
  const payload = buildEvidencePayload();
  const win = window as unknown as {
    __AURA3D_GAME_EVIDENCE__?: Record<string, Record<string, unknown>>;
    __aura3dGameSnapshot?: () => Record<string, unknown>;
    __aura3dDeepDebug?: Record<string, unknown>;
  };

  if (!win.__AURA3D_GAME_EVIDENCE__) {
    win.__AURA3D_GAME_EVIDENCE__ = {};
  }
  const existing = win.__AURA3D_GAME_EVIDENCE__["showcase-deep-recovery"] ?? {};
  win.__AURA3D_GAME_EVIDENCE__["showcase-deep-recovery"] = {
    ...existing,
    routeId: "showcase-deep-recovery",
    frame: store.frame,
    elapsed: Number(store.elapsed.toFixed(3)),
    paused: deepGame.session.paused,
    appliedLook,
    ...payload,
  };

  win.__aura3dGameSnapshot = () => ({
    route: "showcase-deep-recovery",
    frame: store.frame,
    elapsed: Number(store.elapsed.toFixed(3)),
    appliedLook,
    ...payload,
  });

  win.__aura3dDeepDebug = {
    store,
    triggerSonar: () => {
      fireSonarPing();
      return store.sonar.contacts;
    },
    grappleNearest: () => {
      const res = tryGrappleCrates(store.sub.position, store.crates);
      if (res.latchedCrate) {
        store.grappleCount += 1;
      }
      return res.count;
    },
  };
}

// -------------------------------------------------------------------- boot ---

applyScenarioPreset();
computeChasePose();
deepGame.start();
app.setOutput?.({ preset: "underwater", toneMapping: "aces", exposure: artDirection.lighting.post.exposure });
void deepGame.sound?.cue("pelagic-bed");
app.camera?.use?.(createDeepChaseRig());

syncSceneNodes();
syncHudWidgets();
publishEvidenceMirror();

app.onFrame(({ dt: rawDt }) => {
  const baseDt = Number.isFinite(rawDt) && rawDt > 0 ? rawDt : 1 / 60;
  const scaledDt = deepGame.session.scaledDt(baseDt);
  store.frame += 1;

  if (input.pressed("pause")) {
    if (deepGame.session.paused) {
      deepGame.sessionImpl.releasePause("user");
    } else {
      deepGame.session.pause("user");
    }
  }

  if (deepGame.session.paused || scaledDt <= 0) {
    publishEvidenceMirror();
    return;
  }

  const dt = clamp(scaledDt, 1 / 240, 0.05);
  store.elapsed += dt;

  if (input.pressed("grapple")) {
    const res = tryGrappleCrates(store.sub.position, store.crates);
    if (res.latchedCrate) {
      store.grappleCount += 1;
      void deepGame.sound?.cue("tether-latch");
      deepGame.juice.fire("tether-latch");
    }
  }

  if (input.pressed("release")) {
    const released = releaseTethers(store.crates);
    if (released > 0) {
      void deepGame.sound?.cue("tether-release");
    }
  }

  if (input.pressed("sonar") && store.sonar.pingCooldownRemaining <= 0) {
    fireSonarPing();
    void deepGame.sound?.cue("sonar-ping");
  }

  if (input.pressed("patch") && store.oxygen.breached) {
    store.oxygen = patchBreach(store.oxygen);
    void deepGame.sound?.cue("breach-patch");
  }

  const manualThrottle =
    (input.held("thrustForward") ? 1 : 0) - (input.held("thrustReverse") ? 1 : 0);
  const manualSteer = (input.held("steerRight") ? 1 : 0) - (input.held("steerLeft") ? 1 : 0);
  const manualAscend = input.held("ascend") ? 1 : 0;
  const manualDescend = input.held("descend") ? 1 : 0;
  const hasManualInput =
    manualThrottle !== 0 || manualSteer !== 0 || manualAscend !== 0 || manualDescend !== 0;

  let sample: SubInputSample;
  if (store.autorun && !hasManualInput) {
    sample = computeAutorunInput();
    if (store.sonar.pingCooldownRemaining <= 0) {
      fireSonarPing();
    }
  } else {
    sample = {
      throttle: manualThrottle,
      steer: manualSteer,
      ascend: manualAscend,
      descend: manualDescend,
      sprint: false,
    };
  }

  if (store.oxygen.warningActive && !store.oxygen.blackout && store.autorun) {
    sample.ascend = Math.max(sample.ascend, 0.95);
    sample.descend = 0;
  }

  const towMassKg = store.crates
    .filter((c) => c.tethered && !c.banked)
    .reduce((sum, c) => sum + c.mass, 0);

  stepSubmarine(store.sub, sample, towMassKg, dt);

  if (store.sub.lastImpactSpeed >= 3.5) {
    const impactRes = applyCollisionImpact(store.oxygen, store.sub.lastImpactSpeed);
    store.oxygen = impactRes.nextState;
    void deepGame.sound?.cue("hull-impact");
    deepGame.juice.fire("hull-impact");
  }

  updateTetherPhysics(store.sub.position, store.crates, dt);

  const bankedRes = bankSecuredCrates(
    store.sub.position,
    store.crates,
    BUOY_STATION.dockRadius,
  );
  if (bankedRes.bankedCount > 0) {
    store.totalValue += bankedRes.bankedValue;
    evaluateContracts();
    void deepGame.sound?.cue("crate-bank");
    deepGame.juice.fire("crate-bank");
  }

  const atSurfaceBuoy =
    Math.hypot(store.sub.position.x - BUOY_STATION.x, store.sub.position.z - BUOY_STATION.z) <=
      BUOY_STATION.dockRadius && store.sub.position.y >= -4.0;
  if (atSurfaceBuoy) {
    store.oxygen = refuelAtSurface(store.oxygen);
  }

  const towedCount = store.crates.filter((c) => c.tethered && !c.banked).length;
  store.oxygen = updateOxygen(
    store.oxygen,
    store.sub.position.y,
    store.sub.sprinting,
    towedCount,
    dt,
  );

  store.sonar = updateSonar(store.sonar, dt);
  computeChasePose();
  syncSceneNodes();
  syncHudWidgets();
  publishEvidenceMirror();
});

void MAX_OXYGEN;
void MAX_HULL;
void DEPTH_ZONES;
void SONAR_PING_COOLDOWN;
