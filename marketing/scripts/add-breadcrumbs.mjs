#!/usr/bin/env node
// Adds a schema.org BreadcrumbList to every indexable built page (docs, game guides, games, examples).
// Runs on marketing/dist after build-showcase-routes.mjs; sources stay untouched.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const marketingDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(marketingDir, "dist");
const ORIGIN = (process.env.AURA3D_SITE_URL ?? "https://aura3d.auraone.ai").replace(/\/+$/, "");
const SKIP = new Set(["node_modules", "assets", "aura-assets", "aura-decoders", "aura-environments", "models", "hdri", "packs", "probes", "luts"]);
const MARK = "aura3d-breadcrumbs";

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return SKIP.has(entry.name) || entry.name.endsWith("-fonts") ? [] : htmlFiles(path);
    return entry.name.endsWith(".html") ? [path] : [];
  });
}

const text = (value) => value.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;|&rsquo;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

function leafName(html) {
  const title = text(html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "");
  return title.split(/\s+[|·]\s+/)[0].split(/\s+—\s+/)[0] || title;
}

function trail(path, html) {
  const home = { name: "Aura3D", url: `${ORIGIN}/` };
  const games = { name: "Games", url: `${ORIGIN}/apps/showcase-index/` };
  const docs = { name: "Docs", url: `${ORIGIN}/docs/` };
  const here = { name: leafName(html), url: `${ORIGIN}${path}` };
  if (path === "/" ) return null;
  if (path === "/docs/") return [home, { ...docs }];
  if (path.startsWith("/docs/")) return [home, docs, here];
  if (path === "/apps/showcase-index/") return [home, games];
  if (path.startsWith("/games/")) return [home, games, here];
  if (path.startsWith("/apps/")) return [home, games, here];
  return [home, here];
}

let added = 0;
for (const file of htmlFiles(dist)) {
  const html = readFileSync(file, "utf8");
  if (html.includes(MARK)) continue;
  const canonical = html.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i)?.[1];
  if (!canonical?.startsWith(ORIGIN)) continue;
  if (/<meta\s+name=["']robots["']\s+content=["'][^"']*noindex/i.test(html)) continue;
  const items = trail(new URL(canonical).pathname, html);
  if (!items) continue;
  const ld = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, item: item.url })),
  };
  const tag = `<script type="application/ld+json" id="${MARK}">${JSON.stringify(ld).replaceAll("<", "\\u003c")}</script>`;
  const next = html.replace(/<\/head>/i, `${tag}\n</head>`);
  if (next === html) continue;
  writeFileSync(file, next, "utf8");
  added += 1;
}
console.log(`add-breadcrumbs: BreadcrumbList on ${added} pages`);
