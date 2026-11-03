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
 * - **Tier 1 — public and marketed.** A release-ready candidate gate or explicit candidate
 *   classification, corroborated by the marketing build and a non-redirected source route.
 *   Inventory/catalog data can validate URL health but does not confer release eligibility.
 *   A gate's `published` flag identifies a legacy build/probe target, not public availability.
 * - **Tier 2 — public documentation examples.** Classified `starter example` or `library demo` by
 *   `docs/project/showcase/apps-classification.md`, shipped as a `create-aura3d` template, or
 *   referenced by a shipped document under `docs/`. A developer can reach these from
 *   documentation, so they must build, run and demonstrate the API accurately — but need no
 *   marketing polish.
 * - **Tier 3 — diagnostics and internal fixtures.** Classified as any flavour of diagnostic,
 *   `retained * evidence`, or `prototype` by the classification document; marked
 *   `internal-diagnostic` / `removed-from-public-showcase` in the gate file; redirected by the
 *   marketing build; or named by an existing diagnostic convention (`wow-*`, `regression-*`,
 *   `legacy-*`, `v9-*`, `*-check`, `*-evidence`, `three-compat-*`, `threejs-parity-*`).
 * - **Tier 4 — obsolete or duplicative.** Nothing reaches it automatically; see
 *   `TIER_4_CANDIDATES`.
 *
 * Explicit non-public gate/document labels and marketing redirects outrank all public signals.
 * Otherwise precedence is Tier 1 > Tier 3 > Tier 2 > unclassified: a diagnostic mentioned in
 * an architecture document is still a diagnostic, not a public example.
 * A marketing-published app with no applicable release-ready gate or explicit candidate label
 * is unclassified, even when live inventory, generic docs or probes mention it.
 * Classification is not release or visual approval. The generic game checks remain separate gates.
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
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseAliasBuildContract, parseMarketingRoutes } from "./marketing";
import type { MarketingRoutes } from "./marketing";

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

/** Explicit non-public gate classes always outrank marketing and candidate signals. */
const NON_PUBLIC_GATE_CLASSES = new Set([
  "internal-diagnostic",
  "game-layer-diagnostic",
  "removed-from-public-showcase",
  "prototype-blocked",
  "prototype",
  "playable-showcase",
  "blocked",
  "index-route"
]);

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
    // Empty migration placeholders are not navigable routes. Treating any
    // directory name as a route manufactured three unclassifiable examples.
    .filter((entry) => readdirSync(join(directory, entry)).length > 0)
    .sort();
}

export interface GateRoute {
  readonly id: string;
  readonly releaseClass?: string;
  /** Legacy build/probe target, not proof that the marketing build publishes the route. */
  readonly published?: boolean;
}

/** Read only: importing the marketing build would run it and modify its output. */
export function readMarketingRoutes(path = join(repoRoot, "marketing/scripts/build-showcase-routes.mjs")): MarketingRoutes {
  return parseMarketingRoutes(readFileSync(path, "utf8"));
}

