import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Screenshot retake helper (remote only, software WebGL2). Captures title, early gameplay, state-change frames
 * (key actions) and a late frame at 1280x720 and 390x844, plus a 16:10 card image at 1x and 2x. Frames are written
 * under tests/reports/shotsa/<slug>/ and printed as base64 `@@FRAME` chunks for decoding from the run log.
 */
export interface ShotsCfg {
  readonly slug: string;
  readonly route: string;
  readonly titleQuery: string;
  readonly playQuery: string;
  readonly readyGlobals?: readonly string[];
  readonly evidenceGlobals?: readonly string[];
  readonly drive?: (page: Page, snap: (label: string) => Promise<void>) => Promise<void>;
  readonly endPattern?: RegExp;
  readonly playBudgetMs?: number;
}

const FRAME_CHUNK = 30_000;
export const startServer = (): Promise<ExampleDevServer> => startExampleDevServer();

async function emit(slug: string, vp: string, name: string, buf: Buffer): Promise<void> {
  const dir = path.resolve("tests/reports/shotsa", slug, vp);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${name}.jpg`), buf);
  const b64 = buf.toString("base64");
  const total = Math.ceil(b64.length / FRAME_CHUNK);
  for (let i = 0; i < total; i += 1) process.stdout.write(`@@FRAME ${slug}/${vp}/${name} ${i + 1}/${total} ${b64.slice(i * FRAME_CHUNK, (i + 1) * FRAME_CHUNK)}\n`);
}

const SIGNATURE_FN = `(() => {
  const w = window;
  const b = w.__AURA3D_GAME__ || {};
  const parts = [];
  const skip = /time|frame|seed|count|score|clock|tick|elapsed|ms$/i;
  const take = (o, d) => {
    if (!o || typeof o !== "object" || d > 1) return;
    for (const k of Object.keys(o)) {
      if (skip.test(k)) continue;
      const v = o[k];
      if (typeof v === "string" && v.length < 24) parts.push(k + "=" + v);
      else if (typeof v === "boolean") parts.push(k + "=" + v);
      else if (v && typeof v === "object" && !Array.isArray(v)) take(v, d + 1);
    }
  };
  take(b, 0);
  for (const g of GLOBALS) { const e = w[g]; if (e) take(typeof e === "function" ? e() : e, 0); }
  return parts.join("|");
})()`;

async function signature(page: Page, globals: readonly string[]): Promise<string> {
  const fn = SIGNATURE_FN.replace("GLOBALS", JSON.stringify(globals));
  return page.evaluate(fn).catch(() => "") as Promise<string>;
}

export async function runShots(page: Page, server: ExampleDevServer, cfg: ShotsCfg): Promise<void> {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror ${e.message}`.slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error" && !/404|favicon|local\.css|fonts\//.test(m.text())) errors.push(m.text().slice(0, 200)); });
  const globals = cfg.evidenceGlobals ?? [];
  const url = (q: string) => `${server.origin}${cfg.route}${q}`;
  const ready = async (): Promise<boolean> => {
    try {
      await page.waitForFunction((names) => {
        const w = window as unknown as Record<string, unknown>;
        if (names.length > 0) return names.some((n) => Boolean(w[n]));
        return Boolean(w.__AURA3D_GAME__ ?? w.__AURA3D_GAME_EVIDENCE__);
      }, [...(cfg.readyGlobals ?? [])], { timeout: 420_000 });
      return true;
    } catch { return false; }
  };

  const viewports: Array<{ id: string; w: number; h: number; mobile: boolean }> = [
    { id: "1280x720", w: 1280, h: 720, mobile: false },
    { id: "390x844", w: 390, h: 844, mobile: true }
  ];
  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.w, height: vp.h });
    const shot = async (name: string) => { await emit(cfg.slug, vp.id, name, await page.screenshot({ type: "jpeg", quality: 88 })); };
    // Title / menu state.
    await page.goto(url(cfg.titleQuery), { waitUntil: "load", timeout: 240_000 });
    const titleReady = await ready();
    await page.waitForTimeout(4_000);
    await shot("01-title");
    process.stdout.write(`@@SHOTSA ${cfg.slug} ${vp.id} title ready=${titleReady}\n`);
    // Gameplay: autoplay (or the game's own drive) with state-change capture.
    await page.goto(url(cfg.playQuery), { waitUntil: "load", timeout: 240_000 });
    const playReady = await ready();
    process.stdout.write(`@@SHOTSA ${cfg.slug} ${vp.id} play ready=${playReady}\n`);
    await page.waitForTimeout(6_000);
    await shot("02-early");
    const seen = new Set<string>();
    let captured = 0;
    let lastSnap = 0;
    const snap = async (label: string) => {
      const safe = label.replace(/[^a-z0-9]+/gi, "-").slice(0, 36).replace(/^-|-$/g, "") || "state";
      captured += 1;
      await shot(`03-action-${String(captured).padStart(2, "0")}-${safe}`);
      lastSnap = Date.now();
    };
    if (cfg.drive) await cfg.drive(page, snap);
    const deadline = Date.now() + (cfg.playBudgetMs ?? (vp.mobile ? 420_000 : 600_000));
    let lateDone = false;
    const lateAt = Date.now() + 90_000;
    let results = false;
    while (Date.now() < deadline && captured < 10) {
      const sig = await signature(page, globals);
      if (sig && !seen.has(sig) && Date.now() - lastSnap > 2_500) { seen.add(sig); await snap(sig.split("|").slice(0, 3).join("-")); }
      if (!lateDone && Date.now() > lateAt) { lateDone = true; await shot("04-mid"); }
      if (cfg.endPattern && sig && cfg.endPattern.test(sig)) { await page.waitForTimeout(2_500); await shot("05-results"); results = true; break; }
      await page.waitForTimeout(1_500);
    }
    process.stdout.write(`@@SHOTSA ${cfg.slug} ${vp.id} done captured=${captured} signatures=${seen.size} late=${lateDone} results=${results} errors=${errors.length}\n`);
  }

  // Card images: 16:10, 1x (720x450) and 2x (same CSS size, device scale 2) from the play state.
  for (const scale of [1, 2]) {
    const ctx = await page.context().browser()!.newContext({ viewport: { width: 720, height: 450 }, deviceScaleFactor: scale });
    const p2 = await ctx.newPage();
    try {
      await p2.goto(url(cfg.playQuery), { waitUntil: "load", timeout: 240_000 });
      await p2.waitForFunction((names) => {
        const w = window as unknown as Record<string, unknown>;
        if (names.length > 0) return names.some((n) => Boolean(w[n]));
        return Boolean(w.__AURA3D_GAME__ ?? w.__AURA3D_GAME_EVIDENCE__);
      }, [...(cfg.readyGlobals ?? [])], { timeout: 420_000 });
      await p2.waitForTimeout(10_000);
      await emit(cfg.slug, "card", `card-${scale}x`, await p2.screenshot({ type: "jpeg", quality: 88 }));
      process.stdout.write(`@@SHOTSA ${cfg.slug} card ${scale}x ok\n`);
    } catch (e) {
      process.stdout.write(`@@SHOTSA ${cfg.slug} card ${scale}x FAILED ${(e as Error).message.slice(0, 120)}\n`);
    } finally { await ctx.close(); }
  }
  if (errors.length) process.stdout.write(`@@SHOTSA ${cfg.slug} errors ${JSON.stringify(errors.slice(0, 6))}\n`);
}

const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".glb": "model/gltf-binary", ".woff2": "font/woff2", ".woff": "font/woff", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".ktx2": "image/ktx2" };

export function startDistServer(dist: string): Promise<ExampleDevServer> {
  const root = path.resolve(dist);
  const server = createServer((req, res) => {
    let file = path.join(root, decodeURIComponent((req.url ?? "/").split("?")[0]!));
    if (!file.startsWith(root)) { res.statusCode = 403; res.end(); return; }
    if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!existsSync(file)) {
      // Fall back to the repo public tree (catalog assets staged by PUBLIC_ASSETS, HDRIs, fonts).
      const publicFile = path.join(path.resolve("public"), decodeURIComponent((req.url ?? "/").split("?")[0]!));
      if (publicFile.startsWith(path.resolve("public")) && existsSync(publicFile) && statSync(publicFile).isFile()) file = publicFile;
    }
    if (!existsSync(file)) { res.statusCode = 404; res.end("not found"); return; }
    res.setHeader("content-type", MIME[path.extname(file)] ?? "application/octet-stream");
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => {
    const { port } = server.address() as { port: number };
    resolve({ origin: `http://127.0.0.1:${port}`, close: () => new Promise<void>((r) => server.close(() => r())) });
  }));
}
