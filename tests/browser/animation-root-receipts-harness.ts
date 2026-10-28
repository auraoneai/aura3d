// Root-only harness for the animation receipts: layers, root motion, humanoid retargeting
// and two-bone IK, all driven through `@aura3d/engine` runtime-node handles on real skinned
// GLBs. Imports nothing from @aura3d/animation, @aura3d/assets or production-runtime.
import { camera, createAuraApp, defineModelAssets, lights, material, model, primitives, scene } from "@aura3d/engine";
import type { AuraActorAnimationApi, AuraApp, AuraRuntimeNodeHandle } from "@aura3d/engine";
import {
  changedBetween,
  captureCanvas,
  distance,
  messageOf,
  newStageCanvas,
  sha256Hex,
  sleep,
  type CapabilityResult,
  type Capture
} from "./motion-receipts-page";

type Vec3 = readonly [number, number, number];
type Handle = AuraRuntimeNodeHandle & { readonly animation: AuraActorAnimationApi };

const W = 320;
const H = 240;
const DT = 1 / 30;
const SOLDIER_URL = "/fixtures/threejs-parity/assets/character/soldier.glb";
const ROBOT_URL = "/fixtures/threejs-parity/assets/character/robot-expressive.glb";

declare global {
  interface Window {
    __AURA3D_ANIMATION_ROOT_RECEIPTS__?: {
      status: "running" | "done";
      imports: readonly string[];
      capabilities: Record<string, CapabilityResult>;
    };
  }
}

async function fileHash(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`fixture ${url} -> HTTP ${response.status}`);
  return sha256Hex(await response.arrayBuffer());
}

async function assetsFor() {
  const [soldier, robot] = await Promise.all([fileHash(SOLDIER_URL), fileHash(ROBOT_URL)]);
  return defineModelAssets(
    {
      soldier: { url: SOLDIER_URL, sha256: soldier, animations: ["Idle", "Run", "TPose", "Walk"] },
      robot: {
        url: ROBOT_URL,
        sha256: robot,
        animations: ["Dance", "Death", "Idle", "Jump", "No", "Punch", "Running", "Sitting", "Standing", "ThumbsUp", "Walking", "WalkJump", "Wave", "Yes"]
      }
    },
    { license: "three.js examples (Soldier.glb, RobotExpressive.glb)" }
  ).refs;
}

type Refs = Awaited<ReturnType<typeof assetsFor>>;

function marker(id: string, color: string) {
  return primitives.sphere({ name: id, size: 0.07, material: material.pbr({ color, roughness: 0.4 }) }).runtime({ id });
}

function baseScene(cameraTarget: Vec3, cameraPosition: Vec3) {
  return scene()
    .background("#9db4c8")
    .camera(camera.perspective({ fov: 40, near: 0.1, far: 60, position: cameraPosition, target: cameraTarget }))
    .add(lights.hemisphere({ skyColor: "#dce8f2", groundColor: "#4d6358", intensity: 1.3 }))
    .add(lights.directional({ color: "#fff4e0", intensity: 2.2, position: [4, 8, 6] }))
    .add(primitives.plane({ name: "ground", size: [30, 1, 30], material: material.pbr({ color: "#6f8a5a", roughness: 1 }) }));
}

async function mount(builder: ReturnType<typeof scene>): Promise<{ app: AuraApp; canvas: HTMLCanvasElement }> {
  const canvas = newStageCanvas(W, H);
  const app = createAuraApp(canvas, {
    autoStart: false,
    resize: false,
    pixelRatio: 1,
    renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" },
    scene: builder
  });
  await app.ready();
  return { app, canvas };
}

function dispose(app: AuraApp, canvas: HTMLCanvasElement): void {
  app.dispose();
  canvas.remove();
}

/** Step until the actor has applied tracks (the GLB, skin and clip are all live), or throw. */
async function warm(app: AuraApp, node: Handle, label: string): Promise<void> {
  for (let attempt = 0; attempt < 240; attempt += 1) {
    app.step(DT);
    const state = node.animation.animationState();
    if (state !== undefined && state.tracksApplied > 0) return;
    await sleep(25);
  }
  throw new Error(`${label}: actor never applied animation tracks (state=${JSON.stringify(node.animation.animationState() ?? null)})`);
}

function pos(app: AuraApp, id: string): Vec3 {
  const p = app.nodes.require(id).position;
  return [p[0], p[1], p[2]];
}

function mean(samples: readonly Vec3[]): Vec3 {
  const n = samples.length;
  return [samples.reduce((s, p) => s + p[0], 0) / n, samples.reduce((s, p) => s + p[1], 0) / n, samples.reduce((s, p) => s + p[2], 0) / n];
}

