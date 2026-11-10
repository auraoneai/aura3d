import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";
import ts from "typescript";
import * as esbuild from "esbuild";
import { contextualPathForLegacyPath } from "../../tools/naming-taxonomy/contextualAliases";
import { installedAuraPackageAliases } from "./installed-package-resolve";
import { mapModuleSpecifiers } from "./import-specifiers";

export interface ExampleDevServer {
  readonly origin: string;
  close(): Promise<void>;
}

const packageEntryPoints = new Map<string, string>([
  ["@aura3d/math", "/packages/math/src/index.ts"],
  ["@aura3d/core", "/packages/core/src/index.ts"],
  ["@aura3d/scene/math", "/packages/scene/src/MathTypes.ts"],
  ["@aura3d/scene", "/packages/scene/src/index.ts"],
  ["@aura3d/ecs", "/packages/ecs/src/index.ts"],
  ["@aura3d/rendering/reflection-surfaces", "/packages/rendering/src/reflection-surfaces.ts"],
  // Every published `@aura3d/rendering` subpath must be aliased here, and each must
  // precede the bare specifier because the first prefix match wins. Omitting one does not
  // fail loudly at build time: the browser rejects the specifier at runtime, the route
  // falls back to a scalar material, and only a downstream pixel assertion notices. That
  // is exactly how C1's textured upgrade silently regressed
  // ("Failed to resolve module specifier '@aura3d/rendering/extension-scalar-atlas'").
  ["@aura3d/rendering/extension-scalar-atlas", "/packages/rendering/src/extension-scalar-atlas.ts"],
  ["@aura3d/rendering/webgpu", "/packages/rendering/src/webgpu.ts"],
  ["@aura3d/rendering/shader-graph", "/packages/rendering/src/program/ShaderGraphCompiler.ts"],
  ["@aura3d/rendering/volumetrics", "/packages/rendering/src/volumetrics.ts"],
  ["@aura3d/rendering/lighting", "/packages/rendering/src/lighting/index.ts"],
  // contracts/world subpaths used by QR lane code (prd07 flagged the gap when
  // browser specs timed out with unresolved bare specifiers).
  ["@aura3d/rendering/contracts/flags.state", "/packages/rendering/src/contracts/flags.state.ts"],
  ["@aura3d/rendering/lanes", "/packages/rendering/src/lanes/index.ts"],
  ["@aura3d/rendering/contracts", "/packages/rendering/src/contracts/index.ts"],
  ["@aura3d/rendering/world", "/packages/rendering/src/world/index.ts"],
  ["@aura3d/rendering/production-runtime", "/packages/rendering/src/production-runtime/index.ts"],
  ["@aura3d/rendering", "/packages/rendering/src/index.ts"],
  ["@aura3d/engine/geometry-tools", "/packages/engine/src/public/geometry-tools.ts"],
  ["@aura3d/engine/procedural", "/packages/engine/src/public/procedural.ts"],
  ["@aura3d/engine/game/art", "/packages/game/src/art/index.ts"],
  ["@aura3d/engine/scatter", "/packages/engine/src/agent-api/nodes/scatter.ts"],
  ["@aura3d/engine/worker", "/packages/engine/src/public/worker.ts"],
  ["@aura3d/engine/shader-graph-runtime", "/packages/engine/src/public/shader-graph-runtime.ts"],
  ["@aura3d/engine", "/packages/engine/src/public/index.ts"],
  ["@aura3d/engine/scene", "/packages/scene/src/index.ts"],
  ["@aura3d/engine/renderer", "/packages/engine/src/public/renderer.ts"],
  ["@aura3d/engine/audio", "/packages/audio/src/index.ts"],
  ["@aura3d/cli", "/packages/aura3d-cli/src/index.ts"],
  ["@aura3d/react", "/packages/react/src/index.ts"],
  ["@aura3d/apps", "/packages/apps/src/index.ts"],
  ["@aura3d/product-studio", "/packages/product-studio/src/index.ts"],
  ["@aura3d/physics", "/packages/physics/src/index.ts"],
  ["@aura3d/physics-rapier", "/packages/physics-rapier/src/index.ts"],
  ["@aura3d/navigation-recast", "/packages/navigation-recast/src/index.ts"],
  /*
   * WS-2.2/2.3 subpaths. Without these, any harness importing the public entry fails at runtime with
   * "Failed to resolve module specifier" — the browser has no bare-specifier resolution, so every
   * package entry has to be mapped here explicitly.
   */
  ["@aura3d/physics/solverless", "/packages/physics/src/solverless.ts"],
  ["@aura3d/physics/world", "/packages/physics/src/world.ts"],
  ["@aura3d/engine-runtime/contracts", "/packages/engine/src/contracts/index.ts"],
  ["@aura3d/engine-runtime", "/packages/engine/src/index.ts"],
  ["@aura3d/engine/media-node", "/packages/engine/src/agent-api/media-node.ts"],
  ["@aura3d/animation/lanes", "/packages/animation/src/lanes/index.ts"],
  ["@aura3d/animation", "/packages/animation/src/browser-index.ts"],
  ["@aura3d/assets/exporters", "/packages/assets/src/exporters/index.ts"],
  ["@aura3d/assets/importers", "/packages/assets/src/importers.ts"],
  ["@aura3d/assets", "/packages/assets/src/browser-index.ts"],
  ["@aura3d/assets/browser", "/packages/assets/src/browser-index.ts"],
  ["@aura3d/assets/gltf-runtime", "/packages/assets/src/gltf-runtime.ts"],
  ["@aura3d/input", "/packages/input/src/index.ts"],
  ["@aura3d/controls", "/packages/controls/src/index.ts"],
  ["@aura3d/audio", "/packages/audio/src/index.ts"],
  ["@aura3d/scripting", "/packages/scripting/src/index.ts"],
  ["@aura3d/workflows", "/packages/workflows/src/index.ts"],
  ["@aura3d/engine/workflows", "/packages/workflows/src/index.ts"],
  ["@aura3d/editor-runtime", "/packages/editor-runtime/src/index.ts"],
  ["@aura3d/debug/helpers", "/packages/debug/src/helpers.ts"],
  ["@aura3d/debug", "/packages/debug/src/index.ts"],
  // PRD-09 game runtime: the game-shell harness and packages/game/fixtures/*
  // import `@aura3d/game`, and createGame imports `@aura3d/engine/lanes`. The
  // package exports point at dist/, which the browser job does not build, so
  // unmapped these fail the harness bundle and 404 in the fixture routes.
  ["@aura3d/engine/lanes", "/packages/engine/src/lanes/index.ts"],
  ["@aura3d/engine/game", "/packages/game/src/index.ts"],
  ["@aura3d/game/capture", "/packages/game/src/capture/index.ts"],
  ["@aura3d/game/art", "/packages/game/src/art/index.ts"],
  ["@aura3d/game/util", "/packages/game/src/util/index.ts"],
  ["@aura3d/game", "/packages/game/src/index.ts"],
  ["@loaders.gl/core", "/node_modules/@loaders.gl/core/dist/index.js"],
  ["@loaders.gl/images", "/node_modules/.pnpm/@loaders.gl+images@4.4.1_@loaders.gl+core@4.4.1/node_modules/@loaders.gl/images/dist/index.js"],
  ["@loaders.gl/loader-utils", "/node_modules/.pnpm/@loaders.gl+loader-utils@4.4.1_@loaders.gl+core@4.4.1/node_modules/@loaders.gl/loader-utils/dist/index.js"],
  ["@loaders.gl/schema", "/node_modules/.pnpm/@loaders.gl+schema@4.4.1/node_modules/@loaders.gl/schema/dist/index.js"],
  ["@loaders.gl/schema-utils", "/node_modules/.pnpm/@loaders.gl+schema-utils@4.4.1_@loaders.gl+core@4.4.1/node_modules/@loaders.gl/schema-utils/dist/index.js"],
  ["@loaders.gl/textures", "/node_modules/@loaders.gl/textures/dist/index.js"],
  ["@loaders.gl/worker-utils", "/node_modules/.pnpm/@loaders.gl+worker-utils@4.4.1_@loaders.gl+core@4.4.1/node_modules/@loaders.gl/worker-utils/dist/index.js"],
  ["@math.gl/types", "/node_modules/.pnpm/@math.gl+types@4.1.0/node_modules/@math.gl/types/dist/index.js"],
  ["@probe.gl/env", "/node_modules/.pnpm/@probe.gl+env@4.1.1/node_modules/@probe.gl/env/dist/index.js"],
  ["@probe.gl/log", "/node_modules/.pnpm/@probe.gl+log@4.1.1/node_modules/@probe.gl/log/dist/index.js"],
  ["@probe.gl/stats", "/node_modules/.pnpm/@probe.gl+stats@4.1.1/node_modules/@probe.gl/stats/dist/index.js"],
  ["apache-arrow", "/node_modules/.pnpm/apache-arrow@21.1.0/node_modules/apache-arrow/Arrow.dom.mjs"],
  ["@dimforge/rapier3d-compat", "/node_modules/@dimforge/rapier3d-compat/dist/rapier.mjs"],
  ["recast-navigation/generators", "/node_modules/.pnpm/recast-navigation@0.43.1/node_modules/recast-navigation/generators.mjs"],
  ["recast-navigation", "/node_modules/.pnpm/recast-navigation@0.43.1/node_modules/recast-navigation/index.mjs"],
  ["@recast-navigation/generators", "/node_modules/.pnpm/@recast-navigation+generators@0.43.1/node_modules/@recast-navigation/generators/dist/index.mjs"],
  ["@recast-navigation/core", "/node_modules/.pnpm/@recast-navigation+core@0.43.1/node_modules/@recast-navigation/core/dist/index.mjs"],
  ["@recast-navigation/wasm", "/node_modules/.pnpm/@recast-navigation+wasm@0.43.1/node_modules/@recast-navigation/wasm/dist/recast-navigation.wasm-compat.js"],
  ["flatbuffers", "/node_modules/.pnpm/flatbuffers@25.9.23/node_modules/flatbuffers/mjs/flatbuffers.js"],
  // #865: two ktx-parse versions in the lockfile, so pnpm does not hoist it to
  // .pnpm/node_modules; the root node_modules link is the stable path.
  ["ktx-parse", "/node_modules/ktx-parse/dist/ktx-parse.modern.js"],
  // S5-WP19-07: `three` is no longer in the workspace install or lock graph, so the former
  // `three`, `three/webgpu`, `three/tsl` and `three/addons/*` mappings pointed at missing files.
  ["tslib", "/node_modules/.pnpm/tslib@2.8.1/node_modules/tslib/tslib.es6.mjs"],
]);

