/**
 * Owner report (2026-11-18, St Auroras hole 1, second shot): "the golfer stands ~2 m from the ball". The real ball was at the
 * clubhead (QA nodes: golf-ball within 1 cm of golfer-club-head, golfer-body 0.52 m off); the white dot on screen was a
 * dunes wildflower accent, an off-white 9 cm sphere in the rough. No ground cover may read as a spare golf ball.
 */
import { describe, expect, it } from "vitest";
import { COVER_LAYERS } from "../../../apps/showcase-aura-links-3d/src/game/groundCover";

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];

describe("no ground cover reads as a golf ball", () => {
  it("no small sphere-ish cover instance is white / near-white", () => {
    for (const [theme, layers] of Object.entries(COVER_LAYERS)) {
      for (const layer of layers) {
        if (layer.shape !== "sphere") continue;
        const small = Math.max(...layer.size) < 0.25;
        if (!small) continue;
        for (const c of layer.colors) {
          const [r, g, b] = rgb(c);
          const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          const sat = Math.max(r, g, b) - Math.min(r, g, b);
          expect(luma > 0.75 && sat < 0.2, `${theme} ${layer.name} ${c} looks like a golf ball`).toBe(false);
        }
      }
    }
  });
});

import { COURSES, buildHoleTerrain } from "../../../apps/showcase-aura-links-3d/src/game/courses";
import { ROCK_FLATTEN, TEE_COVER_CLEAR_M, groundCover } from "../../../apps/showcase-aura-links-3d/src/game/groundCover";
import { buildTeeFurnitureNodes } from "../../../apps/showcase-aura-links-3d/src/art/proceduralModels";
import type { CourseId, CourseTheme } from "../../../apps/showcase-aura-links-3d/src/game/types";

/**
 * Owner report (2026-11-18, Mare hole 4 tee): "a ball ~1-2 m up the aim line" while the QA golf-ball node sat at the
 * clubhead. Mare's "bright pebble" accents were 0.18-0.42 m grey domes (#8a8c92, #9a9ca2) over the #7a7d84 regolith
 * rough: a mid-grey sphere brighter than the ground around it reads as a ball once the regolith is lit, white or not.
 * A cover colour is a ball look-alike when it is near-neutral (max - min channel < NEUTRAL_SAT) and brighter than the
 * course's rough (or near-white); an instance when it is also small and sphere-ish (shortest / longest extent > 0.55).
 */
