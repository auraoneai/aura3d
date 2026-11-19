#!/usr/bin/env node
// Render the article heading with a real scene capture for link previews.
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const marketing = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const docs = join(marketing, "docs");
const output = join(marketing, "public/previews/docs");
const previews = join(marketing, "public/previews/showcase-index");
const captures = {
  "agent-quickstart": "vesper-gt",
  "agent-rules": "top-tennis@2x",
  api: "relay-workcell",
  assets: "vesper-gt",
  "aura3d-vs-threejs": "vesper-gt",
  claims: "top-tennis@2x",
  claude: "where-the-wind-wanders-port@2x",
  cursor: "drift-and-deliver-port@2x",
  deployment: "roadster-rush@2x",
  evidence: "heatsink@2x",
  index: "ember-courier",
  "migration/4-to-5": "relay-workcell",
  "prompt-recipes": "ember-courier",
  templates: "serpentine-sky-run-port@2x",
};
const brand = readFileSync(join(marketing, "favicon.svg"));
const wordLayer = async (content, size, weight, color) => sharp({
  text: {
    text: `<span foreground="${color}">${content}</span>`,
    width: 580, wrap: "word", font: `Graphik ${weight} ${size}`,
    fontfile: join(marketing, "public/fonts/graphik", `Graphik-${weight}-Web.woff2`),
    rgba: true, spacing: 2,
  },
}).png().toBuffer();

for (const file of readdirSync(docs, { recursive: true }).filter((item) => item.endsWith(".html"))) {
  const slug = file.slice(0, -5);
  const html = readFileSync(join(docs, file), "utf8");
  const heading = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]?.replace(/<[^>]+>/g, "");
  if (!heading || !captures[slug]) throw new Error(`Missing heading or capture for ${file}`);
  const frame = await sharp(join(previews, `${captures[slug]}.webp`))
    .resize(510, 630, { fit: "cover" }).jpeg().toBuffer();
  const title = await wordLayer(heading, 54, "Semibold", "#1a1e26");
  const label = await wordLayer("Aura3D", 34, "Semibold", "#1a1e26");
  const section = await wordLayer("Developer documentation", 24, "Regular", "#565d69");
  const path = join(output, `${slug}.jpg`);
  mkdirSync(dirname(path), { recursive: true });
  await sharp({ create: { width: 1200, height: 630, channels: 3, background: "#fbfbf8" } })
    .composite([
      { input: frame, left: 690, top: 0 },
      { input: await sharp(brand).resize(50, 50).png().toBuffer(), left: 48, top: 46 },
      { input: label, left: 110, top: 58 },
      { input: title, left: 50, top: 201 },
      { input: section, left: 50, top: 546 },
    ]).jpeg({ quality: 88, mozjpeg: true }).toFile(path);
}
