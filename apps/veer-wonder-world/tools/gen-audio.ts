// Generates every voice line, song, music bed and sound effect for Wonder World through Kiro Prism
// (ElevenLabs text-to-speech, music and sound-generation). Resumable: existing files are kept.
//
//   ./node_modules/.bin/tsx tools/gen-audio.ts [--only lines|songs|beds|sfx] [--concurrency 4]
//
// Output: src/assets/audio/en/lines/<key>.mp3, src/assets/audio/songs/<id>.mp3, src/assets/audio/music/<id>.mp3,
// src/assets/audio/sfx/<id>.mp3 and provenance/audio/<kind>.json (provider, voice, Prism key id and tier, prompt, date).
// The key is read from the environment and never printed. Run tools/gen-audio-manifest.mjs afterwards.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { SONGS } from "../src/content/songs.js";
import { SFX } from "../src/content/sfx.js";
import { MUSIC_BEDS } from "../src/content/music.js";
import type { BeatSpec, LineRef, SpeakerId, StorySpec } from "../src/types.js";

const app = join(dirname(fileURLToPath(import.meta.url)), "..");
const PRISM = "https://prism.auraone.ai/v1/voice/elevenlabs";
const KEY = process.env.PRISM_API_KEY;
if (!KEY) throw new Error("PRISM_API_KEY is not set");
const args = process.argv.slice(2);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : null;
const CONC = args.includes("--concurrency") ? Number(args[args.indexOf("--concurrency") + 1]) : 4;
const today = "2026-10-29";

