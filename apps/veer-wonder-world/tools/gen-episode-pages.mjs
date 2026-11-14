#!/usr/bin/env node
// Generates static, tracker-free companion HTML pages (`dist/episodes/<id>/index.html`)
// for published Wonder World shows (PRD 09 D.5, F.2 D1).
//
// Privacy & D1 invariants:
// - `<meta name="robots" content="noindex, nofollow">` (respects unlisted D1 default until flipped)
// - `<meta name="referrer" content="no-referrer">`
// - Strict inline-only CSP (`default-src 'none'; style-src 'unsafe-inline'`)
// - Zero `<script>` tags, zero external URLs, zero cookies/storage/analytics, zero child data.
//
// Usage:
//   node tools/gen-episode-pages.mjs [--dist <dir>] [--locale <en|pa|es|hi>]

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKING_SUFFIX = "-wonder-world";

function deriveGuardNames(rootDir = appRoot) {
  const folder = basename(rootDir);
  return folder.endsWith(WORKING_SUFFIX) && folder.length > WORKING_SUFFIX.length
    ? [folder.slice(0, -WORKING_SUFFIX.length)]
    : [];
}

/** Escapes text safely for HTML body and attribute contexts. */
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Formats non-negative seconds as `M:SS` for chapter lists. */
export function formatChapterTime(seconds) {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function estimateSegmentSeconds(segment, showPauseMs, locale) {
  let ms = 0;
  for (const beat of segment.beats ?? []) {
    for (const line of beat.lines ?? []) {
      const text = locale?.lines?.[line.key] ?? "";
      const words = Math.max(1, String(text).trim().split(/\s+/).filter(Boolean).length);
      ms += Math.max(1500, 900 + words * 380);
    }
    ms += Number.isFinite(beat.holdMs) && beat.holdMs > 0 ? beat.holdMs : 0;
    const isPause = beat.kind === "invite" || (beat.input && beat.input.type !== "none");
    if (isPause) {
      const p = Number.isFinite(beat.pauseMs) && beat.pauseMs > 0 ? beat.pauseMs : showPauseMs || 2500;
      ms += p;
    }
    if (beat.response) {
      for (const line of beat.response.lines ?? []) {
        const text = locale?.lines?.[line.key] ?? "";
        const words = Math.max(1, String(text).trim().split(/\s+/).filter(Boolean).length);
        ms += Math.max(1500, 900 + words * 380);
      }
      ms += Number.isFinite(beat.response.holdMs) && beat.response.holdMs > 0 ? beat.response.holdMs : 0;
    }
  }
  return Math.round(ms / 1000);
}

const BAND_LABELS = {
  little: "Ages 1-2 (co-viewing together with a grown-up)",
  toddler: "Ages 2-3 (best watched and played together)",
  preschool: "Ages 3-5 (calm story & word play)"
};

function sanitizeGuardText(text, guardNames) {
  let clean = String(text ?? "").replace(/https?:\/\/\S+/gi, "");
  for (const guard of guardNames) {
    if (!guard) continue;
    const rx = new RegExp(`(?<![a-z0-9])${guard.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`, "gi");
    clean = clean.replace(rx, "");
  }
  return clean.trim();
}

/**
 * Renders a self-contained static HTML companion page for a single `ShowSpec`.
 * Contains zero external URLs, zero `<script>` tags, zero trackers/cookies,
 * and `<meta name="robots" content="noindex, nofollow">`.
 */
export function renderEpisodePageHtml(show, locale, opts = {}) {
  const guardNames = opts.guardNames ?? deriveGuardNames();
  const lang = escapeHtml(locale?.locale ?? "en");
  const rawTitle = locale?.strings?.[show.titleKey] ?? show.youtube?.title ?? show.id;
  const title = escapeHtml(sanitizeGuardText(rawTitle, guardNames));
  const offlinePlay = escapeHtml(
    sanitizeGuardText(
      locale?.strings?.[show.offlinePlayKey] ?? "Find a favourite toy together and take turns naming what you see.",
      guardNames
    )
  );
  const caregiverBridge = escapeHtml(
    sanitizeGuardText(
      locale?.strings?.[show.caregiverBridgeKey] ?? "At each gentle pause, wait for your child's look, gesture or word, then answer warmly together.",
      guardNames
    )
  );
  const bandNote = escapeHtml(BAND_LABELS[show.band] ?? BAND_LABELS.toddler);
  const codeUpper = escapeHtml(String(show.code ?? "").toUpperCase());
  const isShort = (show.aspect ?? "16:9") === "9:16";
  const formatBadge = isShort ? "Short (9:16)" : "Full Episode (16:9)";
  const durationLabel = formatChapterTime(show.estimatedDurationSec ?? 0);
  const relativePlayHref = `../../?show=${encodeURIComponent(show.id)}`;

  // Compute fallback chapter timestamps if atSec is omitted.
  const segStartMap = new Map();
  let runningSec = 0;
  for (const seg of show.segments ?? []) {
    segStartMap.set(seg.id, runningSec);
    runningSec += estimateSegmentSeconds(seg, show.pauseMs, locale);
  }

  const chapterItemsHtml = (show.chapters ?? [])
    .map((ch) => {
      const sec = ch.atSec !== undefined ? ch.atSec : (segStartMap.get(ch.segmentId) ?? 0);
      const chTitle = escapeHtml(
        sanitizeGuardText(locale?.strings?.[ch.titleKey] ?? ch.segmentId, guardNames)
      );
      return `        <li><span class="chapter-time">${formatChapterTime(sec)}</span> <span class="chapter-name">${chTitle}</span></li>`;
    })
    .join("\n");

  const targetWordsHtml = (show.targetWords ?? [])
    .map((w) => `        <li class="word-pill">${escapeHtml(sanitizeGuardText(w, guardNames))}</li>`)
    .join("\n");

  const supportWordsHtml = (show.supportWords ?? [])
    .map((w) => `        <li class="word-pill word-pill--support">${escapeHtml(sanitizeGuardText(w, guardNames))}</li>`)
    .join("\n");

  return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <meta name="referrer" content="no-referrer">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'">
  <title>${title} — Wonder World Grown-Up Guide</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #fffaf1;
      --card: #ffffff;
      --ink: #24303f;
      --muted: #556577;
      --accent: #2b7a69;
      --accent-soft: #e6f4ef;
      --border: #e5dec9;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-rounded, system-ui, sans-serif;
      background: var(--bg);
      color: var(--ink);
      line-height: 1.55;
      padding: 2rem 1.25rem 3.5rem;
    }
    main {
      max-width: 44rem;
      margin: 0 auto;
    }
    .eyebrow {
      display: inline-flex;
      gap: 0.5rem;
      align-items: center;
      font-size: 0.85rem;
      font-weight: 700;
      color: var(--accent);
      background: var(--accent-soft);
      padding: 0.28rem 0.7rem;
      border-radius: 999px;
      margin-bottom: 0.75rem;
    }
    h1 {
      font-size: clamp(1.65rem, 4vw, 2.2rem);
      line-height: 1.2;
      margin: 0 0 0.5rem;
    }
    .meta {
      color: var(--muted);
      font-size: 0.95rem;
      margin: 0 0 1.5rem;
    }
    .cta-link {
      display: inline-block;
      background: var(--accent);
      color: #ffffff;
      text-decoration: none;
      font-weight: 700;
      padding: 0.72rem 1.25rem;
      border-radius: 0.85rem;
      margin-bottom: 1.75rem;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 1rem;
      padding: 1.25rem 1.35rem;
      margin-bottom: 1.1rem;
    }
    h2 {
      font-size: 1.12rem;
      margin: 0 0 0.65rem;
    }
    p { margin: 0; }
    .word-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
    .word-pill {
      background: var(--accent-soft);
      color: var(--accent);
      font-weight: 700;
      padding: 0.3rem 0.75rem;
      border-radius: 999px;
      font-size: 0.95rem;
    }
    .word-pill--support {
      background: #f3efe4;
      color: var(--muted);
      font-weight: 600;
    }
    .chapter-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      gap: 0.45rem;
    }
    .chapter-list li {
      display: flex;
      gap: 0.75rem;
      align-items: baseline;
    }
    .chapter-time {
      font-variant-numeric: tabular-nums;
      font-weight: 700;
      color: var(--accent);
      min-width: 3.1rem;
    }
    footer {
      margin-top: 1.75rem;
      font-size: 0.85rem;
      color: var(--muted);
    }
  </style>