// Keep addon source aliases aligned with the package registry without
// duplicating each independently published subpath in this browser harness.
const addonRegistry = JSON.parse(readFileSync(new URL("../../aura.exports.json", import.meta.url), "utf8")) as {
  paths: Array<readonly [string, string, unknown?]>;
};
for (const [specifier, source] of addonRegistry.paths) {
  if (specifier === "@aura3d/addons" || specifier.startsWith("@aura3d/addons/")) {
    packageEntryPoints.set(specifier, `/${source}`);
  }
}

/** Optional peerDependencies of the root package that a restored candidate consumer does not install. */
const OPTIONAL_PEER_SPECIFIERS = ["@dimforge/rapier3d-compat", "recast-navigation"] as const;

const installedUrlPrefix = "/__aura3d_installed__/";

interface InstalledCandidatePackage {
  readonly directory: string;
  readonly exports: Set<string>;
  active: boolean;
}

interface ExternalInstalledCandidate {
  readonly modules: string;
  readonly scope: string;
  readonly packages: Map<string, InstalledCandidatePackage>;
}

function isWithin(directory: string, file: string): boolean {
  const path = relative(directory, file);
  return path !== "" && path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

/**
 * The runner, not an environment variable, authorizes and verifies the install.
 * For an external root, accept only the private temporary React 19 consumer
 * that task-run exports after its gate and restored-tree checks.
 */
function externalInstalledCandidate(): ExternalInstalledCandidate | undefined {
  const configured = process.env.A3D_INSTALLED_PACKAGE_ROOT;
  const nativeAcceptance = process.env.AURA3D_NATIVE_ACCEPTANCE === "1";
  if (!configured) {
    if (nativeAcceptance) throw new Error("Native acceptance requires the runner's restored candidate packages.");
    return undefined;
  }
  const root = realpathSync(resolve(configured));
  const repository = realpathSync(process.cwd());
  if (root === repository || isWithin(repository, root)) {
    if (nativeAcceptance) throw new Error("Native acceptance cannot use workspace packages.");
    return undefined;
  }

  const react19 = process.env.A3D_REACT_19_CONSUMER_DIR;
  if (!nativeAcceptance || !react19 ||
      !isAbsolute(configured) || resolve(configured) !== root || resolve(react19) !== root ||
      realpathSync(resolve(react19)) !== root || !isWithin(realpathSync(tmpdir()), root)) {
    throw new Error("External installed packages must be the runner's restored React 19 candidate.");
  }
  const parent = lstatSync(dirname(root));
  if (!parent.isDirectory() || (process.platform !== "win32" &&
      ((parent.mode & 0o077) !== 0 || (process.getuid && parent.uid !== process.getuid())))) {
    throw new Error("The restored candidate must have a private parent directory.");
  }
  const modules = join(root, "node_modules");
  const scope = join(modules, "@aura3d");
  if (realpathSync(modules) !== modules || realpathSync(scope) !== scope) {
    throw new Error("The restored candidate package scope must not be a symlink.");
  }
  const packages = new Map<string, InstalledCandidatePackage>();
  for (const entry of readdirSync(scope, { withFileTypes: true })) {
    const directory = join(scope, entry.name);
    const manifest = join(directory, "package.json");
    // installedAuraPackageAliases reads these manifests; reject links before
    // calling it, rather than following a manifest or package out of the root.
    if (!/^[a-z0-9][a-z0-9._-]*$/.test(entry.name) || !entry.isDirectory() ||
        realpathSync(directory) !== directory || !lstatSync(manifest).isFile() ||
        realpathSync(manifest) !== manifest) {
      throw new Error(`Unsafe restored candidate package: ${entry.name}`);
    }
    packages.set(entry.name, { directory, exports: new Set(), active: false });
  }
  return { modules, scope, packages };
}

const externalCandidate = externalInstalledCandidate();
const installedWildcardAliases: Array<readonly [string, string]> = [];
const installedAliases = installedAuraPackageAliases({ includeWildcards: true });
if (externalCandidate) {
  // A missing export of an INSTALLED candidate package must never fall back to a workspace source.
  // A package the restored consumer does not contain at all (internal workspace packages such as
  // editor-runtime, audio, physics, game that the candidate bundles or does not ship to this consumer)
  // can only be imported by workspace-source pages (apps/editor, /packages/engine/src/...); those
  // keep their workspace mapping so the graph loads. Installed packages stay strictly candidate-only.
  for (const name of [...packageEntryPoints.keys()]) {
    if (name.startsWith("@aura3d/") && externalCandidate.packages.has(name.split("/")[1] ?? "")) packageEntryPoints.delete(name);
  }
}
/** True when `specifier` names an @aura3d package that the restored candidate consumer does not install. */
function isWorkspaceOnlyPackage(specifier: string): boolean {
  return externalCandidate !== undefined && specifier.startsWith("@aura3d/") && !externalCandidate.packages.has(specifier.split("/")[1] ?? "");
}
const seenInstalledAliases = new Set<string>();
for (const entry of installedAliases) {
  if (!externalCandidate) {
    const repositoryRelative = relative(process.cwd(), entry.replacement).replaceAll("\\", "/");
    if (repositoryRelative === ".." || repositoryRelative.startsWith("../") || isAbsolute(repositoryRelative)) {
      throw new Error(`Installed comparison package is outside the served repository: ${entry.replacement}`);
    }
    packageEntryPoints.set(entry.find, `/${repositoryRelative}`);
    continue;
  }
  const parts = entry.find.split("/");
  const pkg = parts[0] === "@aura3d" ? externalCandidate.packages.get(parts[1] ?? "") : undefined;
  const replacement = resolve(entry.replacement);
  const findStars = (entry.find.match(/\*/g) ?? []).length;
  const targetStars = (replacement.match(/\*/g) ?? []).length;
  if (!pkg || parts.slice(2).some((part) => !part || part === "." || part === "..") ||
      !isWithin(pkg.directory, replacement) || findStars !== targetStars || findStars > 1 ||
      seenInstalledAliases.has(entry.find)) {
    throw new Error(`Unsafe installed candidate export: ${entry.find}`);
  }
  seenInstalledAliases.add(entry.find);
  pkg.active = true;
  if (!findStars) pkg.exports.add(replacement);
  const target = installedUrlPrefix + relative(externalCandidate.scope, replacement)
    .split(sep).map(encodeURIComponent).join("/");
  if (findStars) installedWildcardAliases.push([entry.find, target]);
  else packageEntryPoints.set(entry.find, target);
}

function installedPackageForFile(file: string): InstalledCandidatePackage | undefined {
  if (!externalCandidate) return undefined;
  const path = resolve(file);
  return [...externalCandidate.packages.values()].find((pkg) => pkg.active && isWithin(pkg.directory, path));
}

function admittedInstalledFile(pkg: InstalledCandidatePackage, file: string): string | undefined {
  const allowed = (path: string): boolean => {
    if (!isWithin(pkg.directory, path)) return false;
    return relative(pkg.directory, path).split(sep)[0] === "dist" || pkg.exports.has(path);
  };
  const path = resolve(file);
  if (!allowed(path)) return undefined;
  try {
    const real = realpathSync(path);
    return allowed(real) && statSync(real).isFile() ? real : undefined;
  } catch {
    return undefined;
  }
}

function installedUrlForFile(file: string): string | undefined {
  const pkg = installedPackageForFile(file);
  const real = pkg && admittedInstalledFile(pkg, file);
  return real && externalCandidate
    ? installedUrlPrefix + relative(externalCandidate.scope, real).split(sep).map(encodeURIComponent).join("/")
    : undefined;
}

function isInstalledUrl(pathname: string): boolean {
  return pathname === installedUrlPrefix.slice(0, -1) || pathname.startsWith(installedUrlPrefix);
}

/** Only packed dist files and explicitly exported files of admitted packages are addressable. */
function resolveInstalledRequest(pathname: string): string | undefined {
  if (!externalCandidate || !pathname.startsWith(installedUrlPrefix) || pathname.includes("\\")) return undefined;
  const parts = pathname.slice(installedUrlPrefix.length).split("/");
  if (parts.length < 2 || parts.some((part) => !part || part === "." || part === "..")) return undefined;
  const pkg = externalCandidate.packages.get(parts[0]!);
  if (!pkg?.active) return undefined;
  const base = resolve(pkg.directory, ...parts.slice(1));
  const candidates = extname(base) ? [base] : [base, `${base}.js`, `${base}.mjs`, join(base, "index.js"), join(base, "index.mjs")];
  return candidates.map((candidate) => admittedInstalledFile(pkg, candidate)).find((candidate) => candidate !== undefined);
}

function packageTarget(specifier: string): string | undefined {
  const exact = packageEntryPoints.get(specifier);
  if (exact !== undefined) return exact;
  for (const [pattern, target] of installedWildcardAliases) {
    const [prefix, suffix] = pattern.split("*") as [string, string];
    if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix)) continue;
    const match = specifier.slice(prefix.length, specifier.length - suffix.length);
    if (!match || match.split("/").some((part) => !part || part === "." || part === "..")) continue;
    return target.replace("*", match.split("/").map(encodeURIComponent).join("/"));
  }
  return undefined;
}

