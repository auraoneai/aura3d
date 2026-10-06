/**
 * C-22 — CameraRig live API (CONTRACTS.md). Provider: PRD 08. Flag: A3D_QR_CAMERA.
 */

import type { AuraVec3, AuraRuntimeNodeHandle } from "../agent-api/index";

export interface AuraCameraPose { readonly position: AuraVec3; readonly target: AuraVec3; readonly up: AuraVec3; readonly roll: number; readonly fov: number; readonly near: number; readonly far: number; readonly orthographicSize?: number; }
export type AuraEaseName = "linear" | "inQuad" | "outQuad" | "inOutQuad" | "inCubic" | "outCubic" | "inOutCubic" | "outBack" | "outElastic" | "inOutSine" | "outExpo";
export interface AuraCameraSubject { readonly position: AuraVec3; readonly velocity: AuraVec3; readonly forward: AuraVec3; readonly bounds: { readonly min: AuraVec3; readonly max: AuraVec3 }; }
export interface AuraCameraProbe { sphereCast(from: AuraVec3, to: AuraVec3, radius: number): { readonly hit: boolean; readonly distance: number; readonly node?: string }; occluders(from: AuraVec3, to: AuraVec3): readonly string[]; }
export interface AuraCameraRigContext { readonly dt: number; readonly time: number; readonly aspect: number; readonly previous: AuraCameraPose; subject(ref: string | AuraRuntimeNodeHandle): AuraCameraSubject | undefined; readonly probe: AuraCameraProbe; }
export interface AuraCameraRig { readonly id: string; update(ctx: AuraCameraRigContext): AuraCameraPose; reset?(pose?: AuraCameraPose): void; }
export interface AuraCameraLayer { readonly id: string; readonly timeDomain?: "real" | "sim"; apply(pose: AuraCameraPose, ctx: { readonly dt: number; readonly reducedMotion: boolean }): AuraCameraPose; readonly energy?: () => number; }
export interface AuraTraumaLayer extends AuraCameraLayer { add(amount: number): void; configure(o: { maxAngleDeg?: number; maxOffset?: number; frequency?: number; decayPerSecond?: number }): void; }
export interface AuraPunchLayer extends AuraCameraLayer { trigger(o: { fov?: number; dolly?: number; attack?: number; hold?: number; release?: number }): void; }
export interface AuraFovKickLayer extends AuraCameraLayer { set(channel: string, offsetDeg: number, halflife?: number): void; }
export interface AuraCameraShot { readonly rig: AuraCameraRig; readonly duration: number; readonly blendIn?: number; readonly bars?: boolean; }
export interface AuraCameraSequence { readonly id: string; readonly shots: readonly AuraCameraShot[]; readonly onEnd?: "hold" | "return"; }
export interface AuraCameraSequencePlayback { readonly done: Promise<void>; skip(): void; readonly progress: number; }
export interface AuraCameraEvidence { readonly kind: "aura-camera-presented"; readonly rig: string; readonly pose: AuraCameraPose; readonly viewProjection: readonly number[]; readonly layers: readonly { readonly id: string; readonly energy: number }[]; readonly subjectScreenHeightFraction?: number; readonly cutThisFrame: boolean; }
export interface AuraCameraController {
  presented(): AuraCameraPose;
  setPose(p: Partial<AuraCameraPose>, o?: { cut?: boolean }): void;
  setFov(fov: number, o?: { halflife?: number }): void;
  setRoll(roll: number, o?: { halflife?: number }): void;
  use(rig: AuraCameraRig, o?: { blend?: number; ease?: AuraEaseName }): void;
  readonly rig: AuraCameraRig;
  addLayer(l: AuraCameraLayer, order?: number): () => void;
  readonly shake: AuraTraumaLayer; readonly punch: AuraPunchLayer; readonly fovKick: AuraFovKickLayer;
  play(s: AuraCameraSequence): AuraCameraSequencePlayback;
  cut(): void;                      // calls resetTemporalHistory("camera-cut") (C-14)
  evidence(): AuraCameraEvidence;
}
export interface AuraCameraRailOptions { readonly points: readonly AuraVec3[]; readonly lookAt: string | AuraVec3 | readonly AuraVec3[]; readonly fov?: number | readonly number[]; readonly duration: number; readonly ease?: AuraEaseName; readonly loop?: "none" | "loop" | "pingpong"; readonly alpha?: number; }
export interface AuraCameraRigFactories {
  chase(o: Readonly<Record<string, unknown>> & { target: string }): AuraCameraRig;
  flight(o: Readonly<Record<string, unknown>> & { target: string; horizonLock?: number; followPitch?: number }): AuraCameraRig;
  follow2d(o: Readonly<Record<string, unknown>> & { target: string }): AuraCameraRig;
  fighting(o: Readonly<Record<string, unknown>> & { fighters: readonly [string, string] }): AuraCameraRig;
  shoulder(o: Readonly<Record<string, unknown>> & { target: string }): AuraCameraRig;
  orbit(o: Readonly<Record<string, unknown>>): AuraCameraRig;
  topDown(o: Readonly<Record<string, unknown>> & { target?: string; pitchDeg?: number }): AuraCameraRig;
  altitude(o: Readonly<Record<string, unknown>> & { target: string }): AuraCameraRig;
  rail(o: AuraCameraRailOptions): AuraCameraRig;
  static(pose: Partial<AuraCameraPose>): AuraCameraRig;
  fromSpec(spec: unknown /* AuraCameraSpec: index.ts:3163 */): AuraCameraRig;
}
// camera.rigs: AuraCameraRigFactories (rig-specific option interfaces are PRD 08's and are additive); AuraApp.camera: AuraCameraController (via C-38)
// createAuraApp({ camera?: { legacy?: boolean; freezeSpecs?: boolean } }) (PR 0a)

