import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

test.setTimeout(60_000);

/**
 * E1 certified-rig mount proof for the mini-game template.
 *
 * The template hero must be one of the E1-certified hero rigs
 * (docs/rendering/skinning-and-morphs.md "Certified hero rigs") — currently
 * the vehicle-driver slot: showcaseKenneyOobiPlatformerHero / "walk".
 * The mounted asset id AND url assert against that roster; a fixture swap
 * regresses this spec instead of silently shipping an uncertified hero.
 *
 * No raw GLB URL literal lives in this file (public-example-boundary): the
 * expected url is read from the template's own generated typed assets.
 */
const CERTIFIED_ROSTER = ["showcaseKenneyOobiPlatformerHero"] as const;
function certifiedHeroFromTypedAssets(): { assetId: string; url: string } {
  const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "src", "aura-assets.ts"), "utf8");
  for (const assetId of CERTIFIED_ROSTER) {
    const pattern = new RegExp(`${assetId}:[\\s\\S]*?url:\\s*"([^"]+)"`);
    const match = pattern.exec(source);
    if (match?.[1]) return { assetId, url: match[1] };
  }
  throw new Error(`no certified-roster hero declared in the template typed assets (roster: ${CERTIFIED_ROSTER.join(", ")})`);
}
const CERTIFIED_HERO = certifiedHeroFromTypedAssets();

test("mini-game hero mounts the certified vehicle-driver rig", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => page.locator("body").getAttribute("data-aura3d-ready"), { timeout: 45_000 }).toBe("true");
  const hero = await page.evaluate(
    () => (window as unknown as { readonly __AURA3D_MINI_GAME__?: { readonly hero?: { readonly assetId?: string; readonly url?: string } } }).__AURA3D_MINI_GAME__?.hero
  );
  expect(hero?.assetId).toBe(CERTIFIED_HERO.assetId);
  expect(hero?.url).toBe(CERTIFIED_HERO.url);
});
