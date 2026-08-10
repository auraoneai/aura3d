/**
 * WS-3.6a — package ownership and dependency-direction graph.
 *
 * §3.6 of the 1.6 PRD splits the old monolithic "package ownership" workstream. This is the first
 * half: establish the real graph before anything is consolidated, so a later consolidation cannot
 * be justified by a guess about who depends on whom.
 *
 * Two things are measured, and they disagree in this repository, which is the point:
 *
 *   1. DECLARED edges — `@aura3d/*` entries in each package's `dependencies`/`peerDependencies`.
 *   2. SOURCE edges   — `@aura3d/...` specifiers actually imported under each `packages/x/src`.
 *
 * A declared edge with no source edge is an over-declaration (ships weight nobody imports).
 * A source edge with no declared edge is an undeclared dependency (works only by workspace
 * hoisting or a tsconfig path alias, and breaks for a consumer installing from the registry).
 *
 * Subpath specifiers are resolved through `tsconfig.base.json` `paths`, because in this repository
 * `@aura3d/engine/rendering` does NOT resolve into `packages/engine` — it aliases to
 * `packages/rendering/src/index.ts`. Attributing it to `engine` would invent cycles that do not
 * exist and hide the one that does.
 *
 * Gate: layering violations and cycles are reported. Cycles among published packages fail.
 *
 * Usage:
 *   tsx tools/package-graph/index.ts
 *   tsx tools/package-graph/index.ts --report tests/reports/package-graph.json
 *   tsx tools/package-graph/index.ts --dot   docs/architecture/package-graph.dot
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { writeReport, type ReleaseCheck } from "../check-common";
import { PACKAGE_TIERS } from "../package-tiers";

const repoRoot = resolve(import.meta.dirname, "..", "..");

/** The human-readable record this tool keeps honest. */
const OWNERSHIP_DOC = "docs/architecture/package-ownership.md";

/**
 * The intended layering, imported from the single canonical source so this gate and the ESLint
 * boundary rule (WS-3.6b) can never disagree. Tier is assigned per package in
 * `tools/package-tiers.ts`; an edge from tier N to tier M with M > N is a violation.
 */
const TIERS = PACKAGE_TIERS;

interface Pkg {
  readonly dir: string;
  readonly name: string;
  readonly manifestName: string;
  readonly published: boolean;
  readonly declared: readonly string[];
}

/** Read `tsconfig.base.json` paths, stripping comments, and map each alias to its owning package. */
function loadAliasOwners(): Map<string, string> {
  const raw = readFileSync(join(repoRoot, "tsconfig.base.json"), "utf8").replace(/^\s*\/\/.*$/gm, "");
  const paths = (JSON.parse(raw) as { compilerOptions: { paths: Record<string, string[]> } }).compilerOptions.paths;
  const owners = new Map<string, string>();
  for (const [alias, targets] of Object.entries(paths)) {
    const target = targets[0] ?? "";
    const match = /^packages\/([^/]+)\//.exec(target);
    if (match) owners.set(alias, match[1]);
  }
  return owners;
}

function listPackages(): Pkg[] {
  const dir = join(repoRoot, "packages");
  const out: Pkg[] = [];
  for (const name of readdirSync(dir).sort()) {
    const manifestPath = join(dir, name, "package.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      name?: string;
      private?: boolean;
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    const all = { ...manifest.dependencies, ...manifest.peerDependencies };
    out.push({
      dir: join(dir, name),
      name,
      manifestName: manifest.name ?? name,
      published: manifest.private !== true,
      declared: Object.keys(all).filter((k) => k.startsWith("@aura3d/")).sort()
    });
  }
  return out;
}

function walkTs(root: string): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) {
        if (entry === "node_modules" || entry === "dist") continue;
        stack.push(full);
        continue;
      }
      if (/\.tsx?$/.test(entry)) out.push(full);
    }
  }
  return out;
}

