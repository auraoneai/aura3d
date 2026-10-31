/**
 * IRON CROWN look table (GU47 WP-15 "The Royal Forge"; PRD §3.2 item 2): one row per venue with its own HDRI, key, fog,
 * grade, bloom and post preset (IC47-L1, L2, E1, E2, E3, P1). Pure data and node builders: no app, no DOM.
 */
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { lookHdriIds, lookOutputPreset, type AuraSceneNode } from "@aura3d/engine";
import {
  backRimPose,
  BLACK_IRON,
  CORE_PALETTE,
  EMBER_CRIMSON,
  FOLLOW_SPOT_ID,
  followSpotPose,
  MOLTEN_GOLD,
  poseDirection,
  RIM_IDS,
  STAGE_LOOKS,
  STAGE_ORDER,
  stageLightNodes,
  stageLook,
  stageLookNode,
  streakLimitFor,
  weatherParticlesFor,
  type StageLookRow
} from "../../../apps/showcase-iron-crown/src/game/look";
import { arenaPostNodes, arenaShaftNodes, arenaWeatherNodes, rimColorOf } from "../../../apps/showcase-iron-crown/src/game/arena";
import { STAGES, type StageId } from "../../../apps/showcase-iron-crown/src/game/stages";
import { FIGHTERS, fighterById } from "../../../apps/showcase-iron-crown/src/game/fighters";

type LightJson = AuraSceneNode & { kind: "light"; light: string; name?: string; color?: string; shadow?: unknown; runtime?: { id?: string } };

const ROWS: readonly StageLookRow[] = STAGES.map((stage) => stageLook(stage.id));
const lookChildren = (row: StageLookRow) => (stageLookNode(row) as AuraSceneNode & { children: AuraSceneNode[] }).children;
const lightsOf = (nodes: readonly AuraSceneNode[]) => nodes.filter((node): node is LightJson => node.kind === "light");

