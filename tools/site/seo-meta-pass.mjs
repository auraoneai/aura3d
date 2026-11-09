#!/usr/bin/env node
/**
 * SEO/AEO meta pass — normalizes the <head> SEO block on every public
 * app/showcase route so each indexable page ships the same complete set:
 *
 *   meta description, robots index/follow, canonical, og:site_name/type/title/
 *   description/url/image, twitter card/title/description/image, a parseable
 *   application/ld+json block, and an <h1> (sr-only where the page has none).
 *
 * Sources of truth:
 *   - tools/site/games.catalog.json for the 30 games (title, url, genre, text,
 *     previewSlug -> marketing/public/previews/showcase-index/<slug>@2x.webp)
 *   - EXTRA_ROUTES below for the gallery index and the two wow viewers
 *
 * Run from the repo root:
 *   node tools/site/seo-meta-pass.mjs          (rewrite app heads in place)
 *   node tools/site/seo-meta-pass.mjs --check  (assert coverage; used by check-site.mjs)
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CHECK = process.argv.includes("--check");
const ORIGIN = (process.env.AURA3D_SITE_URL ?? "https://aura3d.auraone.ai").replace(/\/+$/, "");
const VERSION = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")).version;
const catalog = JSON.parse(readFileSync(join(repoRoot, "tools", "site", "games.catalog.json"), "utf8"));
const genreLabel = (key) => catalog.genres[key] ?? key;

const BRAND_OG = `${ORIGIN}/store-assets/brand/social/og-1200x630.png`;

const unescapeHtml = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function metaDescription(text) {
  const clean = unescapeHtml(text).replace(/\s+/g, " ").trim();
  if (clean.length <= 158) return clean;
  const cut = clean.slice(0, 158);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

function gameImage(previewSlug) {
  const rel = `marketing/public/previews/showcase-index/${previewSlug}@2x.webp`;
  return existsSync(join(repoRoot, rel)) ? `${ORIGIN}/previews/showcase-index/${previewSlug}@2x.webp` : BRAND_OG;
}

const gameRoutes = catalog.games.map((g) => ({
  file: `apps/${g.appFolder}/index.html`,
  url: g.url,
  ldType: "VideoGame",
  ld: {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: g.title,
    url: `${ORIGIN}${g.url}`,
    description: metaDescription(g.text),
    genre: genreLabel(g.genre),
    gamePlatform: ["Web Browser"],
    applicationCategory: "Game",
    inLanguage: "en",
    isAccessibleForFree: true,
    image: gameImage(g.previewSlug),
    publisher: { "@type": "Organization", name: "Aura3D", url: ORIGIN },
  },
  image: gameImage(g.previewSlug),
  fallbackDescription: g.text,
  h1: `${g.title} — an Aura3D browser game`,
}));

const showcaseIndexGames = catalog.games.map((g) => ({
  "@type": "VideoGame",
  name: g.title,
  url: `${ORIGIN}${g.url}`,
}));

const EXTRA_ROUTES = [
  {
    file: "apps/showcase-index/index.html",
    url: "/apps/showcase-index/",
    ldType: "CollectionPage",
    ld: {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: "Aura3D Examples and Games",
      url: `${ORIGIN}/apps/showcase-index/`,
      description: "30 playable 3D browser games built on Aura3D: racing, sports, action, platformers and arcade, each with its own limits stated.",
      inLanguage: "en",
      publisher: { "@type": "Organization", name: "Aura3D", url: ORIGIN },
      mainEntity: { "@type": "ItemList", numberOfItems: catalog.games.length, itemListElement: showcaseIndexGames.map((g, i) => ({ "@type": "ListItem", position: i + 1, item: g })) },
    },
    image: BRAND_OG,
  },
  {
    file: "apps/wow-concept-car-cinema/index.html",
    url: "/apps/wow-concept-car-cinema/",
    ldType: "WebApplication",
    ld: {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "Aura3D Concept Car Cinema",
      url: `${ORIGIN}/apps/wow-concept-car-cinema/`,
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Web",
      inLanguage: "en",
      isAccessibleForFree: true,
      image: `${ORIGIN}/previews/showcase/wow-concept-car-cinema.png`,
      publisher: { "@type": "Organization", name: "Aura3D", url: ORIGIN },
    },
    image: `${ORIGIN}/previews/showcase/wow-concept-car-cinema.png`,
    fallbackDescription:
      "Typed GLB concept-car configurator on Aura3D: cinematic camera rig, look presets and a licensed, hashed asset pipeline in the browser.",
    h1: "Aura3D Concept Car Cinema — typed GLB product configurator",
  },
  {
    file: "apps/wow-damaged-helmet-pbr-detail/index.html",
    url: "/apps/wow-damaged-helmet-pbr-detail/",
    ldType: "WebApplication",
    ld: {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: "Aura3D Damaged Helmet PBR Detail",
      url: `${ORIGIN}/apps/wow-damaged-helmet-pbr-detail/`,
      applicationCategory: "MultimediaApplication",
      operatingSystem: "Web",
      inLanguage: "en",
      isAccessibleForFree: true,
      image: `${ORIGIN}/previews/showcase/wow-damaged-helmet-pbr-detail.png`,
      publisher: { "@type": "Organization", name: "Aura3D", url: ORIGIN },
    },
    image: `${ORIGIN}/previews/showcase/wow-damaged-helmet-pbr-detail.png`,
    fallbackDescription:
      "Damaged Helmet PBR material study on Aura3D: typed GLB asset, physical materials and studio lighting presets rendered live in the browser.",
    h1: "Aura3D Damaged Helmet PBR Detail — typed GLB asset viewer",
  },
];

const routes = [...gameRoutes, ...EXTRA_ROUTES];

const SR_ONLY =
  "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0";

function normalizeHead(html, route) {
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1]?.trim();
  if (!title) throw new Error(`${route.file}: missing <title>`);
  const canonical = `${ORIGIN}${route.url}`;
  const existingDesc = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i)?.[1];
  const description = existingDesc ? unescapeHtml(existingDesc) : metaDescription(route.fallbackDescription ?? route.ld.description ?? title);
  const ld = { ...route.ld };
  if (!ld.description) ld.description = description;
  if (!ld.image) ld.image = route.image;
  if (ld["@type"] === "VideoGame") ld.softwareVersion = VERSION;

  const block = [
    `    <meta name="description" content="${escapeHtml(description)}" />`,
    `    <meta name="robots" content="index, follow, max-image-preview:large" />`,
    `    <link rel="canonical" href="${canonical}" />`,
    `    <meta property="og:site_name" content="Aura3D" />`,
    `    <meta property="og:type" content="website" />`,
    `    <meta property="og:title" content="${escapeHtml(unescapeHtml(title))}" />`,
    `    <meta property="og:description" content="${escapeHtml(description)}" />`,
    `    <meta property="og:url" content="${canonical}" />`,
    `    <meta property="og:image" content="${route.image}" />`,
    `    <meta name="twitter:card" content="summary_large_image" />`,
    `    <meta name="twitter:title" content="${escapeHtml(unescapeHtml(title))}" />`,
    `    <meta name="twitter:description" content="${escapeHtml(description)}" />`,
    `    <meta name="twitter:image" content="${route.image}" />`,
    `    <script type="application/ld+json">${JSON.stringify(ld)}</script>`,
  ].join("\n");

  // Drop the previous SEO lines so the normalized block is the single source.
  let head = html.replace(/\n?[ \t]*<!--\s*SEO pass[^\n]*-->/g, "");
  head = head.replace(/\n?[ \t]*<meta\s+name=["']description["'][^>]*>/gi, "");
  head = head.replace(/\n?[ \t]*<meta\s+name=["']robots["'][^>]*>/gi, "");
  head = head.replace(/\n?[ \t]*<link\s+rel=["']canonical["'][^>]*>/gi, "");
  head = head.replace(/\n?[ \t]*<meta\s+property=["']og:[^"']*["'][^>]*>/gi, "");
  head = head.replace(/\n?[ \t]*<meta\s+name=["']twitter:[^"']*["'][^>]*>/gi, "");
  head = head.replace(/\n?[ \t]*<script\s+type=["']application\/ld\+json["']>[\s\S]*?<\/script>/gi, "");

  const withBlock = head.replace(/(<title>[^<]*<\/title>)/i, `$1\n${block}`);
  if (withBlock === head) throw new Error(`${route.file}: could not insert SEO block after <title>`);
  head = withBlock;

  if (!/<h1[\s>]/i.test(head)) {
    const h1 = `    <h1 style="${SR_ONLY}">${escapeHtml(route.h1 ?? `${unescapeHtml(title)} on Aura3D`)}</h1>`;
    const withH1 = head.replace(/<body[^>]*>/i, (m) => `${m}\n${h1}`);
    if (withH1 === head) throw new Error(`${route.file}: missing <body> tag for h1 injection`);
    head = withH1;
  }
  return head;
}

function audit(html, route) {
  const problems = [];
  const need = (cond, label) => !cond && problems.push(label);
  need(/<title>[^<]+<\/title>/i.test(html), "title");
  need(new RegExp(`<meta\\s+name=["']description["']\\s+content=["'][^"']{20,}`).test(html), "meta description");
  need(html.includes(`<link rel="canonical" href="${ORIGIN}${route.url}"`), `canonical != ${route.url}`);
  need(/property=["']og:site_name["']/i.test(html), "og:site_name");
  need(/property=["']og:title["']/i.test(html), "og:title");
  need(/property=["']og:description["']/i.test(html), "og:description");
  need(html.includes(`<meta property="og:url" content="${ORIGIN}${route.url}"`), "og:url");
  need(/property=["']og:image["']/i.test(html), "og:image");
  need(/name=["']twitter:card["']/i.test(html), "twitter:card");
  need(/name=["']twitter:description["']/i.test(html), "twitter:description");
  need(/name=["']twitter:image["']/i.test(html), "twitter:image");
  need(/name=["']robots["'][^>]*index/i.test(html), "robots index");
  need(/<h1[\s>]/i.test(html), "h1");
  const ld = html.match(/<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/i);
  need(!!ld, "ld+json");
  if (ld) {
    try {
      const parsed = JSON.parse(ld[1]);
      need(parsed["@type"] === route.ldType, `ld @type != ${route.ldType}`);
      need(parsed.url === `${ORIGIN}${route.url}`, "ld url != canonical");
    } catch {
      problems.push("ld+json does not parse");
    }
  }
  return problems;
}

const failures = [];
let changed = 0;
for (const route of routes) {
  const file = join(repoRoot, route.file);
  if (!existsSync(file)) {
    failures.push(`${route.file}: missing`);
    continue;
  }
  const html = readFileSync(file, "utf8");
  if (CHECK) {
    for (const problem of audit(html, route)) failures.push(`${route.file}: ${problem}`);
    continue;
  }
  const next = normalizeHead(html, route);
  if (next !== html) {
    writeFileSync(file, next, "utf8");
    changed += 1;
  }
}

if (failures.length > 0) {
  console.error(`seo-meta-pass: ${failures.length} problem(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(CHECK ? `seo-meta-pass --check: OK (${routes.length} routes)` : `seo-meta-pass: normalized ${changed}/${routes.length} route heads`);
