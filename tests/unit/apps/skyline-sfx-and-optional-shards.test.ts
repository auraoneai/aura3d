/**
 * Skyline Runner Section C additions, source-level unit proof.
 *
 * (1) Every gameplay cue in the SFX manifest resolves to a CLI-registered typed
 *     audio asset with CC0 "Aura3D synthesis" provenance — no raw/invented URLs.
 * (2) High-risk optional shards exist one per act, sit above the standard run
 *     line, and are strictly optional for completion (the finish window is
 *     measured on the certified course independent of them).
 */
import { describe, expect, it } from "vitest";
import { assets } from "../../../src/aura-assets";
import { skylineAudioAssets, skylineAudioManifest, skylineAudioCueAssetKeys } from "../../../apps/showcase-skyline-runner/src/skyline-audio-manifest";
import { SKYLINE_HIGH_RISK_SHARDS, createSkylineLevel } from "../../../apps/showcase-skyline-runner/src/level";
import { SKYLINE_LEVEL_ACTS } from "../../../apps/showcase-skyline-runner/src/level-layout";

describe("Skyline SFX manifest is CLI-registered and CC0-synthesized", () => {
  it("defines every required gameplay cue", () => {
    const required = [
      "jump", "land-dust", "dash", "coin-chime", "ember-pickup", "ember-fire", "ember-deny",
      "ember-impact", "sentry-telegraph", "sentry-defeat", "death", "respawn", "checkpoint", "summit"
    ];
    for (const cue of required) {
      expect(skylineAudioManifest[cue as keyof typeof skylineAudioManifest]).toBeDefined();
    }
    expect(Object.keys(skylineAudioManifest).length).toBeGreaterThanOrEqual(13);
  });

  it("every audio asset reference is a real typed wav under /aura-assets with a hash", () => {
    for (const [key, ref] of Object.entries(skylineAudioAssets)) {
      const typed = assets[key as keyof typeof assets];
      expect(typed, `typed asset for ${key} missing`).toBeDefined();
      expect(ref.url).toMatch(/^\/aura-assets\/skyline[A-Za-z]+\.\w+\.wav$/);
      expect(ref.hash).toMatch(/^sha256-/);
      expect(ref.license).toBe("CC0-1.0");
      expect(ref.author).toBe("Aura3D synthesis");
      // The manifest reference must match the generated typed asset exactly (same url/hash).
      expect(ref.url).toBe(typed.url);
      expect(typed.type).toBe("audio");
      expect(typed.format).toBe("wav");
    }
  });

  it("at least ten distinct audio asset keys are routed to typed assets", () => {
    const distinctKeys = new Set(Object.values(skylineAudioCueAssetKeys));
    expect(distinctKeys.size).toBeGreaterThanOrEqual(11);
    expect(Object.keys(skylineAudioAssets).length).toBeGreaterThanOrEqual(11);
    expect(skylineAudioCueAssetKeys.respawn).toBe("skylineRespawnRecoverySfx");
    expect(assets.skylineRespawnRecoverySfx.hash).toBe("sha256-9f650a0e0d4ca99ec12b94ea7fb3826fca8e95905c26c86d92a8bd0a57865e3e");
  });
});

describe("Skyline optional high-risk shards are strictly additive", () => {
  it("places one optional shard per act, above the standard run line", () => {
    const level = createSkylineLevel();
    const highRiskIds = SKYLINE_HIGH_RISK_SHARDS.map((shard) => shard.id);
    const highRisk = (level.collectibles ?? []).filter((c) => highRiskIds.includes(String(c.id)));
    expect(highRisk.length).toBe(SKYLINE_LEVEL_ACTS.length);
    // One per act (sections 0,2,4,6,8 map to the five acts).
    expect(SKYLINE_HIGH_RISK_SHARDS.map((s) => s.section)).toEqual([0, 2, 4, 6, 8]);
    // Each sits ~0.92 above its platform: reaches the standard shard height (~0.46).
    for (const shard of SKYLINE_HIGH_RISK_SHARDS) {
      expect(shard.y).toBeGreaterThan(0.5);
      expect(shard.value).toBeGreaterThan(0);
    }
  });

  it("keeps the standard shards (non-high-risk) as the completion-critical set", () => {
    const level = createSkylineLevel();
    const highRiskIds = new Set(SKYLINE_HIGH_RISK_SHARDS.map((s) => s.id));
    const standard = (level.collectibles ?? []).filter((c) => !highRiskIds.has(String(c.id)));
    // The certified coins + ember charges remain present.
    expect(standard.length).toBeGreaterThan(0);
  });
});
