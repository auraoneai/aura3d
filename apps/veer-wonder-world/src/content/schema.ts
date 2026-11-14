// Content schema and lint (PRD 04 C01, J05, J14; PRD 03 sections 3 and 7;
// PRD 01 sections 3-9; PRD 05 sections 1 and 6; MASTER-PROMPT section 6).
//
// `validateStory` and `validateCatalog` return every problem as a plain
// message (an empty list means the content passes). They never throw and
// never touch the DOM, clocks or randomness, so they run the same in unit
// tests, in tools/validate-wonder-world-content.mjs and in the app.
//
// Stage model used by the visibility checks (words, tap targets, counting):
// cast members and props start visible unless `hidden` or placed on an off*
// spot. `enter` and `show` make an actor visible (a popped or eaten object
// comes back only through `show`/`enter`); `hide` hides it; `exit` and a
// `move` to an off* spot take it out of the frame; `object` actions `pop` and
// `eat` use the object up; a carried item goes wherever its carrier goes until
// it is put down (`carry` with null or another item), moved or sent off.
// Everything else leaves visibility alone. Reduced motion may change HOW
// things move, never what is on stage or what is heard. A character who
// speaks is on stage while its line plays (its talking pulse is the cue).

import type {
  AgeBand,
  BeatKind,
  BeatResponse,
  BeatSpec,
  CameraPresetId,
  CharacterId,
  Gesture,
  LineRef,
  LocalePack,
  MoveStyle,
  MusicBedId,
  ObjectAction,
  Phase,
  PropAssetId,
  SegmentTemplateId,
  SegmentTransition,
  SfxId,
  ShowAspect,
  ShowSegmentSpec,
  ShowSpec,
  SongId,
  SpeakerId,
  SpotId,
  StageAction,
  StorySpec,
  WorldId,
  AudioClipRef
} from "../types.js";
import { applyRoundVariant } from "../runtime/beat-runner.js";
import { ALPHABET, LETTERS, LETTER_NAMES, checkLetterTexts, equatesNameAndSound, letterInfo, lettersNamedIn, mentionsSound } from "./letters.js";
import { COUNT_MAX, COUNT_MIN, COUNT_WORD_IDS, countsAboveLimit, highestSpokenNumber, spokenNumbers } from "./numbers.js";
import { MUSIC_BEDS, BED_MAX_SEC, BED_MIN_SEC } from "./music.js";
import { SFX, SFX_MAX_GAIN, SFX_MAX_SEC, SFX_MIN_SEC, startlingTerms } from "./sfx.js";
import { PRD_SONG_LYRICS, SONGS, SONG_IDS, songLengthSec } from "./songs.js";
export { SONG_IDS };
import { WORDS, WORD_IDS, isWordId, wordSpoken, type WordId } from "./words.js";

// ---------------------------------------------------------------------------
// Runtime lists of the contract unions (compile-time checked to be complete).

function complete<T extends string>() {
  return <const L extends readonly T[]>(values: L & ([Exclude<T, L[number]>] extends [never] ? unknown : never)): readonly T[] => values;
}

function keysOf<T extends string>(record: Readonly<Record<T, unknown>>): T[] {
  const out: T[] = [];
  for (const key in record) out.push(key);
  return out;
}

