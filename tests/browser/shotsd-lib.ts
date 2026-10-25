import { createServer, type Server } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { Browser, Page } from "@playwright/test";

/**
 * Screenshot retake, group D (remote only, software WebGL2). Serves tests/browser/shotsd-dist and emits JPEG frames as
 * base64 chunks on stdout (`@@SD slug profile state idx n b64`) plus `@@SDMETA slug {...}` per profile.
 */
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".glb": "model/gltf-binary", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".woff2": "font/woff2", ".woff": "font/woff", ".ktx2": "image/ktx2", ".hdr": "application/octet-stream", ".txt": "text/plain" };

const PROD = "https://aura3d.auraone.ai";
const PROXY_PREFIXES = ["/aura-assets/", "/hdri/", "/aura-environments/", "/aura-decoders/", "/packs/", "/probes/", "/fonts/", "/previews/"];
const proxyCache = new Map<string, { body: Buffer; type: string } | null>();
export const proxied: string[] = [];

export function serve(dist: string): Promise<{ origin: string; close(): Promise<void> }> {
  const server: Server = createServer((req, res) => {
    void (async () => {
      const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]!);
      let file = path.join(dist, urlPath);
      if (!file.startsWith(dist)) { res.statusCode = 403; res.end(); return; }
      if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, "index.html");
      if (existsSync(file)) {
        res.setHeader("content-type", MIME[path.extname(file)] ?? "application/octet-stream");
        res.end(readFileSync(file));
        return;
      }
      if (PROXY_PREFIXES.some((p) => urlPath.startsWith(p))) {
        if (!proxyCache.has(urlPath)) {
          try {
            const r = await fetch(`${PROD}${urlPath}`);
            if (r.ok) {
              proxyCache.set(urlPath, { body: Buffer.from(await r.arrayBuffer()), type: MIME[path.extname(urlPath)] ?? r.headers.get("content-type") ?? "application/octet-stream" });
              proxied.push(urlPath);
            } else proxyCache.set(urlPath, null);
          } catch { proxyCache.set(urlPath, null); }
        }
        const hit = proxyCache.get(urlPath);
        if (hit) { res.setHeader("content-type", hit.type); res.end(hit.body); return; }
      }
      res.statusCode = 404;
      res.end("not found");
    })();
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => {
    const { port } = server.address() as { port: number };
    resolve({ origin: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(() => r())) });
  }));
}

export interface GameShot {
  slug: string;
  route: string;
  query?: string;
  play?: string;
  auto?: string;
  autoParam?: string;
  modes?: Array<{ name: string; click: string }>;
  keys: string[][];
  holdMs?: number;
  resultsWaitMs?: number;
  waitGoneText?: string;
}

const PROFILES = [
  { name: "1280", width: 1280, height: 720, dsf: 1, mobile: false, states: ["01-title", "02-early", "03-action", "04-mid", "05-modes", "06-results"] },
  { name: "390", width: 390, height: 844, dsf: 1, mobile: true, states: ["01-title", "02-early", "03-action", "04-mid", "05-modes", "06-results"] },
  { name: "card", width: 1440, height: 900, dsf: 1, mobile: false, states: ["04-mid"] }
];

function emit(slug: string, profile: string, state: string, buf: Buffer): void {
  const b64 = buf.toString("base64");
  const chunk = 60_000;
  const n = Math.ceil(b64.length / chunk);
  for (let i = 0; i < n; i++) process.stdout.write(`@@SD ${slug} ${profile} ${state} ${i} ${n} ${b64.slice(i * chunk, (i + 1) * chunk)}\n`);
}

async function shot(page: Page, g: GameShot, profile: string, state: string, notes: string[]): Promise<void> {
  try {
    const buf = await page.screenshot({ type: "jpeg", quality: 84, timeout: 120_000 });
    emit(g.slug, profile, state, buf);
    notes.push(`shot ${state}`);
  } catch (e) {
    notes.push(`shot-failed ${state} ${(e as Error).message.split("\n")[0]}`.slice(0, 160));
  }
}

async function clickIf(page: Page, selector: string | undefined, notes: string[], label: string): Promise<boolean> {
  if (!selector) return false;
  try {
    const el = page.locator(selector).first();
    if ((await el.count()) === 0) { notes.push(`${label}: no ${selector}`); return false; }
    try {
      await el.click({ timeout: 20_000, force: true });
      notes.push(`${label}: clicked ${selector}`);
    } catch {
      await el.evaluate((n) => (n as HTMLElement).click());
      notes.push(`${label}: dom-clicked ${selector}`);
    }
    return true;
  } catch (e) {
    notes.push(`${label}: click failed ${selector} ${(e as Error).message.split("\n")[0]}`.slice(0, 160));
    return false;
  }
}

async function pressKeys(page: Page, keys: string[][], holdMs: number): Promise<void> {
  for (const combo of keys) {
    for (const k of combo) await page.keyboard.down(k);
    await page.waitForTimeout(holdMs);
    for (const k of [...combo].reverse()) await page.keyboard.up(k);
    await page.waitForTimeout(250);
  }
}

