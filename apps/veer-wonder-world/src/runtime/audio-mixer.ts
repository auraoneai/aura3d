// Wonder World audio mixer (PRD 04 B06, PRD 03 section 4): the single owner of
// the app's one AudioContext.
//
// Graph (linear gains):
//
//   each sound: source -> own gain (clip level, fades) -> bus
//   voice bus 1.0 -----------------------------------------+
//   song bus  1.0 (0.25 while a voice line plays) ---------+
//   sfx bus   0.6 -----------------------------------------+-> master 0.9 -> createMasterChain
//   bed bus   0.25 (0.08 while speaking, 0 under a song) --+   (-1 dBFS limiter) -> destination
//
// Rules held here (PRD 01 safety, 02 section 5, 03 section 4, 06 QA-A01..A04, A09):
// - Exactly one AudioContext. The mixer owns one AudioContextManager. Pass
//   `gameSoundOptions()` as `createGame({ sound })` so the game's audio facade
//   reuses this context (`browserContext: false` + `createContext`; no cues are
//   registered there). Omitting `sound` also keeps one context: createGame then
//   builds no audio at all. Ducking lives here, so GameAudio.setDialogueActive
//   and setBusVolume are not used. A createCueBank, if one is ever added, takes
//   `{ manager: mixer.manager }`; its dispose() closes the shared context (so
//   does GameAudio's, on a non-persisted pagehide), so dispose it at teardown only.
// - Nothing is audible before `unlock()`, which must be called from a real user
//   gesture (click/touchend/keydown on "Tap to start"). This holds even where
//   the browser lets the context run by itself (autoplay allowed, or the
//   context was built early for preloading or by createGame). unlock() calls
//   context.resume() synchronously inside that gesture and resolves false when
//   audio cannot start (no Web Audio, blocked, or no answer within
//   AUDIO_LIMITS.unlockTimeoutMs). The app then runs on captions; no nagging.
//   Calling unlock() again from later taps is cheap while audio runs and brings
//   it back after an OS interruption (iOS phone call, Bluetooth switch).
// - Levels: SFX bus (0.6) sits below the voice bus (1.0). Every decoded clip
//   also gets a one-time level check: voice lines are evened out, songs are
//   evened out to the same loudness as speech, and SFX and the bed are only
//   ever turned down (CLIP_LEVELS), so a loud generated bark can never come out
//   louder than speech. The bed ducks under speech and fades out under a song;
//   songs dip under speech. Two pieces of music never layer.
// - SFX are rate limited: the same id never restarts within 0.3 s, at most 3
//   play at once, and an SFX whose decode finishes late (> 0.5 s) is dropped
//   instead of playing out of sync. Repeated taps cannot build a cacophony.
// - One voice at a time: starting a voice ends any other voice, and a voice
//   request superseded by a newer one never starts. The caller's `intent` is
//   asked once the clip has loaded, so a line that was stopped, muted or paused
//   meanwhile makes no sound at all (not even a few milliseconds of onset).
// - Missing manifest entries, missing Web Audio, fetch and decode failures are
//   silent no-ops. Nothing here throws into the app.
// - `soundEnabled` is the parent's master switch: off silences the master,
//   stops SFX, songs and the bed; a voice line in progress runs to its end
//   silently so caption timing holds. `musicEnabled` covers songs and the bed.
// - pauseAll() freezes every song, bed and voice at its position (and drops
//   SFX); resumeAll() continues them from there. The context itself keeps
//   running, so an outside resume (bfcache, a later gesture) cannot make a
//   paused sound audible. Listeners registered with onPauseChange (the
//   narration player) follow the same pause.
// - Decoded clips are cached through the shared context (AudioFileManager) in
//   an LRU bounded by AUDIO_LIMITS.cacheBudgetBytes, so repeated episodes do not
//   grow memory without limit (06 section 7).
//
// Known limit: createMasterChain polls its limiter every 500 ms for the life
// of the page in real browsers (engine behaviour); create one mixer per page.
//
// Typical wiring (app shell):
//   const mixer = createAudioMixer({ manifest: AUDIO_MANIFEST, musicEnabled, soundEnabled });
//   const game = createGame({ ..., sound: mixer.gameSoundOptions() });
//   startButton.onclick = () => void mixer.unlock().then(beginStory);
//   pauseMedia -> mixer.pauseAll(); resumeMedia -> mixer.resumeAll() (call it from the parent's tap);
//   stage { do: "sfx" | "song" | "music" } -> playSfx / playSong / setBed;
//   story end or route leave -> mixer.stopAll(); app teardown -> mixer.dispose() last.
import {
  AudioContextManager,
  AudioFileManager,
  createMasterChain,
  type AudioClip,
  type AudioContextLike,
  type AudioDecodeContextLike,
  type AudioFileManagerOptions
} from "@aura3d/engine/audio";
import type { GameAudioOptions } from "@aura3d/engine";
import type { AUDIO_MANIFEST } from "../audio-manifest.js";
import { SFX, SFX_MAX_GAIN } from "../content/sfx.js";
import type { AudioClipRef, MusicBedId, SfxId, SfxVolume, SongId } from "../types.js";

export type AudioManifest = typeof AUDIO_MANIFEST;

/** Bus gains (linear). These are caps: nothing in the mixer raises a bus above them. */
export const AUDIO_LEVELS = {
  master: 0.9,
  voice: 1,
  /** Level with the voice bus: each song's own gain (CLIP_LEVELS.songTargetRms) sets how loud it sings. */
  song: 1,
  /** Song level while a voice line plays, so sung tracks never mask speech. */
  songUnderVoice: 0.25,
  sfx: 0.6,
  bed: 0.25,
  bedDucked: 0.08,
  /** The bed fades out while a song plays: two pieces of music never layer. */
  bedUnderSong: 0
} as const;

/**
 * One-time per-clip level rules (applied on the clip's own gain node).
 * Voice lines are evened out to about -18 dBFS RMS. Songs are evened out to
 * the loudness of those voice lines, within the same gain and peak limits;
 * SFX and the bed are only ever turned down. The loudest 50 ms of any SFX
 * (0.1 x SFX bus 0.6 = 0.06) stays below the average level of a normalised
 * voice line (0.125).
 */
export const CLIP_LEVELS = {
  voiceTargetRms: 0.125,
  voiceMinGain: 0.5,
  voiceMaxGain: 2,
  voicePeak: 0.9,
  /**
   * A song's gated RMS target. It is lower than the voice target because a 50 ms
   * RMS reads speech louder than a loudness meter does (its windows catch whole
   * syllables, and the pauses between them do not count), while a song's level
   * is steady. From each file's EBU R128 loudness and these gains, 0.083 plays
   * all 16 sung tracks within 0.4 dB of the average of 60 voice lines; 0.7 on
   * the song bus with no song gain had left them 4 to 6 dB below it.
   */
  songTargetRms: 0.083,
  sfxMaxWindowRms: 0.1,
  sfxMaxPeak: 0.5,
  musicMaxRms: 0.18
} as const;

/** An effect's gain from src/content/sfx.ts as a multiplier of its clip level (0-1; the loudest allowed gain is 1). */
export function sfxGainScale(id: SfxId): number {
  const gain = SFX[id]?.gain;
  if (gain === undefined || !Number.isFinite(gain) || gain <= 0) return 1;
  return Math.min(1, gain / SFX_MAX_GAIN);
}

/** The grown-up's sound-effect levels as multipliers of the SFX bus cap (never above it). */
export const SFX_VOLUME_SCALE: Readonly<Record<SfxVolume, number>> = { off: 0, soft: 0.5, normal: 1 };

export const AUDIO_LIMITS = {
  /** The same SFX id does not restart within this many seconds. */
  sfxRepeatGuardS: 0.3,
  /** At most this many SFX sound at once; extra requests are dropped. */
  sfxMaxVoices: 3,
  /** An SFX that finishes decoding later than this after its request is dropped. */
  sfxMaxLatencyS: 0.5,
  /** unlock() resolves false when the context has not started by then. */
  unlockTimeoutMs: 2000,
  /** Decoded PCM kept in the LRU clip cache. */
  cacheBudgetBytes: 64 * 1024 * 1024
} as const;

const GAIN_SMOOTH_TC_S = 0.06;
const DUCK_ATTACK_TC_S = 0.08;
/** Speech gaps shorter than this never let the music swell back up. */
const DUCK_HOLD_S = 0.35;
const DUCK_RELEASE_TC_S = 0.3;
const VOICE_FADE_S = 0.03;
const SFX_FADE_S = 0.03;
const HOLD_FADE_S = 0.03;
const RESUME_FADE_S = 0.02;
const SONG_FADE_S = 0.4;
const BED_FADE_S = 1.2;
/** A song whose decode took longer than this starts at the matching offset, so it stays on the beat. */
const SONG_SYNC_THRESHOLD_S = 0.25;
/** A song with less than this left after its late start is skipped. */
const SONG_MIN_REMAINING_S = 1;

const ANALYSIS_WINDOW_S = 0.05;
const ANALYSIS_MAX_FRAMES = 262_144;
/** 50 ms windows quieter than about -50 dBFS count as silence in the gated RMS. */
const ANALYSIS_GATE_RMS = 0.003;

/**
 * What a voice request does once its clip is ready (see AudioMixer.startVoice):
 * "play" starts it, "hold" starts it held at its beginning (the handle's
 * resume() plays it), "drop" resolves null without a sound.
 */
export type VoiceIntent = "play" | "hold" | "drop";

