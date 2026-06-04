import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { writeReport, type ReleaseCheck } from "../check-common";

const html = readFileSync("marketing/index.html", "utf8");
const hrefs = [...html.matchAll(/\s(?:href|src)="([^"]+)"/g)].map((match) => match[1]).filter(Boolean);
const copyCommands = [...html.matchAll(/data-copy-text="([^"]+)"/g)].map((match) => decodeHtml(match[1] ?? ""));
const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
const checks: ReleaseCheck[] = [];

const localMissing: string[] = [];
const badHashes: string[] = [];
const archivedPromotions: string[] = [];
const starterTemplateLinks = new Set<string>();

for (const href of hrefs) {
  if (/^(https?:|mailto:|tel:|data:)/.test(href)) continue;
  if (href.startsWith("#")) {
    const id = href.slice(1);
    if (id && !ids.has(id)) badHashes.push(href);
    continue;
  }
  if (href.includes("archive/legacy-ai-runtime")) archivedPromotions.push(href);
  for (const template of ["product-viewer", "cinematic-scene", "mini-game"]) {
    if (href.includes(template)) starterTemplateLinks.add(template);
  }
  const clean = href.split("#")[0]!.split("?")[0]!;
  if (!clean || clean.startsWith("/apps/")) continue;
  const path = clean.startsWith("/") ? clean.slice(1) : clean;
  if (!existsSync(resolve(path))) localMissing.push(href);
}

const badCopyCommands = copyCommands.filter((command) => !isValidCopyCommand(command));
for (const command of copyCommands) {
  for (const template of ["product-viewer", "cinematic-scene", "mini-game"]) {
    if (command.includes(template)) starterTemplateLinks.add(template);
  }
}
for (const match of html.matchAll(/data-search-terms="([^"]+)"/g)) {
  const terms = match[1] ?? "";
  for (const template of ["product-viewer", "cinematic-scene", "mini-game"]) {
    if (terms.includes(template)) starterTemplateLinks.add(template);
  }
}
checks.push(
  {
    id: "marketing-local-links-resolve",
    pass: localMissing.length === 0,
    detail: localMissing.length === 0 ? "all local marketing links resolve to repo paths or app routes" : localMissing.join(", ")
  },
  {
    id: "marketing-hash-links-resolve",
    pass: badHashes.length === 0,
    detail: badHashes.length === 0 ? "all hash links target page ids" : badHashes.join(", ")
  },
  {
    id: "marketing-copy-commands-valid",
    pass: badCopyCommands.length === 0 && copyCommands.length >= 4,
    detail: badCopyCommands.length === 0 ? `${copyCommands.length} copy commands validated` : badCopyCommands.join(" | ")
  },
  {
    id: "marketing-no-archive-primary-links",
    pass: archivedPromotions.length === 0,
    detail: archivedPromotions.length === 0 ? "no archive runtime paths promoted from marketing" : archivedPromotions.join(", ")
  },
  {
    id: "marketing-primary-template-set",
    pass: ["product-viewer", "cinematic-scene", "mini-game"].every((template) => starterTemplateLinks.has(template)),
    detail: `starter template links found: ${[...starterTemplateLinks].sort().join(", ")}`
  }
);

writeReport("tests/reports/marketing-link-audit.json", "aura3d-marketing-link-audit", checks, {
  hrefs,
  copyCommands
});

function isValidCopyCommand(command: string): boolean {
  if (command.includes("create-aura3d")) return /npx\s+create-aura3d@latest\s+\S+\s+--template\s+(product-viewer|cinematic-scene|mini-game)/.test(command);
  if (command.includes("@aura3d/cli")) return /npx\s+@aura3d\/cli@latest\s+(assets|check-deploy|doctor|init)/.test(command);
  if (command.includes("pnpm")) return /pnpm\s+run\s+check:release/.test(command);
  return false;
}

function decodeHtml(value: string): string {
  return value.replaceAll("&quot;", "\"").replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">");
}
