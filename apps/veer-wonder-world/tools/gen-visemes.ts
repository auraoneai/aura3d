// Deterministic grapheme-alignment to timed viseme generator (PRD 09 B3.6).
// Converts ElevenLabs / forced-aligner character timestamps (`characters`,
// `character_start_times_seconds`, `character_end_times_seconds`) into compact
// integer-millisecond `VisemeCue[]` tracks for `src/audio-manifest.ts` and
// runtime `sampleVisemeAtMs` / `visemeSubParts` playback.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { VisemeCode, VisemeCue } from "../src/types.js";

export interface CharacterAlignment {
  readonly characters: readonly string[];
  readonly character_start_times_seconds: readonly number[];
  readonly character_end_times_seconds: readonly number[];
}

interface ClassifiedCluster {
  readonly viseme: VisemeCode;
  readonly openness: number;
  readonly length: number;
}

const GAP_REST_THRESHOLD_MS = 60;

function isAsciiLetter(ch: string): boolean {
  return ch.length === 1 && ((ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z"));
}

function isPauseChar(ch: string): boolean {
  if (ch.trim().length === 0) return true;
  return /^[.,!?;:\-—–…()"[\]{}/\\]+$/.test(ch);
}

function classifyLetterCluster(chars: readonly string[], index: number, canMergeNext: boolean): ClassifiedCluster {
  const c0 = (chars[index] ?? "").toLowerCase();
  const c1 = canMergeNext ? (chars[index + 1] ?? "").toLowerCase() : "";
  const pair = c1.length === 1 && isAsciiLetter(c1) ? `${c0}${c1}` : "";

  if (pair.length === 2) {
    switch (pair) {
      case "ph":
        return { viseme: "FV", openness: 0.45, length: 2 };
      case "qu":
        return { viseme: "WQ", openness: 0.68, length: 2 };
      case "oo":
        return { viseme: "WQ", openness: 0.72, length: 2 };
      case "sh":
      case "ch":
        return { viseme: "WQ", openness: 0.52, length: 2 };
      case "oa":
      case "ow":
      case "au":
      case "aw":
      case "oi":
      case "oy":
        return { viseme: "OH", openness: 0.82, length: 2 };
      case "ee":
      case "ea":
      case "ie":
      case "ey":
        return { viseme: "EE", openness: 0.74, length: 2 };
      case "th":
        return { viseme: "LTH", openness: 0.42, length: 2 };
      case "ah":
      case "ar":
      case "er":
      case "ai":
      case "ay":
      case "ur":
      case "ir":
        return { viseme: "AA", openness: 0.9, length: 2 };
    }
  }

  switch (c0) {
    case "m":
    case "b":
    case "p":
      return { viseme: "MBP", openness: 0.25, length: 1 };
    case "f":
    case "v":
      return { viseme: "FV", openness: 0.45, length: 1 };
    case "w":
    case "q":
      return { viseme: "WQ", openness: 0.68, length: 1 };
    case "o":
      return { viseme: "OH", openness: 0.82, length: 1 };
    case "e":
    case "i":
    case "y":
      return { viseme: "EE", openness: 0.72, length: 1 };
    case "l":
    case "d":
    case "t":
    case "n":
      return { viseme: "LTH", openness: 0.42, length: 1 };
    case "a":
    case "u":
      return { viseme: "AA", openness: 0.9, length: 1 };
    case "h":
      return { viseme: "AA", openness: 0.56, length: 1 };
    default:
      return { viseme: "LTH", openness: 0.38, length: 1 };
  }
}

function roundOpenness(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
}

/**
 * Maps character-level timing alignment into a compact, deterministic `VisemeCue[]` track:
 * - `m/b/p` -> `"MBP"`
 * - `f/v/ph` -> `"FV"`
 * - `w/qu/oo` -> `"WQ"`
 * - `o/oa/ow/au` -> `"OH"`
 * - `e/ee/ea/i/y` -> `"EE"`
 * - `l/th/d/t/n` -> `"LTH"`
 * - `a/ah/u/ar/er` -> `"AA"`
 * - whitespace, punctuation, and inter-token gaps `> 60 ms` -> `"rest"` (`openness: 0`)
 */
export function alignmentToVisemes(alignment: CharacterAlignment): VisemeCue[] {
  const count = Math.min(
    alignment.characters.length,
    alignment.character_start_times_seconds.length,
    alignment.character_end_times_seconds.length
  );
  if (count === 0) return [];

  const raw: Array<{ tMs: number; endMs: number; viseme: VisemeCode; openness: number }> = [];
  let cursorMs: number | null = null;
  let i = 0;

  while (i < count) {
    const ch = alignment.characters[i] ?? "";
    const rawStartSec = alignment.character_start_times_seconds[i] ?? 0;
    const rawEndSec = alignment.character_end_times_seconds[i] ?? rawStartSec;
    if (!Number.isFinite(rawStartSec) || !Number.isFinite(rawEndSec)) {
      i += 1;
      continue;
    }

    const startMs = Math.max(cursorMs ?? 0, Math.max(0, Math.round(rawStartSec * 1000)));
    let endMs = Math.max(startMs, Math.round(rawEndSec * 1000));

    if (cursorMs !== null && startMs - cursorMs > GAP_REST_THRESHOLD_MS) {
      raw.push({ tMs: cursorMs, endMs: startMs, viseme: "rest", openness: 0 });
      cursorMs = startMs;
    }

    if (isPauseChar(ch)) {
      if (endMs > startMs) {
        const restStart = cursorMs !== null && startMs - cursorMs <= GAP_REST_THRESHOLD_MS ? cursorMs : startMs;
        raw.push({ tMs: restStart, endMs, viseme: "rest", openness: 0 });
        cursorMs = endMs;
      }
      i += 1;
      continue;
    }

    // Intra-word apostrophes (`let's`, `we're`) bridge silently unless they carry a real >60 ms pause.
    if (ch === "'" || ch === "’") {
      if (endMs - startMs > GAP_REST_THRESHOLD_MS) {
        raw.push({ tMs: startMs, endMs, viseme: "rest", openness: 0 });
        cursorMs = endMs;
      }
      i += 1;
      continue;
    }

    let canMergeNext = false;
    if (i + 1 < count && isAsciiLetter(ch) && isAsciiLetter(alignment.characters[i + 1] ?? "")) {
      const nextStartSec = alignment.character_start_times_seconds[i + 1] ?? rawEndSec;
      const nextStartMs = Math.max(0, Math.round(nextStartSec * 1000));
      canMergeNext = nextStartMs - endMs <= GAP_REST_THRESHOLD_MS;
    }

    const cluster = classifyLetterCluster(alignment.characters, i, canMergeNext);
    if (cluster.length === 2 && i + 1 < count) {
      const secondEndSec = alignment.character_end_times_seconds[i + 1] ?? rawEndSec;
      if (Number.isFinite(secondEndSec)) {
        endMs = Math.max(endMs, Math.round(secondEndSec * 1000));
      }
    }

    if (endMs <= startMs) {
      endMs = startMs + 20;
    }

    const bridgedStart =
      cursorMs !== null && startMs > cursorMs && startMs - cursorMs <= GAP_REST_THRESHOLD_MS ? cursorMs : startMs;
    raw.push({
      tMs: bridgedStart,
      endMs: Math.max(bridgedStart + 1, endMs),
      viseme: cluster.viseme,
      openness: roundOpenness(cluster.openness)
    });
    cursorMs = Math.max(bridgedStart + 1, endMs);
    i += cluster.length;
  }

  // Merge adjacent identical visemes into compact rounded-ms cues.
  const merged: Array<{ tMs: number; endMs: number; viseme: VisemeCode; openness: number }> = [];
  for (const item of raw) {
    if (item.endMs <= item.tMs) continue;
    const prev = merged[merged.length - 1];
    if (
      prev &&
      prev.viseme === item.viseme &&
      (item.viseme === "rest" ? item.tMs <= prev.endMs + GAP_REST_THRESHOLD_MS : item.tMs <= prev.endMs + 20)
    ) {
      prev.endMs = Math.max(prev.endMs, item.endMs);
      prev.openness = item.viseme === "rest" ? 0 : roundOpenness(Math.max(prev.openness, item.openness));
      continue;
    }
    const clampedStart = prev ? Math.max(prev.endMs, item.tMs) : item.tMs;
    if (item.endMs <= clampedStart) continue;
    merged.push({
      tMs: clampedStart,
      endMs: item.endMs,
      viseme: item.viseme,
      openness: item.viseme === "rest" ? 0 : item.openness
    });
  }

  return merged.map((entry) => ({
    tMs: entry.tMs,
    endMs: entry.endMs,
    dMs: Math.max(1, entry.endMs - entry.tMs),
    viseme: entry.viseme,
    openness: entry.openness
  }));
}

function isCharacterAlignment(value: unknown): value is CharacterAlignment {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    Array.isArray(record.characters) &&
    Array.isArray(record.character_start_times_seconds) &&
    Array.isArray(record.character_end_times_seconds)
  );
}

function extractAlignmentsFromJson(fileStem: string, parsed: unknown): ReadonlyArray<readonly [string, CharacterAlignment]> {
  if (isCharacterAlignment(parsed)) {
    return [[fileStem, parsed]];
  }
  if (typeof parsed !== "object" || parsed === null) {
    return [];
  }
  const obj = parsed as Record<string, unknown>;
  if (isCharacterAlignment(obj.normalized_alignment)) {
    const key = typeof obj.lineKey === "string" && obj.lineKey.length > 0 ? obj.lineKey : fileStem;
    return [[key, obj.normalized_alignment]];
  }
  if (isCharacterAlignment(obj.alignment)) {
    const key = typeof obj.lineKey === "string" && obj.lineKey.length > 0 ? obj.lineKey : fileStem;
    return [[key, obj.alignment]];
  }
  const pairs: Array<readonly [string, CharacterAlignment]> = [];
  for (const [key, entry] of Object.entries(obj)) {
    if (isCharacterAlignment(entry)) {
      pairs.push([key, entry]);
    } else if (typeof entry === "object" && entry !== null) {
      const nested = entry as Record<string, unknown>;
      if (isCharacterAlignment(nested.normalized_alignment)) {
        pairs.push([key, nested.normalized_alignment]);
      } else if (isCharacterAlignment(nested.alignment)) {
        pairs.push([key, nested.alignment]);
      }
    }
  }
  return pairs;
}

export interface GenerateVisemesOptions {
  readonly alignmentsDir?: string;
  readonly outFile?: string;
}

function collectAlignmentJsonFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  const nonEnDirs: string[] = [];
  const enDirs: string[] = [];
  const flatFiles: string[] = [];
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "en") enDirs.push(full);
      else nonEnDirs.push(full);
    } else if (entry.isFile() && extname(entry.name).toLowerCase() === ".json") {
      flatFiles.push(full);
    }
  }
  // Process non-en locale subdirs first, then en/, then flat *.json so English canonical clips win on shared keys.
  const collected: string[] = [];
  for (const sub of nonEnDirs) collected.push(...collectAlignmentJsonFiles(sub));
  for (const sub of enDirs) collected.push(...collectAlignmentJsonFiles(sub));
  collected.push(...flatFiles);
  return collected;
}