export interface GameInventoryEntry {
  readonly slug: string;
  readonly appFolder: string;
  readonly url: string;
  readonly title: string;
  readonly genre: string;
  readonly verification: "playable" | "replay-verified";
  readonly evidenceFolder: string;
  readonly kind: "game" | "demo";
  readonly status: "live" | "hidden" | "retired";
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const ROUTE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function safeRelativePath(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_./@-]+$/.test(value) &&
    value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

/**
 * Parse the generated inventory without running its generator. Validate its identity/count
 * fields before trusting any entry: the generic game checker selects by slug, folder and title.
 * URL-to-app consistency is checked per route so a bad row is visible in the report.
 */
export function parseGameInventory(text: string): ReadonlyMap<string, GameInventoryEntry> {
  const raw: unknown = JSON.parse(text);
  const fail = (why: string): never => { throw new Error(`game-inventory.json: ${why}`); };
  if (!record(raw) || raw.schema !== "aura3d-game-inventory/1" ||
      !Array.isArray(raw.games) || !record(raw.genres) || !record(raw.genreCounts) ||
      !Number.isSafeInteger(raw.liveGameCount) || (raw.liveGameCount as number) < 0) {
    return fail("invalid schema, games, genres, genreCounts, or liveGameCount");
  }
  const genres = raw.genres;
  const counts = raw.genreCounts;
  const genreNames = Object.keys(genres);
  if (genreNames.length === 0 || genreNames.some((name) =>
    !ROUTE_ID.test(name) || typeof genres[name] !== "string" || !(genres[name] as string).trim()
  ) || Object.keys(counts).length !== genreNames.length) {
    return fail("invalid genres or genreCounts");
  }
  const entries = new Map<string, GameInventoryEntry>();
  const slugs = new Set<string>();
  const urls = new Set<string>();
  const actualCounts = new Map(genreNames.map((name) => [name, 0]));
  let liveCount = 0;
  for (const value of raw.games) {
    if (!record(value) || typeof value.slug !== "string" || !ROUTE_ID.test(value.slug) ||
        typeof value.appFolder !== "string" || !ROUTE_ID.test(value.appFolder) ||
        typeof value.url !== "string" || !/^\/apps\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/.test(value.url) ||
        typeof value.title !== "string" || !value.title.trim() ||
        typeof value.genre !== "string" || !Object.hasOwn(genres, value.genre) ||
        (value.verification !== "playable" && value.verification !== "replay-verified") ||
        !safeRelativePath(value.evidenceFolder) || !value.evidenceFolder.startsWith("evidence/") ||
        (value.kind !== "game" && value.kind !== "demo") ||
        (value.status !== "live" && value.status !== "hidden" && value.status !== "retired")) {
      return fail("invalid game identity, URL, kind, status, title, genre, verification, or evidence folder");
    }
    if (value.screens !== null && (!record(value.screens) ||
        typeof value.screens.set !== "string" || !value.screens.set.trim() ||
        !safeRelativePath(value.screens.dir) ||
        !value.screens.dir.startsWith(`${value.evidenceFolder}/screens/`) ||
        (value.screens.card !== null && !safeRelativePath(value.screens.card)) ||
        !Number.isSafeInteger(value.screens.frameCount) || (value.screens.frameCount as number) < 1)) {
      return fail("invalid screens metadata");
    }
    if (slugs.has(value.slug) || entries.has(value.appFolder) || urls.has(value.url)) {
      return fail(`duplicate game slug, app folder, or URL: ${value.slug}`);
    }
    const game: GameInventoryEntry = {
      slug: value.slug, appFolder: value.appFolder, url: value.url, title: value.title,
      genre: value.genre, verification: value.verification, evidenceFolder: value.evidenceFolder,
      kind: value.kind, status: value.status
    };
    slugs.add(game.slug);
    urls.add(game.url);
    entries.set(game.appFolder, game);
    if (game.kind === "game" && game.status === "live") {
      liveCount++;
      actualCounts.set(game.genre, actualCounts.get(game.genre)! + 1);
    }
  }
  if (liveCount !== raw.liveGameCount || genreNames.some((name) =>
    !Object.hasOwn(counts, name) || counts[name] !== actualCounts.get(name)
  )) return fail("liveGameCount or genreCounts does not match the live games");
  return entries;
}

export function readGameInventory(path = join(repoRoot, "docs/workflows/game-inventory.json")): ReadonlyMap<string, GameInventoryEntry> {
  return parseGameInventory(readFileSync(path, "utf8"));
}

export interface HostingRule {
  readonly source: string;
  readonly destination: string;
  readonly status: string;
}

export interface HostingRedirects {
  readonly text: string;
  readonly rules: readonly HostingRule[];
}

/** Pages input redirects are optional; unsupported or duplicate rules are never ignored. */
export function parseHostingRedirects(text: string): HostingRedirects {
  const rules: HostingRule[] = [];
  const sources = new Set<string>();
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const parts = trimmed.split(/\s+/);
    const [source, destination, status = "302"] = parts;
    if (parts.length < 2 || parts.length > 3 || !source || !destination ||
        !/^\/[a-zA-Z0-9_./~@-]*(?:\*)?$/.test(source) || source.includes("//") ||
        (source.includes("*") && !source.endsWith("/*")) ||
        source.split("/").some((part) => part === "." || part === "..") ||
        !/^\/[a-zA-Z0-9_./~@:-]*$/.test(destination) || destination.includes("//") ||
        destination.split("/").some((part) => part === "." || part === "..") ||
        !["200", "301", "302", "303", "307", "308"].includes(status) ||
        sources.has(source)) {
      throw new Error(`marketing/public/_redirects: unsupported or duplicate rule on line ${index + 1}`);
    }
    sources.add(source);
    rules.push({ source, destination, status });
  }
  return { text, rules };
}