/** A voice line playing (or held) on the voice bus. */
export interface VoiceHandle {
  /** Decoded clip duration in milliseconds. */
  readonly durationMs: number;
  /** Playback position in milliseconds (kept while paused). */
  positionMs(): number;
  /** Holds the line at its position. */
  pause(): void;
  /** Continues from the held position (never restarts). */
  resume(): void;
  /** Ends the line for good; its onEnded callback is never called afterwards. */
  stop(): void;
}

export interface AudioMixerSnapshot {
  /** Web Audio exists and the context could be built. */
  readonly available: boolean;
  /** "locked" | "running" | "suspended" | "closed" | "unavailable". */
  readonly contextState: string;
  readonly unlocked: boolean;
  readonly paused: boolean;
  readonly soundEnabled: boolean;
  readonly musicEnabled: boolean;
  readonly ducked: boolean;
  /** Current target gains (linear). */
  readonly levels: {
    readonly master: number;
    readonly voice: number;
    readonly song: number;
    readonly sfx: number;
    readonly bed: number;
  };
  readonly bedId: MusicBedId | null;
  readonly songId: SongId | null;
  /** Voice lines playing or held (never more than one). */
  readonly voices: number;
  /** SFX sounding now. */
  readonly sfx: number;
  readonly cachedBytes: number;
}

export interface AudioMixer {
  /** The single AudioContextManager, or null when Web Audio is unavailable. */
  readonly manager: AudioContextManager | null;
  /** Pass as `createGame({ sound })` so the game shares this mixer's context. */
  gameSoundOptions(): GameAudioOptions<string>;
  /** Call only from a real user gesture. Resolves false when audio cannot start. */
  unlock(): Promise<boolean>;
  /** True once unlock() has succeeded and while the shared context is running. */
  isUnlocked(): boolean;
  /** True when a voice line could be heard now (or as soon as an unlock in progress lands). */
  canPlayVoice(): boolean;
  /**
   * Decodes (cached) and starts a voice clip, ending any other voice.
   * Resolves null when it cannot play (locked, sound off, missing, failed,
   * superseded by a newer request); the caller then uses caption timing.
   * `onEnded` fires once when the clip finishes on its own. `intent` (default
   * "play") is asked once the clip is ready: "drop" resolves null without a
   * sound, "hold" returns the voice held at its beginning.
   */
  startVoice(clip: AudioClipRef, onEnded: () => void, intent?: () => VoiceIntent): Promise<VoiceHandle | null>;
  /** Warms the decode cache (builds the context if needed). Resolves false on failure. */
  preload(clip: AudioClipRef | undefined): Promise<boolean>;
  /** Missing ids, locked audio, sound off and pause are silent no-ops. */
  playSfx(id: SfxId): void;
  /**
   * Starts a song (ending any other). Returns its duration in ms, or 0 when it
   * will not play (missing, locked, sound or music off). A no-op while paused.
   * Optional `onEnded` runs once if the song finishes playing naturally.
   */
  playSong(id: SongId, onEnded?: () => void): number;
  stopSong(): void;
  /** Smoothly scales master gain (`0..1`) for the bedtime sleep-timer fade-out without mutating parent settings. */
  setSleepGain(factor: number): void;
  sleepGain(): number;
  /** The looping background bed; null fades it out. Remembered until audio can play it. */
  setBed(id: MusicBedId | null): void;
  /** Music down while speech plays (fast attack, held slow release). */
  duck(on: boolean): void;
  setMusicEnabled(enabled: boolean): void;
  setSoundEnabled(enabled: boolean): void;
  /** The grown-up's sound-effect level: off, soft (half the capped level) or normal (the cap). Voices and songs keep theirs. */
  setSfxVolume(level: SfxVolume): void;
  /** Freezes every voice, song and bed at its position and drops SFX. */
  pauseAll(): void;
  /** Continues everything pauseAll() froze. Best called from a user gesture. */
  resumeAll(): void;
  isPaused(): boolean;
  /** Notified after pauseAll()/resumeAll() change the pause state. Returns an unsubscribe. */
  onPauseChange(listener: (paused: boolean) => void): () => void;
  /** Ends every sound and forgets the bed. Pause state and settings are kept. */
  stopAll(): void;
  /** Drops decoded clips (and forgets failed URLs so they can be retried). */
  clearCache(): void;
  snapshot(): AudioMixerSnapshot;
  /** Stops everything and closes the context. Call last, when the app goes away. */
  dispose(): void;
}

export interface AudioMixerOptions {
  readonly manifest: AudioManifest;
  readonly musicEnabled: boolean;
  readonly soundEnabled: boolean;
  /**
   * Builds the one context (test seam or custom owner). Default: the browser
   * AudioContext through AudioContextManager when Web Audio exists.
   */
  readonly createContext?: () => AudioContextLike;
  /** Fetch used by the decode cache. Default: global fetch. */
  readonly fetch?: AudioFileManagerOptions["fetch"];
  /** Timer used for the unlock deadline. Default: setTimeout. */
  readonly schedule?: (fn: () => void, ms: number) => () => void;
  /** Decoded PCM budget for the clip cache. Default AUDIO_LIMITS.cacheBudgetBytes. */
  readonly cacheBudgetBytes?: number;
  /**
   * Route voices and standalone songs through an unlocked, AirPlay-eligible
   * `<audio>` element (`AVPlayer` on Apple/WebKit) with
   * `disableRemotePlayback = false` and `x-webkit-airplay="allow"` so audio
   * reaches Apple TV during Screen Mirroring / AirPlay. `"auto"` (default)
   * enables it on Apple/WebKit DOM browsers.
   */
  readonly nativeMediaPlayback?: boolean | "auto";
}

/** Loudness facts about one decoded clip (linear, 0..1 full scale). */
export interface ClipLevels {
  readonly peak: number;
  /** RMS of the loudest 50 ms window. */
  readonly loudestWindowRms: number;
  /** RMS over the non-silent 50 ms windows. */
  readonly gatedRms: number;
}

/** One pass over the buffer (long clips are sub-sampled to a fixed budget). */
export function measureClipLevels(buffer: AudioBuffer): ClipLevels {
  const length = buffer.length;
  if (!(length > 0) || buffer.numberOfChannels <= 0) return { peak: 0, loudestWindowRms: 0, gatedRms: 0 };
  const stride = Math.max(1, Math.ceil(length / ANALYSIS_MAX_FRAMES));
  const windowFrames = Math.max(1, Math.round(buffer.sampleRate * ANALYSIS_WINDOW_S));
  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c += 1) channels.push(buffer.getChannelData(c));
  const gate = ANALYSIS_GATE_RMS * ANALYSIS_GATE_RMS;
  let peak = 0;
  let loudest = 0;
  let gatedSum = 0;
  let gatedCount = 0;
  for (let start = 0; start < length; start += windowFrames) {
    const end = Math.min(length, start + windowFrames);
    let sum = 0;
    let count = 0;
    for (const data of channels) {
      for (let i = start; i < end; i += stride) {
        const v = data[i];
        sum += v * v;
        count += 1;
        const a = v < 0 ? -v : v;
        if (a > peak) peak = a;
      }
    }
    if (count === 0) continue;
    const square = sum / count;
    if (square > loudest) loudest = square;
    if (square >= gate) {
      gatedSum += square;
      gatedCount += 1;
    }
  }
  return { peak, loudestWindowRms: Math.sqrt(loudest), gatedRms: gatedCount > 0 ? Math.sqrt(gatedSum / gatedCount) : 0 };
}

/** The gain a clip plays at on its own gain node (before its bus and the master). */
export function clipGain(levels: ClipLevels, kind: "voice" | "song" | "sfx" | "music"): number {
  if (kind === "voice" || kind === "song") {
    if (!(levels.gatedRms > 0)) return 1;
    const target = kind === "voice" ? CLIP_LEVELS.voiceTargetRms : CLIP_LEVELS.songTargetRms;
    let gain = Math.min(CLIP_LEVELS.voiceMaxGain, Math.max(CLIP_LEVELS.voiceMinGain, target / levels.gatedRms));
    if (levels.peak > 0) gain = Math.min(gain, CLIP_LEVELS.voicePeak / levels.peak);
    return gain;
  }
  if (kind === "sfx") {
    let gain = 1;
    if (levels.loudestWindowRms > CLIP_LEVELS.sfxMaxWindowRms) gain = Math.min(gain, CLIP_LEVELS.sfxMaxWindowRms / levels.loudestWindowRms);
    if (levels.peak > CLIP_LEVELS.sfxMaxPeak) gain = Math.min(gain, CLIP_LEVELS.sfxMaxPeak / levels.peak);
    return gain;
  }
  return levels.gatedRms > CLIP_LEVELS.musicMaxRms ? CLIP_LEVELS.musicMaxRms / levels.gatedRms : 1;
}

type BusId = "voice" | "song" | "sfx" | "bed";
const BUS_IDS: readonly BusId[] = ["voice", "song", "sfx", "bed"];

interface Track {
  readonly mode: "webaudio" | "native";
  readonly kind: BusId;
  readonly clip: AudioClip | null;
  readonly url: string;
  readonly durationS: number;
  readonly loop: boolean;
  /** Clip gain from the level check (times the effect's own gain for SFX). */
  readonly level: number;
  state: "playing" | "held" | "done";
  source: AudioBufferSourceNode | null;
  gain: GainNode | null;
  nativeToken: number;
  /** Context time at which position 0 played (playing Web Audio tracks). */
  startedAtS: number;
  /** Position kept while held (seconds). */
  offsetS: number;
  /** Held by the voice handle's own pause (narration pause). */
  userPaused: boolean;
  onEnded: (() => void) | null;
}

