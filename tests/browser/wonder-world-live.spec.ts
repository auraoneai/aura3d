/**
 * Wonder World live preview (apps/veer-wonder-world/DEPLOYMENT.md sections 3 and 4): the deployed address, not a
 * local build. Remote runner only, after a deploy (apps/veer-wonder-world/tools/deploy-preview.sh --prod):
 *   apps/veer-wonder-world/tools/remote-run.sh live                                  (est. 10 min)
 * WONDER_LIVE_URL overrides the address (default https://aura3d-wonder-world.vercel.app/).
 *
 * 1. A visitor's load in headless Chromium with software WebGL2: the start screen, a tap on Start, the story menu
 *    with its 32 cards and their portraits, then a tap on E17's card and the story on stage. No console error, page
 *    error or bad response, no failed request besides ones the page cancelled itself (net::ERR_ABORTED, recorded),
 *    every request on the preview's own origin, and nothing stored but the settings record.
 * 2. The hosting rules on what the page fetched (plain requests, no browser): every response carries X-Robots-Tag
 *    noindex; the page revalidates (no-cache); hashed assets are immutable; models, sounds, fonts and the HDRIs have
 *    their content types; a missing file answers 404 rather than the page (no SPA fallback).
 * Records: WWJSON live-visit (live-visit-partial when a step fails) and live-hosting; WWSHOT live-start, live-menu and
 * live-story.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import {
  E17,
  SELECTORS,
  attachPageLog,
  captureView,
  emitJson,
  emitShot,
  expectPagePrivacy,
  readBootError,
  runContext,
  waitForHooks,
  waitForStoryOnStage,
  type PageLog
} from "./wonder-world-lib";

const LIVE_URL = new URL(process.env["WONDER_LIVE_URL"] ?? "https://aura3d-wonder-world.vercel.app/");
const VIEWPORT = { width: 800, height: 600 } as const;
// Software WebGL2 holds the main thread for long stretches during boot, so a UI step gets two minutes.
const UI_TIMEOUT_MS = 120_000;
const STORY_CARDS = 32;

/** Content types the hosting rules require, by file extension (DEPLOYMENT.md section 3). */
const CONTENT_TYPES: Readonly<Record<string, RegExp>> = {
  glb: /^model\/gltf-binary/,
  mp3: /^audio\/mpeg/,
  woff2: /^font\/woff2/,
  hdr: /^application\/octet-stream/,
  webp: /^image\/webp/,
  js: /^(?:text|application)\/javascript/,
  css: /^text\/css/
};

async function menuCards(page: Page): Promise<{ readonly cards: number; readonly portraits: number; readonly loaded: number }> {
  return page.evaluate(async () => {
    const images = [...document.querySelectorAll<HTMLImageElement>(".ww-card img.ww-card-portrait")];
    await Promise.all(
      images.map(
        (image) =>
          new Promise<void>((resolve) => {
            if (image.complete) resolve();
            else {
              image.addEventListener("load", () => resolve(), { once: true });
              image.addEventListener("error", () => resolve(), { once: true });
            }
          })
      )
    );
    return {
      cards: document.querySelectorAll(".ww-card").length,
      portraits: images.length,
      loaded: images.filter((image) => image.naturalWidth > 0).length
    };
  });
}

/** One URL of each kind the page fetched from the preview's origin, plus the page itself. */
function sampleUrls(log: PageLog): string[] {
  const urls = new Set<string>([LIVE_URL.href, new URL("index.html", LIVE_URL).href]);
  const seen = new Set<string>();
  for (const request of log.requests) {
    if (request.origin !== "same-origin") continue;
    const extension = new URL(request.url).pathname.split(".").pop() ?? "";
    if (!(extension in CONTENT_TYPES) || seen.has(extension)) continue;
    seen.add(extension);
    urls.add(request.url);
  }
  return [...urls];
}

