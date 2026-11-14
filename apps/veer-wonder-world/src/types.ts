// Wonder World: app-owned content and runtime contracts.
//
// Every module in this app's src/ agrees on these types. They are
// application types, not Aura3D API. Content files describe stories as data
// (beats, lines, stage actions); the runtime turns that data into scene
// changes, narration and touch targets. No child data appears anywhere here.

/** The recurring Wonder World cast (generated/verified via src/characters/sheets/*.json). */
export type CharacterId = "momo" | "lulu" | "sheru" | "gogo" | "lumi" | "peeko" | "tiko";

/** Who a line belongs to. `narrator` is the off-screen storyteller voice. */
export type SpeakerId = CharacterId | "narrator" | "robot";

/** The eight places on the toy island (six daytime + two circadian bedtime worlds). */
export type WorldId =
  | "meadow"
  | "music-garden"
  | "peekaboo-barn"
  | "station"
  | "learning-cloud"
  | "home-nook"
  | "moonlit-nursery"
  | "starlight-cloud";

/**
 * Generated model keys (see tools/wonder-assets.json and src/aura-assets.ts).
 * `bubble` is procedural (a soft transparent sphere drawn by the scene layer).
 */
export type PropAssetId =
  | "gogoCarriage" | "teddy" | "robot" | "cow" | "sheep" | "duck" | "horse" | "bird" | "butterfly"
  | "ball" | "bubbleWand" | "bubble" | "cookie" | "plate" | "mirror" | "door" | "letterB" | "letterA"
  | "apple" | "banana" | "cake" | "drum" | "shaker" | "toyPiano" | "picnicBasket" | "car" | "sponge"
  | "towel" | "toyBlock" | "lift" | "flower" | "flowerBud" | "tree" | "bush" | "barn" | "station"
  | "tunnel" | "house" | "bed" | "sink" | "table" | "chair" | "cushion" | "toyBox" | "bench"
  | "colourMachine" | "storyBox" | "pastryCircle" | "pastrySquare" | "pastryTriangle" | "hat"
  | "stompStone" | "cloud" | "balloon"
  // 2026-10-29 (07 B20): drawn from scene geometry like the other procedural props.
  | "letterBLower" | "letterALower" | "toothbrush" | "sun" | "candleFlame" | "partyHat"
  // Sleeping Baby & Bedtime procedural props:
  | "moon" | "cradle" | "cribMobile" | "musicBox" | "nightlight" | "blanket" | "sleepyCloud";

/**
 * Named positions every world defines (the scene layer maps them to
 * coordinates in front of the fixed camera). `off*` spots are outside the frame.
 */
export type SpotId =
  | "center" | "left" | "right" | "farLeft" | "farRight" | "front" | "frontLeft" | "frontRight"
  | "back" | "backLeft" | "backRight" | "high" | "highLeft" | "highRight"
  | "offLeft" | "offRight" | "offTop" | "offBelow";

/** Character gestures. Rigged characters map these to clips; others to procedural motion. */
export type Gesture =
  | "idle" | "wave" | "talk" | "point" | "happy" | "cheer" | "dance" | "hop" | "nod" | "look"
  | "sleep" | "eat" | "wake" | "sway" | "mirror" | "pickUp" | "shrug" | "wag" | "sniff" | "bark"
  | "sit" | "clap" | "stomp" | "freeze" | "peek" | "hide" | "float" | "glow" | "blink" | "bow"
  // 2026-10-29 (07 B20): the "surprised" and "waiting" states of the 02 section 2 expression sheet.
  | "surprise" | "wait"
  // Calm bedtime & lullaby gestures:
  | "yawn" | "rock" | "twinkle";

/** Things that happen to objects. */
export type ObjectAction =
  | "roll" | "pop" | "open" | "close" | "bounce" | "wobble" | "spin" | "fall" | "rise" | "glow"
  | "shrink" | "grow" | "bloom" | "wash" | "dry" | "up" | "down" | "stack" | "topple" | "eat"
  | "tint" | "shake" | "ring" | "go" | "stop";

export type MoveStyle = "walk" | "run" | "roll" | "float" | "hop" | "drive" | "fly" | "slide";

/** Fixed camera framings; no free orbit in child mode. */
export type CameraPresetId = "wide" | "medium" | "close" | "left" | "right" | "high";

