#!/usr/bin/env node
// Write the WP-38 after-capture shards file: every target in tests/browser/game-luma-targets.ts, grouped per game in list
// order, 1 to 3 targets per shard (chunk sizes below, from the before-run durations), each selected by a shell-safe
// Playwright --grep (character classes only; the ACR step runs SPECS through /bin/sh, so no pipes or parentheses).
//   node evidence/game-upgrades-47/after/make-shards.mjs <targets.json> <stamp> > evidence/game-upgrades-47/after/shards.json
// <targets.json>: [{ name, slug, variant, group }] dumped from GAME_LUMA_TARGETS (also written to after/targets.json).
import { readFileSync } from "node:fs";

const [file, stamp] = process.argv.slice(2);
const targets = JSON.parse(readFileSync(file, "utf8"));
const titles = targets.map((t) => `game luma capture ${t.name} @${t.group}`);
const SIZE = { "ninja-runner-port": 1, "iron-crown": 2, teleoperator: 2, "cross-hop": 2, "aura-diamond-3d": 2, "drift-and-deliver-port": 2, "aura-links-3d": 2, "aura-hoops-3d": 2, "aura-fc-3d": 2, "slingshot-siege": 2, "top-tennis": 2, "last-train-port": 2, "roadster-rush": 2 };
const cls = (chars) => { const s = [...new Set(chars)].sort(); if (s.length === 1) return s[0]; const dash = s.includes("-"); return `[${dash ? "-" : ""}${s.filter((c) => c !== "-").join("")}]`; };
const exact = (re, names) => { const hit = targets.filter((t, i) => re.test(titles[i])).map((t) => t.name); return hit.length === names.length && names.every((n) => hit.includes(n)); };
function grepFor(slug, group) {
  const vs = group.map((t) => t.variant), names = group.map((t) => t.name);
  const max = Math.max(...vs.map((v) => v.length));
  for (let k = 0; k <= max; k++) {
    if (vs.some((v) => v.length < k)) break;
    const pat = `${slug}--${[...Array(k).keys()].map((i) => cls(vs.map((v) => v[i]))).join("")}`;
    if (exact(new RegExp(pat), names)) return pat;
    if (vs.every((v) => v.length === k)) { const end = `${pat}.@g`; if (exact(new RegExp(end), names)) return end; }
  }
  return null;
}
const bySlug = new Map();
for (const t of targets) { if (!bySlug.has(t.slug)) bySlug.set(t.slug, []); bySlug.get(t.slug).push(t); }
const shards = [];
for (const [slug, list] of bySlug) {
  const size = SIZE[slug] ?? 3;
  let n = 0;
  for (let i = 0; i < list.length;) {
    // Take up to `size` targets; shrink the chunk until a grep selects exactly it.
    let take = Math.min(size, list.length - i), grep = null;
    while (take > 0 && !(grep = grepFor(slug, list.slice(i, i + take)))) take--;
    if (!grep) throw new Error(`no grep for ${list[i].name}`);
    const chunk = list.slice(i, i + take);
    n++;
    shards.push({ run: `gu47-after-${stamp}-${slug}-${n}`, slug, specs: `tests/browser/game-luma-capture.spec.ts --grep=${grep}`, expect: chunk.map((t) => t.name) });
    i += take;
  }
}
// Heavy shards first so the long tail is short.
const heavy = new Set(["ninja-runner-port", "iron-crown", "teleoperator", "cross-hop", "aura-diamond-3d", "drift-and-deliver-port"]);
shards.sort((a, b) => Number(heavy.has(b.slug)) - Number(heavy.has(a.slug)));
process.stdout.write("[\n" + shards.map((s) => "  " + JSON.stringify(s)).join(",\n") + "\n]\n");
