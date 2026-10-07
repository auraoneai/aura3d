/**
 * `feel/FeelBus.ts` — the real C-23 `AuraFeelBus` (PRD-08 §6.8, S-3).
 *
 * `app.feel.define("hit-heavy", {...})` declares what happens on a game event;
 * `emit` fans it out through every owning contract:
 *
 *   shake/punch → C-22 camera layers        hitStop → `app.time` (this lane)
 *   haptics     → `@aura3d/input` Haptics    audio   → C-25 `GameSound.play`
 *   vfx         → C-20 `app.effects`         screen  → `prd08.screenFeel`
 *
 * Evidence records which channels **executed** — a provider that is still a
 * stub and produced nothing (no haptic sink, no pixels drawn) counts 0.
 *
 * The screen channel arms a per-emit impulse (`flash/chroma/radialBlur/
 * vignette` + NDC `center` through the presented VP); `advance(dt)` decays the
 * impulse (halflife 0.2 s) and the publisher in `feel/extension.ts` writes the
 * uniforms onto the blackboard key `prd08.screenFeel` every frame and/or into
 * the `feel/ScreenOverlay` DOM fallback. Executed accounting per S-3: an emit's
 * screen channel counts when any of its armed parts produced pixels — the DOM
 * overlay draws flash+vignette; chroma/radial blur count only when a C-13
 * consumer set `prd08.screenFeel.consumed` on the blackboard.
 *
 * Reduced-motion/flash policies are applied centrally here: under
 * `reducedMotion()` shake and punch scale down and flash/chroma/radialBlur are
 * suppressed (vignette kept at half).
 */
import type { AuraFeelBus, AuraFeelEventSpec, AuraScreenFeelUniforms } from "../../contracts/time.js";
import type { AuraVec3 } from "../index.js";
import type { AuraFeelPresetName } from "./presets.js";
import { FEEL_PRESETS } from "./presets.js";

export type FeelChannel = "shake" | "punch" | "hitStop" | "haptics" | "audio" | "vfx" | "screen";
export type FeelScreenPart = "flash" | "chroma" | "radialBlur" | "vignette";

export interface AuraFeelBusDeps {
  /** C-22 layer writers; absent → those channels count 0 (stub app). */
  readonly camera?: {
    readonly shake?: (amount: number) => void;
    readonly punch?: (o: { readonly fov?: number; readonly dolly?: number }) => void;
  };
  /** `app.time` — hitStop forwards seconds; `actors` scope resolves ids. */
  readonly time?: {
    hitStop(seconds: number, o?: { scope?: "global" | readonly string[] }): void;
  };
  /** Haptics sink; returns true when a capable actuator/vibrator exists. */
  readonly haptics?: (o: { readonly strong?: number; readonly weak?: number; readonly ms?: number }) => boolean;
  /** C-25 `GameSound.play`; returns true when a voice actually started. */
  readonly audio?: (cue: string, o: {
    readonly pitchJitter?: number;
    readonly gainJitter?: number;
    readonly positional?: boolean;
    readonly position?: AuraVec3;
    readonly strength: number;
  }) => boolean;
  /** C-20 `app.effects`; returns true when an effect instance was created. */
  readonly vfx?: (kind: string, o: { readonly count?: number; readonly position?: AuraVec3 }) => boolean;
  /**
   * Screen fallback pixels ("dom" ScreenOverlay apply). With no overlay and no
   * C-13 consumer the screen channel counts 0. `consumed()` reports whether a
   * C-13 pass read `prd08.screenFeel` last frame.
   */
  readonly screen?: {
    readonly apply?: (u: AuraScreenFeelUniforms) => boolean;
    readonly consumed?: () => boolean;
  };
  /** Central reduced-motion policy (§6.8). */
  readonly reducedMotion?: () => boolean;
  /** Presented view-projection for projecting event position → NDC center. */
  readonly presentedViewProjection?: () => readonly number[] | undefined;
}

export interface AuraFeelBusImpl extends AuraFeelBus {
  /** Decay the screen impulse; call once per presented frame (real dt). */
  advance(dt: number): void;
  /** Current screen-feel uniforms for the blackboard/overlay publisher. */
  screenUniforms(): AuraScreenFeelUniforms;
  /** Low-tier publish: flash + vignette only (C-27). */
  screenUniformsForTier(tier: "low" | "medium" | "high" | "ultra"): AuraScreenFeelUniforms;
}

const SCREEN_HALFLIFE = 0.2;

