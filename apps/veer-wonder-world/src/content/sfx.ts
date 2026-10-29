// Sound effects (PRD 04 D15; PRD 01 section 7; PRD 06 QA-A04).
//
// Every effect is soft, gentle, short and never startling: one sound at a
// time, low volume, no echo, no harsh or sudden peaks. Sheru never speaks; his
// reactions are a bark bank of nine friendly sounds (02 section 2: 8-15
// non-speaking reactions): `woof` plus `woofSoft` ... `aroo`, none of them a
// growl, whine or whimper. `prompt` goes to the sound generator
// (ElevenLabs sound-generation through Kiro Prism, tools/gen-audio.ts);
// `gain` (0-1) scales the effect on the SFX bus, which already sits below the
// voice bus, so an effect never plays louder than speech.

import type { SfxId } from "../types.js";

export interface SfxSpec {
  prompt: string;
  durationSec: number;
  gain: number;
}

export const SFX: Record<SfxId, SfxSpec> = {
  woof: { prompt: "one soft, friendly cartoon puppy bark, gentle and warm, a single short bark at low volume, no growl, no echo", durationSec: 0.8, gain: 0.5 },
  pop: { prompt: "a soft, gentle soap bubble pop, tiny and round, quiet and cute, a single pop", durationSec: 0.5, gain: 0.45 },
  bubbleBlow: { prompt: "a soft, airy breath blowing soap bubbles through a wand, light and quiet", durationSec: 1.5, gain: 0.35 },
  doorOpen: { prompt: "a gentle wooden toy door opening smoothly with a soft click, quiet and friendly, no creak", durationSec: 1.2, gain: 0.45 },
  doorbell: { prompt: "a soft, friendly two-note ding-dong doorbell chime, gentle and warm, low volume", durationSec: 1.5, gain: 0.4 },
  moo: { prompt: "one gentle, friendly cartoon cow moo, soft and calm, low volume, no echo", durationSec: 1.5, gain: 0.45 },
  baa: { prompt: "one soft, friendly little lamb baa, gentle and calm, cartoon farm, low volume", durationSec: 1.2, gain: 0.45 },
  quack: { prompt: "one soft, friendly cartoon duck quack, gentle and cute, low volume", durationSec: 0.7, gain: 0.45 },
  neigh: { prompt: "a short, gentle, friendly cartoon pony neigh, soft and calm, low volume, not loud", durationSec: 1.5, gain: 0.4 },
  tweet: { prompt: "two soft, sweet little chick tweets, gentle and quiet", durationSec: 0.8, gain: 0.4 },
  whistle: { prompt: "a soft, mellow toy train whistle, short and gentle at low volume, not shrill", durationSec: 1, gain: 0.3 },
  chugga: { prompt: "a soft, slow toy train chugging, gentle chugga-chugga rhythm, quiet and smooth", durationSec: 2, gain: 0.35 },
  drum: { prompt: "one soft, warm tap on a small toy hand drum, a gentle single hit, no echo", durationSec: 0.8, gain: 0.5 },
  shaker: { prompt: "one gentle shake of a small toy egg shaker, soft and short", durationSec: 0.8, gain: 0.4 },
  pianoUp: { prompt: "three soft toy piano notes rising slowly, gentle and bright, quiet", durationSec: 1.5, gain: 0.4 },
  pianoDown: { prompt: "three soft toy piano notes falling slowly, gentle and calm, quiet", durationSec: 1.5, gain: 0.4 },
  splash: { prompt: "a small, gentle water splash, like a soft sponge dipped in a bucket, playful and quiet", durationSec: 1, gain: 0.4 },
  squeak: { prompt: "a soft, cute rubber toy squeak, a single gentle squeak, quiet", durationSec: 0.5, gain: 0.35 },
  ding: { prompt: "a soft, warm single bell ding, gentle and clear, low volume", durationSec: 1, gain: 0.4 },
  clack: { prompt: "two soft wooden toy blocks gently clicking together, a single quiet clack", durationSec: 0.5, gain: 0.45 },
  tumble: { prompt: "three soft wooden toy blocks gently tumbling onto a thick rug, quiet and playful, no crash", durationSec: 1.2, gain: 0.4 },
  munch: { prompt: "a soft, cute cartoon nibble and munch, gentle and quiet", durationSec: 0.8, gain: 0.4 },
  yawn: { prompt: "a soft, gentle, sleepy cartoon creature yawn, calm and cute", durationSec: 1.5, gain: 0.35 },
  giggle: { prompt: "a soft, friendly cartoon creature giggle, warm and gentle, short", durationSec: 1, gain: 0.35 },
  whoosh: { prompt: "a soft, slow, gentle air whoosh, light and smooth, quiet, no wind roar", durationSec: 0.8, gain: 0.3 },
  sparkle: { prompt: "a soft, gentle twinkle of a glockenspiel shimmer, light and quiet", durationSec: 1.2, gain: 0.3 },
  clap: { prompt: "one soft, warm hand clap, gentle and close, no echo", durationSec: 0.5, gain: 0.45 },
  stomp: { prompt: "one soft, padded cartoon footstep on grass, a gentle thump, quiet", durationSec: 0.5, gain: 0.45 },
  boing: { prompt: "a soft, gentle cartoon boing of a small spring, playful and quiet", durationSec: 0.7, gain: 0.35 },
  tada: { prompt: "a soft, gentle two-note celebration chime on a toy xylophone, warm and quiet, short", durationSec: 1.2, gain: 0.35 },
  rumble: { prompt: "a soft, funny little cartoon tummy rumble, a gentle gurgle, quiet", durationSec: 1, gain: 0.35 },
  blow: { prompt: "a soft, gentle breath blowing out a pretend candle, a light whoo, quiet", durationSec: 1, gain: 0.4 },
  beep: { prompt: "a soft, friendly little toy robot beep-boop, two gentle tones, quiet", durationSec: 0.8, gain: 0.35 },
  rustle: { prompt: "a soft, gentle rustle of leaves in a small bush, quiet and calm", durationSec: 1.2, gain: 0.3 },
  // Sheru's bark bank (with `woof`).
  woofSoft: { prompt: "one very soft, low, gentle cartoon puppy woof, warm and calm, quiet, no growl, no echo", durationSec: 0.7, gain: 0.45 },
  woofDouble: { prompt: "two soft, happy cartoon puppy barks, woof woof, friendly and gentle, low volume, no growl, no echo", durationSec: 1, gain: 0.45 },
  yip: { prompt: "one short, happy little puppy yip, cute and gentle, quiet, not shrill", durationSec: 0.5, gain: 0.4 },
  arf: { prompt: "one short, playful cartoon puppy arf, friendly and soft, low volume", durationSec: 0.5, gain: 0.45 },
  pant: { prompt: "a happy puppy panting softly for a moment, gentle and cute, quiet", durationSec: 1.5, gain: 0.35 },
  sniffs: { prompt: "a cute puppy sniffing softly three times, gentle and quiet", durationSec: 1, gain: 0.4 },
  huff: { prompt: "one soft, playful puppy huff through the nose, a gentle friendly snort, quiet", durationSec: 0.5, gain: 0.4 },
  aroo: { prompt: "one tiny, soft, happy cartoon puppy aroo, short and gentle, quiet, not a howl", durationSec: 1, gain: 0.35 }
};

