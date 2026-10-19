#!/usr/bin/env node
// Inline the homepage's local stylesheets so first paint does not wait on two
// render-blocking CSS requests. Docs pages keep their cached external sheets.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const distDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const pagePath = join(distDir, "index.html");
const stylesheetLink = /<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi;

function resolveStylesheet(href) {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) return null;
  const file = href.startsWith("/") ? join(distDir, href.slice(1)) : resolve(dirname(pagePath), href);
  const relativePath = relative(distDir, file);
  return relativePath.startsWith("..") || !relativePath.endsWith(".css") ? null : file;
}

function absolutizeUrls(css, file) {
  const baseUrl = `/${relative(distDir, dirname(file)).split(sep).join("/")}`;
  return css.replace(/url\(\s*(['"]?)(?!data:|https?:|\/\/|\/|#)([^)'"]+)\1\s*\)/gi, (match, quote, target) => {
    return `url(${quote}${baseUrl}/${target.replace(/^\.\//, "")}${quote})`;
  });
}

if (existsSync(pagePath)) {
  let inlined = 0;
  const html = readFileSync(pagePath, "utf8").replace(stylesheetLink, (tag) => {
    const href = /href=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href) return tag;
    const file = resolveStylesheet(href);
    if (!file || !existsSync(file)) return tag;
    inlined += 1;
    return `<style data-inlined-from="${href}">\n${absolutizeUrls(readFileSync(file, "utf8"), file)}\n</style>`;
  });
  writeFileSync(pagePath, html);
  console.log(`Inlined ${inlined} homepage stylesheet(s) into dist/index.html.`);
}