function has(record: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

export const CHARACTER_IDS = complete<CharacterId>()(["momo", "lulu", "sheru", "gogo", "lumi", "peeko", "tiko"]);
export const SPEAKER_IDS = complete<SpeakerId>()(["narrator", "momo", "lulu", "sheru", "gogo", "lumi", "peeko", "tiko", "robot"]);
export const AGE_BAND_IDS = complete<AgeBand>()(["little", "toddler", "preschool"]);
export const SHOW_ASPECT_IDS = complete<ShowAspect>()(["16:9", "9:16"]);
export const SEGMENT_TEMPLATE_IDS = complete<SegmentTemplateId>()([
  "coldOpen", "theme", "arrival", "wordGame", "songBreak", "surprise", "tryAtHome", "goodbye", "shortMoment"
]);
export const SEGMENT_TRANSITION_IDS = complete<SegmentTransition>()(["none", "cut", "train", "fade"]);
export const WORLD_IDS = complete<WorldId>()([
  "meadow", "music-garden", "peekaboo-barn", "station", "learning-cloud", "home-nook",
  "moonlit-nursery", "starlight-cloud"
]);
export const PROP_ASSET_IDS = complete<PropAssetId>()([
  "gogoCarriage", "teddy", "robot", "cow", "sheep", "duck", "horse", "bird", "butterfly", "ball", "bubbleWand", "bubble",
  "cookie", "plate", "mirror", "door", "letterB", "letterA", "apple", "banana", "cake", "drum", "shaker", "toyPiano",
  "picnicBasket", "car", "sponge", "towel", "toyBlock", "lift", "flower", "flowerBud", "tree", "bush", "barn", "station",
  "tunnel", "house", "bed", "sink", "table", "chair", "cushion", "toyBox", "bench", "colourMachine", "storyBox",
  "pastryCircle", "pastrySquare", "pastryTriangle", "hat", "stompStone", "cloud", "balloon", "letterBLower", "letterALower",
  "toothbrush", "sun", "candleFlame", "partyHat",
  "moon", "cradle", "cribMobile", "musicBox", "nightlight", "blanket", "sleepyCloud"
]);
export const SPOT_IDS = complete<SpotId>()([
  "center", "left", "right", "farLeft", "farRight", "front", "frontLeft", "frontRight", "back", "backLeft", "backRight",
  "high", "highLeft", "highRight", "offLeft", "offRight", "offTop", "offBelow"
]);
export const OFF_SPOTS: readonly SpotId[] = ["offLeft", "offRight", "offTop", "offBelow"];
export const GESTURES = complete<Gesture>()([
  "idle", "wave", "talk", "point", "happy", "cheer", "dance", "hop", "nod", "look", "sleep", "eat", "wake", "sway", "mirror",
  "pickUp", "shrug", "wag", "sniff", "bark", "sit", "clap", "stomp", "freeze", "peek", "hide", "float", "glow", "blink", "bow",
  "surprise", "wait", "yawn", "rock", "twinkle"
]);
export const OBJECT_ACTIONS = complete<ObjectAction>()([
  "roll", "pop", "open", "close", "bounce", "wobble", "spin", "fall", "rise", "glow", "shrink", "grow", "bloom", "wash", "dry",
  "up", "down", "stack", "topple", "eat", "tint", "shake", "ring", "go", "stop"
]);
export const MOVE_STYLES = complete<MoveStyle>()(["walk", "run", "roll", "float", "hop", "drive", "fly", "slide"]);
export const CAMERA_PRESETS = complete<CameraPresetId>()(["wide", "medium", "close", "left", "right", "high"]);
export const BEAT_KINDS = complete<BeatKind>()(["greeting", "hook", "model", "invite", "event", "repeat", "song", "outro"]);
export const SFX_IDS: readonly SfxId[] = keysOf(SFX);
export const MUSIC_BED_IDS: readonly MusicBedId[] = keysOf(MUSIC_BEDS);

const set = (values: readonly string[]): ReadonlySet<string> => new Set<string>(values);
const CHARACTER_SET = set(CHARACTER_IDS);
const SPEAKER_SET = set(SPEAKER_IDS);
const AGE_BAND_SET = set(AGE_BAND_IDS);
const SHOW_ASPECT_SET = set(SHOW_ASPECT_IDS);
const SEGMENT_TEMPLATE_SET = set(SEGMENT_TEMPLATE_IDS);
const SEGMENT_TRANSITION_SET = set(SEGMENT_TRANSITION_IDS);
const WORLD_SET = set(WORLD_IDS);
const PROP_ASSET_SET = set(PROP_ASSET_IDS);
const SPOT_SET = set(SPOT_IDS);
const OFF_SPOT_SET = set(OFF_SPOTS);
const GESTURE_SET = set(GESTURES);
const OBJECT_ACTION_SET = set(OBJECT_ACTIONS);
const MOVE_STYLE_SET = set(MOVE_STYLES);
const CAMERA_SET = set(CAMERA_PRESETS);
const BEAT_KIND_SET = set(BEAT_KINDS);

// ---------------------------------------------------------------------------
// Canonical catalog (MASTER-PROMPT section 2; PRD 05 sections 2-3; SleepingBaby-Songs-Games.PRD).

/** Episode slugs in canonical order: index + 1 is the episode number. */
export const EPISODE_SLUGS = [
  "momo-magic-mouth", "peekaboo-palace", "alphabet-zoo", "gogo-abc-train", "counting-cookies",
  "lulu-dino-dance", "magic-colour-machine", "wheres-sheru", "baby-animal-orchestra", "momos-hungry-belly",
  "number-balloon-rescue", "magic-shape-bakery", "silly-robot-factory", "lost-teddy-adventure", "momo-bubble-universe",
  "little-birthday-party", "sheru-big-adventure", "whos-at-the-door", "momos-day", "little-story-machine",
  "lumi-moonlit-lullaby", "teddy-warm-blanket", "three-sleepy-sheep", "gogo-quiet-night-train",
  "peeko-cricket-garden", "drifting-dream-clouds"
] as const;

/** Activity slugs in canonical order: index + 1 is the activity number. */
export const ACTIVITY_SLUGS = [
  "bubble-garden", "gogo-train", "sheru-ball", "peekaboo-animal-barn", "teddy-snack-picnic", "splashy-car-wash",
  "little-lift", "build-and-tumble", "family-doorbells", "bears-little-band", "magic-sound-garden", "find-my-real-toy",
  "tuck-in-friends", "starlight-music-box", "goodnight-little-lights", "cloud-sheep-hush"
] as const;

/** The P1 pilot: episodes 1, 2, 5, 6, 9, 17 and activities 1-3 (PRD 05 section 0). */
export const P1_EPISODE_NUMBERS: readonly number[] = [1, 2, 5, 6, 9, 17];
export const P1_ACTIVITY_NUMBERS: readonly number[] = [1, 2, 3];

/** The line-key prefix of a story: `e01`-`e20` for episodes, `g01`-`g12` for activities. */
export function storyCode(story: Pick<StorySpec, "kind" | "number">): string {
  return `${story.kind === "episode" ? "e" : "g"}${String(story.number).padStart(2, "0")}`;
}

/** The canonical slug and phase for an episode or activity number. */
export function canonicalStory(kind: StorySpec["kind"], number: number): { readonly slug: string; readonly phase: Phase } | undefined {
  const slugs: readonly string[] = kind === "episode" ? EPISODE_SLUGS : ACTIVITY_SLUGS;
  const slug = Number.isInteger(number) ? slugs[number - 1] : undefined;
  if (slug === undefined) return undefined;
  const p1 = kind === "episode" ? P1_EPISODE_NUMBERS : P1_ACTIVITY_NUMBERS;
  return { slug, phase: p1.includes(number) ? "P1" : "P2" };
}

// ---------------------------------------------------------------------------
// Limits (PRD 01, 03, 05).

export const MIN_TARGET_WORDS = 1;
export const MAX_TARGET_WORDS = 3;
/** An episode says each target word in at least this many different lines, spoken or sung (PRD 05 section 6). */
export const MIN_TARGET_WORD_LINES = 2;
/** Counting (one, two, three + noun) and animal-sound clusters may list four (PRD 05 section 6). */
export const MAX_CLUSTER_TARGET_WORDS = 4;
export const MAX_TAP_TARGETS = 2;
export const EPISODE_MIN_SEC = 120;
export const EPISODE_MAX_SEC = 240;
/** Declared episode length may differ from the computed estimate by at most this fraction. */
export const DURATION_TOLERANCE = 0.25;
/** An activity, every round played, stays a short session. */
export const ACTIVITY_MAX_SEC = 360;
export const MAX_ROUNDS = 5;
/** The PRD's 4-6 s turn proposal; content may override per beat. */
export const DEFAULT_WAIT_MS = 5000;
export const MIN_WAIT_MS = 2000;
/** Long enough for "Find My Real Toy" style real-world turns and calm 52 s lullaby beats; always finite. */
export const MAX_WAIT_MS = 60000;
export const MAX_HOLD_MS = 60000;
/** One short sentence or two linked phrases (PRD 02 section 5). */
export const MAX_LINE_WORDS = 12;
/** Fallback for a line with no text at all (matches the runtime fallback). */
export const DEFAULT_LINE_MS = 2600;
/** A song may run this far past the quiet window before it counts as an overlap. */
const SONG_OVERLAP_GRACE_MS = 250;

const ANIMAL_SOUND_WORDS: ReadonlySet<string> = new Set(["moo", "baa", "quack", "woof", "neigh", "tweet"]);
const COUNT_WORDS: ReadonlySet<string> = new Set<string>(COUNT_WORD_IDS);

/**
 * Child-safety phrases that never appear in any line, string or lyric
 * (MASTER-PROMPT section 6; PRD 01 sections 3.1 and 7; PRD 06 QA-E04).
 */
export const BANNED_PHRASES: readonly string[] = [
  "say it", "repeat after me", "wrong", "try again", "good job saying", "try harder",
  "can you say", "say after me", "not quite", "incorrect", "use your words", "speak up"
];

/**
 * Family names stay out of every default line and string (PRD 05 E18, G09).
 * A child's name is never written in shipped source (this file is bundled):
 * callers outside the bundle pass it as `ValidateOptions.guardNames`
 * (tools/validate-content-entry.ts derives it from the working folder name).
 */
export const FAMILY_NAMES: readonly string[] = [
  "mama", "mamma", "mommy", "mummy", "mom", "mum", "papa", "daddy", "dad", "dada",
  "grandma", "grandpa", "granny", "nana", "nani", "dadi"
];

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function phrasePattern(phrase: string): RegExp {
  return new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(phrase).replace(/\s+/g, "\\s+")}(?=$|[^a-z0-9])`, "i");
}

const BANNED_PATTERNS = BANNED_PHRASES.map((phrase) => ({ phrase, pattern: phrasePattern(phrase) }));
const FAMILY_PATTERNS = FAMILY_NAMES.map((name) => ({ phrase: name, pattern: phrasePattern(name) }));
/** The chick's old name: Pip is the hero of the live game Pip's Big Leap, so the chick is Peeko. */
const RETIRED_NAME = phrasePattern("pip");

function normalizeQuotes(text: string): string {
  return text.replace(/[\u2018\u2019]/g, "'");
}

/** The banned child-safety phrases found in `text`. */
export function bannedPhrasesIn(text: string): string[] {
  const t = normalizeQuotes(text);
  return BANNED_PATTERNS.filter((entry) => entry.pattern.test(t)).map((entry) => entry.phrase);
}

/** The family names found in `text`, plus any of the extra guard names (a child's name, passed in by the caller). */
export function familyNamesIn(text: string, guardNames: readonly string[] = []): string[] {
  const t = normalizeQuotes(text);
  const found = FAMILY_PATTERNS.filter((entry) => entry.pattern.test(t)).map((entry) => entry.phrase);
  for (const raw of guardNames) {
    const name = raw.trim().toLowerCase();
    if (name !== "" && !found.includes(name) && phrasePattern(name).test(t)) found.push(name);
  }
  return found;
}

/** Every UI string key the app shell and UI modules look up (src/localization/en/ui.ts defines them). */
export const REQUIRED_UI_KEYS: readonly string[] = [
  "ui.start.tap", "ui.start.title", "ui.start.sound", "ui.mode.play", "ui.mode.watch", "ui.mode.auto", "ui.mode.windDown", "ui.mode.label",
  "ui.menu.episodes", "ui.menu.activities", "ui.menu.sleep", "ui.menu.songs", "ui.menu.all", "ui.menu.playLullabies", "ui.menu.title", "ui.menu.label",
  "ui.parent.title", "ui.parent.open", "ui.parent.mode", "ui.parent.display", "ui.parent.music", "ui.parent.sound",
  "ui.parent.sfx", "ui.parent.sfxHelp", "ui.parent.sfx.off", "ui.parent.sfx.soft", "ui.parent.sfx.normal",
  "ui.parent.windDown", "ui.parent.windDownHelp", "ui.parent.sleepTimer", "ui.parent.sleepTimerHelp", "ui.parent.sleepTimerOff",
  "ui.parent.captions", "ui.parent.reducedMotion", "ui.parent.highContrast", "ui.parent.wait", "ui.parent.waitHelp",
  "ui.parent.seconds", "ui.parent.words", "ui.parent.wordsHelp", "ui.parent.wordsEmpty", "ui.parent.wordsCount",
  "ui.parent.locale", "ui.parent.language", "ui.parent.locale.en",
  "ui.parent.exit", "ui.parent.back", "ui.parent.close", "ui.parent.clear", "ui.parent.reset",
  "ui.pause", "ui.resume", "ui.replay", "ui.allDone", "ui.parentButton", "ui.controls.label", "ui.confirm",
  "ui.offline.title", "ui.offline.done", "ui.sleep.title", "ui.sleep.body",
  "ui.gate.title", "ui.gate.hold", "ui.gate.button", "ui.gate.holding", "ui.gate.again", "ui.gate.cancel", "ui.gate.note",
  "ui.note.title", "ui.note.start", "ui.note.safety", "ui.note.privacy", "ui.note.links", "ui.note.aap", "ui.note.asha",
  "ui.guide.title", "ui.guide.1", "ui.guide.2", "ui.guide.3", "ui.guide.4",
  "ui.captions.label", "ui.loading", "ui.audio.unavailable", "ui.stage.unavailable", "ui.prototype",
  ...SONG_IDS.map((id) => `ui.song.${id}`),
  ...SPEAKER_IDS.filter((id) => id !== "narrator").map((id) => `ui.speaker.${id}`)
];

/** UI strings that carry placeholders the UI fills in. */
export const UI_PLACEHOLDERS: Readonly<Record<string, readonly string[]>> = {
  "ui.parent.seconds": ["{s}"],
  "ui.parent.wordsCount": ["{n}", "{max}"],
  "ui.start.welcomeNamed": ["{name}"]
};

// ---------------------------------------------------------------------------
// Durations.

/** Recorded audio tables (the shape of AUDIO_MANIFEST in src/audio-manifest.ts). */
export interface AudioTables {
  readonly lines: Readonly<Record<string, AudioClipRef>>;
  readonly sfx: Readonly<Partial<Record<SfxId, AudioClipRef>>>;
  readonly songs: Readonly<Partial<Record<SongId, AudioClipRef>>>;
  readonly beds: Readonly<Partial<Record<MusicBedId, AudioClipRef>>>;
}

export interface ValidateOptions {
  /** Recorded audio; clip durations replace the text-based estimates. */
  readonly audio?: AudioTables;
  /** Every voiced line, song, effect and bed a story uses must have a recorded clip. */
  readonly requireAudio?: boolean;
  /**
   * validateCatalog only: require the full canonical catalog (20 episodes,
   * 12 activities), the UI strings and the song/effect/bed/word/letter
   * libraries. Default true; synthetic test catalogs pass false.
   */
  readonly complete?: boolean;
  /**
   * Extra names that never appear in a line, tip, string or lyric, reported
   * like family names: the child's name. It is never written in shipped
   * source, so the content lint (tools/validate-content-entry.ts) and the unit
   * tests derive it from the working folder name and pass it here.
   */
  readonly guardNames?: readonly string[];
}

/**
 * Caption-timing estimate for a line of child-directed speech at the slow
 * narration pace (about 400 ms a word, a short rest at each comma or full
 * stop, a longer one at "..."). Used until the recorded clip exists, and by
 * the app when a clip is missing.
 */
export function estimateLineMs(text: string): number {
  const trimmed = text.trim();
  if (trimmed === "") return DEFAULT_LINE_MS;
  const words = trimmed.split(/\s+/).filter((token) => /[a-z0-9]/i.test(token)).length;
  const ellipses = (trimmed.match(/\.\.\.|\u2026/g) ?? []).length;
  const pauses = (trimmed.replace(/\.\.\.|\u2026/g, " ").match(/[.!?,;:]+/g) ?? []).length;
  return 400 + words * 400 + pauses * 220 + ellipses * 600;
}

function lineMs(key: string, locale: LocalePack, audio: AudioTables | undefined): number {
  const recorded = audio?.lines[key]?.durationMs;
  if (recorded !== undefined && Number.isFinite(recorded) && recorded > 0) return recorded;
  const text = locale.lines[key];
  return text === undefined ? DEFAULT_LINE_MS : estimateLineMs(text);
}

/** Song length: the recorded clip when it exists, otherwise the generated length. */
export function songDurationMs(id: SongId, audio?: AudioTables): number {
  const recorded = audio?.songs[id]?.durationMs;
  if (recorded !== undefined && Number.isFinite(recorded) && recorded > 0) return recorded;
  return songLengthSec(SONGS[id]) * 1000;
}

type Section = "beats" | "intro" | "round" | "outro";

interface BeatRef {
  readonly section: Section;
  readonly index: number;
  readonly beat: BeatSpec;
}

/** Every authored beat once, in section order. */
function beatRefs(story: StorySpec): BeatRef[] {
  if (story.kind === "episode") return story.beats.map((beat, index) => ({ section: "beats", index, beat }));
  return [
    ...story.intro.map((beat, index): BeatRef => ({ section: "intro", index, beat })),
    ...story.round.map((beat, index): BeatRef => ({ section: "round", index, beat })),
    ...story.outro.map((beat, index): BeatRef => ({ section: "outro", index, beat }))
  ];
}

function roundLimit(story: StorySpec): number {
  return story.kind === "activity" && Number.isFinite(story.roundLimit) ? Math.max(0, Math.floor(story.roundLimit)) : 0;
}

/** Beats in play order when `rounds` activity rounds are played (applying `roundVariants` per round). */
function playPath(story: StorySpec, rounds: number): BeatRef[] {
  if (story.kind === "episode") return beatRefs(story);
  const out: BeatRef[] = story.intro.map((beat, index) => ({ section: "intro", index, beat }));
  for (let r = 0; r < rounds; r += 1) {
    const variant = story.roundVariants?.[r];
    out.push(...story.round.map((beat, index): BeatRef => ({ section: "round", index, beat: applyRoundVariant(beat, variant, index) })));
  }
  out.push(...story.outro.map((beat, index): BeatRef => ({ section: "outro", index, beat })));
  return out;
}

/** Every distinct response block (default + per-target overrides) on a beat. */
function beatResponses(beat: BeatSpec): readonly { readonly labelSuffix: string; readonly response: BeatResponse }[] {
  const out: { readonly labelSuffix: string; readonly response: BeatResponse }[] = [];
  if (beat.response) out.push({ labelSuffix: "response", response: beat.response });
  if (beat.responseByTarget) {
    for (const [targetId, branch] of Object.entries(beat.responseByTarget)) {
      if (branch) out.push({ labelSuffix: `responseByTarget["${targetId}"]`, response: branch });
    }
  }
  return out;
}

/** Every spoken LineRef reachable in a story (including roundVariants and responseByTarget). */
function allStoryLines(story: StorySpec): LineRef[] {
  const out: LineRef[] = [];
  const collectBeat = (beat: BeatSpec): void => {
    out.push(...beat.lines);
    if (beat.response) out.push(...beat.response.lines);
    if (beat.responseByTarget) {
      for (const branch of Object.values(beat.responseByTarget)) {
        if (branch?.lines) out.push(...branch.lines);
      }
    }
  };
  for (const ref of beatRefs(story)) collectBeat(ref.beat);
  if (story.kind === "activity" && story.roundVariants) {
    for (const variant of story.roundVariants) {
      for (const override of Object.values(variant.beatOverrides ?? {})) {
        if (!override) continue;
        if (override.lines) out.push(...override.lines);
        if (override.response) out.push(...override.response.lines);
        if (override.responseByTarget) {
          for (const branch of Object.values(override.responseByTarget)) {
            if (branch?.lines) out.push(...branch.lines);
          }
        }
      }
    }
  }
  return out;
}

/** Every StageAction reachable in a story (including roundVariants and responseByTarget). */
function allStoryActions(story: StorySpec): StageAction[] {
  const out: StageAction[] = [];
  const collectBeat = (beat: BeatSpec): void => {
    out.push(...beat.stage, ...(beat.reducedMotionStage ?? []), ...(beat.response?.stage ?? []));
    if (beat.responseByTarget) {
      for (const branch of Object.values(beat.responseByTarget)) {
        if (branch?.stage) out.push(...branch.stage);
      }
    }
  };
  for (const ref of beatRefs(story)) collectBeat(ref.beat);
  if (story.kind === "activity" && story.roundVariants) {
    for (const variant of story.roundVariants) {
      out.push(...(variant.setupStage ?? []), ...(variant.reducedMotionSetupStage ?? []));
      for (const override of Object.values(variant.beatOverrides ?? {})) {
        if (!override) continue;
        out.push(...(override.stage ?? []), ...(override.reducedMotionStage ?? []), ...(override.response?.stage ?? []));
        if (override.responseByTarget) {
          for (const branch of Object.values(override.responseByTarget)) {
            if (branch?.stage) out.push(...branch.stage);
          }
        }
      }
    }
  }
  return out;
}

/** Every distinct play path: episodes have one; activities one per possible round count. */
function playPaths(story: StorySpec): BeatRef[][] {
  if (story.kind === "episode") return [playPath(story, 0)];
  const limit = Math.min(roundLimit(story), MAX_ROUNDS + 5);
  const paths: BeatRef[][] = [];
  for (let r = 1; r <= Math.max(1, limit); r += 1) paths.push(playPath(story, r));
  return paths;
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function beatMs(beat: BeatSpec, locale: LocalePack, audio: AudioTables | undefined): number {
  let total = beat.lines.reduce((sum, line) => sum + lineMs(line.key, locale, audio), 0) + finiteNonNegative(beat.holdMs);
  if (beat.input !== undefined && beat.input.type !== "none") total += beat.waitMs !== undefined && Number.isFinite(beat.waitMs) ? Math.max(0, beat.waitMs) : DEFAULT_WAIT_MS;
  if (beat.response) {
    total += beat.response.lines.reduce((sum, line) => sum + lineMs(line.key, locale, audio), 0) + finiteNonNegative(beat.response.holdMs);
  }
  return total;
}

/**
 * Running time (ms) with no taps at all: every line plays (recorded length or
 * text estimate), every hold runs, every wait times out. Activities play
 * `rounds` rounds (default 1: a timeout on more-or-done goes to the outro).
 */
export function estimateStoryMs(story: StorySpec, locale: LocalePack, opts: { readonly audio?: AudioTables; readonly rounds?: number } = {}): number {
  const rounds = story.kind === "activity" ? Math.max(0, Math.min(roundLimit(story), Math.floor(opts.rounds ?? 1))) : 0;
  return playPath(story, rounds).reduce((sum, ref) => sum + beatMs(ref.beat, locale, opts.audio), 0);
}

// ---------------------------------------------------------------------------
// Stage simulation.

interface Presence {
  hidden: boolean;
  /** Its own spot is outside the frame (ignored while carried or riding). */
  off: boolean;
  gone: boolean;
  /** The actor holding it; a carried item goes wherever its carrier goes. */
  carriedBy: string | null;
  /** The vehicle or actor this actor rides on; a rider follows its mount's frame visibility. */
  ridingOn: string | null;
}

type StageState = Map<string, Presence>;

function isOffSpot(spot: string): boolean {
  return OFF_SPOT_SET.has(spot);
}

function initialState(story: Pick<StorySpec, "cast" | "props">): StageState {
  const state: StageState = new Map();
  for (const member of story.cast) {
    state.set(member.id, { hidden: member.hidden === true, off: isOffSpot(member.at), gone: false, carriedBy: null, ridingOn: null });
  }
  for (const prop of story.props) {
    state.set(prop.id, { hidden: prop.hidden === true, off: isOffSpot(prop.at), gone: false, carriedBy: null, ridingOn: null });
  }
  return state;
}

function cloneState(state: StageState): StageState {
  const copy: StageState = new Map();
  for (const [id, presence] of state) copy.set(id, { ...presence });
  return copy;
}

/** Whether the actor (or, for a carried/riding actor, its chain of carriers/mounts) is outside the frame. */
function isOffFrame(state: StageState, id: string, depth = 0): boolean {
  const presence = state.get(id);
  if (presence === undefined) return true;
  const hostId = presence.carriedBy ?? presence.ridingOn;
  if (hostId === null || depth > state.size) return presence.off;
  const carrier = state.get(hostId);
  if (carrier === undefined || carrier.hidden || carrier.gone) return true;
  return isOffFrame(state, hostId, depth + 1);
}

function isVisible(state: StageState, id: string): boolean {
  const presence = state.get(id);
  return presence !== undefined && !presence.hidden && !presence.gone && !isOffFrame(state, id);
}

function visibleIds(state: StageState): string[] {
  return [...state.keys()].filter((id) => isVisible(state, id)).sort();
}

/** Puts down whatever `actor` holds, where the actor stands. */
function dropItems(state: StageState, actor: string): void {
  const off = isOffFrame(state, actor);
  for (const presence of state.values()) {
    if (presence.carriedBy === actor) {
      presence.carriedBy = null;
      presence.off = off;
    }
  }
}

function applyActions(state: StageState, actions: readonly StageAction[]): void {
  for (const action of actions) {
    switch (action.do) {
      case "enter": {
        const p = state.get(action.actor);
        if (p) {
          p.hidden = false;
          p.gone = false;
          p.carriedBy = null;
          p.ridingOn = null;
          p.off = isOffSpot(action.at);
        }
        break;
      }
      case "exit": {
        const p = state.get(action.actor);
        if (p) {
          p.carriedBy = null;
          p.ridingOn = null;
          p.off = true;
        }
        break;
      }
      case "move": {
        const p = state.get(action.actor);
        if (p) {
          p.carriedBy = null;
          p.ridingOn = null;
          p.off = isOffSpot(action.to);
        }
        break;
      }
      case "carry": {
        dropItems(state, action.actor);
        if (action.item !== null && action.item !== action.actor) {
          const item = state.get(action.item);
          if (item) item.carriedBy = action.actor;
        }
        break;
      }
      case "ride": {
        const p = state.get(action.actor);
        if (p) {
          if (action.on === null) {
            const mount = p.ridingOn;
            p.ridingOn = null;
            if (mount !== null) p.off = isOffFrame(state, mount);
          } else if (action.on !== action.actor) {
            p.ridingOn = action.on;
          }
        }
        break;
      }
      case "show": {
        const p = state.get(action.actor);
        if (p) {
          p.hidden = false;
          p.gone = false;
        }
        break;
      }
      case "hide": {
        const p = state.get(action.actor);
        if (p) p.hidden = true;
        break;
      }
      case "object": {
        const p = state.get(action.target);
        if (p && (action.action === "pop" || action.action === "eat")) p.gone = true;
        break;
      }
      default:
        break;
    }
  }
}

function songsIn(actions: readonly StageAction[]): SongId[] {
  const out: SongId[] = [];
  for (const action of actions) if (action.do === "song") out.push(action.song);
  return out;
}

/** Song and music-bed actions, as comparable strings. */
function musicSignature(actions: readonly StageAction[]): string {
  const out: string[] = [];
  for (const action of actions) {
    if (action.do === "song") out.push(`song:${action.song}`);
    if (action.do === "music") out.push(`music:${action.bed ?? "off"}`);
  }
  return out.sort().join(",");
}

// ---------------------------------------------------------------------------
// Story validation.

interface Ctx {
  readonly story: StorySpec;
  readonly code: string;
  readonly locale: LocalePack;
  readonly opts: ValidateOptions;
  readonly errors: string[];
  readonly castIds: ReadonlySet<string>;
  readonly propIds: ReadonlySet<string>;
  readonly actorIds: ReadonlySet<string>;
}

function where(ref: BeatRef): string {
  return ref.section === "beats" ? `beat "${ref.beat.id}"` : `${ref.section} beat "${ref.beat.id}"`;
}

/** Phonics notation such as "/b/" or "/æ/" (grown-up text only, never a spoken line). */
const PHONICS_NOTATION = /\/[a-zæ]{1,3}\//i;

function textChecks(ctx: Ctx, label: string, text: string, spoken: boolean): void {
  for (const phrase of bannedPhrasesIn(text)) ctx.errors.push(`${label}: "${text}" uses the banned phrase "${phrase}"`);
  for (const name of familyNamesIn(text, ctx.opts.guardNames)) ctx.errors.push(`${label}: "${text}" uses the family or child name "${name}"; default lines stay generic`);
  if (RETIRED_NAME.test(normalizeQuotes(text))) ctx.errors.push(`${label}: "${text}" says "Pip"; the chick is Peeko`);
  if (spoken) {
    for (const n of countsAboveLimit(text)) ctx.errors.push(`${label}: "${text}" counts to ${n}; counting stops at ${COUNT_MAX}`);
    // The line text is what text-to-speech reads (tools/gen-audio.ts): it says "/b/" as the letter name.
    if (PHONICS_NOTATION.test(text)) {
      ctx.errors.push(`${label}: "${text}" writes a sound in phonics notation; text-to-speech reads it as the letter name, so a spoken line models the sound with a stretched start ("b-b-ball")`);
    }
  }
}

function checkIdentity(ctx: Ctx): void {
  const { story, code, errors } = ctx;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(story.id)) errors.push(`id "${story.id}" must be a lowercase slug`);
  const max = story.kind === "episode" ? EPISODE_SLUGS.length : ACTIVITY_SLUGS.length;
  if (!Number.isInteger(story.number) || story.number < 1 || story.number > max) {
    errors.push(`number ${story.number} is outside 1-${max} for ${story.kind === "episode" ? "episodes" : "activities"}`);
  }
  if (!Number.isInteger(story.version) || story.version < 1) errors.push(`version ${story.version} must be a positive integer`);
  if (story.phase !== "P1" && story.phase !== "P2") errors.push(`phase "${String(story.phase)}" must be P1 or P2`);
  if (story.titleKey !== `${code}.title`) errors.push(`titleKey "${story.titleKey}" must be "${code}.title"`);
  if (story.offlinePlayKey !== `${code}.offline`) errors.push(`offlinePlayKey "${story.offlinePlayKey}" must be "${code}.offline"`);
  if (story.caregiverBridgeKey !== `${code}.bridge`) errors.push(`caregiverBridgeKey "${story.caregiverBridgeKey}" must be "${code}.bridge"`);
  if (!WORLD_SET.has(story.world)) errors.push(`world "${story.world}" is not a known world`);
  if (!CHARACTER_SET.has(story.host)) errors.push(`host "${story.host}" is not a character`);
  else if (!ctx.castIds.has(story.host)) errors.push(`host "${story.host}" is not in the cast`);
  if (story.music !== undefined && !has(MUSIC_BEDS, story.music)) errors.push(`music "${story.music}" is not a music bed`);
  const review = story.review;
  if (review.language !== "approved") errors.push(`review.language is "${String(review.language)}", not "approved"; unapproved content never ships`);
  if (review.rights !== "approved") errors.push(`review.rights is "${String(review.rights)}", not "approved"; unapproved content never ships`);
  if (typeof review.reviewer !== "string" || review.reviewer.trim() === "") errors.push("review.reviewer is empty");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(review.date)) errors.push(`review.date "${review.date}" must be YYYY-MM-DD`);
  if (story.kind === "activity") {
    const o = story.options;
    if (o.allowTap !== true || o.dragAlternative !== "tap" || o.microphoneRequired !== false) {
      errors.push("options must be { allowTap: true, dragAlternative: \"tap\", microphoneRequired: false }");
    }
  }
}

function checkCastAndProps(ctx: Ctx): void {
  const { story, errors } = ctx;
  const seen = new Set<string>();
  for (const member of story.cast) {
    if (!CHARACTER_SET.has(member.id)) errors.push(`cast "${member.id}" is not a character`);
    if (seen.has(member.id)) errors.push(`cast "${member.id}" is listed twice`);
    seen.add(member.id);
    if (!SPOT_SET.has(member.at)) errors.push(`cast "${member.id}" stands at unknown spot "${member.at}"`);
  }
  for (const prop of story.props) {
    if (!/^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/.test(prop.id)) errors.push(`prop id "${prop.id}" must be letters, digits and dashes`);
    if (seen.has(prop.id)) errors.push(`prop id "${prop.id}" is used twice (cast and prop ids share one namespace)`);
    seen.add(prop.id);
    if (!PROP_ASSET_SET.has(prop.asset)) errors.push(`prop "${prop.id}" uses unknown asset "${prop.asset}"`);
    if (!SPOT_SET.has(prop.at)) errors.push(`prop "${prop.id}" stands at unknown spot "${prop.at}"`);
    if (prop.tint !== undefined && !/^#[0-9a-fA-F]{6}$/.test(prop.tint)) errors.push(`prop "${prop.id}" tint "${prop.tint}" must be #rrggbb`);
    if (prop.size !== undefined && (!Number.isFinite(prop.size) || prop.size <= 0 || prop.size > 5)) {
      errors.push(`prop "${prop.id}" size ${prop.size} must be between 0 and 5 metres`);
    }
  }
}

