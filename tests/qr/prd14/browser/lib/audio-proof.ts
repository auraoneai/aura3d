// tests/qr/prd14/browser/lib/audio-proof.ts — PRD-14 §16.1 S11 assertions.
// Reads `window.__AURA3D_GAME_EVIDENCE__[<appDir>].audio.{synthCues,
// voicesPlayed, cuesPlayed}` (apps/<dir>/src/v2/audio-proof.ts) after the
// spec's scripted timeline and asserts: no synthesized cue played, and every
// art/direction.ts `audio[]` event was voiced at least once.
import { expect, type Page } from "@playwright/test";
import { directionAudioEvents } from "./direction";
import { APPS } from "./serve";

export interface RouteAudioProofEvidence {
  readonly synthCues: number;
  readonly voicesPlayed: number;
  readonly cuesPlayed: readonly string[];
}

export async function readAudioProof(page: Page, appDir: string): Promise<RouteAudioProofEvidence | null> {
  // `appDir` crosses into the page as an argument (closures do not).
  return page.evaluate((id) => {
    const ev = (window as unknown as { __AURA3D_GAME_EVIDENCE__?: Record<string, { audio?: Record<string, unknown> }> })
      .__AURA3D_GAME_EVIDENCE__?.[id];
    const a = ev?.audio;
    if (a === undefined || typeof a.synthCues !== "number" || typeof a.voicesPlayed !== "number" || !Array.isArray(a.cuesPlayed)) {
      return null;
    }
    return { synthCues: a.synthCues, voicesPlayed: a.voicesPlayed, cuesPlayed: (a.cuesPlayed as unknown[]).map(String) };
  }, appDir);
}

/** S11: `synthCues === 0`, `voicesPlayed` covers audio[], every audio[] event voiced. */
export async function expectS11Audio(page: Page, appDir: string): Promise<void> {
  const events = directionAudioEvents(APPS, appDir);
  const proof = await readAudioProof(page, appDir);
  expect(proof, `${appDir}: evidence.audio has no {synthCues, voicesPlayed, cuesPlayed} proof`).not.toBeNull();
  const unvoiced = events.filter((e) => !proof!.cuesPlayed.includes(e));
  expect(proof!.synthCues, `${appDir}: S11 synthCues (synthesized cue plays; #70 R-14-09)`).toBe(0);
  expect(proof!.voicesPlayed, `${appDir}: S11 voicesPlayed below the ${events.length} audio[] events`).toBeGreaterThanOrEqual(events.length);
  expect(unvoiced, `${appDir}: S11 audio[] events never voiced in the timeline`).toEqual([]);
}
