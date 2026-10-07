/**
 * PRD-10 Phase 6 (CPU side): biome rigs + overrides, §6.3 default-biome rules,
 * the two C-09 environment sources, NOAA/arc sun + keyframe rig interpolation,
 * TimeOfDayRuntime re-capture triggers, environments.* builders + flag
 * degradation, the space bake CPU twin, PlanetMaterial sources,
 * BiomeEnvironmentRegistry load checks, C-34 look-lint rules, T6.5 preset-pack
 * selectors, and the §13 sub-flag semantics (worldSubflagOn).
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  applyBiomeOverrides,
  BIOME_RIGS,
  describeBiome,
  listBiomes
} from "../../../../packages/engine/src/agent-api/world/biomes";
import {
  arcSunPosition,
  daylightFactor,
  keyframeBracket,
  practicalScaleFor,
  rigAtHour,
  solarPosition,
  worldBiome,
  worldTimeOfDay
} from "../../../../packages/engine/src/agent-api/world/timeOfDay";
import {
  advanceTimeOfDay,
  SUN_RECAPTURE_THRESHOLD_DEG,
  TimeOfDayRuntime,
  timeOfDayLastFrame
} from "../../../../packages/engine/src/production-runtime/world/TimeOfDayRuntime";
import {
  defaultBiomeId,
  probeFor,
  resolutionFor,
  sceneSignals
} from "../../../../packages/engine/src/production-runtime/world/BiomeResolver";
import { resolveEnvironment } from "../../../../packages/engine/src/contracts/environment";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { worldSubflagOn } from "../../../../packages/engine/src/agent-api/world/flags";
import {
  takeWorldEnvDegradations,
  worldEnvBuilders
} from "../../../../packages/engine/src/agent-api/nodes/environments.world";
import { bakeSpaceSky, SPACE_CUBE_FACES } from "../../../../packages/rendering/src/world/space/SpaceSkyBake";
import {
  PLANET_ATMOSPHERE_RADIUS_RATIO,
  planetAtmosphereShaderSources,
  planetShaderSources
} from "../../../../packages/rendering/src/world/space/PlanetMaterial";
import {
  auditBiomeHdris,
  BIOME_HDRI_IDS,
  checkBiomeHdri,
  type BiomeHdriAssetFile
} from "../../../../packages/environments/src/BiomeEnvironmentRegistry";
import {
  presetPackExposureFactor,
  presetPackSsimReference
} from "../../../../packages/rendering/src/EnvironmentPresetPack";
import "../../../../packages/engine/src/lanes/prd10";

const FLAGS = (values: Record<string, unknown>) =>
  ({ values, on: (n: string) => Boolean(values[n]) }) as never;

const FLAGS_BIOME = FLAGS({ A3D_QR_WORLD: true, A3D_QR_WORLD_BIOME: true });
const FLAGS_OFF = FLAGS({});

const snapshot = (nodes: readonly object[] = []) =>
  ({
    schema: "aura3d-scene-snapshot/1.0",
    background: "#000",
    camera: { mode: "orbit", position: [0, 1, 5], target: [0, 0, 0] },
    nodes,
    diagnostics: { enabled: false }
  }) as never;

/** Second, independent NOAA declination/equation-of-time for cross-checking. */
function referenceSolar(hour: number, latDeg: number, doy: number): { elevationDeg: number; azimuthDeg: number } {
  const D2R = Math.PI / 180;
  const gamma = (2 * Math.PI * (doy - 1 + (hour - 12) / 24)) / 365;
  const eqtime =
    229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
  const decl =
    0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2 * gamma) +
    0.000907 * Math.sin(2 * gamma) - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
  const ha = (hour + eqtime / 60 - 12) * 15 * D2R;
  const lat = latDeg * D2R;
  const cosZ = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(ha);
  const elevationDeg = 90 - Math.acos(Math.max(-1, Math.min(1, cosZ))) / D2R;
  const azimuthDeg =
    (Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat)) / D2R + 180 + 360) % 360;
  return { elevationDeg, azimuthDeg };
}

