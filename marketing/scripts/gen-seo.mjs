#!/usr/bin/env node
/**
 * SEO pass — 2026-10-20
 *
 * Generates and guards the marketing/docs static-site SEO surface:
 *   marketing/robots.txt   (+ repo-root copy)
 *   marketing/sitemap.xml  (+ repo-root copy)
 *   marketing/public/llms.txt and llms-full.txt (+ repo-root and public/ copies)
 *
 * - robots: 14 named AI-crawler Allow groups + "*", each repeating the real
 *   defensive disallows for this static origin (/node_modules/, /src/,
 *   /*.map$), absolute Host + Sitemap, placeholder-domain swap-note.
 * - sitemap: exact bijection of the curated public route manifest below;
 *   per-route lastmod is REAL git history (last commit touching the route's
 *   source). Guards (both directions):
 *     * every manifest route's source file must exist — this is exactly the
 *       drift class that bit before: retired showcase routes
 *       (showcase-turbo-drift-circuit, showcase-skyline-runner) were still
 *       listed in sitemap.xml after their sources were retired;
 *     * the docs family must match marketing/docs/*.html exactly, minus the
 *       declared canonicalized duplicates (aura-clash.html canonicalizes to
 *       aura-clash-showcase.html);
 *     * --check mode additionally verifies every route exists in dist/ after
 *       a build (wired into `npm run build`).
 * - llms.txt: standard LLM-crawler map (honest frozen summary, Facts,
 *   every public route linked, git-derived Last updated, swap-note) with
 *   the long-form agent guide preserved verbatim below a marker.
 *
 * Placeholder-domain swap-note: ORIGIN defaults to https://aura3d.auraone.ai
 * (matches the repo's existing canonical/og placeholder base). Override with
 * AURA3D_SITE_URL for generation; swapping to the real domain at deploy is
 * an env change — no code edits required.
 *
 * Run from marketing/: node scripts/gen-seo.mjs          (generate)
 *                      node scripts/gen-seo.mjs --check  (guards only; build step)
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const marketingDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(marketingDir, "..");
const ORIGIN = (process.env.AURA3D_SITE_URL ?? "https://aura3d.auraone.ai").replace(/\/+$/, "");
const CHECK = process.argv.includes("--check");

const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-Web",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "Amazonbot",
  "Meta-ExternalAgent",
  "cohere-ai",
  "CCBot",
];

// Real defensive disallows for this static origin (never crawlable build
// internals / source maps). Everything else — marketing home, docs, the
// Aura Clash showcase, and the example apps — is public content.
const PRIVATE_PATHS = ["/node_modules/", "/src/", "/*.map$"];

/**
 * Curated public route manifest.
 * route -> { source (repo-relative file whose git history drives lastmod),
 *            freq, priority }
 * The docs family is cross-checked against marketing/docs/*.html (see
 * NON_SITEMAP_DOCS); retired showcase prototypes are deliberately absent
 * (build-showcase-routes.mjs still builds them, but they are retired from
 * the marketing surface) and the source/dist guards keep the manifest
 * honest in both directions. Routes the current build pipeline does NOT
 * emit are also absent — the guard flagged exactly that class during this
 * pass: the /showcase/aura-clash/* routes (the builder now writes redirect
 * stubs to /apps/showcase-index/ for the retired Aura Clash showcase),
 * /showcase/aura-clash/{evidence,accessibility,deploy-check,poster}/, and
 * /apps/{advanced-examples-gallery,wow-webgpu-compute-particles,
 * wow-tokyo-keyframes,wow-boombox-texture-lab,wow-standard-material-spheres,
 * wow-simple-transforms}/ were listed in the old sitemap but are redirects
 * or not produced by the current build (owner follow-up if any should
 * return as real content).
 */
