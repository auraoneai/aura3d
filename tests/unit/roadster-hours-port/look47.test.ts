import { describe, expect, it } from "vitest";
import { SALTWIND_LOOK, SALTWIND_PALETTE, SALTWIND_VARIANTS, directionFromAngles, lookModeFrom } from "../../../examples/roadster-hours-port/art/look";
import { outputFor } from "../../../examples/roadster-hours-port/art/output";
import { LOOKS, ORIGINAL_LOOKS, hexLinear, lookFor } from "../../../examples/roadster-hours-port/look";
import { blobFadeFor } from "../../../examples/roadster-hours-port/materials";
import { SALT_FADED_PAINT, SALT_FADED_TINTS, buildWorld, routeIblName } from "../../../examples/roadster-hours-port/world";

type Json = Record<string, unknown>;
function nodes(scene: { toJSON(): unknown }): Json[] {
  const out: Json[] = [];
  const walk = (v: unknown): void => {
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (v && typeof v === "object") {
      const o = v as Json;
      if (typeof o.kind === "string") out.push(o);
      for (const key of Object.keys(o)) walk(o[key]);
    }
  };
  walk(scene.toJSON());
  return out;
}

const deg = (rad: number): number => (rad * 180) / Math.PI;

describe("Saltwind Highway GU47 look table (WP-32)", () => {
  it("has one row per route with the WP's sun numbers (RH47-02)", () => {
    expect(SALTWIND_VARIANTS).toEqual(["sunbreak", "redline", "halo"]);
    expect(SALTWIND_LOOK.sunbreak.sun).toMatchObject({ elevationDeg: 20, color: "#ffe2b0", intensity: 3.4 });
    expect(SALTWIND_LOOK.redline.sun).toMatchObject({ elevationDeg: 7, color: "#ff9a5a", intensity: 3.8 });
    expect(SALTWIND_LOOK.halo.sun.intensity).toBe(0.6);
    expect(SALTWIND_LOOK.sunbreak.fill.kind).toBe("sea-bounce");
    expect(SALTWIND_LOOK.redline.fill.kind).toBe("violet-rim");
    expect(SALTWIND_LOOK.halo.fill.kind).toBe("city-glow");
    expect(SALTWIND_LOOK.halo.gantryPoints?.count).toBe(2);
    expect(SALTWIND_LOOK.redline.post.heat).toEqual({ amount: 1, startMetres: 40 });
    expect(SALTWIND_LOOK.halo.post.autoExposure).toBe(true);
    expect(SALTWIND_LOOK.sunbreak.post.bloom).toMatchObject({ intensity: 0.3, threshold: 1.1 });
    expect(SALTWIND_LOOK.redline.post.bloom).toMatchObject({ intensity: 0.45, threshold: 1.0 });
    expect(SALTWIND_LOOK.halo.post.bloom).toMatchObject({ intensity: 0.8, threshold: 0.9 });
    expect(new Set(SALTWIND_VARIANTS.map((v) => SALTWIND_LOOK[v].hdri))).toEqual(new Set(["belfast_sunset_puresky", "industrial_sunset_puresky", "rooftop_night"]));
  });

  it("feeds the shader look from the same row as the engine key", () => {
    for (const id of SALTWIND_VARIANTS) {
      const row = SALTWIND_LOOK[id];
      const look = LOOKS[id]!;
      expect(look.row).toBe(row);
      expect(look.keyLight).toEqual({ color: row.sun.color, intensity: row.sun.intensity });
      const lin = hexLinear(parseInt(row.sun.color.slice(1), 16));
      look.sunColor.forEach((c, i) => expect(c).toBeCloseTo(lin[i]! * row.sun.intensity, 9));
      expect(deg(Math.asin(look.sunDir[1]))).toBeCloseTo(row.sun.elevationDeg, 6);
      expect(Math.hypot(...look.sunDir)).toBeCloseTo(1, 9);
      expect(look.seaSide).toBe(ORIGINAL_LOOKS[id]!.seaSide);
      expect(look.style).toBe(ORIGINAL_LOOKS[id]!.style);
    }
    // a negative azimuth is over the sea (left of travel, -x); the road runs toward -z
    const d = directionFromAngles(0, -90);
    expect(d[0]).toBeCloseTo(-1, 9);
    expect(directionFromAngles(0, 0)[2]).toBeCloseTo(-1, 9);
  });

  it("keeps the identity palette and Halo free of amber and neon", () => {
    expect(SALTWIND_PALETTE).toEqual({ saltWhite: "#e9e4d6", seaTeal: "#12606e", ochre: "#c9a25e", signalRed: "#c8321f" });
    const amber = (hex: string): boolean => {
      const n = parseInt(hex.slice(1), 16);
      const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
      return r > 180 && g > 90 && g < 200 && b < 0.45 * r;
    };
    const halo = SALTWIND_LOOK.halo;
    const colours = [halo.sun.color, halo.fill.color, halo.gantryPoints!.color, halo.sky.zenith, halo.sky.horizon, halo.sky.band, halo.fog.color, halo.gantry.frame, halo.spray.color];
    expect(colours.filter(amber)).toEqual([]);
    for (const id of SALTWIND_VARIANTS) expect(SALTWIND_LOOK[id].gantry.glow).toBe(SALTWIND_PALETTE.signalRed);
  });

  it("?look=original keeps today's looks and output; the default is GU47 (RH47-01)", () => {
    expect(lookModeFrom("?level=1&look=original")).toBe("original");
    expect(lookModeFrom("?level=1")).toBe("gu47");
    expect(lookFor("halo", "original")).toBe(ORIGINAL_LOOKS.halo);
    expect(lookFor("halo")).toBe(LOOKS.halo);
    expect(ORIGINAL_LOOKS.sunbreak!.row).toBeNull();
    expect(outputFor("gu47")).toEqual({ maxDpr: 2, pixelRatio: { max: 2 }, output: { toneMapping: "aces", dither: true } });
    expect(outputFor("original").output.dither).toBe(false);
    expect(outputFor("original").pixelRatio).toBe(1);
  });

  it("mounts the row's rig: 3 PCSS cascades over 260 m, the route IBL, no ambient light (RH47-02/03/04)", () => {
    SALTWIND_VARIANTS.forEach((id, i) => {
      const all = nodes(buildWorld(i, "gu47").scene);
      const lightsOf = all.filter((n) => n.kind === "light");
      const sun = lightsOf.find((n) => n.name === "sun")!;
      expect(sun.shadow).toMatchObject({ cascades: 3, maxDistance: 260, filter: "pcss" });
      expect(lightsOf.filter((n) => n.shadow && n.shadow !== false).length).toBe(1);
      expect(lightsOf.some((n) => n.light === "ambient")).toBe(false);
      const env = all.find((n) => n.kind === "environment")!;
      expect(env.name).toBe(routeIblName(SALTWIND_LOOK[id]));
      expect(env.name).toContain(id);
      expect(env.background).toBe(false);
      expect(all.some((n) => n.name === "car-blob")).toBe(true);
    });
    const original = nodes(buildWorld(0, "original").scene);
    expect(original.find((n) => n.name === "sun")!.shadow).toMatchObject({ cascades: 1, maxDistance: 90 });
    expect(original.some((n) => n.name === "car-blob")).toBe(false);
    expect(original.find((n) => n.kind === "environment")!.name).toBe("route IBL");
  });

  it("Halo draws the city carpet and two gantry points; the coast routes keep the sea (RH47-06)", () => {
    const halo = nodes(buildWorld(2, "gu47").scene).map((n) => n.name);
    expect(halo).toContain("city-carpet");
    expect(halo).not.toContain("water");
    expect(halo.filter((n) => typeof n === "string" && n.startsWith("gantry-light-")).length).toBe(2);
    expect(nodes(buildWorld(0, "gu47").scene).map((n) => n.name)).toContain("water");
    expect(nodes(buildWorld(2, "original").scene).map((n) => n.name)).toContain("water");
  });

  it("the contact blob fades with ride height", () => {
    expect(blobFadeFor(0)).toBe(1);
    expect(blobFadeFor(2)).toBeGreaterThan(0);
    expect(blobFadeFor(2)).toBeLessThan(1);
    expect(blobFadeFor(4)).toBe(0);
    expect(blobFadeFor(9)).toBe(0);
  });

  it("salt-faded traffic spans >= 4 hue buckets and never uses the signal red accent (RH47-09)", () => {
    const hue = (hex: string): number => {
      const n = parseInt(hex.slice(1), 16);
      const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
      if (d < 0.04) return -1; // neutral
      const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      return Math.floor(((h * 60 + 360) % 360) / 45);
    };
    for (const list of [SALT_FADED_PAINT, SALT_FADED_TINTS]) {
      expect(new Set(list.map(hue)).size).toBeGreaterThanOrEqual(4);
      expect(list).not.toContain(SALTWIND_PALETTE.signalRed);
    }
  });
});
