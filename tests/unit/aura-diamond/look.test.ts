import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DIAMOND_PALETTE,
  ORIGINAL_LOOKS,
  PARK_LOOKS,
  SIGNATURE_EFFECT,
  hdriUrl,
  lookPlan,
  lookTableHexes,
  parkPracticals,
  resolveDiamondTier,
  resolveLookVariant,
  resolveSkyMode
} from "../../../apps/showcase-aura-diamond-3d/art/look";
import { PARKS, PARK_ORDER } from "../../../apps/showcase-aura-diamond-3d/src/rules";

const ROOT = join(__dirname, "../../..");
const HEX = /#[0-9a-fA-F]{6}\b/g;
const NEUTRAL = new Set(["#000000", "#ffffff"]);

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "public") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full));
    else if (/\.(ts|tsx|html|css|json)$/.test(name) && !name.endsWith(".audit.json")) out.push(full);
  }
  return out;
}

function hexesIn(files: readonly string[]): Set<string> {
  const out = new Set<string>();
  for (const f of files) for (const m of readFileSync(f, "utf8").match(HEX) ?? []) out.add(m.toLowerCase());
  return out;
}

const hoopsHexes = hexesIn(filesUnder(join(ROOT, "apps/showcase-aura-hoops-3d")));

describe("aura-diamond look table (GU47 WP-18)", () => {
  it("has one row per park, each with its own HDRI from the E-A catalogue and none from Hoops' venice_sunset", () => {
    expect(Object.keys(PARK_LOOKS).sort()).toEqual([...PARK_ORDER].sort());
    const ids = PARK_ORDER.map((p) => PARK_LOOKS[p].hdri.id);
    expect(new Set(ids).size).toBe(6);
    expect(ids).not.toContain("venice_sunset");
    for (const id of ids) expect(readFileSync(join(ROOT, "public", hdriUrl(id))).byteLength).toBeGreaterThan(100_000);
  });

  it("gives every park a different key colour, time of day, accent and post grade", () => {
    for (const field of ["timeOfDay", "accent", "background"] as const) {
      expect(new Set(PARK_ORDER.map((p) => PARK_LOOKS[p][field])).size).toBe(6);
    }
    expect(new Set(PARK_ORDER.map((p) => PARK_LOOKS[p].sun.color)).size).toBe(6);
    expect(new Set(PARK_ORDER.map((p) => JSON.stringify(PARK_LOOKS[p].post.grade))).size).toBe(6);
  });

  it("uses the PRD sun angles (DIA-L1) and the PRD post presets and operators (DIA-P1)", () => {
    expect([PARK_LOOKS.sandlot.sun.elevationDeg, PARK_LOOKS.sandlot.sun.azimuthDeg]).toEqual([9, 250]);
    expect([PARK_LOOKS.canyon.sun.elevationDeg, PARK_LOOKS.canyon.sun.azimuthDeg]).toEqual([72, 20]);
    expect([PARK_LOOKS.ivy.sun.elevationDeg, PARK_LOOKS.ivy.sun.azimuthDeg]).toEqual([24, 110]);
    expect([PARK_LOOKS.lunar.sun.elevationDeg, PARK_LOOKS.lunar.sun.azimuthDeg]).toEqual([18, 300]);
    expect(PARK_ORDER.map((p) => PARK_LOOKS[p].post.preset)).toEqual(["cinematic-film", "neon-night", "daylight-outdoor", "daylight-outdoor", "arena-fight", "space"]);
    expect(PARK_ORDER.filter((p) => PARK_LOOKS[p].post.toneMapping === "agx")).toEqual(["sandlot", "ivy"]);
    for (const p of PARK_ORDER) {
      expect(PARK_LOOKS[p].post.grain).toBe(0.03);
      const night = p === "skyline" || p === "dome" || p === "lunar";
      expect(PARK_LOOKS[p].post.bloom.threshold).toBe(night ? 0.65 : 0.85);
    }
  });

  it("keeps the Lunar look off Hoops' orbit and FC's glacier: no fog, grey regolith, Earth in a black sky", () => {
    const lunar = PARK_LOOKS.lunar;
    expect(lunar.fog).toBe(false);
    expect(lunar.sky?.model).toBe("gradient");
    for (const hex of [lunar.turf.grass, lunar.turf.clay]) {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(16);
    }
  });

  it("authors no hex that the Hoops app uses (palette, look rows, practicals)", () => {
    const shared = lookTableHexes().filter((h) => hoopsHexes.has(h) && !NEUTRAL.has(h));
    expect(shared).toEqual([]);
    expect([...DIAMOND_PALETTE.primary, DIAMOND_PALETTE.accent, DIAMOND_PALETTE.reservedObjective].filter((h) => hoopsHexes.has(h))).toEqual([]);
  });

  it("reserves #f5f1e4 for the ball (no park row uses it) and keeps the signature effect string", () => {
    expect(DIAMOND_PALETTE.reservedObjective).toBe("#f5f1e4");
    expect(JSON.stringify(PARK_LOOKS).toLowerCase()).not.toContain("#f5f1e4");
    expect(SIGNATURE_EFFECT).toBe("bat-crack splinter flash");
  });
});

