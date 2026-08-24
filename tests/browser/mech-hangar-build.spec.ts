import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Mech Hangar BUILD spec — the anti-skin-swap proof.
 *
 * Proves, in the deployed artifact:
 *   - the 16-part curation matrix mounted with license-clean provenance,
 *   - cycling a slot changes rendered pixels AND stat bars (not cosmetic),
 *   - the live validator rejects an invalid (floating-part) build,
 *   - lock-in mounts the fighter into the arena.
 *
 * The pixel proof runs under prefers-reduced-motion so the only moving thing
 * between the two captures is the swapped part itself.
 */
let server: ExampleDevServer;
const REPORT_DIR = "tests/reports/mech-hangar";
const PRODUCER = "tests/browser/mech-hangar-build.spec.ts";
const ROUTE_SOURCE_FILES = [
  "apps/showcase-mech-hangar/src/arena/feel.ts",
  "apps/showcase-mech-hangar/src/arena/mech-fight.ts",
  "apps/showcase-mech-hangar/src/arena/rival.ts",
  "apps/showcase-mech-hangar/src/assembly.ts",
  "apps/showcase-mech-hangar/src/hangar-audio.ts",
  "apps/showcase-mech-hangar/src/hangar.ts",
  "apps/showcase-mech-hangar/src/hud.ts",
  "apps/showcase-mech-hangar/src/main.ts",
  "apps/showcase-mech-hangar/src/parts-catalog.ts",
  "apps/showcase-mech-hangar/src/parts-generated.ts",
  "apps/showcase-mech-hangar/src/stats.ts",
  "apps/showcase-mech-hangar/src/styles.css"
] as const;

function routeSourceSha256(): string {
  const hash = createHash("sha256");
  for (const file of ROUTE_SOURCE_FILES) {
    const relativeToApp = file.replace("apps/showcase-mech-hangar/", "");
    hash.update(relativeToApp).update("\0").update(readFileSync(file)).update("\0");
  }
  return hash.digest("hex");
}

function artifact(path: string) {
  return { path, sha256: createHash("sha256").update(readFileSync(path)).digest("hex") };
}

function writeReceipt(file: string, artifacts: readonly string[], details: Readonly<Record<string, unknown>> = {}): void {
  writeFileSync(`${REPORT_DIR}/${file}`, `${JSON.stringify({
    schema: "aura3d.mech-hangar.browser-evidence/1.0",
    generatedAt: new Date().toISOString(),
    producer: PRODUCER,
    producerSourceSha256: createHash("sha256").update(readFileSync(PRODUCER)).digest("hex"),
    routeSourceFiles: ROUTE_SOURCE_FILES,
    routeSourceSha256: routeSourceSha256(),
    artifacts: artifacts.map(artifact),
    details,
    pass: true
  }, null, 2)}\n`);
}

test.beforeAll(async () => { server = await startExampleDevServer(); });
test.afterAll(async () => { await server?.close(); });

interface EvidenceShape {
  mounted: boolean;
  mode: string;
  slots: readonly string[];
  selectedParts: readonly string[];
  assemblyValidated: boolean;
  catalogReady: boolean;
  curationVerdict: string;
  registeredAudioCues: number;
  stats: Readonly<Record<string, number>>;
  diagnostics: { drawCalls: number; renderSize: readonly number[]; runtimeBackend?: string };
}

async function readEvidence(page: import("@playwright/test").Page): Promise<EvidenceShape> {
  return page.evaluate(() => {
    const evidence = (window as unknown as Record<string, any>).__MECH_HANGAR_EVIDENCE__;
    return {
      mounted: Boolean(evidence?.mounted),
      mode: String(evidence?.mode ?? ""),
      slots: (evidence?.slots ?? []) as readonly string[],
      selectedParts: (evidence?.selectedParts ?? []) as readonly string[],
      assemblyValidated: Boolean(evidence?.assemblyValidated),
      catalogReady: Boolean(evidence?.catalogReady),
      curationVerdict: String(evidence?.curationVerdict ?? ""),
      registeredAudioCues: Number(evidence?.registeredAudioCues ?? 0),
      stats: { ...(evidence?.stats ?? {}) } as Readonly<Record<string, number>>,
      diagnostics: {
        drawCalls: Number(evidence?.diagnostics?.drawCalls ?? 0),
        renderSize: (evidence?.diagnostics?.renderSize ?? []) as readonly number[],
        runtimeBackend: evidence?.diagnostics?.runtimeBackend ? String(evidence.diagnostics.runtimeBackend) : undefined
      }
    };
  });
}

async function barWidth(page: import("@playwright/test").Page, testId: string): Promise<number> {
  return page.evaluate((id) => {
    const root = document.querySelector("[data-testid='" + id + "']");
    const fill = root ? root.querySelector(".mech-bar-fill") as HTMLElement | null : null;
    return fill ? parseFloat(fill.style.width) : -1;
  }, testId);
}

