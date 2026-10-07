/**
 * §7.6 Juice facade — one `fire(event)` maps a game event to synchronized fx,
 * sound, shake, punch, hit-stop, flash/vignette and rumble through each owning
 * contract (C-22 camera layers, C-23 session time, C-05 output overlay,
 * §6.7 fx layer, Haptics). It never reports feedback it could not observe:
 * after a shake/punch trigger, `app.camera.evidence().layers` is read and
 * `shake: "applied" | "not-applied"` is recorded in the juice section.
 */
import type { EaseName } from "../util/ease.js";
import type { TweenEngine, TweenHandle, TweenableNode, TweenOptions } from "./tween.js";

export type Vec3Like = readonly [number, number, number] | { readonly x: number; readonly y: number; readonly z: number };

export type GameFxKind =
  | "spark" | "dust" | "debris" | "ring" | "streak"
  | "pickup" | "explosion-small" | "muzzle" | "splash" | "bubble";

export interface GameFxLayerLike {
  burst(kind: GameFxKind, position: Vec3Like, options?: { count?: number; speed?: number; color?: string; normal?: Vec3Like; seed?: number }): void;
  readonly liveCount: number;
  readonly backend: string;
}

export interface JuicePreset<TCue extends string = string> {
  readonly fx?: { readonly kind: GameFxKind; readonly count?: number; readonly color?: string; readonly speed?: number };
  readonly cue?: TCue;
  readonly shake?: number;
  readonly punch?: { readonly fovDeg?: number; readonly dolly?: number; readonly ms?: number };
  readonly hitStop?: number;
  readonly flash?: { readonly color: string; readonly peak?: number; readonly ms?: number };
  readonly vignette?: { readonly amount: number; readonly ms?: number; readonly color?: string };
  readonly rumble?: { readonly ms: number; readonly strong?: number; readonly weak?: number };
}

export type JuiceEventMap<TEvent extends string, TCue extends string> = Readonly<Record<TEvent, JuicePreset<TCue>>>;

export interface JuiceCameraLayerEvidence {
  readonly id: string;
  readonly energy: number;
}

export interface JuiceCamera {
  readonly shake: { add(amount: number): void };
  readonly punch: { trigger(o: { fov?: number; dolly?: number; attack?: number; hold?: number; release?: number }): void };
  evidence(): { readonly layers: readonly JuiceCameraLayerEvidence[] };
}

export interface JuiceSession {
  readonly reducedMotion: boolean;
  readonly reducedFlash: boolean;
  hitStop(seconds: number, options?: { actors?: readonly string[] }): void;
  slowMo(scale: number, ms: number, options?: { ease?: EaseName | string }): void;
}

/** §7.8 overlay driver (juice/overlay.ts) — keeps backend + amounts. */
export interface JuiceOverlayDriver {
  flash(color: string, peak: number, ms: number): void;
  vignette(amount: number, ms: number, color?: string): void;
  fade(to01: number, ms: number, color?: string): Promise<void>;
  readonly backend: "dom" | "shader" | "none";
}

export interface JuiceRumble {
  (options: { ms: number; strong?: number; weak?: number }): { readonly via: string } | void;
}

export interface JuiceDeps<TEvent extends string = string, TCue extends string = string> {
  readonly events: JuiceEventMap<TEvent, TCue>;
  readonly camera: JuiceCamera;
  readonly session: JuiceSession;
  readonly fx: GameFxLayerLike;
  readonly overlay: JuiceOverlayDriver;
  readonly tweens: TweenEngine;
  readonly sound?: { cue(cue: TCue): void };
  readonly rumble?: JuiceRumble;
  /** Injectable clock for tests (seconds). */
  readonly now?: () => number;
}

export interface JuiceSnapshotEvent {
  readonly fired: number;
  readonly lastStrength?: number;
}

export interface JuiceSnapshot {
  readonly backend: "dom" | "shader" | "none";
  readonly shake: "applied" | "not-applied" | "none";
  readonly rumbleVia: string;
  readonly events: Readonly<Partial<Record<string, JuiceSnapshotEvent>>>;
  readonly droppedFlashes: number;
}

export interface Juice<TEvent extends string = string> {
  fire(event: TEvent, at?: { position?: Vec3Like; strength?: number; actors?: readonly string[] }): void;
  shake(trauma: number): void;
  punch(options: { fovDeg?: number; dolly?: number; ms?: number }): void;
  hitStop(seconds: number, options?: { actors?: readonly string[] }): void;
  slowMo(scale: number, ms: number): void;
  flash(color: string, options?: { peak?: number; ms?: number }): void;
  vignettePulse(options: { amount: number; ms?: number; color?: string }): void;
  fade(to01: number, options?: { ms?: number; color?: string }): Promise<void>;
  rumble(options: { ms: number; strong?: number; weak?: number }): void;
  squash(node: TweenableNode, options?: { amount?: number; ms?: number; axis?: "x" | "y" | "z" }): TweenHandle;
  tween<T extends object>(target: T | TweenableNode, to: Partial<Record<string, number | readonly number[]>>, options: TweenOptions): TweenHandle;
  snapshot(): JuiceSnapshot;
}

const SHAKE_REDUCED = 0.25;
const PUNCH_REDUCED = 0.5;
const REDUCED_FLASH_PEAK = 0.15;
const REDUCED_FLASH_MAX_PER_SECOND = 3;