export function generateVisemesMap(alignmentsDir: string): Record<string, VisemeCue[]> {
  const result: Record<string, VisemeCue[]> = {};
  if (!existsSync(alignmentsDir)) {
    return result;
  }
  const files = collectAlignmentJsonFiles(alignmentsDir);
  for (const fullPath of files) {
    const stem = basename(fullPath, extname(fullPath));
    const parsed: unknown = JSON.parse(readFileSync(fullPath, "utf8"));
    for (const [lineKey, alignment] of extractAlignmentsFromJson(stem, parsed)) {
      result[lineKey] = alignmentToVisemes(alignment);
    }
  }
  const sorted: Record<string, VisemeCue[]> = {};
  for (const key of Object.keys(result).sort((a, b) => a.localeCompare(b))) {
    sorted[key] = result[key] ?? [];
  }
  return sorted;
}

export function runGenVisemesCli(options: GenerateVisemesOptions = {}): {
  readonly outFile: string;
  readonly lineCount: number;
} {
  const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const alignmentsDir = resolve(appRoot, options.alignmentsDir ?? "provenance/audio/alignments");
  const outFile = resolve(appRoot, options.outFile ?? "provenance/audio/visemes.json");
  const visemesByLine = generateVisemesMap(alignmentsDir);
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, `${JSON.stringify(visemesByLine, null, 2)}\n`, "utf8");
  return { outFile, lineCount: Object.keys(visemesByLine).length };
}

const isMainModule =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === "string" &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  let alignmentsDir: string | undefined;
  let outFile: string | undefined;
  const args = process.argv.slice(2);
  for (let idx = 0; idx < args.length; idx += 1) {
    const arg = args[idx];
    if (arg === "--alignments" && args[idx + 1]) {
      alignmentsDir = args[idx + 1];
      idx += 1;
    } else if (arg === "--out" && args[idx + 1]) {
      outFile = args[idx + 1];
      idx += 1;
    }
  }
  const summary = runGenVisemesCli({
    ...(alignmentsDir !== undefined ? { alignmentsDir } : {}),
    ...(outFile !== undefined ? { outFile } : {})
  });
  process.stdout.write(`Generated ${summary.lineCount} viseme track(s) -> ${summary.outFile}\n`);
}
