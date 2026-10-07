/**
 * `feel/extension.ts` — the real `app.feel` extension (C-23/C-38, S-3).
 *
 * Wires the FeelBus channels to the app's own contracts: shake/punch →
 * `app.camera` layers, hitStop → `app.time`, haptics → `@aura3d/input`
 * (`navigator.vibrate` / gamepad `vibrationActuator`, capability-probed),
 * audio → C-25 `GameSound` when an engine is bound, vfx → `app.effects`
 * (C-20), screen → the `prd08.screenFeel` blackboard key every presented
 * frame plus the opt-in DOM overlay (`feel.screenFallback: "dom"`).
 *
 * The `advance` tick is driven from `app.onFrame` — the same hook the camera
 * extension uses — so the impulse decays once per presented frame.
 */
import type { AuraApp } from "../index.js";
import type { AuraScreenFeelUniforms } from "../../contracts/time.js";
import { SCREEN_FEEL_BLACKBOARD_KEY } from "../../contracts/time.js";
import type { FrameContributor, RenderItem } from "@aura3d/rendering/contracts";
import { registerFrameContributor } from "@aura3d/rendering/contracts";
import type { AuraFeelBusImpl } from "./FeelBus.js";
import { createFeelBus } from "./FeelBus.js";
import { createScreenOverlay, type AuraScreenOverlay } from "./ScreenOverlay.js";
import { probeHaptics, playHaptic } from "@aura3d/input";

interface FrameInfo { readonly dt: number; }
type OnFrameApp = { onFrame?(cb: (f: FrameInfo) => void): () => void };

interface CameraLike {
  shake?: { add(amount: number): void };
  punch?: { trigger(o: { fov?: number; dolly?: number }): void };
  evidence?: () => { viewProjection?: readonly number[] };
}
interface TimeLike { hitStop?(s: number, o?: { scope?: "global" | readonly string[] }): void }
interface EffectsLike { spawn?(kind: string, at: unknown, o?: unknown): unknown }
interface SoundLike {
  play?(cue: string, o?: { position?: readonly [number, number, number]; rate?: number; volumeDb?: number }): unknown;
  proof?(): { contextState: string };
}

export interface AuraFeelExtensionOptions {
  /** DOM overlay for flash/vignette when no C-13 consumer exists (§8.3). */
  readonly screenFallback?: "dom";
  /** C-25 game sound engine, if bound (audio channel provider). */
  readonly sound?: SoundLike;
  /** Reduced-motion source; default `prefers-reduced-motion` media query. */
  readonly reducedMotion?: () => boolean;
}

