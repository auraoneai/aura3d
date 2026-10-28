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
import { mediaMatches } from "../platform.js";
import type { AuraScreenFeelUniforms } from "../../contracts/time.js";
import { SCREEN_FEEL_BLACKBOARD_KEY } from "../../contracts/time.js";
import type { FrameContributor, RenderItem } from "@aura3d/rendering/contracts";
import { registerFrameContributor } from "@aura3d/rendering/contracts";
import type { AuraFeelBusImpl } from "./FeelBus.js";
import { createFeelBus } from "./FeelBus.js";
import { createScreenOverlay, type AuraScreenOverlay } from "./ScreenOverlay.js";
import { probeHaptics, playHaptic } from "@aura3d/input";
import { bindFeelLintProbe } from "./lint/evidenceOnlyFeel.js";

type ScreenFeelCollector = (ctx: Parameters<NonNullable<FrameContributor["collect"]>>[1]) => void;
const screenFeelCollectors = new Set<ScreenFeelCollector>();
let unregisterScreenFeel: (() => void) | null = null;
const screenFeelContributor: FrameContributor = {
  id: "prd08.screenFeel",
  owner: "prd08",
  flag: "A3D_QR_CAMERA",
  phases: ["collect"],
  collect(items: RenderItem[], ctx) {
    if (!ctx.flags.on("A3D_QR_CAMERA")) return items;
    for (const collect of screenFeelCollectors) collect(ctx);
    return items;
  }
};
/** Add one bus's per-frame publisher; the shared contributor lives while any bus does. */
function addScreenFeelCollector(collect: ScreenFeelCollector): () => void {
  screenFeelCollectors.add(collect);
  unregisterScreenFeel ??= registerFrameContributor(screenFeelContributor);
  return () => {
    if (!screenFeelCollectors.delete(collect) || screenFeelCollectors.size > 0) return;
    unregisterScreenFeel?.();
    unregisterScreenFeel = null;
  };
}

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
  /** I-6: `false` disables the haptics channel provider entirely. */
  readonly haptics?: boolean;
}

export function createAuraFeelBus(app: AuraApp, options: AuraFeelExtensionOptions = {}): AuraFeelBusImpl {
  // `app.camera` is resolved at dispatch time, not here: the C-38 extension
  // loop mounts `prd08.feel` BEFORE `prd08.camera` (registration order in
  // lanes/prd08.ts), so a reference captured at creation is `undefined` and
  // shake/punch silently never reached the camera (S5/S10).
  const liveCamera = () => app.camera as unknown as CameraLike | undefined;
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
    // Getters: FeelBus reads `deps.camera.shake/punch` on every emit, so the
    // providers track the live controller (and stay absent while none is
    // mounted — those channels then count 0, never a phantom execute).
    camera: {
      get shake() {
        const camera = liveCamera();
        return camera?.shake ? (a: number) => camera.shake!.add(a) : undefined;
      },
      get punch() {
        const camera = liveCamera();
        return camera?.punch ? (o: { fov?: number; dolly?: number }) => camera.punch!.trigger(o) : undefined;
      }
    },
    time: time?.hitStop ? { hitStop: (s, o) => time.hitStop!(s, o) } : undefined,
    haptics:
      options.haptics !== false && (hapticCapability.vibrate || hapticCapability.gamepadRumble)
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
          return mediaMatches("(prefers-reduced-motion: reduce)");
        } catch {
          return false;
        }
      }),
    presentedViewProjection: () => liveCamera()?.evidence?.().viewProjection
  });

  /*
   * §17 tier gating: the published uniforms are the live C-27 tier's view —
   * on Low only flash + vignette (chroma/radial blur zeroed), so a C-13
   * consumer never pays for the heavier parts there. Re-read every frame so
   * `app.quality.set` applies on the next publish.
   */
  const tierUniforms = () => bus.screenUniformsForTier(screenFeelTier((app as { quality?: { tier?: unknown } }).quality?.tier));
  /** Latest published uniforms — read by the `prd08.screenFeel` contributor. */
  const latest = { uniforms: tierUniforms() };
  /*
   * 08-LOOP: subscribe `advance` only while the bus has pending energy — a
   * permanently-registered onFrame callback keeps `requiresFrames()` true and
   * re-arms rAF forever even in static scenes. `emit()` re-arms the tick;
   * once `isIdle()` reports all screen parts at rest with no pending verdicts
   * the callback unregisters.
   */
  const onFrame = (app as unknown as OnFrameApp).onFrame;
  let unframe: (() => void) | undefined;
  const arm = () => {
    if (!unframe && typeof onFrame === "function") {
      unframe = onFrame.call(app, ({ dt }) => {
        bus.advance(Math.max(0, dt));
        const u = tierUniforms();
        latest.uniforms = u;
        overlay?.apply(u);
        if (bus.isIdle()) {
          unframe?.();
          unframe = undefined;
        }
      });
    }
  };

  // S-3: publish `AuraScreenFeelUniforms` every collected frame on the C-01
  // blackboard under `prd08.screenFeel`; a C-13 consumer reports consumption
  // by setting `prd08.screenFeel.consumed` (facts F-08-5 for PRD 03).
  // The registry rejects duplicate ids, so every live bus shares one
  // refcounted contributor (two flag-on apps used to throw
  // REGISTRY_DUPLICATE:prd08.screenFeel from the second createAuraApp).
  const disposeContributor = addScreenFeelCollector((ctx) => {
    ctx.blackboard.set(SCREEN_FEEL_BLACKBOARD_KEY, latest.uniforms);
    blackboardConsumed.current = ctx.blackboard.get("prd08.screenFeel.consumed") === true;
    lintFrames += 1;
  });

  // F-7b: feed the runtime `look/evidence-only-feel` rule this bus's counters.
  let lintFrames = 0;
  bindFeelLintProbe(() => {
    const e = bus.evidence() as { emitted: number | readonly unknown[]; executed: Record<string, number> };
    return {
      emitted: typeof e.emitted === "number" ? e.emitted : e.emitted.length,
      executed: e.executed,
      frames: lintFrames
    };
  });

  const impl = bus as AuraFeelBusImpl & {
    readonly latestScreenUniforms: () => AuraScreenFeelUniforms;
    readonly markScreenConsumed: () => void;
    dispose(): void;
  };
  const rawEmit = impl.emit.bind(impl);
  impl.emit = (event, at) => { arm(); return rawEmit(event, at); };
  Object.defineProperty(impl, "latestScreenUniforms", { value: () => latest.uniforms });
  Object.defineProperty(impl, "markScreenConsumed", { value: () => { blackboardConsumed.current = true; } });
  Object.defineProperty(impl, "dispose", {
    value: () => {
      unframe?.();
      disposeContributor();
      overlay?.dispose();
      bindFeelLintProbe(() => undefined);
    }
  });
  return impl;
}

/** C-27 tier name for the screen-feel publish; unknown (no controller) → high. */
export function screenFeelTier(tier: unknown): "low" | "medium" | "high" | "ultra" {
  return tier === "low" || tier === "medium" || tier === "high" || tier === "ultra" ? tier : "high";
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
