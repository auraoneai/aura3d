/**
 * build-dialogue-audio.ts — REAL synthesized dialogue audio for the Cartoon Studio
 * episode using the macOS built-in `say` TTS engine.
 *
 * HONESTY: `say` is a real, on-device text-to-speech synthesizer (this is a darwin
 * machine). The spoken bytes below are GENUINELY synthesized from the episode's
 * dialogue lines — not silence, not a placeholder tone. They ARE, however, robotic
 * "system voice" quality (placeholder-grade VO), NOT studio voice acting. We label
 * the result `voiceSource: "macos-say-tts"` so nobody mistakes it for finished VO.
 *
 * What this does, per dialogue line (read from the compiled episode dialogueTrack):
 *   1. `say -v <voice> -o line.aiff "<text>"` — a distinct voice per character
 *      (miko = a higher/youthful voice, luma = a different adult voice).
 *   2. Place each line's audio at its real dialogue `startTime` on an episode-length
 *      timeline via ffmpeg `adelay` (+ `apad` to the full episode duration).
 *   3. Mix all delayed lines together with a faint, steady (non-flashing) ambient
 *      bed underneath, producing one episode-length dialogue track.
 *
 * GRACEFUL DEGRADE: if `say` is unavailable (non-mac / CI), this returns
 * `{ available: false }` and the caller falls back to the placeholder ambient bed.
 *
 * This module is imported by `render-live.ts`; it can also be run standalone
 * (`tsx scripts/build-dialogue-audio.ts`) to (re)build just the audio track.
 */

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { episode } from "../src/episode.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_ROOT = resolve(__dirname, "..");

/** Distinct macOS `say` voices per character. Picked from `say -v '?'` (en_US):
 *  - miko: "Junior" — a younger, higher system voice (matches the hero kid robot).
 *  - luma: "Samantha" — a clearer adult system voice (the helper robot).
 * Both are standard en_US voices present on a default macOS install. */
export const DIALOGUE_VOICE_BY_SPEAKER: Record<string, string> = {
  miko: "Junior",
  luma: "Samantha"
};
const FALLBACK_VOICE = "Samantha";

export interface DialogueLineAudio {
  readonly lineId: string;
  readonly speakerId: string;
  readonly voice: string;
  readonly text: string;
  readonly startTime: number;
  readonly endTime: number;
  /** Actual synthesized clip duration (seconds), measured from the rendered file. */
  readonly spokenDuration: number;
}

export interface DialogueAudioResult {
  readonly available: boolean;
  /** Absolute path to the assembled episode-length dialogue track (WAV), if built. */
  readonly trackPath?: string;
  readonly durationSeconds: number;
  readonly sampleRate: number;
  readonly voiceSource: "macos-say-tts";
  readonly voices: Record<string, string>;
  readonly lines: DialogueLineAudio[];
  readonly note: string;
}

const SAMPLE_RATE = 48_000;

function resolveFfmpeg(): string {
  const require = createRequire(import.meta.url);
  try {
    const installer = require("@ffmpeg-installer/ffmpeg") as { path?: string };
    if (installer.path && existsSync(installer.path)) return installer.path;
  } catch {
    /* fall through */
  }
  try {
    const ffmpegStatic = require("ffmpeg-static") as string | { default?: string };
    const p = typeof ffmpegStatic === "string" ? ffmpegStatic : ffmpegStatic.default;
    if (p && existsSync(p)) return p;
  } catch {
    /* fall through */
  }
  return "ffmpeg";
}

function resolveFfprobe(): string {
  return "ffprobe";
}

/** Is the macOS `say` TTS binary usable on this host? */
export function isSayAvailable(): boolean {
  if (process.platform !== "darwin") return false;
  const probe = spawnSync("say", ["-v", "?"], { encoding: "utf8" });
  return probe.status === 0 && (probe.stdout ?? "").length > 0;
}

function probeDuration(ffprobe: string, file: string): number {
  const run = spawnSync(
    ffprobe,
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file],
    { encoding: "utf8" }
  );
  const d = Number((run.stdout ?? "").trim());
  return Number.isFinite(d) ? d : 0;
}

/**
 * Synthesize every dialogue line with `say` and assemble one episode-length WAV with
 * each line placed at its real `startTime`, plus a faint ambient bed underneath.
 * Returns `{ available: false }` (no throw) when `say` is missing so callers degrade.
 */
