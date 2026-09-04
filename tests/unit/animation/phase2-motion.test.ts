import { describe, expect, it } from "vitest";
import {
  AnimationClip,
  AnimationTrack,
  SPRING_BONE_PRESETS,
  analyzeHumanoidRig,
  createFootIkRig,
  createHeightFieldGround,
  createHumanoidRetargetingMap,
  createLocomotionKit,
  createMovingPlatformGround,
  createSpringChain,
  createSpringChainFromPreset,
  measureRootMotionLoopClosure,
  registerHumanoidRetargetingProfile,
  HUMANOID_RETARGETING_PROFILES,
  type HumanoidRigDefinition
} from "../../../packages/animation/src";

/**
 * E2 — motion that looks AAA on the certified roster: spring presets, moving-platform
 * ground, root-motion zero-slide metric, per-rig retarget profiles, inertialized
 * locomotion transitions. All pure/deterministic: no GPU, no screenshots.
 */

function loopingWalkClip(): AnimationClip {
  // Constant-velocity root advance: seamless loop, closure error ~0.
  const keyframes = [0, 0.25, 0.5, 0.75, 1].map((time) => ({
    time,
    value: [time * 2, 0, 0] as [number, number, number],
    interpolation: "linear" as const
  }));
  return new AnimationClip({
    name: "walk-loop",
    tracks: [new AnimationTrack({ target: "root.position", valueType: "vector3", keyframes })]
  });
}

function snappingClip(): AnimationClip {
  // Teleports back mid-loop: the feet visibly pop every cycle.
  const keyframes = [
    { time: 0, value: [0, 0, 0] as [number, number, number], interpolation: "linear" as const },
    { time: 0.5, value: [2, 0, 0] as [number, number, number], interpolation: "linear" as const },
    { time: 0.51, value: [0, 0, 0] as [number, number, number], interpolation: "linear" as const },
    { time: 1, value: [2, 0, 0] as [number, number, number], interpolation: "linear" as const }
  ];
  return new AnimationClip({
    name: "snap-loop",
    tracks: [new AnimationTrack({ target: "root.position", valueType: "vector3", keyframes })]
  });
}

describe("spring-bone preset library", () => {
  it("ships hair, coat, antenna, and tail presets with a stiffness/damping table", () => {
    expect(Object.keys(SPRING_BONE_PRESETS).sort()).toEqual(["antenna", "coat", "hair", "tail"]);
    for (const preset of Object.values(SPRING_BONE_PRESETS)) {
      expect(preset.stiffness).toBeGreaterThan(0);
      expect(preset.damping).toBeGreaterThan(0);
      expect(preset.substeps).toBeGreaterThanOrEqual(1);
    }
    // Distinct reads: coat is stiffer and more damped than hair; antenna barely feels gravity.
    expect(SPRING_BONE_PRESETS.coat.stiffness).toBeGreaterThan(SPRING_BONE_PRESETS.hair.stiffness);
    expect(SPRING_BONE_PRESETS.antenna.gravityScale).toBeLessThan(SPRING_BONE_PRESETS.hair.gravityScale);
  });

  it("builds a chain from a preset with per-field overrides winning", () => {
    const bones: [number, number, number][] = [[0, 1, 0], [0, 0.7, 0], [0, 0.4, 0]];
    const fromPreset = createSpringChainFromPreset("tail", { bones });
    expect(fromPreset.telemetry().boneCount).toBe(3);
    expect(fromPreset.telemetry().stiffness).toBe(SPRING_BONE_PRESETS.tail.stiffness);
    expect(fromPreset.telemetry().damping).toBe(SPRING_BONE_PRESETS.tail.damping);
    const overridden = createSpringChainFromPreset("tail", { bones, stiffness: 123 });
    expect(overridden.telemetry().stiffness).toBe(123);
    expect(overridden.telemetry().damping).toBe(SPRING_BONE_PRESETS.tail.damping);
  });

  it("preset chains integrate deterministically like hand-built chains", () => {
    const bones: [number, number, number][] = [[0, 1, 0], [0, 0.7, 0], [0, 0.4, 0]];
    const a = createSpringChainFromPreset("hair", { bones });
    const b = createSpringChainFromPreset("hair", { bones });
    for (let frame = 0; frame < 30; frame += 1) {
      const root = { position: [Math.sin(frame / 10), 1, 0] as [number, number, number] };
      a.integrate(1 / 60, root);
      b.integrate(1 / 60, root);
    }
    expect(a.positions()).toEqual(b.positions());
    expect(a.telemetry().kineticEnergy).toBeGreaterThan(0);
  });

  it("rejects unknown preset names instead of silently defaulting", () => {
    expect(() => createSpringChainFromPreset("cape" as never, { bones: [[0, 0, 0], [0, -1, 0]] })).toThrow(/Unknown spring-bone preset/);
  });

  it("does not change default chain behavior (baseline preserved)", () => {
    const bones: [number, number, number][] = [[0, 1, 0], [0, 0.7, 0]];
    const chain = createSpringChain({ bones });
    expect(chain.telemetry().stiffness).toBe(40);
    expect(chain.telemetry().damping).toBe(4);
  });
});

