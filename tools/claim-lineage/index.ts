/**
 * WS-1.6 — enforcement of R1, the controlling principle of the 1.6 effort.
 *
 * > No parity, performance, compatibility, or visual claim may be generated from evidence that does
 * > not execute the public production path of the thing being claimed.
 *
 * Reachability, not syntax
 * ------------------------
 * R1 is explicit that the test is reachability. Four evidence shapes all satisfy it:
 *
 *   1. direct-test-import       — the spec itself imports a public entry point
 *   2. harness-import           — the spec imports a harness that imports a public entry point
 *   3. generated-clean-room     — a generated clean-room project whose entry uses the public API
 *   4. bundle-from-public-entry — a tool that bundles a public entry and runs it in a browser
 *
 * A rule requiring the spec file itself to contain the import would be satisfied by adding a
 * decorative import that improves nothing, so this resolves transitively instead. Evidence that
 * reaches internals by deep import satisfies NOTHING — that is the one case where syntax is
 * decisive, because a deep import into a package's src/ is by definition not the public path.
 *
 * The prior generator's rule, and why it was not enough
 * ----------------------------------------------------
 * build-threejs-parity.mjs already refused to claim parity without a consumer, and refused to claim
 * exceed without a retained artifact. Both are real checks and neither is R1: a consumer proves
 * someone imports a symbol, and an artifact proves a file exists on disk. Neither proves a test
 * executed the public path and observed the claimed behaviour. 42 rows sat at parity with
 * runtimeEvidence: [].
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { writeReport, type ReleaseCheck } from "../check-common";

const repoRoot = resolve(import.meta.dirname, "..", "..");
const PARITY_REPORT = "tests/reports/aura3d-threejs-ecosystem-parity.json";
const LINEAGE_REPORT = "tests/reports/claim-lineage.json";
const LINEAGE_MAP_PATH = "tools/claim-lineage/production-path-tests.json";

/** Documented public package entry points. A claim must be reachable through one of these. */
const PUBLIC_ENTRY_SPECIFIERS = [
  "@aura3d/engine",
  "@aura3d/rendering",
  "@aura3d/scene",
  "@aura3d/physics",
  "@aura3d/animation",
  "@aura3d/assets",
  "@aura3d/input",
  "@aura3d/audio",
  "@aura3d/controls",
  "@aura3d/three-compat",
  "@aura3d/math",
  "@aura3d/core",
  "@aura3d/apps",
  "@aura3d/materials",
  "@aura3d/environments",
  "@aura3d/product-studio",
  "@aura3d/workflows",
  "@aura3d/cli",
  "@aura3d/react",
  "@aura3d/debug",
  "@aura3d/asset-index",
  "@aura3d/editor",
  "@aura3d/editor-runtime",
  "@aura3d/create-aura3d",
  /*
   * Served-source form. tests/browser/example-dev-server.ts maps bare package specifiers onto
   * /packages/<pkg>/src/index.ts and serves them, so a browser spec that navigates to a harness page
   * reaches the public barrel through a URL rather than an import statement. That barrel is the
   * public entry: it is what the package's `exports` field points at once built.
   */
  "/packages/engine/src/index.ts",
  "/packages/engine/src/agent-api/index.ts"
] as const;

/**
 * A deep import bypasses the public surface and satisfies nothing.
 *
 * Two spellings, and the distinction between them matters more than it first appears:
 *
 *   @aura3d/physics/src/PathFollowDriver          — deep, always
 *   ../../../packages/physics/src/PathFollowDriver — deep, same thing spelled relatively
 *   ../../../packages/physics/src                  — the PUBLIC BARREL. `src/index.ts` is exactly
 *                                                     what package.json `exports` points at once
 *                                                     built, so this is the public surface.
 *
 * Measured across the physics suite: `vehicle-force-motion.test.ts` imports
 * `../../../packages/physics/src`, which is the barrel and therefore admissible, while
 * `path-follow-driver.test.ts` imports `../../../packages/physics/src/PathFollowDriver` and
 * `platformer-jump-intent.test.ts` imports `packages/engine/src/agent-api/PlatformerMotion` — both
 * reach past the barrel into a file, so neither proves the capability is reachable by a developer.
 * Collapsing those three into one category would have been the single easiest way to make this tool
 * useless.
 */