/**
 * Import detection strips template-literal bodies before matching.
 *
 * `packages/create-aura3d` emits route source as template literals that contain
 * `import { ... } from "@aura3d/engine"`. A naive scan attributes that generated text to the
 * generator and invents a dependency its manifest does not declare. Line-anchoring the regex is
 * not an alternative, because the prevailing style here puts the specifier on its own line:
 *
 *   import {
 *     createSceneShowcaseWorkflow
 *   } from "@aura3d/workflows";
 *
 * so anchoring silently drops most real edges. Removing backtick spans keeps multi-line imports
 * intact while discarding generated code, which is the distinction that actually matters.
 */
function stripTemplateLiterals(text: string): string {
  let out = "";
  let inTemplate = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "\\") {
      if (!inTemplate) out += char + (text[index + 1] ?? "");
      index += 1;
      continue;
    }
    if (char === "`") {
      inTemplate = !inTemplate;
      continue;
    }
    if (!inTemplate) out += char;
    else if (char === "\n") out += "\n";
  }
  return out;
}

const SPECIFIER = /from\s+"(@aura3d\/[^"]+)"|import\s+"(@aura3d\/[^"]+)"|import\("(@aura3d\/[^"]+)"\)/g;

function collectSpecifiers(text: string): string[] {
  const found: string[] = [];
  for (const match of stripTemplateLiterals(text).matchAll(SPECIFIER)) {
    const spec = match[1] ?? match[2] ?? match[3];
    if (spec) found.push(spec);
  }
  return found;
}

/**
 * Map a specifier to the package that owns the code. Longest alias wins so
 * `@aura3d/engine/rendering/webgpu` beats `@aura3d/engine/rendering`.
 */
function ownerOf(spec: string, owners: Map<string, string>): string | undefined {
  let best: string | undefined;
  let bestLen = -1;
  for (const [alias, owner] of owners) {
    if (spec === alias && alias.length > bestLen) {
      best = owner;
      bestLen = alias.length;
    }
  }
  if (best) return best;
  // Not aliased: `@aura3d/foo` or `@aura3d/foo/bar` resolves into packages/foo when it exists.
  const bare = /^@aura3d\/([^/]+)/.exec(spec)?.[1];
  return bare;
}

/**
 * pnpm reports two link kinds that both matter here.
 *
 * `runtime` is what a registry consumer installs. `dev` exists because pnpm satisfies a
 * `peerDependencies` entry inside a workspace through `devDependencies` — `packages/react` declares
 * `@aura3d/engine` as a peer and carries `"@aura3d/engine": "workspace:*"` in `devDependencies`, so
 * pnpm links it under `devDependencies`, never under `dependencies`. Comparing declared edges against
 * `runtime` alone reports that as a missing link, which is wrong: the peer edge is real and correctly
 * installed. Comparing against the union instead would mask genuinely undeclared runtime links, so
 * the two directions use different sets.
 */
interface InstalledLinks {
  /** `dependencies` — edges a registry consumer receives transitively. */
  readonly runtime: ReadonlySet<string>;
  /** `devDependencies` — workspace-local links, including peer satisfaction. */
  readonly dev: ReadonlySet<string>;
}

/**
 * The resolved workspace graph, read from `pnpm-lock.yaml`.
 *
 * This deliberately does NOT use `pnpm -r list --depth 0 --json`, which was the original
 * implementation and was worthless: pnpm derives that listing from the same `package.json` files
 * this tool already parsed, so comparing the two compared a manifest against itself and could not
 * fail. Verified by adding `@aura3d/audio` to `packages/controls` without installing — no symlink
 * was created, the lockfile went stale, and the old check still reported agreement.
 *
 * The lockfile is a genuinely independent artifact: it is what `--frozen-lockfile` installs from,
 * it drifts from the manifests when someone edits a manifest without installing, and it records the
 * `dependencies` / `devDependencies` split that `InstalledLinks` needs.
 *
 * Returns `undefined` when the lockfile is absent or has no importers block, so the check degrades
 * to an explicit failure-with-reason rather than a false pass.
 */
function loadLockfileGraph(publishedName: ReadonlyMap<string, string>): Map<string, InstalledLinks> | undefined {
  const lockPath = join(repoRoot, "pnpm-lock.yaml");
  if (!existsSync(lockPath)) return undefined;
  const lines = readFileSync(lockPath, "utf8").split("\n");
  const start = lines.findIndex((l) => l === "importers:");
  if (start < 0) return undefined;

  const graph = new Map<string, { runtime: Set<string>; dev: Set<string> }>();
  let owner: string | undefined;
  let bucket: "runtime" | "dev" | undefined;

  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] as string;
    if (line.trim() === "") continue;
    // A new top-level block (no leading space) ends the importers section.
    if (!/^\s/.test(line)) break;

    // `  <path>:` — an importer. Only packages/* participate in the tier graph; workers/ and the
    // repo root publish separately and are out of scope for WS-3.6a.
    const importer = /^ {2}(\S.*):$/.exec(line);
    if (importer) {
      const dirMatch = /^packages\/([^/]+)$/.exec((importer[1] as string).replace(/^'|'$/g, ""));
      owner = dirMatch ? (dirMatch[1] as string) : undefined;
      bucket = undefined;
      if (owner && !graph.has(owner)) graph.set(owner, { runtime: new Set(), dev: new Set() });
      continue;
    }
    if (!owner) continue;

    // `    dependencies:` / `    devDependencies:` / `    optionalDependencies:`
    const section = /^ {4}(\S+):$/.exec(line);
    if (section) {
      const name = section[1] as string;
      bucket = name === "dependencies" ? "runtime" : name === "devDependencies" ? "dev" : undefined;
      continue;
    }

    // `      '@aura3d/input':`
    const dep = /^ {6}'?(@aura3d\/[^':]+)'?:$/.exec(line);
    if (dep && bucket) {
      const spec = dep[1] as string;
      const target = publishedName.get(spec) ?? spec.replace("@aura3d/", "");
      if (target !== owner) (graph.get(owner) as { runtime: Set<string>; dev: Set<string> })[bucket].add(target);
    }
  }

  return graph.size > 0 ? (graph as Map<string, InstalledLinks>) : undefined;
}

