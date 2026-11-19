import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { writeReport, type ReleaseCheck } from "../check-common";

const html = readFileSync("marketing/index.html", "utf8");
const hrefs = [...html.matchAll(/\s(?:href|src|data-demo-route)="([^"]+)"/g)].map((match) => match[1]!);
const catalog = JSON.parse(readFileSync("tools/site/games.catalog.json", "utf8")) as { games: { url: string; appFolder: string }[] };
const appFolders = new Map(catalog.games.map((game) => [game.url, game.appFolder]));
const origin = "https://aura3d.auraone.ai";
const missing: string[] = [];
const badHashes: string[] = [];
for (const href of hrefs) {
  const url = new URL(href, origin);
  if (url.origin !== origin) continue;
  const path = url.pathname.slice(1);
  const folder = appFolders.get(url.pathname);
  const candidates = [
    ...(folder ? [resolve("apps", folder, "index.html")] : []),
    ...["marketing", "marketing/public", "."].flatMap((root) => [
      resolve(root, path || "index.html"), resolve(root, path, "index.html"), resolve(root, path + ".html")
    ])
  ];
  const file = candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
  if (!file) missing.push(href);
  else if (url.hash && !readFileSync(file, "utf8").includes(`id="${decodeURIComponent(url.hash.slice(1))}"`)) badHashes.push(href);
}

const version = JSON.parse(readFileSync("package.json", "utf8")).version;
const scaffold = `npx create-aura3d@${version} my-scene --template product-viewer`;
const expected = new Map([
  ["#scaffold-command", scaffold],
  ["#start-command", [scaffold, "cd my-scene", "npm install", "npm run dev"].join("\n")]
]);
const copyTargets = [...html.matchAll(/data-copy-target="([^"]+)"/g)].map((match) => match[1]!);
const invalidTargets: string[] = [];
for (const target of new Set([...copyTargets, ...expected.keys()])) {
  const id = target.slice(1);
  const content = html.match(new RegExp(`<(pre|code)\\b[^>]*id="${id}"[^>]*>([\\s\\S]*?)<\\/\\1>`))?.[2]?.replace(/<[^>]+>/g, "").trim();
  if (!copyTargets.includes(target) || !content || (expected.has(target) && expected.get(target) !== content)) invalidTargets.push(target);
}
const checks: ReleaseCheck[] = [
  { id: "marketing-local-links-resolve", pass: !missing.length, detail: missing.join(", ") || "all local destinations resolve" },
  { id: "marketing-hash-links-resolve", pass: !badHashes.length, detail: badHashes.join(", ") || "every fragment resolves in its destination HTML" },
  { id: "marketing-copy-commands-valid", pass: !invalidTargets.length, detail: invalidTargets.join(", ") || "copy controls resolve and installation snippets match the current release" },
  { id: "marketing-no-archive-primary-links", pass: !hrefs.some((href) => href.includes("/archive/legacy-ai-runtime")), detail: "current public destinations" },
  { id: "marketing-primary-template-set", pass: hrefs.includes("/docs/templates") && existsSync("packages/create-aura3d/templates/product-viewer"), detail: "homepage links the starter directory and scaffolds a shipped template" }
];
writeReport("tests/reports/marketing-link-audit.json", "aura3d-marketing-link-audit", checks, { hrefs, copyTargets });
