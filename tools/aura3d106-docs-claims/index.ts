import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface Aura3D109DocsClaimsReport {
  readonly schema: "aura3d109-docs-claims";
  readonly ok: boolean;
  readonly generatedAt: string;
  readonly currentVersion: string;
  readonly targetVersion: "1.0.9";
  readonly gates: readonly DocsClaimGate[];
  readonly evidencePaths: readonly string[];
  readonly blockers: readonly string[];
}

interface DocsClaimGate {
  readonly id: string;
  readonly ok: boolean;
  readonly summary: string;
  readonly evidencePaths: readonly string[];
  readonly blockers: readonly string[];
}

const defaultOutPath = "tests/reports/aura3d109/docs-claims.json";
const targetVersion = "1.0.9" as const;

export function createAura3D109DocsClaimsReport(root = process.cwd()): Aura3D109DocsClaimsReport {
  const currentVersion = readPackageVersion(root, "package.json");
  const gates = [
    packageVersionGate(root, currentVersion),
    currentReleaseBoundaryGate(root, currentVersion),
    marketingClaimGate(root, currentVersion),
    headerFitGate(root),
    forbiddenClaimsGate(root)
  ];
  const blockers = gates.flatMap((gate) => gate.blockers.map((blocker) => `${gate.id}: ${blocker}`));
  const evidencePaths = [...new Set(gates.flatMap((gate) => gate.evidencePaths))].sort();
  return {
    schema: "aura3d109-docs-claims",
    ok: blockers.length === 0,
    generatedAt: new Date().toISOString(),
    currentVersion,
    targetVersion,
    gates,
    evidencePaths,
    blockers
  };
}

export function writeAura3D109DocsClaimsReport(root: string, report: Aura3D109DocsClaimsReport, outPath = defaultOutPath): void {
  const absolute = join(root, outPath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`);
}

function packageVersionGate(root: string, currentVersion: string): DocsClaimGate {
  const packagePaths = [
    "package.json",
    "packages/engine/package.json",
    "packages/aura3d-cli/package.json",
    "packages/asset-index/package.json",
    "packages/create-aura3d/package.json"
  ];
  const evidencePaths = [
    ...packagePaths,
    "marketing/package.json"
  ];
  const blockers: string[] = [];
  for (const path of packagePaths) {
    const version = readPackageVersion(root, path);
    if (version !== currentVersion) blockers.push(`${path} version ${version} does not match root ${currentVersion}.`);
  }
  const marketing = JSON.parse(readText(root, "marketing/package.json")) as {
    readonly dependencies?: Record<string, string>;
  };
  if (marketing.dependencies?.["@aura3d/engine"] !== currentVersion) {
    blockers.push(`marketing/package.json depends on @aura3d/engine ${String(marketing.dependencies?.["@aura3d/engine"])} instead of ${currentVersion}.`);
  }
  return {
    id: "package-version-alignment",
    ok: blockers.length === 0,
    summary: blockers.length === 0
      ? `Root, public package, CLI, create-aura3d, and marketing @aura3d/engine dependency align at ${currentVersion}.`
      : "Package versions are not aligned.",
    evidencePaths,
    blockers
  };
}

function currentReleaseBoundaryGate(root: string, currentVersion: string): DocsClaimGate {
  const evidencePaths = ["README.md", "llms.txt", "docs/project/claim-guidelines.md", "docs/project/aura3d-109-release-gates.md"];
  const blockers: string[] = [];
  const required: readonly (readonly [string, readonly string[]])[] = [
    [
      "README.md",
      [
        `@aura3d/engine@${currentVersion}`,
        `Aura3D ${currentVersion} is a runtime foundation release, not a mature commercial game engine release.`,
        "The scoped 1.0.9 gates pass",
        "not yet a flagship-quality game"
      ]
    ],
    [
      "llms.txt",
      [
        "Aura3D 1.0.9 game-engine/showcase claim rules",
        "Treat 1.0.9 as a scoped runtime-foundation release",
        "Do not describe Aura3D as a mature commercial game engine",
        "Aura Clash Arena may be described as a development showcase"
      ]
    ],
    [
      "docs/project/claim-guidelines.md",
      [
        `The current \`${currentVersion}\` Aura3D SDK release may claim`,
        "Aura Clash Arena is a development showcase and runtime proof target.",
        "Aura3D has Babylon.js parity or mature commercial game-engine completeness.",
        "The AI prompt/catalog CLI always returns production-ready game assets."
      ]
    ],
    [
      "docs/project/aura3d-109-release-gates.md",
      [
        "Current decision: `release-ready-for-scoped-1.0.9`",
        `Current published baseline: \`@aura3d/engine@${currentVersion}\``,
        "Do not run a future `npm publish`, create a GitHub release, or deploy marketing copy that claims readiness beyond the scoped 1.0.9 foundation"
      ]
    ]
  ];
  for (const [path, snippets] of required) assertSnippets(root, path, snippets, blockers);
  return {
    id: "current-release-boundary",
    ok: blockers.length === 0,
    summary: blockers.length === 0
      ? "README, llms, claim guidelines, and 1.0.9 release gates consistently present 1.0.9 as a scoped runtime-foundation release."
      : "Current release and 1.0.9 boundary wording is incomplete.",
    evidencePaths,
    blockers
  };
}

