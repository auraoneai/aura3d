#!/usr/bin/env node
// Sync source route metadata, or apply the same metadata and artwork to an assembled site.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import sharp from "sharp";
import { cards, root, sitePublic, withBrandAssets, withSocialCard } from "../../tools/site/social-cards.mjs";

const distArg = process.argv.indexOf("--dist");
const check = process.argv.includes("--check");
if (distArg !== -1 && !process.argv[distArg + 1]) throw Error("--dist requires the built site directory");
const dist = distArg === -1 ? null : resolve(process.argv[distArg + 1]);
const paths = cards.map((c) => c.output).concat(cards.flatMap((c) => c.twitter ? [c.twitter] : []));
if (check) {
  for (const p of new Set(paths)) {
    const bytes = readFileSync(join(dist ?? sitePublic, p));
    const image = await sharp(bytes).metadata();
    if (image.width !== 1200 || image.height !== 630 || bytes.length >= 300 * 1024) {
      throw Error("Social artwork dimensions or byte budget failed: " + p);
    }
    if (dist && !bytes.equals(readFileSync(join(sitePublic, p)))) throw Error("Stale social artwork: " + p);
  }
}
if (dist && !check) {
  for (const p of new Set(paths)) {
    const dst = join(dist, p);
    mkdirSync(dirname(dst), { recursive: true });
    copyFileSync(join(sitePublic, p), dst);
  }
}
const errorPage = join(dist ?? sitePublic, "404.html");
const errorHtml = readFileSync(errorPage, "utf8");
const brandedError = withBrandAssets(errorHtml);
if (errorHtml !== brandedError) {
  if (check) throw Error("Stale brand asset URL in " + errorPage);
  writeFileSync(errorPage, brandedError);
}
const pages = cards.map((c) => dist ? join(dist, c.route.endsWith("/") ? c.route + "index.html" : c.route + ".html") : join(root, c.file));
if (dist) {
  // Some game ports ship both an internal app-folder URL and the public canonical.
  for (const dir of readdirSync(join(dist, "apps"), { withFileTypes: true })) {
    const p = join(dist, "apps", dir.name, "index.html");
    if (dir.isDirectory() && existsSync(p)) pages.push(p);
  }
}
let updated = 0, checked = 0;
for (const file of new Set(pages)) {
  const html = readFileSync(file, "utf8");
  if (!html.includes('og:image')) {
    if (!dist || pages.indexOf(file) < cards.length) throw Error("Missing Open Graph image in " + file);
    continue;
  }
  const result = withSocialCard(html);
  checked++;
  if (html === result) continue;
  if (check) throw Error("Stale social card metadata in " + file);
  writeFileSync(file, result);
  updated++;
}
console.log("Social metadata: " + updated + " updated, " + checked + " pages checked.");
