import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

test.setTimeout(60_000);

/**
 * E1 certified-rig mount proof for the character-controller template.
 *
 * The template hero must be one of the E1-certified hero rigs
 * (docs/rendering/skinning-and-morphs.md "Certified hero rigs") — currently
 * the humanoid-a slot: showcaseWalkAnimatedGirl / "Take 001". The mounted
 * asset id AND url assert against that roster; a capsule/placeholder swap
 * regresses this spec instead of silently shipping an uncertified hero.
 *
 * No raw GLB URL literal lives in this file (public-example-boundary): the
 * expected url is read from the template's own generated typed assets.
 */
const CERTIFIED_ROSTER = ["showcaseWalkAnimatedGirl"] as const;
function certifiedHeroFromTypedAssets(): { assetId: string; url: string; clip: string } {
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "src", "aura-assets.ts"), "utf8");
  for (const assetId of CERTIFIED_ROSTER) {
    const pattern = new RegExp(`${assetId}:([\\s\\S]*?)\\n  \\},?\\n`);
    const block = pattern.exec(source)?.[1] ?? "";
    const url = /url:\s*"([^"]+)"/.exec(block)?.[1];
    if (url) return { assetId, url, clip: "Take 001" };
  }
  throw new Error(`no certified-roster hero declared in the template typed assets (roster: ${CERTIFIED_ROSTER.join(", ")})`);
}
const CERTIFIED_HERO = certifiedHeroFromTypedAssets();

test("character-controller hero mounts the certified humanoid-a rig", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");
  await page.waitForFunction(
    () => Boolean((window as unknown as { __AURA3D_CHARACTER_CONTROLLER_PROOF__?: unknown }).__AURA3D_CHARACTER_CONTROLLER_PROOF__),
    undefined,
    { timeout: 45_000 }
  );
  const hero = await page.evaluate(
    () =>
      (window as unknown as { __AURA3D_CHARACTER_CONTROLLER_PROOF__?: { readonly hero?: { readonly assetId?: string; readonly url?: string; readonly clip?: string } } })
        .__AURA3D_CHARACTER_CONTROLLER_PROOF__?.hero
  );
  expect(hero?.assetId).toBe(CERTIFIED_HERO.assetId);
  expect(hero?.url).toBe(CERTIFIED_HERO.url);
  expect(hero?.clip).toBe(CERTIFIED_HERO.clip);
  expect(errors).toEqual([]);
});
