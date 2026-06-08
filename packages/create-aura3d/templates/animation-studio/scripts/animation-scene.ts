/**
 * animation-scene.ts — the AGENT-NATIVE Scene-Tool CLI.
 *
 * The "AI prompt studio" does NOT need its own LLM. The creator is already in a signed-in
 * coding agent (Claude Code, Codex, …) — THAT agent is the director. It reads the creator's
 * natural language and drives the scene by running these commands. No separate model, no API
 * key. Every command edits a persisted EpisodeDocument through the validated scene tools, so
 * the agent has scene-authoring powers, not arbitrary-code powers.
 *
 *   animation-scene new --prompt "<scene>" [--characters a,b]   start a working scene from a prompt (EMPTY-cast skeleton)
 *   animation-scene new --prompt "<scene>" --full               generate a COMPLETE scene (cast+dialogue+actions; F2)
 *   animation-scene new --from <doc.json>                       clone an existing working scene
 *   animation-scene show                             print the document summary
 *   animation-scene block --character <id> --shot <id> --to x,z [--yaw r] [--clip name]
 *   animation-scene camera --shot <id> [--preset establishing|two-shot|close-up] [--subject x,y,z]
 *   animation-scene gesture --character <id> --shot <id> --clip <name>
 *   animation-scene dress --prop <id> --at x,z [--scale s] [--feet f]
 *   animation-scene clear-props [--prop <id>]
 *   animation-scene undo
 *   animation-scene validate
 *   animation-scene render [--range a-b]
 *
 * Run via: pnpm exec tsx --tsconfig tsconfig.base.json packages/create-aura3d/templates/animation-studio/scripts/animation-scene.ts <cmd> ...
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { compilePromptEpisodePlan, type CameraPresetId } from "@aura3d/engine";
import { summarizeDocument, type EpisodeDocument, type Vec3 } from "../src/episode-document.js";
import { validateEpisodeDocument } from "../src/animation-episode-validator.js";
import { addShot, clearProps, placeProp, removeDialogueLine, removeShot, retimeDialogue, retimeShot, setBlocking, setCamera, setCharacterScale, setDialogueLine, setGesture } from "../src/studio/scene-tools.js";
import { compileEpisodeDocument } from "../src/director/compile-episode-document.js";
import type { DirectorSceneInput } from "../src/director/director-heuristics.js";
import { generateSceneFromPrompt } from "../src/director/prompt-to-scene.js";
import { SET_TEMPLATES, getSetTemplate, pickSetForPrompt } from "../src/set-templates.js";
import { resolveAsset, resolveLocalGlb, type ResolvedAsset } from "./resolve-asset.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "..", "..", "..", "..", "..");
const STATE_DIR = resolve(__dirname, "..", "dist", "scene");
const DOC_PATH = resolve(STATE_DIR, "working.document.json");
const HISTORY_PATH = resolve(STATE_DIR, "working.history.json");

const argv = process.argv.slice(2);
const cmd = argv[0];
function opt(name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}
function vec(s: string | undefined, fallbackY = 0): Vec3 | undefined {
  if (!s) return undefined;
  const n = s.split(",").map(Number);
  if (n.length === 2) return [n[0]!, fallbackY, n[1]!];
  if (n.length === 3) return [n[0]!, n[1]!, n[2]!];
  return undefined;
}
function loadDoc(): EpisodeDocument {
  if (!existsSync(DOC_PATH)) {
    console.error("no working scene. Run: animation-scene new");
    process.exit(1);
  }
  return JSON.parse(readFileSync(DOC_PATH, "utf8")) as EpisodeDocument;
}
function loadHistory(): EpisodeDocument[] {
  return existsSync(HISTORY_PATH) ? (JSON.parse(readFileSync(HISTORY_PATH, "utf8")) as EpisodeDocument[]) : [];
}
function persist(doc: EpisodeDocument, history: EpisodeDocument[]): void {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(DOC_PATH, `${JSON.stringify(doc, null, 2)}\n`);
  writeFileSync(HISTORY_PATH, `${JSON.stringify(history.slice(-50), null, 2)}\n`);
}
/**
 * Build the per-character clip lists the validator needs so its clip-existence guardrail can
 * fire. Each CharacterAsset carries a resolved clip list (`availableClips`/`clips`) and always a
 * `defaultClip`; we expose every name we know so scheduled clips can be fuzzy-matched against it.
 */
