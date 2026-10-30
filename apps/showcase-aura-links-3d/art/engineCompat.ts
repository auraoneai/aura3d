/**
 * art/engineCompat.ts — Aura Links 3D's adapter between its look table
 * (`src/game/lighting.ts`) and the engine (GU47 interim-path rule, PRD D6).
 *
 * The look table names the NEW PRD §3.1 controls. Until their engine lanes
 * merge, this file maps each row onto 4.6.x APIs; every swap point carries a
 * `GU47(E-x)` marker so wave 2 is a one-line change per marker:
 *
 * - E-A look overrides (`hdri`, `environmentIntensity`, `environmentRotationDeg`, `key`, `rim`, `grade`, `post`):
 *   today the row's `sun`, `exposureEv` and `background` go through the 5 existing override keys, and the look
 *   group's own key/HDRI/grade/bloom children are patched with the row's values (same node kinds the look emits).
 * - E-A HDRI catalogue: `hdriMode: "catalogue"` swaps in `/hdri/<id>_<size>.hdr` (404 until E-A ships the files).
 * - E-C runtime post (`setEffectEnabled`) and E-F runtime VFX are feature-detected or held behind constants.
 *
 * Interim calls type-check against 4.6.x: no casts onto APIs that do not exist.
 */
import { defineAuraAssets, environments, looks } from "@aura3d/engine";
import type { AuraLookOverrides, AuraSceneNode } from "@aura3d/engine";
import {
  COURSE_LOOKS,
  hdriRotationDeg,
  hdriUrl,
  keyShadowFor,
  type CourseLookRow,
  type LinksHdriId
} from "../src/game/lighting";
import type { CourseId } from "../src/game/types";

/** Presentation tier the game builds for (PRD §6.4): Low drops PCSS cascades, grain, god rays, DOF and ambient particles. */
export type LinksTier = "low" | "high";

/**
 * The PRD §3.1 E-A `AuraLookOverrides` additions, typed locally with the contract's exact names so the wave-2 swap is
 * mechanical (spread this object into `looks.preset`). GU47(E-A): delete once `@aura3d/engine` exports them.
 */
export interface LinksLookOverrides47 {
  readonly hdri?: LinksHdriId;
  readonly environmentIntensity?: number;
  readonly environmentRotationDeg?: number;
  readonly key?: { readonly color?: string; readonly intensity?: number; readonly shadow?: { readonly filter?: "hard" | "pcf" | "pcss"; readonly cascades?: 1 | 2 | 3 | 4 | "auto"; readonly mapSize?: 512 | 1024 | 2048 | 4096 } };
  readonly rim?: false | { readonly color?: string; readonly intensity?: number; readonly azimuthDeg?: number };
  readonly fog?: { readonly color?: string; readonly near?: number; readonly far?: number };
  readonly grade?: { readonly contrast?: number; readonly saturation?: number; readonly temperature?: number; readonly tint?: number };
  readonly post?: { readonly bloom?: false | { readonly intensity?: number; readonly threshold?: number; readonly radius?: number } };
}

/** The row's look overrides split into what 4.6.x accepts (`engine`) and the E-A keys it does not yet read (`pending`). */
export function lookOverridesFor(row: CourseLookRow, tier: LinksTier): { readonly engine: AuraLookOverrides; readonly pending: LinksLookOverrides47 } {
  const engine: AuraLookOverrides = {
    ...(row.sun ? { sun: { azimuthDeg: row.sun.azimuthDeg, elevationDeg: row.sun.elevationDeg } } : {}),
    exposureEv: row.exposureEv,
    // the game authors its own per-course fog node (lookRig.ts), so the look's fog stays off
    fogDensityScale: 0,
    background: row.background
  };
  const pending: LinksLookOverrides47 = {
    hdri: row.hdri.id,
    environmentIntensity: row.hdri.intensity,
    environmentRotationDeg: hdriRotationDeg(row),
    key: { color: row.key.color, intensity: row.key.intensity, shadow: keyShadowFor(tier) },
    rim: row.rim === "legacy" ? false : { color: row.rim.color, intensity: row.rim.intensity, azimuthDeg: row.rim.azimuthDeg },
    grade: { contrast: row.grade.contrast, saturation: row.grade.saturation, temperature: row.grade.temperature, tint: row.grade.tint },
    post: { bloom: { intensity: row.bloom.intensity, threshold: row.bloom.threshold, radius: row.bloom.radius } }
  };
  return { engine, pending };
}

/** Where the course's image-based light comes from. "look" = the base preset's HDRI (wave 1); "catalogue" = the row's own HDRI. */
export type LinksHdriMode = "look" | "catalogue";

/**
 * GU47(E-A): flip to "catalogue" once E-A ships `public/hdri/<id>_1k.hdr` (and then to the real `hdri` override).
 * `?hdri=catalogue` opts in early for phase-2 captures.
 */