export function buildDialogueAudioTrack(outputDir: string): DialogueAudioResult {
  const voices = DIALOGUE_VOICE_BY_SPEAKER;
  const durationSeconds = episode.dialogueTrack.duration;
  const trackLines = episode.dialogueTrack.lines;

  if (!isSayAvailable()) {
    return {
      available: false,
      durationSeconds,
      sampleRate: SAMPLE_RATE,
      voiceSource: "macos-say-tts",
      voices,
      lines: [],
      note: "macOS `say` TTS not available on this host; caller should fall back to placeholder ambient."
    };
  }

  const ffmpeg = resolveFfmpeg();
  const ffprobe = resolveFfprobe();
  const workDir = resolve(outputDir, "dialogue-audio");
  mkdirSync(workDir, { recursive: true });

  const lineResults: DialogueLineAudio[] = [];
  const wavSegments: string[] = [];

  for (const line of trackLines) {
    const voice = voices[line.speakerId] ?? FALLBACK_VOICE;
    const aiff = resolve(workDir, `${line.lineId.replace(/[^a-zA-Z0-9_-]/g, "_")}.aiff`);
    const wav = resolve(workDir, `${line.lineId.replace(/[^a-zA-Z0-9_-]/g, "_")}.wav`);

    // 1. REAL TTS: synthesize the line to AIFF with the character's distinct voice.
    const say = spawnSync("say", ["-v", voice, "-o", aiff, line.text], { encoding: "utf8" });
    if (say.status !== 0 || !existsSync(aiff)) {
      throw new Error(`say failed for ${line.lineId} (voice=${voice}): ${(say.stderr ?? "").slice(-300)}`);
    }
    const spokenDuration = probeDuration(ffprobe, aiff);

    // 2. Normalize each clip to a stereo 48k WAV at the episode sample rate, gained up
    //    a touch so dialogue sits clearly above the ambient bed.
    const toWav = spawnSync(
      ffmpeg,
      [
        "-y",
        "-i", aiff,
        "-ar", String(SAMPLE_RATE),
        "-ac", "2",
        "-af", "volume=1.6,aformat=sample_fmts=s16:channel_layouts=stereo",
        wav
      ],
      { encoding: "utf8" }
    );
    if (toWav.status !== 0 || !existsSync(wav)) {
      throw new Error(`ffmpeg AIFF->WAV failed for ${line.lineId}: ${(toWav.stderr ?? "").slice(-300)}`);
    }

    wavSegments.push(wav);
    lineResults.push({
      lineId: line.lineId,
      speakerId: line.speakerId,
      voice,
      text: line.text,
      startTime: line.startTime,
      endTime: line.endTime,
      spokenDuration
    });
  }

  // 3. Build one episode-length mix: each line delayed to its startTime (adelay, ms),
  //    padded to the full episode duration (apad), then amix'd with a faint, STEADY
  //    ambient bed (two low sines + low pink noise, volume far below dialogue). The bed
  //    is non-tremolo so it stays reduced-flash / sensory-safe.
  const trackPath = resolve(outputDir, "episode-dialogue.wav");
  const inputs: string[] = [];
  const filterParts: string[] = [];
  const mixLabels: string[] = [];

  wavSegments.forEach((seg, i) => {
    inputs.push("-i", seg);
    const delayMs = Math.round(lineResults[i]!.startTime * 1000);
    // adelay both channels; apad to full length so amix keeps the full timeline.
    filterParts.push(
      `[${i}:a]adelay=${delayMs}|${delayMs},apad=whole_dur=${durationSeconds},aformat=sample_fmts=fltp:channel_layouts=stereo[d${i}]`
    );
    mixLabels.push(`[d${i}]`);
  });

  // Faint steady ambient bed generated inline (no extra input files).
  const bedIndex = wavSegments.length;
  filterParts.push(
    `sine=frequency=174:sample_rate=${SAMPLE_RATE}:duration=${durationSeconds}[bedA]`,
    `sine=frequency=220:sample_rate=${SAMPLE_RATE}:duration=${durationSeconds}[bedB]`,
    `anoisesrc=color=pink:sample_rate=${SAMPLE_RATE}:amplitude=0.03:duration=${durationSeconds}[bedN]`,
    `[bedA][bedB]amix=inputs=2:weights=0.6 0.4[bedTones]`,
    `[bedTones][bedN]amix=inputs=2:weights=0.85 0.15,volume=0.05,aformat=sample_fmts=fltp:channel_layouts=stereo[bed]`
  );
  mixLabels.push("[bed]");

  // Dialogue lines at full weight, ambient bed faint underneath. normalize=0 keeps
  // dialogue from being attenuated when a line overlaps the bed.
  const mixCount = mixLabels.length;
  const dialogueWeights = lineResults.map(() => "1").join(" ");
  const filter =
    filterParts.join(";") +
    `;${mixLabels.join("")}amix=inputs=${mixCount}:weights=${dialogueWeights} 0.4:normalize=0:duration=longest,` +
    `volume=1.0,aformat=sample_fmts=s16:channel_layouts=stereo[out]`;

  const assemble = spawnSync(
    ffmpeg,
    [
      "-y",
      ...inputs,
      "-filter_complex", filter,
      "-map", "[out]",
      "-ar", String(SAMPLE_RATE),
      "-t", durationSeconds.toFixed(3),
      trackPath
    ],
    { encoding: "utf8" }
  );
  if (assemble.status !== 0 || !existsSync(trackPath)) {
    throw new Error(`ffmpeg dialogue assembly failed (status=${assemble.status}): ${(assemble.stderr ?? "").slice(-600)}`);
  }

  // Clean up per-line temp files; keep the assembled track.
  rmSync(workDir, { recursive: true, force: true });

  return {
    available: true,
    trackPath,
    durationSeconds,
    sampleRate: SAMPLE_RATE,
    voiceSource: "macos-say-tts",
    voices,
    lines: lineResults,
    note:
      "REAL synthesized dialogue via macOS `say` TTS, one distinct voice per character, " +
      "each line placed at its episode dialogue startTime over a faint steady ambient bed. " +
      "Honest caveat: `say` is robotic system-voice (placeholder-grade VO), not studio voice acting."
  };
}

// Allow standalone invocation: `tsx scripts/build-dialogue-audio.ts [outDir]`.
if (import.meta.url === `file://${process.argv[1]}`) {
  const outDir = resolve(process.argv[2] ?? resolve(TEMPLATE_ROOT, "dist/episodes/live-3d"));
  mkdirSync(outDir, { recursive: true });
  const result = buildDialogueAudioTrack(outDir);
  console.log(JSON.stringify(result, null, 2));
}