function availableClipsByCharacter(doc: EpisodeDocument): Record<string, readonly string[]> {
  const map: Record<string, readonly string[]> = {};
  for (const c of doc.assets.characters) {
    const resolved = (c as { availableClips?: readonly string[]; clips?: readonly string[] });
    const clips = resolved.availableClips ?? resolved.clips ?? (c.defaultClip ? [c.defaultClip] : []);
    if (clips.length > 0) map[c.id] = clips;
  }
  return map;
}

/** Apply a validated edit: validate (with the clip-existence guardrail) → commit or reject. */
function applyEdit(transform: (d: EpisodeDocument) => EpisodeDocument): void {
  const current = loadDoc();
  const next = transform(current);
  const v = validateEpisodeDocument(next, { availableClipsByCharacter: availableClipsByCharacter(next) });
  if (!v.ok) {
    console.error(`REJECTED — edit would break the scene:\n - ${v.errors.join("\n - ")}`);
    process.exit(1);
  }
  persist(next, [...loadHistory(), current]);
  console.log(`ok${v.warnings.length ? ` (warnings: ${v.warnings.length})` : ""}`);
  for (const w of v.warnings) console.log(`  warn: ${w}`);
}

/**
 * Suggest 1–3 cast ids from the prompt so the directing agent has concrete `cast add` targets.
 * Pulls capitalized names first (e.g. "Miko and Luma"); otherwise derives generic ids from the
 * acting nouns (robots → robot-1/robot-2). Never invents a final cast — these are suggestions.
 */
function suggestCastIds(prompt: string): string[] {
  const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const stop = new Set(["the", "a", "an", "and", "on", "in", "at", "of", "to", "with", "two", "three", "their", "his", "her"]);
  // 1. Proper names ("Miko and Luma argue …").
  const names = (prompt.match(/\b[A-Z][a-z]{2,}\b/g) ?? []).map(slug).filter((n) => n && !stop.has(n));
  if (names.length > 0) return [...new Set(names)].slice(0, 3);
  // 2. A plural acting noun ("two robots argue") → robot-1, robot-2.
  const plural = prompt.toLowerCase().match(/\b([a-z]{4,})s\b/);
  if (plural) {
    const base = slug(plural[1]!);
    if (base && !stop.has(base)) return [`${base}-1`, `${base}-2`];
  }
  // 3. A singular acting noun fallback.
  const word = prompt.toLowerCase().split(/[^a-z]+/).find((w) => w.length >= 4 && !stop.has(w));
  return [word ? slug(word) : "hero"];
}

/**
 * Build a fresh SKELETON document from a PROMPT: compilePromptEpisodePlan turns the prompt into
 * a storyboard + shots; the Director fills camera + the set template's ground dressing. The cast
 * starts EMPTY — the directing agent resolves real characters with `cast add` before blocking and
 * dialogue are authored. The SET is chosen from the prompt (not always the Moon Garden).
 */