describe("prd10 biome rigs (T6.1)", () => {
  it("ships the §6.3 table, deep-frozen", () => {
    expect(listBiomes()).toEqual([
      "outdoor-day", "golden-hour", "overcast", "night-city", "polar-night",
      "alpine-snow", "interior-warm", "interior-neutral", "interior-industrial", "space", "underwater"
    ]);
    for (const rig of Object.values(BIOME_RIGS)) {
      expect(Object.isFrozen(rig)).toBe(true);
      expect(Object.isFrozen(rig.environmentSpec)).toBe(true);
      expect(rig.ambientPolicy).toBe("ibl-only");
      expect(rig.environmentSpec.intensity).toBeGreaterThan(0);
    }
  });

  it("describeBiome('low') applies the Low-tier variant; unknown id throws", () => {
    const low = describeBiome("outdoor-day", "low");
    expect(low.shadows.cascades).toBe(2); // §6.3 Low variant: one cascade fewer
    expect(describeBiome("outdoor-day").shadows.cascades).toBe(3);
    expect(() => describeBiome("bogus" as never)).toThrow(/BIOME_UNKNOWN/);
  });

  it("applyBiomeOverrides merges per-group; fog:null clears; base rig untouched", () => {
    const rig = describeBiome("outdoor-day");
    const out = applyBiomeOverrides(rig, {
      sun: { intensity: 2, elevationDeg: 12 },
      environment: { intensity: 0.5 },
      post: { preset: "cinematic-film", exposureEv: -0.5 },
      fog: null,
      practicalScale: 1.7
    });
    expect(out.sunDetail?.intensity).toBe(2);
    expect(out.sunDetail?.elevationDeg).toBe(12);
    expect(out.sunDetail?.azimuthDeg).toBe(135); // untouched fields merge shallowly
    expect(out.environmentSpec.intensity).toBe(0.5);
    expect(out.post).toBe("cinematic-film");
    expect(out.postOverrides.exposureEv).toBe(-0.5);
    expect(out.postOverrides.bloomThreshold).toBe(rig.postOverrides.bloomThreshold);
    expect(out.fog).toBeNull();
    expect(out.practicalScale).toBe(1.7);
    expect(rig.fog).not.toBeNull();
    expect(rig.post).toBe("daylight-outdoor");
    expect(Object.isFrozen(out)).toBe(true);
  });
});

describe("§6.3 default-biome rules (T6.1)", () => {
  it("maps signals: terrain/water→outdoor-day, room→interior-neutral, categories per table", () => {
    expect(defaultBiomeId({ hasTerrain: true })).toBe("outdoor-day");
    expect(defaultBiomeId({ hasLakeOrOceanWater: true })).toBe("outdoor-day");
    expect(defaultBiomeId({ hasRoom: true })).toBe("interior-neutral");
    expect(defaultBiomeId({ category: "space" })).toBe("space");
    expect(defaultBiomeId({ category: "city-night" })).toBe("night-city");
    expect(defaultBiomeId({ category: "neon" })).toBe("night-city");
    expect(defaultBiomeId({ category: "city-day" })).toBe("outdoor-day");
    expect(defaultBiomeId({ category: "product" })).toBeNull();
    expect(defaultBiomeId({ category: "material" })).toBeNull();
    expect(defaultBiomeId({})).toBe("interior-neutral"); // never a void
  });

  it("sceneSignals reads terrain / ocean|lake water / room-* names", () => {
    const s = snapshot([
      { kind: "terrain" },
      { kind: "water", options: { kind: "ocean" } },
      { name: "room-walls-0" }
    ]);
    expect(sceneSignals(s)).toEqual({ hasTerrain: true, hasLakeOrOceanWater: true, hasRoom: true });
    const river = snapshot([{ kind: "water", options: { kind: "river" } }]);
    expect(sceneSignals(river).hasLakeOrOceanWater).toBe(false);
  });
});

