#!/usr/bin/env node
// Generate discovery files from the same docs, game catalog and editorial pages that ship.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { interactiveExamples } from "../../tools/site/interactive-examples.mjs";
import { gameGuidePath } from "../../tools/site/game-guide.mjs";

const marketingDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(marketingDir, "..");
const ORIGIN = (process.env.AURA3D_SITE_URL ?? "https://aura3d.auraone.ai").replace(/\/+$/, "");
const CHECK = process.argv.includes("--check");

const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-Web",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "GoogleOther",
  "Applebot-Extended",
  "Amazonbot",
  "Meta-ExternalAgent",
  "FacebookBot",
  "cohere-ai",
  "CCBot",
  "Bytespider",
  "Bingbot",
  "Diffbot",
  "DuckAssistBot",
  "ImagesiftBot",
  "iaskspider",
  "MistralAI-User",
  "Timpibot",
  "VelenPublicWebCrawler",
  "YouBot",
];

// Real defensive disallows for this static origin (never crawlable build
// internals / source maps / per-route health JSON). Everything else —
// marketing home, docs, and the example apps — is public content.
const PRIVATE_PATHS = ["/node_modules/", "/src/", "/*.map$", "/*route-health.json$"];

const catalog = JSON.parse(readFileSync(join(repoRoot, "tools/site/games.catalog.json"), "utf8"));
const docs = readdirSync(join(marketingDir, "docs"), { recursive: true })
  .filter((file) => file.endsWith(".html")).sort();
const MANIFEST = Object.fromEntries([
  ["/", { source: "marketing/index.html" }],
  ...docs.map((file) => [
    file === "index.html" ? "/docs/" : `/docs/${file.slice(0, -5)}`,
    { source: `marketing/docs/${file}` },
  ]),
  ["/apps/showcase-index/", { source: "apps/showcase-index/index.html" }],
  ...interactiveExamples.map(({ slug }) => [`/apps/${slug}/`, { source: `apps/${slug}/index.html` }]),
  ...catalog.games.flatMap((game) => {
    const guide = gameGuidePath(game);
    return [
      [game.url, { source: `apps/${game.appFolder}/index.html` }],
      [guide, { source: `marketing/public${guide}index.html` }],
    ];
  }),
]);
function fail(message) {
  throw new Error(`gen-seo: ${message}`);
}
for (const [route, { source }] of Object.entries(MANIFEST)) {
  if (!existsSync(join(repoRoot, source))) fail(`missing source for ${route}: ${source}`);
}

function builtPath(route) {
  return join(marketingDir, "dist", route.endsWith("/") ? `${route}index.html` : `${route}.html`);
}

if (CHECK) {
  const dist = join(marketingDir, "dist");
  const sitemap = readFileSync(join(dist, "sitemap.xml"), "utf8");
  const listed = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  const expected = Object.keys(MANIFEST).map((route) => ORIGIN + route);
  if (JSON.stringify(listed.sort()) !== JSON.stringify(expected.sort())) fail("built sitemap differs from public routes");
  const llms = readFileSync(join(dist, "llms-full.txt"), "utf8");
  for (const route of Object.keys(MANIFEST)) {
    if (!existsSync(builtPath(route))) fail(`missing built page: ${route}`);
    if (!llms.includes(`](${ORIGIN}${route})`)) fail(`llms-full.txt omits ${route}`);
    const html = readFileSync(builtPath(route), "utf8");
    if (!html.includes(`rel="canonical" href="${ORIGIN}${route}"`)) fail(`incorrect built canonical: ${route}`);
  }
  console.log(`gen-seo --check: OK — ${expected.length} built pages, canonical URLs, sitemap entries and full guide links.`);
  process.exit(0);
}

// ---- git-derived lastmod ---------------------------------------------------