function buildFromPrompt(prompt: string): EpisodeDocument {
  const duration = 60;
  // DYNAMIC SET: pick the environment from the prompt — NOT always the Moon Garden.
  const template = pickSetForPrompt(prompt);
  // Generate a simple storyboard (beats) from the prompt; the agent refines the lines later.
  const beatCount = 3;
  const beatDur = duration / beatCount;
  const beats = Array.from({ length: beatCount }, (_, i) => ({
    id: `beat-${i + 1}`,
    sceneId: "storyboard",
    shotId: `shot-${i + 1}`,
    locationId: "scene-location",
    summary: `Beat ${i + 1} of: ${prompt}`,
    visualIntent: i === 0 ? "Wide establishing shot." : i === beatCount - 1 ? "Close-up resolution." : "Medium two-shot.",
    duration: beatDur,
    // The cast is unresolved — beats describe the staging, not who plays it yet.
    characters: [] as string[],
    props: [],
    gestureByCharacterId: {},
    blockingByCharacterId: {},
    // NO fabricated dialogue. The DIRECTING AGENT writes the real lines via `dialogue` after
    // resolving the cast. A skeleton must never ship placeholder captions.
    dialogue: [] as { speakerId: string; text: string; emotion: string; delivery: string }[]
  }));
  const plan = compilePromptEpisodePlan({
    episodeId: `scene-${prompt.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}`,
    title: prompt.slice(0, 48),
    prompt,
    language: "en",
    runtime: { duration, frameRate: 30, resolution: { width: 1280, height: 720 }, aspectRatio: "16:9", reducedMotion: true, highContrast: true, maxTimingDriftFrames: 1 },
    route: "/",
    // No characters declared — the skeleton has an empty cast.
    characters: [],
    locations: [{ id: "scene-location", name: template.id, description: prompt, mood: "soft" }],
    props: [],
    safety: { childSafe: true, captionRequired: true, reducedMotionDefault: true, highContrastDefault: true, flashing: "reduced" },
    beats
  });
  const scene: DirectorSceneInput = {
    duration,
    // EMPTY cast — no blocking is generated for characters that don't exist yet.
    characters: [],
    shots: plan.shotTimeline.shots.map((s) => ({ shotId: s.shotId, startTime: s.startTime, endTime: s.endTime })),
    // No dialogue until the cast is resolved and the agent authors the real lines.
    dialogue: [],
    walkableBounds: template.walkableBounds,
    // Ground dressing comes from the chosen SET TEMPLATE (not a hard-coded mushroom×6); a
    // template with no groundProp scatters nothing.
    props: template.groundProp
      ? [{ propId: template.groundProp.propId, count: 6, scaleRange: [...template.groundProp.scaleRange] as [number, number], feetOffset: template.groundProp.feetOffset }]
      : []
  };
  // EMPTY cast: the document is a set + shots + timeline skeleton. The directing agent resolves
  // the suggested cast ids with `cast add` (catalog resolve) before authoring performance.
  // The only registered asset is the SET TEMPLATE's ground prop (so its scatter is valid); the
  // agent swaps it for a real GLB with `prop add --id <propId>` when refining.
  const props = template.groundProp
    ? [{ id: template.groundProp.propId, url: `/aura-assets/${template.groundProp.propId}.catalog.glb`, attribution: `placeholder: ${template.groundProp.query}` }]
    : [];
  const result = compileEpisodeDocument({ id: plan.episodeId ?? "scene", duration, assets: { characters: [], props }, set: template.set, scene });
  return {
    ...result.document,
    walkableBounds: template.walkableBounds,
    // An empty dialogue track is correct for a skeleton — authored after cast + blocking.
    dialogue: { language: plan.dialogueTrack.language ?? "en", lines: [] }
  };
}

/**
 * Resolve a character and register it under `id` (swap or add). Source is either the hosted
 * CATALOG (`--query`) or a USER-UPLOADED local GLB (`--file`); both are graded + render-probed by
 * the resolver, so an uploaded character goes through the same fidelity gate as a catalog one.
 */
async function castAdd(
  id: string,
  source: { query: string } | { file: string },
  scaleOverride?: number
): Promise<void> {
  const isUpload = "file" in source;
  const a: ResolvedAsset = isUpload ? await resolveLocalGlb(source.file, id) : await resolveAsset(source.query, id, "character");
  const current = loadDoc();
  const autoScale = a.bounds[1] > 0.1 && a.bounds[1] < 3 ? Math.min(4, Math.max(0.3, 1.6 / a.bounds[1])) : 1.6;
  const scale = scaleOverride ?? autoScale;
  // Persist the GLB's real clip list on the asset so the clip-existence guardrail can check
  // scheduled clips against it on every later edit (not just here).
  // E3 provenance: a `cast add --query` member is CATALOG-RESOLVED (the UI labels it as such and
  // never as authored-fallback). An uploaded GLB (`cast add --file`) is "user-uploaded".
  const fidelity = a.fidelity ?? a.rigGrade;
  const newChar = { id, url: a.url, scale, defaultClip: a.clips[0] ?? "idle", availableClips: a.clips, mouthMorphIndex: -1, source: (isUpload ? "user-uploaded" : "catalog-resolved") as "user-uploaded" | "catalog-resolved", attribution: a.attribution, license: a.license, sourceUrl: a.sourceUrl, hash: a.hash, ...(fidelity ? { fidelityGrade: fidelity } : {}) };
  const characters = current.assets.characters.some((c) => c.id === id)
    ? current.assets.characters.map((c) => (c.id === id ? newChar : c))
    : [...current.assets.characters, newChar];
  const next = { ...current, assets: { ...current.assets, characters } };
  const v = validateEpisodeDocument(next, { availableClipsByCharacter: availableClipsByCharacter(next) });
  if (!v.ok) { console.error(`REJECTED:\n - ${v.errors.join("\n - ")}`); process.exit(1); }
  persist(next, [...loadHistory(), current]);
  console.log(`cast ${id} ← ${a.attribution} [fidelity ${fidelity ?? "?"}] (clips: ${a.clips.slice(0, 3).join(",")}, scale ${scale.toFixed(2)})`);
}

