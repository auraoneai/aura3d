/**
 * Gridlock Courier (GU47 WP-28 GC-L6, GC-S1, GC-S3, GC-M2, GC-P1, GC-L4): the per-frame time-of-day driver.
 *
 * `lookFrame(row)` turns a look-table row (`phases.ts`) into the exact runtime values: light patches for the key,
 * sky / far-city / water shader uniforms (linear colours), the fog spec and the post patches. `createDaylight(...)`
 * applies them to a mounted app through the E-B / E-C runtime surfaces (`handle.setLight`, `setUniform`,
 * `app.atmosphere.setFog`, `app.post.setEffect`) and only writes what changed beyond a small epsilon, so a pinned
 * `?at=` frame does no work after the first one. Facade emissive steps are quantised (`WINDOW_STEP`) because they go
 * through `setMaterial`.
 *
 * Presentation only (PRD D8): nothing here reads or writes the sim.
 */
import { hexToRgb, lightDir, type PhaseRow } from "./phases";

export type Vec3 = readonly [number, number, number];

const lin = (v: number): number => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
/** sRGB hex to linear RGB (custom-shader colour uniforms are linear). */
export function linear(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  return [lin(r), lin(g), lin(b)];
}

/** Facade emissive is re-applied through `setMaterial` only when it moves by this much. */
export const WINDOW_STEP = 0.05;
/** How far the key sits from its target, metres (the sun's position for the shadow fit). */
export const KEY_DISTANCE = 110;

export interface LookFrame {
  key: { color: string; intensity: number; direction: Vec3 };
  hemisphere: { color: string; intensity: number };
  environmentIntensity: number;
  sky: { sunDirection: Vec3; skyHorizon: Vec3; skyMid: Vec3; skyTop: Vec3; skyGlow: Vec3; skyClouds: number; skyStars: number };
  far: { farLight: number; farFogColor: Vec3; farFogDensity: number; farWindows: number; farLitFraction: number };
  water: { waterSun: Vec3; waterDeep: Vec3; waterHorizon: Vec3; waterTop: Vec3; waterGlow: Vec3; waterFoam: Vec3; waterGlitter: number; waterFogColor: Vec3; waterFogDensity: number };
  fog: { color: string; density: number };
  post: {
    bloom: { intensity: number; threshold: number };
    colorGrade: { contrast: number; saturation: number; temperature: number };
    vignette: { intensity: number };
  };
  windows: number;
  lamps: number;
  shopfronts: number;
  beacon: number;
  festoon: number;
}

export function lookFrame(row: PhaseRow): LookFrame {
  const toKey = lightDir(row.key);
  const toSun = lightDir(row.sun);
  const fogLin = linear(row.fog.color);
  const horizon = linear(row.sky.horizon);
  // the far ring fades toward a colour between the mist and the sky horizon, at half the street fog density
  const farFog: Vec3 = [0.5 * (fogLin[0] + horizon[0]), 0.5 * (fogLin[1] + horizon[1]), 0.5 * (fogLin[2] + horizon[2])];
  return {
    key: { color: row.key.color, intensity: row.key.intensity, direction: [-toKey[0], -toKey[1], -toKey[2]] },
    hemisphere: { color: row.hemisphere.sky, intensity: row.hemisphere.intensity },
    environmentIntensity: row.environmentIntensity,
    sky: { sunDirection: toSun, skyHorizon: horizon, skyMid: linear(row.sky.mid), skyTop: linear(row.sky.top), skyGlow: linear(row.sky.glow), skyClouds: row.sky.clouds, skyStars: row.sky.stars },
    far: { farLight: 0.35 + 0.65 * Math.min(1, row.environmentIntensity), farFogColor: farFog, farFogDensity: row.fog.density * 0.5, farWindows: Math.min(1, row.windows / 1.4), farLitFraction: row.litFraction },
    water: {
      waterSun: toSun,
      waterDeep: linear("#1d3f4f"),
      waterHorizon: horizon,
      waterTop: linear(row.sky.top),
      waterGlow: linear(row.sky.glow),
      waterFoam: linear("#e9efe9"),
      waterGlitter: row.glitter,
      waterFogColor: farFog,
      waterFogDensity: row.fog.density * 0.6
    },
    fog: { color: row.fog.color, density: row.fog.density },
    post: {
      bloom: { intensity: row.bloom.intensity, threshold: row.bloom.threshold },
      colorGrade: { contrast: row.grade.contrast, saturation: row.grade.saturation, temperature: row.grade.temperature },
      vignette: { intensity: row.vignette }
    },
    windows: row.windows,
    lamps: row.lamps,
    shopfronts: row.shopfronts,
    beacon: row.beacon,
    festoon: row.festoon
  };
}

