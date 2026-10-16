import type { AuraNodeInput } from "../nodes/types.js";
import { material } from "../nodes/material.js";
import { primitives } from "../nodes/primitives.js";

export interface CarSoccerPitchOptions {
  readonly pitchHalfX?: number;
  readonly pitchHalfZ?: number;
  readonly goalHalfWidth?: number;
  readonly goalHeight?: number;
  readonly goalDepth?: number;
}

export interface CarSoccerVehicleActor {
  readonly id: "hero" | "green" | "rival" | "purple";
  readonly team: "orange" | "blue";
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  speed: number;
  heading: number;
  pitch: number;
  roll: number;
  boost: number;
  hopTimer: number;
  touchCooldown: number;
}

export interface CarSoccerBallState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  wx: number;
  wy: number;
  wz: number;
  rx: number;
  ry: number;
  rz: number;
  lastTouchTeam: "orange" | "blue" | null;
  lastTouchActor: CarSoccerVehicleActor["id"] | null;
}

export interface CarSoccerControls {
  readonly throttle: boolean;
  readonly brake: boolean;
  readonly steer: number;
  readonly boost: boolean;
  readonly hop: boolean;
}

export interface CarSoccerBallStepEvents {
  readonly touchedBy: readonly {
    readonly actorId: CarSoccerVehicleActor["id"];
    readonly team: "orange" | "blue";
    readonly isShotOnBlueGoal: boolean;
    readonly isSaveAtBlueGoal: boolean;
  }[];
  readonly wallBounced: boolean;
  readonly goalScored: "orange" | "blue" | null;
}

export interface CarSoccerGameKitOptions extends CarSoccerPitchOptions {
  readonly ballRadius?: number;
  readonly carCollisionRadius?: number;
  readonly carHalfHeight?: number;
}

