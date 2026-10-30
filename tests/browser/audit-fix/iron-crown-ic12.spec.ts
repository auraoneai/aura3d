import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Iron Crown IC-12 capture: idle, crouch and throw for two fighter pairs in the Combo Lab (dummy stance panel), before
 * (origin/main, idle and crouch on Block1, throw on Triple_Combo_Attack) and after (new Meshy clips). Remote only:
 * tools/remote-acr/run.sh. Output goes to the log:
 *   GL_META <json>                         canvas luma, game state, live bone positions (socket) per shot
 *   GL_JPG  <target> <shot> <i>/<n> <b64>  JPEG, chunked
 * Software GL presents one frame every several seconds; each state waits for steady state before its shots.
 *
 * Run: SPECS="tests/browser/audit-fix/iron-crown-ic12.spec.ts --grep=@ic12k" CONTEXT_PROFILE=slim
 *      EXTRA_DIRS="apps/showcase-iron-crown" PUBLIC_ASSETS="<the stage GLBs>" tools/remote-acr/run.sh
 */
const CHUNK = 16000;
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const READY = "document.body.dataset.aura3dReady === 'true'";
const ROUTE = "/apps/showcase-iron-crown/";
const APP_PUBLIC = path.resolve("apps/showcase-iron-crown/public");
const sharp = createRequire(import.meta.url)("sharp");
const BONES = ["Hips", "Spine02", "Head", "LeftHand", "RightHand", "LeftFoot", "RightFoot"] as const;

async function routeAppAssets(context: BrowserContext): Promise<void> {
  await context.route("**/apps/showcase-iron-crown/fonts/**", async (route) => {
    const file = path.join(APP_PUBLIC, "fonts", path.basename(new URL(route.request().url()).pathname));
    if (!existsSync(file)) return route.continue();
    const type = file.endsWith(".css") ? "text/css" : file.endsWith(".woff2") ? "font/woff2" : file.endsWith(".woff") ? "font/woff" : "font/ttf";
    await route.fulfill({ status: 200, contentType: type, body: readFileSync(file) });
  });
  await context.route("**/aura-assets/ironcrown*", async (route) => {
    const rel = new URL(route.request().url()).pathname.replace(/^\/+/, "");
    const file = path.join(APP_PUBLIC, rel);
    if (!existsSync(file)) return route.continue();
    await route.fulfill({ status: 200, contentType: file.endsWith(".glb") ? "model/gltf-binary" : "image/svg+xml", body: readFileSync(file) });
  });
}

async function nodeLuma(png: Buffer) {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  for (let i = 0; i < data.length; i += 3) sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  return { mean: +(sum / (info.width * info.height)).toFixed(2) };
}

