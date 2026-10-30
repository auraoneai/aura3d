/**
 * Wonder World start screen layout (07 O8, the welcome): the app's own build in headless Chromium, at the sizes the
 * owner and the welcome review used. Remote runner only:
 *   apps/veer-wonder-world/tools/remote-run.sh start-screen                          (est. 15 min)
 *
 * Per viewport, once the start screen has faded in and the static splash is gone:
 * - the whole screen fits without scrolling, where the layout promises it (every size here but the small phones);
 * - the Start button is fully on screen without scrolling, at every size;
 * - the big line ("<name>'s Wonder World") takes at most two lines, and the heading's text reads "Welcome to ...";
 * - no rainbow band crosses the title, and no cloud touches a portrait or the title;
 * - every portrait ring is on screen;
 * - no console error, page error or bad response.
 * Records: WWJSON start-<viewport>. WWSHOT start-<viewport> is for review only: it shows the welcome name, so it is
 * never copied into evidence (07 O8).
 */
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { TEST_TIMEOUT_MS, attachPageLog, captureView, emitJson, emitShot, gotoWonderWorld, runContext, waitForHooks } from "./wonder-world-lib";

interface Viewport {
  readonly label: string;
  readonly width: number;
  readonly height: number;
  /** The start screen fits without scrolling (false: small phones, where only the Start button must be on screen). */
  readonly fits: boolean;
}

const VIEWPORTS: readonly Viewport[] = [
  { label: "desktop-1280x720", width: 1280, height: 720, fits: true },
  { label: "laptop-1366x768", width: 1366, height: 768, fits: true },
  { label: "desktop-1440x790", width: 1440, height: 790, fits: true },
  { label: "desktop-1920x970", width: 1920, height: 970, fits: true },
  { label: "ipad-landscape-1024x768", width: 1024, height: 768, fits: true },
  { label: "ipad-landscape-safari-1024x690", width: 1024, height: 690, fits: true },
  { label: "ipad-air-landscape-1180x740", width: 1180, height: 740, fits: true },
  { label: "ipad-portrait-768x1024", width: 768, height: 1024, fits: true },
  { label: "ipad-portrait-safari-768x950", width: 768, height: 950, fits: true },
  { label: "phone-390x844", width: 390, height: 844, fits: true },
  { label: "phone-375x667", width: 375, height: 667, fits: false },
  { label: "phone-320x568", width: 320, height: 568, fits: false },
  { label: "phone-landscape-844x390", width: 844, height: 390, fits: false }
];

// Software WebGL2 holds the main thread for long stretches while the stage boots, so a step gets two minutes.
const UI_TIMEOUT_MS = 120_000;

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface StartLayout {
  readonly scrollHeight: number;
  readonly clientHeight: number;
  readonly title: string;
  readonly nameLines: number;
  readonly name: Rect;
  readonly welcome: Rect;
  readonly button: Rect;
  readonly faces: readonly Rect[];
  readonly clouds: readonly Rect[];
  /** The rainbow's centre and band radii (radial-gradient circle at 50% 100%, farthest corner; bands 40%-67%). */
  readonly rainbow: { readonly cx: number; readonly cy: number; readonly inner: number; readonly outer: number } | null;
  readonly twoColumns: boolean;
}

async function startShown(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const screen = document.querySelector('[data-ui="start"]');
      return screen !== null && getComputedStyle(screen).opacity === "1" && document.querySelector('[data-ui="boot"]') === null;
    },
    undefined,
    { timeout: UI_TIMEOUT_MS }
  );
  // The portraits pop in over 1.2 s and the title rises over 0.8 s: measure the settled layout.
  await page.waitForTimeout(1_500);
}