describe("prd10 env sources + probes (T6.1)", () => {
  it("sky-capture → sky-only capture probe, tiered face size; hdri → hdri probe; space → spaceBake", () => {
    const cap = probeFor({ source: "sky-capture", intensity: 1, faceSize: { low: 64, medium: 128, high: 128, ultra: 256 } }, "ultra");
    expect(cap).toEqual({ capture: { include: "sky-only", resolution: 256, update: "once" } });
    const lowCap = probeFor({ source: "sky-capture", intensity: 1, faceSize: { low: 64, high: 128 } }, "low");
    expect((lowCap as { capture: { resolution: number } }).capture.resolution).toBe(64);
    expect(probeFor({
      source: "hdri",
      hdri: { kind: "aura-asset-ref", type: "texture", format: "hdr", url: "hdri://x", id: "x" } as never,
      intensity: 1, rotationDeg: 0
    }, "high")).toEqual({ hdri: "hdri://x" });
    expect(probeFor({ source: "space-bake", intensity: 0.18 }, "high")).toEqual({ spaceBake: "world/space-default" });
    const room = probeFor({ source: "room", colorTemperatureK: 4000, intensity: 0.8 }, "high");
    expect((room as { capture: { include: string } }).capture.include).toBe("all");
  });

  it("resolutionFor: ambient null + IBL>0 on every biome; background drawn for sky/space rigs", () => {
    for (const id of listBiomes()) {
      const r = resolutionFor(describeBiome(id), "high");
      expect(r.kind).toBe("biome");
      expect(r.ambient).toBeNull();
      expect(r.intensity).toBeGreaterThan(0);
      expect(r.diffuseIntensity).toBe(r.intensity);
    }
    expect(resolutionFor(describeBiome("outdoor-day"), "high").background).not.toBe(false);
    expect(resolutionFor(describeBiome("space"), "high").background).not.toBe(false);
  });

  it("prd10.biome wins at 300 with a biome node; explicit sources (400) still beat it", () => {
    const s = snapshot([worldBiome("golden-hour").toJSON()]);
    const r = resolveEnvironment(s, "high", FLAGS_BIOME);
    expect(r.kind).toBe("biome");
    expect(r.probe).toEqual({ capture: { include: "sky-only", resolution: 128, update: "once" } });
  });

  it("no nodes → default rules: ocean water resolves outdoor-day, empty scene interior-neutral", () => {
    const waterS = snapshot([{ kind: "water", options: { kind: "ocean" } }]);
    const r = resolveEnvironment(waterS, "high", FLAGS_BIOME);
    expect(r.kind).toBe("biome");
    expect(r.intensity).toBe(describeBiome("outdoor-day").environmentSpec.intensity);
    const empty = resolveEnvironment(snapshot(), "high", FLAGS_BIOME);
    expect(empty.kind).toBe("biome");
    expect(empty.intensity).toBe(describeBiome("interior-neutral").environmentSpec.intensity);
  });

  it("time-of-day source (250) resolves its keyframe rig when no biome node exists", () => {
    const tod = worldTimeOfDay({
      hour: 12,
      keyframes: [{ hour: 6, biome: "golden-hour" }, { hour: 18, biome: "night-city" }]
    }).toJSON();
    const r = resolveEnvironment(snapshot([tod]), "high", FLAGS_BIOME);
    expect(r.kind).toBe("biome"); // resolved via the tod source → a rig at hour 12
  });

  it("flag off → sources inactive → legacy resolution (declared sub-flag gate)", () => {
    const r = resolveEnvironment(snapshot([worldBiome("space").toJSON()]), "high", FLAGS_OFF);
    expect(r.kind).toBe("legacy");
  });
});

