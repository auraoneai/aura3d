/**
 * WS-5.1 — classify every public route into a release tier.
 *
 * ## Why this is a tool and not a hand-written list
 *
 * There are 102 `apps/` + 37 `examples/` routes. A hand-authored inventory of 139 rows would be
 * stale within a week and, worse, unfalsifiable: nothing would detect a new route with no tier,
 * which is how the repository accumulated 139 routes with 11 gated ones in the first place.
 *
 * So the tier is **derived** from evidence already in the tree, and the tool exits non-zero when
 * a route cannot be classified. Adding a route therefore forces a tier decision.
 *
 * ## The tiers, and the signal each is derived from
 *
 * - **Tier 1 — public and marketed.** Listed in `tools/showcase-library/route-gates.json` with a
 *   `releaseClass` that is neither `internal-diagnostic` nor `removed-from-public-showcase`.
 *   That file is the existing release gate, so it defines "marketed" rather than adding a new
 *   opinion.
 * - **Tier 2 — public documentation examples.** Classified `starter example` or `library demo` by
 *   `docs/project/showcase/apps-classification.md`, shipped as a `create-aura3d` template, or
 *   referenced by a shipped document under `docs/`. A developer can reach these from
 *   documentation, so they must build, run and demonstrate the API accurately — but need no
 *   marketing polish.
 * - **Tier 3 — diagnostics and internal fixtures.** Classified as any flavour of diagnostic,
 *   `retained * evidence`, or `prototype` by the classification document; marked
 *   `internal-diagnostic` / `removed-from-public-showcase` in the gate file; or named by an
 *   existing diagnostic convention (`wow-*`, `regression-*`, `legacy-*`, `v9-*`, `*-check`,
 *   `*-evidence`, `three-compat-*`, `threejs-parity-*`).
 * - **Tier 4 — obsolete or duplicative.** Nothing reaches it automatically; see
 *   `TIER_4_CANDIDATES`.
 *
 * Precedence is Tier 1 > Tier 3 > Tier 2 > unclassified. Tier 3 outranks Tier 2 deliberately: a
 * diagnostic route mentioned in an architecture document is still a diagnostic route, and
 * promoting it on a passing mention would inflate the release surface.
 *
 * ## The classification document is the primary signal, not this file
 *
 * `docs/project/showcase/apps-classification.md` already assigns a label to every route and is
 * described in-tree as "current classification policy". A first version of this tool ignored it
 * and derived tiers from gate entries and docs references alone, which left **44 routes
 * unclassified** — including `product-configurator`, `material-studio` and `physics-sandbox`,
 * all of which that document already labels. Inventing a parallel scheme beside a canonical one
 * is how a repository ends up with two answers and no owner (R12), so the label mapping below is
 * the tier mapping, and this tool contributes only the mechanical parts the document cannot: an
 * exhaustiveness check, and interaction detection read from route source.
 */