function mappedFile(root: string, target: string): string | undefined {
  return isInstalledUrl(target)
    ? resolveInstalledRequest(decodeURIComponent(target))
    : resolve(join(root, target));
}

/** The URL path the dev server serves `file` at (repo-relative, forward slashes). */
export function moduleUrlPath(root: string, file: string): string {
  return installedUrlForFile(file) ?? `/${relative(resolve(root), resolve(file)).replace(/\\/g, "/")}`;
}

/** Replaces `import.meta.url` with the module's own served URL, so bundled modules keep Vite's per-file resolution. */
export function rewriteImportMetaUrl(source: string, urlPath: string): string {
  return source.replace(/\bimport\.meta\.url\b/g, `new URL(${JSON.stringify(urlPath)}, self.location.href).href`);
}

/** Mapped package entry points whose file is missing under `root`; their imports 404 and the page never boots. */
export function missingPackageEntryPoints(root = process.cwd()): Array<[string, string]> {
  return [...packageEntryPoints].filter(([, target]) => {
    const file = mappedFile(root, target);
    return !file || !existsSync(file);
  });
}

export async function startExampleDevServer(root = process.cwd()): Promise<ExampleDevServer> {
  // Transforms are deterministic per (file, mtime); engine graphs pull ~1,300
  // modules through this handler and re-running ts.transpileModule plus the
  // specifier rewrites per request is what pushes cold module-load past the
  // spec budgets on CI runners. Cache for the server's lifetime only.
  // #865: a mapped entry point that does not exist on disk is rewritten into a
  // 404 module URL, which surfaces only as a module-graph load failure (a
  // spec timeout). Name every missing mapping once, at startup.
  const missingEntryPoints = missingPackageEntryPoints(root);
  if (missingEntryPoints.length > 0) {
    console.error(`[example-dev-server] mapped package entry points missing on disk (imports of these will 404): ${missingEntryPoints.map(([specifier, target]) => `${specifier} -> ${target}`).join("; ")}`);
  }
  const transformCache = new Map<string, { mtimeMs: number; output: string | Buffer }>();
  const transformed = (file: string, produce: () => string | Buffer): string | Buffer => {
    const mtimeMs = statSync(file).mtimeMs;
    const hit = transformCache.get(file);
    if (hit && hit.mtimeMs === mtimeMs) return hit.output;
    const output = produce();
    transformCache.set(file, { mtimeMs, output });
    return output;
  };
  // Harness entries pull ~1,300 modules through per-request transpile; bundling
  // the entry once drops the whole graph to a single module (~1s esbuild vs
  // minutes on contended CI). Falls back to per-module serving if bundling
  // ever fails so the path is strictly non-worse.
  const bundleCache = new Map<string, { mtimeMs: number; output: string }>();
  const auraResolvePlugin: esbuild.Plugin = {
    name: "aura3d-dev-server-resolve",
    setup: (build) => {
      // Vite `import x from "./font.woff2?url"`: the default export is the asset's served URL path (apps self-host
      // their licensed fonts this way). Without this, esbuild has no loader for the asset and the route never boots.
      build.onResolve({ filter: /\?url$/ }, (args) => {
        const file = resolve(args.resolveDir, args.path.slice(0, -"?url".length));
        return existsSync(file) ? { path: file, namespace: "aura3d-asset-url" } : undefined;
      });
      build.onLoad({ filter: /.*/, namespace: "aura3d-asset-url" }, (args) => ({
        loader: "js",
        contents: `export default ${JSON.stringify(moduleUrlPath(root, args.path))};`,
      }));
      // The editor's export runtime is a Vite virtual module (vite.config.ts); serve the same self-contained IIFE
      // source string from esbuild so the editor boots under this dev server.
      build.onResolve({ filter: /^virtual:aura3d-editor-export-runtime$/ }, (args) => ({ path: args.path, namespace: "aura3d-editor-export" }));
      build.onLoad({ filter: /.*/, namespace: "aura3d-editor-export" }, async () => {
        const exportBundle = await esbuild.build({
          entryPoints: [resolve(root, "apps/editor/src/export/exportRuntimeEntry.ts")],
          bundle: true, format: "iife", globalName: "Aura3DExport", platform: "browser", write: false, logLevel: "silent",
          plugins: [auraResolvePlugin],
        });
        return { loader: "js", contents: `export default ${JSON.stringify(exportBundle.outputFiles[0]!.text)};`, resolveDir: root };
      });
      const candidateResolveProbe = {};
      build.onResolve({ filter: /.*/ }, async (args) => {
        if (args.pluginData === candidateResolveProbe) return undefined;
        if (args.path.startsWith("node:")) {
          // Node builtins appear inside dormant dynamic imports in deps
          // (e.g. @gltf-transform node helpers); keep them lazy like the
          // per-module path does — they 404 only if ever executed.
          return { path: args.path, external: true };
        }
        if (externalCandidate && args.path.startsWith("@aura3d/")) {
          const target = packageTarget(args.path);
          const file = target && (isInstalledUrl(target) || isWorkspaceOnlyPackage(args.path)) ? mappedFile(root, target) : undefined;
          return file && existsSync(file) ? { path: file } : {
            errors: [{ text: `Installed candidate export is unavailable: ${args.path}` }],
          };
        }
        if (externalCandidate && args.importer && isWithin(externalCandidate.modules, resolve(args.importer))) {
          // Resolve dependencies from the restored installation, never from the
          // workspace or an ancestor node_modules. The result is checked after
          // realpath resolution, including for relative imports and symlinks.
          const result = await build.resolve(args.path, {
            importer: args.importer, namespace: args.namespace, resolveDir: args.resolveDir,
            kind: args.kind, with: args.with, pluginData: candidateResolveProbe,
          });
          if (result.errors.length) {
            // Optional peers of the packed engine (physics-rapier, navigation-recast) are not part of the
            // restored consumer, which installs only what the candidate declares. Serve the repository's
            // pinned third-party copy instead of failing the whole harness bundle; Aura3D code is never
            // served from the workspace through this path.
            const peer = OPTIONAL_PEER_SPECIFIERS.some((name) => args.path === name || args.path.startsWith(`${name}/`));
            const mapped = peer ? packageTarget(args.path) : undefined;
            const peerFile = mapped && !isInstalledUrl(mapped) ? mappedFile(root, mapped) : undefined;
            if (peerFile && existsSync(peerFile)) return { path: peerFile };
            return { errors: result.errors, warnings: result.warnings };
          }
          let real: string | undefined;
          try { real = result.namespace === "file" && !result.external ? realpathSync(result.path) : undefined; }
          catch { /* a missing dependency is not an installed candidate file */ }
          if (!real || !isWithin(externalCandidate.modules, real)) {
            return { errors: [{ text: `Installed candidate dependency escapes its isolated node_modules: ${args.path}` }] };
          }
          return { path: real, namespace: "file", suffix: result.suffix, sideEffects: result.sideEffects, warnings: result.warnings };
        }
        // Entry points and already-absolute filesystem paths pass through.
        if (resolve(args.path) === args.path && existsSync(args.path)) {
          return { path: args.path };
        }
        if (!args.path.startsWith(".") && !args.path.startsWith("/")) {
          const mapped = packageTarget(args.path);
          if (mapped === undefined) {
            // Unmapped bare specifier: package.json/node_modules resolution
            // (deps like `three`), or a static-only miss — let esbuild decide.
            return undefined;
          }
          const file = mappedFile(root, mapped);
          // Hoist layout varies across environments (e.g. which ktx-parse
          // version lands at .pnpm/node_modules); a missing mapped file must
          // defer to esbuild's own node resolution — emitting the specifier
          // external would deliver a bare import the browser cannot resolve.
          if (!file || !existsSync(file)) return undefined;
          return { path: file };
        }
        const canonical = resolveModuleSpecifier(args.importer, root, args.path);
        const file = canonical && mappedFile(root, canonical);
        return file ? { path: file } : undefined;
      });
      build.onLoad({ filter: /\.css$/ }, (args) => ({
        loader: "js",
        contents: `(() => { const style = document.createElement("style"); style.setAttribute("data-aura3d-dev-css", ${JSON.stringify(relative(root, args.path))}); style.textContent = ${JSON.stringify(readFileSync(args.path, "utf8"))}; document.head.appendChild(style); })();`,
      }));
      // A bundle gives every module the entry's import.meta.url, so an example mounted by an app
      // (`new URL("./assets/meshy/x.glb", import.meta.url)` in examples/ninja-runner-port) resolved under
      // /apps/<app>/src/ and 404ed. Vite resolves those URLs against the module's own file; do the same here.
      build.onLoad({ filter: /\.(m?js|tsx?)$/ }, (args) => {
        const candidatePackage = installedPackageForFile(args.path);
        if (args.path.includes(`${sep}node_modules${sep}`) && !candidatePackage) return undefined;
        const source = readFileSync(args.path, "utf8");
        if (!source.includes("import.meta.url")) return undefined;
        if (candidatePackage && !installedUrlForFile(args.path)) {
          throw new Error("Installed module with import.meta.url is not an admitted packed file.");
        }
        return {
          contents: rewriteImportMetaUrl(source, moduleUrlPath(root, args.path)),
          loader: args.path.endsWith(".tsx") ? "tsx" : args.path.endsWith(".ts") ? "ts" : "js",
          resolveDir: dirname(args.path),
        };
      });
    },
  };
  const bundleForBrowser = async (file: string): Promise<string | undefined> => {
    const mtimeMs = statSync(file).mtimeMs;
    const hit = bundleCache.get(file);
    if (hit && hit.mtimeMs === mtimeMs) return hit.output;
    try {
      const result = await esbuild.build({
        entryPoints: [file],
        bundle: true,
        format: "esm",
        platform: "browser",
        write: false,
        logLevel: "silent",
        // §15 test-build gate: browser harness bundles are test builds, so
        // the PRD-09 `__AURA3D_GAME_TEST__` hook installs here while staying
        // absent from production (vite MODE="production") bundles.
        define: {
          "import.meta.env.MODE": '"test"',
        },
        plugins: [auraResolvePlugin],
        loader: {
          ".glsl": "text",
          ".glb": "dataurl",
          ".png": "dataurl",
          ".jpg": "dataurl",
          ".jpeg": "dataurl",
          ".webp": "dataurl",
          ".hdr": "dataurl",
          ".exr": "dataurl",
          ".bin": "dataurl",
          ".wasm": "dataurl",
          ".mp3": "dataurl",
          ".wav": "dataurl",
          ".ogg": "dataurl",
        },
      });
      const output = result.outputFiles[0]?.text;
      if (!output) return undefined;
      // esbuild can emit `await init_x()` inside a non-async __esm wrapper when a module with top-level await
      // (physics-rapier) sits in an import cycle; the browser then fails with "Unexpected reserved word" and the
      // route never mounts. Native ESM handles that graph, so a bundle that does not parse falls back per-module.
      try {
        esbuild.transformSync(output, { loader: "js", format: "esm", logLevel: "silent" });
      } catch (error) {
        console.log("[example-dev-server] esbuild bundle does not parse for", file, "- falling back to per-module transform:", String((error as { errors?: Array<{ text: string }> }).errors?.[0]?.text ?? error).slice(0, 200));
        return undefined;
      }
      bundleCache.set(file, { mtimeMs, output });
      return output;
    } catch (error) {
      console.log("[example-dev-server] esbuild bundle failed for", file, "- falling back to per-module transform:", String(error).slice(0, 300));
      return undefined;
    }
  };
  const server = createServer((request, response) => {
    void handleRequest(request, response);
  });
  const handleRequest = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (isBrowserIconProbe(url.pathname)) {
        response.writeHead(204, { "cache-control": "no-store" });
        response.end();
        return;
      }
      const pathname = decodeURIComponent(url.pathname);
      // The reserved mount is never passed to the repository resolver, even if
      // no candidate is configured or the requested candidate file is denied.
      const installedRequest = isInstalledUrl(pathname);
      const redirect = installedRequest ? undefined : resolveDirectoryModuleRedirect(root, pathname);
      if (redirect) {
        response.writeHead(302, { location: redirect });
        response.end();
        return;
      }
      const file = installedRequest ? resolveInstalledRequest(pathname) : resolveRequest(root, pathname);

      if (!file) {
        response.writeHead(404, { "content-type": "text/plain" });
        response.end("Not found");
        return;
      }

      // Canonicalize module URLs onto the real file path. Importers reach the
      // same `.ts` file via `x`, `x.js`, and `x.ts` specifiers (extensionless
      // relative imports are the repo convention); served verbatim those are
      // three distinct module instances, which breaks singleton registries
      // (REGISTRY_DUPLICATE). Redirecting non-canonical specifiers makes the
      // browser cache them as one module — the same resolution vite/TS apply.
      const canonical = moduleUrlPath(root, file);
      if (file.endsWith(".ts") && normalize(pathname).replace(/\\/g, "/") !== decodeURIComponent(canonical)) {
        response.writeHead(302, { location: canonical });
        response.end();
        return;
      }

      if (file.endsWith(".ts")) {
        // Entries under tests/browser (and the PRD-09 packages/game/fixtures/*
        // page entries, which the game-shell specs load as routes, and apps/*
        // showcase entries embedded by marketing/demo-stage iframes) are
        // page-level module scripts: serve them as a single esbuild bundle so
        // the browser evaluates one module instead of ~1,300 transformed files.
        const servedPath = normalize(pathname).replace(/\\/g, "/");
        const bundled = servedPath.startsWith("/tests/browser/") || /^\/packages\/game\/fixtures\/[^/]+\/src\/main\.ts$/.test(servedPath) || /^\/apps\/[^/]+\/src\/main\.ts$/.test(servedPath)
          ? await bundleForBrowser(file)
          : undefined;
        const output = bundled ?? transformed(file, () => transpileForBrowser(readFileSync(file, "utf8"), file, root));
        response.writeHead(200, { "content-type": "application/javascript; charset=utf-8" });
        response.end(output);
        return;
      }

      // Per-module path of the same Vite `?url` import: answer the module request with the asset's URL.
      if (url.searchParams.has("url") && !/\.(m?js|tsx?)$/.test(file)) {
        response.writeHead(200, { "content-type": "application/javascript; charset=utf-8" });
        response.end(`export default ${JSON.stringify(pathname)};`);
        return;
      }

      const content = file.endsWith(".js") || file.endsWith(".mjs")
        ? transformed(file, () => rewriteModuleSpecifiers(rewritePackageImports(readFileSync(file, "utf8"), file), file, root))
        : readFileSync(file);
      response.writeHead(200, { "content-type": contentType(file) });
      response.end(content);
    } catch (error) {
      response.writeHead(500, { "content-type": "text/plain" });
      response.end(error instanceof Error ? error.stack : String(error));
    }
  };

  await listen(server);
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Example dev server did not bind a TCP port.");
  }

  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => close(server),
  };
}

