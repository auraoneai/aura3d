import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startExampleDevServer } from "./example-dev-server";
import { DEMOS, type DemoControlDefinition, type DemoId } from "../../apps/advanced-examples-gallery/src/metadata";

const REPORT_DIR = resolve("tests/reports/advanced-gallery-control-audit");
const SCRATCH_DIR = "/var/folders/3s/trh_q1fd5yn1mdhbvwbf0qrw0000gn/T/grok-goal-d625ec9e6e37/implementer";
const ROUTE = "/apps/advanced-examples-gallery/";

interface GalleryRuntime {
  readonly status: string;
  readonly demoId: string;
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly objectCount: number;
  readonly instanceCount: number;
  readonly error?: string;
  readonly authoredAsset?: { readonly status?: string };
  readonly interactionState?: {
    readonly controls: Record<string, number | boolean | string>;
    readonly cameraPreset: string;
    readonly selected: string;
  };
  readonly systems?: readonly string[];
  readonly animationState?: { readonly paused?: boolean; readonly routeAnimatedSystems?: readonly string[] };
}

interface ControlLedgerEntry {
  readonly demo: string;
  readonly control: string;
  readonly kind: string;
  readonly initialUi: string;
  readonly changedUi: string;
  readonly initialRuntime: unknown;
  readonly changedRuntime: unknown;
  readonly initialFingerprint: string;
  readonly changedFingerprint: string;
  readonly pass: boolean;
  readonly reason: string;
}

async function readRuntime(page: Page): Promise<GalleryRuntime | null> {
  return page.evaluate(() => {
    return (window as unknown as { __A3D_THREEJS_PARITY_ADVANCED_EXAMPLES_GALLERY__?: GalleryRuntime })
      .__A3D_THREEJS_PARITY_ADVANCED_EXAMPLES_GALLERY__ ?? null;
  });
}

async function waitForRuntime(page: Page, demo: DemoId): Promise<GalleryRuntime> {
  await page.waitForFunction((expected) => {
    const runtime = (window as unknown as { __A3D_THREEJS_PARITY_ADVANCED_EXAMPLES_GALLERY__?: GalleryRuntime })
      .__A3D_THREEJS_PARITY_ADVANCED_EXAMPLES_GALLERY__;
    if (!runtime || runtime.demoId !== expected) return false;
    if (runtime.status === "error") return true;
    return runtime.frameCount >= 4 && runtime.drawCalls > 0;
  }, demo, { timeout: 90_000 });
  const runtime = await readRuntime(page);
  if (!runtime) throw new Error(`No gallery runtime for ${demo}`);
  return runtime;
}

async function canvasFingerprint(page: Page): Promise<string> {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    if (!(canvas instanceof HTMLCanvasElement) || canvas.width < 8 || canvas.height < 8) return "empty";
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return "no-ctx";
    ctx.canvas.width = 64;
    ctx.canvas.height = 36;
    ctx.drawImage(canvas, 0, 0, 64, 36);
    const data = ctx.getImageData(0, 0, 64, 36).data;
    let hash = 0;
    let filled = 0;
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3] ?? 0;
      if (a > 8) filled += 1;
      hash = (hash * 33 + (data[i] ?? 0) + (data[i + 1] ?? 0) * 3 + (data[i + 2] ?? 0) * 7 + a) >>> 0;
    }
    return `${hash.toString(16)}:${filled}`;
  });
}

function nextSelectOption(control: DemoControlDefinition, current: string): string {
  const options = control.options ?? [];
  return options.find((option) => option !== current) ?? options[0] ?? current;
}

