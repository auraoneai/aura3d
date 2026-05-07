import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

export interface DocsVersionAlignmentReport {
  readonly ok: boolean;
  readonly version: string;
  readonly checkedFiles: readonly string[];
  readonly linkedPaths: readonly string[];
  readonly violations: readonly string[];
}

interface PackageApi {
  readonly packageName: string;
  readonly version: string;
  readonly packagePath: string;
  readonly entrypointPath: string;
}

const versionedDocs = [
  "CHANGELOG.md",
  "SECURITY.md",
  "SUPPORT.md",
  "CONTRIBUTING.md",
  "docs/claim-guidelines.md",
  "docs/compatibility.md",
  "docs/migration.md",
  "docs/release-checklist.md",
  "docs/release-process.md",
  "docs/site-map.md"
] as const;

const tutorialDocs = [
  "docs/tutorials/getting-started-real-scene.md",
  "docs/tutorials/product-configurator.md"
] as const;

const exampleDocs = [
  "docs/examples/product-demos.md"
] as const;

export function validateDocsVersionAlignment(root = process.cwd()): DocsVersionAlignmentReport {
  const rootPackage = JSON.parse(readText(root, "package.json")) as { readonly version?: string };
  const version = rootPackage.version ?? "";
  const violations: string[] = [];
  const checkedFiles = new Set<string>(["package.json"]);
  const linkedPaths = new Set<string>();

  if (!version) {
    violations.push("package.json is missing version.");
  }

  const publicPackages = collectPublicPackageApis(root);
  for (const pkg of publicPackages) {
    checkedFiles.add(`${pkg.packagePath}/package.json`);
    if (pkg.version !== version) {
      violations.push(`${pkg.packagePath}/package.json version ${pkg.version} does not match root version ${version}.`);
    }
  }

  checkedFiles.add("docs/api/public-api.md");
  const apiDocsText = readText(root, "docs/api/public-api.md");
  for (const pkg of publicPackages) {
    if (!apiDocsText.includes(`| \`${pkg.packageName}\` | \`${version}\` | \`${pkg.entrypointPath}\``)) {
      violations.push(`docs/api/public-api.md is not current for ${pkg.packageName} ${version}. Run pnpm verify:api-docs -- --write.`);
    }
  }

  for (const path of versionedDocs) {
    checkedFiles.add(path);
    const text = readText(root, path);
    if (!text.includes(`Version: ${version}`) && !(path === "CHANGELOG.md" && text.includes(`## ${version}`))) {
      violations.push(`${path} does not reference Version: ${version}.`);
    }
  }
  const changelog = readText(root, "CHANGELOG.md");
  if (!changelog.includes(`## ${version}`)) {
    violations.push(`CHANGELOG.md is missing section ## ${version}.`);
  }

  for (const path of [...tutorialDocs, ...exampleDocs, "docs/site-map.md"]) {
    checkedFiles.add(path);
    const text = readText(root, path);
    for (const linkedPath of extractMarkdownLinks(path, text)) {
      linkedPaths.add(linkedPath);
      if (!existsSync(join(root, linkedPath))) {
        violations.push(`${path} links missing path ${linkedPath}.`);
      }
    }
  }

  for (const path of tutorialDocs) {
    const text = readText(root, path);
    if (!/\/examples\/[a-z0-9-]+\/index\.html/.test(text)) {
      violations.push(`${path} does not link to a running example index.html path.`);
    }
    if (!text.includes("pnpm exec playwright test")) {
      violations.push(`${path} does not include a runnable Playwright verification command.`);
    }
  }

  return {
    ok: violations.length === 0,
    version,
    checkedFiles: [...checkedFiles].sort(),
    linkedPaths: [...linkedPaths].sort(),
    violations
  };
}

function collectPublicPackageApis(root: string): readonly PackageApi[] {
  const packagesRoot = join(root, "packages");
  return readdirSync(packagesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(packagesRoot, entry.name))
    .filter((packageDir) => existsSync(join(packageDir, "package.json")))
    .map((packageDir) => {
      const packageJson = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8")) as {
        readonly name?: string;
        readonly version?: string;
        readonly private?: boolean;
      };
      return { packageDir, packageJson };
    })
    .filter(({ packageJson }) => packageJson.private !== true)
    .map(({ packageDir, packageJson }) => {
      const packagePath = normalizePath(normalize(packageDir).replace(`${normalize(root)}/`, ""));
      return {
        packageName: packageJson.name ?? "",
        version: packageJson.version ?? "",
        packagePath,
        entrypointPath: `${packagePath}/src/index.ts`
      };
    })
    .sort((a, b) => a.packageName.localeCompare(b.packageName));
}

function extractMarkdownLinks(sourcePath: string, text: string): readonly string[] {
  const links: string[] = [];
  const baseDir = dirname(sourcePath);
  const pattern = /\[[^\]]+\]\(([^)#]+)(?:#[^)]+)?\)/g;
  for (const match of text.matchAll(pattern)) {
    const target = match[1]?.trim();
    if (!target || /^[a-z]+:\/\//i.test(target)) {
      continue;
    }
    links.push(normalizePath(normalize(join(baseDir, target))));
  }
  return links;
}

function readText(root: string, path: string): string {
  const absolute = join(root, path);
  if (!existsSync(absolute)) {
    throw new Error(`${path} is missing`);
  }
  return readFileSync(absolute, "utf8");
}

function normalizePath(path: string): string {
  return path.split("\\").join("/");
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const report = validateDocsVersionAlignment();
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}