function isCountingCluster(words: readonly string[]): boolean {
  return words.filter((w) => COUNT_WORDS.has(w)).length >= 2;
}

function isAnimalSoundCluster(words: readonly string[]): boolean {
  return words.filter((w) => ANIMAL_SOUND_WORDS.has(w)).length >= 3;
}

function checkWordLists(ctx: Ctx): void {
  const { story, errors } = ctx;
  const targets = story.targetWords;
  const cluster = isCountingCluster(targets) || isAnimalSoundCluster(targets);
  const max = cluster ? MAX_CLUSTER_TARGET_WORDS : MAX_TARGET_WORDS;
  if (targets.length < MIN_TARGET_WORDS || targets.length > max) {
    errors.push(`targetWords has ${targets.length} words; use ${MIN_TARGET_WORDS}-${MAX_TARGET_WORDS} (${MAX_CLUSTER_TARGET_WORDS} only for a counting or animal-sound cluster)`);
  }
  const seenTargets = new Set<string>();
  for (const w of targets) {
    if (!isWordId(w)) errors.push(`targetWords: "${w}" is not in the allowed vocabulary (src/content/words.ts)`);
    if (seenTargets.has(w)) errors.push(`targetWords: "${w}" is listed twice`);
    seenTargets.add(w);
  }
  const seenSupport = new Set<string>();
  for (const w of story.supportWords) {
    if (!isWordId(w)) errors.push(`supportWords: "${w}" is not in the allowed vocabulary (src/content/words.ts)`);
    if (seenSupport.has(w)) errors.push(`supportWords: "${w}" is listed twice`);
    if (seenTargets.has(w)) errors.push(`supportWords: "${w}" is already a target word`);
    seenSupport.add(w);
  }
}

function checkStructure(ctx: Ctx): void {
  const { story, errors } = ctx;
  const refs = beatRefs(story);
  if (story.kind === "episode") {
    if (story.beats.length === 0) errors.push("an episode needs beats");
    const first = story.beats[0];
    if (first && first.kind !== "greeting") errors.push(`the first beat "${first.id}" is "${first.kind}"; an episode opens with a greeting beat`);
    const last = story.beats[story.beats.length - 1];
    if (last && last.kind !== "outro") errors.push(`the final beat "${last.id}" is "${last.kind}"; the final beat must be an outro`);
    for (const ref of refs) {
      if (ref.beat.input?.type === "more-or-done") errors.push(`${where(ref)}: "more-or-done" belongs to activity rounds only`);
    }
  } else {
    const limit = story.roundLimit;
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_ROUNDS) errors.push(`roundLimit ${limit} must be a whole number from 1 to ${MAX_ROUNDS}`);
    if (story.intro.length === 0) errors.push("an activity needs at least one intro beat");
    if (story.round.length === 0) errors.push("an activity needs at least one round beat");
    if (story.outro.length === 0) errors.push("an activity needs at least one outro beat");
    const lastRound = story.round[story.round.length - 1];
    if (lastRound && lastRound.input?.type !== "more-or-done") {
      errors.push(`the last round beat "${lastRound.id}" must wait with input "more-or-done" (a tap plays another round, a timeout goes to the outro)`);
    }
    const lastOutro = story.outro[story.outro.length - 1];
    if (lastOutro && lastOutro.kind !== "outro") errors.push(`the final beat "${lastOutro.id}" is "${lastOutro.kind}"; the final beat must be an outro`);
    for (const ref of refs) {
      if (ref.beat.input?.type === "more-or-done" && !(ref.section === "round" && ref.index === story.round.length - 1)) {
        errors.push(`${where(ref)}: "more-or-done" is only for the last round beat`);
      }
    }
  }
  const finalRef = refs[refs.length - 1];
  if (finalRef && finalRef.beat.input !== undefined && finalRef.beat.input.type !== "none") {
    errors.push(`${where(finalRef)}: the final beat must not wait for input; the ending is calm and finite`);
  }
  if (!refs.some((ref) => ref.beat.kind === "invite" && ref.beat.input !== undefined && ref.beat.input.type !== "none")) {
    errors.push("there is no invite beat with input; every story offers at least one tap-or-wait turn");
  }
  const ids = new Set<string>();
  for (const ref of refs) {
    if (ids.has(ref.beat.id)) errors.push(`beat id "${ref.beat.id}" is used twice`);
    ids.add(ref.beat.id);
  }
}

type ActionCheckCtx = Pick<Ctx, "errors" | "actorIds" | "propIds" | "castIds">;

function checkActions(ctx: ActionCheckCtx, label: string, actions: readonly StageAction[]): void {
  const { errors, actorIds, propIds } = ctx;
  const actor = (id: string, role: string): void => {
    if (!actorIds.has(id)) errors.push(`${label}: ${role} "${id}" is not a cast or prop id`);
  };
  for (const action of actions) {
    switch (action.do) {
      case "enter":
        actor(action.actor, "enter actor");
        if (!SPOT_SET.has(action.at)) errors.push(`${label}: enter spot "${action.at}" is unknown`);
        if (action.from !== undefined && !SPOT_SET.has(action.from)) errors.push(`${label}: enter from-spot "${action.from}" is unknown`);
        if (action.style !== undefined && !MOVE_STYLE_SET.has(action.style)) errors.push(`${label}: move style "${action.style}" is unknown`);
        break;
      case "exit":
      case "move": {
        actor(action.actor, `${action.do} actor`);
        if (!SPOT_SET.has(action.to)) errors.push(`${label}: ${action.do} spot "${action.to}" is unknown`);
        if (action.style !== undefined && !MOVE_STYLE_SET.has(action.style)) errors.push(`${label}: move style "${action.style}" is unknown`);
        break;
      }
      case "gesture":
        actor(action.actor, "gesture actor");
        if (!GESTURE_SET.has(action.gesture)) errors.push(`${label}: gesture "${action.gesture}" is unknown`);
        break;
      case "face":
        actor(action.actor, "face actor");
        if (action.toward !== "viewer" && !actorIds.has(action.toward)) errors.push(`${label}: face target "${action.toward}" is not "viewer" or a cast or prop id`);
        break;
      case "show":
      case "hide":
        actor(action.actor, `${action.do} actor`);
        break;
      case "object":
        actor(action.target, "object target");
        if (!OBJECT_ACTION_SET.has(action.action)) errors.push(`${label}: object action "${action.action}" is unknown`);
        if (action.tint !== undefined && !/^#[0-9a-fA-F]{6}$/.test(action.tint)) errors.push(`${label}: tint "${action.tint}" must be #rrggbb`);
        break;
      case "carry":
        actor(action.actor, "carry actor");
        if (action.item !== null && !propIds.has(action.item)) errors.push(`${label}: carried item "${action.item}" is not a prop id`);
        break;
      case "ride":
        actor(action.actor, "ride actor");
        if (action.on !== null) {
          if (action.on === action.actor) errors.push(`${label}: ride actor "${action.actor}" cannot ride itself`);
          else actor(action.on, "ride mount");
        }
        break;
      case "sfx":
        if (!has(SFX, action.sound)) errors.push(`${label}: sound effect "${action.sound}" does not exist (src/content/sfx.ts)`);
        break;
      case "song": {
        if (!has(SONGS, action.song)) {
          errors.push(`${label}: song "${action.song}" does not exist (src/content/songs.ts)`);
          break;
        }
        // Performers and line cues (07 B20): what the stage would only warn about at runtime is an error here.
        for (const performer of action.performers ?? []) {
          if (!ctx.castIds.has(performer)) errors.push(`${label}: song performer "${performer}" is not in the cast`);
        }
        const lyricLines = SONGS[action.song].lyrics.length;
        const cueSlots = new Set<string>();
        for (const cue of action.cues ?? []) {
          if (!Number.isInteger(cue.line) || cue.line < 0 || cue.line >= lyricLines) {
            errors.push(`${label}: song "${action.song}" cue line ${cue.line} is outside its ${lyricLines} lyric lines`);
          }
          if (cue.offsetMs !== undefined && (!Number.isFinite(cue.offsetMs) || cue.offsetMs < 0 || cue.offsetMs > 10000)) {
            errors.push(`${label}: song "${action.song}" cue line ${cue.line} offsetMs ${cue.offsetMs} must be 0-10000`);
          }
          const slotKey = `${cue.line}:${cue.offsetMs ?? 0}`;
          if (cueSlots.has(slotKey)) errors.push(`${label}: song "${action.song}" has two cues for line ${cue.line}; merge them`);
          cueSlots.add(slotKey);
          if (cue.stage.some((nested) => nested.do === "song")) errors.push(`${label}: song "${action.song}" cue line ${cue.line} starts another song`);
          checkActions(ctx, `${label} song cue ${cue.line}`, cue.stage.filter((nested) => nested.do !== "song"));
        }
        break;
      }
      case "music":
        if (action.bed !== null && !has(MUSIC_BEDS, action.bed)) errors.push(`${label}: music bed "${action.bed}" does not exist (src/content/music.ts)`);
        break;
      case "camera":
        if (!CAMERA_SET.has(action.preset)) errors.push(`${label}: camera preset "${action.preset}" is unknown`);
        break;
      default:
        errors.push(`${label}: unknown stage action`);
    }
  }
}

function checkLines(ctx: Ctx, ref: BeatRef, label: string, lines: readonly LineRef[], seenKeys: Map<string, string>): void {
  const { code, locale, errors, castIds, story } = ctx;
  const keyPattern = new RegExp(`^${escapeRegExp(code)}\\.${escapeRegExp(ref.beat.id)}\\.r?[1-9]\\d*$`);
  const hasRobot = story.props.some((prop) => prop.asset === "robot");
  for (const line of lines) {
    if (!SPEAKER_SET.has(line.speaker)) errors.push(`${label}: speaker "${line.speaker}" is unknown`);
    else if (line.speaker === "sheru") errors.push(`${label}: line ${line.key} is given to Sheru, who never speaks; use the "woof" sound effect`);
    else if (line.speaker === "robot") {
      if (!hasRobot) errors.push(`${label}: line ${line.key} is spoken by "robot" but no prop uses the robot asset`);
    } else if (line.speaker !== "narrator" && !castIds.has(line.speaker)) {
      errors.push(`${label}: line ${line.key} is spoken by "${line.speaker}", who is not in the cast`);
    }
    if (!keyPattern.test(line.key)) errors.push(`${label}: line key "${line.key}" must look like "${code}.${ref.beat.id}.<n>"`);
    const previous = seenKeys.get(line.key);
    if (previous !== undefined) errors.push(`${label}: line key ${line.key} is already used in ${previous}`);
    else seenKeys.set(line.key, label);
    const text = locale.lines[line.key];
    if (text === undefined) {
      errors.push(`${label}: line ${line.key} has no text in the ${locale.locale} locale`);
      continue;
    }
    if (text.trim() === "") {
      errors.push(`${label}: line ${line.key} is empty`);
      continue;
    }
    const words = text.trim().split(/\s+/).length;
    if (words > MAX_LINE_WORDS) errors.push(`${label}: line ${line.key} has ${words} words; keep lines to ${MAX_LINE_WORDS} or fewer`);
    textChecks(ctx, `${label}: line ${line.key}`, text, true);
  }
}

function checkInput(ctx: Ctx, ref: BeatRef, label: string): void {
  const { errors, actorIds } = ctx;
  const beat = ref.beat;
  const input = beat.input;
  if (input === undefined || input.type === "none") {
    if (beat.waitMs !== undefined) errors.push(`${label}: waitMs is set but the beat waits for no input`);
    if (beat.response !== undefined) errors.push(`${label}: a response needs an input to answer`);
    if (beat.responseByTarget !== undefined) errors.push(`${label}: responseByTarget needs an input to answer`);
    return;
  }
  if (input.type !== "tap" && input.type !== "more-or-done") {
    errors.push(`${label}: input type is unknown`);
    return;
  }
  if (input.targets.length === 0) errors.push(`${label}: input lists no tap targets`);
  if (input.targets.length > MAX_TAP_TARGETS) errors.push(`${label}: input lists ${input.targets.length} tap targets; at most ${MAX_TAP_TARGETS} at a time`);
  const seen = new Set<string>();
  for (const target of input.targets) {
    if (!actorIds.has(target)) errors.push(`${label}: tap target "${target}" is not a cast or prop id`);
    if (seen.has(target)) errors.push(`${label}: tap target "${target}" is listed twice`);
    seen.add(target);
  }
  if (beat.responseByTarget !== undefined) {
    for (const targetKey of Object.keys(beat.responseByTarget)) {
      if (!seen.has(targetKey)) {
        errors.push(`${label}: responseByTarget target "${targetKey}" is not listed in input.targets`);
      }
    }
  }
  if (beat.waitMs !== undefined && (!Number.isFinite(beat.waitMs) || beat.waitMs < MIN_WAIT_MS || beat.waitMs > MAX_WAIT_MS)) {
    errors.push(`${label}: waitMs ${beat.waitMs} must be ${MIN_WAIT_MS}-${MAX_WAIT_MS} (a wait always ends by itself)`);
  }
}

function checkBeats(ctx: Ctx): void {
  const { errors, locale } = ctx;
  const seenKeys = new Map<string, string>();
  for (const ref of beatRefs(ctx.story)) {
    const beat = ref.beat;
    const label = where(ref);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(beat.id)) errors.push(`${label}: beat id must be lowercase letters, digits and dashes`);
    if (!BEAT_KIND_SET.has(beat.kind)) errors.push(`${label}: kind "${beat.kind}" is unknown`);
    if (beat.camera !== undefined && !CAMERA_SET.has(beat.camera)) errors.push(`${label}: camera "${beat.camera}" is unknown`);
    if (!Number.isFinite(beat.holdMs) || beat.holdMs < 0 || beat.holdMs > MAX_HOLD_MS) errors.push(`${label}: holdMs ${beat.holdMs} must be 0-${MAX_HOLD_MS}`);
    checkActions(ctx, label, beat.stage);
    if (beat.reducedMotionStage !== undefined) checkActions(ctx, `${label} reducedMotionStage`, beat.reducedMotionStage);
    checkLines(ctx, ref, label, beat.lines, seenKeys);
    checkInput(ctx, ref, label);
    const seenBeforeResponse = new Map(seenKeys);
    if (beat.response) {
      const responseLabel = `${label} response`;
      if (!Number.isFinite(beat.response.holdMs) || beat.response.holdMs < 0 || beat.response.holdMs > MAX_HOLD_MS) {
        errors.push(`${responseLabel}: holdMs ${beat.response.holdMs} must be 0-${MAX_HOLD_MS}`);
      }
      checkActions(ctx, responseLabel, beat.response.stage);
      checkLines(ctx, ref, responseLabel, beat.response.lines, seenKeys);
    }
    if (beat.responseByTarget) {
      for (const [targetKey, branch] of Object.entries(beat.responseByTarget)) {
        if (!branch) continue;
        const branchLabel = `${label} responseByTarget["${targetKey}"]`;
        if (branch.holdMs !== undefined && (!Number.isFinite(branch.holdMs) || branch.holdMs < 0 || branch.holdMs > MAX_HOLD_MS)) {
          errors.push(`${branchLabel}: holdMs ${branch.holdMs} must be 0-${MAX_HOLD_MS}`);
        }
        if (branch.stage !== undefined) checkActions(ctx, branchLabel, branch.stage);
        if (branch.lines !== undefined) {
          const branchSeen = new Map(seenBeforeResponse);
          checkLines(ctx, ref, branchLabel, branch.lines, branchSeen);
          for (const [k, v] of branchSeen) if (!seenKeys.has(k)) seenKeys.set(k, v);
        }
      }
    }
    if (beat.caregiverPromptKey !== undefined) {
      if (!new RegExp(`^${escapeRegExp(ctx.code)}\\.tip\\.[1-9]\\d*$`).test(beat.caregiverPromptKey)) {
        errors.push(`${label}: caregiverPromptKey "${beat.caregiverPromptKey}" must look like "${ctx.code}.tip.<n>"`);
      }
      const tip = locale.strings[beat.caregiverPromptKey];
      if (tip === undefined || tip.trim() === "") errors.push(`${label}: caregiver tip ${beat.caregiverPromptKey} has no text in the ${locale.locale} locale`);
      else textChecks(ctx, `${label}: tip ${beat.caregiverPromptKey}`, tip, false);
    }
    for (const entry of beat.words ?? []) {
      if (!isWordId(entry.wordId)) errors.push(`${label}: word "${entry.wordId}" is not in the allowed vocabulary (src/content/words.ts)`);
      if (!ctx.actorIds.has(entry.objectId)) errors.push(`${label}: word "${entry.wordId}" points at "${entry.objectId}", which is not a cast or prop id`);
      if (isWordId(entry.wordId)) {
        const id = entry.wordId;
        const texts = [...beat.lines, ...(beat.response?.lines ?? [])].map((line) => locale.lines[line.key] ?? "");
        const lyrics = [...songsIn(beat.stage), ...songsIn(beat.response?.stage ?? [])].flatMap((song) => (has(SONGS, song) ? SONGS[song].lyrics : []));
        if (![...texts, ...lyrics].some((text) => wordSpoken(id, text))) {
          errors.push(`${label}: names the word "${entry.wordId}" but none of its lines say it`);
        }
      }
    }
  }
}