function marketingClaimGate(root: string, currentVersion: string): DocsClaimGate {
  const evidencePaths = ["marketing/index.html", "marketing/sections/aura-clash-homepage.html"];
  const blockers: string[] = [];
  assertSnippets(root, "marketing/index.html", [
    `"softwareVersion": "${currentVersion}"`,
    `v${currentVersion}`,
    "Aura Clash Arena is the current browser fighting-game proof target",
    "not yet proof of a mature commercial game engine or a flagship-quality fighting game",
    "Static approved preview",
    "scoped 1.0.9 proof"
  ], blockers);
  assertSnippets(root, "marketing/sections/aura-clash-homepage.html", [
    "Live embed disabled until 1.0.9 visual and gameplay gates pass.",
    "static preview linking to the playable development route"
  ], blockers);
  return {
    id: "marketing-claim-boundary",
    ok: blockers.length === 0,
    summary: blockers.length === 0
      ? "Marketing site uses the current package version, static Aura Clash preview, and development-showcase wording."
      : "Marketing claim boundary is incomplete.",
    evidencePaths,
    blockers
  };
}

function headerFitGate(root: string): DocsClaimGate {
  const docsPages = listHtmlFiles(join(root, "marketing/docs"))
    .map((path) => `marketing/docs/${path}`)
    .filter((path) => readText(root, path).includes("nav-actions"));
  const evidencePaths = ["marketing/index.html", "marketing/src/styles.css", ...docsPages];
  const blockers: string[] = [];
  const index = readText(root, "marketing/index.html");
  const css = readText(root, "marketing/src/styles.css");
  for (const snippet of ["Aura&nbsp;Clash", "Agent&nbsp;context", "Get&nbsp;started"]) {
    if (!index.includes(snippet)) blockers.push(`marketing/index.html header is missing non-breaking label ${snippet}.`);
  }
  for (const snippet of ["white-space: nowrap", "text-wrap: nowrap", "word-break: keep-all", "flex-wrap: nowrap"]) {
    if (!css.includes(snippet)) blockers.push(`marketing/src/styles.css is missing header no-wrap rule ${snippet}.`);
  }
  for (const path of docsPages) {
    if (!readText(root, path).includes("Get&nbsp;started")) blockers.push(`${path} header is missing non-breaking Get started label.`);
  }
  return {
    id: "marketing-header-fit",
    ok: blockers.length === 0,
    summary: blockers.length === 0
      ? "Marketing and docs headers keep Aura Clash, Agent context, and Get started on one line through source text and CSS no-wrap rules."
      : "Marketing/docs header text can still wrap or break.",
    evidencePaths,
    blockers
  };
}

function forbiddenClaimsGate(root: string): DocsClaimGate {
  const evidencePaths = [
    "README.md",
    "llms.txt",
    "marketing/index.html",
    "marketing/sections/aura-clash-homepage.html",
    "docs/project/current-state.md",
    "docs/project/product-boundaries.md",
    "docs/project/known-limits.md",
    "docs/project/aura-clash-showcase.md"
  ];
  const blockers: string[] = [];
  const patterns: readonly (readonly [RegExp, string])[] = [
    [/\bUnity replacement\b/i, "Unity replacement"],
    [/\bUnreal competitor\b/i, "Unreal competitor"],
    [/\bAAA game engine\b/i, "AAA game engine"],
    [/\bfull Babylon\.js parity\b/i, "full Babylon.js parity"],
    [/\bmature commercial game engine\b/i, "mature commercial game engine"],
    [/\bflagship-quality game\b/i, "flagship-quality game"],
    [/\balways returns production-ready\b/i, "always returns production-ready"]
  ];
  for (const path of evidencePaths) {
    const lines = readText(root, path).split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? "";
      for (const [pattern, label] of patterns) {
        if (pattern.test(line) && !isAllowedNegativeContext(line)) {
          blockers.push(`${path}:${index + 1} contains unscoped forbidden claim ${label}: ${line.trim()}`);
        }
      }
    }
  }
  return {
    id: "forbidden-overclaim-scan",
    ok: blockers.length === 0,
    summary: blockers.length === 0
      ? "Public docs and marketing scanned by this gate do not make unscoped mature-engine, Unity/Unreal, Babylon parity, flagship, or always-production-ready claims."
      : "Unscoped forbidden public claims remain.",
    evidencePaths,
    blockers
  };
}

function isAllowedNegativeContext(line: string): boolean {
  return /\b(not|not yet|must not|do not|does not|cannot|blocked|disallowed|forbidden|without|until|no current gate|out of scope)\b/i.test(line);
}

function assertSnippets(root: string, path: string, snippets: readonly string[], blockers: string[]): void {
  const text = readText(root, path);
  for (const snippet of snippets) {
    if (!text.includes(snippet)) blockers.push(`${path} is missing required wording: ${snippet}`);
  }
}

function listHtmlFiles(dir: string): readonly string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((entry) => entry.endsWith(".html")).sort();
}

function readPackageVersion(root: string, path: string): string {
  const parsed = JSON.parse(readText(root, path)) as { readonly version?: string };
  return parsed.version ?? "";
}

function readText(root: string, path: string): string {
  const absolute = join(root, path);
  if (!existsSync(absolute)) throw new Error(`${path} is missing`);
  return readFileSync(absolute, "utf8");
}

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const root = process.cwd();
  const report = createAura3D109DocsClaimsReport(root);
  const outPath = readOption("--out") ?? defaultOutPath;
  writeAura3D109DocsClaimsReport(root, report, outPath);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}