/** Shortest and longest effect lengths (seconds) the generator is asked for. */
export const SFX_MIN_SEC = 0.5;
export const SFX_MAX_SEC = 3;
/** Highest per-effect gain; the SFX bus already sits below the voice bus. */
export const SFX_MAX_GAIN = 0.6;

/** Words that describe a startling sound (allowed only when negated: "no crash", "not loud"). */
export const STARTLING_TERMS: readonly string[] = [
  "loud", "scream", "screech", "shriek", "crash", "explosion", "explode", "bang", "siren", "alarm", "horror",
  "scary", "spooky", "harsh", "shrill", "growl", "roar", "thunder", "gunshot", "slam", "smash", "piercing", "blaring"
];

/**
 * The startling terms in a prompt that are not negated by a nearby "no",
 * "not", "never" or "without" (e.g. "no growl" and "not shrill" are fine).
 */
export function startlingTerms(text: string): string[] {
  const words = text.toLowerCase().split(/[^a-z]+/).filter((token) => token.length > 0);
  const found: string[] = [];
  words.forEach((token, index) => {
    const term = STARTLING_TERMS.find((candidate) => token === candidate || token.startsWith(candidate));
    if (term === undefined) return;
    const before = words.slice(Math.max(0, index - 2), index);
    if (before.some((w) => w === "no" || w === "not" || w === "never" || w === "without")) return;
    if (!found.includes(term)) found.push(term);
  });
  return found;
}