/** ElevenLabs premade voices (casting recorded in docs/prds/veer-wonder-world/07). */
export const VOICES: Record<Exclude<SpeakerId, "sheru">, { voiceId: string; name: string; speed: number; stability: number; style: number }> = {
  narrator: { voiceId: "hpp4J3VqNfWAUOO0d1Us", name: "Bella", speed: 0.88, stability: 0.6, style: 0.15 },
  momo: { voiceId: "bIHbv24MWmeRgasZH58o", name: "Will", speed: 0.9, stability: 0.5, style: 0.3 },
  lulu: { voiceId: "FGY2WhTYpPnrIDTdsKH5", name: "Laura", speed: 0.9, stability: 0.45, style: 0.35 },
  lumi: { voiceId: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", speed: 0.88, stability: 0.6, style: 0.2 },
  peeko: { voiceId: "cgSgspJ2msm6clMCkdW9", name: "Jessica", speed: 0.92, stability: 0.45, style: 0.35 },
  gogo: { voiceId: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam", speed: 0.9, stability: 0.5, style: 0.3 },
  robot: { voiceId: "N2lVS1w4EtoT3dr4eOWO", name: "Callum", speed: 0.88, stability: 0.55, style: 0.25 }
};

interface Prov { file: string; provider: string; endpoint: string; voice?: string; prismKey: string; tier: string; prompt: string; date: string; processing?: string }

async function tiers(): Promise<Record<string, string>> {
  const res = await fetch("https://prism.auraone.ai/admin/voice", { headers: { Authorization: `Bearer ${KEY}` } });
  const out: Record<string, string> = {};
  if (!res.ok) return out;
  const data = (await res.json()) as { providers: { provider: string; keys: { id: string; tier?: string }[] }[] };
  for (const p of data.providers) for (const k of p.keys) out[k.id] = k.tier ?? "unknown";
  return out;
}

/** Integrated loudness targets (PRD 04 D15: volume-normalized); the mixer's gain caps apply on top. */
const LOUDNESS: Record<string, { lufs: number; bitrate: string }> = { lines: { lufs: -18, bitrate: "64k" }, sfx: { lufs: -24, bitrate: "64k" }, songs: { lufs: -20, bitrate: "128k" }, beds: { lufs: -28, bitrate: "128k" } };

/** Mean volume (dB) of a file, from ffmpeg volumedetect (which reports on stderr). */
function meanVolumeOf(file: string): number {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", file, "-af", "volumedetect", "-f", "null", "-"], { encoding: "utf8" });
  return Number(/mean_volume: ([-0-9.]+) dB/.exec(r.stderr ?? "")?.[1] ?? "NaN");
}
/** Short clips: loudnorm cannot measure integrated loudness under ~3 s, so a measured mean-volume target corrects them. */
const SHORT_MEAN_DB: Record<string, number> = { lines: -21, sfx: -26 };

function normalize(raw: string, file: string, kind: string): void {
  const t = LOUDNESS[kind];
  const channels = kind === "lines" || kind === "sfx" ? "1" : "2";
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", raw, "-af", `loudnorm=I=${t.lufs}:TP=-2:LRA=11`, "-ar", "44100", "-ac", channels, "-b:a", t.bitrate, file]);
  rmSync(raw);
  const target = SHORT_MEAN_DB[kind];
  if (target === undefined) return;
  const mean = meanVolumeOf(file);
  if (!Number.isFinite(mean) || Math.abs(mean - target) <= 3) return;
  const tmp = `${file}.gain.mp3`;
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-i", file, "-af", `volume=${(target - mean).toFixed(1)}dB`, "-ac", channels, "-b:a", t.bitrate, tmp]);
  renameSync(tmp, file);
}

async function post(path: string, body: unknown, file: string, kind: string): Promise<string> {
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const res = await fetch(`${PRISM}${path}`, { method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
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
    await new Promise((r) => setTimeout(r, 8000 * attempt));
  }
  throw new Error(`failed ${path} for ${file}`);
}

function allLines(story: StorySpec): LineRef[] {
  const beats: BeatSpec[] = story.kind === "episode" ? [...story.beats] : [...story.intro, ...story.round, ...story.outro];
  return beats.flatMap((b) => [...b.lines, ...(b.response?.lines ?? [])]);
}

interface Job { kind: "lines" | "songs" | "beds" | "sfx"; id: string; file: string; prompt: string; run: () => Promise<Prov> }
const jobs: Job[] = [];
const rel = (f: string) => f.slice(app.length + 1);

// Voice lines need the full story catalog and locale; sfx, songs and beds do not, so they can be generated while
// stories are still being written.
const needLines = !only || only === "lines";
const { STORIES, storyCode } = needLines ? await import("../src/content/catalog.js") : { STORIES: [] as StorySpec[], storyCode: (_: StorySpec) => "" };
const { en } = needLines ? await import("../src/localization/en/index.js") : { en: { lines: {} as Record<string, string> } };
const seen = new Set<string>();
for (const story of STORIES) {
  for (const line of allLines(story)) {
    if (seen.has(line.key)) continue;
    seen.add(line.key);
    const text = en.lines[line.key];
    if (!text) throw new Error(`no text for ${line.key} (${storyCode(story)})`);
    if (line.speaker === "sheru") continue;
    const v = VOICES[line.speaker];
    const file = join(app, "src", "assets", "audio", "en", "lines", `${line.key}.mp3`);
    jobs.push({ kind: "lines", id: line.key, file, prompt: text, run: async () => {
      const k = await post(`/v1/text-to-speech/${v.voiceId}?output_format=mp3_44100_64`, { text, model_id: "eleven_multilingual_v2", voice_settings: { stability: v.stability, similarity_boost: 0.75, style: v.style, use_speaker_boost: true, speed: v.speed } }, file, "lines");
      return { file: rel(file), provider: "elevenlabs", endpoint: "text-to-speech/eleven_multilingual_v2", voice: `${v.name} (${v.voiceId})`, prismKey: k, tier: "", prompt: text, date: today };
    } });
  }
}
for (const [id, s] of Object.entries(SONGS)) {
  const file = join(app, "src", "assets", "audio", "songs", `${id}.mp3`);
  const lyrics = s.lyrics.join(" / ");
  const prompt = s.vocal === "sung" ? `${s.style}. Original children's song. Sing these exact lyrics slowly and clearly, one phrase at a time: ${lyrics}` : `${s.style}. Instrumental only, no vocals.`;
  const seconds = Math.min(30, Math.max(10, Math.round((s.lyrics.length * 60 * 4) / Math.max(60, s.bpm))));
  jobs.push({ kind: "songs", id, file, prompt, run: async () => {
    const k = await post(`/v1/music?output_format=mp3_44100_128`, { prompt: prompt.slice(0, 2000), music_length_ms: seconds * 1000 }, file, "songs");
    return { file: rel(file), provider: "elevenlabs", endpoint: "music", prismKey: k, tier: "", prompt, date: today };
  } });
}
for (const [id, b] of Object.entries(MUSIC_BEDS)) {
  const file = join(app, "src", "assets", "audio", "music", `${id}.mp3`);
  jobs.push({ kind: "beds", id, file, prompt: b.prompt, run: async () => {
    const k = await post(`/v1/music?output_format=mp3_44100_128`, { prompt: `${b.prompt}. Instrumental only, no vocals.`, music_length_ms: Math.round(b.seconds * 1000) }, file, "beds");
    return { file: rel(file), provider: "elevenlabs", endpoint: "music", prismKey: k, tier: "", prompt: b.prompt, date: today };
  } });
}
for (const [id, s] of Object.entries(SFX)) {
  const file = join(app, "src", "assets", "audio", "sfx", `${id}.mp3`);
  jobs.push({ kind: "sfx", id, file, prompt: s.prompt, run: async () => {
    const k = await post(`/v1/sound-generation?output_format=mp3_44100_64`, { text: s.prompt, duration_seconds: Math.max(0.5, Math.min(22, s.durationSec)), prompt_influence: 0.5 }, file, "sfx");
    return { file: rel(file), provider: "elevenlabs", endpoint: "sound-generation", prismKey: k, tier: "", prompt: s.prompt, date: today };
  } });
}

const provPath = (kind: string) => join(app, "provenance", "audio", `${kind}.json`);
const prov: Record<string, Record<string, Prov>> = {};
for (const kind of ["lines", "songs", "beds", "sfx"]) prov[kind] = existsSync(provPath(kind)) ? JSON.parse(readFileSync(provPath(kind), "utf8")) : {};
const flush = () => { mkdirSync(join(app, "provenance", "audio"), { recursive: true }); for (const kind of Object.keys(prov)) writeFileSync(provPath(kind), JSON.stringify(prov[kind], null, 1)); };
// Files whose id no longer exists in the content are removed with their record, so the manifest never ships stale audio.
const kindDirs: Record<Job["kind"], string> = { lines: join(app, "src", "assets", "audio", "en", "lines"), songs: join(app, "src", "assets", "audio", "songs"), beds: join(app, "src", "assets", "audio", "music"), sfx: join(app, "src", "assets", "audio", "sfx") };
let pruned = 0;
for (const kind of Object.keys(kindDirs) as Job["kind"][]) {
  if (only && kind !== only) continue;
  const ids = new Set(jobs.filter((j) => j.kind === kind).map((j) => j.id));
  if (existsSync(kindDirs[kind])) for (const f of readdirSync(kindDirs[kind]).filter((x) => x.endsWith(".mp3"))) {
    if (!ids.has(f.slice(0, -4))) { rmSync(join(kindDirs[kind], f)); pruned += 1; }
  }
  for (const id of Object.keys(prov[kind])) if (!ids.has(id)) delete prov[kind][id];
}
// A job runs when its file is missing or its text/prompt changed since the file was generated.
const todo = jobs.filter((j) => (!only || j.kind === only) && (!existsSync(j.file) || prov[j.kind][j.id]?.prompt !== j.prompt));
console.log(`audio jobs: ${jobs.length} total, ${todo.length} to generate, ${pruned} stale files removed`);
const tierOf = await tiers();
let next = 0, done = 0;
const failed: string[] = [];
await Promise.all(Array.from({ length: CONC }, async () => {
  while (next < todo.length) {
    const job = todo[next++];
    try {
      const p = await job.run();
      prov[job.kind][job.id] = { ...p, tier: tierOf[p.prismKey] ?? "unknown", processing: p.processing ?? `ffmpeg loudnorm I=${LOUDNESS[job.kind].lufs} LUFS${SHORT_MEAN_DB[job.kind] !== undefined ? `, short-clip mean-volume correction to ${SHORT_MEAN_DB[job.kind]} dB` : ""}, ${LOUDNESS[job.kind].bitrate}` };
      done += 1;
      if (done % 20 === 0) { flush(); console.log(`${done}/${todo.length}`); }
    } catch (e) { failed.push(`${job.kind}:${job.id} ${String(e)}`); }
  }
}));
flush();
console.log(`DONE generated=${done} failed=${failed.length}`);
for (const f of failed) console.log(`FAIL ${f}`);