interface Graph {
  readonly context: AudioDecodeContextLike;
  readonly files: AudioFileManager;
  readonly chain: ReturnType<typeof createMasterChain>;
  readonly master: GainNode;
  readonly buses: Readonly<Record<BusId, GainNode>>;
}

const AIRPLAY_BRIDGE_KEY = Symbol.for("aura3d.airplayKeepaliveBridge");

interface AirplayKeepaliveBridge {
  acquire(): void;
  release(): void;
  play(): void;
  pause(): void;
}

interface DomBodyLike {
  appendChild?(node: unknown): unknown;
}

interface DomDocumentLike {
  createElement(tagName: string): unknown;
  readonly body?: DomBodyLike | null;
}

interface DomStyleLike {
  display: string;
  position?: string;
  left?: string;
  top?: string;
  width?: string;
  height?: string;
  opacity?: string;
  pointerEvents?: string;
}

interface DomAudioElementLike {
  loop: boolean;
  preload: string;
  muted: boolean;
  volume: number;
  controls?: boolean;
  hidden?: boolean;
  paused?: boolean;
  ended?: boolean;
  disableRemotePlayback?: boolean;
  currentTime?: number;
  readonly duration?: number;
  style?: DomStyleLike;
  src: string;
  onended?: (() => void) | null;
  onerror?: (() => void) | null;
  onpause?: (() => void) | null;
  setAttribute(name: string, value: string): void;
  removeAttribute?(name: string): void;
  addEventListener?(type: string, listener: () => void): void;
  removeEventListener?(type: string, listener: () => void): void;
  play?(): unknown;
  pause?(): void;
  load?(): void;
  remove?(): void;
}

interface ThenableLike {
  then(onFulfilled: () => void, onRejected: (reason?: unknown) => void): unknown;
  catch?(onRejected: (reason?: unknown) => void): unknown;
}

function isObjectRecord(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function isAirplayBridge(value: unknown): value is AirplayKeepaliveBridge {
  return (
    isObjectRecord(value) &&
    "acquire" in value &&
    typeof value.acquire === "function" &&
    "release" in value &&
    typeof value.release === "function" &&
    "play" in value &&
    typeof value.play === "function" &&
    "pause" in value &&
    typeof value.pause === "function"
  );
}

function isDomDocument(value: unknown): value is DomDocumentLike {
  return isObjectRecord(value) && "createElement" in value && typeof value.createElement === "function";
}

function isDomAudioElement(value: unknown): value is DomAudioElementLike {
  return isObjectRecord(value) && "setAttribute" in value && typeof value.setAttribute === "function";
}

function isThenable(value: unknown): value is ThenableLike {
  return (isObjectRecord(value) || typeof value === "function") && "then" in value && typeof value.then === "function";
}

function stringProp(obj: object, key: string): string {
  const val = Reflect.get(obj, key);
  return typeof val === "string" ? val : "";
}

function numberProp(obj: object, key: string): number {
  const val = Reflect.get(obj, key);
  return typeof val === "number" && Number.isFinite(val) ? val : 0;
}

function isAppleWebKitBrowser(): boolean {
  const nav = Reflect.get(globalThis, "navigator");
  if (!isObjectRecord(nav)) return false;
  const vendor = stringProp(nav, "vendor");
  const ua = stringProp(nav, "userAgent");
  const platform = stringProp(nav, "platform");
  const touchPoints = numberProp(nav, "maxTouchPoints");
  if (vendor === "Apple Computer, Inc.") return true;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return platform === "MacIntel" && touchPoints > 1;
}

function resolveNativeMediaPlayback(setting: boolean | "auto" | undefined): boolean {
  const doc = Reflect.get(globalThis, "document");
  if (!isDomDocument(doc)) return false;
  if (setting === true) return true;
  if (setting === false) return false;
  return isAppleWebKitBrowser();
}

function safeDurationSec(el: DomAudioElementLike | null, fallbackSec: number): number {
  if (el && typeof el.duration === "number" && Number.isFinite(el.duration) && el.duration > 0) {
    return el.duration;
  }
  return fallbackSec;
}

function safeCurrentTimeSec(el: DomAudioElementLike | null, fallbackSec: number): number {
  if (el && typeof el.currentTime === "number" && Number.isFinite(el.currentTime) && el.currentTime >= 0) {
    return el.currentTime;
  }
  return fallbackSec;
}

function buildSilentWavDataUri(): string {
  // 0.25s @ 8000 Hz, 16-bit mono PCM (all-zero digital silence, zero DC click).
  const sampleRate = 8000;
  const numSamples = 2000;
  const dataBytes = numSamples * 2;
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);
  const writeAscii = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i += 1) bytes[offset + i] = text.charCodeAt(i);
  };
  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, "data");
  view.setUint32(40, dataBytes, true);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = bytes[i];
    if (byte !== undefined) binary += String.fromCharCode(byte);
  }
  if (typeof globalThis.btoa === "function") return `data:audio/wav;base64,${globalThis.btoa(binary)}`;
  return "";
}

/** Ensures iOS/iPadOS Safari treats Web Audio as media playback (bypasses silent switch and routes over AirPlay). */
function configureBrowserAudioSession(): void {
  try {
    const nav = Reflect.get(globalThis, "navigator");
    if (!isObjectRecord(nav)) return;
    const session = Reflect.get(nav, "audioSession");
    if (!isObjectRecord(session)) return;
    if (Reflect.get(session, "type") !== "playback") {
      Reflect.set(session, "type", "playback");
    }
  } catch {
    // Ignore environments where navigator.audioSession is unavailable or read-only.
  }
}

function getSharedAirplayBridge(): AirplayKeepaliveBridge | null {
  const existing = Reflect.get(globalThis, AIRPLAY_BRIDGE_KEY);
  if (isAirplayBridge(existing)) return existing;
  const doc = Reflect.get(globalThis, "document");
  if (!isDomDocument(doc)) return null;

  let refs = 0;
  let element: DomAudioElementLike | null = null;
  let silentSrc: string | null = null;

  const ensureElement = (): DomAudioElementLike | null => {
    if (element) return element;
    const currentDoc = Reflect.get(globalThis, "document");
    if (!isDomDocument(currentDoc)) return null;
    if (silentSrc === null) silentSrc = buildSilentWavDataUri();
    if (!silentSrc) return null;
    try {
      const created = currentDoc.createElement("audio");
      if (!isDomAudioElement(created)) return null;
      created.loop = true;
      created.preload = "auto";
      created.muted = false;
      created.volume = 1;
      created.hidden = true;
      if ("disableRemotePlayback" in created) {
        created.disableRemotePlayback = true;
      }
      if (created.style) {
        created.style.display = "none";
      }
      created.setAttribute("playsinline", "");
      created.setAttribute("webkit-playsinline", "");
      created.setAttribute("x-webkit-airplay", "deny");
      created.setAttribute("aria-hidden", "true");
      created.setAttribute("data-a3d-airplay-keepalive", "true");
      if (currentDoc.body && typeof currentDoc.body.appendChild === "function") {
        currentDoc.body.appendChild(created);
      }
      created.src = silentSrc;
      element = created;
      return element;
    } catch {
      return null;
    }
  };

  const bridge: AirplayKeepaliveBridge = {
    acquire(): void {
      refs += 1;
    },
    release(): void {
      refs = Math.max(0, refs - 1);
      if (refs > 0 || !element) return;
      try {
        element.pause?.();
        element.removeAttribute?.("src");
        element.load?.();
        element.remove?.();
      } catch {
        // Ignore cleanup failures on partial DOM fakes.
      }
      element = null;
    },
    play(): void {
      const el = ensureElement();
      if (!el || typeof el.play !== "function") return;
      try {
        const res = el.play();
        if (isThenable(res)) void res.then(() => undefined, () => undefined);
      } catch {
        // Ignore play rejections when browser requires an activation gesture.
      }
    },
    pause(): void {
      if (!element || typeof element.pause !== "function") return;
      try {
        element.pause();
      } catch {
        // Ignore pause errors on partial DOM fakes.
      }
    }
  };

  Reflect.set(globalThis, AIRPLAY_BRIDGE_KEY, bridge);
  return bridge;
}

function browserAudioAvailable(): boolean {
  return typeof globalThis.AudioContext === "function";
}

function canDecode(context: AudioContextLike): context is AudioDecodeContextLike {
  return "decodeAudioData" in context && typeof context.decodeAudioData === "function";
}

function defaultSchedule(fn: () => void, ms: number): () => void {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
}

function disconnectQuietly(node: AudioNode | null): void {
  if (!node) return;
  try {
    node.disconnect();
  } catch {
    // Already disconnected.
  }
}

function clipBytes(clip: AudioClip): number {
  return Math.max(0, clip.buffer.length) * Math.max(1, clip.buffer.numberOfChannels) * 4;
}

/** The caller's intent for a ready voice; anything unexpected (or a throw) is "drop": no surprise sound. */
function askIntent(intent: (() => VoiceIntent) | undefined): VoiceIntent {
  if (!intent) return "play";
  try {
    const answer = intent();
    return answer === "play" || answer === "hold" ? answer : "drop";
  } catch {
    return "drop";
  }
}

