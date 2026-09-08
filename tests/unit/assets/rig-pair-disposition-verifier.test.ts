import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { verifyRetainedPairDispositions } from "../../../tools/locomotion-301/verify-pair-dispositions.js";

function fixture(overrides: Record<string, unknown> = {}) {
  const root = mkdtempSync(join(tmpdir(), "rig-dispositions-"));
  for (let source = 0; source < 4; source++) for (let target = 0; target < 4; target++) {
    const directory = join(root, `${source}-${target}`); mkdirSync(directory);
    writeFileSync(join(directory, "pair.json"), JSON.stringify({
      pair: { source: `rig-${source}`, target: `rig-${target}`, map: { ok: true, coverage: 1, requiredCoverage: 1 }, correctionValues: { schema: "aura3d-rig-pair-correction/v1" } },
      quality: { pass: true, failures: [] },
      ...(source === 0 && target === 1 ? overrides : {})
    }));
  }
  return root;
}

describe("retained rig-pair correction disposition verifier", () => {
  it("requires four explicit no-correction and twelve measured correction dispositions", () => {
    const result = verifyRetainedPairDispositions(fixture());
    expect(result.pass).toBe(true);
    expect(result.pairs.filter(row => row.disposition.status === "explicit-no-pair-map-correction")).toHaveLength(4);
    expect(result.pairs.filter(row => row.disposition.status === "measured-pair-correction-applied")).toHaveLength(12);
  });
  it("fails closed when rendered quality leaves a pair open", () => {
    const result = verifyRetainedPairDispositions(fixture({ quality: { pass: false, failures: ["pose"] } }));
    expect(result.pass).toBe(false);
    expect(result.failures).toContain("rig-0->rig-1: correction disposition remains open");
  });
});
