// Native WebGPU fog under reversed depth: the generated WGSL programs read the fog distance from the standard window
// depth (1 - z when the frame projection is reversed, P22 > 0), as `a3d.reversedFogDepth` does for WebGL2 programs.
// Source checks only; no GPU execution.
import { describe, expect, it } from "vitest";
import "../../../packages/rendering/src/lanes/prd01";
import "../../../packages/rendering/src/lanes/prd02";
import type { QrFlags } from "../../../packages/rendering/src/contracts/core";
import { generateProgramImpl } from "../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import { createGeneratedPbrProgram } from "../../../packages/rendering/src/webgpu/GeneratedPbrProgram";
import { createGeneratedUnlitProgram } from "../../../packages/rendering/src/webgpu/GeneratedUnlitProgram";

const flags: QrFlags = { values: {}, on: () => true };
const READING = "let fogDepth = select(input.position.z, 1.0 - input.position.z, frame.projection[2][2] > 0.0) / input.position.w;";

describe("native WebGPU fog depth", () => {
  it("lit and unlit generated programs keep the standard fog distance under reversed depth", () => {
    const lit = generateProgramImpl(normalizeProgramFeatures({
      lighting: "lit", lights: { clustered: false, dir: 1, hemisphere: false, point: 0, rect: 0, spot: 0 }, maps: {}, extensions: [], environment: "none", fog: "exp2", features: {}
    }), { flags }).descriptor!;
    expect(createGeneratedPbrProgram(lit).fragment).toContain(READING);
    const unlit = generateProgramImpl(normalizeProgramFeatures({ lighting: "unlit", maps: {}, extensions: [], environment: "none", fog: "linear", features: { "a3d.nativePrimitive": "triangles" } }), { flags }).descriptor!;
    expect(createGeneratedUnlitProgram(unlit).fragment).toContain(READING);
  });
});
