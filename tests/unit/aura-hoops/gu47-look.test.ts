import { describe, expect, it } from "vitest";
import {
  COURT_IDS,
  COURT_RIGS,
  LIGHTNING_NODE_ID,
  courtIdentityRow,
  courtAtmosphereNodes,
  courtLightningNodes,
  courtLookNodes,
  courtWeatherNodes,
  lightningFlash
} from "../../../apps/showcase-aura-hoops-3d/src/courtRigs";
import {
  HOOPS_FX_KINDS,
  HOOPS_FX_PRESETS,
  JUICE_FX,
  REDUCED_FLASH_PEAK,
  REDUCED_FLASH_SECONDS,
  ballTrailOptions,
  hoopsBurstOptions,
  hoopsFxKindFor,
  presetForSession,
  presetParticleCount,
  registerHoopsFx
} from "../../../apps/showcase-aura-hoops-3d/src/fxPack";

/** GU47 WP-17: the look table, VFX pack and their reduced-motion / reduced-flash paths (pure data, no app). */
describe("Aura Hoops 3D GU47 look table", () => {
  it("gives every court its own HDRI, time of day and post preset row", () => {
    const rows = COURT_IDS.map((id) => courtIdentityRow(COURT_RIGS[id]));
    expect(new Set(rows.map((r) => r.hdri)).size).toBe(6);
    expect(new Set(rows.map((r) => r.timeOfDay)).size).toBe(6);
    for (const r of rows) expect(r.practicals).toBeLessThanOrEqual(6);
  });

  it("swaps the look AO and bloom for the court's own, drops AO on the qaAo=0 path, grains only Rucker and Manila", () => {
    for (const id of COURT_IDS) {
      const names = courtLookNodes(COURT_RIGS[id]).map((n) => (n.toJSON() as { name?: string }).name);
      expect(names).toContain("court ambient occlusion");
      const blooms = courtLookNodes(COURT_RIGS[id]).map((n) => n.toJSON() as { effect?: string; intensity?: number }).filter((n) => n.effect === "bloom");
      expect(blooms).toHaveLength(1);
      expect(blooms[0]!.intensity).toBeCloseTo(COURT_RIGS[id].bloom.intensity);
      expect(names).not.toContain("look ambient occlusion");
      expect(names.includes("court film grain")).toBe(id === "rucker" || id === "manila");
      const noAo = courtLookNodes(COURT_RIGS[id], { ao: false }).map((n) => (n.toJSON() as { name?: string }).name);
      expect(noAo).not.toContain("court ambient occlusion");
    }
  });

  it("rains on Shanghai (<= 160 streaks, wet ground), only outside the canopy at Manila, nowhere else", () => {
    for (const id of COURT_IDS) {
      const nodes = courtWeatherNodes(COURT_RIGS[id], false);
      if (id === "shanghai" || id === "manila") expect(nodes.length).toBeGreaterThan(0);
      else expect(nodes).toEqual([]);
    }
    expect(COURT_RIGS.shanghai.weather.streaks).toBeLessThanOrEqual(160);
    for (const node of courtWeatherNodes(COURT_RIGS.manila, false)) {
      const position = (node as { position?: readonly number[] }).position ?? [0, 0, 0];
      expect(Math.abs(position[0] ?? 0)).toBeGreaterThanOrEqual(17);
    }
  });

  it("reduced motion halves the rain on both rain courts", () => {
    const json = (id: "shanghai" | "manila", reduced: boolean) => JSON.stringify(courtWeatherNodes(COURT_RIGS[id], reduced));
    expect(json("shanghai", true)).not.toEqual(json("shanghai", false));
    const density = (reduced: boolean) => (courtWeatherNodes(COURT_RIGS.shanghai, reduced).find((n) => (n as { effect?: string }).effect === "rain") as { density: number }).density;
    expect(density(true)).toBeCloseTo(density(false) / 2, 3);
    expect(JSON.stringify(courtWeatherNodes(COURT_RIGS.shanghai, false))).not.toContain("prd07.legacyWeather");
    expect(JSON.stringify(courtWeatherNodes(COURT_RIGS.shanghai, false))).toContain('"effect":"wetness"');
    const manila = courtWeatherNodes(COURT_RIGS.manila, true) as unknown as { maxParticles?: number }[];
    for (const n of manila) expect(n.maxParticles).toBe(200);
  });

  it("strikes lightning only on Shanghai, never under reduced flash", () => {
    expect(courtLightningNodes(COURT_RIGS.shanghai).map((n) => (n.toJSON() as { name?: string }).name)).toEqual([LIGHTNING_NODE_ID]);
    for (const id of COURT_IDS) if (id !== "shanghai") expect(courtLightningNodes(COURT_RIGS[id])).toEqual([]);
    const rig = COURT_RIGS.shanghai;
    expect(lightningFlash(rig, 40.02, false)).toBe(1);
    expect(lightningFlash(rig, 40.15, false)).toBe(0.6);
    expect(lightningFlash(rig, 41, false)).toBe(0);
    for (let t = 0; t < 120; t += 0.01) expect(lightningFlash(rig, t, true)).toBe(0);
    expect(lightningFlash(COURT_RIGS.rucker, 40.02, false)).toBe(0);
  });
});

