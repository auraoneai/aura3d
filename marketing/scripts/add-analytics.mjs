#!/usr/bin/env node
// Adds Microsoft Clarity and (when configured) Google Analytics 4 to every built HTML page in marketing/dist.
// IDs live in marketing/content/analytics.json; both tags load async and never block rendering.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const marketingDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(marketingDir, "dist");
const { clarityProjectId, ga4MeasurementId } = JSON.parse(readFileSync(join(marketingDir, "content", "analytics.json"), "utf8"));
const SKIP = new Set(["node_modules", "assets", "aura-assets", "aura-decoders", "aura-environments", "models", "hdri", "packs", "probes", "luts"]);
const MARK = "aura3d-analytics";
const valid = (value, re) => typeof value === "string" && re.test(value);
if (clarityProjectId != null && !valid(clarityProjectId, /^[a-z0-9]{6,16}$/)) throw new Error(`add-analytics: bad Clarity id ${clarityProjectId}`);
if (ga4MeasurementId != null && !valid(ga4MeasurementId, /^G-[A-Z0-9]{6,14}$/)) throw new Error(`add-analytics: bad GA4 id ${ga4MeasurementId}`);

const parts = [];
if (ga4MeasurementId) {
  parts.push(`<script async src="https://www.googletagmanager.com/gtag/js?id=${ga4MeasurementId}"></script>`,
    `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag("js",new Date());gtag("config","${ga4MeasurementId}");</script>`);
}
if (clarityProjectId) {
  parts.push(`<script>(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${clarityProjectId}");</script>`);
}
const block = parts.length ? `<!-- ${MARK} -->${parts.join("")}<!-- /${MARK} -->` : "";

function htmlFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return SKIP.has(entry.name) || entry.name.endsWith("-fonts") ? [] : htmlFiles(path);
    return entry.name.endsWith(".html") ? [path] : [];
  });
}

let tagged = 0;
for (const file of htmlFiles(dist)) {
  const html = readFileSync(file, "utf8");
  const cleaned = html.replace(new RegExp(`<!-- ${MARK} -->[\\s\\S]*?<!-- /${MARK} -->`), "");
  if (!block) { if (cleaned !== html) writeFileSync(file, cleaned, "utf8"); continue; }
  if (!/<\/head>/i.test(cleaned)) continue;
  writeFileSync(file, cleaned.replace(/<\/head>/i, `${block}\n</head>`), "utf8");
  tagged += 1;
}
console.log(`add-analytics: ${tagged} pages (clarity=${clarityProjectId ?? "off"}, ga4=${ga4MeasurementId ?? "off"})`);
