import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

type ExportTarget = string | { readonly browser?: ExportTarget; readonly import?: ExportTarget; readonly default?: ExportTarget };

export interface InstalledPackageAlias {
  readonly find: string;
  readonly replacement: string;
}

export function installedAuraPackageAliases(): readonly InstalledPackageAlias[] {
  const root = process.env.A3D_INSTALLED_PACKAGE_ROOT;
  if (!root) return [];
  const scopeDirectory = resolve(root, "node_modules/@aura3d");
  if (!existsSync(scopeDirectory)) {
    throw new Error(`A3D_INSTALLED_PACKAGE_ROOT has no node_modules/@aura3d directory: ${scopeDirectory}`);
  }
  const aliases: InstalledPackageAlias[] = [];
  for (const packageDirectoryName of readdirSync(scopeDirectory).sort()) {
    const packageDirectory = resolve(scopeDirectory, packageDirectoryName);
    const manifestPath = resolve(packageDirectory, "package.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      readonly name?: string;
      readonly main?: string;
      readonly exports?: ExportTarget | Record<string, ExportTarget>;
    };
    if (!manifest.name) continue;
    const exportsMap = normalizeExports(manifest.exports, manifest.main);
    for (const [subpath, target] of Object.entries(exportsMap)) {
      const selected = selectTarget(target);
      if (!selected) continue;
      aliases.push({
        find: subpath === "." ? manifest.name : `${manifest.name}/${subpath.slice(2)}`,
        replacement: resolve(packageDirectory, selected)
      });
    }
  }
  return aliases.sort((left, right) => right.find.length - left.find.length);
}

function normalizeExports(
  exportsValue: ExportTarget | Record<string, ExportTarget> | undefined,
  main: string | undefined
): Record<string, ExportTarget> {
  if (typeof exportsValue === "string" || isConditionalTarget(exportsValue)) return { ".": exportsValue };
  if (exportsValue && Object.keys(exportsValue).some((key) => key.startsWith("."))) {
    return exportsValue as Record<string, ExportTarget>;
  }
  return main ? { ".": main } : {};
}

function isConditionalTarget(value: unknown): value is Exclude<ExportTarget, string> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value as Record<string, unknown>).some((key) => key === "browser" || key === "import" || key === "default"));
}

function selectTarget(target: ExportTarget): string | undefined {
  if (typeof target === "string") return target;
  return target.browser ? selectTarget(target.browser)
    : target.import ? selectTarget(target.import)
      : target.default ? selectTarget(target.default)
        : undefined;
}
