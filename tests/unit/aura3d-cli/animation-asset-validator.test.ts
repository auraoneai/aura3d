import { describe, expect, it } from "vitest";
import { DEFAULT_ANIMATION_ACTIONS, parseAnimationClipMap, validateAnimationAssets } from "../../../packages/aura3d-cli/src/animation-asset-validator";

describe("validateAnimationAssets", () => {
  const available = ["Idle_Loop", "Walk_Loop", "Sprint_Loop", "Punch_Jab"];

  it("passes when every required action maps to an available clip", () => {
    const report = validateAnimationAssets({
      availableClips: available,
      clipMap: { idle: "Idle_Loop", walk: "Walk_Loop", run: "Sprint_Loop" }
    });
    expect(report.ok).toBe(true);
    expect(report.failures).toEqual([]);
  });

  it("defaults to the idle/walk/run required action set", () => {
    const report = validateAnimationAssets({ availableClips: available, clipMap: { idle: "Idle_Loop", walk: "Walk_Loop", run: "Sprint_Loop" } });
    expect(DEFAULT_ANIMATION_ACTIONS).toEqual(["idle", "walk", "run"]);
    expect(report.ok).toBe(true);
  });

  it("fails when a required action is unmapped", () => {
    const report = validateAnimationAssets({ availableClips: available, clipMap: { idle: "Idle_Loop", walk: "Walk_Loop" } });
    expect(report.ok).toBe(false);
    expect(report.missingActions).toContain("run");
  });

  it("fails when a mapped clip is not present on the asset", () => {
    const report = validateAnimationAssets({ availableClips: available, clipMap: { idle: "Idle_Loop", walk: "Walk_Loop", run: "DoesNotExist" } });
    expect(report.ok).toBe(false);
    expect(report.missingClips).toContain("DoesNotExist");
  });

  it("requireRig fails an asset with no clips", () => {
    const report = validateAnimationAssets({ availableClips: [], clipMap: {}, requireRig: true });
    expect(report.ok).toBe(false);
    expect(report.failures.join(" ")).toMatch(/no animation clips/);
  });

  it("validates the real Aura Clash player clip set", () => {
    // clip names taken from the shipped auraClashPlayerRig manifest metadata
    const playerClips = ["Idle_Loop", "Walk_Loop", "Sprint_Loop", "Jump_Loop", "Crouch_Idle_Loop", "Sword_Idle", "Punch_Jab", "Punch_Cross", "Sword_Attack", "Hit_Chest", "Death01"];
    const report = validateAnimationAssets({
      availableClips: playerClips,
      requiredActions: ["idle", "walk", "run", "air", "down", "guard", "light", "heavy", "special", "hurt", "ko"],
      clipMap: { idle: "Idle_Loop", walk: "Walk_Loop", run: "Sprint_Loop", air: "Jump_Loop", down: "Crouch_Idle_Loop", guard: "Sword_Idle", light: "Punch_Jab", heavy: "Punch_Cross", special: "Sword_Attack", hurt: "Hit_Chest", ko: "Death01" },
      requireRig: true
    });
    expect(report.ok).toBe(true);
  });
});

describe("parseAnimationClipMap", () => {
  it("parses action=clip pairs", () => {
    expect(parseAnimationClipMap("idle=Idle_Loop,walk=Walk_Loop")).toEqual({ idle: "Idle_Loop", walk: "Walk_Loop" });
  });
  it("returns empty for undefined", () => {
    expect(parseAnimationClipMap(undefined)).toEqual({});
  });
});
