#!/usr/bin/env node
// CC0 asset mirror pipeline.
//
// Downloads CC0 3D packs from ZIP-pack sources (Kenney via site scrape,
// Quaternius via the itch.io API), extracts their GLB/glTF files into a local
// checkout of the mirror repo, rebuilds manifest.json, and pushes. jsDelivr then
// fronts the repo as a free CDN, so we host nothing.
//
// Env:
//   MIRROR_REPO     git remote (default github.com/gchahal1982/aura3d-cc0-assets)
//   MIRROR_DIR      working checkout dir (default /tmp/aura3d-cc0-mirror)
//   ITCH_API_KEY    itch.io API key (required for Quaternius)
//   KENNEY_LIMIT    max Kenney packs this run (default: all discovered)
//   QUATERNIUS_LIMIT max Quaternius packs this run (default: all in the list)
//   PUSH            "1" to commit+push (default), "0" to dry-run locally
//
// Usage: node tools/cc0-mirror/mirror.mjs

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const REPO = process.env.MIRROR_REPO ?? "https://github.com/gchahal1982/aura3d-cc0-assets.git";
const DIR = process.env.MIRROR_DIR ?? join(tmpdir(), "aura3d-cc0-mirror");
const ITCH_KEY = process.env.ITCH_API_KEY ?? "";
const CDN_USER_REPO = (process.env.MIRROR_GH ?? "gchahal1982/aura3d-cc0-assets");
const CDN_BASE = `https://cdn.jsdelivr.net/gh/${CDN_USER_REPO}@main`;
const PUSH = (process.env.PUSH ?? "1") === "1";

const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 1 << 28, ...opts });
const log = (...a) => console.log(...a);

// Auto-harvest Quaternius packs from the itch.io creator page, whose game cells
// each carry a numeric `data-game_id` (the id the itch API needs) and a link to
// the game slug. All Quaternius packs are CC0. (The page JS-paginates, so this
// reliably yields the server-rendered set ~29; quaternius.com hides slugs behind
// a JS widget and can't be used.)
function discoverQuaternius() {
  let html;
  try {
    html = fetchText("https://quaternius.itch.io");
  } catch {
    return [];
  }
  const packs = [];
  const seen = new Set();
  // Split on each game cell's id attribute; the slug is the first itch link in it.
  for (const cell of html.split('data-game_id="').slice(1)) {
    const idm = cell.match(/^(\d+)/);
    if (!idm) continue;
    const gameId = Number(idm[1]);
    if (seen.has(gameId)) continue;
    seen.add(gameId);
    const slugm = cell.match(/quaternius\.itch\.io\/([a-z0-9-]+)/);
    packs.push({ gameId, slug: slugm ? slugm[1] : `game-${gameId}` });
  }
  return packs;
}