/** Sound effect ids (see src/content/sfx.ts for the asset each maps to). */
export type SfxId =
  | "woof" | "pop" | "bubbleBlow" | "doorOpen" | "doorbell" | "moo" | "baa" | "quack" | "neigh"
  | "tweet" | "whistle" | "chugga" | "drum" | "shaker" | "pianoUp" | "pianoDown" | "splash"
  | "squeak" | "ding" | "clack" | "tumble" | "munch" | "yawn" | "giggle" | "whoosh" | "sparkle"
  | "clap" | "stomp" | "boing" | "tada" | "rumble" | "blow" | "beep" | "rustle"
  // 2026-10-29 (07 B20): Sheru's bark bank (02 section 2: 8-15 non-speaking reactions, with "woof").
  | "woofSoft" | "woofDouble" | "yip" | "arf" | "pant" | "sniffs" | "huff" | "aroo";

/** Song ids (see src/content/songs.ts). */
export type SongId =
  | "hello" | "allDone" | "ballRolls" | "goStop" | "faceSong" | "peekaboo" | "animalBand"
  | "countToThree" | "bubbleSong" | "birthday" | "colours" | "shapes" | "trainSong" | "routine"
  | "abc" | "lullaby"
  | "twinkleRest" | "rockingCradle" | "sleepyClouds" | "teddyGoodnight" | "countingSheepSong"
  | "warmBlanketSong" | "cricketHush" | "dreamBoatSong" | "moonMusicBox" | "starlightHum"
  | "wonderTheme" | "wonderThemeShort";

/** Background music beds (instrumental, quiet). */
export type MusicBedId =
  | "meadowBed"
  | "gardenBed"
  | "barnBed"
  | "stationBed"
  | "cloudBed"
  | "homeBed"
  | "nurseryBed"
  | "starlightBed";

/** A spoken line: content refers to it by key; text lives in the locale pack. */
export interface LineRef {
  readonly speaker: SpeakerId;
  /** Globally unique, e.g. `e17.hook.1`. The locale pack maps it to text. */
  readonly key: string;
}

/** One instruction to the stage. Applied in order at the start of a step. */
export type StageAction =
  | { readonly do: "enter"; readonly actor: string; readonly at: SpotId; readonly from?: SpotId; readonly style?: MoveStyle }
  | { readonly do: "exit"; readonly actor: string; readonly to: SpotId; readonly style?: MoveStyle }
  | { readonly do: "move"; readonly actor: string; readonly to: SpotId; readonly style?: MoveStyle }
  | { readonly do: "gesture"; readonly actor: string; readonly gesture: Gesture; readonly loop?: boolean }
  | { readonly do: "face"; readonly actor: string; readonly toward: string | "viewer" }
  | { readonly do: "show"; readonly actor: string }
  | { readonly do: "hide"; readonly actor: string }
  | { readonly do: "object"; readonly target: string; readonly action: ObjectAction; readonly tint?: string }
  | { readonly do: "carry"; readonly actor: string; readonly item: string | null }
  | { readonly do: "ride"; readonly actor: string; readonly on: string | null }
  | { readonly do: "sfx"; readonly sound: SfxId }
  /**
   * Starts a song. Each lyric line starts at `songCueTimesMs(song)[i]`; at that moment every performer plays the
   * line's motion (`SONGS[song].motions[i]`) and the line's `cues` are applied. Performers default to the cast
   * characters on stage when the song starts; `[]` keeps the beat's own gestures (2026-10-29, 07 B20).
   */
  | { readonly do: "song"; readonly song: SongId; readonly performers?: readonly string[]; readonly cues?: readonly SongCue[] }
  | { readonly do: "music"; readonly bed: MusicBedId | null }
  | { readonly do: "camera"; readonly preset: CameraPresetId };

/** Stage actions applied when lyric line `line` (0-based) of the song starts (plus optional `offsetMs`). Never another `song` action. */
export interface SongCue {
  readonly line: number;
  readonly offsetMs?: number;
  readonly stage: readonly StageAction[];
}

/** What a beat waits for. Silence never fails: every wait ends on its own. */
export type BeatInput =
  | { readonly type: "none" }
  /** Tap one of the targets (or parent-confirm). Any target is a good answer. */
  | { readonly type: "tap"; readonly targets: readonly string[] }
  /** Activity round end: tap/parent-confirm plays another round; timeout goes to the outro. */
  | { readonly type: "more-or-done"; readonly targets: readonly string[] };

export type BeatKind = "greeting" | "hook" | "model" | "invite" | "event" | "repeat" | "song" | "outro";

/** Optional per-target or round-override response fields (omitted fields inherit from `beat.response`). */
export interface BeatResponse {
  readonly stage?: readonly StageAction[];
  readonly lines?: readonly LineRef[];
  readonly holdMs?: number;
}

