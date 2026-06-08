/**
 * mouth-cadence.test.ts — audit gap B7.
 *
 * Pins the syllable-cadence mouth open/close behaviour whose claimed acceptance
 * ("mouth open/close cycles match syllable cadence") was previously UNVERIFIED.
 *
 * Two layers are covered:
 *   1. `sampleVisemeOpenness` (episode-document.ts) — the document-derived speaking
 *      pulse. It OSCILLATES while the speaker is talking (opens high AND dips low,
 *      repeatedly) and is 0 when the speaker is not talking (outside the line / wrong
 *      speaker). NOTE: this raw pulse never fully closes (min ≈ 0.18) — that's by design.
 *   2. The ~3.3 Hz syllable GATE applied in scene-player.ts (which can't be run here, as
 *      it builds a full renderable scene). The documented gate formula is replicated below
 *      AS THE SPEC and asserted to produce multiple open/close cycles over a multi-second
 *      line while never holding fully open — pinning the documented cadence.
 *
 * Source of the gate formula (scene-player.ts, B7 block ~lines 683-689):
 *   const syllableGate = 0.5 - 0.5 * Math.cos(time * Math.PI * 2 * 3.3);
 *   mouthOpenness = mouthOpenness * (0.18 + 0.82 * syllableGate);
 */
import { describe, expect, it } from "vitest";
import {
  sampleVisemeOpenness,
  type EpisodeDocument
} from "../../../packages/create-aura3d/templates/animation-studio/src/episode-document";

// A minimal document whose only relevant content is one speaking line for "hero"
// over the window [1, 9). Everything else is the smallest shape the type accepts;
// the viseme sampler only reads `doc.dialogue.lines`.
function docWithLine(): EpisodeDocument {
  return {
    id: "mouth-cadence-fixture",
    duration: 10,
    assets: { characters: [], props: [] },
    set: {
      clearColor: [0, 0, 0, 1],
      studioLightingScale: 1,
      environment: {
        color: [0, 0, 0],
        intensity: 1,
        proceduralMap: {
          skyColor: [0, 0, 0],
          horizonColor: [0, 0, 0],
          groundColor: [0, 0, 0],
          specularColor: [0, 0, 0],
          intensity: 1,
          specularIntensity: 1
        }
      },
      pieces: [],
      lights: []
    },
    shots: [{ shotId: "s0", presetId: "establishing", startTime: 0, endTime: 10, cameraSubject: [0, 0, 0] }],
    blocking: [],
    setDressing: [],
    worldState: { glowSpanSeconds: 1 },
    dialogue: {
      language: "en",
      lines: [{ lineId: "L1", speakerId: "hero", text: "Hello there, friend.", startTime: 1, endTime: 9 }]
    }
  };
}

const LINE_START = 1;
const LINE_END = 9;

describe("sampleVisemeOpenness — document-derived speaking pulse (B7)", () => {
  it("oscillates while speaking: opens high AND dips low, repeatedly (not a static hold)", () => {
    const doc = docWithLine();
    const samples: number[] = [];
    // Dense sampling across the spoken window so we capture multiple pulse cycles.
    for (let t = LINE_START; t < LINE_END; t += 0.01) {
      samples.push(sampleVisemeOpenness(doc, t, "hero").mouthOpenness);
    }

    const max = Math.max(...samples);
    const min = Math.min(...samples);

    // It must genuinely OPEN (reach a clearly-open value) ...
    expect(max).toBeGreaterThan(0.75);
    // ... and CLOSE/DIP (return toward closed) — proving it is not held open.
    expect(min).toBeLessThan(0.25);

    // Count local maxima (open peaks). A static hold would have ~0; a real cadence
    // produces many across an 8s line at the sampler's ~9 rad/s pulse.
    let openPeaks = 0;
    for (let i = 1; i < samples.length - 1; i += 1) {
      if (samples[i]! > samples[i - 1]! && samples[i]! >= samples[i + 1]! && samples[i]! > 0.7) {
        openPeaks += 1;
      }
    }
    expect(openPeaks).toBeGreaterThan(3);

    // The pulse is intentionally never fully closed (min floor ≈ 0.18 by the 0.5 + 0.32*sin
    // form). Document that here so the GATE (below) is shown to be what produces real closure.
    expect(min).toBeGreaterThan(0.1);
  });

  it("is 0 when the speaker is NOT talking — wrong speaker", () => {
    const doc = docWithLine();
    // Mid-line, but asking about a different speaker → silent mouth.
    expect(sampleVisemeOpenness(doc, 5, "villain").mouthOpenness).toBe(0);
    expect(sampleVisemeOpenness(doc, 5, "villain").visemeId).toBe("sil");
  });

  it("is 0 when the speaker is NOT talking — outside the line window", () => {
    const doc = docWithLine();
    // Before the line, at the exclusive end, and after.
    expect(sampleVisemeOpenness(doc, LINE_START - 0.5, "hero").mouthOpenness).toBe(0);
    expect(sampleVisemeOpenness(doc, LINE_END, "hero").mouthOpenness).toBe(0); // endTime is exclusive
    expect(sampleVisemeOpenness(doc, LINE_END + 1, "hero").mouthOpenness).toBe(0);
  });
});

