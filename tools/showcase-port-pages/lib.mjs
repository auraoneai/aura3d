import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** showcase slug -> example folder (the example page is the source of truth for markup and styling). */
export const PORT_PAGES = [
  ["strange-orbit", "strange-orbit-port"],
  ["splat-rush", "splat-rush-port"],
  ["serpentine-sky-run", "saiyan-snake-way-port"],
  ["drift-and-deliver", "drift-and-deliver-port"],
  ["heatsink", "heatsink-port"],
  ["ninja-runner", "ninja-runner-port"],
  ["last-train", "last-train-port"],
  ["roadster-hours", "roadster-hours-port"],
  ["where-the-wind-wanders", "where-the-wind-wanders-port"],
  ["silt-and-signal", "silt-and-signal-port"],
  ["cloud-runner", "kid-goku-beyond-the-clouds-port"]
];

export const appPagePath = (slug) => resolve(root, "apps", `showcase-${slug}-port`, "index.html");
export const examplePagePath = (folder) => resolve(root, "examples", folder, "index.html");
export const labelsPath = (slug) => resolve(root, "apps", `showcase-${slug}-port`, "src", "labels.ts");

/** Neutral display names for the renamed ports (read from the app's labels.ts so there is one source). */
export function readNeutralLabels(slug) {
  const file = labelsPath(slug);
  if (!existsSync(file)) return [];
  const text = readFileSync(file, "utf8");
  const pairs = [];
  for (const match of text.matchAll(/\[\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\]/g)) pairs.push([match[1], match[2]]);
  return pairs;
}

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Pieces of the existing app page that are NOT in the example page: head metadata and the port banner. */
export function extractAppExtras(appHtml) {
  const headMatch = appHtml.match(/<head>([\s\S]*?)<\/head>/);
  const head = headMatch ? headMatch[1] : "";
  const metas = [...head.matchAll(/<meta\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => !/charset=|name="viewport"/.test(tag));
  const links = [...head.matchAll(/<link\b[^>]*>/g)].map((m) => m[0]);
  const noteStyle = (head.match(/<style>\.aura-port-note[\s\S]*?<\/style>/) ?? [""])[0];
  const title = (head.match(/<title>[\s\S]*?<\/title>/) ?? [""])[0];
  const note = (appHtml.match(/<aside class="aura-port-note"[\s\S]*?<\/aside>/) ?? [""])[0];
  return { metas, links, noteStyle, title, note };
}

/**
 * Compose a showcase app page: the example page verbatim (all markup, ids, CSS) plus the app's head metadata and
 * banner, with the entry script pointed at the app's src/main.ts. Neutral labels are applied to static HTML text.
 */
export function composePortPage({ exampleHtml, appHtml, labels = [] }) {
  const extras = extractAppExtras(appHtml);
  let html = exampleHtml;

  const hasHref = (href) => html.includes(`href="${href}"`);
  const headAdditions = [
    ...extras.metas.filter((tag) => !html.includes(tag)),
    ...extras.links.filter((tag) => {
      const href = (tag.match(/href="([^"]+)"/) ?? [])[1];
      return !href || !hasHref(href);
    }),
    extras.noteStyle
  ].filter(Boolean).map((line) => `  ${line.trim()}`).join("\n");

  if (extras.title) html = html.replace(/<title>[\s\S]*?<\/title>/, extras.title.trim());
  html = html.replace(/(<title>[\s\S]*?<\/title>)/, `${headAdditions ? `${headAdditions}\n  ` : ""}$1`);

  html = html.replace(/<script type="module" src="\.\/main\.ts"><\/script>/, '<script type="module" src="./src/main.ts"></script>');
  if (extras.note) html = html.replace(/<\/body>/, `  ${extras.note.trim()}\n</body>`);

  return applyNeutralLabels(html, labels);
}

/**
 * Replace names in visible text and a few accessible-name attributes only. Ids, classes, CSS and scripts are left
 * untouched so the game's own element lookups keep working.
 */
export function applyNeutralLabels(html, labels) {
  if (labels.length === 0) return html;
  const swap = (text) => labels.reduce((acc, [from, to]) => acc.replace(new RegExp(escapeRegExp(from), "gi"), to), text);
  let skip = null; // "style" | "script" while inside those elements
  return html.split(/(<[^>]*>)/g).map((chunk) => {
    if (chunk.startsWith("<")) {
      const open = chunk.match(/^<(style|script)\b/i);
      if (open) skip = open[1].toLowerCase();
      else if (skip && new RegExp(`^</${skip}\\s*>`, "i").test(chunk)) skip = null;
      return chunk.replace(/\b(aria-label|title|alt|placeholder)="([^"]*)"/gi, (_m, name, value) => `${name}="${swap(value)}"`);
    }
    return skip ? chunk : swap(chunk);
  }).join("");
}

export function readFileText(path) {
  return readFileSync(path, "utf8");
}

export function idsOf(html) {
  return new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
}