export interface BeatSpec {
  readonly id: string;
  readonly kind: BeatKind;
  readonly camera?: CameraPresetId;
  /** Applied when the beat starts. */
  readonly stage: readonly StageAction[];
  /** Spoken in order after `stage` is applied, one speaker at a time. */
  readonly lines: readonly LineRef[];
  /** Target words this beat names while the matching object/action is visible. */
  readonly words?: readonly { readonly wordId: string; readonly objectId: string }[];
  /** Minimum time the beat holds after its lines finish (lets the action read). */
  readonly holdMs: number;
  readonly input?: BeatInput;
  /**
   * How long an invite waits for a tap before continuing by itself.
   * Default 5000 (the PRD's 4-6 s proposal). Watch mode uses the same value.
   */
  readonly waitMs?: number;
  /**
   * How long an invite beat holds its Dora-style PAUSE in `"broadcast"` mode before auto-playing `response`.
   * Defaults to `show.pauseMs` (or 2500 ms for standalone stories).
   */
  readonly pauseMs?: number;
  /** Optional locale key for the caregiver `[pause: ...]` caption cue in broadcast SRT captions. */
  readonly pauseCaptionKey?: string;
  /** Played after the wait ends, whether by tap, parent confirm or timeout. */
  readonly response?: { readonly stage: readonly StageAction[]; readonly lines: readonly LineRef[]; readonly holdMs: number };
  /**
   * Optional target-specific response overrides when `input.type === "tap" | "more-or-done"`.
   * Tapping `targetId` merges `responseByTarget[targetId]` over `response`; timeout and parentConfirm play `response`.
   */
  readonly responseByTarget?: Readonly<Partial<Record<string, BeatResponse>>>;
  /** Parent-facing coaching hint key shown during this beat. */
  readonly caregiverPromptKey?: string;
  /** Replaces `stage` when reduced motion is on (omit when `stage` is already calm). */
  readonly reducedMotionStage?: readonly StageAction[];
}

export interface CastMember {
  readonly id: CharacterId;
  readonly at: SpotId;
  readonly hidden?: boolean;
}

export interface PropPlacement {
  /** Unique within the episode; stage actions and touch targets use it. */
  readonly id: string;
  readonly asset: PropAssetId;
  readonly at: SpotId;
  readonly hidden?: boolean;
  /** CSS hex colour multiplied into the model (blocks, balloons). */
  readonly tint?: string;
  /** Height in metres the model is fitted to. */
  readonly size?: number;
}

export type Phase = "P1" | "P2";

export type SleepCategory = "bedtime";

export interface StoryCommon {
  readonly id: string;
  readonly version: number;
  readonly phase: Phase;
  readonly sleepCategory?: SleepCategory;
  readonly titleKey: string;
  readonly world: WorldId;
  readonly cast: readonly CastMember[];
  readonly props: readonly PropPlacement[];
  /** 1-3 core words (counting and animal-sound clusters may list up to 4). */
  readonly targetWords: readonly string[];
  readonly supportWords: readonly string[];
  readonly music?: MusicBedId;
  readonly offlinePlayKey: string;
  readonly caregiverBridgeKey: string;
  readonly letterConcept?: { readonly letter: string; readonly letterNameKey: string; readonly phonemeCueKey: string; readonly exampleWordKey: string };
  readonly numberConcept?: { readonly countMin: 1; readonly countMax: 3; readonly countedObjectIds: readonly string[] };
  readonly review: { readonly language: "approved"; readonly rights: "approved"; readonly reviewer: string; readonly date: string };
}

export interface EpisodeSpec extends StoryCommon {
  readonly kind: "episode";
  /** Number in the canonical list: 1-20. */
  readonly number: number;
  readonly host: CharacterId;
  readonly beats: readonly BeatSpec[];
  /** Planned length, 120-240 s. Checked against summed beat timing. */
  readonly estimatedDurationSec: number;
}

/** Per-beat round override inside `ActivitySpec.roundVariants`. */
export interface RoundBeatOverride {
  readonly stage?: readonly StageAction[];
  readonly reducedMotionStage?: readonly StageAction[];
  readonly lines?: readonly LineRef[];
  readonly response?: { readonly stage: readonly StageAction[]; readonly lines: readonly LineRef[]; readonly holdMs: number };
  readonly responseByTarget?: Readonly<Partial<Record<string, BeatResponse>>>;
}

