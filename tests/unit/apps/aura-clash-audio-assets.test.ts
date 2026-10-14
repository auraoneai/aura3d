import { describe, expect, it } from "vitest";
import { assets } from "../../../apps/aura-clash-showcase/src/aura-assets";
import {
  auraClashAudioAssets,
  auraClashAudioCueAssetKeys,
  auraClashAudioManifest
} from "../../../apps/aura-clash-showcase/src/playable/audio/auraClashAudioManifest";

describe("Aura Clash typed audio assets", () => {
  it("maps every gameplay cue to a registered contextual OGG asset", () => {
    const cues = Object.keys(auraClashAudioManifest);
    expect(cues.length).toBeGreaterThanOrEqual(10);

    for (const cue of cues) {
      const definition = auraClashAudioManifest[cue as keyof typeof auraClashAudioManifest];
      const assetKey = auraClashAudioCueAssetKeys[definition.cue];
      const generated = assets[assetKey];

      expect(definition.asset.key).toBe(assetKey);
      expect(definition.asset.typedAssetMember).toBe(`assets.${assetKey}`);
      expect(definition.asset.url).toBe(generated.url);
      expect(definition.asset.hash).toBe(generated.hash);
      expect(definition.asset.url).toMatch(/\/aura-assets\/auraClash.*Sfx\.[a-f0-9]{8}\.ogg$/);
      expect(generated.type).toBe("audio");
      expect(generated.format).toBe("ogg");
      expect(generated.metadata?.license).toBe("CC0-1.0");
      expect(generated.metadata?.author).toBe("Kenney");
      expect(generated.metadata?.provenance?.sourceUrl).toMatch(/^https:\/\/kenney\.nl\/assets\/(impact|interface|sci-fi)-sounds$/);
    }
  });

  it("uses a final asset set with no oscillator-only fallback contract", () => {
    const uniqueAssets = Object.values(auraClashAudioAssets);

    expect(uniqueAssets).toHaveLength(11);
    expect(new Set(uniqueAssets.map((asset) => asset.key)).size).toBe(11);
    expect(uniqueAssets.every((asset) => asset.license === "CC0-1.0" && asset.author === "Kenney")).toBe(true);
  });
});
