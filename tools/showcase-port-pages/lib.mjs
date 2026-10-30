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

/**
 * "Built with Aura3D" credit (audit 2026-10-29, cross-cutting: the fixed bottom-left link sat over Chroma Roll's mute button and
 * The Bellkeeper's Walk's joystick, so a tap could leave the game). The credit now
 *  1. takes the first corner whose box overlaps no visible control (buttons, links, inputs, `.no-steer`, touch and joystick
 *     layers) and no fixed or absolute HUD element (Duneglide's flight readout sat under it too), re-checked on resize
 *     and after the game mounts its controls, and
 *  2. fades out on the first key press or pointer press outside it, so it never covers play, and
 *  3. carries `no-steer`, so a press on it does not also steer or start the game (Chroma Roll reads that class).
 * pickCreditSpot is pure so tests can drive it; the page runs the same source (read from this file).
 */
export function pickCreditSpot(view, size, obstacles, margin) {
  var m = margin == null ? 8 : margin;
  var spots = [
    { left: m, bottom: m },
    { right: m, bottom: m },
    { right: m, top: m },
    { left: m, top: m }
  ];
  var best = null;
  function hits(x, y) {
    var list = [];
    for (var j = 0; j < obstacles.length; j++) {
      var o = obstacles[j];
      var ox = Math.max(0, Math.min(x + size.w, o.x + o.w) - Math.max(x, o.x));
      var oy = Math.max(0, Math.min(y + size.h, o.y + o.h) - Math.max(y, o.y));
      if (ox * oy > 0) list.push({ o: o, area: ox * oy });
    }
    return list;
  }
  function area(list) { var a = 0; for (var k = 0; k < list.length; k++) a += list[k].area; return a; }
  for (var i = 0; i < spots.length; i++) {
    var s = spots[i];
    var x = s.left != null ? s.left : view.w - m - size.w;
    var y = s.top != null ? s.top : view.h - m - size.h;
    var overlap = area(hits(x, y));
    if (overlap === 0) return { spot: s, overlap: 0, index: i };
    if (!best || overlap < best.overlap) best = { spot: s, overlap: overlap, index: i };
  }
  // Every corner covers a control (a phone, where the credit spans the width): slide each corner's box along the edge's
  // normal, bottom ones up past what they cover and top ones down, and take the first position that covers nothing.
  for (var i2 = 0; i2 < spots.length; i2++) {
    var s2 = spots[i2];
    var x2 = s2.left != null ? s2.left : view.w - m - size.w;
    var y2 = s2.top != null ? s2.top : view.h - m - size.h;
    for (var step = 0; step < 8; step++) {
      var list = hits(x2, y2);
      if (list.length === 0) {
        var shifted = s2.left != null ? { left: m } : { right: m };
        if (s2.top != null) shifted.top = Math.round(y2); else shifted.bottom = Math.round(view.h - y2 - size.h);
        return { spot: shifted, overlap: 0, index: i2 };
      }
      var edge = s2.top != null ? -Infinity : Infinity;
      for (var k2 = 0; k2 < list.length; k2++) edge = s2.top != null ? Math.max(edge, list[k2].o.y + list[k2].o.h) : Math.min(edge, list[k2].o.y);
      y2 = s2.top != null ? edge + m : edge - m - size.h;
      if (y2 < m || y2 + size.h > view.h - m) break;
    }
  }
  return best;
}

const CREDIT_CONTROLS = "button,a[href],input,select,textarea,[role=button],[role=slider],.no-steer,[data-touch],[class*=touch],[class*=joystick],[class*=joy-],[class*=dpad],[id*=touch],[id*=joystick],[id$=-pad],[id$=-stick]";
// The page source is read from this file, not from Function.prototype.toString: test runners transform modules
// (vitest adds semicolons), so toString() would make the composed page depend on who imported this file.
const PICK_CREDIT_SPOT_SOURCE = (() => {
  const text = readFileSync(fileURLToPath(import.meta.url), "utf8");
  const start = text.indexOf("function pickCreditSpot(");
  const end = text.indexOf("\n}\n", start);
  return text.slice(start, end + 2);
})();
const creditScript = () => `(function(){var c=document.currentScript&&document.currentScript.parentElement;if(!c)return;var pick=${PICK_CREDIT_SPOT_SOURCE};` +
  `function obstacles(){var out=[],vw=innerWidth,vh=innerHeight;document.querySelectorAll("body *").forEach(function(el){if(c.contains(el)||el.contains(c)||el.tagName==="CANVAS"||el.tagName==="SCRIPT"||el.tagName==="STYLE")return;var s=getComputedStyle(el);var control=el.matches(${JSON.stringify(CREDIT_CONTROLS)});if(!control&&s.position!=="fixed"&&s.position!=="absolute"&&s.position!=="sticky")return;if(s.visibility==="hidden"||s.display==="none"||+s.opacity===0)return;var r=el.getBoundingClientRect();if(r.width<1||r.height<1||r.width*r.height>vw*vh*0.5)return;out.push({x:r.left,y:r.top,w:r.width,h:r.height});});return out;}` +
  `function place(){if(c.classList.contains("is-hidden"))return;var r=c.getBoundingClientRect(),p=pick({w:innerWidth,h:innerHeight},{w:r.width,h:r.height},obstacles(),8).spot;["left","right","top","bottom"].forEach(function(k){c.style[k]=p[k]==null?"auto":p[k]+"px";});c.dataset.spot=(p.top!=null?"top":"bottom")+"-"+(p.left!=null?"left":"right");}` +
  `function hide(e){if(e&&e.type==="keydown"&&(e.key==="Tab"||e.key==="Shift"))return;if(e&&e.target&&e.target.nodeType===1&&c.contains(e.target))return;c.classList.add("is-hidden");removeEventListener("keydown",hide,true);removeEventListener("pointerdown",hide,true);}` +
  `addEventListener("keydown",hide,true);addEventListener("pointerdown",hide,true);addEventListener("resize",place);[0,600,2000,5000].forEach(function(t){setTimeout(place,t);});})();`;

