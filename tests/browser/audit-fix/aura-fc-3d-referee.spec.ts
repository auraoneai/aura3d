import { test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "../example-dev-server";

/**
 * Aura FC 3D wave-2 (lane G09, handoff from E4): is the touchline referee posed by a walk clip, or does it slide in
 * its bind pose? Remote only. At steady state, for several shots: screenshot with the referee shown, hide it, wait
 * for fresh frames, screenshot again; the pixel difference is the referee silhouette. Logs:
 *   FC_REF <json>  per shot: referee node animation spec, silhouette bbox, pixel count, foot-band width
 *                  (bottom 25% of the bbox: legs together vs mid-stride), and frame luma.
 *   GL_JPG ...     a padded crop of the referee per shot plus one full frame.
 */
const CHUNK = 16000;
const HOOK = "__AURA_AURA_FC_3D__";
const SHOTS = 6;
const log = (line: string): void => { process.stdout.write(`${line}\n`); };
const CANVAS_ONLY = "body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important} html,body{background:#000 !important}";

let server: ExampleDevServer;
test.setTimeout(3_000_000);
test.beforeAll(async () => { server = await startExampleDevServer(); });
test.afterAll(async () => { await server?.close(); });

const frames = (page: Page) => page.evaluate(() => (window as any).__AURA3D_GAME_EVIDENCE__?.framesRendered ?? 0);
async function freshFrames(page: Page, n: number) {
  const f0 = await frames(page);
  await page.waitForFunction((s) => ((window as any).__AURA3D_GAME_EVIDENCE__?.framesRendered ?? 0) >= s, f0 + n, { timeout: 180_000, polling: 250 }).catch(() => undefined);
}
const setRefVisible = (page: Page, v: boolean) => page.evaluate(([h, vis]) => {
  const app = (window as any).__AURA3D_LIVE_APPS__.all()[0];
  app.nodes.require("fc-referee").setVisible(vis);
  (window as any).__FC_REF_FORCE__ = vis;
}, [HOOK, v] as const);

/** Silhouette of A minus B (luma diff > 18) and a padded JPEG crop of A around it. */
async function silhouette(page: Page, a: Buffer, b: Buffer, win: readonly [number, number, number, number]) {
  return page.evaluate(async ([ea, eb, w]) => {
    const [wx0, wy0, wx1, wy1] = w as readonly [number, number, number, number];
    const load = async (s: string) => {
      const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${s}`)).blob());
      const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
      const ctx = c.getContext("2d")!; ctx.drawImage(bmp, 0, 0);
      return { c, d: ctx.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height };
    };
    const A = await load(ea as string), B = await load(eb as string);
    const L = (d: Uint8ClampedArray, i: number) => 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!;
    let x0 = A.w, y0 = A.h, x1 = -1, y1 = -1, count = 0, lumaSum = 0;
    const mask = new Uint8Array(A.w * A.h);
    for (let y = 0; y < A.h; y++) for (let x = 0; x < A.w; x++) {
      const i = (y * A.w + x) * 4;
      lumaSum += L(A.d, i);
      if (x >= wx0 && x <= wx1 && y >= wy0 && y <= wy1 && Math.abs(L(A.d, i) - L(B.d, i)) > 18) {
        mask[y * A.w + x] = 1; count++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    const mean = +(lumaSum / (A.w * A.h)).toFixed(2);
    if (count < 12) return { found: false, count, mean, crop: null as string | null };
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    const footTop = y1 - Math.floor(bh * 0.25);
    let fx0 = A.w, fx1 = -1;
    for (let y = footTop; y <= y1; y++) for (let x = x0; x <= x1; x++) if (mask[y * A.w + x]) { if (x < fx0) fx0 = x; if (x > fx1) fx1 = x; }
    const pad = Math.max(8, Math.round(bh * 0.4));
    const cx0 = Math.max(0, x0 - pad), cy0 = Math.max(0, y0 - pad), cw = Math.min(A.w - cx0, bw + pad * 2), ch = Math.min(A.h - cy0, bh + pad * 2);
    const out = document.createElement("canvas"); const k = Math.max(1, Math.floor(240 / ch));
    out.width = cw * k; out.height = ch * k;
    const o = out.getContext("2d")!; o.imageSmoothingEnabled = false; o.drawImage(A.c, cx0, cy0, cw, ch, 0, 0, cw * k, ch * k);
    return {
      found: true, count, mean, bbox: [x0, y0, bw, bh], aspect: +(bw / bh).toFixed(3), footWidth: fx1 - fx0 + 1,
      footRatio: +((fx1 - fx0 + 1) / bh).toFixed(3), crop: out.toDataURL("image/jpeg", 0.8).split(",")[1]!
    };
  }, [a.toString("base64"), b.toString("base64"), win] as const);
}

test("fc-referee-walk", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`${server.origin}/apps/showcase-aura-fc-3d/index.html?autoplay=1&venue=munich&qa=1`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.waitForFunction((h) => (window as any)[h]?.ready?.() === true, HOOK, { timeout: 600_000, polling: 1000 });
  await page.evaluate((h) => (window as any)[h].step(2400), HOOK);
  // freeze the sim so players and ball hold still between the shown/hidden pair (the referee and crowd keep their clock)
  await page.evaluate((h) => (window as any)[h].freeze(true), HOOK);
  await freshFrames(page, 3);
  const style = await page.addStyleTag({ content: CANVAS_ONLY });
  for (let s = 0; s < SHOTS; s++) {
    await setRefVisible(page, true);
    await freshFrames(page, 2);
    const anim = await page.evaluate((h) => {
      const r = (window as any).__AURA3D_LIVE_APPS__.all()[0].nodes.require("fc-referee");
      const snap = r.snapshot?.();
      const cam = (window as any).__AURA3D_GAME_EVIDENCE__?.camera;
      const W = innerWidth, H = innerHeight;
      const project = (p: number[]) => {
        const e = cam.position, t = cam.target;
        const sub = (u: number[], v: number[]) => [u[0]! - v[0]!, u[1]! - v[1]!, u[2]! - v[2]!];
        const norm = (u: number[]) => { const l = Math.hypot(u[0]!, u[1]!, u[2]!); return u.map((c) => c / l); };
        const cross = (u: number[], v: number[]) => [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
        const dot = (u: number[], v: number[]) => u[0]! * v[0]! + u[1]! * v[1]! + u[2]! * v[2]!;
        const f = norm(sub(t, e)), rt = norm(cross(f, [0, 1, 0])), up = cross(rt, f), q = sub(p, e);
        const k = Math.tan((cam.fov * Math.PI) / 360), z = dot(q, f);
        return [((dot(q, rt) / (z * k * (W / H))) + 1) / 2 * W, (1 - dot(q, up) / (z * k)) / 2 * H];
      };
      const pos = snap?.position ?? [0, 0, 0];
      const feet = cam ? project([pos[0], 0, pos[2]]) : null, head = cam ? project([pos[0], 1.84, pos[2]]) : null;
      return { animation: snap?.animation ?? null, position: pos, state: r.animationState?.() ?? null, camera: cam ?? null, feet, head };
    }, HOOK);
    const hpx = anim.feet && anim.head ? Math.max(6, anim.feet[1]! - anim.head[1]!) : 720;
    const win = anim.feet ? [Math.floor(anim.feet[0]! - hpx * 1.5), Math.floor(anim.head![1]! - hpx * 0.4), Math.ceil(anim.feet[0]! + hpx * 1.5), Math.ceil(anim.feet[1]! + hpx * 0.3)] as const : [0, 0, 1279, 719] as const;
    const a = await page.screenshot({ type: "png" });
    const full = s === SHOTS - 1 ? await page.screenshot({ type: "jpeg", quality: 70 }) : null;
    await setRefVisible(page, false);
    await freshFrames(page, 2);
    const b = await page.screenshot({ type: "png" });
    await setRefVisible(page, true);
    const sil = await silhouette(page, a, b, win);
    const { crop, ...stats } = sil;
    log(`FC_REF ${JSON.stringify({ shot: s, win, ...stats, anim })}`);
    if (crop) {
      const n = Math.ceil(crop.length / CHUNK);
      for (let i = 0; i < n; i++) log(`GL_JPG referee-crop shot${s} ${i + 1}/${n} ${crop.slice(i * CHUNK, (i + 1) * CHUNK)}`);
    }
    if (full) {
      const b64 = full.toString("base64"); const n = Math.ceil(b64.length / CHUNK);
      for (let i = 0; i < n; i++) log(`GL_JPG referee-full shot${s} ${i + 1}/${n} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}`);
    }
  }
  await style.evaluate((el) => el.remove());
});
