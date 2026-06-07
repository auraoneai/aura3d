import { expect, test } from "@playwright/test";

test("cartoon studio storyboard caption renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/Aura3D cartoon studio|moon|robot/i)).toBeVisible();
});

test("storyboard playback, character performance, caption timing, cuts, and nonblank cartoon frames are sourced", async ({
  page
}) => {
  await page.goto("/");

  const routeProof = (await page.evaluate(() => {
    const template = (window as unknown as {
      __AURA3D_CARTOON_TEMPLATE__?: {
        shotIds: readonly string[];
        captionIds: readonly string[];
        storyBible?: unknown;
        studio?: unknown;
        playbackProbeSamples: readonly unknown[];
        sampleAt(time: number): unknown;
      };
    }).__AURA3D_CARTOON_TEMPLATE__;
    return {
      shotIds: template?.shotIds ?? [],
      captionIds: template?.captionIds ?? [],
      storyBible: template?.storyBible,
      studio: template?.studio,
      samples: [1, 21, 43].map((time) => template?.sampleAt(time)),
      playbackProbeSamples: template?.playbackProbeSamples ?? [],
      bodyShotCount: document.body.dataset.cartoonShotCount,
      bodyCaptionCount: document.body.dataset.cartoonCaptionCount,
      bodyPanels: document.body.dataset.cartoonStudioPanels
    };
  })) as {
    shotIds: string[];
    captionIds: string[];
    storyBible?: {
      props?: unknown[];
      styleGuide?: { visualStyle?: string };
      shotList?: unknown[];
    };
    studio?: {
      panels?: readonly string[];
      timelineTracks?: readonly { id: string; clips: readonly unknown[] }[];
      assetLibrary?: { commands?: readonly string[] };
      renderPipeline?: { itemCount?: number };
    };
    samples: Array<{
      shotId?: string;
      captionId?: string;
      captionText?: string;
      cameraMove?: string;
      transitionOut?: string;
      nodeUpdates?: Array<{ characterId?: string; action?: string; emotion?: string }>;
    }>;
    playbackProbeSamples: unknown[];
    bodyShotCount?: string;
    bodyCaptionCount?: string;
    bodyPanels?: string;
  };

  expect(routeProof.shotIds).toEqual([
    "shot-moon-garden-open",
    "shot-glow-stone-teamwork",
    "shot-moon-garden-finish"
  ]);
  expect(new Set(routeProof.samples.map((sample) => sample.shotId)).size).toBe(3);
  expect(routeProof.captionIds).toHaveLength(6);
  expect(routeProof.samples.every((sample) => sample.captionId && sample.captionText)).toBe(true);
  expect(routeProof.samples.some((sample) => sample.cameraMove === "push-in" || sample.transitionOut === "cut")).toBe(true);
  expect(routeProof.samples.flatMap((sample) => sample.nodeUpdates ?? []).some((update) => update.action === "speak")).toBe(true);
  expect(routeProof.samples.flatMap((sample) => sample.nodeUpdates ?? []).some((update) => update.characterId === "miko")).toBe(true);
  expect(routeProof.samples.flatMap((sample) => sample.nodeUpdates ?? []).some((update) => update.characterId === "luma")).toBe(true);
  expect(routeProof.storyBible?.props?.length).toBeGreaterThanOrEqual(3);
  expect(routeProof.storyBible?.styleGuide?.visualStyle).toMatch(/cartoon/i);
  expect(routeProof.storyBible?.shotList).toHaveLength(3);
  expect(routeProof.playbackProbeSamples).toHaveLength(3);
  expect(routeProof.bodyShotCount).toBe("3");
  expect(routeProof.bodyCaptionCount).toBe("6");
  expect(routeProof.studio?.panels).toEqual(["timeline", "assets", "performance", "render"]);
  expect(routeProof.studio?.timelineTracks?.map((track) => track.id)).toEqual(["shots", "dialogue", "render"]);
  expect(routeProof.studio?.timelineTracks?.every((track) => track.clips.length > 0)).toBe(true);
  expect(routeProof.studio?.assetLibrary?.commands?.some((command) => command.includes("assets validate-cartoon"))).toBe(true);
  expect(routeProof.studio?.renderPipeline?.itemCount).toBeGreaterThan(0);
  expect(routeProof.bodyPanels).toBe("timeline,assets,performance,render");
  await expect(page.locator("#cartoon-studio-panel")).toBeVisible();

  const screenshot = await page.screenshot();
  expect(screenshot.byteLength).toBeGreaterThan(2048);
});
