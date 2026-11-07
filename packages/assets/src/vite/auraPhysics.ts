/**
 * Build-time physics selection for Aura3D apps built with Vite (`aura3d({ physics })` from `@aura3d/assets/vite`).
 *
 * Once `@dimforge/rapier3d-compat` is installed, the engine's physics world module initialises Rapier with a top-level
 * `await` so `app.physics` is synchronous; that makes every app download the Rapier chunk (2.85 MB, 1.08 MB gzip) at
 * startup, physics or not. This plugin removes that cost without changing any app that uses physics:
 *
 * - `physics: "auto"` (default): on `vite build`, walk the app's own module graph (every module that is not part of an
 *   Aura3D package or an unrelated dependency) and look for any physics mention: a physics keyword, the name of any
 *   public engine API that declares bodies internally (generated from the engine sources into
 *   ./physicsEntryPoints.generated.ts, e.g. `prefabs.miniGolfHole`), or a use of an engine namespace the scan cannot
 *   resolve (`prefabs[name]`, `import * as engine` used other than `engine.member`). Only when there is none is the solver
 *   initialisation module (`#aura3d/rapier-init`) replaced by a stub without a Rapier import, so no Rapier chunk is
 *   emitted. The stub's entry points throw the typed PHYSICS_BACKEND_MISSING error with {@link PHYSICS_STRIPPED_MESSAGE}.
 *   `vite dev` never strips.
 * - `physics: true`: never strip (today's behaviour). `physics: false`: always strip.
 * - `physics: "lazy"`: keep physics but load Rapier on demand (the `aura3d-physics-on-demand` condition); see
 *   `physics: { load: "on-demand" }` on `createAuraApp` for the runtime semantics.
 *
 * Without this plugin nothing changes.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PHYSICS_ENTRY_TOKENS, PHYSICS_NAMESPACE_OBJECTS } from "./physicsEntryPoints.generated.js";

export type AuraPhysicsBuildMode = "auto" | "lazy" | boolean;

export interface AuraPhysicsPluginOptions {
  /** `auto` (default) strips physics from builds that never mention it; `true` keeps it; `false` strips it; `lazy` loads it on demand. */
  readonly physics?: AuraPhysicsBuildMode;
}

/** The exact detail carried by the typed error a stripped build throws when physics is used after all. */
export const PHYSICS_STRIPPED_MESSAGE = "physics was stripped at build time because no physics usage was found; set aura3d({ physics: true }) in vite.config";
/** Package `imports` condition that selects the on-demand Rapier initialisation. */
export const PHYSICS_ON_DEMAND_CONDITION = "aura3d-physics-on-demand";
/**
 * Any match keeps physics. Deliberately broad (case-insensitive, comments and strings included): a false "keep" costs
 * only the download every app pays today, a false "strip" breaks the app. Covers `.physics(`, `app.physics`,
 * `preloadPhysics`, `ensurePhysics`, `PhysicsWorld`, `@aura3d/physics`, `@dimforge/rapier*`, rigid bodies, colliders,
 * character controllers, vehicles, ragdolls, scene kits and every genre kit (`game`, `games`, `createGame*`), which use
 * physics internally.
 */
export const PHYSICS_USAGE_PATTERN = /physics|rapier|rigid[\s_-]*body|collider|character[\s_-]*controller|vehicle|ragdoll|scene[\s_-]*kits?|game/i;

const RAPIER_INIT_SPECIFIER = "#aura3d/rapier-init";
const STRIPPED_INIT_ID = "\0aura3d:physics-stripped-init";
const STRIPPED_RAPIER_ID = "\0aura3d:physics-stripped-rapier";
const RAPIER_PACKAGE = /^@dimforge\/rapier3d(?:-compat)?(?:\/|$)/;
const PHYSICS_RAPIER_DIR = /[\\/]physics-rapier[\\/]/;
const MAX_SCANNED_MODULES = 20000;

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/**
 * Names of public engine APIs whose implementation declares bodies or uses the physics world (generated, see
 * ./physicsEntryPoints.generated.ts), matched as whole identifiers: `prefabs.miniGolfHole()`, `{ miniGolfHole }`,
 * `prefabs["miniGolfHole"]` all keep physics.
 */
