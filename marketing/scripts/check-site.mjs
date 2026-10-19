#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

if (failures.length > 0) {
  console.error(`Site integrity check failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`Site integrity passed: ${checkedLinks} internal links and ${checkedAssets} social assets.`);
