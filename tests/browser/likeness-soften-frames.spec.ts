import { createServer, type Server } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Frames of the games whose shared models had photographic or brand-derived textures replaced (trophy cabinet, yellow bean). Remote only
 * (tools/remote-acr/run.sh, RUN_ID prefix billlik, software WebGL2). Build and stage first:
 * `vite build apps/showcase-<slug> --config tools/likeness-audit/vite.app.config.ts --outDir ../../tests/browser/retex-dist-<slug>`
 * then `node tools/likeness-audit/stage-dist.mjs apps/showcase-<slug> tests/browser/retex-dist-<slug>`.
 */
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".glb": "model/gltf-binary", ".ktx2": "image/ktx2", ".wav": "audio/wav", ".mp3": "audio/mpeg" };

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

const ALL: Array<{ slug: string; query: string; glbs: string[]; required: boolean; ready: string }> = [
  { slug: "bean-brawl-race", query: "?autostart=1", glbs: ["yellowBean"], required: true, ready: "__AURA3D_GAME__" },
  { slug: "bank-shot", query: "?autostart=1", glbs: ["billiardsTrophyCabinetMeshy"], required: false, ready: "__BANK_SHOT_EVIDENCE__" },
  // control: the same app built from unchanged main with the original (photographic) cabinet, to tell a regression from a staging limit
  { slug: "bank-shot-ctl", query: "?autostart=1", glbs: ["billiardsTrophyCabinetMeshy"], required: false, ready: "__BANK_SHOT_EVIDENCE__" }
];
const ONLY = (process.env.SOFTEN_GAMES ?? "").split(",").filter(Boolean);
const GAMES = ALL.filter((g) => ONLY.length === 0 || ONLY.includes(g.slug));

test.setTimeout(600_000);

for (const game of GAMES) {
  test(`${game.slug}: softened models load and render`, async ({ page }) => {
    const { origin, close } = await serve(path.resolve(`tests/browser/retex-dist-${game.slug}`));
    const errors: string[] = [];
    const glbRequests: Array<{ url: string; status: number }> = [];
    page.on("pageerror", (e) => errors.push(`pageerror ${e.message}`.slice(0, 200)));
    page.on("console", (m) => { if (m.type() === "error" && !/404|favicon|local\.css|fonts\//.test(m.text())) errors.push(m.text().slice(0, 200)); });
    page.on("response", (r) => { if (r.url().endsWith(".glb")) glbRequests.push({ url: r.url().replace(origin, ""), status: r.status() }); });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${origin}/${game.query}`, { waitUntil: "load", timeout: 120_000 });
    await page.waitForFunction((key) => (window as unknown as Record<string, unknown>)[key] !== undefined, game.ready, { timeout: 300_000 }).catch(() => undefined);
    await page.waitForTimeout(15_000);
    for (const [i, wait] of [0, 12_000].entries()) {
      if (wait) await page.waitForTimeout(wait);
      const b64 = (await page.screenshot({ type: "jpeg", quality: 82 })).toString("base64");
      const chunk = 60_000, n = Math.ceil(b64.length / chunk);
      for (let k = 0; k < n; k++) process.stdout.write(`@@SOFTFRAME ${game.slug}-${i} ${k + 1}/${n} ${b64.slice(k * chunk, (k + 1) * chunk)}\n`);
    }
    process.stdout.write(`@@SOFTRESULT ${JSON.stringify({ slug: game.slug, errors, glbRequests: glbRequests.filter((g) => game.glbs.some((n) => g.url.includes(n))) })}\n`);
    await close();
    for (const name of game.glbs) {
      const hit = glbRequests.find((g) => g.url.includes(name));
      if (game.required || hit) expect(hit?.status, `${name} requested and served`).toBe(200);
    }
    expect(errors).toEqual([]);
  });
}