const PHYSICS_ENTRY_PATTERN = new RegExp(`(?<![\\w$])(?:${PHYSICS_ENTRY_TOKENS.map(escapeRegExp).join("|")})(?![\\w$])`);
/** Import and re-export statements: their binding lists name namespaces without using them. */
const IMPORT_EXPORT_FROM = /^[ \t]*(?:import|export)\b[^;'"`]*?\bfrom\s*["'][^"']*["']/gm;
/** `import * as ns from "@aura3d/..."`: the whole engine surface behind one name. */
const AURA_NAMESPACE_IMPORT = /\bimport\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s+from\s*["']@aura3d\/[^"']*["']/g;
/** `import("@aura3d/engine")`: the namespace value can be indexed anywhere, so the scan cannot follow it. */
const AURA_DYNAMIC_ENGINE_IMPORT = /\bimport\s*\(\s*["']@aura3d\/engine(?:\/[^"']*)?["']\s*\)/;

/**
 * The first use of `name` that is not a plain `name.member` access, i.e. one the scan cannot resolve to a member
 * (`name[key]`, `name?.[key]`, `Object.values(name)`, `{ ...name }`, passing it along, destructuring it).
 */
function unresolvedNamespaceUse(code: string, name: string): string | undefined {
  const occurrence = new RegExp(`(?<![\\w$])${escapeRegExp(name)}(?![\\w$])`, "g");
  for (let match = occurrence.exec(code); match; match = occurrence.exec(code)) {
    const rest = code.slice(match.index + name.length, match.index + name.length + 64);
    if (/^\s*(?:\?\.|\.)\s*[A-Za-z_$#]/.test(rest)) continue;
    return `${name}${rest.trimStart().slice(0, 2)}`.trim();
  }
  return undefined;
}

/**
 * The first physics mention in a module's code, or `undefined`. Any of: the keyword pattern, a generated engine entry
 * name, an unresolvable use of a namespace with physics members or of an Aura3D namespace import, or a dynamic import
 * of the engine. When in doubt this keeps physics: a false "keep" only costs the download every app pays today.
 */
export function findPhysicsUsage(code: string): string | undefined {
  const keyword = PHYSICS_USAGE_PATTERN.exec(code)?.[0];
  if (keyword !== undefined) return keyword;
  const entry = PHYSICS_ENTRY_PATTERN.exec(code)?.[0];
  if (entry !== undefined) return entry;
  const dynamicImport = AURA_DYNAMIC_ENGINE_IMPORT.exec(code)?.[0];
  if (dynamicImport !== undefined) return dynamicImport;
  const namespaces = [
    ...PHYSICS_NAMESPACE_OBJECTS,
    // `import { prefabs as kit }`: the local name stands for the namespace.
    ...PHYSICS_NAMESPACE_OBJECTS.flatMap((name) => [...code.matchAll(new RegExp(`(?<![\\w$])${escapeRegExp(name)}\\s+as\\s+([A-Za-z_$][\\w$]*)`, "g"))].map((match) => match[1]!)),
    ...[...code.matchAll(AURA_NAMESPACE_IMPORT)].map((match) => match[1]!)
  ];
  const body = code.replace(IMPORT_EXPORT_FROM, "");
  for (const name of namespaces) {
    const use = unresolvedNamespaceUse(body, name);
    if (use !== undefined) return use;
  }
  return undefined;
}

function cleanId(id: string): string {
  const query = id.search(/[?#]/);
  return query === -1 ? id : id.slice(0, query);
}

/** True for the request that selects the Rapier initialisation module (published `#aura3d/rapier-init` or workspace source). */
export function isRapierInitRequest(source: string, importer: string | undefined): boolean {
  if (source === RAPIER_INIT_SPECIFIER) return true;
  if (!importer || !/^\.\/rapierInit(?:\.lazy|\.ondemand)?(?:\.[cm]?[jt]s)?$/.test(source)) return false;
  return /[\\/]physics-rapier[\\/](?:src[\\/]|dist[\\/])?index\.[cm]?[jt]sx?$/.test(cleanId(importer));
}

/** Source of the stub that replaces the Rapier initialisation module in a stripped build (no Rapier import). */
export function strippedRapierInitSource(): string {
  return `// Generated by aura3d({ physics }) from @aura3d/assets/vite: no physics usage was found, so Rapier is not bundled.
const detail = ${JSON.stringify(PHYSICS_STRIPPED_MESSAGE)};
function stripped() {
  return Object.assign(new Error("PHYSICS_BACKEND_MISSING: " + detail), {
    name: "PhysicsBackendMissingError",
    code: "PHYSICS_BACKEND_MISSING",
    installCommand: "npm install @dimforge/rapier3d-compat@0.20.0",
    stripped: true
  });
}
export const rapierInitMode = "lazy";
export const rapierLoadMode = "stripped";
export function getRapierModule() { return null; }
export function getRapierInitializationError() { return { cause: stripped() }; }
export function ensureRapier() { return Promise.reject(stripped()); }
`;
}

/** Source of the module that replaces a direct Rapier import inside the physics adapter in a stripped build. */
export function strippedRapierPackageSource(): string {
  return `// Generated by aura3d({ physics }) from @aura3d/assets/vite: Rapier was stripped from this build.
throw Object.assign(new Error(${JSON.stringify(`PHYSICS_BACKEND_MISSING: ${PHYSICS_STRIPPED_MESSAGE}`)}), { name: "PhysicsBackendMissingError", code: "PHYSICS_BACKEND_MISSING", stripped: true });
`;
}

type ModuleKind = "app" | "aura" | "aura-addon" | "skip";

interface PackageInfo { readonly dir: string; readonly name?: string; readonly dependsOnAura: boolean }

function createPackageLookup(): (file: string) => PackageInfo | undefined {
  const cache = new Map<string, PackageInfo | undefined>();
  const lookup = (dir: string): PackageInfo | undefined => {
    if (cache.has(dir)) return cache.get(dir);
    let result: PackageInfo | undefined;
    const manifest = path.join(dir, "package.json");
    if (existsSync(manifest)) {
      try {
        const json = JSON.parse(readFileSync(manifest, "utf8")) as Record<string, unknown>;
        const deps = ["dependencies", "peerDependencies", "optionalDependencies"]
          .flatMap((key) => Object.keys((json[key] as Record<string, unknown> | undefined) ?? {}));
        result = {
          dir,
          ...(typeof json.name === "string" ? { name: json.name } : {}),
          dependsOnAura: deps.some((dep) => dep.startsWith("@aura3d/") || dep.startsWith("@dimforge/"))
        };
      } catch { result = { dir, dependsOnAura: true }; }
    } else {
      const parent = path.dirname(dir);
      result = parent === dir ? undefined : lookup(parent);
    }
    cache.set(dir, result);
    return result;
  };
  return (file) => lookup(path.dirname(file));
}

/**
 * `app`: the application's own code (scanned, followed). `aura`: an Aura3D package (its physics code is what the strip
 * removes, so it is not evidence of use). `aura-addon`: a third-party dependency that itself depends on Aura3D or Rapier
 * (scanned, followed). `skip`: virtual modules and unrelated dependencies.
 */
export function classifyModule(id: string, packageOf: (file: string) => PackageInfo | undefined = createPackageLookup()): ModuleKind {
  if (id.startsWith("\0") || id.startsWith("virtual:")) return "skip";
  const file = cleanId(id);
  if (!path.isAbsolute(file)) return "skip";
  const normalized = file.split(path.sep).join("/");
  if (/\/node_modules\/(?:@aura3d\/|create-aura3d\/)/.test(normalized)) return "aura";
  const pkg = packageOf(file);
  if (/\/node_modules\//.test(normalized)) return pkg?.dependsOnAura ? "aura-addon" : "skip";
  if (pkg?.name && (pkg.name.startsWith("@aura3d/") || pkg.name === "create-aura3d")) {
    const relative = path.relative(pkg.dir, file).split(path.sep).join("/");
    if (relative.startsWith("src/") || relative.startsWith("dist/")) return "aura";
  }
  return "app";
}

/** The subset of the Rollup plugin context the scan uses. */
export interface PhysicsScanContext {
  getModuleIds(): IterableIterator<string> | Iterable<string>;
  load(options: { id: string; resolveDependencies?: boolean }): Promise<{ readonly code: string | null; readonly importedIds: readonly string[]; readonly dynamicallyImportedIds: readonly string[] }>;
}

export interface PhysicsScanResult {
  readonly used: boolean;
  /** Module and token that kept physics, when `used`. */
  readonly evidence?: { readonly id: string; readonly token: string };
  readonly scannedModules: number;
  readonly reason?: string;
}

/** Walk the app's module graph from every app module known so far and report the first physics mention. */
export async function scanModuleGraphForPhysics(
  context: PhysicsScanContext,
  classify: (id: string) => ModuleKind = (id) => classifyModule(id)
): Promise<PhysicsScanResult> {
  const queue = [...context.getModuleIds()].filter((id) => {
    const kind = classify(id);
    return kind === "app" || kind === "aura-addon";
  });
  const seen = new Set(queue);
  let scannedModules = 0;
  if (queue.length === 0) return { used: true, scannedModules, reason: "no application modules were found to scan" };
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (++scannedModules > MAX_SCANNED_MODULES) return { used: true, scannedModules, reason: `more than ${MAX_SCANNED_MODULES} modules` };
    const info = await context.load({ id, resolveDependencies: true });
    const token = findPhysicsUsage(info.code ?? "");
    if (token !== undefined) return { used: true, evidence: { id, token }, scannedModules };
    for (const next of [...info.importedIds, ...info.dynamicallyImportedIds]) {
      if (seen.has(next)) continue;
      seen.add(next);
      const kind = classify(next);
      if (kind === "app" || kind === "aura-addon") queue.push(next);
    }
  }
  return { used: false, scannedModules };
}

/** Vite's client conditions (6+); prepended so adding a condition never drops the defaults. */
const DEFAULT_CLIENT_CONDITIONS = ["module", "browser", "development|production"];

export interface AuraPhysicsResolveOptions { readonly ssr?: boolean; readonly [key: string]: unknown }
export interface AuraPhysicsPluginContext extends PhysicsScanContext {
  resolve(source: string, importer?: string, options?: Record<string, unknown>): Promise<{ id: string; external?: boolean | string } | null>;
  warn(message: string): void;
}

/** The physics half of `aura3d()`; usable on its own. */
export function auraPhysicsPlugin(options: AuraPhysicsPluginOptions = {}) {
  const mode: AuraPhysicsBuildMode = options.physics ?? "auto";
  if (mode !== "auto" && mode !== "lazy" && mode !== true && mode !== false) {
    throw new Error(`aura3d({ physics }) must be "auto", "lazy", true or false (got ${JSON.stringify(mode)})`);
  }
  let isBuild = false;
  let decision: Promise<PhysicsScanResult> | undefined;
  let log: (message: string) => void = () => undefined;
  let warnedLazyFallback = false;

  const decide = (context: AuraPhysicsPluginContext): Promise<PhysicsScanResult> => {
    if (mode === false) return Promise.resolve({ used: false, scannedModules: 0, reason: "aura3d({ physics: false })" });
    decision ??= scanModuleGraphForPhysics(context).then((result) => {
      log(result.used
        ? `[aura3d] physics kept${result.evidence ? ` (${JSON.stringify(result.evidence.token)} in ${result.evidence.id})` : ` (${result.reason})`}`
        : `[aura3d] physics stripped: no physics usage in ${result.scannedModules} application module(s); Rapier is not bundled. Set aura3d({ physics: true }) to keep it.`);
      return result;
    });
    return decision;
  };
  const shouldStrip = async (context: AuraPhysicsPluginContext, resolveOptions: AuraPhysicsResolveOptions | undefined): Promise<boolean> => {
    if (mode === true || mode === "lazy" || !isBuild || resolveOptions?.ssr) return false;
    return !(await decide(context)).used;
  };

  return {
    name: "aura3d-physics",
    enforce: "pre" as const,
    config(config: { resolve?: { conditions?: readonly string[] } }) {
      if (mode !== "lazy") return null;
      // Selects rapierInit.ondemand.js through the package `imports` map, in `vite dev` (dependency pre-bundling) and
      // `vite build` alike. A user-supplied condition list is extended rather than replaced.
      const conditions = config.resolve?.conditions ? [PHYSICS_ON_DEMAND_CONDITION] : [PHYSICS_ON_DEMAND_CONDITION, ...DEFAULT_CLIENT_CONDITIONS];
      return { resolve: { conditions } };
    },
    configResolved(config: { command?: "build" | "serve"; logger?: { info(message: string): void } }) {
      isBuild = config.command === "build";
      decision = undefined;
      const logger = config.logger;
      log = logger ? (message) => logger.info(message) : (message) => console.info(message);
    },
    buildStart() {
      decision = undefined;
    },
    async resolveId(this: AuraPhysicsPluginContext, source: string, importer: string | undefined, resolveOptions?: AuraPhysicsResolveOptions) {
      if (isRapierInitRequest(source, importer)) {
        if (await shouldStrip(this, resolveOptions)) return STRIPPED_INIT_ID;
        if (mode !== "lazy") return null;
        // Workspace sources (`./rapierInit.js`) and engines resolved without the condition: map to the sibling file.
        const resolved = await this.resolve(source, importer, { ...resolveOptions, skipSelf: true });
        if (!resolved || resolved.external) return null;
        const onDemand = cleanId(resolved.id).replace(/rapierInit(?:\.lazy)?(\.[cm]?[jt]s)$/, "rapierInit.ondemand$1");
        if (onDemand !== cleanId(resolved.id) && existsSync(onDemand)) return onDemand;
        if (!/rapierInit\.ondemand\.[cm]?[jt]s$/.test(cleanId(resolved.id)) && !warnedLazyFallback) {
          warnedLazyFallback = true;
          this.warn("aura3d({ physics: \"lazy\" }): this @aura3d/engine has no on-demand Rapier initialisation; physics stays eager.");
        }
        return null;
      }
      if (RAPIER_PACKAGE.test(source) && importer && PHYSICS_RAPIER_DIR.test(cleanId(importer)) && await shouldStrip(this, resolveOptions)) {
        return STRIPPED_RAPIER_ID;
      }
      return null;
    },
    load(id: string) {
      if (id === STRIPPED_INIT_ID) return strippedRapierInitSource();
      if (id === STRIPPED_RAPIER_ID) return strippedRapierPackageSource();
      return null;
    }
  };
}
