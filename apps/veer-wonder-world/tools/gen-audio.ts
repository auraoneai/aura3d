// Generates every voice line, song, music bed and sound effect for Wonder World through Kiro Prism
// (ElevenLabs text-to-speech /with-timestamps, music and sound-generation). Resumable: existing files are kept.
//
//   ./node_modules/.bin/tsx tools/gen-audio.ts [--only lines|songs|beds|sfx] [--show <id>] [--locale en|pa|es|hi] [--concurrency N] [--no-prune]
//
// Output:
//   src/assets/audio/<locale>/lines/<key>.mp3
//   provenance/audio/alignments/<locale>/<key>.json  (character-level timestamps for B3.6 visemes)
//   src/assets/audio/songs/<id>.mp3
//   src/assets/audio/music/<id>.mp3
//   src/assets/audio/sfx/<id>.mp3
//   provenance/audio/<kind>.json
// Voices are read from src/characters/sheets/*.json (B3.7) plus narrator & robot.
// The API key is read from the environment and never printed. Run tools/gen-visemes.ts and tools/gen-audio-manifest.mjs afterwards.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SONGS, songLengthSec } from "../src/content/songs.js";
import { SFX } from "../src/content/sfx.js";
import { MUSIC_BEDS } from "../src/content/music.js";
import { storyBeats } from "../src/runtime/beat-runner.js";
import type { BeatSpec, LineRef, ShowSpec, SpeakerId, StorySpec } from "../src/types.js";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const PRISM = "https://prism.auraone.ai/v1/voice/elevenlabs";
const KEY = process.env.PRISM_API_KEY;
if (!KEY) throw new Error("PRISM_API_KEY is not set");

const args = process.argv.slice(2);
const argVal = (flag: string): string | null => (args.includes(flag) ? (args[args.indexOf(flag) + 1] ?? null) : null);
const only = argVal("--only");
const showFilter = argVal("--show");
const localeCode = argVal("--locale") ?? "en";
const noPrune = args.includes("--no-prune") || showFilter !== null || localeCode !== "en";
const CONC = argVal("--concurrency") ? Number(argVal("--concurrency")) : 1;
const today = new Date().toISOString().slice(0, 10);

export interface VoiceSpec {
  voiceId: string;
  name: string;
  speed: number;
  stability: number;
  similarityBoost: number;
  style: number;
}