/* ------------------------------------------------------------------ applying a frame */

type Uniform = number | readonly number[];
export interface DaylightNode {
  setLight?(patch: { color?: string; intensity?: number; direction?: Vec3; position?: Vec3 }): void;
  setUniform?(name: string, value: never): unknown;
}
export interface DaylightTargets {
  node(id: string): DaylightNode | undefined;
  setFog?(spec: { color: string; density: number }): void;
  setPostEffect?(name: string, patch: Record<string, number>): void;
  setEnvironmentIntensity?(intensity: number): void;
  /** Re-applies the facade materials at a new window emissive (quantised by `WINDOW_STEP`). */
  setWindows?(intensity: number): void;
}

const near = (a: Uniform | undefined, b: Uniform, eps: number): boolean => {
  if (a === undefined) return false;
  if (typeof a === "number" || typeof b === "number") return typeof a === "number" && typeof b === "number" && Math.abs(a - b) < eps;
  for (let i = 0; i < b.length; i++) if (Math.abs((a[i] ?? 0) - b[i]!) >= eps) return false;
  return true;
};

/** True when any flag is set; every argument is evaluated (each `changed` call records its value). */
const anyOf = (...flags: boolean[]): boolean => flags.includes(true);

/** Ids of the runtime nodes the driver writes (look.ts gives them these ids). */
export const DAYLIGHT_IDS = { key: "sun", hemisphere: "sky-fill", sky: "sky-dome", far: "far-city", water: "harbour" } as const;

export interface Daylight {
  apply(frame: LookFrame): number;
  /** Forget what was written (after a scene rebuild): the next `apply` writes everything. */
  reset(): void;
}

/** Applies look frames, writing only what changed. `apply` returns the number of writes (0 on a steady frame). */
export function createDaylight(t: DaylightTargets, eps = 1e-3): Daylight {
  const shown = new Map<string, Uniform>();
  let windowsShown: number | undefined;
  const changed = (key: string, v: Uniform): boolean => {
    if (near(shown.get(key), v, eps)) return false;
    shown.set(key, typeof v === "number" ? v : [...v]);
    return true;
  };
  const colorKey = (hex: string): readonly number[] => hexToRgb(hex);
  return {
    reset() {
      shown.clear();
      windowsShown = undefined;
    },
    apply(f) {
      let writes = 0;
      const key = t.node(DAYLIGHT_IDS.key);
      if (key?.setLight && anyOf(changed("key.color", colorKey(f.key.color)), changed("key.intensity", f.key.intensity), changed("key.dir", f.key.direction))) {
        key.setLight({ color: f.key.color, intensity: f.key.intensity, direction: f.key.direction });
        writes++;
      }
      const hemi = t.node(DAYLIGHT_IDS.hemisphere);
      if (hemi?.setLight && anyOf(changed("hemi.color", colorKey(f.hemisphere.color)), changed("hemi.intensity", f.hemisphere.intensity))) {
        hemi.setLight({ color: f.hemisphere.color, intensity: f.hemisphere.intensity });
        writes++;
      }
      if (t.setEnvironmentIntensity && changed("env", f.environmentIntensity)) {
        t.setEnvironmentIntensity(f.environmentIntensity);
        writes++;
      }
      const uniforms = (id: string, values: Record<string, Uniform>) => {
        const n = t.node(id);
        if (!n?.setUniform) return;
        for (const [name, v] of Object.entries(values)) {
          if (!changed(`${id}.${name}`, v)) continue;
          n.setUniform(name, (typeof v === "number" ? v : [...v]) as never);
          writes++;
        }
      };
      uniforms(DAYLIGHT_IDS.sky, f.sky);
      uniforms(DAYLIGHT_IDS.far, f.far);
      uniforms(DAYLIGHT_IDS.water, f.water);
      if (t.setFog && anyOf(changed("fog.color", colorKey(f.fog.color)), changed("fog.density", f.fog.density * 1000))) {
        t.setFog({ color: f.fog.color, density: f.fog.density });
        writes++;
      }
      if (t.setPostEffect) {
        for (const [name, patch] of Object.entries(f.post) as [string, Record<string, number>][]) {
          if (!changed(`post.${name}`, Object.values(patch))) continue;
          t.setPostEffect(name, patch);
          writes++;
        }
      }
      if (t.setWindows) {
        const q = Math.round(f.windows / WINDOW_STEP) * WINDOW_STEP;
        if (windowsShown === undefined || Math.abs(q - windowsShown) > 1e-6) {
          windowsShown = q;
          t.setWindows(q);
          writes++;
        }
      }
      return writes;
    }
  };
}