function stepAndSample(app: AuraApp, steps: number, ids: readonly string[]): Record<string, Vec3[]> {
  const out: Record<string, Vec3[]> = Object.fromEntries(ids.map((id) => [id, [] as Vec3[]]));
  for (let i = 0; i < steps; i += 1) {
    app.step(DT);
    for (const id of ids) out[id]!.push(pos(app, id));
  }
  return out;
}

const round = (value: number, digits = 4): number => Number(value.toFixed(digits));
const roundVec = (v: Vec3): number[] => v.map((c) => round(c));

// ── Layers ────────────────────────────────────────────────────────────────────────────────
async function layers(refs: Refs): Promise<CapabilityResult> {
  const result: CapabilityResult = { status: "ok", measurements: {}, frames: [] };
  const { app, canvas } = await mount(
    baseScene([0, 1, 0], [0, 1.3, 4.6])
      .add(model(refs.soldier, { name: "hero", targetHeight: 1.8 }).runtime({ id: "hero" }))
      .add(marker("mHand", "#ff3b30"))
      .add(marker("mFoot", "#0a84ff"))
  );
  try {
    const hero = app.nodes.require("hero") as Handle;
    hero.play("Idle", { loop: true });
    await warm(app, hero, "layers");
    hero.animation.attach({ socket: "mixamorig:RightHand", target: "mHand" });
    hero.animation.attach({ socket: "mixamorig:LeftFoot", target: "mFoot" });
    app.step(DT);

    const idle = stepAndSample(app, 30, ["mHand", "mFoot"]);
    const frameIdle = captureCanvas(canvas, "idle", "Idle only: arms at the sides");

    hero.animation.playLayer("upper", "Run", { weight: 1, mask: { humanoid: "upper-body" } });
    const layered = stepAndSample(app, 30, ["mHand", "mFoot"]);
    const frameLayer = captureCanvas(canvas, "idle-plus-upper-run", "Idle base + Run on the upper-body layer");
    const activeActions = hero.animation.animationState()?.activeActions ?? [];

    hero.animation.stopLayer("upper", 0);
    const released = stepAndSample(app, 30, ["mHand", "mFoot"]);
    const frameReleased = captureCanvas(canvas, "layer-stopped", "Upper-body layer stopped");

    const handIdle = mean(idle.mHand!);
    const handLayer = mean(layered.mHand!);
    const handReleased = mean(released.mHand!);
    const footIdle = mean(idle.mFoot!);
    const footLayer = mean(layered.mFoot!);
    result.measurements = {
      handShiftWithLayer: round(distance(handIdle, handLayer)),
      footShiftWithLayer: round(distance(footIdle, footLayer)),
      handShiftAfterStop: round(distance(handIdle, handReleased)),
      handIdleMean: roundVec(handIdle),
      handLayerMean: roundVec(handLayer),
      footIdleMean: roundVec(footIdle),
      footLayerMean: roundVec(footLayer),
      activeActions,
      changedPixelsIdleVsLayer: changedBetween(frameIdle, frameLayer),
      changedPixelsIdleVsStopped: changedBetween(frameIdle, frameReleased)
    };
    result.frames.push(frameIdle.frame, frameLayer.frame, frameReleased.frame);
  } finally {
    dispose(app, canvas);
  }
  return result;
}