const DEEP_IMPORT_PATTERNS = [
  /@aura3d\/[a-z0-9-]+\/src\/[A-Za-z0-9]/,
  /["'`][^"'`]*packages\/[a-z0-9-]+\/src\/(?!index|browser-index)[A-Za-z0-9]/
] as const;

function hasDeepImport(text: string): boolean {
  return DEEP_IMPORT_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * A relative import that lands on a package barrel is the public entry, spelled relatively.
 * `packages/physics/src` and `packages/physics/src/index.ts` are the same module.
 */
const RELATIVE_BARREL_PATTERN = /["'`][^"'`]*packages\/([a-z0-9-]+)\/src(?:\/(?:index|browser-index)(?:\.[jt]s)?)?["'`]/;

type EvidenceShape =
  | "direct-test-import"
  | "harness-import"
  | "generated-clean-room"
  | "bundle-from-public-entry";

interface LineageResolution {
  readonly path: string;
  readonly resolved: boolean;
  readonly shape: EvidenceShape | null;
  /** The chain of files walked from the named test to the public entry point. */
  readonly chain: readonly string[];
  readonly publicEntry: string | null;
  readonly reason: string;
}

/* ------------------------------------------------------------------------------------------- */
/* Reachability walk                                                                            */
/* ------------------------------------------------------------------------------------------- */

const readCache = new Map<string, string | null>();

function readSource(path: string): string | null {
  if (readCache.has(path)) return readCache.get(path) ?? null;
  const absolute = join(repoRoot, path);
  let text: string | null = null;
  try {
    if (statSync(absolute).isFile()) text = readFileSync(absolute, "utf8");
  } catch {
    text = null;
  }
  readCache.set(path, text);
  return text;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function publicEntryIn(text: string): string | null {
  for (const specifier of PUBLIC_ENTRY_SPECIFIERS) {
    // Quoted specifier: an import, an export-from, a dynamic import, or a served URL.
    if (new RegExp(`["'\`]${escapeRegExp(specifier)}`).test(text)) return specifier;
  }
  const relativeBarrel = RELATIVE_BARREL_PATTERN.exec(text);
  if (relativeBarrel !== null) return `@aura3d/${relativeBarrel[1]} (via the relative barrel packages/${relativeBarrel[1]}/src)`;
  return null;
}

function normalizeRelative(directory: string, specifier: string): string {
  const segments = [...directory.split("/").filter(Boolean), ...specifier.split("/")];
  const stack: string[] = [];
  for (const segment of segments) {
    if (segment === "." || segment === "") continue;
    if (segment === "..") stack.pop();
    else stack.push(segment);
  }
  return stack.join("/");
}

/** Local relative imports plus harness pages referenced by URL, resolved to real files. */
function localImportsOf(path: string, text: string): readonly string[] {
  const directory = path.split("/").slice(0, -1).join("/");
  const specifiers: string[] = [];
  const importPattern = /(?:from|import)\s*\(?\s*["'`](\.[^"'`]+)["'`]/g;
  let match: RegExpExecArray | null;
  while ((match = importPattern.exec(text)) !== null) specifiers.push(match[1]!);
  /*
   * A browser spec often reaches the engine by navigating rather than importing:
   *   page.goto(`${server.origin}/tests/browser/foo-harness.html`)
   * The harness page loads foo-harness.ts, which imports the public entry. Following the .html
   * reference is required for R1's harness-import shape to be resolvable at all.
   */
  const htmlPattern = /["'`][^"'`]*?(tests\/browser\/[A-Za-z0-9._-]+)\.html/g;
  while ((match = htmlPattern.exec(text)) !== null) specifiers.push(`/${match[1]!}.ts`);
  const resolvedPaths: string[] = [];
  for (const specifier of specifiers) {
    const base = specifier.startsWith("/") ? specifier.slice(1) : normalizeRelative(directory, specifier);
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, base.replace(/\.js$/, ".ts")]) {
      if (readSource(candidate) !== null) {
        resolvedPaths.push(candidate);
        break;
      }
    }
  }
  return [...new Set(resolvedPaths)];
}

function isCleanRoom(path: string): boolean {
  return path.startsWith("tests/clean-room/");
}

/**
 * Is this path *inside* a package, past its barrel?
 *
 * The reachability walk must not traverse into package internals. Caught by sabotage: pointing
 * "materials" at `tests/unit/physics/path-follow-driver.test.ts` — which deep-imports
 * `packages/physics/src/PathFollowDriver` and nothing public — RESOLVED, because the walk stepped
 * into `PathFollowDriver.ts`, kept walking through its neighbours, and eventually found a file that
 * mentions a public specifier. Every deep import would resolve that way, since all internals are
 * transitively connected, which would make the whole tool a no-op.
 *
 * A lineage is a claim about how *test-side code* reaches the public surface, so the walk stops at
 * this boundary. A barrel (`src/index.ts`, `src/browser-index.ts`) is not past it: the barrel IS the
 * public surface.
 */
function isInsidePackageInternals(path: string): boolean {
  const match = /^packages\/[a-z0-9-]+\/src\/(.+)$/.exec(path);
  if (match === null) return false;
  const inner = match[1]!;
  return inner !== "index.ts" && inner !== "browser-index.ts";
}

/** True when this tool builds a bundle from a public entry and executes it in a browser. */
function bundlesPublicEntry(text: string): boolean {
  const bundles = /from\s+["']esbuild["']|require\(["']esbuild["']\)/.test(text);
  const runsBrowser = /@playwright\/test|chromium\.launch|page\.evaluate/.test(text);
  return bundles && runsBrowser;
}

function classifyShape(path: string, source: string, depth: number): EvidenceShape {
  if (isCleanRoom(path)) return "generated-clean-room";
  if (bundlesPublicEntry(source)) return "bundle-from-public-entry";
  return depth === 1 ? "direct-test-import" : "harness-import";
}

function resolveLineage(path: string): LineageResolution {
  if (readSource(path) === null) {
    return { path, resolved: false, shape: null, chain: [], publicEntry: null, reason: `named evidence does not exist: ${path}` };
  }
  if (isInsidePackageInternals(path)) {
    return { path, resolved: false, shape: null, chain: [path], publicEntry: null, reason: `named evidence lives inside package internals (${path}); a test of a package's own internals cannot prove the capability is reachable by a developer` };
  }
  const visited = new Set<string>();
  const queue: { readonly path: string; readonly chain: readonly string[] }[] = [{ path, chain: [path] }];
  let sawDeepImport = false;
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current.path)) continue;
    visited.add(current.path);
    const source = readSource(current.path);
    if (source === null) continue;
    const entry = publicEntryIn(source);
    if (entry !== null) {
      /*
       * A file may reach the public entry AND deep-import internals. That still resolves — the public
       * path is reachable — but it is recorded, because a test that reaches internals may be asserting
       * on those internals rather than on the public behaviour, and only a human can tell.
       */
      const mixed = hasDeepImport(source);
      return {
        path,
        resolved: true,
        shape: classifyShape(current.path, source, current.chain.length),
        chain: current.chain,
        publicEntry: entry,
        reason: mixed
          ? `reaches ${entry} via ${current.chain.join(" -> ")}, but ALSO deep-imports internals — verify by hand that the assertion is on public behaviour`
          : `reaches ${entry} via ${current.chain.join(" -> ")}`
      };
    }
    if (hasDeepImport(source)) sawDeepImport = true;
    // Depth is bounded: a chain longer than this is not a comprehensible lineage.
    if (current.chain.length >= 6) continue;
    for (const next of localImportsOf(current.path, source)) {
      // Never step past a package barrel into internals: see isInsidePackageInternals.
      if (isInsidePackageInternals(next)) {
        sawDeepImport = true;
        continue;
      }
      queue.push({ path: next, chain: [...current.chain, next] });
    }
  }
  return {
    path,
    resolved: false,
    shape: null,
    chain: [...visited],
    publicEntry: null,
    reason: sawDeepImport
      ? "reaches Aura3D only by deep import into a package's src/, which satisfies nothing under R1: a deep import is by definition not the public path"
      : `no documented public package entry point is reachable from ${path} within 6 hops`
  };
}