describe("§13 sub-flag semantics", () => {
  it("worldSubflagOn: default-on under parent, explicit set always wins", () => {
    expect(worldSubflagOn(FLAGS({ A3D_QR_WORLD: true }), "A3D_QR_WORLD_BIOME")).toBe(true);
    expect(worldSubflagOn(FLAGS({ A3D_QR_WORLD: true, A3D_QR_WORLD_BIOME: false }), "A3D_QR_WORLD_BIOME")).toBe(false);
    expect(worldSubflagOn(FLAGS({ A3D_QR_WORLD: false, A3D_QR_WORLD_BIOME: true }), "A3D_QR_WORLD_BIOME")).toBe(true);
    expect(worldSubflagOn(FLAGS({}), "A3D_QR_WORLD_TERRAIN")).toBe(false);
  });
});

describe("sun positions (T6.4)", () => {
  it("solarPosition tracks an independent NOAA implementation within 0.5° over a 20-point grid", () => {
    const combos: [number, number, number][] = [
      [8, 37.8, 172], [12, 37.8, 172], [17, 37.8, 172], [12, 37.8, 355],
      [12, 37.8, 10], [6, 51.5, 80], [14, -33.9, 80], [10, 64.1, 172],
      [16, 0, 172], [18.5, 37.8, 172], [7, 37.8, 60], [13, 37.8, 300],
      [11, 45, 200], [15, -20, 350], [9, 60, 40], [12, 25.7, 172],
      [8.5, 35.7, 250], [16.5, 55.8, 140], [13.5, 19.4, 100], [10.5, -1.3, 280]
    ];
    for (const [hour, lat, doy] of combos) {
      const a = solarPosition(hour, lat, doy);
      const b = referenceSolar(hour, lat, doy);
      expect(Math.abs(a.elevationDeg - b.elevationDeg)).toBeLessThanOrEqual(0.5);
      const dAz = Math.abs((((a.azimuthDeg - b.azimuthDeg) + 180) % 360 + 360) % 360 - 180);
      expect(dAz).toBeLessThanOrEqual(0.5);
      expect(a.azimuthDeg).toBeGreaterThanOrEqual(0);
      expect(a.azimuthDeg).toBeLessThan(360);
      expect(Math.hypot(...a.direction)).toBeCloseTo(1, 6);
    }
  });

  it("arcSunPosition: sinusoidal elevation peaking at hour 12, azimuth sweeps 90→450", () => {
    const noon = arcSunPosition(12, 55);
    expect(noon.elevationDeg).toBeCloseTo(55, 6); // t=0.25 → sin(π/2)·maxElev
    expect(noon.azimuthDeg).toBeCloseTo((90 + 0.25 * 360) % 360, 6);
    expect(arcSunPosition(18, 55).elevationDeg).toBeCloseTo(0, 6);
  });

  it("daylightFactor smoothsteps -12..+12°; practicalScale 0.25 day → 1.4 night", () => {
    expect(daylightFactor(-20)).toBe(0);
    expect(daylightFactor(12)).toBe(1);
    expect(practicalScaleFor(solarPosition(12, 37.8, 172))).toBeLessThan(0.6);
    expect(practicalScaleFor({ elevationDeg: -30, azimuthDeg: 0, direction: [0, -1, 0] })).toBe(1.4);
  });

  it("keyframeBracket wraps midnight on sorted input (callers sort before calling)", () => {
    const ks = [{ hour: 6 }, { hour: 20 }];
    expect(keyframeBracket(ks, 23)).toEqual([1, 0, 0.3]); // 20→6 span 10h, t=3/10
    expect(keyframeBracket(ks, 2)).toEqual([1, 0, 0.6]); // 20→6 wrap, t=6/10
    expect(keyframeBracket(ks, 8)).toEqual([0, 1, expect.closeTo(2 / 14, 6)]);
  });

  it("rigAtHour interpolates biome keyframes cyclically; no keyframes → outdoor-day", () => {
    const rig = rigAtHour({
      hour: 12,
      keyframes: [{ hour: 6, biome: "golden-hour" }, { hour: 18, biome: "night-city" }]
    }, 12);
    // midpoint between golden-hour (sun 3.0) and night-city — log-space lerp
    expect(rig.sunDetail!.intensity).toBeGreaterThan(0.2);
    expect(rig.sunDetail!.intensity).toBeLessThan(3);
    expect(rigAtHour({ hour: 9 }, 9).id).toBe("outdoor-day");
  });

  it("worldTimeOfDay validates duplicate keyframe hours and unknown biomes", () => {
    expect(() => worldTimeOfDay({ hour: 0, keyframes: [{ hour: 6, biome: "space" }, { hour: 6, biome: "space" }] }))
      .toThrow(/TOD_KEYFRAME_DUP/);
    expect(() => worldTimeOfDay({ hour: 0, keyframes: [{ hour: 6, biome: "bogus" as never }] }))
      .toThrow(/BIOME_UNKNOWN/);
    expect(worldBiome("space").toJSON()).toMatchObject({ kind: "biome", biome: "space", scope: "all" });
  });
});