/** Optional per-round (Rounds 1..N) setup and beat overrides so repeated rounds feel fresh. */
export interface RoundVariantSpec {
  /** Stage setup prepended to the first beat of this round (same actors visible in reduced motion). */
  readonly setupStage?: readonly StageAction[];
  /** Optional calm setup variant for reduced motion (omit when `setupStage` is already calm). */
  readonly reducedMotionSetupStage?: readonly StageAction[];
  /** Per-beat overrides keyed by `BeatSpec.id`. */
  readonly beatOverrides?: Readonly<Partial<Record<string, RoundBeatOverride>>>;
}

export interface ActivitySpec extends StoryCommon {
  readonly kind: "activity";
  /** Number in the canonical list: 1-12. */
  readonly number: number;
  readonly host: CharacterId;
  readonly intro: readonly BeatSpec[];
  /** Played once per round. The last beat should end with `more-or-done`. */
  readonly round: readonly BeatSpec[];
  readonly roundLimit: number;
  /** Optional progressive variants indexed by `round - 1` (0, 1, 2). */
  readonly roundVariants?: readonly RoundVariantSpec[];
  readonly outro: readonly BeatSpec[];
  readonly options: { readonly allowTap: true; readonly dragAlternative: "tap"; readonly microphoneRequired: false };
}

export type StorySpec = EpisodeSpec | ActivitySpec;

/** Developmental age bands for multi-segment broadcast episodes (PRD 09 C.1). */
export type AgeBand = "little" | "toddler" | "preschool";

export type ShowAspect = "16:9" | "9:16";

export type SegmentTemplateId =
  | "coldOpen"
  | "theme"
  | "arrival"
  | "wordGame"
  | "songBreak"
  | "surprise"
  | "tryAtHome"
  | "goodbye"
  | "shortMoment";

export type SegmentTransition = "none" | "cut" | "train" | "fade";

export interface ShowChapterSpec {
  readonly segmentId: string;
  readonly titleKey: string;
  readonly atSec?: number;
}

export interface ShowSegmentSpec {
  readonly id: string;
  readonly template: SegmentTemplateId;
  readonly titleKey?: string;
  readonly world: WorldId;
  readonly music?: MusicBedId | null;
  readonly transitionIn: SegmentTransition;
  readonly then?: string;
  readonly cast: readonly CastMember[];
  readonly props: readonly PropPlacement[];
  readonly beats: readonly BeatSpec[];
}

export interface ShowYouTubeMeta {
  readonly title: string;
  readonly description: string;
  readonly thumbnailBeatId: string;
  readonly thumbnailOffsetMs?: number;
  readonly thumbnailTitle: string;
  readonly playlist?: string;
}

/** Multi-segment 10-minute broadcast episode or 9:16 Short (PRD 09 B3.3, E.3, E.9). */
export interface ShowSpec {
  readonly kind: "show";
  readonly id: string;
  readonly code: string;
  readonly version: number;
  readonly band: AgeBand;
  readonly aspect?: ShowAspect;
  readonly parentShowId?: string;
  readonly calendarWeek?: number;
  readonly sleepCategory?: SleepCategory;
  readonly titleKey: string;
  readonly host: CharacterId;
  readonly targetWords: readonly string[];
  readonly supportWords: readonly string[];
  readonly pauseMs: number;
  readonly estimatedDurationSec: number;
  readonly endCardSec?: number;
  readonly offlinePlayKey: string;
  readonly caregiverBridgeKey: string;
  readonly letterConcept?: StoryCommon["letterConcept"];
  readonly numberConcept?: StoryCommon["numberConcept"];
  readonly chapters: readonly ShowChapterSpec[];
  readonly segments: readonly ShowSegmentSpec[];
  readonly youtube?: ShowYouTubeMeta;
  readonly review: { readonly language: "approved"; readonly rights: "approved"; readonly reviewer: string; readonly date: string };
}

export type PlayableSpec = StorySpec | ShowSpec;

/** Locale pack: line key -> text, plus UI and parent strings. */
export interface LocalePack {
  readonly locale: string;
  readonly lines: Readonly<Record<string, string>>;
  readonly strings: Readonly<Record<string, string>>;
}

export type VisemeCode = "rest" | "MBP" | "AA" | "OH" | "EE" | "FV" | "WQ" | "LTH";

export interface VisemeCue {
  readonly tMs: number;
  readonly endMs: number;
  readonly dMs?: number;
  readonly viseme: VisemeCode;
  readonly openness: number;
}

/** Per-line recorded audio, generated by tools/wonder-audio and checked at build time. */
export interface AudioClipRef {
  readonly url: string;
  readonly sha256: string;
  readonly durationMs: number;
  /** Optional 20 Hz (50 ms window) Base64-encoded Uint8Array RMS syllable envelope [0..255]. */
  readonly env?: string;
  /** Optional timed viseme cues derived from ElevenLabs character-level alignment (PRD 09 B3.6). */
  readonly visemes?: readonly VisemeCue[];
}

