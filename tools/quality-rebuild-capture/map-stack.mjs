#!/usr/bin/env node
/**
 * T0-29 (lane 12 harness half): map minified crash frames from a game build
 * back to source, so a per-flag games crash table can name the owning file.
 *
 *   node tools/quality-rebuild-capture/map-stack.mjs <build-dir> < stack.txt
 *   node tools/quality-rebuild-capture/map-stack.mjs <build-dir> "aura-engine-abc.js:79:253782"
 *
 * Every `<name>.js:<line>:<col>` frame whose `<name>.js.map` exists under
 * <build-dir> (built with capture-games.mjs --sourcemap) is printed as
 * `<frame> -> <source>:<line>:<col>`. Frames without a map are printed as
 * `<frame> -> (no sourcemap)`; nothing is guessed.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_INDEX = new Map([...B64].map((c, i) => [c, i]));

/** Decode one VLQ segment ("AAgBC") into its integer fields. */
export function decodeVlqSegment(segment) {
  const out = [];
  let value = 0;
  let shift = 0;
  for (const ch of segment) {
    const digit = B64_INDEX.get(ch);
    if (digit === undefined) throw new Error(`map-stack: invalid base64 VLQ char ${JSON.stringify(ch)}`);
    value += (digit & 31) << shift;
    if (digit & 32) {
      shift += 5;
    } else {
      const negative = value & 1;
      value >>>= 1;
      out.push(negative ? -value : value);
      value = 0;
      shift = 0;
    }
  }
  return out;
}

/**
 * Original position for a generated 1-based line and 1-based column, using the
 * nearest mapping at or before the column on that line (source-map semantics).
 */
export function originalPosition(map, line, column) {
  const lines = String(map.mappings ?? "").split(";");
  let source = 0;
  let srcLine = 0;
  let srcCol = 0;
  let best = null;
  for (let l = 0; l < lines.length && l < line; l += 1) {
    let genCol = 0;
    for (const segment of lines[l].split(",")) {
      if (!segment) continue;
      const f = decodeVlqSegment(segment);
      genCol += f[0];
      if (f.length >= 4) {
        source += f[1];
        srcLine += f[2];
        srcCol += f[3];
        if (l === line - 1 && genCol <= column - 1) {
          best = { source: map.sources?.[source] ?? `#${source}`, line: srcLine + 1, column: srcCol + 1 };
        }
      }
    }
  }
  return best;
}

function findMaps(dir) {
  const maps = new Map();
  const walk = (d) => {
    for (const entry of readdirSync(d)) {
      const path = join(d, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (entry.endsWith(".js.map")) maps.set(entry.slice(0, -4), path);
    }
  };
  if (existsSync(dir)) walk(dir);
  return maps;
}

export function mapStack(text, buildDir) {
  const maps = findMaps(buildDir);
  const cache = new Map();
  const frames = [...String(text).matchAll(/([\w.@-]+\.js):(\d+):(\d+)/g)];
  return frames.map(([frame, file, line, col]) => {
    const mapPath = maps.get(basename(file));
    if (!mapPath) return `${frame} -> (no sourcemap)`;
    if (!cache.has(mapPath)) cache.set(mapPath, JSON.parse(readFileSync(mapPath, "utf8")));
    const pos = originalPosition(cache.get(mapPath), Number(line), Number(col));
    return pos ? `${frame} -> ${pos.source}:${pos.line}:${pos.column}` : `${frame} -> (no mapping)`;
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , buildDir, inline] = process.argv;
  if (!buildDir) {
    console.error("usage: map-stack.mjs <build-dir> [frame-text]  (or pipe a stack on stdin)");
    process.exit(2);
  }
  const text = inline ?? readFileSync(0, "utf8");
  for (const line of mapStack(text, buildDir)) console.log(line);
}
