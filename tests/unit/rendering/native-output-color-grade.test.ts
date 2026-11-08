import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OUTPUT_VERTEX_GLSL, outputFragmentGlsl, TONE_MAP_OPERATOR_FUNCTIONS } from "../../../packages/rendering/src/output/ToneMappingOperators.glsl";
import { createOutputWgsl } from "../../../packages/rendering/src/output/ToneMappingOperators.wgsl";
import { DISPLAY_GRADE_GLSL } from "../../../packages/rendering/src/post/shaders/displayGrade.glsl";
import { FINALIZE_FXAA_FUSED_GLSL, FINALIZE_P3_GLSL } from "../../../packages/rendering/src/post/shaders/finalize.glsl";

const hasGlslang = spawnSync("glslangValidator", ["--version"], { stdio: "ignore" }).status === 0;
const base = { backgroundCoverage: false, overlay: false, fullCoverage: true } as const;

describe("OutputPass colour-grade epilogue (OUTPUT_COLOR_GRADE)", () => {
  it("adds the grade only to graded variants and leaves ungraded WGSL byte-identical", () => {
    for (const outputColorSpace of ["srgb", "display-p3"] as const) {
      const plain = outputFragmentGlsl({ ...base, toneMapping: "aces", outputColorSpace });
      const graded = outputFragmentGlsl({ ...base, toneMapping: "aces", outputColorSpace, colorGrade: true });
      expect(plain).not.toContain("#define OUTPUT_COLOR_GRADE");
      expect(graded).toContain("#define OUTPUT_COLOR_GRADE");
      // The grade sits between the tone curve and the gamut transform + final encode.
      const body = graded.slice(graded.indexOf("void main()"));
      expect(body.indexOf("TONE_MAP(hdr * u_exposure)")).toBeLessThan(body.indexOf("a3dOutputColorGrade(display, v_uv)"));
      expect(body.indexOf("a3dOutputColorGrade(display, v_uv)")).toBeLessThan(body.indexOf("a3dOutputGamut(display)"));
      const wgslPlain = createOutputWgsl({ ...base, toneMapping: "aces", outputColorSpace });
      const wgslFalse = createOutputWgsl({ ...base, toneMapping: "aces", outputColorSpace, colorGrade: false });
      const wgslGraded = createOutputWgsl({ ...base, toneMapping: "aces", outputColorSpace, colorGrade: true });
      expect(wgslFalse.webgpu.fragment).toBe(wgslPlain.webgpu.fragment);
      expect(wgslPlain.webgpu.fragment).not.toContain("Grade");
      expect(wgslGraded.webgpu.fragment).toContain("display = a3dOutputColorGrade(display, uv);");
      expect(wgslGraded.portableBindings.map(binding => binding.name)).toEqual(expect.arrayContaining(["u_gradeA", "u_gradeB"]));
      expect(wgslPlain.portableBindings.map(binding => binding.name)).not.toContain("u_gradeA");
    }
    expect(() => createOutputWgsl({ ...base, toneMapping: "aces", colorGrade: "yes" as unknown as boolean })).toThrow(/colorGrade/);
  });

  it.skipIf(!hasGlslang)("compiles and links every graded operator variant for sRGB and Display-P3", () => {
    const dir = mkdtempSync(join(tmpdir(), "aura3d-output-grade-"));
    try {
      const vertex = join(dir, "output.vert");
      writeFileSync(vertex, OUTPUT_VERTEX_GLSL);
      for (const toneMapping of Object.keys(TONE_MAP_OPERATOR_FUNCTIONS)) {
        for (const outputColorSpace of ["srgb", "display-p3"] as const) {
          const fragment = join(dir, `${toneMapping}-${outputColorSpace}.frag`);
          writeFileSync(fragment, outputFragmentGlsl({ ...base, overlay: true, toneMapping, outputColorSpace, colorGrade: true }));
          const reflection = execFileSync("glslangValidator", ["-l", "-q", vertex, fragment], { encoding: "utf8" });
          expect(reflection).toContain("u_gradeA");
          expect(reflection).toContain("u_gradeB");
        }
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it.skipIf(!hasGlslang)("compiles the P3 tail shaders that now carry film grain and the P3 LUT fetch", () => {
    const dir = mkdtempSync(join(tmpdir(), "aura3d-p3-tail-"));
    try {
      for (const [name, source] of [["grade", DISPLAY_GRADE_GLSL], ["finalize-p3", FINALIZE_P3_GLSL], ["fxaa-fused", FINALIZE_FXAA_FUSED_GLSL]] as const) {
        const fragment = join(dir, `${name}.frag`);
        writeFileSync(fragment, source);
        expect(() => execFileSync("glslangValidator", [fragment], { encoding: "utf8" })).not.toThrow();
      }
      expect(FINALIZE_P3_GLSL).toContain("filmGrain(gl_FragCoord.xy");
      expect(DISPLAY_GRADE_GLSL).toContain("uniform int u_lutP3;");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