/**
 * The links pnpm actually created on disk, per package.
 *
 * The lockfile says what *should* be linked; this says what *is*. They diverge when a manifest was
 * edited without reinstalling, which is exactly the drift the WS-3.6a proof obligation exists to
 * catch. pnpm does not record which section produced a given symlink, so this returns one flat set
 * and is only used for the declared -> linked direction.
 *
 * Returns `undefined` when no package has a node_modules directory at all (fresh clone, no install),
 * so the check reports "not installed" instead of inventing missing links for every edge.
 */
function loadOnDiskLinks(publishedName: ReadonlyMap<string, string>, packages: ReadonlyArray<Pkg>): Map<string, Set<string>> | undefined {
  const links = new Map<string, Set<string>>();
  let anyInstalled = false;
  for (const pkg of packages) {
    const scope = join(pkg.dir, "node_modules", "@aura3d");
    if (existsSync(join(pkg.dir, "node_modules"))) anyInstalled = true;
    const set = new Set<string>();
    if (existsSync(scope)) {
      for (const entry of readdirSync(scope)) {
        const target = publishedName.get(`@aura3d/${entry}`) ?? entry;
        if (target !== pkg.name) set.add(target);
      }
    }
    links.set(pkg.name, set);
  }
  return anyInstalled ? links : undefined;
}

/**
 * Parse the human record so it cannot drift silently. WS-3.6a's second proof obligation is "no
 * undocumented edge", which is only meaningful if the document is machine-compared against the
 * measured graph. Rows are `| `pkg` | tier | LOC | public | owns | deps |`; only the first and last
 * cells are read, because the prose columns legitimately contain backticked package names.
 */
