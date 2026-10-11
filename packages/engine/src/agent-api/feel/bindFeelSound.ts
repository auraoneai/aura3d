/**
 * `feel/bindFeelSound.ts` (A-3): lane-08 glue for C-25 `GameSound`.
 *
 * PRD 09's `createGame` can call `bindFeelSound(app, sound)` once a sound
 * engine is bound; from then on the audio listener tracks the *presented*
 * camera pose — once per presented frame via `app.onFrame`, so the ears sit
 * where the C-22 pipeline actually put the camera (not where a rig requested
 * it).
 *
 * Two listener surfaces are accepted:
 * - C-25 `GameSound.setListener({ position, forward, up })` (full pose);
 * - the engine `GameAudio.setListenerPosition({ x, y, z })` (position only),
 *   which is what `createGame` passes today.
 * T0-29 (#979): `createGame` handed `GameAudio` here, which has no
 * `setListener`, so every flag-on game threw `setListener is not a function`
 * inside the frame loop and never drew. A sound object with neither method
 * is now a no-op bind instead of a per-frame crash.
 */
import type { AuraApp, AuraVec3 } from "../index.js";

export interface FeelSoundListener {
  setListener(o: {
    readonly position: AuraVec3;
    readonly forward: AuraVec3;
    readonly up: AuraVec3;
  }): void;
}

/** `GameAudio`'s position-only listener surface (engine `game/GameAudio.ts`). */
export interface FeelSoundPositionListener {
  setListenerPosition(position: { readonly x: number; readonly y: number; readonly z: number }): unknown;
}

interface PresentedPoseLike {
  readonly position: AuraVec3;
  readonly target: AuraVec3;
  readonly up: AuraVec3;
}

type OnFrameApp = { onFrame?(cb: (f: { readonly dt: number }) => void): () => void };

type ListenerSink = (pose: PresentedPoseLike) => void;

function sinkFor(sound: unknown): ListenerSink | undefined {
  const s = sound as Partial<FeelSoundListener & FeelSoundPositionListener> | null | undefined;
  if (s && typeof s.setListener === "function") {
    const setListener = s.setListener.bind(s);
    return (pose) => {
      const fx = pose.target[0] - pose.position[0];
      const fy = pose.target[1] - pose.position[1];
      const fz = pose.target[2] - pose.position[2];
      const len = Math.hypot(fx, fy, fz);
      const forward: AuraVec3 = len > 1e-9 ? [fx / len, fy / len, fz / len] : [0, 0, -1];
      setListener({ position: pose.position, forward, up: pose.up });
    };
  }
  if (s && typeof s.setListenerPosition === "function") {
    const setListenerPosition = s.setListenerPosition.bind(s);
    return (pose) => {
      setListenerPosition({ x: pose.position[0], y: pose.position[1], z: pose.position[2] });
    };
  }
  return undefined;
}

/** Returns the unsubscribe; a no-op unsubscribe on stubbed apps or listener-less sound objects. */
export function bindFeelSound(app: AuraApp, sound: FeelSoundListener | FeelSoundPositionListener): () => void {
  const camera = (app as unknown as { camera?: { presented?(): PresentedPoseLike } }).camera;
  const onFrame = (app as unknown as OnFrameApp).onFrame;
  const sink = sinkFor(sound);
  if (!onFrame || !camera?.presented || !sink) return () => {};
  return onFrame(() => sink(camera.presented!()));
}
