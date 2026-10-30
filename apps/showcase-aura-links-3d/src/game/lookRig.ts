/**
 * lookRig.ts — builds a course's light, atmosphere and post nodes from its
 * look-table row (`lighting.ts`, GU47 WP-20): the course look as one E-A
 * `looks.preset(base, overrides)` (its own HDRI, rotation, sun, shadowed key,
 * rim, fog, grade and bloom), the practicals (Neon Bay's mast spots and
 * cones, Cinder Rim's lava glow), god rays, contact shadows, the per-course
 * vignette and grain, the sun flare and the ambient particles. Pure node
 * builders (no DOM, no app), so the art-direction audit runs on exactly what
 * the game mounts (tests/unit/aura-links-3d).
 *
 * Draw delta vs 4.6.2 (LINKS-15 budget): lights, fog, grade and post add no
 * draws; the sun flare adds one sprite batch on two courses (High only); the
 * ambient particles one instanced batch (High only); Neon Bay's two light
 * cones two additive draws. The vignette node replaces the old blanket one.
 */
import { effects, lights, looks, type AuraLookOverrides, type AuraSceneNode } from "@aura3d/engine";
import { pondGeometry } from "./courses";
import {
  CINDER_LAVA_LIGHT,
  contactShadowIntensity,
  COURSE_LOOKS,
  hdriRotationDeg,
  keyDirection,
  keyShadowFor,
  NEON_MAST_SPOTS,
  type CourseLookRow,
  type LinksTier
} from "./lighting";
import type { CourseSpec, HoleSpec, HoleTerrain, Vec3 } from "./types";

export interface CourseRigOptions {
  readonly tier: LinksTier;
  /** PRD §6.3: ambient emission halves */
  readonly reducedMotion?: boolean;
}

export interface CourseRig {
  readonly row: CourseLookRow;
  /**
   * Nodes that must precede the look: the god-ray volume. With several fog nodes the last visible one is the scene
   * fog (LiveAtmosphere), so the look's own fog node, mounted after it, stays the course fog.
   */
  readonly before: readonly AuraSceneNode[];
  /** the course look group (environment + the one shadowed key + rim + fog + grade + bloom + output preset) */
  readonly look: AuraSceneNode;
  /** practicals, contact shadows, post, the sun flare and the ambient particles */
  readonly nodes: readonly AuraSceneNode[];
  /** clear colour behind the sky */
  readonly background: string;
}

/** The row as E-A look overrides (every field is a merged GU47 E-A override key). */
export function lookOverridesFor(row: CourseLookRow, tier: LinksTier): AuraLookOverrides {
  return {
    sun: { azimuthDeg: row.sun.azimuthDeg, elevationDeg: row.sun.elevationDeg },
    exposureEv: row.exposureEv,
    // a colour background keeps the HDRI as IBL only (Neon Bay's navy sky); "look" draws the HDRI as the sky
    background: row.hdri.drawn ? "look" : row.background,
    hdri: row.hdri.id,
    environmentIntensity: row.hdri.intensity,
    environmentRotationDeg: hdriRotationDeg(row),
    key: { color: row.key.color, intensity: row.key.intensity, shadow: keyShadowFor(tier) },
    rim: row.rim ? { color: row.rim.color, intensity: row.rim.intensity, azimuthDeg: row.rim.azimuthDeg } : false,
    ...(row.fog ? { fog: { color: row.fog.color, height: { ...row.fog } } } : {}),
    grade: { contrast: row.grade.contrast, saturation: row.grade.saturation, temperature: row.grade.temperature, tint: row.grade.tint },
    post: { bloom: { intensity: row.bloom.intensity, threshold: row.bloom.threshold, scatter: row.bloom.scatter } }
  };
}

/** The course look group node. */
export function buildCourseLook(row: CourseLookRow, tier: LinksTier): AuraSceneNode {
  return looks.preset(row.base, lookOverridesFor(row, tier)).toJSON();
}

/**
 * Neon Bay's two floodlight masts: the two lamp pylons behind the green (the 4.6.2 dressing puts four at
 * (+-18, -8) and (+-18, +18) from the cup); their spots aim at the cup (LINKS-16).
 */
