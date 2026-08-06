/**
 * WS-3.6b — ESLint enforcement of the WS-3.6a dependency direction.
 *
 * `pnpm check:package-graph` enforces layering against the measured dependency graph, but it runs
 * as a release gate over whole packages. This plugin enforces the same rule at the import site, so
 * an upward dependency fails the moment it is written rather than at release time.
 *
 * Two rules:
 *
 *   no-upward-package-import — a file under `packages/<a>/src` may not import a package whose tier
 *     is higher than `<a>`'s. Subpath specifiers resolve through `tsconfig.base.json` `paths`,
 *     because `@aura3d/engine/rendering` aliases into `packages/rendering`, NOT `packages/engine`.
 *     Resolving by prefix would report violations that do not exist and miss ones that do.
 *
 *   no-internal-deep-import — `@aura3d/<pkg>/src/...` is never importable. This is the rule the
 *     old config claimed to enforce; it never ran because the config had no parser for `.ts`.
 *
 * Tiers come from `tools/package-tiers.ts` — the same module the graph gate reads. Neither gate
 * carries its own copy.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");

/** Parse the tier map out of the canonical TS module without needing a TS loader in ESLint. */
function loadTiers() {
  const source = readFileSync(resolve(repoRoot, "tools/package-tiers.ts"), "utf8");
  const body = source.slice(
    source.indexOf("export const PACKAGE_TIERS"),
    source.indexOf("};", source.indexOf("export const PACKAGE_TIERS"))
  );
  const tiers = {};
  for (const match of body.matchAll(/^\s*"?([a-z0-9-]+)"?:\s*(\d+),?\s*$/gm)) {
    tiers[match[1]] = Number(match[2]);
  }
  if (Object.keys(tiers).length === 0) throw new Error("aura3d-boundaries: parsed zero tiers");
  return tiers;
}

/** Map every `@aura3d/*` alias in tsconfig.base.json to the package directory it actually resolves to. */
function loadAliasOwners() {
  const raw = readFileSync(resolve(repoRoot, "tsconfig.base.json"), "utf8").replace(/^\s*\/\/.*$/gm, "");
  const paths = JSON.parse(raw).compilerOptions.paths ?? {};
  const owners = new Map();
  for (const [alias, targets] of Object.entries(paths)) {
    const match = /^packages\/([^/]+)\//.exec(targets[0] ?? "");
    if (match) owners.set(alias, match[1]);
  }
  return owners;
}

const TIERS = loadTiers();
const ALIAS_OWNERS = loadAliasOwners();

/** Which package does this source file belong to? `null` for anything outside `packages/*`. */
function owningPackage(filename) {
  const rel = resolve(filename).startsWith(repoRoot + sep) ? resolve(filename).slice(repoRoot.length + 1) : filename;
  const match = new RegExp(`^packages\\${sep}([^\\${sep}]+)\\${sep}`).exec(rel);
  return match ? match[1] : null;
}

/**
 * Which package does this specifier resolve to? Alias-first, never by prefix.
 *
 * Returns `null` when the specifier cannot be attributed to a package in the tier map. Callers must
 * report that rather than skipping it: an unattributable `@aura3d/*` import is either a typo or a
 * package missing from `tsconfig.base.json`, and in both cases its direction is unknown. Silently
 * passing unknowns is how the previous config enforced nothing.
 */
function resolveTarget(specifier) {
  if (!specifier.startsWith("@aura3d/")) return null;
  const viaAlias = ALIAS_OWNERS.get(specifier);
  if (viaAlias) return viaAlias;
  const bare = /^@aura3d\/([^/]+)$/.exec(specifier);
  if (bare && TIERS[bare[1]] !== undefined) return bare[1];
  return null;
}

const noUpwardPackageImport = {
  meta: {
    type: "problem",
    docs: { description: "packages may not import a higher-tier package (WS-3.6a dependency direction)" },
    schema: [],
    messages: {
      upward:
        "{{from}} (tier {{fromTier}}) may not import {{to}} (tier {{toTier}}) — dependencies point down only. See docs/architecture/package-ownership.md.",
      unresolved:
        "'{{specifier}}' cannot be attributed to a package with a known tier. Add it to tsconfig.base.json paths and tools/package-tiers.ts so dependency direction can be checked."
    }
  },
  create(context) {
    const from = owningPackage(context.filename ?? context.getFilename());
    if (from === null) return {};
    const fromTier = TIERS[from];
    if (fromTier === undefined) return {};

    const check = (node, specifier) => {
      if (typeof specifier !== "string" || !specifier.startsWith("@aura3d/")) return;
      const to = resolveTarget(specifier);
      if (to === null) {
        context.report({ node, messageId: "unresolved", data: { specifier } });
        return;
      }
      if (to === from) return;
      const toTier = TIERS[to];
      if (toTier === undefined) {
        context.report({ node, messageId: "unresolved", data: { specifier } });
        return;
      }
      if (toTier > fromTier) {
        context.report({ node, messageId: "upward", data: { from, to, fromTier, toTier } });
      }
    };

    return {
      ImportDeclaration: (node) => check(node.source, node.source.value),
      ExportNamedDeclaration: (node) => node.source && check(node.source, node.source.value),
      ExportAllDeclaration: (node) => node.source && check(node.source, node.source.value),
      ImportExpression: (node) => node.source?.type === "Literal" && check(node.source, node.source.value)
    };
  }
};

const noInternalDeepImport = {
  meta: {
    type: "problem",
    docs: { description: "another package's src/ is never importable; use its public entry point" },
    schema: [],
    messages: {
      deep: "'{{specifier}}' reaches into another package's source. Import its package entry point instead."
    }
  },
  create(context) {
    const own = owningPackage(context.filename ?? context.getFilename());
    const check = (node, specifier) => {
      if (typeof specifier !== "string") return;
      const match = /^@aura3d\/([^/]+)\/src\//.exec(specifier);
      if (!match) return;
      if (own !== null && match[1] === own) return;
      context.report({ node, messageId: "deep", data: { specifier } });
    };
    return {
      ImportDeclaration: (node) => check(node.source, node.source.value),
      ExportNamedDeclaration: (node) => node.source && check(node.source, node.source.value),
      ExportAllDeclaration: (node) => node.source && check(node.source, node.source.value),
      ImportExpression: (node) => node.source?.type === "Literal" && check(node.source, node.source.value)
    };
  }
};

export default {
  meta: { name: "eslint-plugin-aura3d-boundaries", version: "1.6.0" },
  rules: {
    "no-upward-package-import": noUpwardPackageImport,
    "no-internal-deep-import": noInternalDeepImport
  }
};
