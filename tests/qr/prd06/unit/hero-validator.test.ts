/**
 * T4.6 (PRD-06 §6.9) — `aura3d animation validate-hero` profile checks:
 * geometry, texture and clip-set bars against real GLBs plus synthetic
 * inspection objects for the remaining codes.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  HERO_NOT_A_CHARACTER,
  HERO_NO_SKIN,
  HERO_TOO_FEW_JOINTS,
  HERO_MISSING_CLIP,
  HERO_CLIP_TOO_SHORT,
  HERO_UNTEXTURED,
  validateAnimationAssets,
  ANIMATION_ASSET_HERO_PROFILES
} from "../../../../packages/aura3d-cli/src/animation-asset-validator.js";
import { validateHeroGlb } from "../../../../packages/aura3d-cli/src/commands/prd06/validateHero.js";

const REPO = resolve(__dirname, "../../../..");
const SKYLINE = resolve(REPO, "apps/showcase-skyline-runner/generated/skylineArcticRunner.glb");
const SOLDIER = resolve(REPO, "fixtures/threejs-parity/assets/character/soldier.glb");

describe("T4.6 hero-character profile (GLB, §6.9)", () => {
  it("rejects skylineArcticRunner.glb with exactly the four codes", () => {
    const report = validateHeroGlb(new Uint8Array(readFileSync(SKYLINE)));
    expect(report.ok).toBe(false);
    expect([...report.reasonCodes].sort()).toEqual(
      [HERO_NOT_A_CHARACTER, HERO_NO_SKIN, HERO_TOO_FEW_JOINTS, HERO_MISSING_CLIP].sort()
    );
  });

  it("rejects soldier.glb with HERO_MISSING_CLIP only", () => {
    const report = validateHeroGlb(new Uint8Array(readFileSync(SOLDIER)));
    expect(report.ok).toBe(false);
    expect(report.reasonCodes).toEqual([HERO_MISSING_CLIP]);
    // soldier has Idle/Walk/Run; the jump set is unmapped.
    expect(report.missingActions).toEqual(["jump-start", "jump-loop", "land"]);
  });

  it("soldier still fails template-hero for missing clips AND the 15k-tri/50-joint bar", () => {
    const report = validateHeroGlb(new Uint8Array(readFileSync(SOLDIER)), { profile: "template-hero" });
    expect(report.ok).toBe(false);
    expect(report.reasonCodes).toContain(HERO_MISSING_CLIP);
    expect(report.reasonCodes).toContain(HERO_NOT_A_CHARACTER); // 11376 < 15000
    expect(report.reasonCodes).toContain(HERO_TOO_FEW_JOINTS); // 49 < 50
    expect(report.reasonCodes).not.toContain(HERO_NO_SKIN);
    expect(report.reasonCodes).not.toContain(HERO_UNTEXTURED);
  });
});

describe("T4.6 hero profile reason codes (synthetic inspection)", () => {
  const baseInspection = {
    triangleCount: 20_000,
    skinCount: 1,
    jointCount: 60,
    clips: [
      { name: "Idle", duration: 2.0 },
      { name: "Walk", duration: 1.0 },
      { name: "Run", duration: 0.8 },
      { name: "JumpStart", duration: 0.5 },
      { name: "JumpLoop", duration: 0.5 },
      { name: "Land", duration: 0.4 }
    ],
    hasBaseColorTexture: true
  };
  const clipMap = {
    idle: "Idle", walk: "Walk", run: "Run",
    "jump-start": "JumpStart", "jump-loop": "JumpLoop", land: "Land"
  };

  it("passes a complete hero-character asset", () => {
    const report = validateAnimationAssets({
      availableClips: baseInspection.clips.map((c) => c.name),
      clipMap,
      profile: "hero-character",
      inspection: baseInspection,
      requiredActions: ANIMATION_ASSET_HERO_PROFILES["hero-character"].requiredActions
    });
    expect(report.ok).toBe(true);
    expect(report.reasonCodes).toEqual([]);
  });

  it("reports HERO_CLIP_TOO_SHORT and HERO_UNTEXTURED", () => {
    const report = validateAnimationAssets({
      availableClips: baseInspection.clips.map((c) => c.name),
      clipMap,
      profile: "hero-character",
      inspection: {
        ...baseInspection,
        hasBaseColorTexture: false,
        clips: baseInspection.clips.map((c) => (c.name === "Land" ? { ...c, duration: 0.1 } : c))
      },
      requiredActions: ANIMATION_ASSET_HERO_PROFILES["hero-character"].requiredActions
    });
    expect([...report.reasonCodes].sort()).toEqual([HERO_CLIP_TOO_SHORT, HERO_UNTEXTURED].sort());
  });

  it("legacy path (no profile/inspection) returns empty reasonCodes", () => {
    const report = validateAnimationAssets({
      availableClips: ["Idle"],
      clipMap: { idle: "Idle" },
      requiredActions: ["idle", "walk"]
    });
    expect(report.reasonCodes).toEqual([]);
    expect(report.missingActions).toEqual(["walk"]);
  });
});