function titleFromFile(name) {
  return name
    .replace(/\.(glb|gltf)$/i, "")
    .replace(/^[0-9]+[_-]/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function fetchText(url) {
  return sh("curl", ["-sL", "--max-time", "60", url]);
}

function downloadFile(url, dest) {
  sh("curl", ["-sL", "--max-time", "300", "-o", dest, url]);
}

function setupRepo() {
  if (existsSync(join(DIR, ".git"))) {
    sh("git", ["-C", DIR, "pull", "--ff-only", "--quiet"]);
  } else {
    rmSync(DIR, { recursive: true, force: true });
    sh("git", ["clone", "--quiet", REPO, DIR]);
  }
}

// ---- Kenney -----------------------------------------------------------------
function discoverKenneySlugs() {
  const slugs = new Set();
  for (let page = 1; page <= 4; page++) {
    let html;
    try {
      html = fetchText(`https://kenney.nl/assets/category:3D?page=${page}`);
    } catch {
      break;
    }
    const before = slugs.size;
    const skip = new Set(["category", "tag", "series"]);
    for (const m of html.matchAll(/kenney\.nl\/assets\/([a-z0-9-]+)/g)) {
      const s = m[1];
      if (s && !skip.has(s)) slugs.add(s);
    }
    if (slugs.size === before) break; // no new slugs -> past the last page
  }
  return [...slugs];
}

function kenneyZipUrl(slug) {
  const html = fetchText(`https://kenney.nl/assets/${slug}`);
  const m = html.match(new RegExp(`/media/pages/assets/${slug}/[^"']+?\\.zip`));
  return m ? `https://kenney.nl${m[0]}` : null;
}

function extractKenney(limit) {
  const all = discoverKenneySlugs();
  const slugs = limit ? all.slice(0, limit) : all;
  log(`[kenney] ${all.length} 3D packs discovered, processing ${slugs.length}`);
  let packs = 0;
  for (const slug of slugs) {
    try {
      const url = kenneyZipUrl(slug);
      if (!url) { log(`[kenney] ${slug}: no zip url`); continue; }
      const zip = join(tmpdir(), `kenney-${slug}.zip`);
      downloadFile(url, zip);
      const out = join(DIR, "kenney", slug);
      mkdirSync(out, { recursive: true });
      try {
        sh("unzip", ["-o", "-j", zip, "Models/GLB format/*.glb", "-d", out], { stdio: "pipe" });
      } catch { /* pack may use a different GLB path */ }
      rmSync(zip, { force: true });
      const count = existsSync(out) ? readdirSync(out).filter((f) => f.endsWith(".glb")).length : 0;
      if (count === 0) { rmSync(out, { recursive: true, force: true }); continue; }
      packs++;
      log(`[kenney] ${slug}: ${count} glb`);
    } catch (e) {
      log(`[kenney] ${slug}: ERROR ${e.message}`);
    }
  }
  return { discovered: all.length, packs };
}

// ---- Quaternius (itch.io API) ----------------------------------------------
function quaterniusUploadId(gameId) {
  const json = JSON.parse(
    sh("curl", ["-sL", "--max-time", "60", "-H", `Authorization: Bearer ${ITCH_KEY}`,
      `https://api.itch.io/games/${gameId}/uploads`]),
  );
  const uploads = json.uploads ?? [];
  // Prefer a "[Standard]" zip, else the first zip upload.
  const zip = uploads.find((u) => /\.zip$/i.test(u.filename ?? "") && /standard/i.test(u.filename ?? ""))
    ?? uploads.find((u) => /\.zip$/i.test(u.filename ?? ""));
  return zip?.id ?? null;
}

function extractQuaternius(limit) {
  if (!ITCH_KEY) { log("[quaternius] no ITCH_API_KEY, skipping"); return { packs: 0 }; }
  const all = discoverQuaternius();
  const list = limit ? all.slice(0, limit) : all;
  log(`[quaternius] discovered ${all.length} packs, processing ${list.length}`);
  let packs = 0;
  for (const { slug, gameId } of list) {
    try {
      const uploadId = quaterniusUploadId(gameId);
      if (!uploadId) { log(`[quaternius] ${slug}: no zip upload`); continue; }
      const zip = join(tmpdir(), `quaternius-${slug}.zip`);
      downloadFile(`https://api.itch.io/uploads/${uploadId}/download?api_key=${ITCH_KEY}`, zip);
      const out = join(DIR, "quaternius", slug);
      mkdirSync(out, { recursive: true });
      // Keep the glTF folder intact so external .bin/texture refs resolve on the CDN.
      try {
        sh("unzip", ["-o", "-j", zip, "*/glTF/*", "-d", out], { stdio: "pipe" });
      } catch { /* some packs nest differently */ }
      rmSync(zip, { force: true });
      const count = existsSync(out) ? readdirSync(out).filter((f) => /\.(glb|gltf)$/i.test(f)).length : 0;
      if (count === 0) { rmSync(out, { recursive: true, force: true }); continue; }
      packs++;
      log(`[quaternius] ${slug}: ${count} gltf`);
    } catch (e) {
      log(`[quaternius] ${slug}: ERROR ${e.message}`);
    }
  }
  return { packs };
}

// ---- manifest ---------------------------------------------------------------
function buildManifest() {
  const assets = [];
  for (const source of ["kenney", "quaternius"]) {
    const base = join(DIR, source);
    if (!existsSync(base)) continue;
    for (const pack of readdirSync(base)) {
      const packDir = join(base, pack);
      if (!statSync(packDir).isDirectory()) continue;
      for (const file of readdirSync(packDir)) {
        if (!/\.(glb|gltf)$/i.test(file)) continue;
        const name = file.replace(/\.(glb|gltf)$/i, "");
        const title = titleFromFile(file);
        assets.push({
          id: `${source}:${pack}:${name}`,
          source,
          pack,
          title,
          path: `${source}/${pack}/${file}`,
          license: "CC0",
          tags: [...new Set([...title.toLowerCase().split(/\s+/), ...pack.split("-")])].filter((t) => t.length > 1),
        });
      }
    }
  }
  assets.sort((a, b) => a.id.localeCompare(b.id));
  const manifest = { schema: "aura3d-cc0-mirror/1", cdnBase: CDN_BASE, count: assets.length, assets };
  writeFileSync(join(DIR, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return assets.length;
}

function commitAndPush(total) {
  sh("git", ["-C", DIR, "add", "-A"]);
  const status = sh("git", ["-C", DIR, "status", "--porcelain"]).trim();
  if (!status) { log("no changes to push"); return; }
  sh("git", ["-C", DIR, "-c", "user.name=aura3d-bot", "-c", "user.email=bot@aura3d.dev",
    "commit", "--quiet", "-m", `Mirror CC0 assets: ${total} total`]);
  if (PUSH) {
    sh("git", ["-C", DIR, "push", "--quiet", "origin", "HEAD:main"]);
    log("pushed");
  } else {
    log("dry-run (PUSH=0): committed locally, not pushed");
  }
}

// ---- run --------------------------------------------------------------------
setupRepo();
const k = extractKenney(process.env.KENNEY_LIMIT ? Number(process.env.KENNEY_LIMIT) : 0);
const q = extractQuaternius(process.env.QUATERNIUS_LIMIT ? Number(process.env.QUATERNIUS_LIMIT) : 0);
const total = buildManifest();
log(`\nmanifest: ${total} assets (kenney packs: ${k.packs}/${k.discovered}, quaternius packs: ${q.packs})`);
commitAndPush(total);
