import { describe, expect, it } from "vitest";
import { LOOKS, districtFog, fogApproach, lookFromSearch, lowTier, postToggles, reducedMotionLook } from "../../../examples/heatsink-port/art/look";
import { SPORE_BOX, bankRoll, createIonWake, createSporeField, sporeField } from "../../../examples/heatsink-port/art/wake";
import { HEATSINK_VFX_MAX_LIVE, HEATSINK_VFX_PRESETS, registerHeatsinkVfx, vfxScale } from "../../../examples/heatsink-port/art/vfx";
import { allProgramSpecs } from "../../../examples/heatsink-port/materials";
import { Track } from "../../../examples/heatsink-port/track";
import { buildWorld } from "../../../examples/heatsink-port/world";

interface JsonNode { readonly kind?: string; readonly name?: string; readonly effect?: string; readonly uniforms?: Record<string, { value?: unknown }>; readonly material?: { readonly uniforms?: Record<string, { value?: unknown }> } }
const nodes = (search: string, quality: "high" | "low" = "high"): JsonNode[] => ((buildWorld(new Track(), quality, search).scene.toJSON() as unknown as { nodes?: JsonNode[] }).nodes ?? []);
const hueDeg = (c: readonly number[]): number => {
  const [r, g, b] = c as [number, number, number];
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};

describe("heatsink-port look table (GU47 WP-29)", () => {
  it("boots twilight by default and keeps ?look=original", () => {
    expect(lookFromSearch("").id).toBe("twilight");
    expect(lookFromSearch("?look=original").id).toBe("original");
    expect(lookFromSearch("?look=nope").id).toBe("twilight");
  });

  it("IC-01: twilight lit() scale 0.45 and road albedo in 0.30-0.38; original keeps 0.26 and no new terms", () => {
    expect(LOOKS.twilight.lit.scale).toBe(0.45);
    expect(LOOKS.twilight.lit.roadAlbedo).toBeGreaterThanOrEqual(0.3);
    expect(LOOKS.twilight.lit.roadAlbedo).toBeLessThanOrEqual(0.38);
    expect(LOOKS.original.lit).toMatchObject({ scale: 0.26, bounce: [0, 0, 0], topFill: [0, 0, 0] });
  });

  it("the original scene mounts none of the new post or the wake; twilight mounts both", () => {
    const orig = nodes("?look=original");
    expect(orig.some((n) => n.name === "ion-wake")).toBe(false);
    expect(orig.filter((n) => n.kind === "effect").map((n) => n.effect).sort()).toEqual(["bloom", "color-grade", "vignette"]);
    const tw = nodes("");
    expect(tw.some((n) => n.name === "ion-wake")).toBe(true);
    for (const e of ["ambient-occlusion", "motion-blur", "chromatic-aberration", "film-grain", "volumetric-fog"]) expect(tw.some((n) => n.effect === e), e).toBe(true);
  });

  it("Low tier drops GTAO, motion blur, god rays, grain and CA, keeps the wake, sky and palette, 1 cascade", () => {
    const low = lowTier(LOOKS.twilight);
    expect(low.post).toMatchObject({ ao: false, motionBlur: null, godRays: null, grain: null, chromaticAberration: null });
    expect(low.key.cascades).toBe(1);
    expect(low.wake.enabled).toBe(true);
    expect(low.sky).toEqual(LOOKS.twilight.sky);
    const effects = nodes("", "low").filter((n) => n.kind === "effect").map((n) => n.effect);
    expect(effects).not.toContain("motion-blur");
    expect(effects).not.toContain("ambient-occlusion");
    expect(nodes("", "low").some((n) => n.name === "ion-wake")).toBe(true);
  });

  it("reduced motion: no roll, no countdown sweep, no motion blur or CA, half the spores and half the VFX", () => {
    const rm = reducedMotionLook(LOOKS.twilight);
    expect(rm.camera).toEqual({ rollDeg: 0, countdownSweep: false });
    expect(rm.post.motionBlur).toBeNull();
    expect(rm.post.chromaticAberration).toBeNull();
    expect(rm.dressing.spores).toBe(150);
    expect(bankRoll(rm, 1, 1)).toBeCloseTo(0, 12);
    expect(vfxScale(true)).toBe(0.5);
    expect(new Map(postToggles(LOOKS.twilight, { reducedMotion: true, lowFps: false })).get("motionBlur")).toBe(false);
    expect(new Map(postToggles(LOOKS.twilight, { reducedMotion: false, lowFps: false })).get("motionBlur")).toBe(true);
    expect(postToggles(LOOKS.original, { reducedMotion: true, lowFps: true })).toEqual([]);
  });

  it("IC-22: bank roll spans ±6 deg at full steer and speed", () => {
    expect(Math.abs(bankRoll(LOOKS.twilight, 1, 1) * 180 / Math.PI)).toBeCloseTo(6, 6);
    expect(bankRoll(LOOKS.twilight, -1, 1)).toBeCloseTo(-bankRoll(LOOKS.twilight, 1, 1), 12);
    expect(bankRoll(LOOKS.original, 1, 1)).toBeCloseTo(0, 12);
  });

  it("IC-06: district fog hue differs >= 20 deg between the #c9a0ff and #ffb02e districts and approaches over ~120 m", () => {
    const a = districtFog(LOOKS.twilight, "#c9a0ff"), b = districtFog(LOOKS.twilight, "#ffb02e");
    const d = Math.abs(hueDeg(a) - hueDeg(b));
    expect(Math.min(d, 360 - d)).toBeGreaterThanOrEqual(20);
    expect(fogApproach(LOOKS.twilight, 120)).toBeGreaterThan(0.9);
    expect(districtFog(LOOKS.original, "#ffb02e")).toEqual(LOOKS.original.fog.color);
  });

  it("every program bakes under both looks (twilight road, sky and terrain included)", () => {
    const names = allProgramSpecs().map((p) => p.name);
    for (const n of ["road-twilight", "sky-twilight", "terrain-twilight", "wake", "road", "sky"]) expect(names).toContain(n);
  });
});

