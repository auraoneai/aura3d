#!/usr/bin/env node
// Scan the live Aura3D site for stale content (docs/design/marketing-site-update.md section 11.4).
// Fetches the live sitemap plus llms.txt and llms-full.txt, applies tools/site/stale-rules.mjs, prints a report.
// Usage: node tools/site/scan-live-site.mjs [origin]   (default https://aura3d.auraone.ai). Exit 1 when anything is stale.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDeprecatedNames, scanText } from "./stale-rules.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const origin = (process.argv[2] ?? "https://aura3d.auraone.ai").replace(/\/+$/, "");
const canonical = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")).version;
const deprecatedNames = loadDeprecatedNames(repoRoot);

async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.text();
}

const sitemap = await get(`${origin}/sitemap.xml`);
// The sitemap lists absolute production URLs; map them onto the origin being scanned so a preview deployment can be checked too.
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => `${origin}${new URL(m[1].trim()).pathname}`);
urls.push(`${origin}/llms.txt`, `${origin}/llms-full.txt`);

let pagesWithProblems = 0;
let total = 0;
for (const url of urls) {
  let body;
  try {
    body = await get(url);
  } catch (error) {
    console.log(`FETCH FAILED ${url}: ${error.message}`);
    pagesWithProblems += 1;
    continue;
  }
  total += 1;
  const kind = url.endsWith(".txt") ? "text" : "html";
  const violations = scanText(body, { kind, canonical, deprecatedNames });
  if (violations.length > 0) {
    pagesWithProblems += 1;
    console.log(`== ${url.replace(origin, "") || "/"} (${violations.length})`);
    for (const violation of violations.slice(0, 12)) console.log(`  ${violation}`);
  }
}
console.log(`live scan: ${total} pages fetched, ${pagesWithProblems} with stale content (canonical ${canonical})`);
process.exit(pagesWithProblems > 0 ? 1 : 0);
