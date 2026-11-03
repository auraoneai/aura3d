#!/usr/bin/env node
/**
 * Renders docs/migration/4-to-5.md into marketing/docs/migration/4-to-5.html, the page behind
 * https://aura3d.auraone.ai/docs/migration/4-to-5 (the URL the 4.x deprecation messages print).
 *
 * The marketing docs are static HTML pages that share one shell (head, nav, footer) and
 * marketing/src/styles.css; this script reuses that shell from marketing/docs/deployment.html and
 * converts the guide's Markdown subset (headings, paragraphs, lists, task lists, tables, fenced code,
 * inline code, emphasis, links) without a Markdown dependency. Repository-relative links point at the
 * GitHub source; in-page anchors use GitHub heading slugs so `#4-breaking-changes` keeps working.
 *
 * Run from the repo root:  node marketing/scripts/gen-migration-doc.mjs           (write)
 *                          node marketing/scripts/gen-migration-doc.mjs --check   (fail if stale)
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const marketingDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(marketingDir, "..");
const ORIGIN = "https://aura3d.auraone.ai";
const SOURCE_REPO = "https://github.com/auraoneai/aura3d/blob/main";
const SOURCE = "docs/migration/4-to-5.md";
const OUTPUT = join(marketingDir, "docs", "migration", "4-to-5.html");
const ROUTE = "/docs/migration/4-to-5";
const SHELL = join(marketingDir, "docs", "deployment.html");
const CHECK = process.argv.includes("--check");

const escapeHtml = (value) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function slug(text) {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\p{Letter}\p{Number}\s_-]/gu, "")
    .trim()
    .replace(/\s/g, "-");
}

function linkTarget(href) {
  if (/^[a-z]+:/i.test(href) || href.startsWith("#")) return href;
  const [path, hash = ""] = href.split("#", 2);
  const repoPath = posix.normalize(posix.join(posix.dirname(SOURCE), path));
  if (repoPath === SOURCE) return hash ? `#${hash}` : ROUTE;
  return `${SOURCE_REPO}/${repoPath}${hash ? `#${hash}` : ""}`;
}

/** Inline Markdown: code spans first (verbatim), then links, strong and emphasis on escaped text. */
function inline(text) {
  const parts = text.split(/(`[^`]+`)/g);
  return parts
    .map((part) => {
      if (part.length > 1 && part.startsWith("`") && part.endsWith("`")) return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      return escapeHtml(part)
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
          const target = linkTarget(href.replace(/&amp;/g, "&"));
          const external = /^https?:/.test(target) && !target.startsWith(ORIGIN);
          return `<a href="${escapeHtml(target)}"${external ? ' rel="noopener"' : ""}>${label}</a>`;
        })
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/(^|[^*\w])\*([^*\s][^*]*)\*(?!\w)/g, "$1<em>$2</em>");
    })
    .join("")
    .replace(/<code>([^<]*)<\/code>/g, (match) => match.replace(/\\\|/g, "|"));
}

function tableCells(line) {
  const cells = [];
  let current = "";
  const body = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  for (let i = 0; i < body.length; i += 1) {
    if (body[i] === "\\" && body[i + 1] === "|") {
      current += "\\|";
      i += 1;
    } else if (body[i] === "|") {
      cells.push(current.trim());
      current = "";
    } else {
      current += body[i];
    }
  }
  cells.push(current.trim());
  return cells.map((cell) => cell.replace(/\\\|/g, "|"));
}

function renderBlocks(lines) {
  const out = [];
  let i = 0;
  const isBlank = (line) => line.trim() === "";
  const isListItem = (line) => /^(\s*)([-*]|\d+\.)\s+/.test(line);
  while (i < lines.length) {
    const line = lines[i];
    if (isBlank(line)) {
      i += 1;
      continue;
    }
    const fence = line.match(/^(\s*)```(\w*)\s*$/);
    if (fence) {
      const code = [];
      i += 1;
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) code.push(lines[i].slice(fence[1].length)), (i += 1);
      i += 1;
      const lang = fence[2] ? ` data-lang="${escapeHtml(fence[2])}"` : "";
      out.push(`<pre class="code doc-code"${lang}><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = Math.min(heading[1].length, 4);
      const html = inline(heading[2]);
      out.push(`<h${level} id="${slug(heading[2].replace(/`/g, ""))}">${html}</h${level}>`);
      i += 1;
      continue;
    }
    if (line.trim().startsWith("|") && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1])) {
      const head = tableCells(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) rows.push(tableCells(lines[i])), (i += 1);
      out.push(
        `<div class="doc-table-wrap"><table>\n<thead><tr>${head.map((cell) => `<th>${inline(cell)}</th>`).join("")}</tr></thead>\n<tbody>\n${rows
          .map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join("")}</tr>`)
          .join("\n")}\n</tbody>\n</table></div>`
      );
      continue;
    }
    if (isListItem(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (i < lines.length && (isListItem(lines[i]) || (isBlank(lines[i]) && i + 1 < lines.length && /^\s{2,}\S|^\s*([-*]|\d+\.)\s/.test(lines[i + 1])))) {
        if (isBlank(lines[i])) {
          i += 1;
          continue;
        }
        const marker = lines[i].match(/^(\s*)([-*]|\d+\.)\s+/);
        const indent = marker[0].length;
        const body = [lines[i].slice(indent)];
        i += 1;
        while (i < lines.length && (isBlank(lines[i]) ? i + 1 < lines.length && /^\s{2,}\S/.test(lines[i + 1]) : /^\s{2,}\S/.test(lines[i]) && !isListItem(lines[i]))) {
          body.push(lines[i].slice(Math.min(indent, lines[i].length - lines[i].trimStart().length)));
          i += 1;
        }
        items.push(body);
      }
      const tag = ordered ? "ol" : "ul";
      const rendered = items.map((body) => {
        const task = body[0].match(/^\[( |x)\]\s+(.*)$/i);
        if (task) {
          const checked = task[1].toLowerCase() === "x" ? " checked" : "";
          return `<li class="doc-task"><input type="checkbox" disabled${checked} aria-hidden="true" /> ${inline(task[2])}</li>`;
        }
        if (body.length === 1) return `<li>${inline(body[0])}</li>`;
        return `<li>${renderBlocks(body).join("\n")}</li>`;
      });
      out.push(`<${tag}>\n${rendered.join("\n")}\n</${tag}>`);
      continue;
    }
    const paragraph = [];
    while (i < lines.length && !isBlank(lines[i]) && !/^\s*```/.test(lines[i]) && !/^#{1,6}\s/.test(lines[i]) && !isListItem(lines[i]) && !lines[i].trim().startsWith("|")) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    out.push(`<p>${inline(paragraph.join(" "))}</p>`);
  }
  return out;
}

function render() {
  const markdown = readFileSync(join(repoRoot, SOURCE), "utf8").replace(/\r\n/g, "\n");
  const lines = markdown.split("\n");
  const titleLine = lines.findIndex((line) => line.startsWith("# "));
  const pageTitle = lines[titleLine].slice(2).trim();
  const version = markdown.match(/^Version:\s*(\S+)/m)?.[1] ?? "5.0.0";
  const bodyLines = lines.slice(titleLine + 1).filter((line) => !/^Version:\s/.test(line));
  const body = renderBlocks(bodyLines).join("\n");
  const toc = [...body.matchAll(/<h2 id="([^"]+)">(.*?)<\/h2>/g)]
    .map(([, id, html]) => `<a class="doc-pill" href="#${id}">${html.replace(/<[^>]+>/g, "")}</a>`)
    .join("\n          ");

  const shell = readFileSync(SHELL, "utf8");
  const headEnd = shell.indexOf("<header class=\"doc-hero\">");
  const footerStart = shell.indexOf("<footer>");
  if (headEnd < 0 || footerStart < 0) throw new Error(`gen-migration-doc: shell markers missing in ${SHELL}`);
  const title = `Migrate from Aura3D 4.x to ${version}`;
  const description = `Upgrade guide from Aura3D 4.x to ${version}: who is affected, upgrade steps, breaking changes, behavior changes, new opt-in features and removed deprecated APIs.`;
  const canonical = `${ORIGIN}${ROUTE}`;
  let head = shell.slice(0, headEnd);
  const replaceOnce = (pattern, value) => {
    if (!pattern.test(head)) throw new Error(`gen-migration-doc: shell head lacks ${pattern}`);
    head = head.replace(pattern, value);
  };
  replaceOnce(/<title>[^<]*<\/title>/, `<title>${escapeHtml(title)}</title>`);
  replaceOnce(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${escapeHtml(description)}" />`);
  replaceOnce(/<meta name="keywords" content="[^"]*" \/>/, `<meta name="keywords" content="Aura3D 5.0 migration, Aura3D upgrade guide, Aura3D breaking changes, @aura3d/engine 5.0.0" />`);
  replaceOnce(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${canonical}" />`);
  replaceOnce(/<meta property="og:title" content="[^"]*" \/>/, `<meta property="og:title" content="${escapeHtml(title)}" />`);
  replaceOnce(/<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${escapeHtml(description)}" />`);
  replaceOnce(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${canonical}" />`);
  replaceOnce(/<meta name="twitter:title" content="[^"]*" \/>/, `<meta name="twitter:title" content="${escapeHtml(title)}" />`);
  replaceOnce(/<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${escapeHtml(description)}" />`);
  replaceOnce(
    /<script type="application\/ld\+json">[^<]*<\/script>/,
    `<script type="application/ld+json">${JSON.stringify({
      "@context": "https://schema.org",
      "@type": "TechArticle",
      headline: title,
      description,
      softwareVersion: version,
      url: canonical,
      publisher: { "@type": "Organization", name: "Aura3D" }
    })}</script>`
  );
  head = head.replace(
    "</head>",
    `<style>
  .doc-prose { max-width: 960px; font-size: 16px; line-height: 1.6; color: var(--ink-1); }
  .doc-prose h2 { font-family: var(--sans); font-weight: 500; font-size: 24px; line-height: 1.25; color: var(--ink); margin: 48px 0 12px; padding-top: 24px; border-top: 1px solid var(--line); scroll-margin-top: 88px; }
  .doc-prose h2:first-child { margin-top: 0; padding-top: 0; border-top: 0; }
  .doc-prose h3 { font-weight: 500; font-size: 18px; line-height: 1.3; color: var(--ink); margin: 32px 0 8px; scroll-margin-top: 88px; }
  .doc-prose p, .doc-prose ul, .doc-prose ol { margin: 0 0 14px; }
  .doc-prose li { margin: 4px 0; }
  .doc-prose li > p { margin: 0 0 8px; }
  .doc-prose a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
  .doc-prose strong { font-weight: 500; color: var(--ink); }
  .doc-prose code { font-family: var(--mono); font-size: 0.9em; background: var(--bg-1); border: 1px solid var(--line); border-radius: 4px; padding: 0 4px; overflow-wrap: anywhere; }
  .doc-prose pre.code { margin: 12px 0 18px; }
  .doc-prose pre.code code { background: none; border: 0; padding: 0; font-size: 13px; }
  .doc-prose .doc-table-wrap { overflow-x: auto; margin: 12px 0 22px; border: 1px solid var(--line); border-radius: var(--radius-sm); }
  .doc-prose table { width: 100%; border-collapse: collapse; font-size: 14px; line-height: 1.5; }
  .doc-prose th { text-align: left; font-weight: 500; color: var(--ink); background: var(--bg-1); font-variant-caps: small-caps; }
  .doc-prose th, .doc-prose td { padding: 8px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
  .doc-prose tbody tr:last-child td { border-bottom: 0; }
  .doc-prose .doc-task { list-style: none; margin-left: -20px; }
</style>
</head>`
  );
  const footer = shell.slice(footerStart);

  const main = `<header class="doc-hero">
  <div class="wrap">
    <div>
      <span class="hero-tag"><span class="pill">DOCS</span><b>Migration</b><span class="mute">Aura3D ${escapeHtml(version)}</span></span>
      <h1>${escapeHtml(pageTitle)}</h1>
      <p class="hero-lede">Upgrade every <code>@aura3d/*</code> package together, fix the breaking changes listed below, then rebuild and run <code>check-deploy</code>. WebGL2 stays the default backend.</p>
      <div class="hero-cta">
        <a class="btn btn-primary" href="#3-upgrade-steps">Upgrade steps</a>
        <a class="btn btn-ghost" href="#4-breaking-changes">Breaking changes</a>
      </div>
    </div>
  </div>
</header>
<section class="tape doc-tape">
  <div class="wrap tape-inner">
    <span class="tape-label">On this page</span>
    <div class="doc-pill-row">
          ${toc}
    </div>
  </div>
</section>
<section class="section-tight">
  <div class="wrap">
    <article class="doc-prose">
${body}
    </article>
  </div>
</section>

`;
  const notice = `<!-- Generated by marketing/scripts/gen-migration-doc.mjs from ${SOURCE}; edit the Markdown and rerun. -->`;
  return `${head.replace(/^(<!doctype html>\n)/i, `$1${notice}\n`)}${main}${footer}`;
}

const html = render();
if (CHECK) {
  if (!existsSync(OUTPUT) || readFileSync(OUTPUT, "utf8") !== html) {
    console.error(`gen-migration-doc: ${OUTPUT} is stale; run node marketing/scripts/gen-migration-doc.mjs`);
    process.exit(1);
  }
  console.log("gen-migration-doc --check: OK");
} else {
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, html);
  console.log(`gen-migration-doc: wrote ${OUTPUT}`);
}
