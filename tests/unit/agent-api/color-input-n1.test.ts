/**
 * N1 colour input: every CSS colour form parses wherever colours are accepted (material presets, background,
 * lights, fog, volumetric fog, sky, effect ramps, toon ink, custom colour uniforms); invalid values throw
 * COLOR_INVALID naming the value and the option; never the silent near-black [0.02, 0.025, 0.035].
 */

import { describe, expect, it } from "vitest";

import { AuraColorParseError, auraColorToHex, parseAuraColorSrgb } from "../../../packages/engine/src/agent-api/color";
import { colorToLinearRgba } from "../../../packages/engine/src/agent-api/colorUtils";
import { material } from "../../../packages/engine/src/agent-api/nodes/material";
import { lights } from "../../../packages/engine/src/agent-api/nodes/lights";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import { sky } from "../../../packages/engine/src/agent-api/nodes/sky";
import { vfxEffectBuilders } from "../../../packages/engine/src/agent-api/nodes/effects";
import { toonInkColor } from "../../../packages/engine/src/agent-api/nodes/effects.toon";
import { blendSkyBandColor } from "../../../packages/engine/src/agent-api/LayeredSceneComposition";

const NAVY = [0.02, 0.025, 0.035];

function expectInvalid(work: () => unknown, value: string, where?: RegExp): void {
  try {
    work();
    expect.unreachable(`accepted ${value}`);
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(value);
    expect((error as Error).message).toContain("COLOR_INVALID");
    if (where) expect((error as Error).message).toMatch(where);
  }
}

describe("N1 parser forms", () => {
  it.each([
    ["#e85", [0xee, 0x88, 0x55, 255]],
    ["#e858", [0xee, 0x88, 0x55, 0x88]],
    ["#ee8855", [0xee, 0x88, 0x55, 255]],
    ["#ee885580", [0xee, 0x88, 0x55, 0x80]],
    ["rgb(238, 136, 85)", [0xee, 0x88, 0x55, 255]],
    ["rgba(238,136,85,0.5)", [0xee, 0x88, 0x55, 127.5]],
    ["rgb(238 136 85 / 50%)", [0xee, 0x88, 0x55, 127.5]],
    ["rgb(100%, 50%, 0%)", [255, 127.5, 0, 255]],
    ["hsl(0, 100%, 50%)", [255, 0, 0, 255]],
    ["hsla(120, 100%, 50%, 0.25)", [0, 255, 0, 63.75]],
    ["hsl(240deg 100% 50% / 1)", [0, 0, 255, 255]],
    ["hsl(-120, 100%, 50%)", [0, 0, 255, 255]],
    ["hsl(0.5turn, 100%, 50%)", [0, 255, 255, 255]],
    ["hsl(400grad, 100%, 50%)", [255, 0, 0, 255]],
    ["coral", [0xff, 0x7f, 0x50, 255]],
    [0xee8855, [0xee, 0x88, 0x55, 255]]
  ] as const)("%j", (input, bytes) => {
    const rgba = parseAuraColorSrgb(input);
    for (let i = 0; i < 4; i += 1) expect(rgba[i]! * 255).toBeCloseTo(bytes[i]!, 3);
  });

  it("hsl(π rad) is cyan", () => {
    const [r, g, b] = parseAuraColorSrgb(`hsl(${Math.PI}rad, 100%, 50%)`);
    expect(r).toBeCloseTo(0, 6);
    expect(g).toBeCloseTo(1, 6);
    expect(b).toBeCloseTo(1, 6);
  });

  it("the benchmark stacker hsl() colours are not near-black", () => {
    for (let level = 0; level < 26; level += 1) {
      const color = `hsl(${(205 + level * 9) % 360}, 65%, 58%)`;
      const linear = colorToLinearRgba(color);
      expect(Math.max(linear[0], linear[1], linear[2])).toBeGreaterThan(0.2);
      expect([...linear.slice(0, 3)]).not.toEqual(NAVY);
    }
  });

  it.each(["rgb(1,,2)", "rgb(1, 2, x)", "hsl(1 2% 3% / 4 / 5)", "#12345", "bluish", "rgb()"])("rejects %s and names the whole value", (bad) => {
    try {
      parseAuraColorSrgb(bad);
      expect.unreachable(`accepted ${bad}`);
    } catch (error) {
      expect(error).toBeInstanceOf(AuraColorParseError);
      expect((error as AuraColorParseError).code).toBe("COLOR_INVALID");
      expect((error as AuraColorParseError).input).toBe(bad);
    }
  });
});

describe("N1 auraColorToHex", () => {
  it("passes #rrggbb, arrays and non-colours through unchanged", () => {
    expect(auraColorToHex("#A1b2C3", "x")).toBe("#A1b2C3");
    const arr = [0.1, 0.2, 0.3];
    expect(auraColorToHex(arr, "x")).toBe(arr);
    expect(auraColorToHex(undefined, "x")).toBeUndefined();
  });

  it("re-encodes every other form to #rrggbb", () => {
    expect(auraColorToHex("#f80", "x")).toBe("#ff8800");
    expect(auraColorToHex("hsl(0, 100%, 50%)", "x")).toBe("#ff0000");
    expect(auraColorToHex("rgb(0 128 255)", "x")).toBe("#0080ff");
    expect(auraColorToHex("rebeccapurple", "x")).toBe("#663399");
    expect(auraColorToHex(0x123456, "x")).toBe("#123456");
  });

  it("throws COLOR_INVALID naming the value and where", () => {
    expectInvalid(() => auraColorToHex("hsl(nope)", "sky.gradient({ zenith })"), "hsl(nope)", /sky\.gradient\(\{ zenith \}\)/);
  });
});

