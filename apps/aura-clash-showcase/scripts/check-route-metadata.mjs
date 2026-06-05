#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, "..");
const repoRoot = resolve(appRoot, "../..");
const marketingRoot = join(repoRoot, "marketing");
const baseUrl = "https://aura3d.auraone.ai";
const auraClashBase = "/showcase/aura-clash/";
const legacyRoutePattern = /\/apps\/aura-clash-showcase\//;

const routes = [
  { id: "hub", file: "index.html", path: auraClashBase, priority: "0.88", changefreq: "weekly" },
  { id: "playable", file: "playable/index.html", path: "/showcase/aura-clash/playable/", priority: "0.84", changefreq: "weekly" },
  { id: "evidence", file: "evidence/index.html", path: "/showcase/aura-clash/evidence/", priority: "0.70", changefreq: "monthly" },
  { id: "accessibility", file: "accessibility/index.html", path: "/showcase/aura-clash/accessibility/", priority: "0.68", changefreq: "monthly" },
  { id: "deploy-check", file: "deploy-check/index.html", path: "/showcase/aura-clash/deploy-check/", priority: "0.66", changefreq: "monthly" },
  { id: "poster", file: "poster/index.html", path: "/showcase/aura-clash/poster/", priority: "0.78", changefreq: "weekly" }
];

const requiredFiles = [
  join(appRoot, "src/seo/routeMetadata.ts"),
  join(appRoot, "src/deploy/readinessChecklist.ts"),
  join(appRoot, "robots.txt"),
  join(appRoot, "sitemap.xml"),
  join(marketingRoot, "index.html"),
  join(marketingRoot, "docs/aura-clash-showcase.html"),
  join(repoRoot, "scripts/check-route-metadata.mjs"),
  join(repoRoot, "robots.txt"),
  join(repoRoot, "sitemap.xml"),
  join(marketingRoot, "robots.txt"),
  join(marketingRoot, "sitemap.xml")
];

const requiredHtmlSignals = [
  'name="description"',
  'name="keywords"',
  'name="robots"',
  'name="application-name"',
  'name="theme-color"',
  'rel="canonical"',
  'property="og:title"',
  'property="og:description"',
  'property="og:type"',
  'property="og:site_name"',
  'property="og:locale"',
  'property="og:url"',
  'property="og:image"',
  'property="og:image:alt"',
  'name="twitter:card"',
  'name="twitter:title"',
  'name="twitter:description"',
  'name="twitter:image"',
  'name="twitter:image:alt"',
  'type="application/ld+json"'
];

let failed = false;
function fail(message) {
  failed = true;
  console.error(`[aura-clash route-metadata] ${message}`);
}

function readRequired(file, label = file) {
  if (!existsSync(file)) {
    fail(`Missing required metadata file: ${label}`);
    return "";
  }
  return readFileSync(file, "utf8");
}

function countOccurrences(source, needle) {
  return source.split(needle).length - 1;
}

function countLineOccurrences(source, line) {
  return source.split(/\r?\n/).filter((candidate) => candidate.trim() === line).length;
}

for (const file of requiredFiles) {
  readRequired(file, file.replace(`${repoRoot}/`, ""));
}

for (const route of routes) {
  const routeHtmlPath = join(appRoot, route.file);
  const routeHtml = readRequired(routeHtmlPath, route.file);
  const canonicalUrl = `${baseUrl}${route.path}`;

  for (const signal of requiredHtmlSignals) {
    if (!routeHtml.includes(signal)) {
      fail(`Static route ${route.path} is missing SEO signal ${signal}`);
    }
  }

  if (!routeHtml.includes(`rel="canonical" href="${canonicalUrl}"`)) {
    fail(`Static route ${route.path} has missing or mismatched canonical URL ${canonicalUrl}`);
  }
  if (!routeHtml.includes(`property="og:url" content="${canonicalUrl}"`)) {
    fail(`Static route ${route.path} has missing or mismatched og:url ${canonicalUrl}`);
  }
  if (!routeHtml.includes(canonicalUrl)) {
    fail(`Static route ${route.path} does not expose its canonical URL in page metadata`);
  }
  if (legacyRoutePattern.test(routeHtml)) {
    fail(`Static route ${route.path} still references legacy /apps/aura-clash-showcase/ paths`);
  }
}

