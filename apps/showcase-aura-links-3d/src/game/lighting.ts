/**
 * lighting.ts — per-course fill lights for Aura Links 3D. Pure data, no
 * engine imports, so the light budget is unit tested.
 */

import type { CourseSpec } from "./types";

type V3 = [number, number, number];

export interface CourseFill {
  readonly ambient: string;
  readonly ambientI: number;
  readonly sky: string;
  readonly ground: string;
  /** 0 = no hemisphere authored */
  readonly hemiI: number;
  readonly rim: string;
  readonly rimI: number;
  readonly rimPos: V3;
  /**
   * Floodlight key for the floodlit night course (Neon Bay). The night-city
   * look's only key is a 0.7 blue moon, which left the dark-green turf at a
   * mean luma of 2.3 (96% of pixels at 8 or below, audit-fix E2 frames).
   * This high, warm-white directional from behind the tee lights the whole
   * hole the way stadium floodlights would; it casts no shadow (the moon
   * keeps the shadow and the contact-shadow mask).
   */
  readonly flood?: { readonly color: string; readonly intensity: number; readonly position: V3 };
}

/**
 * Course fill lights. Since 4.5.0 the hemisphere counts in the ambient term
 * on the no-HDRI looks (audit LIGHT-03): with the 4.3.7 values Neon Bay's
 * ambient term grew 2.29x and Mare's 4.09x (luminance of the linear sum).
 * Both are scaled so the ambient-plus-hemisphere term matches the 4.3.7
 * ambient the courses were tuned against (0.32/2.293 and 0.38/2.293 for
 * Neon Bay, 0.26/4.089 and 0.34/4.089 for Mare). HDRI looks author no
 * hemisphere (`hemiI: 0`), so the engine change that feeds it next to an
 * environment (LIGHT-05) cannot shift those courses.
 */
export function courseFill(course: CourseSpec): CourseFill {
  const theme = course.dressing.theme;
  return course.look === "night-city"
    ? {
        ambient: "#3b4a6e", ambientI: 0.14, sky: "#4269a8", ground: "#151a28", hemiI: 0.166, rim: "#7f9dff", rimI: 0.3, rimPos: [-22, 20, -30],
        flood: { color: "#fff1dc", intensity: NEON_FLOOD_INTENSITY, position: [10, 26, -18] }
      }
    : course.look === "space"
      ? { ambient: "#3d4354", ambientI: 0.064, sky: "#7d8ba6", ground: "#191b20", hemiI: 0.083, rim: "#dbe7ff", rimI: 0.35, rimPos: [-18, 26, -34] }
      : theme === "alpine"
        ? { ambient: "#dce8f4", ambientI: 0.16, sky: "#cfe6f4", ground: "#697681", hemiI: 0, rim: "#d9ecff", rimI: 0.22, rimPos: [-24, 18, -30] }
        : theme === "volcanic"
          ? { ambient: "#6b4a3d", ambientI: 0.18, sky: "#a86a4e", ground: "#2a1e1a", hemiI: 0, rim: "#ff9a5c", rimI: 0.28, rimPos: [-26, 16, -28] }
          : course.look === "golden-hour"
            ? { ambient: "#e3bd91", ambientI: 0.14, sky: "#f0c28a", ground: "#4b3b2c", hemiI: 0, rim: "#9fb6ce", rimI: 0.24, rimPos: [-22, 15, -26] }
            : { ambient: "#c9dcea", ambientI: 0.13, sky: "#b9d3e6", ground: "#3d5434", hemiI: 0, rim: "#d7e6f2", rimI: 0.22, rimPos: [-24, 18, -30] };
}

/** Neon Bay floodlight intensity (see CourseFill.flood) */
export const NEON_FLOOD_INTENSITY = 3.0;

/**
 * Contact-shadow strength per course. The mask darkens only the
 * shadow-casting key light (audit LIGHT-09); the night-city key is 0.7, so
 * Neon Bay runs the mask at full strength to keep balls and feet grounded.
 */
export function contactShadowIntensity(course: CourseSpec): number {
  return course.look === "night-city" ? 1 : 0.62;
}

/* ------------------------------------------------------------------ *
 *  Light budget (used by the unit test)                               *
 * ------------------------------------------------------------------ */

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

/** linear RGB of a #rrggbb colour */
export function linearRgb(hex: string): V3 {
  const n = parseInt(hex.slice(1), 16);
  return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)];
}

const luminance = (c: V3) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/**
 * Lambert estimate of the light leaving flat fairway turf: albedo times each
 * directional's colour, intensity and sin(elevation), plus the ambient and
 * the hemisphere sky colour. Linear luminance, before exposure and tone map.
 */
export function fairwayRadiance(
  fairway: string,
  directionals: readonly { readonly color: string; readonly intensity: number; readonly position: readonly number[] }[],
  ambient: { readonly color: string; readonly intensity: number }[] = []
): number {
  const a = linearRgb(fairway);
  const out: V3 = [0, 0, 0];
  for (const d of directionals) {
    const [x, y, z] = d.position as V3;
    const sinEl = Math.max(0, y / Math.hypot(x, y, z));
    const c = linearRgb(d.color);
    for (let i = 0; i < 3; i++) out[i] += a[i]! * c[i]! * d.intensity * sinEl;
  }
  for (const l of ambient) {
    const c = linearRgb(l.color);
    for (let i = 0; i < 3; i++) out[i] += a[i]! * c[i]! * l.intensity;
  }
  return luminance(out);
}
