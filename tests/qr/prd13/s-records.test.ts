// PRD-13 S-rows — record validator (tools/agent-templates/validate-s-records.mjs).
// One valid and several invalid inline fixtures against the committed
// flag-off-identity and look-capture-timing schemas. The fixtures are
// synthetic test inputs, not evidence: they live only in this file and are
// never written under evidence/prd-13/s-rows/records/.

import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_S_ROWS_DIR, validateAgainstSchema, validateRecord, validateRecordsDir } from "../../../tools/agent-templates/validate-s-records.mjs";

const schemasDir = path.join(DEFAULT_S_ROWS_DIR, "schemas");
const check = { equal: true, comparison: "deep", compared: 3, differing: 0 };

function validFlagOff(): Record<string, unknown> {
  return {
    kind: "flag-off-identity",
    row: "13-S9",
    runId: "1",
    runUrl: "https://github.com/auraoneai/aura3d/actions/runs/1",
    workflow: ".github/workflows/qr-prd13-authoring.yml",
    job: "fixture",
    branch: "main",
    provider: "github-macos-14",
    headSha: "0".repeat(40),
    recordedAt: "2000-01-01T00:00:00Z",
    referenceSha: "85aafcd0b50f86d1b1c487cee4753a1145f79b6c",
    flags: "none",
    checks: {
      compilePromptPlan: check,
      warningText: { ...check, comparison: "byte" },
      recipeCensus: check,
      renderSourceC36: { ...check, compared: 18 }
    }
  };
}

describe("validate-s-records", () => {
  it("accepts a schema-conformant record", () => {
    expect(validateRecord(validFlagOff(), schemasDir)).toEqual([]);
  });

  it("rejects missing runId, wrong provider, short headSha and a non-18 RenderSource census", () => {
    const record = validFlagOff();
    delete record.runId;
    record.provider = "gitlab-macos";
    record.headSha = "abc";
    (record.checks as Record<string, unknown>).renderSourceC36 = { ...check, compared: 17 };
    const errors = validateRecord(record, schemasDir);
    expect(errors).toContain('/: missing required "runId"');
    expect(errors.some((e) => e.startsWith("/provider:"))).toBe(true);
    expect(errors.some((e) => e.startsWith("/headSha:"))).toBe(true);
    expect(errors.some((e) => e.startsWith("/checks/renderSourceC36/compared:"))).toBe(true);
  });

  it("rejects unknown kinds and unexpected properties", () => {
    expect(validateRecord({ kind: "made-up" }, schemasDir)[0]).toMatch(/no schema/);
    expect(validateRecord({ ...validFlagOff(), score: 9 }, schemasDir)).toContain('/: unexpected property "score"');
  });

  it("enforces the 8-minute ceiling and exactly 3 runs for 13-S6", () => {
    const run = { runId: "2", repository: "o/r", conclusion: "success", durationSeconds: 481, pngs: [{ file: "a.png", sha256: "f".repeat(64) }], appliedLookPath: "x/appliedLook.json", appliedLookSha256: "e".repeat(64) };
    const record = { ...validFlagOff(), kind: "look-capture-timing", row: "13-S6", workflow: ".github/workflows/aura3d-lookdev.yml", template: "mini-game", command: "aura3d look capture --runner gh-actions", runs: [run, run] };
    for (const key of ["referenceSha", "flags", "checks"]) delete (record as Record<string, unknown>)[key];
    const errors = validateRecord(record, schemasDir);
    expect(errors).toContain("/runs: 2 items < minItems 3");
    expect(errors).toContain("/runs/0/durationSeconds: 481 > maximum 480");
  });

  it("requires a human judge via contains", () => {
    const schema = { type: "array", contains: { type: "object", properties: { type: { const: "human" } }, required: ["type"] }, minContains: 1 };
    expect(validateAgainstSchema(schema, [{ type: "vision" }])).toEqual(['/: 0 items match "contains", need 1']);
    expect(validateAgainstSchema(schema, [{ type: "vision" }, { type: "human" }])).toEqual([]);
  });

  it("throws on unsupported schema keywords instead of ignoring them", () => {
    expect(() => validateAgainstSchema({ format: "date-time" }, "x")).toThrow(/unsupported schema keyword "format"/);
  });

  it("parses every committed schema with only supported keywords", () => {
    for (const kind of ["template-baseline", "ab-judgement", "look-lint-census", "craft-ratio", "look-capture-timing", "three-compat-comparison", "flag-off-identity"]) {
      const errors = validateRecord({ kind }, schemasDir);
      expect(errors.length, kind).toBeGreaterThan(0);
      expect(errors.every((e) => !/no schema/.test(e)), kind).toBe(true);
    }
  });

  it("reports counts over a records directory and flags invalid files", () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "s-records-"));
    try {
      mkdirSync(path.join(tmp, "records", "13-S9"), { recursive: true });
      mkdirSync(path.join(tmp, "schemas"));
      writeFileSync(path.join(tmp, "schemas", "flag-off-identity.schema.json"), JSON.stringify({ type: "object", required: ["runId"] }));
      expect(validateRecordsDir(tmp)).toMatchObject({ records: 0, invalid: 0 });
      writeFileSync(path.join(tmp, "records", "13-S9", "bad.json"), JSON.stringify({ kind: "flag-off-identity" }));
      writeFileSync(path.join(tmp, "records", "13-S9", "good.json"), JSON.stringify({ kind: "flag-off-identity", runId: "1" }));
      expect(validateRecordsDir(tmp)).toMatchObject({ records: 2, invalid: 1 });
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