describe("N1 API entry points", () => {
  it("material presets accept any form and reject invalid naming the option", () => {
    for (const preset of [material.pbr, material.emissive, material.glass, material.metal, material.chrome, material.matteClay] as const) {
      expect(() => preset({ color: "hsl(205, 65%, 58%)" })).not.toThrow();
      expect(() => preset({ color: "rgb(10 200 30)" })).not.toThrow();
      expect(() => preset({ color: "orange" })).not.toThrow();
    }
    expectInvalid(() => material.glass({ color: "hsl(banana)" }), "hsl(banana)", /\{ color \}/);
    expectInvalid(() => material.emissive({ emissive: "glowy" }), "glowy", /\{ emissive \}/);
  });

  it("lights and background accept CSS forms", () => {
    expect(() => lights.point({ color: "hsl(30 100% 60%)" })).not.toThrow();
    expect(() => lights.hemisphere({ skyColor: "skyblue", groundColor: "#2a2f45" })).not.toThrow();
    expect(() => scene().background("rgb(15 20 36)")).not.toThrow();
    expectInvalid(() => lights.point({ color: "rgb(1,2)" }), "rgb(1,2)", /lights\.point/);
  });

  it("effects.fog / volumetricFog normalise non-hex colours to #rrggbb, keep hex and \"sky\" byte-identical", () => {
    const fogColor = (options: Record<string, unknown>) => (vfxEffectBuilders.fog(options).toJSON() as { color?: unknown }).color;
    expect(fogColor({ color: "#9fb7d9" })).toBe("#9fb7d9");
    expect(fogColor({ color: "sky" })).toBe("sky");
    expect(fogColor({})).toBeUndefined();
    expect(fogColor({ color: "hsl(210, 40%, 70%)" })).toBe(auraColorToHex("hsl(210, 40%, 70%)", "x"));
    expect(fogColor({ color: "lightsteelblue" })).toBe("#b0c4de");
    expectInvalid(() => vfxEffectBuilders.fog({ color: "foggy" }), "foggy", /effects\.fog\(\{ color \}\)/);
    const vol = (options: Record<string, unknown>) => (vfxEffectBuilders.volumetricFog(options).toJSON() as { color?: unknown }).color;
    expect(vol({})).toBe("#6f84b9");
    expect(vol({ color: "#123456" })).toBe("#123456");
    expect(vol({ color: "rgb(255, 0, 0)" })).toBe("#ff0000");
    expectInvalid(() => vfxEffectBuilders.volumetricFog({ color: "misty" }), "misty", /volumetricFog/);
  });

  it("sky builders normalise every colour field; hex skies are unchanged", () => {
    const spec = (builder: { toJSON(): unknown }) => (builder.toJSON() as { spec: Record<string, any> }).spec;
    const hexSky = spec(sky.gradient({ zenith: "#102040", horizon: "#a0c0e0", ground: "#202020", clouds: { coverage: 0.4, color: "#ffffff" } }));
    expect(hexSky).toMatchObject({ zenith: "#102040", horizon: "#a0c0e0", ground: "#202020", clouds: { coverage: 0.4, color: "#ffffff" } });
    const cssSky = spec(sky.gradient({
      zenith: "hsl(220, 60%, 20%)",
      horizon: "lightblue",
      ground: "#222",
      sun: { elevationDeg: 10, azimuthDeg: 0, color: "rgb(255 220 180)" },
      bands: [{ elevationDeg: 5, widthDeg: 4, color: "orange", intensity: 1 }],
      clouds: { coverage: 0.3, color: "white" }
    }));
    expect(cssSky.zenith).toBe(auraColorToHex("hsl(220, 60%, 20%)", "x"));
    expect(cssSky.horizon).toBe("#add8e6");
    expect(cssSky.ground).toBe("#222222");
    expect(cssSky.sun.color).toBe("#ffdcb4");
    expect(cssSky.bands[0].color).toBe("#ffa500");
    expect(cssSky.clouds.color).toBe("#ffffff");
    expect(spec(sky.preetham({ sun: { elevationDeg: 20, azimuthDeg: 0 }, groundColor: "tan" })).groundColor).toBe("#d2b48c");
    expectInvalid(() => sky.gradient({ zenith: "deep blue", horizon: "#fff" }), "deep blue", /sky\.gradient\(\{ zenith \}\)/);
  });

  it("toon ink, sky-band blending accept any CSS colour", () => {
    expect(toonInkColor("black")).toEqual([0, 0, 0]);
    expect(toonInkColor("rgb(255, 0, 0)")).toEqual([1, 0, 0]);
    expect(() => toonInkColor("inky")).toThrow(/COLOR_INVALID/);
    expect(blendSkyBandColor("red", "#0000ff", 0)).toBe(blendSkyBandColor("#ff0000", "#0000ff", 0));
  });
});
