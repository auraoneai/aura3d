/// <reference types="node" />
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createAuraApp, scene } from "@aura3d/engine";
import { describe, expect, it } from "vitest";
import { MODEL_INFO } from "../../../src/aura-assets.js";
import {
  CHARACTERS,
  CHARACTER_DEFINITIONS,
  CHARACTER_IDS,
  CHARACTER_SHEETS,
  GESTURES,
  SHARED_GESTURES,
  SPEAKING_CHARACTER_IDS,
  characterSheet
} from "../../../src/characters/character-registry.js";
import { TIKO } from "../../../src/characters/tiko.js";
import { sampleCharacterSubParts, speechSubParts } from "../../../src/scenes/articulated-actors.js";
import { CAST_ASSET_KEYS, CAST_RIGS } from "../../../src/scenes/procedural-rigs/cast-rigs.js";
import { PROCEDURAL_RIGS, buildProceduralActor } from "../../../src/scenes/procedural-rigs/index.js";
import { buildTikoRig } from "../../../src/scenes/procedural-rigs/tiko-rig.js";
import { ASSET_TRAITS } from "../../../src/scenes/stand-ins.js";
import { WORLD_IDS } from "../../../src/scenes/worlds.js";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const sheetsDir = join(appRoot, "src", "characters", "sheets");