export interface AuraCameraOption { readonly legacy?: boolean; readonly freezeSpecs?: boolean; }

const DEFAULT_POSE: AuraCameraPose = {
  position: [0, 1.6, 5],
  target: [0, 1, 0],
  up: [0, 1, 0],
  roll: 0,
  fov: 50,
  near: 0.1,
  far: 1000
};

/**
 * PR 0a stub factories: `static` and `fromSpec` are real; the others return a
 * static rig at the subject's bounds plus the spec offset (with a
 * `capability-degraded` degradation recorded by the host).
 */
export const stubCameraRigFactories: AuraCameraRigFactories = {
  chase: (o) => staticRig({ target: [0, 0, 0], position: [0, 2, 6] }, `chase:${o.target}`),
  flight: (o) => staticRig({ target: [0, 0, 0], position: [0, 4, 8] }, `flight:${o.target}`),
  follow2d: (o) => staticRig({ target: [0, 0, 0], position: [0, 0, 8] }, `follow2d:${o.target}`),
  fighting: (o) => staticRig({ target: [0, 1, 0], position: [0, 2, 6] }, `fighting:${o.fighters.join(",")}`),
  shoulder: (o) => staticRig({ target: [0, 1, 0], position: [0, 2, 2] }, `shoulder:${o.target}`),
  orbit: (_o) => staticRig({ target: [0, 0, 0], position: [3, 2, 3] }, "orbit"),
  topDown: (o) => staticRig({ target: [0, 0, 0], position: [0, 10, 0.001], up: [0, 0, -1] }, `topDown:${o.target ?? ""}`),
  altitude: (o) => staticRig({ target: [0, 0, 0], position: [0, 6, 6] }, `altitude:${o.target}`),
  rail: (o) => staticRig({ target: (o.lookAt as AuraVec3) ?? [0, 0, 0], position: o.points[0] ?? [0, 1, 5] }, "rail"),
  static: (pose) => staticRig(pose, "static"),
  fromSpec: (spec) => staticRig(spec as Partial<AuraCameraPose>, "fromSpec")
};

function staticRig(pose: Partial<AuraCameraPose>, id: string): AuraCameraRig {
  const full: AuraCameraPose = { ...DEFAULT_POSE, ...pose };
  return {
    id,
    update: () => full,
    reset: () => { /* static rig keeps its authored pose */ }
  };
}