/* ------------------------------------------------------------------------------------------- */
/* The lineage map                                                                              */
/* ------------------------------------------------------------------------------------------- */

interface ParityRow {
  readonly category: string;
  readonly capability: string;
  readonly parityStatus: string;
  readonly productionConsumers?: readonly string[];
  readonly runtimeEvidence?: readonly string[];
}

interface LineageMap {
  readonly [capability: string]: string;
}

function readLineageMap(): LineageMap {
  const path = join(repoRoot, LINEAGE_MAP_PATH);
  if (!existsSync(path)) return {};
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { readonly productionPathTests?: LineageMap };
  return parsed.productionPathTests ?? {};
}

/* ------------------------------------------------------------------------------------------- */
/* Generator faults WS-1.6 must correct                                                         */
/* ------------------------------------------------------------------------------------------- */

function fileContains(path: string, needle: string): boolean {
  const text = readSource(path);
  return text !== null && text.includes(needle);
}

interface GeneratorFault {
  readonly capability: string;
  readonly symptom: string;
  /**
   * When set, the fault is a *product* gap awaiting a named workstream rather than a *generator*
   * fault this workstream can correct. It is still reported every run, but it does not fail the gate,
   * because a gate that cannot go green until a later phase lands would be routed around before then.
   * The distinction is the point: WS-1.6 owns "is the table honest", not "is the capability built".
   */
  readonly awaitingWorkstream?: string;
  readonly detect: () => { readonly stillPresent: boolean; readonly detail: string };
}

