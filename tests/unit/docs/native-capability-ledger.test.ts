import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const roadmapPath = "docs/prds/aura3d-native-capability-roadmap.md";
const ledgerPath = "docs/prds/aura3d-native-capability-ledger.json";
const digestPattern = /^sha256:[a-f0-9]{64}$/;
const uriPattern = /^[a-z][a-z0-9+.-]*:\/\/[^\s]+$/i;

type ObjectValue = Record<string, unknown>;
type FileLookup = (path: string) => { exists: boolean; sha256?: string };
type Context = { owners: Set<string>; file: FileLookup };

function object(value: unknown): value is ObjectValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(nonempty);
}

function repoPath(path: unknown): path is string {
  return nonempty(path) && !isAbsolute(path) && !path.includes("\\") &&
    !path.includes("\0") && path.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

function sha256(bytes: string | Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function workspaceFile(path: string): { exists: boolean; sha256?: string } {
  if (!repoPath(path)) return { exists: false };
  const full = resolve(root, path);
  if (!existsSync(full)) return { exists: false };
  const real = realpathSync(full);
  const fromRoot = relative(realpathSync(root), real);
  if (fromRoot === ".." || fromRoot.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
      isAbsolute(fromRoot) || !statSync(real).isFile()) return { exists: false };
  return { exists: true, sha256: sha256(readFileSync(real)) };
}

/**
 * Source completion and acceptance are separate claims. This is a structural
 * ledger check, not the CODE_COMPLETE_GO gate: it cannot dereference remote
 * artifacts or prove that a passing command tested the required behavior.
 */
function validateLedger(value: unknown, context: Context): string[] {
  const errors: string[] = [];
  const error = (where: string, message: string): void => { errors.push(`${where}: ${message}`); };
  if (!object(value)) return ["ledger: expected an object"];
  if (value.schema !== "aura3d.native-capability-ledger/1") error("ledger", "unexpected schema");

  if (!object(value.roadmap) || value.roadmap.path !== roadmapPath || !nonempty(value.roadmap.sha256)) {
    error("roadmap", "expected the roadmap path and digest");
  } else {
    const actual = context.file(roadmapPath);
    if (!actual.exists || value.roadmap.sha256 !== actual.sha256) error("roadmap", "digest does not match the current roadmap");
  }

  const required = Array.isArray(value.requiredSourceOutcomeIds) ? value.requiredSourceOutcomeIds : [];
  if (!stringArray(value.requiredSourceOutcomeIds) || required.length === 0) error("ledger", "required source outcome IDs must be a nonempty string array");
  const requiredIds = required.filter(nonempty);
  if (new Set(requiredIds).size !== requiredIds.length) error("ledger", "duplicate required source outcome ID");
  if (requiredIds.join("\n") !== [...requiredIds].sort().join("\n")) error("ledger", "required source outcome IDs must be sorted");

  if (!Array.isArray(value.outcomes) || value.outcomes.length === 0) {
    error("ledger", "outcomes must be a nonempty array");
    return errors;
  }
  const seen = new Set<string>();

  function evidence(value: unknown, where: string): ObjectValue[] {
    if (!Array.isArray(value)) {
      error(where, "expected an evidence array");
      return [];
    }
    const rows: ObjectValue[] = [];
    const ids = new Set<string>();
    for (const [index, entry] of value.entries()) {
      const label = `${where}[${index}]`;
      if (!object(entry)) { error(label, "expected an object"); continue; }
      rows.push(entry);
      for (const key of ["id", "kind", "source"] as const) {
        if (!nonempty(entry[key])) error(label, `${key} must be nonempty`);
      }
      if (nonempty(entry.id)) {
        if (ids.has(entry.id)) error(label, "duplicate evidence ID");
        ids.add(entry.id);
      }
      if (entry.runId !== null && !nonempty(entry.runId)) error(label, "runId must be null or nonempty");
      if (!stringArray(entry.artifactHashes) || !entry.artifactHashes.every((hash) => digestPattern.test(hash))) {
        error(label, "artifactHashes must contain sha256:<64 lowercase hex> digests");
      }
      if (entry.measuredResults !== null && !nonempty(entry.measuredResults)) error(label, "measuredResults must be null or nonempty");
      if (nonempty(entry.source) && !repoPath(entry.source) && !uriPattern.test(entry.source)) {
        error(label, "source must be a repository-relative artifact path or a URI");
      }
    }
    return rows;
  }

  function evidenceSupports(entry: ObjectValue, where: string): boolean {
    const hashes = Array.isArray(entry.artifactHashes) ? entry.artifactHashes.filter((hash): hash is string => typeof hash === "string" && digestPattern.test(hash)) : [];
    if (!nonempty(entry.id) || !nonempty(entry.kind) || !nonempty(entry.source) || !nonempty(entry.runId) ||
        !nonempty(entry.measuredResults) || hashes.length === 0) return false;
    if (uriPattern.test(entry.source)) return true; // Retention and content are verified by the source/acceptance gate.
    if (!repoPath(entry.source)) return false;
    const artifact = context.file(entry.source);
    if (!artifact.exists || !artifact.sha256 || !hashes.includes(artifact.sha256)) {
      error(where, "retained artifact is missing or does not match a recorded digest");
      return false;
    }
    return true;
  }

  for (const [index, row] of value.outcomes.entries()) {
    if (!object(row)) { error(`outcomes[${index}]`, "expected an object"); continue; }
    const id = nonempty(row.id) ? row.id : `outcomes[${index}]`;
    if (!nonempty(row.id) || !/^WP-\d{2}-R[a-f0-9]{12}$/.test(row.id)) error(id, "invalid stable outcome ID");
    else {
      if (seen.has(row.id)) error(id, "duplicate outcome ID");
      seen.add(row.id);
    }
    if (!nonempty(row.owner) || !context.owners.has(row.owner)) error(id, "unknown owner");
    else if (nonempty(row.id) && !row.id.startsWith(`${row.owner}-`)) error(id, "outcome ID does not match owner");
    if (!["P0", "P1", "P2", "P3"].includes(String(row.priority))) error(id, "invalid priority");
    if (row.required !== true) error(id, "required must be true");
    if (!nonempty(row.description)) error(id, "description must be nonempty");

    if (!Array.isArray(row.references) || row.references.length === 0) error(id, "references must be nonempty");
    else for (const reference of row.references) {
      if (!object(reference) || !["gap", "file", "task", "checklist", "contract", "phase"].includes(String(reference.kind)) ||
          !nonempty(reference.locator) || !nonempty(reference.text)) error(id, "invalid reference");
    }

    const implementation = object(row.implementation) ? row.implementation : {};
    const files = Array.isArray(implementation.files) ? implementation.files : [];
    if (!Array.isArray(implementation.files)) error(id, "implementation files must be an array");
    for (const entry of files) {
      if (!object(entry) || !repoPath(entry.path) || !["CREATE", "MODIFY", "DELETE"].includes(String(entry.action))) {
        error(id, "invalid implementation file path or action");
      }
    }
    for (const key of ["symbols", "publicEntrypoints", "integrationDependencies"] as const) {
      if (!stringArray(implementation[key])) error(id, `${key} must be a string array`);
    }
    const contract = object(row.contract) ? row.contract : {};
    for (const key of ["inputs", "options", "backends", "lifecycle", "limitations"] as const) {
      if (!stringArray(contract[key])) error(id, `contract.${key} must be a string array`);
    }

    const source = object(row.source) ? row.source : {};
    if (!["confirmed-defect", "partial", "not-found", "unverified", "implemented"].includes(String(source.status))) error(id, "invalid source status");
    if (!["incomplete", "complete"].includes(String(source.completion))) error(id, "invalid source completion");
    if (!Array.isArray(source.provenance)) error(id, "source.provenance must be an array");
    else for (const provenance of source.provenance) {
      if (!object(provenance) || !nonempty(provenance.source) ||
          (provenance.license !== null && !nonempty(provenance.license)) ||
          (provenance.digest !== null && !nonempty(provenance.digest))) {
        error(id, "invalid source provenance");
      }
    }
    const sourceEvidence = evidence(source.evidence, `${id}.source.evidence`);
    const checks = Array.isArray(source.checks) ? source.checks : [];
    if (!Array.isArray(source.checks)) error(id, "source.checks must be an array");
    const checkIds = new Set<string>();
    for (const check of checks) {
      if (!object(check)) { error(id, "source check must be an object"); continue; }
      if (!nonempty(check.id) || checkIds.has(check.id)) error(id, "source check ID missing or duplicated");
      else checkIds.add(check.id);
      if (!nonempty(check.command) || typeof check.required !== "boolean" ||
          !["not-run", "passed", "failed", "unavailable"].includes(String(check.status))) error(id, "invalid source check");
      if (check.runId !== null && !nonempty(check.runId)) error(id, "check runId must be null or nonempty");
      if (!stringArray(check.artifactHashes) || !check.artifactHashes.every((hash) => digestPattern.test(hash))) error(id, "invalid check artifactHashes");
      if (check.measuredResults !== null && !nonempty(check.measuredResults)) error(id, "check measuredResults must be null or nonempty");
      if (nonempty(check.command)) {
        const testPaths = [...check.command.matchAll(/(?:^|[\s'"=])(tests\/[\w./-]+\.(?:test|spec)\.[cm]?[jt]sx?)(?=$|[\s'":,;])/g)];
        for (const match of testPaths) {
          if (!repoPath(match[1])) error(id, `source check names an unsafe test path: ${match[1]}`);
          else if (check.status === "passed" && !context.file(match[1]).exists) error(id, `source check names a missing test: ${match[1]}`);
        }
      }
      if (check.status === "passed") {
        if (!nonempty(check.runId) || !Array.isArray(check.artifactHashes) || check.artifactHashes.length === 0 || !nonempty(check.measuredResults)) {
          error(id, "passing source check lacks run identity, digest or result");
        }
      }
    }

    if (source.completion === "complete") {
      if (source.status !== "implemented") error(id, "source completion requires implemented status");
      if (files.length === 0) error(id, "source completion requires implementation files");
      for (const entry of files) if (object(entry) && repoPath(entry.path)) {
        const exists = context.file(entry.path).exists;
        if (entry.action === "DELETE" ? exists : !exists) error(id, `completed implementation path has unexpected state: ${entry.path}`);
      }
      const requiredChecks = checks.filter((check): check is ObjectValue => object(check) && check.required === true);
      if (requiredChecks.length === 0 || requiredChecks.some((check) => check.status !== "passed")) error(id, "source completion requires all required checks to pass");
      const supported = sourceEvidence.filter((entry, i) => evidenceSupports(entry, `${id}.source.evidence[${i}]`));
      for (const check of requiredChecks) {
        const hashes = Array.isArray(check.artifactHashes) ? check.artifactHashes : [];
        if (!supported.some((entry) => entry.runId === check.runId && Array.isArray(entry.artifactHashes) && entry.artifactHashes.some((hash) => hashes.includes(hash)))) {
          error(id, `required check ${String(check.id)} lacks matching retained source evidence`);
        }
      }
    }

    const acceptance = object(row.acceptance) ? row.acceptance : {};
    if (!["not-run", "passed", "failed", "unavailable", "unsupported"].includes(String(acceptance.status))) error(id, "invalid acceptance status");
    if (acceptance.reason !== null && !nonempty(acceptance.reason)) error(id, "acceptance reason must be null or nonempty");
    if (["unavailable", "unsupported"].includes(String(acceptance.status)) && !nonempty(acceptance.reason)) error(id, "unavailable or unsupported acceptance needs a reason");
    const acceptanceEvidence = evidence(acceptance.evidence, `${id}.acceptance.evidence`);
    if (acceptance.status === "passed") {
      if (source.completion !== "complete") error(id, "current-candidate acceptance cannot pass while source is incomplete");
      if (!acceptanceEvidence.some((entry, i) => evidenceSupports(entry, `${id}.acceptance.evidence[${i}]`))) {
        error(id, "acceptance pass lacks retained run evidence");
      }
    }
  }

  const outcomes = [...seen].sort();
  if (outcomes.join("\n") !== [...requiredIds].sort().join("\n")) error("ledger", "required IDs and outcome IDs must be exactly equal");
  return errors;
}

function roadmapCoverage(roadmap: string, ledger: unknown): string[] {
  const section = (start: number, end: number): string => {
    const from = roadmap.search(new RegExp(`^## ${start}\\.`, "m"));
    const to = roadmap.search(new RegExp(`^## ${end}\\.`, "m"));
    return from < 0 || to <= from ? "" : roadmap.slice(from, to);
  };
  const expectations = [
    { kind: "gap", locators: [...section(2, 3).matchAll(/^\|\s*(G\d+)\s*\|/gm)].map((match) => match[1]!) },
    { kind: "file", locators: [...section(4, 5).matchAll(/^\|\s*(?:CREATE|MODIFY|DELETE)\s*\|\s*([^|]+?)\s*\|/gm)].map((match) => match[1]!.trim()) },
    ...([5, 6] as const).map((number) => ({
      kind: number === 5 ? "task" : "checklist",
      locators: [...section(number, number + 1).matchAll(/^\s*- \[[ xX]\] (.+)$/gm)].map((match) => sha256(match[1]!.trim()))
    }))
  ];
  const outcomes = object(ledger) && Array.isArray(ledger.outcomes) ? ledger.outcomes : [];
  const references = outcomes.flatMap((row: unknown) => object(row) && Array.isArray(row.references) ? row.references : []);
  const missing = expectations.flatMap(({ kind, locators }) => {
    if (locators.length === 0) return [`roadmap ${kind} inventory is empty or its section is missing`];
    const found = new Set(references.flatMap((ref: unknown) => object(ref) && ref.kind === kind && nonempty(ref.locator) ? [ref.locator] : []));
    return [...new Set(locators)].filter((locator) => !found.has(locator)).map((locator) => `roadmap ${kind} missing from ledger: ${locator}`);
  });

  let owner = "";
  for (const line of section(4, 5).split("\n")) {
    const heading = line.match(/^### (WP-\d{2})\b/);
    if (heading) owner = heading[1]!;
    const file = line.match(/^\|\s*(CREATE|MODIFY|DELETE)\s*\|\s*([^|]+?)\s*\|/);
    if (!file) continue;
    const [, action, path] = file;
    const matchingOutcome = outcomes.some((row: unknown) => {
      if (!object(row) || row.owner !== owner || !Array.isArray(row.references) || !object(row.implementation) || !Array.isArray(row.implementation.files)) return false;
      return row.references.some((ref: unknown) => object(ref) && ref.kind === "file" && ref.locator === path) &&
        row.implementation.files.some((entry: unknown) => object(entry) && entry.path === path && entry.action === action);
    });
    if (!matchingOutcome) missing.push(`roadmap file lacks the owning ${owner} action: ${path}`);
  }
  return missing;
}

function fixture(): { ledger: ObjectValue; context: Context } {
  const reportHash = sha256("passing source report");
  const roadmapHash = sha256("roadmap");
  const file: FileLookup = (path) => {
    if (path === roadmapPath) return { exists: true, sha256: roadmapHash };
    if (path === "tests/reports/source.json") return { exists: true, sha256: reportHash };
    if (path === "tests/reports/browser.json") return { exists: true, sha256: sha256("browser report") };
    return { exists: path === "packages/example.ts" || path === "tests/unit/example.test.ts" };
  };
  return {
    context: { owners: new Set(["WP-01"]), file },
    ledger: {
      schema: "aura3d.native-capability-ledger/1", roadmap: { path: roadmapPath, sha256: roadmapHash },
      requiredSourceOutcomeIds: ["WP-01-R000000000001"],
      outcomes: [{
        id: "WP-01-R000000000001", description: "A source outcome", priority: "P1", owner: "WP-01", required: true,
        references: [{ kind: "task", locator: "WP-01", text: "A source outcome" }],
        implementation: { files: [{ path: "packages/example.ts", action: "CREATE" }], symbols: [], publicEntrypoints: [], integrationDependencies: [] },
        contract: { inputs: [], options: [], backends: [], lifecycle: [], limitations: [] },
        source: { status: "unverified", completion: "incomplete", checks: [], evidence: [], provenance: [] },
        acceptance: { status: "not-run", reason: null, evidence: [] }
      }]
    }
  };
}

describe("native capability ledger contract", () => {
  function liveLedger(): unknown {
    expect(existsSync(resolve(root, ledgerPath)), "WP-00 ledger must be present").toBe(true);
    return JSON.parse(readFileSync(resolve(root, ledgerPath), "utf8")) as unknown;
  }

  it("validates the live ledger schema, paths and claims", () => {
    const roadmap = readFileSync(resolve(root, roadmapPath), "utf8");
    const owners = new Set([...roadmap.matchAll(/^### (WP-\d{2})\b/gm)].map((match) => match[1]!));
    expect(owners.size).toBeGreaterThan(0);
    const ledger = liveLedger();
    expect(validateLedger(ledger, { owners, file: workspaceFile })).toEqual([]);
  });

  it("covers the independent roadmap inventory and file ownership", () => {
    const roadmap = readFileSync(resolve(root, roadmapPath), "utf8");
    const ledger = liveLedger();
    // The required-ID list is mutable: cross-check it against the independent
    // roadmap gap, file, task and capability-checklist inventories.
    expect(roadmapCoverage(roadmap, ledger)).toEqual([]);
  });

  it("permits planned files and acceptance pending on incomplete work", () => {
    const { ledger, context } = fixture();
    const row = (ledger.outcomes as ObjectValue[])[0]!;
    (row.implementation as ObjectValue).files = [{ path: "packages/not-created-yet.ts", action: "CREATE" }];
    expect(validateLedger(ledger, context)).toEqual([]);
    (row.implementation as ObjectValue).files = [];
    expect(validateLedger(ledger, context)).toEqual([]);
  });

  it("detects missing roadmap content independently of the required-ID list", () => {
    const roadmap = [
      "## 2. Gaps", "| G01 | P0 |", "## 3. Contracts", "## 4. Files", "### WP-01 — Example",
      "| CREATE | packages/example.ts | Create a path |", "## 5. Tasks", "- [ ] Make the feature work.",
      "## 6. Coverage", "- [ ] Cover the public behavior.", "## 7. Verification"
    ].join("\n");
    const { ledger } = fixture();
    const row = (ledger.outcomes as ObjectValue[])[0]!;
    row.references = [
      { kind: "gap", locator: "G01" }, { kind: "file", locator: "packages/example.ts" },
      { kind: "task", locator: sha256("Make the feature work.") },
      { kind: "checklist", locator: sha256("Cover the public behavior.") }
    ];
    expect(roadmapCoverage(roadmap, ledger)).toEqual([]);
    (row.implementation as ObjectValue).files = [{ path: "packages/example.ts", action: "MODIFY" }];
    expect(roadmapCoverage(roadmap, ledger)).toContain("roadmap file lacks the owning WP-01 action: packages/example.ts");
    (row.implementation as ObjectValue).files = [{ path: "packages/example.ts", action: "CREATE" }];
    (row.references as ObjectValue[]).splice(2, 1);
    expect(roadmapCoverage(roadmap, ledger)).toContain(`roadmap task missing from ledger: ${sha256("Make the feature work.")}`);
  });

  it("rejects invalid owners, duplicate or mismatched IDs and unsafe paths", () => {
    const { ledger, context } = fixture();
    const row = (ledger.outcomes as ObjectValue[])[0]!;
    row.owner = "WP-99";
    (row.implementation as ObjectValue).files = [{ path: "../outside.ts", action: "CREATE" }];
    ledger.requiredSourceOutcomeIds = ["WP-01-R000000000001", "WP-01-R000000000001"];
    const errors = validateLedger(ledger, context).join("\n");
    expect(errors).toContain("unknown owner");
    expect(errors).toContain("duplicate required source outcome ID");
    expect(errors).toContain("exactly equal");
    expect(errors).toContain("invalid implementation file path or action");
  });

  it("rejects stale roadmap identity and invalid source or acceptance states", () => {
    const { ledger, context } = fixture();
    const row = (ledger.outcomes as ObjectValue[])[0]!;
    (ledger.roadmap as ObjectValue).sha256 = sha256("different roadmap");
    (row.source as ObjectValue).status = "done";
    (row.acceptance as ObjectValue).status = "done";
    const errors = validateLedger(ledger, context).join("\n");
    expect(errors).toContain("digest does not match the current roadmap");
    expect(errors).toContain("invalid source status");
    expect(errors).toContain("invalid acceptance status");
  });

  it("rejects completion without matching passed checks and retained evidence", () => {
    const { ledger, context } = fixture();
    const row = (ledger.outcomes as ObjectValue[])[0]!;
    const source = row.source as ObjectValue;
    source.status = "implemented";
    source.completion = "complete";
    expect(validateLedger(ledger, context).join("\n")).toContain("source completion requires all required checks to pass");
    (row.implementation as ObjectValue).files = [];
    expect(validateLedger(ledger, context).join("\n")).toContain("source completion requires implementation files");
    (row.implementation as ObjectValue).files = [{ path: "packages/example.ts", action: "CREATE" }];
    source.checks = [{ id: "unit", command: "vitest run tests/unit/example.test.ts", required: true, status: "passed", runId: "run-1", artifactHashes: [sha256("passing source report")], measuredResults: "1 passed" }];
    expect(validateLedger(ledger, context).join("\n")).toContain("lacks matching retained source evidence");
    source.evidence = [{ id: "report", kind: "source-test", source: "tests/reports/source.json", runId: "run-1", artifactHashes: [sha256("passing source report")], measuredResults: "1 passed" }];
    expect(validateLedger(ledger, context)).toEqual([]);
    (source.checks as ObjectValue[]).push({ id: "optional", command: "optional check", required: false, status: "not-run", runId: null, artifactHashes: [], measuredResults: null });
    expect(validateLedger(ledger, context)).toEqual([]);
    (source.checks as ObjectValue[])[0]!.command = "vitest run tests/unit/missing.test.ts";
    expect(validateLedger(ledger, context).join("\n")).toContain("source check names a missing test");
    (source.checks as ObjectValue[])[0]!.command = "vitest run tests/unit/example.test.ts";
    (source.evidence as ObjectValue[])[0]!.artifactHashes = [sha256("different report")];
    expect(validateLedger(ledger, context).join("\n")).toContain("does not match a recorded digest");
  });

  it("keeps provisional historical observations separate from a candidate check", () => {
    const { ledger, context } = fixture();
    const row = (ledger.outcomes as ObjectValue[])[0]!;
    const source = row.source as ObjectValue;
    source.status = "implemented";
    source.completion = "incomplete";
    source.checks = [{
      id: "unit",
      command: "vitest run tests/unit/example.test.ts",
      required: true,
      status: "not-run",
      runId: null,
      artifactHashes: [],
      measuredResults: null,
      provisional: { status: "passed-provisional", runId: "old-run", measuredResults: { testsPassed: 1 } }
    }];
    expect(validateLedger(ledger, context)).toEqual([]);
    source.completion = "complete";
    expect(validateLedger(ledger, context).join("\n")).toContain("source completion requires all required checks to pass");
  });

  it("treats acceptance as a separate claim and requires its own evidence", () => {
    const { ledger, context } = fixture();
    const row = (ledger.outcomes as ObjectValue[])[0]!;
    const acceptance = row.acceptance as ObjectValue;
    acceptance.status = "passed";
    const errors = validateLedger(ledger, context).join("\n");
    expect(errors).toContain("acceptance pass lacks retained run evidence");
    expect(errors).toContain("acceptance cannot pass while source is incomplete");
    const source = row.source as ObjectValue;
    source.status = "implemented";
    source.completion = "complete";
    source.checks = [{ id: "unit", command: "vitest run tests/unit/example.test.ts", required: true, status: "passed", runId: "run-1", artifactHashes: [sha256("passing source report")], measuredResults: "1 passed" }];
    source.evidence = [{ id: "report", kind: "source-test", source: "tests/reports/source.json", runId: "run-1", artifactHashes: [sha256("passing source report")], measuredResults: "1 passed" }];
    acceptance.evidence = [{ id: "browser", kind: "browser", source: "tests/reports/browser.json", runId: "browser-1", artifactHashes: [sha256("browser report")], measuredResults: "1 passed" }];
    expect(validateLedger(ledger, context)).toEqual([]);
    acceptance.status = "unavailable";
    acceptance.reason = null;
    expect(validateLedger(ledger, context).join("\n")).toContain("needs a reason");
  });
});
