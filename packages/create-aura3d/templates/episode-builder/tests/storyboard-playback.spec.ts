import { expect, test } from "@playwright/test";

test("episode builder storyboard caption renders", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/Aura3D episode builder|moon|robot/i)).toBeVisible();
});

test("storyboard playback, character performance, caption timing, cuts, and nonblank animation frames are sourced", async ({
  page
}) => {
  await page.goto("/");

  const routeProof = (await page.evaluate(() => {
    const template = (window as unknown as {
      __AURA3D_ANIMATION_TEMPLATE__?: {
        shotIds: readonly string[];
        captionIds: readonly string[];
        storyBible?: unknown;
        builder?: unknown;
        playbackProbeSamples: readonly unknown[];
        sampleAt(time: number): unknown;
      };
    }).__AURA3D_ANIMATION_TEMPLATE__;
    return {
      shotIds: template?.shotIds ?? [],
      captionIds: template?.captionIds ?? [],
      storyBible: template?.storyBible,
      builder: template?.builder,
      samples: [1, 21, 43].map((time) => template?.sampleAt(time)),
      playbackProbeSamples: template?.playbackProbeSamples ?? [],
      bodyShotCount: document.body.dataset.animationShotCount,
      bodyCaptionCount: document.body.dataset.animationCaptionCount,
      bodyFormats: document.body.dataset.episodeBuilderFormats
    };
  })) as {
    shotIds: string[];
    captionIds: string[];
    storyBible?: {
      props?: unknown[];
      styleGuide?: { visualStyle?: string };
      shotList?: unknown[];
    };
    builder?: {
      formats?: readonly { id: string }[];
      wizardSteps?: readonly { id: string; complete: boolean }[];
      compiledEpisode?: { shotCount?: number; captionCount?: number; renderQueueItems?: number };
      typedAssets?: { commands?: readonly string[] };
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
    bodyFormats?: string;
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
  expect(routeProof.storyBible?.styleGuide?.visualStyle).toMatch(/animation/i);
  expect(routeProof.storyBible?.shotList).toHaveLength(3);
  expect(routeProof.playbackProbeSamples).toHaveLength(3);
  expect(routeProof.bodyShotCount).toBe("3");
  expect(routeProof.bodyCaptionCount).toBe("6");
  expect(routeProof.builder?.formats?.map((format) => format.id)).toEqual([
    "short-form",
    "standard",
    "series-pilot",
    "educational",
    "music-video"
  ]);
  expect(routeProof.builder?.wizardSteps?.some((step) => step.id === "beats" && step.complete)).toBe(true);
  expect(routeProof.builder?.compiledEpisode?.shotCount).toBe(3);
  expect(routeProof.builder?.compiledEpisode?.captionCount).toBe(6);
  expect(routeProof.builder?.compiledEpisode?.renderQueueItems).toBeGreaterThan(0);
  expect(routeProof.builder?.typedAssets?.commands?.some((command) => command.includes("assets validate-animation"))).toBe(true);
  expect(routeProof.bodyFormats).toBe("short-form,standard,series-pilot,educational,music-video");
  await expect(page.locator("#episode-builder-panel")).toBeVisible();

  const screenshot = await page.screenshot();
  expect(screenshot.byteLength).toBeGreaterThan(2048);
});