describe("heatsink-port ion wake (IC-18)", () => {
  const eye = [0, 5, -10] as const;
  const drive = (boost: number, speed = 40) => {
    const wake = createIonWake(LOOKS.twilight);
    for (let i = 0; i <= 90; i++) wake.push({ t: i / 60, x: i * speed / 60, y: 0, z: 0 });
    const length = wake.build(90 / 60, eye, speed, boost);
    return { wake, length };
  };

  it("covers the last 1.2 s of travel in 60 segments", () => {
    const { wake, length } = drive(0);
    expect(wake.segments).toBe(60);
    expect(length).toBeCloseTo(40 * 1.2, 1);
    expect(wake.alpha[0]).toBeGreaterThan(0.9);
  });

  it("is cyan at the head at cruise and amber under the afterburner", () => {
    const cruise = drive(0).wake.colors, burn = drive(1).wake.colors;
    const head = (c: Float32Array) => [c[0]!, c[1]!, c[2]!];
    expect(hueDeg(head(cruise))).toBeGreaterThan(170);
    expect(hueDeg(head(cruise))).toBeLessThan(200);
    expect(hueDeg(head(burn))).toBeGreaterThan(25);
    expect(hueDeg(head(burn))).toBeLessThan(50);
  });

  it("has no width when slow and none under ?look=original", () => {
    expect(drive(0, 4).length).toBe(0);
    const orig = createIonWake(LOOKS.original);
    orig.push({ t: 0, x: 0, y: 0, z: 0 }); orig.push({ t: 1, x: 10, y: 0, z: 0 });
    expect(orig.build(1, eye, 40, 0)).toBe(0);
  });
});

describe("heatsink-port VFX presets (IC-19)", () => {
  it("registers every preset and stays inside the live-particle cap", () => {
    const seen: string[] = [];
    registerHeatsinkVfx({ effects: { registerPreset: (k: string) => { seen.push(k); } } as never });
    expect(seen.sort()).toEqual(Object.keys(HEATSINK_VFX_PRESETS).sort());
    const total = Object.values(HEATSINK_VFX_PRESETS).reduce((n, spec) => n + spec.layers.reduce((m, l) => m + (typeof l.count === "number" ? l.count : 0), 0), 0);
    expect(total).toBeLessThanOrEqual(HEATSINK_VFX_MAX_LIVE);
  });
});

describe("heatsink-port spores (IC-20)", () => {
  it("keeps 300 spores inside the camera box, deterministic, half shown on reduced motion", () => {
    const a = createSporeField(300), b = createSporeField(300);
    sporeField(a, 3.5, [100, 20, -40]); sporeField(b, 3.5, [100, 20, -40]);
    expect(Array.from(a.pos)).toEqual(Array.from(b.pos));
    for (let i = 0; i < 300; i++) expect(Math.abs(a.pos[i * 3]! - 100)).toBeLessThanOrEqual(SPORE_BOX / 2 + 1e-3);
    expect(Array.from(a.fade).filter((v) => v > 0).length).toBeGreaterThanOrEqual(40);
    sporeField(a, 3.5, [0, 0, 0], 150);
    expect(Array.from(a.fade).slice(150).every((v) => v === 0)).toBe(true);
    expect(nodes("").some((n) => n.name === "spores")).toBe(true);
    expect(nodes("?look=original").some((n) => n.name === "spores")).toBe(false);
  });
});
