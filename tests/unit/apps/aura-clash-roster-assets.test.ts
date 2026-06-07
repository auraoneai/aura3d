import { describe, expect, it } from "vitest";
import {
  auraClashOriginalRoster,
  auraClashOriginalRosterIds
} from "../../../apps/aura-clash-showcase/src/fighters/originalRoster";

const finalReleaseRigKeys = new Set(["auraClashPlayerRig", "auraClashRivalRig"]);

describe("Aura Clash release roster assets", () => {
  it("references only final contextual typed fighter rigs", () => {
    expect(auraClashOriginalRosterIds.length).toBe(auraClashOriginalRoster.length);
    expect(auraClashOriginalRoster.length).toBeGreaterThanOrEqual(2);

    const typedMembers = auraClashOriginalRoster.map((fighter) => fighter.asset.typedAssetMember);
    expect(new Set(typedMembers)).toEqual(new Set(["assets.auraClashPlayerRig", "assets.auraClashRivalRig"]));

    for (const fighter of auraClashOriginalRoster) {
      expect(finalReleaseRigKeys.has(fighter.asset.fighter)).toBe(true);
      expect(fighter.asset.cliAssetName).toBe(fighter.asset.fighter);
      expect(fighter.asset.provenanceStatus).toBe("final-registered");
      expect(fighter.asset.sourcePath).toMatch(/assets\/quaternius-source\/selected\/animations\/UAL[12]_Standard\.glb$/);
      expect(fighter.asset.publicPath).toMatch(/public\/aura-assets\/auraClash(Player|Rival)Rig\.[a-f0-9]{8}\.glb$/);
      expect(fighter.asset.safeUsage).toContain(fighter.asset.typedAssetMember);
    }
  });
});
