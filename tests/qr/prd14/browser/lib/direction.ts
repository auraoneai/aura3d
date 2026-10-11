// tests/qr/prd14/browser/lib/direction.ts — Node-side reader for the
// `assets[]` and `audio[]` sections of apps/<dir>/art/direction.ts.
// The lane jobs do not build package dist/, so specs and unit tests read the
// authored source the same way stand-ins.test.ts does (literal parse).
import { readFileSync } from "node:fs";
import { join } from "node:path";

export interface DirectionAssetRole {
  readonly role: string;
  readonly assetKey: string;
  readonly kit: string | null;
}

export interface DirectionAudioCue {
  readonly event: string;
  readonly cue: string;
}

/** Body of the top-level `<name>: [ ... ]` array in a direction source. */
function arrayBody(src: string, name: string): string {
  const start = new RegExp(`\\n\\s*${name}:\\s*\\[`).exec(src);
  if (start === null) throw new Error(`art/direction.ts has no ${name}: [...] section`);
  let depth = 0;
  for (let i = start.index + start[0].length - 1; i < src.length; i++) {
    if (src[i] === "[") depth++;
    else if (src[i] === "]" && --depth === 0) return src.slice(start.index + start[0].length, i);
  }
  throw new Error(`art/direction.ts ${name}: [...] is unterminated`);
}

function field(entry: string, key: string): string | null {
  return new RegExp(`\\b${key}:\\s*"([^"]+)"`).exec(entry)?.[1] ?? null;
}

/** Top-level `{ ... }` entries of an array body (nested objects stay inside). */
function entries(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "{" && depth++ === 0) start = i;
    else if (body[i] === "}" && --depth === 0) out.push(body.slice(start, i + 1));
  }
  return out;
}

export function parseDirectionAssets(src: string): DirectionAssetRole[] {
  return entries(arrayBody(src, "assets")).map((e) => {
    const role = field(e, "role");
    const assetKey = field(e, "assetKey");
    if (role === null || assetKey === null) throw new Error(`assets[] entry without role/assetKey: ${e}`);
    return { role, assetKey, kit: field(e, "kit") };
  });
}

export function parseDirectionAudio(src: string): DirectionAudioCue[] {
  return entries(arrayBody(src, "audio")).map((e) => {
    const event = field(e, "event");
    const cue = field(e, "cue");
    if (event === null || cue === null) throw new Error(`audio[] entry without event/cue: ${e}`);
    return { event, cue };
  });
}

export function readDirection(appsRoot: string, appDir: string): string {
  return readFileSync(join(appsRoot, appDir, "art", "direction.ts"), "utf8");
}

/** The art/direction.ts `audio[]` events a route must voice (S11). */
export function directionAudioEvents(appsRoot: string, appDir: string): string[] {
  return parseDirectionAudio(readDirection(appsRoot, appDir)).map((a) => a.event);
}