function readOwnershipDoc(path: string): Map<string, Set<string>> | undefined {
  const full = resolve(repoRoot, path);
  if (!existsSync(full)) return undefined;
  const rows = new Map<string, Set<string>>();
  for (const line of readFileSync(full, "utf8").split("\n")) {
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length !== 6) continue;
    const owner = /^`([^`]+)`$/.exec(cells[0])?.[1];
    if (!owner) continue;
    const deps = new Set<string>();
    for (const match of cells[5].matchAll(/`([^`]+)`/g)) deps.add(match[1]);
    rows.set(owner, deps);
  }
  return rows.size > 0 ? rows : undefined;
}

function main(): void {
  const args = process.argv.slice(2);
  const reportPath = args.includes("--report") ? args[args.indexOf("--report") + 1] : "tests/reports/package-graph.json";
  const dotPath = args.includes("--dot") ? args[args.indexOf("--dot") + 1] : undefined;

  const owners = loadAliasOwners();
  const packages = listPackages();
  const byName = new Map(packages.map((p) => [p.name, p]));
  const publishedName = new Map(packages.map((p) => [p.manifestName, p.name]));
  // The root manifest publishes `@aura3d/engine`; packages/engine is private `@aura3d/engine-runtime`.
  publishedName.set("@aura3d/engine", "engine");
  publishedName.set("@aura3d/engine-runtime", "engine");

  const sourceEdges = new Map<string, Map<string, string[]>>();
  for (const pkg of packages) {
    const edges = new Map<string, string[]>();
    for (const file of walkTs(join(pkg.dir, "src"))) {
      const text = readFileSync(file, "utf8");
      for (const spec of collectSpecifiers(text)) {
        const owner = ownerOf(spec, owners);
        if (!owner || owner === pkg.name || !byName.has(owner)) continue;
        const list = edges.get(owner) ?? [];
        if (list.length < 4) list.push(`${file.slice(repoRoot.length + 1)} -> ${spec}`);
        edges.set(owner, list);
      }
    }
    sourceEdges.set(pkg.name, edges);
  }

  const declaredEdges = new Map<string, Set<string>>();
  for (const pkg of packages) {
    const set = new Set<string>();
    for (const dep of pkg.declared) {
      const owner = publishedName.get(dep) ?? dep.replace("@aura3d/", "");
      if (owner !== pkg.name && byName.has(owner)) set.add(owner);
    }
    declaredEdges.set(pkg.name, set);
  }

  const undeclared: string[] = [];
  const overDeclared: string[] = [];
  for (const pkg of packages) {
    const declared = declaredEdges.get(pkg.name) as Set<string>;
    const source = sourceEdges.get(pkg.name) as Map<string, string[]>;
    for (const [dep, samples] of source) {
      if (!declared.has(dep)) undeclared.push(`${pkg.name} imports ${dep} without declaring it (${samples[0]})`);
    }
    for (const dep of declared) {
      if (!source.has(dep)) overDeclared.push(`${pkg.name} declares ${dep} but no src file imports it`);
    }
  }

  // Union graph for cycle and layer analysis: an edge exists if it is declared or imported.
  const union = new Map<string, Set<string>>();
  for (const pkg of packages) {
    const set = new Set<string>([...(declaredEdges.get(pkg.name) as Set<string>), ...(sourceEdges.get(pkg.name) as Map<string, string[]>).keys()]);
    union.set(pkg.name, set);
  }

  const cycles: string[][] = [];
  const seen = new Set<string>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const visit = (node: string): void => {
    if (onStack.has(node)) {
      cycles.push([...stack.slice(stack.indexOf(node)), node]);
      return;
    }
    if (seen.has(node)) return;
    seen.add(node);
    onStack.add(node);
    stack.push(node);
    for (const next of [...(union.get(node) ?? [])].sort()) visit(next);
    stack.pop();
    onStack.delete(node);
  };
  for (const pkg of packages.map((p) => p.name)) visit(pkg);

  const layerViolations: string[] = [];
  const untiered: string[] = [];
  for (const pkg of packages) {
    const from = TIERS[pkg.name];
    if (from === undefined) {
      untiered.push(pkg.name);
      continue;
    }
    for (const dep of union.get(pkg.name) as Set<string>) {
      const to = TIERS[dep];
      if (to === undefined) continue;
      if (to > from) layerViolations.push(`${pkg.name} (tier ${from}) -> ${dep} (tier ${to})`);
    }
  }

  const publishedCycles = cycles.filter((c) => c.every((n) => byName.get(n)?.published !== false || n === "engine"));

  const leanClosure = new Set<string>();
  const visitLeanDependency = (name: string): void => {
    if (leanClosure.has(name)) return;
    leanClosure.add(name);
    for (const dependency of union.get(name) ?? []) visitLeanDependency(dependency);
  };
  visitLeanDependency("lean");
  const forbiddenLeanDependencies = [
    "engine",
    "physics",
    "physics-rapier",
    "navigation-recast",
    "editor",
    "editor-runtime"
  ].filter((name) => leanClosure.has(name));

  const checks: ReleaseCheck[] = [
    {
      id: "every-package-tiered",
      pass: untiered.length === 0,
      detail: untiered.length === 0 ? `${packages.length} packages assigned a tier` : `untiered: ${untiered.join(", ")}`
    },
    {
      id: "no-undeclared-dependencies",
      pass: undeclared.length === 0,
      detail: undeclared.length === 0 ? "every imported package is declared" : undeclared.join("; ")
    },
    {
      id: "no-dependency-cycles",
      pass: cycles.length === 0,
      detail: cycles.length === 0 ? "graph is acyclic" : cycles.map((c) => c.join(" -> ")).join(" | ")
    },
    {
      id: "no-published-cycles",
      pass: publishedCycles.length === 0,
      detail: publishedCycles.length === 0 ? "no cycle among published packages" : publishedCycles.map((c) => c.join(" -> ")).join(" | ")
    },
    {
      id: "no-layer-violations",
      pass: layerViolations.length === 0,
      detail: layerViolations.length === 0 ? "all edges point down-tier" : layerViolations.join("; ")
    },
    {
      id: "lean-package-excludes-compatibility-physics-navigation-editor-media",
      pass: forbiddenLeanDependencies.length === 0,
      detail: forbiddenLeanDependencies.length === 0
        ? `@aura3d/lean transitive Aura closure is ${[...leanClosure].sort().join(", ")}; compatibility engine, physics, navigation, editor, and Node-media ownership are absent`
        : `@aura3d/lean reaches forbidden package owners: ${forbiddenLeanDependencies.join(", ")}`
    }
  ];

  // --- Proof obligation 1: the recorded graph matches what pnpm actually resolved and linked. ---
  //
  // Two independent sources, because a manifest cannot corroborate itself:
  //   * pnpm-lock.yaml — what `--frozen-lockfile` installs. Goes stale when a manifest is edited
  //     without installing.
  //   * packages/x/node_modules/@aura3d/* — the symlinks that exist right now.
  const lockGraph = loadLockfileGraph(publishedName);
  const diskLinks = loadOnDiskLinks(publishedName, packages);
  const installMismatches: string[] = [];
  if (lockGraph) {
    for (const pkg of packages) {
      const declared = declaredEdges.get(pkg.name) as Set<string>;
      const locked = lockGraph.get(pkg.name) ?? { runtime: new Set<string>(), dev: new Set<string>() };
      // Declared -> resolved: satisfied by either link kind (see InstalledLinks).
      for (const dep of declared) {
        if (!locked.runtime.has(dep) && !locked.dev.has(dep)) {
          installMismatches.push(`${pkg.name} declares ${dep} but pnpm-lock.yaml does not resolve it (run pnpm install)`);
        }
      }
      // Resolved -> declared: only runtime links are consumer-visible, so only those must be declared.
      for (const dep of locked.runtime) {
        if (!declared.has(dep)) {
          installMismatches.push(`${pkg.name} has ${dep} resolved as a runtime dependency in pnpm-lock.yaml but does not declare it`);
        }
      }
      // Declared -> on disk. pnpm does not record the originating section per symlink, so this
      // direction only asserts presence.
      if (diskLinks) {
        const onDisk = diskLinks.get(pkg.name) as Set<string>;
        for (const dep of declared) {
          if (!onDisk.has(dep)) {
            installMismatches.push(`${pkg.name} declares ${dep} but packages/${pkg.name}/node_modules/@aura3d/ has no such link (run pnpm install)`);
          }
        }
      }
    }
  }
  const installDetailSuffix = diskLinks ? "and on-disk @aura3d symlinks" : "(on-disk links not checked: no packages/*/node_modules present)";
  checks.push({
    id: "install-graph-matches-manifests",
    pass: lockGraph === undefined ? false : installMismatches.length === 0,
    detail:
      lockGraph === undefined
        ? "UNVERIFIED: pnpm-lock.yaml is missing or has no importers block"
        : installMismatches.length === 0
          ? `pnpm-lock.yaml ${installDetailSuffix} agree with all ${packages.length} manifests`
          : installMismatches.join("; ")
  });

  // --- Proof obligation 2: no undocumented edge. ---
  const documented = readOwnershipDoc(OWNERSHIP_DOC);
  const docGaps: string[] = [];
  if (documented) {
    for (const pkg of packages) {
      const row = documented.get(pkg.name);
      if (!row) {
        docGaps.push(`${pkg.name} has no row in ${OWNERSHIP_DOC}`);
        continue;
      }
      for (const dep of union.get(pkg.name) as Set<string>) {
        if (!row.has(dep)) docGaps.push(`${pkg.name} -> ${dep} is undocumented in ${OWNERSHIP_DOC}`);
      }
      for (const dep of row) {
        if (!byName.has(dep)) continue;
        if (!(union.get(pkg.name) as Set<string>).has(dep)) docGaps.push(`${OWNERSHIP_DOC} lists ${pkg.name} -> ${dep}, which does not exist`);
      }
    }
    for (const owner of documented.keys()) {
      if (!byName.has(owner)) docGaps.push(`${OWNERSHIP_DOC} documents ${owner}, which is not a package`);
    }
  }
  checks.push({
    id: "ownership-doc-documents-every-edge",
    pass: documented === undefined ? false : docGaps.length === 0,
    detail:
      documented === undefined
        ? `UNVERIFIED: ${OWNERSHIP_DOC} is missing or has no parseable ownership table`
        : docGaps.length === 0
          ? `${documented.size} documented packages match the measured graph exactly`
          : docGaps.join("; ")
  });

  if (dotPath) {
    const lines = ["digraph aura3d {", "  rankdir=LR;"];
    for (const pkg of packages) {
      lines.push(`  "${pkg.name}" [label="${pkg.name}\\ntier ${TIERS[pkg.name] ?? "?"}"];`);
      for (const dep of [...(union.get(pkg.name) as Set<string>)].sort()) {
        const bad = (TIERS[dep] ?? -1) > (TIERS[pkg.name] ?? 99);
        lines.push(`  "${pkg.name}" -> "${dep}"${bad ? " [color=red]" : ""};`);
      }
    }
    lines.push("}");
    mkdirSync(dirname(resolve(repoRoot, dotPath)), { recursive: true });
    writeFileSync(resolve(repoRoot, dotPath), `${lines.join("\n")}\n`);
  }

  for (const check of checks) console.log(`${check.pass ? "PASS" : "FAIL"} ${check.id}: ${check.detail}`);
  console.log(`\nover-declared (weight, not a failure): ${overDeclared.length}`);
  for (const line of overDeclared) console.log(`  ${line}`);

  writeReport(reportPath, "aura3d.package-graph.v1", checks, {
    packageCount: packages.length,
    tiers: TIERS,
    undeclared,
    overDeclared,
    cycles: cycles.map((c) => c.join(" -> ")),
    layerViolations,
    installMismatches,
    docGaps,
    edges: Object.fromEntries([...union].map(([k, v]) => [k, [...v].sort()])),
    sourceEvidence: Object.fromEntries([...sourceEdges].map(([k, v]) => [k, Object.fromEntries(v)]))
  });
}

main();