describe("TimeOfDayRuntime (T6.4)", () => {
  it("set wraps the hour and pauses; animate advances per sim second", () => {
    const rt = new TimeOfDayRuntime({ hour: 23.5 });
    rt.setHour(25.5);
    expect(rt.currentHour).toBeCloseTo(1.5, 6);
    rt.animate(3600); // 1 world-hour per second
    rt.advance(2);
    expect(rt.currentHour).toBeCloseTo(3.5, 6);
    rt.pause();
    rt.advance(10);
    expect(rt.currentHour).toBeCloseTo(3.5, 6);
    rt.setHour(8); // set pauses an in-flight animate (§6.7)
    rt.animate(3600);
    rt.setHour(8);
    rt.advance(10);
    expect(rt.currentHour).toBe(8);
  });

  it("first advance requests an initial capture; sun move ≥1.5° or keyframe-weight ≥0.05 re-triggers", () => {
    const rt = new TimeOfDayRuntime({ hour: 8 });
    const f0 = rt.advance(0);
    expect(f0.captureRequest?.reason).toBe("initial");
    expect(f0.captureRequest?.facesRemaining).toBe(6);
    // faces tick down one per frame; while faces remain no new trigger
    const f1 = rt.advance(0);
    expect(f1.captureRequest?.facesRemaining).toBe(5);
    for (let i = 0; i < 5; i += 1) rt.advance(0);
    const settled = rt.advance(0);
    expect(settled.captureRequest).toBeNull();
    rt.setHour(12); // sun moved far past 1.5°
    const moved = rt.advance(0);
    expect(moved.captureRequest?.reason).toBe("sun-moved");
    expect(moved.iblCrossfade).toBe("pending-CCR-10-1");
  });

  it("ibl.recapture:false suppresses capture requests entirely", () => {
    const rt = new TimeOfDayRuntime({ hour: 8, ibl: { recapture: false } });
    expect(rt.advance(0).captureRequest).toBeNull();
    rt.setHour(15);
    expect(rt.advance(0).captureRequest).toBeNull();
  });

  it("advanceTimeOfDay publishes a frame per node from timeSeconds deltas", () => {
    const nodes = new Map<string, never>([
      ["n1", { id: "n1", kind: "time-of-day", name: "t", options: { hour: 10 } } as never],
      ["n2", { id: "n2", kind: "time-of-day", name: "t2", options: { hour: 14 } } as never]
    ]);
    const frames = advanceTimeOfDay(nodes, 100, "high");
    expect(frames).toHaveLength(2);
    expect(timeOfDayLastFrame("n1")?.hour).toBe(10);
    expect(timeOfDayLastFrame("n2")?.sun.direction).not.toEqual([0, 0, 0]);
    // calling again with the same timeSeconds is a dt=0 no-op for animate
    const frames2 = advanceTimeOfDay(nodes, 100, "high");
    expect(frames2[0]!.hour).toBe(10);
  });
});