export function readHostingRedirects(path = join(repoRoot, "marketing/public/_redirects")): HostingRedirects {
  try {
    return parseHostingRedirects(readFileSync(path, "utf8"));
  } catch (error) {
    // Vite's publicDir legitimately has no redirect file in a clean checkout.
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return parseHostingRedirects("");
    throw error;
  }
}

function matchesHostRoot(source: string, id: string): boolean {
  const paths = [`/apps/${id}`, `/apps/${id}/`, `/apps/${id}/index.html`];
  return paths.some((path) => source === path || (source.endsWith("/*") && path.startsWith(source.slice(0, -1))));
}

export function isHostingRedirectedApp(id: string, redirects: HostingRedirects): boolean {
  return redirects.rules.some((rule) => rule.status !== "200" && matchesHostRoot(rule.source, id));
}

function isHostingShadowedApp(id: string, redirects: HostingRedirects): boolean {
  return redirects.rules.some((rule) => matchesHostRoot(rule.source, id));
}

interface CatalogGame {
  readonly previewSlug: string;
  readonly appFolder: string;
  readonly url: string;
  readonly title: string;
  readonly genre: string;
  readonly verification: "playable" | "replay-verified";
  readonly evidenceFolder: string;
}

export interface CatalogAlias {
  readonly appFolder: string;
  readonly slug: string;
  readonly url: string;
  readonly sourceUrl: string;
}

export interface CatalogRoutePlan {
  readonly games: ReadonlyMap<string, CatalogGame>;
  readonly aliases: ReadonlyMap<string, CatalogAlias>;
  /** Prevent use of a plan with different route or redirect inputs. */
  readonly marketingKey: string;
  readonly hostingText: string;
}

function marketingKey(marketing: MarketingRoutes): string {
  return JSON.stringify([[...marketing.publicRoutes].sort(), [...marketing.redirectedRoutes].sort()]);
}

/**
 * Invoke only the pure helper used by the build, not the build script. Its redirect planner
 * verifies aliases against optional input rules; built asset existence is checked by the build.
 */
export async function parseCatalogRoutePlan(
  text: string,
  marketing: MarketingRoutes,
  reservedRoutes: ReadonlySet<string>,
  hosting: HostingRedirects,
  helperPath = join(repoRoot, "tools/site/route-aliases.mjs")
): Promise<CatalogRoutePlan> {
  const raw: unknown = JSON.parse(text);
  if (!record(raw) || raw.schema !== "aura3d-site-games-catalog/1" ||
      !Array.isArray(raw.games) || raw.games.length === 0 || !record(raw.genres)) {
    throw new Error("games.catalog.json: invalid catalog schema, games, or genres");
  }
  const games = new Map<string, CatalogGame>();
  const slugs = new Set<string>();
  const urls = new Set<string>();
  for (const value of raw.games) {
    if (!record(value) || typeof value.previewSlug !== "string" || !ROUTE_ID.test(value.previewSlug) ||
        typeof value.appFolder !== "string" || !ROUTE_ID.test(value.appFolder) ||
        typeof value.url !== "string" || !/^\/apps\/[a-z0-9]+(?:-[a-z0-9]+)*\/$/.test(value.url) ||
        typeof value.title !== "string" || !value.title.trim() ||
        typeof value.genre !== "string" || !Object.hasOwn(raw.genres, value.genre) ||
        typeof raw.genres[value.genre] !== "string" || !(raw.genres[value.genre] as string).trim() ||
        (value.verification !== "playable" && value.verification !== "replay-verified") ||
        !safeRelativePath(value.evidenceFolder)) {
      throw new Error("games.catalog.json: invalid game identity, URL, title, genre, verification, or evidence folder");
    }
    if (slugs.has(value.previewSlug) || games.has(value.appFolder) || urls.has(value.url)) {
      throw new Error(`games.catalog.json: duplicate game slug, app folder, or URL: ${value.previewSlug}`);
    }
    slugs.add(value.previewSlug);
    urls.add(value.url);
    games.set(value.appFolder, {
      previewSlug: value.previewSlug, appFolder: value.appFolder, url: value.url, title: value.title,
      genre: value.genre, verification: value.verification, evidenceFolder: value.evidenceFolder
    });
  }

  if (!existsSync(helperPath) || !statSync(helperPath).isFile()) throw new Error("missing tools/site/route-aliases.mjs helper");
  const helper: unknown = await import(/* @vite-ignore */ pathToFileURL(resolve(helperPath)).href);
  if (!record(helper) || typeof helper.catalogRouteAliases !== "function" || typeof helper.planAliasRedirects !== "function") {
    throw new Error("invalid tools/site/route-aliases.mjs helper");
  }
  const planned: unknown = helper.catalogRouteAliases(raw, [...marketing.publicRoutes], [...reservedRoutes]);
  if (!Array.isArray(planned)) throw new Error("catalog alias helper returned an invalid plan");
  const aliases = new Map<string, CatalogAlias>();
  for (const value of planned) {
    if (!record(value) || typeof value.appFolder !== "string" || typeof value.slug !== "string" ||
        typeof value.url !== "string" || typeof value.sourceUrl !== "string" ||
        value.sourceUrl !== `/apps/${value.appFolder}/` || value.url !== `/apps/${value.slug}/` ||
        value.url === value.sourceUrl || games.get(value.appFolder)?.url !== value.url ||
        aliases.has(value.appFolder)) {
      throw new Error("catalog alias helper returned an inconsistent alias");
    }
    aliases.set(value.appFolder, {
      appFolder: value.appFolder, slug: value.slug, url: value.url, sourceUrl: value.sourceUrl
    });
  }
  if ([...games.values()].some((game) =>
    (game.url !== `/apps/${game.appFolder}/`) !== aliases.has(game.appFolder)
  )) throw new Error("catalog alias helper omitted or invented a canonical alias");

  // The real build preflights with actual built asset entries. Empty entries validate just the
  // root/alias redirect contract here; this tool neither executes nor claims a successful build.
  helper.planAliasRedirects([...aliases.values()], new Map([...aliases.keys()].map((id) => [id, []])), hosting.text);
  return { games, aliases, marketingKey: marketingKey(marketing), hostingText: hosting.text };
}

