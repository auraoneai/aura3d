import { AnimationClip, AnimationMixer, AnimationTrack, applyRootMotion, extractRootMotion, type RootMotionSample } from "@aura3d/animation";
import { createExample, drawGrid, installExampleStyles, type ExampleMetadata } from "../shared/exampleHarness.js";

interface RootMotionExampleState {
  readonly status: "ready" | "error";
  readonly clipName: string;
  readonly sample: RootMotionSample;
  readonly scenePosition: readonly [number, number, number];
  readonly ecsPosition: readonly [number, number, number];
  readonly localStride: readonly [number, number, number];
  readonly error?: string;
}

declare global {
  interface Window {
    __AURA3D_ROOT_MOTION_EXAMPLE__?: RootMotionExampleState;
  }
}

const metadata: ExampleMetadata = {
  id: "root-motion",
  title: "Root Motion",
  purpose: "Extract root-motion deltas from an animation clip and apply them to scene-style and ECS-style runtime targets.",
  acceptance: "The scene and ECS targets advance deterministically while local stride animation remains sampled separately.",
};

if (typeof document !== "undefined") {
  installExampleStyles();
  void createExample(metadata, () => {
    const clip = createRootMotionRunClip();
    const mixer = new AnimationMixer();
    mixer.play(clip);
    const sceneTarget = { position: [0, 0, 0] as [number, number, number] };
    const ecsTarget = { position: [0, 0, 0] as [number, number, number] };
    let previousTime = 0;
    let clipTime = 0;
    let latestSample = extractRootMotion(clip, { fromTime: 0, toTime: 0, loop: true });
    let latestLocalStride: readonly [number, number, number] = [0, 0, 0];

    return {
      metrics: () => ({
        clip: clip.name,
        sceneX: Number(sceneTarget.position[0].toFixed(3)),
        ecsX: Number(ecsTarget.position[0].toFixed(3)),
        deltaX: Number(latestSample.delta[0].toFixed(3)),
      }),
      draw(context, canvas) {
        const dt = 1 / 60;
        previousTime = clipTime;
        clipTime += dt;
        latestSample = extractRootMotion(clip, { target: "root.position", fromTime: previousTime, toTime: clipTime, loop: true });
        applyRootMotion(sceneTarget, latestSample, 1);
        applyRootMotion(ecsTarget, latestSample, 1);
        mixer.update(dt);
        const value = mixer.getValue("runner.stride.offset");
        latestLocalStride = Array.isArray(value) && value.length === 3 ? [value[0] as number, value[1] as number, value[2] as number] : [0, 0, 0];

        const state: RootMotionExampleState = {
          status: "ready",
          clipName: clip.name,
          sample: latestSample,
          scenePosition: [...sceneTarget.position],
          ecsPosition: [...ecsTarget.position],
          localStride: latestLocalStride,
        };
        window.__AURA3D_ROOT_MOTION_EXAMPLE__ = state;

        drawGrid(context, canvas, 64);
        drawTrack(context, canvas);
        drawRunner(context, canvas, sceneTarget.position[0], latestLocalStride, "#f5c84b", "Scene");
        drawRunner(context, canvas, ecsTarget.position[0], [latestLocalStride[0], -latestLocalStride[1], latestLocalStride[2]], "#56d6b1", "ECS");
      },
    };
  }).catch((error) => {
    window.__AURA3D_ROOT_MOTION_EXAMPLE__ = {
      status: "error",
      clipName: "root-motion-run",
      sample: extractRootMotion(createRootMotionRunClip(), { fromTime: 0, toTime: 0, loop: true }),
      scenePosition: [0, 0, 0],
      ecsPosition: [0, 0, 0],
      localStride: [0, 0, 0],
      error: error instanceof Error ? error.message : String(error),
    };
  });
}

function createRootMotionRunClip(): AnimationClip {
  return new AnimationClip({
    name: "root-motion-run",
    duration: 1,
    tracks: [
      new AnimationTrack({
        target: "root.position",
        valueType: "vector3",
        keyframes: [
          { time: 0, value: [0, 0, 0] },
          { time: 0.5, value: [1.2, 0, 0] },
          { time: 1, value: [2.4, 0, 0] },
        ],
      }),
      new AnimationTrack({
        target: "runner.stride.offset",
        valueType: "vector3",
        keyframes: [
          { time: 0, value: [0, 0.12, 0] },
          { time: 0.25, value: [0.08, -0.08, 0] },
          { time: 0.5, value: [0, 0.12, 0] },
          { time: 0.75, value: [-0.08, -0.08, 0] },
          { time: 1, value: [0, 0.12, 0] },
        ],
      }),
    ],
  });
}

function drawTrack(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
  context.save();
  context.strokeStyle = "#637485";
  context.lineWidth = 3;
  for (const y of [canvas.height * 0.38, canvas.height * 0.64]) {
    context.beginPath();
    context.moveTo(70, y);
    context.lineTo(canvas.width - 70, y);
    context.stroke();
  }
  context.restore();
}

function drawRunner(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  distance: number,
  stride: readonly [number, number, number],
  color: string,
  label: string
): void {
  const wrapped = distance % 6;
  const x = 90 + (wrapped / 6) * (canvas.width - 180);
  const y = label === "Scene" ? canvas.height * 0.38 : canvas.height * 0.64;
  context.save();
  context.lineCap = "round";
  context.lineWidth = 10;
  context.strokeStyle = "#d6e2e8";
  context.beginPath();
  context.moveTo(x, y - 48);
  context.lineTo(x, y - 95);
  context.stroke();
  context.strokeStyle = color;
  context.beginPath();
  context.moveTo(x, y - 55);
  context.lineTo(x + 34 + stride[0] * 160, y - 25 + stride[1] * 120);
  context.moveTo(x, y - 54);
  context.lineTo(x - 34 - stride[0] * 160, y - 25 - stride[1] * 120);
  context.stroke();
  context.fillStyle = color;
  context.beginPath();
  context.arc(x, y - 122, 24, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#eaf2f7";
  context.font = "16px ui-sans-serif, system-ui, sans-serif";
  context.fillText(label, 24, y - 12);
  context.restore();
}
