/// <reference types="node" />
// Wonder World content lint, TypeScript entry (PRD 04 J14). Run it through
// tools/validate-wonder-world-content.mjs, which starts it with tsx:
//
//   node tools/validate-wonder-world-content.mjs [--require-audio | --allow-missing-audio]
//
// Checks every story with validateCatalog (src/content/schema.ts): story
// shape, beats, lines and strings in the English pack, vocabulary, letters,
// counting, songs, effects, beds, timing, review and the canonical 20 + 12
// catalog. It also checks that each locale file only defines its own keys and
// the rights references of the media: every model the content uses is in
// tools/wonder-assets.json; every admitted model file has a provenance record
// whose sha256 matches; every recorded audio clip exists, matches its sha256,
// has a complete provenance record and was recorded from the current line text,
// lyrics or prompt. Recorded audio is required for every line, song, effect and bed once
// any line has been recorded (or always with --require-audio); while
// generation is still running, --allow-missing-audio skips that requirement.
//
// Prints the problems per story and exits 1 when there are any.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

/**
 * The child's name never appears in shipped source (MASTER-PROMPT section 6),
 * so it is not in src/content/schema.ts's family-name list. It is the prefix of
 * the app's working folder name (`<name>-wonder-world`), and this tool (never
 * bundled) passes it to the lint as a guard name.
 */
const WORKING_SUFFIX = "-wonder-world";
const appFolder = basename(app);
const guardNames: readonly string[] =
  appFolder.endsWith(WORKING_SUFFIX) && appFolder.length > WORKING_SUFFIX.length ? [appFolder.slice(0, -WORKING_SUFFIX.length)] : [];

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8"));
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : {};
}