function projectNdc(vp: readonly number[], p: AuraVec3): readonly [number, number] {
  const x = vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12];
  const y = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13];
  const w = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
  if (!Number.isFinite(w) || Math.abs(w) < 1e-9) return [0, 0];
  return [x / w, y / w];
}

function decay(current: number, dt: number): number {
  if (current <= 0) return 0;
  const next = current * Math.pow(0.5, dt / SCREEN_HALFLIFE);
  return next < 0.004 ? 0 : next;
}

export function createFeelBus(deps: AuraFeelBusDeps = {}): AuraFeelBusImpl {
  const specs = new Map<string, AuraFeelEventSpec>();
  let emitted = 0;
  const executed: Record<string, number> = {};
  const screen = { flash: 0, chroma: 0, radialBlur: 0, vignette: 0, center: [0, 0] as [number, number] };
  /** Armed (emitted) screen parts awaiting a pixel verdict, with their values. */
  const pendingParts = new Map<FeelScreenPart, number>();
  let lastConsumed = false;

  const reduced = (): boolean => deps.reducedMotion?.() === true;
  const bump = (channel: FeelChannel): void => {
    executed[channel] = (executed[channel] ?? 0) + 1;
  };

  return {
    define(event, spec) {
      specs.set(event, spec);
    },

    emit(event, at) {
      const spec = specs.get(event);
      if (!spec) return;
      emitted += 1;
      const strength = Math.max(0, at?.strength ?? 1);
      const position = at?.position;

      if (spec.shake !== undefined && deps.camera?.shake) {
        deps.camera.shake(spec.shake * (reduced() ? 0.3 : 1) * strength);
        bump("shake");
      }
      if (spec.punch && deps.camera?.punch) {
        const k = (reduced() ? 0.5 : 1) * strength;
        deps.camera.punch({ fov: (spec.punch.fov ?? 0) * k, dolly: (spec.punch.dolly ?? 0) * k });
        bump("punch");
      }
      if (spec.hitStop && deps.time) {
        deps.time.hitStop(spec.hitStop.seconds, {
          scope: spec.hitStop.scope === "actors" ? (at?.actors ?? []) : "global"
        });
        bump("hitStop");
      }
      if (spec.haptics && deps.haptics) {
        if (deps.haptics(spec.haptics)) bump("haptics");
      }
      if (spec.audio && deps.audio) {
        if (deps.audio(spec.audio.cue, { ...spec.audio, position, strength })) bump("audio");
      }
      if (spec.vfx && deps.vfx) {
        if (deps.vfx(spec.vfx.kind, { count: spec.vfx.count, position })) bump("vfx");
      }
      if (spec.screen) {
        const s = spec.screen;
        const vp = deps.presentedViewProjection?.();
        if (position && vp) {
          const ndc = projectNdc(vp, position);
          screen.center = [ndc[0], ndc[1]];
        }
        const rm = reduced();
        for (const part of ["flash", "chroma", "radialBlur", "vignette"] as const) {
          const v = s[part];
          if (v === undefined) continue;
          if (rm && part !== "vignette") continue;                 // flash policy: suppressed
          const armed = Math.min(1, v * strength * (rm ? 0.5 : 1));
          screen[part] = Math.min(1, screen[part] + armed);
          pendingParts.set(part, armed);
        }
      }
    },

    preset(name: AuraFeelPresetName) {
      const table = FEEL_PRESETS[name];
      for (const [event, spec] of Object.entries(table)) specs.set(event, spec);
    },

    evidence() {
      return { emitted, executed: { ...executed } };
    },

    advance(dt) {
      screen.flash = decay(screen.flash, dt);
      screen.chroma = decay(screen.chroma, dt);
      screen.radialBlur = decay(screen.radialBlur, dt);
      screen.vignette = decay(screen.vignette, dt);
      // Pixel verdict for armed parts (S-3): DOM overlay draws flash/vignette;
      // any part counts when a C-13 consumer flagged the blackboard key.
      lastConsumed = deps.screen?.consumed?.() === true;
      if (pendingParts.size > 0) {
        let any = false;
        for (const [part] of pendingParts) {
          const drawn =
            (deps.screen?.apply && (part === "flash" || part === "vignette")) ||
            lastConsumed;
          if (drawn) any = true;
          pendingParts.delete(part);
        }
        if (any) bump("screen");
      }
    },

    screenUniforms() {
      return { flash: screen.flash, chroma: screen.chroma, radialBlur: screen.radialBlur, vignette: screen.vignette, center: screen.center };
    },

    screenUniformsForTier(tier) {
      const u = this.screenUniforms();
      if (tier === "low") return { ...u, chroma: 0, radialBlur: 0 };
      return u;
    }
  };
}
