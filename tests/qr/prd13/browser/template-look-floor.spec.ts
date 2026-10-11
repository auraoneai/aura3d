import { expect, test, type Page } from "@playwright/test";
import { startPrd13DevServer, type ExampleDevServer } from "../dev-server";

// PRD-13 §7.5 / §17.2 — template look floor, runtime half (13-SPECS).
//
// Mounts each of the 20 create-aura3d templates as its own root
// (`/__template/<id>/index.html`, the template's own index.html, src/ and
// public/ — see ../dev-server.ts) with `a3d-qr=looks`, then asserts the §7.5
// runtime floor on the first settled frame:
//   - zero page errors, a live AuraApp, diagnostics().errors empty;
//   - non-blank frame (> 2 % lit samples, > 8 colour buckets — the
//     tools/agent-templates/look-floor.mjs thresholds);
//   - appliedLook.environment.specularIntensity > 0;
//   - appliedLook.shadows.strength ≥ 0.8 (a number: null is not a pass);
//   - appliedLook.pixelRatio ≥ min(devicePixelRatio, 2);
//   - diagnostics().look.id is the template's §6.4 look and look.lint has no
//     findings at all.
// animation-studio has a bespoke renderer and no AuraApp (look-floor.mjs
// anchor "set"); it asserts the page-error and non-blank-frame half only.
//
// Pack parity (mounting the packed tarball) and the 3-shot × 2-viewport panel
// are template-lookdev.yml's job (capture-templates.mjs + look-floor.mjs
// --runtime), not this spec's.

// §6.4 look per template — the same rows as TEMPLATE_LOOK_FLOOR in
// tools/agent-templates/look-floor.mjs.
const TEMPLATES: readonly { id: string; look: string; anchor: "preset" | "plan" | "set" }[] = [
  { id: "mini-game", look: "outdoor-day", anchor: "preset" },
  { id: "racing-starter", look: "golden-hour", anchor: "preset" },
  { id: "falling-blocks-starter", look: "neon-arcade", anchor: "preset" },
  { id: "fighting-game", look: "arena-fight", anchor: "preset" },
  { id: "character-controller", look: "outdoor-day", anchor: "preset" },
  { id: "arena-shooter", look: "space", anchor: "preset" },
  { id: "product-viewer", look: "product-studio", anchor: "preset" },
  { id: "cinematic-scene", look: "night-city", anchor: "plan" },
  { id: "animation-channel", look: "character-showcase", anchor: "preset" },
  { id: "prompt-animation-channel", look: "character-showcase", anchor: "preset" },
  { id: "episode-builder", look: "character-showcase", anchor: "preset" },
  { id: "animation-studio", look: "interior-warm", anchor: "set" },
  { id: "three-compat-premium-product-viewer", look: "product-studio", anchor: "preset" },
  { id: "three-compat-architecture-interior", look: "interior-warm", anchor: "preset" },
  { id: "three-compat-postprocess-scene", look: "neon-arcade", anchor: "preset" },
  { id: "three-compat-material-authoring", look: "product-studio", anchor: "preset" },
  { id: "three-compat-large-scene", look: "outdoor-day", anchor: "preset" },
  { id: "three-compat-character-viewer", look: "character-showcase", anchor: "preset" },
  { id: "three-compat-asset-inspector", look: "product-studio", anchor: "preset" },
  { id: "three-compat-custom-threejs-migration", look: "outdoor-day", anchor: "preset" }
];

interface AppliedLook {
  environment: { specularIntensity: number; background: string };
  shadows: { strength: number | null; mapRendered: boolean; casterName: string | null } | null;
  pixelRatio: number;
  renderPath: string;
}
interface FloorDiagnostics {
  errors: string[];
  drawCalls: number;
  devicePixelRatio: number;
  hdriStatus: string;
  appliedLook: AppliedLook | null;
  look: { id: string | null; expansion: string; lint: { code: string; severity: string; message: string }[] } | null;
}

async function readLiveApp(page: Page): Promise<FloorDiagnostics> {
  await expect
    .poll(() => page.evaluate(() => (window as { __AURA3D_LIVE_APPS__?: { count(): number } }).__AURA3D_LIVE_APPS__?.count() ?? 0), {
      timeout: 90_000
    })
    .toBeGreaterThan(0);
  return page.evaluate(async () => {
    type LiveApp = { ready(): Promise<void>; diagnostics(): Record<string, unknown> };
    const registry = (window as unknown as { __AURA3D_LIVE_APPS__: { all(): readonly LiveApp[] } }).__AURA3D_LIVE_APPS__;
    const app = registry.all()[0];
    await app.ready();
    const hdri = (): string =>
      ((app.diagnostics().renderer as { environment?: { hdriStatus?: string } } | undefined)?.environment?.hdriStatus) ?? "unknown";
    const deadline = performance.now() + 45_000;
    while (hdri() === "pending" && performance.now() < deadline) {
      await new Promise((resolveFrame) => requestAnimationFrame(() => resolveFrame(undefined)));
    }
    for (let i = 0; i < 3; i += 1) await new Promise((resolveFrame) => requestAnimationFrame(() => resolveFrame(undefined)));
    const d = app.diagnostics();
    return {
      errors: (d.errors as string[] | undefined) ?? [],
      drawCalls: (d.drawCalls as number | undefined) ?? 0,
      devicePixelRatio: globalThis.devicePixelRatio ?? 1,
      hdriStatus: hdri(),
      appliedLook: (d.appliedLook as AppliedLook | null | undefined) ?? null,
      look: (d.look as FloorDiagnostics["look"] | undefined) ?? null
    };
  });
}

