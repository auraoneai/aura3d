import type { Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Diamond batter POSE frames (remote, software WebGL2): every phase of the stance and swing from the owner's default
 * behind-the-batter camera (`default`) or a side view (`side`), at device scale 2 (the thin specs set the viewport). The swing clock is
 * frozen at exact t with `holdSwingAt`. Lines: `@@PROBE` (JSON: bat elevation, bat-to-head distance, palms) and `@@FRAME` (base64 jpeg).
 */
const CHUNK = 30_000;
function emit(name: string, buf: Buffer): void {
  const dir = path.resolve("tests/reports/dpose");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${name}.jpg`), buf);
  const b64 = buf.toString("base64");
  const total = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < total; i += 1) process.stdout.write(`@@FRAME dpose/${name} ${i + 1}/${total} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}\n`);
}

const TIMES: Array<number | null> = [null, 0.22, 0.34, 0.43, 0.5, 0.62, 0.85];

export async function runPose(page: Page, origin: string, VIEW: "default" | "side"): Promise<void> {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  await page.goto(`${origin}/apps/showcase-aura-diamond-3d/index.html?mode=quick&post=0&shadow=0&aa=0`, { waitUntil: "load", timeout: 300_000 });
  await page.waitForFunction(() => Boolean((window as unknown as Record<string, unknown>).__AURA3D_GAME_DIAMOND__), undefined, { timeout: 600_000 });
  const t0 = Date.now();
  for (;;) {
    const ok = await page.evaluate(() => {
      const raw = (window as unknown as Record<string, any>).__AURA3D_GAME_EVIDENCE__ ?? (window as unknown as Record<string, any>).__AURA3D_GAME__;
      const e = typeof raw === "function" ? raw() : raw;
      return Boolean(e?.bat?.socketed);
    });
    if (ok) break;
    if (Date.now() - t0 > 600_000) { process.stdout.write(`@@PROBE {"error":"socket never attached"}\n`); break; }
    await page.waitForTimeout(1_000);
  }
  await page.addStyleTag({ content: "#hud,#menu,#event-ticker,#controls-hint,#render-error{display:none!important} body > *:not(#app){display:none!important}" });
  await page.evaluate((v) => (window as unknown as Record<string, any>).__AURA3D_GAME_DIAMOND__?.setCamOverride?.(v === "side" ? { eye: [3.4, 1.7, 0.3], target: [-0.85, 1.35, 0.3], fov: 34 } : null), VIEW);
  await page.waitForTimeout(4_000);
  const probe = () => page.evaluate(() => (window as unknown as Record<string, any>).__AURA3D_GAME_DIAMOND__?.gripProbe?.() ?? null) as Promise<Record<string, any> | null>;
  for (const t of TIMES) {
    await page.evaluate((tt) => (window as unknown as Record<string, any>).__AURA3D_GAME_DIAMOND__?.holdSwingAt?.(tt), t);
    if (t === null) await page.waitForTimeout(2_500);
    let prev = "";
    let stable = 0;
    let s: Record<string, any> | null = null;
    const t1 = Date.now();
    while (Date.now() - t1 < 150_000 && stable < 2) {
      s = await probe();
      const key = s ? JSON.stringify([s.t, s.rightPalm, s.leftPalm, s.knob, s.tip]) : "";
      if (s && (t === null ? s.phase === "stance" : Math.abs(Number(s.t) - t) < 0.02) && key === prev) stable += 1; else stable = 0;
      prev = key;
      await page.waitForTimeout(500);
    }
    const knob = s?.knob as number[] | undefined;
    const tip = s?.tip as number[] | undefined;
    let elevationDeg: number | null = null;
    if (knob && tip) {
      const d = [tip[0]! - knob[0]!, tip[1]! - knob[1]!, tip[2]! - knob[2]!];
      elevationDeg = Number(((Math.asin(d[1]! / Math.hypot(d[0]!, d[1]!, d[2]!)) * 180) / Math.PI).toFixed(1));
    }
    const label = `${VIEW}-${t === null ? "stance" : String(Math.round(t * 1000)).padStart(4, "0")}`;
    process.stdout.write(`@@PROBE ${JSON.stringify({ view: VIEW, hold: t, stable, elevationDeg, ...(s ?? {}) })}\n`);
    emit(label, await page.screenshot({ type: "jpeg", quality: 90 }));
  }
  await page.evaluate(() => (window as unknown as Record<string, any>).__AURA3D_GAME_DIAMOND__?.holdSwingAt?.(null));
  process.stdout.write(`@@PROBE ${JSON.stringify({ done: true, view: VIEW, errors })}\n`);
}
