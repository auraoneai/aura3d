#!/usr/bin/env node
// Generate the gallery and individual editorial guides from the current playable inventory.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { withSocialCard } from "./social-cards.mjs";
import { gameGuidePath } from "./game-guide.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (file) => readFileSync(join(root, file), "utf8");
const inventory = JSON.parse(read("docs/workflows/game-inventory.json"));
const catalog = JSON.parse(read("tools/site/games.catalog.json"));
const live = new Set(inventory.games.filter((game) => game.status === "live").map((game) => game.appFolder));
const games = catalog.games.filter((game) => live.has(game.appFolder));
if (games.length !== inventory.liveGameCount) throw new Error("Gallery and live game counts differ");
const check = process.argv.includes("--check");
const scaffoldVersion = JSON.parse(read("packages/create-aura3d/package.json")).version;
const origin = "https://aura3d.auraone.ai";
const gallery = "/apps/showcase-index/";
const esc = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const capture = (g) => `/previews/showcase-index/${g.previewSlug}`;
const image = (g, priority = false) => `<img src="${capture(g)}.webp" srcset="${capture(g)}.webp 720w, ${capture(g)}@2x.webp 1440w" sizes="${priority ? "(max-width: 800px) 100vw, 68vw" : "(max-width: 640px) 94vw, (max-width: 980px) 46vw, 31vw"}" alt="" width="720" height="450" ${priority ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
const nav = `<a class="skip" href="#main">Skip to content</a>
<nav class="nav" aria-label="Primary"><div class="wrap nav-inner">
  <a class="brand" href="/"><img src="/store-assets/brand/aura3d-logo.svg" alt="Aura3D" width="104" height="26"></a>
  <div class="nav-links"><a href="${gallery}">Games</a><a href="/docs/#examples">Examples</a><a href="/docs/">Docs</a></div>
  <a class="start" href="/docs/agent-quickstart">Start building</a>
</div></nav>`;
const footer = `<footer class="wrap footer"><a class="brand" href="/"><img src="/store-assets/brand/aura3d-logo.svg" alt="Aura3D" width="104" height="26"></a><a href="${gallery}">Games</a><a href="/docs/">Documentation</a><a href="https://github.com/auraoneai/aura3d">GitHub</a></footer>`;

function write(relative, contents) {
  contents = withSocialCard(contents);
  const file = join(root, relative);
  if (existsSync(file) && readFileSync(file, "utf8") === contents) return;
  if (check) throw new Error(`Stale ${relative}. Run node tools/site/gen-showcase-index.mjs`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, contents);
}

function guide(g) {
  const { summary, heading, detail, source } = g.guide;
  for (const file of [source, `marketing/public${capture(g)}.webp`, `marketing/public${capture(g)}@2x.webp`]) {
    if (!existsSync(join(root, file))) throw new Error(`Missing ${file} for ${g.title}`);
  }
  const title = `${g.title} | Making the Aura3D game`;
  const url = origin + gameGuidePath(g);
  const record = { "@context": "https://schema.org", "@type": "WebPage", name: title, url, description: summary,
    image: origin + capture(g) + "@2x.webp", about: { "@type": "VideoGame", name: g.title, url: origin + g.url, genre: catalog.genres[g.genre], gamePlatform: "Web browser" } };
  const starter = g.genre === "racing" ? "racing-starter" : "mini-game";
  const starterIntro = g.genre === "racing" ? "Start with a car, a chase camera and a circuit with working checkpoints." : "Start with a playable platformer, keyboard controls and a scoring loop.";
  const code = `npx create-aura3d@${scaffoldVersion} my-game --template ${starter}\ncd my-game\nnpm install\nnpm run dev`;
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(summary)}">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="${url}">
<meta property="og:type" content="website"><meta property="og:site_name" content="Aura3D">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(summary)}">
<meta property="og:url" content="${url}"><meta property="og:image" content="${record.image}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(summary)}"><meta name="twitter:image" content="${record.image}">
<link rel="icon" href="/favicon.svg"><link rel="stylesheet" href="/fonts/local.css"><link rel="stylesheet" href="/games/editorial.css">
<script type="application/ld+json">${JSON.stringify(record).replaceAll("<","\\u003c")}</script></head>
<body>${nav}<main class="wrap" id="main">
  <header class="spotlight guide-hero"><div class="spot-copy">
    <a class="genre-link" href="${gallery}#genre-${g.genre}">${esc(catalog.genres[g.genre])}</a>
    <h1>${esc(g.title)}</h1><p class="lede">${esc(summary)}</p>
    <div class="actions"><a class="primary" href="${g.url}">Play ${esc(g.title)}</a><a href="#behind">How it works</a></div>
  </div><a class="hero-frame" href="${g.url}" aria-label="Play ${esc(g.title)}">${image(g,true)}</a></header>
  <div class="build-grid" id="behind">
    <section><h2>${esc(heading)}</h2><p>${esc(detail)}</p><a class="source-link" href="https://github.com/auraoneai/aura3d/blob/main/${source}">Read the implementation <span aria-hidden="true">↗</span></a></section>
    <section><h2>Build your own game</h2><p>${starterIntro} Run these commands, then open the address printed in your terminal.</p>
    <!--email_off--><pre tabindex="0" aria-label="Terminal commands"><code>${code}</code></pre><!--/email_off--><a class="source-link" href="/docs/templates">Explore the starter templates</a></section>
  </div>
</main>${footer}</body></html>
`;
}

