#!/usr/bin/env node
// Render branded social artwork from shipped scene frames without a browser.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import sharp from "sharp";
import { cards, root, sitePublic } from "../../tools/site/social-cards.mjs";

const store = join(root, "store-assets/brand/social");
const brandAssets = join(sitePublic, "store-assets/brand");
const paper = "#fbfbf8", ink = "#1a1e26", muted = "#565d69", teal = "#0e6b7c";
const width = 1200, height = 630;
const escape = (s) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const canvas = (background) => sharp({ create: { width, height, channels: 3, background } });
const shot = (file, w, h, position = "centre") => sharp(file).resize(w, h, { fit: "cover", position }).removeAlpha().png().toBuffer();
const layer = (input, left, top) => ({ input, left, top });

async function words(text, size, color, weight = "Semibold", maxWidth) {
  const opt = {
    text: '<span foreground="' + color + '">' + escape(text) + '</span>',
    font: 'Graphik Web ' + weight + ' ' + size,
    fontfile: join(sitePublic, "fonts/graphik/Graphik-" + weight + "-Web.woff2"),
    rgba: true, spacing: 4, ...(maxWidth ? { width: maxWidth, wrap: "word" } : {}),
  };
  return sharp({ text: opt }).png().toBuffer({ resolveWithObject: true });
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
  const title = await words(card.title, 67, ink);
  layers.push(layer(title.data, 47, 100));
  const caption = ["Ember Courier", "Vesper GT", "Relay Workcell"];
  for (const [i, pane] of panes.entries()) {
    layers.push(layer(await shot(card.frames[i], pane.w, imageHeight), pane.x, imageTop));
    layers.push(layer((await words(caption[i], 23, ink, "Medium")).data, pane.x, 570));
  }
  return canvas(paper).composite(layers).png({ palette: true, colours: 256, quality: 95, effort: 6, dither: 0.35 }).toBuffer();
}
async function playable(card) {
  const title = await words(card.title, 56, paper, "Semibold", 820);
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
  const heading = await words(card.title, 58, ink, "Semibold", 535);
  const label = await words(card.label, 23, teal, "Medium");
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
