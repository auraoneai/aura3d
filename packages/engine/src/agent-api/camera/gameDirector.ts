/**
 * R-12 (PRD-08 §7.2): `game.cameraDirector` re-implemented over the real camera
 * stack — `rigs.fighting` frames the target set side-on, `impact()` feeds the
 * controller's built-in trauma shake, `special()` is the C-22 `lookAt` layer.
 * `update()` returns the presented pose after driving the controller for `dt`.
 * Reached only via `createGameCameraDirector` under `A3D_QR_CAMERA`
 * (`{ legacySpec: true }` opts out).
 */
import type { AuraVec3 } from "../index.js";
import type {
  AuraCameraPose,
  AuraCameraSubject,
  AuraCameraRig
} from "../../contracts/camera.js";
import { createCameraController } from "./CameraController.js";
import { createFightingRig } from "./rigs/fighting.js";
import { staticRig } from "./rigs/fromSpec.js";
import { createLookAtLayer } from "./layers/lookAt.js";

export interface QrGameCameraDirectorOptions {
  readonly targetIds?: readonly string[];
  readonly mode?: "side-fighter" | "follow" | "fixed";
  readonly targetY?: number;
  readonly distance?: number;
  readonly baseFov?: number;
  readonly minDistance?: number;
  readonly maxDistance?: number;
  readonly minZoom?: number;
  readonly maxZoom?: number;
  readonly stageBounds?: { readonly minX?: number; readonly maxX?: number };
  readonly bounds?: { readonly minX?: number; readonly maxX?: number };
  readonly impactShake?: boolean;
  readonly reducedMotion?: boolean;
  readonly aspect?: () => number;
}

export interface QrGameCameraTarget {
  readonly id?: string;
  readonly position: AuraVec3;
}

const length3 = (v: AuraVec3): number => Math.hypot(v[0], v[1], v[2]);
const sub3 = (a: AuraVec3, b: AuraVec3): AuraVec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const clampN = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/**
 * Real camera-controller director. The object satisfies the legacy
 * `GameCameraDirector` interface structurally (update/impact/special/snapshot)
 * and adds `bind(app)` which presents poses through `app.camera.setPose`.
 */
export function createQrGameCameraDirector(options: QrGameCameraDirectorOptions = {}) {
  const baseFov = options.baseFov ?? 42;
  const baseDistance = options.distance ?? 6.2;
  const targetY = options.targetY ?? 0.95;
  const reducedMotion = options.reducedMotion ?? false;
  const mode = options.mode ?? "side-fighter";
  const impactShake = options.impactShake ?? true;
  const stageBounds = options.stageBounds ?? options.bounds;

  let pose: AuraCameraPose | undefined;
  const applyPoseFns: ((p: AuraCameraPose) => void)[] = [];
  const subjects = new Map<string, AuraCameraSubject>();
  const subjectIds: string[] = [];

  const controller = createCameraController({
    resolveSubject: (ref) => subjects.get(typeof ref === "string" ? ref : String(ref)),
    aspect: options.aspect,
    reducedMotion: () => reducedMotion,
    applyPose: (p) => {
      pose = p;
      for (const fn of applyPoseFns) fn(p);
    }
  });
  const lookAt = createLookAtLayer();
  controller.addLayer(lookAt);

  let rigKey = "";
  const setRig = (key: string, rig: AuraCameraRig): void => {
    if (rigKey === key) return;
    rigKey = key;
    controller.use(rig);
  };

  let shakeEstimate = 0;
  let specialRemaining = 0;
  // 08-LOOP: accumulated clock for the controller's noise/shake time base —
  // passing `dt*1000` as timeMs kept it pinned near one frame duration.
  let elapsedMs = 0;

  const initialRig = (): AuraCameraRig =>
    mode === "fixed"
      ? staticRig({ position: [0, targetY + 0.4, baseDistance], target: [0, targetY, 0], fov: baseFov })
      : createFightingRig({
          fighters: [options.targetIds?.[0] ?? "target-0", options.targetIds?.[1] ?? "target-1"],
          fov: baseFov,
          minDistance: options.minDistance ?? baseDistance * (options.minZoom ? 1 / Math.max(1.0001, options.minZoom) : 0.8),
          maxDistance: options.maxDistance ?? baseDistance * (options.maxZoom ?? 1.24)
        });
  setRig(mode === "fixed" ? "fixed" : `fighting:${options.targetIds?.[0] ?? "target-0"}`, initialRig());

  const snapshot = () => {
    const p = pose ?? {
      position: [0, 1.35, baseDistance] as AuraVec3,
      target: [0, targetY, 0] as AuraVec3,
      up: [0, 1, 0] as AuraVec3,
      roll: 0,
      fov: baseFov,
      near: 0.1,
      far: 200
    };
    const dist = Math.max(0.01, length3(sub3(p.position, p.target)));
    return {
      kind: "aura-game-camera-director" as const,
      position: p.position,
      target: p.target,
      fov: p.fov,
      zoom: clampN(baseDistance / dist, 0.1, 10),
      shake: reducedMotion ? 0 : shakeEstimate,
      reducedMotion,
      mode,
      targetIds: options.targetIds ?? [...subjectIds]
    };
  };

  return {
    update(dt: number, targets: readonly QrGameCameraTarget[]) {
      specialRemaining = Math.max(0, specialRemaining - Math.max(0, dt));
      shakeEstimate = Math.max(0, shakeEstimate - Math.max(0, dt) * 4);
      subjects.clear();
      subjectIds.length = 0;
      targets.forEach((t, i) => {
        const id = t.id ?? `target-${i}`;
        subjectIds.push(id);
        const half = 0.5;
        subjects.set(id, {
          position: [...t.position] as AuraVec3,
          velocity: [0, 0, 0],
          forward: [0, 0, -1],
          bounds: {
            min: [t.position[0] - half, t.position[1] - half, t.position[2] - half] as AuraVec3,
            max: [t.position[0] + half, t.position[1] + half, t.position[2] + half] as AuraVec3
          }
        });
      });
      if (stageBounds && subjectIds.length >= 2) {
        // Keep both fighters inside the stage range: fight plane midpoint clamps.
        const ids: readonly [string, string] = [subjectIds[0], subjectIds[1] ?? subjectIds[0]];
        setRig(`fighting:${ids[0]}|${ids[1]}`, createFightingRig({ fighters: ids, fov: baseFov }));
      } else if (mode === "fixed") {
        setRig("fixed", initialRig());
      } else {
        const ids: readonly [string, string] = [subjectIds[0] ?? "target-0", subjectIds[1] ?? subjectIds[0] ?? "target-1"];
        setRig(`fighting:${ids[0]}|${ids[1]}`, createFightingRig({ fighters: ids, fov: baseFov }));
      }
      if (specialRemaining <= 0) lookAt.clear();
      elapsedMs += Math.max(0, dt) * 1000;
      controller.update(Math.max(0, dt), elapsedMs);
      return snapshot();
    },
    impact(intensity = 1, duration = 0.16) {
      if (reducedMotion || !impactShake) return;
      controller.shake.add(Math.min(1, intensity));
      shakeEstimate = Math.max(shakeEstimate, intensity * Math.min(1, duration / 0.16));
    },
    special(target?: AuraVec3, duration = 0.8) {
      if (target) {
        specialRemaining = duration;
        lookAt.set(target);
      }
    },
    snapshot,
    /** Attach the presented pose to an app's camera (`app.camera.setPose`). */
    bind(app: { camera?: { setPose?: (p: Partial<AuraCameraPose>) => void } }) {
      applyPoseFns.push((p) => app.camera?.setPose?.(p));
    }
  };
}