export async function readCatalogRoutePlan(
  marketing: MarketingRoutes,
  reservedRoutes: ReadonlySet<string>,
  hosting: HostingRedirects,
  catalogPath = join(repoRoot, "tools/site/games.catalog.json"),
  helperPath = join(repoRoot, "tools/site/route-aliases.mjs")
): Promise<CatalogRoutePlan> {
  return parseCatalogRoutePlan(readFileSync(catalogPath, "utf8"), marketing, reservedRoutes, hosting, helperPath);
}

/** Validate inventory/catalog URL health; this does not establish eligibility or a game-check result. */
export function liveGameIssue(
  game: GameInventoryEntry,
  id: string,
  marketing: MarketingRoutes,
  hostingRedirects: HostingRedirects,
  sourceRoute: boolean,
  plan?: CatalogRoutePlan
): string | undefined {
  if (game.appFolder !== id || game.appFolder !== `showcase-${game.slug}`) return "slug and app folder do not match";
  if (game.kind !== "game" || game.status !== "live") return "entry is not a live game";
  if (marketing.redirectedRoutes.has(id)) return "live game is redirected by the marketing build";
  if (!marketing.publicRoutes.has(id)) return "live game is not listed in the marketing public routes";
  if (!sourceRoute) return "live game has no source route index.html under apps/";
  if (!plan || plan.marketingKey !== marketingKey(marketing) || plan.hostingText !== hostingRedirects.text) {
    return "catalog-derived alias plan is missing or does not match the marketing and hosting inputs";
  }
  const catalogGame = plan.games.get(id);
  if (!catalogGame || catalogGame.previewSlug !== game.slug || catalogGame.url !== game.url ||
      catalogGame.title !== game.title || catalogGame.genre !== game.genre ||
      catalogGame.verification !== game.verification || `evidence/${catalogGame.evidenceFolder}` !== game.evidenceFolder) {
    return "inventory and game catalog disagree on slug, URL, or game metadata";
  }
  const alias = plan.aliases.get(id);
  if (game.url !== `/apps/${id}/`) {
    if (!alias || alias.url !== game.url || alias.sourceUrl !== `/apps/${id}/`) {
      return "app URL has no matching catalog-derived canonical alias";
    }
    // planAliasRedirects has already rejected a canonical redirect, wildcard/descendant source
    // rule, loop, or legacy redirect to any destination other than this exact canonical alias.
  } else if (alias || isHostingShadowedApp(id, hostingRedirects)) {
    return "direct game route is redirected or shadowed by a hosting rule";
  }
  return undefined;
}

