#!/usr/bin/env node
// Render branded social artwork from shipped scene frames without a browser.
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import sharp from "sharp";
import { cards, root, sitePublic } from "../../tools/site/social-cards.mjs";

const store = join(root, "store-assets/brand/social");
const brandAssets = join(sitePublic, "store-assets/brand");
const paper = "#fbfbf8", ink = "#1a1e26", teal = "#0e6b7c";
const width = 1200, height = 630;
const canvas = (background) => sharp({ create: { width, height, channels: 3, background } });
const shot = (file, w, h, position = "centre") => sharp(file).resize(w, h, { fit: "cover", position }).removeAlpha().png().toBuffer();
const layer = (input, left, top) => ({ input, left, top });

const typeLayers = new Map();
async function words(text, size, color, weight = "Medium", maxWidth = null, family = "Aeonik Pro") {
  const file = family === "DINPro" ? "din-pro/DINPro-" + weight + ".woff" : "aeonik-pro/AeonikPro-" + weight + ".woff2";
  const fontfile = join(sitePublic, "fonts", file);
  const input = JSON.stringify({ text, size, color, family, weight, maxWidth, fontfile });
  if (!typeLayers.has(input)) {
    // FreeType opens the WOFF itself and verifies its internal family and cut.
    // This avoids the silent fallback possible with OS-specific Pango font discovery.
    const data = execFileSync("python3", [join(root, "marketing/scripts/render-card-type.py")], { input });
    typeLayers.set(input, { data, info: await sharp(data).metadata() });
  }
  return typeLayers.get(input);
}
async function brand(left, top, color = ink) {
  const name = color === paper ? "aura3d-logo-light.svg" : "aura3d-logo.svg";
  const logo = await sharp(join(brandAssets, name), { density: 144 }).resize(184, 46).png().toBuffer();
  return [layer(logo, left, top)];
}
async function home(card) {
  const imageTop = 190, imageHeight = 358;
  const panes = [{ x: 48, w: 274 }, { x: 330, w: 540 }, { x: 878, w: 274 }];
  const layers = await brand(48, 32);
  const title = await words(card.title, 67, ink, "Bold");
  layers.push(layer(title.data, 47, 100));
  const caption = ["Ember Courier", "Vesper GT", "Relay Workcell"];
  for (const [i, pane] of panes.entries()) {
    layers.push(layer(await shot(card.frames[i], pane.w, imageHeight), pane.x, imageTop));
    layers.push(layer((await words(caption[i], 23, ink, "Regular")).data, pane.x, 570));
  }
  return canvas(paper).composite(layers).png({ palette: true, colours: 256, quality: 95, effort: 6, dither: 0.35 }).toBuffer();
}
async function playable(card) {
  const title = await words(card.title, 56, paper, "Medium", 820);
  const label = await words(card.label, 23, "#adede0", "Medium");
  // Keep the subject's face and all of the gripper inside the wide frame.
  const position = card.route === "/apps/ember-courier/" ? "north" : "centre";
  const layers = [
    layer(await shot(card.frame, 1200, 446, position), 0, 0),
    layer(label.data, 49, 473),
    layer(title.data, 47, 520),
    ...await brand(969, 520, paper),
  ];
  return canvas(ink).composite(layers).jpeg({ quality: 87, mozjpeg: true }).toBuffer();
}
async function article(card) {
  const family = card.route.startsWith("/docs/") ? "DINPro" : "Aeonik Pro";
  const heading = await words(card.title, 58, ink, "Medium", 535, family);
  const label = await words(card.label, 23, teal, "Regular", null, family);
  if (heading.info.height > 337) throw Error("Heading exceeds card: " + card.title);
  return canvas(paper).composite([
    layer(await shot(card.frame, 580, 630), 620, 0),
    ...await brand(48, 44),
    layer(heading.data, 47, 170 + Math.floor((284 - heading.info.height) / 2)),
    layer(label.data, 50, 549),
  ]).jpeg({ quality: 87, mozjpeg: true }).toBuffer();
}
for (const card of cards) {
  if (process.argv.includes("--docs-only") && !card.route.startsWith("/docs/")) continue;
  if ((process.argv.includes("--html-only") || process.argv.includes("--home-only")) && card.layout !== "home") continue;
  const file = join(sitePublic, card.output);
  mkdirSync(dirname(file), { recursive: true });
  const bytes = card.layout === "home" ? await home(card) : card.layout === "play" ? await playable(card) : await article(card);
  writeFileSync(file, bytes);
  if (card.layout !== "home") continue;
  mkdirSync(store, { recursive: true });
  for (const name of ["og-1200x630.png", "twitter-1200x630.png"]) {
    writeFileSync(join(sitePublic, "store-assets/brand/social", name), bytes);
    writeFileSync(join(store, name), bytes);
  }
  await sharp(bytes).resize(1200, 600).png({ palette: true, colours: 256 }).toFile(join(store, "twitter-1200x600.png"));
  const html = '<!doctype html><html lang="en"><meta charset="utf-8"><title>Aura3D social card</title><style>*{margin:0}img{display:block}</style><img class="shot" width="1200" height="630" alt="' + card.alt + '" src="data:image/png;base64,' + bytes.toString("base64") + '"></html>\n';
  writeFileSync(join(store, "og-composite.html"), html);
}
console.log("Rendered Aura3D social artwork from the shipped game and scene captures.");