function checkStrings(ctx: Ctx): void {
  const { story, code, locale, errors } = ctx;
  const required: readonly [string, string][] = [
    ["title", story.titleKey],
    ["offline card", story.offlinePlayKey],
    ["caregiver bridge", story.caregiverBridgeKey]
  ];
  for (const [what, key] of required) {
    const text = locale.strings[key];
    if (text === undefined || text.trim() === "") errors.push(`the ${what} string ${key} has no text in the ${locale.locale} locale`);
    else textChecks(ctx, `string ${key}`, text, false);
  }
  // Locale keys of this story that nothing uses (an unvoiced line or an orphan tip drifts silently).
  const usedLines = new Set<string>();
  const usedStrings = new Set<string>([story.titleKey, story.offlinePlayKey, story.caregiverBridgeKey]);
  for (const line of allStoryLines(story)) usedLines.add(line.key);
  for (const ref of beatRefs(story)) {
    if (ref.beat.caregiverPromptKey !== undefined) usedStrings.add(ref.beat.caregiverPromptKey);
  }
  const letter = story.letterConcept;
  if (letter) {
    for (const key of [letter.letterNameKey, letter.phonemeCueKey, letter.exampleWordKey]) {
      usedLines.add(key);
      usedStrings.add(key);
    }
  }
  const prefix = `${code}.`;
  for (const key of Object.keys(locale.lines)) {
    if (key.startsWith(prefix) && !usedLines.has(key)) errors.push(`locale line ${key} is never spoken by the story`);
  }
  for (const key of Object.keys(locale.strings)) {
    if (key.startsWith(prefix) && !usedStrings.has(key)) errors.push(`locale string ${key} is never used by the story`);
  }
}

function conceptText(locale: LocalePack, key: string): string | undefined {
  return locale.lines[key] ?? locale.strings[key];
}

/** Letters named by the songs a beat starts (stage, reduced-motion stage, response). */
function songLetters(ref: BeatRef): { readonly song: SongId; readonly letter: string }[] {
  const actions = [...ref.beat.stage, ...(ref.beat.reducedMotionStage ?? []), ...(ref.beat.response?.stage ?? [])];
  const out: { song: SongId; letter: string }[] = [];
  for (const song of new Set(songsIn(actions))) {
    if (!has(SONGS, song)) continue;
    for (const letter of new Set(SONGS[song].lyrics.flatMap((lyric) => lettersNamedIn(lyric)))) out.push({ song, letter });
  }
  return out;
}

/**
 * The letter concept (PRD 01 section 3.3): a reviewed letter, existing keys,
 * name and sound kept apart, and one letter per episode (lines and songs name
 * no other letter; letter songs only play in letter stories).
 */
export function checkLetterConcept(story: StorySpec, locale: LocalePack): string[] {
  const errors: string[] = [];
  const all = [...story.targetWords, ...story.supportWords];
  const beatWords = beatRefs(story).flatMap((ref) => (ref.beat.words ?? []).map((entry) => entry.wordId));
  const letterWords = [...new Set([...all, ...beatWords])].filter((w) => isWordId(w) && WORDS[w].category === "letter");
  const concept = story.letterConcept;
  if (!concept) {
    for (const w of letterWords) errors.push(`word "${w}" is a letter, so the story needs a letterConcept`);
    for (const ref of beatRefs(story)) {
      for (const { song, letter } of songLetters(ref)) errors.push(`${where(ref)}: song "${song}" names the letter ${letter}, but the story has no letterConcept`);
      for (const line of [...ref.beat.lines, ...(ref.beat.response?.lines ?? [])]) {
        const text = locale.lines[line.key] ?? "";
        for (const letter of lettersNamedIn(text)) {
          errors.push(`${where(ref)}: line ${line.key} "${text}" names the letter ${letter}, but the story has no letterConcept`);
        }
      }
    }
    return errors;
  }
  for (const ref of beatRefs(story)) {
    for (const { song, letter } of songLetters(ref)) {
      if (letter !== concept.letter) errors.push(`${where(ref)}: song "${song}" names the letter ${letter}; one letter per episode (${concept.letter})`);
    }
    for (const line of [...ref.beat.lines, ...(ref.beat.response?.lines ?? [])]) {
      const text = locale.lines[line.key] ?? "";
      for (const letter of lettersNamedIn(text)) {
        if (letter !== concept.letter) errors.push(`${where(ref)}: line ${line.key} "${text}" names the letter ${letter}; one letter per episode (${concept.letter})`);
      }
    }
  }
  const info = letterInfo(concept.letter);
  if (!info) {
    errors.push(`letterConcept.letter "${concept.letter}" is not a reviewed letter (src/content/letters.ts)`);
    return errors;
  }
  const texts = {
    name: conceptText(locale, concept.letterNameKey),
    sound: conceptText(locale, concept.phonemeCueKey),
    example: conceptText(locale, concept.exampleWordKey)
  };
  if (texts.name === undefined) errors.push(`letterConcept.letterNameKey ${concept.letterNameKey} has no text`);
  if (texts.sound === undefined) errors.push(`letterConcept.phonemeCueKey ${concept.phonemeCueKey} has no text`);
  if (texts.example === undefined) errors.push(`letterConcept.exampleWordKey ${concept.exampleWordKey} has no text`);
  if (texts.name !== undefined && texts.sound !== undefined && texts.example !== undefined) {
    errors.push(...checkLetterTexts(info, { name: texts.name, sound: texts.sound, example: texts.example }));
  }
  if (concept.letterNameKey === concept.phonemeCueKey) errors.push("letterConcept uses one key for both the name and the sound; keep them apart");
  if (info.wordId !== null && !all.includes(info.wordId)) errors.push(`letter ${info.letter} is featured, so "${info.wordId}" belongs in targetWords or supportWords`);
  for (const w of letterWords) {
    if (w !== info.wordId) errors.push(`word "${w}" is a second letter; one letter per episode`);
  }
  for (const ref of beatRefs(story)) {
    for (const line of [...ref.beat.lines, ...(ref.beat.response?.lines ?? [])]) {
      const text = locale.lines[line.key];
      if (text !== undefined && equatesNameAndSound(info, text)) {
        errors.push(`${where(ref)}: line ${line.key} "${text}" equates the letter name with its sound`);
      }
    }
  }
  const soundSpoken = beatRefs(story).some((ref) =>
    [...ref.beat.lines, ...(ref.beat.response?.lines ?? [])].some((line) => mentionsSound(info, locale.lines[line.key] ?? ""))
  );
  if (!soundSpoken) errors.push(`no spoken line models the sound of ${info.letter} (${info.soundForms.join(", ")})`);
  return errors;
}

function countedVisible(state: StageState, counted: readonly string[]): number {
  return counted.filter((id) => isVisible(state, id)).length;
}

/**
 * Counting (PRD 01 section 3.3; PRD 06 QA-E08): three counted props of one
 * kind, listed in counting order; each number word is named with its own
 * object; whenever a line or song speaks a number N, at least N counted
 * objects are visible, and in a beat where a counted object appears the line
 * speaks exactly the number now on screen.
 */
export function checkCounting(story: StorySpec, locale: LocalePack): string[] {
  const errors = new Set<string>();
  const concept = story.numberConcept;
  const refs = beatRefs(story);
  const countWordsUsed = [...story.targetWords, ...story.supportWords, ...refs.flatMap((ref) => (ref.beat.words ?? []).map((w) => w.wordId))]
    .filter((w) => COUNT_WORDS.has(w));
  if (!concept) {
    const targeted = story.targetWords.filter((w) => COUNT_WORDS.has(w));
    const named = refs.flatMap((ref) => (ref.beat.words ?? []).filter((w) => COUNT_WORDS.has(w.wordId)).map((w) => w.wordId));
    for (const w of new Set([...targeted, ...named])) errors.add(`"${w}" is taught as a count, so the story needs a numberConcept`);
    return [...errors];
  }
  if (concept.countMin !== COUNT_MIN || concept.countMax !== COUNT_MAX) errors.add(`numberConcept must count ${COUNT_MIN}-${COUNT_MAX}`);
  const counted = concept.countedObjectIds;
  const props = new Map(story.props.map((prop) => [prop.id, prop]));
  if (counted.length !== COUNT_MAX - COUNT_MIN + 1) errors.add(`numberConcept.countedObjectIds lists ${counted.length} objects; it needs exactly ${COUNT_MAX - COUNT_MIN + 1}, one per number`);
  if (new Set(counted).size !== counted.length) errors.add("numberConcept.countedObjectIds repeats an object");
  const assets = new Set<string>();
  for (const id of counted) {
    const prop = props.get(id);
    if (!prop) errors.add(`numberConcept counts "${id}", which is not a prop`);
    else assets.add(prop.asset);
  }
  if (assets.size > 1) errors.add(`numberConcept counts different kinds of objects (${[...assets].join(", ")}); count one kind at a time`);
  if (countWordsUsed.length === 0) errors.add("numberConcept is set but no count word (one, two, three) is used");

  // Each number is named with its own object, in counting order.
  COUNT_WORD_IDS.forEach((word, index) => {
    const entries = refs.flatMap((ref) => (ref.beat.words ?? []).filter((w) => w.wordId === word).map((w) => ({ ref, objectId: w.objectId })));
    const expected = counted[index];
    if (entries.length === 0) errors.add(`no beat names "${word}" with its counted object${expected ? ` "${expected}"` : ""}`);
    else if (expected !== undefined && !entries.some((entry) => entry.objectId === expected)) {
      errors.add(`"${word}" is never named with "${expected}", the object counted as ${index + 1}`);
    }
    for (const entry of entries) {
      if (!counted.includes(entry.objectId)) errors.add(`${where(entry.ref)}: "${word}" points at "${entry.objectId}", which is not a counted object`);
    }
  });

  const countedSet = new Set(counted);
  const appears = (actions: readonly StageAction[]): boolean =>
    actions.some((a) => (a.do === "show" || a.do === "enter") && countedSet.has(a.actor));
  const describe = (state: StageState): string => {
    const shown = counted.filter((id) => isVisible(state, id));
    return shown.length === 0 ? "none" : shown.join(", ");
  };
  const checkLine = (ref: BeatRef, line: LineRef, state: StageState, countUp: boolean): void => {
    const text = locale.lines[line.key];
    if (text === undefined) return;
    const n = highestSpokenNumber(text);
    if (n === 0 || n > COUNT_MAX) return;
    const visible = countedVisible(state, counted);
    if (n > visible) {
      errors.add(`${where(ref)}: line ${line.key} "${text}" says ${n} but only ${visible} counted object${visible === 1 ? " is" : "s are"} visible (${describe(state)})`);
    } else if (countUp && n < visible) {
      errors.add(`${where(ref)}: line ${line.key} "${text}" says ${n} while ${visible} counted objects are visible after one appeared; say the number now on screen`);
    }
  };
  const checkSongs = (ref: BeatRef, actions: readonly StageAction[], state: StageState): void => {
    for (const song of songsIn(actions)) {
      if (!has(SONGS, song)) continue;
      const n = SONGS[song].lyrics.reduce((max, lyric) => Math.max(max, highestSpokenNumber(lyric)), 0);
      const visible = countedVisible(state, counted);
      if (n > 0 && n <= COUNT_MAX && n > visible) {
        errors.add(`${where(ref)}: song "${song}" counts to ${n} but only ${visible} counted object${visible === 1 ? " is" : "s are"} visible (${describe(state)})`);
      }
    }
  };
  for (const path of playPaths(story)) {
    const state = initialState(story);
    for (const ref of path) {
      const beat = ref.beat;
      const countUp = appears(beat.stage) || appears(beat.response?.stage ?? []);
      applyActions(state, beat.stage);
      checkSongs(ref, beat.stage, state);
      for (const line of beat.lines) checkLine(ref, line, state, countUp);
      if (beat.response) {
        applyActions(state, beat.response.stage);
        checkSongs(ref, beat.response.stage, state);
        for (const line of beat.response.lines) checkLine(ref, line, state, countUp);
      }
    }
  }
  return [...errors];
}

/**
 * Words point at visible objects, tap targets are visible, a character is on
 * stage while it speaks (its talking pulse must be seen, PRD 02 sections 1
 * and 6), and reduced motion keeps the same stage and music.
 */
