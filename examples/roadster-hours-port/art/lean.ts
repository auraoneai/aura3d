/**
 * GU47 WP-32 RH47-15: visual body roll and pitch of the roadster (presentation only, PRD D8). The body leans out of lane
 * changes and squats or dives with speed changes on the ground, read from the presented pose; the sim's own roll (air
 * rolls) and the road bank are added on top by the world runtime. Reduced motion keeps 30% of the lean (PRD §6.3).
 */
export const MAX_LEAN_ROLL = 0.06;
export const MAX_LEAN_PITCH = 0.035;

export interface BodyLean { readonly roll: number; readonly pitch: number }

export interface BodyLeanTracker {
  step(pose: { readonly l: number; readonly v: number; readonly grounded: boolean }, dt: number): BodyLean;
  reset(): void;
  setReducedMotion(on: boolean): void;
}

const clamp = (x: number, a: number): number => Math.max(-a, Math.min(a, x));

export function createBodyLean(): BodyLeanTracker {
  let lPrev: number | undefined, vPrev: number | undefined;
  let roll = 0, pitch = 0, reduced = false;
  return {
    reset() { lPrev = undefined; vPrev = undefined; roll = 0; pitch = 0; },
    setReducedMotion(on) { reduced = on; },
    step(pose, dt) {
      const d = Math.max(1e-3, dt);
      let wantRoll = 0, wantPitch = 0;
      if (lPrev !== undefined && vPrev !== undefined && pose.grounded && Math.abs(pose.l - lPrev) < 3) {
        wantRoll = clamp(-((pose.l - lPrev) / d) * 0.012, MAX_LEAN_ROLL);
        wantPitch = clamp(-((pose.v - vPrev) / d) * 0.0025, MAX_LEAN_PITCH);
      }
      lPrev = pose.l; vPrev = pose.v;
      const k = Math.min(1, dt * 8);
      roll += (wantRoll - roll) * k;
      pitch += (wantPitch - pitch) * k;
      const gain = reduced ? 0.3 : 1;
      return { roll: roll * gain, pitch: pitch * gain };
    }
  };
}