async function startLayout(page: Page): Promise<StartLayout> {
  return page.evaluate(() => {
    const rect = (element: Element | null): { x: number; y: number; width: number; height: number } => {
      const box = element?.getBoundingClientRect();
      return box ? { x: box.x, y: box.y, width: box.width, height: box.height } : { x: 0, y: 0, width: 0, height: 0 };
    };
    const screen = document.querySelector('[data-ui="start"]') as HTMLElement;
    const name = screen.querySelector(".ww-start-name") as HTMLElement;
    const lineHeight = parseFloat(getComputedStyle(name).lineHeight) || parseFloat(getComputedStyle(name).fontSize) * 1.02;
    const visible = (element: Element): boolean => getComputedStyle(element).display !== "none" && element.getBoundingClientRect().width > 0;
    const rainbowEl = screen.querySelector(".ww-start-rainbow");
    let rainbow: StartLayout["rainbow"] = null;
    if (rainbowEl && visible(rainbowEl)) {
      const box = rainbowEl.getBoundingClientRect();
      const radius = Math.hypot(box.width / 2, box.height);
      rainbow = { cx: box.x + box.width / 2, cy: box.bottom, inner: 0.4 * radius, outer: 0.67 * radius };
    }
    const inner = screen.querySelector(".ww-start-inner") as HTMLElement;
    return {
      scrollHeight: screen.scrollHeight,
      clientHeight: screen.clientHeight,
      title: (screen.querySelector("h1")?.textContent ?? "").replace(/\s+/g, " ").trim(),
      nameLines: Math.round((name.getBoundingClientRect().height - parseFloat(getComputedStyle(name).paddingBottom)) / lineHeight),
      name: rect(name),
      welcome: rect(screen.querySelector(".ww-start-welcome")),
      button: rect(screen.querySelector(".ww-start-button")),
      faces: [...screen.querySelectorAll(".ww-start-face")].filter(visible).map(rect),
      // A cloud's puffs (::before, ::after) rise up to 0.7 of its height above its box.
      clouds: [...screen.querySelectorAll(".ww-start-cloud")].filter(visible).map((cloud) => {
        const box = rect(cloud);
        return { x: box.x, y: box.y - 0.7 * box.height, width: box.width, height: box.height * 1.7 };
      }),
      rainbow,
      twoColumns: getComputedStyle(inner).flexDirection === "row"
    } satisfies StartLayout;
  });
}

const overlaps = (a: Rect, b: Rect): boolean => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Does the band ring (inner..outer radius around the centre) reach into the rectangle? */
function ringCrosses(ring: NonNullable<StartLayout["rainbow"]>, box: Rect): boolean {
  const nearX = Math.max(box.x, Math.min(ring.cx, box.x + box.width));
  const nearY = Math.max(box.y, Math.min(ring.cy, box.y + box.height));
  const nearest = Math.hypot(nearX - ring.cx, nearY - ring.cy);
  const farX = Math.max(Math.abs(box.x - ring.cx), Math.abs(box.x + box.width - ring.cx));
  const farY = Math.max(Math.abs(box.y - ring.cy), Math.abs(box.y + box.height - ring.cy));
  const farthest = Math.hypot(farX, farY);
  return nearest < ring.outer && farthest > ring.inner;
}

test.describe("Wonder World start screen layout", () => {
  test.setTimeout(TEST_TIMEOUT_MS);
  let server: ExampleDevServer;
  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });
  test.afterAll(async () => {
    await server?.close();
  });

  for (const viewport of VIEWPORTS) {
    test(`fits and stays clear at ${viewport.label}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, hasTouch: true });
      try {
        const page = await context.newPage();
        const log = attachPageLog(page);
        await gotoWonderWorld(page, server, {});
        await waitForHooks(page, log);
        await startShown(page);
        const layout = await startLayout(page);
        emitShot(`start-${viewport.label}`, await captureView(page), "jpg");
        emitJson(`start-${viewport.label}`, { ...(await runContext(page, `start-${viewport.label}`)), viewport, layout });

        const where = viewport.label;
        if (viewport.fits) {
          expect(layout.scrollHeight, `${where}: the start screen scrolls (${layout.scrollHeight} > ${layout.clientHeight})`).toBeLessThanOrEqual(layout.clientHeight + 1);
        }
        const button = layout.button;
        expect(button.y >= 0 && button.y + button.height <= viewport.height + 0.5, `${where}: the Start button ${JSON.stringify(button)} is on screen`).toBe(true);
        expect(layout.title, `${where}: the heading reads "Welcome to ..."`).toMatch(/^Welcome to \S/);
        expect(layout.nameLines, `${where}: the big line takes ${layout.nameLines} lines`).toBeLessThanOrEqual(2);
        for (const [index, face] of layout.faces.entries()) {
          const onScreen = face.x >= -0.5 && face.y >= -0.5 && face.x + face.width <= viewport.width + 0.5 && face.y + face.height <= viewport.height + 0.5;
          expect(onScreen, `${where}: portrait ${index + 1} ${JSON.stringify(face)} is on screen`).toBe(true);
        }
        if (layout.rainbow) {
          expect(ringCrosses(layout.rainbow, layout.name), `${where}: a rainbow band crosses the big line`).toBe(false);
          expect(ringCrosses(layout.rainbow, layout.welcome), `${where}: a rainbow band crosses "Welcome to"`).toBe(false);
        }
        for (const [index, cloud] of layout.clouds.entries()) {
          const hits = [...layout.faces, layout.name, layout.welcome].filter((box) => overlaps(cloud, box));
          expect(hits, `${where}: cloud ${index + 1} ${JSON.stringify(cloud)} touches a portrait or the title`).toEqual([]);
        }
        expect(log.pageErrors, "page errors").toEqual([]);
        expect(log.consoleErrors, "console errors").toEqual([]);
        expect(log.badResponses, "bad responses").toEqual([]);
      } finally {
        await context.close();
      }
    });
  }
});
