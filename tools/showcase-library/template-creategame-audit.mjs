#!/usr/bin/env node
/*
 * template-creategame-audit.mjs — PRD-09 §12 (Q-13-1) template proof.
 *
 * Asserts, for each generated game template under --root/<dir>/tpl-<name>:
 *   - createGame is the mount API (import from "@aura3d/engine/game"),
 *   - sound cues resolve through the shared game-sfx-core pack (sfxUrl),
 *   - a juice event map + HUD theme + touch preset are declared,
 *   - zero route-local `?capture=` branches,
 *   - zero synth cues (no Web Audio oscillator/noise fallback wiring).
 *
 *   node tools/showcase-library/template-creategame-audit.mjs --root /tmp
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
};

const root = opt("--root", "/tmp");
const TEMPLATES = ["mini-game", "racing-starter", "falling-blocks-starter", "fighting-game", "character-controller"];

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory() && entry !== "node_modules" && entry !== "dist") yield* walk(path);
    else if (stats.isFile() && /\.(ts|tsx|js|mjs|html|css)$/.test(entry)) yield path;
  }
}

const CAPTURE_RE = /["'`?&]capture\s*=|\bcapture=review\b|\bcaptureBranch\b/;
const SYNTH_RE = /createOscillator|OscillatorNode|createBufferSource|new AudioContext\(\)|synthCue|synth\(/;
const REQUIRED = [
  [/createGame\s*\(/, "createGame mount"],
  [/@aura3d\/engine\/game/, "engine/game subpath import"],
  [/sfxUrl\(/, "game-sfx-core cue url"],
  [/hud:\s*\{\s*theme:/, "§7.7 HUD theme option"],
  [/touch:\s*\{/, "§6.11 touch preset option"],
  [/juice:\s*\{/, "juice event map"],
  [/qualityRebuild:\s*\{\s*flags:\s*\[.*"game"/, "A3D_QR_GAME flag input"]
];

let failures = 0;
for (const template of TEMPLATES) {
  const dir = join(root, `tpl-${template}`);
  if (!existsSync(dir)) {
    console.error(`[template-audit] ${template}: MISSING generated dir ${dir}`);
    failures += 1;
    continue;
  }
  const sources = [...walk(dir)];
  const entry = join(dir, "src", "main.ts");
  if (!existsSync(entry)) {
    console.error(`[template-audit] ${template}: MISSING src/main.ts`);
    failures += 1;
    continue;
  }
  const main = readFileSync(entry, "utf8");
  for (const [re, label] of REQUIRED) {
    if (!re.test(main)) {
      console.error(`[template-audit] ${template}: missing ${label}`);
      failures += 1;
    }
  }
  let capture = 0;
  let synth = 0;
  for (const file of sources) {
    const text = readFileSync(file, "utf8");
    capture += (text.match(new RegExp(CAPTURE_RE, "g")) ?? []).length;
    synth += (text.match(new RegExp(SYNTH_RE, "g")) ?? []).length;
  }
  if (capture > 0) {
    console.error(`[template-audit] ${template}: ${capture} capture-branch token(s)`);
    failures += capture;
  }
  if (synth > 0) {
    console.error(`[template-audit] ${template}: ${synth} synth-cue token(s)`);
    failures += synth;
  }
  console.log(`[template-audit] ${template}: files=${sources.length} capture=${capture} synth=${synth}`);
}

if (failures > 0) {
  console.error(`[template-audit] FAIL — ${failures} finding(s)`);
  process.exit(1);
}
console.log("[template-audit] OK — all five game templates ride createGame with pack cues, juice, HUD theme, and touch preset.");
