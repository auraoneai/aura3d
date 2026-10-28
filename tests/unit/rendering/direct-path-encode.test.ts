import { describe, expect, it } from "vitest";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import "../../../packages/rendering/src/lanes/prd01";
import { generateProgramImpl, OUTPUT_SRGB_CHUNK_GLSL } from "../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures, PROGRAM_OUTPUT_SRGB_FEATURE } from "../../../packages/rendering/src/program/ProgramFeatures";
import { TONE_MAPPING_OPERATORS_GLSL } from "../../../packages/rendering/src/output/ToneMappingOperators.glsl";
import { EXPOSURE_CASES, expectedLinear, linearToSrgbChannel, threeAcesFilmic, threeAcesLuma255 } from "../../browser/exposure-reference";

/**
 * The direct render path (`quality: "auto"`, no post chain, no OutputPass) draws generated programs straight to the
 * canvas. Until this test existed those programs wrote LINEAR colour: a plane that reads 67/255 through the HDR chain
 * (and in three.js r185) read 18/255 on the default route, about 3.7x too dark.
 *
 * Node cannot run GLSL, so the guard is in three layers:
 *   1. a forward program for a draw whose frame outputs sRGB (the feature bit) encodes before it writes outColor, and a
 *      program for any other frame is byte-for-byte what it was (the HDR/post routes are untouched);
 *   2. the encode's operator body is the OutputPass operator body, character for character (modulo names);
 *   3. the CPU reference of that operator turns the calibration plane's linear value into the luma three.js reads, and
 *      shows the linear write is the value the bug produced.
 * The pixel-level proof is the remote spec tests/browser/direct-path-parity.spec.ts.
 */
const FLAGS = resolveQrFlags({ env: { A3D_QR_CORE: "v2" } });
const LIT_ONE_SUN = { lighting: "lit" as const, lights: { dir: 1, point: 0, spot: 0, rect: 0, clustered: false, hemisphere: false } };

function source(extra: Record<string, boolean>): string {
  const program = generateProgramImpl(normalizeProgramFeatures({ ...LIT_ONE_SUN, features: extra } as never), { flags: FLAGS });
  return program.fragment ?? (program as unknown as { fragmentSource: string }).fragmentSource;
}

describe("direct path output encode", () => {
  const hdr = source({});
  const direct = source({ [PROGRAM_OUTPUT_SRGB_FEATURE]: true });

  it("encodes before outColor when the frame outputs sRGB", () => {
    expect(direct).toContain("a3dColor = a3dEncodeForCanvas(a3dColor);");
    expect(direct.indexOf("a3dEncodeForCanvas(a3dColor)")).toBeLessThan(direct.indexOf("outColor = vec4(a3dColor"));
  });

  it("leaves every other program byte-identical", () => {
    expect(hdr).not.toContain("a3dEncodeForCanvas");
    // The marker comment carries the program key, which legitimately differs (the bit is part of the key).
    const withoutMarker = (text: string): string => text.split("\n").filter((line) => !line.startsWith("// a3d-generated-program")).join("\n");
    const stripped = direct.replace(OUTPUT_SRGB_CHUNK_GLSL + "\n", "").replace("  a3dColor = a3dEncodeForCanvas(a3dColor);\n", "");
    expect(withoutMarker(stripped)).toBe(withoutMarker(hdr));
  });

  it("uses the OutputPass ACES operator body, not a second curve", () => {
    const squash = (text: string): string => text.replace(/\/\/.*$/gm, "").replace(/\s+/g, "");
    const rename = (text: string): string => text.replace(/a3dRRTAndODTFit/g, "RRTAndODTFit").replace(/a3dAcesFilmic/g, "ACESFilmicToneMapping");
    const operatorBody = (text: string, name: string): string => {
      const start = text.indexOf(`vec3 ${name}(`);
      let depth = 0;
      for (let i = text.indexOf("{", start); i < text.length; i += 1) {
        if (text[i] === "{") depth += 1;
        if (text[i] === "}") {
          depth -= 1;
          if (depth === 0) return squash(text.slice(start, i + 1)).replace("saturate(color)", "clamp(color,0.0,1.0)");
        }
      }
      throw new Error(`${name} not found`);
    };
    for (const name of ["RRTAndODTFit", "ACESFilmicToneMapping"]) {
      // The OutputPass copy documents that the caller applies exposure; the constants and arithmetic are identical.
      expect(operatorBody(rename(OUTPUT_SRGB_CHUNK_GLSL), name), name).toBe(operatorBody(TONE_MAPPING_OPERATORS_GLSL, name));
    }
  });

  it("the encoded value of the calibration plane is what three.js reads; the bug wrote the linear value", () => {
    const grey = EXPOSURE_CASES.find((c) => c.light === "directional" && c.albedo.toLowerCase() === "#808080" && c.intensity === 1)!;
    const linear = expectedLinear(grey);
    const encoded = threeAcesLuma255(linear);
    expect(encoded).toBeGreaterThan(64);
    expect(encoded).toBeLessThan(70);
    const linearWrite = Math.round(255 * (0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]));
    expect(linearWrite).toBeLessThan(25);
    // The same operator + OETF the chunk applies, from the TS reference.
    const aces = threeAcesFilmic(linear);
    expect(Math.round(255 * linearToSrgbChannel(aces[0]))).toBeCloseTo(encoded, -1);
  });
});