export function createAuraFeelBus(app: AuraApp, options: AuraFeelExtensionOptions = {}): AuraFeelBusImpl {
  const camera = app.camera as unknown as CameraLike | undefined;
  const time = app.time as unknown as TimeLike | undefined;
  const effects = app.effects as unknown as EffectsLike | undefined;
  const overlay: AuraScreenOverlay | null = options.screenFallback === "dom" ? createScreenOverlay() : null;
  const blackboardConsumed = { current: false };

  const hapticCapability = (() => {
    try {
      const nav = typeof navigator !== "undefined" ? navigator : undefined;
      const pads = typeof nav?.getGamepads === "function" ? nav.getGamepads() : [];
      return probeHaptics({
        navigatorLike: nav as { vibrate?: (p: number | readonly number[]) => boolean } | undefined,
        actuators: (pads ?? []).map((p) => (p as { vibrationActuator?: { playEffect?: (t: string, o: Record<string, number>) => Promise<string> } } | null)?.vibrationActuator ?? null)
      });
    } catch {
      return probeHaptics({ navigatorLike: {}, actuators: [] });
    }
  })();

  const bus = createFeelBus({
    camera: camera
      ? {
          shake: camera.shake ? (a) => camera.shake!.add(a) : undefined,
          punch: camera.punch ? (o) => camera.punch!.trigger(o) : undefined
        }
      : undefined,
    time: time?.hitStop ? { hitStop: (s, o) => time.hitStop!(s, o) } : undefined,
    haptics:
      hapticCapability.vibrate || hapticCapability.gamepadRumble
        ? (o) => {
            const nav = typeof navigator !== "undefined" ? (navigator as { vibrate?: (p: number | readonly number[]) => boolean }) : undefined;
            const pads = typeof nav !== "undefined" && typeof (navigator as { getGamepads?: () => unknown[] }).getGamepads === "function"
              ? (navigator as { getGamepads: () => unknown[] }).getGamepads()
              : [];
            const actuator = (pads ?? [])
              .map((p) => (p as { vibrationActuator?: { playEffect?: (t: string, o: Record<string, number>) => Promise<string> } } | null)?.vibrationActuator ?? null)
              .find((a) => a != null) ?? null;
            const intensity = Math.max(o.strong ?? 0, o.weak ?? 0);
            void playHaptic(
              { intensity: intensity || 1, durationMs: o.ms ?? 60 },
              hapticCapability,
              { navigatorLike: nav, actuator }
            );
            return true;
          }
        : undefined,
    audio: options.sound?.play
      ? (cue, o) => {
          const sound = options.sound!;
          const jitter = o.pitchJitter !== undefined ? 1 + (hashString(cue) % 2 === 0 ? 1 : -1) * o.pitchJitter * strengthish(o.strength) : undefined;
          const handle = sound.play!(cue, {
            position: o.position ? [o.position[0], o.position[1], o.position[2]] : undefined,
            rate: jitter,
            volumeDb: o.gainJitter !== undefined ? (hashString(cue + "g") % 2 === 0 ? 1 : -1) * o.gainJitter * strengthish(o.strength) : undefined
          });
          // Stub engine: contextState "none" means no real voice — counts 0.
          const state = sound.proof?.().contextState;
          return handle != null && state !== "none";
        }
      : undefined,
    vfx: effects?.spawn
      ? (kind, o) => {
          try {
            const at = o.position ?? [0, 0, 0];
            return effects.spawn!(kind, at as never, { count: o.count } as never) != null;
          } catch {
            return false;
          }
        }
      : undefined,
    screen: {
      apply: overlay ? (u) => overlay.apply(u) : undefined,
      consumed: () => blackboardConsumed.current
    },
    reducedMotion:
      options.reducedMotion ??
      (() => {
        try {
          return typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
        } catch {
          return false;
        }
      }),
    presentedViewProjection: () => camera?.evidence?.().viewProjection
  });

  /** Latest published uniforms — read by the `prd08.screenFeel` contributor. */
  const latest = { uniforms: bus.screenUniforms() };
  const unframe = (app as unknown as OnFrameApp).onFrame?.(({ dt }) => {
    bus.advance(Math.max(0, dt));
    const u = bus.screenUniforms();
    latest.uniforms = u;
    overlay?.apply(u);
  });

  // S-3: publish `AuraScreenFeelUniforms` every collected frame on the C-01
  // blackboard under `prd08.screenFeel`; a C-13 consumer reports consumption
  // by setting `prd08.screenFeel.consumed` (facts F-08-5 for PRD 03).
  const screenFeelContributor: FrameContributor = {
    id: "prd08.screenFeel",
    owner: "prd08",
    flag: "A3D_QR_CAMERA",
    phases: ["collect"],
    collect(items: RenderItem[], ctx) {
      if (!ctx.flags.on("A3D_QR_CAMERA")) return items;
      ctx.blackboard.set(SCREEN_FEEL_BLACKBOARD_KEY, latest.uniforms);
      blackboardConsumed.current = ctx.blackboard.get("prd08.screenFeel.consumed") === true;
      return items;
    }
  };
  const disposeContributor = registerFrameContributor(screenFeelContributor);

  const impl = bus as AuraFeelBusImpl & {
    readonly latestScreenUniforms: () => AuraScreenFeelUniforms;
    readonly markScreenConsumed: () => void;
    dispose(): void;
  };
  Object.defineProperty(impl, "latestScreenUniforms", { value: () => latest.uniforms });
  Object.defineProperty(impl, "markScreenConsumed", { value: () => { blackboardConsumed.current = true; } });
  Object.defineProperty(impl, "dispose", {
    value: () => {
      unframe?.();
      disposeContributor();
      overlay?.dispose();
    }
  });
  return impl;
}

/** Deterministic tiny hash — no `Math.random()` anywhere in lane code. */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = (h ^ s.charCodeAt(i)) * 16777619;
  return Math.abs(h | 0);
}
function strengthish(v: number | undefined): number {
  return v === undefined || !Number.isFinite(v) ? 1 : Math.min(1, Math.max(0, v));
}

export const SCREEN_FEEL_KEY = SCREEN_FEEL_BLACKBOARD_KEY;
