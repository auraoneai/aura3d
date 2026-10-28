#!/usr/bin/env node
/* Count the lines the author wrote in each full-game build, per file and per concern.
   Rule (same as harness/static-metrics.mjs and tagline/build.mjs): non-blank lines that are not only a line comment or a block comment.
   Concern: a "// @concern <name>" (TS) or "slash-star @concern <name> star-slash" (CSS) marker comment assigns every following
   counted line of that file to <name> until the next marker; lines before the first marker belong to "glue". Markers are comments, so they are not counted.
   Counted: src/*.ts and src/*.css of each app. Not counted: ../shared/coin-sim.ts (neutral rules), index.html, tsconfig.json (listed separately).
   Tokens: gpt-tokenizer o200k_base of the comment-stripped source, when resolvable from <tokDir>.
   Usage: node count.mjs <fullGameRoot> <out.json> [tokenizerModuleDir] */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const [root, out, tokDir] = process.argv.slice(2);
if (!root || !out) throw new Error("usage: count.mjs <fullGameRoot> <out.json> [tokenizerModuleDir]");
let encode = null;
let tokenizer = "none (tokens skipped: gpt-tokenizer not installable)";
try {
  encode = createRequire(join(tokDir ?? ".", "noop.js"))("gpt-tokenizer/encoding/o200k_base").encode;
  tokenizer = "gpt-tokenizer o200k_base (OpenAI BPE; a proxy: Claude's tokenizer is not public)";
} catch { /* tokens skipped */ }

const MARKER = /^\s*(?:\/\/|\/\*)\s*@concern\s+([\w-]+)/;
const CONCERNS = ["scene", "loop", "input-touch", "hud-screens", "audio", "replay-qa", "resize-teardown", "glue"];

function analyse(src) {
  const lines = [];
  let concern = "glue";
  let inBlock = false;
  for (const raw of src.split("\n")) {
    const text = raw.trim();
    const marker = MARKER.exec(raw);
    if (marker) concern = marker[1];
    if (inBlock) { if (text.includes("*/")) inBlock = false; continue; }
    if (!text || text.startsWith("//")) continue;
    if (text.startsWith("/*")) { if (!text.includes("*/")) inBlock = true; continue; }
    lines.push({ concern, text: raw });
  }
  return lines;
}
// The harness rule, verbatim, as a cross-check on the line-level one.
const harnessLoc = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => l.trim() && !l.trim().startsWith("//")).length;
const tokens = (text) => (encode ? encode(text).length : null);

const result = { tokenizer, rule: "non-blank, non-comment lines of src/*.ts and src/*.css (shared/coin-sim.ts, index.html, tsconfig.json not counted)", apps: {} };
for (const app of ["aura", "three"]) {
  const dir = join(root, app, "src");
  const entry = { files: {}, concerns: Object.fromEntries(CONCERNS.map((c) => [c, { loc: 0, tokens: encode ? 0 : null }])), total: { loc: 0, tokens: encode ? 0 : null } };
  for (const name of readdirSync(dir).sort()) {
    const src = readFileSync(join(dir, name), "utf8");
    const lines = analyse(src);
    const loc = lines.length;
    if (loc !== harnessLoc(src)) throw new Error(`${app}/${name}: line-level count ${loc} differs from the harness rule ${harnessLoc(src)}`);
    const stripped = lines.map((l) => l.text).join("\n");
    entry.files[name] = { loc, tokens: tokens(stripped) };
    entry.total.loc += loc;
    if (encode) entry.total.tokens += tokens(stripped);
    const byConcern = new Map();
    for (const l of lines) byConcern.set(l.concern, [...(byConcern.get(l.concern) ?? []), l.text]);
    for (const [c, texts] of byConcern) {
      if (!entry.concerns[c]) throw new Error(`${app}/${name}: unknown concern ${c}`);
      entry.concerns[c].loc += texts.length;
      if (encode) entry.concerns[c].tokens += tokens(texts.join("\n"));
    }
  }
  for (const extra of ["index.html", "tsconfig.json"]) entry[extra] = readFileSync(join(root, app, extra), "utf8").split("\n").filter((l) => l.trim()).length;
  result.apps[app] = entry;
}
writeFileSync(out, JSON.stringify(result, null, 2));
for (const [app, e] of Object.entries(result.apps)) console.log(`FULLGAME_COUNT ${app}: total=${e.total.loc} lines${e.total.tokens ? ` ${e.total.tokens} tokens` : ""} ${CONCERNS.map((c) => `${c}=${e.concerns[c].loc}`).join(" ")}`);
console.log(`FULLGAME_COUNT_JSON ${out} (${tokenizer})`);