test.describe("Mech Hangar build", () => {
  test("curation gate passed; swaps move pixels and bars; lock-in mounts", async ({ page }) => {
    test.setTimeout(180_000);
    const consoleErrors: string[] = [];
    page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
    page.on("response", (response) => { if (response.status() >= 400) consoleErrors.push(response.status() + " " + response.url()); });

    // Reduced motion stabilizes the turntable for deterministic pixel capture.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(server.origin + "/apps/showcase-mech-hangar/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => {
      const evidence = (window as unknown as Record<string, any>).__MECH_HANGAR_EVIDENCE__;
      return Boolean(evidence?.mounted && evidence?.catalogReady);
    }, null, { timeout: 120_000 });
    // Let typed GLBs decode and the camera settle before capturing anything.
    await page.waitForTimeout(3_000);

    const evidence = await readEvidence(page);
    expect(evidence.mode).toBe("hangar");
    expect(evidence.catalogReady).toBe(true);
    expect(evidence.curationVerdict).toBe("GO");
    expect(evidence.slots).toEqual(["chassis", "arms", "legs", "weapon"]);
    expect(evidence.selectedParts).toHaveLength(4);
    expect(evidence.assemblyValidated).toBe(true);
    expect(evidence.registeredAudioCues).toBe(10);

    // The live validator must refuse a floating part using the exact plan the
    // lock gate validates (invalid builds rejected by validation before lock-in).
    const probe = await page.evaluate(() => {
      const probeFn = (window as unknown as Record<string, () => unknown>).__MECH_HANGAR_VALIDATION_PROBE__;
      return probeFn ? probeFn() : null;
    }) as { ready: boolean; errors: number } | null;
    expect(probe).not.toBeNull();
    expect(probe!.ready).toBe(false);
    expect(probe!.errors).toBeGreaterThan(0);

    if (!existsSync(REPORT_DIR)) mkdirSync(REPORT_DIR, { recursive: true });

    // ---- pixels change on a part swap ------------------------------------
    const stageShot = () => page.locator("#app").screenshot();
    const before = await stageShot();
    await page.waitForTimeout(1_500);
    const beforeAgain = await stageShot();
    // Stability control: reduced motion + no input renders identically.
    expect(before.equals(beforeAgain), "static scene should render identically").toBe(true);

    await page.keyboard.press("Digit2"); // arms slot
    await page.waitForTimeout(150);
    await page.keyboard.press("ArrowRight"); // cycle arms part
    await page.waitForTimeout(1_500);

    const afterSwap = await stageShot();
    expect(before.equals(afterSwap), "part swap must change rendered pixels (anti-skin-swap proof)").toBe(false);

    const swapped = await readEvidence(page);
    expect(swapped.selectedParts[1]).not.toBe(evidence.selectedParts[1]);

    // ---- stat bars track their parts -------------------------------------
    const guardOriginal = await barWidth(page, "stat-guard-bar"); // arms option A
    await page.keyboard.press("Digit2");
    await page.waitForTimeout(150);
    await page.keyboard.press("ArrowRight"); // arms -> option B (guard 5 vs 3)
    await page.waitForTimeout(600);
    const guardSwapped = await barWidth(page, "stat-guard-bar");
    expect(guardSwapped).not.toBe(guardOriginal);
    await page.keyboard.press("ArrowLeft"); // back to option A
    await page.waitForTimeout(600);
    const guardRestored = await barWidth(page, "stat-guard-bar");
    expect(guardRestored).toBe(guardOriginal);

    await page.screenshot({ path: REPORT_DIR + "/hangar-build.png" });
    await page.locator("#panel").screenshot({ path: REPORT_DIR + "/hangar-stat-panel.png" });

    // ---- lock-in mounts the fighter --------------------------------------
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => {
      const ev = (window as unknown as Record<string, any>).__MECH_HANGAR_EVIDENCE__;
      return ev?.mode === "arena";
    }, null, { timeout: 15_000 });
    await page.waitForFunction(() => {
      const ev = (window as unknown as Record<string, any>).__MECH_HANGAR_EVIDENCE__;
      return ev?.boutState === "fighting" || ev?.boutState === "countdown";
    }, null, { timeout: 10_000 });
    const arenaEvidence = await readEvidence(page);
    expect(arenaEvidence.mode).toBe("arena");

    await page.waitForTimeout(3_000);
    await page.screenshot({ path: REPORT_DIR + "/arena-opening.png" });

    // Touch controls exist mirroring the keys (dual-zone buttons).
    const touchButtons = await page.locator("[data-touch]").count();
    expect(touchButtons).toBeGreaterThanOrEqual(7);

    expect(consoleErrors, "route must mount without console errors or failed requests").toEqual([]);
    writeReceipt("build-core-evidence.json", [
      `${REPORT_DIR}/hangar-build.png`, `${REPORT_DIR}/hangar-stat-panel.png`, `${REPORT_DIR}/arena-opening.png`
    ], { curationVerdict: evidence.curationVerdict, catalogReady: evidence.catalogReady, invalidPlanErrors: probe!.errors, touchButtons });
  });

  test("all sixteen selections change assembly pixels and their owning gameplay stat", async ({ page }) => {
    test.setTimeout(240_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(server.origin + "/apps/showcase-mech-hangar/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as unknown as Record<string, any>).__MECH_HANGAR_EVIDENCE__?.catalogReady), null, { timeout: 120_000 });
    await page.waitForTimeout(2_500);

    const slotSpecs = [
      { slot: "chassis", key: "Digit1", index: 0, stat: "hpMax" },
      { slot: "arms", key: "Digit2", index: 1, stat: "guardMax" },
      { slot: "legs", key: "Digit3", index: 2, stat: "moveSpeed" },
      { slot: "weapon", key: "Digit4", index: 3, stat: "lightDamage" }
    ] as const;
    const entries: Array<Record<string, unknown>> = [];
    const stage = page.locator("#app");

    for (const spec of slotSpecs) {
      await page.keyboard.press(spec.key);
      const pixelHashes = new Set<string>();
      const partIds = new Set<string>();
      const statValues = new Set<number>();
      for (let option = 0; option < 4; option += 1) {
        if (option > 0) {
          await page.keyboard.press("ArrowRight");
          await page.waitForTimeout(550);
        }
        const evidence = await readEvidence(page);
        const screenshot = await stage.screenshot();
        const pixelSha256 = `sha256-${createHash("sha256").update(screenshot).digest("hex")}`;
        const partId = evidence.selectedParts[spec.index] ?? "missing";
        const statValue = Number(evidence.stats[spec.stat]);
        pixelHashes.add(pixelSha256);
        partIds.add(partId);
        statValues.add(statValue);
        entries.push({ slot: spec.slot, option, partId, stat: spec.stat, statValue, pixelSha256, assemblyValidated: evidence.assemblyValidated });
        expect(evidence.assemblyValidated, `${partId} assembly validation`).toBe(true);
      }
      expect(partIds.size, `${spec.slot} has four typed selections`).toBe(4);
      expect(pixelHashes.size, `${spec.slot} options have four distinct rendered assemblies`).toBe(4);
      expect(statValues.size, `${spec.slot} options have four distinct ${spec.stat} results`).toBe(4);
      await page.screenshot({ path: `${REPORT_DIR}/part-swap-${spec.slot}.png` });
      await page.keyboard.press("ArrowRight"); // D -> A before testing the next slot.
      await page.waitForTimeout(350);
    }

    const finalEvidence = await readEvidence(page);
    writeFileSync(`${REPORT_DIR}/part-matrix.json`, `${JSON.stringify({
      schema: "aura3d.mech-hangar.part-matrix/1.0",
      generatedAt: new Date().toISOString(),
      producer: PRODUCER,
      producerSourceSha256: createHash("sha256").update(readFileSync(PRODUCER)).digest("hex"),
      routeSourceFiles: ROUTE_SOURCE_FILES,
      routeSourceSha256: routeSourceSha256(),
      matrixSize: entries.length,
      entries,
      diagnostics: finalEvidence.diagnostics,
      pass: entries.length === 16
    }, null, 2)}\n`);
    expect(entries).toHaveLength(16);
  });

  test("mobile hangar and arena preserve the model, passport, HUD, and touch controls", async ({ page }) => {
    test.setTimeout(180_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(server.origin + "/apps/showcase-mech-hangar/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => Boolean((window as unknown as Record<string, any>).__MECH_HANGAR_EVIDENCE__?.catalogReady), null, { timeout: 120_000 });
    await page.waitForTimeout(2_000);
    expect(await page.locator("#app canvas").count()).toBe(1);
    expect(await page.locator("#panel").isVisible()).toBe(true);
    expect(await page.locator("[data-testid='stat-guard-bar']").isVisible()).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: `${REPORT_DIR}/hangar-mobile.png`, fullPage: true });

    await page.keyboard.press("Enter");
    await page.waitForFunction(() => (window as unknown as Record<string, any>).__MECH_HANGAR_EVIDENCE__?.mode === "arena", null, { timeout: 15_000 });
    expect(await page.locator("[data-touch]").count()).toBeGreaterThanOrEqual(7);
    expect(await page.locator(".mech-arena-panel").isVisible()).toBe(true);
    await page.evaluate(() => {
      const tick = (window as unknown as Record<string, ((frames: number) => unknown) | undefined>).__MECH_HANGAR_SIM_TICK__;
      tick?.(90);
    });
    await page.waitForFunction(() => (window as unknown as Record<string, any>).__MECH_HANGAR_EVIDENCE__?.boutState === "fighting", null, { timeout: 10_000 });
    await page.waitForTimeout(1_500);
    await page.screenshot({ path: `${REPORT_DIR}/arena-mobile.png`, fullPage: true });
    writeReceipt("mobile-evidence.json", [`${REPORT_DIR}/hangar-mobile.png`, `${REPORT_DIR}/arena-mobile.png`], {
      viewport: { width: 390, height: 844 }, touchButtons: await page.locator("[data-touch]").count(), reducedMotion: true
    });
  });
});