const MANIFEST = {
  "/": { source: "marketing/index.html", freq: "weekly", priority: "1.00" },
  "/docs/agent-quickstart.html": { source: "marketing/docs/agent-quickstart.html", freq: "weekly", priority: "0.86" },
  "/docs/agent-rules.html": { source: "marketing/docs/agent-rules.html", freq: "weekly", priority: "0.84" },
  "/docs/api.html": { source: "marketing/docs/api.html", freq: "weekly", priority: "0.88" },
  "/docs/assets.html": { source: "marketing/docs/assets.html", freq: "weekly", priority: "0.86" },
  "/docs/templates.html": { source: "marketing/docs/templates.html", freq: "weekly", priority: "0.86" },
  "/docs/prompt-recipes.html": { source: "marketing/docs/prompt-recipes.html", freq: "weekly", priority: "0.88" },
  "/docs/deployment.html": { source: "marketing/docs/deployment.html", freq: "monthly", priority: "0.82" },
  "/docs/claude.html": { source: "marketing/docs/claude.html", freq: "weekly", priority: "0.78" },
  "/docs/cursor.html": { source: "marketing/docs/cursor.html", freq: "weekly", priority: "0.78" },
  "/docs/evidence.html": { source: "marketing/docs/evidence.html", freq: "weekly", priority: "0.78" },
  "/docs/claims.html": { source: "marketing/docs/claims.html", freq: "weekly", priority: "0.78" },
  "/docs/aura3d-vs-threejs.html": { source: "marketing/docs/aura3d-vs-threejs.html", freq: "weekly", priority: "0.82" },
  "/docs/aura-clash-showcase.html": { source: "marketing/docs/aura-clash-showcase.html", freq: "weekly", priority: "0.86" },
  "/apps/wow-concept-car-cinema/": { source: "apps/wow-concept-car-cinema/index.html", freq: "weekly", priority: "0.76" },
  "/apps/wow-damaged-helmet-pbr-detail/": { source: "apps/wow-damaged-helmet-pbr-detail/index.html", freq: "weekly", priority: "0.72" },
  "/apps/showcase-index/": { source: "apps/showcase-index/index.html", freq: "weekly", priority: "0.80" },
  "/apps/showcase-top-tennis/": { source: "apps/showcase-top-tennis/index.html", freq: "weekly", priority: "0.70" },
  "/apps/showcase-roadster-rush/": { source: "apps/showcase-roadster-rush/index.html", freq: "weekly", priority: "0.70" },
  "/apps/showcase-heatsink/": { source: "apps/showcase-heatsink/index.html", freq: "weekly", priority: "0.70" },
  "/apps/showcase-teleoperator/": { source: "apps/showcase-teleoperator/index.html", freq: "weekly", priority: "0.70" },
  "/apps/showcase-iron-crown/": { source: "apps/showcase-iron-crown/index.html", freq: "weekly", priority: "0.70" },
  "/apps/showcase-pips-big-leap/": { source: "apps/showcase-pips-big-leap/index.html", freq: "weekly", priority: "0.70" },
  "/apps/showcase-aura-hoops-3d/": { source: "apps/showcase-aura-hoops-3d/index.html", freq: "weekly", priority: "0.70" },
  "/apps/showcase-aura-diamond-3d/": { source: "apps/showcase-aura-diamond-3d/index.html", freq: "weekly", priority: "0.70" },
  "/apps/showcase-aura-fc-3d/": { source: "apps/showcase-aura-fc-3d/index.html", freq: "weekly", priority: "0.70" },
  "/apps/showcase-aura-links-3d/": { source: "apps/showcase-aura-links-3d/index.html", freq: "weekly", priority: "0.70" },
  "/apps/showcase-bunker-zero/": { source: "apps/showcase-bunker-zero/index.html", freq: "weekly", priority: "0.70" },
  "/apps/showcase-slingshot-siege/": { source: "apps/showcase-slingshot-siege/index.html", freq: "weekly", priority: "0.70" },
  "/apps/showcase-dot-dash-3d/": { source: "apps/showcase-dot-dash-3d/index.html", freq: "weekly", priority: "0.70" },
  "/apps/showcase-cross-hop/": { source: "apps/showcase-cross-hop/index.html", freq: "weekly", priority: "0.70" },
  "/apps/craterline-gp/": { source: "apps/showcase-strange-orbit-port/index.html", freq: "weekly", priority: "0.60" },
  "/apps/chroma-roll/": { source: "apps/showcase-splat-rush-port/index.html", freq: "weekly", priority: "0.60" },
  "/apps/serpentine-sky-run/": { source: "apps/showcase-serpentine-sky-run-port/index.html", freq: "weekly", priority: "0.60" },
  "/apps/gridlock-courier/": { source: "apps/showcase-drift-and-deliver-port/index.html", freq: "weekly", priority: "0.60" },
  "/apps/ion-circuit/": { source: "apps/showcase-heatsink-port/index.html", freq: "weekly", priority: "0.60" },
  "/apps/shadowstep-gauntlet/": { source: "apps/showcase-ninja-runner-port/index.html", freq: "weekly", priority: "0.60" },
  "/apps/lamplight-line/": { source: "apps/showcase-last-train-port/index.html", freq: "weekly", priority: "0.60" },
  "/apps/saltwind-highway/": { source: "apps/showcase-roadster-hours-port/index.html", freq: "weekly", priority: "0.60" },
  "/apps/the-bellkeepers-walk/": { source: "apps/showcase-where-the-wind-wanders-port/index.html", freq: "weekly", priority: "0.60" },
  "/apps/duneglide/": { source: "apps/showcase-silt-and-signal-port/index.html", freq: "weekly", priority: "0.60" },
  "/apps/cumulus-dash/": { source: "apps/showcase-cloud-runner-port/index.html", freq: "weekly", priority: "0.60" },
};

