import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { COURSES, buildHoleTerrain } from "../../../apps/showcase-aura-links-3d/src/game/courses";
import {
  HOLE_CARD_PANEL_ALPHA,
  HOLE_MAP_SIZE,
  HUD_PANEL,
  holeCardTransition,
  holeCardVisible,
  holeMap,
  holeMapSvg,
  holeSubtitle,
  holeTitle,
  panelOver,
  shotStatsLabel
} from "../../../apps/showcase-aura-links-3d/src/game/holeCard";
import { COURSE_LOOKS, contrastRatio } from "../../../apps/showcase-aura-links-3d/src/game/lighting";
import type { CourseId, HoleSpec, HoleTerrain } from "../../../apps/showcase-aura-links-3d/src/game/types";

/** GU47 WP-20 LINKS-14: the broadcast HUD (hole-card lower third, course accents, licensed faces). */

const app = resolve(__dirname, "../../../apps/showcase-aura-links-3d");
const IDS = Object.keys(COURSE_LOOKS) as CourseId[];
const { w, h, pad } = HOLE_MAP_SIZE;

/** A straight hole up +Z with a dogleg point to the player's right of the opening line, for the handedness check. */
function syntheticHole(yaw: number, rightOffset: number): { hole: HoleSpec; terrain: HoleTerrain } {
  const f = [Math.sin(yaw), Math.cos(yaw)];
  // turning right (D) lowers the yaw (aim.ts): the player's right is the yaw - 90 deg direction
  const r = [Math.sin(yaw - Math.PI / 2), Math.cos(yaw - Math.PI / 2)];
  const p = (a: number, s: number): [number, number] => [f[0]! * a + r[0]! * s, f[1]! * a + r[1]! * s];
  const path = [p(0, 0), p(120, 0), p(200, rightOffset)];
  const cup = path[2]!;
  const hole = {
    number: 1,
    name: "Test",
    par: 4,
    handicap: 1,
    lengthM: 220,
    layout: { path, fairwayWidth: 30, greenRadius: 12, teePos: [0, 0], bunkers: [], water: [], woods: [], elevation: [], greenBreak: [0, 0], roughAmp: 0 }
  } as unknown as HoleSpec;
  const terrain = { tee: [0, 0, 0], cup: [cup[0], 0, cup[1]], lineYaw: yaw } as unknown as HoleTerrain;
  return { hole, terrain };
}

describe("LINKS-14 hole map", () => {
  it("matches every hole's path: tee at the bottom centre, a scaled copy of the line of play inside the map", () => {
    for (const id of IDS) {
      const course = COURSES[id];
      for (const hole of course.holes) {
        const terrain = buildHoleTerrain(course, hole);
        const map = holeMap(hole, terrain);
        const label = `${id} hole ${hole.number}`;
        expect(map.tee, label).toEqual([w / 2, h - pad]);
        expect(map.path.length, label).toBe(hole.layout.path.length + 1);
        for (const [x, y] of [...map.path, map.cup]) {
          expect(x, label).toBeGreaterThanOrEqual(0);
          expect(x, label).toBeLessThanOrEqual(w);
          expect(y, label).toBeGreaterThanOrEqual(0);
          expect(y, label).toBeLessThanOrEqual(h);
        }
        // the cup is the path's last point, and the green fits inside the map
        expect(map.cup, label).toEqual(map.path[map.path.length - 1]);
        expect(map.cup[1] - map.greenR, label).toBeGreaterThanOrEqual(pad - 0.02);
        // a similarity: every segment keeps its length times the map scale (the two-decimal rounding aside)
        const world: [number, number][] = [[terrain.tee[0], terrain.tee[2]], ...hole.layout.path.map((q) => [q[0], q[1]] as [number, number])];
        for (let i = 1; i < world.length; i++) {
          const wl = Math.hypot(world[i]![0] - world[i - 1]![0], world[i]![1] - world[i - 1]![1]);
          const ml = Math.hypot(map.path[i]![0] - map.path[i - 1]![0], map.path[i]![1] - map.path[i - 1]![1]);
          expect(Math.abs(ml - wl * map.scale), `${label} segment ${i}`).toBeLessThan(0.05);
        }
        // the green sits up the map from the tee
        expect(map.cup[1], label).toBeLessThan(map.tee[1]);
      }
    }
  });

  it("draws a dogleg to the player's right on the right of the map, at any opening yaw", () => {
    for (const yaw of [0, 0.4, -0.7, 1.2, Math.PI]) {
      const right = syntheticHole(yaw, 40);
      expect(holeMap(right.hole, right.terrain).cup[0], `yaw ${yaw} right`).toBeGreaterThan(w / 2 + 1);
      const left = syntheticHole(yaw, -40);
      expect(holeMap(left.hole, left.terrain).cup[0], `yaw ${yaw} left`).toBeLessThan(w / 2 - 1);
    }
  });

  it("marks every bunker and water hazard and the line of play in the SVG", () => {
    const course = COURSES.mapleHollow;
    for (const hole of course.holes) {
      const svg = holeMapSvg(holeMap(hole, buildHoleTerrain(course, hole)));
      expect((svg.match(/class="hm-bunker"/g) ?? []).length).toBe(hole.layout.bunkers.length);
      expect((svg.match(/class="hm-water"/g) ?? []).length).toBe(hole.layout.water.length);
      expect(svg).toContain('class="hm-line"');
      expect(svg).toContain('class="hm-pin"');
      expect(svg).not.toMatch(/NaN|Infinity/);
    }
  });
});

