#!/usr/bin/env node
// Receipt gate. Every capability labelled `shipped` in docs/comparisons/aura3d-capability-audit.md names its proof
// in the row's last column ("Proof"):
//   pixel: <receipt-dir>[, <receipt-dir>]   needs a valid receipt for the current minor at
//                                            evidence/receipts/<receipt-dir>/<version>.json
//   api|cli|docs: <path>[, <path>]          needs every named test, gate or doc path to exist
// A `shipped` row with no Proof, or whose proof is missing, fails the gate. Rows with any other label are not checked.
//   node tools/receipts/check.mjs [--list] [--json] [--version X.Y.Z] [--audit PATH] [--receipts DIR]
// --list prints every shipped row with its proof; exit code is 1 when a required proof is missing or invalid.
// Receipts from an older minor are history: the gate lists them under "regenerate" so a release knows what to re-run.
//
// Receipt schema (PRD beat-three.js section 3.5):
//   { capability, version, gitSha, renderer: "swiftshader" | "<gpu string>", scene,
//     frames: [{ file, sha256, meanLuma, nonBlackRatio }], tests: [path], date, covers?: [slug] }
// `covers` lets one receipt stand for several audit rows that the same frames prove.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..", "..");
const DEFAULT_AUDIT = "docs/comparisons/aura3d-capability-audit.md";
const DEFAULT_RECEIPTS = "evidence/receipts";

/** Receipt directory name for a capability: backticks dropped, lower-case, runs of non-alphanumerics become one dash. */
export function capabilitySlug(capability) {
  return String(capability)
    .replace(/`/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
}

/** `4.5.0` -> `4.5`. Receipts are valid for every patch of the minor they were taken on. */
export function minorOf(version) {
  const match = /^(\d+)\.(\d+)\.\d+/.exec(String(version));
  if (!match) throw new Error(`not a semver version: ${version}`);
  return `${match[1]}.${match[2]}`;
}

/** Table rows of the audit with their label; header and separator rows are skipped. */
export function parseAuditRows(markdown) {
  const rows = [];
  let section = "";
  for (const line of String(markdown).split("\n")) {
    const heading = /^#{2,3}\s+(.*)$/.exec(line);
    if (heading) section = heading[1].trim();
    if (!line.trim().startsWith("|")) continue;
    const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
    if (cells.length < 3) continue;
    if (/^:?-{3,}:?$/.test(cells[0]) || /^capability$/i.test(cells[0])) continue;
    const label = cells[1].toLowerCase();
    rows.push({
      section,
      capability: cells[0].replace(/`/g, ""),
      label,
      shipped: label.startsWith("shipped"),
      slug: capabilitySlug(cells[0]),
      ...parseProof(cells[4])
    });
  }
  return rows;
}

const PROOF_KINDS = new Set(["pixel", "api", "cli", "docs"]);

