import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createServer, type ViteDevServer } from "vite";

test.describe("Aura3D Animation Studio route proof", () => {
  test.setTimeout(90_000);
  let server: ViteDevServer;
  let origin: string;

  test.beforeAll(async () => {
    ({ server, origin } = await startAnimationStudioServer());
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("boots the animation-studio route and exposes episode proof", async ({ page }) => {
    const errors = captureErrors(page);
    await page.goto(origin, { waitUntil: "domcontentloaded" });

    await expect(page.locator("#app")).toBeVisible();
    await expect(page.locator("#caption-overlay")).toBeVisible();
    await expect(page.locator("#animation-studio-panel")).toBeVisible();

    const proof = await page.evaluate(() => {
      const proof = (window as unknown as {
        __AURA3D_ANIMATION_EPISODE_PROOF__?: {
          readonly proofKind?: string;
          readonly template?: string;
          readonly shots?: readonly unknown[];
          readonly captions?: readonly unknown[];
          readonly visemes?: readonly unknown[];
          readonly gestures?: readonly unknown[];
          readonly assets?: unknown;
          readonly renderStatus?: unknown;
          readonly errors?: readonly string[];
          readonly sourceOnlyAcceptedAsPublishProof?: boolean;
          readonly shotIds?: readonly string[];
          readonly captionIds?: readonly string[];
          readonly studio?: { readonly panels?: readonly string[]; readonly timelineTracks?: readonly { id: string; clips: readonly unknown[] }[] };
          readonly playbackProbeSamples?: readonly unknown[];
          sampleAt(time: number): unknown;
        };
      }).__AURA3D_ANIMATION_EPISODE_PROOF__;
      return {
        proofKind: proof?.proofKind,
        template: proof?.template,
        shotCount: proof?.shots?.length ?? 0,
        captionCount: proof?.captions?.length ?? 0,
        visemeCount: proof?.visemes?.length ?? 0,
        gestureCount: proof?.gestures?.length ?? 0,
        hasAssets: Boolean(proof?.assets),
        hasRenderStatus: Boolean(proof?.renderStatus),
        errors: proof?.errors ?? [],
        sourceOnlyAcceptedAsPublishProof: proof?.sourceOnlyAcceptedAsPublishProof,
        shotIds: proof?.shotIds ?? [],
        captionIds: proof?.captionIds ?? [],
        panels: proof?.studio?.panels ?? [],
        timelineTrackIds: proof?.studio?.timelineTracks?.map((track) => track.id) ?? [],
        timelineTrackClipCounts: proof?.studio?.timelineTracks?.map((track) => track.clips.length) ?? [],
        samples: [1, 21, 43].map((time) => proof?.sampleAt(time)),
        bodyShotCount: document.body.dataset.animationShotCount,
        bodyCaptionCount: document.body.dataset.animationCaptionCount,
        bodyPanels: document.body.dataset.animationStudioPanels
      };
    });

    expect(errors).toEqual([]);
    expect(proof.proofKind).toBe("aura3d-animation-episode-proof");
    expect(proof.template).toBe("animation-studio");
    expect(proof.shotCount).toBe(3);
    expect(proof.captionCount).toBe(6);
    expect(proof.visemeCount).toBeGreaterThan(0);
    expect(proof.gestureCount).toBeGreaterThan(0);
    expect(proof.hasAssets).toBe(true);
    expect(proof.hasRenderStatus).toBe(true);
    expect(Array.isArray(proof.errors)).toBe(true);
    expect(proof.sourceOnlyAcceptedAsPublishProof).toBe(false);
    expect(proof.shotIds).toEqual(["shot-moon-garden-open", "shot-glow-stone-teamwork", "shot-moon-garden-finish"]);
    expect(proof.captionIds).toHaveLength(6);
    expect(proof.panels).toEqual(["timeline", "assets", "performance", "render"]);
    expect(proof.timelineTrackIds).toEqual(["shots", "dialogue", "render"]);
    expect(proof.timelineTrackClipCounts.every((count) => count > 0)).toBe(true);
    expect(new Set(proof.samples.map((sample) => (sample as { shotId?: string } | undefined)?.shotId)).size).toBe(3);
    expect(proof.bodyShotCount).toBe("3");
    expect(proof.bodyCaptionCount).toBe("6");
    expect(proof.bodyPanels).toBe("timeline,assets,performance,render");
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

function captureErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error" && !text.includes("favicon") && !text.includes("404 (Not Found)")) {
      errors.push(text);
    }
  });
  return errors;
}
