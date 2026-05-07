import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import { AnimationClip, AnimationMixer, AnimationTrack, Bone, SceneAnimationBridge, Skeleton, buildSkinningPalette } from "../../packages/animation/src/index.js";
import { AnimationInspector } from "../../packages/debug/src/AnimationInspector.js";
import { PhysicsDebugAdapter } from "../../packages/debug/src/PhysicsDebugAdapter.js";
import { PhysicsWorld, Shape } from "../../packages/physics/src/index.js";

type Baseline = {
  readonly name: string;
  readonly frames: number;
  readonly elapsedMs: number;
  readonly averageFrameMs: number;
  readonly evidence: Record<string, unknown>;
};

function round(value: number, places = 4): number {
  return Number(value.toFixed(places));
}

function measurePhysicsBaseline(): Baseline {
  const world = new PhysicsWorld({ gravity: [0, -9.81, 0], fixedDelta: 1 / 60, solverIterations: 1 });
  const ground = world.createRigidBody({ type: "static", position: [0, -0.5, 0] });
  world.createCollider(ground, { shape: Shape.box(80, 0.5, 80) });

  for (let index = 0; index < 500; index += 1) {
    const x = (index % 25) * 1.5 - 18;
    const z = Math.floor(index / 25) * 1.5 - 15;
    const y = 1 + (index % 7) * 0.04;
    const body = world.createRigidBody({ position: [x, y, z], velocity: [0.05 * (index % 3), 0, -0.03 * (index % 5)] });
    world.createCollider(body, { shape: Shape.box(0.35, 0.35, 0.35) });
  }

  const frames = 60;
  const before = performance.now();
  for (let frame = 0; frame < frames; frame += 1) {
    world.step(1 / 60);
  }
  const elapsedMs = performance.now() - before;
  const stackEvidence = new PhysicsDebugAdapter().stackEvidence(world);
  const stats = world.snapshot().stats;

  return {
    name: "physics-fixedstep-500-bodies",
    frames,
    elapsedMs: round(elapsedMs, 3),
    averageFrameMs: round(elapsedMs / frames),
    evidence: {
      bodyCount: stackEvidence.bodyCount,
      dynamicBodyCount: stackEvidence.dynamicBodyCount,
      contactCount: stackEvidence.contactCount,
      broadphasePairs: stats.broadphasePairs,
      lineCount: stackEvidence.lineCount,
      stableHash: stackEvidence.stableHash
    }
  };
}

function measureAnimationBaseline(): Baseline {
  const clip = new AnimationClip({
    name: "move",
    duration: 1,
    tracks: [
      new AnimationTrack({
        target: "node.position",
        valueType: "vector3",
        keyframes: [{ time: 0, value: [0, 0, 0] }, { time: 1, value: [1, 2, 3] }]
      }),
      new AnimationTrack({
        target: "node.rotation",
        valueType: "quaternion",
        keyframes: [{ time: 0, value: [0, 0, 0, 1] }, { time: 1, value: [0, 0.7071068, 0, 0.7071068] }]
      })
    ],
    events: [{ name: "midpoint", time: 0.5 }]
  });

  const mixers: AnimationMixer[] = [];
  for (let index = 0; index < 100; index += 1) {
    const bridge = new SceneAnimationBridge();
    bridge.register("node", {
      position: [0, 0, 0],
      rotation: [0, 0, 0, 1],
      scale: [1, 1, 1]
    });
    const mixer = new AnimationMixer(bridge);
    mixer.play(clip);
    mixers.push(mixer);
  }

  const skeleton = new Skeleton([
    new Bone({ name: "root", parentIndex: -1, translation: [0, 0, 0] }),
    new Bone({ name: "spine", parentIndex: 0, translation: [0, 1, 0] }),
    new Bone({ name: "head", parentIndex: 1, translation: [0, 1, 0] })
  ]);

  const frames = 120;
  const before = performance.now();
  let eventCount = 0;
  for (let frame = 0; frame < frames; frame += 1) {
    for (const mixer of mixers) {
      eventCount += mixer.update(1 / 60).length;
    }
    buildSkinningPalette(skeleton);
  }
  const elapsedMs = performance.now() - before;
  const evidence = new AnimationInspector().visualEvidence(mixers[0]!, skeleton);

  return {
    name: "animation-100-mixers-skeleton-palette",
    frames,
    elapsedMs: round(elapsedMs, 3),
    averageFrameMs: round(elapsedMs / frames),
    evidence: {
      mixerCount: mixers.length,
      eventCount,
      sampledTargetCount: evidence.sampledTargetCount,
      paletteMatrixCount: evidence.paletteMatrixCount,
      stableHash: evidence.stableHash,
      paletteHash: evidence.paletteHash
    }
  };
}

function main(): void {
  const baselines = [measurePhysicsBaseline(), measureAnimationBaseline()];
  const report = {
    generatedAt: new Date().toISOString(),
    suite: "workstream-4-physics-animation",
    status: "pass",
    baselines
  };

  if (process.argv.includes("--write-report")) {
    const reportPath = resolve("tests/reports/workstream4-performance.json");
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  }

  console.log(JSON.stringify(report, null, 2));
}

main();
