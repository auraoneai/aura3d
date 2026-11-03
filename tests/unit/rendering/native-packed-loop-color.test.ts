import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { registerShaderChunk, registerShaderFeature } from "../../../packages/rendering/src/contracts/program";
import { generateProgramImpl } from "../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import { PACKED_LOOP_COLOR_DEFINE, PACKED_LOOP_COLOR_FEATURE, PACKED_LOOP_COLOR_FRAGMENT_MATERIAL_GLSL,
  PACKED_LOOP_COLOR_FRAGMENT_PARS_GLSL, PACKED_LOOP_COLOR_UNIFORM } from "../../../packages/rendering/src/batching/shaders/packedLoopColor.glsl";

const declaration = "test.packed-loop-color.pars", material = "test.packed-loop-color.material";
const flags = createTrustedQrFlags({ A3D_PARITY_BATCHING: true });
const hasGlslang = spawnSync("glslangValidator", ["--version"], { stdio: "ignore" }).status === 0;
let unregister: (() => void) | undefined;

beforeAll(() => {
  registerShaderChunk({ name: declaration, owner: "prd11", stage: "fragment", glsl: PACKED_LOOP_COLOR_FRAGMENT_PARS_GLSL });
  registerShaderChunk({ name: material, owner: "prd11", stage: "fragment", glsl: PACKED_LOOP_COLOR_FRAGMENT_MATERIAL_GLSL });
  unregister = registerShaderFeature({ id: PACKED_LOOP_COLOR_FEATURE, owner: "prd11", flag: "A3D_PARITY_BATCHING",
    hooks: ["fragment:pars", "fragment:material"], chunks: [declaration, material],
    select: () => true, defines: () => ({ [PACKED_LOOP_COLOR_DEFINE]: true }) });
});
afterAll(() => unregister?.());

function program(lighting: "lit" | "unlit", selected = true) {
  return generateProgramImpl(normalizeProgramFeatures({ lighting, alphaMode: "mask",
    lights: { dir: lighting === "lit" ? 1 : 0, point: 0, spot: 0, rect: 0, clustered: false, hemisphere: false },
    features: selected ? { [PACKED_LOOP_COLOR_FEATURE]: true } : {} }), { flags });
}

describe("staged packed-loop color shader", () => {
  it.each(["lit", "unlit"] as const)("applies %s member color before alpha masking without a draw-row texture", (lighting) => {
    const selected = program(lighting), ordinary = program(lighting, false);
    expect(selected.defines[PACKED_LOOP_COLOR_DEFINE]).toBe(true);
    expect(ordinary.defines[PACKED_LOOP_COLOR_DEFINE]).toBeUndefined();
    expect(ordinary.fragment).not.toContain(PACKED_LOOP_COLOR_UNIFORM);
    const color = selected.fragment.indexOf("a3dBaseColor *= u_a3dPackedLoopColor;");
    expect(color).toBeGreaterThan(selected.fragment.indexOf("vec4 a3dBaseColor = u_baseColor;"));
    expect(color).toBeLessThan(selected.fragment.indexOf("float a3dAlpha = a3dBaseColor.a;"));
    expect(selected.fragment).toContain("material.diffuseContribution *= u_a3dPackedLoopColor.rgb;");
    expect(selected.fragment).toContain("material.specularColorBlended *= u_a3dPackedLoopColor.rgb;");
    expect(selected.fragment).not.toContain("u_a3dDrawData");
    expect(selected.vertex).not.toContain("gl_DrawID");
  });

  it.skipIf(!hasGlslang)("links both generated variants and retains the actual color uniform", () => {
    const dir = mkdtempSync(join(tmpdir(), "aura3d-packed-loop-color-"));
    try {
      for (const lighting of ["lit", "unlit"] as const) {
        const selected = program(lighting), vertex = join(dir, `${lighting}.vert`), fragment = join(dir, `${lighting}.frag`);
        writeFileSync(vertex, selected.vertex);
        writeFileSync(fragment, selected.fragment);
        const reflection = execFileSync("glslangValidator", ["-l", "-q", vertex, fragment], { encoding: "utf8" });
        expect(reflection).toContain(PACKED_LOOP_COLOR_UNIFORM);
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