const GENERATOR_FAULTS: readonly GeneratorFault[] = [
  {
    capability: "morph targets",
    symptom: "reported as a gap because the generator greps for MorphTargetMixer, a symbol that does not exist. The real implementations are MorphTargetMixerThreeCompat (packages/animation) and the applyMorphTargets / computeMorphTargetEnvelopeBounds family (packages/rendering).",
    detect: () => {
      const generator = "tools/product-remediation/build-threejs-parity.mjs";
      const usesMissingSymbol = fileContains(generator, '"MorphTargetMixer", "MorphTargetWeight"');
      const realSymbolExists = fileContains("packages/animation/src/threejs-compatibility/MorphTargetMixer.ts", "export class MorphTargetMixerThreeCompat");
      return {
        stillPresent: usesMissingSymbol && realSymbolExists,
        detail: usesMissingSymbol
          ? "the generator still greps MorphTargetMixer/MorphTargetWeight, which resolve to nothing, while MorphTargetMixerThreeCompat and applyMorphTargets do exist"
          : "the generator no longer greps the non-existent symbols"
      };
    }
  },
  {
    capability: "context loss recovery",
    symptom: "correctly a gap, but for a subtly wrong reason: WebGL2Device does listen for webglcontextlost/webglcontextrestored. What is missing is that nothing surfaces through the root API. The note must say that, so nobody closes the row by pointing at the listeners.",
    awaitingWorkstream: "WS-2.6 (surface onDeviceLost/onDeviceRestored through createAuraApp)",
    detect: () => {
      const listens = fileContains("packages/rendering/src/WebGL2Device.ts", "webglcontextlost");
      const surfaced = fileContains("packages/engine/src/agent-api/index.ts", "onDeviceLost");
      return {
        stillPresent: listens && !surfaced,
        detail: listens && !surfaced
          ? "WebGL2Device listens for context loss but no onDeviceLost/onDeviceRestored reaches the root API, so gap is the right status and the reason must read 'not surfaced', not 'not handled'"
          : surfaced
            ? "the root API now surfaces device-loss events (WS-2.6)"
            : "no context-loss listener found at all"
      };
    }
  }
] as const;

/* ------------------------------------------------------------------------------------------- */
/* Entry                                                                                        */
/* ------------------------------------------------------------------------------------------- */

