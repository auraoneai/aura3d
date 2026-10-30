import { describe, expect, it } from "vitest";
import { SALTWIND_LOOK, SALTWIND_PALETTE } from "../../../examples/roadster-hours-port/art/look";
import { NITRO_TRAIL, SALTWIND_FX_FOR_EVENT, SALTWIND_FX_KINDS, SKID_LIFETIME, fxForEvents, registerSaltwindFx, saltwindFxPresets } from "../../../examples/roadster-hours-port/art/fx";
import { SPRAY_POINTS, sprayAmount, sprayLateral, sprayWind } from "../../../examples/roadster-hours-port/art/spray";
import { buildWorld } from "../../../examples/roadster-hours-port/world";

const emitted = (spec: { layers: readonly { type: string; count?: unknown }[] }): number =>
  spec.layers.reduce((n, layer) => n + (layer.type === "emitter" ? Number(layer.count ?? 0) : 0), 0);

describe("Saltwind Highway preset pack (RH47-13)", () => {
  it("registers every kind for each route; each mapped sim event bursts exactly one preset", () => {
    for (const row of Object.values(SALTWIND_LOOK)) {
      const registered: string[] = [];
      expect(registerSaltwindFx({ registerPreset: (kind) => registered.push(kind) }, row)).toEqual(SALTWIND_FX_KINDS);
      expect(registered).toEqual([...SALTWIND_FX_KINDS]);
      const presets = saltwindFxPresets(row);
      for (const kind of SALTWIND_FX_KINDS) expect(presets[kind].name).toBe(kind);
    }
    for (const kind of Object.values(SALTWIND_FX_FOR_EVENT)) expect(SALTWIND_FX_KINDS).toContain(kind);
    expect(fxForEvents([{ type: "land" }, { type: "combo" }, { type: "nitro" }])).toEqual(["saltwind-land", "saltwind-nitro"]);
    expect(registerSaltwindFx(undefined, SALTWIND_LOOK.sunbreak)).toEqual([]);
    expect(registerSaltwindFx({ registerPreset: () => undefined }, null)).toEqual([]);
  });

  it("nitro is signal red, skids live 8 s, a dense moment stays small", () => {
    const presets = saltwindFxPresets(SALTWIND_LOOK.redline);
    expect(NITRO_TRAIL.color).toBe(SALTWIND_PALETTE.signalRed);
    expect(presets["saltwind-nitro"].layers.every((l) => !("color" in l) || l.color === SALTWIND_PALETTE.signalRed)).toBe(true);
    expect(presets["saltwind-skid"].layers[0]).toMatchObject({ type: "decal", lifetime: SKID_LIFETIME });
    expect(SKID_LIFETIME).toBe(8);
    const dense = ["saltwind-land", "saltwind-scrape", "saltwind-nitro", "saltwind-gate"] as const;
    expect(dense.reduce((n, k) => n + emitted(presets[k]), 0)).toBeLessThanOrEqual(120);
  });

  it("reduced motion halves emissions and drops camera layers; reduced flash caps lights at 0.3", () => {
    const row = SALTWIND_LOOK.sunbreak;
    const full = saltwindFxPresets(row);
    const calm = saltwindFxPresets(row, { reducedMotion: true, reducedFlash: true });
    for (const kind of SALTWIND_FX_KINDS) {
      expect(emitted(calm[kind])).toBeLessThanOrEqual(Math.ceil(emitted(full[kind]) / 2) + 1);
      expect(calm[kind].layers.some((l) => l.type === "camera")).toBe(false);
      full[kind].layers.forEach((layer, i) => {
        if (layer.type !== "light") return;
        expect(Number((calm[kind].layers[i] as { intensity?: number }).intensity)).toBeCloseTo(Number((layer as { intensity?: number }).intensity) * 0.3, 9);
      });
    }
  });
});

describe("Saltwind Highway crosswind spray (RH47-12)", () => {
  it("is one points node of <= 2,000 on every GU47 route, none on ?look=original", () => {
    expect(SPRAY_POINTS).toBeLessThanOrEqual(2000);
    for (let i = 0; i < 3; i++) {
      const json = JSON.stringify(buildWorld(i, "gu47").scene.toJSON());
      expect(json.split('"crosswind-spray"').length - 1).toBeGreaterThanOrEqual(1);
    }
    expect(JSON.stringify(buildWorld(0, "original").scene.toJSON())).not.toContain("crosswind-spray");
  });

  it("drifts from the sea side across the road with the wind", () => {
    const half = 11;
    const start = sprayLateral(-1, half, 0), mid = sprayLateral(-1, half, 0.5), end = sprayLateral(-1, half, 1);
    expect(start).toBeLessThan(-half);
    expect(end).toBeGreaterThan(half);
    expect(mid).toBeCloseTo(0, 6);
    // at Sunbreak's wind a sheet crosses the 46 m span in ~5 s: well over 8% of the frame in 2 s
    const row = SALTWIND_LOOK.sunbreak;
    expect(sprayWind(row.spray) * 2).toBeGreaterThan(0.08 * (2 * half + 24));
  });

  it("reduced motion halves the live count and the drift", () => {
    const spray = SALTWIND_LOOK.sunbreak.spray;
    expect(sprayAmount(spray, { reducedMotion: true })).toBeCloseTo(sprayAmount(spray) / 2, 9);
    expect(sprayWind(spray, true)).toBeCloseTo(sprayWind(spray) / 2, 9);
    expect(sprayAmount(spray, { low: true })).toBeGreaterThan(0);
  });
});
