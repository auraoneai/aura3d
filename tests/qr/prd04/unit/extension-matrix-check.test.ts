/**
 * extension-matrix-check.test.ts — PRD-04 P6-2 / R17, row 04-S14.
 *
 * Negative control for `tools/generate-extension-matrix.mjs --check`: in a
 * scratch copy of the two matrix sources plus a synthetic conformance report,
 *  - after a regenerate, `--check` exits 0;
 *  - a hand-edited material entry promoted to `runtime-supported` / `supported`
 *    without integrated G-PANEL evidence makes `--check` exit 1;
 *  - a missing conformance report makes `--check` exit 1.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const REPO = resolve(__dirname, "../../../..");
const TOOL = join(REPO, "tools/generate-extension-matrix.mjs");
const GLTF_TS = "packages/assets/src/GLTFExtensionSupport.ts";
const PHYS_TS = "packages/engine/src/material-physical/PhysicalMaterialSpec.ts";
const REPORT = "tests/reports/material-conformance.json";

let scratch: string;

function run(...args: string[]) {
  return spawnSync(process.execPath, [TOOL, ...args], { cwd: scratch, encoding: "utf8" });
}

function writeReport(extensions: Record<string, unknown>) {
  mkdirSync(join(scratch, dirname(REPORT)), { recursive: true });
  writeFileSync(join(scratch, REPORT), JSON.stringify({ extensions }));
}

beforeEach(() => {
  scratch = mkdtempSync(join(tmpdir(), "prd04-extmatrix-"));
  for (const rel of [GLTF_TS, PHYS_TS]) {
    mkdirSync(join(scratch, dirname(rel)), { recursive: true });
    cpSync(join(REPO, rel), join(scratch, rel));
  }
  // Probe passed but no integrated G-PANEL judgement: at most approximate.
  writeReport({ KHR_materials_clearcoat: { passed: true, qrFlags: "standalone" } });
  expect(run().status).toBe(0);
});

afterEach(() => rmSync(scratch, { recursive: true, force: true }));

describe("generate-extension-matrix --check", () => {
  it("passes on freshly regenerated matrices", () => {
    const out = run("--check");
    expect(out.status, out.stderr).toBe(0);
    expect(out.stdout).toContain("matrices match");
  });

  it("fails on a hand-promoted GLTF material entry (no G-PANEL evidence)", () => {
    const path = join(scratch, GLTF_TS);
    const src = readFileSync(path, "utf8");
    const edited = src.replace(
      /entry\(\s*"KHR_materials_clearcoat"\s*,\s*"material"\s*,\s*"[^"]+"/,
      'entry("KHR_materials_clearcoat", "material", "runtime-supported"'
    );
    expect(edited, "fixture entry present").not.toBe(src);
    writeFileSync(path, edited);
    const out = run("--check");
    expect(out.status).toBe(1);
    expect(out.stderr).toContain("stale status field");
  });

  it("fails on a hand-promoted physical matrix entry", () => {
    const path = join(scratch, PHYS_TS);
    const src = readFileSync(path, "utf8");
    const edited = src.replace(/\{\s*extension:\s*"clearcoat"\s*,\s*support:\s*"[^"]+"/, '{ extension: "clearcoat", support: "supported"');
    expect(edited, "fixture entry present").not.toBe(src);
    writeFileSync(path, edited);
    const out = run("--check");
    expect(out.status).toBe(1);
    expect(out.stderr).toContain("stale status field");
  });

  it("fails when the conformance report is missing", () => {
    rmSync(join(scratch, REPORT));
    const out = run("--check");
    expect(out.status).toBe(1);
    expect(out.stderr).toContain("missing");
  });
});
