/**
 * GU47 WP-27 SSR-01/02/04/05/06/08: applies the resolved stage look to the running app each frame: the sky and road
 * uniforms, the sun and the camera-side fill (`setLight`, E-B), hemisphere and environment intensity, and the post chain
 * (`app.post.setEffect`, E-C: bloom, colour grade, god rays) plus output exposure. Engine writes happen only when a value
 * moved past a small threshold, so a steady stage costs a handful of uniform writes per frame.
 *
 * `?look=original` never calls this: the specs' default uniforms are the pre-GU47 constants.
 */
import type { ResolvedLook, Rgb } from "./colorScript";
import { sunDirection } from "./colorScript";

type V3 = readonly [number, number, number];

/** The node-handle members the driver uses (a subset of `AuraRuntimeNodeHandle`). */
export interface LookNodeHandle {
  setUniform?(name: string, value: number | number[]): unknown;
  setLight?(patch: { color?: string; intensity?: number; direction?: [number, number, number] }): void;
}

/** The app members the driver uses (all optional on `AuraApp`). */
export interface LookAppLike {
  readonly lighting?: { setEnvironmentIntensity(value: number): void };
  readonly post?: { setEffect(name: string, patch: Record<string, number | string | boolean | number[]>): void; setEffectEnabled(name: string, enabled: boolean): void };
  readonly quality?: { readonly tier: string };
  setOutput?(output: { exposure?: number }): void;
}

export interface LookFrame {
  /** Smoothed chase-camera forward (world). */
  readonly forward: V3;
  /** Render time, seconds. */
  readonly time: number;
  /** Camera position (world), for the god-ray light position. */
  readonly eye?: V3;
  /** Reduced motion: the spine wave and cloud drift slow to 30% (PRD §6.3). */
  readonly reducedMotion: boolean;
}

export interface LookDriver {
  apply(look: ResolvedLook, frame: LookFrame): void;
  /** Writes made by the last `apply` (tests and the QA hook). */
  readonly writes: number;
  /** Sun direction (towards the sun) used by the last `apply`. */
  readonly sunDir: V3;
  /** True while the god-ray stage is on (High / Ultra tier and a god-ray stage). */
  readonly godRaysOn: boolean;
}

