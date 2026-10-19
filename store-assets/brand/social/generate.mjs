#!/usr/bin/env node
/**
 * Aura3D social/brand asset generator — committed and re-runnable.
 *
 * Run from anywhere inside the repo:
 *   node store-assets/brand/social/generate.mjs
 *
 * Master source (all elements taken from already-committed repo identity,
 * nothing invented — see README.md next to this script):
 *   - Wordmark text:  "Aura3D"            (nav brand span + og:site_name, index.html)
 *   - Tagline text:   "AI-Native TypeScript 3D SDK for Browser 3D Apps" (frozen <title> copy)
 *   - Mark geometry:  inline nav brand-mark SVG in index.html (light-background variant:
 *                     #38bdf8 orbit body + #34d399 tilted ellipse), reproduced verbatim below
 *   - Colors:         marketing/src/styles.css tokens — --bg #fbfbf8, --ink #1a1e26, --ink-2 #565d69
 *   - Typography:     Graphik Web (licensed), repo-committed files in public/fonts/graphik/
 *                     wordmark Semibold (repo display weight), tagline Regular
 *
 * Renderer: Playwright Chromium via the repo's own devDependency.
 * Launch fallback chain: bundled build → Chrome channel → any cached ms-playwright build.
 */

import { createRequire } from 'node:module';
import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(SCRIPT_DIR, '..', '..', '..');

// Committed licensed fonts (never downloaded, never system fonts).
// Inlined as base64 data URIs: page.setContent() pages sit at about:blank, where
// file:// subresource fetches are blocked — data URIs guarantee the licensed face
// (not a system fallback) paints every render.
const FONT_SEMIBOLD_URI = 'data:font/woff2;base64,' + readFileSync(join(REPO_ROOT, 'public', 'fonts', 'graphik', 'Graphik-Semibold-Web.woff2')).toString('base64');
const FONT_REGULAR_URI = 'data:font/woff2;base64,' + readFileSync(join(REPO_ROOT, 'public', 'fonts', 'graphik', 'Graphik-Regular-Web.woff2')).toString('base64');

// Frozen brand tokens (marketing/src/styles.css).
const BG = '#fbfbf8';
const INK = '#1a1e26';
const INK_2 = '#565d69';

const WORDMARK = 'Aura3D';
const TAGLINE = 'AI-Native TypeScript 3D SDK for Browser 3D Apps';
const TAGLINE_BREAK = 'AI-Native TypeScript 3D SDK<br>for Browser 3D Apps'; // profiles only (circle crop)

// Nav brand-mark from index.html, reproduced exactly (24x24 viewBox).
const MARK_SVG = `
<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <circle cx="12" cy="12" r="6" stroke="#38bdf8" stroke-width="1.4" fill="rgba(56,189,248,0.14)" />
  <ellipse cx="12" cy="12" rx="11" ry="3" stroke="#34d399" stroke-width="1.1" opacity="0.72" transform="rotate(-22 12 12)" />
  <circle cx="12" cy="12" r="1.7" fill="#38bdf8" />
</svg>`;

const PAGE_CSS = `
@font-face { font-family: 'Graphik Web'; src: url('${FONT_SEMIBOLD_URI}') format('woff2'); font-weight: 600; font-style: normal; }
@font-face { font-family: 'Graphik Web'; src: url('${FONT_REGULAR_URI}') format('woff2'); font-weight: 400; font-style: normal; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; overflow: hidden; background: ${BG};
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
.stage { position: relative; width: 100vw; height: 100vh; display: flex; align-items: center; justify-content: center; }
.lockup { display: flex; flex-direction: column; align-items: center; text-align: center; font-synthesis: none; }
.mark svg { display: block; }
.word { font-family: 'Graphik Web', sans-serif; font-weight: 600; color: ${INK}; letter-spacing: -0.01em; line-height: 1.1; }
.tagline { font-family: 'Graphik Web', sans-serif; font-weight: 400; color: ${INK_2}; line-height: 1.35; }
.row { display: flex; align-items: center; justify-content: center; }
`;

/** Vertical lockup (mark above word above tagline) — profiles + og + twitter card. */
function verticalHTML({ markPx, wordPx, taglinePx, gapMark, gapWord, taglineBreak }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${PAGE_CSS}</style></head>
<body><div class="stage"><div class="lockup">
  <div class="mark" style="width:${markPx}px;height:${markPx}px">${MARK_SVG.replace('<svg ', `<svg style="width:${markPx}px;height:${markPx}px" `)}</div>
  <div class="word" style="font-size:${wordPx}px;margin-top:${gapMark}px">${WORDMARK}</div>
  <div class="tagline" style="font-size:${taglinePx}px;margin-top:${gapWord}px">${taglineBreak ? TAGLINE_BREAK : TAGLINE}</div>
</div></div></body></html>`;
}

/** Horizontal lockup (mark beside word, tagline under) — wide banners, text in CENTER safe area. */
function horizontalHTML({ markPx, wordPx, taglinePx, gapRow, gapTag }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${PAGE_CSS}</style></head>
<body><div class="stage"><div class="lockup">
  <div class="row">
    <div class="mark" style="width:${markPx}px;height:${markPx}px">${MARK_SVG.replace('<svg ', `<svg style="width:${markPx}px;height:${markPx}px" `)}</div>
    <div class="word" style="font-size:${wordPx}px;margin-left:${gapRow}px">${WORDMARK}</div>
  </div>
  <div class="tagline" style="font-size:${taglinePx}px;margin-top:${gapTag}px">${TAGLINE}</div>
</div></div></body></html>`;
}

