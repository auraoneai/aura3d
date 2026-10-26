#!/usr/bin/env node
// Verifies that every asset URL a live game references is actually deployed.
//   node tools/verify-asset-urls/index.mjs --dist marketing/dist          # after a build: files must exist in the output
//   node tools/verify-asset-urls/index.mjs --base https://aura3d.auraone.ai  # after a deploy: HEAD each URL (status, content-type, size)
// References come from each live game's sources (apps/<app>/src plus the examples it imports): literal "/aura-assets/..." strings and
// the manifest entries (aura.assets.json) whose id the source mentions, which is exactly what the site build copies.
// Exit 1 on any missing file, 404, HTML fallback or size mismatch. See docs/agents/lessons-learned.md B9.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = process.argv.slice(2);
const value = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const dist = value("--dist");
const base = value("--base")?.replace(/\/$/, "");
const json = args.includes("--json");
if (dist && process.env.AURA3D_SHOWCASE_ASSET_BASE_URL?.trim()) { console.log("verify-asset-urls: assets are served from AURA3D_SHOWCASE_ASSET_BASE_URL, skipping the build-output check (use --base after deploy)"); process.exit(0); }
if (!dist && !base) { console.error("usage: node tools/verify-asset-urls/index.mjs (--dist <dir> | --base <https://origin>) [--json]"); process.exit(2); }

const EXT = "glb|gltf|ktx2|bin|hdr|mp3|ogg|wav|webp|png|jpe?g";
const SKIP = new Set(["node_modules", "dist", ".vercel", "evidence", "tests", "scripts", "assets"]);
const CODE = /\.(?:[cm]?[jt]sx?|html|json)$/;

function walk(dir, out) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) { if (!SKIP.has(name) && name !== "public") walk(p, out); }
    else if (CODE.test(name) && st.size < 3_000_000) out.push(p);
  }
}

const inventory = JSON.parse(readFileSync(join(root, "docs/workflows/game-inventory.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "aura.assets.json"), "utf8")).assets;
const apps = new Map(); // appFolder -> games
for (const g of [...inventory.games, ...(inventory.variants ?? [])]) {
  if (g.status && g.status !== "live") continue;
  const folder = g.appFolder;
  if (!folder) continue;
  if (!apps.has(folder)) apps.set(folder, []);
  apps.get(folder).push(g.slug ?? g.title ?? folder);
}

const used = new Map(); // url -> Set(app)
const add = (url, app) => { if (!used.has(url)) used.set(url, new Set()); used.get(url).add(app); };
for (const [folder] of apps) {
  const files = [];
  walk(join(root, "apps", folder, "src"), files);
  walk(join(root, "apps", folder), files.length ? [] : files);
  let text = "";
  const examples = new Set();
  for (const f of files) {
    const t = readFileSync(f, "utf8");
    text += "\n" + t;
    for (const m of t.matchAll(/examples\/([A-Za-z0-9-]+)\//g)) examples.add(m[1]);
  }
  for (const ex of examples) { const ef = []; walk(join(root, "examples", ex), ef); for (const f of ef) text += "\n" + readFileSync(f, "utf8"); }
  const literal = new RegExp(`["'\`](/(?:aura-assets|hdri|aura-environments|aura-decoders|packs|probes)/[A-Za-z0-9_.@/-]+\\.(?:${EXT}))["'\`]`, "g");
  for (const m of text.matchAll(literal)) if (!/\.meshy-candidate\./.test(m[1])) add(m[1], folder);
  for (const a of manifest) {
    if (!a.url?.startsWith("/aura-assets/") || /\.meshy-candidate\./.test(a.url)) continue;
    if (new RegExp(`(?<![A-Za-z0-9_$])${a.id.replace(/[$]/g, "\\$")}(?![A-Za-z0-9_$])`).test(text)) add(a.url, folder);
  }
}

const problems = [];
const urls = [...used.keys()].sort();
const diskSize = (url) => { const p = join(root, "public", url.replace(/^\//, "")); return existsSync(p) ? statSync(p).size : null; };

async function check(url) {
  const owners = [...used.get(url)];
  if (dist) {
    const p = join(resolve(root, dist), url.replace(/^\//, ""));
    if (!existsSync(p)) return { url, owners, problem: "missing in build output" };
    const want = diskSize(url);
    if (want !== null && statSync(p).size !== want) return { url, owners, problem: `size ${statSync(p).size} != ${want}` };
    return null;
  }
  try {
    const res = await fetch(base + url, { method: "HEAD" });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok) return { url, owners, problem: `HTTP ${res.status}` };
    if (/text\/html/i.test(type)) return { url, owners, problem: "HTML fallback" };
    const len = Number(res.headers.get("content-length") ?? "0");
    const want = diskSize(url);
    if (want !== null && len && len !== want) return { url, owners, problem: `size ${len} != ${want}` };
    return null;
  } catch (error) {
    return { url, owners, problem: `fetch failed: ${String(error?.message ?? error).slice(0, 80)}` };
  }
}

const queue = [...urls];
await Promise.all(Array.from({ length: 12 }, async () => { while (queue.length) { const u = queue.shift(); const r = await check(u); if (r) problems.push(r); } }));
problems.sort((a, b) => a.url.localeCompare(b.url));
const byGame = new Map();
for (const p of problems) for (const o of p.owners) { if (!byGame.has(o)) byGame.set(o, []); byGame.get(o).push(`${p.url} (${p.problem})`); }

if (json) console.log(JSON.stringify({ checked: urls.length, problems, byGame: Object.fromEntries(byGame) }, null, 2));
else {
  console.log(`verify-asset-urls: ${urls.length} referenced asset URLs from ${apps.size} apps checked ${dist ? `in ${relative(root, resolve(root, dist)).split(sep).join("/")}` : `against ${base}`}`);
  for (const [game, list] of [...byGame].sort()) { console.log(`  ${game}: ${list.length}`); for (const l of list.slice(0, 8)) console.log(`    ${l}`); }
  console.log(problems.length ? `FAIL: ${problems.length} unreachable or mismatched URL(s)` : "OK: every referenced asset URL is deployed");
}
process.exit(problems.length ? 1 : 0);