describe("Aura Hoops 3D GU47 atmosphere (H47-V2)", () => {
  const json = (id: (typeof COURT_IDS)[number], reduced = false) => courtAtmosphereNodes(COURT_RIGS[id], reduced).map((n) => n.toJSON() as { effect?: string; name?: string; maxParticles?: number; godRayDensity?: number });
  it("puts god rays and motes on Manila, nothing elsewhere (Rucker haze off since GU47 phase 3), within +12 nodes", () => {
    expect(json("rucker")).toEqual([]);
    const manila = json("manila");
    expect(manila.find((n) => n.effect === "volumetric-fog")?.godRayDensity).toBeGreaterThan(0.3);
    for (const id of COURT_IDS) {
      expect(json(id).length).toBeLessThanOrEqual(12);
      if (id !== "manila") expect(json(id)).toEqual([]);
    }
  });
  it("halves the Manila motes under reduced motion", () => {
    const motes = (reduced: boolean) => json("manila", reduced).find((n) => n.name === "manila-dust-motes")!.maxParticles!;
    expect(motes(true)).toBe(motes(false) / 2);
  });
});

describe("Aura Hoops 3D GU47 VFX pack (H47-V1)", () => {
  it("registers the five kinds and maps every drawing juice event to one of them", () => {
    const registered: string[] = [];
    expect(registerHoopsFx({ registerPreset: (kind) => { registered.push(kind); } }, { reducedFlash: false })).toEqual(HOOPS_FX_KINDS);
    expect(registered).toEqual(["net-flick", "blacktop-dust", "spray-burst", "rain-splash", "sweat-fleck"]);
    expect(registerHoopsFx(undefined, { reducedFlash: false })).toEqual([]);
    for (const kind of Object.values(JUICE_FX)) expect(HOOPS_FX_KINDS).toContain(kind);
    for (const ev of ["swish", "rim", "bank", "block", "brick", "steal", "juke", "dunk", "jam"]) expect(JUICE_FX[ev]).toBeDefined();
    const used = new Set([...Object.values(JUICE_FX), hoopsFxKindFor("blacktop-dust", true)]);
    expect(used.size).toBe(5);
  });

  it("caps every light layer under reduced flash (peak x0.3, <= 0.2 s) and leaves emitters alone", () => {
    for (const kind of HOOPS_FX_KINDS) {
      const full = HOOPS_FX_PRESETS[kind];
      const capped = presetForSession(kind, { reducedFlash: true });
      expect(presetForSession(kind, { reducedFlash: false })).toBe(full);
      full.layers.forEach((layer, i) => {
        const c = capped.layers[i]!;
        if (layer.type === "light") {
          expect(c.type).toBe("light");
          expect((c as unknown as { intensity: number }).intensity).toBeCloseTo(((layer as { intensity?: number }).intensity ?? 1) * REDUCED_FLASH_PEAK);
          expect((c as unknown as { duration: number }).duration).toBeLessThanOrEqual(REDUCED_FLASH_SECONDS);
        } else expect(c).toBe(layer);
      });
    }
  });

  it("halves burst emission under reduced motion and leaves the camera to the juice layer", () => {
    for (const kind of HOOPS_FX_KINDS) {
      const full = hoopsBurstOptions(kind, { reducedMotion: false });
      const reduced = hoopsBurstOptions(kind, { reducedMotion: true });
      expect(full.count).toBe(presetParticleCount(kind));
      expect(reduced.count).toBe(Math.max(1, Math.round(presetParticleCount(kind) / 2)));
      expect(full.camera).toBe(false);
    }
  });

  it("draws one ribbon only in fast flight, fire-coloured at a full Jam Meter", () => {
    expect(ballTrailOptions(false).widthOverSpeed?.[0]).toBeGreaterThan(5);
    expect(ballTrailOptions(true).color).not.toEqual(ballTrailOptions(false).color);
    expect(ballTrailOptions(true).width).toBeGreaterThan(ballTrailOptions(false).width);
  });
});