export function readGateRoutes(): ReadonlyMap<string, GateRoute> {
  const path = join(repoRoot, "tools/showcase-library/route-gates.json");
  if (!existsSync(path)) return new Map();
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { readonly routes?: readonly GateRoute[] };
  return new Map((parsed.routes ?? []).map((route) => [route.id, route]));
}

/**
 * `git grep -ohE <pattern> -- <paths>` over shipped files: every match, one per line.
 *
 * In a Git checkout the index decides what is shipped, so untracked scratch files never count.
 * A staged source tree with no `.git` (the 5.0 ACR source pass stages exactly
 * `git ls-files --cached --others --exclude-standard`) holds only shipped files, so there the
 * same matches come from a filesystem walk. Returning nothing there would silently demote
 * documented and gate-driven routes to unclassified. `undefined` means the search could not run.
 */
function grepShippedFiles(pattern: string, paths: readonly string[]): string | undefined {
  if (existsSync(join(repoRoot, ".git"))) {
    try {
      return execFileSync("git", ["grep", "-ohE", pattern, "--", ...paths], {
        cwd: repoRoot,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024
      });
    } catch (error) {
      // git grep exits 1 when nothing matches.
      if ((error as { status?: number }).status === 1) return "";
      return undefined;
    }
  }
  const regex = new RegExp(pattern, "g");
  const matches: string[] = [];
  const visit = (relative: string): void => {
    const absolute = join(repoRoot, relative);
    if (!existsSync(absolute)) return;
    const stats = statSync(absolute);
    if (stats.isDirectory()) {
      if (/(^|\/)(node_modules|\.git)$/.test(relative)) return;
      for (const entry of readdirSync(absolute)) visit(join(relative, entry));
      return;
    }
    if (!stats.isFile() || stats.size > 16 * 1024 * 1024) return;
    const buffer = readFileSync(absolute);
    // git grep skips binary files; mirror its NUL-byte heuristic.
    if (buffer.subarray(0, 8000).includes(0)) return;
    for (const match of buffer.toString("utf8").matchAll(regex)) matches.push(match[0]);
  };
  for (const path of paths) visit(path.replace(/\/+$/, ""));
  return matches.join("\n");
}

/**
 * Route ids mentioned by a shipped document under `docs/`.
 *
 * `git grep` rather than a filesystem walk, so an untracked scratch file cannot promote a route
 * into Tier 2 — the signal has to be a *shipped* document.
 */
