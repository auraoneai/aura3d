import { createServer, type Server } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Aura Hoops hit-stop check (remote only, software WebGL2): a long autoplay run that records, for every rendered frame, a
 * signature of the simulation (ball, athlete positions and score). The old hit-stop counted down on game time, which stands
 * still while frozen, so the first made basket froze the match for good: every frame after it repeats the same signature.
 * Build first: `vite build apps/showcase-aura-hoops-3d --config vite.config.ts --outDir ../../tests/browser/hotfix-hoops-<old|new>`
 * and copy the referenced public/aura-assets files into `hotfix-hoops-<old|new>/aura-assets`.
 */
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".json": "application/json", ".svg": "image/svg+xml", ".glb": "model/gltf-binary", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".wav": "audio/wav", ".mp3": "audio/mpeg", ".ogg": "audio/ogg" };

function serve(dist: string): Promise<{ origin: string; close(): Promise<void> }> {
  const server: Server = createServer((req, res) => {
    let file = path.join(dist, decodeURIComponent((req.url ?? "/").split("?")[0]!));
    if (!file.startsWith(dist)) { res.statusCode = 403; res.end(); return; }
    if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, "index.html");
    if (!existsSync(file)) { res.statusCode = 404; res.end("not found"); return; }
    res.setHeader("content-type", MIME[path.extname(file)] ?? "application/octet-stream");
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => {
    const { port } = server.address() as { port: number };
    resolve({ origin: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(() => r())) });
  }));
}

export function hoopsHitStopCheck(variant: "old" | "new"): void {
  const RUN_MS = Number(process.env.HOTFIX_HOOPS_RUN_MS ?? 600_000);
  const OUT = `${process.env.HOTFIX_HOOPS_OUT ?? "tests/reports/hotfix-hoops"}/${variant}`;
  test.setTimeout(RUN_MS + 420_000);
  test(`hoops (${variant}): autoplay ${Math.round(RUN_MS / 60_000)} min, count frozen frames after the first made basket`, async ({ page }) => {
    const { origin, close } = await serve(path.resolve(`tests/browser/hotfix-hoops-${variant}`));
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror ${e.message}`.slice(0, 220)));
    page.on("console", (m) => { if (m.type() === "error" && !/404|favicon|local\.css|fonts\//.test(m.text())) errors.push(m.text().slice(0, 220)); });
    await page.setViewportSize({ width: 320, height: 180 });
    await page.goto(`${origin}/?autostart=1&autoplay=1&diag=1&post=0&shadow=0&aa=0&env=0&sky=0`, { waitUntil: "load", timeout: 120_000 });
    await page.evaluate(() => {
      const w = window as unknown as { __sig: Array<{ f: number; sig: string; sc: number; ph: string }>; __lastF: number };
      w.__sig = []; w.__lastF = -1;
      const tick = () => {
        const b = (window as unknown as { __AURA3D_GAME__?: Record<string, any> }).__AURA3D_GAME__;
        if (b && b.framesRendered !== w.__lastF) {
          w.__lastF = b.framesRendered;
          const clips = (b.athleteClips ?? []).map((a: any) => `${a.x},${a.z}`).join(";");
          w.__sig.push({ f: b.framesRendered, sig: `${JSON.stringify(b.ball?.position)}|${clips}|${b.score?.home}-${b.score?.away}`, sc: (b.score?.home ?? 0) + (b.score?.away ?? 0), ph: String(b.phase) });
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    const t0 = Date.now();
    while (Date.now() - t0 < RUN_MS && !page.isClosed()) await page.waitForTimeout(10_000).catch(() => undefined);
    const sig = await page.evaluate(() => (window as unknown as { __sig: Array<{ f: number; sig: string; sc: number; ph: string }> }).__sig).catch(() => []);
    if (!page.isClosed()) { mkdirSync(OUT, { recursive: true }); await page.screenshot({ path: `${OUT}/final.png` }).catch(() => undefined); }
    let frozen = 0, run = 0, maxRun = 0, firstScore = -1, framesAfter = 0, frozenAfter = 0, lastScore = 0;
    sig.forEach((s, i) => {
      const same = i > 0 && s.sig === sig[i - 1]!.sig;
      if (same) { frozen += 1; run += 1; maxRun = Math.max(maxRun, run); } else run = 0;
      if (firstScore < 0 && s.sc > 0 && i > 0 && s.sc > sig[i - 1]!.sc) firstScore = i;
      if (firstScore >= 0 && i >= firstScore) { framesAfter += 1; if (same) frozenAfter += 1; }
      lastScore = s.sc;
    });
    const result = { variant: variant, runMs: RUN_MS, frames: sig.length, frozenFrames: frozen, maxFrozenRun: maxRun, firstScoreFrameIndex: firstScore, framesAfterFirstScore: framesAfter, frozenAfterFirstScore: frozenAfter, finalTotalScore: lastScore, phases: [...new Set(sig.map((s) => s.ph))], errors };
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/result.json`, JSON.stringify(result, null, 2));
    console.log(`HOTFIX_HOOPS ${JSON.stringify(result)}`);
    await close();
    expect(errors, "console errors").toEqual([]);
    expect(sig.length, "frames were rendered").toBeGreaterThan(20);
    if (variant === "new" && firstScore >= 0) {
      expect(frozenAfter / Math.max(1, framesAfter), "the match keeps moving after the first made basket").toBeLessThan(0.5);
      expect(maxRun, "no long run of identical frames").toBeLessThan(40);
    }
  });
}
