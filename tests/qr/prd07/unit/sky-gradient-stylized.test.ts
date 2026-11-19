/**
 * 5.7.0 stylised `sky.gradient`: profile selection, validation, the CPU reference (`stylizedGradientBase` via
 * `evaluateSky`), the STYLIZED program variant (GLSL + WGSL) and its `u_sg*` uniform packing. Classic gradient skies
 * keep their spec, program key and uniforms byte for byte.
 */
import { describe, expect, it } from "vitest";
import { sky } from "../../../../packages/engine/src/agent-api/nodes/sky";
import { evaluateSky, skyFrame, skyProgramDefines, skyProgramKey } from "../../../../packages/rendering/src/atmosphere/SkyEval";
import { skyFragmentSource } from "../../../../packages/rendering/src/atmosphere/sky.glsl";
import { fullSkyPortableBindings, fullSkyWgsl, STYLIZED_SKY_PORTABLE_BINDINGS } from "../../../../packages/rendering/src/atmosphere/skyFull.wgsl";
import { skyUniforms, stylizedGradientUniforms } from "../../../../packages/rendering/src/atmosphere/SkyBackgroundPass";

type V3 = [number, number, number];
const specOf = (builder: { toJSON(): unknown }) => (builder.toJSON() as { spec: Record<string, unknown> }).spec;
// Colours here are linear [r, g, b] arrays (the runtime path the evaluators share); the public type takes CSS strings.
const frameOf = (options: Record<string, unknown>) => skyFrame(specOf(sky.gradient(options as never)));
const srgb = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const at = (elevationDeg: number, azimuthDeg = 0): V3 => {
  const e = (elevationDeg * Math.PI) / 180, a = (azimuthDeg * Math.PI) / 180;
  return [Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a)];
};
const close = (a: readonly number[], b: readonly number[], digits = 9) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, digits));

const RED: V3 = [1, 0, 0], GREEN: V3 = [0, 1, 0], BLUE: V3 = [0, 0, 1], GREY: V3 = [0.2, 0.2, 0.2];

describe("sky.gradient profile selection", () => {
  it("classic options stay classic and byte-identical (no style field, GRADIENT program, no u_sg uniforms)", () => {
    const spec = specOf(sky.gradient({ zenith: "#103060", horizon: "#a0c0e0", exponent: 2, horizonGlow: 0.2, sun: { elevationDeg: 10, azimuthDeg: 0 } }));
    expect(spec).toEqual({ zenith: "#103060", horizon: "#a0c0e0", exponent: 2, horizonGlow: 0.2, sun: { elevationDeg: 10, azimuthDeg: 0 }, model: "gradient" });
    const frame = skyFrame(spec);
    expect(frame.gradient?.stylized).toBeUndefined();
    expect(skyProgramDefines(frame).model).toBe("GRADIENT");
    expect(skyProgramKey(skyProgramDefines(frame))).toBe("prd07.sky.GRADIENT.disc");
    expect([...skyUniforms(frame, new Float32Array(16), 0).keys()].some((k) => k.startsWith("u_sg"))).toBe(false);
  });

  it("any stylised field, or style: \"stylized\", selects the stylised profile and the STYLIZED program", () => {
    for (const extra of [{ mid: { color: "#ff0000" } }, { zenithBlend: [0, 0.5] as const }, { horizonHeight: -0.1 }, { haze: { intensity: 0.2 } }, { dither: true }, { style: "stylized" as const }]) {
      const frame = frameOf({ zenith: "#0000ff", horizon: "#ffffff", ...extra });
      expect(frame.gradient?.stylized, JSON.stringify(extra)).toBeTruthy();
      expect(skyProgramDefines(frame).model).toBe("STYLIZED");
    }
    const sunOnly = frameOf({ zenith: "#0000ff", horizon: "#ffffff", sun: { elevationDeg: 5, azimuthDeg: 0, glow: [] } });
    expect(sunOnly.gradient?.stylized).toBeTruthy();
    expect(skyProgramKey(skyProgramDefines(sunOnly))).toBe("prd07.sky.STYLIZED.disc");
  });

  it("rejects mixed profiles, unordered blends and over-capacity bands or lobes", () => {
    expect(() => sky.gradient({ zenith: "#000", horizon: "#fff", exponent: 2, mid: { color: "#888" } })).toThrow(/classic profile/);
    expect(() => sky.gradient({ zenith: "#000", horizon: "#fff", style: "classic", haze: { intensity: 0.1 } })).toThrow(/stylised profile/);
    expect(() => sky.gradient({ zenith: "#000", horizon: "#fff", zenithBlend: [0.5, 0.2] })).toThrow(/zenithBlend/);
    expect(() => sky.gradient({ zenith: "#000", horizon: "#fff", mid: Array.from({ length: 7 }, () => ({ color: "#888" })) })).toThrow(/at most 6/);
    expect(() => sky.gradient({ zenith: "#000", horizon: "#fff", sun: { elevationDeg: 1, azimuthDeg: 0, glow: Array.from({ length: 4 }, () => ({ exponent: 2, intensity: 1 })) } })).toThrow(/at most 3/);
    expect(() => sky.gradient({ zenith: "#000", horizon: "#fff", mid: { color: "not-a-colour" } })).toThrow();
  });

  it("stylised hex colours decode with the exact sRGB curve (classic keeps gamma 2.2); CSS colours normalise", () => {
    const frame = frameOf({ style: "stylized", zenith: "#336699", horizon: "white", mid: { color: "rgb(255, 0, 0)" } });
    close(frame.gradient!.zenith, [srgb(0x33 / 255), srgb(0x66 / 255), srgb(0x99 / 255)], 12);
    close(frame.gradient!.horizon, [1, 1, 1], 12);
    close(frame.gradient!.stylized!.mid[0]!.color, [1, 0, 0], 12);
    const classic = frameOf({ zenith: "#336699", horizon: "#ffffff" });
    close(classic.gradient!.zenith, [Math.pow(0x33 / 255, 2.2), Math.pow(0x66 / 255, 2.2), Math.pow(0x99 / 255, 2.2)], 12);
  });
});

