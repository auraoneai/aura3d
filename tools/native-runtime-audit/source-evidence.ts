import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { DEFAULT_PROHIBITED_PACKAGES, readPackagePayload, type ReviewedUnresolvedDependency } from "./dependency-graph.js";

export type SourceKind = "source" | "worker" | "generated-data" | "source-map" | "source-map-content" | "encoded-content" | "binary";
export type ReplacementStatus = "unreviewed" | "independent" | "third-party-licensed" | "replacement-needed";

/** Provenance is an explicit reviewed record, bound to exactly these bytes. */
export interface SourceProvenance {
  readonly sha256: string;
  readonly license: string | null;
  readonly owner: string | null;
  readonly replacementStatus: ReplacementStatus;
  readonly reviewEvidence: readonly string[];
  /** Human dispositions for this file's review candidates (matched by kind and, when given, detail). */
  readonly candidateReviews?: readonly SourceCandidateReview[];
}

/**
 * How a human reviewer classified a review candidate. A disposition is a
 * recorded judgement, not something the scanner can infer:
 * - standardized-equation: a published formula or constant that any correct
 *   implementation shares (for example a colour-transfer constant);
 * - compatibility-contract: public API names, defaults or conventions kept for
 *   documented compatibility, not implementation text;
 * - independent-implementation: reviewed and found independently authored;
 * - licensed-notice: third-party material kept under its retained notice;
 * - false-positive: the match does not concern implementation provenance;
 * - replacement-needed: the candidate identifies material still to replace.
 */
export type CandidateDisposition = "standardized-equation" | "compatibility-contract" | "independent-implementation" |
  "licensed-notice" | "false-positive" | "replacement-needed";

export interface SourceCandidateReview {
  readonly kind: SourceReviewCandidate["kind"];
  /** Exact finding detail; omit to cover every finding of this kind in the file. */
  readonly detail?: string;
  readonly disposition: CandidateDisposition;
  readonly reviewer: string;
  readonly note: string;
}

/**
 * A reviewed disposition for a whole class of candidates that is independent of
 * the file it appears in. Two forms:
 * - a standardized-equation id or reviewer-supplied fingerprint id (`detail`
 *   required; the pattern matches only the published constants themselves);
 * - a path-scoped class of any other candidate kind: `paths` lists exact files
 *   or directory prefixes (ending in `/`) the reviewer inspected, `detail` is
 *   optional (omitted: every detail of that kind). Payload entries
 *   (`<archive>!/package/...`) match on their in-archive path, which starts
 *   with `package/`. A path-scoped review must never be global.
 * Matching is exact on kind, detail (when given) and path; anything else stays
 * unreviewed.
 */
export interface SourceCandidateClassReview {
  readonly kind: SourceReviewCandidate["kind"];
  readonly detail?: string;
  /** Alternative to `detail`: a regular expression (anchored, at most 200 characters) matched against the whole finding detail. */
  readonly detailPattern?: string;
  readonly paths?: readonly string[];
  readonly disposition: CandidateDisposition;
  readonly reviewer: string;
  readonly note: string;
}

/** Shape of docs/prds/aura3d-native-provenance-record.json: path records plus the reserved review keys. */
export const CANDIDATE_CLASS_REVIEWS_KEY = "$candidateClassReviews";
/** Path-scoped class reviews (never global; every entry names the files or directories it was reviewed in). */
export const PATH_SCOPED_REVIEWS_KEY = "$pathScopedReviews";
/** Names the root lock does not pin whose own dependency trees a reviewer checked for prohibited packages. */
export const REVIEWED_UNRESOLVED_DEPENDENCIES_KEY = "$reviewedUnresolvedDependencies";

/** Split a provenance record document into digest-bound file records, global class reviews and path-scoped reviews. */
export function parseProvenanceRecord(document: unknown): {
  provenance: Record<string, SourceProvenance>; classReviews: SourceCandidateClassReview[]; pathScopedReviews: SourceCandidateClassReview[];
  reviewedUnresolvedDependencies: ReviewedUnresolvedDependency[];
} {
  if (!document || typeof document !== "object" || Array.isArray(document)) throw new Error("Provenance must be a path-to-record object");
  const { [CANDIDATE_CLASS_REVIEWS_KEY]: classReviews, [PATH_SCOPED_REVIEWS_KEY]: pathScoped, [REVIEWED_UNRESOLVED_DEPENDENCIES_KEY]: unresolved, ...provenance } = document as Record<string, unknown>;
  if (Object.keys(provenance).some((path) => path.startsWith("$"))) throw new Error("Unknown reserved provenance record key");
  const global = classReviews === undefined ? [] : validateClassReviews(classReviews);
  if (global.some((review) => review.paths || review.detailPattern || (review.kind !== "standardized-equation" && review.kind !== "fingerprint"))) {
    throw new Error("Global class reviews are limited to exact standardized-equation and fingerprint ids; scope anything else under " + PATH_SCOPED_REVIEWS_KEY);
  }
  const scoped = pathScoped === undefined ? [] : validateClassReviews(pathScoped);
  if (scoped.some((review) => !review.paths)) throw new Error(`Every ${PATH_SCOPED_REVIEWS_KEY} entry must list the paths it was reviewed in`);
  const reviewedUnresolvedDependencies = unresolved === undefined ? [] : validateReviewedUnresolved(unresolved);
  return { provenance: provenance as Record<string, SourceProvenance>, classReviews: global, pathScopedReviews: scoped, reviewedUnresolvedDependencies };
}

export interface SourceEntry {
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly scope?: "workspace" | "payload";
  readonly sourceKind?: SourceKind;
}