const NEUTRAL_SAT = 0.25;
const SPHEREISH = 0.55;
const SMALL_M = 0.6;
const luma = (hex: string) => { const [r, g, b] = rgb(hex); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const sat = (hex: string) => { const c = rgb(hex); return Math.max(...c) - Math.min(...c); };
const IDS = Object.keys(COURSES) as CourseId[];
const roughOf = (theme: CourseTheme) => IDS.filter((id) => COURSES[id].dressing.theme === theme).map((id) => COURSES[id].palette.rough);
const ballish = (hex: string, ground: string) => sat(hex) < NEUTRAL_SAT && (luma(hex) > luma(ground) || luma(hex) > 0.75);

describe("no ground cover reads as a golf ball (mid-grey, brighter than the ground, round)", () => {
  it("no small round cover colour is near-neutral and brighter than its course's rough", () => {
    for (const [theme, layers] of Object.entries(COVER_LAYERS) as [CourseTheme, (typeof COVER_LAYERS)[CourseTheme]][]) {
      for (const layer of layers) {
        if (layer.shape !== "sphere" || Math.max(...layer.size) * 1.4 >= SMALL_M) continue;
        for (const ground of roughOf(theme)) {
          for (const c of layer.colors) expect(ballish(c, ground), `${theme} ${layer.name} ${c} over ${ground}`).toBe(false);
        }
      }
    }
    // Mare: every rock is darker than the regolith (fairway and rough) and below its luma
    for (const layer of COVER_LAYERS.lunar) {
      for (const c of layer.colors) {
        expect(luma(c), c).toBeLessThan(luma(COURSES.mareCourse.palette.rough));
        expect(luma(c), c).toBeLessThan(luma(COURSES.mareCourse.palette.fairway));
      }
    }
  });

  it("no placed instance is small, sphere-ish and near-neutral; Mare's rocks are flat (wider than tall) and sunk", () => {
    for (const id of IDS) {
      const course = COURSES[id];
      for (const hole of course.holes.slice(0, 4)) {
        const terrain = buildHoleTerrain(course, hole);
        for (const plan of groundCover(terrain, course.dressing.theme, hole.number, "high")) {
          plan.transforms.forEach((t, i) => {
            const ext = [0, 1, 2].map((k) => plan.layer.size[k]! * t.scale[k]!);
            const aspect = Math.min(...ext) / Math.max(...ext);
            const label = `${id} ${hole.number} ${plan.layer.name} #${i} ${plan.colors[i]} ext ${ext.map((e) => e.toFixed(2)).join("x")}`;
            const round = plan.layer.shape === "sphere" && aspect > SPHEREISH && Math.max(...ext) < SMALL_M;
            if (round) expect(sat(plan.colors[i]!) >= NEUTRAL_SAT, label).toBe(true);
            if (plan.layer.rock) {
              expect(ext[1]! / Math.max(ext[0]!, ext[2]!), label).toBeLessThanOrEqual(ROCK_FLATTEN[1] + 1e-9);
              // the centre sits below the ground: only a low cap shows
              expect(t.position[1], label).toBeLessThan(terrain.height(t.position[0], t.position[2]));
              // irregular: not the same scale on x and z for every rock
            }
          });
          if (plan.layer.rock && plan.transforms.length > 10) {
            const ratios = new Set(plan.transforms.map((t) => (t.scale[0] / t.scale[2]).toFixed(2)));
            expect(ratios.size, `${id} ${plan.layer.name} irregular proportions`).toBeGreaterThan(10);
          }
        }
      }
    }
  });

  it(`keeps every course's cover at least ${TEE_COVER_CLEAR_M} m from the tee spot (the tee box plus ~3 m)`, () => {
    // the tee box is 8.4 x 6.4 m around terrain.tee; the ball at address sits on it
    expect(TEE_COVER_CLEAR_M).toBeGreaterThanOrEqual(Math.hypot(8.4 / 2, 6.4 / 2) + 2.5);
    for (const id of IDS) {
      const course = COURSES[id];
      for (const hole of course.holes) {
        const terrain = buildHoleTerrain(course, hole);
        for (const plan of groundCover(terrain, course.dressing.theme, hole.number, "high")) {
          for (const t of plan.transforms) {
            const d = Math.hypot(t.position[0] - terrain.tee[0], t.position[2] - terrain.tee[2]);
            expect(d, `${id} ${hole.number} ${plan.layer.name}`).toBeGreaterThanOrEqual(TEE_COVER_CLEAR_M);
          }
        }
      }
    }
  });

  it("the small round props on the tee (the two markers) are a saturated colour, never a pale neutral", () => {
    for (const id of IDS) {
      const course = COURSES[id];
      const hole = course.holes[0]!;
      const nodes = buildTeeFurnitureNodes(course, hole, buildHoleTerrain(course, hole), true).map((n: any) => (typeof n.toJSON === "function" ? n.toJSON() : n));
      const markers = nodes.find((n: any) => n.name === "tee-markers");
      expect(markers, id).toBeTruthy();
      const color = String(markers.material.color);
      expect(ballish(color, course.palette.teeBox), `${id} tee markers ${color}`).toBe(false);
      expect(sat(color), id).toBeGreaterThanOrEqual(NEUTRAL_SAT);
    }
  });
});

import { buildGolfBallNode } from "../../../apps/showcase-aura-links-3d/src/art/proceduralModels";

describe("the one golf ball's geometry sits on its node origin", () => {
  it("geometry bounds centre is (0, r, 0): the drawn ball is where the node (= round.ballPos at address) is", () => {
    const r = 0.02135;
    const j: any = buildGolfBallNode(r, true).toJSON();
    const find = (o: any): number[] | null => {
      if (!o || typeof o !== "object") return null;
      if (Array.isArray(o.positions) && o.positions.length > 9) return o.positions;
      if (o.positions instanceof Float32Array) return Array.from(o.positions);
      for (const v of Object.values(o)) { const f = find(v); if (f) return f; }
      return null;
    };
    const p = find(j);
    expect(p, "ball mesh positions").not.toBeNull();
    const ax = [0, 1, 2].map((k) => { const v = p!.filter((_, i) => i % 3 === k); return (Math.min(...v) + Math.max(...v)) / 2; });
    expect(Math.abs(ax[0]!)).toBeLessThan(0.002);
    expect(Math.abs(ax[1]! - r)).toBeLessThan(0.003);
    expect(Math.abs(ax[2]!)).toBeLessThan(0.002);
  });
});

import { readFileSync } from "node:fs";

describe("the aim line starts at the ball (its near tip is not read as a second ball)", () => {
  it("near end of the 28 m aim line is within 0.25 m of the ball", () => {
    const src = readFileSync(new URL("../../../apps/showcase-aura-links-3d/src/main.ts", import.meta.url), "utf8");
    const gap = Number(src.match(/const AIM_LINE_GAP = ([\d.]+)/)![1]);
    expect(src).toMatch(/Math\.sin\(yaw\) \* \(14 \+ AIM_LINE_GAP\)/);
    expect(gap).toBeLessThanOrEqual(0.25);
  });
});