function resolveDirectoryModuleRedirect(root: string, pathname: string): string | undefined {
  const normalizedPath = normalize(contextualPathForLegacyPath(pathname)).replace(/^(\.\.[/\\])+/, "");
  if (normalizedPath === "/" || normalizedPath === "." || extname(normalizedPath) || pathname.endsWith("/")) {
    return undefined;
  }
  const directory = resolve(join(root, normalizedPath));
  if (!directory.startsWith(resolve(root))) {
    return undefined;
  }
  if (existsSync(join(directory, "index.ts")) || existsSync(join(directory, "index.js"))) {
    return `${pathname}/index.js`;
  }
  return undefined;
}

let appPublicDirsCache: string[] | undefined;
function appPublicDirs(root: string): string[] {
  if (appPublicDirsCache === undefined) {
    const appsDir = join(root, "apps");
    appPublicDirsCache = existsSync(appsDir)
      ? readdirSync(appsDir, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => join(appsDir, entry.name, "public"))
          .filter((dir) => existsSync(dir))
          .sort()
      : [];
  }
  return appPublicDirsCache;
}

function resolveRequest(root: string, pathname: string): string | undefined {
  const normalizedPath = normalize(contextualPathForLegacyPath(pathname)).replace(/^(\.\.[/\\])+/, "");
  const candidates: string[] = [];
  const loadersBrowserMappedPath = browserMappedLoadersGLPath(normalizedPath);
  const legacyGameSliceTemplatePath = gameSliceTemplatePath(normalizedPath);

  if (normalizedPath === "/" || normalizedPath === ".") {
    candidates.push(join(root, "examples", "00-basic-triangle", "index.html"));
    // examples/00-basic-triangle was removed; the repository-root index.html is a meta-refresh to /marketing/,
    // which navigates away under page.setContent/evaluate. Serve the empty same-origin harness page at "/".
    candidates.push(join(root, "tests", "browser", "parity-audio-harness.html"));
  } else if (normalizedPath.startsWith("aura-decoders/") || normalizedPath.startsWith("/aura-decoders/")) {
    const decoderRel = normalizedPath.replace(/^[/\\]?aura-decoders[/\\]/, "");
    candidates.push(join(root, "packages", "assets", "vendor", "decoders", decoderRel));
    if (decoderRel === "basis/ktx2.worker.js") {
      candidates.push(join(root, "packages", "assets", "dist", "workers", "ktx2.worker.js"));
      candidates.push(join(root, "packages", "assets", "src", "workers", "ktx2.worker.ts"));
    }
  } else if (normalizedPath.startsWith("assets/draco/") || normalizedPath.startsWith("/assets/draco/")) {
    const decoderFile = normalizedPath.replace(/^[/\\]?assets[/\\]draco[/\\]/, "");
    candidates.push(join(root, "marketing", "public", "assets", "draco", decoderFile));
    candidates.push(join(root, "node_modules", "draco3d", decoderFile));
  } else if (normalizedPath.startsWith("aura-assets/") || normalizedPath.startsWith("/aura-assets/")) {
    candidates.push(join(root, "public", normalizedPath.replace(/^[/\\]?/, "")));
    candidates.push(join(root, "templates", "product-viewer", "public", normalizedPath.replace(/^[/\\]?/, "")));
    candidates.push(join(root, "packages", "create-aura3d", "templates", "product-viewer", "public", normalizedPath.replace(/^[/\\]?/, "")));
    candidates.push(join(root, "templates", "mini-game", "public", normalizedPath.replace(/^[/\\]?/, "")));
    candidates.push(join(root, "packages", "create-aura3d", "templates", "mini-game", "public", normalizedPath.replace(/^[/\\]?/, "")));
    // Route-local typed assets (apps/<app>/public/aura-assets/, e.g. Iron Crown, Pip's Big Leap, Bunker Zero, Cross Hop):
    // the deploy flattens every app's public tree onto the origin root, so the harness must serve them too.
    for (const appPublic of appPublicDirs(root)) candidates.push(join(appPublic, normalizedPath.replace(/^[/\\]?/, "")));
  } else if (loadersBrowserMappedPath) {
    candidates.push(join(root, loadersBrowserMappedPath));
  } else if (legacyGameSliceTemplatePath) {
    // A real evidence route takes precedence when it exists. The template mapping
    // is only a compatibility fallback for checkouts that do not carry the
    // historical example tree.
    candidates.push(join(root, normalizedPath));
    candidates.push(join(root, legacyGameSliceTemplatePath));
  } else {
    candidates.push(join(root, normalizedPath));
    // Vite serves repository public/ files from the origin root. Mirror that
    // contract so route assets such as /favicon.svg do not become harness-only
    // 404s while production and preview builds resolve them correctly.
    candidates.push(join(root, "public", normalizedPath.replace(/^[/\\]?/, "")));
    // App-level public/ dirs merge at the origin root the same way — the
    // deploy output (.vercel/output/static/) flattens every app's public
    // tree (e.g. /toptennis/* from apps/showcase-top-tennis/public/toptennis).
    // Scan lazily so apps added later still resolve without a restart.
    for (const appPublic of appPublicDirs(root)) {
      candidates.push(join(appPublic, normalizedPath.replace(/^[/\\]?/, "")));
    }
  }

  if (!extname(normalizedPath)) {
    candidates.push(join(root, `${normalizedPath}.ts`));
    candidates.push(join(root, `${normalizedPath}.js`));
    candidates.push(join(root, normalizedPath, "index.ts"));
    candidates.push(join(root, normalizedPath, "index.js"));
    candidates.push(join(root, normalizedPath, "index.html"));
  }

  if (normalizedPath.endsWith(".js")) {
    candidates.push(join(root, normalizedPath.replace(/\.js$/, ".ts")));
  }
  // Vite/TS resolve `foo.glsl`-style specifiers onto sibling `foo.glsl.ts`
  // modules (shader and lane sources follow that convention). Mirror it so
  // importing the full "." union in a browser harness finds them.
  if (extname(normalizedPath)) {
    candidates.push(join(root, `${normalizedPath}.ts`));
  }

  // Dotted-suffix sources resolve the same way TypeScript does: a specifier
  // like `./chunks/common.glsl` or `./diagnosticOnly.prd07` maps onto the
  // `.ts` file of the same dotted name (`common.glsl.ts`,
  // `diagnosticOnly.prd07.ts`). Only applies when the literal file is absent.
  if (extname(normalizedPath) && !normalizedPath.endsWith(".ts") && !normalizedPath.endsWith(".js") && !normalizedPath.endsWith(".mjs")) {
    candidates.push(join(root, `${normalizedPath}.ts`));
  }

  const loadersVersioned = normalizedPath.match(/^[/\\]node_modules[/\\]@loaders\.gl[/\\]([^/\\]+)@[^/\\]+([/\\].*)$/);
  if (loadersVersioned) {
    candidates.push(join(root, "node_modules", "@loaders.gl", loadersVersioned[1]!, loadersVersioned[2]!));
  }

  for (const candidate of candidates) {
    const resolved = resolve(candidate);
    if (!resolved.startsWith(resolve(root))) {
      continue;
    }
    if (existsSync(resolved) && statSync(resolved).isFile()) {
      return resolved;
    }
  }

  return undefined;
}

