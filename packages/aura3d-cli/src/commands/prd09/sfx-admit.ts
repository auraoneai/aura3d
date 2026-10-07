/**
 * `aura3d sfx admit <dir> --pack game-sfx-core` — PRD-09 §6.9 (C-39).
 *
 * Admits a directory of source audio into `assets/packs/<pack>/`:
 *   <dir>/sources.json    — { "<file>": { "license", "sourceUrl", "author",
 *                                          "id"?, "class"?: "one-shot"|"loop"|"ambience"|"music" } }
 *   <dir>/*.ogg|wav|...   — the source files referenced by sources.json
 *
 * Per file: requires license + sourceUrl + author, measures integrated LUFS and
 * true peak with `packages/audio/src/game-sound/loudness.ts` on decoded PCM,
 * masters to the §6.9 target for its class (volume gain), transcodes to
 * Opus-in-WebM 96k + AAC-LC-in-M4A 128k with ffmpeg, and appends a C-17-named
 * entry (`id`, `role: "audio"`, `source`, `license`, `hash`) plus the PRD-09
 * provenance fields (`sourceUrl`, `author`, `lufs`, `truePeak`, `encodings`)
 * into `assets/packs/<pack>/manifest.json`.
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gainForTarget, measureLoudness, type SfxMasteringClass } from "@aura3d/audio";
import { registerCliCommand } from "../../contracts/commands.js";

interface SourceMeta {
  readonly license?: string;
  readonly sourceUrl?: string;
  readonly author?: string;
  readonly id?: string;
  readonly class?: SfxMasteringClass;
}

const AUDIO_EXT = /\.(wav|ogg|mp3|flac|aiff?|webm|m4a|opus)$/i;

const die = (io: { stderr(s: string): void }, msg: string): number => {
  io.stderr(`sfx admit: ${msg}`);
  return 1;
};

const ffmpeg = (...args: string[]): Buffer =>
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { maxBuffer: 1 << 28 }) as Buffer;

const ffprobe = (...args: string[]): string =>
  execFileSync("ffprobe", ["-v", "error", ...args], { maxBuffer: 1 << 24 }).toString("utf8").trim();

registerCliCommand({
  name: "sfx admit",
  owner: "prd09",
  summary: "Admit source audio into an sfx pack (license + loudness + transcode)",
  usage: "aura3d sfx admit <dir> --pack <name> [--dry-run]",
  async run(argv, io) {
    const dir = argv[0] && !argv[0].startsWith("-") ? resolve(io.cwd, argv[0]) : undefined;
    const packFlag = argv.findIndex((a) => a === "--pack");
    const pack = packFlag >= 0 ? argv[packFlag + 1] : undefined;
    const dryRun = argv.includes("--dry-run");
    if (!dir || !pack) return die(io, "usage: aura3d sfx admit <dir> --pack <name>");
    if (!existsSync(dir)) return die(io, `directory not found: ${dir}`);

    const metaPath = join(dir, "sources.json");
    if (!existsSync(metaPath)) return die(io, `missing ${metaPath} — every file needs license, sourceUrl and author`);
    const sources = JSON.parse(readFileSync(metaPath, "utf8")) as Record<string, SourceMeta>;

    try {
      execFileSync("ffmpeg", ["-version"], { stdio: "pipe" });
    } catch {
      return die(io, "ffmpeg not found on PATH (required for decode + transcode)");
    }

    const files = readdirSync(dir).filter((f) => AUDIO_EXT.test(f)).sort();
    if (files.length === 0) return die(io, `no audio files in ${dir}`);

    const outDir = resolve(io.cwd, "assets/packs", pack);
    const manifestPath = join(outDir, "manifest.json");
    const manifest: { schema: string; pack: string; entries: Record<string, unknown>[] } = existsSync(manifestPath)
      ? JSON.parse(readFileSync(manifestPath, "utf8"))
      : { schema: "aura3d.assets/1.1", pack, entries: [] };

    const problems: string[] = [];
    let admitted = 0;
    for (const file of files) {
      const meta = sources[file];
      if (!meta?.license || !meta.sourceUrl || !meta.author) {
        problems.push(`${file}: requires license, sourceUrl and author in sources.json`);
        continue;
      }
      const id = meta.id ?? file.replace(AUDIO_EXT, "");
      const src = join(dir, file);
      const cls: SfxMasteringClass = meta.class ?? "one-shot";

      // Decode to 48 kHz PCM (channels preserved) for BS.1770 measurement.
      const channelCount = Number(ffprobe("-select_streams", "a:0", "-show_entries", "stream=channels", "-of", "csv=p=0", src)) || 1;
      const pcm = ffmpeg("-i", src, "-f", "f32le", "-ac", String(channelCount), "-ar", "48000", "-");
      const channels = Array.from({ length: channelCount }, (_, c) => {
        const out = new Float32Array(pcm.length / 4 / channelCount);
        for (let i = 0; i < out.length; i++) out[i] = pcm.readFloatLE((i * channelCount + c) * 4);
        return out;
      });
      const measured = measureLoudness({ channels, sampleRate: 48_000 });
      const gainDb = gainForTarget(measured, cls);

      const hash = createHash("sha256").update(readFileSync(src)).digest("hex").slice(0, 16);
      const opus = `${id}.opus.webm`;
      const aac = `${id}.m4a`;
      if (!dryRun) {
        mkdirSync(outDir, { recursive: true });
        const gainFilter = gainDb === 0 ? [] : ["-af", `volume=${gainDb}dB`];
        ffmpeg("-i", src, ...gainFilter, "-c:a", "libopus", "-b:a", "96k", join(outDir, opus));
        ffmpeg("-i", src, ...gainFilter, "-c:a", "aac", "-b:a", "128k", join(outDir, aac));
      }
      manifest.entries = manifest.entries.filter((e) => (e as { id?: string }).id !== id);
      manifest.entries.push({
        id,
        role: "audio",
        source: meta.sourceUrl,
        license: meta.license,
        sourceUrl: meta.sourceUrl,
        author: meta.author,
        hash,
        class: cls,
        lufs: Number.isFinite(measured.lufs) ? measured.lufs : null,
        truePeak: measured.truePeakDb,
        gainAppliedDb: gainDb,
        encodings: { opus: `${opus}`, aac: `${aac}` }
      });
      admitted += 1;
      const lufsText = Number.isFinite(measured.lufs) ? measured.lufs.toFixed(2) : "n/a(sub-block)";
      io.stdout(`${id}: ${cls} lufs=${lufsText} dbtp=${measured.truePeakDb.toFixed(2)} gain=${gainDb}dB${dryRun ? " (dry-run)" : ""}`);
    }

    if (!dryRun && admitted > 0) writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    for (const p of problems) io.stderr(`sfx admit: ${p}`);
    io.stdout(`sfx admit: ${admitted} admitted${dryRun ? " (dry-run)" : ""}, ${problems.length} rejected`);
    return problems.length > 0 ? 1 : 0;
  }
});