describe("B3.7 data-driven character sheets & generated cast", () => {
  it("loads all 7 recurring cast sheets in canonical order and matches generated-cast.ts", () => {
    const files = readdirSync(sheetsDir)
      .filter((f) => f.endsWith(".json"))
      .sort();
    expect(files).toEqual([
      "gogo.json",
      "lulu.json",
      "lumi.json",
      "momo.json",
      "peeko.json",
      "sheru.json",
      "tiko.json"
    ]);

    const diskSheets = files
      .map((f) => JSON.parse(readFileSync(join(sheetsDir, f), "utf8")))
      .sort((a, b) => a.order - b.order);

    expect(diskSheets.map((s) => s.id)).toEqual([
      "momo",
      "lulu",
      "sheru",
      "gogo",
      "lumi",
      "peeko",
      "tiko"
    ]);
    expect(CHARACTER_IDS).toEqual(["momo", "lulu", "sheru", "gogo", "lumi", "peeko", "tiko"]);
    expect(SPEAKING_CHARACTER_IDS).toEqual(["momo", "lulu", "gogo", "lumi", "peeko", "tiko"]);

    const seenVoices = new Set<string>();
    for (let idx = 0; idx < CHARACTER_IDS.length; idx += 1) {
      const id = CHARACTER_IDS[idx]!;
      const sheet = CHARACTER_SHEETS[id];
      const disk = diskSheets[idx];
      expect(sheet).toEqual(disk);
      expect(characterSheet(id)).toBe(sheet);
      expect(sheet.order).toBe(idx + 1);
      expect(WORLD_IDS).toContain(sheet.homeWorld);
      expect(sheet.colour).toMatch(/^#[0-9a-f]{6}$/i);

      // Registry & asset trait parity
      const def = CHARACTER_DEFINITIONS[id];
      const profile = CHARACTERS[id];
      const traits = ASSET_TRAITS[id];
      expect(def.color.toLowerCase()).toBe(sheet.colour.toLowerCase());
      expect(def.speaks).toBe(sheet.speaks);
      expect(def.defaultStyle).toBe(sheet.rig.defaultMove);
      expect(def.talkStrength).toBe(sheet.rig.talkStrength);
      expect(def.carryOffset).toEqual(sheet.rig.carryOffset);
      expect(profile.articulatedParts).toEqual(sheet.rig.articulatedParts);
      expect(MODEL_INFO[id].heightM).toBe(sheet.rig.heightM);
      expect(traits.defaultStyle).toBe(sheet.rig.defaultMove);
      expect(traits.idle).toBe(sheet.rig.idleStyle);
      expect(traits.turns).toBe(sheet.rig.turns);
      expect(Boolean(traits.floats)).toBe(sheet.rig.floats);

      // Voice & banter integrity
      if (!sheet.speaks) {
        expect(id).toBe("sheru");
        expect(sheet.voice).toBeNull();
        expect(sheet.banter.catchphrases).toEqual([]);
      } else {
        expect(sheet.voice).not.toBeNull();
        expect(sheet.voice?.provider).toBe("elevenlabs");
        expect(sheet.voice?.modelId).toBe("eleven_multilingual_v2");
        expect(seenVoices.has(sheet.voice?.voiceId ?? "")).toBe(false);
        seenVoices.add(sheet.voice?.voiceId ?? "");
        expect(sheet.banter.catchphrases.length).toBeGreaterThanOrEqual(2);
        for (const phrase of sheet.banter.catchphrases) {
          const words = phrase.trim().split(/\s+/).filter(Boolean);
          expect(words.length, `${id}: ${phrase}`).toBeLessThanOrEqual(9);
        }
      }
      expect(sheet.banter.bannedBehaviours.length).toBeGreaterThan(0);
      expect(sheet.banter.leadTopics.length).toBeGreaterThan(0);
      expect(Object.keys(sheet.banter.foils).length).toBeGreaterThan(0);
    }
  });

  it("captures Tiko's P3 character brief, banter foils, and banned behaviours accurately", () => {
    const tiko = CHARACTER_SHEETS.tiko;
    expect(tiko.displayName).toBe("Tiko");
    expect(tiko.speciesOrKind).toBe("gentle sea-green little turtle");
    expect(tiko.homeWorld).toBe("learning-cloud");
    expect(tiko.colour).toBe("#5bbf9a");
    expect(tiko.speaks).toBe(true);
    expect(tiko.banter.role).toBe("unhurried counter and careful observer");
    expect(tiko.banter.catchphrases).toEqual([
      "Slow and steady!",
      "Let's look closely.",
      "One... two... three!"
    ]);
    expect(tiko.banter.foils.lulu).toMatch(/Lulu/);
    expect(tiko.banter.foils.momo).toMatch(/Momo/);
    expect(tiko.banter.leadTopics).toEqual(["numbers", "shapes", "positions", "patience"]);
    expect(tiko.banter.bannedBehaviours.join(" ")).toMatch(/Never snaps or bites/);
    expect(TIKO.id).toBe("tiko");
  });
});

describe("B.8 Tiko sculpted procedural rig & gesture coverage", () => {
  it("sculpts Tiko with all 11 articulated turtle sub-parts, >= 45 sub-shapes, >= 3 crafts, and <= 12 draws", () => {
    expect(CAST_ASSET_KEYS).toContain("tiko");
    const rig = buildTikoRig();
    expect(CAST_RIGS.tiko.key).toBe("tiko");
    expect(PROCEDURAL_RIGS.tiko.key).toBe("tiko");

    const partNames = rig.parts.map((p) => p.part);
    expect(partNames).toEqual([
      "body",
      "head",
      "eyelidL",
      "eyelidR",
      "jaw",
      "cheekPuff",
      "armL",
      "armR",
      "footL",
      "footR",
      "tail"
    ]);

    const lobes = rig.parts.flatMap((p) => p.lobes);
    const crafts = new Set(lobes.map((l) => l.craft));
    expect(rig.subShapeCount).toBeGreaterThanOrEqual(45);
    expect(rig.triangleCount).toBeGreaterThanOrEqual(1800);
    expect(rig.triangleCount).toBeLessThanOrEqual(8000);
    expect(crafts.size).toBeGreaterThanOrEqual(3);
    expect(lobes.length).toBeLessThanOrEqual(12);
    expect(rig.staticDressingLobes.length).toBeGreaterThanOrEqual(1);
    expect(rig.staticDressingLobes.length).toBeLessThanOrEqual(6);

    // Verify grounded at y = 0 and normalized to unit height y = 1.0
    let minY = Infinity;
    let maxY = -Infinity;
    for (const sp of rig.parts) {
      for (const lobe of sp.lobes) {
        const pos = lobe.geometry.positions;
        for (let i = 1; i < pos.length; i += 3) {
          const y = sp.anchor[1] + (Number(pos[i]) || 0);
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    expect(minY).toBeCloseTo(0, 4);
    expect(maxY).toBeCloseTo(1, 4);
  });

  it("mounts Tiko cleanly in a headless Aura3D scene and drives SHARED_GESTURES + jaw speech sync", () => {
    const built = buildProceduralActor(PROCEDURAL_RIGS.tiko, {
      id: "tiko",
      key: "tiko",
      heightM: MODEL_INFO.tiko.heightM,
      interactive: true
    });
    expect(built.subParts.has("jaw")).toBe(true);
    expect(built.subParts.has("tail")).toBe(true);
    expect(built.tintableIds.length).toBeGreaterThan(0);

    const builder = scene();
    for (const node of built.nodes) builder.add(node);
    const app = createAuraApp(undefined, { scene: builder.toJSON(), autoStart: false });
    try {
      expect(app.nodes.get("tiko")).toBeDefined();
      expect(app.nodes.get("tiko__head")).toBeDefined();
      expect(app.nodes.get("tiko__jaw")).toBeDefined();
      expect(app.nodes.get("tiko__tail")).toBeDefined();
      expect(app.diagnostics().errors).toEqual([]);
    } finally {
      app.dispose();
    }

    // Every gesture in GESTURES resolves to a valid procedural motion (custom or SHARED_GESTURES fallback).
    for (const g of GESTURES) {
      const spec = CHARACTERS.tiko.procedural(g);
      expect(spec.durationSec, g).toBeGreaterThan(0);
    }
    expect(CHARACTERS.tiko.procedural("idle")).toBe(SHARED_GESTURES.idle);

    // Speech jaw articulation and blinking sub-parts
    expect(speechSubParts("tiko", 0, 0.2, false)).toBeUndefined();
    const speaking = speechSubParts("tiko", 0.9, 0.08, false);
    expect(speaking?.jaw?.rotation?.[0] ?? 0).toBeGreaterThan(0.15);

    const walkPose = sampleCharacterSubParts({
      id: "tiko",
      gesture: null,
      gestureElapsedSec: 0,
      gestureDurationSec: 1,
      loop: false,
      holding: false,
      locomotion: "walk",
      speechEnergy: 0.75,
      timeSec: 0.25,
      reducedMotion: false
    });
    expect(walkPose?.footL).toBeDefined();
    expect(walkPose?.footR).toBeDefined();
    expect(walkPose?.jaw).toBeDefined();
  });
});