/** One page round trip: canvas pixels (capture=1 keeps the drawing buffer), game state and live bone world positions. */
async function grab(page: Page, target: string, id: string, extra: Record<string, unknown> = {}): Promise<void> {
  const got = await page.evaluate((bones) => {
    const canvas = (document.querySelector("canvas#game") as HTMLCanvasElement | null) ?? document.querySelector("canvas");
    const url = canvas?.toDataURL("image/png") ?? null;
    const app = (globalThis as any).__AURA3D_LIVE_APPS__?.all()[0];
    const rig = (nodeId: string) => {
      const anim = app?.nodes?.get(nodeId)?.animation;
      const out: Record<string, number[] | null> = {};
      for (const bone of bones) {
        try {
          const s = anim?.socket?.(bone);
          if (!s?.valid) { out[bone] = null; continue; }
          const m = s.worldMatrix();
          out[bone] = [+m[12].toFixed(4), +m[13].toFixed(4), +m[14].toFixed(4)];
        } catch { out[bone] = null; }
      }
      let state: unknown = null;
      try { state = anim?.animationState?.() ?? null; } catch (e) { state = String(e); }
      return { bones: out, state };
    };
    const s = (window as any).__AURA3D_SHOWCASE_IRON_CROWN__;
    const fighter = (f: any) => f ? { id: f.id, clip: f.clip, embeddedClip: f.embeddedClip, x: f.position?.[0], grounded: f.grounded } : null;
    return {
      url,
      size: canvas ? [canvas.width, canvas.height] : null,
      game: s ? { frame: s.frame, mode: s.mode, phase: s.phase, lab: s.lab, p1: fighter(s.fighters?.p1), cpu: fighter(s.fighters?.cpu), stats: s.bout?.stats, standIns: s.assets?.clipStandIns } : null,
      player: rig("player"),
      rival: rig("rival")
    };
  }, BONES as unknown as string[]);
  if (!got.url) { log(`GL_ERR ${target} ${id} no canvas`); return; }
  const png = Buffer.from(got.url.split(",")[1]!, "base64");
  const jpg: Buffer = await sharp(png).jpeg({ quality: 80 }).toBuffer();
  log(`GL_META ${JSON.stringify({ target, id, size: got.size, ...extra, ...(await nodeLuma(png)), game: got.game, player: got.player, rival: got.rival })}`);
  const b64 = jpg.toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`GL_JPG ${target} ${id} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}

async function open(browser: Browser, server: ExampleDevServer, target: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await routeAppAssets(context);
  const page = await context.newPage();
  page.on("pageerror", (e) => log(`GL_ERR ${target} pageerror ${e.message.slice(0, 300)}`));
  page.on("console", (m) => { if (m.type() === "error") log(`GL_CONSOLE ${target} ${m.text().slice(0, 240)}`); });
  const t0 = Date.now();
  await page.goto(`${server.origin}${ROUTE}?icdebug=1&capture=1`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(READY, undefined, { timeout: 600_000, polling: 500 });
  log(`GL_READY ${target} ${Date.now() - t0}ms`);
  return { context, page };
}

const click = (page: Page, selector: string) => page.evaluate((s) => (document.querySelector(s) as HTMLElement | null)?.click(), selector);
const shotState = (page: Page) => page.evaluate(() => {
  const s = (window as any).__AURA3D_SHOWCASE_IRON_CROWN__;
  return { frame: s?.frame, p1: s?.fighters?.p1?.clip, cpu: s?.fighters?.cpu?.clip, p1Id: s?.fighters?.p1?.id, cpuId: s?.fighters?.cpu?.id, mode: s?.mode };
});

async function labSession(page: Page, T: string, p1: string): Promise<void> {
  await click(page, "#ic-modes button[data-mode='lab']");
  await page.waitForFunction(`window.__AURA3D_SHOWCASE_IRON_CROWN__?.mode === 'lab' && window.__AURA3D_SHOWCASE_IRON_CROWN__?.fighters?.p1?.id === '${p1}'`, undefined, { timeout: 600_000, polling: 1000 });
  log(`GL_STATE ${T} lab ${JSON.stringify(await shotState(page))}`);

  // Idle: no input, dummy on "stand".
  await click(page, "button[data-stance='stand']");
  await page.waitForTimeout(45_000);
  await grab(page, T, "idle-1", { state: "idle" });
  await page.waitForTimeout(10_000);
  await grab(page, T, "idle-2", { state: "idle" });

  // Crouch: P1 holds Down, the dummy crouches.
  await click(page, "button[data-stance='crouch']");
  await page.keyboard.down("KeyS");
  await page.waitForTimeout(35_000);
  await grab(page, T, "crouch-1", { state: "crouch" });
  await page.waitForTimeout(10_000);
  await grab(page, T, "crouch-2", { state: "crouch" });
  await page.keyboard.up("KeyS");
  await click(page, "button[data-stance='stand']");
  await page.waitForTimeout(30_000);

  // Throw: hold the throw key until the game reports the throw clip, then shoot every presented frame while it plays.
  const before = await shotState(page);
  await page.keyboard.down("KeyU");
  await page.waitForFunction("window.__AURA3D_SHOWCASE_IRON_CROWN__?.fighters?.p1?.clip === 'throw'", undefined, { timeout: 120_000, polling: 200 }).catch(() => undefined);
  await page.keyboard.up("KeyU");
  for (let i = 1; i <= 4; i++) {
    const st = await shotState(page);
    if (st.p1 !== "throw" && i > 1) break;
    await grab(page, T, `throw-${i}`, { state: "throw", before });
  }
}

test.describe("iron crown IC-12 clips", () => {
  test.setTimeout(3_300_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("ic12-kenji @ic12k", async ({ browser }) => {
    const T = "ic12-kenji";
    const { context, page } = await open(browser, server, T);
    await labSession(page, T, "kenji");
    await context.close();
  });

  test("ic12-volt @ic12v", async ({ browser }) => {
    const T = "ic12-volt";
    const { context, page } = await open(browser, server, T);
    // Player Studio picks Volt as Player 1; the Combo Lab then pairs him with Boulder.
    await click(page, "#ic-modes button[data-mode='studio']");
    await page.waitForTimeout(1500);
    await click(page, "[data-grid='fighter-studio'] button[data-pick='volt']");
    await click(page, "#studio-apply");
    // The sheet pauses the game; Back closes it and resumes.
    await click(page, "#menu-studio [data-menu-close]");
    await page.waitForFunction("window.__AURA3D_SHOWCASE_IRON_CROWN__?.fighters?.p1?.id === 'volt'", undefined, { timeout: 600_000, polling: 1000 });
    await page.waitForTimeout(5000);
    await labSession(page, T, "volt");
    await context.close();
  });
});