describe("environments.* world builders (T6.3)", () => {
  afterEach(() => {
    delete process.env.A3D_QR;
    delete process.env.A3D_QR_WORLD;
    delete process.env.A3D_QR_WORLD_BIOME;
    takeWorldEnvDegradations();
  });

  it("flag on: outdoor/room/space/underwater emit scope:'environment' biome nodes", () => {
    process.env.A3D_QR_WORLD_BIOME = "1";
    expect(worldEnvBuilders.outdoor().toJSON()).toMatchObject({ kind: "biome", biome: "outdoor-day", scope: "environment" });
    expect(worldEnvBuilders.outdoor({ biome: "alpine-snow" }).toJSON()).toMatchObject({ biome: "alpine-snow" });
    expect(worldEnvBuilders.room({ colorTemperatureK: 2700 }).toJSON()).toMatchObject({
      kind: "biome", biome: "interior-neutral",
      overrides: { sun: { colorTemperatureK: 2700 } }
    });
    expect(worldEnvBuilders.space().toJSON()).toMatchObject({ biome: "space" });
    expect(worldEnvBuilders.underwater().toJSON()).toMatchObject({ biome: "underwater" });
    expect(takeWorldEnvDegradations()).toHaveLength(0);
  });

  it("flag on via parent default: A3D_QR=world alone also emits biome nodes (§13)", () => {
    process.env.A3D_QR = "world";
    expect(worldEnvBuilders.outdoor().toJSON()).toMatchObject({ kind: "biome", scope: "environment" });
  });

  it("flag off: studio() emitted + one option-ignored degradation each", () => {
    const n = worldEnvBuilders.outdoor({ intensity: 0.5 }).toJSON();
    expect((n as { kind: string }).kind).not.toBe("biome");
    const drain = takeWorldEnvDegradations();
    expect(drain).toHaveLength(1);
    expect(drain[0]!.code).toBe("option-ignored");
    expect(drain[0]!.message).toContain("environments.outdoor");
    expect(takeWorldEnvDegradations()).toHaveLength(0); // drained
  });
});

describe("space bake + planet (T6.6)", () => {
  it("bakeSpaceSky is deterministic: 6 faces, faceSize²·4 floats, non-zero energy, alpha 1", () => {
    const a = bakeSpaceSky({ faceSize: 32, seed: 7 });
    const b = bakeSpaceSky({ faceSize: 32, seed: 7 });
    expect(a.faces).toHaveLength(6);
    expect(a.faceSize).toBe(32);
    let energy = 0;
    for (const [i, face] of a.faces.entries()) {
      expect(SPACE_CUBE_FACES[i]).toBeDefined();
      expect(face.length).toBe(32 * 32 * 4);
      for (let p = 3; p < face.length; p += 4) energy += face[p]! === 1 ? 0 : 1; // alpha channel pinned
      let s = 0;
      for (let p = 0; p < face.length; p += 4) s += face[p]! + face[p + 1]! + face[p + 2]!;
      energy += s;
      for (let p = 0; p < face.length; p += 1) expect(face[p]).toBe(b.faces[i]![p]);
    }
    expect(energy).toBeGreaterThan(0); // stars/nebula actually wrote pixels
    const other = bakeSpaceSky({ faceSize: 32, seed: 8 });
    expect(a.faces[0]).not.toEqual(other.faces[0]); // seed changes output
  });

  it("planet sources compose the a3d_prd10_planet chunk with §8.8 constants", () => {
    const p = planetShaderSources();
    expect(p.fragment).toContain("a3dPlanetSurface");
    expect(p.fragment).toContain("(dot(n, L) + 0.2) / 1.2"); // terminator wrap
    expect(p.marker).toBe("prd10.planet");
    const atm = planetAtmosphereShaderSources();
    expect(atm.fragment).toContain("a3dPlanetAtmosphere");
    expect(atm.fragment).toContain("3.5"); // rim exponent
    expect(PLANET_ATMOSPHERE_RADIUS_RATIO).toBeCloseTo(1.025, 6);
    expect(p.vertex).toBeTruthy();
  });
});