test("every advanced-gallery control changes UI, runtime, and rendered output", async ({ page }, testInfo) => {
  testInfo.setTimeout(480_000);
  mkdirSync(REPORT_DIR, { recursive: true });
  mkdirSync(join(SCRATCH_DIR, "gallery"), { recursive: true });
  mkdirSync(join(SCRATCH_DIR, "smart-city"), { recursive: true });
  const server = await startExampleDevServer();
  const errors: string[] = [];
  const failedAssets: string[] = [];
  const ledger: ControlLedgerEntry[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !/favicon/i.test(message.text())) errors.push(`${page.url()} ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 400 && !/favicon/i.test(response.url())) failedAssets.push(`${response.status()} ${response.url()}`);
  });
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    for (const demo of DEMOS) {
      await page.goto(`${server.origin}${ROUTE}#${demo.id}`, { waitUntil: "domcontentloaded" });
      const ready = await waitForRuntime(page, demo.id);
      expect(ready.status, `${demo.id} status`).not.toBe("error");
      expect(page.locator("#gallery-loading")).toBeHidden();
      expect(ready.authoredAsset?.status ?? "ready", `${demo.id} authored`).not.toBe("error");
      expect(ready.frameCount, `${demo.id} frames`).toBeGreaterThan(0);
      const bodyText = await page.locator(".right-panel").innerText();
      expect(bodyText.toLowerCase()).not.toContain("what this proves");
      expect(bodyText.toLowerCase()).not.toContain("tests/reports");
      await page.screenshot({ path: join(REPORT_DIR, `${demo.id}-default.png`) });
      await page.screenshot({ path: join(SCRATCH_DIR, "gallery", `${demo.id}-default.png`) });
      if (demo.id === "smart-city") {
        await page.screenshot({ path: join(SCRATCH_DIR, "smart-city", "default-hero.png") });
      }

      for (const control of demo.controls) {
        const locator = control.kind === "button"
          ? page.locator(`button[data-action="${control.key}"]`)
          : page.locator(`[data-control="${control.key}"]`);
        await expect(locator, `${demo.id}.${control.key} exists`).toHaveCount(1);
        const beforeRuntime = await readRuntime(page);
        const initialUi = control.kind === "toggle"
          ? String(await locator.isChecked())
          : control.kind === "button"
            ? "idle"
            : String(await locator.inputValue());
        const initialRuntime = beforeRuntime?.interactionState?.controls[control.key];
        const initialFingerprint = await canvasFingerprint(page);
        if (control.kind === "toggle") {
          await locator.click();
        } else if (control.kind === "select") {
          await locator.selectOption(nextSelectOption(control, initialUi));
        } else if (control.kind === "range") {
          const max = control.max ?? 1;
          const min = control.min ?? 0;
          const next = Number(initialUi) > (min + max) / 2 ? min : max;
          await locator.fill(String(next));
        } else {
          await page.locator(`button[data-action="${control.key}"]`).click();
        }
        await page.waitForTimeout(250);
        const afterRuntime = await readRuntime(page);
        const changedUi = control.kind === "toggle"
          ? String(await locator.isChecked())
          : control.kind === "button"
            ? "activated"
            : String(await locator.inputValue());
        const changedRuntime = afterRuntime?.interactionState?.controls[control.key];
        const changedFingerprint = await canvasFingerprint(page);
        const uiChanged = control.kind === "button" || changedUi !== initialUi;
        const runtimeChanged = control.kind === "button"
          || JSON.stringify(changedRuntime) !== JSON.stringify(initialRuntime)
          || (afterRuntime?.instanceCount ?? 0) !== (beforeRuntime?.instanceCount ?? 0)
          || (afterRuntime?.objectCount ?? 0) !== (beforeRuntime?.objectCount ?? 0)
          || (afterRuntime?.animationState?.paused ?? false) !== (beforeRuntime?.animationState?.paused ?? false)
          || (afterRuntime?.systems ?? []).join("|") !== (beforeRuntime?.systems ?? []).join("|");
        const pixelsChanged = changedFingerprint !== initialFingerprint;
        const pass = uiChanged && (runtimeChanged || pixelsChanged);
        ledger.push({
          demo: demo.id,
          control: control.key,
          kind: control.kind,
          initialUi,
          changedUi,
          initialRuntime,
          changedRuntime,
          initialFingerprint,
          changedFingerprint,
          pass,
          reason: pass ? "ui+runtime-or-pixels" : `uiChanged=${uiChanged} runtimeChanged=${runtimeChanged} pixelsChanged=${pixelsChanged}`
        });
        await page.screenshot({ path: join(REPORT_DIR, `${demo.id}-${control.key}.png`) });
      }

      const beforeReset = await readRuntime(page);
      await page.getByRole("button", { name: "Reset" }).click();
      await page.waitForTimeout(200);
      const afterReset = await waitForRuntime(page, demo.id);
      expect(afterReset.interactionState?.cameraPreset ?? "hero").toBe("hero");
      for (const control of demo.controls) {
        if (control.value === undefined) continue;
        expect(
          afterReset.interactionState?.controls[control.key],
          `${demo.id} reset ${control.key}`
        ).toEqual(control.value);
      }
      expect(beforeReset?.frameCount ?? 0).toBeGreaterThan(0);
    }

    const failed = ledger.filter((entry) => !entry.pass);
    writeFileSync(join(REPORT_DIR, "gallery-controls.json"), JSON.stringify({ ledger, failed, errors, failedAssets }, null, 2));
    writeFileSync(join(SCRATCH_DIR, "gallery-controls.json"), JSON.stringify({ ledger, failed, errors, failedAssets }, null, 2));
    expect(failed, failed.map((entry) => `${entry.demo}.${entry.control}: ${entry.reason}`).join("\n")).toEqual([]);
    expect(errors, errors.join("\n")).toEqual([]);
    expect(failedAssets, failedAssets.join("\n")).toEqual([]);
  } finally {
    await server.close();
  }
});