function readDocumentedRoutes(): ReadonlySet<string> {
  const documented = new Set<string>();
  const out = grepShippedFiles("(apps|examples)/[a-z0-9][a-z0-9-]*", ["docs/"]);
  if (out === undefined) return documented;
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
  // A candidate label can reach Tier 1 only when the marketing build also publishes it.
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
  [/^playable-showcase/, 3, "classification doc: playable-showcase (blocked prototype)"],
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
export function readClassificationLabels(): ReadonlyMap<string, string> {
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
    const found = grepShippedFiles("(apps|examples)/[a-z0-9][a-z0-9-]*/[a-zA-Z0-9_.-]+", ["tests/browser/", "tests/unit/", "tools/"]);
    if (found === undefined) return driven;
    out = found;
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

export interface RouteClassificationInput {
  readonly root: "apps" | "examples";
  readonly id: string;
  readonly gate?: GateRoute;
  readonly classificationLabel?: string;
  readonly documented: boolean;
  readonly template: boolean;
  readonly specDriven: boolean;
  readonly interactive: boolean;
  readonly hasRouteHealth: boolean;
  readonly marketing: MarketingRoutes;
  readonly hostingRedirects: HostingRedirects;
  readonly aliasPlan?: CatalogRoutePlan;
  /** Present only when this app has an entry in the validated game inventory. */
  readonly gameInventory?: GameInventoryEntry;
  /** Whether the app has the index.html used as input by the marketing build. */
  readonly sourceRoute: boolean;
}

/** Pure classification of one route; filesystem inspection stays in main(). */
export function classifyRoute(input: RouteClassificationInput): RouteRow {
  const { root, id, classificationLabel, interactive, hasRouteHealth, marketing, hostingRedirects } = input;
  // The showcase gate and marketing arrays describe /apps/ paths, not another id or an example.
  const gate = root === "apps" && input.gate?.id === id ? input.gate : undefined;
  const releaseClass = gate?.releaseClass;
  const base = { id, root, interactive, hasRouteHealth, ...(releaseClass === undefined ? {} : { releaseClass }) };
  const mapped = classificationLabel === undefined
    ? undefined
    : CLASSIFICATION_TIERS.find(([pattern]) => pattern.test(classificationLabel));
  const game = root === "apps" && input.gameInventory?.appFolder === id ? input.gameInventory : undefined;
  const marketingRedirect = root === "apps" && marketing.redirectedRoutes.has(id);
  const hostingShadow = root === "apps" && isHostingShadowedApp(id, hostingRedirects);
  const published = root === "apps" && marketing.publicRoutes.has(id) && !marketingRedirect;
  const invalidIndexGate = gate !== undefined &&
    ((releaseClass === "index-route") !== (id === "showcase-index"));

  // A configured public build input with no entry point must remain visible as a failure,
  // even if an index, diagnostic or blocked label would otherwise classify it as non-public.
  if (published && !input.sourceRoute) {
    return { ...base, tier: 3, rationale: "UNCLASSIFIED — marketing/scripts/build-showcase-routes.mjs lists a public app with no source route index.html under apps/" };
  }

  // Explicitly non-public gate/doc labels remain non-public even if marketing lists the app.
  if (gate && !invalidIndexGate && releaseClass !== undefined && NON_PUBLIC_GATE_CLASSES.has(releaseClass)) {
    const note = releaseClass === "prototype-blocked" ? " (R5 — must stay blocked, do not promote)" : "";
    return { ...base, tier: 3, rationale: `route-gates.json marks it '${releaseClass}'${note}` };
  }
  if (mapped?.[1] === 3) return { ...base, tier: 3, rationale: mapped[2] };

  if (marketingRedirect) {
    const redirectSource = "marketing/scripts/build-showcase-routes.mjs redirects this retained route to the showcase index";
    if (game?.status === "live") {
      return {
        ...base,
        tier: 3,
        rationale: `UNCLASSIFIED — docs/workflows/game-inventory.json marks this app live, but ${redirectSource}`
      };
    }
    let earlierSignal = "";
    if (gate) earlierSignal = `route-gates.json marks it '${releaseClass}', but `;
    else if (mapped) earlierSignal = `${mapped[2]}, but `;
    else if (input.template) earlierSignal = "shipped as a create-aura3d template, but ";
    else if (input.documented) earlierSignal = "referenced by a shipped document under docs/, but ";
    else if (input.specDriven) earlierSignal = "a retained spec or release gate depends on this route's files, but ";
    return {
      ...base,
      tier: 3,
      rationale: `${earlierSignal}${redirectSource}`
    };
  }
  if (invalidIndexGate) {
    const rationale = "route-gates.json assigns index-route inconsistently with the showcase-index app";
    return { ...base, tier: 3, rationale: published ? `UNCLASSIFIED — ${rationale}` : rationale };
  }
  if (gate && releaseClass !== "release-ready candidate") {
    const rationale = `route-gates.json has missing or unsupported release class '${releaseClass ?? "unclassified"}'`;
    return { ...base, tier: 3, rationale: published ? `UNCLASSIFIED — ${rationale}` : rationale };
  }
  let validLiveGame = false;
  let gameIssue: string | undefined;
  if (game && (published || game.status === "live")) {
    gameIssue = liveGameIssue(game, id, marketing, hostingRedirects, input.sourceRoute, input.aliasPlan);
    validLiveGame = gameIssue === undefined;
  }
  if (hostingShadow) {
    const alias = validLiveGame && game ? input.aliasPlan?.aliases.get(id) : undefined;
    const redirect = isHostingRedirectedApp(id, hostingRedirects);
    const rationale = alias && redirect
      ? `marketing/public/_redirects redirects this source route to the same game's catalog-planned canonical alias ${alias.url}; ` +
        "the source route remains Tier 3, and the alias has no inherited release gate"
      : "marketing/public/_redirects redirects or rewrites this source route; it remains Tier 3";
    const hasCandidate = releaseClass === "release-ready candidate" || mapped?.[1] === 1;
    const unclassified = gameIssue !== undefined || (published && !hasCandidate);
    return {
      ...base,
      tier: 3,
      rationale: unclassified
        ? `UNCLASSIFIED — ${rationale}; ${gameIssue ?? "no release-ready candidate gate or label"}`
        : rationale
    };
  }
  if (gameIssue) {
    return { ...base, tier: 3, rationale: `UNCLASSIFIED — docs/workflows/game-inventory.json: ${gameIssue}` };
  }
  if (published && !gate && mapped?.[1] !== 1) {
    return {
      ...base,
      tier: 3,
      rationale: "UNCLASSIFIED — marketing/scripts/build-showcase-routes.mjs lists this app as public, but it has " +
        "neither a release-ready candidate route-gates.json entry nor an explicit release-ready candidate classification doc label; " +
        "docs/workflows/game-inventory.json and catalog membership do not supply release eligibility"
    };
  }
  if (classificationLabel !== undefined && !mapped) {
    return { ...base, tier: 3, rationale: `UNCLASSIFIED — classification doc label '${classificationLabel}' has no tier mapping` };
  }
  if (gate && published) {
    return {
      ...base,
      tier: 1,
      rationale: `gated in route-gates.json as '${releaseClass}' and included in the marketing build's public routes`
    };
  }
  if (mapped) {
    if (mapped[1] === 1 && !published) {
      return {
        ...base,
        tier: 3,
        rationale: "classification doc: release-ready candidate is not included in the marketing build's public routes"
      };
    }
    const marketingNote = mapped[1] === 1 ? "; included in the marketing build's public routes" : "";
    return { ...base, tier: mapped[1], rationale: `${mapped[2]}${marketingNote}` };
  }
  const diagnosticPattern = DIAGNOSTIC_PATTERNS.find((pattern) => pattern.test(id));
  if (diagnosticPattern) {
    return { ...base, tier: 3, rationale: `diagnostic naming convention ${String(diagnosticPattern)}` };
  }
  if (input.template) {
    return { ...base, tier: 2, rationale: "shipped as a create-aura3d template" };
  }
  if (input.documented) {
    return { ...base, tier: 2, rationale: "referenced by a shipped document under docs/" };
  }
  if (gate) {
    // A retained probe alone cannot turn an unlisted legacy gate into a public example.
    return {
      ...base,
      tier: 3,
      rationale: "route-gates.json has a release-ready candidate that the marketing build does not publish"
    };
  }
  if (input.specDriven) {
    return { ...base, tier: 2, rationale: "a retained spec or release gate depends on this route's files" };
  }
  return { ...base, tier: 3, rationale: "UNCLASSIFIED — no gate entry, no docs reference, no diagnostic naming" };
}

/** Keep configured public apps visible in the report even when their source route is absent. */
export function missingMarketingAppRows(marketing: MarketingRoutes, existingRows: readonly RouteRow[]): RouteRow[] {
  const existingApps = new Set(existingRows.filter((row) => row.root === "apps").map((row) => row.id));
  const missing: RouteRow[] = [];
  for (const id of marketing.publicRoutes) {
    if (marketing.redirectedRoutes.has(id) || existingApps.has(id)) continue;
    missing.push({
      id,
      root: "apps",
      tier: 3,
      rationale: "UNCLASSIFIED — marketing/scripts/build-showcase-routes.mjs lists a public app with no source route under apps/",
      interactive: false,
      hasRouteHealth: false
    });
  }
  return missing;
}

/** A stale live inventory entry must not disappear merely because its source folder is gone. */
export function missingInventoryAppRows(
  inventory: ReadonlyMap<string, GameInventoryEntry>,
  existingRows: readonly RouteRow[]
): RouteRow[] {
  const existingApps = new Set(existingRows.filter((row) => row.root === "apps").map((row) => row.id));
  return [...inventory.values()]
    .filter((game) => game.status === "live" && !existingApps.has(game.appFolder))
    .map((game) => ({
      id: game.appFolder,
      root: "apps" as const,
      tier: 3 as const,
      rationale: "UNCLASSIFIED — docs/workflows/game-inventory.json lists a live game with no source route under apps/",
      interactive: false,
      hasRouteHealth: false
    }));
}

export function collectUnclassifiedRows(rows: readonly RouteRow[]): RouteRow[] {
  return rows.filter((row) => row.rationale.startsWith("UNCLASSIFIED"));
}

async function main(): Promise<void> {
  // Fail before scanning or writing a report if the build's route lists cannot be trusted.
  const marketingSource = readFileSync(join(repoRoot, "marketing/scripts/build-showcase-routes.mjs"), "utf8");
  const marketing = parseMarketingRoutes(marketingSource);
  const reservedRoutes = parseAliasBuildContract(marketingSource);
  const hostingRedirects = readHostingRedirects();
  const gameInventory = readGameInventory();
  const aliasPlan = await readCatalogRoutePlan(marketing, reservedRoutes, hostingRedirects);
  const gates = readGateRoutes();
  const documented = readDocumentedRoutes();
  const templates = readTemplateRoutes();
  const labels = readClassificationLabels();
  const specDriven = readSpecDrivenRoutes();
  const rows: RouteRow[] = [];
  for (const root of ["apps", "examples"] as const) {
    for (const id of listRoutes(root)) {
      rows.push(classifyRoute({
        root,
        id,
        gate: gates.get(id),
        classificationLabel: labels.get(id),
        documented: documented.has(id),
        template: templates.has(id),
        specDriven: specDriven.has(id),
        interactive: detectsInteraction(root, id),
        hasRouteHealth: existsSync(join(repoRoot, root, id, "route-health.json")),
        marketing,
        hostingRedirects,
        aliasPlan,
        gameInventory: root === "apps" ? gameInventory.get(id) : undefined,
        sourceRoute: root === "apps" && existsSync(join(repoRoot, root, id, "index.html")) &&
          statSync(join(repoRoot, root, id, "index.html")).isFile()
      }));
    }
  }
  rows.push(...missingMarketingAppRows(marketing, rows));
  rows.push(...missingInventoryAppRows(gameInventory, rows));
  for (const id of TIER_4_CANDIDATES) {
    const index = rows.findIndex((row) => row.id === id);
    if (index >= 0) {
      // A public marketing app cannot disappear into an obsolete-route candidate.
      if (rows[index]!.rationale.startsWith("UNCLASSIFIED") ||
          (rows[index]!.root === "apps" && marketing.publicRoutes.has(id) &&
           !marketing.redirectedRoutes.has(id))) continue;
      rows[index] = { ...rows[index]!, tier: 4, rationale: "explicit Tier 4 candidate; deletion still requires R8 clearance" };
    }
  }

  const counts = rows.reduce<Record<string, number>>((accumulator, row) => {
    accumulator[`tier${row.tier}`] = (accumulator[`tier${row.tier}`] ?? 0) + 1;
    return accumulator;
  }, {});
  const unclassified = collectUnclassifiedRows(rows);
  const tier12 = rows.filter((row) => row.tier === 1 || row.tier === 2);

  const report = {
    generatedAt: new Date().toISOString(),
    method:
      "Tier is derived from signals already in the tree — docs/project/showcase/apps-classification.md labels (the " +
      "canonical classification policy), route-gates.json releaseClass, the marketing build's public and redirect " +
      "route lists and catalog-derived alias build plan, optional Pages redirects, validated live-game inventory entries, " +
      "create-aura3d template names, " +
      "shipped docs/ references via git grep, retained spec/gate file " +
      "references under tests/ and tools/, and diagnostic naming conventions — never hand-authored per route. " +
      "Non-public gate/doc labels and all source redirects take precedence. Tier precedence is Tier 1 > Tier 3 > Tier 2. " +
      "A public marketing app without a release-ready gate or explicit candidate label is unclassified; " +
      "live inventory and catalog membership are URL-health checks, not release eligibility. " +
      "Classification does not verify deployment, imply visual/release approval, or run mandatory game checks. " +
      "Interaction is detected from route source, not declared.",
    requiredGameChecks:
      "node tools/game-checks/run.mjs --all; use --strict when required by the release gate. " +
      "These checks run separately; this report does not claim they passed.",
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
    console.error(
      "Public marketing apps need a source route and a release-ready route-gates.json entry, explicit " +
      "release-ready candidate classification; live inventory/catalog data does not replace either signal. " +
      "other routes need an appropriate classification label or diagnostic name."
    );
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
}