describe("aura-diamond look plan", () => {
  it("lights every GU47 park with its own HDRI, sun and key, and keeps ?look=original on the 4.6.2 looks", () => {
    for (const p of PARK_ORDER) {
      const plan = lookPlan(p, "gu47", "high");
      const row = PARK_LOOKS[p];
      expect(plan.overrides.hdri).toBe(row.hdri.id);
      expect(plan.overrides.sun).toEqual({ elevationDeg: row.sun.elevationDeg, azimuthDeg: row.sun.azimuthDeg });
      expect(plan.overrides.key).toEqual({ color: row.sun.color, intensity: row.sun.intensity });
      expect(plan.output).toEqual({ preset: row.post.preset, toneMapping: row.post.toneMapping, exposure: row.post.exposure });
      const original = lookPlan(p, "original", "high");
      expect(original.baseLook).toBe(ORIGINAL_LOOKS[p].baseLook);
      expect(original.overrides).toEqual({ fogDensityScale: 0, exposureEv: ORIGINAL_LOOKS[p].exposureEv });
      expect(original.output).toBeNull();
      expect(original.clearColor).toBe("look");
    }
  });

  it("draws the analytic sky on Harbor, Canyon and Lunar and lets that sky replace the drawn HDRI (DIA-E2)", () => {
    expect(PARK_ORDER.filter((p) => lookPlan(p, "gu47", "high").sky !== null)).toEqual(["sandlot", "canyon", "lunar"]);
    expect(lookPlan("sandlot", "gu47", "high").sky?.model).toBe("preetham");
    const lunar = lookPlan("lunar", "gu47", "high");
    expect(lunar.sky).toMatchObject({ model: "gradient", stars: { count: 1800 } });
    expect(lunar.sky && "sun" in lunar.sky ? lunar.sky.sun : undefined).toBeUndefined();
    // A colour background is the E-A switch that stops the HDRI being drawn; only sky parks set it.
    for (const p of PARK_ORDER) {
      const plan = lookPlan(p, "gu47", "high");
      expect(plan.overrides.background !== undefined).toBe(plan.sky !== null);
      expect(lookPlan(p, "gu47", "high", "hdri").sky).toBeNull();
    }
  });

  it("fogs every park but Lunar with geometry-only fog (DIA-E3) and keeps it under the far-field cap", () => {
    for (const p of PARK_ORDER) {
      const fog = lookPlan(p, "gu47", "high").overrides.fog;
      if (p === "lunar") {
        expect(fog).toBeUndefined();
        expect(lookPlan(p, "gu47", "high").overrides.fogDensityScale).toBe(0);
        continue;
      }
      expect(fog?.height.affectsBackground).toBe(false);
      expect(fog?.height.maxOpacity).toBeGreaterThan(0.25);
      expect(fog?.height.maxOpacity).toBeLessThanOrEqual(0.92);
    }
    expect(lookPlan("canyon", "gu47", "high").overrides.fog?.height.mode).toBe("height");
  });

  it("degrades on the Low tier without losing the identity: no grain or god rays, half the drizzle, same sky", () => {
    const high = lookPlan("dome", "gu47", "high");
    const low = lookPlan("dome", "gu47", "low");
    expect(high.godRays).not.toBeNull();
    expect(lookPlan("dome", "gu47", "medium").godRays).toBeNull();
    expect(low.godRays).toBeNull();
    expect(low.grain).toBeNull();
    expect(lookPlan("skyline", "gu47", "low").weather?.density).toBeCloseTo((PARK_LOOKS.skyline.weather?.density ?? 0) / 2);
    expect(lookPlan("sandlot", "gu47", "low").sky).toEqual(lookPlan("sandlot", "gu47", "high").sky);
    expect(lookPlan("sandlot", "gu47", "low").overrides).toEqual(lookPlan("sandlot", "gu47", "high").overrides);
  });

  it("reads the variant, tier and sky params from the URL", () => {
    expect(resolveLookVariant("?look=original")).toBe("original");
    expect(resolveLookVariant("?park=lunar")).toBe("gu47");
    expect(resolveDiamondTier("?tier=low", false, 1280)).toBe("low");
    expect(resolveDiamondTier("", true, 1280)).toBe("medium");
    expect(resolveDiamondTier("", false, 390)).toBe("medium");
    expect(resolveDiamondTier("", false, 1280)).toBe("high");
    expect(resolveSkyMode("?sky=hdri")).toBe("hdri");
    expect(resolveSkyMode("")).toBe("analytic");
  });

  it("mounts the night rigs of DIA-L2 behind each fence, four lamps and no flares on Low", () => {
    expect(parkPracticals(PARKS.skyline, "high")).toHaveLength(6);
    expect(parkPracticals(PARKS.skyline, "high").filter((p) => p.flare)).toHaveLength(2);
    expect(parkPracticals(PARKS.dome, "high").every((p) => p.kind === "rect")).toBe(true);
    expect(parkPracticals(PARKS.lunar, "high")).toHaveLength(4);
    for (const p of ["sandlot", "canyon", "ivy"] as const) expect(parkPracticals(PARKS[p], "high")).toHaveLength(0);
    const low = parkPracticals(PARKS.skyline, "low");
    expect(low).toHaveLength(4);
    expect(low.some((p) => p.flare)).toBe(false);
    for (const p of PARK_ORDER) {
      for (const lamp of parkPracticals(PARKS[p], "high")) {
        const r = Math.hypot(lamp.position[0], lamp.position[2]);
        expect(r > 20 || lamp.position[1] > 20).toBe(true);
      }
    }
  });
});

describe("aura-diamond GU47 HUD (DIA-H1)", () => {
  it("gives every park its own HUD accent and keeps the 4.6.2 amber under ?look=original; no Barlow, in-play text >= 12 px", async () => {
    const { hudAccent, ORIGINAL_HUD_ACCENT } = await import("../../../apps/showcase-aura-diamond-3d/art/look");
    const { PARK_ORDER } = await import("../../../apps/showcase-aura-diamond-3d/src/rules");
    const accents = PARK_ORDER.map((p) => hudAccent(p, "gu47").toLowerCase());
    expect(new Set(accents).size).toBe(PARK_ORDER.length);
    for (const p of PARK_ORDER) expect(hudAccent(p, "original")).toBe(ORIGINAL_HUD_ACCENT);
    const html = readFileSync(join(__dirname, "../../../apps/showcase-aura-diamond-3d/index.html"), "utf8");
    expect(/barlow/i.test(html)).toBe(false);
    const tick = /\.tick\s*\{[^}]*font-size:\s*([\d.]+)px/.exec(html);
    expect(Number(tick?.[1])).toBeGreaterThanOrEqual(12);
  });
});
