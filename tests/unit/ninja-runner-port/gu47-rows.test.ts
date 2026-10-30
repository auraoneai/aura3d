import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HUD_THEMES, hudThemeFontFaces } from "../../../packages/game/src/hud/themes";
import { DISTRICT_SEALS, districtLabel } from "../../../examples/ninja-runner-port/labels";
import { TUNING } from "../../../examples/ninja-runner-port/sim";
import { EVENING_SURFACES, LANTERN_GLOW, lanternGlowAt } from "../../../examples/ninja-runner-port/districtLook";
import { LAYERS } from "../../../examples/ninja-runner-port/scenery";

describe("ninja-runner-port evening surfaces (GU47 NR-11)", () => {
  it("lacquers the tiled roof layers and dampens the rocks, only on real layers", () => {
    const ids = new Set(LAYERS.map((l) => l.id));
    for (const id of Object.keys(EVENING_SURFACES)) expect(ids.has(id)).toBe(true);
    for (const id of ["roofs", "hips", "capcones"]) {
      const coat = EVENING_SURFACES[id]!;
      expect(coat.clearcoat).toBeGreaterThanOrEqual(0.5);
      expect(coat.roughness).toBeLessThan(LAYERS.find((l) => l.id === id)!.roughness);
    }
    expect(EVENING_SURFACES.rocks!.roughness).toBeLessThan(LAYERS.find((l) => l.id === "rocks")!.roughness);
    expect(EVENING_SURFACES.lanterns).toBeUndefined();
  });

  it("splits the lanterns into three glow groups that brighten with the evening", () => {
    expect(lanternGlowAt(100)).toBe("day");
    expect(lanternGlowAt(700)).toBe("day");
    expect(lanternGlowAt(1300)).toBe("dusk");
    expect(lanternGlowAt(1900)).toBe("night");
    expect(lanternGlowAt(2500)).toBe("night");
    expect(LANTERN_GLOW.day.intensity).toBeLessThan(LANTERN_GLOW.dusk.intensity);
    expect(LANTERN_GLOW.dusk.intensity).toBeLessThan(LANTERN_GLOW.night.intensity);
    expect(Object.keys(LANTERN_GLOW)).toHaveLength(3); // +2 draws over the single original lantern layer
  });
});

describe("ninja-runner-port ink-scroll HUD (GU47 NR-19)", () => {
  const html = readFileSync("apps/showcase-ninja-runner-port/index.html", "utf8");
  const css = readFileSync("apps/showcase-ninja-runner-port/public/fonts/ink-scroll.css", "utf8");

  it("ships the theme's licensed faces byte for byte under the theme family names", () => {
    for (const face of hudThemeFontFaces("ink-scroll")) {
      const copy = readFileSync(`apps/showcase-ninja-runner-port/public/fonts/${face.file}`);
      const source = readFileSync(`packages/game/src/fonts/${face.file}`);
      expect(createHash("sha256").update(copy).digest("hex")).toBe(createHash("sha256").update(source).digest("hex"));
      expect(css).toContain(`font-family: "${face.family}"`);
      expect(css).toContain(`./${face.file}`);
    }
    const theme = HUD_THEMES["ink-scroll"];
    expect(html).toContain(`--a3g-font: ${theme["--a3g-font"]}`);
    expect(html).toContain(`--a3g-font-display: ${theme["--a3g-font-display"]}`);
    expect(html).toContain('href="./fonts/ink-scroll.css"');
  });

  it("puts one seal per district on the scroll at the district's start", () => {
    for (const seal of DISTRICT_SEALS) {
      const pct = ((seal.at / TUNING.length) * 100).toFixed(1);
      expect(html).toContain(`<em data-seal="${seal.at}" style="left:${pct === "0.0" ? "0" : pct}%" aria-hidden="true">${seal.letter}</em>`);
      expect(districtLabel(seal.at === 0 ? 0 : seal.at)).toBe(seal.at === 0 ? "Lantern Village" : seal.district);
    }
  });

  it("scopes the theme to the evening look and keeps 44 px controls", () => {
    const start = html.indexOf("GU47 NR-19");
    const rules = html.slice(start, html.indexOf("</style>", start));
    for (const line of rules.split("\n").filter((l) => l.includes("{") && !l.includes("@media") && !l.includes("@font-face"))) {
      const selector = line.trim().split("{")[0]!;
      if (selector.startsWith("#progress > em") || selector.startsWith("html")) continue; // hidden outside the theme; NR-18 shot bars
      if (selector.length > 0 && !selector.startsWith("/*")) expect(selector).toMatch(/\.ink-scroll/);
    }
    expect(rules).toContain(".ink-scroll button { ");
    expect(rules).toMatch(/\.ink-scroll button \{[^}]*min-height: 44px/);
  });
});