function checkVisibility(ctx: Ctx): void {
  const errors = new Set<string>();
  const { story } = ctx;
  const checkedReduced = new Set<BeatSpec>();
  const checkSpeakers = (label: string, lines: readonly LineRef[], state: StageState): void => {
    for (const line of lines) {
      const onStage =
        line.speaker === "robot"
          ? story.props.some((prop) => prop.asset === "robot" && isVisible(state, prop.id))
          : !ctx.castIds.has(line.speaker) || isVisible(state, line.speaker);
      if (!onStage) errors.add(`${label}: ${line.speaker} speaks line ${line.key} while off stage; a speaking character stays visible`);
    }
  };
  for (const path of playPaths(story)) {
    const state = initialState(story);
    for (const ref of path) {
      const beat = ref.beat;
      const label = where(ref);
      const before = cloneState(state);
      if (beat.reducedMotionStage !== undefined && !checkedReduced.has(beat)) {
        checkedReduced.add(beat);
        const reduced = cloneState(before);
        applyActions(reduced, beat.reducedMotionStage);
        const normal = cloneState(before);
        applyActions(normal, beat.stage);
        const a = visibleIds(normal).join(",");
        const b = visibleIds(reduced).join(",");
        if (a !== b) errors.add(`${label}: reducedMotionStage changes what is on stage (visible: [${b}] instead of [${a}]); reduced motion changes how things move, not what is there`);
        if (musicSignature(beat.stage) !== musicSignature(beat.reducedMotionStage)) {
          errors.add(`${label}: reducedMotionStage changes the songs or music (${musicSignature(beat.reducedMotionStage) || "none"} instead of ${musicSignature(beat.stage) || "none"})`);
        }
      }
      applyActions(state, beat.stage);
      const afterStage = cloneState(state);
      checkSpeakers(label, beat.lines, afterStage);
      const input = beat.input;
      if (input !== undefined && input.type !== "none") {
        for (const target of input.targets) {
          if (ctx.actorIds.has(target) && !isVisible(afterStage, target)) {
            errors.add(`${label}: tap target "${target}" is not visible when the beat waits for a tap`);
          }
        }
      }
      let afterResponse: StageState | null = null;
      if (beat.response) {
        applyActions(state, beat.response.stage);
        afterResponse = cloneState(state);
        checkSpeakers(`${label} response`, beat.response.lines, afterResponse);
      }
      if (beat.responseByTarget) {
        for (const [targetKey, branch] of Object.entries(beat.responseByTarget)) {
          if (!branch) continue;
          const branchState = cloneState(afterStage);
          applyActions(branchState, branch.stage ?? beat.response?.stage ?? []);
          checkSpeakers(`${label} responseByTarget["${targetKey}"]`, branch.lines ?? beat.response?.lines ?? [], branchState);
        }
      }
      for (const entry of beat.words ?? []) {
        if (!ctx.actorIds.has(entry.objectId)) continue;
        const seen = isVisible(before, entry.objectId) || isVisible(afterStage, entry.objectId) || (afterResponse !== null && isVisible(afterResponse, entry.objectId));
        if (!seen) errors.add(`${label}: names "${entry.wordId}" with "${entry.objectId}", but "${entry.objectId}" is not visible during the beat`);
      }
    }
  }
  ctx.errors.push(...errors);
}

interface TimelineEvent {
  readonly type: "song" | "speech" | "time";
  readonly at: string;
  readonly song?: SongId;
  readonly ms?: number;
}

/**
 * Songs never play under speech (one voice at a time, PRD 02 section 1) and
 * are not cut off: from the moment a song starts, the following holds (waits
 * count as zero, since a tap may end them at once) must cover its length
 * before the next spoken line, the next song or the end of the story.
 */
function checkSongTiming(ctx: Ctx): void {
  const errors = new Set<string>();
  for (const path of playPaths(ctx.story)) {
    const events: TimelineEvent[] = [];
    for (const ref of path) {
      const beat = ref.beat;
      const at = where(ref);
      for (const song of songsIn(beat.stage)) events.push({ type: "song", at, song });
      if (beat.lines.length > 0) events.push({ type: "speech", at });
      events.push({ type: "time", at, ms: finiteNonNegative(beat.holdMs) });
      if (beat.response) {
        for (const song of songsIn(beat.response.stage)) events.push({ type: "song", at: `${at} response`, song });
        if (beat.response.lines.length > 0) events.push({ type: "speech", at: `${at} response` });
        events.push({ type: "time", at: `${at} response`, ms: finiteNonNegative(beat.response.holdMs) });
      }
    }
    events.forEach((event, index) => {
      if (event.type !== "song" || event.song === undefined || !has(SONGS, event.song)) return;
      const length = songDurationMs(event.song, ctx.opts.audio);
      let quiet = 0;
      let stop: TimelineEvent | null = null;
      for (let j = index + 1; j < events.length; j += 1) {
        const next = events[j];
        if (next === undefined) break;
        if (next.type === "time") {
          quiet += next.ms ?? 0;
          if (quiet + SONG_OVERLAP_GRACE_MS >= length) break;
          continue;
        }
        stop = next;
        break;
      }
      if (quiet + SONG_OVERLAP_GRACE_MS >= length) return;
      const sec = (ms: number): string => `${Math.round(ms / 100) / 10} s`;
      if (stop === null) {
        errors.add(`${event.at}: song "${event.song}" (${sec(length)}) is still playing when the story ends ${sec(quiet)} later`);
      } else if (stop.type === "song") {
        errors.add(`${event.at}: song "${event.song}" (${sec(length)}) is cut off after ${sec(quiet)} by song "${stop.song ?? ""}" in ${stop.at}`);
      } else if (stop.at === event.at) {
        errors.add(`${event.at}: song "${event.song}" (${sec(length)}) would play under the beat's own spoken lines; give the song a beat with no lines and holdMs of at least ${sec(length)}`);
      } else {
        errors.add(`${event.at}: song "${event.song}" (${sec(length)}) is still playing when the next line starts in ${stop.at} (${sec(quiet)} of quiet); voices would overlap`);
      }
    });
  }
  ctx.errors.push(...errors);
}

