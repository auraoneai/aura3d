import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { COURSES, buildHoleTerrain, pondGeometry } from "../../../apps/showcase-aura-links-3d/src/game/courses";
import {
  LAVA_FLOW_MPS,
  MAX_MIRRORS,
  hasMirrorWater,
  lavaFlow,
  lavaSpec,
  pondColors,
  pondWaterOptions,
  reflectivePonds
} from "../../../apps/showcase-aura-links-3d/src/game/water";
import type { CourseId } from "../../../apps/showcase-aura-links-3d/src/game/types";

/** GU47 WP-20 LINKS-17: reflecting ponds and harbour (world.water lakes), Cinder Rim lava. */

const IDS = Object.keys(COURSES) as CourseId[];
const HIGH = { tier: "high", look: "gu47" } as const;

describe("LINKS-17 reflecting water", () => {
  it("at most two reflecting ponds per hole (the largest), High tier GU47 only, never on lava or lunar courses", () => {
    let total = 0;
    for (const id of IDS) {
      const course = COURSES[id];
      for (const hole of course.holes) {
        const terrain = buildHoleTerrain(course, hole);
        const ponds = reflectivePonds(terrain, hole, course.dressing.theme, HIGH);
        const label = `${id} ${hole.number}`;
        expect(ponds.length, label).toBeLessThanOrEqual(MAX_MIRRORS);
        if (!hasMirrorWater(course.dressing.theme)) expect(ponds).toEqual([]);
        else expect(ponds.length, label).toBe(Math.min(MAX_MIRRORS, hole.layout.water.length));
        expect(reflectivePonds(terrain, hole, course.dressing.theme, { tier: "low", look: "gu47" })).toEqual([]);
        expect(reflectivePonds(terrain, hole, course.dressing.theme, { tier: "high", look: "original" })).toEqual([]);
        for (const p of ponds) {
          const w = hole.layout.water[p.index]!;
          const g = pondGeometry(terrain, w);
          // the lake sits where the 4.6.2 water cylinder's top was, with its drawn radius
          expect(p.y).toBeCloseTo(g.surfaceY + 0.03, 9);
          expect(p.radius).toBeCloseTo(g.pondDiameter / 2, 9);
          expect(p.center).toEqual([w.center[0], w.center[1]]);
        }
        total += ponds.length;
      }
    }
    expect(total).toBe(22);
  });

  it("is a calm planar-reflecting lake in the course's water hue; reduced motion holds the surface still", () => {
    const pond = { index: 0, center: [1, 2] as const, radius: 9, y: 0.4 };
    const live = pondWaterOptions(pond, "#154c79", false);
    expect(live.shape).toEqual({ kind: "circle", center: [1, 2], radius: 9 });
    expect(live.height).toBe(0.4);
    expect(live.reflection.high).toBe("planar");
    expect(live.reflection.low).toBe("ibl");
    expect(Object.values(live.refraction).every((v) => v === false)).toBe(true);
    expect(live.waves).toBe("calm");
    expect(live.normalSpeed).toBeGreaterThan(0);
    const still = pondWaterOptions(pond, "#154c79", true);
    expect(still.waves).toEqual([]);
    expect(still.normalSpeed).toBe(0);
    const c = pondColors("#154c79");
    expect(c.shallowColor).not.toBe(c.deepColor);
  });

  it("main.ts swaps the water cylinder for the lake and keeps bank and rim", () => {
    const main = readFileSync(resolve(__dirname, "../../../apps/showcase-aura-links-3d/src/main.ts"), "utf8");
    expect(main).toMatch(/if \(pond\) \{[\s\S]*?pond-bank-[\s\S]*?pond-rim-[\s\S]*?world\.water\(pondWaterOptions\(pond, pal\.water, state\.reducedMotion\)[\s\S]*?return;\s*\}/);
  });
});

describe("LINKS-17 lava", () => {
  it("scrolls in world metres and stops under reduced motion (PRD §6.3)", () => {
    expect(lavaFlow(false)).toBe(LAVA_FLOW_MPS);
    expect(lavaFlow(true)).toBe(0);
    expect(lavaSpec(true).uniforms.lavaFlow.value).toBe(0);
    expect(lavaSpec(false).uniforms.lavaFlow.value).toBeGreaterThan(0);
    const spec = lavaSpec(false);
    expect(spec.fog).toBe(true);
    expect(spec.castShadow).toBe(false);
    expect(spec.glsl.fragment).toContain("uTime * lavaFlow");
    expect(spec.glsl.fragment).toMatch(/out vec4 outColor;/);
    expect(spec.glsl.vertex).toContain("modelMatrix * vec4(position, 1.0)");
  });

  it("is hot: the molten colour is linear HDR orange and the crust stays dark", () => {
    const { lavaHot, lavaCrust } = lavaSpec(false).uniforms;
    expect(lavaHot.value[0]).toBeGreaterThan(lavaHot.value[1]);
    expect(lavaHot.value[1]).toBeGreaterThan(lavaHot.value[2]);
    expect(lavaHot.value[0] * 1.4).toBeGreaterThan(1);
    expect(Math.max(...lavaCrust.value)).toBeLessThan(0.15);
  });

  it("only Cinder Rim's pools are lava, on the GU47 look", () => {
    const main = readFileSync(resolve(__dirname, "../../../apps/showcase-aura-links-3d/src/main.ts"), "utf8");
    expect(main).toContain('lookMode !== "original" && theme4(course) === "volcanic" ? material.custom(lavaSpec(state.reducedMotion)');
    expect(COURSES.cinderRim.dressing.theme).toBe("volcanic");
  });
});
