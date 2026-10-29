#!/usr/bin/env node
// Extracts Wonder World evidence from a remote ACR run log. Ad-hoc `az acr run` cannot upload artifacts, so the
// browser specs print it into the log (tests/browser/wonder-world-lib.ts):
//   WWSHOT <name> <index> <total> <base64 chunk>   a JPEG or PNG screenshot, chunked
//   WWJSON <name> <json>                            a JSON record (state, diagnostics, timings)
//
//   node tools/extract-remote-evidence.mjs <acr-run.log> <out-dir>
// Writes <out-dir>/<name>.jpg|png and <out-dir>/<name>.json, and prints what it wrote.
//
// Redaction (PRD 03 gap 03:177): the specs redact what they print, but a record from an older run, or a line a tool
// printed by itself, may still carry the app's working folder or the name it carries. Everything this script writes
// or prints goes through redact(): the dev-server origin goes, `apps/<folder>/` becomes `<app>/`, the folder `<app>`
// and the bare name `<name>`. Neither is written here: the folder is this script's own app folder
// (`<name>-wonder-world`), read at run time.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const APP_FOLDER = basename(resolve(dirname(fileURLToPath(import.meta.url)), ".."));
const WORKING_SUFFIX = "-wonder-world";
const FOLDER_NAME = APP_FOLDER.endsWith(WORKING_SUFFIX) ? APP_FOLDER.slice(0, -WORKING_SUFFIX.length) : "";
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const FOLDER_PATTERN = new RegExp(`(?:apps/)?${escape(APP_FOLDER)}`, "gi");
const NAME_PATTERN = FOLDER_NAME ? new RegExp(`(?<![a-z0-9])${escape(FOLDER_NAME)}(?![a-z0-9])`, "gi") : null;

/** Strips the dev-server origin, the app folder and the name the folder carries (as tests/browser/wonder-world-lib.ts redact). */
function redact(text) {
  const out = String(text)
    .replace(/https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?/g, "")
    .split(`/apps/${APP_FOLDER}/`)
    .join("/<app>/")
    .replace(FOLDER_PATTERN, "<app>");
  return NAME_PATTERN ? out.replace(NAME_PATTERN, "<name>") : out;
}

const [log, out] = process.argv.slice(2);
if (!log || !out) throw new Error("usage: extract-remote-evidence.mjs <acr-run.log> <out-dir>");
mkdirSync(out, { recursive: true });
const shots = new Map();
const records = new Map();
for (const line of readFileSync(log, "utf8").split("\n")) {
  const shot = /WWSHOT (\S+) (\d+) (\d+) (\S+)/.exec(line);
  if (shot) {
    const [, name, i, total, chunk] = shot;
    const entry = shots.get(name) ?? { total: Number(total), parts: [] };
    entry.parts[Number(i)] = chunk;
    shots.set(name, entry);
    continue;
  }
  const record = /WWJSON (\S+) (\{.*\})\s*$/.exec(line);
  if (record) {
    try { records.set(record[1], JSON.parse(record[2])); } catch { /* a truncated line is skipped, not guessed */ }
  }
}
const safe = (name) => redact(name).replace(/[^a-z0-9._-]+/gi, "_");
const shown = redact(out);
for (const [name, { total, parts }] of shots) {
  const present = parts.filter((p) => typeof p === "string").length;
  if (present !== total) { console.log(`incomplete ${safe(name)}: ${present}/${total} chunks`); continue; }
  const bytes = Buffer.from(parts.join(""), "base64");
  const ext = bytes[0] === 0x89 && bytes[1] === 0x50 ? "png" : "jpg";
  writeFileSync(join(out, `${safe(name)}.${ext}`), bytes);
  console.log(`shot ${safe(name)}.${ext} ${bytes.length} bytes`);
}
for (const [name, value] of records) {
  writeFileSync(join(out, `${safe(name)}.json`), `${redact(JSON.stringify(value, null, 2))}\n`);
  console.log(`json ${safe(name)}`);
}
console.log(`${shots.size} shots, ${records.size} records -> ${shown}`);
