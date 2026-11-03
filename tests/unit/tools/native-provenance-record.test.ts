/**
 * WP-29: the digest-bound provenance record must match the current bytes of
 * every recorded file, carry complete fields, and dispose of every review
 * candidate the scanner raises in those files. A stale digest means the file
 * changed after review: re-review it and update
 * docs/prds/aura3d-native-provenance-record.json (and the ledger digests).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { inspectSourceEntries, type SourceProvenance } from "../../../tools/native-runtime-audit/source-evidence.js";

const repo = resolve(__dirname, "../../..");
const record = JSON.parse(readFileSync(resolve(repo, "docs/prds/aura3d-native-provenance-record.json"), "utf8")) as Record<string, SourceProvenance>;

describe("native provenance record", () => {
  it("binds every record to the current file bytes with complete review fields", () => {
    const paths = Object.keys(record);
    expect(paths.length).toBeGreaterThan(0);
    // inspectSourceEntries throws on any stale digest or incomplete record.
    const report = inspectSourceEntries(paths.map((path) => ({ path, bytes: readFileSync(resolve(repo, path)) })), { provenance: record });
    for (const file of report.files) {
      expect(file.replacementStatus, file.path).not.toBe("unreviewed");
      expect(file.owner, file.path).toBeTruthy();
      expect(file.license, file.path).toBeTruthy();
      expect(file.reviewEvidence.length, file.path).toBeGreaterThan(0);
    }
    expect(report.findings.filter((finding) => !finding.review).map((finding) => `${finding.path}:${finding.line} ${finding.kind} ${finding.detail}`)).toEqual([]);
  });

  it("covers the G27 math files, the WP-13 rewrites and the WP-11 binding", () => {
    for (const path of [
      "packages/math/src/three/index.ts", "packages/math/src/ShapeUtils.ts", "packages/math/src/ConvexHull.ts", "packages/math/src/OBB.ts",
      "packages/rendering/src/geometry/Support.ts", "packages/rendering/src/geometry/Extrude.ts", "packages/animation/src/PropertyBinding.ts"
    ]) expect(record[path], path).toBeDefined();
    expect(record["packages/math/src/three/index.ts"]!.replacementStatus).toBe("third-party-licensed");
    expect(record["packages/rendering/src/geometry/Support.ts"]!.replacementStatus).toBe("independent");
  });

  it("keeps the ledger's G27 digests in step with the record", () => {
    const ledger = readFileSync(resolve(repo, "docs/prds/aura3d-native-capability-ledger.json"), "utf8");
    for (const path of ["packages/math/src/three/index.ts", "packages/math/src/ShapeUtils.ts", "packages/math/src/ConvexHull.ts", "packages/math/src/OBB.ts"]) {
      expect(ledger, path).toContain(`sha256:${record[path]!.sha256}`);
    }
  });
});