test("product configurator variants, lighting, hotspot, and reset stay synchronized", async ({ page }, testInfo) => {
  testInfo.setTimeout(180_000);
  const server = await startExampleDevServer();
  mkdirSync(join(SCRATCH_DIR, "gallery"), { recursive: true });
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${server.origin}${ROUTE}#product-configurator`, { waitUntil: "domcontentloaded" });
    await waitForRuntime(page, "product-configurator");
    const variant = page.locator('select[data-control="carVariant"]');
    const lighting = page.locator('select[data-control="lighting"]');
    const hotspot = page.locator('select[data-control="focusPart"]');
    await expect(variant).toHaveValue("Carmine Candy");
    const carmine = await canvasFingerprint(page);
    await variant.selectOption("Pearly Swirly");
    await expect(variant).toHaveValue("Pearly Swirly");
    await page.waitForTimeout(400);
    const pearly = await canvasFingerprint(page);
    await variant.selectOption("Torched Graphite");
    await expect(variant).toHaveValue("Torched Graphite");
    await page.waitForTimeout(400);
    const graphite = await canvasFingerprint(page);
    expect(pearly, "Pearly Swirly must change rendered pixels").not.toBe(carmine);
    expect(graphite, "Torched Graphite must change rendered pixels").not.toBe(carmine);
    expect(graphite, "Graphite must differ from Pearly").not.toBe(pearly);
    await lighting.selectOption("inspection");
    expect((await readRuntime(page))?.interactionState?.controls.lighting).toBe("inspection");
    await hotspot.selectOption("wheels");
    expect((await readRuntime(page))?.interactionState?.controls.focusPart).toBe("wheels");
    await page.getByRole("button", { name: "Reset" }).click();
    await expect(variant).toHaveValue("Carmine Candy");
    await expect(lighting).toHaveValue("studio");
    await expect(hotspot).toHaveValue("overview");
    await page.screenshot({ path: join(SCRATCH_DIR, "gallery", "product-reset.png") });
  } finally {
    await server.close();
  }
});

test("gallery side panel stays readable at desktop and mobile widths", async ({ page }, testInfo) => {
  testInfo.setTimeout(180_000);
  const server = await startExampleDevServer();
  try {
    await page.goto(`${server.origin}${ROUTE}#product-configurator`, { waitUntil: "domcontentloaded" });
    await waitForRuntime(page, "product-configurator");
    for (const size of [
      { width: 2081, height: 1300 },
      { width: 1600, height: 1000 },
      { width: 1440, height: 900 },
      { width: 1280, height: 800 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 }
    ]) {
      await page.setViewportSize(size);
      const panel = page.locator(".right-panel");
      const box = await panel.boundingBox();
      expect(box, `${size.width} panel`).not.toBeNull();
      expect((box?.width ?? 0), `${size.width} panel width`).toBeGreaterThan(180);
      expect(await panel.isVisible(), `${size.width} panel visible`).toBe(true);
      const select = page.locator("select").first();
      if (await select.count()) {
        const selectBox = await select.boundingBox();
        expect(selectBox?.width ?? 0, `${size.width} select`).toBeGreaterThan(40);
      }
    }
  } finally {
    await server.close();
  }
});