// ── Root motion ───────────────────────────────────────────────────────────────────────────
async function rootMotion(refs: Refs): Promise<CapabilityResult> {
  const result: CapabilityResult = { status: "ok", measurements: {}, frames: [] };
  const { app, canvas } = await mount(
    baseScene([0, 1, 0], [0, 1.4, 7])
      .add(model(refs.soldier, { name: "applied", targetHeight: 1.8 }).runtime({ id: "applied" }))
      .add(model(refs.soldier, { name: "reported", targetHeight: 1.8 }).runtime({ id: "reported" }))
      .add(model(refs.soldier, { name: "inPlace", targetHeight: 1.8 }).runtime({ id: "inPlace" }))
  );
  try {
    const ids = ["applied", "reported", "inPlace"] as const;
    // Face +X (the Soldier runs along its local +Z), spread along Z so the three never overlap.
    const startZ = { applied: 1.4, reported: 0, inPlace: -1.4 } as const;
    for (const id of ids) app.nodes.require(id).setPosition(-2.5, 0, startZ[id]).setRotation(0, Math.PI / 2, 0);
    const applied = app.nodes.require("applied") as Handle;
    const reported = app.nodes.require("reported") as Handle;
    const inPlace = app.nodes.require("inPlace") as Handle;
    applied.play("Run", { loop: true, rootMotion: { mode: "apply", bone: "mixamorig:Hips", axes: ["x", "z"] } });
    reported.play("Run", { loop: true, rootMotion: { mode: "extract-only", bone: "mixamorig:Hips", axes: ["x", "z"] } });
    inPlace.play("Run", { loop: true });
    await warm(app, applied, "rootMotion");
    app.step(DT);

    const start = Object.fromEntries(ids.map((id) => [id, pos(app, id)])) as Record<(typeof ids)[number], Vec3>;
    const frameStart = captureCanvas(canvas, "start", "Three Run clips at the start line");
    const steps = 45;
    for (let i = 0; i < steps; i += 1) app.step(DT);
    const end = Object.fromEntries(ids.map((id) => [id, pos(app, id)])) as Record<(typeof ids)[number], Vec3>;
    const frameEnd = captureCanvas(canvas, "end", "After 1.5 s: only the apply-mode node has travelled");

    result.measurements = {
      seconds: round(steps * DT),
      appliedTravel: round(distance(start.applied, end.applied)),
      appliedDelta: roundVec([end.applied[0] - start.applied[0], end.applied[1] - start.applied[1], end.applied[2] - start.applied[2]]),
      extractOnlyTravel: round(distance(start.reported, end.reported)),
      noRootMotionTravel: round(distance(start.inPlace, end.inPlace)),
      changedPixelsStartVsEnd: changedBetween(frameStart, frameEnd)
    };
    result.frames.push(frameStart.frame, frameEnd.frame);
  } finally {
    dispose(app, canvas);
  }
  return result;
}

// ── Retargeting ───────────────────────────────────────────────────────────────────────────
async function retargeting(refs: Refs): Promise<CapabilityResult> {
  const result: CapabilityResult = { status: "ok", measurements: {}, frames: [] };
  const { app, canvas } = await mount(
    baseScene([0, 1, 0], [0, 1.4, 6])
      .add(model(refs.soldier, { name: "src", targetHeight: 1.8 }).runtime({ id: "src" }))
      .add(model(refs.robot, { name: "dst", targetHeight: 1.8 }).runtime({ id: "dst" }))
      .add(marker("mRobotHand", "#ff3b30"))
  );
  try {
    app.nodes.require("src").setPosition(-1.3, 0, 0);
    app.nodes.require("dst").setPosition(1.3, 0, 0);
    const src = app.nodes.require("src") as Handle;
    const dst = app.nodes.require("dst") as Handle;
    src.play("Idle", { loop: true });
    dst.play("Idle", { loop: true });
    await warm(app, dst, "retargeting");
    await warm(app, src, "retargeting");
    dst.animation.attach({ socket: "Palm2.R", target: "mRobotHand" });
    for (let i = 0; i < 20; i += 1) app.step(DT);
    const frameBefore = captureCanvas(canvas, "robot-own-idle", "Robot on its own Idle, Soldier on Idle");

    // The Soldier's clips are Mixamo-rigged; the Robot has different bone names and rest pose.
    const names = await dst.animation.addClipsFrom(src);
    src.play("Run", { loop: true });
    dst.play("Run", { loop: true });
    for (let i = 0; i < 6; i += 1) app.step(DT);
    const stateAfterPlay = dst.animation.animationState();
    const handTrack = stepAndSample(app, 30, ["mRobotHand"]).mRobotHand!;
    const frameRun = captureCanvas(canvas, "robot-retargeted-run", "Soldier Run (left) and the Soldier's Run retargeted onto the Robot (right)");

    const ys = handTrack.map((p) => p[1]);
    const zs = handTrack.map((p) => p[2]);
    result.measurements = {
      bakedClipNames: names,
      robotActiveClip: stateAfterPlay?.activeClip ?? null,
      robotTracksApplied: stateAfterPlay?.tracksApplied ?? 0,
      robotHandHeightRange: round(Math.max(...ys) - Math.min(...ys)),
      robotHandDepthRange: round(Math.max(...zs) - Math.min(...zs)),
      robotRegionChangedPixels: changedBetween(frameBefore, frameRun, { x0: W / 2 }),
      soldierRegionChangedPixels: changedBetween(frameBefore, frameRun, { x1: W / 2 })
    };
    result.frames.push(frameBefore.frame, frameRun.frame);
  } finally {
    dispose(app, canvas);
  }
  return result;
}

