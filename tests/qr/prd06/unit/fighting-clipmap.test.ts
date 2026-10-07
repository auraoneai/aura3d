/**
 * PRD-06 T0.9a — the fighting-clipmap lane fixture. Every gameplay state
 * resolves to a real GLB clip (duration > 0 via the T0.7 CLI extraction on the
 * template's actual assets), the declared stand-in count matches the emitted
 * warnings, unmapped states and absent clips fail with FIGHTER_CLIP_MISSING.
 */

import { describe, expect, it, vi, afterEach } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { inspectAnimationClips, readGlbDocument } from "../../../../packages/aura3d-cli/src/commands/prd06/inspectAnimationClips";
import { assets } from "../../../../packages/create-aura3d/templates/fighting-game/src/aura-assets";
import {
  FIGHTER_CLIPS,
  fighterClipMap,
  validateFighterClipMap,
  type FighterAssetKey,
  type FighterClip
} from "../fixtures/fighting-clipmap/fighterClipMap";

const templatePublicDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../packages/create-aura3d/templates/fighting-game/public"
);

const glbPath = (assetKey: FighterAssetKey): string => join(templatePublicDir, assets[assetKey].url);

const clipInfos = (assetKey: FighterAssetKey) => {
  const { json, bin } = readGlbDocument(new Uint8Array(readFileSync(glbPath(assetKey))));
  return inspectAnimationClips(json, bin);
};

const DECLARED_STAND_INS = Object.values(fighterClipMap)
  .flatMap((states) => Object.values(states))
  .filter((entry) => entry.standIn === true).length;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fighting-clipmap fixture (T0.9a)", () => {
  it("every state resolves to a GLB clip with duration > 0", () => {
    for (const assetKey of Object.keys(fighterClipMap) as FighterAssetKey[]) {
      const infos = clipInfos(assetKey);
      const byName = new Map(infos.map((info) => [info.name, info] as const));
      const states = fighterClipMap[assetKey];
      for (const state of FIGHTER_CLIPS) {
        const info = byName.get(states[state].clip);
        expect(info, `${assetKey}.${state} -> "${states[state].clip}"`).toBeDefined();
        expect(info!.duration, `${assetKey}.${state} duration`).toBeGreaterThan(0);
        expect(info!.channelCount).toBeGreaterThan(0);
      }
    }
  });

  it("the stand-in count equals the declared count", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const report = validateFighterClipMap();
    expect(report.ok).toBe(true);
    expect(report.standIns).toHaveLength(DECLARED_STAND_INS);
    const emitted = warn.mock.calls.filter(([first]) => String(first).startsWith("FIGHTER_CLIP_STAND_IN"));
    expect(emitted).toHaveLength(DECLARED_STAND_INS);
  });

  it("unmapped states fail with FIGHTER_CLIP_MISSING", () => {
    const map = {
      showcaseWalkAnimatedGirl: Object.fromEntries(
        Object.entries(fighterClipMap.showcaseWalkAnimatedGirl).filter(([state]) => state !== "hitstun")
      ) as Partial<Record<FighterClip, { clip: string }>>
    };
    expect(() => validateFighterClipMap(map as never)).toThrowError(/FIGHTER_CLIP_MISSING.*hitstun/);
  });

  it("a mapped clip absent from the asset throws FIGHTER_CLIP_MISSING with the list", () => {
    const map = {
      showcaseRunnerRobot: { ...fighterClipMap.showcaseRunnerRobot, special: { clip: "FIREBALL" } }
    };
    try {
      validateFighterClipMap(map as never);
      expect.unreachable("expected FIGHTER_CLIP_MISSING");
    } catch (error) {
      expect(String(error)).toContain("FIGHTER_CLIP_MISSING");
      expect((error as { missing?: readonly { clip?: string }[] }).missing?.[0]?.clip).toBe("FIREBALL");
    }
  });
});
