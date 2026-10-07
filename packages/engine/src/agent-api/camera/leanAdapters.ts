/**
 * X-3 lane side of request Q-15-4: `packages/lean/src/game.ts` `createLeanCameraRig`
 * and `createLeanGameFeel` delegate here so the lean bundle shares lane-08 math
 * (Spring damp + deterministic shake) instead of keeping a private copy.
 *
 * Behaviour is byte-for-byte the lean contract:
 * - `follow`: `alpha = 1 - exp(-smoothing·dt)` per axis ⇒ `springDampVec3` with
 *   `halflife = ln2 / smoothing` (identical curve, no re-tune).
 * - game feel: trauma decay `trauma - decay·dt` (floor 0), shake =
 *   `trauma²·maxShake` times the seeded hash phase (no `Math.random`),
 *   `hitStop` freezes output for `hitStopDuration` seconds.
 */
import { springDampVec3 } from "./Spring.js";

export interface LeanCameraRigAdapterOptions {
  readonly kind?: "side-view-follow" | "top-down-follow";
  readonly offset?: readonly [number, number, number];
  /** Follow rate per second (default 6) — the lean `smoothing` knob. */
  readonly smoothing?: number;
}

export interface LeanCameraRigAdapter {
  readonly kind: "side-view-follow" | "top-down-follow";
  readonly position: readonly [number, number, number];
  follow(focus: readonly [number, number, number], dtSeconds: number): readonly [number, number, number];
  snap(focus: readonly [number, number, number]): readonly [number, number, number];
}

export function createLeanCameraRigAdapter(options: LeanCameraRigAdapterOptions = {}): LeanCameraRigAdapter {
  const kind = options.kind ?? "side-view-follow";
  const offset = options.offset ?? (kind === "top-down-follow" ? [0, 9, 0.001] : [0, 1.6, 6.4]);
  const rate = Math.max(0.1, options.smoothing ?? 6);
  const halflife = Math.LN2 / rate; // 1-exp(-rate·dt) ≡ springDamp(ln2/rate)
  let position: readonly [number, number, number] = [offset[0], offset[1], offset[2]];
  const target = (focus: readonly [number, number, number]): readonly [number, number, number] => [
    focus[0] + offset[0],
    focus[1] + offset[1],
    focus[2] + offset[2]
  ];
  return {
    kind,
    get position() {
      return position;
    },
    follow(focus, dtSeconds) {
      position = springDampVec3(position, target(focus), halflife, Math.max(0, dtSeconds));
      return position;
    },
    snap(focus) {
      position = target(focus);
      return position;
    }
  };
}

export interface LeanGameFeelAdapterOptions {
  readonly traumaDecay?: number;
  readonly maxShake?: number;
  readonly hitStopDuration?: number;
}

export interface LeanGameFeelAdapter {
  addTrauma(amount: number): number;
  hitStop(): void;
  update(dtSeconds: number): { readonly trauma: number; readonly shake: readonly [number, number]; readonly frozen: boolean };
  snapshot(): { readonly trauma: number; readonly frozen: boolean };
}

export function createLeanGameFeelAdapter(options: LeanGameFeelAdapterOptions = {}): LeanGameFeelAdapter {
  const traumaDecay = Math.max(0.1, options.traumaDecay ?? 1.6);
  const maxShake = Math.max(0, options.maxShake ?? 0.25);
  const hitStopDuration = Math.max(0, options.hitStopDuration ?? 0.06);
  let trauma = 0;
  let frozenTime = 0;
  // Deterministic pseudo-random shake (seeded counter, not Math.random) — kept
  // byte-identical with the lean contract so replays stay exact.
  let shakeTick = 0;
  const shakePhase = (): readonly [number, number] => {
    shakeTick += 1;
    const a = Math.sin(shakeTick * 12.9898) * 43758.5453;
    const b = Math.sin(shakeTick * 78.233) * 12543.1234;
    return [a - Math.floor(a) - 0.5, b - Math.floor(b) - 0.5];
  };
  return {
    addTrauma(amount) {
      trauma = Math.min(1, Math.max(0, trauma + Math.max(0, amount)));
      return trauma;
    },
    hitStop() {
      frozenTime = hitStopDuration;
    },
    update(dtSeconds) {
      const dt = Math.max(0, dtSeconds);
      if (frozenTime > 0) {
        frozenTime = Math.max(0, frozenTime - dt);
        return { trauma, shake: [0, 0] as const, frozen: frozenTime > 0 };
      }
      trauma = Math.max(0, trauma - traumaDecay * dt);
      const magnitude = trauma * trauma * maxShake;
      const [px, py] = shakePhase();
      return { trauma, shake: [px * 2 * magnitude, py * 2 * magnitude] as const, frozen: false };
    },
    snapshot() {
      return { trauma, frozen: frozenTime > 0 };
    }
  };
}