export interface CarSoccerGameKit {
  readonly kind: "aura-car-soccer-kit";
  readonly pitchHalfX: number;
  readonly pitchHalfZ: number;
  readonly goalHalfWidth: number;
  readonly goalHeight: number;
  readonly goalDepth: number;
  readonly ballRadius: number;
  readonly carCollisionRadius: number;
  readonly hero: CarSoccerVehicleActor;
  readonly green: CarSoccerVehicleActor;
  readonly rival: CarSoccerVehicleActor;
  readonly purple: CarSoccerVehicleActor;
  readonly ball: CarSoccerBallState;
  resetKickoff(): void;
  stepHeroCar(dt: number, controls: CarSoccerControls): { readonly hopped: boolean };
  stepTeammateAi(dt: number, car?: CarSoccerVehicleActor): void;
  stepStrikerAi(dt: number, car?: CarSoccerVehicleActor): void;
  stepKeeperAi(dt: number, car?: CarSoccerVehicleActor): void;
  resolveCarToCarBump(a: CarSoccerVehicleActor, b: CarSoccerVehicleActor): boolean;
  stepBallPhysics(dt: number, cars?: readonly CarSoccerVehicleActor[]): CarSoccerBallStepEvents;
  buildPitchAndGoalsNodes(options?: CarSoccerPitchOptions): AuraNodeInput[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export function buildCarSoccerPitchNodes(options: CarSoccerPitchOptions = {}): AuraNodeInput[] {
  const pitchHalfX = options.pitchHalfX ?? 18.5;
  const pitchHalfZ = options.pitchHalfZ ?? 27.0;
  const goalHalfWidth = options.goalHalfWidth ?? 5.6;
  const goalHeight = options.goalHeight ?? 3.9;
  const goalDepth = options.goalDepth ?? 3.6;

  const turfDarkMat = material.pbr({
    color: "#14532d",
    roughness: 0.86,
    metallic: 0.04
  });
  const turfLightMat = material.pbr({
    color: "#166534",
    roughness: 0.84,
    metallic: 0.04
  });
  const lineWhiteMat = material.emissive({
    color: "#f8fafc",
    emissive: "#e2e8f0",
    emissiveIntensity: 0.45,
    roughness: 0.35
  });
  const dasherWallMat = material.pbr({
    color: "#0f172a",
    roughness: 0.42,
    metallic: 0.55
  });
  const blueGoalFrameMat = material.emissive({
    color: "#38bdf8",
    emissive: "#0ea5e9",
    emissiveIntensity: 0.85,
    roughness: 0.25,
    metallic: 0.6
  });
  const blueGoalNetMat = material.pbr({
    color: "#0284c7",
    roughness: 0.65,
    metallic: 0.15,
    opacity: 0.42
  });
  const orangeGoalFrameMat = material.emissive({
    color: "#f97316",
    emissive: "#ea580c",
    emissiveIntensity: 0.85,
    roughness: 0.25,
    metallic: 0.6
  });
  const orangeGoalNetMat = material.pbr({
    color: "#ea580c",
    roughness: 0.65,
    metallic: 0.15,
    opacity: 0.42
  });

  const nodes: AuraNodeInput[] = [
    primitives
      .box({
        name: "stadium-pitch-apron",
        size: [pitchHalfX * 2 + 18, 0.2, pitchHalfZ * 2 + 22],
        material: dasherWallMat,
        receiveShadow: true
      })
      .position(0, -0.14, 0)
  ];

  const stripeCount = 12;
  const stripeDepth = (pitchHalfZ * 2) / stripeCount;
  for (let i = 0; i < stripeCount; i += 1) {
    const zCenter = -pitchHalfZ + stripeDepth * (i + 0.5);
    nodes.push(
      primitives
        .box({
          name: `pitch-turf-stripe-${i}`,
          size: [pitchHalfX * 2, 0.08, stripeDepth + 0.02],
          material: i % 2 === 0 ? turfDarkMat : turfLightMat,
          receiveShadow: true
        })
        .position(0, -0.04, zCenter)
    );
  }

  const lineThickness = 0.22;
  const lineY = 0.008;
  const sideSpanAfterGoal = (pitchHalfX - goalHalfWidth) * 0.5 + goalHalfWidth;
  const sideWidthAfterGoal = pitchHalfX - goalHalfWidth;

  nodes.push(
    primitives
      .box({ name: "pitch-line-west", size: [lineThickness, 0.015, pitchHalfZ * 2], material: lineWhiteMat })
      .position(-pitchHalfX, lineY, 0),
    primitives
      .box({ name: "pitch-line-east", size: [lineThickness, 0.015, pitchHalfZ * 2], material: lineWhiteMat })
      .position(pitchHalfX, lineY, 0),
    primitives
      .box({ name: "pitch-line-center", size: [pitchHalfX * 2, 0.015, lineThickness], material: lineWhiteMat })
      .position(0, lineY, 0),
    primitives
      .torus({
        name: "pitch-center-circle",
        size: [9.6, 0.22, 9.6],
        material: lineWhiteMat
      })
      .position(0, lineY + 0.01, 0)
      .rotate(Math.PI / 2, 0, 0),
    primitives
      .box({ name: "pitch-line-north-west", size: [sideWidthAfterGoal, 0.015, lineThickness], material: lineWhiteMat })
      .position(-sideSpanAfterGoal, lineY, -pitchHalfZ),
    primitives
      .box({ name: "pitch-line-north-east", size: [sideWidthAfterGoal, 0.015, lineThickness], material: lineWhiteMat })
      .position(sideSpanAfterGoal, lineY, -pitchHalfZ),
    primitives
      .box({ name: "pitch-line-south-west", size: [sideWidthAfterGoal, 0.015, lineThickness], material: lineWhiteMat })
      .position(-sideSpanAfterGoal, lineY, pitchHalfZ),
    primitives
      .box({ name: "pitch-line-south-east", size: [sideWidthAfterGoal, 0.015, lineThickness], material: lineWhiteMat })
      .position(sideSpanAfterGoal, lineY, pitchHalfZ),
    primitives
      .box({ name: "pitch-box-north-front", size: [goalHalfWidth * 2 + 5.6, 0.015, lineThickness], material: lineWhiteMat })
      .position(0, lineY, -pitchHalfZ + 6.8),
    primitives
      .box({ name: "pitch-box-north-left", size: [lineThickness, 0.015, 6.8], material: lineWhiteMat })
      .position(-(goalHalfWidth + 2.8), lineY, -pitchHalfZ + 3.4),
    primitives
      .box({ name: "pitch-box-north-right", size: [lineThickness, 0.015, 6.8], material: lineWhiteMat })
      .position(goalHalfWidth + 2.8, lineY, -pitchHalfZ + 3.4),
    primitives
      .box({ name: "pitch-box-south-front", size: [goalHalfWidth * 2 + 5.6, 0.015, lineThickness], material: lineWhiteMat })
      .position(0, lineY, pitchHalfZ - 6.8),
    primitives
      .box({ name: "pitch-box-south-left", size: [lineThickness, 0.015, 6.8], material: lineWhiteMat })
      .position(-(goalHalfWidth + 2.8), lineY, pitchHalfZ - 3.4),
    primitives
      .box({ name: "pitch-box-south-right", size: [lineThickness, 0.015, 6.8], material: lineWhiteMat })
      .position(goalHalfWidth + 2.8, lineY, pitchHalfZ - 3.4)
  );

  const wallHeight = 1.05;
  const wallY = wallHeight * 0.5;
  nodes.push(
    primitives
      .box({ name: "arena-wall-west", size: [0.45, wallHeight, pitchHalfZ * 2 + 0.8], material: dasherWallMat })
      .position(-(pitchHalfX + 0.25), wallY, 0),
    primitives
      .box({ name: "arena-wall-east", size: [0.45, wallHeight, pitchHalfZ * 2 + 0.8], material: dasherWallMat })
      .position(pitchHalfX + 0.25, wallY, 0),
    primitives
      .box({ name: "arena-wall-nw", size: [sideWidthAfterGoal, wallHeight, 0.45], material: dasherWallMat })
      .position(-sideSpanAfterGoal, wallY, -(pitchHalfZ + 0.25)),
    primitives
      .box({ name: "arena-wall-ne", size: [sideWidthAfterGoal, wallHeight, 0.45], material: dasherWallMat })
      .position(sideSpanAfterGoal, wallY, -(pitchHalfZ + 0.25)),
    primitives
      .box({ name: "arena-wall-sw", size: [sideWidthAfterGoal, wallHeight, 0.45], material: dasherWallMat })
      .position(-sideSpanAfterGoal, wallY, pitchHalfZ + 0.25),
    primitives
      .box({ name: "arena-wall-se", size: [sideWidthAfterGoal, wallHeight, 0.45], material: dasherWallMat })
      .position(sideSpanAfterGoal, wallY, pitchHalfZ + 0.25)
  );

  const postThickness = 0.34;
  const goalWidth = goalHalfWidth * 2;
  nodes.push(
    primitives
      .box({ name: "blue-goal-post-left", size: [postThickness, goalHeight, postThickness], material: blueGoalFrameMat })
      .position(-goalHalfWidth, goalHeight * 0.5, -pitchHalfZ),
    primitives
      .box({ name: "blue-goal-post-right", size: [postThickness, goalHeight, postThickness], material: blueGoalFrameMat })
      .position(goalHalfWidth, goalHeight * 0.5, -pitchHalfZ),
    primitives
      .box({ name: "blue-goal-crossbar", size: [goalWidth + postThickness, postThickness, postThickness], material: blueGoalFrameMat })
      .position(0, goalHeight, -pitchHalfZ),
    primitives
      .box({ name: "blue-goal-back-top", size: [goalWidth + postThickness, 0.24, 0.24], material: blueGoalFrameMat })
      .position(0, goalHeight, -(pitchHalfZ + goalDepth)),
    primitives
      .box({ name: "blue-goal-net-back", size: [goalWidth, goalHeight, 0.12], material: blueGoalNetMat })
      .position(0, goalHeight * 0.5, -(pitchHalfZ + goalDepth)),
    primitives
      .box({ name: "blue-goal-net-left", size: [0.12, goalHeight, goalDepth], material: blueGoalNetMat })
      .position(-goalHalfWidth, goalHeight * 0.5, -(pitchHalfZ + goalDepth * 0.5)),
    primitives
      .box({ name: "blue-goal-net-right", size: [0.12, goalHeight, goalDepth], material: blueGoalNetMat })
      .position(goalHalfWidth, goalHeight * 0.5, -(pitchHalfZ + goalDepth * 0.5)),
    primitives
      .box({ name: "blue-goal-line", size: [goalWidth, 0.02, 0.26], material: blueGoalFrameMat })
      .position(0, 0.012, -pitchHalfZ),

    primitives
      .box({ name: "orange-goal-post-left", size: [postThickness, goalHeight, postThickness], material: orangeGoalFrameMat })
      .position(-goalHalfWidth, goalHeight * 0.5, pitchHalfZ),
    primitives
      .box({ name: "orange-goal-post-right", size: [postThickness, goalHeight, postThickness], material: orangeGoalFrameMat })
      .position(goalHalfWidth, goalHeight * 0.5, pitchHalfZ),
    primitives
      .box({ name: "orange-goal-crossbar", size: [goalWidth + postThickness, postThickness, postThickness], material: orangeGoalFrameMat })
      .position(0, goalHeight, pitchHalfZ),
    primitives
      .box({ name: "orange-goal-back-top", size: [goalWidth + postThickness, 0.24, 0.24], material: orangeGoalFrameMat })
      .position(0, goalHeight, pitchHalfZ + goalDepth),
    primitives
      .box({ name: "orange-goal-net-back", size: [goalWidth, goalHeight, 0.12], material: orangeGoalNetMat })
      .position(0, goalHeight * 0.5, pitchHalfZ + goalDepth),
    primitives
      .box({ name: "orange-goal-net-left", size: [0.12, goalHeight, goalDepth], material: orangeGoalNetMat })
      .position(-goalHalfWidth, goalHeight * 0.5, pitchHalfZ + goalDepth * 0.5),
    primitives
      .box({ name: "orange-goal-net-right", size: [0.12, goalHeight, goalDepth], material: orangeGoalNetMat })
      .position(goalHalfWidth, goalHeight * 0.5, pitchHalfZ + goalDepth * 0.5),
    primitives
      .box({ name: "orange-goal-line", size: [goalWidth, 0.02, 0.26], material: orangeGoalFrameMat })
      .position(0, 0.012, pitchHalfZ)
  );

  return nodes;
}

export function createCarSoccerGameKit(options: CarSoccerGameKitOptions = {}): CarSoccerGameKit {
  const pitchHalfX = options.pitchHalfX ?? 18.5;
  const pitchHalfZ = options.pitchHalfZ ?? 27.0;
  const goalHalfWidth = options.goalHalfWidth ?? 5.6;
  const goalHeight = options.goalHeight ?? 3.9;
  const goalDepth = options.goalDepth ?? 3.6;
  const ballRadius = options.ballRadius ?? 1.2;
  const carCollisionRadius = options.carCollisionRadius ?? 1.85;
  const carHalfHeight = options.carHalfHeight ?? 0.72;

  const hero: CarSoccerVehicleActor = {
    id: "hero",
    team: "orange",
    x: 0,
    y: 0,
    z: 11.2,
    vx: 0,
    vy: 0,
    vz: 0,
    speed: 0,
    heading: 0,
    pitch: 0,
    roll: 0,
    boost: 100,
    hopTimer: 0,
    touchCooldown: 0
  };

  const green: CarSoccerVehicleActor = {
    id: "green",
    team: "orange",
    x: -7.5,
    y: 0,
    z: 16.5,
    vx: 0,
    vy: 0,
    vz: 0,
    speed: 0,
    heading: 0.14,
    pitch: 0,
    roll: 0,
    boost: 90,
    hopTimer: 0,
    touchCooldown: 0
  };

  const rival: CarSoccerVehicleActor = {
    id: "rival",
    team: "blue",
    x: 5.5,
    y: 0,
    z: -13.8,
    vx: 0,
    vy: 0,
    vz: 0,
    speed: 0,
    heading: Math.PI - 0.16,
    pitch: 0,
    roll: 0,
    boost: 90,
    hopTimer: 0,
    touchCooldown: 0
  };

  const purple: CarSoccerVehicleActor = {
    id: "purple",
    team: "blue",
    x: 0,
    y: 0,
    z: -23.2,
    vx: 0,
    vy: 0,
    vz: 0,
    speed: 0,
    heading: Math.PI,
    pitch: 0,
    roll: 0,
    boost: 100,
    hopTimer: 0,
    touchCooldown: 0
  };

  const ball: CarSoccerBallState = {
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    wx: 0,
    wy: 0,
    wz: 0,
    rx: 0,
    ry: 0,
    rz: 0,
    lastTouchTeam: null,
    lastTouchActor: null
  };

  function clampCarToPitch(car: CarSoccerVehicleActor): void {
    const maxX = pitchHalfX - 1.45;
    const maxZ = pitchHalfZ - 1.35;
    const inGoalX = Math.abs(car.x) < goalHalfWidth - 1.1;
    const limitZ = inGoalX ? pitchHalfZ + goalDepth - 1.2 : maxZ;

    if (car.x < -maxX) {
      car.x = -maxX;
      if (car.vx < 0) car.vx *= -0.35;
      car.speed *= 0.88;
    } else if (car.x > maxX) {
      car.x = maxX;
      if (car.vx > 0) car.vx *= -0.35;
      car.speed *= 0.88;
    }

    if (car.z < -limitZ) {
      car.z = -limitZ;
      if (car.vz < 0) car.vz *= -0.35;
      car.speed *= 0.88;
    } else if (car.z > limitZ) {
      car.z = limitZ;
      if (car.vz > 0) car.vz *= -0.35;
      car.speed *= 0.88;
    }
  }

  function stepAiMotion(
    car: CarSoccerVehicleActor,
    dt: number,
    targetX: number,
    targetZ: number,
    targetSpeed: number,
    turnRate: number
  ): void {
    if (car.touchCooldown > 0) {
      car.touchCooldown = Math.max(0, car.touchCooldown - dt);
    }

    const dx = targetX - car.x;
    const dz = targetZ - car.z;
    const dist = Math.hypot(dx, dz);
    const desiredHeading = Math.atan2(dx, -dz);
    const deltaAngle = wrapAngle(desiredHeading - car.heading);

    const turnStep = clamp(deltaAngle, -turnRate * dt, turnRate * dt);
    car.heading = wrapAngle(car.heading + turnStep);

    const alignment = Math.max(0.25, Math.cos(deltaAngle));
    const desiredVel = dist < 0.75 ? 0 : targetSpeed * alignment;
    car.speed += (desiredVel - car.speed) * Math.min(1, dt * 4.2);

    const fx = Math.sin(car.heading);
    const fz = -Math.cos(car.heading);
    car.vx = fx * car.speed;
    car.vz = fz * car.speed;
    car.x += car.vx * dt;
    car.z += car.vz * dt;

    if (car.y > 0 || car.vy !== 0) {
      car.vy -= 21 * dt;
      car.y += car.vy * dt;
      if (car.y <= 0) {
        car.y = 0;
        car.vy = 0;
      }
    }

    car.roll = clamp(-deltaAngle * 0.12, -0.1, 0.1);
    car.pitch = 0;
    clampCarToPitch(car);
  }

  return {
    kind: "aura-car-soccer-kit",
    pitchHalfX,
    pitchHalfZ,
    goalHalfWidth,
    goalHeight,
    goalDepth,
    ballRadius,
    carCollisionRadius,
    hero,
    green,
    rival,
    purple,
    ball,
    resetKickoff() {
      Object.assign(hero, {
        x: 0,
        y: 0,
        z: 11.2,
        vx: 0,
        vy: 0,
        vz: 0,
        speed: 0,
        heading: 0,
        pitch: 0,
        roll: 0,
        hopTimer: 0,
        touchCooldown: 0
      });
      Object.assign(green, {
        x: -7.5,
        y: 0,
        z: 16.5,
        vx: 0,
        vy: 0,
        vz: 0,
        speed: 0,
        heading: 0.14,
        pitch: 0,
        roll: 0,
        boost: 90,
        hopTimer: 0,
        touchCooldown: 0
      });
      Object.assign(rival, {
        x: 5.5,
        y: 0,
        z: -13.8,
        vx: 0,
        vy: 0,
        vz: 0,
        speed: 0,
        heading: Math.PI - 0.16,
        pitch: 0,
        roll: 0,
        boost: 90,
        hopTimer: 0,
        touchCooldown: 0
      });
      Object.assign(purple, {
        x: 0,
        y: 0,
        z: -23.2,
        vx: 0,
        vy: 0,
        vz: 0,
        speed: 0,
        heading: Math.PI,
        pitch: 0,
        roll: 0,
        boost: 100,
        hopTimer: 0,
        touchCooldown: 0
      });
      Object.assign(ball, {
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        wx: 0,
        wy: 0,
        wz: 0,
        rx: 0,
        ry: 0,
        rz: 0,
        lastTouchTeam: null,
        lastTouchActor: null
      });
    },
    stepHeroCar(dt, controls) {
      if (hero.touchCooldown > 0) {
        hero.touchCooldown = Math.max(0, hero.touchCooldown - dt);
      }

      const forwardInput = (controls.throttle ? 1 : 0) - (controls.brake ? 1 : 0);
      const canBoost = controls.boost && hero.boost > 0.5;
      const maxSpeed = canBoost ? 35 : 24;
      const accel = canBoost ? 46 : 31;
      const reverseAccel = 24;

      if (forwardInput > 0) {
        hero.speed = Math.min(maxSpeed, hero.speed + accel * dt);
      } else if (forwardInput < 0) {
        hero.speed = Math.max(-15, hero.speed - reverseAccel * dt);
      } else {
        hero.speed *= Math.exp(-2.8 * dt);
        if (Math.abs(hero.speed) < 0.04) hero.speed = 0;
      }

      if (canBoost) {
        hero.boost = Math.max(0, hero.boost - 26 * dt);
        if (hero.speed < 20) {
          hero.speed = Math.min(maxSpeed, hero.speed + 18 * dt);
        }
      } else {
        hero.boost = Math.min(100, hero.boost + 3.2 * dt);
      }

      const steerDir = hero.speed >= -0.2 ? 1 : -1;
      const speedTurnFactor = Math.min(1, Math.max(0.42, Math.abs(hero.speed) / 7.5));
      const steerRate = 2.45;
      if (Math.abs(controls.steer) > 1e-3) {
        hero.heading = wrapAngle(
          hero.heading + controls.steer * steerRate * speedTurnFactor * steerDir * dt
        );
      }

      let hopped = false;
      if (controls.hop && hero.hopTimer <= 0 && hero.y <= 0.05) {
        hero.hopTimer = 0.52;
        hero.vy = 6.8;
        hero.speed = Math.min(36, Math.max(hero.speed + 5.5, 16));
        hopped = true;
      }

      if (hero.hopTimer > 0) {
        hero.hopTimer = Math.max(0, hero.hopTimer - dt);
      }
      if (hero.y > 0 || hero.vy !== 0) {
        hero.vy -= 21.5 * dt;
        hero.y += hero.vy * dt;
        if (hero.y <= 0) {
          hero.y = 0;
          hero.vy = 0;
        }
      }

      const fx = Math.sin(hero.heading);
      const fz = -Math.cos(hero.heading);
      hero.vx = fx * hero.speed;
      hero.vz = fz * hero.speed;
      hero.x += hero.vx * dt;
      hero.z += hero.vz * dt;

      hero.roll = -controls.steer * Math.min(1, Math.abs(hero.speed) / 18) * 0.09;
      hero.pitch = hero.y > 0.05 ? clamp(hero.vy * 0.035, -0.22, 0.22) : 0;

      clampCarToPitch(hero);
      return { hopped };
    },
    stepTeammateAi(dt, car = green) {
      const heroDistToBall = Math.hypot(ball.x - hero.x, ball.z - hero.z);
      let targetX: number;
      let targetZ: number;
      let desiredSpeed: number;

      if (heroDistToBall < 8.5) {
        const supportSide = hero.x >= 0 ? -7.5 : 7.5;
        targetX = clamp(ball.x * 0.45 + supportSide, -13.5, 13.5);
        targetZ = clamp(ball.z + 8.5, -10, 19);
        desiredSpeed = 14.5;
      } else {
        targetX = ball.x * 0.85;
        targetZ = ball.z + 1.8;
        desiredSpeed = 17.5;
      }
      stepAiMotion(car, dt, targetX, targetZ, desiredSpeed, 2.5);
    },
    stepStrikerAi(dt, car = rival) {
      const behindBallZ = ball.z - 2.1;
      const isBehindBall = car.z <= ball.z + 0.6;
      let targetX = ball.x;
      let targetZ = behindBallZ;

      if (!isBehindBall) {
        const sideOffset = car.x >= ball.x ? 4.8 : -4.8;
        targetX = clamp(ball.x + sideOffset, -14.5, 14.5);
        targetZ = clamp(ball.z - 4.2, -23.5, 20.0);
      }

      stepAiMotion(car, dt, targetX, targetZ, 17.2, 2.6);
    },
    stepKeeperAi(dt, car = purple) {
      const dangerZone = ball.z < -10.5 && ball.vz < 4;
      const targetX = clamp(ball.x * 0.78, -(goalHalfWidth - 0.9), goalHalfWidth - 0.9);
      const targetZ = dangerZone ? clamp(ball.z - 0.9, -23.8, -15.5) : -23.0;
      stepAiMotion(car, dt, targetX, targetZ, dangerZone ? 17.5 : 13.5, 3.0);
    },
    resolveCarToCarBump(a, b) {
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const dist = Math.hypot(dx, dz);
      const minDist = carCollisionRadius * 1.72;
      if (dist >= minDist || dist < 1e-4) return false;

      const nx = dx / dist;
      const nz = dz / dist;
      const overlap = minDist - dist;

      a.x -= nx * overlap * 0.52;
      a.z -= nz * overlap * 0.52;
      b.x += nx * overlap * 0.52;
      b.z += nz * overlap * 0.52;

      const rvx = b.vx - a.vx;
      const rvz = b.vz - a.vz;
      const normalVel = rvx * nx + rvz * nz;
      if (normalVel < 0) {
        const impulse = -(1 + 0.45) * normalVel * 0.5;
        a.vx -= impulse * nx;
        a.vz -= impulse * nz;
        b.vx += impulse * nx;
        b.vz += impulse * nz;
        a.speed *= 0.88;
        b.speed *= 0.88;
      }

      clampCarToPitch(a);
      clampCarToPitch(b);
      return true;
    },
    stepBallPhysics(dt, cars = [hero, green, rival, purple]) {
      const touchedBy: {
        readonly actorId: CarSoccerVehicleActor["id"];
        readonly team: "orange" | "blue";
        readonly isShotOnBlueGoal: boolean;
        readonly isSaveAtBlueGoal: boolean;
      }[] = [];
      let wallBounced = false;
      let goalScored: "orange" | "blue" | null = null;

      const substeps = 3;
      const subDt = dt / substeps;
      const hitRadius = carCollisionRadius + ballRadius;

      for (let step = 0; step < substeps; step += 1) {
        if (ball.y > 0 || ball.vy !== 0) {
          ball.vy -= 17.5 * subDt;
        }

        const airFactor = ball.y > 0.15 ? 1.0 : 0.35;
        ball.vx += ball.wy * ball.vz * 0.04 * airFactor * subDt;
        ball.vz -= ball.wy * ball.vx * 0.04 * airFactor * subDt;

        ball.x += ball.vx * subDt;
        ball.y += ball.vy * subDt;
        ball.z += ball.vz * subDt;

        if (ball.y <= 0) {
          ball.y = 0;
          if (ball.vy < -1.35) {
            ball.vy = -ball.vy * 0.76;
            ball.vx *= 0.96;
            ball.vz *= 0.96;
          } else {
            ball.vy = 0;
          }
          const groundDrag = Math.exp(-0.72 * subDt);
          ball.vx *= groundDrag;
          ball.vz *= groundDrag;
          ball.wx = ball.vz / ballRadius;
          ball.wz = -ball.vx / ballRadius;
          ball.wy *= Math.exp(-1.5 * subDt);
        } else {
          const airDrag = Math.exp(-0.18 * subDt);
          ball.vx *= airDrag;
          ball.vz *= airDrag;
        }

        for (const car of cars) {
          const carCenterY = car.y + carHalfHeight;
          const ballCenterY = ball.y + ballRadius;
          const dx = ball.x - car.x;
          const dy = ballCenterY - carCenterY;
          const dz = ball.z - car.z;
          const distSq = dx * dx + dy * dy + dz * dz;

          if (distSq < hitRadius * hitRadius && distSq > 1e-6) {
            const dist = Math.sqrt(distSq);
            const nx = dx / dist;
            const ny = dy / dist;
            const nz = dz / dist;

            const overlap = hitRadius - dist;
            ball.x += nx * overlap * 1.04;
            ball.z += nz * overlap * 1.04;
            if (ny > 0.15) {
              ball.y = Math.max(0, ball.y + ny * overlap * 0.65);
            }

            const rvx = ball.vx - car.vx;
            const rvy = ball.vy - car.vy;
            const rvz = ball.vz - car.vz;
            const relNormalVel = rvx * nx + rvy * ny + rvz * nz;

            if (relNormalVel < 2.5) {
              const carSpeed = Math.hypot(car.vx, car.vz);
              const hopBonus = car.hopTimer > 0 ? 1.38 : 1.0;
              const strikeSpeed = Math.max(12.5, carSpeed * 1.42 * hopBonus);

              const carFx = Math.sin(car.heading);
              const carFz = -Math.cos(car.heading);
              const dirX = nx * 0.68 + carFx * 0.32;
              const dirZ = nz * 0.68 + carFz * 0.32;
              const dirLen = Math.hypot(dirX, dirZ) || 1;

              ball.vx = (dirX / dirLen) * strikeSpeed + car.vx * 0.28;
              ball.vz = (dirZ / dirLen) * strikeSpeed + car.vz * 0.28;

              const loft =
                car.hopTimer > 0
                  ? 7.2
                  : clamp(3.6 + carSpeed * 0.22, 3.6, 9.4);
              ball.vy = Math.max(ball.vy, loft);

              const crossSpin = (car.vx * nz - car.vz * nx) * 0.35;
              ball.wy = clamp(crossSpin, -9, 9);
              ball.wx = ball.vz / ballRadius;
              ball.wz = -ball.vx / ballRadius;

              ball.lastTouchTeam = car.team;
              ball.lastTouchActor = car.id;

              if (car.touchCooldown <= 0) {
                car.touchCooldown = 0.28;
                const isShotOnBlueGoal =
                  car.team === "orange" &&
                  ball.vz < -7.5 &&
                  Math.abs(ball.x) < goalHalfWidth + 4.0;
                const isSaveAtBlueGoal =
                  car.id === "purple" &&
                  ball.z < -17.5 &&
                  ball.vz > -2.0;

                touchedBy.push({
                  actorId: car.id,
                  team: car.team,
                  isShotOnBlueGoal,
                  isSaveAtBlueGoal
                });
              }
            }
          }
        }

        const wallX = pitchHalfX - ballRadius;
        const wallZ = pitchHalfZ - ballRadius;
        const inGoalMouthX = Math.abs(ball.x) < goalHalfWidth - ballRadius * 0.45;
        const underCrossbar = ball.y + ballRadius * 0.65 < goalHeight;

        if (ball.x < -wallX) {
          ball.x = -wallX;
          ball.vx = Math.abs(ball.vx) * 0.82;
          wallBounced = true;
        } else if (ball.x > wallX) {
          ball.x = wallX;
          ball.vx = -Math.abs(ball.vx) * 0.82;
          wallBounced = true;
        }

        if (inGoalMouthX && underCrossbar) {
          if (ball.z <= -(pitchHalfZ + ballRadius * 0.25)) {
            goalScored = "orange";
            break;
          }
          if (ball.z >= pitchHalfZ + ballRadius * 0.25) {
            goalScored = "blue";
            break;
          }
        } else {
          if (ball.z < -wallZ) {
            ball.z = -wallZ;
            ball.vz = Math.abs(ball.vz) * 0.82;
            wallBounced = true;
          } else if (ball.z > wallZ) {
            ball.z = wallZ;
            ball.vz = -Math.abs(ball.vz) * 0.82;
            wallBounced = true;
          }
        }

        if (ball.y > 14.5) {
          ball.y = 14.5;
          if (ball.vy > 0) ball.vy = -ball.vy * 0.65;
        }

        ball.rx = wrapAngle(ball.rx + ball.wx * subDt);
        ball.ry = wrapAngle(ball.ry + ball.wy * subDt);
        ball.rz = wrapAngle(ball.rz + ball.wz * subDt);
      }

      return {
        touchedBy,
        wallBounced,
        goalScored
      };
    },
    buildPitchAndGoalsNodes(pitchOptions = {}) {
      return buildCarSoccerPitchNodes({
        pitchHalfX: pitchOptions.pitchHalfX ?? pitchHalfX,
        pitchHalfZ: pitchOptions.pitchHalfZ ?? pitchHalfZ,
        goalHalfWidth: pitchOptions.goalHalfWidth ?? goalHalfWidth,
        goalHeight: pitchOptions.goalHeight ?? goalHeight,
        goalDepth: pitchOptions.goalDepth ?? goalDepth
      });
    }
  };
}

export const carSoccer = {
  create: createCarSoccerGameKit,
  pitchNodes: buildCarSoccerPitchNodes
} as const;