export function neonMastPositions(terrain: HoleTerrain): readonly Vec3[] {
  const [cx, cz] = [terrain.cup[0], terrain.cup[2]];
  return [-18, 18].map((lx) => {
    const x = cx + lx;
    const z = cz + 18;
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

/** Ambient particles per course on High (LINKS-18: <= 2,000 in total with the runtime VFX; 0 on Low; halved under reduced motion). */
export const AMBIENT_PARTICLES: Readonly<Record<string, { readonly count: number; readonly color: string; readonly size: readonly [number, number]; readonly gravity: number; readonly radius: number }>> = {
  wisps: { count: 360, color: "#e6edf2", size: [0.18, 0.42], gravity: 0, radius: 14 },
  leaves: { count: 220, color: "#c8643a", size: [0.05, 0.09], gravity: -0.35, radius: 12 },
  embers: { count: 520, color: "#ff8a3a", size: [0.025, 0.05], gravity: 0.25, radius: 14 },
  spindrift: { count: 420, color: "#f4f8ff", size: [0.02, 0.045], gravity: -0.1, radius: 14 },
  moths: { count: 120, color: "#f6f0c8", size: [0.02, 0.035], gravity: 0, radius: 10 }
};

export function ambientParticleCount(row: CourseLookRow, tier: LinksTier, reducedMotion: boolean): number {
  if (tier === "low" || row.ambientParticles === null) return 0;
  const base = AMBIENT_PARTICLES[row.ambientParticles]!.count;
  return reducedMotion ? Math.floor(base / 2) : base;
}

export function buildCourseRig(course: CourseSpec, hole: HoleSpec, terrain: HoleTerrain, options: CourseRigOptions): CourseRig {
  const row = COURSE_LOOKS[course.id];
  const tier = options.tier;
  const before: AuraSceneNode[] = [];
  const nodes: AuraSceneNode[] = [];

  // Practicals (LINKS-16). Unshadowed: the art direction keeps one shadowed light (the key), see the lane report.
  if (course.id === "neonBay") {
    neonMastPositions(terrain).forEach((p, i) => {
      const head: Vec3 = [p[0], p[1] + NEON_MAST_SPOTS.height, p[2]];
      const aim: Vec3 = [terrain.cup[0], terrain.cup[1], terrain.cup[2]];
      nodes.push(
        lights.spot({
          name: `neon-mast-spot-${i}`,
          position: [head[0], head[1], head[2]],
          target: [aim[0], aim[1], aim[2]],
          angle: NEON_MAST_SPOTS.angle,
          penumbra: NEON_MAST_SPOTS.penumbra,
          intensity: NEON_MAST_SPOTS.intensity,
          color: NEON_MAST_SPOTS.color,
          distance: NEON_MAST_SPOTS.distance
        }).toJSON()
      );
      // the visible cone in the navy fog
      const d = [aim[0] - head[0], aim[1] - head[1], aim[2] - head[2]];
      const len = Math.hypot(d[0]!, d[1]!, d[2]!) || 1;
      nodes.push(
        effects.lightCone({
          name: `neon-mast-cone-${i}`,
          position: [head[0], head[1], head[2]],
          direction: [d[0]! / len, d[1]! / len, d[2]! / len],
          length: Math.min(24, len),
          coneAngle: NEON_MAST_SPOTS.angle * 0.5,
          color: NEON_MAST_SPOTS.color,
          intensity: 0.35,
          softness: 0.6
        }).toJSON()
      );
    });
  } else if (course.id === "cinderRim") {
    lavaLightPositions(terrain, hole).forEach((p, i) => {
      nodes.push(lights.point({ name: `lava-glow-${i}`, position: [p[0], p[1], p[2]], color: CINDER_LAVA_LIGHT.color, intensity: CINDER_LAVA_LIGHT.intensity, distance: CINDER_LAVA_LIGHT.distance }).toJSON());
    });
  }

  // God rays (LINKS-03): the S4 march from the key; the engine skips S4 below Medium, the game skips it on Low.
  if (row.godRays && tier === "high") {
    const fog = row.fog;
    before.push(
      effects.volumetricFog({
        name: "course god rays",
        godRayDensity: row.godRays.density,
        intensity: row.godRays.intensity,
        color: row.godRays.color,
        // the same optics as the course fog, so the forward fog reads the same whichever node resolves it
        ...(fog ? { density: fog.density, heightFalloff: fog.heightFalloff, heightReference: fog.heightReference } : {})
      }).toJSON()
    );
  }

  nodes.push(effects.contactShadows({ intensity: contactShadowIntensity(course), length: 0.32, steps: 12, lights: "sun" }).toJSON());

  // Post beyond the preset (LINKS-04): the game's blanket vignette is gone; each course carries its own (or none).
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

  // Ambient particles (LINKS-18), High only: they ride with the ball, so the camera's subject always has them around it.
  const ambientCount = ambientParticleCount(row, tier, options.reducedMotion === true);
  if (ambientCount > 0 && row.ambientParticles) {
    const spec = AMBIENT_PARTICLES[row.ambientParticles]!;
    nodes.push(
      effects.particles({
        name: `course ambient ${row.ambientParticles}`,
        emitter: "ambient",
        attachTo: "golf-ball",
        particleCount: ambientCount,
        maxParticles: ambientCount,
        radius: spec.radius,
        size: spec.size,
        gravity: spec.gravity,
        color: spec.color,
        intensity: row.ambientParticles === "embers" ? 1.4 : 0.6,
        materialMode: row.ambientParticles === "embers" ? "additive-glow" : "soft-alpha",
        lifetime: [3, 6],
        loop: true
      }).toJSON()
    );
  }

  return { row, before, look: buildCourseLook(row, tier), nodes, background: row.background };
}