export type PlayMode = "watch-sing" | "play-together" | "auto" | "wind-down" | "broadcast";

export type AudioEventType = "line" | "song" | "sfx" | "bed" | "duck" | "pause";

export interface AudioEventLogEntry {
  readonly t: number;
  readonly type: AudioEventType;
  readonly action: "start" | "stop";
  readonly id: string;
  readonly speaker?: SpeakerId;
  readonly durationMs?: number;
  readonly gain?: number;
}

export type SleepTimerMinutes = 0 | 5 | 10 | 15 | 20 | 30;

/** Events the episode director accepts. */
export type DirectorEvent =
  | { readonly type: "START"; readonly mode: PlayMode }
  | { readonly type: "TICK"; readonly dtMs: number }
  | { readonly type: "LINE_DONE"; readonly key: string }
  | { readonly type: "TAP"; readonly target: string }
  | { readonly type: "PARENT_CONFIRM" }
  | { readonly type: "PAUSE" }
  | { readonly type: "RESUME" }
  | { readonly type: "SKIP_BEAT" }
  | { readonly type: "ALL_DONE" }
  | { readonly type: "AUDIO_UNAVAILABLE" }
  | { readonly type: "DISPOSE" };

/** Effects the director asks the app to perform. */
export type DirectorEffect =
  | { readonly type: "stage"; readonly actions: readonly StageAction[] }
  | { readonly type: "speak"; readonly line: LineRef }
  | { readonly type: "stopSpeech" }
  | { readonly type: "targets"; readonly targets: readonly string[] | null }
  | { readonly type: "caregiver"; readonly key: string | null }
  | { readonly type: "pauseMedia" }
  | { readonly type: "resumeMedia" }
  | { readonly type: "broadcastPause"; readonly active: boolean; readonly captionKey: string | null; readonly targets: readonly string[] }
  | { readonly type: "finished"; readonly reason: "complete" | "all-done" }
  | { readonly type: "offline"; readonly key: string };

export type DirectorPhase = "idle" | "beat" | "speaking" | "holding" | "waiting" | "responding" | "paused" | "finished" | "disposed";

/** Plain-data snapshot for QA hooks and tests. */
export interface DirectorSnapshot {
  readonly storyId: string;
  readonly phase: DirectorPhase;
  readonly mode: PlayMode | null;
  readonly beatIndex: number;
  readonly beatId: string | null;
  readonly round: number;
  readonly lineIndex: number;
  readonly elapsedMs: number;
  readonly waitedMs: number;
  readonly taps: number;
  readonly finishedReason: "complete" | "all-done" | null;
}

/** What the scene layer must provide to the app. */
export interface StageAdapter {
  load(story: StorySpec, options?: { readonly nightVeil?: boolean }): Promise<void>;
  swapSegment?(story: StorySpec, transition: SegmentTransition, options?: { readonly nightVeil?: boolean }): Promise<void>;
  loadLullabyScene?(world: WorldId): Promise<void>;
  setRenderPaused?(paused: boolean): void;
  apply(actions: readonly StageAction[]): void;
  setTalking(actor: string | null): void;
  setSpeechEnergy?(energy: number | null): void;
  setSpeechViseme?(viseme: VisemeCode | null, openness?: number | null): void;
  setTargets(targets: readonly string[] | null): void;
  /** Hit test in CSS pixels relative to the canvas; returns a target id that is currently active. */
  pick(clientX: number, clientY: number): string | null;
  update(dtSeconds: number): void;
  setReducedMotion(on: boolean): void;
  dispose(): void;
}

/** The grown-up's sound-effect level (01 section 9): off, soft (half) or normal (the capped level). */
export type SfxVolume = "off" | "soft" | "normal";

/** Parent settings, stored on this device only. No child identity. */
export interface ParentSettings {
  readonly mode: PlayMode;
  readonly music: boolean;
  readonly sound: boolean;
  /** Sound effects only; voices and songs keep their level (2026-10-29, 07 B20). */
  readonly sfxVolume: SfxVolume;
  readonly captions: boolean;
  readonly reducedMotion: boolean;
  readonly highContrast: boolean;
  readonly locale: string;
  readonly waitMs: number;
  readonly wordList: readonly string[];
  readonly windDown: boolean;
  readonly sleepTimerMin: SleepTimerMinutes;
}
