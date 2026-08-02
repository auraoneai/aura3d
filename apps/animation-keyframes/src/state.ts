export const APP_ID = "animation-keyframes" as const;
export const RUNTIME_KEY = "__a3dCurrentRoutesAnimationKeyframes" as const;
export const ASSET_URL = "/fixtures/threejs-parity/assets/character/robot-expressive.glb";

export type CurrentRoutesRuntimeStatus = "loading" | "ready" | "running" | "error";

export interface CurrentRoutesKeyframeControls {
  playing: boolean;
  speed: number;
  scrub: number;
  orbitYaw: number;
  clipName: string;
}

export interface CurrentRoutesAnimationKeyframesRuntime {
  readonly appId: typeof APP_ID;
  readonly status: CurrentRoutesRuntimeStatus;
  readonly loadingStep: string;
  readonly error?: string;
  readonly assetUrl: string;
  readonly assetName: string;
  readonly clipName: string;
  readonly clipCount: number;
  readonly animationTime: number;
  readonly duration: number;
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly fps: number;
  readonly triangles: number;
  readonly tracksApplied: number;
  readonly skinningPalettesUpdated: number;
  readonly motionSamples: number;
  readonly motionTimeRange: number;
  readonly poseDiversityScore: number;
  readonly motionHealthy: boolean;
  readonly elapsedMs: number;
  readonly controls: CurrentRoutesKeyframeControls;
}

declare global {
  interface Window {
    __a3dCurrentRoutesAnimationKeyframes?: CurrentRoutesAnimationKeyframesRuntime;
  }
}

export function createInitialRuntime(now = performance.now()): CurrentRoutesAnimationKeyframesRuntime {
  return {
    appId: APP_ID,
    status: "loading",
    loadingStep: "booting route shell",
    assetUrl: ASSET_URL,
    assetName: "Robot Expressive",
    clipName: "loading",
    clipCount: 0,
    animationTime: 0,
    duration: 1,
    frameCount: 0,
    drawCalls: 0,
    fps: 0,
    triangles: 0,
    tracksApplied: 0,
    skinningPalettesUpdated: 0,
    motionSamples: 0,
    motionTimeRange: 0,
    poseDiversityScore: 0,
    motionHealthy: false,
    elapsedMs: 0,
    controls: {
      playing: true,
      speed: 1,
      scrub: 0,
      orbitYaw: -0.38,
      clipName: "Dance"
    }
  };
}

export function publishRuntime(runtime: CurrentRoutesAnimationKeyframesRuntime): void {
  window[RUNTIME_KEY] = runtime;
}

export function updateRuntime(
  runtime: CurrentRoutesAnimationKeyframesRuntime,
  startedAt: number,
  patch: Partial<CurrentRoutesAnimationKeyframesRuntime>
): CurrentRoutesAnimationKeyframesRuntime {
  const next = {
    ...runtime,
    ...patch,
    controls: patch.controls ?? runtime.controls,
    elapsedMs: Math.round(performance.now() - startedAt)
  };
  publishRuntime(next);
  return next;
}
