#!/usr/bin/env node
// Fails when a user-facing file states a game count that differs from docs/workflows/game-inventory.json.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const inventory = JSON.parse(readFileSync(join(repoRoot, "docs", "workflows", "game-inventory.json"), "utf8"));
const N = inventory.liveGameCount;

const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const tens = { twenty: 20, thirty: 30, forty: 40, fifty: 50 };
function wordValue(w) {
  const lower = w.toLowerCase();
  const direct = words.indexOf(lower);
  if (direct >= 0) return direct;
  const m = lower.match(/^(twenty|thirty|forty|fifty)(?:-(one|two|three|four|five|six|seven|eight|nine))?$/);
  return m ? tens[m[1]] + (m[2] ? words.indexOf(m[2]) : 0) : null;
}

const FILES = [
  "marketing/index.html", "marketing/content/llms-core.txt", "marketing/public/llms.txt", "marketing/public/llms-full.txt",
  "public/llms.txt", "public/llms-full.txt", "llms.txt", "llms-full.txt", "README.md", "packages/engine/README.md",
  "docs/index.md", "docs/aura3d-vs-threejs.md", "apps/showcase-index/index.html",
  "marketing/scripts/generate-og.mjs", "store-assets/brand/social/og-composite.html"
];
const docsDir = join(repoRoot, "marketing", "docs");
if (existsSync(docsDir)) for (const f of readdirSync(docsDir)) if (f.endsWith(".html")) FILES.push(`marketing/docs/${f}`);

const numberToken = "(\\d+|[A-Za-z]+(?:-[A-Za-z]+)?)";
const pattern = new RegExp(`(?<![\\d.])\\b${numberToken}(?:[ -](?:playable|studio-grade|independent|browser|3D|showcase|more|live|new)){0,3}[ -]games?\\b`, "gi");
const violations = [];
for (const file of FILES) {
  const path = join(repoRoot, file);
  if (!existsSync(path)) continue;
  const text = readFileSync(path, "utf8").replace(/\{\{GAME_COUNT\}\}/g, String(N)).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
  let m;
  while ((m = pattern.exec(text)) !== null) {
    const token = m[1];
    const value = /^\d+$/.test(token) ? Number(token) : wordValue(token);
    if (value === null) continue;
    if (value === N) continue;
    if (file === "apps/showcase-index/index.html" && Object.values(inventory.genreCounts).includes(value)) continue;
    // Small numbers inside prose that count something else ("one game at a time", "two games") are allowed only when below 5
    // and not preceded by "all"/"see"; a stale slate count is always larger than that.
    if (value < 5) {
      const context = text.slice(Math.max(0, m.index - 24), m.index + m[0].length + 24).replace(/\s+/g, " ");
      if (!/playable|live|showcase|ship|slate/i.test(m[0] + context)) continue;
    }
    violations.push(`${file}: "${m[0]}" (inventory says ${N})`);
  }
}
if (violations.length > 0) {
  console.error(`check-game-count: ${violations.length} stale or hand-typed count(s):\n${violations.join("\n")}`);
  process.exit(1);
}
console.log(`check-game-count: OK (${N} games stated consistently in ${FILES.length} files)`);