// Docs pages that exist as files but are not sitemap entries:
//  - docs/index.html permanently redirects to / (marketing/vercel.json) and
//    canonicalizes to /;
//  - aura-clash.html canonicalizes onto aura-clash-showcase.html
//    (duplicate-content consolidation).
const NON_SITEMAP_DOCS = ["index.html", "aura-clash.html"];

function fail(message) {
  console.error(`gen-seo: ${message}`);
  process.exit(1);
}

// ---- guards (always on, generate or check) ---------------------------------

const missingSources = Object.entries(MANIFEST)
  .filter(([, { source }]) => !existsSync(join(repoRoot, source)))
  .map(([route, { source }]) => `${route} -> ${source}`);
if (missingSources.length > 0) {
  fail(`manifest routes with missing sources (retired route left in the sitemap?):\n  ${missingSources.join("\n  ")}`);
}

const docsOnDisk = readdirSync(join(marketingDir, "docs"))
  .filter((f) => f.endsWith(".html"))
  .map((f) => `/docs/${f}`);
const manifestDocs = Object.keys(MANIFEST).filter((r) => r.startsWith("/docs/"));
const missingDocs = docsOnDisk.filter(
  (r) => !manifestDocs.includes(r) && !NON_SITEMAP_DOCS.includes(r.slice("/docs/".length)),
);
const staleDocs = manifestDocs.filter((r) => !docsOnDisk.includes(r));
if (missingDocs.length > 0) fail(`docs pages missing from the sitemap manifest:\n  ${missingDocs.join("\n  ")}`);
if (staleDocs.length > 0) fail(`manifest docs routes with no source file:\n  ${staleDocs.join("\n  ")}`);

if (CHECK) {
  const distDir = join(marketingDir, "dist");
  if (!existsSync(distDir)) fail("dist/ not found — run the full build before --check");
  const rewriteTo = new Map(
    (JSON.parse(readFileSync(join(repoRoot, "vercel.json"), "utf8")).rewrites ?? [])
      .filter((r) => !r.source.includes(":") && !r.source.endsWith("/"))
      .map((r) => [r.source.replace(/\/$/, "") + "/", r.destination]),
  );
  const distPathFor = (rawRoute) => {
    const route = rewriteTo.get(rawRoute) ?? rawRoute;
    if (route === "/") return join(distDir, "index.html");
    if (route.startsWith("/docs/")) return join(distDir, route.slice(1));
    return join(distDir, route.slice(1), "index.html");
  };
  const missingDist = Object.keys(MANIFEST)
    .map((route) => (existsSync(distPathFor(route)) ? null : route))
    .filter(Boolean);
  if (missingDist.length > 0) {
    fail(`manifest routes not present in dist/ (build drift):\n  ${missingDist.join("\n  ")}`);
  }
  console.log(`gen-seo --check: OK — ${Object.keys(MANIFEST).length} manifest routes, all sources + dist pages present, docs family in bijection.`);
  process.exit(0);
}

// ---- git-derived lastmod ---------------------------------------------------

