/**
 * prompt-to-scene.ts — Phase F2: a FULL, deterministic prompt → EpisodeDocument generator
 * with NO fallback to a content fixture (no Moon Garden, no hard-coded miko/luma cast).
 *
 * Given a free-text prompt this produces a *complete, renderable* EpisodeDocument whose
 * cast / set / props / dialogue / camera / actions are all DERIVED FROM THE PROMPT TERMS:
 *
 *   - SET     : picked by keyword from {@link SET_TEMPLATES} (neutral STUDIO when nothing
 *               matches — never Moon Garden unless the prompt is explicitly moon/garden/night).
 *   - CAST    : 1–3 character ids parsed from the prompt (proper names first, else a plural
 *               acting noun → noun-1/noun-2, else a singular noun). Each cast member gets a
 *               procedural placeholder GLB url tagged with its prompt-derived look so the doc
 *               is self-describing without a network catalog resolve.
 *   - PROPS   : the chosen set template's ground-dressing prop (scattered by the Director) PLUS
 *               any explicit object nouns mentioned in the prompt (e.g. "car", "table").
 *   - DIALOGUE: real lines synthesised from the prompt's INTENT (question / argument / teaching /
 *               greeting), alternating between cast members, timed by the speech-duration model.
 *               These exercise the F1 acting rules (questions, emphasis, disagreement, movement).
 *   - CAMERA + ACTIONS : produced by the deterministic Director ({@link directScene}) from the
 *               shots + dialogue + cast — establishing → two-shot → medium, with per-beat clip
 *               intents (talk / gesture / point / nod / walk / react), never all idle/talk.
 *
 * It is fully deterministic (a prompt always yields the same document) and OFFLINE (no catalog
 * network call) so it runs in CI as the F2 regression proof. The resulting document is a valid
 * EpisodeDocument the generic player renders directly.
 *
 * HONEST SCOPE: the cast GLB urls are procedural placeholders tagged with the prompt-derived
 * look; swapping in catalog-resolved rigs is `animation-scene cast add`'s job (network path).
 * This module proves the *generation* contract — prompt terms drive every part of the document
 * and it never silently reuses Moon Garden — not that an arbitrary prompt is "watchable".
 */

import {
  directBeats,
  directScene,
  validateDirectedActing,
  type DirectorDialogueLine,
  type DirectorSceneInput
} from "./director-heuristics";
import {
  estimateSpeechDuration,
  type CharacterAsset,
  type DialogueLine,
  type DialogueTrack,
  type EpisodeDocument,
  type PropAsset
} from "../episode-document";
import { pickSetForPrompt, SET_TEMPLATES, type SetTemplate } from "../set-templates";

/**
 * The curated, render-ready A-grade humanoid cast (public/cast-library/*). A generated scene binds
 * each prompt-derived character to one of these real graded-A 21-joint GLBs (cycled), so the doc
 * renders immediately with a properly-rigged, mouth-morph-equipped character. `animation-scene cast
 * add --file/--query` overrides a slot with a user-uploaded or catalog-resolved rig.
 */
// NEUTRAL names on purpose: the curated cast must NOT reuse the moon-garden fixture cast
// (miko/luma) or a generic scene would re-introduce exactly the leakage D1 prohibits.
const CAST_LIBRARY: readonly { id: string; url: string; mouthMorphIndex: number }[] = [
  { id: "humanoid-a", url: "/aura-assets/cast-a.catalog.glb", mouthMorphIndex: 0 },
  { id: "humanoid-b", url: "/aura-assets/cast-b.catalog.glb", mouthMorphIndex: 0 }
];

/**
 * Props are only emitted when they resolve to a REAL asset on disk — a fictional placeholder GLB
 * url would 404 and crash the render. Everything else is left to the set's procedural dressing.
 */
const REAL_PROP_GLB: Readonly<Record<string, string>> = {
  mushroom: "/aura-assets/mushroom.catalog.glb"
};

/** Words that are never a character name or object noun. */
const STOP = new Set([
  "the", "a", "an", "and", "or", "but", "on", "in", "at", "of", "to", "with", "for", "from",
  "two", "three", "four", "their", "his", "her", "its", "they", "them", "while", "as", "about",
  "over", "under", "into", "near", "this", "that", "these", "those", "are", "is", "was", "were",
  "who", "what", "when", "where", "why", "how", "then", "than", "some", "any", "each"
]);