/** Fingerprints are supplied by a reviewer, never downloaded by the scanner. */
export interface SourceFingerprint {
  readonly id: string;
  readonly sha256?: string;
  readonly text?: string;
  readonly bytesHex?: string;
}

export interface SourceEvidenceOptions {
  readonly paths?: readonly string[];
  readonly payloads?: readonly string[];
  readonly prohibitedPackages?: readonly string[];
  readonly fingerprints?: readonly SourceFingerprint[];
  readonly provenance?: Readonly<Record<string, SourceProvenance>>;
  /** Reviewed equation/fingerprint classes; see SourceCandidateClassReview. */
  readonly classReviews?: readonly SourceCandidateClassReview[];
}

export interface SourceEvidenceFile {
  readonly path: string;
  readonly scope: "workspace" | "payload";
  readonly sha256: string;
  readonly size: number;
  readonly sourceKind: SourceKind;
  readonly license: string | null;
  readonly owner: string | null;
  readonly replacementStatus: ReplacementStatus;
  readonly reviewEvidence: readonly string[];
}

export interface SourceReviewCandidate {
  readonly path: string;
  readonly kind: "package-import" | "text-reference" | "source-map-reference" | "fingerprint" | "embedded-data" | "invalid-source-map" | "missing-source-map-content" | "bundled-source" | "license-notice" | "provenance-reference" | "standardized-equation";
  readonly detail: string;
  readonly line?: number;
  /** Present only when a digest-bound provenance record supplies a human disposition. */
  readonly review?: { readonly disposition: CandidateDisposition; readonly reviewer: string; readonly note: string };
}

/** Counts of review candidates with and without a recorded human disposition. */
export interface SourceCandidateReviewSummary {
  readonly candidates: number;
  readonly reviewed: number;
  readonly unreviewed: number;
  readonly byDisposition: Readonly<Partial<Record<CandidateDisposition, number>>>;
  /**
   * Unreviewed candidates inside the reviewed scope: every standardized-equation
   * and fingerprint candidate, and every candidate in a file that carries a
   * digest-bound provenance record. Any entry here is a new, unreviewed
   * candidate and fails the source audit.
   */
  readonly gatedUnreviewed: number;
}

export interface SourceEvidenceReport {
  readonly schema: "aura3d.native-source-evidence/1";
  readonly files: SourceEvidenceFile[];
  readonly findings: SourceReviewCandidate[];
  readonly candidateReview: SourceCandidateReviewSummary;
  readonly limitations: readonly string[];
  readonly workspaceRoots?: readonly string[];
  readonly checkedSymlinkAliases?: readonly { path: string; target: string; scannedAs: string }[];
}

const ignoredDirectories = new Set([
  "node_modules", ".git", ".cache", ".codex", ".npm", ".pnpm-store", ".vite", ".turbo", ".vercel", ".wrangler",
  ".parcel-cache", ".webpack", ".webpack-cache",
  "coverage", "dist", "test-results", "playwright-report"
]);
const ignoredPaths = new Set([
  "tests/reports", "tools/_quarantine", "tools/bench-vs-threejs",
  // Captured third-party and historical test oracles are not shipped runtime.
  "tests/fixtures/crayon", "tests/fixtures/migrate-three", "tests/fixtures/aura-slam-original",
  "tests/fixtures/roadster-rush-native"
]);
// These checked-in aliases must retain their exact targets. Inspect the
// canonical tree directly; never follow the symlink or assume it contains only
// media, since a future pack can also contain runtime source or binaries.
const soundPackLinks = new Map([
  ["public/packs", "../assets/packs"],
  ["apps/showcase-dot-dash-3d/public/packs", "../../../assets/packs"],
  ["apps/showcase-iron-crown/public/packs", "../../../assets/packs"],
  ["apps/showcase-pips-big-leap/public/packs", "../../../assets/packs"]
]);
// The committed Poly Haven 8k HDRI fixture is 128 MiB + 113 bytes; hash-only binary inputs of that size are in scope.
export const maxSourceFileBytes = 256 * 1024 * 1024;
const candidateKinds: readonly SourceReviewCandidate["kind"][] = ["package-import", "text-reference", "source-map-reference", "fingerprint",
  "embedded-data", "invalid-source-map", "missing-source-map-content", "bundled-source", "license-notice", "provenance-reference", "standardized-equation"];
const dispositions: readonly CandidateDisposition[] = ["standardized-equation", "compatibility-contract", "independent-implementation",
  "licensed-notice", "false-positive", "replacement-needed"];

/**
 * Published formulas and constants that independent implementations of the
 * same standard necessarily share. A match is classified as a
 * standardized-equation review candidate so a reviewer can record that the
 * shared text comes from the standard; it never proves copying or independence.
 */
const standardizedEquations: readonly { readonly id: string; readonly pattern: RegExp }[] = [
  { id: "sRGB transfer function (IEC 61966-2-1)", pattern: /\b0\.04045\b|\b0\.0031308\b/ },
  { id: "BT.709 luminance coefficients (ITU-R BT.709)", pattern: /\b0\.2126\d*\b[\s\S]{0,80}\b0\.7152\d*\b[\s\S]{0,80}\b0\.0722\d*\b/ },
  { id: "BT.601 luma coefficients (ITU-R BT.601)", pattern: /\b0\.299\b[\s\S]{0,80}\b0\.587\b[\s\S]{0,80}\b0\.114\b/ },
  { id: "Schlick Fresnel approximation (Schlick 1994)", pattern: /\bpow\s*\(\s*(?:1(?:\.0*)?|one)\s*-\s*[^,()]+(?:\([^()]*\))?[^,()]*,\s*5(?:\.0*)?\s*\)/ },
  { id: "Golden ratio (1 + sqrt 5) / 2", pattern: /\b1\.6180339887\d*\b|\(\s*1\s*\+\s*Math\.sqrt\(\s*5\s*\)\s*\)\s*\/\s*2\b/ },
  { id: "Radical inverse base 2 (Van der Corput / Hammersley)", pattern: /\b2\.3283064365386963e-10\b|0x55555555[\s\S]{0,200}0x33333333/i },
  { id: "CIE D65 white point chromaticity", pattern: /\b0\.3127\b[\s\S]{0,40}\b0\.329\d*\b/ },
  { id: "Numerical Recipes linear congruential generator", pattern: /\b1664525\b[\s\S]{0,80}\b1013904223\b/ }
];
const maxDecodedBytes = 16 * 1024 * 1024;
const maxEmbeddedEntries = 10000;