</head>
<body>
  <main>
    <div class="eyebrow">${codeUpper} · ${escapeHtml(formatBadge)} · ${durationLabel}</div>
    <h1>${title}</h1>
    <p class="meta">Wonder World Companion Guide · ${bandNote}</p>
    <a class="cta-link" href="${relativePlayHref}">Play this story together in Wonder World</a>

    <section class="card" aria-labelledby="words-heading">
      <h2 id="words-heading">Words for Grown-Ups to Notice Together</h2>
      <ul class="word-list">
${targetWordsHtml}
${supportWordsHtml}
      </ul>
    </section>

    <section class="card" aria-labelledby="bridge-heading">
      <h2 id="bridge-heading">Caregiver Co-Viewing Tip</h2>
      <p>${caregiverBridge}</p>
    </section>

    <section class="card" aria-labelledby="offline-heading">
      <h2 id="offline-heading">All Done! Offline Play Idea</h2>
      <p>${offlinePlay}</p>
    </section>

    <section class="card" aria-labelledby="chapters-heading">
      <h2 id="chapters-heading">Episode Chapters</h2>
      <ol class="chapter-list">
${chapterItemsHtml}
      </ol>
    </section>

    <footer>
      Play and language exposure, best watched together. Nothing leaves your device.
    </footer>
  </main>