function card(g) {
  return `<article class="game"><a class="showcase-card is-game" href="${g.url}" data-preview="${g.previewSlug}" aria-label="Play ${esc(g.title)}"><figure class="showcase-card__media">${image(g)}<span class="play-icon" aria-hidden="true">▶</span></figure></a>
  <h3><a href="${gameGuidePath(g)}">${esc(g.title)}</a></h3><p>${esc(g.guide.summary)}</p>
  <div class="card-actions"><a href="${g.url}" aria-label="Play ${esc(g.title)}">Play game</a><a href="${gameGuidePath(g)}" aria-label="How ${esc(g.title)} was built">How it was built</a></div></article>`;
}

const genres = Object.entries(catalog.genres);
const sections = genres.map(([key, label]) => `<section class="genre-section" id="genre-${key}" aria-labelledby="title-${key}">
  <h2 id="title-${key}">${esc(label)}</h2><div class="games-library">${games.filter((g) => g.genre === key).map(card).join("\n")}</div>
</section>`).join("\n");
const featured = games.find((g) => g.previewSlug === "top-tennis");
const body = `<body>${nav}<main id="main" class="wrap">
<header class="gallery-intro"><h1>The games</h1><p class="lede">Pick a world, play a round, then open the code that makes it work. All ${games.length} run in your browser.</p></header>
<section class="spotlight gallery-feature" aria-label="Featured game"><a class="hero-frame" href="${featured.url}" aria-label="Play ${esc(featured.title)}">${image(featured,true)}</a>
  <div class="spot-copy"><span class="genre-link">Featured game</span><h2>${esc(featured.title)}</h2><p class="lede">${esc(featured.guide.summary)}</p>
  <div class="actions"><a class="primary" href="${featured.url}">Play Aura Slam</a><a href="${gameGuidePath(featured)}">Inside the game</a></div></div>
</section>
<div class="browse" id="games"><h2 id="games-title">Browse by genre</h2><nav aria-label="Game genres">${genres.map(([key,label]) => `<a href="#genre-${key}">${esc(label)}</a>`).join("")}</nav></div>
${sections}</main>${footer}<script type="module" src="./src/main.ts"></script></body>
</html>
`;
const indexPath = "apps/showcase-index/index.html";
const head = read(indexPath).split(/<body[^>]*>/)[0];
write(indexPath, head + body);
for (const g of games) write(`marketing/public${gameGuidePath(g)}index.html`, guide(g));
console.log(`Gallery and ${games.length} game guides ${check ? "verified" : "synchronized"}.`);