describe("iron-crown look table (GU47 WP-15)", () => {
  it("has exactly one row per venue, in the venue-select order", () => {
    expect(Object.keys(STAGE_LOOKS).sort()).toEqual(STAGES.map((s) => s.id).sort());
    expect([...STAGE_ORDER].sort()).toEqual(STAGES.map((s) => s.id).sort());
    for (const stage of STAGES) {
      expect(stageLook(stage.id).stage).toBe(stage.id);
      expect(stage.lookId).toBe(stageLook(stage.id).look);
      expect(stage.accent).toBe(stageLook(stage.id).accent);
    }
  });

  it("keeps the core palette (black iron, molten gold, ember crimson) and one distinct accent per venue", () => {
    expect(CORE_PALETTE).toEqual([BLACK_IRON, MOLTEN_GOLD, EMBER_CRIMSON]);
    expect(CORE_PALETTE).toEqual(["#0e0b0d", "#d9a441", "#9e1b22"]);
    expect(new Set(ROWS.map((row) => row.accent.toLowerCase())).size).toBe(ROWS.length);
    expect(new Set(ROWS.map((row) => row.timeOfDay)).size).toBe(ROWS.length);
  });

  it("IC47-E1: every venue lights from its own catalogue HDRI (6 distinct, each file <= 6 MB); the Crown is enclosed at 0.55", () => {
    const hdris = ROWS.map((row) => row.hdri);
    expect(new Set(hdris).size).toBe(6);
    expect([...hdris].sort()).toEqual(["industrial_sunset_puresky", "outdoor-midday", "rooftop_night", "spruit_sunrise", "venice_sunset", "warm_bar"]);
    for (const id of hdris) {
      expect(lookHdriIds).toContain(id);
      const file = path.resolve("public/hdri", `${id}_1k.hdr`);
      expect(existsSync(file), file).toBe(true);
      expect(statSync(file).size).toBeLessThanOrEqual(6 * 1024 * 1024);
    }
    const crown = stageLook("crown-arena");
    expect(crown).toMatchObject({ hdri: "warm_bar", environmentIntensity: 0.55, background: BLACK_IRON });
    for (const row of ROWS) {
      const hdri = lookChildren(row).find((node) => node.kind === "environment") as (AuraSceneNode & { name?: string; background?: boolean }) | undefined;
      expect(hdri?.name, row.stage).toBe(`look hdri ${row.hdri}_1k`);
      // An enclosed venue lights from its HDRI without drawing it; outdoor venues show it as the sky.
      if (row.background === "look") expect(hdri?.background, row.stage).not.toBe(false);
      else expect(hdri?.background, row.stage).toBe(false);
    }
  });

  it("IC47-P1: one post preset per venue (arena-fight, neon-night, cinematic-film x2, daylight-outdoor x2), one grade each, grain on the Crown only", () => {
    const expected: Record<StageId, string> = {
      "crown-arena": "arena-fight",
      "neo-tokyo-rooftop": "neon-night",
      "bangkok-dock": "cinematic-film",
      "desert-airbase": "cinematic-film",
      "colosseum-ruins": "daylight-outdoor",
      "himalayan-monastery": "daylight-outdoor"
    };
    for (const row of ROWS) {
      expect(row.post, row.stage).toBe(expected[row.stage]);
      // The look's declared preset is the one the output carries (no duplicate post stage).
      expect(lookOutputPreset([stageLookNode(row)]), row.stage).toBe(row.post);
      const grades = lookChildren(row).filter((node) => (node as { effect?: string }).effect === "color-grade");
      expect(grades, row.stage).toHaveLength(1);
      const blooms = lookChildren(row).filter((node) => (node as { effect?: string }).effect === "bloom");
      expect(blooms, row.stage).toHaveLength(1);
      const grain = arenaPostNodes(row, true).filter((node) => (node as { effect?: string }).effect === "film-grain");
      expect(grain, row.stage).toHaveLength(row.stage === "crown-arena" ? 1 : 0);
    }
    const gradeKeys = ROWS.map((row) => JSON.stringify(row.grade));
    expect(new Set(gradeKeys).size).toBe(ROWS.length);
  });

  it("IC47-L1: outdoor suns at Colosseum 72, Airstrip 10, Monastery 18, Dock 8 deg; the Crown key is a PCSS follow-spot; no look rim anywhere", () => {
    const elevation = (id: StageId) => {
      const key = stageLook(id).key;
      return key.kind === "sun" ? key.elevationDeg : Number.NaN;
    };
    expect(elevation("colosseum-ruins")).toBe(72);
    expect(elevation("desert-airbase")).toBe(10);
    expect(elevation("himalayan-monastery")).toBe(18);
    expect(elevation("bangkok-dock")).toBe(8);
    const crownKey = stageLook("crown-arena").key;
    expect(crownKey.kind).toBe("follow-spot");
    if (crownKey.kind === "follow-spot") expect(crownKey.shadow.filter).toBe("pcss");
    for (const row of ROWS) {
      const children = lookChildren(row);
      expect(children.some((node) => node.kind === "light" && (node as LightJson).name === "look rim light"), row.stage).toBe(false);
      const lookKey = lightsOf(children).find((light) => light.name === "look key light");
      // The follow-spot replaces the look's sun on the Crown; elsewhere the sun is the one shadowed key.
      if (row.key.kind === "follow-spot") expect(lookKey, row.stage).toBeUndefined();
      else expect(lookKey?.shadow, row.stage).toBeTruthy();
    }
  });

  it("IC47-L1: two back rims in each fighter's own emissive colour on every venue; the follow-spot only on the Crown", () => {
    const p1 = fighterById("kenji");
    const p2 = fighterById("jinx");
    const rims = { p1: rimColorOf(p1), p2: rimColorOf(p2) };
    expect(rims).toEqual({ p1: p1.palette.emissive, p2: p2.palette.emissive });
    for (const row of ROWS) {
      const lights = lightsOf(stageLightNodes(row, rims, { p1: -2.2, p2: 2.2 }));
      const rimLights = lights.filter((light) => light.name?.startsWith("fighter back rim"));
      expect(rimLights.map((light) => light.color), row.stage).toEqual([rims.p1, rims.p2]);
      expect(rimLights.map((light) => light.runtime?.id), row.stage).toEqual([RIM_IDS.p1, RIM_IDS.p2]);
      expect(rimLights.every((light) => !light.shadow), row.stage).toBe(true);
      const spots = lights.filter((light) => light.runtime?.id === FOLLOW_SPOT_ID);
      expect(spots, row.stage).toHaveLength(row.key.kind === "follow-spot" ? 1 : 0);
      // One shadowed key per venue: the follow-spot here, the look's sun elsewhere.
      const shadowed = [...lights, ...lightsOf(lookChildren(row))].filter((light) => light.shadow);
      expect(shadowed, row.stage).toHaveLength(1);
    }
    // A studio tint's emissive wins over the fighter's.
    expect(rimColorOf(p1, { ...p1.palette, emissive: "#ff00aa" })).toBe("#ff00aa");
    expect(new Set(FIGHTERS.map((f) => f.palette.emissive.toLowerCase())).size).toBe(FIGHTERS.length);
  });

  it("IC47-L1: the follow-spot tracks the pair's midpoint and each rim its fighter (unit directions for setLight)", () => {
    const key = stageLook("crown-arena").key;
    if (key.kind !== "follow-spot") throw new Error("crown key must be the follow-spot");
    const pose = followSpotPose(key, 1.2);
    expect(pose.target[0]).toBeCloseTo(1.2);
    expect(pose.position[1]).toBe(key.height);
    const dir = poseDirection(pose);
    expect(Math.hypot(...dir)).toBeCloseTo(1, 6);
    expect(dir[1]).toBeLessThan(-0.9);
    const rim = backRimPose(stageLook("crown-arena").backRim, -1.5, 0.4);
    expect(rim.position[0]).toBe(-1.5);
    expect(rim.position[2]).toBeLessThan(0);
    expect(rim.target[1]).toBeCloseTo(1.65);
  });

  it("IC47-L2: Neo-Tokyo has a shadowed sodium key, magenta and cyan rect panels, and fill from the environment only", () => {
    const row = stageLook("neo-tokyo-rooftop");
    expect(row.key.kind).toBe("sun");
    if (row.key.kind === "sun") expect(row.key.color).toBe("#ffad5c");
    expect(row.panels.map((panel) => panel.color)).toEqual(["#ff3fa4", "#3fe0ff"]);
    const lights = lightsOf(stageLightNodes(row, { p1: "#2b6cff", p2: "#ff7a2e" }, { p1: -2.2, p2: 2.2 }));
    expect(lights.filter((light) => light.light === "rect")).toHaveLength(2);
    expect([...lights, ...lightsOf(lookChildren(row))].some((light) => light.light === "ambient" || light.light === "hemisphere")).toBe(false);
    expect(row.environmentIntensity).toBeGreaterThan(0.5);
  });

  it("IC47-E2: rain on Neo-Tokyo, snow on the Monastery; streaks and weather particles halve on reduced motion", () => {
    const withWeather = ROWS.filter((row) => row.weather).map((row) => [row.stage, row.weather?.type]);
    expect(withWeather).toEqual([["neo-tokyo-rooftop", "rain"], ["himalayan-monastery", "snow"]]);
    for (const id of ["neo-tokyo-rooftop", "himalayan-monastery"] as const) {
      const row = stageLook(id);
      expect(streakLimitFor(row, true)).toBeLessThanOrEqual(streakLimitFor(row, false) / 2);
      expect(weatherParticlesFor(row, true)).toBe(Math.round(weatherParticlesFor(row, false) / 2));
      expect(weatherParticlesFor(row, false, true)).toBe(Math.round(weatherParticlesFor(row, false) / 2));
      const full = arenaWeatherNodes(row, false);
      const reduced = arenaWeatherNodes(row, true);
      const volume = (nodes: readonly AuraSceneNode[]) => nodes[0] as AuraSceneNode & { effect?: string; particleCount?: number };
      expect(volume(full).effect).toBe(row.weather?.type);
      expect(volume(reduced).particleCount).toBe(Math.round((volume(full).particleCount ?? 0) / 2));
      expect(reduced.length - 1).toBeLessThanOrEqual((full.length - 1) / 2);
    }
    // Inside the 2,000-particle budget with the worst VFX burst on top (tests/unit/iron-crown/vfx.test.ts).
    for (const row of ROWS) expect(weatherParticlesFor(row, false)).toBeLessThanOrEqual(1000);
  });

  it("IC47-E3: forge-smoke shafts on the Crown and ochre noon dust (fog density 1.0) on the Colosseum", () => {
    const crownShafts = arenaShaftNodes(stageLook("crown-arena"));
    expect(crownShafts.length).toBeGreaterThanOrEqual(3);
    expect(crownShafts.every((node) => (node as { effect?: string }).effect === "lightCone")).toBe(true);
    const colosseum = stageLook("colosseum-ruins");
    expect(colosseum.fogDensityScale).toBe(1);
    expect(colosseum.fog.color).toBe("#c9a46a");
    const fog = lookChildren(colosseum).find((node) => (node as { effect?: string }).effect === "fog") as (AuraSceneNode & { color?: string }) | undefined;
    expect(fog?.color).toBe("#c9a46a");
  });

  it("IC47-M1: hero floor finishes per venue; the mirror (SSR, High and above) only on the Crown and the wet rooftop", () => {
    expect(stageLook("crown-arena").floor.name).toMatch(/obsidian/);
    expect(stageLook("neo-tokyo-rooftop").floor.name).toMatch(/wet concrete/);
    expect(stageLook("colosseum-ruins").floor.name).toMatch(/sand/);
    expect(stageLook("himalayan-monastery").floor.name).toMatch(/frosted slate/);
    for (const row of ROWS) {
      const ssr = arenaPostNodes(row, true).filter((node) => (node as { effect?: string }).effect === "screen-space-reflections");
      expect(ssr, row.stage).toHaveLength(row.floor.mirror ? 1 : 0);
    }
    expect(ROWS.filter((row) => row.floor.mirror).map((row) => row.stage).sort()).toEqual(["crown-arena", "neo-tokyo-rooftop"]);
  });
});
