export interface CameraTimelineKeyframe {
  atMs: number;
  label: string;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  shake: number;
  reducedMotionShake: number;
}

export const auraBurstCameraTimeline: CameraTimelineKeyframe[] = [
  {
    atMs: 0,
    label: "windup hold",
    position: [0, 2.3, 6.8],
    target: [0, 1.15, 0],
    fov: 40,
    shake: 0,
    reducedMotionShake: 0,
  },
  {
    atMs: 220,
    label: "push-in",
    position: [0.3, 2.05, 5.25],
    target: [0, 1.25, 0],
    fov: 35,
    shake: 2,
    reducedMotionShake: 0,
  },
  {
    atMs: 420,
    label: "impact punch",
    position: [-0.16, 2.0, 4.9],
    target: [0, 1.2, 0],
    fov: 32,
    shake: 9,
    reducedMotionShake: 1,
  },
  {
    atMs: 720,
    label: "return to wide",
    position: [0, 2.35, 7.4],
    target: [0, 1.05, 0],
    fov: 42,
    shake: 1,
    reducedMotionShake: 0,
  },
];

export function getAuraBurstCameraKeyframe(atMs: number, reducedMotion: boolean): CameraTimelineKeyframe {
  const frame = [...auraBurstCameraTimeline].reverse().find((keyframe) => atMs >= keyframe.atMs) ?? auraBurstCameraTimeline[0]!;
  return {
    ...frame,
    shake: reducedMotion ? frame.reducedMotionShake : frame.shake,
  };
}