async function hostingRules(request: APIRequestContext, log: PageLog): Promise<{ readonly checked: readonly Record<string, unknown>[]; readonly problems: readonly string[] }> {
  const problems: string[] = [];
  const checked: Record<string, unknown>[] = [];
  for (const url of sampleUrls(log)) {
    const response = await request.get(url, { maxRedirects: 0 });
    const headers = response.headers();
    const path = new URL(url).pathname;
    const extension = path.endsWith("/") ? "html" : path.split(".").pop() ?? "";
    const row = {
      path,
      status: response.status(),
      contentType: headers["content-type"] ?? null,
      cacheControl: headers["cache-control"] ?? null,
      robots: headers["x-robots-tag"] ?? null
    };
    checked.push(row);
    if (row.status !== 200) problems.push(`${path}: status ${row.status}`);
    if (!/\bnoindex\b/.test(row.robots ?? "")) problems.push(`${path}: no X-Robots-Tag noindex`);
    if (extension === "html" && row.cacheControl !== "no-cache") problems.push(`${path}: cache-control ${row.cacheControl}, not no-cache`);
    if (path.startsWith("/assets/") && row.cacheControl !== "public, max-age=31536000, immutable") {
      problems.push(`${path}: cache-control ${row.cacheControl}, not immutable`);
    }
    const expected = CONTENT_TYPES[extension];
    if (expected && !expected.test(row.contentType ?? "")) problems.push(`${path}: content-type ${row.contentType}`);
  }
  // A missing file must answer 404, not the page (no SPA fallback, DEPLOYMENT.md section 3).
  const missing = await request.get(new URL("assets/no-such-file.js", LIVE_URL).href, { maxRedirects: 0 });
  checked.push({ path: "/assets/no-such-file.js", status: missing.status(), robots: missing.headers()["x-robots-tag"] ?? null });
  if (missing.status() !== 404) problems.push(`a missing file answered ${missing.status()}, not 404`);
  return { checked, problems };
}

test.describe("Wonder World live preview", () => {
  test.setTimeout(30 * 60_000);

  test("a visitor's load of the deployed preview, then its hosting rules", async ({ page, request }) => {
    await page.setViewportSize(VIEWPORT);
    const log = attachPageLog(page, LIVE_URL.origin);
    const visit: Record<string, unknown> = {};
    let passed = false;
    try {
      await page.goto(LIVE_URL.href, { waitUntil: "commit", timeout: 120_000 });
      await waitForHooks(page, log);
      const start = page.locator(SELECTORS.start);
      await start.waitFor({ state: "visible", timeout: UI_TIMEOUT_MS });
      emitShot("live-start", await captureView(page), "jpg");

      await start.click({ timeout: UI_TIMEOUT_MS });
      await page.locator(SELECTORS.menu).waitFor({ state: "visible", timeout: UI_TIMEOUT_MS });
      const menu = await menuCards(page);
      visit["menu"] = menu;
      expect(menu.cards, "the story menu lists every story").toBe(STORY_CARDS);
      expect(menu.portraits, "every card has its host's portrait").toBe(STORY_CARDS);
      expect(menu.loaded, "every portrait loaded").toBe(STORY_CARDS);
      emitShot("live-menu", await captureView(page), "jpg");

      await page.locator(`.ww-card[data-story-id="${E17.id}"]`).click({ timeout: UI_TIMEOUT_MS });
      const state = await waitForStoryOnStage(page, log, E17.id);
      visit["story"] = { screen: state.screen, storyId: state.storyId, phase: state.director?.phase ?? null };
      emitShot("live-story", await captureView(page), "jpg");

      visit["privacy"] = await expectPagePrivacy(page, log, "live preview");
      expect(await readBootError(page), "__AURA_WONDER_WORLD_ERROR__").toBeNull();
      expect(log.pageErrors, "page errors").toEqual([]);
      expect(log.consoleErrors, "console errors").toEqual([]);
      expect(log.badResponses, "responses with an error status").toEqual([]);
      expect(log.failedRequests.filter((failure) => !failure.startsWith("net::ERR_ABORTED")), "failed requests").toEqual([]);
      passed = true;
    } finally {
      emitJson(passed ? "live-visit" : "live-visit-partial", {
        ...(await runContext(page, "live").catch(() => ({}))),
        url: LIVE_URL.href,
        ...visit,
        consoleErrors: log.consoleErrors,
        pageErrors: log.pageErrors,
        badResponses: log.badResponses,
        failedRequests: log.failedRequests,
        requests: log.requests.length
      });
    }

    const hosting = await hostingRules(request, log);
    emitJson("live-hosting", { url: LIVE_URL.href, ...hosting });
    expect(hosting.problems, "hosting rules").toEqual([]);
  });
});