export function createAudioMixer(options: AudioMixerOptions): AudioMixer {
  const { manifest } = options;
  const schedule = options.schedule ?? defaultSchedule;
  const cacheBudget = options.cacheBudgetBytes ?? AUDIO_LIMITS.cacheBudgetBytes;
  const useNativeMedia = resolveNativeMediaPlayback(options.nativeMediaPlayback);
  // Configure AudioSession before any AudioContext is created so iOS WebKit binds to playback from init.
  configureBrowserAudioSession();
  const managerOptions: { createContext?: () => AudioContextLike } = options.createContext
    ? { createContext: options.createContext }
    : {};
  if (useNativeMedia) {
    // Wonder World owns the single `<audio>` media element on Apple WebKit; disable the duplicate keepalive loop.
    Reflect.set(managerOptions, "airplayKeepalive", false);
  }
  const manager: AudioContextManager | null = options.createContext
    ? new AudioContextManager(managerOptions)
    : browserAudioAvailable()
      ? new AudioContextManager(managerOptions)
      : null;

  let musicEnabled = options.musicEnabled;
  let soundEnabled = options.soundEnabled;
  let sfxScale = SFX_VOLUME_SCALE.normal;
  let sleepGainFactor = 1;
  let disposed = false;
  let graph: Graph | null = null;
  let graphFailed = false;
  let unlockedOnce = false;
  let unlockAttempt: Promise<boolean> | null = null;
  let airplayBridge: AirplayKeepaliveBridge | null = null;
  let bridgeAcquired = false;
  let sawInterrupted = false;
  const abortUnlocks = new Set<() => void>();

  let foregroundEl: DomAudioElementLike | null = null;
  let foregroundSilentUri: string | null = null;
  let loadedNativeUrl = "";
  let nativeTokenCounter = 0;
  let activeNativeToken = 0;
  let nativeUnlocked = false;
  let nativeAutoResumes = 0;
  let cancelNativeRecovery: (() => void) | null = null;
  let detachWirelessListener: (() => void) | null = null;

  let paused = false;
  let pausedAtS = 0;
  let pausedTotalS = 0;
  let ducked = false;
  /** Master gain the graph is heading to (valid once the graph exists). */
  let masterLevel = 0;
  const busLevels: Record<BusId, number> = { voice: 0, song: 0, sfx: 0, bed: 0 };

  const voices = new Set<Track>();
  let voiceRequest = 0;
  const sfxTracks = new Set<Track>();
  const sfxLastAt = new Map<SfxId, number>();
  const sfxLoading = new Set<SfxId>();
  let sfxToken = 0;
  let songTrack: Track | null = null;
  let songId: SongId | null = null;
  let songToken = 0;
  let wantedBed: MusicBedId | null = null;
  let bedTrack: Track | null = null;
  let bedId: MusicBedId | null = null;
  let bedPending: MusicBedId | null = null;
  let bedToken = 0;

  const listeners = new Set<(paused: boolean) => void>();
  const clipCache = new Map<string, AudioClip>();
  /** Insertion order is LRU order (oldest first). */
  const cacheSizes = new Map<string, number>();
  let cachedBytes = 0;
  const failedUrls = new Set<string>();
  const nativeFailedUrls = new Set<string>();
  const webAudioOnlyUrls = new Set<string>();
  for (const ref of Object.values(manifest.beds)) webAudioOnlyUrls.add(ref.url);
  for (const ref of Object.values(manifest.sfx)) webAudioOnlyUrls.add(ref.url);
  const clipLevelCache = new WeakMap<AudioClip, number>();

  // ---- context and graph ----------------------------------------------------

  function ensureGraph(): Graph | null {
    if (graph || graphFailed || !manager || disposed) return graph;
    let base: AudioContextLike;
    try {
      base = manager.context;
    } catch {
      graphFailed = true;
      return null;
    }
    const context = canDecode(base) ? base : null;
    if (!context) {
      graphFailed = true;
      return null;
    }
    try {
      const chain = createMasterChain(base, base.destination, { headroom: 1 });
      const master = context.createGain();
      masterLevel = masterTarget();
      master.gain.value = masterLevel;
      master.connect(chain.input);
      const targets = busTargets();
      const bus = (id: BusId): GainNode => {
        const node = context.createGain();
        node.gain.value = targets[id];
        node.connect(master);
        busLevels[id] = targets[id];
        return node;
      };
      graph = {
        context,
        files: new AudioFileManager({
          context,
          maxDecodedBytes: cacheBudget,
          securityContext: "wonder-world-static",
          ...(options.fetch ? { fetch: options.fetch } : {})
        }),
        chain,
        master,
        buses: { voice: bus("voice"), song: bus("song"), sfx: bus("sfx"), bed: bus("bed") }
      };
      return graph;
    } catch {
      graphFailed = true;
      return null;
    }
  }

  /** The shared context runs (it may, before unlock(), where the browser allows autoplay). */
  function contextRunning(): boolean {
    return !disposed && graph !== null && manager !== null && manager.state === "running";
  }

  /** Audible: unlock() has succeeded once and either Web Audio runs or Apple WebKit native media unlocked. */
  function running(): boolean {
    return !disposed && unlockedOnce && (contextRunning() || (useNativeMedia && nativeUnlocked));
  }

  function rawClock(): number {
    return graph ? graph.context.currentTime : 0;
  }

  /** Context time with paused stretches removed. */
  function activeClock(): number {
    const now = rawClock();
    return now - pausedTotalS - (paused ? now - pausedAtS : 0);
  }

  function ensureAirplayBridge(): AirplayKeepaliveBridge | null {
    if (disposed || useNativeMedia) return null;
    if (!airplayBridge) airplayBridge = getSharedAirplayBridge();
    if (!airplayBridge) return null;
    if (!bridgeAcquired) {
      airplayBridge.acquire();
      bridgeAcquired = true;
    }
    return airplayBridge;
  }

  function syncAirplayBridge(): void {
    if (useNativeMedia) {
      airplayBridge?.pause();
      return;
    }
    if (disposed) {
      airplayBridge?.pause();
      return;
    }
    if (unlockedOnce && soundEnabled && !paused && manager !== null && manager.state === "running") {
      configureBrowserAudioSession();
      ensureAirplayBridge()?.play();
    } else {
      airplayBridge?.pause();
    }
  }

  function releaseAirplayBridge(): void {
    airplayBridge?.pause();
    if (bridgeAcquired && airplayBridge) {
      airplayBridge.release();
      bridgeAcquired = false;
    }
    airplayBridge = null;
  }

  function clearNativeRecovery(): void {
    const cancel = cancelNativeRecovery;
    cancelNativeRecovery = null;
    cancel?.();
  }

  function isTransientPlayAbort(reason: unknown): boolean {
    if (!isObjectRecord(reason) || Reflect.get(reason, "name") !== "AbortError") return false;
    if (foregroundEl && isObjectRecord(Reflect.get(foregroundEl, "error"))) return false;
    return nativeAutoResumes < 2;
  }

  function scheduleNativeRecovery(token: number, track: Track): void {
    if (
      disposed ||
      activeNativeToken !== token ||
      track.state !== "playing" ||
      paused ||
      track.userPaused ||
      nativeAutoResumes >= 2
    ) {
      return;
    }
    clearNativeRecovery();
    cancelNativeRecovery = schedule(() => {
      cancelNativeRecovery = null;
      if (
        disposed ||
        activeNativeToken !== token ||
        track.state !== "playing" ||
        paused ||
        track.userPaused ||
        !foregroundEl ||
        foregroundEl.ended === true
      ) {
        return;
      }
      nativeAutoResumes += 1;
      configureBrowserAudioSession();
      syncForegroundLevels();
      try {
        const res = foregroundEl.play?.();
        if (isThenable(res)) {
          void res.then(
            () => {
              if (!disposed) nativeUnlocked = true;
            },
            () => undefined
          );
        } else if (typeof foregroundEl.play === "function") {
          nativeUnlocked = true;
        }
      } catch {
        // Ignore transient route-switch rejections.
      }
      if (unlockedOnce && manager && manager.state !== "running" && manager.state !== "closed") {
        void manager.resume().catch(() => undefined);
      }
    }, 120);
  }

  function ensureForegroundElement(): DomAudioElementLike | null {
    if (!useNativeMedia || disposed) return null;
    if (foregroundEl) return foregroundEl;
    const doc = Reflect.get(globalThis, "document");
    if (!isDomDocument(doc)) return null;
    try {
      const created = doc.createElement("audio");
      if (!isDomAudioElement(created)) return null;
      created.loop = false;
      created.preload = "auto";
      if ("controls" in created) {
        created.controls = false;
      }
      created.muted = !soundEnabled || sleepGainFactor <= 0.01;
      try {
        created.volume = soundEnabled ? AUDIO_LEVELS.master * sleepGainFactor : 0;
      } catch {
        // volume is read-only on iOS Safari; ignore.
      }
      // Keep the media element eligible for AirPlay / Screen Mirroring (do not use display:none or hidden=true).
      created.hidden = false;
      if ("disableRemotePlayback" in created) {
        created.disableRemotePlayback = false;
      }
      if (created.style) {
        created.style.display = "block";
        created.style.position = "fixed";
        created.style.left = "-9999px";
        created.style.top = "0px";
        created.style.width = "1px";
        created.style.height = "1px";
        created.style.opacity = "0";
        created.style.pointerEvents = "none";
      }
      created.setAttribute("playsinline", "");
      created.setAttribute("webkit-playsinline", "");
      created.setAttribute("x-webkit-airplay", "allow");
      created.setAttribute("aria-hidden", "true");
      created.setAttribute("data-ww-media-player", "true");
      if (typeof created.addEventListener === "function") {
        const onWirelessChange = (): void => {
          if (disposed) return;
          configureBrowserAudioSession();
          if (isWirelessTargetActive()) {
            stopAllSfx();
          }
          syncBed();
          const current = activeNativeTrack();
          if (current && current.state === "playing" && !paused && !current.userPaused && activeNativeToken !== 0) {
            scheduleNativeRecovery(activeNativeToken, current);
          } else if (unlockedOnce && manager && manager.state !== "running" && manager.state !== "closed") {
            void manager.resume().catch(() => undefined);
          }
        };
        created.addEventListener("webkitcurrentplaybacktargetiswirelesschanged", onWirelessChange);
        detachWirelessListener = () => {
          created.removeEventListener?.("webkitcurrentplaybacktargetiswirelesschanged", onWirelessChange);
        };
      }
      if (doc.body && typeof doc.body.appendChild === "function") {
        doc.body.appendChild(created);
      }
      foregroundEl = created;
      return foregroundEl;
    } catch {
      return null;
    }
  }

  function syncForegroundLevels(): void {
    if (!foregroundEl) return;
    foregroundEl.muted = !soundEnabled || sleepGainFactor <= 0.01;
    try {
      foregroundEl.volume = soundEnabled ? Math.max(0, Math.min(1, AUDIO_LEVELS.master * sleepGainFactor)) : 0;
    } catch {
      // volume is read-only on iOS Safari; ignore.
    }
  }

  function activeNativeTrack(): Track | null {
    for (const v of voices) {
      if (v.mode === "native") return v;
    }
    if (songTrack && songTrack.mode === "native") return songTrack;
    return null;
  }

  /**
   * Unlocks the persistent `<audio>` inside the tap gesture with a local silent
   * buffer (`disableRemotePlayback = true`, `x-webkit-airplay="deny"`) so iOS
   * never tries to hand off a `data:audio/wav` URI to Apple TV; `startNativeMedia`
   * switches the element to `x-webkit-airplay="allow"` when a real `.mp3` plays.
   */
  function primeForegroundElement(): { readonly attempted: boolean; readonly pending: ThenableLike | null } {
    if (!useNativeMedia || disposed || activeNativeTrack() !== null) {
      return { attempted: false, pending: null };
    }
    const el = ensureForegroundElement();
    if (!el || typeof el.play !== "function") return { attempted: false, pending: null };
    if (nativeUnlocked) {
      return { attempted: true, pending: null };
    }
    if (foregroundSilentUri === null) foregroundSilentUri = buildSilentWavDataUri();
    if (!foregroundSilentUri) return { attempted: false, pending: null };
    clearNativeRecovery();
    nativeTokenCounter += 1;
    activeNativeToken = 0;
    el.onended = null;
    el.onerror = null;
    el.onpause = null;
    el.loop = false;
    if ("disableRemotePlayback" in el) {
      el.disableRemotePlayback = true;
    }
    el.setAttribute("x-webkit-airplay", "deny");
    syncForegroundLevels();
    loadedNativeUrl = foregroundSilentUri;
    el.src = foregroundSilentUri;
    try {
      const res = el.play();
      if (isThenable(res)) {
        void res.then(
          () => {
            if (!disposed) nativeUnlocked = true;
          },
          () => undefined
        );
        return { attempted: true, pending: res };
      }
      nativeUnlocked = true;
      return { attempted: true, pending: null };
    } catch {
      return { attempted: false, pending: null };
    }
  }

  function releaseForegroundElement(): void {
    clearNativeRecovery();
    detachWirelessListener?.();
    detachWirelessListener = null;
    const el = foregroundEl;
    foregroundEl = null;
    activeNativeToken = 0;
    loadedNativeUrl = "";
    nativeUnlocked = false;
    nativeAutoResumes = 0;
    if (!el) return;
    el.onended = null;
    el.onerror = null;
    el.onpause = null;
    try {
      el.pause?.();
      el.removeAttribute?.("src");
      el.load?.();
      el.remove?.();
    } catch {
      // Ignore cleanup errors on minimal DOM fakes.
    }
  }

  function rawContextState(): string {
    if (graph) return graph.context.state;
    return manager ? manager.state : "unavailable";
  }

  function markUnlocked(): void {
    if (disposed) return;
    unlockedOnce = true;
    configureBrowserAudioSession();
    syncAirplayBridge();
    syncBed();
  }

  const unsubscribeManagerState = manager
    ? manager.onStateChange((nextState) => {
        if (disposed) return;
        const raw = rawContextState();
        if (raw === "interrupted") {
          sawInterrupted = true;
          return;
        }
        if (sawInterrupted && raw === "suspended" && unlockedOnce) {
          sawInterrupted = false;
          configureBrowserAudioSession();
          void manager.resume().catch(() => undefined);
          return;
        }
        sawInterrupted = false;
        if (nextState === "running" && unlockedOnce) {
          configureBrowserAudioSession();
          syncAirplayBridge();
          syncBed();
        } else if (nextState === "closed") {
          airplayBridge?.pause();
        }
      })
    : null;

  // ---- levels ----------------------------------------------------------------

  function masterTarget(): number {
    return soundEnabled ? AUDIO_LEVELS.master * sleepGainFactor : 0;
  }

  function busTargets(): Record<BusId, number> {
    return {
      voice: AUDIO_LEVELS.voice,
      song: ducked ? AUDIO_LEVELS.songUnderVoice : AUDIO_LEVELS.song,
      sfx: AUDIO_LEVELS.sfx * sfxScale,
      bed: songTrack ? AUDIO_LEVELS.bedUnderSong : ducked ? AUDIO_LEVELS.bedDucked : AUDIO_LEVELS.bed
    };
  }

  function applyLevels(): void {
    syncForegroundLevels();
    const g = graph;
    if (!g) return;
    const now = g.context.currentTime;
    const targets = busTargets();
    for (const id of BUS_IDS) {
      const target = targets[id];
      const current = busLevels[id];
      if (target === current) continue;
      busLevels[id] = target;
      const param = g.buses[id].gain;
      param.cancelScheduledValues(now);
      // Down fast (speech is never masked); up after a hold, slowly (no pumping between lines).
      if (target < current) param.setTargetAtTime(target, now, DUCK_ATTACK_TC_S);
      else param.setTargetAtTime(target, now + DUCK_HOLD_S, DUCK_RELEASE_TC_S);
    }
    const master = masterTarget();
    if (master !== masterLevel) {
      masterLevel = master;
      g.master.gain.cancelScheduledValues(now);
      g.master.gain.setTargetAtTime(master, now, GAIN_SMOOTH_TC_S);
    }
  }

  function levelFor(clip: AudioClip, kind: BusId): number {
    const known = clipLevelCache.get(clip);
    if (known !== undefined) return known;
    let level = 1;
    try {
      level = clipGain(measureClipLevels(clip.buffer), kind === "bed" ? "music" : kind);
    } catch {
      level = 1;
    }
    if (!Number.isFinite(level) || level < 0) level = 1;
    clipLevelCache.set(clip, level);
    return level;
  }

  // ---- decode cache ------------------------------------------------------------

  function touchCache(url: string, clip: AudioClip): void {
    const previous = cacheSizes.get(url);
    if (previous !== undefined) {
      cacheSizes.delete(url);
      cachedBytes -= previous;
    }
    const bytes = clipBytes(clip);
    cacheSizes.set(url, bytes);
    cachedBytes += bytes;
    for (const [key, size] of cacheSizes) {
      if (cachedBytes <= cacheBudget || key === url) break;
      cacheSizes.delete(key);
      clipCache.delete(key);
      graph?.files.clear(key);
      cachedBytes -= size;
    }
  }

  function cachedClip(url: string): AudioClip | null {
    const clip = clipCache.get(url);
    if (!clip) return null;
    touchCache(url, clip);
    return clip;
  }

  async function load(ref: AudioClipRef): Promise<AudioClip | null> {
    const g = ensureGraph();
    if (!g || failedUrls.has(ref.url)) return null;
    const existing = cachedClip(ref.url);
    if (existing) return existing;
    try {
      const clip = await g.files.load(ref.url);
      if (disposed) return null;
      clipCache.set(ref.url, clip);
      touchCache(ref.url, clip);
      return clip;
    } catch {
      if (!disposed) failedUrls.add(ref.url);
      return null;
    }
  }

  // ---- tracks ------------------------------------------------------------------

  function newTrack(kind: BusId, clip: AudioClip, loop: boolean, onEnded: (() => void) | null, scale = 1): Track {
    return {
      mode: "webaudio",
      kind,
      clip,
      url: "",
      durationS: clip.duration,
      loop,
      level: levelFor(clip, kind) * scale,
      state: "held",
      source: null,
      gain: null,
      nativeToken: 0,
      startedAtS: 0,
      offsetS: 0,
      userPaused: false,
      onEnded
    };
  }

  function newNativeTrack(kind: "voice" | "song", ref: AudioClipRef, onEnded: (() => void) | null): Track {
    const durationS = ref.durationMs > 0 ? ref.durationMs / 1000 : 0;
    return {
      mode: "native",
      kind,
      clip: null,
      url: ref.url,
      durationS,
      loop: false,
      level: 1,
      state: "held",
      source: null,
      gain: null,
      nativeToken: 0,
      startedAtS: 0,
      offsetS: 0,
      userPaused: false,
      onEnded
    };
  }

  function position(track: Track): number {
    if (track.mode === "native") {
      if (track.state !== "playing") return track.offsetS;
      if (foregroundEl && track.nativeToken !== 0 && activeNativeToken === track.nativeToken) {
        const current = safeCurrentTimeSec(foregroundEl, track.offsetS);
        const dur = safeDurationSec(foregroundEl, track.durationS);
        return dur > 0 ? Math.min(dur, current) : current;
      }
      return track.offsetS;
    }
    if (track.state !== "playing" || !graph) return track.offsetS;
    const elapsed = Math.max(0, graph.context.currentTime - track.startedAtS);
    const duration = track.durationS;
    if (track.loop) return duration > 0 ? elapsed % duration : 0;
    return Math.min(duration, elapsed);
  }

  function startNativeMedia(track: Track): { readonly ok: boolean; readonly pending: ThenableLike | null } {
    const el = ensureForegroundElement();
    if (!el || typeof el.play !== "function") return { ok: false, pending: null };
    const resuming = track.nativeToken !== 0 && activeNativeToken === track.nativeToken && loadedNativeUrl === track.url;
    clearNativeRecovery();
    if (!resuming) {
      nativeAutoResumes = 0;
      nativeTokenCounter += 1;
      track.nativeToken = nativeTokenCounter;
      activeNativeToken = track.nativeToken;
      const token = track.nativeToken;
      if ("disableRemotePlayback" in el) {
        el.disableRemotePlayback = false;
      }
      el.setAttribute("x-webkit-airplay", "allow");
      el.loop = track.loop;
      el.onended = () => {
        if (activeNativeToken === token && track.state === "playing") naturalEnd(track);
      };
      el.onerror = () => {
        if (activeNativeToken === token && track.state !== "done") {
          if (track.url) nativeFailedUrls.add(track.url);
          failTrack(track);
        }
      };
      el.onpause = () => {
        if (activeNativeToken === token && track.state === "playing" && !paused && !track.userPaused && el.ended !== true) {
          scheduleNativeRecovery(token, track);
        }
      };
      if (loadedNativeUrl !== track.url) {
        loadedNativeUrl = track.url;
        el.src = track.url;
      } else {
        try {
          el.currentTime = track.offsetS;
        } catch {
          // Ignore seek errors if media is not seekable yet.
        }
      }
      if (track.offsetS > 0) {
        try {
          el.currentTime = track.offsetS;
        } catch {
          // Ignore initial seek errors before metadata.
        }
      }
    }
    syncForegroundLevels();
    track.state = "playing";
    try {
      const res = el.play();
      if (isThenable(res)) {
        void res.then(
          () => {
            if (!disposed) nativeUnlocked = true;
          },
          () => undefined
        );
        return { ok: true, pending: res };
      }
      nativeUnlocked = true;
      return { ok: true, pending: null };
    } catch {
      return { ok: false, pending: null };
    }
  }

  function startSource(track: Track, offsetS: number, fadeInS: number): boolean {
    if (track.mode === "native") {
      track.offsetS = offsetS;
      const started = startNativeMedia(track);
      if (!started.ok) return false;
      const token = track.nativeToken;
      if (started.pending) {
        void started.pending.then(
          () => {
            if (track.state !== "playing" || activeNativeToken !== token || paused || track.userPaused) {
              if (activeNativeToken === token) foregroundEl?.pause?.();
            }
          },
          (err) => {
            // Only treat rejection as a failure if we did not pause/stop/supersede the track meanwhile.
            if (!disposed && track.state === "playing" && activeNativeToken === token && !paused && !track.userPaused) {
              if (isTransientPlayAbort(err)) {
                scheduleNativeRecovery(token, track);
              } else {
                failTrack(track);
              }
            }
          }
        );
      }
      return true;
    }
    const g = graph;
    const clip = track.clip;
    if (!g || !clip) return false;
    const duration = clip.duration;
    let source: AudioBufferSourceNode | null = null;
    let gain: GainNode | null = null;
    try {
      source = g.context.createBufferSource();
      gain = g.context.createGain();
      source.buffer = clip.buffer;
      source.loop = track.loop;
      const now = g.context.currentTime;
      if (fadeInS > 0) {
        gain.gain.value = 0;
        gain.gain.setTargetAtTime(track.level, now, fadeInS / 4);
      } else {
        gain.gain.value = track.level;
      }
      source.connect(gain);
      gain.connect(g.buses[track.kind]);
      const start = track.loop
        ? duration > 0
          ? Math.max(0, offsetS) % duration
          : 0
        : Math.min(Math.max(0, offsetS), Math.max(0, duration - 0.001));
      source.start(0, start);
      const started = source;
      track.source = started;
      track.gain = gain;
      track.startedAtS = now - start;
      track.state = "playing";
      started.onended = () => {
        if (track.source === started) naturalEnd(track);
      };
      return true;
    } catch {
      disconnectQuietly(source);
      disconnectQuietly(gain);
      return false;
    }
  }

  /** Stops the node (with a short fade) without ending the track's bookkeeping. */
  function stopSource(track: Track, fadeS: number): void {
    if (track.mode === "native") {
      if (foregroundEl && track.nativeToken !== 0 && activeNativeToken === track.nativeToken) {
        clearNativeRecovery();
        if (track.state === "done") {
          activeNativeToken = 0;
          foregroundEl.onended = null;
          foregroundEl.onerror = null;
          foregroundEl.onpause = null;
        }
        try {
          foregroundEl.pause?.();
        } catch {
          // Ignore pause errors on minimal DOM fakes.
        }
      }
      return;
    }
    const source = track.source;
    const gain = track.gain;
    track.source = null;
    track.gain = null;
    if (!source) return;
    source.onended = () => {
      disconnectQuietly(source);
      disconnectQuietly(gain);
    };
    try {
      const now = rawClock();
      if (gain && fadeS > 0) {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setTargetAtTime(0, now, fadeS / 4);
      }
      source.stop(fadeS > 0 ? now + fadeS : 0);
    } catch {
      disconnectQuietly(source);
      disconnectQuietly(gain);
    }
  }

  function forget(track: Track): void {
    voices.delete(track);
    sfxTracks.delete(track);
    if (songTrack === track) {
      songTrack = null;
      songId = null;
    }
    if (bedTrack === track) {
      bedTrack = null;
      bedId = null;
    }
  }

  function naturalEnd(track: Track): void {
    if (track.mode === "native" && foregroundEl && track.nativeToken !== 0 && activeNativeToken === track.nativeToken) {
      clearNativeRecovery();
      activeNativeToken = 0;
      foregroundEl.onended = null;
      foregroundEl.onerror = null;
      foregroundEl.onpause = null;
    }
    const source = track.source;
    const gain = track.gain;
    track.source = null;
    track.gain = null;
    track.state = "done";
    disconnectQuietly(source);
    disconnectQuietly(gain);
    const wasSong = track === songTrack;
    forget(track);
    if (wasSong) applyLevels();
    const done = track.onEnded;
    track.onEnded = null;
    done?.();
  }

  /** A track that could not (re)start ends; its callback runs asynchronously. */
  function failTrack(track: Track): void {
    if (track.state === "done") return;
    if (track.mode === "native" && foregroundEl && track.nativeToken !== 0 && activeNativeToken === track.nativeToken) {
      clearNativeRecovery();
      activeNativeToken = 0;
      loadedNativeUrl = "";
      foregroundEl.onended = null;
      foregroundEl.onerror = null;
      foregroundEl.onpause = null;
      try {
        foregroundEl.pause?.();
      } catch {
        // Ignore pause errors on minimal DOM fakes.
      }
    }
    track.state = "done";
    const wasSong = track === songTrack;
    forget(track);
    if (wasSong) applyLevels();
    const done = track.onEnded;
    track.onEnded = null;
    if (done) void Promise.resolve().then(done);
  }

  function endTrack(track: Track, fadeS: number): void {
    if (track.state === "done") return;
    track.state = "done";
    track.onEnded = null;
    stopSource(track, fadeS);
    forget(track);
  }

  function hold(track: Track): void {
    if (track.state !== "playing") return;
    track.offsetS = position(track);
    track.state = "held";
    stopSource(track, HOLD_FADE_S);
  }

  function release(track: Track): void {
    if (track.state !== "held") return;
    if (!startSource(track, track.offsetS, RESUME_FADE_S)) failTrack(track);
  }

  function syncTrack(track: Track): void {
    if (!paused && !track.userPaused) release(track);
    else hold(track);
  }

  /** Starts a new track now, or holds it at `offsetS` while paused. */
  function beginTrack(track: Track, offsetS: number, fadeInS: number): boolean {
    track.offsetS = offsetS;
    if (paused || track.userPaused) {
      track.state = "held";
      return true;
    }
    return startSource(track, offsetS, fadeInS);
  }

  // ---- music ---------------------------------------------------------------------

  function stopSongInternal(): void {
    songToken += 1;
    const track = songTrack;
    if (!track) return;
    endTrack(track, SONG_FADE_S);
    applyLevels();
  }

  function isWirelessTargetActive(): boolean {
    return Boolean(foregroundEl && Reflect.get(foregroundEl, "webkitCurrentPlaybackTargetIsWireless") === true);
  }

  function bedAllowed(): boolean {
    return running() && contextRunning() && soundEnabled && musicEnabled && !isWirelessTargetActive();
  }

  function syncBed(): void {
    const want = bedAllowed() ? wantedBed : null;
    if (bedTrack && bedId === want) return;
    if (bedPending !== null && bedPending === want) return;
    if (bedTrack) endTrack(bedTrack, BED_FADE_S);
    bedToken += 1;
    bedPending = null;
    if (want === null) return;
    const ref = manifest.beds[want];
    if (!ref || failedUrls.has(ref.url)) return;
    const token = bedToken;
    bedPending = want;
    const begin = (clip: AudioClip): void => {
      if (token !== bedToken || disposed) return;
      bedPending = null;
      if (!bedAllowed() || wantedBed !== want) return;
      const track = newTrack("bed", clip, true, null);
      bedTrack = track;
      bedId = want;
      if (!beginTrack(track, 0, BED_FADE_S)) forget(track);
    };
    const cached = cachedClip(ref.url);
    if (cached) {
      begin(cached);
      return;
    }
    void load(ref).then((clip) => {
      if (clip) begin(clip);
      else if (token === bedToken) bedPending = null;
    });
  }

  // ---- SFX -------------------------------------------------------------------------

  function effectsLive(): boolean {
    return running() && contextRunning() && soundEnabled && !paused && !isWirelessTargetActive();
  }

  function stopAllSfx(): void {
    sfxToken += 1;
    for (const track of [...sfxTracks]) endTrack(track, SFX_FADE_S);
  }

  function startSfx(clip: AudioClip, id: SfxId): void {
    if (sfxTracks.size >= AUDIO_LIMITS.sfxMaxVoices) return;
    // Each effect's own gain (src/content/sfx.ts) relative to the loudest allowed one: never above the clip's cap.
    const track = newTrack("sfx", clip, false, null, sfxGainScale(id));
    sfxTracks.add(track);
    if (!startSource(track, 0, 0)) forget(track);
  }

  // ---- voice -------------------------------------------------------------------------

  function voiceHandle(track: Track): VoiceHandle {
    const durationSec =
      track.mode === "native" && track.nativeToken !== 0 && activeNativeToken === track.nativeToken
        ? safeDurationSec(foregroundEl, track.durationS)
        : track.durationS;
    return {
      durationMs: Math.round(durationSec * 1000),
      positionMs: () => Math.round(position(track) * 1000),
      pause: () => {
        if (track.state === "done") return;
        track.userPaused = true;
        syncTrack(track);
      },
      resume: () => {
        if (track.state === "done") return;
        track.userPaused = false;
        syncTrack(track);
      },
      stop: () => endTrack(track, VOICE_FADE_S)
    };
  }

  function emitPause(): void {
    for (const listener of [...listeners]) listener(paused);
  }

  async function playNativeVoice(
    ref: AudioClipRef,
    request: number,
    onEnded: () => void,
    intent?: () => VoiceIntent
  ): Promise<{ readonly handled: boolean; readonly handle: VoiceHandle | null }> {
    const wanted = askIntent(intent);
    if (wanted === "drop") return { handled: true, handle: null };
    if (songTrack && songTrack.mode === "native") {
      stopSongInternal();
    }
    for (const other of [...voices]) endTrack(other, VOICE_FADE_S);
    let awaitingStart = true;
    let endedWhileStarting = false;
    const track = newNativeTrack("voice", ref, () => {
      if (awaitingStart) {
        endedWhileStarting = true;
        return;
      }
      onEnded();
    });
    track.userPaused = wanted === "hold";
    voices.add(track);
    if (paused || track.userPaused) {
      awaitingStart = false;
      track.state = "held";
      return { handled: true, handle: voiceHandle(track) };
    }
    const started = startNativeMedia(track);
    if (!started.ok) {
      awaitingStart = false;
      track.onEnded = null;
      track.state = "done";
      forget(track);
      return { handled: false, handle: null };
    }
    const token = track.nativeToken;
    if (started.pending) {
      let playRejected = false;
      let rejectReason: unknown = null;
      try {
        await started.pending;
        if (!disposed) nativeUnlocked = true;
      } catch (err) {
        playRejected = true;
        rejectReason = err;
      }
      if (playRejected) {
        awaitingStart = false;
        // Ignore abort if paused/stopped/superseded while play() was resolving.
        if (disposed || request !== voiceRequest || (track.state === "done" && !endedWhileStarting) || activeNativeToken !== token) {
          return { handled: true, handle: null };
        }
        if (paused || track.userPaused || track.state === "held") {
          return { handled: true, handle: voiceHandle(track) };
        }
        if (track.state === "playing" && isTransientPlayAbort(rejectReason)) {
          scheduleNativeRecovery(token, track);
          return { handled: true, handle: voiceHandle(track) };
        }
        clearNativeRecovery();
        track.onEnded = null;
        track.state = "done";
        if (activeNativeToken === token) {
          activeNativeToken = 0;
          if (foregroundEl) {
            foregroundEl.onended = null;
            foregroundEl.onerror = null;
            foregroundEl.onpause = null;
          }
        }
        forget(track);
        return { handled: false, handle: null };
      }
    }
    awaitingStart = false;
    if (endedWhileStarting) {
      if (disposed || request !== voiceRequest) return { handled: true, handle: null };
      const completed = voiceHandle(track);
      void Promise.resolve().then(() => Promise.resolve().then(() => Promise.resolve().then(onEnded)));
      return { handled: true, handle: completed };
    }
    if (disposed || request !== voiceRequest || track.state === "done" || activeNativeToken !== token) {
      if (activeNativeToken === token) foregroundEl?.pause?.();
      endTrack(track, 0);
      return { handled: true, handle: null };
    }
    const recheck = askIntent(intent);
    if (recheck === "drop") {
      endTrack(track, 0);
      return { handled: true, handle: null };
    }
    if (recheck === "hold" || paused || track.userPaused) {
      track.userPaused = recheck === "hold" || track.userPaused;
      hold(track);
    }
    return { handled: true, handle: voiceHandle(track) };
  }

  function startWebAudioSong(id: SongId, ref: AudioClipRef, onEnded?: () => void): void {
    const token = songToken;
    const requestedAt = activeClock();
    const begin = (clip: AudioClip): void => {
      if (token !== songToken || disposed || !(running() && soundEnabled && musicEnabled)) return;
      const late = activeClock() - requestedAt;
      const offset = late > SONG_SYNC_THRESHOLD_S ? late : 0;
      if (offset > clip.duration - SONG_MIN_REMAINING_S) return;
      const track = newTrack("song", clip, false, onEnded ?? null);
      songTrack = track;
      songId = id;
      if (!beginTrack(track, offset, 0)) forget(track);
      applyLevels();
    };
    const cached = cachedClip(ref.url);
    if (cached) begin(cached);
    else
      void load(ref).then((clip) => {
        if (clip) begin(clip);
      });
  }

  const mixer: AudioMixer = {
    manager,

    gameSoundOptions(): GameAudioOptions<string> {
      // `browserContext: false` stops createGame from building a second
      // AudioContextManager; `createContext` lends it this mixer's context
      // (null if Web Audio cannot start). The app plays every sound through
      // this mixer, so the game registers no cues.
      const owner = manager;
      if (!owner || disposed || graphFailed) return { browserContext: false, context: null, cues: {} };
      return {
        browserContext: false,
        createContext: () => {
          if (disposed) return null;
          try {
            return owner.context;
          } catch {
            return null;
          }
        },
        cues: {}
      };
    },

    unlock(): Promise<boolean> {
      const owner = manager;
      if (disposed || !owner) return Promise.resolve(false);
      // Configure iOS AudioSession and prime the single `<audio>` element synchronously inside the gesture.
      configureBrowserAudioSession();
      const nativePrime = useNativeMedia ? primeForegroundElement() : { attempted: false, pending: null };
      if (!useNativeMedia && soundEnabled && !paused) {
        ensureAirplayBridge()?.play();
      }
      const graphOk = ensureGraph() !== null && owner.state !== "closed";
      if (!graphOk && !(useNativeMedia && nativePrime.attempted)) {
        syncAirplayBridge();
        return Promise.resolve(false);
      }
      if (graphOk && owner.state === "running") {
        markUnlocked();
        return Promise.resolve(true);
      }
      const resumed = graphOk ? owner.unlock() : Promise.reject(new Error("Web Audio unavailable"));
      resumed.then(
        () => {
          if (!disposed && owner.state === "running") markUnlocked();
        },
        () => undefined
      );
      const attempt = new Promise<boolean>((resolve) => {
        let settled = false;
        let nativeDone = !useNativeMedia || !nativePrime.pending;
        let nativeOk = useNativeMedia && nativePrime.attempted && !nativePrime.pending;
        let contextDone = !graphOk;
        let cancelTimer: () => void = () => undefined;
        const settle = (ok: boolean): void => {
          if (settled) return;
          settled = true;
          cancelTimer();
          abortUnlocks.delete(abort);
          if (nativeOk) nativeUnlocked = true;
          const unlocked = ok && (contextRunning() || (useNativeMedia && nativeUnlocked));
          if (unlocked) markUnlocked();
          else syncAirplayBridge();
          resolve(unlocked);
        };
        const maybeSettle = (): void => {
          if (contextRunning()) {
            settle(true);
            return;
          }
          if (contextDone && nativeDone) {
            settle(useNativeMedia && (nativeOk || nativeUnlocked));
          }
        };
        const abort = (): void => settle(contextRunning() || (useNativeMedia && (nativeOk || nativeUnlocked)));
        abortUnlocks.add(abort);
        cancelTimer = schedule(abort, AUDIO_LIMITS.unlockTimeoutMs);
        resumed.then(
          () => {
            contextDone = true;
            maybeSettle();
          },
          () => {
            contextDone = true;
            maybeSettle();
          }
        );
        if (nativePrime.pending) {
          void nativePrime.pending.then(
            () => {
              nativeDone = true;
              nativeOk = true;
              if (!disposed) nativeUnlocked = true;
              maybeSettle();
            },
            () => {
              nativeDone = true;
              maybeSettle();
            }
          );
        } else {
          maybeSettle();
        }
      });
      unlockAttempt = attempt;
      void attempt.then(() => {
        if (unlockAttempt === attempt) unlockAttempt = null;
      });
      return attempt;
    },

    isUnlocked: () => running(),

    canPlayVoice: () =>
      !disposed &&
      soundEnabled &&
      !paused &&
      manager !== null &&
      (!graphFailed || (useNativeMedia && nativeUnlocked)) &&
      (running() || unlockAttempt !== null),

    async startVoice(ref: AudioClipRef, onEnded: () => void, intent?: () => VoiceIntent): Promise<VoiceHandle | null> {
      if (!mixer.canPlayVoice()) return null;
      voiceRequest += 1;
      const request = voiceRequest;
      const pendingUnlock = unlockAttempt;
      if (pendingUnlock) await pendingUnlock;
      if (request !== voiceRequest || disposed || !soundEnabled || !running()) return null;
      if (useNativeMedia && !nativeFailedUrls.has(ref.url)) {
        const nativeResult = await playNativeVoice(ref, request, onEnded, intent);
        if (nativeResult.handled || request !== voiceRequest || disposed || !soundEnabled || !running()) {
          return nativeResult.handle;
        }
      }
      const clip = request === voiceRequest ? await load(ref) : null;
      if (!clip || request !== voiceRequest || disposed || !soundEnabled || !running()) return null;
      // Asked before any node exists: a line stopped or paused while its clip loaded never sounds.
      const wanted = askIntent(intent);
      if (wanted === "drop") return null;
      for (const other of [...voices]) endTrack(other, VOICE_FADE_S);
      const track = newTrack("voice", clip, false, onEnded);
      track.userPaused = wanted === "hold";
      voices.add(track);
      if (!beginTrack(track, 0, 0)) {
        forget(track);
        return null;
      }
      return voiceHandle(track);
    },

    async preload(ref: AudioClipRef | undefined): Promise<boolean> {
      if (!ref || disposed) return false;
      if (useNativeMedia && !webAudioOnlyUrls.has(ref.url)) {
        return !nativeFailedUrls.has(ref.url);
      }
      return (await load(ref)) !== null;
    },

    playSfx(id: SfxId): void {
      // Sound effects switched off by the grown-up are not even fetched.
      if (!effectsLive() || sfxScale === 0) return;
      const ref = manifest.sfx[id];
      if (!ref || failedUrls.has(ref.url)) return;
      const requestedAt = activeClock();
      const last = sfxLastAt.get(id);
      if (sfxLoading.has(id) || (last !== undefined && requestedAt - last < AUDIO_LIMITS.sfxRepeatGuardS)) return;
      sfxLastAt.set(id, requestedAt);
      const cached = cachedClip(ref.url);
      if (cached) {
        startSfx(cached, id);
        return;
      }
      const token = sfxToken;
      sfxLoading.add(id);
      void load(ref).then((clip) => {
        sfxLoading.delete(id);
        if (!clip || token !== sfxToken || !effectsLive()) return;
        if (activeClock() - requestedAt > AUDIO_LIMITS.sfxMaxLatencyS) return;
        startSfx(clip, id);
      });
    },

    playSong(id: SongId, onEnded?: () => void): number {
      // Nothing changes while paused: the held song stays held.
      if (disposed || paused) return 0;
      stopSongInternal();
      if (!(running() && soundEnabled && musicEnabled)) return 0;
      const ref = manifest.songs[id];
      if (!ref) return 0;
      if (useNativeMedia && voices.size === 0 && !nativeFailedUrls.has(ref.url)) {
        const track = newNativeTrack("song", ref, onEnded ?? null);
        songTrack = track;
        songId = id;
        const started = startNativeMedia(track);
        if (started.ok) {
          const token = track.nativeToken;
          if (started.pending) {
            void started.pending.then(
              () => {
                if (track.state !== "playing" || activeNativeToken !== token || paused || track.userPaused) {
                  if (activeNativeToken === token) foregroundEl?.pause?.();
                }
              },
              (err) => {
                if (!disposed && songTrack === track && activeNativeToken === token && track.state === "playing" && !paused) {
                  if (isTransientPlayAbort(err)) {
                    scheduleNativeRecovery(token, track);
                    return;
                  }
                  clearNativeRecovery();
                  track.onEnded = null;
                  track.state = "done";
                  activeNativeToken = 0;
                  loadedNativeUrl = "";
                  if (foregroundEl) {
                    foregroundEl.onended = null;
                    foregroundEl.onerror = null;
                    foregroundEl.onpause = null;
                  }
                  forget(track);
                  if (!failedUrls.has(ref.url)) {
                    startWebAudioSong(id, ref, onEnded);
                  }
                }
              }
            );
          }
          applyLevels();
          return ref.durationMs;
        }
        track.onEnded = null;
        track.state = "done";
        forget(track);
      }
      if (failedUrls.has(ref.url)) return 0;
      startWebAudioSong(id, ref, onEnded);
      return ref.durationMs;
    },

    stopSong: stopSongInternal,

    setSleepGain(factor: number): void {
      if (disposed) return;
      const clamped = Number.isFinite(factor) ? Math.min(1, Math.max(0, factor)) : 1;
      if (clamped === sleepGainFactor) return;
      sleepGainFactor = clamped;
      applyLevels();
    },

    sleepGain: () => sleepGainFactor,

    setBed(id: MusicBedId | null): void {
      if (disposed) return;
      wantedBed = id;
      syncBed();
    },

    duck(on: boolean): void {
      if (disposed || ducked === on) return;
      ducked = on;
      applyLevels();
    },

    setMusicEnabled(enabled: boolean): void {
      if (disposed || musicEnabled === enabled) return;
      musicEnabled = enabled;
      if (!enabled) stopSongInternal();
      syncBed();
      applyLevels();
    },

    setSfxVolume(level: SfxVolume): void {
      const scale = SFX_VOLUME_SCALE[level];
      if (disposed || scale === undefined || scale === sfxScale) return;
      sfxScale = scale;
      if (scale === 0) stopAllSfx();
      applyLevels();
    },

    setSoundEnabled(enabled: boolean): void {
      if (disposed || soundEnabled === enabled) return;
      soundEnabled = enabled;
      if (!enabled) {
        // A voice line in progress keeps running silently so caption timing holds.
        stopAllSfx();
        stopSongInternal();
      }
      syncBed();
      applyLevels();
      syncAirplayBridge();
    },

    pauseAll(): void {
      if (disposed || paused) return;
      paused = true;
      pausedAtS = rawClock();
      stopAllSfx();
      for (const track of [...voices]) hold(track);
      if (songTrack) hold(songTrack);
      if (bedTrack) hold(bedTrack);
      if (useNativeMedia && activeNativeToken === 0 && foregroundEl && loadedNativeUrl === foregroundSilentUri) {
        try {
          foregroundEl.pause?.();
        } catch {
          // Ignore pause errors on minimal DOM fakes.
        }
      }
      syncAirplayBridge();
      emitPause();
    },

    resumeAll(): void {
      if (disposed || !paused) return;
      pausedTotalS += Math.max(0, rawClock() - pausedAtS);
      paused = false;
      const owner = manager;
      const recovering = owner !== null && graph !== null && unlockedOnce && owner.state !== "running" && owner.state !== "closed";
      if (useNativeMedia && unlockedOnce && activeNativeTrack() === null) {
        primeForegroundElement();
      }
      if (recovering && owner) {
        configureBrowserAudioSession();
        if (!useNativeMedia && soundEnabled) ensureAirplayBridge()?.play();
        // After an OS interruption the context may need a nudge; this works inside a gesture.
        void owner.resume().catch(() => undefined);
      }
      for (const track of [...voices]) syncTrack(track);
      if (songTrack) syncTrack(songTrack);
      if (bedTrack) syncTrack(bedTrack);
      if (!recovering) syncAirplayBridge();
      emitPause();
    },

    isPaused: () => paused,

    onPauseChange(listener: (paused: boolean) => void): () => void {
      if (disposed) return () => undefined;
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    stopAll(): void {
      voiceRequest += 1;
      for (const track of [...voices]) endTrack(track, VOICE_FADE_S);
      stopAllSfx();
      stopSongInternal();
      wantedBed = null;
      syncBed();
    },

    clearCache(): void {
      graph?.files.clear();
      clipCache.clear();
      cacheSizes.clear();
      cachedBytes = 0;
      failedUrls.clear();
      nativeFailedUrls.clear();
    },

    snapshot(): AudioMixerSnapshot {
      const targets = graph ? busLevels : busTargets();
      return {
        available: manager !== null && !graphFailed,
        contextState: !manager || graphFailed ? "unavailable" : disposed ? "closed" : manager.state,
        unlocked: running(),
        paused,
        soundEnabled,
        musicEnabled,
        ducked,
        levels: {
          master: graph ? masterLevel : masterTarget(),
          voice: targets.voice,
          song: targets.song,
          sfx: targets.sfx,
          bed: targets.bed
        },
        bedId,
        songId,
        voices: voices.size,
        sfx: sfxTracks.size,
        cachedBytes
      };
    },

    dispose(): void {
      if (disposed) return;
      mixer.stopAll();
      for (const abort of [...abortUnlocks]) abort();
      disposed = true;
      unsubscribeManagerState?.();
      releaseAirplayBridge();
      releaseForegroundElement();
      listeners.clear();
      const g = graph;
      graph = null;
      if (g) {
        for (const id of BUS_IDS) disconnectQuietly(g.buses[id]);
        disconnectQuietly(g.master);
        g.chain.dispose();
        g.files.clear();
      }
      clipCache.clear();
      cacheSizes.clear();
      cachedBytes = 0;
      if (manager) void manager.dispose().catch(() => undefined);
    }
  };
  return mixer;
}
