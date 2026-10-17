/** Route-health evidence: probes dist build output + reports key checks. */
import { readFileSync, existsSync, statSync } from "node:fs";
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
add("manifest assets", Array.isArray(manifest.assets) && manifest.assets.length >= 20, `${manifest.assets?.length ?? 0} assets`);
add("typegen exists", existsSync(join(root, "src", "aura-assets.ts")));

const report = {
  route: "/apps/showcase-cross-hop/",
  generatedAt: new Date().toISOString(),
  ok: checks.every((c) => c.ok),
  checks
};
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.ok ? 0 : 1;