describe("stylised gradient CPU reference", () => {
  it("horizon at the horizon line, zenith overhead, ground below; mid band and zenith blend in order", () => {
    const frame = frameOf({ horizon: RED, mid: { color: GREEN, blend: [0, 0.2] }, zenith: BLUE, zenithBlend: [0.3, 0.9], ground: GREY, groundBlend: [0, 0.1] });
    close(evaluateSky(frame, at(0)), RED);
    close(evaluateSky(frame, [0, 0.25, Math.sqrt(1 - 0.0625)]), GREEN);
    close(evaluateSky(frame, at(90)), BLUE);
    close(evaluateSky(frame, at(-30)), GREY);
    // Halfway through the mid blend: smoothstep(0, 0.2, 0.1) = 0.5.
    close(evaluateSky(frame, [0, 0.1, Math.sqrt(0.99)]), [0.5, 0.5, 0]);
  });

  it("horizonHeight moves the line; horizonSharpness squeezes every blend towards it", () => {
    const base = { horizon: RED, zenith: BLUE, zenithBlend: [0, 0.4] as const };
    const lowered = frameOf({ ...base, horizonHeight: -0.2 });
    close(evaluateSky(lowered, [0, -0.2, Math.sqrt(0.96)]), RED);
    close(evaluateSky(lowered, at(12)), BLUE);
    const sharp = frameOf({ ...base, horizonSharpness: 2 });
    // u = 0.2 * 2 = 0.4: the end of the zenith blend.
    close(evaluateSky(sharp, [0, 0.2, Math.sqrt(0.96)]), BLUE);
  });

  it("haze veils the horizon and thins with height", () => {
    const frame = frameOf({ horizon: BLUE, zenith: BLUE, haze: { color: RED, intensity: 0.5, falloff: 10 } });
    close(evaluateSky(frame, at(0)), [0.5, 0, 0.5]);
    const k = 0.5 * Math.exp(-0.5 * 10);
    close(evaluateSky(frame, [0, 0.5, Math.sqrt(0.75)]), [k, 0, 1 - k]);
  });

  it("sun: glow lobes, an additive or painted disc, and discIntensity 0 for glow only", () => {
    const sun = { elevationDeg: 20, azimuthDeg: 40, color: [1, 1, 1] as V3, glow: [{ exponent: 4, intensity: 0.5 }], discSize: 0.04, discSoftness: 0.5, discIntensity: 3 };
    const add = frameOf({ horizon: GREY, zenith: GREY, sun });
    const centre = evaluateSky(add, at(20, 40));
    close(centre, [0.2 + 0.5 + 3, 0.2 + 0.5 + 3, 0.2 + 0.5 + 3]);
    const replace = frameOf({ horizon: GREY, zenith: GREY, sun: { ...sun, discBlend: "replace" } });
    close(evaluateSky(replace, at(20, 40)), [3, 3, 3]);
    const glowOnly = frameOf({ horizon: GREY, zenith: GREY, sun: { ...sun, discIntensity: 0 } });
    close(evaluateSky(glowOnly, at(20, 40)), [0.7, 0.7, 0.7]);
    // Facing away from the sun: no glow, no disc.
    close(evaluateSky(add, at(-20, 220)), GREY, 12);
    // Disc edge: fully off beyond the radius (0.02 rad), fully on inside radius * (1 - softness).
    const edge = frameOf({ horizon: GREY, zenith: GREY, sun: { ...sun, glow: [] } });
    close(evaluateSky(edge, at(20 + (0.021 * 180) / Math.PI, 40)), GREY, 9);
    close(evaluateSky(edge, at(20 + (0.009 * 180) / Math.PI, 40)), [3.2, 3.2, 3.2], 9);
  });

  it("intensity and additive bands apply on the stylised profile too", () => {
    const frame = frameOf({ horizon: GREY, zenith: GREY, style: "stylized", intensity: 2, bands: [{ elevationDeg: 0, widthDeg: 10, color: "#ffffff", intensity: 1 }] });
    const c = evaluateSky(frame, at(0));
    close(c, [(0.2 + 1) * 2, (0.2 + 1) * 2, (0.2 + 1) * 2], 6);
  });
});