async function ready(page: Page, notes: string[], g: GameShot): Promise<void> {
  const t0 = Date.now();
  try {
    await page.waitForFunction(() => Boolean(document.querySelector("canvas")), undefined, { timeout: 240_000 });
    const gone = g.waitGoneText ? new RegExp(g.waitGoneText, "i") : undefined;
    let lit = false;
    while (Date.now() - t0 < 200_000) {
      const txt = await page.evaluate(() => document.body.innerText.slice(0, 3000)).catch(() => "");
      const loading = gone ? gone.test(txt) : false;
      const probe = await page.screenshot({ type: "jpeg", quality: 30, timeout: 120_000 }).catch(() => Buffer.alloc(0));
      if (!loading && probe.length > 14_000) { lit = true; break; }
      await page.waitForTimeout(4_000);
    }
    await page.waitForTimeout(4_000);
    notes.push(`ready ${Math.round((Date.now() - t0) / 1000)}s${lit ? "" : " (never lit)"}`);
  } catch {
    notes.push("ready-timeout");
  }
}

export async function shootGame(browser: Browser, g: GameShot, origin: string): Promise<void> {
  for (const profile of PROFILES) {
    const notes: string[] = [];
    const errors: string[] = [];
    const bad: string[] = [];
    const navs: string[] = [];
    const context = await browser.newContext({
      viewport: { width: profile.width, height: profile.height },
      deviceScaleFactor: profile.dsf,
      isMobile: profile.mobile,
      hasTouch: profile.mobile
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(`pageerror ${e.message}`.slice(0, 200)));
    page.on("console", (m) => { if (m.type() === "error" && !/favicon/.test(m.text())) errors.push(m.text().slice(0, 200)); });
    page.on("response", (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url().replace(origin, "")}`.slice(0, 160)); });
    page.on("framenavigated", (f) => { if (f === page.mainFrame()) navs.push(f.url().replace(origin, "")); });
    const base = `${origin}${g.route}${g.query ? `?${g.query}` : ""}`;
    const want = new Set(profile.states);
    try {
      await page.goto(base, { waitUntil: "load", timeout: 180_000 });
      await ready(page, notes, g);
      if (want.has("01-title")) await shot(page, g, profile.name, "01-title", notes);
      if (profile.name === "card") {
        await clickIf(page, g.play, notes, "play");
        await pressKeys(page, g.keys, g.holdMs ?? 1200);
        if (g.auto) await clickIf(page, g.auto, notes, "auto");
        await page.waitForTimeout(g.autoParam && !g.auto ? 1_000 : 9_000);
        await shot(page, g, profile.name, "04-mid", notes);
      } else {
        await clickIf(page, g.play, notes, "play");
        await page.waitForTimeout(5_000);
        await shot(page, g, profile.name, "02-early", notes);
        await pressKeys(page, g.keys, g.holdMs ?? 1200);
        await shot(page, g, profile.name, "03-action", notes);
        if (g.auto) {
          await clickIf(page, g.auto, notes, "auto");
          await page.waitForTimeout(12_000);
        } else if (g.autoParam) {
          await page.goto(`${base}${base.includes("?") ? "&" : "?"}${g.autoParam}`, { waitUntil: "load", timeout: 180_000 });
          await ready(page, notes, g);
          await clickIf(page, g.play, notes, "play2");
          await page.waitForTimeout(12_000);
        } else {
          await pressKeys(page, g.keys.slice().reverse(), g.holdMs ?? 1500);
        }
        await shot(page, g, profile.name, "04-mid", notes);
        for (const m of g.modes ?? []) {
          if (await clickIf(page, m.click, notes, `modes:${m.name}`)) {
            await page.waitForTimeout(2_500);
            await shot(page, g, profile.name, "05-modes", notes);
            break;
          }
        }
        const t0 = Date.now();
        const re = /\b(results|game over|final score|victory|defeat|you win|you lose|match over|try again|play again|retry|restart|time up)\b/i;
        let reached = false;
        while (Date.now() - t0 < (g.resultsWaitMs ?? 40_000)) {
          const txt = await page.evaluate(() => document.body.innerText.slice(0, 4000)).catch(() => "");
          if (re.test(txt)) { reached = true; break; }
          await page.waitForTimeout(4_000);
        }
        if (reached) await shot(page, g, profile.name, "06-results", notes);
        else notes.push("results: not reached");
      }
    } catch (e) {
      notes.push(`fatal ${(e as Error).message.split("\n")[0]}`.slice(0, 200));
    }
    const beacon = await page.evaluate(() => {
      const b = (window as unknown as { __AURA3D_GAME__?: Record<string, unknown> }).__AURA3D_GAME__;
      const heal = (window as unknown as { __AURA3D_HEAL__?: { rung?: number } }).__AURA3D_HEAL__;
      return { route: b?.route, state: b?.state, rung: heal?.rung ?? 0, drawCalls: (b?.renderer as { drawCalls?: number } | undefined)?.drawCalls };
    }).catch(() => ({}));
    process.stdout.write(`@@SDMETA ${g.slug} ${profile.name} ${JSON.stringify({ notes, errors: errors.slice(0, 8), bad: bad.slice(0, 60), navs, beacon, proxied: proxied.length })}\n`);
    await context.close();
  }
}