const CANVASES = [
  // Square profiles — all content inside the central circle safe zone (~76% diameter),
  // so circular crops on X/LinkedIn/GitHub keep the full lockup.
  { file: 'profile-400.png', width: 400, height: 400,
    html: verticalHTML({ markPx: 100, wordPx: 44, taglinePx: 16, gapMark: 18, gapWord: 10, taglineBreak: true }) },
  { file: 'profile-800.png', width: 800, height: 800,
    html: verticalHTML({ markPx: 200, wordPx: 88, taglinePx: 32, gapMark: 36, gapWord: 20, taglineBreak: true }) },

  // Link/OG and Twitter summary-large-image cards.
  { file: 'og-1200x630.png', width: 1200, height: 630,
    html: verticalHTML({ markPx: 150, wordPx: 88, taglinePx: 31, gapMark: 28, gapWord: 16, taglineBreak: false }) },
  { file: 'twitter-1200x600.png', width: 1200, height: 600,
    html: verticalHTML({ markPx: 128, wordPx: 74, taglinePx: 27, gapMark: 24, gapWord: 14, taglineBreak: false }) },

  // X header 1500x500 — visible area varies per device; entire lockup sits in the
  // conservative central band (~1260x300), i.e. text CENTER safe area.
  { file: 'banner-x-1500x500.png', width: 1500, height: 500,
    html: horizontalHTML({ markPx: 92, wordPx: 60, taglinePx: 25, gapRow: 26, gapTag: 14 }) },

  // Generic cover 2560x1440 (YouTube/Facebook/LinkedIn class) — lockup inside the
  // central ~1200x420 safe area shared by those crops, vertically centered.
  { file: 'banner-cover-2560x1440.png', width: 2560, height: 1440,
    html: horizontalHTML({ markPx: 176, wordPx: 116, taglinePx: 46, gapRow: 48, gapTag: 20 }) },
];

async function launchChromium() {
  // 1) Playwright's own pinned build.
  try { return await chromium.launch({ headless: true }); } catch { /* fall through */ }
  // 2) Installed Google Chrome (stable channel).
  try { return await chromium.launch({ headless: true, channel: 'chrome' }); } catch { /* fall through */ }
  // 3) Newest cached ms-playwright chromium build present on this machine.
  const cacheDir = join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
  if (existsSync(cacheDir)) {
    const candidates = readdirSync(cacheDir)
      .filter((d) => /^chromium-\d+$/.test(d))
      .map((d) => {
        const exec = join(cacheDir, d, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium');
        return existsSync(exec) ? { exec, n: Number(d.replace('chromium-', '')) } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.n - a.n);
    if (candidates.length) {
      return chromium.launch({ headless: true, executablePath: candidates[0].exec });
    }
  }
  throw new Error('No Chromium available: run `npx playwright install chromium` or install Google Chrome.');
}

const browser = await launchChromium();
const page = await browser.newPage({ deviceScaleFactor: 1 });

const manifest = [];
for (const c of CANVASES) {
  await page.setViewportSize({ width: c.width, height: c.height });
  await page.setContent(c.html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready); // licensed fonts must be live before raster
  // Hard gate: refuse to raster if the licensed Graphik files did not load (fallback would violate the brand spec).
  const fontOk = await page.evaluate(() =>
    document.fonts.check('600 88px "Graphik Web"') && document.fonts.check('400 31px "Graphik Web"'));
  if (!fontOk) throw new Error(`Graphik Web did not load for ${c.file}; aborting rather than rasterizing a fallback face.`);
  await page.waitForTimeout(50);
  const out = join(SCRIPT_DIR, c.file);
  await page.screenshot({ path: out, clip: { x: 0, y: 0, width: c.width, height: c.height } });
  const bytes = statSync(out).size;
  manifest.push({ file: c.file, width: c.width, height: c.height, bytes });
}

await browser.close();

console.log('Aura3D brand/social renders:');
for (const m of manifest) {
  console.log(`  ${m.file.padEnd(26)} ${m.width}x${m.height}  ${(m.bytes / 1024).toFixed(1)} KB`);
}
