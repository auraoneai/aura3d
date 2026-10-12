/**
 * 02-S11: the contact-shadow mask program compiles as GLSL ES 3.00.
 *
 * WebGL2Device.compileShader passes sources through verbatim. The mask
 * sources had no `#version 300 es`, so their `in`/`out`/`layout` declarations
 * failed to compile on the device and every `lighting.contact` scene threw
 * NoDrawError (azure-gpu run 38184694289, prd02-contact-cube). Validated with
 * Khronos glslangValidator; the lighting-quality lane gate sets
 * A3D_REQUIRE_GLSLANG=1 so it cannot skip there.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { CONTACT_MASK_SHADER_SOURCES } from "../../../../packages/rendering/src/passes/ContactShadowPass";

const glslangAvailable = !spawnSync("glslangValidator", ["--version"], { stdio: "ignore" }).error;
const requireGlslang = process.env.A3D_REQUIRE_GLSLANG === "1";
const dir = mkdtempSync(join(tmpdir(), "a3d-contact-glsl-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function validate(stage: "vert" | "frag", source: string): string {
  const file = join(dir, `contact-mask.${stage}`);
  writeFileSync(file, source);
  const run = spawnSync("glslangValidator", ["-S", stage, file], { encoding: "utf8" });
  if (run.error) throw new Error(`glslangValidator unavailable: ${run.error.message}`);
  return run.status === 0 ? "" : `${run.stdout}${run.stderr}`;
}

describe("02-S11 contact-shadow mask program (GLSL ES 3.00)", () => {
  it("both stages start with #version 300 es", () => {
    expect(CONTACT_MASK_SHADER_SOURCES.vertex.startsWith("#version 300 es\n")).toBe(true);
    expect(CONTACT_MASK_SHADER_SOURCES.fragment.startsWith("#version 300 es\n")).toBe(true);
  });

  it.runIf(glslangAvailable || requireGlslang)("vertex and fragment compile with glslangValidator", () => {
    expect(validate("vert", CONTACT_MASK_SHADER_SOURCES.vertex)).toBe("");
    expect(validate("frag", CONTACT_MASK_SHADER_SOURCES.fragment)).toBe("");
  });
});
