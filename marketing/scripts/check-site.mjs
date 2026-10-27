#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const marketingDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(marketingDir, "..");
const failures = [];
let checkedLinks = 0;
let checkedAssets = 0;

const external = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;
const htmlFiles = [
  resolve(marketingDir, "index.html"),
  ...readdirSync(resolve(marketingDir, "docs"))
    .filter((file) => file.endsWith(".html"))
    .map((file) => resolve(marketingDir, "docs", file))
];

function visibleFiles(path) {
  return existsSync(path) && statSync(path).isFile();
}

function routeCandidates(pathname) {
  const clean = pathname.replace(/\/+$/, "");
  const candidates = [];
  if (pathname.startsWith("/docs/")) {
    candidates.push(resolve(marketingDir, "docs", pathname.slice("/docs/".length)));
  }
  if (pathname.startsWith("/apps/")) {
    const appPath = pathname.slice(1);
    candidates.push(resolve(repoRoot, appPath, "index.html"), resolve(repoRoot, appPath));
  }
  // vercel.json rewrites this legacy showcase prefix onto the app route.
  if (pathname === "/showcase/aura-clash" || pathname.startsWith("/showcase/aura-clash/")) {
    const rest = pathname.slice("/showcase/aura-clash".length).replace(/^\/+/, "");
    candidates.push(
      resolve(repoRoot, "apps/aura-clash-showcase", rest, "index.html"),
      resolve(repoRoot, "apps/aura-clash-showcase", "index.html")
    );
  }
  if (pathname === "/playable" || pathname.startsWith("/playable/")) {
    const rest = pathname.slice("/playable".length).replace(/^\/+/, "");
    candidates.push(
      resolve(repoRoot, "apps/aura-clash-showcase/playable", rest, "index.html"),
      resolve(repoRoot, "apps/aura-clash-showcase/playable/index.html")
    );
  }
  if (pathname === "/") candidates.push(resolve(marketingDir, "index.html"));
  candidates.push(
    resolve(marketingDir, "public", pathname.slice(1)),
    resolve(marketingDir, pathname.slice(1)),
    resolve(repoRoot, "public", pathname.slice(1)),
    resolve(repoRoot, pathname.slice(1))
  );
  if (clean !== pathname.replace(/\/+$/, "")) candidates.push(resolve(repoRoot, clean.slice(1), "index.html"));
  return candidates;
}

function existsFor(pathname) {
  return routeCandidates(pathname).some(visibleFiles);
}

function checkLink(source, target, kind) {
  if (!target || external.test(target)) return;
  const [rawPath, rawHash] = target.split("#");
  const pathname = rawPath.split("?")[0];
  if (!pathname) {
    if (rawHash && !new RegExp(`id=["']${rawHash}["']`).test(readFileSync(source, "utf8"))) {
      failures.push(`${source}: missing same-page anchor #${rawHash}`);
    }
    return;
  }
  checkedLinks += 1;
  let resolvedPath = pathname;
  if (!pathname.startsWith("/")) {
    resolvedPath = resolve(dirname(source), pathname).replace(`${repoRoot}/`, "/");
  }
  if (!resolvedPath.startsWith("/")) resolvedPath = `/${resolvedPath}`;
  if (!existsFor(resolvedPath)) failures.push(`${source}: broken ${kind} ${target}`);
}

function pngDimensions(buffer) {
  if (buffer.toString("ascii", 12, 16) !== "IHDR") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

for (const file of htmlFiles) {
  const html = readFileSync(file, "utf8");
  for (const match of html.matchAll(/\b(?:href|src|data-poster-image|data-route)=["']([^"']+)["']/g)) {
    checkLink(file, match[1], "link");
  }
}

const home = readFileSync(resolve(marketingDir, "index.html"), "utf8");
for (const [property, expectedWidth, expectedHeight] of [
  ["og:image", 1200, 630],
  ["twitter:image", 1200, 630]
]) {
  const tag = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`).exec(home)
    ?? new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`).exec(home);
  if (!tag) {
    failures.push(`index.html: missing ${property} meta tag`);
    continue;
  }
  const url = new URL(tag[1], "https://aura3d.auraone.ai");
  const candidates = [
    resolve(marketingDir, "public", url.pathname.slice(1)),
    resolve(repoRoot, url.pathname.slice(1))
  ];
  const asset = candidates.find(visibleFiles);
  checkedAssets += 1;
  if (!asset) {
    failures.push(`index.html: ${property} asset missing (${url.pathname})`);
    continue;
  }
  const buffer = readFileSync(asset);
  const dimensions = pngDimensions(buffer);
  if (!dimensions || dimensions.width !== expectedWidth || dimensions.height !== expectedHeight) {
    failures.push(`${asset}: ${property} must be ${expectedWidth}x${expectedHeight}, found ${dimensions ? `${dimensions.width}x${dimensions.height}` : "non-PNG"}`);
  }
  if (buffer.length >= 300 * 1024) failures.push(`${asset}: ${property} must stay under 300KB, found ${Math.round(buffer.length / 1024)}KB`);
}