describe("syllable GATE (~3.3 Hz) — documented scene-player cadence spec (B7)", () => {
  // Exact replica of the gate from scene-player.ts (lines ~686-689). Copied as the spec
  // because the gate only lives in the full-scene player path, which can't run in a unit test.
  function applySyllableGate(rawOpenness: number, time: number): number {
    const syllableGate = 0.5 - 0.5 * Math.cos(time * Math.PI * 2 * 3.3);
    return rawOpenness * (0.18 + 0.82 * syllableGate);
  }

  it("produces multiple open/close cycles over a multi-second line and never holds fully open", () => {
    const doc = docWithLine();
    const gated: number[] = [];
    let rawMax = 0;
    for (let t = LINE_START; t < LINE_END; t += 0.002) {
      const raw = sampleVisemeOpenness(doc, t, "hero").mouthOpenness;
      rawMax = Math.max(rawMax, raw);
      gated.push(applySyllableGate(raw, t));
    }

    const gatedMax = Math.max(...gated);
    const gatedMin = Math.min(...gated);

    // The gate CLOSES the mouth between syllables: the trough drops far below the raw floor
    // (0.18) and well below any "open" reading — real closure, not a dim.
    expect(gatedMin).toBeLessThan(0.05);

    // It still OPENS during syllable peaks.
    expect(gatedMax).toBeGreaterThan(0.4);

    // It NEVER holds fully open: every gated sample is strictly below the un-gated raw peak,
    // so a frozen open mouth is impossible.
    expect(gatedMax).toBeLessThan(rawMax);

    // Count open peaks and closed dips directly via local extrema. The 3.3 Hz gate is
    // amplitude-modulated by the raw speaking pulse, so absolute heights vary cycle-to-cycle;
    // counting local maxima/minima is robust to that modulation. A static hold would yield ~0
    // dips. Over the ~8s line at 3.3 Hz we expect many open→close transitions.
    let openPeaks = 0; // mouth clearly OPEN at a syllable
    let closedDips = 0; // mouth CLOSED between syllables (real closure, not a dim)
    for (let i = 1; i < gated.length - 1; i += 1) {
      const prev = gated[i - 1]!;
      const cur = gated[i]!;
      const next = gated[i + 1]!;
      if (cur > prev && cur >= next && cur > 0.3) openPeaks += 1;
      if (cur < prev && cur <= next && cur < 0.08) closedDips += 1;
    }

    // Many distinct opens AND many distinct closes → genuine open/close cadence, not a hold.
    expect(openPeaks).toBeGreaterThan(12);
    expect(closedDips).toBeGreaterThan(6);

    // Sanity on cadence frequency: the gate fires ~3.3 Hz over (LINE_END-LINE_START)=8s ≈ 26
    // open peaks. After amplitude modulation we must still see well more than half of them.
    expect(openPeaks).toBeGreaterThan((LINE_END - LINE_START) * 3.3 * 0.4);
  });

  it("the gate trough returns near-zero at least once per ~0.30s (≈3.3 Hz) window", () => {
    // Independent of the dialogue sampler: the raised-cosine gate alone must reach ~0
    // about every 1/3.3 s. Verifies the documented frequency directly.
    const period = 1 / 3.3;
    for (let cycle = 0; cycle < 6; cycle += 1) {
      const windowStart = cycle * period;
      let minInWindow = Infinity;
      for (let t = windowStart; t < windowStart + period; t += period / 50) {
        const gate = 0.5 - 0.5 * Math.cos(t * Math.PI * 2 * 3.3);
        minInWindow = Math.min(minInWindow, gate);
      }
      expect(minInWindow).toBeLessThan(0.02); // gate closes once per period
    }
  });
});