function main(): void {
  const parityPath = join(repoRoot, PARITY_REPORT);
  if (!existsSync(parityPath)) {
    writeReport(LINEAGE_REPORT, "a3d-claim-lineage", [{
      id: "parity-report",
      pass: false,
      detail: `${PARITY_REPORT} is absent. Run \`node tools/product-remediation/build-threejs-parity.mjs\` first.`
    }]);
    return;
  }
  const parity = JSON.parse(readFileSync(parityPath, "utf8")) as { readonly rows?: readonly ParityRow[] };
  const rows = parity.rows ?? [];
  const lineageMap = readLineageMap();

  /*
   * `gap` rows are exempt. A gap is the honest absence of a capability, and demanding a
   * production-path test proving a thing does not exist would be incoherent. Every row claiming
   * parity or exceed needs lineage; parity-unproven needs it too, because the reason it is unproven
   * must be traceable to something real rather than asserted.
   */
  const requiresLineage = rows.filter((row) => row.parityStatus !== "gap");
  const resolutions = requiresLineage.map((row) => {
    const named = lineageMap[row.capability];
    if (named === undefined) {
      return {
        row,
        named: null as string | null,
        resolution: null as LineageResolution | null,
        pass: false,
        detail: `"${row.capability}" (${row.parityStatus}) names no production-path test. Add one to ${LINEAGE_MAP_PATH}, or the row must be forced to unproven.`
      };
    }
    const resolution = resolveLineage(named);
    return {
      row,
      named: named as string | null,
      resolution: resolution as LineageResolution | null,
      pass: resolution.resolved,
      detail: resolution.resolved
        ? `"${row.capability}" (${row.parityStatus}) <- ${named} [${resolution.shape}]`
        : `"${row.capability}" (${row.parityStatus}) names ${named}, which does NOT satisfy R1: ${resolution.reason}`
    };
  });

  const checks: ReleaseCheck[] = resolutions.map((entry) => ({
    id: `lineage:${entry.row.capability}`,
    pass: entry.pass,
    detail: entry.detail
  }));

  for (const fault of GENERATOR_FAULTS) {
    const detected = fault.detect();
    const awaiting = fault.awaitingWorkstream !== undefined;
    checks.push({
      id: `generator-fault:${fault.capability}`,
      // A product gap awaiting a named workstream is reported, not failed. See `awaitingWorkstream`.
      pass: !detected.stillPresent || awaiting,
      detail: detected.stillPresent
        ? awaiting
          ? `note (${fault.awaitingWorkstream}) — the parity note is now accurate; the capability itself is still absent: ${detected.detail}`
          : `UNCORRECTED — ${detected.detail}`
        : `corrected — ${detected.detail}`
    });
  }

  const unresolved = resolutions.filter((entry) => !entry.pass);
  writeReport(LINEAGE_REPORT, "a3d-claim-lineage", checks, {
    rule: "R1 — no parity, performance, compatibility or visual claim may be generated from evidence that does not execute the public production path of the thing being claimed. Reachability, not syntax: a direct test import, a harness import, a generated clean-room entry, or a bundle built from a public entry all satisfy it. A deep import into a package's src/ satisfies nothing.",
    publicEntryPoints: PUBLIC_ENTRY_SPECIFIERS,
    evidenceShapes: ["direct-test-import", "harness-import", "generated-clean-room", "bundle-from-public-entry"],
    gapRowsExempt: "A gap is the honest absence of a capability; demanding a test that proves a thing does not exist would be incoherent.",
    generatorFaults: GENERATOR_FAULTS.map((fault) => ({ capability: fault.capability, symptom: fault.symptom, ...fault.detect() })),
    totals: {
      rows: rows.length,
      requiringLineage: requiresLineage.length,
      withLineage: resolutions.filter((entry) => entry.pass).length,
      withoutLineage: unresolved.length,
      gapRowsExemptCount: rows.length - requiresLineage.length
    },
    rows: resolutions.map((entry) => ({
      capability: entry.row.capability,
      category: entry.row.category,
      parityStatus: entry.row.parityStatus,
      productionPathTest: entry.named,
      lineageResolved: entry.pass,
      evidenceShape: entry.resolution?.shape ?? null,
      publicEntry: entry.resolution?.publicEntry ?? null,
      chain: entry.resolution?.chain ?? [],
      /*
       * The status this row would carry if R1 were applied strictly today. Reported rather than
       * written back into the parity table, so this tool never silently edits a claim: the honest
       * number stays visible and the correction is a deliberate act.
       */
      statusUnderR1: entry.pass ? entry.row.parityStatus : "unproven",
      reason: entry.resolution?.reason ?? "no production-path test named"
    })),
    unresolvedCapabilities: unresolved.map((entry) => entry.row.capability)
  });

  for (const check of checks) console.log(`${check.pass ? "ok  " : "FAIL"} ${check.detail}`);
  console.log(`\n${resolutions.filter((entry) => entry.pass).length}/${requiresLineage.length} rows have a resolvable production-path test.`);
  console.log(`report: ${LINEAGE_REPORT}`);
}

main();