/** Default fallback voices; character entries are overridden by src/characters/sheets/*.json when present (B3.7). */
const DEFAULT_VOICES: Record<Exclude<SpeakerId, "sheru">, VoiceSpec> = {
  narrator: { voiceId: "hpp4J3VqNfWAUOO0d1Us", name: "Bella", speed: 0.88, stability: 0.6, similarityBoost: 0.75, style: 0.15 },
  momo: { voiceId: "bIHbv24MWmeRgasZH58o", name: "Will", speed: 0.9, stability: 0.5, similarityBoost: 0.75, style: 0.3 },
  lulu: { voiceId: "FGY2WhTYpPnrIDTdsKH5", name: "Laura", speed: 0.9, stability: 0.45, similarityBoost: 0.75, style: 0.35 },
  lumi: { voiceId: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", speed: 0.88, stability: 0.6, similarityBoost: 0.75, style: 0.2 },
  peeko: { voiceId: "cgSgspJ2msm6clMCkdW9", name: "Jessica", speed: 0.92, stability: 0.45, similarityBoost: 0.75, style: 0.35 },
  gogo: { voiceId: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam", speed: 0.9, stability: 0.5, similarityBoost: 0.75, style: 0.3 },
  tiko: { voiceId: "pFZP5JQG7iQjIQuC4Bku", name: "Lily", speed: 0.86, stability: 0.68, similarityBoost: 0.78, style: 0.16 },
  robot: { voiceId: "N2lVS1w4EtoT3dr4eOWO", name: "Callum", speed: 0.88, stability: 0.55, similarityBoost: 0.75, style: 0.25 }
};

function loadVoicesFromSheets(): Record<Exclude<SpeakerId, "sheru">, VoiceSpec> {
  const out: Record<Exclude<SpeakerId, "sheru">, VoiceSpec> = { ...DEFAULT_VOICES };
  const sheetsDir = join(app, "src", "characters", "sheets");
  if (!existsSync(sheetsDir)) return out;
  for (const file of readdirSync(sheetsDir).filter((f) => f.endsWith(".json")).sort()) {
    const raw = JSON.parse(readFileSync(join(sheetsDir, file), "utf8")) as {
      id?: string;
      speaks?: boolean;
      voice?: {
        voiceId?: string;
        name?: string;
        speed?: number;
        stability?: number;
        similarityBoost?: number;
        style?: number;
      } | null;
    };
    if (!raw.id || raw.id === "sheru" || raw.speaks === false || !raw.voice?.voiceId) continue;
    const key = raw.id as Exclude<SpeakerId, "sheru">;
    if (key in out) {
      const fallback = out[key];
      out[key] = {
        voiceId: raw.voice.voiceId,
        name: raw.voice.name ?? fallback.name,
        speed: typeof raw.voice.speed === "number" ? raw.voice.speed : fallback.speed,
        stability: typeof raw.voice.stability === "number" ? raw.voice.stability : fallback.stability,
        similarityBoost: typeof raw.voice.similarityBoost === "number" ? raw.voice.similarityBoost : fallback.similarityBoost,
        style: typeof raw.voice.style === "number" ? raw.voice.style : fallback.style
      };
    }
  }
  return out;
}

export const VOICES = loadVoicesFromSheets();

interface Prov {
  file: string;
  provider: string;
  endpoint: string;
  voice?: string;
  prismKey: string;
  tier: string;
  prompt: string;
  date: string;
  processing?: string;
  alignmentFile?: string;
}

interface KeyState {
  id: string;
  tier: string;
  state: string;
  remaining: number;
}

const PAID_TIERS = new Set(["payg", "starter", "creator", "pro", "scale", "business", "growing_business", "enterprise"]);

async function fetchPoolKeys(): Promise<KeyState[]> {
  const res = await fetch("https://prism.auraone.ai/admin/voice", {
    headers: { Authorization: `Bearer ${KEY}` }
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    providers?: { provider: string; keys?: { id: string; tier?: string; state?: string; remaining?: number }[] }[];
  };
  const el = data.providers?.find((p) => p.provider === "elevenlabs");
  return (el?.keys ?? []).map((k) => ({
    id: k.id,
    tier: k.tier ?? "unknown",
    state: k.state ?? "unknown",
    remaining: typeof k.remaining === "number" ? k.remaining : 0
  }));
}

async function tiers(): Promise<Record<string, string>> {
  const keys = await fetchPoolKeys();
  const out: Record<string, string> = {};
  for (const k of keys) out[k.id] = k.tier;
  return out;
}

async function topKeyIsPaid(): Promise<boolean> {
  const keys = (await fetchPoolKeys()).filter((k) => k.state === "ok" && k.remaining > 0);
  if (keys.length === 0) return false;
  const maxRem = Math.max(...keys.map((k) => k.remaining));
  return keys.some((k) => k.remaining === maxRem && PAID_TIERS.has(k.tier));
}

const FFMPEG = existsSync("/opt/homebrew/bin/ffmpeg") ? "/opt/homebrew/bin/ffmpeg" : "ffmpeg";
const LOUDNESS: Record<string, { lufs: number; bitrate: string }> = {
  lines: { lufs: -18, bitrate: "64k" },
  sfx: { lufs: -24, bitrate: "64k" },
  songs: { lufs: -20, bitrate: "128k" },
  beds: { lufs: -28, bitrate: "128k" }
};
const SHORT_MEAN_DB: Record<string, number> = { lines: -21, sfx: -26 };

function meanVolumeOf(file: string): number {
  const r = spawnSync(FFMPEG, ["-hide_banner", "-nostats", "-i", file, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" });
  return Number(/mean_volume: ([-0-9.]+) dB/.exec(r.stderr ?? "")?.[1] ?? "NaN");
}

function normalize(raw: string, file: string, kind: string): void {
  const t = LOUDNESS[kind];
  const channels = kind === "lines" || kind === "sfx" ? "1" : "2";
  execFileSync(FFMPEG, [
    "-loglevel", "error", "-y", "-i", raw,
    "-af", `loudnorm=I=${t.lufs}:TP=-2:LRA=11`,
    "-ar", "44100", "-ac", channels, "-b:a", t.bitrate, file
  ]);
  rmSync(raw, { force: true });
  const target = SHORT_MEAN_DB[kind];
  if (target === undefined) return;
  const mean = meanVolumeOf(file);
  if (!Number.isFinite(mean) || Math.abs(mean - target) <= 3) return;
  const tmp = `${file}.gain.mp3`;
  execFileSync(FFMPEG, [
    "-loglevel", "error", "-y", "-i", file,
    "-af", `volume=${(target - mean).toFixed(1)}dB`,
    "-ac", channels, "-b:a", t.bitrate, tmp
  ]);
  renameSync(tmp, file);
}

async function postBinary(path: string, body: unknown, file: string, kind: string): Promise<string> {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const res = await fetch(`${PRISM}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const type = res.headers.get("content-type") ?? "";
    if (res.ok && type.startsWith("audio/")) {
      mkdirSync(dirname(file), { recursive: true });
      const raw = `${file}.raw.mp3`;
      writeFileSync(raw, Buffer.from(await res.arrayBuffer()));
      normalize(raw, file, kind);
      return res.headers.get("x-prism-voice-key") ?? "unknown";
    }
    const text = (await res.text()).slice(0, 200);
    console.log(`retry ${attempt} ${path} -> ${res.status} ${text}`);
    await new Promise((r) => setTimeout(r, 4000 * attempt));
  }
  throw new Error(`failed ${path} for ${file}`);
}

interface TtsTimestampResult {
  prismKey: string;
  alignment: unknown;
}

async function postTtsWithTimestamps(voiceId: string, body: unknown, file: string): Promise<TtsTimestampResult> {
  const path = `/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_64`;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const res = await fetch(`${PRISM}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const type = res.headers.get("content-type") ?? "";
    if (res.ok && type.includes("json")) {
      const payload = (await res.json()) as {
        audio_base64?: string;
        alignment?: unknown;
        normalized_alignment?: unknown;
      };
      if (typeof payload.audio_base64 === "string" && payload.audio_base64.length > 0) {
        mkdirSync(dirname(file), { recursive: true });
        const raw = `${file}.raw.mp3`;
        writeFileSync(raw, Buffer.from(payload.audio_base64, "base64"));
        normalize(raw, file, "lines");
        return {
          prismKey: res.headers.get("x-prism-voice-key") ?? "unknown",
          alignment: payload.alignment ?? payload.normalized_alignment ?? null
        };
      }
    }
    const text = (await res.text()).slice(0, 200);
    console.log(`retry ${attempt} ${path} -> ${res.status} ${text}`);
    await new Promise((r) => setTimeout(r, 4000 * attempt));
  }
  throw new Error(`failed ${path} for ${file}`);
}

function beatsLines(beats: readonly BeatSpec[]): LineRef[] {
  const out: LineRef[] = [];
  for (const b of beats) {
    out.push(...b.lines, ...(b.response?.lines ?? []));
    for (const r of Object.values(b.responseByTarget ?? {})) {
      if (r?.lines) out.push(...r.lines);
    }
  }
  return out;
}

function allStoryLines(story: StorySpec): LineRef[] {
  return beatsLines(storyBeats(story));
}

function allShowLines(show: ShowSpec): LineRef[] {
  const out: LineRef[] = [];
  for (const seg of show.segments) {
    out.push(...beatsLines(seg.beats));
  }
  return out;
}

interface Job {
  kind: "lines" | "songs" | "beds" | "sfx";
  id: string;
  ownerId: string;
  file: string;
  prompt: string;
  run: () => Promise<{ prov: Prov; alignment?: unknown }>;
}

async function main(): Promise<void> {
  const jobs: Job[] = [];
  const rel = (f: string): string => f.slice(app.length + 1);

  const needLines = !only || only === "lines";
  const { STORIES, storyCode } = needLines
    ? await import("../src/content/catalog.js")
    : { STORIES: [] as StorySpec[], storyCode: (_: StorySpec) => "" };
  const showsMod = needLines && existsSync(join(app, "src", "content", "shows", "index.ts"))
    ? await import("../src/content/shows/index.js")
    : { SHOWS: [] as readonly ShowSpec[] };
  const SHOWS: readonly ShowSpec[] = showsMod.SHOWS ?? [];

  let activeLinesTable: Readonly<Record<string, string>> = {};
  let spokenForms: Readonly<Record<string, string>> = {};
  if (needLines) {
    if (localeCode === "en") {
      const { en } = await import("../src/localization/en/index.js");
      const sf = await import("../src/localization/en/spoken-forms.js");
      activeLinesTable = en.lines;
      spokenForms = sf.SPOKEN_FORMS;
    } else if (existsSync(join(app, "src", "localization", "multilang-shows.ts"))) {
      const ml = (await import("../src/localization/multilang-shows.js")) as Record<string, unknown>;
      const packMap = (ml.MULTILANG_SHOW_PACKS ?? ml.SHOW_LOCALE_PACKS ?? {}) as Record<string, { lines?: Record<string, string> }>;
      activeLinesTable = packMap[localeCode]?.lines ?? {};
    }
  }

  const seen = new Set<string>();
  const addLineJob = (line: LineRef, ownerId: string, label: string): void => {
    if (seen.has(line.key)) return;
    seen.add(line.key);
    const caption = activeLinesTable[line.key];
    if (!caption) {
      if (localeCode !== "en") return;
      throw new Error(`no text for ${line.key} (${label})`);
    }
    if (line.speaker === "sheru") return;
    const text = localeCode === "en" ? (spokenForms[line.key] ?? caption) : caption;
    const v = VOICES[line.speaker];
    const file = join(app, "src", "assets", "audio", localeCode, "lines", `${line.key}.mp3`);
    const alignFile = join(app, "provenance", "audio", "alignments", localeCode, `${line.key}.json`);
    jobs.push({
      kind: "lines",
      id: line.key,
      ownerId,
      file,
      prompt: text,
      run: async () => {
        const res = await postTtsWithTimestamps(
          v.voiceId,
          {
            text,
            model_id: "eleven_multilingual_v2",
            voice_settings: {
              stability: v.stability,
              similarity_boost: v.similarityBoost,
              style: v.style,
              use_speaker_boost: true,
              speed: v.speed
            }
          },
          file
        );
        return {
          prov: {
            file: rel(file),
            provider: "elevenlabs",
            endpoint: "text-to-speech/eleven_multilingual_v2/with-timestamps",
            voice: `${v.name} (${v.voiceId})`,
            prismKey: res.prismKey,
            tier: "",
            prompt: text,
            date: today,
            alignmentFile: rel(alignFile)
          },
          alignment: res.alignment
        };
      }
    });
  };

  if (localeCode === "en") {
    for (const story of STORIES) {
      for (const line of allStoryLines(story)) {
        addLineJob(line, story.id, storyCode(story));
      }
    }
  }
  for (const show of SHOWS) {
    for (const line of allShowLines(show)) {
      addLineJob(line, show.id, show.code);
    }
  }

  if (localeCode === "en") {
    for (const [id, s] of Object.entries(SONGS)) {
      const file = join(app, "src", "assets", "audio", "songs", `${id}.mp3`);
      const lyrics = s.lyrics.join(" / ");
      const prompt =
        s.vocal === "sung" && s.lyrics.length > 0
          ? `${s.style}. Original children's song. Sing these exact lyrics slowly and clearly, one phrase at a time: ${lyrics}`
          : `${s.style}. Gentle soothing baby lullaby, original melody, slow steady ${s.bpm} bpm. Instrumental only, no vocals.`;
      const seconds = songLengthSec(s);
      jobs.push({
        kind: "songs",
        id,
        ownerId: id,
        file,
        prompt,
        run: async () => {
          const k = await postBinary(
            `/v1/music?output_format=mp3_44100_128`,
            { prompt: prompt.slice(0, 2000), music_length_ms: seconds * 1000 },
            file,
            "songs"
          );
          return {
            prov: {
              file: rel(file),
              provider: "elevenlabs",
              endpoint: "music",
              prismKey: k,
              tier: "",
              prompt,
              date: today
            }
          };
        }
      });
    }
    for (const [id, b] of Object.entries(MUSIC_BEDS)) {
      const file = join(app, "src", "assets", "audio", "music", `${id}.mp3`);
      jobs.push({
        kind: "beds",
        id,
        ownerId: id,
        file,
        prompt: b.prompt,
        run: async () => {
          const k = await postBinary(
            `/v1/music?output_format=mp3_44100_128`,
            { prompt: `${b.prompt}. Instrumental only, no vocals.`, music_length_ms: Math.round(b.seconds * 1000) },
            file,
            "beds"
          );
          return {
            prov: {
              file: rel(file),
              provider: "elevenlabs",
              endpoint: "music",
              prismKey: k,
              tier: "",
              prompt: b.prompt,
              date: today
            }
          };
        }
      });
    }
    for (const [id, s] of Object.entries(SFX)) {
      const file = join(app, "src", "assets", "audio", "sfx", `${id}.mp3`);
      jobs.push({
        kind: "sfx",
        id,
        ownerId: id,
        file,
        prompt: s.prompt,
        run: async () => {
          const k = await postBinary(
            `/v1/sound-generation?output_format=mp3_44100_64`,
            { text: s.prompt, duration_seconds: Math.max(0.5, Math.min(22, s.durationSec)), prompt_influence: 0.5 },
            file,
            "sfx"
          );
          return {
            prov: {
              file: rel(file),
              provider: "elevenlabs",
              endpoint: "sound-generation",
              prismKey: k,
              tier: "",
              prompt: s.prompt,
              date: today
            }
          };
        }
      });
    }
  }

  const lineProvKey = localeCode === "en" ? "lines" : `lines-${localeCode}`;
  const provPath = (kind: string): string =>
    join(app, "provenance", "audio", `${kind === "lines" ? lineProvKey : kind}.json`);
  const prov: Record<string, Record<string, Prov>> = {};
  for (const kind of ["lines", "songs", "beds", "sfx"]) {
    prov[kind] = existsSync(provPath(kind)) ? JSON.parse(readFileSync(provPath(kind), "utf8")) : {};
  }
  const flush = (): void => {
    mkdirSync(join(app, "provenance", "audio"), { recursive: true });
    for (const kind of Object.keys(prov)) {
      if (localeCode !== "en" && kind !== "lines") continue;
      writeFileSync(provPath(kind), JSON.stringify(prov[kind], null, 1));
    }
  };

  const kindDirs: Record<Job["kind"], string> = {
    lines: join(app, "src", "assets", "audio", localeCode, "lines"),
    songs: join(app, "src", "assets", "audio", "songs"),
    beds: join(app, "src", "assets", "audio", "music"),
    sfx: join(app, "src", "assets", "audio", "sfx")
  };

  let pruned = 0;
  if (!noPrune) {
    for (const kind of Object.keys(kindDirs) as Job["kind"][]) {
      if (only && kind !== only) continue;
      const ids = new Set(jobs.filter((j) => j.kind === kind).map((j) => j.id));
      if (existsSync(kindDirs[kind])) {
        for (const f of readdirSync(kindDirs[kind]).filter((x) => x.endsWith(".mp3"))) {
          if (!ids.has(f.slice(0, -4))) {
            rmSync(join(kindDirs[kind], f));
            pruned += 1;
          }
        }
      }
      for (const id of Object.keys(prov[kind])) if (!ids.has(id)) delete prov[kind][id];
    }
  }

  const allowedShowIds = showFilter ? new Set(showFilter.split(",").map((s) => s.trim())) : null;
  const todo = jobs.filter((j) => {
    if (only && j.kind !== only) return false;
    if (allowedShowIds && j.kind === "lines" && !allowedShowIds.has(j.ownerId)) return false;
    return !existsSync(j.file) || prov[j.kind][j.id]?.prompt !== j.prompt;
  });

  console.log(`audio jobs (${localeCode}): ${jobs.length} total, ${todo.length} to generate, ${pruned} stale files removed`);
  if (todo.length === 0) return;

  const tierOf = await tiers();
  if (Object.keys(tierOf).length === 0) throw new Error("cannot read the voice key tiers (/admin/voice); nothing generated");

  const MAX_TIER_ATTEMPTS = 48;
  const pendingSongs = todo.filter((j) => j.kind === "songs" || j.kind === "beds");
  const pendingOthers = todo.filter((j) => j.kind !== "songs" && j.kind !== "beds");

  let done = 0;
  const failed: string[] = [];

  const runOnePaidJob = async (job: Job): Promise<void> => {
    let result = await job.run();
    for (let attempt = 1; !PAID_TIERS.has(tierOf[result.prov.prismKey] ?? "unknown"); attempt += 1) {
      if (attempt >= MAX_TIER_ATTEMPTS) {
        rmSync(job.file, { force: true });
        throw new Error(`landed on a ${tierOf[result.prov.prismKey] ?? "unknown"}-tier key ${attempt} times`);
      }
      console.log(`again ${job.kind}:${job.id}: key ${result.prov.prismKey} is ${tierOf[result.prov.prismKey] ?? "unknown"} tier`);
      result = await job.run();
    }
    if (result.alignment && job.kind === "lines") {
      const alignFile = join(app, "provenance", "audio", "alignments", localeCode, `${job.id}.json`);
      mkdirSync(dirname(alignFile), { recursive: true });
      writeFileSync(alignFile, JSON.stringify(result.alignment));
    }
    prov[job.kind][job.id] = {
      ...result.prov,
      tier: tierOf[result.prov.prismKey] ?? "unknown",
      processing:
        result.prov.processing ??
        `ffmpeg loudnorm I=${LOUDNESS[job.kind].lufs} LUFS${
          SHORT_MEAN_DB[job.kind] !== undefined ? `, short-clip mean-volume correction to ${SHORT_MEAN_DB[job.kind]} dB` : ""
        }, ${LOUDNESS[job.kind].bitrate}`
    };
    done += 1;
    if (done % 10 === 0) {
      flush();
      console.log(`${done}/${todo.length}`);
    }
  };

  // Run any pending songs/beds as soon as a paid key holds top remaining slot so /v1/music never hits free keys.
  const drainReadySongs = async (): Promise<void> => {
    while (pendingSongs.length > 0 && (await topKeyIsPaid())) {
      const songJob = pendingSongs.shift()!;
      try {
        await runOnePaidJob(songJob);
      } catch (e) {
        failed.push(`${songJob.kind}:${songJob.id} ${String(e)}`);
      }
    }
  };

  await drainReadySongs();
  let nextIdx = 0;
  await Promise.all(
    Array.from({ length: CONC }, async () => {
      while (nextIdx < pendingOthers.length) {
        const job = pendingOthers[nextIdx++];
        try {
          await runOnePaidJob(job);
          if (pendingSongs.length > 0) await drainReadySongs();
        } catch (e) {
          failed.push(`${job.kind}:${job.id} ${String(e)}`);
        }
      }
    })
  );
  // If any songs remain (e.g. --only songs), run them directly.
  while (pendingSongs.length > 0) {
    const songJob = pendingSongs.shift()!;
    try {
      await runOnePaidJob(songJob);
    } catch (e) {
      failed.push(`${songJob.kind}:${songJob.id} ${String(e)}`);
    }
  }

  flush();
  console.log(`DONE generated=${done} failed=${failed.length}`);
  for (const f of failed) console.log(`FAIL ${f}`);
  if (failed.length > 0) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