/** Resolve a prop from the catalog and register it under `id` (swap or add). */
async function propAdd(id: string, query: string): Promise<void> {
  const a = await resolveAsset(query, id, "prop");
  const current = loadDoc();
  const newProp = { id, url: a.url, attribution: a.attribution, license: a.license, sourceUrl: a.sourceUrl, hash: a.hash };
  const props = current.assets.props.some((p) => p.id === id)
    ? current.assets.props.map((p) => (p.id === id ? newProp : p))
    : [...current.assets.props, newProp];
  const next = { ...current, assets: { ...current.assets, props } };
  const v = validateEpisodeDocument(next, { availableClipsByCharacter: availableClipsByCharacter(next) });
  if (!v.ok) { console.error(`REJECTED:\n - ${v.errors.join("\n - ")}`); process.exit(1); }
  persist(next, [...loadHistory(), current]);
  console.log(`prop ${id} ← ${a.attribution}`);
}

switch (cmd) {
  case "new": {
    const from = opt("from");
    const prompt = opt("prompt");
    // PROMPT is the ONLY new-scene path (or cloning an explicit --from document). There is NO
    // default content fixture — `animation-scene new` with no prompt/from is an error, so a
    // content scene (e.g. Moon Garden) can never leak in as the default.
    if (!from && !prompt) {
      console.error(
        'animation-scene new requires a prompt: animation-scene new --prompt "<your scene>"\n' +
        "  (or clone an existing document with --from <doc.json>). There is no default scene."
      );
      process.exit(1);
    }
    // `--full` (F2): generate a COMPLETE, no-fallback scene from the prompt — cast, dialogue,
    // camera and per-beat actions all derived from the prompt (procedural placeholder rigs the
    // agent can swap for catalog rigs with `cast add`). Default `new` stays the EMPTY skeleton.
    const full = argv.includes("--full");
    const base: EpisodeDocument = from
      ? (JSON.parse(readFileSync(resolve(from), "utf8")) as EpisodeDocument)
      : full
        ? generateSceneFromPrompt(prompt!).document
        : buildFromPrompt(prompt!);
    persist(base, []);
    console.log(`new working scene${prompt ? ` from prompt "${prompt}"` : ""}${full ? " (full generation)" : ""} → ${DOC_PATH}`);
    console.log(summarizeDocument(base));
    if (prompt && full) {
      console.log(
        `\nFULL scene generated: ${base.assets.characters.length} cast, ${base.dialogue?.lines.length ?? 0} dialogue lines, ` +
        `${base.shots.length} shots with directed actions. Swap placeholder rigs for real ones with:\n` +
        base.assets.characters
          .map((c) => `       animation-scene cast add --id ${c.id} --query "<look for ${c.id.replace(/-/g, " ")}>"`)
          .join("\n") +
        `\nThen render →  animation-scene render`
      );
    } else if (prompt) {
      // Suggest concrete cast ids from the prompt (or honor an explicit --characters list) so
      // the directing agent has ready-to-run `cast add` commands. The cast is EMPTY until run.
      const explicit = opt("characters")?.split(",").map((s) => s.trim()).filter(Boolean);
      const suggested = explicit && explicit.length > 0 ? explicit : suggestCastIds(prompt);
      const castAddLines = suggested
        .map((id) => `       animation-scene cast add --id ${id} --query "<look for ${id.replace(/-/g, " ")}>"`)
        .join("\n");
      console.log(
        `\nThis is a SKELETON (set + shots + timeline only; cast is EMPTY). YOU, the directing agent, now author the story:\n` +
        `  1. cast: resolve real characters from the prompt (suggested ids: ${suggested.join(", ")}):\n` +
        `${castAddLines}\n` +
        `  2. dialogue: write the real lines →  animation-scene dialogue --line <id> --speaker <id> --text "..." --start <s> --end <s>\n` +
        `  3. perform: distinct motion per beat →  animation-scene block/gesture --character <id> --shot <id> ...\n` +
        `  4. render →  animation-scene render\n` +
        `No placeholder captions and no default cast are written — resolve real characters before authoring performance.`
      );
    }
    break;
  }
  case "show":
    console.log(summarizeDocument(loadDoc()));
    break;
  case "block": {
    const characterId = opt("character")!;
    const shotId = opt("shot")!;
    const to = vec(opt("to"));
    const yaw = Number(opt("yaw") ?? "0");
    const clip = opt("clip");
    if (!characterId || !shotId || !to) {
      console.error("usage: block --character <id> --shot <id> --to x,z [--yaw r] [--clip name]");
      process.exit(1);
    }
    applyEdit((d) => setBlocking(d, characterId, shotId, [{ time: 0, position: to, yaw }], clip));
    break;
  }
  case "camera": {
    const shotId = opt("shot")!;
    if (!shotId) { console.error("usage: camera --shot <id> [--preset p] [--subject x,y,z]"); process.exit(1); }
    applyEdit((d) => setCamera(d, shotId, { preset: opt("preset") as CameraPresetId | undefined, subject: vec(opt("subject"), 0.75) }));
    break;
  }
  case "gesture": {
    const characterId = opt("character")!;
    const shotId = opt("shot")!;
    const clip = opt("clip")!;
    if (!characterId || !shotId || !clip) { console.error("usage: gesture --character <id> --shot <id> --clip <name>"); process.exit(1); }
    applyEdit((d) => setGesture(d, characterId, shotId, clip));
    break;
  }
  case "dress": {
    const propId = opt("prop")!;
    const at = vec(opt("at"));
    if (!propId || !at) { console.error("usage: dress --prop <id> --at x,z [--scale s] [--feet f]"); process.exit(1); }
    applyEdit((d) => placeProp(d, { propId, position: at, scale: Number(opt("scale") ?? "0.12"), feetOffset: Number(opt("feet") ?? "2.8") }));
    break;
  }
  case "clear-props":
    applyEdit((d) => clearProps(d, opt("prop")));
    break;
  case "set": {
    const id = argv[1] && !argv[1].startsWith("--") ? argv[1] : undefined;
    const query = opt("query");
    const template = id ? getSetTemplate(id) : query ? pickSetForPrompt(query) : undefined;
    if (!template) {
      console.error(`usage: set <${SET_TEMPLATES.map((t) => t.id).join("|")}> | set --query "..."`);
      process.exit(1);
    }
    applyEdit((d) => ({ ...d, set: template.set, walkableBounds: template.walkableBounds }));
    console.log(`set → ${template.id}`);
    break;
  }
  case "cast": {
    const file = opt("file");
    const query = opt("query");
    // EITHER resolve from the catalog (`--query`) OR upload a local rigged GLB (`--file`).
    if (argv[1] !== "add" || !opt("id") || (!query && !file)) {
      console.error('usage: cast add --id <id> (--query "..." | --file <path.glb>) [--scale s]');
      process.exit(1);
    }
    const src = file ? { file } : { query: query! };
    void castAdd(opt("id")!, src, opt("scale") ? Number(opt("scale")) : undefined).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
    break;
  }
  case "scale": {
    const id = opt("character");
    const to = Number(opt("to"));
    if (!id || Number.isNaN(to)) { console.error("usage: scale --character <id> --to <s>"); process.exit(1); }
    applyEdit((d) => setCharacterScale(d, id, to));
    break;
  }
  case "shot": {
    const sub = argv[1];
    if (sub === "add") {
      const shotId = opt("id");
      if (!shotId) { console.error("usage: shot add --id <id> [--preset p] [--duration s] [--subject x,y,z]"); process.exit(1); }
      applyEdit((d) => addShot(d, shotId, (opt("preset") ?? "two-shot") as CameraPresetId, Number(opt("duration") ?? "12"), vec(opt("subject"), 0.75) ?? [0, 0.75, 0]));
    } else if (sub === "remove") {
      const shotId = opt("id");
      if (!shotId) { console.error("usage: shot remove --id <id>"); process.exit(1); }
      applyEdit((d) => removeShot(d, shotId));
    } else if (sub === "retime") {
      const shotId = opt("id");
      const duration = Number(opt("duration"));
      if (!shotId || Number.isNaN(duration)) { console.error("usage: shot retime --id <id> --duration s"); process.exit(1); }
      applyEdit((d) => retimeShot(d, shotId, duration));
    } else {
      console.error("usage: shot add|remove|retime ...");
      process.exit(1);
    }
    break;
  }
  case "prop": {
    if (argv[1] !== "add" || !opt("id") || !opt("query")) { console.error('usage: prop add --id <id> --query "..."'); process.exit(1); }
    void propAdd(opt("id")!, opt("query")!).catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
    break;
  }
  case "dialogue": {
    if (argv.includes("--remove")) {
      const lineId = opt("line");
      if (!lineId) { console.error("usage: dialogue --remove --line <id>"); process.exit(1); }
      applyEdit((d) => removeDialogueLine(d, lineId));
      break;
    }
    const lineId = opt("line")!;
    const speakerId = opt("speaker")!;
    const text = opt("text")!;
    if (!lineId || !speakerId || !text) { console.error('usage: dialogue --line <id> --speaker <id> --text "..." --start s [--end s]'); process.exit(1); }
    // --end is OPTIONAL: when omitted, setDialogueLine auto-computes it from the speech
    // duration of the text (captions show only while the line would be spoken).
    const endRaw = opt("end");
    const endTime = endRaw !== undefined ? Number(endRaw) : undefined;
    applyEdit((d) => setDialogueLine(d, { lineId, speakerId, text, startTime: Number(opt("start") ?? "0"), endTime }));
    break;
  }
  case "retime": {
    // Re-sequence ALL dialogue lines back-to-back from t=0 using the speech-duration model.
    applyEdit((d) => retimeDialogue(d));
    break;
  }
  case "undo": {
    const history = loadHistory();
    const prev = history.pop();
    if (!prev) { console.error("nothing to undo"); process.exit(1); }
    persist(prev, history);
    console.log("undone");
    break;
  }
  case "validate": {
    const v = validateEpisodeDocument(loadDoc());
    console.log(`coherence: ${v.ok ? "PASS" : "FAIL"}`);
    for (const e of v.errors) console.log(`  ERROR: ${e}`);
    for (const w of v.warnings) console.log(`  warn: ${w}`);
    process.exitCode = v.ok ? 0 : 1;
    break;
  }
  case "render": {
    if (!existsSync(DOC_PATH)) { console.error("no working scene. Run: animation-scene new"); process.exit(1); }
    const range = opt("range");
    const r = spawnSync(
      "pnpm",
      ["exec", "tsx", "--tsconfig", "tsconfig.base.json", "packages/create-aura3d/templates/animation-studio/scripts/render-live.ts"],
      { cwd: REPO, stdio: "inherit", env: { ...process.env, AURA_DOCUMENT: DOC_PATH, AURA_OUTPUT_DIR: "dist/episodes/scene", ...(range ? { AURA_PREVIEW_RANGE: range } : {}) } }
    );
    process.exitCode = r.status ?? 0;
    break;
  }
  default:
    console.log("commands:");
    console.log("  new [--prompt \"...\"] [--full] [--characters a,b] [--from doc.json] | show | validate | render [--range a-b]");
    console.log("  set <template|--query \"...\">  |  cast add --id <id> --query \"...\"  |  prop add --id <id> --query \"...\"");
    console.log("  block --character <id> --shot <id> --to x,z [--yaw r] [--clip name]  |  scale --character <id> --to s");
    console.log("  camera --shot <id> [--preset p] [--subject x,y,z]  |  gesture --character <id> --shot <id> --clip name");
    console.log("  dress --prop <id> --at x,z [--scale s] [--feet f]  |  clear-props [--prop <id>]");
    console.log("  dialogue --line <id> --speaker <id> --text \"...\" --start s [--end s]  |  dialogue --remove --line <id>  |  retime");
    console.log("  shot add|remove|retime --id <id> [--preset p] [--duration s] [--subject x,y,z]  |  undo");
    console.log("\nthe agent you're already using (Claude Code / Codex / …) drives these — no separate LLM.");
}