async function main(): Promise<number> {
  let catalogModule: typeof import("../src/content/catalog.js");
  let localeModule: typeof import("../src/localization/en/index.js");
  try {
    catalogModule = await import("../src/content/catalog.js");
    localeModule = await import("../src/localization/en/index.js");
  } catch (error) {
    console.error("Wonder World content lint: the catalog or the English pack failed to load.");
    console.error(`  - ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
  const { STORIES, storyCode } = catalogModule;
  const { en, EN_PARTS } = localeModule;
  const { validateCatalogDetailed, CHARACTER_IDS } = await import("../src/content/schema.js");
  const { AUDIO_MANIFEST } = await import("../src/audio-manifest.generated.js");

  const recordedLines = Object.keys(AUDIO_MANIFEST.lines).length;
  // --allow-missing-audio is for runs while generation is still in progress; the release gate never passes it.
  const requireAudio = !args.includes("--allow-missing-audio") && (args.includes("--require-audio") || recordedLines > 0);
  const report = validateCatalogDetailed(STORIES, en, { audio: AUDIO_MANIFEST, requireAudio, complete: true, guardNames });
  const extra: string[] = [];

  // The child's name is in no story id, prop or beat id, review record or locale key either.
  for (const name of guardNames) {
    const word = new RegExp(`(?<![a-z0-9])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9]|${WORKING_SUFFIX})`, "i");
    for (const story of STORIES) if (word.test(JSON.stringify(story))) extra.push(`story ${story.id}: its data names the child; ids, review records and stage ids stay generic`);
    for (const key of [...Object.keys(en.lines), ...Object.keys(en.strings)]) if (word.test(key)) extra.push(`locale key ${key} names the child`);
  }

  // Each locale file defines only its own story's keys (or ui.* for ui.ts).
  const codeBySlug = new Map(STORIES.map((story) => [story.id, storyCode(story)]));
  for (const part of EN_PARTS) {
    const slug = part.source.split("/").pop() ?? part.source;
    const prefix = part.source === "ui" ? "ui." : `${codeBySlug.get(slug) ?? "?"}.`;
    for (const key of [...Object.keys(part.lines ?? {}), ...Object.keys(part.strings ?? {})]) {
      if (!key.startsWith(prefix)) extra.push(`locale ${part.source}: key ${key} does not start with ${prefix}`);
    }
  }

  // Models: the content only uses known model keys; admitted files match their provenance.
  const assetList = record(readJson(join(app, "tools", "wonder-assets.json")));
  const assets = Array.isArray(assetList["assets"]) ? assetList["assets"] : [];
  const modelKeys = new Set(assets.map((entry) => String(record(entry)["key"] ?? "")));
  const usedModels = new Set<string>(CHARACTER_IDS);
  for (const story of STORIES) for (const prop of story.props) if (prop.asset !== "bubble") usedModels.add(prop.asset);
  for (const key of usedModels) if (!modelKeys.has(key)) extra.push(`model ${key} is used by the content but missing from tools/wonder-assets.json`);
  const modelsDir = join(app, "src", "assets", "models");
  let admitted = 0;
  for (const file of existsSync(modelsDir) ? readdirSync(modelsDir).filter((f) => f.endsWith(".glb")) : []) {
    const match = /^([A-Za-z0-9]+)\.([0-9a-f]{8})\.glb$/.exec(file);
    if (!match || match[1] === undefined || match[2] === undefined) {
      extra.push(`model file ${file} must be named <key>.<sha8>.glb`);
      continue;
    }
    const [, key, sha8] = match;
    admitted += 1;
    if (!modelKeys.has(key)) extra.push(`model file ${file}: ${key} is not in tools/wonder-assets.json`);
    const provFile = join(app, "provenance", "models", `${key}.json`);
    if (!existsSync(provFile)) {
      extra.push(`model ${key}: no provenance record (provenance/models/${key}.json)`);
      continue;
    }
    const prov = record(readJson(provFile));
    const hash = sha256(readFileSync(join(modelsDir, file)));
    if (prov["sha256"] !== hash) extra.push(`model ${key}: provenance sha256 does not match ${file}`);
    if (!hash.startsWith(sha8)) extra.push(`model ${key}: file name hash ${sha8} does not match the file contents`);
    if (typeof prov["license"] !== "string" || prov["license"].trim() === "") extra.push(`model ${key}: provenance has no license`);
  }

  // Audio: every recorded clip exists and matches its sha256, has a complete
  // provenance record (PRD 04 D16: provider, endpoint, prompt, Prism key id and
  // tier, date, and the voice for lines) and was recorded from the current
  // text, so a caption never shows words the recording does not say (PRD 03
  // section 4; PRD 04 F1.5).
  const { SONGS } = await import("../src/content/songs.js");
  const { SFX } = await import("../src/content/sfx.js");
  const { MUSIC_BEDS } = await import("../src/content/music.js");
  const recordedFrom = (kind: "lines" | "songs" | "beds" | "sfx", id: string, prompt: string): string | null => {
    if (kind === "lines") {
      const text = en.lines[id];
      if (text === undefined) return "no story speaks this line any more";
      return prompt === text ? null : `it was recorded from "${prompt}", but the line now reads "${text}"`;
    }
    if (kind === "songs") {
      const song = Object.entries(SONGS).find(([key]) => key === id)?.[1];
      if (!song) return "the song no longer exists";
      return prompt.includes(song.style) && prompt.includes(song.lyrics.join(" / ")) ? null : "it was recorded from older lyrics or an older style";
    }
    const spec = kind === "sfx" ? Object.entries(SFX).find(([key]) => key === id)?.[1] : Object.entries(MUSIC_BEDS).find(([key]) => key === id)?.[1];
    if (!spec) return `the ${kind === "sfx" ? "sound effect" : "music bed"} no longer exists`;
    return prompt === spec.prompt ? null : "it was recorded from an older prompt";
  };
  const tables = [
    ["lines", AUDIO_MANIFEST.lines],
    ["songs", AUDIO_MANIFEST.songs],
    ["beds", AUDIO_MANIFEST.beds],
    ["sfx", AUDIO_MANIFEST.sfx]
  ] as const;
  let clips = 0;
  for (const [kind, table] of tables) {
    const provFile = join(app, "provenance", "audio", `${kind}.json`);
    const prov = existsSync(provFile) ? record(readJson(provFile)) : {};
    for (const [id, clip] of Object.entries(table)) {
      if (clip === undefined) continue;
      clips += 1;
      const path = decodeURIComponent(clip.url);
      if (!/^[0-9a-f]{64}$/.test(clip.sha256)) extra.push(`audio ${kind}/${id}: sha256 is not a hex digest`);
      if (path.startsWith("/")) {
        if (!existsSync(path)) extra.push(`audio ${kind}/${id}: file ${clip.url} is missing`);
        else if (sha256(readFileSync(path)) !== clip.sha256) extra.push(`audio ${kind}/${id}: sha256 does not match ${clip.url}; rerun tools/gen-audio-manifest.mjs`);
      }
      if (prov[id] === undefined) {
        extra.push(`audio ${kind}/${id}: no provenance record in provenance/audio/${kind}.json`);
        continue;
      }
      const entry = record(prov[id]);
      const fields = ["provider", "endpoint", "prompt", "prismKey", "tier", "date", ...(kind === "lines" ? ["voice"] : [])];
      for (const field of fields) {
        const value = entry[field];
        if (typeof value !== "string" || value.trim() === "") extra.push(`audio ${kind}/${id}: provenance has no ${field}`);
      }
      const prompt = entry["prompt"];
      if (typeof prompt === "string") {
        const stale = recordedFrom(kind, id, prompt);
        if (stale !== null) extra.push(`audio ${kind}/${id}: ${stale}; rerun tools/gen-audio.ts and tools/gen-audio-manifest.mjs`);
      }
    }
  }

  const lineCount = Object.keys(en.lines).length;
  const stringCount = Object.keys(en.strings).length;
  console.log(`Wonder World content lint (J14): ${STORIES.length} stories, ${lineCount} lines, ${stringCount} strings, ${admitted} admitted models`);
  if (recordedLines > 0 || clips > 0) console.log(`audio: ${clips} recorded clips; recorded audio is ${requireAudio ? "required" : "optional"}`);
  else if (requireAudio) console.log("audio: none recorded yet, and --require-audio requires every clip");
  else console.log("audio: none recorded yet (lines run on caption timing); pass --require-audio to require it");
  let problems = 0;
  for (const story of report.stories) {
    if (story.errors.length === 0) {
      console.log(`${story.code} ${story.id}: ok`);
      continue;
    }
    problems += story.errors.length;
    console.log(`${story.code} ${story.id}: ${story.errors.length} problem${story.errors.length === 1 ? "" : "s"}`);
    for (const message of story.errors) console.log(`  - ${message}`);
  }
  const global = [...report.catalog, ...extra];
  if (global.length > 0) {
    console.log(`catalog, locale and media: ${global.length} problem${global.length === 1 ? "" : "s"}`);
    for (const message of global) console.log(`  - ${message}`);
  }
  problems += global.length;
  console.log(problems === 0 ? "OK: content lint passed" : `FAILED: ${problems} problem${problems === 1 ? "" : "s"}`);
  return problems === 0 ? 0 : 1;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
    process.exitCode = 1;
  }
);
