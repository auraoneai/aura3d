import { describe, expect, it } from "vitest";
import { lookHdriIds } from "@aura3d/engine";
import { COURSES, buildHoleTerrain } from "../../../apps/showcase-aura-links-3d/src/game/courses";
import {
  COURSE_LOOKS,
  flagFlutterAmplitude,
  hdriRotationDeg,
  hueDeg,
  hueDistance,
  keyDirection
} from "../../../apps/showcase-aura-links-3d/src/game/lighting";
import { ambientParticleCount, buildCourseRig, lookOverridesFor } from "../../../apps/showcase-aura-links-3d/src/game/lookRig";
import type { CourseId } from "../../../apps/showcase-aura-links-3d/src/game/types";

const IDS = Object.keys(COURSES) as CourseId[];

type Node = { kind?: string; light?: string; name?: string; effect?: string; shadow?: unknown; children?: Node[]; [k: string]: unknown };

function flatten(nodes: readonly Node[]): Node[] {
  return nodes.flatMap((n) => [n, ...(n.kind === "group" && Array.isArray(n.children) ? flatten(n.children) : [])]);
}

function rigNodes(id: CourseId, tier: "low" | "high" = "high", hole = 0): Node[] {
  const course = COURSES[id];
  const h = course.holes[hole]!;
  const rig = buildCourseRig(course, h, buildHoleTerrain(course, h), { tier });
  return flatten([...rig.before, rig.look, ...rig.nodes] as Node[]);
}

const angleDeg = (a: readonly number[], b: readonly number[]) =>
  (Math.acos(Math.max(-1, Math.min(1, a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!))) * 180) / Math.PI;