</body>
</html>
`;
}

/**
 * Writes `episodes/<show.id>/index.html` inside `distDir` for each approved show
 * in `shows` and returns the list of generated file paths.
 */
export function generateEpisodePages({
  shows,
  locale,
  distDir = join(appRoot, "dist"),
  guardNames = deriveGuardNames()
}) {
  const written = [];
  for (const show of shows ?? []) {
    if (!show || show.kind !== "show") continue;
    if (show.review?.language !== "approved" || show.review?.rights !== "approved") continue;
    const html = renderEpisodePageHtml(show, locale, { guardNames });
    const outFile = join(distDir, "episodes", show.id, "index.html");
    mkdirSync(dirname(outFile), { recursive: true });
    writeFileSync(outFile, html, "utf8");
    written.push(outFile);
  }
  return written;
}

function loadShowsAndLocaleViaTsx(localeCode) {
  const bin = process.platform === "win32" ? "tsx.cmd" : "tsx";
  const candidates = [
    join(appRoot, "node_modules", ".bin", bin),
    join(appRoot, "..", "..", "node_modules", ".bin", bin)
  ];
  const tsxBin = candidates.find((c) => existsSync(c));
  if (!tsxBin) {
    throw new Error(`gen-episode-pages: tsx binary not found in ${candidates.join(", ")}`);
  }
  const loaderScript = `
    import { SHOWS } from "./src/content/shows/index.ts";
    import { resolveShowLocalePack } from "./tools/validate-show.ts";
    const locale = resolveShowLocalePack(${JSON.stringify(localeCode)});
    process.stdout.write(JSON.stringify({ shows: SHOWS, locale }));
  `;
  const proc = spawnSync(tsxBin, ["--input-type=module", "-e", loaderScript], {
    cwd: appRoot,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024
  });
  if (proc.status !== 0) {
    throw new Error(`gen-episode-pages loader failed: ${proc.stderr || proc.stdout}`);
  }
  return JSON.parse(proc.stdout);
}

function runCli(argv) {
  const getArg = (flag) => {
    const idx = argv.indexOf(flag);
    return idx >= 0 && idx + 1 < argv.length ? argv[idx + 1] : undefined;
  };
  const distDir = resolve(getArg("--dist") ?? join(appRoot, "dist"));
  const localeCode = getArg("--locale") ?? "en";
  const { shows, locale } = loadShowsAndLocaleViaTsx(localeCode);
  const written = generateEpisodePages({ shows, locale, distDir });
  console.log(`gen-episode-pages (${localeCode}): wrote ${written.length} companion page(s) under ${join(distDir, "episodes")}`);
  return 0;
}

const isDirectEntry =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirectEntry) {
  try {
    process.exitCode = runCli(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
    process.exitCode = 1;
  }
}
