import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";

test.describe("Aura3D Animation Studio captions and visemes", () => {
  test.setTimeout(90_000);
  let server: ViteDevServer;
  let origin: string;

  test.beforeAll(async () => {
    ({ server, origin } = await startAnimationStudioServer());
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("exposes caption timing and mouth cue proof through the browser route", async ({ page }) => {
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#caption-overlay")).toBeVisible();

    const proof = await page.evaluate(() => {
      const proof = (window as unknown as {
        __AURA3D_ANIMATION_EPISODE_PROOF__?: {
          readonly captionIds?: readonly string[];
          readonly sourceOnlyAcceptedAsPublishProof?: boolean;
          readonly sourceProofs?: {
            readonly captionFrameSyncSourceProof?: {
              readonly sourceOnly?: boolean;
              readonly captionDisplayWithinOneFrame?: boolean;
              readonly coveredLineIds?: readonly string[];
              readonly missingLineIds?: readonly string[];
            };
            readonly visemeFrameSyncSourceProof?: {
              readonly sourceOnly?: boolean;
              readonly mouthMovementWithinOneFrame?: boolean;
              readonly coveredLineIds?: readonly string[];
              readonly missingLineIds?: readonly string[];
              readonly sampledMouthStates?: readonly unknown[];
            };
            readonly phonemeVisemeDubSyncSourceProof?: { readonly sourceOnly?: boolean; readonly visemeFormat?: string };
          };
          sampleAt(time: number): { readonly captionId?: string; readonly captionText?: string; readonly dialogueLineId?: string; readonly visemeId?: string };
        };
        __AURA3D_ANIMATION_EPISODE_SEEK__?: (time: number) => void;
      }).__AURA3D_ANIMATION_EPISODE_PROOF__;
      const seek = (window as unknown as { __AURA3D_ANIMATION_EPISODE_SEEK__?: (time: number) => void }).__AURA3D_ANIMATION_EPISODE_SEEK__;
      const seekTimes = [1, 6, 15, 21, 32, 43];
      const samples = seekTimes.map((time) => {
        seek?.(time);
        const overlay = document.querySelector("#caption-overlay") as HTMLElement | null;
        const sample = proof?.sampleAt(time);
        return {
          time,
          sample,
          overlayText: overlay?.textContent ?? "",
          overlayCaptionId: overlay?.dataset.captionId,
          overlayShotId: overlay?.dataset.shotId
        };
      });
      return {
        captionIds: proof?.captionIds ?? [],
        sourceOnlyAcceptedAsPublishProof: proof?.sourceOnlyAcceptedAsPublishProof,
        overlayText: document.querySelector("#caption-overlay")?.textContent ?? "",
        overlayCaptionId: (document.querySelector("#caption-overlay") as HTMLElement | null)?.dataset.captionId,
        samples,
        sourceProofs: proof?.sourceProofs
      };
    });

    expect(proof.captionIds).toHaveLength(6);
    expect(proof.overlayText).toMatch(/moon|robot|garden|lilies|stones|sparkle/i);
    expect(proof.overlayCaptionId).toBeTruthy();
    expect(proof.samples.every(({ sample, overlayText, overlayCaptionId }) => (
      Boolean(sample?.captionId)
        && Boolean(sample.captionText)
        && overlayCaptionId === sample.captionId
        && overlayText === sample.captionText
    ))).toBe(true);
    const speakingSamples = proof.samples.filter(({ sample }) => Boolean(sample?.dialogueLineId));
    expect(speakingSamples.length).toBeGreaterThan(0);
    expect(speakingSamples.every(({ sample }) => Boolean(sample?.visemeId))).toBe(true);
    expect(proof.sourceOnlyAcceptedAsPublishProof).toBe(false);

    expect(proof.sourceProofs?.captionFrameSyncSourceProof?.sourceOnly).toBe(true);
    expect(proof.sourceProofs?.captionFrameSyncSourceProof?.captionDisplayWithinOneFrame).toBe(true);
    expect(proof.sourceProofs?.captionFrameSyncSourceProof?.missingLineIds).toEqual([]);
    expect(proof.sourceProofs?.visemeFrameSyncSourceProof?.sourceOnly).toBe(true);
    expect(proof.sourceProofs?.visemeFrameSyncSourceProof?.mouthMovementWithinOneFrame).toBe(true);
    expect(proof.sourceProofs?.visemeFrameSyncSourceProof?.missingLineIds).toEqual([]);
    expect(proof.sourceProofs?.visemeFrameSyncSourceProof?.sampledMouthStates?.length ?? 0).toBeGreaterThan(0);
    expect(proof.sourceProofs?.phonemeVisemeDubSyncSourceProof?.sourceOnly).toBe(true);
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