describe("STYLIZED program and uniforms", () => {
  const frame = frameOf({
    horizon: RED, mid: [{ color: GREEN, blend: [0, 0.1] }, { color: GREY, blend: [0.1, 0.3] }], zenith: BLUE, zenithBlend: [0.25, 0.8],
    horizonHeight: -0.05, horizonSharpness: 1.5, groundBlend: [0, 0.2], haze: { intensity: 0.3, falloff: 6 }, dither: true,
    sun: { elevationDeg: 10, azimuthDeg: 0, color: [1, 0.5, 0.25], intensity: 2, glow: [{ exponent: 16, intensity: 0.4 }], discSize: 0.03, discSoftness: 0.2, discBlend: "replace" }
  });
  const sg = frame.gradient!.stylized!;

  it("packs every u_sg uniform: shape, blends, mid arrays, sun, glow padding, haze and dither", () => {
    const u = stylizedGradientUniforms(sg);
    close(u.get("u_sgShape") as number[], [-0.05, 1.5, 0, 0.2]);
    close(u.get("u_sgZenith") as number[], [0.25, 0.8, 2, 1]);
    close(Array.from(u.get("u_sgMidColor") as Float32Array).slice(0, 6), [0, 1, 0, 0.2, 0.2, 0.2], 6);
    close(Array.from(u.get("u_sgMidRange") as Float32Array).slice(0, 8), [0, 0.1, 0, 0, 0.1, 0.3, 0, 0], 6);
    close(u.get("u_sgSunColor") as number[], [2, 1, 0.5]);
    const disc = u.get("u_sgSunDisc") as number[];
    close(disc, [Math.cos(0.015), Math.cos(0.015 * 0.8), 3, 1], 12);
    // One authored lobe; the unused ones carry exponent 1 and intensity 0 (pow(0, 0) is undefined in GLSL).
    close(Array.from(u.get("u_sgGlow") as Float32Array), [16, 0.4, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 6);
    close(u.get("u_sgHaze") as number[], [0.3, 6, 1, 0]);
    // skyUniforms carries them for the stylised frame.
    const all = skyUniforms(frame, new Float32Array(16), 0);
    expect(all.get("u_sgHaze")).toEqual(u.get("u_sgHaze"));
  });

  it("dither defaults to false; haze defaults to none with falloff 8", () => {
    const u = stylizedGradientUniforms(frameOf({ zenith: "#000", horizon: "#fff", style: "stylized" }).gradient!.stylized!);
    expect(u.get("u_sgHaze")).toEqual([0, 8, 0, 0]);
  });

  it("GLSL: the STYLIZED variant defines its model, evaluates stylizedGradient and dithers on request", () => {
    const d = skyProgramDefines(frame, { fog: true });
    const src = skyFragmentSource(d);
    expect(src).toContain("#define MODEL_STYLIZED 1");
    expect(src).toContain("#define MODEL_GRADIENT 0");
    expect(src).toMatch(/#elif MODEL_STYLIZED\s+color = stylizedGradient\(direction\);/);
    expect(src).toContain("if (u_sgHaze.z > 0.5) color = stylizedDither(color);");
    // The stylised sky reads the view ray from the camera (far point minus a second point on the ray).
    expect(src).toContain("vec3 direction = normalize(world4.xyz / world4.w - ray0.xyz / ray0.w);");
    // Classic programs never reach the stylised code.
    const classic = skyFragmentSource({ ...d, model: "GRADIENT" });
    expect(classic).toContain("#define MODEL_STYLIZED 0");
    expect(classic).toContain("o_color = vec4(color, 1.0);");
  });

  it("WGSL: the full sky twin carries skyStylizedGradient and dither on the fragment position", () => {
    const d = skyProgramDefines(frame);
    const wgsl = fullSkyWgsl(d, "0.999999").fragment;
    expect(wgsl).toContain("fn skyStylizedGradient(direction: vec3<f32>) -> vec3<f32>");
    expect(wgsl).toContain("color = skyStylizedGradient(direction);");
    expect(wgsl).toContain("@builtin(position) fragCoord: vec4<f32>");
    expect(wgsl).toContain("let direction = normalize(world.xyz / world.w - ray0.xyz / ray0.w);");
    expect(wgsl).toContain("if (aura.u_sgHaze.z > 0.5) { color = skyStylizedDither(color, fragCoord.xy); }");
    for (const binding of STYLIZED_SKY_PORTABLE_BINDINGS) expect(wgsl).toContain(`aura.${binding.name}`);
    expect(fullSkyPortableBindings(false, true).map((b) => b.name)).toEqual(expect.arrayContaining(STYLIZED_SKY_PORTABLE_BINDINGS.map((b) => b.name)));
    expect(fullSkyPortableBindings(false).some((b) => b.name.startsWith("u_sg"))).toBe(false);
    const classic = fullSkyWgsl({ ...d, model: "GRADIENT" }, "0.999999").fragment;
    expect(classic).not.toContain("u_sg");
    expect(classic).toContain("return vec4<f32>(color, 1.0);");
  });
});
