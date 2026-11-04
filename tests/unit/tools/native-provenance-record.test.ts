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
import { createHash } from "node:crypto";
import { summarizeSourceEvidence } from "../../../tools/native-runtime-audit/index.js";
import { classReviewMatches, inspectSourceEntries, parseProvenanceRecord } from "../../../tools/native-runtime-audit/source-evidence.js";
import type { DependencyGraphReport } from "../../../tools/native-runtime-audit/dependency-graph.js";

const repo = resolve(__dirname, "../../..");
const { provenance: record, classReviews, pathScopedReviews, reviewedUnresolvedDependencies } = parseProvenanceRecord(JSON.parse(readFileSync(resolve(repo, "docs/prds/aura3d-native-provenance-record.json"), "utf8")));
const delegatedReviewer = "agent (owner-delegated, 2026-11-02)";
const emptyGraph: DependencyGraphReport = { files: [], manifests: [], lockPackages: [], lockSnapshots: [], npmLockPackages: [], installProfiles: [],
  payloadEntries: [], edges: [], findings: [], limitations: [] };

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
    expect(report.candidateReview.gatedUnreviewed).toBe(0);
  });

  it("records an owner-delegated agent review with a disposition and reason for every candidate", () => {
    const reviews = [...classReviews, ...Object.values(record).flatMap((item) => item.candidateReviews ?? [])];
    expect(reviews.length).toBeGreaterThan(0);
    for (const review of reviews) {
      expect(review.reviewer, review.detail).toBe(delegatedReviewer);
      // Each review names the exact candidate it disposes of; no kind-wide wildcards.
      expect(review.detail, review.kind).toBeTruthy();
      expect(review.disposition).toBeTruthy();
      expect(review.note.trim().length, review.detail).toBeGreaterThan(20);
    }
    // Every standardized equation the scanner knows is classified, so a new pattern needs a new review.
    expect(classReviews.map((review) => review.detail).sort()).toEqual([
      "BT.601 luma coefficients (ITU-R BT.601)", "BT.709 luminance coefficients (ITU-R BT.709)", "CIE D65 white point chromaticity",
      "Golden ratio (1 + sqrt 5) / 2", "Numerical Recipes linear congruential generator", "Radical inverse base 2 (Van der Corput / Hammersley)",
      "Schlick Fresnel approximation (Schlick 1994)", "sRGB transfer function (IEC 61966-2-1)"
    ]);
    expect(classReviews.every((review) => review.disposition === "standardized-equation")).toBe(true);
  });

  it("resolves recorded dispositions and fails on any new unreviewed equation, fingerprint or recorded-file candidate", () => {
    const equation = { path: "src/new-color.ts", bytes: Buffer.from("export const linear = (c: number) => c <= 0.04045 ? c / 12.92 : c;\n") };
    // A reviewed equation class resolves the candidate wherever it appears.
    const reviewed = inspectSourceEntries([equation], { classReviews });
    expect(reviewed.findings).toEqual([expect.objectContaining({ kind: "standardized-equation", review: expect.objectContaining({ reviewer: delegatedReviewer }) })]);
    expect(summarizeSourceEvidence(emptyGraph, reviewed)).toMatchObject({ status: "scan-complete", unreviewedGatedCandidates: 0 });
    // Without a recorded review the same candidate is new and fails the audit.
    const fresh = summarizeSourceEvidence(emptyGraph, inspectSourceEntries([equation]));
    expect(fresh).toMatchObject({ status: "failed", unreviewedGatedCandidates: 1 });
    expect(fresh.unreviewedGatedSample).toEqual([expect.objectContaining({ path: "src/new-color.ts", kind: "standardized-equation" })]);
    // An unreviewed supplied fingerprint hit fails too.
    const hit = inspectSourceEntries([{ path: "src/copied.ts", bytes: Buffer.from("const marker = 'FINGERPRINT-42';") }],
      { fingerprints: [{ id: "reference-marker", text: "FINGERPRINT-42" }], classReviews });
    expect(summarizeSourceEvidence(emptyGraph, hit).status).toBe("failed");
    // A new candidate in a recorded file without its own disposition fails, even when the file record says independent.
    const bytes = Buffer.from("// see three.js docs\nexport const x = 1;\n");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const recorded = inspectSourceEntries([{ path: "src/recorded.ts", bytes }], { provenance: { "src/recorded.ts": {
      sha256, license: "MIT", owner: "WP-29", replacementStatus: "independent", reviewEvidence: ["reviewed"] } } });
    expect(summarizeSourceEvidence(emptyGraph, recorded)).toMatchObject({ status: "failed", unreviewedGatedCandidates: 1 });
    // Text candidates in unrecorded files remain review leads rather than failures.
    const lead = summarizeSourceEvidence(emptyGraph, inspectSourceEntries([{ path: "src/note.ts", bytes: Buffer.from('const note = "three";') }]));
    expect(lead).toMatchObject({ status: "review-required", unreviewedGatedCandidates: 0 });
  });

  it("covers the G27 math files, the WP-13 rewrites and the WP-11 binding", () => {
    for (const path of [
      "packages/math/src/three/index.ts", "packages/math/src/ShapeUtils.ts", "packages/math/src/ConvexHull.ts", "packages/math/src/OBB.ts",
      "packages/rendering/src/geometry/Support.ts", "packages/rendering/src/geometry/Extrude.ts", "packages/animation/src/PropertyBinding.ts"
    ]) expect(record[path], path).toBeDefined();
    expect(record["packages/math/src/three/index.ts"]!.replacementStatus).toBe("independent");
    expect(record["packages/rendering/src/geometry/Support.ts"]!.replacementStatus).toBe("independent");
  });

  it("keeps the ledger's G27 digests in step with the record", () => {
    const ledger = readFileSync(resolve(repo, "docs/prds/aura3d-native-capability-ledger.json"), "utf8");
    for (const path of ["packages/math/src/three/index.ts", "packages/math/src/ShapeUtils.ts", "packages/math/src/ConvexHull.ts", "packages/math/src/OBB.ts"]) {
      expect(ledger, path).toContain(`sha256:${record[path]!.sha256}`);
    }
  });

  it("keeps path-scoped class reviews scoped, delegated, reasoned and expiring with the program", () => {
    expect(pathScopedReviews.length).toBeGreaterThan(0);
    for (const review of pathScopedReviews) {
      const label = `${review.kind} ${review.detailPattern ?? review.detail ?? "*"}`;
      expect(review.reviewer, label).toBe(delegatedReviewer);
      expect(review.paths?.length, label).toBeGreaterThan(0);
      expect(review.note.trim().length, label).toBeGreaterThan(40);
      expect(review.note, label).toContain("expires 2027-01-31");
      expect(review.disposition, label).not.toBe("replacement-needed");
      // Scope entries are exact files or directory prefixes inside the audited trees, never a root wildcard.
      for (const path of review.paths!) expect(path === "/" || path === "" || path === "." || path === "./", `${label}: ${path}`).toBe(false);
    }
    // Candidate kinds that point at real derivation or reuse are never swept up wholesale.
    const wholesale = pathScopedReviews.filter((review) => review.kind === "fingerprint" || review.kind === "standardized-equation");
    expect(wholesale).toEqual([]);
  });

  it("matches a path-scoped review only inside its paths, on its kind, and by payload entry path", () => {
    const review = { kind: "text-reference" as const, paths: ["tests/", "package/dist/", "tools/exact.ts"], disposition: "false-positive" as const, reviewer: delegatedReviewer, note: "scoped" };
    const finding = (path: string, kind = "text-reference" as const) => ({ path, kind, detail: "three" });
    expect(classReviewMatches(review, finding("tests/unit/a.test.ts"))).toBe(true);
    expect(classReviewMatches(review, finding("tools/exact.ts"))).toBe(true);
    expect(classReviewMatches(review, finding("tools/exact.ts.bak"))).toBe(false);
    expect(classReviewMatches(review, finding("packages/engine/src/a.ts"))).toBe(false);
    expect(classReviewMatches(review, finding("tests-extra/a.ts"))).toBe(false);
    expect(classReviewMatches(review, finding("tests/reports/x/aura3d-engine-5.0.0.tgz!/package/dist/a.js"))).toBe(true);
    expect(classReviewMatches(review, finding("tests/reports/x/aura3d-engine-5.0.0.tgz!/package/src/a.js"))).toBe(false);
    expect(classReviewMatches(review, finding("tests/unit/a.test.ts#base64-3"))).toBe(true);
    expect(classReviewMatches(review, finding("tests/unit/a.test.ts", "package-import" as never))).toBe(false);
    const pattern = { ...review, detailPattern: "Base64 block \\d+: \\d{1,2} decoded bytes require provenance review" };
    expect(classReviewMatches(pattern, { path: "tests/a.json", kind: "text-reference", detail: "Base64 block 4: 48 decoded bytes require provenance review" })).toBe(true);
    expect(classReviewMatches(pattern, { path: "tests/a.json", kind: "text-reference", detail: "Base64 block 4: 480 decoded bytes require provenance review" })).toBe(false);
  });

  it("rejects unscoped or malformed path-scoped reviews and global reviews outside exact equation or fingerprint ids", () => {
    const ok = { kind: "text-reference", paths: ["tests/"], disposition: "false-positive", reviewer: delegatedReviewer, note: "reviewed in tests" };
    expect(parseProvenanceRecord({ $pathScopedReviews: [ok] }).pathScopedReviews).toHaveLength(1);
    expect(() => parseProvenanceRecord({ $pathScopedReviews: [{ ...ok, paths: undefined }] })).toThrow(/scoped to paths|must list the paths/);
    expect(() => parseProvenanceRecord({ $pathScopedReviews: [{ ...ok, paths: ["../x"] }] })).toThrow(/Invalid candidate class review paths/);
    expect(() => parseProvenanceRecord({ $pathScopedReviews: [{ ...ok, paths: ["/etc/"] }] })).toThrow(/Invalid candidate class review paths/);
    expect(() => parseProvenanceRecord({ $pathScopedReviews: [{ ...ok, detail: "x", detailPattern: "y" }] })).toThrow(/detail pattern/);
    expect(() => parseProvenanceRecord({ $pathScopedReviews: [{ ...ok, detailPattern: "(" }] })).toThrow(/detail pattern/);
    expect(() => parseProvenanceRecord({ $pathScopedReviews: [{ ...ok, kind: "not-a-kind" }] })).toThrow(/Invalid candidate class review/);
    expect(() => parseProvenanceRecord({ $candidateClassReviews: [ok] })).toThrow(/Global class reviews are limited|scoped to paths/);
    expect(() => parseProvenanceRecord({ $pathScopedReviews: [ok, ok] })).toThrow(/Duplicate/);
  });

  it("records a delegated name review for every lock-unpinned dependency that would otherwise keep a profile unprojected", () => {
    expect(reviewedUnresolvedDependencies.map((item) => item.name).sort()).toEqual([
      "@sveltejs/vite-plugin-svelte", "@types/react-dom", "@vitejs/plugin-react", "@vitejs/plugin-vue", "svelte", "vue"
    ]);
    for (const item of reviewedUnresolvedDependencies) {
      expect(item.reviewer, item.name).toBe(delegatedReviewer);
      expect(item.note, item.name).toContain("expires 2027-01-31");
    }
    expect(() => parseProvenanceRecord({ $reviewedUnresolvedDependencies: [{ name: "Not A Name", reviewer: "r", note: "n" }] })).toThrow(/Invalid reviewed unresolved dependency/);
    expect(() => parseProvenanceRecord({ $reviewedUnresolvedDependencies: [{ name: "vue", reviewer: "r", note: "n" }, { name: "vue", reviewer: "r", note: "n" }] })).toThrow(/Invalid reviewed unresolved dependency/);
  });
});