const hex = (c: Rgb): string => {
  const enc = (v: number): number => {
    const x = Math.max(0, Math.min(1, v));
    return Math.round(255 * (x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055));
  };
  return `#${[enc(c[0]), enc(c[1]), enc(c[2])].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
};

/** Tiers that run the High-only post (god rays, lens flare, motion blur; PRD §6.4, SSR-19). */
export const HIGH_POST_TIERS: ReadonlySet<string> = new Set(["high", "ultra"]);

export function createLookDriver(app: LookAppLike, node: (id: string) => LookNodeHandle | undefined): LookDriver {
  const last = new Map<string, number | readonly number[]>();
  let writes = 0;
  let sunDir: V3 = [0, 0.3, -1];
  let godRaysOn = false;
  let godRaysState: boolean | null = null;
  /** True when `value` differs from what was last written under `key` by more than `eps`; records it when so. */
  const moved = (key: string, value: number | readonly number[], eps: number): boolean => {
    const prev = last.get(key);
    let changed = prev === undefined;
    if (!changed) {
      if (typeof value === "number") changed = Math.abs((prev as number) - value) > eps;
      else for (let i = 0; i < value.length && !changed; i++) changed = Math.abs(((prev as readonly number[])[i] ?? 0) - (value[i] ?? 0)) > eps;
    }
    if (changed) last.set(key, typeof value === "number" ? value : [...value]);
    return changed;
  };
  const uniform = (id: string, name: string, value: number | readonly number[], eps = 1e-3): void => {
    if (!moved(`${id}.${name}`, value, eps)) return;
    node(id)?.setUniform?.(name, typeof value === "number" ? value : [...value]);
    writes++;
  };

  return {
    get writes() { return writes; },
    get sunDir() { return sunDir; },
    get godRaysOn() { return godRaysOn; },
    apply(look, frame) {
      writes = 0;
      const dir = sunDirection(frame.forward, look.sunElevation, look.sunAzimuth);
      sunDir = dir;
      const clock = frame.reducedMotion ? frame.time * 0.3 : frame.time;

      /* sky (SSR-04) and road (SSR-08) share the atmosphere uniforms */
      for (const id of ["sky", "road"]) {
        uniform(id, "lookMode", 1);
        uniform(id, "lookSunDir", dir, 2e-3);
        uniform(id, "lookSunColor", look.sunColor);
        uniform(id, "lookFogColor", look.fogColor);
        uniform(id, "lookFogNear", look.fogNear, 0.5);
        uniform(id, "lookFogFar", look.fogFar, 0.5);
        uniform(id, "lookHemiSky", look.hemiSky);
        uniform(id, "lookHemiGround", look.hemiGround);
      }
      uniform("sky", "skyHi", look.zenith);
      uniform("sky", "skyMid", look.upper);
      uniform("sky", "skyLo", look.horizon);
      uniform("sky", "skyBand", look.band);
      uniform("sky", "skySunDisc", look.sunDisc);
      uniform("sky", "skyCorona", look.corona);
      uniform("sky", "skyStars", look.stars);
      uniform("sky", "skyMoon", look.moon);
      uniform("sky", "cloudLit", look.cloudLit);
      uniform("sky", "cloudMid", look.cloudMid);
      uniform("sky", "cloudDark", look.cloudDark);
      uniform("road", "roadPearl", look.pearl);
      uniform("road", "roadJade", look.jade);
      uniform("road", "roadSpine", look.spine);
      uniform("road", "roadBelly", look.belly);
      uniform("road", "roadCrack", look.storm, 5e-3);
      node("road")?.setUniform?.("roadTime", clock);
      writes++;

      /* key, fill, hemisphere, environment (SSR-02) */
      if (moved("sun", [-dir[0], -dir[1], -dir[2], ...look.sunColor, look.sunIntensity], 2e-3)) {
        node("sun")?.setLight?.({ direction: [-dir[0], -dir[1], -dir[2]], color: hex(look.sunColor), intensity: look.sunIntensity });
        writes++;
      }
      const f = frame.forward;
      const fl = Math.hypot(f[0], f[1] - 0.35, f[2]) || 1;
      const fillDir: [number, number, number] = [f[0] / fl, (f[1] - 0.35) / fl, f[2] / fl];
      if (moved("fill", [...fillDir, ...look.fillColor, look.fillIntensity], 2e-3)) {
        node("fill")?.setLight?.({ direction: fillDir, color: hex(look.fillColor), intensity: look.fillIntensity });
        writes++;
      }
      if (moved("hemi", look.hemiIntensity, 2e-3)) { node("sky fill")?.setLight?.({ intensity: look.hemiIntensity }); writes++; }
      if (moved("env", look.environmentIntensity, 2e-3)) { app.lighting?.setEnvironmentIntensity(look.environmentIntensity); writes++; }

      /* post (SSR-05, SSR-06) and exposure */
      if (moved("bloom", [look.bloomIntensity, look.bloomThreshold], 5e-3)) {
        app.post?.setEffect("bloom", { intensity: look.bloomIntensity, threshold: look.bloomThreshold });
        writes++;
      }
      if (moved("grade", [look.temperature, look.tint, look.saturation, look.contrast], 5e-3)) {
        app.post?.setEffect("colorGrade", { temperature: look.temperature, tint: look.tint, saturation: look.saturation, contrast: look.contrast });
        writes++;
      }
      if (moved("exposure", look.exposure, 5e-3)) { app.setOutput?.({ exposure: look.exposure }); writes++; }
      const tier = app.quality?.tier ?? "high";
      godRaysOn = HIGH_POST_TIERS.has(tier) && look.godRays > 0.5;
      if (godRaysOn !== godRaysState) {
        app.post?.setEffectEnabled("volumetricFog", godRaysOn);
        godRaysState = godRaysOn;
        writes++;
      }
      const eye = frame.eye ?? [0, 0, 0];
      const lightPosition = [eye[0] + dir[0] * 4000, eye[1] + dir[1] * 4000, eye[2] + dir[2] * 4000].map((v) => Math.round(v / 20) * 20);
      if (godRaysOn && moved("rays", [...lightPosition, look.godRays], 1e-3)) {
        app.post?.setEffect("volumetricFog", { godRayDensity: 0.35 * look.godRays, color: hex(look.sunColor), lightPosition });
        writes++;
      }
    }
  };
}