describe("LINKS-14 lower third text", () => {
  it("is sentence case, and the stats chip carries carry, roll and the distance to the pin", () => {
    const hole = COURSES.stAuroras.holes[0]!;
    expect(holeTitle(hole)).toBe(`Hole 1 · ${hole.name}`);
    expect(holeSubtitle(hole, "St Auroras")).toBe(`Par ${hole.par} · ${hole.lengthM} m · St Auroras`);
    expect(shotStatsLabel({ club: "7 Iron", carry: 148.6, roll: 9.2, toPin: 21.4 })).toBe("7 iron · 149 m carry · 9 m roll · 21 m to pin");
  });

  it("is up at address and between shots in a round, never in the labs, the swing, the flight or ?look=original", () => {
    const base = { look: "gu47" as const, lab: false, hasRound: true };
    expect(holeCardVisible({ ...base, phase: "address" })).toBe(true);
    expect(holeCardVisible({ ...base, phase: "between" })).toBe(true);
    for (const phase of ["swing", "flight", "menu", "card", "roundover"]) expect(holeCardVisible({ ...base, phase }), phase).toBe(false);
    expect(holeCardVisible({ ...base, phase: "address", lab: true })).toBe(false);
    expect(holeCardVisible({ ...base, phase: "address", hasRound: false })).toBe(false);
    expect(holeCardVisible({ ...base, phase: "address", look: "original" })).toBe(false);
  });

  it("reduced motion: the lower third appears without its fade and rise", () => {
    expect(holeCardTransition(true)).toBe("none");
    expect(holeCardTransition(false)).toMatch(/opacity .*transform/);
  });
});

describe("LINKS-14 accents and faces", () => {
  it("every course accent holds 4.5:1 on the HUD panel and the lower third over any backdrop (worst case: white)", () => {
    for (const id of IDS) {
      const accent = COURSE_LOOKS[id].accent;
      for (const backdrop of ["#ffffff", "#000000", COURSE_LOOKS[id].background]) {
        expect(contrastRatio(accent, panelOver(backdrop)), `${id} HUD panel over ${backdrop}`).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(accent, panelOver(backdrop, HOLE_CARD_PANEL_ALPHA)), `${id} lower third over ${backdrop}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    // the lower third's title and subtitle colours (index.html --ink, --muted)
    for (const text of ["#f2f6ea", "#8fa098"]) expect(contrastRatio(text, panelOver("#ffffff", HOLE_CARD_PANEL_ALPHA))).toBeGreaterThanOrEqual(4.5);
    expect(HUD_PANEL.alpha).toBe(0.85);
  });

  it("index.html wears the panel colour the contrast test assumes and scopes the broadcast HUD to the GU47 look", () => {
    const html = readFileSync(resolve(app, "index.html"), "utf8");
    expect(html).toContain('body[data-look="gu47"] .hole-card');
    expect(html).toContain(`rgba(${HUD_PANEL.rgb.join(", ")}, ${HUD_PANEL.alpha})`);
    expect(html).toContain(`rgba(${HUD_PANEL.rgb.join(", ")}, ${HOLE_CARD_PANEL_ALPHA})`);
    expect(html).toMatch(/id="hole-card"/);
    const main = readFileSync(resolve(app, "src/main.ts"), "utf8");
    expect(main).toContain("document.body.dataset.look = lookMode");
    expect(main).toMatch(/setProperty\("--accent", COURSE_LOOKS\[state\.courseId\]\.accent\)/);
  });

  it("sets HUD text in the self-hosted licensed faces only (Whitney, DIN Pro): no Barlow, Inter, Roboto or Google Fonts", () => {
    const html = readFileSync(resolve(app, "index.html"), "utf8");
    const css = readFileSync(resolve(app, "public/fonts/fonts.css"), "utf8");
    for (const src of [html, css]) {
      expect(src).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
      for (const line of src.split("\n").filter((l) => /font-family\s*:|--font-[a-z]+\s*:/.test(l))) {
        expect(line).not.toMatch(/\b(Barlow|Inter|Roboto|Geist|Open Sans)\b/);
      }
    }
    expect(html).toContain('href="./fonts/fonts.css"');
    // every face the stylesheet declares is a committed web font (WOFF2 or WOFF magic)
    const files = [...css.matchAll(/url\("\.\/([^"]+)"\)/g)].map((m) => m[1]!);
    expect(new Set(files)).toEqual(new Set(["whitney-regular.woff2", "whitney-medium.woff2", "dinpro-regular.woff", "dinpro-medium.woff"]));
    for (const file of files) {
      const magic = readFileSync(resolve(app, "public/fonts", file)).subarray(0, 4).toString("latin1");
      expect(magic, file).toBe(file.endsWith(".woff2") ? "wOF2" : "wOFF");
    }
    // product weights only: 400 and 500
    for (const m of css.matchAll(/font-weight:\s*(\d+)/g)) expect(["400", "500"]).toContain(m[1]);
  });
});
