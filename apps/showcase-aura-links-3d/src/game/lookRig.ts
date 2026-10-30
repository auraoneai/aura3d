/**
 * lookRig.ts — builds a course's light, atmosphere and post nodes from its
 * look-table row (`lighting.ts`): the patched look (one shadowed key + the
 * environment), the fills and practicals, the fog, the per-course post and
 * the sun flare. Pure node builders (no DOM, no app), so the art-direction
 * audit runs on exactly what the game mounts (tests/unit/aura-links-3d).
 *
 * Draw delta vs 4.6.2 (LINKS-15 budget): lights and post add no draws; the
 * sun flare adds one sprite batch on two courses (High only).
 */
import { effects, lights, type AuraSceneNode } from "@aura3d/engine";
import { buildCourseLookNode, DEFAULT_HDRI_MODE, type LinksHdriMode, type LinksTier } from "../../art/engineCompat";
import { pondGeometry } from "./courses";
import {
  anglesToPosition,
  CINDER_LAVA_LIGHT,
  contactShadowIntensity,
  COURSE_LOOKS,
  courseFill,
  keyDirection,
  MARE_EARTHSHINE,
  NEON_MAST_SPOTS,
  type CourseLookRow
} from "./lighting";
import type { CourseSpec, HoleSpec, HoleTerrain, Vec3 } from "./types";

export interface CourseRigOptions {
  readonly tier: LinksTier;
  readonly hdriMode?: LinksHdriMode;
}

export interface CourseRig {
  readonly row: CourseLookRow;
  /** the patched look group (environment + the one shadowed key + grade/AO/bloom) */
  readonly look: AuraSceneNode;
  /** fills, practicals, fog, contact shadows, post and the sun flare */
  readonly nodes: readonly AuraSceneNode[];
  readonly background: string;
}

/** The flag-off forward fog's opacity cap for a fog node `intensity` (compiler/fog.ts). */
export function fogMaxOpacity(intensity: number): number {
  return Math.min(0.92, Math.max(0, 0.25 + intensity * 0.55));
}

/** Neon Bay's two floodlight masts: behind the green on both sides, aimed at the cup (LINKS-16). */
export function neonMastPositions(terrain: HoleTerrain, greenRadius: number): readonly Vec3[] {
  const [cx, cz] = [terrain.cup[0], terrain.cup[2]];
  const lateral = greenRadius + 14;
  return [-1, 1].map((side) => {
    const x = cx + side * lateral;
    const z = cz + 12;
    return [x, terrain.height(x, z), z] as Vec3;
  });
}

/** Cinder Rim's lava glow points: one over each lava pool (the course's water hazards), at most three. */
export function lavaLightPositions(terrain: HoleTerrain, hole: HoleSpec): readonly Vec3[] {
  return hole.layout.water.slice(0, CINDER_LAVA_LIGHT.maxPerHole).map((w) => {
    const { surfaceY } = pondGeometry(terrain, w);
    return [w.center[0], surfaceY + 1.4, w.center[1]] as Vec3;
  });
}

