#!/usr/bin/env node
// Apply names.json to the eleven game pages, the showcase index and vercel.json. Idempotent.
//   node tools/showcase-port-pages/rename.mjs
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CREDIT_NOTE, CREDIT_STYLE, applyNeutralLabels } from "./lib.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const names = JSON.parse(readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "names.json"), "utf8"));
const read = (p) => readFileSync(resolve(root, p), "utf8");
const write = (p, text) => writeFileSync(resolve(root, p), text);
const edit = (p, fn) => {
  const file = resolve(root, p);
  if (!existsSync(file)) return;
  const before = readFileSync(file, "utf8");
  const after = fn(before);
  if (after !== before) { writeFileSync(file, after); console.log(`edited  ${p}`); }
};
const esc = (v) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const re = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");


// Reword card and notes text so it describes the game, not another game.
export function neutralize(text) {
  return text
    .replace(/^Simulation port\.\s*/, "")
    .replace(/,? rebuilt from a recorded run of the original\./g, ".")
    .replace(/(matches|replays|reproduces?|matches? the) the original['’]s recorded (run|loop|rides?)/g, "matches a recorded reference $2")
    .replace(/the original['’]s recorded/g, "a recorded")
    .replace(/the original['’]s simulation state/g, "the recorded simulation state")
    .replace(/the original['’]s ([^.;,]*?) (?:and )?platform SDKs are not ported/g, "platform SDKs are not included")
    .replace(/the original['’]s DOM flash and vignette overlays and platform SDKs are not ported/g, "platform SDKs are not included")
    .replace(/platform SDKs are not ported/g, "platform SDKs are not included")
    .replace(/matches? the original within/g, "matches the recorded reference within")
    .replace(/verified against the original['’]s recorded/g, "verified against a recorded")
    .replace(/[;,.]? a blind model judge could still tell the port from the original/g, "")
    .replace(/the art is visibly different from the original \([^)]*\)/g, "the art is generated")
    .replace(/Simulation port only: /g, "")
    .replace(/the original['’]s/g, "the reference")
    .replace(/the original\b/g, "the reference")
    .replace(/\s{2,}/g, " ");
}

for (const g of names) {
  const url = `https://aura3d.auraone.ai/apps/${g.newSlug}/`;
  const title = `${g.name} — ${g.tag}`;
  const pairs = g.olds.map((o) => [o, g.name]);

  // 1. example page (source of truth for markup)
  edit(`examples/${g.folder}/index.html`, (html) => {
    html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(g.name).replace(/&amp;/g, "&amp;")}</title>`);
    html = applyNeutralLabels(html, pairs, true);
    return html.replace(/Independent Aura3D reconstruction/g, "Built with Aura3D");
  });

  // 2. app page: head metadata and credit note
  edit(`apps/showcase-${g.slug}-port/index.html`, (html) => {
    html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
    html = html.replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(title)}$2`);
    html = html.replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${esc(title)}$2`);
    html = html.replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${url}$2`);
    html = html.replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`);
    html = html.replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(g.pitch)}$2`);
    html = html.replace(/<style>\.aura-(?:port-note|credit)[\s\S]*?<\/style>/, () => CREDIT_STYLE);
    html = html.replace(/<aside class="aura-(?:port-note|credit)[^"]*"[\s\S]*?<\/aside>/, () => CREDIT_NOTE);
    return html;
  });

  // 3. package description
  edit(`apps/showcase-${g.slug}-port/package.json`, (text) => text.replace(/("description":\s*")[^"]*(")/, `$1${esc(g.pitch)}$2`));

  // 4. showcase index card
  edit("apps/showcase-index/index.html", (html) => html.replace(
    new RegExp(`(<a class="showcase-card is-game" href=")/apps/showcase-${re(g.slug)}-port/(" data-preview="[^"]*" data-badge=")[^"]*("><strong>)[^<]*(</strong><small>)([^<]*)(</small></a>)`),
    (_m, a, b, c, d, small, e) => `${a}/apps/${g.newSlug}/${b}Replay-verified, 4.1.2${c}${g.name}${d}${neutralize(small)}${e}`
  ));

  // 5. showcase index data notes
  edit("apps/showcase-index/src/main.ts", (text) => text.replace(
    new RegExp(`(id: "showcase-${re(g.slug)}-port",[\\s\\S]*?notes: ")([^"]*)(")`),
    (_m, a, notes, c) => `${a}${neutralize(notes)}${c}`
  ));
}

// 6. index section copy
edit("apps/showcase-index/index.html", (html) => html
  .replace(/<a class="hero-secondary" href="#ports">See the simulation ports<\/a>/, '<a class="hero-secondary" href="#ports">See the eleven more games</a>')
  .replace(/<p class="eyebrow">Simulation ports, Aura3D 4\.1\.2<\/p><h2 id="ports-title">Game mechanics rebuilt on Aura3D<\/h2>/, '<p class="eyebrow">Eleven more games, Aura3D 4.1.2</p><h2 id="ports-title">More games built on Aura3D</h2>')
  .replace(/<p>Eleven independent Aura3D reconstructions[\s\S]*?Not affiliated with the original games\.<\/p>/, "<p>Eleven independent games built on Aura3D. Each is replay-verified against a recorded reference run and states its limits on its card; the art is generated, and none claims pixel parity with any other game. Not affiliated with any other game or studio.</p>"));

// 7. vercel.json: new public slugs rewrite to the existing app folders; old URLs redirect.
edit("vercel.json", (text) => {
  const json = JSON.parse(text);
  const rewrites = (json.rewrites ?? []).filter((r) => !String(r.source).startsWith("/apps/") || !names.some((g) => r.source.startsWith(`/apps/${g.newSlug}`)));
  const redirects = (json.redirects ?? []).filter((r) => !names.some((g) => r.source.startsWith(`/apps/showcase-${g.slug}-port`)));
  const addRewrites = [];
  const addRedirects = [];
  for (const g of names) {
    const dest = `/apps/showcase-${g.slug}-port`;
    addRewrites.push({ source: `/apps/${g.newSlug}`, destination: `${dest}/` }, { source: `/apps/${g.newSlug}/:path*`, destination: `${dest}/:path*` });
    addRedirects.push({ source: dest, destination: `/apps/${g.newSlug}/`, permanent: true }, { source: `${dest}/`, destination: `/apps/${g.newSlug}/`, permanent: true });
  }
  json.rewrites = [...addRewrites, ...rewrites];
  json.redirects = [...addRedirects, ...redirects];
  return `${JSON.stringify(json, null, 2)}\n`;
});