describe("BiomeEnvironmentRegistry (T6.7)", () => {
  const validHdri: BiomeHdriAssetFile = { path: "hdri/outdoor-day-2k.hdr", format: "hdr", width: 2048, height: 1024, sha256: "sha256:aa" };

  it("checkBiomeHdri: format, ≥2k on High/Ultra, 2:1 equirect, distinct hash", () => {
    expect(checkBiomeHdri(validHdri, "high", [])).toHaveLength(0);
    expect(checkBiomeHdri({ ...validHdri, format: "ktx2" }, "high", [])).toEqual([expect.stringContaining("RGBE")]);
    expect(checkBiomeHdri({ ...validHdri, width: 1024, height: 512 }, "high", [])).toEqual([expect.stringContaining("2k")]);
    expect(checkBiomeHdri({ ...validHdri, width: 1024, height: 512 }, "low", [])).toHaveLength(0); // low tier exempt
    expect(checkBiomeHdri({ ...validHdri, width: 2048, height: 2048 }, "high", [])).toEqual([expect.stringContaining("2:1")]);
    expect(checkBiomeHdri(validHdri, "high", ["sha256:aa"])).toEqual([expect.stringContaining("duplicates")]);
  });

  it("BIOME_HDRI_IDS covers only shipped biomes", () => {
    for (const biome of Object.keys(BIOME_HDRI_IDS)) {
      expect(listBiomes()).toContain(biome);
    }
    expect(BIOME_HDRI_IDS["outdoor-day"]).toContain("outdoor-day");
  });

  it("auditBiomeHdris: missing manifest → pending-admission; manifest entries verified on disk", () => {
    const pending = auditBiomeHdris("/nonexistent/manifest.json", "high", () => new Uint8Array(), () => false);
    expect(pending.every((c) => c.status === "pending-admission")).toBe(true);
    const enc = new TextEncoder();
    const hash = "sha256:" + "0".repeat(64);
    const manifest = JSON.stringify({
      assets: Object.fromEntries(Object.values(BIOME_HDRI_IDS).map((id) => [
        id, { file: `${id}.hdr`, format: "hdr", width: 2048, height: 1024, hash }
      ]))
    });
    const files = new Map<string, Uint8Array>([["/m/manifest.json", enc.encode(manifest)]]);
    const audited = auditBiomeHdris(
      "/m/manifest.json", "high",
      (p) => files.get(p) ?? new Uint8Array(),
      (p) => files.has(p)
    );
    // manifest references files that aren't on disk → invalid (missing file), not ok
    expect(audited.every((c) => c.status === "invalid" && c.failures.some((f) => f.includes("missing")))).toBe(true);
  });
});

describe("T6.5 EnvironmentPresetPack selectors", () => {
  const night = { slot: "night", exposureFactor: 2.114618 } as never;

  it("night exposureFactor drops to 1 under _BIOME (and under parent default-on)", () => {
    expect(presetPackExposureFactor(night, FLAGS_BIOME)).toBe(1);
    expect(presetPackExposureFactor(night, FLAGS({ A3D_QR_WORLD: true }))).toBe(1); // §13 default-on
    expect(presetPackExposureFactor(night, FLAGS_OFF)).toBe(2.114618);
    expect(presetPackExposureFactor(night, FLAGS({ A3D_QR_WORLD: true, A3D_QR_WORLD_BIOME: false }))).toBe(2.114618);
    const outdoor = { slot: "outdoor", exposureFactor: 1.4 } as never;
    expect(presetPackExposureFactor(outdoor, FLAGS_BIOME)).toBe(1.4); // non-night untouched
  });

  it("presetPackSsimReference switches per-preset under _BIOME", () => {
    expect(presetPackSsimReference(FLAGS_BIOME)).toBe("per-preset");
    expect(presetPackSsimReference(FLAGS({ A3D_QR_WORLD: true }))).toBe("per-preset");
    expect(presetPackSsimReference(FLAGS_OFF)).toBe("normalized-to-target");
  });
});
