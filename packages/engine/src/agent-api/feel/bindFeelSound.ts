/**
 * `feel/bindFeelSound.ts` (A-3): lane-08 glue for C-25 `GameSound`.
 *
 * PRD 09's `createGame` can call `bindFeelSound(app, sound)` once a sound
 * engine is bound; from then on the audio listener tracks the *presented*
 * camera pose — `setListener({position, forward, up})` exactly once per
 * presented frame via `app.onFrame`, so the ears sit where the C-22 pipeline
 * actually put the camera (not where a rig requested it).
 */
import type { AuraApp, AuraVec3 } from "../index.js";

export interface FeelSoundListener {
  setListener(o: {
    readonly position: AuraVec3;
    readonly forward: AuraVec3;
    readonly up: AuraVec3;
  }): void;
}

interface PresentedPoseLike {
  readonly position: AuraVec3;
  readonly target: AuraVec3;
  readonly up: AuraVec3;
}

type OnFrameApp = { onFrame?(cb: (f: { readonly dt: number }) => void): () => void };

/** Returns the unsubscribe; a no-op unsubscribe on stubbed apps. */
export function bindFeelSound(app: AuraApp, sound: FeelSoundListener): () => void {
  const camera = (app as unknown as { camera?: { presented?(): PresentedPoseLike } }).camera;
  const onFrame = (app as unknown as OnFrameApp).onFrame;
  if (!onFrame || !camera?.presented) return () => {};
  return onFrame(() => {
    const pose = camera.presented!();
    const fx = pose.target[0] - pose.position[0];
    const fy = pose.target[1] - pose.position[1];
    const fz = pose.target[2] - pose.position[2];
    const len = Math.hypot(fx, fy, fz);
    const forward: AuraVec3 = len > 1e-9 ? [fx / len, fy / len, fz / len] : [0, 0, -1];
    sound.setListener({ position: pose.position, forward, up: pose.up });
  });
}