describe("ninja-runner-port camera shots (GU47 NR-18)", async () => {
  const cine = await import("../../../examples/ninja-runner-port/cinematics");
  const { cameraEye } = await import("../../../examples/ninja-runner-port/scenery");
  const { groundFrame } = await import("../../../examples/ninja-runner-port/course");
  const chaseAt = (s: number) => { const e = cameraEye(s, 0, 0); const l = groundFrame(s + 12, 0, 1.6); return { eye: [e.x, e.y, e.z] as [number, number, number], look: [l.x, l.y, l.z] as [number, number, number], fov: 57 }; };

  it("hangs the title shot more than 20 m above the runner's ground", () => {
    for (const t of [0, 3, 20]) expect(cine.introPose(0, t).eye[1] - groundFrame(0, 0, 0).y).toBeGreaterThan(20);
  });

  it("lands exactly on the chase pose when the countdown ends, and moves smoothly on the way", () => {
    const chase = chaseAt(0);
    expect(cine.blendIntro(chase, 0, 5, 1)).toBe(chase);
    const near = cine.blendIntro(chase, 0, 5, 0.995);
    expect(Math.hypot(near.eye[0] - chase.eye[0], near.eye[1] - chase.eye[1], near.eye[2] - chase.eye[2])).toBeLessThan(0.5);
    let prev = cine.blendIntro(chase, 0, 5, 0).eye;
    for (let k = 0.02; k <= 1.0001; k += 0.02) {
      const e = cine.blendIntro(chase, 0, 5, k).eye;
      expect(Math.hypot(e[0] - prev[0], e[1] - prev[1], e[2] - prev[2])).toBeLessThan(2);
      prev = e;
    }
  });

  it("plays three win shots at fixed times", () => {
    expect([0, 1, 1.9, 3, 3.7, 9].map(cine.winShotIndex)).toEqual([0, 0, 1, 1, 2, 2]);
    const eyes = [0.5, 2.5, 4.5].map((t) => cine.winPose(2600, 0, t).eye);
    expect(new Set(eyes.map((e) => e.map((v) => v.toFixed(1)).join())).size).toBe(3);
  });

  it("caps the lane roll at 3 degrees and leans against the lane change", () => {
    const max = (3 * Math.PI) / 180;
    expect(Math.abs(cine.laneRoll(1e6))).toBeCloseTo(max, 10);
    expect(Math.abs(cine.laneRoll(-1e6))).toBeCloseTo(max, 10);
    expect(cine.laneRoll(0)).toBe(0);
    expect(cine.laneRoll(Number.NaN)).toBe(0);
    expect(Math.sign(cine.laneRoll(5))).toBe(-1);
  });

  it("skips every shot under reduced motion and on ?look=original (reduced-motion path)", () => {
    expect(cine.cinematicsOn(true, false)).toBe(true);
    expect(cine.cinematicsOn(true, true)).toBe(false);
    expect(cine.cinematicsOn(false, false)).toBe(false);
  });
});

describe("ninja-runner-port gate cones and dash kick (GU47 NR-16, NR-10)", async () => {
  const cine = await import("../../../examples/ninja-runner-port/cinematics");
  it("picks the last four lanterns from the Valley Gate on, in course order", () => {
    const lanterns = [100, 900, 2250, 2300, 2400, 2500, 2550, 2600].map((s) => ({ s }));
    expect(cine.gateConeLanterns(lanterns).map((l) => l.s)).toEqual([2400, 2500, 2550, 2600]);
    expect(cine.gateConeLanterns(lanterns.slice(0, 3))).toEqual([]);
  });
  it("kicks the dash FOV by a few degrees, quickly", () => {
    expect(cine.DASH_KICK_DEG).toBeGreaterThan(0);
    expect(cine.DASH_KICK_DEG).toBeLessThanOrEqual(8);
    expect(cine.DASH_KICK_HALFLIFE).toBeLessThan(0.2);
  });
});