export function buildCourseRig(course: CourseSpec, hole: HoleSpec, terrain: HoleTerrain, options: CourseRigOptions): CourseRig {
  const row = COURSE_LOOKS[course.id];
  const tier = options.tier;
  const nodes: AuraSceneNode[] = [];
  const fill = courseFill(course);

  // Fills. HDRI courses author none but the rim (LINKS-01); Neon Bay and Mare keep the calibrated ambient and
  // hemisphere until their catalogue HDRIs land (GU47(E-A)). In catalogue mode the HDRI is the fill everywhere.
  const catalogue = (options.hdriMode ?? DEFAULT_HDRI_MODE) === "catalogue";
  if (fill.ambientI > 0 && !catalogue) nodes.push(lights.ambient({ name: "course ambient fill", color: fill.ambient, intensity: fill.ambientI }).toJSON());
  if (fill.hemiI > 0 && !catalogue) {
    nodes.push(lights.hemisphere({ name: "course sky-ground fill", skyColor: fill.sky, groundColor: fill.ground, intensity: fill.hemiI, position: [0, 30, 0] }).toJSON());
  }
  if (fill.rimI > 0) nodes.push(lights.directional({ name: "course rim fill", color: fill.rim, intensity: fill.rimI, position: fill.rimPos }).toJSON());
  // Neon Bay's floodlight key (no shadow: the look's moon keeps the shadow and the contact-shadow mask)
  if (fill.flood) nodes.push(lights.directional({ name: "course floodlight key", color: fill.flood.color, intensity: fill.flood.intensity, position: fill.flood.position }).toJSON());

  // Practicals (LINKS-16). GU47(E-B): give the two Neon masts `shadow: true` once multi-caster shadows ship.
  if (course.id === "neonBay") {
    neonMastPositions(terrain, hole.layout.greenRadius).forEach((p, i) => {
      nodes.push(
        lights.spot({
          name: `neon-mast-spot-${i}`,
          position: [p[0], p[1] + NEON_MAST_SPOTS.height, p[2]],
          target: [terrain.cup[0], terrain.cup[1], terrain.cup[2]],
          angle: NEON_MAST_SPOTS.angle,
          penumbra: NEON_MAST_SPOTS.penumbra,
          intensity: NEON_MAST_SPOTS.intensity,
          color: NEON_MAST_SPOTS.color,
          distance: NEON_MAST_SPOTS.distance
        }).toJSON()
      );
    });
  } else if (course.id === "cinderRim") {
    lavaLightPositions(terrain, hole).forEach((p, i) => {
      nodes.push(lights.point({ name: `lava-glow-${i}`, position: [p[0], p[1], p[2]], color: CINDER_LAVA_LIGHT.color, intensity: CINDER_LAVA_LIGHT.intensity, distance: CINDER_LAVA_LIGHT.distance }).toJSON());
    });
  } else if (course.id === "mareCourse") {
    nodes.push(
      lights.directional({
        name: "mare earthshine",
        color: MARE_EARTHSHINE.color,
        intensity: MARE_EARTHSHINE.intensity,
        position: anglesToPosition(MARE_EARTHSHINE.elevationDeg, MARE_EARTHSHINE.azimuthDeg, 30)
      }).toJSON()
    );
  }

  // Atmosphere (LINKS-03): one fog node per course, none on airless Mare. The height terms ride on the node for
  // A3D_QR_VFX_FOG (GU47(E-B/E-G): height fog default-on); the flag-off path reads color/density/intensity.
  // GU47(E-C/E-F): Cinder adds effects.volumetricFog({ godRayDensity: row.godRays.density, ... }) on High once the
  // god-ray density is decoupled from the fog density (today a ray-visible density makes the forward fog opaque).
  if (row.fog) {
    nodes.push(
      effects.fog({
        name: "course depth haze",
        color: row.fog.color,
        density: row.fog.density,
        intensity: row.fog.intensity,
        // the flag-off path caps opacity at 0.25 + 0.55 x intensity; say so for the flag-on resolver too
        maxOpacity: fogMaxOpacity(row.fog.intensity),
        ...(row.fog.height ? { mode: "height", ...row.fog.height } : {})
      }).toJSON()
    );
  }
  nodes.push(effects.contactShadows({ intensity: contactShadowIntensity(course), length: 0.32, steps: 12, lights: "sun" }).toJSON());

  // Post beyond the preset (LINKS-04): the game's blanket vignette is gone; each course carries its own.
  if (row.vignette) nodes.push(effects.vignette({ name: "course vignette", intensity: row.vignette.intensity, smoothness: 0.72, roundness: 0.92, color: row.vignette.color }).toJSON());
  if (row.grain && tier === "high") nodes.push(effects.filmGrain({ name: "course film grain", intensity: row.grain.intensity, size: row.grain.size }).toJSON());

  // Sun flare (LINKS-18), High only: far out along the key direction from the middle of the hole.
  if (row.sunFlare && tier === "high") {
    const dir = keyDirection(row);
    const mid = hole.layout.path[Math.floor(hole.layout.path.length / 2)] ?? [0, hole.lengthM * 0.5];
    const far = 600;
    nodes.push(
      lights.lensFlare({
        name: "course sun flare",
        position: [mid[0] + dir[0] * far, terrain.cup[1] + dir[1] * far, mid[1] + dir[2] * far],
        intensity: 0.55,
        edgeFade: 0.2
      }).toJSON()
    );
  }

  return { row, look: buildCourseLookNode(row, tier, options.hdriMode ?? DEFAULT_HDRI_MODE), nodes, background: row.background };
}