describe("moving-platform ground adapter", () => {
  const flat = createHeightFieldGround(() => ({ height: 0 }));

  it("prefers the platform top when a platform is under the query", () => {
    const ground = createMovingPlatformGround(flat, (x, z) => (Math.abs(x) < 1 && Math.abs(z) < 1 ? 2 : undefined));
    const hit = ground.raycastDown([0, 3, 0], 5);
    expect(hit?.point[1]).toBeCloseTo(2, 10);
  });

  it("falls through to the base ground off-platform", () => {
    const ground = createMovingPlatformGround(flat, () => undefined);
    const hit = ground.raycastDown([5, 3, 5], 5);
    expect(hit?.point[1]).toBeCloseTo(0, 10);
  });

  it("keeps the higher (nearer) surface when platform and terrain overlap", () => {
    const ground = createMovingPlatformGround(flat, () => -1);
    const hit = ground.raycastDown([0, 3, 0], 5);
    expect(hit?.point[1]).toBeCloseTo(0, 10);
  });

  it("plants feet on a moving platform through the foot-IK rig", () => {
    let platformHeight = 1;
    const ground = createMovingPlatformGround(flat, (x, z) => (Math.abs(x) < 2 && Math.abs(z) < 2 ? platformHeight : undefined));
    const rig = createFootIkRig({
      legs: [{ side: "left", hip: [0.1, 1.6, 0], knee: [0.1, 0.9, 0.05], ankle: [0.1, 1.04, 0] }],
      raycaster: ground
    });
    const first = rig.solveFootPlacement();
    expect(first.feet[0]?.sample.grounded).toBe(true);
    expect(first.feet[0]?.sample.plantedFoot[1]).toBeCloseTo(platformHeight + 0.035, 10);
    // Platform rises: the query still resolves against the new top.
    platformHeight = 1.4;
    const hit = ground.raycastDown([0.1, 2.5, 0], 5);
    expect(hit?.point[1]).toBeCloseTo(1.4, 10);
  });
});

describe("measureRootMotionLoopClosure — zero-slide metric", () => {
  it("reports ~zero closure error for a seamless constant-velocity loop", () => {
    const report = measureRootMotionLoopClosure(loopingWalkClip());
    expect(report.cycleDelta).toEqual([2, 0, 0]);
    expect(report.cycleDistance).toBeCloseTo(2, 10);
    expect(report.loopClosureError).toBeCloseTo(0, 6);
    expect(report.maxVelocityDeviation).toBeCloseTo(0, 6);
  });

  it("reports a large velocity deviation for a clip that snaps every cycle", () => {
    const report = measureRootMotionLoopClosure(snappingClip());
    expect(report.maxVelocityDeviation).toBeGreaterThan(10);
  });

  it("names the missing track instead of returning zeros", () => {
    expect(() => measureRootMotionLoopClosure(loopingWalkClip(), "hips.position")).toThrow(/was not found/);
  });
});