function gitLastmod(repoRelativeFile) {
  const iso = execFileSync("git", ["log", "-1", "--format=%cI", "--", repoRelativeFile], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  // New pages have no verifiable last-modified date until they enter history.
  return iso;
}

const maxIso = (a, b) => (a >= b ? a : b);
const LASTMOD = Object.fromEntries(
  Object.entries(MANIFEST).map(([route, { source }]) => [route, gitLastmod(source)]),
);
const LASTMOD_MAX = Object.values(LASTMOD).reduce(maxIso);

// ---- robots.txt ------------------------------------------------------------

const robots = `# Public pages, documentation and game guides are open to search and AI crawlers.
${[...AI_CRAWLERS, "*"].map((ua) => `User-agent: ${ua}\nAllow: /\n${PRIVATE_PATHS.map((p) => `Disallow: ${p}`).join("\n")}`).join("\n\n")}

Sitemap: ${ORIGIN}/sitemap.xml
`;

// ---- sitemap.xml -----------------------------------------------------------

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${Object.keys(MANIFEST).map((route) => {
  const modified = LASTMOD[route];
  return `  <url>\n    <loc>${ORIGIN}${route}</loc>${modified ? `\n    <lastmod>${modified.slice(0, 10)}</lastmod>` : ""}\n  </url>`;
}).join("\n")}
</urlset>
`;

// ---- llms.txt --------------------------------------------------------------

function plainText(value = "") {
  return value.replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<").replaceAll("&gt;", ">").replace(/\s+/g, " ").trim();
}

function pageMeta(sourceRepoRelative) {
  const html = readFileSync(join(repoRoot, sourceRepoRelative), "utf8");
  const title = html.match(/<title>(.*?)<\/title>/)?.[1]?.trim();
  const description = html.match(/<meta\s+name="description"\s+content="(.*?)"/s)?.[1]?.trim();
  return { title: plainText(title), description: plainText(description) };
}

const version = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")).version;
const gameInventory = JSON.parse(readFileSync(join(repoRoot, "docs", "workflows", "game-inventory.json"), "utf8"));
const link = (route) => {
  const { title, description } = pageMeta(MANIFEST[route].source);
  const label = title ?? route;
  return `- [${label}](${ORIGIN}${route})${description ? `: ${description}` : ""}`;
};

const docRoutes = Object.keys(MANIFEST).filter((r) => r.startsWith("/docs/"));
const showcaseRoutes = catalog.games.map(gameGuidePath);
const appRoutes = Object.keys(MANIFEST).filter((r) => r.startsWith("/apps/"));

const GUIDE_MARKER = "<!-- agent-guide: everything below this marker is the long-form agent guide; gen-seo.mjs preserves it verbatim -->";
// llms-full.txt carries the page map and the long-form guide; llms.txt is the tight fast-path index
// generated from marketing/content/llms-core.txt.
const llmsFullPath = join(marketingDir, "public", "llms-full.txt");
const llmsPath = join(marketingDir, "public", "llms.txt");
const guideSource = existsSync(llmsFullPath) ? llmsFullPath : llmsPath;
const current = readFileSync(guideSource, "utf8");
const guideBody = current.includes(GUIDE_MARKER)
  ? current.slice(current.indexOf(GUIDE_MARKER) + GUIDE_MARKER.length).replace(/^\n+/, "")
  : current; // first run: the whole existing file is the agent guide
const guideBodyTrimmed = guideBody.replace(/\n+$/, "");

const llmsFull = `# Aura3D (full agent guide)

> ${pageMeta(MANIFEST["/"].source).title} — typed scenes, looks, typed GLB/glTF assets, camera rigs, gameFeel, and gameplay through \`@aura3d/engine\` plus the \`@aura3d/cli\` toolchain, for browser 3D apps and interactive websites. Start with ${ORIGIN}/llms.txt (fast path); this file is the long form.

${pageMeta(MANIFEST["/"].source).description}

## Facts

- Product: AI-native TypeScript 3D SDK for browser 3D apps, interactive websites, and prompt-to-code scene kits
- Website: ${ORIGIN}
- Current release: Aura3D ${version} (per the repo manifest — the same source the build's version guard uses)
- Docs: ${ORIGIN}/docs/api
- Showcase gallery: ${ORIGIN}/apps/showcase-index/ (${gameInventory.liveGameCount} playable games; add \`?autoplay=1\` to any game URL and the computer plays it)
- Sitemap: ${ORIGIN}/sitemap.xml
- Crawl policy: ${ORIGIN}/robots.txt (public content allow-all; build internals and source maps disallowed)
- Last updated: ${LASTMOD_MAX.slice(0, 10)}

## Pages

- [Home](${ORIGIN}/): ${pageMeta(MANIFEST["/"].source).description}

### Docs

${docRoutes.map(link).join("\n")}

### How the games are built

${showcaseRoutes.map(link).join("\n")}

### Playable games and interactive examples

${appRoutes.map(link).join("\n")}

${GUIDE_MARKER}
${guideBodyTrimmed}
`;

const llms = readFileSync(join(marketingDir, "content", "llms-core.txt"), "utf8")
  .replaceAll("{{FIRST_SCREEN}}", readFileSync(join(repoRoot, "docs", "agents", "first-screen.md"), "utf8").trimEnd())
  .replaceAll("{{VERSION}}", version)
  .replaceAll("{{GAME_COUNT}}", String(gameInventory.liveGameCount))
  .replaceAll("{{ORIGIN}}", ORIGIN)
  .replaceAll("{{LASTMOD}}", LASTMOD_MAX.slice(0, 10));

// ---- write marketing files + identical repo-root copies --------------------

const outputs = [
  [join(marketingDir, "robots.txt"), robots],
  [join(marketingDir, "sitemap.xml"), sitemap],
  [llmsPath, llms],
  [llmsFullPath, llmsFull],
  [join(repoRoot, "robots.txt"), robots],
  [join(repoRoot, "sitemap.xml"), sitemap],
  [join(repoRoot, "public", "sitemap.xml"), sitemap],
  [join(repoRoot, "llms.txt"), llms],
  [join(repoRoot, "llms-full.txt"), llmsFull],
  [join(repoRoot, "public", "llms.txt"), llms],
  [join(repoRoot, "public", "llms-full.txt"), llmsFull],
  [join(repoRoot, "public", "robots.txt"), robots],
];
for (const [path, body] of outputs) writeFileSync(path, body, "utf8");

console.log(`gen-seo: wrote ${outputs.length} files (${Object.keys(MANIFEST).length} routes, lastmod max ${LASTMOD_MAX.slice(0, 10)}):`);
for (const [path] of outputs) console.log(`  ${path.replace(repoRoot + "/", "")}`);
