import { test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Audit lane g25: A/B of the world.ts lighting/post edits. Each variant rewrites the served `world.ts` module text with one
 * edit reverted, so the brightness change between the base and the lane branch can be attributed to one edit.
 * Remote only (tools/remote-acr/run.sh). Output: `AB_META <json>` and `AB_JPG <variant>-<shot> <i>/<n> <b64>`.
 */
const LAB = "/examples/kid-goku-beyond-the-clouds-port/?manual=1";
const CHUNK = 16000;
const POINTS = [60, 520];
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
type Api = Record<string, any>;
declare global { interface Window { __AURA_KID_GOKU__?: Api; __AURA_CUMULUS_DASH__?: Api } }

/** Edits are applied to world.ts unless the pattern is listed under `main`. */
interface Variant { readonly name: string; readonly edits: readonly [RegExp, string][]; readonly main?: readonly [RegExp, string][] }
const VARIANTS: readonly Variant[] = [
  { name: "lane", edits: [] },
  { name: "oldsun", edits: [[/sun:\s*sunAnglesOf\(SUN_POS\)/, "sun: { azimuthDeg: 40, elevationDeg: 38 }"]] },
  { name: "vignette", edits: [[/b\.add\(\s*effects\.colorGrade\(\s*\{\s*name:\s*"grade"/, 'b.add(effects.vignette({ name: "vignette", intensity: 0.2, smoothness: 0.7 })); b.add(effects.colorGrade({ name: "grade"']] },
  { name: "bloomradius", edits: [[/threshold:\s*0\.88\s*\}/, "threshold: 0.88, radius: 0.5 }"]] },
  { name: "nocull", edits: [[/c\.radius\s*>\s*c\.range/, "c.radius > 1e9"]] },
  { name: "noflags", edits: [[/addMesh\(\s*buildCheckpointFlags\(ch\)/, "void (0"]] },
  { name: "nowarm", edits: [], main: [[/warmResult\s*=\s*await\s+warmPrograms\(/, "warmResult = null; void ("]] }
];

async function measure(page: Page): Promise<Record<string, number>> {
  return page.evaluate(async () => {
    const api = (window.__AURA_CUMULUS_DASH__ ?? window.__AURA_KID_GOKU__)!;
    api.render(1 / 60);
    const b64: string = await api.capture();
    const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const ctx = c.getContext("2d")!;
    ctx.drawImage(bmp, 0, 0);
    const w = bmp.width, h = bmp.height, d = ctx.getImageData(0, 0, w, h).data;
    let sum = 0, corner = 0, cornerN = 0, centre = 0, centreN = 0, clip = 0, road = 0, roadN = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, l = 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
      sum += l; if (l >= 250) clip++;
      if ((x < w * 0.1 || x > w * 0.9) && (y < h * 0.12 || y > h * 0.88)) { corner += l; cornerN++; }
      if (x > w * 0.4 && x < w * 0.6 && y > h * 0.4 && y < h * 0.6) { centre += l; centreN++; }
      if (x > w * 0.3 && x < w * 0.7 && y > h * 0.8) { road += l; roadN++; }
    }
    const r2 = (v: number) => Math.round(v * 100) / 100;
    return { mean: r2(sum / (w * h)), corner: r2(corner / cornerN), centre: r2(centre / centreN), road: r2(road / roadN), clipFrac: r2(clip / (w * h)) };
  });
}

test.describe("audit g25 cloud-runner-port A/B", () => {
  test.setTimeout(3_000_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  VARIANTS.forEach((v, i) => {
    test(`ab ${v.name} @ab${i < 3 ? "A" : "B"} @v-${v.name}`, async ({ page }) => {
      page.on("pageerror", (e) => log(`AB_ERR ${v.name} ${e.message.slice(0, 300)}`));
      const applied: boolean[] = [];
      const rewrite = (file: RegExp, edits: readonly [RegExp, string][]) => page.route(file, async (route) => {
        const res = await route.fetch();
        let body = await res.text();
        for (const [re, to] of edits) { applied.push(re.test(body)); body = body.replace(re, to); }
        await route.fulfill({ response: res, body });
      });
      if (v.edits.length) await rewrite(/kid-goku-beyond-the-clouds-port\/world\.ts/, v.edits);
      if (v.main?.length) await rewrite(/kid-goku-beyond-the-clouds-port\/main\.ts/, v.main);
      await page.setViewportSize({ width: 960, height: 540 });
      await page.goto(`${server.origin}${LAB}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => (window.__AURA_CUMULUS_DASH__ ?? window.__AURA_KID_GOKU__)?.ready === true, undefined, { timeout: 420_000, polling: 1000 });
      log(`AB_META ${JSON.stringify({ variant: v.name, applied })}`);
      await page.evaluate(() => { const a = (window.__AURA_CUMULUS_DASH__ ?? window.__AURA_KID_GOKU__)!; a.place(60); a.settle(2); });
      await page.waitForTimeout(30_000);
      for (const s of POINTS) {
        await page.evaluate((at) => { const a = (window.__AURA_CUMULUS_DASH__ ?? window.__AURA_KID_GOKU__)!; a.place(at); a.settle(3); }, s);
        await measure(page);
        const later = await measure(page);
        log(`AB_META ${JSON.stringify({ variant: v.name, shot: `luma-${s}`, later })}`);
        const b64 = await page.evaluate(async () => (window.__AURA_CUMULUS_DASH__ ?? window.__AURA_KID_GOKU__)!.frame(480, 270, 0.7) as Promise<string>);
        const n = Math.ceil(b64.length / CHUNK);
        for (let i = 0; i < n; i++) log(`AB_JPG ${v.name}-luma-${s} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
      }
      log(`AB_DONE ${v.name}`);
    });
  });
});