function gitLastmod(repoRelativeFile) {
  const iso = execFileSync("git", ["log", "-1", "--format=%cI", "--", repoRelativeFile], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  if (!iso) throw new Error(`No git history for ${repoRelativeFile} (uncommitted route?)`);
  return iso;
}

const maxIso = (a, b) => (a >= b ? a : b);
const LASTMOD = Object.fromEntries(
  Object.entries(MANIFEST).map(([route, { source }]) => [route, gitLastmod(source)]),
);
const LASTMOD_MAX = Object.values(LASTMOD).reduce(maxIso);

// ---- robots.txt ------------------------------------------------------------

const robots = `# SEO pass — 2026-10-20 — generated by marketing/scripts/gen-seo.mjs (npm run seo:gen); do not edit by hand.
# Placeholder-domain swap-note: Host + Sitemap derive from the ORIGIN constant
# (repo placeholder: ${ORIGIN}). Swap at deploy time via AURA3D_SITE_URL — or edit the
# generator once — and robots.txt / sitemap.xml / llms.txt all follow.
${AI_CRAWLERS.map((ua) => `User-agent: ${ua}\nAllow: /\n${PRIVATE_PATHS.map((p) => `Disallow: ${p}`).join("\n")}`).join("\n\n")}

User-agent: *
Allow: /
${PRIVATE_PATHS.map((p) => `Disallow: ${p}`).join("\n")}

Host: ${ORIGIN}
Sitemap: ${ORIGIN}/sitemap.xml
`;

// ---- sitemap.xml -----------------------------------------------------------

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<!-- SEO pass — 2026-10-20 — generated by marketing/scripts/gen-seo.mjs; lastmod values are real git history per route. -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${Object.entries(MANIFEST)
  .map(
    ([route, { freq, priority }]) =>
      `  <url>\n    <loc>${ORIGIN}${route}</loc>\n    <lastmod>${LASTMOD[route].slice(0, 10)}</lastmod>\n    <changefreq>${freq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`,
  )
  .join("\n")}
</urlset>
`;

// ---- llms.txt --------------------------------------------------------------

function pageMeta(sourceRepoRelative) {
  const html = readFileSync(join(repoRoot, sourceRepoRelative), "utf8");
  const title = html.match(/<title>(.*?)<\/title>/)?.[1]?.trim();
  const description = html.match(/<meta\s+name="description"\s+content="(.*?)"/s)?.[1]?.trim();
  return { title, description };
}

const version = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")).version;
const link = (route) => {
  const { title, description } = pageMeta(MANIFEST[route].source);
  const label = title ?? route;
  return `- [${esc(label)}](${ORIGIN}${route})${description ? `: ${esc(description)}` : ""}`;
};

const docRoutes = Object.keys(MANIFEST).filter((r) => r.startsWith("/docs/"));
const showcaseRoutes = Object.keys(MANIFEST).filter((r) => r.startsWith("/showcase/"));
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

> ${esc(pageMeta(MANIFEST["/"].source).title)} — typed scenes, looks, typed GLB/glTF assets, camera rigs, gameFeel, and gameplay through \`@aura3d/engine\` plus the \`@aura3d/cli\` toolchain, for browser 3D apps and interactive websites. Start with ${ORIGIN}/llms.txt (fast path); this file is the long form.

${esc(pageMeta(MANIFEST["/"].source).description ?? "")}

## Facts

- Product: AI-native TypeScript 3D SDK for browser 3D apps, interactive websites, and prompt-to-code scene kits
- Website: ${ORIGIN}
- Current release: Aura3D ${version} (per the repo manifest — the same source the build's version guard uses)
- Docs: ${ORIGIN}/docs/api.html
- Showcase game: ${ORIGIN}/showcase/aura-clash/
- Sitemap: ${ORIGIN}/sitemap.xml
- Crawl policy: ${ORIGIN}/robots.txt (public content allow-all; build internals and source maps disallowed)
- Last updated: ${LASTMOD_MAX.slice(0, 10)}

## Pages

- [Home](${ORIGIN}/): ${esc(pageMeta(MANIFEST["/"].source).description ?? "Product overview.")}

### Docs

${docRoutes.map(link).join("\n")}

### Showcase

${showcaseRoutes.map(link).join("\n")}

### Example apps

${appRoutes.map(link).join("\n")}

## Notes

- Domain: ${ORIGIN} is a placeholder — swap AURA3D_SITE_URL (or the generator's ORIGIN) at deploy time; every URL in robots.txt, sitemap.xml, and these files follows.

${GUIDE_MARKER}
${guideBodyTrimmed}
`;

const gameInventory = JSON.parse(readFileSync(join(repoRoot, "docs", "workflows", "game-inventory.json"), "utf8"));
const llms = readFileSync(join(marketingDir, "content", "llms-core.txt"), "utf8")
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
  [join(repoRoot, "llms.txt"), llms],
  [join(repoRoot, "llms-full.txt"), llmsFull],
  [join(repoRoot, "public", "llms.txt"), llms],
  [join(repoRoot, "public", "llms-full.txt"), llmsFull],
];
for (const [path, body] of outputs) writeFileSync(path, body, "utf8");

console.log(`gen-seo: wrote ${outputs.length} files (${Object.keys(MANIFEST).length} routes, lastmod max ${LASTMOD_MAX.slice(0, 10)}):`);
for (const [path] of outputs) console.log(`  ${path.replace(repoRoot + "/", "")}`);