/** What makes two lines the same line: their words, ignoring case and punctuation ("One!" and "One." are one line). */
function lineIdentity(text: string): string {
  return normalizeQuotes(text).toLowerCase().replace(/[^a-z0-9']+/g, " ").trim();
}

/**
 * The different lines a story lets the child hear, each text once: every
 * spoken line (beat and response lines) and every lyric line of the songs its
 * beats start.
 */
function heardLines(story: StorySpec, locale: LocalePack): string[] {
  const byIdentity = new Map<string, string>();
  const add = (text: string): void => {
    const identity = lineIdentity(text);
    if (identity !== "" && !byIdentity.has(identity)) byIdentity.set(identity, text.trim());
  };
  for (const ref of beatRefs(story)) {
    for (const line of [...ref.beat.lines, ...(ref.beat.response?.lines ?? [])]) {
      const text = locale.lines[line.key];
      if (text !== undefined) add(text);
    }
    for (const song of [...songsIn(ref.beat.stage), ...songsIn(ref.beat.response?.stage ?? [])]) {
      if (has(SONGS, song)) for (const lyric of SONGS[song].lyrics) add(lyric);
    }
  }
  return [...byIdentity.values()];
}

/**
 * Target words (PRD 05 section 6, "target words heard with visible
 * object/action and at least one meaningful variation"): each is named in a
 * beat's words with the object that shows it, and an episode says it in at
 * least two different lines, spoken or sung, so the child meets it in more
 * than one situation instead of one line looped (PRD 01 section 4.3). The
 * same text said twice counts once. Activities replay one round by design
 * (PRD 05 section 7) and are held to the naming rule only.
 */
function checkTargetCoverage(ctx: Ctx): void {
  const named = new Set<string>();
  for (const ref of beatRefs(ctx.story)) for (const entry of ref.beat.words ?? []) named.add(entry.wordId);
  for (const w of ctx.story.targetWords) {
    if (!named.has(w)) ctx.errors.push(`target word "${w}" is never named in a beat's words (with the object that shows it)`);
  }
  if (ctx.story.kind !== "episode") return;
  const lines = heardLines(ctx.story, ctx.locale);
  for (const w of ctx.story.targetWords) {
    if (!isWordId(w)) continue;
    const heard = lines.filter((text) => wordSpoken(w, text));
    if (heard.length >= MIN_TARGET_WORD_LINES) continue;
    const where = heard.length === 0 ? "in no line" : `in one line only ("${heard[0] ?? ""}")`;
    ctx.errors.push(
      `target word "${w}" is heard ${where}; say it in at least ${MIN_TARGET_WORD_LINES} different lines, spoken or sung (a meaningful variation, PRD 05 section 6)`
    );
  }
}

function checkDuration(ctx: Ctx): void {
  const { story, locale, opts, errors } = ctx;
  if (story.kind === "episode") {
    const declared = story.estimatedDurationSec;
    if (!Number.isFinite(declared) || declared < EPISODE_MIN_SEC || declared > EPISODE_MAX_SEC) {
      errors.push(`estimatedDurationSec ${declared} must be ${EPISODE_MIN_SEC}-${EPISODE_MAX_SEC} s`);
    }
    const computed = estimateStoryMs(story, locale, opts.audio ? { audio: opts.audio } : {}) / 1000;
    if (computed > 0 && Number.isFinite(declared) && Math.abs(declared - computed) > DURATION_TOLERANCE * computed) {
      errors.push(`estimatedDurationSec ${declared} is more than ${Math.round(DURATION_TOLERANCE * 100)}% away from the computed ${Math.round(computed)} s (lines + holds + waits, no taps)`);
    }
    // Recorded speech runs faster than the text estimate, so the declared length alone can hide a short episode.
    if (opts.audio && computed > 0 && computed < EPISODE_MIN_SEC) {
      errors.push(`runs about ${Math.round(computed)} s with its recorded audio (no taps); an episode runs ${EPISODE_MIN_SEC}-${EPISODE_MAX_SEC} s (PRD 05), so lengthen its holds`);
    }
  } else {
    const longest = estimateStoryMs(story, locale, { ...(opts.audio ? { audio: opts.audio } : {}), rounds: roundLimit(story) }) / 1000;
    if (longest > ACTIVITY_MAX_SEC) errors.push(`playing every round takes about ${Math.round(longest)} s; keep an activity under ${ACTIVITY_MAX_SEC} s`);
  }
}

function checkAudio(ctx: Ctx): void {
  const { story, opts, errors } = ctx;
  if (!opts.requireAudio) return;
  const audio = opts.audio;
  if (!audio) {
    errors.push("requireAudio is set but no audio manifest was given");
    return;
  }
  const missing = new Set<string>();
  const beds = new Set<string>(story.music !== undefined ? [story.music] : []);
  for (const line of allStoryLines(story)) {
    if (line.speaker !== "sheru" && audio.lines[line.key] === undefined) missing.add(`line ${line.key}`);
  }
  for (const action of allStoryActions(story)) {
    if (action.do === "sfx" && audio.sfx[action.sound] === undefined) missing.add(`sound effect ${action.sound}`);
    if (action.do === "song" && audio.songs[action.song] === undefined) missing.add(`song ${action.song}`);
    if (action.do === "music" && action.bed !== null) beds.add(action.bed);
  }
  for (const bed of MUSIC_BED_IDS) if (beds.has(bed) && audio.beds[bed] === undefined) missing.add(`music bed ${bed}`);
  for (const item of missing) errors.push(`no recorded audio for ${item}`);
}

function checkRoundVariants(ctx: Ctx): void {
  const { story, errors, locale } = ctx;
  if (story.kind !== "activity" || !story.roundVariants) return;
  const limit = roundLimit(story);
  if (story.roundVariants.length > limit) {
    errors.push(`roundVariants lists ${story.roundVariants.length} variants, exceeding roundLimit ${limit}`);
  }
  const roundBeatMap = new Map(story.round.map((b, idx) => [b.id, { beat: b, index: idx }]));
  story.roundVariants.forEach((variant, rIdx) => {
    const rLabel = `roundVariants[${rIdx}]`;
    if (variant.setupStage) checkActions(ctx, `${rLabel}.setupStage`, variant.setupStage);
    if (variant.reducedMotionSetupStage) checkActions(ctx, `${rLabel}.reducedMotionSetupStage`, variant.reducedMotionSetupStage);
    for (const [beatId, override] of Object.entries(variant.beatOverrides ?? {})) {
      if (!override) continue;
      const found = roundBeatMap.get(beatId);
      if (!found) {
        errors.push(`${rLabel}: beatOverrides["${beatId}"] does not match any round beat id`);
        continue;
      }
      const ref: BeatRef = { section: "round", index: found.index, beat: found.beat };
      const bLabel = `${rLabel}.beatOverrides["${beatId}"]`;
      if (override.stage) checkActions(ctx, `${bLabel}.stage`, override.stage);
      if (override.reducedMotionStage) checkActions(ctx, `${bLabel}.reducedMotionStage`, override.reducedMotionStage);
      if (override.lines) checkLines(ctx, ref, `${bLabel}.lines`, override.lines, new Map());
      if (override.response) {
        if (!Number.isFinite(override.response.holdMs) || override.response.holdMs < 0 || override.response.holdMs > MAX_HOLD_MS) {
          errors.push(`${bLabel}.response: holdMs ${override.response.holdMs} must be 0-${MAX_HOLD_MS}`);
        }
        checkActions(ctx, `${bLabel}.response`, override.response.stage);
        checkLines(ctx, ref, `${bLabel}.response`, override.response.lines, new Map());
      }
      if (override.responseByTarget) {
        const targets = new Set(found.beat.input && found.beat.input.type !== "none" ? found.beat.input.targets : []);
        for (const [targetKey, branch] of Object.entries(override.responseByTarget)) {
          if (!targets.has(targetKey)) {
            errors.push(`${bLabel}: responseByTarget target "${targetKey}" is not listed in "${beatId}" input.targets`);
          }
          if (!branch) continue;
          if (branch.holdMs !== undefined && (!Number.isFinite(branch.holdMs) || branch.holdMs < 0 || branch.holdMs > MAX_HOLD_MS)) {
            errors.push(`${bLabel}.responseByTarget["${targetKey}"]: holdMs ${branch.holdMs} must be 0-${MAX_HOLD_MS}`);
          }
          if (branch.stage) checkActions(ctx, `${bLabel}.responseByTarget["${targetKey}"]`, branch.stage);
          if (branch.lines) checkLines(ctx, ref, `${bLabel}.responseByTarget["${targetKey}"]`, branch.lines, new Map());
        }
      }
      if (locale.lines && override.lines) {
        for (const entry of found.beat.words ?? []) {
          const wordId = entry.wordId;
          if (isWordId(wordId)) {
            const texts = [...override.lines, ...(override.response?.lines ?? found.beat.response?.lines ?? [])].map((l) => locale.lines[l.key] ?? "");
            const lyrics = [...songsIn(override.stage ?? found.beat.stage), ...songsIn(override.response?.stage ?? found.beat.response?.stage ?? [])].flatMap(
              (s) => (has(SONGS, s) ? SONGS[s].lyrics : [])
            );
            if (![...texts, ...lyrics].some((t) => wordSpoken(wordId, t))) {
              errors.push(`${bLabel}: names the word "${entry.wordId}" on beat "${beatId}" but none of its overridden lines say it`);
            }
          }
        }
      }
    }
  });
}

/**
 * Validates one story against the content lint (PRD 04 C01 and the content
 * lint checklist). Returns every problem found; an empty list means it passes.
 */
export function validateStory(story: StorySpec, locale: LocalePack, opts: ValidateOptions = {}): string[] {
  const castIds = new Set<string>(story.cast.map((member) => member.id));
  const propIds = new Set<string>(story.props.map((prop) => prop.id));
  const ctx: Ctx = {
    story,
    code: storyCode(story),
    locale,
    opts,
    errors: [],
    castIds,
    propIds,
    actorIds: new Set<string>([...castIds, ...propIds])
  };
  checkIdentity(ctx);
  checkCastAndProps(ctx);
  checkWordLists(ctx);
  checkStructure(ctx);
  checkBeats(ctx);
  checkRoundVariants(ctx);
  checkStrings(ctx);
  checkTargetCoverage(ctx);
  checkVisibility(ctx);
  checkSongTiming(ctx);
  ctx.errors.push(...checkLetterConcept(story, locale));
  ctx.errors.push(...checkCounting(story, locale));
  checkDuration(ctx);
  checkAudio(ctx);
  return [...new Set(ctx.errors)];
}

// ---------------------------------------------------------------------------
// Libraries (songs, effects, beds, words, letters) and the catalog.

const STORY_CODE_PATTERN = /^(?:e(?:0[1-9]|1\d|2[0-6])|g(?:0[1-9]|1[0-6]))$/;

/** Checks the shared song, effect, bed, word and letter tables (`guardNames` as in ValidateOptions). */
export function validateLibraries(locale?: LocalePack, guardNames: readonly string[] = []): string[] {
  const errors: string[] = [];
  for (const id of SONG_IDS) {
    const song = SONGS[id];
    const tag = `song ${id}`;
    if (song.titleKey !== `ui.song.${id}`) errors.push(`${tag}: titleKey must be "ui.song.${id}"`);
    if (locale && (locale.strings[song.titleKey] ?? "").trim() === "") errors.push(`${tag}: title ${song.titleKey} has no text in the ${locale.locale} locale`);
    if (song.vocal === "sung" && song.lyrics.length === 0) errors.push(`${tag}: a sung song needs lyrics`);
    if (song.vocal === "instrumental" && song.lyrics.length > 0) errors.push(`${tag}: an instrumental song must have empty lyrics`);
    if (song.motions.length !== song.lyrics.length) errors.push(`${tag}: ${song.motions.length} motions for ${song.lyrics.length} lyric lines; give one motion per line`);
    for (const motion of song.motions) if (!GESTURE_SET.has(motion)) errors.push(`${tag}: motion "${motion}" is not a gesture`);
    const minBpm = song.sleep ? 50 : 60;
    if (!Number.isFinite(song.bpm) || song.bpm < minBpm || song.bpm > 140) errors.push(`${tag}: bpm ${song.bpm} must be ${minBpm}-140 (slow and clear)`);
    if (!song.style.includes(`${song.bpm} bpm`)) errors.push(`${tag}: style must name the tempo "${song.bpm} bpm"`);
    const seconds = songLengthSec(song);
    const [minSec, maxSec] = id === "hello" || id === "allDone" || id === "wonderThemeShort" ? [8, 15] : song.sleep ? [20, 56] : [15, 30];
    if (seconds < minSec || seconds > maxSec) errors.push(`${tag}: generated length ${seconds} s must be ${minSec}-${maxSec} s`);
    for (const lyric of song.lyrics) {
      for (const phrase of bannedPhrasesIn(lyric)) errors.push(`${tag}: lyric "${lyric}" uses the banned phrase "${phrase}"`);
      for (const name of familyNamesIn(lyric, guardNames)) errors.push(`${tag}: lyric "${lyric}" uses the family or child name "${name}"`);
      if (RETIRED_NAME.test(normalizeQuotes(lyric))) errors.push(`${tag}: lyric "${lyric}" says "Pip"; the chick is Peeko`);
      for (const n of countsAboveLimit(lyric)) errors.push(`${tag}: lyric "${lyric}" counts to ${n}; counting stops at ${COUNT_MAX}`);
    }
    const joined = song.lyrics.join(" ");
    if (/happy\s+birthday/i.test(joined)) errors.push(`${tag}: lyrics use "Happy Birthday"; Wonder World sings an original birthday tune`);
    if (/\ba\W*b\W*c\W*d\b|abcdefg|now\s+i\s+know\s+my/i.test(joined)) errors.push(`${tag}: lyrics run through the alphabet; one or two letters only`);
    if (id === "abc") {
      const letters = new Set(song.lyrics.flatMap((lyric) => lettersNamedIn(lyric)));
      if (letters.size === 0 || letters.size > 2) errors.push(`${tag}: names ${letters.size} letters (${[...letters].join(", ")}); one or two letters, each with a real object`);
    }
  }
  for (const [id, lyrics] of [["goStop", PRD_SONG_LYRICS.goStop], ["ballRolls", PRD_SONG_LYRICS.ballRolls]] as const) {
    if (SONGS[id].lyrics.join("\n") !== lyrics.join("\n")) errors.push(`song ${id}: lyrics must match PRD 02 section 5 word for word`);
  }
  for (const id of SFX_IDS) {
    const sfx = SFX[id];
    const tag = `sound effect ${id}`;
    if (!/\b(soft|gentle)\b/i.test(sfx.prompt)) errors.push(`${tag}: prompt must ask for a soft or gentle sound`);
    for (const term of startlingTerms(sfx.prompt)) errors.push(`${tag}: prompt asks for a startling sound ("${term}")`);
    if (!Number.isFinite(sfx.durationSec) || sfx.durationSec < SFX_MIN_SEC || sfx.durationSec > SFX_MAX_SEC) {
      errors.push(`${tag}: durationSec ${sfx.durationSec} must be ${SFX_MIN_SEC}-${SFX_MAX_SEC}`);
    }
    if (!Number.isFinite(sfx.gain) || sfx.gain <= 0 || sfx.gain > SFX_MAX_GAIN) errors.push(`${tag}: gain ${sfx.gain} must be above 0 and at most ${SFX_MAX_GAIN}`);
  }
  for (const id of MUSIC_BED_IDS) {
    const bed = MUSIC_BEDS[id];
    const tag = `music bed ${id}`;
    for (const word of ["calm", "quiet", "instrumental", "loop"]) {
      if (!bed.prompt.toLowerCase().includes(word)) errors.push(`${tag}: prompt must ask for a ${word} bed`);
    }
    for (const term of startlingTerms(bed.prompt)) errors.push(`${tag}: prompt asks for a startling sound ("${term}")`);
    if (!Number.isFinite(bed.seconds) || bed.seconds < BED_MIN_SEC || bed.seconds > BED_MAX_SEC) errors.push(`${tag}: seconds ${bed.seconds} must be ${BED_MIN_SEC}-${BED_MAX_SEC}`);
  }
  for (const id of WORD_IDS) {
    const entry = WORDS[id];
    const tag = `word ${id}`;
    if (entry.id !== id) errors.push(`${tag}: entry id is "${entry.id}"`);
    if (entry.label.trim() === "" || entry.model.trim() === "" || entry.offline.trim() === "") errors.push(`${tag}: label, model and offline must all have text`);
    if (!wordSpoken(id, entry.model)) errors.push(`${tag}: model phrase "${entry.model}" does not say the word`);
    for (const text of [entry.model, entry.extension ?? "", entry.offline]) {
      for (const phrase of bannedPhrasesIn(text)) errors.push(`${tag}: "${text}" uses the banned phrase "${phrase}"`);
      for (const name of familyNamesIn(text, guardNames)) errors.push(`${tag}: "${text}" uses the family or child name "${name}"`);
    }
    for (const code of entry.related) if (!STORY_CODE_PATTERN.test(code)) errors.push(`${tag}: related code "${code}" is not e01-e20 or g01-g12`);
  }
  const names = new Set<string>();
  for (const letter of ALPHABET) {
    const name = LETTER_NAMES[letter];
    if (names.has(name)) errors.push(`letter ${letter}: name "${name}" is shared with another letter`);
    names.add(name);
  }
  for (const letter of ALPHABET) {
    const info = LETTERS[letter];
    if (!info) continue;
    const tag = `letter ${letter}`;
    if (info.letter !== letter || info.lower !== letter.toLowerCase()) errors.push(`${tag}: entry is for "${info.letter}/${info.lower}"`);
    if (info.name !== LETTER_NAMES[letter]) errors.push(`${tag}: name "${info.name}" differs from LETTER_NAMES (${LETTER_NAMES[letter]})`);
    if (info.soundForms.length === 0 || !info.soundForms.includes(info.sound)) errors.push(`${tag}: soundForms must include the sound ${info.sound}`);
    for (const form of info.soundForms) {
      if (form.toLowerCase() === info.name || form.toLowerCase() === info.lower) errors.push(`${tag}: sound form "${form}" is the letter name; name and sound must differ`);
    }
    if (info.examples.length === 0) errors.push(`${tag}: needs at least one example word`);
    for (const example of info.examples) if (!example.startsWith(info.lower)) errors.push(`${tag}: example "${example}" does not start with ${info.lower}`);
  }
  return errors;
}

export interface StoryReport {
  readonly code: string;
  readonly id: string;
  readonly errors: readonly string[];
}

export interface CatalogReport {
  /** Problems that belong to no single story (catalog shape, locale, libraries). */
  readonly catalog: readonly string[];
  readonly stories: readonly StoryReport[];
}

/** validateCatalog, grouped per story (used by tools/validate-content-entry.ts). */
export function validateCatalogDetailed(stories: readonly StorySpec[], locale: LocalePack, opts: ValidateOptions = {}): CatalogReport {
  const full = opts.complete !== false;
  const catalog: string[] = [];
  const ids = new Map<string, number>();
  const codes = new Map<string, number>();
  for (const story of stories) {
    ids.set(story.id, (ids.get(story.id) ?? 0) + 1);
    codes.set(storyCode(story), (codes.get(storyCode(story)) ?? 0) + 1);
  }
  for (const [id, count] of ids) if (count > 1) catalog.push(`story id "${id}" is used by ${count} stories`);
  for (const [code, count] of codes) if (count > 1) catalog.push(`story code ${code} is used by ${count} stories`);

  if (full) {
    const expected: { kind: StorySpec["kind"]; number: number }[] = [
      ...EPISODE_SLUGS.map((_, i) => ({ kind: "episode" as const, number: i + 1 })),
      ...ACTIVITY_SLUGS.map((_, i) => ({ kind: "activity" as const, number: i + 1 }))
    ];
    expected.forEach((slot, index) => {
      const canon = canonicalStory(slot.kind, slot.number);
      const code = storyCode(slot);
      const story = stories.find((s) => s.kind === slot.kind && s.number === slot.number);
      if (!canon) return;
      if (!story) {
        catalog.push(`${code} (${canon.slug}) is missing from the catalog`);
        return;
      }
      if (story.id !== canon.slug) catalog.push(`${code} has id "${story.id}"; the canonical slug is "${canon.slug}"`);
      if (story.phase !== canon.phase) catalog.push(`${code} is phase ${story.phase}; the canonical phase is ${canon.phase}`);
      if (stories[index] !== story) catalog.push(`${code} is out of order; list episodes 1-20, then activities 1-12`);
    });
    if (stories.length !== expected.length) catalog.push(`the catalog lists ${stories.length} stories; the canonical catalog has ${expected.length}`);
  }

  // A line key belongs to exactly one story.
  const owners = new Map<string, string>();
  for (const story of stories) {
    const code = storyCode(story);
    for (const line of allStoryLines(story)) {
      const owner = owners.get(line.key);
      if (owner !== undefined && owner !== code) catalog.push(`line key ${line.key} is used by both ${owner} and ${code}`);
      owners.set(line.key, code);
    }
  }

  // Locale keys belong to the UI, to a story in the catalog, or to a broadcast show (`s01e01`, `s01e01s1`).
  const knownCodes = new Set(stories.map((story) => storyCode(story)));
  const showCodePrefix = /^s\d\de\d\d(?:s\d)?$/;
  const checkKey = (key: string, table: "lines" | "strings"): void => {
    if (key.startsWith("ui.")) {
      if (table === "lines") catalog.push(`locale line ${key}: ui.* keys are strings, not spoken lines`);
      return;
    }
    const match = /^([eg]\d\d|s\d\de\d\d(?:s\d)?)\./.exec(key);
    if (!match || match[1] === undefined) catalog.push(`locale ${table} key ${key} belongs to no story or UI namespace`);
    else if (!showCodePrefix.test(match[1]) && !knownCodes.has(match[1])) {
      catalog.push(`locale ${table} key ${key} belongs to ${match[1]}, which is not in the catalog`);
    }
  };
  for (const key of Object.keys(locale.lines)) checkKey(key, "lines");
  for (const key of Object.keys(locale.strings)) {
    checkKey(key, "strings");
    if (has(locale.lines, key)) catalog.push(`locale key ${key} is both a line and a string`);
  }
  for (const [key, text] of Object.entries(locale.strings)) {
    if (!key.startsWith("ui.")) continue;
    for (const phrase of bannedPhrasesIn(text)) catalog.push(`UI string ${key} uses the banned phrase "${phrase}"`);
    for (const name of familyNamesIn(text, opts.guardNames)) catalog.push(`UI string ${key} uses the family or child name "${name}"`);
    if (RETIRED_NAME.test(normalizeQuotes(text))) catalog.push(`UI string ${key} says "Pip"; the chick is Peeko`);
  }
  if (full) {
    for (const key of REQUIRED_UI_KEYS) {
      const text = locale.strings[key];
      if (text === undefined || text.trim() === "") catalog.push(`UI string ${key} has no text in the ${locale.locale} locale`);
    }
    for (const [key, placeholders] of Object.entries(UI_PLACEHOLDERS)) {
      const text = locale.strings[key];
      if (text === undefined) continue;
      for (const placeholder of placeholders) if (!text.includes(placeholder)) catalog.push(`UI string ${key} must keep the placeholder ${placeholder}`);
    }
    catalog.push(...validateLibraries(locale, opts.guardNames));
    // Target words follow the PRD core-word tables (words.ts `related`).
    for (const story of stories) {
      const code = storyCode(story);
      for (const w of story.targetWords) {
        if (isWordId(w) && !WORDS[w].related.includes(code)) {
          catalog.push(`${code} targets "${w}", but words.ts does not link "${w}" to ${code}; follow the PRD core words or update words.ts`);
        }
      }
    }
  }

  const reports = stories.map((story) => ({ code: storyCode(story), id: story.id, errors: validateStory(story, locale, opts) }));
  return { catalog, stories: reports };
}

/**
 * Validates the whole catalog: every story (validateStory), unique ids and
 * codes, the canonical 20 + 12 list, locale key ownership, UI strings and the
 * shared libraries. Messages are prefixed with "catalog:" or the story code.
 */
export function validateCatalog(stories: readonly StorySpec[], locale: LocalePack, opts: ValidateOptions = {}): string[] {
  const report = validateCatalogDetailed(stories, locale, opts);
  return [
    ...report.catalog.map((message) => `catalog: ${message}`),
    ...report.stories.flatMap((story) => story.errors.map((message) => `${story.code} ${story.id}: ${message}`))
  ];
}

/** Vocabulary ids a story uses anywhere (targets, support and beat words). */
export function storyWords(story: StorySpec): WordId[] {
  const out = new Set<WordId>();
  for (const w of [...story.targetWords, ...story.supportWords]) if (isWordId(w)) out.add(w);
  for (const ref of beatRefs(story)) for (const entry of ref.beat.words ?? []) if (isWordId(entry.wordId)) out.add(entry.wordId);
  return [...out];
}

// ---------------------------------------------------------------------------
// Multi-segment broadcast ShowSpec validation (PRD 09 B3.3, B.6, C.1-C.6, E.3).

export type ShowValidationCategory =
  | "identity"
  | "chapters"
  | "segments"
  | "cast-props"
  | "beats"
  | "lines"
  | "strings"
  | "visibility"
  | "songs"
  | "words"
  | "concepts"
  | "duration"
  | "audio";

export interface ShowValidationIssue {
  readonly category: ShowValidationCategory;
  readonly segmentId?: string;
  readonly beatId?: string;
  readonly message: string;
}

export interface ValidateShowOptions {
  readonly audio?: AudioTables;
  readonly requireAudio?: boolean;
  readonly guardNames?: readonly string[];
}

export const MIN_SHOW_TARGET_WORD_SPOKEN = 5;
export const MIN_SHORT_TARGET_WORD_SPOKEN = 2;

const SHERU_BARK_TOKENS: ReadonlySet<string> = new Set([
  "woof", "arf", "yip", "aroo", "ruff", "huff", "bow", "wow"
]);

const EXTRA_SHOW_WORD_FORMS: Readonly<Record<string, readonly string[]>> = {
  "bye-bye": ["bye bye", "bye"],
  four: ["four", "4"],
  five: ["five", "5"],
  six: ["six", "6"],
  seven: ["seven", "7"],
  eight: ["eight", "8"],
  nine: ["nine", "9"],
  ten: ["ten", "10"]
};

function showBandCountMax(band: AgeBand): number {
  if (band === "little") return COUNT_MAX;
  if (band === "toddler") return 5;
  return 20;
}

function normalizeShowWords(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/'/g, "")
    .replace(/[-\u2010-\u2015]/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function showWordInflections(form: string): ReadonlySet<string> {
  const out = new Set<string>([form, `${form}s`, `${form}es`, `${form}ed`, `${form}ing`]);
  if (form.endsWith("e")) {
    out.add(`${form}d`);
    out.add(`${form.slice(0, -1)}ing`);
  }
  if (/[^aeiou]y$/.test(form)) {
    out.add(`${form.slice(0, -1)}ies`);
    out.add(`${form.slice(0, -1)}ied`);
  }
  if (/(?:^|[^aeiou])[aeiou][bdgklmnprt]$/.test(form)) {
    const last = form.slice(-1);
    out.add(`${form}${last}ed`);
    out.add(`${form}${last}ing`);
  }
  return out;
}

/** Counts how many times a curriculum/target word appears in `text` (spoken line or song lyric). */
export function showWordOccurrences(word: string, text: string): number {
  if (isWordId(word) && WORDS[word].category === "letter") {
    return wordSpoken(word, text) ? 1 : 0;
  }
  const normal = normalizeShowWords(text);
  if (normal === "") return 0;
  const tokens = normal.split(" ");
  const rawForms: readonly string[] = isWordId(word)
    ? WORDS[word].forms
    : EXTRA_SHOW_WORD_FORMS[word] ?? [word];
  const phraseForms: string[] = [];
  const tokenForms = new Set<string>();
  const isSound = isWordId(word) && WORDS[word].category === "sound";
  const shortStems: string[] = [];
  for (const form of rawForms) {
    const f = normalizeShowWords(form);
    if (f === "") continue;
    if (f.includes(" ")) {
      phraseForms.push(f);
      continue;
    }
    if (f.length < 3 || /^\d+$/.test(f)) {
      tokenForms.add(f);
    } else {
      for (const inf of showWordInflections(f)) tokenForms.add(inf);
    }
    if (isSound) shortStems.push(f);
  }
  let count = 0;
  for (const phrase of phraseForms) {
    const pattern = new RegExp(`(?:^| )${escapeRegExp(phrase)}(?= |$)`, "g");
    const matches = normal.match(pattern);
    if (matches) count += matches.length;
  }
  for (const token of tokens) {
    if (tokenForms.has(token)) {
      count += 1;
      continue;
    }
    if (isSound && shortStems.some((stem) => token.length > stem.length && token.startsWith(stem) && [...token.slice(stem.length)].every((c) => c === stem.slice(-1)))) {
      count += 1;
    }
  }
  return count;
}

function transitionDurationMs(transition: SegmentTransition, segmentIndex: number): number {
  if (segmentIndex === 0) return 0;
  if (transition === "train") return 1500;
  if (transition === "fade") return 800;
  return 0;
}

function showBeatDurationMs(beat: BeatSpec, show: ShowSpec, locale: LocalePack, audio?: AudioTables): number {
  let total = beat.lines.reduce((sum, line) => sum + lineMs(line.key, locale, audio), 0) + finiteNonNegative(beat.holdMs);
  const isInvite = beat.kind === "invite" || (beat.input !== undefined && beat.input.type !== "none");
  if (isInvite) {
    const pause = beat.pauseMs !== undefined && Number.isFinite(beat.pauseMs) ? Math.max(0, beat.pauseMs) : finiteNonNegative(show.pauseMs);
    total += pause > 0 ? pause : 2500;
  }
  if (beat.response) {
    total += beat.response.lines.reduce((sum, line) => sum + lineMs(line.key, locale, audio), 0) + finiteNonNegative(beat.response.holdMs);
  }
  return total;
}

/** Estimated broadcast running time (ms) of a ShowSpec across all segments, transitions, PAUSEs and end card. */
export function estimateShowMs(show: ShowSpec, locale: LocalePack, opts: { readonly audio?: AudioTables } = {}): number {
  let total = 0;
  show.segments.forEach((segment, segIdx) => {
    total += transitionDurationMs(segment.transitionIn, segIdx);
    for (const beat of segment.beats) {
      total += showBeatDurationMs(beat, show, locale, opts.audio);
    }
  });
  if (show.endCardSec !== undefined && Number.isFinite(show.endCardSec) && show.endCardSec > 0) {
    total += show.endCardSec * 1000;
  }
  return total;
}

function isSheruBarkOnly(text: string): boolean {
  const cleaned = normalizeShowWords(text);
  if (cleaned === "") return false;
  return cleaned.split(" ").every((token) => {
    if (SHERU_BARK_TOKENS.has(token)) return true;
    return [...SHERU_BARK_TOKENS].some(
      (bark) => token.length > bark.length && token.startsWith(bark) && [...token.slice(bark.length)].every((c) => c === bark.slice(-1))
    );
  });
}

/**
 * Validates a multi-segment `ShowSpec` (long-form episode or 9:16 Short) against
 * schema, chapter, segment, stage-action, visibility, song-cue, vocabulary and
 * age-band counting contracts (PRD 09 B3.3, B.6, C.1-C.6, E.3).
 */
export function validateShow(show: ShowSpec, locale: LocalePack, opts: ValidateShowOptions = {}): ShowValidationIssue[] {
  const issues: ShowValidationIssue[] = [];
  const push = (category: ShowValidationCategory, message: string, segmentId?: string, beatId?: string): void => {
    issues.push({
      category,
      ...(segmentId !== undefined ? { segmentId } : {}),
      ...(beatId !== undefined ? { beatId } : {}),
      message
    });
  };

  const aspect: ShowAspect = show.aspect ?? "16:9";
  const isShort = aspect === "9:16";
  const isEnglish = locale.locale === "en";
  const countMax = AGE_BAND_SET.has(show.band) ? showBandCountMax(show.band) : COUNT_MAX;

  const checkShowText = (
    category: ShowValidationCategory,
    label: string,
    text: string,
    spoken: boolean,
    segmentId?: string,
    beatId?: string
  ): void => {
    if (isEnglish) {
      for (const phrase of bannedPhrasesIn(text)) push(category, `${label}: "${text}" uses the banned phrase "${phrase}"`, segmentId, beatId);
      if (RETIRED_NAME.test(normalizeQuotes(text))) push(category, `${label}: "${text}" says "Pip"; the chick is Peeko`, segmentId, beatId);
      if (spoken) {
        for (const n of spokenNumbers(text).filter((v) => v > countMax)) {
          push(category, `${label}: "${text}" counts to ${n}; counting stops at ${countMax} for ${show.band} band`, segmentId, beatId);
        }
        if (PHONICS_NOTATION.test(text)) {
          push(category, `${label}: "${text}" writes a sound in phonics notation; model sounds naturally`, segmentId, beatId);
        }
      }
    }
    for (const name of familyNamesIn(text, opts.guardNames)) {
      push(category, `${label}: "${text}" uses the family or child name "${name}"; default lines stay generic`, segmentId, beatId);
    }
  };

  // 1. Identity & metadata.
  if (show.kind !== "show") push("identity", `kind "${String(show.kind)}" must be "show"`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(show.id)) push("identity", `id "${show.id}" must be a lowercase slug`);
  if (!/^s\d\de\d\d(?:s\d)?$/.test(show.code)) push("identity", `code "${show.code}" must look like "s01e01" or "s01e01s1"`);
  if (!Number.isInteger(show.version) || show.version < 1) push("identity", `version ${show.version} must be a positive integer`);
  if (!AGE_BAND_SET.has(show.band)) push("identity", `band "${String(show.band)}" must be little, toddler or preschool`);
  if (show.aspect !== undefined && !SHOW_ASPECT_SET.has(show.aspect)) {
    push("identity", `aspect "${String(show.aspect)}" must be "16:9" or "9:16"`);
  }
  if (show.parentShowId !== undefined && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(show.parentShowId)) {
    push("identity", `parentShowId "${show.parentShowId}" must be a lowercase slug`);
  }
  if (show.calendarWeek !== undefined && (!Number.isInteger(show.calendarWeek) || show.calendarWeek < 1 || show.calendarWeek > 52)) {
    push("identity", `calendarWeek ${show.calendarWeek} must be an integer 1-52`);
  }
  if (!CHARACTER_SET.has(show.host)) push("identity", `host "${show.host}" is not a character`);
  else if (show.host === "sheru") push("identity", `host cannot be "sheru" because Sheru is non-speaking`);
  if (!Number.isFinite(show.pauseMs) || show.pauseMs < 1500 || show.pauseMs > MAX_WAIT_MS) {
    push("identity", `pauseMs ${show.pauseMs} must be 1500-${MAX_WAIT_MS}`);
  }
  if (!Number.isFinite(show.estimatedDurationSec) || show.estimatedDurationSec <= 0) {
    push("duration", `estimatedDurationSec ${show.estimatedDurationSec} must be positive`);
  }
  if (show.endCardSec !== undefined && (!Number.isFinite(show.endCardSec) || show.endCardSec < 0 || show.endCardSec > 30)) {
    push("duration", `endCardSec ${show.endCardSec} must be 0-30 s`);
  }
  if (show.review.language !== "approved") push("identity", `review.language is "${String(show.review.language)}", not "approved"`);
  if (show.review.rights !== "approved") push("identity", `review.rights is "${String(show.review.rights)}", not "approved"`);
  if (typeof show.review.reviewer !== "string" || show.review.reviewer.trim() === "") push("identity", "review.reviewer is empty");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(show.review.date)) push("identity", `review.date "${show.review.date}" must be YYYY-MM-DD`);

  // Required show strings.
  const requiredStrings: readonly [string, string][] = [
    ["title", show.titleKey],
    ["offline card", show.offlinePlayKey],
    ["caregiver bridge", show.caregiverBridgeKey]
  ];
  for (const [what, key] of requiredStrings) {
    if (typeof key !== "string" || key.trim() === "") {
      push("strings", `the ${what} key is empty`);
      continue;
    }
    const text = locale.strings[key];
    if (text === undefined || text.trim() === "") {
      push("strings", `the ${what} string ${key} has no text in the ${locale.locale} locale`);
    } else {
      checkShowText("strings", `string ${key}`, text, false);
    }
  }

  // 2. Segments & chapters.
  if (show.segments.length === 0) push("segments", "show must have at least one segment");
  if (!isShort && show.segments.length < 2) push("segments", "a long-form 16:9 show must have at least 2 segments");

  const segmentIdSet = new Set<string>();
  for (const seg of show.segments) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(seg.id)) push("segments", `segment id "${seg.id}" must be a lowercase slug`, seg.id);
    if (segmentIdSet.has(seg.id)) push("segments", `segment id "${seg.id}" is used twice`, seg.id);
    segmentIdSet.add(seg.id);
  }

  if (!isShort && show.chapters.length === 0) push("chapters", "a long-form 16:9 show must list chapters");
  let prevChapterSec = -1;
  const seenChapterSegs = new Set<string>();
  for (const chapter of show.chapters) {
    if (!segmentIdSet.has(chapter.segmentId)) {
      push("chapters", `chapter segmentId "${chapter.segmentId}" does not exist in show.segments`, chapter.segmentId);
    }
    if (seenChapterSegs.has(chapter.segmentId)) {
      push("chapters", `chapter segmentId "${chapter.segmentId}" is listed twice`, chapter.segmentId);
    }
    seenChapterSegs.add(chapter.segmentId);
    const title = locale.strings[chapter.titleKey];
    if (title === undefined || title.trim() === "") {
      push("chapters", `chapter title ${chapter.titleKey} has no text in the ${locale.locale} locale`, chapter.segmentId);
    } else {
      checkShowText("chapters", `chapter ${chapter.titleKey}`, title, false, chapter.segmentId);
    }
    if (chapter.atSec !== undefined) {
      if (!Number.isFinite(chapter.atSec) || chapter.atSec < 0) {
        push("chapters", `chapter "${chapter.segmentId}" atSec ${chapter.atSec} must be non-negative`, chapter.segmentId);
      } else if (chapter.atSec < prevChapterSec) {
        push("chapters", `chapter "${chapter.segmentId}" atSec ${chapter.atSec} is earlier than previous chapter (${prevChapterSec} s)`, chapter.segmentId);
      } else {
        prevChapterSec = chapter.atSec;
      }
    }
  }

  // Allowed line-key prefixes (own code, plus parent show code for Shorts cut from a parent show).
  const parentCodePrefix = show.parentShowId !== undefined ? `${show.code.replace(/s\d$/, "")}.` : `${show.code}.`;
  const allowedPrefixes: readonly string[] =
    parentCodePrefix !== `${show.code}.` ? [`${show.code}.`, parentCodePrefix] : [`${show.code}.`];

  const allBeatIds = new Set<string>();
  const seenLineKeys = new Map<string, string>();
  const allShowSpokenLines: LineRef[] = [];
  const allShowActions: StageAction[] = [];
  const spokenTextsAndLyrics: string[] = [];
  let hostInAnySegment = false;

  // 3. Per-segment validation: cast, props, beats, stage actions, visibility, song timing.
  for (const segment of show.segments) {
    const segId = segment.id;
    const segPrefix = `segment "${segId}"`;
    if (!SEGMENT_TEMPLATE_SET.has(segment.template)) {
      push("segments", `${segPrefix}: template "${String(segment.template)}" is unknown`, segId);
    }
    if (!WORLD_SET.has(segment.world)) {
      push("segments", `${segPrefix}: world "${String(segment.world)}" is not a known world`, segId);
    }
    if (!SEGMENT_TRANSITION_SET.has(segment.transitionIn)) {
      push("segments", `${segPrefix}: transitionIn "${String(segment.transitionIn)}" is unknown`, segId);
    }
    if (segment.music !== undefined && segment.music !== null && !has(MUSIC_BEDS, segment.music)) {
      push("segments", `${segPrefix}: music "${segment.music}" is not a music bed`, segId);
    }
    if (segment.then !== undefined && !WORLD_SET.has(segment.then) && !segmentIdSet.has(segment.then)) {
      push("segments", `${segPrefix}: then "${segment.then}" is neither a world id nor a segment id`, segId);
    }
    if (segment.titleKey !== undefined) {
      const segTitle = locale.strings[segment.titleKey];
      if (segTitle === undefined || segTitle.trim() === "") {
        push("strings", `${segPrefix}: titleKey ${segment.titleKey} has no text in the ${locale.locale} locale`, segId);
      } else {
        checkShowText("strings", `${segPrefix} title ${segment.titleKey}`, segTitle, false, segId);
      }
    }

    const castIds = new Set<string>();
    const propIds = new Set<string>();
    const seenIds = new Set<string>();
    for (const member of segment.cast) {
      if (!CHARACTER_SET.has(member.id)) push("cast-props", `${segPrefix}: cast "${member.id}" is not a character`, segId);
      if (seenIds.has(member.id)) push("cast-props", `${segPrefix}: cast "${member.id}" is listed twice`, segId);
      seenIds.add(member.id);
      castIds.add(member.id);
      if (member.id === show.host) hostInAnySegment = true;
      if (!SPOT_SET.has(member.at)) push("cast-props", `${segPrefix}: cast "${member.id}" stands at unknown spot "${member.at}"`, segId);
    }
    for (const prop of segment.props) {
      if (!/^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/.test(prop.id)) {
        push("cast-props", `${segPrefix}: prop id "${prop.id}" must be letters, digits and dashes`, segId);
      }
      if (seenIds.has(prop.id)) push("cast-props", `${segPrefix}: prop id "${prop.id}" is used twice`, segId);
      seenIds.add(prop.id);
      propIds.add(prop.id);
      if (!PROP_ASSET_SET.has(prop.asset)) push("cast-props", `${segPrefix}: prop "${prop.id}" uses unknown asset "${prop.asset}"`, segId);
      if (!SPOT_SET.has(prop.at)) push("cast-props", `${segPrefix}: prop "${prop.id}" stands at unknown spot "${prop.at}"`, segId);
      if (prop.tint !== undefined && !/^#[0-9a-fA-F]{6}$/.test(prop.tint)) {
        push("cast-props", `${segPrefix}: prop "${prop.id}" tint "${prop.tint}" must be #rrggbb`, segId);
      }
      if (prop.size !== undefined && (!Number.isFinite(prop.size) || prop.size <= 0 || prop.size > 5)) {
        push("cast-props", `${segPrefix}: prop "${prop.id}" size ${prop.size} must be between 0 and 5 metres`, segId);
      }
    }
    const actorIds = new Set<string>([...castIds, ...propIds]);
    const hasRobot = segment.props.some((prop) => prop.asset === "robot");

    if (segment.beats.length === 0) {
      push("beats", `${segPrefix}: segment needs at least one beat`, segId);
      continue;
    }

    const checkSegActions = (label: string, actions: readonly StageAction[], beatId: string): void => {
      const actionErrors: string[] = [];
      checkActions({ errors: actionErrors, actorIds, propIds, castIds }, label, actions);
      for (const err of actionErrors) push("beats", err, segId, beatId);
      allShowActions.push(...actions);
    };

    const checkSegLines = (label: string, lines: readonly LineRef[], beatId: string, seen: Map<string, string>): void => {
      for (const line of lines) {
        allShowSpokenLines.push(line);
        if (!SPEAKER_SET.has(line.speaker)) {
          push("lines", `${label}: speaker "${line.speaker}" is unknown`, segId, beatId);
        } else if (line.speaker === "robot") {
          if (!hasRobot) push("lines", `${label}: line ${line.key} is spoken by "robot" but no prop uses the robot asset`, segId, beatId);
        } else if (line.speaker !== "narrator" && line.speaker !== "sheru" && !castIds.has(line.speaker)) {
          push("lines", `${label}: line ${line.key} is spoken by "${line.speaker}", who is not in ${segPrefix} cast`, segId, beatId);
        }
        const lineKey = typeof line.key === "string" ? line.key : "";
        if (!lineKey || !allowedPrefixes.some((prefix) => lineKey.startsWith(prefix)) || !/^[a-z0-9._-]+$/i.test(lineKey)) {
          push("lines", `${label}: line key "${lineKey}" must start with "${show.code}."`, segId, beatId);
          if (!lineKey) continue;
        }
        const prev = seen.get(line.key);
        if (prev !== undefined) push("lines", `${label}: line key ${line.key} is already used in ${prev}`, segId, beatId);
        else seen.set(line.key, label);
        const text = locale.lines[line.key];
        if (text === undefined) {
          push("lines", `${label}: line ${line.key} has no text in the ${locale.locale} locale`, segId, beatId);
          continue;
        }
        if (text.trim() === "") {
          push("lines", `${label}: line ${line.key} is empty`, segId, beatId);
          continue;
        }
        if (line.speaker === "sheru") {
          if (!isSheruBarkOnly(text)) {
            push("lines", `${label}: line ${line.key} "${text}" gives spoken words to Sheru, who only barks`, segId, beatId);
          }
        }
        spokenTextsAndLyrics.push(text);
        checkShowText("lines", `${label}: line ${line.key}`, text, true, segId, beatId);
      }
    };

    const state = initialState(segment);
    for (const beat of segment.beats) {
      const beatId = beat.id;
      const label = `${segPrefix} beat "${beatId}"`;
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(beatId)) push("beats", `${label}: beat id must be lowercase letters, digits and dashes`, segId, beatId);
      if (allBeatIds.has(beatId)) push("beats", `${label}: beat id "${beatId}" is used twice in show`, segId, beatId);
      allBeatIds.add(beatId);
      if (!BEAT_KIND_SET.has(beat.kind)) push("beats", `${label}: kind "${String(beat.kind)}" is unknown`, segId, beatId);
      if (beat.camera !== undefined && !CAMERA_SET.has(beat.camera)) push("beats", `${label}: camera "${beat.camera}" is unknown`, segId, beatId);
      if (!Number.isFinite(beat.holdMs) || beat.holdMs < 0 || beat.holdMs > MAX_HOLD_MS) {
        push("beats", `${label}: holdMs ${beat.holdMs} must be 0-${MAX_HOLD_MS}`, segId, beatId);
      }
      if (beat.pauseMs !== undefined && (!Number.isFinite(beat.pauseMs) || beat.pauseMs < 1500 || beat.pauseMs > MAX_WAIT_MS)) {
        push("beats", `${label}: pauseMs ${beat.pauseMs} must be 1500-${MAX_WAIT_MS}`, segId, beatId);
      }

      checkSegActions(label, beat.stage, beatId);
      if (beat.reducedMotionStage !== undefined) checkSegActions(`${label} reducedMotionStage`, beat.reducedMotionStage, beatId);
      checkSegLines(label, beat.lines, beatId, seenLineKeys);

      // Input & response validation.
      const input = beat.input;
      if (input === undefined || input.type === "none") {
        if (beat.waitMs !== undefined) push("beats", `${label}: waitMs is set but the beat waits for no input`, segId, beatId);
        if (beat.response !== undefined) push("beats", `${label}: a response needs an input to answer`, segId, beatId);
        if (beat.responseByTarget !== undefined) push("beats", `${label}: responseByTarget needs an input to answer`, segId, beatId);
      } else {
        if (input.type !== "tap") {
          push("beats", `${label}: show beats only use input type "tap" (or "none")`, segId, beatId);
        } else {
          if (input.targets.length === 0) push("beats", `${label}: input lists no tap targets`, segId, beatId);
          if (input.targets.length > MAX_TAP_TARGETS) {
            push("beats", `${label}: input lists ${input.targets.length} tap targets; at most ${MAX_TAP_TARGETS}`, segId, beatId);
          }
          const seenTargets = new Set<string>();
          for (const target of input.targets) {
            if (!actorIds.has(target)) push("beats", `${label}: tap target "${target}" is not a cast or prop id in ${segPrefix}`, segId, beatId);
            if (seenTargets.has(target)) push("beats", `${label}: tap target "${target}" is listed twice`, segId, beatId);
            seenTargets.add(target);
          }
          if (beat.responseByTarget !== undefined) {
            for (const targetKey of Object.keys(beat.responseByTarget)) {
              if (!seenTargets.has(targetKey)) push("beats", `${label}: responseByTarget target "${targetKey}" is not in input.targets`, segId, beatId);
            }
          }
        }
        if (beat.waitMs !== undefined && (!Number.isFinite(beat.waitMs) || beat.waitMs < MIN_WAIT_MS || beat.waitMs > MAX_WAIT_MS)) {
          push("beats", `${label}: waitMs ${beat.waitMs} must be ${MIN_WAIT_MS}-${MAX_WAIT_MS}`, segId, beatId);
        }
      }

      const seenBeforeResponse = new Map(seenLineKeys);
      if (beat.response) {
        const respLabel = `${label} response`;
        if (!Number.isFinite(beat.response.holdMs) || beat.response.holdMs < 0 || beat.response.holdMs > MAX_HOLD_MS) {
          push("beats", `${respLabel}: holdMs ${beat.response.holdMs} must be 0-${MAX_HOLD_MS}`, segId, beatId);
        }
        checkSegActions(respLabel, beat.response.stage, beatId);
        checkSegLines(respLabel, beat.response.lines, beatId, seenLineKeys);
      }
      if (beat.responseByTarget) {
        for (const [targetKey, branch] of Object.entries(beat.responseByTarget)) {
          if (!branch) continue;
          const branchLabel = `${label} responseByTarget["${targetKey}"]`;
          if (branch.holdMs !== undefined && (!Number.isFinite(branch.holdMs) || branch.holdMs < 0 || branch.holdMs > MAX_HOLD_MS)) {
            push("beats", `${branchLabel}: holdMs ${branch.holdMs} must be 0-${MAX_HOLD_MS}`, segId, beatId);
          }
          if (branch.stage !== undefined) checkSegActions(branchLabel, branch.stage, beatId);
          if (branch.lines !== undefined) {
            const branchSeen = new Map(seenBeforeResponse);
            checkSegLines(branchLabel, branch.lines, beatId, branchSeen);
            for (const [k, v] of branchSeen) if (!seenLineKeys.has(k)) seenLineKeys.set(k, v);
          }
        }
      }

      if (beat.caregiverPromptKey !== undefined) {
        const tip = locale.strings[beat.caregiverPromptKey];
        if (tip === undefined || tip.trim() === "") {
          push("strings", `${label}: caregiver tip ${beat.caregiverPromptKey} has no text in the ${locale.locale} locale`, segId, beatId);
        } else {
          checkShowText("strings", `${label}: tip ${beat.caregiverPromptKey}`, tip, false, segId, beatId);
        }
      }
      if (beat.pauseCaptionKey !== undefined) {
        const cue = locale.strings[beat.pauseCaptionKey];
        if (cue === undefined || cue.trim() === "") {
          push("strings", `${label}: pauseCaptionKey ${beat.pauseCaptionKey} has no text in the ${locale.locale} locale`, segId, beatId);
        } else {
          checkShowText("strings", `${label}: pauseCaption ${beat.pauseCaptionKey}`, cue, false, segId, beatId);
        }
      }

      // Collect song lyrics for target-word coverage & check sung-song overlap.
      for (const song of [...songsIn(beat.stage), ...songsIn(beat.response?.stage ?? [])]) {
        if (!has(SONGS, song)) continue;
        for (const lyric of SONGS[song].lyrics) spokenTextsAndLyrics.push(lyric);
      }
      for (const song of songsIn(beat.stage)) {
        if (!has(SONGS, song)) continue;
        if (SONGS[song].vocal === "sung") {
          if (beat.lines.length > 0) {
            push("songs", `${label}: sung song "${song}" overlaps the beat's own spoken lines; give sung songs a beat with empty lines`, segId, beatId);
          }
          const minSongHold = Math.min(4000, songDurationMs(song, opts.audio));
          if (beat.holdMs + SONG_OVERLAP_GRACE_MS < minSongHold) {
            push("songs", `${label}: sung song "${song}" holdMs (${beat.holdMs} ms) cuts off immediately; hold at least ${minSongHold} ms`, segId, beatId);
          }
        }
      }

      // Stage visibility simulation within segment.
      const before = cloneState(state);
      if (beat.reducedMotionStage !== undefined) {
        const reduced = cloneState(before);
        applyActions(reduced, beat.reducedMotionStage);
        const normal = cloneState(before);
        applyActions(normal, beat.stage);
        const a = visibleIds(normal).join(",");
        const b = visibleIds(reduced).join(",");
        if (a !== b) {
          push("visibility", `${label}: reducedMotionStage changes what is on stage ([${b}] instead of [${a}])`, segId, beatId);
        }
        if (musicSignature(beat.stage) !== musicSignature(beat.reducedMotionStage)) {
          push("visibility", `${label}: reducedMotionStage changes the songs or music`, segId, beatId);
        }
      }
      applyActions(state, beat.stage);
      const afterStage = cloneState(state);
      const checkSegSpeakers = (subLabel: string, lines: readonly LineRef[], st: StageState): void => {
        for (const line of lines) {
          const onStage =
            line.speaker === "robot"
              ? segment.props.some((prop) => prop.asset === "robot" && isVisible(st, prop.id))
              : !castIds.has(line.speaker) || isVisible(st, line.speaker);
          if (!onStage) push("visibility", `${subLabel}: ${line.speaker} speaks line ${line.key} while off stage`, segId, beatId);
        }
      };
      checkSegSpeakers(label, beat.lines, afterStage);
      if (input !== undefined && input.type === "tap") {
        for (const target of input.targets) {
          if (actorIds.has(target) && !isVisible(afterStage, target)) {
            push("visibility", `${label}: tap target "${target}" is not visible when waiting`, segId, beatId);
          }
        }
      }
      let afterResponse: StageState | null = null;
      if (beat.response) {
        applyActions(state, beat.response.stage);
        afterResponse = cloneState(state);
        checkSegSpeakers(`${label} response`, beat.response.lines, afterResponse);
      }
      if (beat.responseByTarget) {
        for (const [targetKey, branch] of Object.entries(beat.responseByTarget)) {
          if (!branch) continue;
          const branchState = cloneState(afterStage);
          applyActions(branchState, branch.stage ?? beat.response?.stage ?? []);
          checkSegSpeakers(`${label} responseByTarget["${targetKey}"]`, branch.lines ?? beat.response?.lines ?? [], branchState);
        }
      }
      for (const entry of beat.words ?? []) {
        if (!actorIds.has(entry.objectId)) {
          push("words", `${label}: word "${entry.wordId}" points at "${entry.objectId}", which is not in ${segPrefix}`, segId, beatId);
        } else {
          const seen =
            isVisible(before, entry.objectId) ||
            isVisible(afterStage, entry.objectId) ||
            (afterResponse !== null && isVisible(afterResponse, entry.objectId));
          if (!seen) push("visibility", `${label}: names "${entry.wordId}" with "${entry.objectId}", which is not visible during the beat`, segId, beatId);
        }
        if (isEnglish) {
          const beatTexts = [...beat.lines, ...(beat.response?.lines ?? [])].map((l) => locale.lines[l.key] ?? "");
          const beatLyrics = [...songsIn(beat.stage), ...songsIn(beat.response?.stage ?? [])].flatMap((s) => (has(SONGS, s) ? SONGS[s].lyrics : []));
          if (![...beatTexts, ...beatLyrics].some((t) => showWordOccurrences(entry.wordId, t) > 0)) {
            push("words", `${label}: names the word "${entry.wordId}" but none of its lines or lyrics say it`, segId, beatId);
          }
        }
      }
    }
  }

  if (CHARACTER_SET.has(show.host) && show.segments.length > 0 && !hostInAnySegment) {
    push("identity", `host "${show.host}" does not appear in any segment cast`);
  }
  const lastSeg = show.segments[show.segments.length - 1];
  const lastBeat = lastSeg?.beats[lastSeg.beats.length - 1];
  if (lastBeat && lastBeat.input !== undefined && lastBeat.input.type !== "none") {
    push("beats", `final beat "${lastBeat.id}" must not wait for input; the ending is calm and finite`, lastSeg?.id, lastBeat.id);
  }
  if (show.youtube !== undefined && !allBeatIds.has(show.youtube.thumbnailBeatId)) {
    push("identity", `youtube.thumbnailBeatId "${show.youtube.thumbnailBeatId}" does not match any beat id in show`);
  }

  // 4. Target & support word lists and target-word repetition across the show.
  if (show.targetWords.length === 0) push("words", "targetWords must list at least 1 word");
  const seenTargetWords = new Set<string>();
  for (const w of show.targetWords) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(w)) push("words", `targetWords: "${w}" must be a lowercase word or hyphenated slug`);
    if (seenTargetWords.has(w)) push("words", `targetWords: "${w}" is listed twice`);
    seenTargetWords.add(w);
  }
  const seenSupportWords = new Set<string>();
  for (const w of show.supportWords) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(w)) push("words", `supportWords: "${w}" must be a lowercase word or hyphenated slug`);
    if (seenSupportWords.has(w)) push("words", `supportWords: "${w}" is listed twice`);
    if (seenTargetWords.has(w)) push("words", `supportWords: "${w}" is already a target word`);
    seenSupportWords.add(w);
  }
  if (isEnglish) {
    const minCount = isShort ? MIN_SHORT_TARGET_WORD_SPOKEN : MIN_SHOW_TARGET_WORD_SPOKEN;
    for (const w of show.targetWords) {
      const total = spokenTextsAndLyrics.reduce((sum, text) => sum + showWordOccurrences(w, text), 0);
      if (total < minCount) {
        push("words", `target word "${w}" is spoken/sung ${total} time(s); ${isShort ? "Shorts" : "long shows"} require at least ${minCount}`);
      }
    }
  }

  // Optional letterConcept validation when set on a letter-focused show.
  if (isEnglish && show.letterConcept) {
    const info = letterInfo(show.letterConcept.letter);
    if (!info) {
      push("concepts", `letterConcept.letter "${show.letterConcept.letter}" is not a reviewed letter`);
    } else {
      const nameText = conceptText(locale, show.letterConcept.letterNameKey);
      const soundText = conceptText(locale, show.letterConcept.phonemeCueKey);
      const exampleText = conceptText(locale, show.letterConcept.exampleWordKey);
      if (nameText === undefined) push("concepts", `letterConcept.letterNameKey ${show.letterConcept.letterNameKey} has no text`);
      if (soundText === undefined) push("concepts", `letterConcept.phonemeCueKey ${show.letterConcept.phonemeCueKey} has no text`);
      if (exampleText === undefined) push("concepts", `letterConcept.exampleWordKey ${show.letterConcept.exampleWordKey} has no text`);
      if (nameText !== undefined && soundText !== undefined && exampleText !== undefined) {
        for (const msg of checkLetterTexts(info, { name: nameText, sound: soundText, example: exampleText })) push("concepts", msg);
      }
      if (show.letterConcept.letterNameKey === show.letterConcept.phonemeCueKey) {
        push("concepts", "letterConcept uses one key for both the name and the sound; keep them apart");
      }
    }
  }

  // 5. Optional recorded-audio requirement.
  if (opts.requireAudio) {
    const audio = opts.audio;
    if (!audio) {
      push("audio", "requireAudio is set but no audio manifest was given");
    } else {
      const missing = new Set<string>();
      const beds = new Set<string>();
      for (const seg of show.segments) {
        if (seg.music !== undefined && seg.music !== null) beds.add(seg.music);
      }
      for (const line of allShowSpokenLines) {
        if (line.speaker !== "sheru" && audio.lines[line.key] === undefined) missing.add(`line ${line.key}`);
      }
      for (const action of allShowActions) {
        if (action.do === "sfx" && audio.sfx[action.sound] === undefined) missing.add(`sound effect ${action.sound}`);
        if (action.do === "song" && audio.songs[action.song] === undefined) missing.add(`song ${action.song}`);
        if (action.do === "music" && action.bed !== null) beds.add(action.bed);
      }
      for (const bed of MUSIC_BED_IDS) if (beds.has(bed) && audio.beds[bed] === undefined) missing.add(`music bed ${bed}`);
      for (const item of missing) push("audio", `no recorded audio for ${item}`);
    }
  }

  return issues;
}

/** Convenience wrapper returning deduplicated plain error strings from `validateShow`. */
export function validateShowMessages(show: ShowSpec, locale: LocalePack, opts: ValidateShowOptions = {}): string[] {
  return [...new Set(validateShow(show, locale, opts).map((issue) => issue.message))];
}