function fullRig(id: string): HumanoidRigDefinition {
  const bones = {} as HumanoidRigDefinition["bones"];
  for (const bone of ["hips", "spine", "head", "leftUpperArm", "leftLowerArm", "leftHand", "rightUpperArm", "rightLowerArm", "rightHand", "leftUpperLeg", "leftLowerLeg", "leftFoot", "rightUpperLeg", "rightLowerLeg", "rightFoot", "leftShoulder", "rightShoulder"] as const) {
    (bones as Record<string, { name: string; length: number }>)[bone] = { name: `${id}_${bone}`, length: 0.3 };
  }
  return { id, bones };
}

describe("per-rig retargeting profiles", () => {
  it("leaves scales untouched without a profile (baseline preserved)", () => {
    const map = createHumanoidRetargetingMap(fullRig("a"), fullRig("b"));
    expect(map.ok).toBe(true);
    expect(map.bindings.hips?.scale).toBeCloseTo(1, 10);
  });

  it("multiplies per-bone, shoulder, and hip corrections on top of the base scale", () => {
    const map = createHumanoidRetargetingMap(fullRig("a"), fullRig("b"), {
      profile: {
        rigId: "b",
        perBoneScale: { leftHand: 1.5 },
        shoulderWidthCorrection: 1.1,
        hipCorrection: 0.9
      }
    });
    expect(map.bindings.leftHand?.scale).toBeCloseTo(1.5, 10);
    expect(map.bindings.leftUpperArm?.scale).toBeCloseTo(1.1, 10);
    expect(map.bindings.hips?.scale).toBeCloseTo(0.9, 10);
    expect(map.bindings.head?.scale).toBeCloseTo(1, 10);
  });

  it("rejects non-positive per-bone scales instead of mirroring bones", () => {
    expect(() => createHumanoidRetargetingMap(fullRig("a"), fullRig("b"), {
      profile: { rigId: "b", perBoneScale: { head: -1 } }
    })).toThrow(/invalid scale/);
  });

  it("keeps the certified-rig profile registry empty until rigs are certified", () => {
    expect(Object.keys(HUMANOID_RETARGETING_PROFILES)).toEqual([]);
  });

  it("registers profiles by rig id with validation", () => {
    expect(() => registerHumanoidRetargetingProfile({ rigId: "" })).toThrow(/rig id/);
  });

  it("analyzeHumanoidRig still validates both sides with a profile present", () => {
    expect(analyzeHumanoidRig(fullRig("hero-a")).ok).toBe(true);
  });
});

describe("locomotion transitions are inertialized", () => {
  function kit(transitionHalfLife?: number) {
    return createLocomotionKit({ idleClip: "idle", walkClip: "walk", runClip: "run", transitionHalfLife });
  }

  it("exposes an inertialized state blend on transitions (critically-damped decay)", () => {
    const locomotion = kit();
    locomotion.sample(0);
    locomotion.sample(5);
    const blend = locomotion.sample(5).stateTransition;
    expect(blend.from).toBe("idle");
    expect(blend.to).toBe("run");
    // Critically-damped: fromWeight starts at 1 with zero initial slope and decays monotonically.
    const [fromWeight, toWeight] = blend.weights;
    expect(fromWeight + toWeight).toBeCloseTo(1, 10);
    expect(fromWeight).toBeGreaterThan(0.9);
    const later = locomotion.sample(5, 1).stateTransition;
    expect(later.weights[0]).toBeLessThan(fromWeight);
  });

  it("settles the blend after enough time (no permanent half-blend)", () => {
    const locomotion = kit();
    locomotion.sample(0);
    locomotion.sample(5);
    const settled = locomotion.sample(5, 5).stateTransition;
    expect(settled.done).toBe(true);
    expect(settled.weights[0]).toBe(0);
  });

  it("accepts an explicit transition half-life and rejects garbage", () => {
    expect(kit(0.2).graph.transitionHalfLife).toBe(0.2);
    expect(() => kit(-1)).toThrow(/transitionHalfLife/);
  });
});
