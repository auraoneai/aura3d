import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

test.setTimeout(90_000);

/**
 * E1 certified-rig mount proof for the fighting-game template.
 *
 * Both fighters must be E1-certified hero rigs
 * (docs/rendering/skinning-and-morphs.md "Certified hero rigs"):
 * - player: showcaseWalkAnimatedGirl (humanoid-a) / "Take 001"
 * - rival: showcaseRunnerRobot (creature) / "WALK"
 * The mounted asset ids AND urls assert against that roster; a placeholder or
 * fixture swap regresses this spec instead of silently shipping uncertified
 * heroes.
 */
/*
 * No raw GLB URL literal lives in this file (public-example-boundary): expected
 * urls are read from the template's own generated typed assets. A placeholder
 * or fixture swap (roster id gone from aura-assets.ts) throws here instead of
 * silently shipping uncertified heroes.
 */
const CERTIFIED_ROSTER = {
  player: { assetId: "showcaseWalkAnimatedGirl", certifiedClip: "Take 001" },
  rival: { assetId: "showcaseRunnerRobot", certifiedClip: "WALK" }
} as const;
function heroUrlFromTypedAssets(assetId: string): string {
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "src", "aura-assets.ts"), "utf8");
  const pattern = new RegExp(`${assetId}:([\\s\\S]*?)\\n  \\},?\\n`);
  const block = pattern.exec(source)?.[1] ?? "";
  const url = /url:\s*"([^"]+)"/.exec(block)?.[1];
  if (!url) throw new Error(`certified-roster hero ${assetId} missing from the template typed assets`);
  return url;
}
const CERTIFIED_HEROES = {
  player: { ...CERTIFIED_ROSTER.player, url: heroUrlFromTypedAssets(CERTIFIED_ROSTER.player.assetId) },
  rival: { ...CERTIFIED_ROSTER.rival, url: heroUrlFromTypedAssets(CERTIFIED_ROSTER.rival.assetId) }
} as const;

test("fighting-game fighters mount certified hero rigs", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => Boolean((window as any).__AURA3D_GAME_SOURCE__?.readiness), undefined, {
    polling: 100,
    timeout: 60_000
  });
  const source = await page.evaluate(() => (window as any).__AURA3D_GAME_SOURCE__);
  expect(source?.heroAssets?.player).toMatchObject(CERTIFIED_HEROES.player);
  expect(source?.heroAssets?.rival).toMatchObject(CERTIFIED_HEROES.rival);
  expect(source?.missingAssets ?? []).toEqual([]);
  expect(source?.readiness?.proofMode).toBe("typed-assets");
});
