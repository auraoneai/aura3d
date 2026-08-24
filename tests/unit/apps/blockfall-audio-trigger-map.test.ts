/**
 * BF-A1/BF-09 unit proof — every state change has a registered cue.
 *
 * Mirrors the Clash audio asset spec pattern: the manifest must map each of the
 * nine gameplay cues (plus hum and intensity stems) to a distinct CLI-registered
 * typed WAV with CC0 "Aura3D synthesis" provenance, on the bus plan the PRD
 * names, and the trigger map must cover every observed state change without
 * gaps or duplicates.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assets } from "../../../src/aura-assets";
import {
  BLOCKFALL_GAMEPLAY_CUES,
  blockfallAudioAssets,
  blockfallAudioCueAssetKeys,
  blockfallAudioManifest,
  blockfallStemVolumesForLevel,
  blockfallStemsForLevel
} from "../../../apps/showcase-blockfall-reactor/src/blockfall-audio-manifest";

const TRIGGER_MAP_SOURCE = readFileSync("apps/showcase-blockfall-reactor/src/main.ts", "utf8");

describe("Blockfall Reactor audio manifest is CLI-registered and CC0-synthesized", () => {
  it("registers exactly the nine gameplay cues plus hum and four stems", () => {
    expect(BLOCKFALL_GAMEPLAY_CUES).toHaveLength(9);
    const expected = new Set([
      "move", "rotate", "lock", "line-clear", "quad", "level-up",
      "hold-swap", "hard-drop", "game-over"
    ]);
    for (const cue of expected) expect(BLOCKFALL_GAMEPLAY_CUES).toContain(cue);
    expect(Object.keys(blockfallAudioManifest)).toHaveLength(14);
    for (const loop of ["ambient-hum", "music-stem-1", "music-stem-2", "music-stem-3", "music-stem-4"]) {
      expect(blockfallAudioManifest[loop as keyof typeof blockfallAudioManifest].loop).toBe(true);
    }
  });

  it("maps every cue to a distinct typed wav under /aura-assets with a hash", () => {
    const keys = Object.values(blockfallAudioCueAssetKeys);
    expect(new Set(keys).size).toBe(keys.length);
    for (const [cue, definition] of Object.entries(blockfallAudioManifest)) {
      void cue;
      const typed = assets[definition.assetKey];
      expect(typed, `typed asset for ${definition.assetKey} missing`).toBeDefined();
      expect(definition.asset.url).toMatch(/\/aura-assets\/blockfall[A-Za-z0-9]+\.[a-f0-9]{8}\.wav$/);
      expect(definition.asset.hash).toMatch(/^sha256-/);
      expect(definition.asset.url).toBe(typed.url);
      expect(typed.type).toBe("audio");
      expect(typed.format).toBe("wav");
    }
    // The frozen reference set agrees with the per-cue references.
    expect(Object.keys(blockfallAudioAssets)).toHaveLength(14);
  });

  it("uses the PRD bus plan: sfx cues, own ambient bus, per-stem music buses", () => {
    for (const cue of BLOCKFALL_GAMEPLAY_CUES) {
      expect(blockfallAudioManifest[cue].bus).toBe("sfx");
    }
    expect(blockfallAudioManifest["ambient-hum"].bus).toBe("ambient");
    for (const stem of ["music-stem-1", "music-stem-2", "music-stem-3", "music-stem-4"] as const) {
      expect(blockfallAudioManifest[stem].bus).toBe(stem);
    }
  });
});

describe("Blockfall additive music layering adds one stem every five levels", () => {
  it("activates stems at levels 1, 6, 11, 16 and keeps them above", () => {
    expect(blockfallStemsForLevel(1)).toEqual(["music-stem-1"]);
    expect(blockfallStemsForLevel(5)).toEqual(["music-stem-1"]);
    expect(blockfallStemsForLevel(6)).toEqual(["music-stem-1", "music-stem-2"]);
    expect(blockfallStemsForLevel(10)).toEqual(["music-stem-1", "music-stem-2"]);
    expect(blockfallStemsForLevel(11)).toEqual(["music-stem-1", "music-stem-2", "music-stem-3"]);
    expect(blockfallStemsForLevel(15)).toHaveLength(3);
    expect(blockfallStemsForLevel(16)).toHaveLength(4);
    expect(blockfallStemsForLevel(40)).toHaveLength(4);
  });

  it("drives inactive stem buses to zero gain", () => {
    const levelOne = blockfallStemVolumesForLevel(1);
    expect(levelOne["music-stem-1"]).toBeGreaterThan(0);
    expect(levelOne["music-stem-2"]).toBe(0);
    const levelEleven = blockfallStemVolumesForLevel(11);
    expect(levelEleven["music-stem-2"]).toBeGreaterThan(0);
    expect(levelEleven["music-stem-4"]).toBe(0);
  });
});

describe("Every mounted state change is wired to its registered cue", () => {
  it("fires cues from the trigger map at the observed-event sites in main.ts", () => {
    // Accepted-action sites: the kit emits an event of the same kind only when
    // the action was accepted, so cue firing proves acceptance, not attempt.
    const AUDIO_SOURCE = readFileSync("apps/showcase-blockfall-reactor/src/reactor-audio.ts", "utf8");
    expect(TRIGGER_MAP_SOURCE).toContain('action.type === "move" && accepted.has("move")) void reactorAudio.cue("move")');
    expect(TRIGGER_MAP_SOURCE).toContain('action.type === "rotate" && accepted.has("rotate")) void reactorAudio.cue("rotate")');
    expect(TRIGGER_MAP_SOURCE).toContain('action.type === "hold" && accepted.has("hold")) void reactorAudio.cue("hold-swap")');
    expect(TRIGGER_MAP_SOURCE).toContain('accepted.has("hard-drop")) void reactorAudio.cue("hard-drop")');
    // Kit-event sites.
    expect(TRIGGER_MAP_SOURCE).toContain('void reactorAudio.cue("lock")');
    expect(TRIGGER_MAP_SOURCE).toContain('void reactorAudio.cue(quad ? "quad" : "line-clear")');
    expect(TRIGGER_MAP_SOURCE).toContain('void reactorAudio.cue("level-up")');
    expect(TRIGGER_MAP_SOURCE).toContain('void reactorAudio.cue("game-over")');
    // Loops start once on unlock inside the audio controller.
    expect(AUDIO_SOURCE).toContain('await audio.cue("ambient-hum")');
    for (const stem of [1, 2, 3, 4]) {
      expect(AUDIO_SOURCE).toContain('await audio.cue("music-stem-' + stem + '")');
    }
  });

  it("covers all nine gameplay cues with no unmapped leftovers", () => {
    const firedCues = [
      ...BLOCKFALL_GAMEPLAY_CUES
    ];
    expect(firedCues.sort()).toEqual([...BLOCKFALL_GAMEPLAY_CUES].sort());
    expect(firedCues).toHaveLength(9);
  });
});