// Numeric claims on the homepage must equal counted sources (docs/audit/site-claims.md).
{
  const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
  const stat = (label) => {
    const m = new RegExp(`<li class="trust-item"><strong>([^<]+)</strong><span>${label}[^<]*</span></li>`).exec(home);
    return m ? m[1].trim() : null;
  };
  let publicPackages = 0;
  for (const dir of readdirSync(resolve(repoRoot, "packages"))) {
    const manifest = resolve(repoRoot, "packages", dir, "package.json");
    if (existsSync(manifest) && !readJson(manifest).private) publicPackages += 1;
  }
  const rootManifest = readJson(resolve(repoRoot, "package.json"));
  if (rootManifest.name === "@aura3d/engine" && !rootManifest.private) publicPackages += 1;
  const packagesStat = stat("npm packages");
  if (packagesStat !== String(publicPackages)) failures.push(`index.html: npm packages stat is ${packagesStat}, counted ${publicPackages}`);
  // Counts that change with the repo must be build-time tokens, never typed by hand.
  if (!home.includes("{{TEMPLATE_COUNT}} templates")) failures.push("index.html: the templates count must be the {{TEMPLATE_COUNT}} token");
  const typedTemplates = /\b(?:One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|\d+) templates\b/.exec(home);
  if (typedTemplates) failures.push(`index.html: hand-typed template count "${typedTemplates[0]}" (use {{TEMPLATE_COUNT}})`);
  const typedApps = /\b\d+ (?:apps|examples)\b/.exec(home);
  if (typedApps) failures.push(`index.html: hand-typed app/example count "${typedApps[0]}" has no counted source`);
  // Retracted: the 800K/850K catalog size, any 652 described as a catalog (it is the repo demo manifest), and any promise of the hosted index (offline; docs/audit/asset-catalog-claim.md).
  const retracted = /\b(?:800K\+|800,000\+|850K|~850k)\b|\b652\b[^<\n]{0,40}(?:catalog|assets)|(?:catalog|assets)[^<\n]{0,40}\b652\b|hosted (?:federated )?(?:index|catalog)/i;
  for (const file of [resolve(marketingDir, "index.html"), ...readdirSync(resolve(marketingDir, "docs")).filter((f) => f.endsWith(".html")).map((f) => resolve(marketingDir, "docs", f)), resolve(marketingDir, "public", "llms.txt"), resolve(marketingDir, "public", "llms-full.txt")]) {
    if (existsSync(file) && retracted.test(readFileSync(file, "utf8"))) failures.push(`${file}: contains a retracted catalog claim (800K/850K, 652 as a catalog, or the hosted index)`);
  }
}

// Game-count truth: the inventory, the generated index page and every stated count must agree.
for (const script of ["gen-game-inventory.mjs --check", "gen-showcase-index.mjs --check", "check-game-count.mjs"]) {
  const [file, ...args] = script.split(" ");
  const result = spawnSync(process.execPath, [resolve(repoRoot, "tools", "site", file), ...args], { encoding: "utf8" });
  if (result.status !== 0) failures.push(`${file}: ${(result.stderr || result.stdout).trim()}`);
}

// Stale-content guard (docs/design/marketing-site-update.md section 11.4): no old release numbers, version-numbered build names,
// deprecated or removed APIs in code samples, or claims the product does not back. The same rules scan the live site
// (tools/site/scan-live-site.mjs).
{
  const { loadDeprecatedNames, scanText } = await import(pathToFileURL(resolve(repoRoot, "tools", "site", "stale-rules.mjs")).href);
  const canonical = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8")).version;
  const deprecatedNames = loadDeprecatedNames(repoRoot);
  const staleTargets = [
    ...htmlFiles.map((file) => [file, "html"]),
    ...["content/llms-core.txt", "public/llms.txt", "public/llms-full.txt"].map((file) => [resolve(marketingDir, file), "text"])
  ];
  for (const [file, kind] of staleTargets) {
    if (!existsSync(file)) continue;
    for (const violation of scanText(readFileSync(file, "utf8"), { kind, canonical, deprecatedNames })) {
      failures.push(`${file.replace(`${repoRoot}/`, "")}: ${violation}`);
    }
  }
}

if (failures.length > 0) {
  console.error(`Site integrity check failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Site integrity passed: ${checkedLinks} internal links and ${checkedAssets} social assets.`);
