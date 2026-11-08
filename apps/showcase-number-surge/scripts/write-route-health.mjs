/** Route-health evidence: probes dist build output + reports key checks (adapted from cross-hop). */
import { readFileSync, existsSync } from "node:fs";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const dist = join(root, "dist");

const checks = [];
const add = (name, ok, detail) => checks.push({ name, ok: !!ok, detail });

const indexHtml = join(dist, "index.html");
add("dist/index.html exists", existsSync(indexHtml));
if (existsSync(indexHtml)) {
  const html = readFileSync(indexHtml, "utf8");
  add("has #app mount", html.includes('id="app"'));
  add("has #hud root", html.includes('id="hud"'));
  add("module script present", /<script type="module"/.test(html));
}
const assetsDir = join(root, "public", "aura-assets");
add("aura-assets dir", existsSync(assetsDir));
const manifest = JSON.parse(readFileSync(join(root, "aura.assets.json"), "utf8"));
add("manifest assets", Array.isArray(manifest.assets) && manifest.assets.length >= 1, `${manifest.assets?.length ?? 0} assets`);
add("typegen exists", existsSync(join(root, "src", "aura-assets.ts")));
add("font admitted", existsSync(join(root, "public", "aura-assets", "GT-Walsheim-Bold.woff2")));
add("font provenance", existsSync(join(root, "public", "aura-assets", "PROVENANCE.md")));

const report = {
  appId: "number-surge",
  route: "/apps/showcase-number-surge/",
  generatedAt: new Date().toISOString(),
  ok: checks.every((c) => c.ok),
  checks
};
writeFileSync(join(root, "route-health.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.ok ? 0 : 1;