import { existsSync, readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..", "..");

type Tier = 1 | 2 | 3 | 4;

interface RouteRow {
  readonly id: string;
  readonly root: "apps" | "examples";
  readonly tier: Tier;
  /** Why this tier, citing the signal rather than an opinion. */
  readonly rationale: string;
  /** Whether the route exposes interaction. WS-5.2 scopes its evidence by this. */
  readonly interactive: boolean;
  readonly releaseClass?: string;
  readonly hasRouteHealth: boolean;
}

/**
 * Directories that are shared code, not routes.
 *
 * These hold helpers imported by sibling routes and have no entry point, so classifying them
 * would mean inventing a tier for something a developer cannot visit.
 */
const NON_ROUTE_DIRECTORIES = new Set(["common", "shared", "wow-common"]);

/** Diagnostic naming conventions, each already in use in the tree. */
const DIAGNOSTIC_PATTERNS: readonly RegExp[] = [
  /^wow-/,
  /^regression-/,
  /^three-compat-/,
  /^legacy-/,
  /^v9-/,
  /-check$/,
  /-evidence$/,
  /^threejs-parity-/
];

/**
 * Tier 4 is deliberately empty.
 *
 * R8 requires a six-point machine dependency report before any deletion and R6 says line counts
 * are observations rather than targets, so a classifier nominating its own deletions would
 * invert both. An empty Tier 4 is a legitimate state: no route has been *proven* obsolete.
 */
const TIER_4_CANDIDATES: readonly string[] = [];

function listRoutes(root: "apps" | "examples"): readonly string[] {
  const directory = join(repoRoot, root);
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((entry) => statSync(join(directory, entry)).isDirectory())
    .filter((entry) => !NON_ROUTE_DIRECTORIES.has(entry))
    .sort();
}

interface GateRoute {
  readonly id: string;
  readonly releaseClass?: string;
}

function readGateRoutes(): ReadonlyMap<string, GateRoute> {
  const path = join(repoRoot, "tools/showcase-library/route-gates.json");
  if (!existsSync(path)) return new Map();
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { readonly routes?: readonly GateRoute[] };
  return new Map((parsed.routes ?? []).map((route) => [route.id, route]));
}

/**
 * Route ids mentioned by a shipped document under `docs/`.
 *
 * `git grep` rather than a filesystem walk, so an untracked scratch file cannot promote a route
 * into Tier 2 — the signal has to be a *shipped* document.
 */
function readDocumentedRoutes(): ReadonlySet<string> {
  const documented = new Set<string>();
  let out = "";
  try {
    out = execFileSync("git", ["grep", "-ohE", "(apps|examples)/[a-z0-9][a-z0-9-]*", "--", "docs/"], {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 32 * 1024 * 1024
    });
  } catch {
    return documented;
  }
  for (const line of out.split("\n")) {
    const id = line.trim().split("/")[1];
    if (id) documented.add(id);
  }
  return documented;
}

/**
 * Label -> tier, from `docs/project/showcase/apps-classification.md`'s own label table.
 *
 * Ordered longest-prefix-first at the match site, because several labels share a stem
 * (`retained engine evidence` vs `retained engine evidence - Production Asset Inspector`).
 */
const CLASSIFICATION_TIERS: readonly (readonly [RegExp, Tier, string])[] = [
  // Tier 1: the document's own public-release label.
  [/^release-ready candidate/, 1, "classification doc: release-ready candidate"],
  // Tier 2: teaches or demonstrates a public API.
  [/^starter example/, 2, "classification doc: starter example"],
  [/^library demo/, 2, "classification doc: library demo"],
  // Tier 3: everything the document itself says is not public showcase material.
  [/^internal diagnostic/, 3, "classification doc: internal diagnostic"],
  [/^internal asset diagnostic/, 3, "classification doc: internal asset diagnostic"],
  [/^game-layer diagnostic/, 3, "classification doc: game-layer diagnostic"],
  [/^diagnostic/, 3, "classification doc: diagnostic"],
  [/^retained /, 3, "classification doc: retained evidence route"],
  [/^removed-from-public-showcase/, 3, "classification doc: removed from public showcase"],
  [/^prototype-blocked/, 3, "classification doc: prototype-blocked (R5 — must stay blocked)"],
  [/^blocked/, 3, "classification doc: blocked"],
  [/^prototype/, 3, "classification doc: prototype"],
  [/^index route/, 3, "classification doc: index route"],
  [/^local development control surface/, 3, "classification doc: local development surface"],
  [/^development showcase/, 3, "classification doc: development showcase"],
  [/^support-only shared code/, 3, "classification doc: support-only shared code"]
];

/**
 * Route id -> classification label, parsed from the document's markdown tables.
 *
 * The tables are `| \`route\` | label | ...`, with the route sometimes written as a path
 * (`/apps/camera-path/`) and sometimes as a bare directory (`showcase-data-galaxy`), so both
 * forms are normalised to the directory name.
 */
function readClassificationLabels(): ReadonlyMap<string, string> {
  const path = join(repoRoot, "docs/project/showcase/apps-classification.md");
  const labels = new Map<string, string>();
  if (!existsSync(path)) return labels;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = /^\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|/.exec(line);
    if (!match) continue;
    const raw = match[1]!.trim();
    const label = match[2]!.trim();
    // Skip the label-definition table at the top, whose first column is a label not a route.
    if (label.endsWith(".") && /^[a-z- ]+$/.test(raw)) continue;
    const id = raw.replace(/^\/*(apps|examples)\//, "").replace(/^\/+/, "").replace(/\/+$/, "");
    if (id.length > 0 && !labels.has(id)) labels.set(id, label);
  }
  return labels;
}

/**
 * Routes navigated to by a retained Playwright spec under `tests/browser/`.
 *
 * This is the signal that classifies `examples/*`. The classification document covers `apps/`
 * only, and 23 examples matched nothing — but many are load-bearing: `examples/physics-sandbox`
 * is driven by browser specs and named in `tools/foundation-runtime`. A route that a
 * retained spec navigates to is public-facing behaviour under test, so it is at least Tier 2:
 * it must build, run and demonstrate the API accurately.
 *
 * Matched on file paths inside the route, so a bare directory mention in prose does not promote
 * it — the reference has to be to something the route actually contains.
 */
function readSpecDrivenRoutes(): ReadonlySet<string> {
  const driven = new Set<string>();
  let out = "";
  try {
    /*
     * Any file path under a retained spec or gate, not only `page.goto(".../index.html")`.
     *
     * Restricting the match to `index.html` left four labs unclassified — `postprocess-lab`,
     * `shadow-lab`, `rendering-large-scene`, `raycast-ccd-lab` — each of which *is* driven by
     * retained evidence, just through a harness module, a `main.ts` path in a readiness tool, or
     * a unit test rather than a literal navigation. Those are the same claim: a retained gate
     * depends on the route existing and behaving.
     */
    out = execFileSync(
      "git",
      ["grep", "-ohE", "(apps|examples)/[a-z0-9][a-z0-9-]*/[a-zA-Z0-9_.-]+", "--", "tests/browser/", "tests/unit/", "tools/"],
      { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
    );
  } catch {
    return driven;
  }
  for (const line of out.split("\n")) {
    const id = line.trim().split("/")[1];
    if (id) driven.add(id);
  }
  return driven;
}

/** Template names shipped by the scaffold generator, which are public by definition. */
function readTemplateRoutes(): ReadonlySet<string> {
  const directory = join(repoRoot, "packages/create-aura3d/templates");
  if (!existsSync(directory)) return new Set();
  return new Set(readdirSync(directory).filter((entry) => statSync(join(directory, entry)).isDirectory()));
}

/**
 * Does the route expose interaction?
 *
 * WS-5.2 scopes evidence by this, because requiring an interaction audit on a non-interactive
 * demonstration would manufacture synthetic controls that prove nothing. Detected from source
 * rather than declared, so it cannot drift from what the route actually does.
 */
function detectsInteraction(root: string, id: string): boolean {
  /*
   * Scan the route directory, not `<route>/src`.
   *
   * `apps/*` routes keep sources under `src/`, but `examples/*` are frequently a flat
   * `index.html` + `main.ts`. Looking only in `src/` reported every flat example as
   * non-interactive, which would have let WS-5.2 skip an interaction audit on a route that has
   * keyboard controls.
   */
  const source = join(repoRoot, root, id);
  if (!existsSync(source)) return false;
  const signals =
    /addEventListener\(\s*["'`](keydown|keyup|pointerdown|pointerup|pointermove|click|wheel|touchstart)|game\.input|createGameInput|orbitControls|OrbitControls|\.controls\(/;
  const stack: string[] = [source];
  while (stack.length > 0) {
    const current = stack.pop()!;
    for (const entry of readdirSync(current)) {
      if (entry === "node_modules" || entry === "dist" || entry === "generated") continue;
      const path = join(current, entry);
      if (statSync(path).isDirectory()) {
        stack.push(path);
        continue;
      }
      if (!/\.(ts|tsx|js|mjs)$/.test(entry)) continue;
      if (signals.test(readFileSync(path, "utf8"))) return true;
    }
  }
  return false;
}

function classify(
  root: "apps" | "examples",
  id: string,
  gates: ReadonlyMap<string, GateRoute>,
  documented: ReadonlySet<string>,
  templates: ReadonlySet<string>,
  labels: ReadonlyMap<string, string>,
  specDriven: ReadonlySet<string>
): RouteRow {
  const gate = gates.get(id);
  const releaseClass = gate?.releaseClass;
  const classificationLabel = labels.get(id);
  const interactive = detectsInteraction(root, id);
  const hasRouteHealth = existsSync(join(repoRoot, root, id, "route-health.json"));
  const base = { id, root, interactive, hasRouteHealth, ...(releaseClass === undefined ? {} : { releaseClass }) };

  /*
   * Gate classes that are *not* public, and must never reach Tier 1 or 2.
   *
   * `prototype-blocked` is the one that matters and the one I got wrong: my first version treated
   * "has a gate entry" as sufficient for Tier 1, which promoted all three routes R5 explicitly
   * forbids promoting — `showcase-blockfall-reactor`, `showcase-skyline-runner`,
   * `showcase-turbo-drift-circuit`. Being *gated* is not the same as being *cleared*; these routes
   * are in the gate file precisely so their blockers are tracked. The WS-5.4 test caught it.
   */
  const NON_PUBLIC_GATE_CLASSES = new Set([
    "internal-diagnostic",
    "removed-from-public-showcase",
    "prototype-blocked",
    "blocked",
    "index-route"
  ]);
  if (releaseClass !== undefined && NON_PUBLIC_GATE_CLASSES.has(releaseClass)) {
    const note = releaseClass === "prototype-blocked" ? " (R5 — must stay blocked, do not promote)" : "";
    return { ...base, tier: 3, rationale: `route-gates.json marks it '${releaseClass}'${note}` };
  }
  if (gate) {
    return { ...base, tier: 1, rationale: `gated in route-gates.json as '${releaseClass ?? "unclassified"}'` };
  }
  if (classificationLabel !== undefined) {
    const mapped = CLASSIFICATION_TIERS.find(([pattern]) => pattern.test(classificationLabel));
    if (mapped) return { ...base, tier: mapped[1], rationale: mapped[2] };
    return { ...base, tier: 3, rationale: `UNCLASSIFIED — classification doc label '${classificationLabel}' has no tier mapping` };
  }
  const diagnosticPattern = DIAGNOSTIC_PATTERNS.find((pattern) => pattern.test(id));
  if (diagnosticPattern) {
    return { ...base, tier: 3, rationale: `diagnostic naming convention ${String(diagnosticPattern)}` };
  }
  if (templates.has(id)) {
    return { ...base, tier: 2, rationale: "shipped as a create-aura3d template" };
  }
  if (documented.has(id)) {
    return { ...base, tier: 2, rationale: "referenced by a shipped document under docs/" };
  }
  if (specDriven.has(id)) {
    return { ...base, tier: 2, rationale: "a retained spec or release gate depends on this route's files" };
  }
  return { ...base, tier: 3, rationale: "UNCLASSIFIED — no gate entry, no docs reference, no diagnostic naming" };
}

function main(): void {
  const gates = readGateRoutes();
  const documented = readDocumentedRoutes();
  const templates = readTemplateRoutes();
  const labels = readClassificationLabels();
  const specDriven = readSpecDrivenRoutes();
  const rows: RouteRow[] = [];
  for (const root of ["apps", "examples"] as const) {
    for (const id of listRoutes(root)) rows.push(classify(root, id, gates, documented, templates, labels, specDriven));
  }
  for (const id of TIER_4_CANDIDATES) {
    const index = rows.findIndex((row) => row.id === id);
    if (index >= 0) {
      rows[index] = { ...rows[index]!, tier: 4, rationale: "explicit Tier 4 candidate; deletion still requires R8 clearance" };
    }
  }

  const counts = rows.reduce<Record<string, number>>((accumulator, row) => {
    accumulator[`tier${row.tier}`] = (accumulator[`tier${row.tier}`] ?? 0) + 1;
    return accumulator;
  }, {});
  const unclassified = rows.filter((row) => row.rationale.startsWith("UNCLASSIFIED"));
  const tier12 = rows.filter((row) => row.tier === 1 || row.tier === 2);

  const report = {
    generatedAt: new Date().toISOString(),
    method:
      "Tier is derived from signals already in the tree — docs/project/showcase/apps-classification.md labels (the " +
      "canonical classification policy), route-gates.json releaseClass, create-aura3d template names, shipped docs/ " +
      "references via git grep, retained spec/gate file references under tests/ and tools/, and diagnostic naming " +
      "conventions — " +
      "never hand-authored per route. " +
      "Precedence: Tier 1 > Tier 3 > Tier 2. Interaction is detected from route source, not declared.",
    counts,
    totalRoutes: rows.length,
    tier12Count: tier12.length,
    tier12MissingRouteHealth: tier12.filter((row) => !row.hasRouteHealth).map((row) => `${row.root}/${row.id}`),
    unclassified: unclassified.map((row) => `${row.root}/${row.id}`),
    routes: rows
  };

  const outputDirectory = join(repoRoot, "tests/reports/route-tiers");
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);

  for (const [tier, count] of Object.entries(counts).sort()) console.log(`${tier}: ${count}`);
  console.log(`total routes        : ${rows.length}`);
  console.log(`tier 1+2            : ${tier12.length}`);
  console.log(`tier 1+2 no health  : ${report.tier12MissingRouteHealth.length}`);
  console.log(`interactive         : ${rows.filter((row) => row.interactive).length}`);
  console.log(`unclassified        : ${unclassified.length}`);
  console.log("report: tests/reports/route-tiers/report.json");

  if (unclassified.length > 0) {
    console.error(`\n${unclassified.length} route(s) could not be classified:`);
    for (const route of unclassified) console.error(`  - ${route.root}/${route.id}`);
    console.error("Add a label in docs/project/showcase/apps-classification.md, a route-gates.json entry, or a diagnostic name.");
    process.exit(1);
  }
}

main();
