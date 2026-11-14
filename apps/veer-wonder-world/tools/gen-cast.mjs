#!/usr/bin/env node
// Generates src/characters/generated-cast.ts from src/characters/sheets/*.json (PRD 09 B3.7 & B.8).
// Validates schema completeness, canonical ordering, voice uniqueness, banter rules, rig traits,
// wonder-assets.json alignment, and zero child/family names. Never edit generated-cast.ts by hand.
//
//   node tools/gen-cast.mjs
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const sheetsDir = join(app, "src", "characters", "sheets");
const wonderAssetsPath = join(app, "tools", "wonder-assets.json");

const WORKING_SUFFIX = "-wonder-world";
const appFolder = basename(app);
const guardNames =
  appFolder.endsWith(WORKING_SUFFIX) && appFolder.length > WORKING_SUFFIX.length
    ? [appFolder.slice(0, -WORKING_SUFFIX.length)]
    : [];

const VALID_WORLDS = new Set([
  "meadow",
  "music-garden",
  "peekaboo-barn",
  "station",
  "learning-cloud",
  "home-nook",
  "moonlit-nursery",
  "starlight-cloud"
]);

const VALID_MOVES = new Set(["walk", "run", "roll", "float", "hop", "drive", "fly", "slide"]);
const VALID_IDLE = new Set(["none", "breathe", "sway", "float", "flutter"]);
const VALID_TURNS = new Set(["full", "partial", "none"]);

const VALID_GESTURES = new Set([
  "idle", "wave", "talk", "point", "happy", "cheer", "dance", "hop", "nod", "look",
  "sleep", "eat", "wake", "sway", "mirror", "pickUp", "shrug", "wag", "sniff", "bark",
  "sit", "clap", "stomp", "freeze", "peek", "hide", "float", "glow", "blink", "bow",
  "surprise", "wait", "yawn", "rock", "twinkle"
]);

const VALID_SUB_PARTS = new Set([
  "body", "head", "armL", "armR", "footL", "footR", "tail", "wingL", "wingR", "tuft",
  "earL", "earR", "legFL", "legFR", "legBL", "legBR", "wheelFL", "wheelFR", "wheelRL",
  "wheelRR", "chimney", "cabDoorL", "cabDoorR", "eyelidL", "eyelidR", "jaw", "beakLower",
  "cheekPuff", "hingeLeaf", "hingeLeafR", "lid", "liftCab", "liftGate", "petals"
]);

const BANNED_BANTER_PATTERN = /\b(stupid|ugly|idiot|dumb|shut\s+up|hate|kill|die)\b/i;

function wordCount(text) {
  return text
    .trim()
    .split(/\s+/)
    .filter((token) => /[a-z0-9]/i.test(token)).length;
}

if (!existsSync(sheetsDir)) {
  throw new Error("gen-cast.mjs: src/characters/sheets directory is missing");
}

const wonderAssets = JSON.parse(readFileSync(wonderAssetsPath, "utf8"));
const assetByKey = new Map(
  (Array.isArray(wonderAssets.assets) ? wonderAssets.assets : []).map((entry) => [entry.key, entry])
);

const sheetFiles = readdirSync(sheetsDir)
  .filter((name) => name.endsWith(".json"))
  .sort();

if (sheetFiles.length < 7) {
  throw new Error(`gen-cast.mjs: expected at least 7 character sheets, found ${sheetFiles.length}`);
}