function gameSliceTemplatePath(pathname: string): string | undefined {
  const normalized = pathname.replace(/\\/g, "/").replace(/^\//, "");
  if (normalized === "examples/game-slice") {
    return "templates/game-slice/index.html";
  }
  if (normalized.startsWith("examples/game-slice/")) {
    return normalized.replace(/^examples\/game-slice/, "templates/game-slice");
  }
  return undefined;
}

function isBrowserIconProbe(pathname: string): boolean {
  return pathname === "/favicon.ico" || /^\/apple-touch-icon(?:-\d+x\d+)?(?:-precomposed)?\.png$/.test(pathname);
}

function browserMappedLoadersGLPath(pathname: string): string | undefined {
  if (!pathname.includes("@loaders.gl")) {
    return undefined;
  }
  if (pathname.includes("worker-utils") && pathname.endsWith("/dist/lib/node/worker_threads.js")) {
    return pathname.replace(/[/\\]dist[/\\]lib[/\\]node[/\\]worker_threads\.js$/, "/dist/lib/node/worker_threads-browser.js");
  }
  if (pathname.includes("worker-utils") && pathname.endsWith("/dist/lib/process-utils/child-process-proxy.js")) {
    return pathname.replace(/[/\\]dist[/\\]lib[/\\]process-utils[/\\]child-process-proxy\.js$/, "/dist/lib/process-utils/child-process-proxy.browser.js");
  }
  if (pathname.includes("loader-utils") && pathname.endsWith("/dist/lib/node/stream.js")) {
    return pathname.replace(/[/\\]dist[/\\]lib[/\\]node[/\\]stream\.js$/, "/dist/lib/node/stream.browser.js");
  }
  if (pathname.includes("loader-utils") && pathname.endsWith("/dist/lib/node/buffer.js")) {
    return pathname.replace(/[/\\]dist[/\\]lib[/\\]node[/\\]buffer\.js$/, "/dist/lib/node/buffer.browser.js");
  }
  return undefined;
}

function transpileForBrowser(source: string, fileName: string, rootDir: string): string {
  const withCssInjected = source.replace(/^\s*import\s+["']([^"']+\.css)["'];?\s*$/gm, (_statement, specifier: string) => {
    const cssPath = specifier.startsWith(".")
      ? resolve(dirname(fileName), specifier)
      : resolve(process.cwd(), specifier.replace(/^\//, ""));
    const candidatePackage = installedPackageForFile(fileName);
    if (!existsSync(cssPath) || (candidatePackage && !admittedInstalledFile(candidatePackage, cssPath))) {
      throw new Error(`CSS import not found: ${specifier} from ${fileName}`);
    }
    return `(() => { const style = document.createElement("style"); style.setAttribute("data-aura3d-dev-css", ${JSON.stringify(relative(process.cwd(), cssPath))}); style.textContent = ${JSON.stringify(readFileSync(cssPath, "utf8"))}; document.head.appendChild(style); })();`;
  });
  const rewritten = rewriteModuleSpecifiers(rewritePackageImports(withCssInjected, fileName), fileName, rootDir);
  const result = ts.transpileModule(rewritten, {
    fileName,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      isolatedModules: true,
      sourceMap: false,
      inlineSourceMap: false,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove,
    },
  });

  return result.outputText;
}

function rewritePackageImports(source: string, fileName: string): string {
  if (externalCandidate) {
    // Locate real module specifiers with the TypeScript scanner. A text regex also matches
    // `from "..."` inside comments, template literals and prose of packed dist files, which
    // made the server reject (or rewrite) code that is not an import at all.
    const found = ts.preProcessFile(source, true, true).importedFiles
      .map((reference) => ({ specifier: reference.fileName, start: reference.pos + 1 }))
      .filter((reference) => source.startsWith(reference.specifier, reference.start))
      .sort((left, right) => left.start - right.start);
    let output = "";
    let cursor = 0;
    for (const { specifier, start } of found) {
      if (start < cursor) continue;
      const target = packageTarget(specifier);
      // A third-party dependency of a packed file is served from this server's pinned dependency map
      // (the same versions the lockfile installs); an unmapped one still needs an isolated bundle.
      if (target === undefined && installedPackageForFile(fileName) && !specifier.startsWith(".") && !specifier.startsWith("/") &&
          !specifier.startsWith("@aura3d/") && !specifier.startsWith("node:")) {
        throw new Error(`Installed dependency requires an isolated bundle: ${specifier}`);
      }
      if (specifier.startsWith("@aura3d/") && target === undefined) {
        throw new Error(`Installed candidate export is unavailable: ${specifier}`);
      }
      if (target === undefined) continue;
      output += source.slice(cursor, start) + target;
      cursor = start + specifier.length;
    }
    return output + source.slice(cursor);
  }
  return mapModuleSpecifiers(source, (specifier) => packageEntryPoints.get(specifier));
}

/**
 * Rewrites relative (`./x`, `../x`) and root-absolute (`/x`) specifiers to the
 * canonical root-relative URL of the file they resolve to — `../a/b`,
 * `../a/b.js`, and `../a/b.ts` all become `/…/a/b.ts`. The browser keys its
 * module map on the requested specifier URL, so without this the same file is
 * evaluated once per specifier shape and singleton registries throw
 * REGISTRY_DUPLICATE. Mirrors `resolveRequest`'s candidate order (`.ts`,
 * `/index.ts`, `.js`→`.ts`, `foo.glsl`→`foo.glsl.ts`).
 */
function rewriteModuleSpecifiers(source: string, fileName: string, root: string): string {
  const resolveSpecifier = (specifier: string): string | undefined => {
    const resolved = resolveModuleSpecifier(fileName, root, specifier);
    return resolved;
  };
  return mapModuleSpecifiers(source, (specifier) => (/^(?:\.{1,2}\/|\/)/.test(specifier) ? resolveSpecifier(specifier) : undefined));
}

function resolveModuleSpecifier(fromFile: string, root: string, specifier: string): string | undefined {
  if (isInstalledUrl(specifier)) {
    const file = resolveInstalledRequest(decodeURIComponent(specifier));
    return file ? installedUrlForFile(file) : undefined;
  }
  const pkg = installedPackageForFile(fromFile);
  if (pkg) {
    // `/node_modules/...` is only ever produced by rewritePackageImports from the pinned third-party map.
    if (specifier.startsWith("/node_modules/")) return undefined;
    if (specifier.startsWith("/")) throw new Error("Installed candidate cannot import a repository-absolute module.");
    const base = resolve(dirname(fromFile), specifier);
    if (!isWithin(pkg.directory, base)) throw new Error("Installed candidate module escapes its package.");
    const candidates = extname(base) ? [base] : [base, `${base}.js`, `${base}.mjs`, join(base, "index.js"), join(base, "index.mjs")];
    for (const candidate of candidates) {
      const file = admittedInstalledFile(pkg, candidate);
      if (file) return installedUrlForFile(file);
    }
    return undefined;
  }
  const base = specifier.startsWith("/")
    ? join(root, specifier)
    : resolve(dirname(fromFile), specifier);
  const candidates = [
    base,
    ...(base.endsWith(".js") ? [base.replace(/\.js$/, ".ts")] : []),
    `${base}.ts`,
    `${base}.js`,
    join(base, "index.ts"),
    join(base, "index.js"),
  ];
  for (const candidate of candidates) {
    const resolved = resolve(candidate);
    if (!resolved.startsWith(resolve(root))) continue;
    if (existsSync(resolved) && statSync(resolved).isFile()) {
      return `/${relative(resolve(root), resolved).replace(/\\/g, "/")}`;
    }
  }
  return undefined;
}

function contentType(file: string): string {
  switch (extname(file)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
    case ".mjs":
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml; charset=utf-8";
    case ".glb":
      return "model/gltf-binary";
    case ".gltf":
      return "model/gltf+json; charset=utf-8";
    case ".ktx2":
      return "image/ktx2";
    case ".wasm":
      return "application/wasm";
    case ".bin":
      return "application/octet-stream";
    case ".css":
      return "text/css; charset=utf-8";
    case ".woff2":
      return "font/woff2";
    case ".woff":
      return "font/woff";
    case ".hdr":
    case ".exr":
      return "application/octet-stream";
    case ".mp3":
      return "audio/mpeg";
    default:
      return "text/plain; charset=utf-8";
  }
}

function listen(server: Server): Promise<void> {
  return new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolveListen();
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolveClose, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolveClose();
      }
    });
  });
}
