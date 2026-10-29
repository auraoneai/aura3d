import { test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Lane E4 wave 2 (handoff g07, audit FC-06): `mountTouchControls` sticks. On the base the stick looked up
 * `preset.rects.stick`, which the layout never defines, so no stick mounted; the touch layer also had no positioning.
 * Target: Aura FC 3D touch lab (`?mode=touch`) at 390x844 with touch + coarse pointer emulation.
 * Pattern copied from tests/browser/game-luma-capture.spec.ts (no artifact egress, so output goes to the log):
 *   GL_META <json>                         touch DOM measurements, player movement, luma stats
 *   GL_JPG  <target> <shot> <i>/<n> <b64>  full-page JPEG (controls included), chunked
 * Everything is measured after a settle period; the first frames are not steady state on the software-GL runner.
 */
const CHUNK = 16000;
const SETTLE_MS = 20_000;
const WINDOW_MS = 25_000;
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const READY = "document.body.dataset.aura3dReady === 'true'";
const TARGET = "e4-touch-fc";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });

async function touchDom(page: Page) {
  return page.evaluate(() => {
    const host = document.querySelector<HTMLElement>(".a3g-touch");
    const els = [...document.querySelectorAll<HTMLElement>(".a3g-touch [data-control]")];
    const box = (el: Element | null) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
    };
    const stick = document.querySelector<HTMLElement>('.a3g-touch [data-control="stick"]');
    const sb = stick?.getBoundingClientRect();
    const hit = sb ? document.elementFromPoint(sb.left + sb.width / 2, sb.top + sb.height / 2) : null;
    const ev = (globalThis as unknown as { __AURA3D_GAME_EVIDENCE__?: { touch?: unknown } }).__AURA3D_GAME_EVIDENCE__;
    return {
      coarse: matchMedia("(pointer: coarse)").matches,
      hostVisible: host ? host.getClientRects().length > 0 : false,
      hostPosition: host ? getComputedStyle(host).position : null,
      controls: els.map((el) => ({ id: el.dataset.control, position: getComputedStyle(el).position, ...box(el) })),
      stick: box(stick),
      stickHitIsStick: Boolean(stick && hit && (hit === stick || stick.contains(hit))),
      evidenceTouch: ev?.touch ?? null
    };
  });
}

async function controlled(page: Page) {
  return page.evaluate(() => {
    const g = globalThis as unknown as {
      __AURA_AURA_FC_3D__?: { state(): { players: { id: string; x: number; z: number }[] } };
      __AURA3D_GAME_EVIDENCE__?: { controlledId?: string; mode?: string };
    };
    const id = g.__AURA3D_GAME_EVIDENCE__?.controlledId;
    const players = g.__AURA_AURA_FC_3D__?.state().players ?? [];
    const p = players.find((q) => q.id === id) ?? null;
    return { id: id ?? null, mode: g.__AURA3D_GAME_EVIDENCE__?.mode ?? null, x: p ? +p.x.toFixed(3) : null, z: p ? +p.z.toFixed(3) : null, t: Date.now() };
  });
}

async function shot(page: Page, id: string, extra: Record<string, unknown>): Promise<void> {
  const jpg = await page.screenshot({ type: "jpeg", quality: 70 });
  log(`GL_META ${JSON.stringify({ target: TARGET, id, ...extra })}`);
  const b64 = jpg.toString("base64");
  const n = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < n; i++) log(`GL_JPG ${TARGET} ${id} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
}

test.describe("e4 touch sticks", () => {
  test.setTimeout(3_000_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test(TARGET, async ({ page }) => {
    page.on("pageerror", (e) => log(`GL_ERR ${TARGET} pageerror ${e.message.slice(0, 300)}`));
    await page.goto(`${server.origin}/apps/showcase-aura-fc-3d/index.html?mode=touch`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(READY, undefined, { timeout: 420_000, polling: 500 });
    await page.waitForTimeout(SETTLE_MS);

    const dom = await touchDom(page);
    await shot(page, "settled", { dom });

    // Idle window: no input, to separate drift from stick-driven motion.
    const idle0 = await controlled(page);
    await page.waitForTimeout(WINDOW_MS);
    const idle1 = await controlled(page);

    // Drag window: hold the stick 35 px LEFT of where the finger lands (stick centre, or where it should be). The idle
    // drill drifts the player towards +x, so only a stick that works can give a negative dx.
    const cdp = await page.context().newCDPSession(page);
    const sx = dom.stick ? dom.stick.x + dom.stick.w / 2 : 0.145 * 390;
    const sy = dom.stick ? dom.stick.y + dom.stick.h / 2 : 0.855 * 844;
    const drag0 = await controlled(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: sx, y: sy, id: 1 }] });
    await page.waitForTimeout(300);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: sx - 35, y: sy, id: 1 }] });
    const track: { x: number | null; z: number | null; t: number }[] = [];
    for (let i = 0; i < 6; i++) { await page.waitForTimeout(WINDOW_MS / 12); const c = await controlled(page); track.push({ x: c.x, z: c.z, t: c.t }); }
    const nub = await page.evaluate(() => document.querySelector<HTMLElement>('.a3g-touch [data-control="stick"] .a3g-tc-stick-nub')?.style.transform ?? null);
    await shot(page, "dragging", { nub, track });
    await page.waitForTimeout(WINDOW_MS / 2);
    const drag1 = await controlled(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

    log(`GL_META ${JSON.stringify({
      target: TARGET,
      id: "movement",
      at: { x: sx, y: sy },
      idle: { from: idle0, to: idle1, dx: idle0.x !== null && idle1.x !== null ? +(idle1.x - idle0.x).toFixed(3) : null },
      drag: { from: drag0, to: drag1, dx: drag0.x !== null && drag1.x !== null ? +(drag1.x - drag0.x).toFixed(3) : null }
    })}`);
    log(`GL_DONE ${TARGET}`);
  });
});