/**
 * Scan the requested source trees and previously built payloads without fetching,
 * installing, executing or extracting them. Defaults cover workspace packages,
 * root source and workers; excluded build output must be supplied as a payload.
 */
export function collectSourceEvidence(root: string, options: SourceEvidenceOptions = {}): SourceEvidenceReport {
  const base = realpathSync(resolve(root));
  const seen = new Set<string>();
  const scannedSoundPacks = new Set<string>();
  const checkedSymlinkAliases: { path: string; target: string; scannedAs: string }[] = [];
  // Default roots are skipped when absent (a staged candidate has no untracked `workers/`
  // directory); explicitly requested paths still fail if missing.
  const paths = options.paths ?? ["packages", "src", "workers"].filter((path) => existsSync(resolve(base, path)));
  if (paths.length === 0 && !(options.payloads?.length)) throw new Error("Source audit requires at least one source path or payload");
  const report = inspectSourceEntries(entries(), options);
  return { ...report, workspaceRoots: paths.map((path) => display(base, resolve(base, path))), checkedSymlinkAliases };

  function* entries(): Generator<SourceEntry> {
    for (const path of paths) {
      const absolute = resolve(base, path);
      const real = realpathSync(absolute);
      if (!inside(base, absolute) || !inside(base, real)) throw new Error(`Source path escapes audit root: ${path}`);
      if (real !== absolute) throw new Error(`Source audit refuses symlink: ${path}`);
      // Apply the same cache and static-input guards to explicitly selected
      // subpaths; otherwise selecting public/.cache directly bypasses the walk.
      let parent = base;
      for (const name of display(base, absolute).split("/")) {
        if (name === ".") continue;
        if (isStaticInputTree(display(base, parent))) assertStaticChild(parent, name);
        else if (name === ".DS_Store" || (ignoredDirectories.has(name) && name !== "dist")) {
          throw new Error(`Source audit refuses excluded source path: ${display(base, join(parent, name))}`);
        }
        parent = join(parent, name);
      }
      yield* visit(absolute);
    }
    for (const supplied of options.payloads ?? []) {
      const absolute = resolve(base, supplied);
      const real = realpathSync(absolute);
      if (!inside(base, absolute) || !inside(base, real)) throw new Error(`Payload path escapes audit root: ${supplied}`);
      if (real !== absolute) throw new Error(`Source audit refuses symlink: ${supplied}`);
      for (const entry of readPackagePayload(absolute)) {
        yield { path: `${display(base, absolute)}!/${entry.path}`, bytes: entry.bytes, scope: "payload" };
      }
    }
  }

  function* visit(path: string): Generator<SourceEntry> {
    const label = display(base, path);
    if (ignoredPaths.has(label)) return;
    const stat = lstatSync(path);
    const expectedLink = soundPackLinks.get(label);
    if (expectedLink !== undefined) {
      if (!stat.isSymbolicLink() || readlinkSync(path) !== expectedLink) {
        throw new Error(`Source audit refuses unexpected sound-pack input: ${label}`);
      }
      const target = resolve(base, "assets/packs");
      if (!inside(base, target) || resolve(dirname(path), expectedLink) !== target ||
          realpathSync(target) !== target || !lstatSync(target).isDirectory()) {
        throw new Error(`Source audit refuses unsafe sound-pack target: ${label}`);
      }
      checkedSymlinkAliases.push({ path: label, target: expectedLink, scannedAs: display(base, target) });
      if (!scannedSoundPacks.has(target)) {
        scannedSoundPacks.add(target);
        yield* visit(target);
      }
      return;
    }
    if (stat.isSymbolicLink()) throw new Error(`Source audit refuses symlink: ${label}`);
    if (stat.isDirectory()) {
      const staticTree = isStaticInputTree(label);
      for (const name of readdirSync(path).sort()) {
        const child = join(path, name);
        if (staticTree) assertStaticChild(path, name);
        else if (name === ".DS_Store" || ignoredDirectories.has(name)) continue;
        yield* visit(child);
      }
      return;
    }
    if (!stat.isFile()) throw new Error(`Unsupported source audit input: ${display(base, path)}`);
    if (seen.has(label)) return;
    seen.add(label);
    if (stat.size > maxSourceFileBytes) throw new Error(`Source audit input exceeds ${maxSourceFileBytes} bytes: ${label}`);
    yield { path: label, bytes: readFileSync(path), scope: "workspace" };
  }

  function assertStaticChild(parent: string, name: string): void {
    const child = join(parent, name);
    // A directory named dist inside a public/fixture tree is itself an input,
    // not the workspace's generated build output.
    if (name === ".DS_Store" || (ignoredDirectories.has(name) && name !== "dist")) {
      throw new Error(`Source audit refuses uninspected static input: ${display(base, child)}`);
    }
    if (name.startsWith(".") && name !== ".well-known") {
      const stat = lstatSync(child);
      if (stat.isDirectory() || stat.isSymbolicLink()) {
        throw new Error(`Source audit refuses hidden static directory or symlink: ${display(base, child)}`);
      }
    }
  }
}