describe("Aura Links GU47 course looks (WP-20)", () => {
  it("has one row per course, each with its own place and hour", () => {
    expect(Object.keys(COURSE_LOOKS).sort()).toEqual([...IDS].sort());
    const hours = new Set(IDS.map((id) => COURSE_LOOKS[id].timeOfDay));
    expect(hours.size).toBe(6);
  });

  it("LINKS-01: every course has its own sun, the key vectors at least 25 deg apart pairwise", () => {
    expect(COURSE_LOOKS.stAuroras.sun).toEqual({ azimuthDeg: 95, elevationDeg: 12 });
    expect(COURSE_LOOKS.mapleHollow.sun).toEqual({ azimuthDeg: 235, elevationDeg: 30 });
    expect(COURSE_LOOKS.cinderRim.sun).toEqual({ azimuthDeg: 265, elevationDeg: 7 });
    expect(COURSE_LOOKS.cloudTerrace.sun).toEqual({ azimuthDeg: 160, elevationDeg: 62 });
    expect(COURSE_LOOKS.mareCourse.sun).toEqual({ azimuthDeg: 40, elevationDeg: 25 });
    for (let i = 0; i < IDS.length; i++) {
      for (let j = i + 1; j < IDS.length; j++) {
        const a = keyDirection(COURSE_LOOKS[IDS[i]!]);
        const b = keyDirection(COURSE_LOOKS[IDS[j]!]);
        expect(angleDeg(a, b), `${IDS[i]} vs ${IDS[j]}`).toBeGreaterThanOrEqual(25);
      }
    }
  });

  it("LINKS-01: one shadowed key (PCSS, 3 cascades on High; PCF, 1 cascade on Low), no ambient or hemisphere fill", () => {
    for (const id of IDS) {
      for (const tier of ["high", "low"] as const) {
        const lights = rigNodes(id, tier).filter((n) => n.kind === "light");
        expect(lights.some((l) => l.light === "ambient" || l.light === "hemisphere"), `${id} ${tier}`).toBe(false);
        const shadowed = lights.filter((l) => l.shadow === true || (typeof l.shadow === "object" && l.shadow !== null));
        expect(shadowed.map((l) => l.name), `${id} ${tier}`).toEqual(["look key light"]);
        expect(shadowed[0]!.shadow, `${id} ${tier}`).toMatchObject(tier === "high" ? { filter: "pcss", cascades: 3 } : { filter: "pcf", cascades: 1 });
      }
    }
  });

  it("LINKS-02: six distinct catalogue HDRIs, each emitted as the look environment and rotated toward the sun", () => {
    const ids = IDS.map((id) => COURSE_LOOKS[id].hdri.id);
    expect(new Set(ids).size).toBe(6);
    for (const hdri of ids) expect(lookHdriIds).toContain(hdri);
    expect(COURSE_LOOKS.neonBay.hdri.drawn).toBe(false);
    for (const id of IDS) {
      const env = rigNodes(id).filter((n) => n.kind === "environment");
      expect(env.map((e) => e.name), id).toEqual([`look hdri ${COURSE_LOOKS[id].hdri.id}_1k`]);
      const row = COURSE_LOOKS[id];
      if (!row.hdri.drawn) expect(env[0]!.background, id).toBe(false);
      if (row.hdri.sunAzimuthInHdriDeg !== null) {
        const rot = hdriRotationDeg(row);
        expect((((row.hdri.sunAzimuthInHdriDeg + rot) % 360) + 360) % 360, id).toBeCloseTo(row.sun.azimuthDeg, 0);
        expect(env[0]!.rotation, id).toBeCloseTo((rot * Math.PI) / 180, 5);
      }
    }
  });

  it("LINKS-03: haar and ash are height fogs, Cinder alone has god rays (High), Mare has no fog node", () => {
    const fogOf = (id: CourseId) => rigNodes(id).filter((n) => n.kind === "effect" && n.effect === "fog");
    expect(fogOf("stAuroras")[0]).toMatchObject({ mode: "height", color: COURSE_LOOKS.stAuroras.fog!.color });
    expect(fogOf("cinderRim")[0]).toMatchObject({ mode: "height" });
    expect(fogOf("mapleHollow")[0]).toMatchObject({ mode: "exp2" });
    expect(fogOf("mareCourse")).toEqual([]);
    for (const id of IDS) {
      for (const fog of fogOf(id)) expect(typeof fog.maxOpacity, id).toBe("number");
      const rays = rigNodes(id).filter((n) => n.effect === "volumetric-fog");
      expect(rays.length, id).toBe(id === "cinderRim" ? 1 : 0);
      if (id === "cinderRim") expect(rays[0]!.godRayDensity).toBe(COURSE_LOOKS.cinderRim.godRays!.density);
    }
    expect(rigNodes("cinderRim", "low").some((n) => n.effect === "volumetric-fog")).toBe(false);
  });

  it("LINKS-04: per-course grade and post; grain only on Maple (High), no blanket vignette", () => {
    for (const id of IDS) {
      const o = lookOverridesFor(COURSE_LOOKS[id], "high");
      expect(o.grade).toEqual(COURSE_LOOKS[id].grade);
      const grade = rigNodes(id).find((n) => n.name === "look color grade");
      expect(grade?.temperature, id).toBe(COURSE_LOOKS[id].grade.temperature);
      const grain = rigNodes(id).filter((n) => n.effect === "film-grain");
      expect(grain.length, id).toBe(id === "mapleHollow" ? 1 : 0);
      expect(rigNodes(id, "low").some((n) => n.effect === "film-grain"), id).toBe(false);
      const vignettes = rigNodes(id).filter((n) => n.effect === "vignette");
      expect(vignettes.length, id).toBe(COURSE_LOOKS[id].vignette ? 1 : 0);
    }
    expect(hueDistance(hueDeg(COURSE_LOOKS.stAuroras.key.color), hueDeg(COURSE_LOOKS.mapleHollow.key.color))).toBeGreaterThan(0);
    expect(COURSE_LOOKS.stAuroras.grade.temperature).toBeLessThan(0);
    expect(COURSE_LOOKS.mapleHollow.grade.temperature).toBeGreaterThan(0);
  });

  it("LINKS-14: HUD accents at least 30 deg apart in hue", () => {
    for (let i = 0; i < IDS.length; i++) {
      for (let j = i + 1; j < IDS.length; j++) {
        const d = hueDistance(hueDeg(COURSE_LOOKS[IDS[i]!].accent), hueDeg(COURSE_LOOKS[IDS[j]!].accent));
        expect(d, `${IDS[i]} vs ${IDS[j]}`).toBeGreaterThanOrEqual(30);
      }
    }
  });

  it("LINKS-16 and the art direction: practicals stay within 4 non-key lights on every hole", () => {
    for (const id of IDS) {
      COURSES[id].holes.forEach((_, hole) => {
        const lights = rigNodes(id, "high", hole).filter((n) => n.kind === "light");
        expect(lights.length - 1, `${id} hole ${hole + 1}`).toBeLessThanOrEqual(4);
      });
    }
    expect(rigNodes("neonBay").filter((n) => n.light === "spot").length).toBe(2);
  });

  it("LINKS-13 and LINKS-18 reduced motion: flag stiff on Mare and under reduced motion, ambient particles halve, none on Low", () => {
    expect(flagFlutterAmplitude(COURSE_LOOKS.mareCourse, 8, false)).toBe(0);
    expect(flagFlutterAmplitude(COURSE_LOOKS.stAuroras, 6, true)).toBe(0);
    expect(flagFlutterAmplitude(COURSE_LOOKS.stAuroras, 6, false)).toBeGreaterThan(flagFlutterAmplitude(COURSE_LOOKS.stAuroras, 1, false));
    let total = 0;
    for (const id of IDS) {
      const row = COURSE_LOOKS[id];
      const high = ambientParticleCount(row, "high", false);
      total = Math.max(total, high);
      expect(ambientParticleCount(row, "low", false), id).toBe(0);
      expect(ambientParticleCount(row, "high", true), id).toBe(Math.floor(high / 2));
    }
    expect(total).toBeLessThanOrEqual(2000);
  });
});
