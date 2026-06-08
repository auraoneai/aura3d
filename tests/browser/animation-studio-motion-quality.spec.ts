import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";

test.describe("Aura3D Animation Studio motion quality evidence", () => {
  test.setTimeout(90_000);
  let server: ViteDevServer;
  let origin: string;

  test.beforeAll(async () => {
    ({ server, origin } = await startAnimationStudioServer());
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("samples multiple shots with character action changes instead of accepting still-image wobble", async ({ page }) => {
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#app")).toBeVisible();

    const motion = await page.evaluate(() => {
      const template = (window as unknown as {
        __AURA3D_ANIMATION_TEMPLATE__?: {
          sampleAt(time: number): {
            readonly shotId?: string;
            readonly cameraMove?: string;
            readonly visemeId?: string;
            readonly nodeUpdates?: readonly { readonly characterId?: string; readonly action?: string; readonly emotion?: string; readonly position?: unknown }[];
          };
        };
      }).__AURA3D_ANIMATION_TEMPLATE__;
      const samples = [1, 8, 21, 32, 43, 51].map((time) => ({ time, sample: template?.sampleAt(time) }));
      const updates = samples.flatMap(({ time, sample }) => (sample?.nodeUpdates ?? []).map((update) => ({ time, shotId: sample?.shotId, ...update })));
      return {
        samples,
        updates,
        actions: Array.from(new Set(updates.map((update) => update.action).filter(Boolean))),
        characters: Array.from(new Set(updates.map((update) => update.characterId).filter(Boolean))),
        positionsByCharacter: Object.fromEntries(
          Array.from(new Set(updates.map((update) => update.characterId).filter(Boolean))).map((characterId) => [
            characterId,
            Array.from(new Set(updates.filter((update) => update.characterId === characterId).map((update) => JSON.stringify(update.position))))
          ])
        ),
        cameraMoves: Array.from(new Set(samples.map(({ sample }) => sample?.cameraMove).filter(Boolean))),
        visemes: Array.from(new Set(samples.map(({ sample }) => sample?.visemeId).filter(Boolean)))
      };
    });

    expect(new Set(motion.samples.map(({ sample }) => sample?.shotId)).size).toBeGreaterThanOrEqual(3);
    expect(motion.characters).toEqual(expect.arrayContaining(["miko", "luma"]));
    expect(motion.actions).toEqual(expect.arrayContaining(["speak"]));
    expect(motion.cameraMoves.length).toBeGreaterThanOrEqual(2);
    expect(motion.visemes.length).toBeGreaterThan(0);
    expect(motion.positionsByCharacter.miko.length).toBeGreaterThanOrEqual(2);
    expect(motion.positionsByCharacter.luma.length).toBeGreaterThanOrEqual(2);

    const perCharacterActionCounts = new Map<string, Set<string>>();
    for (const update of motion.updates) {
      if (!update.characterId || !update.action) continue;
      const actions = perCharacterActionCounts.get(update.characterId) ?? new Set<string>();
      actions.add(update.action);
      perCharacterActionCounts.set(update.characterId, actions);
    }
    expect(perCharacterActionCounts.get("miko")?.has("speak")).toBe(true);
    expect(perCharacterActionCounts.get("luma")?.has("speak")).toBe(true);
  });
});

async function startAnimationStudioServer() {
  const root = resolve(process.cwd(), "packages/create-aura3d/templates/animation-studio");
  const server = await createServer({
    root,
    configFile: false,
    logLevel: "silent",
    server: {
      host: "127.0.0.1",
      strictPort: false
    }
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") {
    throw new Error("Animation Studio Vite server did not bind a TCP port.");
  }
  return { server, origin: `http://127.0.0.1:${address.port}/` };
}
