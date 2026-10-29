import { test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Aura FC 3D 4.5.0 upgrade-guide checks (docs/upgrade-4.5.0/aura-fc-3d.md checklist; lane G09). Remote only. Logs:
 *   FC_DIAG <json>   app.diagnostics() render path, bloom fusion, unavailable entries, OPTION_IGNORED, console warnings,
 *                    black-frame guard rung, and steady-state luma of the default load vs `?aura3d-render=production`.
 *   GL_JPG ...       canvas JPEGs (decode with the lane decoder).
 */
const CHUNK = 16000;
const HOOK = "__AURA_AURA_FC_3D__";
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const CANVAS_ONLY = "body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important} html,body{background:#000 !important}";

let server: ExampleDevServer;
test.setTimeout(3_000_000);
test.beforeAll(async () => { server = await startExampleDevServer(); });
test.afterAll(async () => { await server?.close(); });

async function luma(page: Page, png: Buffer) {
  return page.evaluate(async (b64) => {
    const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext("2d")!; ctx.drawImage(bmp, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let sum = 0; for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
    return +(sum / (d.length / 4)).toFixed(2);
  }, png.toString("base64"));
}

/** Mean luma of a 28x14 px box at each in-view athlete's feet (projected from the published camera pose): the contact areas AO and contact shadows darken. */
async function footLuma(page: Page, png: Buffer, width: number, height: number) {
  return page.evaluate(async ([b64, w, h]) => {
    const ev = (window as any).__AURA3D_GAME_EVIDENCE__;
    if (!ev?.camera) return null;
    const [ex, ey, ez] = ev.camera.position as number[];
    const [tx, ty, tz] = ev.camera.target as number[];
    let fx = tx - ex, fy = ty - ey, fz = tz - ez; const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
    let rx = -fz, rz = fx; const rl = Math.hypot(rx, rz); rx /= rl; rz /= rl;
    const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
    const tanV = Math.tan((ev.camera.fov * Math.PI) / 360), tanH = tanV * (w / h);
    const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
    const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext("2d")!; ctx.drawImage(bmp, 0, 0);
    const out: { id: string; px: [number, number]; mean: number }[] = [];
    for (const a of ev.athletes ?? []) {
      const dx = a.x - ex, dy = 0.02 - ey, dz = a.z - ez;
      const depth = dx * fx + dy * fy + dz * fz; if (depth <= 0.1) continue;
      const sx = (dx * rx + dz * rz) / depth / tanH, sy = (dx * ux + dy * uy + dz * uz) / depth / tanV;
      const px = Math.round((sx * 0.5 + 0.5) * w), py = Math.round((0.5 - sy * 0.5) * h);
      if (px < 14 || py < 7 || px > w - 14 || py > h - 7) continue;
      const d = ctx.getImageData(px - 14, py - 7, 28, 14).data;
      let sum = 0; for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
      out.push({ id: a.id, px: [px, py], mean: +(sum / (d.length / 4)).toFixed(1) });
    }
    return out;
  }, [png.toString("base64"), width, height] as const);
}

const VARIANTS = [
  ["default", "?autoplay=1&venue=munich&qa=1"],
  ["production", "?autoplay=1&venue=munich&qa=1&aura3d-render=production"],
  ["ao-off", "?autoplay=1&venue=munich&qa=1&ao=0"]
] as const;
for (const [name, query] of VARIANTS) {
  test(`fc-diag-${name}`, async ({ page }) => {
    const warnings: string[] = [];
    page.on("console", (m) => { if (m.type() === "warning" || m.type() === "error") warnings.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
    page.on("pageerror", (e) => warnings.push(`pageerror: ${e.message.slice(0, 200)}`));
    page.on("response", (r) => { if (r.status() >= 400) warnings.push(`http ${r.status()} ${r.url().replace(server.origin, "")}`); });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${server.origin}/apps/showcase-aura-fc-3d/index.html${query}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
    await page.waitForFunction((h) => (window as any)[h]?.ready?.() === true, HOOK, { timeout: 600_000, polling: 1000 });
    // steady state: advance the sim 40 s of match time, then wait for fresh frames
    await page.evaluate((h) => (window as any)[h].step(2400), HOOK);
    const f0 = await page.evaluate(() => (window as any).__AURA3D_GAME_EVIDENCE__?.framesRendered ?? 0);
    await page.waitForFunction((s) => ((window as any).__AURA3D_GAME_EVIDENCE__?.framesRendered ?? 0) >= s + 3, f0, { timeout: 180_000, polling: 500 }).catch(() => undefined);
    const diag = await page.evaluate(() => {
      const app = (window as any).__AURA3D_LIVE_APPS__?.all?.()[0];
      const dg = app?.diagnostics?.() ?? {};
      const heal = (window as any).__AURA3D_HEAL__;
      const text = (v: unknown) => { try { return JSON.stringify(v); } catch { return String(v); } };
      const all = text(dg);
      return {
        renderPath: dg.renderPath ?? null,
        drawCalls: dg.drawCalls ?? null,
        unavailable: dg.unavailable ?? dg.lighting?.unavailable ?? null,
        optionIgnored: (all.match(/OPTION_IGNORED[^"]*/g) ?? []).slice(0, 10),
        contactMentions: (all.match(/contact[^"]{0,80}/gi) ?? []).slice(0, 10),
        diagKeys: Object.keys(dg),
        heal: heal ? { name: heal.name ?? null, observation: (() => { try { return heal.observation?.(); } catch (e) { return String(e); } })() } : null
      };
    });
    const handle = await page.addStyleTag({ content: CANVAS_ONLY });
    await page.waitForTimeout(250);
    const png = await page.screenshot({ type: "png" });
    const jpg = await page.screenshot({ type: "jpeg", quality: 72 });
    await handle.evaluate((el) => el.remove());
    const players = await page.evaluate(() => (window as any).__AURA3D_GAME_EVIDENCE__?.athletes?.map((a: any) => [a.x, a.z]) ?? []);
    log(`FC_DIAG ${JSON.stringify({ name, query, mean: await luma(page, png), feet: await footLuma(page, png, 1280, 720), players, diag, warnings: warnings.filter((w) => !/favicon|fonts\//.test(w)).slice(0, 30) })}`);
    const b64 = jpg.toString("base64");
    const n = Math.ceil(b64.length / CHUNK);
    for (let i = 0; i < n; i++) log(`GL_JPG diag-${name} steady ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
  });
}
