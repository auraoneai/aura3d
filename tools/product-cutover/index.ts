import { existsSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { extname, resolve } from "node:path";
import { existsCheck, writeReport, type ReleaseCheck } from "../check-common";

const tagExists = (() => {
  try {
    return execSync("git tag --list '*pre-cutover-2026-05-27'", { encoding: "utf8" }).trim().length > 0;
  } catch {
    return false;
  }
})();

const bannedTerms = [
  "@aura3d/" + "ai-scene",
  "engine/" + "ai-runtime",
  "AuraScene" + "IR",
  "Mock" + "Provider",
  ["prompt", "to", "scene"].join("-"),
  ["provider", "runtime"].join("-")
];
const banned = new RegExp(bannedTerms.map(escapeRegExp).join("|"));
const activeFiles = listActiveSourceFiles();
const versionCyclePattern = new RegExp([
  `\\b${"V"}[234]\\b`,
  ["Path", "A"].join(" "),
  ["Path", "B"].join(" ")
].join("|"), "g");
const staleHits = activeFiles.flatMap((path) => {
  const text = readFileSync(resolve(path), "utf8");
  return bannedTerms.filter((term) => text.includes(term)).map((term) => `${path}: ${term}`);
});
const versionCycleHits = activeFiles
  .filter((path) => path === "README.md" || path === "llms.txt" || path.startsWith("docs/") || path === "AGENTS.md" || path.startsWith(".claude/") || path.startsWith(".cursor/") || path.startsWith(".github/"))
  .flatMap((path) => {
    const text = readFileSync(resolve(path), "utf8");
    return Array.from(text.matchAll(versionCyclePattern), (match) => `${path}: ${match[0]}`);
  });

const checks: ReleaseCheck[] = [
  { id: "pre-cutover-tag", pass: tagExists, detail: tagExists ? "pre-cutover tag exists" : "missing pre-cutover tag" },
  existsCheck("archive/legacy-ai-runtime/README.md", "legacy archive"),
  existsCheck("archive/legacy-ai-runtime/PORT_BACK.md", "port-back list"),
  { id: "active-ai-scene-package-removed", pass: !existsSync(resolve("packages/ai-scene")), detail: "packages/ai-scene is absent from active workspace" },
  { id: "active-ai-scene-server-removed", pass: !existsSync(resolve("packages/ai-scene-server")), detail: "packages/ai-scene-server is absent from active workspace" },
  {
    id: "active-removed-runtime-text",
    pass: staleHits.length === 0,
    detail: staleHits.length === 0 ? `no removed runtime text across ${activeFiles.length} source files` : staleHits.join(", ")
  },
  {
    id: "active-docs-no-version-cycle-framing",
    pass: versionCycleHits.length === 0,
    detail: versionCycleHits.length === 0 ? "active docs do not contain version-cycle framing" : versionCycleHits.join(", ")
  }
];

writeReport("tests/reports/product-cutover.json", "aura3d-product-cutover", checks, {
  preCutoverTagPresent: tagExists,
  archive: "archive/legacy-ai-runtime",
  scannedFiles: activeFiles.length
});

function listActiveSourceFiles(): string[] {
  const output = execSync("git ls-files --cached --others --exclude-standard", { encoding: "utf8" });
  return output
    .split("\n")
    .map((path) => path.trim())
    .filter(Boolean)
    .filter((path) => existsSync(resolve(path)))
    .filter((path) => !path.startsWith("archive/"))
    .filter((path) => ![
      "RuntimeScenePRD.md",
      "CinematicPrevisPRD.md",
      "ProductContextPRD.md",
      "TestV4PlanPRD.md",
      "tools/package-tarball-audit/index.ts"
    ].includes(path))
    .filter((path) => isTextSource(path));
}

function isTextSource(path: string): boolean {
  const extension = extname(path).toLowerCase();
  return new Set([
    "",
    ".cjs",
    ".css",
    ".html",
    ".js",
    ".json",
    ".md",
    ".mjs",
    ".mts",
    ".svg",
    ".ts",
    ".tsx",
    ".txt",
    ".yaml",
    ".yml"
  ]).has(extension);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
