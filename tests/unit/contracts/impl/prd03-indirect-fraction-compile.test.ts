import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import "../../../../packages/rendering/src/lanes/prd01";
import "../../../../packages/rendering/src/lanes/prd03";
import type { ProgramFeatures } from "../../../../packages/rendering/src/contracts/program";
import { generateProgramImpl } from "../../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures } from "../../../../packages/rendering/src/program/ProgramFeatures";

/**
 * #1139 (Track 0, all,strict): `prd03.indirectFraction` is selected for every
 * forward draw under A3D_QR_POST, and its `fragment:end` body wrote `o_color`
 * and read `a3dIndirectRadiance`, neither of which the C-02 generator
 * declares, so every forward program failed to compile under `all`. This
 * composes real forward programs with the feature and checks (a) the body
 * uses the generator's own symbols and (b) the fragment compiles with
 * glslangValidator when it is installed (CI ubuntu images and `brew install
 * glslang` provide it; without it the structural checks still run).
 */

const FLAGS = resolveQrFlags({ options: ["post"], env: { A3D_QR_CORE: "v2" } });
const FEATURE = { "prd03.indirectFraction": "indirectFraction" };
const DIR1 = { dir: 1, point: 0, spot: 0, rect: 0, clustered: false, hemisphere: false } as const;

function gen(partial: Partial<ProgramFeatures>) {
  return generateProgramImpl(normalizeProgramFeatures({ ...partial, features: FEATURE }), { flags: FLAGS });
}

function glslang(): string | null {
  try {
    execFileSync("glslangValidator", ["--version"], { stdio: "ignore" });
    return "glslangValidator";
  } catch {
    return null;
  }
}

const CASES: [string, Partial<ProgramFeatures>][] = [
  ["unlit-opaque", {}],
  ["lit-1dir", { lighting: "lit", lights: DIR1 }],
  ["lit-fog", { lighting: "lit", lights: DIR1, fog: "exp2" }],
  ["lit-blend", { lighting: "lit", lights: DIR1, alphaMode: "blend" }]
];

describe("#1139 prd03.indirectFraction composes into a valid forward program", () => {
  it.each(CASES)("%s: the feature body is spliced and uses only generator symbols", (_name, partial) => {
    const fragment = gen(partial).fragment;
    expect(fragment).toContain("a3dWriteIndirectFraction(vec4(a3dColor, a3dAlpha), indirectDiffuse + indirectSpecular)");
    expect(fragment).not.toMatch(/\bo_color\b/);
    expect(fragment).not.toMatch(/\ba3dIndirectRadiance\b/);
    // The write lands before the generator's single output write.
    expect(fragment.indexOf("a3dWriteIndirectFraction(vec4(a3dColor")).toBeLessThan(fragment.indexOf("outColor = vec4(a3dColor, a3dAlpha);"));
  });

  const validator = glslang();
  it.runIf(validator !== null).each(CASES)("%s: glslangValidator compiles the fragment", (name, partial) => {
    const dir = mkdtempSync(join(tmpdir(), "prd03-indfrac-"));
    const file = join(dir, `${name}.frag`);
    writeFileSync(file, gen(partial).fragment);
    let log = "";
    try {
      log = execFileSync(validator!, ["-S", "frag", file], { encoding: "utf8" });
    } catch (error) {
      log = String((error as { stdout?: string }).stdout ?? error);
    }
    expect(log, log).not.toMatch(/ERROR/);
  });
});