/** One source for the credit markup; rename.mjs and composePortPage both write exactly these. */
export const CREDIT_STYLE = '<style>.aura-credit{position:fixed;left:8px;bottom:8px;z-index:2147483000;max-width:min(560px,calc(100vw - 16px));padding:5px 9px;border-radius:6px;background:rgba(11,16,32,.82);color:#e8ecf4;font:400 12px/1.4 "Graphik Web",sans-serif;pointer-events:none;transition:opacity .35s ease,visibility 0s linear 0s}.aura-credit.is-hidden{opacity:0;visibility:hidden;transition:opacity .35s ease,visibility 0s linear .35s}.aura-credit a{color:#4ade9d;pointer-events:auto;text-decoration:none}.aura-credit.is-hidden a{pointer-events:none}.aura-credit a:hover{text-decoration:underline}@media (max-width:560px){.aura-credit{font-size:11px;max-width:calc(100vw - 16px)}}</style>';
export const CREDIT_NOTE = `<aside class="aura-credit no-steer" role="note"><a href="/apps/showcase-index/">Built with Aura3D</a> · independent game, not affiliated with any other game or studio.<script>${creditScript()}</script></aside>`;

/** Pieces of the existing app page that are NOT in the example page: head metadata and the port banner. */
export function extractAppExtras(appHtml) {
  const headMatch = appHtml.match(/<head>([\s\S]*?)<\/head>/);
  const head = headMatch ? headMatch[1] : "";
  const metas = [...head.matchAll(/<meta\b[^>]*>/g)]
    .map((m) => m[0])
    .filter((tag) => !/charset=|name="viewport"/.test(tag));
  const links = [...head.matchAll(/<link\b[^>]*>/g)].map((m) => m[0]);
  const noteStyle = (head.match(/<style>\.aura-(?:port-note|credit)[\s\S]*?<\/style>/) ?? [""])[0];
  const title = (head.match(/<title>[\s\S]*?<\/title>/) ?? [""])[0];
  const note = (appHtml.match(/<aside class="aura-(?:port-note|credit)[^"]*"[\s\S]*?<\/aside>/) ?? [""])[0];
  // Page-only head styles the app adds on top of the example (Duneglide lifts its bottom HUD clear of the credit).
  const styles = [...head.matchAll(/<style>[\s\S]*?<\/style>/g)].map((m) => m[0]).filter((tag) => tag !== noteStyle && !/^<style>\.aura-(?:port-note|credit)/.test(tag));
  return { metas, links, noteStyle, title, note, styles };
}

/**
 * Compose a showcase app page: the example page verbatim (all markup, ids, CSS) plus the app's head metadata and
 * banner, with the entry script pointed at the app's src/main.ts. Neutral labels are applied to static HTML text.
 */
export function composePortPage({ exampleHtml, appHtml, labels = [] }) {
  const found = extractAppExtras(appHtml);
  // The credit is always the canonical one, so a fix to its placement reaches every page on the next sync.
  const extras = { ...found, noteStyle: found.noteStyle ? CREDIT_STYLE : "", note: found.note ? CREDIT_NOTE : "" };
  let html = exampleHtml;

  const hasHref = (href) => html.includes(`href="${href}"`);
  const headAdditions = [
    ...extras.metas.filter((tag) => !html.includes(tag)),
    ...extras.links.filter((tag) => {
      const href = (tag.match(/href="([^"]+)"/) ?? [])[1];
      return !href || !hasHref(href);
    }),
    extras.noteStyle,
    ...extras.styles.filter((tag) => !html.includes(tag))
  ].filter(Boolean).map((line) => `  ${line.trim()}`).join("\n");

  if (extras.title) html = html.replace(/<title>[\s\S]*?<\/title>/, extras.title.trim());
  html = html.replace(/(<title>[\s\S]*?<\/title>)/, `${headAdditions ? `${headAdditions}\n  ` : ""}$1`);

  html = html.replace(/<script type="module" src="\.\/main\.ts"><\/script>/, '<script type="module" src="./src/main.ts"></script>');
  if (extras.note) html = html.replace(/<\/body>/, () => `  ${extras.note.trim()}\n</body>`);

  return applyNeutralLabels(html, labels);
}

/**
 * Replace names in visible text and a few accessible-name attributes only. Ids, classes, CSS and scripts are left
 * untouched so the game's own element lookups keep working.
 */
export function applyNeutralLabels(html, labels, caseAware = false) {
  if (labels.length === 0) return html;
  // Inline scripts (the credit placement script) contain "<" comparisons that the tag split below would read as tags,
  // so whole <script> and <style> elements are set aside first and restored untouched.
  const kept = [];
  const masked = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, (block) => `\u0000${kept.push(block) - 1}\u0000`);
  return applyNeutralLabelsToMarkup(masked, labels, caseAware).replace(/\u0000(\d+)\u0000/g, (_m, i) => kept[Number(i)]);
}

function applyNeutralLabelsToMarkup(html, labels, caseAware) {
  const swap = (text) => labels.reduce((acc, [from, to]) => acc.replace(new RegExp(escapeRegExp(from), "gi"), (m) => (caseAware && /[A-Z]/.test(m) && m === m.toUpperCase() ? to.toUpperCase() : to)), text);
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