export const DEFAULT_HDRI_MODE: LinksHdriMode = "look";

type LookGroupNode = ReturnType<ReturnType<typeof looks.preset>["toJSON"]>;

const catalogueHdriCache = new Map<string, ReturnType<typeof buildCatalogueHdri>>();
function buildCatalogueHdri(url: string) {
  return defineAuraAssets({ hdri: { type: "texture", format: "hdr", url } }).hdri;
}

/** Typed `/hdri/<id>_<size>.hdr` texture ref for a row (EXECUTION.md HDRI catalogue convention). */
export function catalogueHdriRef(row: CourseLookRow) {
  const url = hdriUrl(row);
  let ref = catalogueHdriCache.get(url);
  if (!ref) {
    ref = buildCatalogueHdri(url);
    catalogueHdriCache.set(url, ref);
  }
  return ref;
}

/**
 * The course look as one `aura-look:<base>` group node: the engine preset with the row's 5 supported overrides, then
 * its key, HDRI, grade and bloom children patched with the row (the interim for the E-A `key`, `environmentIntensity`,
 * `grade` and `post.bloom` overrides). The node kinds are exactly the ones the preset emits, so the compiler, look
 * lint and the art-direction snapshot treat it as the look.
 */
export function buildCourseLookNode(row: CourseLookRow, tier: LinksTier, hdriMode: LinksHdriMode = DEFAULT_HDRI_MODE): AuraSceneNode {
  const { engine } = lookOverridesFor(row, tier);
  // GU47(E-A): return looks.preset(row.base, { ...engine, ...pending }) and delete the child patching below.
  const group: LookGroupNode = looks.preset(row.base, engine).toJSON();
  const children: AuraSceneNode[] = [];
  let hasHdriChild = false;
  for (const child of group.children) {
    if (child.kind === "light" && child.name === "look key light") {
      children.push({ ...child, color: row.key.color, intensity: row.key.intensity, shadow: keyShadowFor(tier) });
    } else if (child.kind === "environment" && child.environment === "hdri") {
      hasHdriChild = true;
      children.push({
        ...child,
        intensity: row.hdri.intensity,
        ...(hdriMode === "catalogue" ? { texture: catalogueHdriRef(row), name: `look hdri ${row.hdri.id}` } : {})
      });
    } else if (child.kind === "environment" && hdriMode === "catalogue") {
      // the no-HDRI presets' procedural fill gives way to the row's catalogue HDRI (added below)
      continue;
    } else if (child.kind === "effect" && child.effect === "color-grade") {
      children.push({ ...child, contrast: row.grade.contrast, saturation: row.grade.saturation });
    } else if (child.kind === "effect" && child.effect === "bloom") {
      children.push({ ...child, intensity: Math.min(0.92, row.bloom.intensity), threshold: row.bloom.threshold, radius: row.bloom.radius });
    } else {
      children.push(child);
    }
  }
  if (hdriMode === "catalogue" && !hasHdriChild) {
    children.unshift(
      environments.hdri({
        name: `look hdri ${row.hdri.id}`,
        intensity: row.hdri.intensity,
        texture: catalogueHdriRef(row),
        background: row.hdri.background
      }).toJSON()
    );
  }
  return { ...group, children };
}

/**
 * Runtime-spawned VFX mode. Off since the 4.3.x "floating dot" report (`?vfx=on` re-enables it in the engine).
 * GU47(E-F): return "on" once E-F's floating-dot receipt lands (LINKS-11 switch-on, wave 2).
 */
export function runtimeVfxMode(): "on" | "off" {
  return "off";
}

/** Narrow view of the E-C runtime post surface (PRD §3.1 `AuraPostSurface.setEffectEnabled`), feature-detected. */
interface PostSurface47 {
  readonly setEffectEnabled?: (name: string, enabled: boolean) => void;
}

/** True when the engine can toggle a post effect at runtime (E-C). Until then DOF stays out of the scene. */
export function runtimePostSupported(app: unknown): boolean {
  const post = (app as { post?: PostSurface47 } | null | undefined)?.post;
  return typeof post?.setEffectEnabled === "function";
}

/** Turns a named post effect on or off when E-C's setter exists; a no-op on 4.6.x. GU47(E-C). */
export function setPostEffectEnabled(app: unknown, name: string, enabled: boolean): boolean {
  const post = (app as { post?: PostSurface47 } | null | undefined)?.post;
  if (typeof post?.setEffectEnabled !== "function") return false;
  post.setEffectEnabled(name, enabled);
  return true;
}

/** Look rows by course, re-exported for callers that only import the adapter. */
export function courseLook(id: CourseId): CourseLookRow {
  return COURSE_LOOKS[id];
}