export function createJuice<TEvent extends string = string, TCue extends string = string>(
  deps: JuiceDeps<TEvent, TCue>
): Juice<TEvent> {
  const now = deps.now ?? (() => Date.now() / 1000);
  const fired = new Map<string, JuiceSnapshotEvent>();
  let shakeState: "applied" | "not-applied" | "none" = "none";
  let rumbleVia = "none";
  let droppedFlashes = 0;
  const flashTimes: number[] = [];

  /** True when the camera actually carried the layer (energy > 0). */
  function observeCamera(): "applied" | "not-applied" {
    return deps.camera.evidence().layers.some((l) => l.energy > 0) ? "applied" : "not-applied";
  }

  const juice: Juice<TEvent> = {
    fire(event, at) {
      const preset = deps.events[event];
      if (!preset) {
        console.warn(`[game/juice] undefined juice event "${String(event)}"`);
        return;
      }
      const strength = at?.strength ?? 1;
      fired.set(event, { fired: (fired.get(event)?.fired ?? 0) + 1, lastStrength: strength });
      if (preset.fx) {
        deps.fx.burst(preset.fx.kind, at?.position ?? [0, 0, 0], {
          count: Math.round((preset.fx.count ?? 12) * strength),
          color: preset.fx.color,
          speed: preset.fx.speed
        });
      }
      if (preset.cue !== undefined) deps.sound?.cue(preset.cue);
      if (preset.shake !== undefined && preset.shake > 0) juice.shake(preset.shake * strength);
      if (preset.punch) juice.punch({
        fovDeg: preset.punch.fovDeg !== undefined ? preset.punch.fovDeg * strength : undefined,
        dolly: preset.punch.dolly !== undefined ? preset.punch.dolly * strength : undefined,
        ms: preset.punch.ms
      });
      if (preset.hitStop !== undefined && preset.hitStop > 0) juice.hitStop(preset.hitStop, { actors: at?.actors });
      if (preset.flash) juice.flash(preset.flash.color, { peak: preset.flash.peak, ms: preset.flash.ms });
      if (preset.vignette) juice.vignettePulse(preset.vignette);
      if (preset.rumble) juice.rumble(preset.rumble);
    },

    shake(trauma) {
      const t = deps.session.reducedMotion ? trauma * SHAKE_REDUCED : trauma;
      if (t <= 0) return;
      deps.camera.shake.add(t);
      shakeState = observeCamera();
    },

    punch(options) {
      const k = deps.session.reducedMotion ? PUNCH_REDUCED : 1;
      deps.camera.punch.trigger({
        fov: options.fovDeg !== undefined ? options.fovDeg * k : undefined,
        dolly: options.dolly !== undefined ? options.dolly * k : undefined,
        release: options.ms
      });
      shakeState = observeCamera();
    },

    hitStop(seconds, options) {
      // Timing, not motion — no reduced-motion scaling (§6.6).
      deps.session.hitStop(seconds, { actors: options?.actors });
    },

    slowMo(scale, ms) {
      deps.session.slowMo(scale, ms);
    },

    flash(color, options) {
      const peak = options?.peak ?? 0.5;
      const ms = options?.ms ?? 120;
      if (deps.session.reducedFlash) {
        // WCAG 2.3.1: cap peak at 0.15 and ≤3 flashes/s; an edge vignette
        // stands in for a full-screen flash.
        const t = now();
        while (flashTimes.length && t - flashTimes[0] > 1) flashTimes.shift();
        if (flashTimes.length >= REDUCED_FLASH_MAX_PER_SECOND) {
          droppedFlashes++;
          return;
        }
        flashTimes.push(t);
        deps.overlay.vignette(Math.min(peak, REDUCED_FLASH_PEAK), ms, color);
        return;
      }
      deps.overlay.flash(color, peak, ms);
    },

    vignettePulse(options) {
      deps.overlay.vignette(options.amount, options.ms ?? 180, options.color);
    },

    fade(to01, options) {
      return deps.overlay.fade(to01, options?.ms ?? 200, options?.color);
    },

    rumble(options) {
      const r = deps.rumble?.(options);
      if (r) rumbleVia = r.via;
    },

    squash(node, options) {
      const amount = options?.amount ?? 0.2;
      const ms = options?.ms ?? 140;
      const axis = options?.axis ?? "y";
      const base = Array.isArray(node.scale) ? node.scale : [node.scale, node.scale, node.scale];
      const squashed = [...base];
      const idx = axis === "x" ? 0 : axis === "y" ? 1 : 2;
      squashed[idx] = base[idx] * (1 - amount);
      const first = deps.tweens.tween(node, { scale: squashed as readonly number[] }, { duration: ms / 2000, ease: "quadOut" });
      void first.done.then(() => {
        deps.tweens.tween(node, { scale: base as readonly number[] }, { duration: ms / 2000, ease: "backOut" });
      });
      return first;
    },

    tween(target, to, options) {
      return deps.tweens.tween(target, to, options);
    },

    snapshot() {
      return {
        backend: deps.overlay.backend,
        shake: shakeState,
        rumbleVia,
        events: Object.fromEntries(fired) as Partial<Record<string, JuiceSnapshotEvent>>,
        droppedFlashes
      };
    }
  };
  return juice;
}