// ── Two-bone IK ───────────────────────────────────────────────────────────────────────────
async function twoBoneIk(refs: Refs): Promise<CapabilityResult> {
  const result: CapabilityResult = { status: "ok", measurements: {}, frames: [] };
  const { app, canvas } = await mount(
    baseScene([0, 1.1, 0], [0, 1.3, 4.2])
      .add(model(refs.soldier, { name: "hero", targetHeight: 1.8 }).runtime({ id: "hero" }))
      .add(marker("mShoulder", "#34c759"))
      .add(marker("mElbow", "#ffcc00"))
      .add(marker("mHand", "#ff3b30"))
      .add(primitives.sphere({ name: "ikTarget", size: 0.11, material: material.emissive({ color: "#ff2d92", emissive: "#ff2d92" }) }).runtime({ id: "ikTarget" }))
  );
  try {
    const hero = app.nodes.require("hero") as Handle;
    hero.play("Idle", { loop: true });
    await warm(app, hero, "twoBoneIk");
    hero.animation.attach({ socket: "mixamorig:RightArm", target: "mShoulder" });
    hero.animation.attach({ socket: "mixamorig:RightForeArm", target: "mElbow" });
    hero.animation.attach({ socket: "mixamorig:RightHand", target: "mHand" });
    for (let i = 0; i < 10; i += 1) app.step(DT);

    const shoulder = pos(app, "mShoulder");
    const reach = distance(shoulder, pos(app, "mElbow")) + distance(pos(app, "mElbow"), pos(app, "mHand"));
    const aim = (dir: Vec3, fraction: number): Vec3 => {
      const n = Math.hypot(dir[0], dir[1], dir[2]);
      return [shoulder[0] + (dir[0] / n) * reach * fraction, shoulder[1] + (dir[1] / n) * reach * fraction, shoulder[2] + (dir[2] / n) * reach * fraction];
    };
    const targetA = aim([0.45, 0.35, 0.82], 0.85);
    const targetB = aim([-0.1, 0.75, 0.65], 0.8);
    const target = app.nodes.require("ikTarget");

    target.setPosition(...targetA);
    for (let i = 0; i < 4; i += 1) app.step(DT);
    const handBefore = pos(app, "mHand");
    const frameRest = captureCanvas(canvas, "ik-off", "Arm on the Idle pose, target ball floating ahead");

    const removeIk = hero.animation.ik.add({
      kind: "two-bone",
      root: "mixamorig:RightArm",
      mid: "mixamorig:RightForeArm",
      tip: "mixamorig:RightHand",
      target: "ikTarget",
      pole: "auto"
    });
    for (let i = 0; i < 6; i += 1) app.step(DT);
    const handA = pos(app, "mHand");
    const frameA = captureCanvas(canvas, "ik-target-a", "Two-bone IK: hand reaches target A");

    target.setPosition(...targetB);
    for (let i = 0; i < 6; i += 1) app.step(DT);
    const handB = pos(app, "mHand");
    const frameB = captureCanvas(canvas, "ik-target-b", "Two-bone IK: hand follows target to B");

    removeIk();
    for (let i = 0; i < 6; i += 1) app.step(DT);
    const handCleared = pos(app, "mHand");

    result.measurements = {
      armReach: round(reach),
      errorBeforeIk: round(distance(handBefore, targetA)),
      errorTargetA: round(distance(handA, targetA)),
      errorTargetB: round(distance(handB, targetB)),
      handTravelAToB: round(distance(handA, handB)),
      errorAfterClear: round(distance(handCleared, targetB)),
      targetA: roundVec(targetA),
      targetB: roundVec(targetB),
      handA: roundVec(handA),
      handB: roundVec(handB),
      changedPixelsOffVsA: changedBetween(frameRest, frameA),
      changedPixelsAVsB: changedBetween(frameA, frameB)
    };
    result.frames.push(frameRest.frame, frameA.frame, frameB.frame);
  } finally {
    dispose(app, canvas);
  }
  return result;
}

async function main(): Promise<void> {
  const state: NonNullable<Window["__AURA3D_ANIMATION_ROOT_RECEIPTS__"]> = {
    status: "running",
    imports: ["@aura3d/engine"],
    capabilities: {}
  };
  window.__AURA3D_ANIMATION_ROOT_RECEIPTS__ = state;
  const refs = await assetsFor();
  const runs: ReadonlyArray<readonly [string, (refs: Refs) => Promise<CapabilityResult>]> = [
    ["animation-layers", layers],
    ["animation-root-motion", rootMotion],
    ["animation-retargeting", retargeting],
    ["animation-two-bone-ik", twoBoneIk]
  ];
  for (const [name, run] of runs) {
    try {
      state.capabilities[name] = await run(refs);
    } catch (error) {
      state.capabilities[name] = { status: "error", error: messageOf(error), measurements: {}, frames: [] };
    }
  }
  state.status = "done";
}

void main().catch((error) => {
  window.__AURA3D_ANIMATION_ROOT_RECEIPTS__ = {
    status: "done",
    imports: ["@aura3d/engine"],
    capabilities: { harness: { status: "error", error: messageOf(error), measurements: {}, frames: [] } }
  };
});