/** Scan byte entries, including package contents returned by readPackagePayload. */
export function inspectSourceEntries(entries: Iterable<SourceEntry>, options: SourceEvidenceOptions = {}): SourceEvidenceReport {
  const files: SourceEvidenceFile[] = [];
  const findings: SourceReviewCandidate[] = [];
  const seen = new Set<string>();
  const fingerprints = validateFingerprints(options.fingerprints === undefined ? [] : options.fingerprints);
  if (options.provenance !== undefined && (!options.provenance || typeof options.provenance !== "object" || Array.isArray(options.provenance))) {
    throw new Error("Provenance must be a path-to-record object");
  }
  const prohibited = options.prohibitedPackages ?? DEFAULT_PROHIBITED_PACKAGES;
  if (!Array.isArray(prohibited) || prohibited.some((name) => typeof name !== "string" || !name || name.length > 200)) throw new Error("Invalid prohibited package name");
  let virtualCount = 0;
  const reviews = new Map<string, readonly SourceCandidateReview[]>();
  const recorded = new Set<string>();
  const classReviews = options.classReviews === undefined ? [] : validateClassReviews(options.classReviews);
  for (const entry of entries) inspect(entry, 0);
  let gatedUnreviewed = 0;
  for (let index = 0; index < findings.length; index += 1) {
    const finding = findings[index]!;
    const review = reviews.get(finding.path)?.find((item) => item.kind === finding.kind && (item.detail === undefined || item.detail === finding.detail)) ??
      classReviews.find((item) => classReviewMatches(item, finding));
    if (review) findings[index] = { ...finding, review: { disposition: review.disposition, reviewer: review.reviewer, note: review.note } };
    else if (finding.kind === "standardized-equation" || finding.kind === "fingerprint" ||
        recorded.has(finding.path) || recorded.has(finding.path.split("#", 1)[0]!)) gatedUnreviewed += 1;
  }
  const byDisposition: Partial<Record<CandidateDisposition, number>> = {};
  for (const finding of findings) if (finding.review) byDisposition[finding.review.disposition] = (byDisposition[finding.review.disposition] ?? 0) + 1;
  const reviewedCount = findings.filter((finding) => finding.review).length;
  return {
    schema: "aura3d.native-source-evidence/1", files, findings,
    candidateReview: { candidates: findings.length, reviewed: reviewedCount, unreviewed: findings.length - reviewedCount, byDisposition, gatedUnreviewed },
    limitations: [
      "Text, import, source-map and supplied fingerprint matches are review candidates; neither a match nor its absence proves authorship or copying.",
      "Only selected source paths, checked alias targets and supplied packed payloads are inspected; generated build outputs, installed packages and network activity need their own supplied evidence.",
      "Outside public, root fixture and sound-pack trees, the walk excludes named caches, build output, .DS_Store, tests/reports, tools/_quarantine, tools/bench-vs-threejs and the test-only crayon, migrate-three, aura-slam-original and roadster-rush-native fixture corpora; inspect any required excluded material separately.",
      "In public, root fixture and sound-pack trees, dist is scanned; excluded directory names, .DS_Store and hidden directories other than .well-known fail closed instead of silently omitting potential static inputs.",
      "Known sound-pack symlink aliases are checked against their exact targets and the canonical assets/packs tree is scanned without following the links.",
      "Other symlinks and oversized files are rejected. Encoded and source-map content is bounded and cannot establish the origin of arbitrary compressed or encrypted data.",
      "Percent-encoded non-source-map data URLs and dynamically constructed payloads are not decoded; inspect their actual bytes separately.",
      "License, copyright, attribution and bundled-source references are review candidates, not verified ownership or license determinations.",
      "License, owner, replacement status and review evidence are unverified unless explicitly supplied and bound to the current file digest.",
      "Standardized-equation matches mark published formulas and constants that independent implementations share; they are review candidates, and only a recorded reviewer disposition classifies them.",
      "Candidate dispositions are recorded reviewer judgements (human, or agent under recorded owner delegation) bound to the reviewed file digest or to an exact equation/fingerprint class; the scanner applies but never infers them.",
      "Unreviewed standardized-equation or fingerprint candidates, and unreviewed candidates in files with a provenance record, are new review items and fail the source audit."
    ]
  };

  function inspect(entry: SourceEntry, depth: number): void {
    if (!entry.path || seen.has(entry.path)) throw new Error(`Duplicate or empty source evidence path: ${entry.path}`);
    seen.add(entry.path);
    const bytes = Buffer.from(entry.bytes);
    if (bytes.length > maxSourceFileBytes) throw new Error(`Source evidence input exceeds ${maxSourceFileBytes} bytes: ${entry.path}`);
    const sha256 = digest(bytes);
    const supplied = options.provenance && Object.prototype.hasOwnProperty.call(options.provenance, entry.path)
      ? options.provenance[entry.path] : undefined;
    if (supplied !== undefined && (!supplied || typeof supplied !== "object" || Array.isArray(supplied))) {
      throw new Error(`Invalid provenance record for ${entry.path}`);
    }
    if (supplied && supplied.sha256 !== sha256) throw new Error(`Stale provenance digest for ${entry.path}`);
    if (supplied) recorded.add(entry.path);
    if (supplied && (!Array.isArray(supplied.reviewEvidence) || !supplied.reviewEvidence.every((item) => typeof item === "string" && item.trim().length > 0) ||
        (supplied.owner !== null && (typeof supplied.owner !== "string" || !supplied.owner.trim())) ||
        (supplied.license !== null && (typeof supplied.license !== "string" || !supplied.license.trim())) ||
        !["unreviewed", "independent", "third-party-licensed", "replacement-needed"].includes(supplied.replacementStatus) ||
        (supplied.replacementStatus !== "unreviewed" && supplied.reviewEvidence.length === 0) ||
        (["independent", "third-party-licensed"].includes(supplied.replacementStatus) && (!supplied.owner || !supplied.license)))) {
      throw new Error(`Invalid provenance record for ${entry.path}`);
    }
    if (supplied?.candidateReviews !== undefined) {
      if (!Array.isArray(supplied.candidateReviews) || !supplied.candidateReviews.every((review) => review && typeof review === "object" &&
          candidateKinds.includes(review.kind) && dispositions.includes(review.disposition) &&
          (review.detail === undefined || (typeof review.detail === "string" && review.detail.length > 0)) &&
          typeof review.reviewer === "string" && review.reviewer.trim().length > 0 && typeof review.note === "string" && review.note.trim().length > 0)) {
        throw new Error(`Invalid candidate review for ${entry.path}`);
      }
      reviews.set(entry.path, supplied.candidateReviews);
    }
    const text = decodeText(bytes);
    const sourceKind = entry.sourceKind ?? classify(entry.path, text);
    files.push({ path: entry.path, scope: entry.scope ?? "workspace", sha256, size: bytes.length, sourceKind,
      license: supplied?.license ?? null, owner: supplied?.owner ?? null,
      replacementStatus: supplied?.replacementStatus ?? "unreviewed", reviewEvidence: supplied?.reviewEvidence ?? [] });
    findBundledPath(entry.path, entry.path, findings);

    for (const fingerprint of fingerprints) {
      if ((fingerprint.sha256 && fingerprint.sha256 === sha256) || (fingerprint.bytes && bytes.includes(fingerprint.bytes)) ||
          (fingerprint.text && text?.includes(fingerprint.text))) {
        findings.push({ path: entry.path, kind: "fingerprint", detail: fingerprint.id });
      }
    }
    if (text === undefined || sourceKind === "binary") {
      // Binary strings are review leads, not a substitute for understanding the format.
      const ascii = bytes.toString("latin1").replace(/[^\x20-\x7e\n]/g, " ");
      findReferences(entry.path, ascii, prohibited, findings);
      findProvenanceCandidates(entry.path, ascii, findings);
      return;
    }
    findReferences(entry.path, text, prohibited, findings);
    findProvenanceCandidates(entry.path, text, findings);
    if (sourceKind !== "source-map") findStandardizedEquations(entry.path, text, findings);
    if (sourceKind === "source-map") inspectMap(entry, text, depth);
    if (depth < 3) {
      inspectEncoded(entry, text, depth);
      inspectInlineMap(entry, text, depth);
    }
    const table = /\[(?:\s*-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?\s*,){63,}/i.exec(text);
    if (table) findings.push({ path: entry.path, kind: "embedded-data", detail: "Large numeric table requires provenance review", line: lineAt(text, table.index) });
  }

  function inspectMap(entry: SourceEntry, text: string, depth: number): void {
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch {
      findings.push({ path: entry.path, kind: "invalid-source-map", detail: "Source map is not valid JSON" });
      return;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      findings.push({ path: entry.path, kind: "invalid-source-map", detail: "Source map is not an object" });
      return;
    }
    const map = parsed as Record<string, unknown>;
    if (Array.isArray(map.sections)) {
      map.sections.forEach((item, index) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) {
          findings.push({ path: entry.path, kind: "invalid-source-map", detail: `Invalid source-map section ${index}` });
          return;
        }
        const section = item as Record<string, unknown>;
        if (section.map && typeof section.map === "object" && depth < 3) {
          addVirtual({ path: `${entry.path}#section-${index}`, bytes: Buffer.from(JSON.stringify(section.map)), scope: entry.scope, sourceKind: "source-map" }, depth + 1);
        } else {
          findings.push({ path: entry.path, kind: "missing-source-map-content", detail: `Section ${index} is external, unavailable or beyond the nesting limit` });
        }
      });
      return;
    }
    if (!Array.isArray(map.sources) || !map.sources.every((source) => typeof source === "string")) {
      findings.push({ path: entry.path, kind: "invalid-source-map", detail: "Source map sources must be strings" });
      return;
    }
    if (map.sourceRoot !== undefined && typeof map.sourceRoot !== "string") {
      findings.push({ path: entry.path, kind: "invalid-source-map", detail: "Source map sourceRoot must be a string" });
      return;
    }
    if (typeof map.sourceRoot === "string") {
      findReferences(entry.path, map.sourceRoot, prohibited, findings, "source-map-reference");
      findBundledPath(entry.path, map.sourceRoot, findings);
      findExternalMapReference(entry.path, map.sourceRoot, findings);
    }
    const contents = map.sourcesContent;
    if (contents !== undefined && (!Array.isArray(contents) || contents.length !== map.sources.length)) {
      findings.push({ path: entry.path, kind: "invalid-source-map", detail: "Source map sourcesContent must match sources" });
      return;
    }
    map.sources.forEach((source, index) => {
      findReferences(entry.path, source as string, prohibited, findings, "source-map-reference");
      findBundledPath(entry.path, source as string, findings);
      findExternalMapReference(entry.path, source as string, findings);
      const content = Array.isArray(contents) ? contents[index] : null;
      if (typeof content === "string") {
        if (depth < 3) addVirtual({ path: `${entry.path}#source-${index}`, bytes: Buffer.from(content), scope: entry.scope, sourceKind: "source-map-content" }, depth + 1);
        else findings.push({ path: entry.path, kind: "missing-source-map-content", detail: `sourcesContent[${index}] exceeds the nesting limit` });
      } else if (content !== null && content !== undefined) findings.push({ path: entry.path, kind: "invalid-source-map", detail: `sourcesContent[${index}] is not a string or null` });
      else findings.push({ path: entry.path, kind: "missing-source-map-content", detail: `sourcesContent[${index}] is unavailable; inspect the named source separately` });
    });
  }

  function inspectEncoded(entry: SourceEntry, text: string, depth: number): void {
    // Only quoted or data-URL base64 blocks; do not treat arbitrary identifiers as data.
    const expression = /(\bsourceMappingURL\s*=\s*data:application\/json(?:;charset=[^;,\s]+)?;base64,|\bdata:[^,\s"'`]{0,256};base64,|base64,|["'`])([A-Za-z0-9+/]{2,}={0,2})(?=["'`\s,;)]|\*\/|$)/gi;
    let match: RegExpExecArray | null;
    let index = 0;
    let line: ((offset: number) => number) | undefined;
    while ((match = expression.exec(text))) {
      const explicitMap = /^sourceMappingURL/i.test(match[1]);
      const explicitData = explicitMap || /^data:/i.test(match[1]);
      const encoded = match[2];
      if (encoded.length < 64 && !explicitData) continue;
      if (encoded.length % 4 !== 0 && !explicitData) continue;
      if (encoded.length > Math.ceil(maxDecodedBytes / 3) * 4) throw new Error(`Encoded source data exceeds ${maxDecodedBytes} bytes: ${entry.path}`);
      const bytes = Buffer.from(encoded, "base64");
      if (bytes.length > maxDecodedBytes) throw new Error(`Encoded source data exceeds ${maxDecodedBytes} bytes: ${entry.path}`);
      if (!validBase64(encoded, bytes, explicitData)) continue;
      findings.push({ path: entry.path, kind: "embedded-data", detail: `Base64 block ${index}: ${bytes.length} decoded bytes require provenance review`, line: (line ??= lineLookup(text))(match.index) });
      const kind = explicitMap || looksLikeSourceMap(bytes) ? "source-map" : "encoded-content";
      addVirtual({ path: `${entry.path}#base64-${index++}`, bytes, scope: entry.scope, sourceKind: kind }, depth + 1);
    }
    const maps = /\bsourceMappingURL\s*=\s*data:application\/json(?:;charset=[^;,\s]+)?;base64,([^\s"'`)]*)/gi;
    while ((match = maps.exec(text))) {
      const encoded = match[1].replace(/\*\/$/, "");
      if (encoded.length > Math.ceil(maxDecodedBytes / 3) * 4) throw new Error(`Encoded source data exceeds ${maxDecodedBytes} bytes: ${entry.path}`);
      const bytes = Buffer.from(encoded, "base64");
      if (bytes.length > maxDecodedBytes) throw new Error(`Encoded source data exceeds ${maxDecodedBytes} bytes: ${entry.path}`);
      if (!validBase64(encoded, bytes, true)) {
        findings.push({ path: entry.path, kind: "invalid-source-map", detail: "Invalid base64 inline source map", line: (line ??= lineLookup(text))(match.index) });
      }
    }
  }

  function inspectInlineMap(entry: SourceEntry, text: string, depth: number): void {
    // A data URL may contain percent-encoded JSON instead of base64. Only
    // sourceMappingURL directives are decoded, never arbitrary data URLs.
    const expression = /\bsourceMappingURL\s*=\s*data:application\/json(?:;charset=[^;,\s]+)?,([^\s"'`]+)/gi;
    let match: RegExpExecArray | null;
    let index = 0;
    while ((match = expression.exec(text))) {
      const encoded = match[1].replace(/\*\/$/, "");
      if (encoded.length > maxDecodedBytes * 3) throw new Error(`Encoded source data exceeds ${maxDecodedBytes} bytes: ${entry.path}`);
      let decoded: string;
      try { decoded = decodeURIComponent(encoded); } catch {
        findings.push({ path: entry.path, kind: "invalid-source-map", detail: "Invalid percent-encoded inline source map", line: lineAt(text, match.index) });
        continue;
      }
      const bytes = Buffer.from(decoded);
      if (bytes.length > maxDecodedBytes) throw new Error(`Encoded source data exceeds ${maxDecodedBytes} bytes: ${entry.path}`);
      addVirtual({ path: `${entry.path}#inline-map-${index++}`, bytes, scope: entry.scope, sourceKind: "source-map" }, depth + 1);
    }
  }

  function addVirtual(entry: SourceEntry, depth: number): void {
    if (++virtualCount > maxEmbeddedEntries) throw new Error(`Source audit exceeds ${maxEmbeddedEntries} embedded entries`);
    inspect(entry, depth);
  }
}

function classify(path: string, text: string | undefined): SourceKind {
  if (text === undefined || /\.(?:wasm|bin|glb|ktx2?|dds|png|jpe?g|webp|gif|ico|exr|hdr|woff2?|ttf|otf|mp3|mp4|ogg|wav|zip|gz|tgz)$/i.test(path)) return "binary";
  if (/\.map$/i.test(path)) return "source-map";
  if (/(?:^|[/.\\_-])worker(?:[/.\\_-]|$)/i.test(path) || /Worker\.[cm]?[jt]sx?$/.test(path)) return "worker";
  if (/(?:^|[/.\\_-])generated(?:[/.\\_-]|$)/i.test(path) || /(?:lut|lookup|data)\.[cm]?[jt]sx?$/i.test(path) || /\b(?:auto[- ]generated|generated file|do not edit)\b/i.test(text.slice(0, 1024))) return "generated-data";
  return "source";
}

function decodeText(bytes: Buffer): string | undefined {
  if (bytes.includes(0)) return undefined;
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { return undefined; }
}

function validBase64(encoded: string, bytes: Buffer, allowUnpadded: boolean): boolean {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 === 1) return false;
  const canonical = bytes.toString("base64");
  return canonical === encoded || (allowUnpadded && !encoded.includes("=") && canonical.replace(/=+$/, "") === encoded);
}

function looksLikeSourceMap(bytes: Buffer): boolean {
  const text = decodeText(bytes);
  if (!text || !text.trimStart().startsWith("{") || !/"(?:sources|sections)"\s*:/.test(text)) return false;
  try {
    const parsed: unknown = JSON.parse(text);
    return !!parsed && typeof parsed === "object" && !Array.isArray(parsed) &&
      (Array.isArray((parsed as Record<string, unknown>).sources) || Array.isArray((parsed as Record<string, unknown>).sections));
  } catch { return false; }
}

/**
 * A vendored/module path is a lead even if it does not identify a prohibited
 * engine. These references do not establish whether the bytes were bundled,
 * copied, or licensed; the corresponding source and notices need review.
 */
function findBundledPath(path: string, reference: string, findings: SourceReviewCandidate[], line?: number): void {
  let decoded = reference;
  try { decoded = decodeURIComponent(reference); } catch { /* retain the original reference */ }
  if (!/(?:^|[/\\])(?:node_modules|bower_components|vendor|third[-_]party)(?:[/\\]|$)/i.test(decoded)) return;
  findings.push({ path, kind: "bundled-source", detail: redactUrls(reference).slice(0, 300), ...(line === undefined ? {} : { line }) });
}

function findExternalMapReference(path: string, reference: string, findings: SourceReviewCandidate[]): void {
  if (/^https?:\/\//i.test(reference)) {
    findings.push({ path, kind: "provenance-reference", detail: redactUrls(reference).slice(0, 300) });
  }
}

function redactUrls(value: string): string {
  return value.replace(/https?:\/\/[^\s"'<>]+/gi, (raw) => {
    try {
      const url = new URL(raw);
      url.username = "";
      url.password = "";
      url.search = "";
      url.hash = "";
      return url.toString();
    } catch { return "<invalid-url>"; }
  });
}

function findProvenanceCandidates(path: string, text: string, findings: SourceReviewCandidate[]): void {
  const noticeFile = /(?:^|[/\\])(?:licen[cs]e|copying|notice|third[-_ ]party[-_ ](?:licen[cs]es?|notices?))(?:\.[^/\\]+|[-_][^/\\]+)?$/i.test(path);
  if (noticeFile) findings.push({ path, kind: "license-notice", detail: "License or attribution file requires review" });
  let offset = 0;
  let lineNumber = 1;
  while (offset < text.length) {
    const next = text.indexOf("\n", offset);
    const end = next < 0 ? text.length : next;
    const raw = text.slice(offset, end);
    // Restrict in-source markers to comments so ordinary strings such as
    // "copyright law" do not become license or attribution findings.
    const comment = /^\s*(?:\/\/+|\/\*+!?|\*+|<!--|#)\s*(.*)$/.exec(raw)?.[1];
    const inlineBannerAt = comment === undefined ? raw.indexOf("/*!") : -1;
    const body = comment ?? (inlineBannerAt >= 0 ? raw.slice(inlineBannerAt + 3).trimStart() : noticeFile ? raw.trimStart() : undefined);
    if (body !== undefined) {
      const detail = redactUrls(body.replace(/\s*(?:\*\/|-->)\s*$/, "")).slice(0, 300);
      if (/^(?:SPDX-(?:License-Identifier|FileCopyrightText|FileContributor)\s*:|@license\b|copyright\s*(?:©|\(c\)|\d{4})|©\s*\d{4})/i.test(detail)) {
        findings.push({ path, kind: "license-notice", detail, line: lineNumber });
      }
      if (/\b(?:adapted|derived|ported|copied|borrowed|translated|modified|taken)\s+(?:in part\s+)?from\s+\S|\b(?:original|upstream)\s+(?:source|implementation)\s*:\s*\S/i.test(detail)) {
        findings.push({ path, kind: "provenance-reference", detail, line: lineNumber });
      }
      findBundledPath(path, detail, findings, lineNumber);
    }
    offset = end + 1;
    lineNumber++;
  }
}

function findStandardizedEquations(path: string, text: string, findings: SourceReviewCandidate[]): void {
  for (const equation of standardizedEquations) {
    const match = equation.pattern.exec(text);
    if (match) findings.push({ path, kind: "standardized-equation", detail: equation.id, line: lineAt(text, match.index) });
  }
}

function findReferences(path: string, text: string, prohibited: readonly string[], findings: SourceReviewCandidate[], kind: "text-reference" | "source-map-reference" = "text-reference"): void {
  const brands = [...prohibited];
  if (prohibited.includes("three")) brands.push("three.js", "threejs");
  if (prohibited.includes("babylonjs")) brands.push("babylon.js");
  const packagePattern = brands.map(escapeRegex).sort((a, b) => b.length - a.length).join("|");
  if (!packagePattern) return;
  const mentions = new RegExp(`(^|[^a-z0-9_-])(${packagePattern})(?=$|[^a-z0-9_-])`, "gi");
  let lookup: ((offset: number) => number) | undefined;
  const line = (offset: number) => (lookup ??= lineLookup(text))(offset);
  let match: RegExpExecArray | null;
  while ((match = mentions.exec(text))) {
    findings.push({ path, kind, detail: match[2], line: line(match.index + match[1].length) });
  }
  // Deliberately conservative lexical matching; results always remain candidates.
  const imports = /(?:\b(?:import|export)\s+(?:[^;\n]*?\s+from\s+)?|\b(?:import|require)\s*\(\s*)["']([^"']+)["']/g;
  while ((match = imports.exec(text))) {
    const specifier = match[1];
    if (prohibited.some((name) => specifier === name || specifier.startsWith(`${name}/`))) {
      findings.push({ path, kind: "package-import", detail: specifier, line: line(match.index) });
    }
  }
}

function validateReviewedUnresolved(value: unknown): ReviewedUnresolvedDependency[] {
  if (!Array.isArray(value)) throw new Error("Reviewed unresolved dependencies must be an array");
  const seen = new Set<string>();
  return value.map((item: ReviewedUnresolvedDependency) => {
    if (!item || typeof item !== "object" || typeof item.name !== "string" || !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(item.name) ||
        typeof item.reviewer !== "string" || !item.reviewer.trim() || typeof item.note !== "string" || !item.note.trim() || seen.has(item.name)) {
      throw new Error("Invalid reviewed unresolved dependency");
    }
    seen.add(item.name);
    return item;
  });
}

/** Does a class review cover this finding? Path scope applies to the file part of the path (before `#`), payload entries by in-archive path. */
export function classReviewMatches(review: SourceCandidateClassReview, finding: { path: string; kind: SourceReviewCandidate["kind"]; detail: string }): boolean {
  if (review.kind !== finding.kind) return false;
  if (review.detail !== undefined && review.detail !== finding.detail) return false;
  if (review.detailPattern !== undefined && !new RegExp(`^(?:${review.detailPattern})$`).test(finding.detail)) return false;
  if (!review.paths) return true;
  const file = finding.path.split("#", 1)[0]!;
  const bang = file.indexOf("!/");
  const path = bang >= 0 ? file.slice(bang + 2) : file;
  return review.paths.some((scope) => scope.endsWith("/") ? path.startsWith(scope) : path === scope);
}

function validateClassReviews(value: unknown): SourceCandidateClassReview[] {
  if (!Array.isArray(value)) throw new Error("Candidate class reviews must be an array");
  const seen = new Set<string>();
  return value.map((review: SourceCandidateClassReview) => {
    const global = review && (review.kind === "standardized-equation" || review.kind === "fingerprint");
    if (!review || typeof review !== "object" || !candidateKinds.includes(review.kind) ||
        (review.detail !== undefined && (typeof review.detail !== "string" || !review.detail)) ||
        (global && !review.detail) || !dispositions.includes(review.disposition) ||
        typeof review.reviewer !== "string" || !review.reviewer.trim() || typeof review.note !== "string" || !review.note.trim()) {
      throw new Error("Invalid candidate class review");
    }
    if (review.detailPattern !== undefined) {
      let valid = typeof review.detailPattern === "string" && review.detailPattern.length > 0 && review.detailPattern.length <= 200 && review.detail === undefined;
      if (valid) { try { new RegExp(`^(?:${review.detailPattern})$`); } catch { valid = false; } }
      if (!valid) throw new Error("Invalid candidate class review detail pattern");
    }
    if (review.paths !== undefined && (!Array.isArray(review.paths) || !review.paths.length || review.paths.some((path) =>
        typeof path !== "string" || !path || path.startsWith("/") || path.includes("\\") || path.split("/").some((part) => part === ".." || part === ".")))) {
      throw new Error("Invalid candidate class review paths");
    }
    if (!global && !review.paths) throw new Error(`Candidate class review for ${review.kind} must be scoped to paths`);
    const key = `${review.kind}\0${review.detail ?? ""}\0${review.detailPattern ?? ""}\0${(review.paths ?? []).join("\0")}`;
    if (seen.has(key)) throw new Error(`Duplicate candidate class review: ${review.detail ?? review.kind}`);
    seen.add(key);
    return review;
  });
}

function validateFingerprints(fingerprints: readonly SourceFingerprint[]): { id: string; sha256?: string; text?: string; bytes?: Buffer }[] {
  if (!Array.isArray(fingerprints)) throw new Error("Fingerprints must be an array");
  const ids = new Set<string>();
  return fingerprints.map((item) => {
    if (!item || typeof item !== "object" || typeof item.id !== "string" || !item.id.trim() || ids.has(item.id) ||
        (item.sha256 !== undefined && typeof item.sha256 !== "string") || (item.text !== undefined && typeof item.text !== "string") ||
        (item.bytesHex !== undefined && typeof item.bytesHex !== "string") || (!item.sha256 && !item.text && !item.bytesHex)) {
      throw new Error("Fingerprint needs a unique ID and nonempty signature");
    }
    if (item.sha256 && !/^[a-f0-9]{64}$/.test(item.sha256)) throw new Error(`Invalid fingerprint digest: ${item.id}`);
    if (item.bytesHex && (!/^(?:[a-fA-F0-9]{2})+$/.test(item.bytesHex))) throw new Error(`Invalid fingerprint bytes: ${item.id}`);
    ids.add(item.id);
    return { id: item.id, sha256: item.sha256, text: item.text, bytes: item.bytesHex ? Buffer.from(item.bytesHex, "hex") : undefined };
  });
}

function digest(bytes: Uint8Array): string { return createHash("sha256").update(bytes).digest("hex"); }
function lineAt(text: string, offset: number): number { return lineLookup(text)(offset); }
function lineLookup(text: string): (offset: number) => number {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) starts.push(i + 1);
  return (offset) => {
    let low = 0, high = starts.length;
    while (low < high) { const mid = (low + high) >>> 1; if (starts[mid] <= offset) low = mid + 1; else high = mid; }
    return low;
  };
}
function escapeRegex(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function isStaticInputTree(path: string): boolean {
  return /(?:^|\/)public(?:\/|$)/.test(path) || /^(?:fixtures|assets\/packs)(?:\/|$)/.test(path);
}
function inside(base: string, path: string): boolean { const rel = relative(base, path); return !isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`); }
function display(base: string, path: string): string { return relative(base, path).split(sep).join("/") || "."; }
