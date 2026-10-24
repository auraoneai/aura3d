import { createServer, type Server } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "@playwright/test";

/**
 * Aura Hoops 3D rework probe (remote only, software WebGL2): long autoplay run with crash, error, navigation and
 * evidence capture. Build first: `vite build apps/showcase-aura-hoops-3d --config vite.config.ts --outDir tests/browser/rwhoo-dist-new`
 * and copy the referenced public/aura-assets files into `rwhoo-dist/aura-assets`.
 */
const MIME: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".json": "application/json", ".svg": "image/svg+xml", ".glb": "model/gltf-binary", ".wav": "audio/wav", ".ktx2": "image/ktx2", ".f32": "application/octet-stream", ".png": "image/png" };

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

const RUN_MS = Number(process.env.RWHOOS_RUN_MS ?? 600_000);
const OUT = process.env.RWHOOS_OUT ?? "tests/reports/rwhoos";
const FRAME_EVERY = Number(process.env.RWHOOS_FRAME_EVERY ?? 4);
let frameCount = 0;

test.setTimeout(RUN_MS + 600_000);

test("hoops: long autoplay run, crash and error capture, dribble evidence", async ({ page }) => {
  const dist = path.resolve("tests/browser/rwhoo-dist-new");
  const { origin, close } = await serve(dist);
  const events: string[] = [];
  const stamp = () => new Date().toISOString().slice(11, 23);
  page.on("crash", () => events.push(`${stamp()} PAGE_CRASH`));
  page.on("pageerror", (e) => events.push(`${stamp()} pageerror ${e.message} :: ${(e.stack ?? "").split("\n").slice(0, 4).join(" | ")}`.slice(0, 600)));
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") events.push(`${stamp()} console.${m.type()} ${m.text()}`.slice(0, 400)); });
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) events.push(`${stamp()} NAV ${f.url().replace(origin, "")}`); });
  page.on("requestfailed", (r) => events.push(`${stamp()} requestfailed ${r.url().replace(origin, "")} ${r.failure()?.errorText}`));
  page.on("response", (r) => { if (r.status() >= 400) events.push(`${stamp()} http${r.status()} ${r.url().replace(origin, "")}`); });
  await page.setViewportSize({ width: 320, height: 180 });
  await page.goto(`${origin}/?autostart=1&autoplay=1&diag=1&simsteps=90&post=0&shadow=0&aa=0&env=0&sky=0`, { waitUntil: "load", timeout: 120_000 });
  await page.evaluate(() => {
    const w = window as unknown as { __rec: unknown[]; __lastF: number };
    w.__rec = []; w.__lastF = -1;
    const tick = () => {
      const b = (window as unknown as { __AURA3D_GAME__?: Record<string, any> }).__AURA3D_GAME__;
      if (b && b.framesRendered !== w.__lastF) {
        w.__lastF = b.framesRendered;
        w.__rec.push({ f: b.framesRendered, ph: b.phase, bs: b.ball?.state, bp: b.ball?.position, hd: b.holder, dh: b.dribbleHand ? [b.dribbleHand.x, b.dribbleHand.y, b.dribbleHand.z] : null, dc: b.dribbleCycle, hs: b.holderSpeed, hc: b.holderClip, ss: b.shotStats, sc: b.score, fe: b.frameErrors });
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const samples: unknown[] = [];
  const t0 = Date.now();
  let alive = true;
  while (Date.now() - t0 < RUN_MS) {
    await page.waitForTimeout(5_000).catch(() => { alive = false; });
    if (!alive || page.isClosed()) break;
    const snap = await page.evaluate(() => {
      const b = (window as unknown as { __AURA3D_GAME__?: Record<string, any> }).__AURA3D_GAME__;
      if (!b) return { beacon: false };
      return {
        t: performance.now() | 0, frames: b.framesRendered, phase: b.phase, mode: b.mode, score: b.score, ball: b.ball, holder: b.holder, holderClip: b.holderClip,
        holderSpeed: b.holderSpeed, dribbleHand: b.dribbleHand, dribbleCycle: b.dribbleCycle, dribblePose: b.dribblePose,
        clips: (b.athleteClips ?? []).map((a: any) => `${a.id}:${a.clip}:${a.speed}`), events: JSON.stringify(b.eventLog ?? null).slice(0, 300)
      };
    }).catch((e) => ({ evalError: String(e).slice(0, 200) }));
    samples.push(snap);
    if (samples.length % FRAME_EVERY === 1 && frameCount < 2 && !page.isClosed()) {
      const buf = await page.screenshot({ type: "jpeg", quality: 70 }).catch(() => undefined);
      if (buf) { frameCount += 1; console.log(`RWHOOS_FRAME ${frameCount} ${(snap as { frames?: number }).frames ?? -1} ${buf.toString("base64")}`); }
    }
    if ((snap as { evalError?: string }).evalError) { events.push(`${stamp()} EVAL_ERROR ${(snap as { evalError: string }).evalError}`); break; }
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, "samples.json"), JSON.stringify({ events, samples }, null, 1));
  if (!page.isClosed()) await page.screenshot({ path: path.join(OUT, "final.png") }).catch(() => {});
  console.log(`RWHOOS_EVENTS ${events.length}`);
  for (const e of events.slice(0, 60)) console.log(`RWHOOS_EVENT ${e}`);
  const rec = await page.evaluate(() => (window as unknown as { __rec?: unknown[] }).__rec ?? []).catch(() => []);
  writeFileSync(path.join(OUT, "rec.json"), JSON.stringify(rec));
  console.log(`RWHOOS_REC ${rec.length}`);
  for (let i = 0; i < rec.length; i += 40) console.log(`RWHOOS_RECCHUNK ${Buffer.from(JSON.stringify(rec.slice(i, i + 40))).toString("base64")}`);
  console.log(`RWHOOS_SAMPLES ${samples.length} elapsed_ms=${Date.now() - t0}`);
  console.log(`RWHOOS_LAST ${JSON.stringify(samples.at(-1))}`.slice(0, 1500));
  await close();
});