const sitemapFiles = [
  { file: join(appRoot, "sitemap.xml"), label: "apps/aura-clash-showcase/sitemap.xml", includeDocs: false },
  { file: join(repoRoot, "sitemap.xml"), label: "sitemap.xml", includeDocs: true },
  { file: join(marketingRoot, "sitemap.xml"), label: "marketing/sitemap.xml", includeDocs: true },
  { file: join(marketingRoot, "dist/sitemap.xml"), label: "marketing/dist/sitemap.xml", includeDocs: true }
];

for (const sitemapFile of sitemapFiles) {
  const sitemap = readRequired(sitemapFile.file, sitemapFile.label);
  if (legacyRoutePattern.test(sitemap)) {
    fail(`${sitemapFile.label} still references legacy /apps/aura-clash-showcase/ paths`);
  }
  for (const route of routes) {
    const loc = `<loc>${baseUrl}${route.path}</loc>`;
    if (countOccurrences(sitemap, loc) !== 1) {
      fail(`${sitemapFile.label} must include exactly one ${loc}`);
    }
    if (!sitemap.includes(`<priority>${route.priority}</priority>`)) {
      fail(`${sitemapFile.label} is missing expected priority ${route.priority}`);
    }
  }
  if (sitemapFile.includeDocs && !sitemap.includes(`<loc>${baseUrl}/docs/aura-clash-showcase.html</loc>`)) {
    fail(`${sitemapFile.label} does not include the Aura Clash documentation route`);
  }
}

const robotsFiles = [
  { file: join(appRoot, "robots.txt"), label: "apps/aura-clash-showcase/robots.txt", sitemap: `${baseUrl}/showcase/aura-clash/sitemap.xml`, includeDocs: false },
  { file: join(repoRoot, "robots.txt"), label: "robots.txt", sitemap: `${baseUrl}/sitemap.xml`, includeDocs: true },
  { file: join(marketingRoot, "robots.txt"), label: "marketing/robots.txt", sitemap: `${baseUrl}/sitemap.xml`, includeDocs: true },
  { file: join(marketingRoot, "dist/robots.txt"), label: "marketing/dist/robots.txt", sitemap: `${baseUrl}/sitemap.xml`, includeDocs: true }
];

for (const robotsFile of robotsFiles) {
  const robots = readRequired(robotsFile.file, robotsFile.label);
  if (legacyRoutePattern.test(robots)) {
    fail(`${robotsFile.label} still references legacy /apps/aura-clash-showcase/ paths`);
  }
  for (const route of routes) {
    const allow = `Allow: ${route.path}`;
    if (countLineOccurrences(robots, allow) !== 1) {
      fail(`${robotsFile.label} must include exactly one ${allow}`);
    }
  }
  if (robotsFile.includeDocs && !robots.includes("Allow: /docs/aura-clash-showcase.html")) {
    fail(`${robotsFile.label} does not allow the Aura Clash documentation route`);
  }
  if (!robots.includes(`Sitemap: ${robotsFile.sitemap}`)) {
    fail(`${robotsFile.label} does not reference ${robotsFile.sitemap}`);
  }
}

const docs = readRequired(join(marketingRoot, "docs/aura-clash-showcase.html"), "marketing/docs/aura-clash-showcase.html");
for (const route of routes) {
  if (!docs.includes(`href="${route.path}"`)) {
    fail(`marketing/docs/aura-clash-showcase.html does not link to ${route.path}`);
  }
}
if (!docs.includes(`${baseUrl}/previews/aura-clash-poster.svg`)) {
  fail("marketing/docs/aura-clash-showcase.html must use an absolute Aura Clash preview image URL for social metadata");
}

const home = readRequired(join(marketingRoot, "index.html"), "marketing/index.html");
for (const path of [auraClashBase, "/showcase/aura-clash/playable/", "/docs/aura-clash-showcase.html"]) {
  if (!home.includes(`href="${path}"`)) {
    fail(`marketing/index.html does not link to ${path}`);
  }
}
if (legacyRoutePattern.test(home)) {
  fail("marketing/index.html still references legacy /apps/aura-clash-showcase/ paths");
}

if (failed) {
  process.exit(1);
}

console.log(`[aura-clash route-metadata] ${routes.length} static routes, docs/home links, sitemap files, robots files, and metadata signals are present.`);
