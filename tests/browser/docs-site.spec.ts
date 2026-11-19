import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const pathBPattern = new RegExp([
  ["provider", "runtime"].join("-"),
  "AuraScene" + "IR",
  "Mock" + "Provider",
  ["prompt", "to", "scene"].join("-")
].join("|"), "i");
const versionCyclePattern = new RegExp([
  `\\b${"V"}[234]\\b(?!\\.\\d)`,
  ["Path", "A"].join(" "),
  ["Path", "B"].join(" ")
].join("|"), "i");
const publicPlaceholderPattern = /placeholder|\bMVP\b|needs work|under review|\btoy\b|future work|\bTBD\b|FIXME|\bstub\b/i;

test.describe("docs and marketing site", () => {
  test.setTimeout(120_000);

  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startExampleDevServer();
  });

  test.afterAll(async () => {
    await server.close();
  });

  test("marketing page routes humans to docs, templates, and agent files", async ({ page }) => {
    await stubMarketingEmbeds(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${server.origin}/marketing/index.html`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#hero-title")).toHaveText(/Make a world\s*worth exploring/i);
    await expect(page.locator(".home-hero-grid")).toBeVisible();
    const heroDisplay = await page.locator(".home-hero-grid").evaluate((element) => getComputedStyle(element).display);
    expect(heroDisplay).toBe("grid");
    await expect(page.locator(".home-nav")).toBeVisible();
    await expect(page.locator(".home-hero-media .demo-stage[data-demo-kind='hero']")).toBeVisible();
    await expect(page.locator(".home-hero-media iframe[data-demo-frame]")).toBeAttached();
    await expect(page.locator(".home-hero-copy")).toContainText("TypeScript");
    expect(await page.locator("a[href='/llms.txt']").count()).toBeGreaterThanOrEqual(1);
    await expect(page.locator(".feature a[href='/games/the-bellkeepers-walk/']")).toBeVisible();
    await expect(page.locator("#examples h3")).toHaveText(["Ember Courier", "Vesper GT", "Relay Workcell"]);
    await expect(page.locator("#examples a[href$='/stage.ts.txt']")).toHaveCount(3);
    await expect(page.locator("#why a[href$='/wind.ts']")).toBeVisible();
    await expect(page.locator("#studio-snippet")).toContainText('looks.preset("product-studio")');
    await expect(page.locator("#templates")).toContainText("product-viewer");
    await expect(page.locator("#start-command")).toContainText("npm run dev");
    await expect(page.locator("#templates a[href='/docs/agent-quickstart']")).toBeVisible();
    await expect(page.locator("iframe[src]")).toHaveCount(0);
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toMatch(versionCyclePattern);
    expect(bodyText).not.toMatch(publicPlaceholderPattern);
    expect(bodyText).not.toMatch(pathBPattern);
    await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
    await page.waitForTimeout(250);
    const screenshot = await page.screenshot();
    expect(screenshot.byteLength).toBeGreaterThan(15_000);
    mkdirSync(resolve("tests/reports/docs-site"), { recursive: true });
    writeFileSync(resolve("tests/reports/docs-site/marketing-home.png"), screenshot);
  });

  test("marketing page keeps the restored design on mobile", async ({ page }) => {
    await stubMarketingEmbeds(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${server.origin}/marketing/index.html`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#hero-title")).toHaveText(/Make a world\s*worth exploring/i);
    await expect(page.locator(".home-menu-toggle")).toBeVisible();
    const mobileHero = page.locator(".home-hero-media .demo-stage[data-demo-kind='hero']");
    await expect(mobileHero).toBeVisible();
    await expect(mobileHero.locator("[data-demo-play]")).toBeVisible();
    await expect(page.locator("#templates")).toBeVisible();
    await expect(page.locator("#templates a[href='/docs/templates']")).toBeVisible();
    await page.locator(".home-menu-toggle").click();
    await expect(page.locator(".home-nav a[href='/docs/#examples']")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator(".home-menu-toggle")).toBeFocused();
  });

  test("mobile homepage hero renders when WebGPU is unavailable", async ({ page }) => {
    /*
     * Regression for the iOS blank-hero defect.  The old homepage embedded the
     * native-only WebGPU compute route.  That route correctly refused unsupported
     * devices, but its hidden embed chrome left only an empty black canvas.  This
     * test removes `navigator.gpu`, loads the real (unstubbed) mobile homepage and
     * requires the featured game to produce a running renderer
     * and pixels from the same CDN path used by the public page.
     */
    // The source server serves app folders. Mirror the production canonical route.
    await page.route("**/apps/the-bellkeepers-walk/**", async (route) => {
      const target = new URL(route.request().url());
      target.pathname = target.pathname.replace("/the-bellkeepers-walk/", "/showcase-where-the-wind-wanders-port/");
      await route.fulfill({ status: 307, headers: { location: target.href } });
    });
    await page.addInitScript(() => {
      try {
        Object.defineProperty(navigator, "gpu", { configurable: true, value: undefined });
      } catch (_error) {
        // The replacement hero does not require WebGPU; an immutable browser
        // property is therefore harmless, but the real route must still render.
      }
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${server.origin}/marketing/index.html`, { waitUntil: "domcontentloaded" });
    const stage = page.locator(".home-hero-media .demo-stage[data-demo-kind='hero']");
    await expect(stage).toBeVisible();
    await stage.locator("[data-demo-play]").click();
    const hero = stage.locator("iframe[data-demo-frame]");
    await expect(hero).toHaveAttribute("src", /the-bellkeepers-walk/);
    const heroHandle = await hero.elementHandle();
    const frame = await heroHandle?.contentFrame();
    expect(frame, "mobile hero iframe should have a document").toBeTruthy();
    await expect.poll(async () => frame?.evaluate(() => {
      const game = (window as unknown as { __AURA_WIND__?: { ready(): boolean; frames: number } }).__AURA_WIND__;
      return Boolean(game?.ready() && game.frames > 0);
    }), { timeout: 90_000 }).toBe(true);
    await page.waitForTimeout(800);
    const canvas = frame!.locator("canvas");
    await expect(canvas.first()).toBeVisible();
    // Capture the composited outer hero, not the iframe canvas in isolation.
    // WebGL canvases created without preserveDrawingBuffer may read back black
    // between presentation frames even while the browser compositor is visibly
    // displaying them; the customer-facing page composition is the contract here.
    const screenshot = await page.locator(".home-hero-media").screenshot();
    mkdirSync(resolve("tests/reports/docs-site"), { recursive: true });
    writeFileSync(resolve("tests/reports/docs-site/marketing-mobile-hero.png"), screenshot);
    expect(screenshot.byteLength).toBeGreaterThan(8_000);
  });

  test("marketing homepage passes its keyboard, semantics, contrast, and reduced-motion audit", async ({ page }) => {
    await stubMarketingEmbeds(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${server.origin}/marketing/index.html`, { waitUntil: "domcontentloaded" });

    await expect(page.locator("h1")).toHaveCount(1);
    const headingLevels = await page.locator("h1, h2, h3, h4, h5, h6").evaluateAll((headings) =>
      headings.map((heading) => Number(heading.tagName.slice(1)))
    );
    expect(headingLevels[0]).toBe(1);
    for (let index = 1; index < headingLevels.length; index += 1) {
      expect(headingLevels[index] - headingLevels[index - 1], `heading level skips at index ${index}`).toBeLessThanOrEqual(1);
    }

    const unnamedControls = await page.locator("a[href], button, input, select, textarea, [role='link']").evaluateAll((controls) =>
      controls.filter((control) => {
        const element = control as HTMLElement;
        const style = getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden") return false;
        const label = element.getAttribute("aria-label")
          ?? element.getAttribute("title")
          ?? element.textContent
          ?? "";
        return label.trim().length === 0;
      }).map((control) => control.outerHTML.slice(0, 180))
    );
    expect(unnamedControls).toEqual([]);

    const firstNavLink = page.locator(".home-nav a").first();
    await firstNavLink.focus();
    await expect(firstNavLink).toBeFocused();
    const focusStyle = await firstNavLink.evaluate((element) => {
      const style = getComputedStyle(element);
      return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
    });
    expect(focusStyle.outlineStyle).not.toBe("none");
    expect(Number.parseFloat(focusStyle.outlineWidth)).toBeGreaterThanOrEqual(2);

    const motion = await page.locator("body").evaluate(() => {
      const animated = [document.body, ...Array.from(document.body.querySelectorAll("*"))]
        .flatMap((element) => [element, ...(element === document.body ? ["::before", "::after"] : [])])
        .map((entry) => typeof entry === "string" ? getComputedStyle(document.body, entry) : getComputedStyle(entry))
        .filter((style) => style.animationName !== "none" && Number.parseFloat(style.animationDuration) > 0.001);
      return animated.length;
    });
    expect(motion).toBe(0);

    const contrast = await page.locator(":root").evaluate((root) => {
      const style = getComputedStyle(root);
      const parse = (value: string) => {
        const hex = value.trim().replace("#", "");
        return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
      };
      const luminance = (rgb: number[]) => rgb
        .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
        .reduce((sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index], 0);
      const ratio = (foreground: string, background: string) => {
        const lighter = Math.max(luminance(parse(foreground)), luminance(parse(background)));
        const darker = Math.min(luminance(parse(foreground)), luminance(parse(background)));
        return (lighter + 0.05) / (darker + 0.05);
      };
      return {
        body: ratio(style.getPropertyValue("--ink-1"), style.getPropertyValue("--bg")),
        accent: ratio(style.getPropertyValue("--accent"), style.getPropertyValue("--bg"))
      };
    });
    expect(contrast.body).toBeGreaterThanOrEqual(4.5);
    expect(contrast.accent).toBeGreaterThanOrEqual(4.5);
  });
});

async function stubMarketingEmbeds(page: Page): Promise<void> {
  await page.route("**/apps/**", async (route) => {
    await route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><body data-aura3d-ready="true" data-aura3d-draw-calls="1" style="margin:0;background:#05070a;color:#d8f6e7;font:13px monospace;display:grid;place-items:center;min-height:100vh"><canvas width="640" height="360" style="width:100%;height:100%;background:linear-gradient(135deg,#07140f,#14251d)"></canvas></body></html>`
    });
  });
}
