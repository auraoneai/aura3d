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
import { featureGeneratorIncompatibility } from "../../../../packages/rendering/src/program/FeatureSelect";
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

/**
 * Features the T0-05 compatibility rule (FeatureSelect.featureGeneratorIncompatibility)
 * keeps OFF the generated path today, each tracked by its open issue. This
 * list may only SHRINK: a feature excluded but not listed fails the guard
 * (a new non-conforming chunk cannot slip in silently), and a listed feature
 * that became compatible fails too (remove it). Not a mask: excluded features
 * never reach a generated program at runtime either.
 */
const KNOWN_EXCLUDED: Readonly<Record<string, string>> = {
  "prd10.caustics": "#1143 (fragment body-hook chunk declares a uniform; needs pars/call split)",
  "prd10.wind": "#881 (vertex:deform chunk must define a3dDeform(inout vec4, inout vec3, inout vec4))"
};

const registered = shaderFeaturesFor(ALL_STRICT);
const excluded = new Map(registered.flatMap((f) => {
  const why = featureGeneratorIncompatibility(f);
  return why === undefined ? [] : [[f.id, why] as const];
}));
/** What the generator actually composes: registered and generator-compatible. */
const features = registered.filter((f) => !excluded.has(f.id));

describe("C-02 every registered chunk compiles (glslangValidator, GLSL ES 3.00)", () => {
  it("registry is populated (guards against an empty, vacuous pass)", () => {
    expect(features.length).toBeGreaterThan(5);
  });

  it("only KNOWN_EXCLUDED features are excluded from the generated path (list may only shrink)", () => {
    const unlisted = [...excluded].filter(([id]) => !(id in KNOWN_EXCLUDED)).map(([id, why]) => `${id}: ${why}`);
    // Stale = listed but no longer excluded (fixed) or no longer registered at all.
    const stale = Object.keys(KNOWN_EXCLUDED).filter((id) => !excluded.has(id));
    expect(unlisted, `newly excluded (fix the chunk, or file an issue and list it):\n${unlisted.join("\n")}`).toEqual([]);
    expect(stale, `now generator-compatible: remove from KNOWN_EXCLUDED: ${stale.join(", ")}`).toEqual([]);
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

/**
 * Report-only (separate CI step, not a gate): force each KNOWN_EXCLUDED
 * feature into a raw program anyway (generateProgramImpl does not filter;
 * the exclusion is applied at select time in FeatureSelect) and print what
 * glslang says, so the tracked breaks stay visible. The GATE tests above
 * never compose them, because the runtime never selects them. Runs only when A3D_GLSL_REPORT_EXCLUDED=1.
 */
describe.runIf(process.env.A3D_GLSL_REPORT_EXCLUDED === "1")("report-only: raw validation of KNOWN_EXCLUDED features", () => {
  for (const id of Object.keys(KNOWN_EXCLUDED)) {
    it(`${id} (${KNOWN_EXCLUDED[id]})`, () => {
      const feature = registered.find((f) => f.id === id);
      expect(feature, `${id} is no longer registered: remove it from KNOWN_EXCLUDED`).toBeDefined();
      const failures: string[] = [];
      for (const pass of PASSES) {
        try {
          const program = generateProgramImpl(base(pass, { [id]: selectedValue(feature!) }), { flags: ALL_STRICT });
          for (const [stage, src] of [["vert", program.vertex], ["frag", program.fragment]] as const) {
            const log = validate(`raw-${pass}-${id}`, stage, src);
            if (log) failures.push(`${pass} [${stage}] ${log.split("\n").find((l) => l.startsWith("ERROR")) ?? log.slice(0, 200)}`);
          }
        } catch (error) {
          failures.push(`${pass}: generator threw ${String(error).slice(0, 200)}`);
        }
      }
      console.log(`[report-only] ${id} ${KNOWN_EXCLUDED[id]}: ${failures.length === 0 ? "compiles raw — candidate for removal" : `\n  ${failures.join("\n  ")}`}`);
    });
  }
});