/** Screenshot the largest canvas (composited output) and measure it in-page. */
async function measureCanvas(page: Page): Promise<{ brightFraction: number; uniqueBuckets: number; png: Buffer }> {
  const handle = await page.evaluateHandle(() => {
    const canvases = Array.from(document.querySelectorAll("canvas"));
    canvases.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight);
    return canvases[0] ?? null;
  });
  const canvas = handle.asElement();
  expect(canvas, "template renders into a <canvas>").not.toBeNull();
  const png = await canvas!.screenshot({ type: "png" });
  const metrics = await page.evaluate(async (base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
    const copy = document.createElement("canvas");
    copy.width = bitmap.width;
    copy.height = bitmap.height;
    const ctx = copy.getContext("2d")!;
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, copy.width, copy.height).data;
    let sampled = 0;
    let bright = 0;
    const buckets = new Set<number>();
    for (let y = 0; y < copy.height; y += 4) {
      for (let x = 0; x < copy.width; x += 4) {
        const o = (y * copy.width + x) * 4;
        const r = data[o] ?? 0;
        const g = data[o + 1] ?? 0;
        const b = data[o + 2] ?? 0;
        sampled += 1;
        buckets.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
        if (0.2126 * r + 0.7152 * g + 0.0722 * b > 48) bright += 1;
      }
    }
    return { brightFraction: sampled === 0 ? 0 : bright / sampled, uniqueBuckets: buckets.size };
  }, png.toString("base64"));
  return { ...metrics, png };
}

test.describe("§7.5 template look floor — runtime", () => {
  test.setTimeout(240_000);
  let server: ExampleDevServer;

  test.beforeAll(async () => {
    server = await startPrd13DevServer();
  });
  test.afterAll(async () => {
    await server.close();
  });

  for (const template of TEMPLATES) {
    test(`${template.id}: §7.5 runtime floor (${template.look})`, async ({ page }) => {
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.goto(`${server.origin}/__template/${template.id}/index.html?a3d-qr=looks`, { waitUntil: "domcontentloaded" });

      if (template.anchor === "set") {
        await page.waitForFunction(() => document.querySelector("canvas") !== null, undefined, { timeout: 90_000 });
        await page.waitForTimeout(3_000);
      }
      const diagnostics = template.anchor === "set" ? null : await readLiveApp(page);
      const frame = await measureCanvas(page);
      await test.info().attach(`${template.id}.png`, { body: frame.png, contentType: "image/png" });
      await test.info().attach(`${template.id}.diagnostics.json`, {
        body: JSON.stringify(diagnostics, null, 2),
        contentType: "application/json"
      });

      expect(pageErrors, "page errors").toEqual([]);
      expect(frame.brightFraction, "frame is not blank (> 2 % lit samples)").toBeGreaterThan(0.02);
      expect(frame.uniqueBuckets, "frame has colour variety (> 8 buckets)").toBeGreaterThan(8);
      // animation-studio (anchor "set") has no AuraApp; every other row asserts the full floor.
      expect(diagnostics === null, "only the bespoke-renderer row has no live AuraApp").toBe(template.anchor === "set");
      if (diagnostics !== null) {
        expect(diagnostics.errors).toEqual([]);
        expect(diagnostics.drawCalls).toBeGreaterThan(0);
        const applied = diagnostics.appliedLook;
        expect(applied, "diagnostics().appliedLook (C-31, lane 12) present").not.toBeNull();
        expect(applied!.environment.specularIntensity, "appliedLook.environment.specularIntensity > 0").toBeGreaterThan(0);
        expect(applied!.shadows, "appliedLook.shadows reported").not.toBeNull();
        expect(applied!.shadows!.strength, "appliedLook.shadows.strength is measured (not null)").not.toBeNull();
        expect(applied!.shadows!.strength!, "shadow strength ≥ 0.8").toBeGreaterThanOrEqual(0.8);
        expect(applied!.pixelRatio, "pixelRatio ≥ min(dpr, 2)").toBeGreaterThanOrEqual(
          Math.min(diagnostics.devicePixelRatio, 2) - 0.01
        );
        expect(diagnostics.look, "diagnostics().look populated under A3D_QR_LOOKS").not.toBeNull();
        expect(diagnostics.look!.id).toBe(template.look);
        expect(diagnostics.look!.lint, `look lint findings: ${JSON.stringify(diagnostics.look!.lint)}`).toEqual([]);
      }
    });
  }
});
