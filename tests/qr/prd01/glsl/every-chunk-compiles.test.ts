/**
 * C-02 "every registered chunk compiles", for real (lane-01 CI guard).
 *
 * Composes a generated program for every registered ShaderFeature, both alone
 * and all together under `$ALL,strict`, for each pass, and validates the
 * vertex and fragment GLSL ES 3.00 with Khronos glslangValidator. This would
 * have failed on #1140's all,strict outage: `prd03.indirectFraction` read an
 * undeclared `a3dIndirectRadiance`, and every aura3d capture failed with
 * "generated program failed to compile" (GPU run 38123946016, 0/19 ready).
 *
 * glslangValidator comes from `glslang-tools` (apt), installed in the
 * qr-prd01-core "GLSL validate" job (this file is outside tests/qr/prd01/unit,
 * so the plain unit job does not run it). Locally: `brew install glslang`.
 * A missing binary FAILS the test; there is no skip.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import "../../../../packages/engine/src/lanes/index";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { shaderFeaturesFor, type ProgramFeatures, type ShaderFeature } from "../../../../packages/rendering/src/contracts/program";
import { normalizeProgramFeatures } from "../../../../packages/rendering/src/program/ProgramFeatures";
import { generateProgramImpl } from "../../../../packages/rendering/src/program/ProgramGenerator";

const ALL = "core,lighting,post,materials,assets,animation,vfx,camera,game,world,tiers,looks,compiler";
const ALL_STRICT = resolveQrFlags({ env: { A3D_QR: `${ALL},strict` } });
const PASSES: readonly ProgramFeatures["pass"][] = ["forward", "depth", "distance", "velocity"];
const LIGHT1 = { dir: 1, point: 1, spot: 0, rect: 0, clustered: false, hemisphere: false } as const;

const VALIDATOR = process.env.A3D_GLSL_VALIDATOR ?? "glslangValidator";
const dir = mkdtempSync(join(tmpdir(), "a3d-glsl-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** Validate one stage; returns the info log on failure, "" on success. */
function validate(name: string, stage: "vert" | "frag", source: string): string {
  const file = join(dir, `${name.replace(/[^A-Za-z0-9_.-]/g, "_")}.${stage}`);
  writeFileSync(file, source);
  const run = spawnSync(VALIDATOR, [file], { encoding: "utf8" });
  if (run.error) throw new Error(`glslangValidator not runnable (${String(run.error)}); install glslang-tools`);
  return run.status === 0 ? "" : `${run.stdout}${run.stderr}`.trim();
}

/** Lit, textured base record so lit/material chunks have their inputs. */
function base(pass: ProgramFeatures["pass"], features: Record<string, string | number | boolean>): ProgramFeatures {
  const lit = pass === "forward";
  return normalizeProgramFeatures({
    pass,
    lighting: lit ? "lit" : "unlit",
    ...(lit ? { lights: LIGHT1, environment: "equirect" as const } : {}),
    maps: lit ? { baseColor: { uvSet: 0, transform: false }, normal: { uvSet: 0, transform: false } } : {},
    features
  } as Partial<ProgramFeatures>);
}

/** A representative selected value for a feature (its defines() must accept it). */
function selectedValue(feature: ShaderFeature): string | number | boolean {
  for (const candidate of [true, 1, "on"] as const) {
    try {
      feature.defines(candidate);
      return candidate;
    } catch {
      /* try next */
    }
  }
  return true;
}

function compileAll(label: string, record: ProgramFeatures): string[] {
  const failures: string[] = [];
  let program;
  try {
    program = generateProgramImpl(record, { flags: ALL_STRICT });
  } catch (error) {
    return [`${label}: generator threw ${String(error).slice(0, 400)}`];
  }
  for (const [stage, src] of [["vert", program.vertex], ["frag", program.fragment]] as const) {
    const log = validate(label, stage, src);
    if (!log) continue;
    // Quote the offending generated line(s) so the CI log names the chunk.
    const lines = src.split("\n");
    const errors = log.split("\n").filter((l) => /^ERROR: 0:\d+:/.test(l)).slice(0, 3);
    const quoted = errors.map((e) => {
      const n = Number(/^ERROR: 0:(\d+):/.exec(e)![1]);
      return `${e}\n    > ${n}: ${(lines[n - 1] ?? "").trim().slice(0, 200)}`;
    });
    failures.push(`${label} [${stage}]\n${quoted.join("\n") || log.slice(0, 600)}`);
  }
  return failures;
}

const features = shaderFeaturesFor(ALL_STRICT);

describe("C-02 every registered chunk compiles (glslangValidator, GLSL ES 3.00)", () => {
  it("registry is populated (guards against an empty, vacuous pass)", () => {
    expect(features.length).toBeGreaterThan(5);
  });

  for (const pass of PASSES) {
    it(`${pass}: every feature alone compiles`, () => {
      const failures: string[] = [];
      for (const feature of features) {
        failures.push(...compileAll(`${pass}-${feature.id}`, base(pass, { [feature.id]: selectedValue(feature) })));
      }
      expect(failures, failures.join("\n\n")).toEqual([]);
    });

    it(`${pass}: all features together ($ALL,strict) compile`, () => {
      const record = base(pass, Object.fromEntries(features.map((f) => [f.id, selectedValue(f)])));
      const failures = compileAll(`${pass}-ALL`, record);
      expect(failures, failures.join("\n\n")).toEqual([]);
    });
  }
});
