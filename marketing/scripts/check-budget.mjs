import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const distDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const html = readFileSync(join(distDir, "index.html"), "utf8");
const failures = [];

function budget(label, actual, max) {
  if (actual > max) failures.push(`${label}: ${actual} > ${max} bytes`);
}

if (/<link\b[^>]*\brel=["']stylesheet["']/i.test(html)) {
  failures.push("homepage still has a render-blocking stylesheet link");
}

let initialJs = 0;
for (const match of html.matchAll(/<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["']/gi)) {
  const src = match[1];
  if (!src.startsWith("/")) continue;
  const file = join(distDir, src.replace(/^\//, "").split("?")[0]);
  if (!existsSync(file)) {
    failures.push(`initial module script missing from dist: ${src}`);
    continue;
  }
  initialJs += gzipSync(readFileSync(file)).length;
}
budget("initial module JS gzip", initialJs, 150 * 1024);
budget("homepage HTML gzip", gzipSync(Buffer.from(html)).length, 180 * 1024);

const hero = /<img\b[^>]*\bclass=["'][^"']*stage-poster[^"']*["'][^>]*>/i.exec(html)?.[0] ?? "";
if (!hero) failures.push("hero poster image is missing");
else {
  if (!/\bfetchpriority=["']high["']/.test(hero)) failures.push("hero poster is missing fetchpriority=high");
  if (!/\bsrcset=["'][^"']*480w/.test(hero)) failures.push("hero poster is missing a 480w srcset candidate");
  const heroSrc = /\bsrc=["']([^"']+)["']/.exec(hero)?.[1];
  const heroFile = heroSrc?.startsWith("/") ? join(distDir, heroSrc.replace(/^\//, "")) : null;
  if (!heroFile || !existsSync(heroFile)) failures.push(`hero poster missing from dist: ${heroSrc ?? "(no src)"}`);
  else budget("hero poster", statSync(heroFile).size, 100 * 1024);
}

for (const iframe of html.matchAll(/<iframe\b[^>]*>/gi)) {
  if (/\bsrc=/.test(iframe[0])) failures.push("an iframe has a src in the initial HTML; demos must be click-to-play");
}

if (failures.length > 0) {
  console.error("Performance budget check failed:");
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log(`Performance budgets passed: ${initialJs} B initial JS gzip, ${Buffer.byteLength(html)} B HTML.`);