/** `pixel: a, b` -> `{ proofKind: "pixel", proofTargets: ["a", "b"] }`; anything else -> no proof. */
export function parseProof(cell) {
  const match = /^(pixel|api|cli|docs)\s*:\s*(.+)$/i.exec(String(cell ?? "").replace(/`/g, "").trim());
  if (!match) return { proofKind: null, proofTargets: [] };
  const kind = match[1].toLowerCase();
  const targets = match[2].split(",").map((entry) => entry.trim()).filter(Boolean);
  return { proofKind: PROOF_KINDS.has(kind) ? kind : null, proofTargets: targets };
}

const SHA256 = /^[0-9a-f]{64}$/;
const GIT_SHA = /^[0-9a-f]{7,40}$/;

/** Returns a list of problems; empty means the receipt is well-formed and its frames still match the files on disk. */
export function validateReceipt(receipt, { repoRoot = REPO_ROOT, minor, slug } = {}) {
  const problems = [];
  if (receipt === null || typeof receipt !== "object") return ["receipt is not a JSON object"];
  for (const key of ["capability", "version", "gitSha", "renderer", "scene", "date"]) {
    if (typeof receipt[key] !== "string" || receipt[key].length === 0) problems.push(`missing string field "${key}"`);
  }
  if (typeof receipt.version === "string") {
    try {
      if (minor && minorOf(receipt.version) !== minor) problems.push(`version ${receipt.version} is not in minor ${minor}`);
    } catch {
      problems.push(`version "${receipt.version}" is not semver`);
    }
  }
  if (typeof receipt.gitSha === "string" && !GIT_SHA.test(receipt.gitSha)) problems.push("gitSha is not a 7 to 40 character hex string");
  if (typeof receipt.date === "string" && Number.isNaN(Date.parse(receipt.date))) problems.push("date is not parseable");
  if (typeof receipt.capability === "string" && slug && capabilitySlug(receipt.capability) !== capabilitySlug(slug)) {
    problems.push(`capability "${receipt.capability}" does not match its directory "${slug}"`);
  }
  if (!Array.isArray(receipt.frames) || receipt.frames.length === 0) {
    problems.push("frames must be a non-empty array");
  } else {
    receipt.frames.forEach((frame, index) => {
      const where = `frames[${index}]`;
      if (typeof frame?.file !== "string" || frame.file.length === 0) return void problems.push(`${where}.file missing`);
      if (typeof frame.sha256 !== "string" || !SHA256.test(frame.sha256)) problems.push(`${where}.sha256 is not 64 hex characters`);
      if (typeof frame.meanLuma !== "number" || !(frame.meanLuma >= 0 && frame.meanLuma <= 255)) problems.push(`${where}.meanLuma must be a number in 0..255`);
      if (typeof frame.nonBlackRatio !== "number" || !(frame.nonBlackRatio >= 0 && frame.nonBlackRatio <= 1)) problems.push(`${where}.nonBlackRatio must be a number in 0..1`);
      const path = join(repoRoot, frame.file);
      if (!existsSync(path)) return void problems.push(`${where}.file ${frame.file} does not exist`);
      const actual = createHash("sha256").update(readFileSync(path)).digest("hex");
      if (SHA256.test(frame.sha256 ?? "") && actual !== frame.sha256) problems.push(`${where}.sha256 does not match ${frame.file}`);
    });
  }
  if (!Array.isArray(receipt.tests) || receipt.tests.length === 0) {
    problems.push("tests must name at least one test file");
  } else {
    for (const test of receipt.tests) {
      if (typeof test !== "string" || !existsSync(join(repoRoot, test))) problems.push(`test ${String(test)} does not exist`);
    }
  }
  if (receipt.covers !== undefined && (!Array.isArray(receipt.covers) || receipt.covers.some((entry) => typeof entry !== "string"))) {
    problems.push("covers must be an array of capability slugs");
  }
  return problems;
}

/** Every `<receipts>/<slug>/<version>.json` as `{ slug, file, receipt | parseError }`. */
export function loadReceipts(receiptsDir) {
  const found = [];
  if (!existsSync(receiptsDir)) return found;
  for (const slug of readdirSync(receiptsDir).sort()) {
    const dir = join(receiptsDir, slug);
    if (!statSync(dir).isDirectory()) continue;
    for (const name of readdirSync(dir).sort()) {
      if (!name.endsWith(".json")) continue;
      const file = join(dir, name);
      try {
        found.push({ slug, file, version: name.replace(/\.json$/, ""), receipt: JSON.parse(readFileSync(file, "utf8")) });
      } catch (error) {
        found.push({ slug, file, version: name.replace(/\.json$/, ""), parseError: String(error.message ?? error) });
      }
    }
  }
  return found;
}

export function checkReceipts({ repoRoot = REPO_ROOT, audit = DEFAULT_AUDIT, receipts = DEFAULT_RECEIPTS, version } = {}) {
  const resolvedVersion = version ?? JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")).version;
  const minor = minorOf(resolvedVersion);
  const rows = parseAuditRows(readFileSync(join(repoRoot, audit), "utf8"));
  const shipped = rows.filter((row) => row.shipped);
  const loaded = loadReceipts(join(repoRoot, receipts));

  const covered = new Map(); // receipt directory slug -> current-minor receipt file
  const newest = new Map(); // receipt directory slug -> highest version found, for the regenerate list
  const invalid = [];
  for (const entry of loaded) {
    const rel = entry.file.slice(repoRoot.length + 1);
    if (entry.parseError) {
      invalid.push({ file: rel, problems: [`invalid JSON: ${entry.parseError}`] });
      continue;
    }
    let inMinor = false;
    try {
      inMinor = minorOf(entry.version) === minor;
    } catch {
      invalid.push({ file: rel, problems: [`file name ${entry.version}.json is not a semver version`] });
      continue;
    }
    const key = capabilitySlug(entry.slug);
    if (!newest.has(key) || compareVersions(entry.version, newest.get(key)) > 0) newest.set(key, entry.version);
    if (!inMinor) continue; // an older minor's receipt is history, not a failure
    const problems = validateReceipt(entry.receipt, { repoRoot, minor, slug: entry.slug });
    if (problems.length > 0) {
      invalid.push({ file: rel, problems });
      continue;
    }
    for (const slug of [entry.slug, ...(entry.receipt.covers ?? [])]) covered.set(capabilitySlug(slug), rel);
  }

  const missing = [];
  const coveredRows = [];
  const regenerate = new Map();
  for (const row of shipped) {
    const base = { capability: row.capability, slug: row.slug, section: row.section, kind: row.proofKind };
    if (row.proofKind === null) {
      missing.push({ ...base, reason: "no Proof cell (expected `pixel: <receipt-dir>` or `api|cli|docs: <path>`)" });
      continue;
    }
    if (row.proofKind === "pixel") {
      const dirs = row.proofTargets.length > 0 ? row.proofTargets : [row.slug];
      const lacking = dirs.filter((dir) => !covered.has(capabilitySlug(dir)));
      for (const dir of lacking) {
        const latest = newest.get(capabilitySlug(dir));
        if (latest) regenerate.set(dir, latest);
      }
      if (lacking.length > 0) missing.push({ ...base, reason: `no ${minor}.x receipt for ${lacking.join(", ")}` });
      else coveredRows.push({ ...base, proof: dirs.map((dir) => covered.get(capabilitySlug(dir))) });
      continue;
    }
    const absent = row.proofTargets.filter((target) => !existsSync(join(repoRoot, target)));
    if (row.proofTargets.length === 0) missing.push({ ...base, reason: `${row.proofKind} proof names no path` });
    else if (absent.length > 0) missing.push({ ...base, reason: `${row.proofKind} proof path does not exist: ${absent.join(", ")}` });
    else coveredRows.push({ ...base, proof: row.proofTargets });
  }
  return {
    version: resolvedVersion,
    minor,
    shippedRows: shipped.length,
    covered: coveredRows,
    missing,
    regenerate: [...regenerate].map(([slug, latest]) => ({ slug, latest, need: `${minor}.x` })),
    invalid,
    pass: missing.length === 0 && invalid.length === 0
  };
}

/** Numeric semver comparison; unparseable versions sort lowest. */
function compareVersions(a, b) {
  const parse = (value) => (/^(\d+)\.(\d+)\.(\d+)/.exec(String(value)) ?? [0, 0, 0, 0]).slice(1).map(Number);
  const [x, y] = [parse(a), parse(b)];
  for (let i = 0; i < 3; i += 1) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

function main(argv) {
  const options = { list: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--list") options.list = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--version") options.version = argv[(i += 1)];
    else if (arg === "--audit") options.audit = argv[(i += 1)];
    else if (arg === "--receipts") options.receipts = argv[(i += 1)];
    else throw new Error(`unknown argument ${arg}`);
  }
  const result = checkReceipts(options);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const pixel = result.covered.filter((row) => row.kind === "pixel").length;
    console.log(`receipts: ${result.covered.length}/${result.shippedRows} shipped rows have their proof (${pixel} pixel rows backed by ${result.minor}.x receipts)`);
    if (options.list) {
      for (const row of result.covered) console.log(`  ok       ${row.kind}  ${row.capability}`);
    }
    for (const row of result.missing) console.log(`  missing  ${row.slug}  (${row.capability}): ${row.reason}`);
    for (const row of result.regenerate) console.log(`  regenerate  ${row.slug}: latest receipt is ${row.latest}, need ${row.need}`);
    for (const entry of result.invalid) console.log(`  invalid  ${entry.file}: ${entry.problems.join("; ")}`);
    console.log(result.pass ? "PASS" : "FAIL");
  }
  process.exitCode = result.pass ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) main(process.argv.slice(2));
