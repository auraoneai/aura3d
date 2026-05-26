import { AnimationClip, AnimationTrack } from "@aura3d/animation";
import { composeMat4 } from "@aura3d/scene";
import { Geometry, PBRMaterial, createLightingDefault } from "@aura3d/rendering";
import { createWorkflowDiagnostics } from "./WorkflowDiagnostics";
import type { AnimationLabWorkflowOptions, AnimationLabWorkflowResult } from "./WorkflowTypes";

type Vec3 = readonly [number, number, number];

export function createAnimationLabWorkflow(options: AnimationLabWorkflowOptions = {}): AnimationLabWorkflowResult {
  const speed = Number.isFinite(options.speed) && options.speed !== undefined && options.speed > 0 ? options.speed : 1;
  const clips = createAnimationClips();
  const activeClip = clips.find((clip) => clip.name === (options.clip ?? "walk")) ?? clips[1]!;
  const lighting = createLightingDefault("studioProduct");
  const material = new PBRMaterial({ name: "animation-lab-character", baseColor: [0.72, 0.55, 0.32, 1], metallic: 0.18, roughness: 0.42 });
  const accent = new PBRMaterial({ name: "animation-lab-accent", baseColor: [0.18, 0.3, 0.28, 1], metallic: 0.08, roughness: 0.5 });

  const sample = (timeSeconds: number) => {
    const t = wrapTime(timeSeconds * speed, activeClip.duration);
    const root = sampleVec3(activeClip, "root.position", t);
    const armSwing = sampleScalar(activeClip, "arms.swing", t);
    const legSwing = sampleScalar(activeClip, "legs.swing", t);
    const headBob = sampleScalar(activeClip, "head.bob", t);
    const renderItems = [
      {
        label: "animation-lab-body",
        geometry: Geometry.capsule({ radius: 0.34, height: 1.25, segments: 24, rings: 12, textured: true }),
        material,
        modelMatrix: composeMat4([root[0], 0.78 + root[1], root[2]], [0, 0, 0, 1], [1.05, 1, 0.85])
      },
      {
        label: "animation-lab-head",
        geometry: Geometry.uvSphere(0.28, 32, 16, { textured: true }),
        material,
        modelMatrix: composeMat4([root[0], 1.66 + headBob, root[2]], [0, 0, 0, 1], [1, 1, 1])
      },
      {
        label: "animation-lab-left-arm",
        geometry: Geometry.cylinder({ radius: 0.09, height: 0.78, segments: 18, textured: true }),
        material: accent,
        modelMatrix: composeMat4([root[0] - 0.44, 0.9, root[2] + armSwing], [0.18, 0, 0, 0.98], [1, 1, 1])
      },
      {
        label: "animation-lab-right-arm",
        geometry: Geometry.cylinder({ radius: 0.09, height: 0.78, segments: 18, textured: true }),
        material: accent,
        modelMatrix: composeMat4([root[0] + 0.44, 0.9, root[2] - armSwing], [-0.18, 0, 0, 0.98], [1, 1, 1])
      },
      {
        label: "animation-lab-left-leg",
        geometry: Geometry.cylinder({ radius: 0.12, height: 0.78, segments: 18, textured: true }),
        material: accent,
        modelMatrix: composeMat4([root[0] - 0.18, 0.18, root[2] - legSwing], [0.12, 0, 0, 0.99], [1, 1, 1])
      },
      {
        label: "animation-lab-right-leg",
        geometry: Geometry.cylinder({ radius: 0.12, height: 0.78, segments: 18, textured: true }),
        material: accent,
        modelMatrix: composeMat4([root[0] + 0.18, 0.18, root[2] + legSwing], [-0.12, 0, 0, 0.99], [1, 1, 1])
      }
    ];
    return {
      renderItems,
      cameraPolicy: "auto-frame" as const,
      cameraFrameOptions: { paddingRatio: 0.24, yawRadians: -0.28, pitchRadians: -0.08 },
      environmentLighting: lighting.environmentLighting,
      shadow: false,
      postprocess: { ...lighting.postprocess, targetFormat: "rgba8" as const }
    };
  };

  const source = sample(0);
  return {
    kind: "animation-lab",
    source,
    renderItems: source.renderItems,
    clips,
    mixer: {
      timeScale: speed,
      actionCount: 1,
      actions: [{ clipName: activeClip.name, duration: activeClip.duration, time: 0, weight: 1, timeScale: speed, playing: true, paused: false, loopMode: "repeat" }],
      layers: [],
      values: {
        "root.position": [0, 0, 0],
        "arms.swing": 0,
        "legs.swing": 0,
        "head.bob": 0
      },
      applyErrors: []
    },
    diagnostics: createWorkflowDiagnostics("animation-lab", {
      featureChecklist: ["keyframe-clips", "clip-switching", "animated-transforms", "timeline-sampling", "camera-framing", "postprocess"]
    }),
    update: sample,
    dispose: () => undefined
  };
}

function createAnimationClips(): readonly AnimationClip[] {
  return [
    createClip("idle", 1.6, [0, 0, 0], 0.05, 0.02, 0.03),
    createClip("walk", 1.2, [0, 0, 0.1], 0.24, 0.22, 0.06),
    createClip("run", 0.8, [0, 0, 0.16], 0.34, 0.32, 0.09)
  ];
}

function createClip(name: string, duration: number, rootEnd: Vec3, arm: number, leg: number, bob: number): AnimationClip {
  return new AnimationClip({
    name,
    duration,
    tracks: [
      new AnimationTrack<Vec3>({
        target: "root.position",
        valueType: "vector3",
        keyframes: [
          { time: 0, value: [0, 0, 0] },
          { time: duration / 2, value: [rootEnd[0], bob, rootEnd[2] / 2] },
          { time: duration, value: rootEnd }
        ]
      }),
      new AnimationTrack<number>({
        target: "arms.swing",
        valueType: "scalar",
        keyframes: [
          { time: 0, value: -arm },
          { time: duration / 2, value: arm },
          { time: duration, value: -arm }
        ]
      }),
      new AnimationTrack<number>({
        target: "legs.swing",
        valueType: "scalar",
        keyframes: [
          { time: 0, value: leg },
          { time: duration / 2, value: -leg },
          { time: duration, value: leg }
        ]
      }),
      new AnimationTrack<number>({
        target: "head.bob",
        valueType: "scalar",
        keyframes: [
          { time: 0, value: 0 },
          { time: duration / 2, value: bob },
          { time: duration, value: 0 }
        ]
      })
    ]
  });
}

function sampleVec3(clip: AnimationClip, target: string, time: number): Vec3 {
  const value = clip.tracks.find((track) => track.target === target)?.sample(time);
  return Array.isArray(value) && value.length === 3 ? [value[0]!, value[1]!, value[2]!] : [0, 0, 0];
}

function sampleScalar(clip: AnimationClip, target: string, time: number): number {
  const value = clip.tracks.find((track) => track.target === target)?.sample(time);
  return typeof value === "number" ? value : 0;
}

function wrapTime(timeSeconds: number, duration: number): number {
  if (duration <= 0) return 0;
  const wrapped = timeSeconds % duration;
  return wrapped < 0 ? wrapped + duration : wrapped;
}