const rawSheets = sheetFiles.map((file) => {
  const fullPath = join(sheetsDir, file);
  const rawText = readFileSync(fullPath, "utf8");
  for (const name of guardNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const guardRe = new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9]|${WORKING_SUFFIX})`, "i");
    if (guardRe.test(rawText)) {
      throw new Error(`gen-cast.mjs: ${file} contains a forbidden personal guard name`);
    }
  }
  const parsed = JSON.parse(rawText);
  const stem = file.slice(0, -5);
  if (parsed?.id !== stem) {
    throw new Error(`gen-cast.mjs: ${file} id "${String(parsed?.id)}" does not match filename "${stem}"`);
  }
  return parsed;
});

rawSheets.sort((a, b) => a.order - b.order);

const castIdSet = new Set(rawSheets.map((s) => s.id));
const seenVoiceIds = new Set();
const failures = [];

rawSheets.forEach((sheet, idx) => {
  const prefix = `sheet ${sheet.id}`;
  if (!/^[a-z][a-z0-9]*$/.test(sheet.id)) {
    failures.push(`${prefix}: invalid id "${String(sheet.id)}"`);
  }
  if (sheet.order !== idx + 1) {
    failures.push(`${prefix}: expected canonical order ${idx + 1}, got ${String(sheet.order)}`);
  }
  if (typeof sheet.displayName !== "string" || sheet.displayName.trim() === "") {
    failures.push(`${prefix}: missing displayName`);
  }
  if (typeof sheet.speciesOrKind !== "string" || sheet.speciesOrKind.trim() === "") {
    failures.push(`${prefix}: missing speciesOrKind`);
  }
  if (!VALID_WORLDS.has(sheet.homeWorld)) {
    failures.push(`${prefix}: invalid homeWorld "${String(sheet.homeWorld)}"`);
  }
  if (typeof sheet.colour !== "string" || !/^#[0-9a-fA-F]{6}$/.test(sheet.colour)) {
    failures.push(`${prefix}: invalid hex colour "${String(sheet.colour)}"`);
  }
  if (typeof sheet.speaks !== "boolean") {
    failures.push(`${prefix}: speaks must be boolean`);
  }

  // Voice checks
  if (!sheet.speaks) {
    if (sheet.voice !== null) {
      failures.push(`${prefix}: non-speaking character must have voice: null`);
    }
  } else {
    const v = sheet.voice;
    if (!v || typeof v !== "object") {
      failures.push(`${prefix}: speaking character must define voice object`);
    } else {
      if (v.provider !== "elevenlabs") failures.push(`${prefix}: voice.provider must be "elevenlabs"`);
      if (typeof v.voiceId !== "string" || v.voiceId.trim().length < 10) {
        failures.push(`${prefix}: invalid voice.voiceId`);
      } else if (seenVoiceIds.has(v.voiceId)) {
        failures.push(`${prefix}: duplicate voice.voiceId "${v.voiceId}"`);
      } else {
        seenVoiceIds.add(v.voiceId);
      }
      if (typeof v.name !== "string" || v.name.trim() === "") failures.push(`${prefix}: missing voice.name`);
      if (typeof v.modelId !== "string" || v.modelId.trim() === "") failures.push(`${prefix}: missing voice.modelId`);
      for (const numKey of ["speed", "stability", "similarityBoost", "style"]) {
        if (typeof v[numKey] !== "number" || !Number.isFinite(v[numKey])) {
          failures.push(`${prefix}: voice.${numKey} must be a finite number`);
        }
      }
      if (typeof v.description !== "string" || v.description.trim() === "") {
        failures.push(`${prefix}: missing voice.description`);
      }
    }
  }

  // Banter checks
  const b = sheet.banter;
  if (!b || typeof b !== "object") {
    failures.push(`${prefix}: missing banter object`);
  } else {
    if (typeof b.role !== "string" || b.role.trim() === "") failures.push(`${prefix}: missing banter.role`);
    if (!Array.isArray(b.catchphrases)) {
      failures.push(`${prefix}: banter.catchphrases must be an array`);
    } else {
      if (sheet.speaks && b.catchphrases.length < 2) {
        failures.push(`${prefix}: speaking character must have at least 2 catchphrases`);
      }
      if (!sheet.speaks && b.catchphrases.length !== 0) {
        failures.push(`${prefix}: non-speaking character must have empty catchphrases`);
      }
      for (const phrase of b.catchphrases) {
        if (typeof phrase !== "string" || phrase.trim() === "") {
          failures.push(`${prefix}: empty catchphrase`);
        } else {
          if (wordCount(phrase) > 9) {
            failures.push(`${prefix}: catchphrase "${phrase}" exceeds 9-word toddler limit`);
          }
          if (BANNED_BANTER_PATTERN.test(phrase)) {
            failures.push(`${prefix}: catchphrase "${phrase}" contains a banned word`);
          }
        }
      }
    }
    if (typeof b.funnyHabit !== "string" || b.funnyHabit.trim() === "") {
      failures.push(`${prefix}: missing banter.funnyHabit`);
    } else if (BANNED_BANTER_PATTERN.test(b.funnyHabit)) {
      failures.push(`${prefix}: banter.funnyHabit contains a banned word`);
    }
    if (!b.foils || typeof b.foils !== "object" || Array.isArray(b.foils) || Object.keys(b.foils).length === 0) {
      failures.push(`${prefix}: banter.foils must be a non-empty record`);
    } else {
      for (const [foilId, desc] of Object.entries(b.foils)) {
        if (!castIdSet.has(foilId) || foilId === sheet.id) {
          failures.push(`${prefix}: invalid foil target "${foilId}"`);
        }
        if (typeof desc !== "string" || desc.trim() === "" || BANNED_BANTER_PATTERN.test(desc)) {
          failures.push(`${prefix}: invalid foil description for "${foilId}"`);
        }
      }
    }
    if (!Array.isArray(b.bannedBehaviours) || b.bannedBehaviours.length === 0) {
      failures.push(`${prefix}: banter.bannedBehaviours must be a non-empty array`);
    }
    if (!Array.isArray(b.leadTopics) || b.leadTopics.length === 0) {
      failures.push(`${prefix}: banter.leadTopics must be a non-empty array`);
    }
  }

  // Rig checks
  const r = sheet.rig;
  if (!r || typeof r !== "object") {
    failures.push(`${prefix}: missing rig object`);
  } else {
    if (typeof r.heightM !== "number" || !Number.isFinite(r.heightM) || r.heightM <= 0) {
      failures.push(`${prefix}: invalid rig.heightM`);
    }
    const assetEntry = assetByKey.get(sheet.id);
    if (!assetEntry) {
      failures.push(`${prefix}: missing from tools/wonder-assets.json`);
    } else if (Math.abs(assetEntry.heightM - r.heightM) > 1e-6) {
      failures.push(`${prefix}: rig.heightM (${r.heightM}) disagrees with wonder-assets.json (${assetEntry.heightM})`);
    }
    if (!VALID_MOVES.has(r.defaultMove)) failures.push(`${prefix}: invalid rig.defaultMove "${String(r.defaultMove)}"`);
    if (!VALID_IDLE.has(r.idleStyle)) failures.push(`${prefix}: invalid rig.idleStyle "${String(r.idleStyle)}"`);
    if (!VALID_TURNS.has(r.turns)) failures.push(`${prefix}: invalid rig.turns "${String(r.turns)}"`);
    if (typeof r.floats !== "boolean") failures.push(`${prefix}: rig.floats must be boolean`);
    if (!Array.isArray(r.articulatedParts) || r.articulatedParts.length < 4) {
      failures.push(`${prefix}: rig.articulatedParts must list at least 4 sub-parts`);
    } else {
      for (const p of r.articulatedParts) {
        if (!VALID_SUB_PARTS.has(p)) failures.push(`${prefix}: unknown articulated sub-part "${String(p)}"`);
      }
    }
    if (typeof r.talkStrength !== "number" || r.talkStrength <= 0 || r.talkStrength > 0.2) {
      failures.push(`${prefix}: invalid rig.talkStrength`);
    }
    if (
      !Array.isArray(r.carryOffset) ||
      r.carryOffset.length !== 3 ||
      r.carryOffset.some((v) => typeof v !== "number" || !Number.isFinite(v))
    ) {
      failures.push(`${prefix}: rig.carryOffset must be [x, y, z]`);
    }
    for (const gestureListKey of ["signatureGestures", "extraGestures"]) {
      const list = r[gestureListKey];
      if (!Array.isArray(list) || list.length === 0) {
        failures.push(`${prefix}: rig.${gestureListKey} must be a non-empty array`);
      } else {
        for (const g of list) {
          if (!VALID_GESTURES.has(g)) failures.push(`${prefix}: unknown gesture "${String(g)}" in rig.${gestureListKey}`);
        }
      }
    }
    if (typeof r.rigModule !== "string" || !existsSync(join(app, r.rigModule))) {
      failures.push(`${prefix}: rig.rigModule "${String(r.rigModule)}" does not exist`);
    }
    const charModulePath = join(app, "src", "characters", `${sheet.id}.ts`);
    if (!existsSync(charModulePath)) {
      failures.push(`${prefix}: character definition module src/characters/${sheet.id}.ts does not exist`);
    }
  }
});

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

const q = (v) => JSON.stringify(v);
const constIdent = (id) => id.toUpperCase();

function formatSheetLiteral(sheet) {
  const voiceStr =
    sheet.voice === null
      ? "null"
      : [
          "{",
          `      provider: "elevenlabs",`,
          `      voiceId: ${q(sheet.voice.voiceId)},`,
          `      name: ${q(sheet.voice.name)},`,
          `      modelId: ${q(sheet.voice.modelId)},`,
          `      speed: ${sheet.voice.speed},`,
          `      stability: ${sheet.voice.stability},`,
          `      similarityBoost: ${sheet.voice.similarityBoost},`,
          `      style: ${sheet.voice.style},`,
          `      description: ${q(sheet.voice.description)}`,
          "    }"
        ].join("\n");

  const foilEntries = Object.entries(sheet.banter.foils)
    .map(([k, v]) => `        ${k}: ${q(v)}`)
    .join(",\n");

  return [
    `  ${sheet.id}: {`,
    `    id: ${q(sheet.id)},`,
    `    order: ${sheet.order},`,
    `    displayName: ${q(sheet.displayName)},`,
    `    speciesOrKind: ${q(sheet.speciesOrKind)},`,
    `    homeWorld: ${q(sheet.homeWorld)},`,
    `    colour: ${q(sheet.colour)},`,
    `    speaks: ${sheet.speaks},`,
    `    voice: ${voiceStr},`,
    "    banter: {",
    `      role: ${q(sheet.banter.role)},`,
    `      catchphrases: [${sheet.banter.catchphrases.map(q).join(", ")}],`,
    `      funnyHabit: ${q(sheet.banter.funnyHabit)},`,
    "      foils: {",
    foilEntries,
    "      },",
    `      bannedBehaviours: [${sheet.banter.bannedBehaviours.map(q).join(", ")}],`,
    `      leadTopics: [${sheet.banter.leadTopics.map(q).join(", ")}]`,
    "    },",
    "    rig: {",
    `      heightM: ${sheet.rig.heightM},`,
    `      defaultMove: ${q(sheet.rig.defaultMove)},`,
    `      idleStyle: ${q(sheet.rig.idleStyle)},`,
    `      turns: ${q(sheet.rig.turns)},`,
    `      floats: ${sheet.rig.floats},`,
    `      articulatedParts: [${sheet.rig.articulatedParts.map(q).join(", ")}],`,
    `      talkStrength: ${sheet.rig.talkStrength},`,
    `      carryOffset: [${sheet.rig.carryOffset.join(", ")}],`,
    `      signatureGestures: [${sheet.rig.signatureGestures.map(q).join(", ")}],`,
    `      extraGestures: [${sheet.rig.extraGestures.map(q).join(", ")}],`,
    `      rigModule: ${q(sheet.rig.rigModule)}`,
    "    }",
    "  }"
  ].join("\n");
}

const speakingSheets = rawSheets.filter((s) => s.speaks);
const nonSpeakingIds = rawSheets.filter((s) => !s.speaks).map((s) => q(s.id));
const speakingType =
  nonSpeakingIds.length > 0
    ? `Exclude<CharacterId, ${nonSpeakingIds.join(" | ")}>`
    : "CharacterId";

const outLines = [
  "// GENERATED by tools/gen-cast.mjs from src/characters/sheets/*.json. Do not edit by hand.",
  "// Zero unsafe type assertions, zero console calls, zero network APIs, and zero personal data.",
  "",
  'import type { SubPartId } from "../scenes/articulated-actors.js";',
  'import type { Vec3 } from "../scenes/motion.js";',
  'import type { CharacterId, Gesture, MoveStyle, WorldId } from "../types.js";',
  'import type { CharacterDefinition } from "./character-registry.js";',
  ...rawSheets.map((s) => `import { ${constIdent(s.id)} } from "./${s.id}.js";`),
  "",
  "export interface CharacterVoiceSpec {",
  '  readonly provider: "elevenlabs";',
  "  readonly voiceId: string;",
  "  readonly name: string;",
  "  readonly modelId: string;",
  "  readonly speed: number;",
  "  readonly stability: number;",
  "  readonly similarityBoost: number;",
  "  readonly style: number;",
  "  readonly description: string;",
  "}",
  "",
  "export interface CharacterBanterSpec {",
  "  readonly role: string;",
  "  readonly catchphrases: readonly string[];",
  "  readonly funnyHabit: string;",
  "  readonly foils: Readonly<Partial<Record<CharacterId, string>>>;",
  "  readonly bannedBehaviours: readonly string[];",
  "  readonly leadTopics: readonly string[];",
  "}",
  "",
  "export interface CharacterRigSheetSpec {",
  "  readonly heightM: number;",
  "  readonly defaultMove: MoveStyle;",
  '  readonly idleStyle: "none" | "breathe" | "sway" | "float" | "flutter";',
  '  readonly turns: "full" | "partial" | "none";',
  "  readonly floats: boolean;",
  "  readonly articulatedParts: readonly SubPartId[];",
  "  readonly talkStrength: number;",
  "  readonly carryOffset: Vec3;",
  "  readonly signatureGestures: readonly Gesture[];",
  "  readonly extraGestures: readonly Gesture[];",
  "  readonly rigModule: string;",
  "}",
  "",
  "export interface CharacterSheet {",
  "  readonly id: CharacterId;",
  "  readonly order: number;",
  "  readonly displayName: string;",
  "  readonly speciesOrKind: string;",
  "  readonly homeWorld: WorldId;",
  "  readonly colour: string;",
  "  readonly speaks: boolean;",
  "  readonly voice: CharacterVoiceSpec | null;",
  "  readonly banter: CharacterBanterSpec;",
  "  readonly rig: CharacterRigSheetSpec;",
  "}",
  "",
  "export const GENERATED_CHARACTER_IDS = [",
  ...rawSheets.map((s) => `  ${q(s.id)},`),
  "] as const satisfies readonly CharacterId[];",
  "",
  "export const GENERATED_SPEAKING_CHARACTER_IDS = [",
  ...speakingSheets.map((s) => `  ${q(s.id)},`),
  `] as const satisfies readonly ${speakingType}[];`,
  "",
  "export const CHARACTER_SHEETS = {",
  rawSheets.map(formatSheetLiteral).join(",\n"),
  "} satisfies Readonly<Record<CharacterId, CharacterSheet>>;",
  "",
  "export const GENERATED_CHARACTER_DEFINITIONS: Readonly<Record<CharacterId, CharacterDefinition>> = {",
  ...rawSheets.map((s) => `  ${s.id}: ${constIdent(s.id)},`),
  "};",
  ""
];

writeFileSync(join(app, "src", "characters", "generated-cast.ts"), outLines.join("\n"));
console.log(`generated-cast.ts: ${rawSheets.length} character sheets (${speakingSheets.length} speaking)`);