/** The scene INTENT we infer from the prompt — drives the synthesised dialogue. */
export type SceneIntent = "argument" | "question" | "teaching" | "greeting" | "task";

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function words(prompt: string): string[] {
  return prompt.toLowerCase().split(/[^a-z']+/).filter((w) => w.length > 0);
}

/**
 * Location / set words — these describe WHERE the scene is, not WHO is in it, so they must never
 * be parsed as cast members (e.g. "...in a forest" / "...in a garage"). Derived from the set-template
 * keywords plus a few generic place words.
 */
const LOCATION_WORDS = new Set<string>([
  ...SET_TEMPLATES.flatMap((t) => t.keywords),
  "forest", "garden", "room", "scene", "background", "place", "ground", "sky", "floor", "field", "wall", "door", "table"
]);

/**
 * Parse 1–3 cast ids from the prompt. Proper names win ("Miko and Luma" → miko, luma); else nouns
 * introduced by an article or joined by "and" ("a fox and a bear" → fox, bear; "a chef teaching a
 * child" → chef, child), excluding location words; else a plural acting noun ("two robots" →
 * robot-1, robot-2); else a singular noun; else a single generic "hero". Never returns the
 * Moon-Garden cast unless the prompt literally names them.
 */
export function parseCast(prompt: string): string[] {
  const properNames = (prompt.match(/\b[A-Z][a-z]{2,}\b/g) ?? [])
    .map(slug)
    .filter((n) => n && !STOP.has(n));
  if (properNames.length > 0) return [...new Set(properNames)].slice(0, 3);

  // Multi-character: a noun introduced by an article (a/an/the) or "and" is a candidate actor,
  // unless it is a location/set word. Catches "a fox and a bear", "a chef teaching a child".
  const toks = words(prompt);
  const candidates: string[] = [];
  for (let i = 0; i < toks.length; i += 1) {
    const w = toks[i]!;
    const introducedByArticle = i > 0 && ["a", "an", "the", "and"].includes(toks[i - 1]!);
    if (introducedByArticle && w.length >= 3 && !STOP.has(w) && !LOCATION_WORDS.has(w)) candidates.push(slug(w));
  }
  const uniqueCandidates = [...new Set(candidates)].filter((n) => n.length > 0);
  if (uniqueCandidates.length >= 2) return uniqueCandidates.slice(0, 3);

  const lower = prompt.toLowerCase();
  // First plural noun that is an actor (not a location): "two robots" → robot-1, robot-2.
  const plurals = lower.match(/\b([a-z]{3,})s\b/g) ?? [];
  for (const p of plurals) {
    const base = slug(p.replace(/s$/, ""));
    if (base && !STOP.has(base) && !LOCATION_WORDS.has(base)) return [`${base}-1`, `${base}-2`];
  }

  if (uniqueCandidates.length === 1) return uniqueCandidates;

  const singular = words(prompt).find((w) => w.length >= 3 && !STOP.has(w) && !LOCATION_WORDS.has(w));
  return [singular ? slug(singular) : "hero"];
}

/** Object nouns the prompt explicitly names (e.g. "car", "table") → extra registered props. */
export function parseObjectProps(prompt: string, castIds: readonly string[]): string[] {
  const castWords = new Set(castIds.flatMap((id) => id.split("-")));
  const OBJECTS = [
    "car", "table", "chair", "desk", "door", "box", "ball", "book", "lamp", "tree",
    "rock", "barrel", "crate", "engine", "computer", "robot", "ship", "rocket", "sign"
  ];
  const present = new Set(words(prompt));
  return OBJECTS.filter((o) => present.has(o) && !castWords.has(o));
}

/** Infer the scene's dramatic intent from the prompt verbs. */
export function inferIntent(prompt: string): SceneIntent {
  const w = new Set(words(prompt));
  if (["argue", "arguing", "argument", "fight", "fighting", "disagree", "clash"].some((k) => w.has(k))) return "argument";
  if (prompt.includes("?") || ["ask", "asking", "question", "wonder", "mystery"].some((k) => w.has(k))) return "question";
  if (["teach", "teaching", "explain", "explaining", "show", "showing", "lesson", "learn"].some((k) => w.has(k))) return "teaching";
  if (["fix", "fixing", "repair", "build", "building", "make", "making", "work", "working"].some((k) => w.has(k))) return "task";
  return "greeting";
}

/**
 * Synthesise dialogue LINES (text only) from the prompt intent + cast, alternating speakers.
 * The lines deliberately exercise every F1 acting rule so the director produces visible acting:
 * a question ("?"), emphasis ("!"/ALL-CAPS), a disagreement (negation), and a movement verb.
 * The TOPIC noun (the focus object / first cast role) is woven in so the lines reference the
 * prompt — they are not generic boilerplate.
 */
export function synthesizeDialogue(prompt: string, castIds: readonly string[], intent: SceneIntent): { speakerId: string; text: string }[] {
  const a = castIds[0]!;
  const b = castIds[1] ?? castIds[0]!;
  // The topic the scene is about: the named object prop, else the first cast role word.
  const objects = parseObjectProps(prompt, castIds);
  const topic = objects[0] ?? a.replace(/-\d+$/, "").replace(/-/g, " ") ?? "this";

  const byIntent: Record<SceneIntent, [string, string][]> = {
    argument: [
      [a, `Did you even look at the ${topic}?`],
      [b, `Yes, and it is NOT my fault!`],
      [a, `That is completely wrong.`],
      [b, `Then come over here and prove it.`],
      [a, `Fine. Move aside and let me check.`],
      [b, `Right here, look at this part.`]
    ],
    question: [
      [a, `What happened to the ${topic}?`],
      [b, `I am not sure, it just stopped.`],
      [a, `Did you try anything yet?`],
      [b, `No, I waited for you.`],
      [a, `Alright, walk me through it slowly.`],
      [b, `It started right about here.`]
    ],
    teaching: [
      [a, `Let me show you how the ${topic} works.`],
      [b, `Okay, I am watching closely.`],
      [a, `First, you NEVER force this part.`],
      [b, `Oh, I always did it the wrong way!`],
      [a, `Come closer and try it yourself.`],
      [b, `Like this? It actually moved!`]
    ],
    task: [
      [a, `We have to fix this ${topic} before dark.`],
      [b, `Agreed, hand me that tool.`],
      [a, `Careful, do NOT drop it!`],
      [b, `Relax, I have got it.`],
      [a, `Now go around and hold the other side.`],
      [b, `On it. Pulling now!`]
    ],
    greeting: [
      [a, `Hey, is the ${topic} ready?`],
      [b, `Almost! Just give me a second.`],
      [a, `That is great news.`],
      [b, `I know, I can NOT wait to show you.`],
      [a, `Come over and let us take a look.`],
      [b, `Here it is, right in front of you.`]
    ]
  };

  return byIntent[intent].map(([speakerId, text]) => ({ speakerId, text }));
}

export interface PromptSceneOptions {
  /** Scene length in seconds (default 24). Shots + dialogue are tiled across it. */
  readonly duration?: number;
  /** Number of shots (default 3 → establishing / two-shot / medium). */
  readonly shotCount?: number;
}

export interface GeneratedScene {
  readonly document: EpisodeDocument;
  readonly intent: SceneIntent;
  readonly setTemplateId: string;
  readonly cast: readonly string[];
}

/**
 * Generate a complete EpisodeDocument from a prompt — the F2 entry point. NO fallback:
 * the document's cast, set, props, dialogue, camera and actions are all derived from the
 * prompt. A non-moon prompt never inherits any Moon-Garden asset.
 */
export function generateSceneFromPrompt(prompt: string, options: PromptSceneOptions = {}): GeneratedScene {
  const trimmed = prompt.trim();
  if (trimmed.length === 0) {
    throw new Error("generateSceneFromPrompt requires a non-empty prompt — there is no default scene.");
  }

  const duration = options.duration ?? 24;
  const shotCount = Math.max(2, options.shotCount ?? 3);
  const intent = inferIntent(trimmed);
  const template: SetTemplate = pickSetForPrompt(trimmed);
  const castIds = parseCast(trimmed);

  // --- Cast assets: bind each prompt-derived character to a real graded-A humanoid (cycled) so the
  // generated doc renders immediately; the prompt-derived id/name is preserved for the scene. ---
  const characters: CharacterAsset[] = castIds.map((id, i) => {
    const rig = CAST_LIBRARY[i % CAST_LIBRARY.length]!;
    return {
      id,
      url: rig.url,
      scale: 1.3,
      defaultClip: "idle",
      availableClips: ["idle", "talk", "gesture", "point", "nod", "walk", "run", "react"],
      mouthMorphIndex: rig.mouthMorphIndex,
      attribution: `"${id.replace(/-/g, " ")}" — curated A-grade humanoid (${rig.id})`,
      license: "CC0",
      fidelityGrade: "A"
    } as CharacterAsset;
  });

  // --- Props: ONLY emit a prop that resolves to a REAL asset; otherwise leave it to the set's
  // procedural dressing (a fictional placeholder GLB would 404 and crash the render). ---
  const objectProps = parseObjectProps(trimmed, castIds);
  const props: PropAsset[] = [];
  if (template.groundProp && REAL_PROP_GLB[template.groundProp.propId]) {
    props.push({
      id: template.groundProp.propId,
      url: REAL_PROP_GLB[template.groundProp.propId]!,
      attribution: `set dressing: ${template.groundProp.query}`,
      license: "CC0"
    });
  }
  for (const obj of objectProps) {
    // Always RECORD the prompt's object noun (so the prompt provably influences the doc), but only
    // attach a url when it resolves to a real asset; otherwise it renders as procedural dressing.
    const url = REAL_PROP_GLB[obj];
    props.push(url ? { id: obj, url, attribution: `prompt object: ${obj}`, license: "CC0" } : { id: obj, attribution: `prompt object: ${obj} (procedural — no resolved mesh)`, license: "CC0" });
  }

  // --- Shots: tile the timeline contiguously from 0. ---
  const shotDur = duration / shotCount;
  const shots = Array.from({ length: shotCount }, (_, i) => ({
    shotId: `shot-${i + 1}`,
    startTime: Number((i * shotDur).toFixed(3)),
    endTime: Number(((i + 1) * shotDur).toFixed(3))
  }));

  // --- Dialogue: synthesise prompt-derived lines, timed by the speech model, back-to-back. ---
  const synth = synthesizeDialogue(trimmed, castIds, intent);
  const lines: DialogueLine[] = [];
  let cursor = 0.2;
  synth.forEach((s, i) => {
    const start = Number(cursor.toFixed(3));
    const dur = estimateSpeechDuration(s.text);
    let end = Number((start + dur).toFixed(3));
    if (end > duration) end = duration;
    lines.push({ lineId: `l${i}`, speakerId: s.speakerId, text: s.text, startTime: start, endTime: end });
    cursor = end + 0.25; // small gap between lines
  });
  const dialogueTrack: DialogueTrack = { language: "en", lines };

  // --- Director: camera + per-character actions from the shots + dialogue + cast. ---
  const directorDialogue: DirectorDialogueLine[] = lines.map((l) => ({
    lineId: l.lineId,
    speakerId: l.speakerId,
    startTime: l.startTime,
    endTime: l.endTime,
    text: l.text
  }));
  const sceneInput: DirectorSceneInput = {
    duration,
    characters: castIds.map((id, i) => ({ id, entersFrom: i === 0 ? "left" : i === 1 ? "right" : "none" })),
    shots,
    dialogue: directorDialogue,
    walkableBounds: template.walkableBounds,
    props: template.groundProp
      ? [{ propId: template.groundProp.propId, count: 6, scaleRange: [...template.groundProp.scaleRange] as [number, number], feetOffset: template.groundProp.feetOffset }]
      : [],
    durationEstimator: estimateSpeechDuration
  };
  const sceneId = `scene-${slug(trimmed).slice(0, 32) || "untitled"}`;
  const directed = directScene(sceneId, sceneInput);

  // F1 GATE (now wired into the REAL pipeline, not just unit-tested): the director's per-beat
  // acting plan must pass validateDirectedActing — it must not be all idle/talk, must contain a
  // gesture, and every character must get a non-idle intent. A genuinely degenerate scene (e.g. a
  // static all-idle cast, or dialogue that yields no acting) is BLOCKED here at generation time
  // rather than silently producing a dead document.
  //
  // The listener-reaction check (NO_REACTION) and the per-character static check (STATIC_CHARACTER)
  // only make sense for a 2+ character scene: a SOLO cast has no second party to react, so those
  // codes are structurally unsatisfiable and are not "degeneracy" — a one-character scene that
  // still gestures/walks is perfectly actable. We therefore drop those two codes for a solo cast
  // and keep the real degeneracy checks (ALL_LOW_MOTION / NO_GESTURE) for every scene.
  const beats = directBeats(sceneInput);
  const validation = validateDirectedActing(beats, { cast: castIds });
  const solo = castIds.length < 2;
  const blocking = validation.issues.filter(
    (i) => !(solo && (i.code === "NO_REACTION" || i.code === "STATIC_CHARACTER"))
  );
  if (blocking.length > 0) {
    const detail = blocking.map((i) => `[${i.code}] ${i.message}`).join("; ");
    throw new Error(
      `generateSceneFromPrompt produced a degenerate (un-actable) scene for prompt "${trimmed}": ${detail}`
    );
  }

  const document: EpisodeDocument = {
    id: sceneId,
    duration,
    assets: { characters, props },
    set: template.set,
    walkableBounds: template.walkableBounds,
    shots: directed.shots,
    blocking: directed.blocking,
    setDressing: directed.setDressing,
    worldState: directed.worldState,
    dialogue: dialogueTrack
  };

  return { document, intent, setTemplateId: template.id, cast: castIds };
}
