import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * silt-and-signal-port art evidence: captures fixed states of every chapter as JPEG frames and prints them to the log
 * as `@@SILT_FRAME <name> <i> <n> <base64>` (rebuild with tools/crayon-capture/silt-and-signal-frames-split.ts), together
 * with render diagnostics (draw calls, triangles) and a console/network audit. Remote only (tools/remote-acr/run.sh).
 */

const LAB = "/examples/silt-and-signal-port/";

interface Pose { position: [number, number, number]; target: [number, number, number]; up: [number, number, number]; fov: number }
interface Shot { name: string; query: string; steps?: number; pose?: Pose; title?: boolean }
interface SiltApi {
  ready: boolean;
  stepFrames(n: number, input?: Record<string, unknown>): void;
  render(): void;
  overview(on: boolean): void;
  pose(next: Pose | null): void;
  mode(): string;
  info(): { frames: number; nodeCount: number; diagnostics: { errors?: readonly unknown[]; drawCalls?: number; triangles?: number } | null; world: unknown; rider: unknown; audio: unknown };
}
type SiltWindow = Window & { __AURA_SILT__: SiltApi };

const FLY = { throttle: 1, steer: 0, lift: 0, brake: false, boost: false, interact: false };
const SHOTS: Shot[] = [
  { name: "title", query: "", title: true },
  { name: "ch0-obj0-chase", query: "?manual=1&chapter=0&objective=0" },
  { name: "ch0-obj1-chase", query: "?manual=1&chapter=0&objective=1" },
  { name: "ch0-obj2-chase", query: "?manual=1&chapter=0&objective=2" },
  { name: "ch0-obj3-chase", query: "?manual=1&chapter=0&objective=3" },
  { name: "ch0-obj0-notoon", query: "?manual=1&chapter=0&objective=0&toon=0" },
  { name: "ch0-obj2-fly", query: "?manual=1&chapter=0&objective=2", steps: 240 },
  { name: "ch0-village", query: "?manual=1&chapter=0&objective=0", pose: { position: [96, 14, 40], target: [128, 8, -60], up: [0, 1, 0], fov: 62 } },
  { name: "ch0-aqueduct", query: "?manual=1&chapter=0&objective=2", pose: { position: [150, 20, -40], target: [225, 34, -130], up: [0, 1, 0], fov: 62 } },
  { name: "ch0-canal", query: "?manual=1&chapter=0&objective=1", pose: { position: [40, 7, -260], target: [8, 0, -330], up: [0, 1, 0], fov: 62 } },
  { name: "ch0-overview", query: "?manual=1&chapter=0&objective=2", pose: { position: [60, 240, -140], target: [100, 0, -330], up: [0, 1, 0], fov: 62 } },
  { name: "rider-close", query: "?manual=1&chapter=0&objective=0", pose: { position: [143, 6, 51], target: [138, 4, 45], up: [0, 1, 0], fov: 45 } },
  { name: "rider-close-static", query: "?manual=1&chapter=0&objective=0&norig=1", pose: { position: [143, 6, 51], target: [138, 4, 45], up: [0, 1, 0], fov: 45 } },
  { name: "ch0-rings", query: "?manual=1&chapter=0&objective=0", pose: { position: [138, 9, 42], target: [138, 5, 5], up: [0, 1, 0], fov: 62 } },
  { name: "ch0-gatehouse", query: "?manual=1&chapter=0&objective=1", pose: { position: [20, 14, -190], target: [-34, 10, -262], up: [0, 1, 0], fov: 62 } },
  { name: "ch0-canyon-gate", query: "?manual=1&chapter=0&objective=3", pose: { position: [0, 14, -1180], target: [0, 12, -1295], up: [0, 1, 0], fov: 62 } },
  { name: "ch1-obj0", query: "?manual=1&chapter=1&objective=0" },
  { name: "ch2-obj0-night", query: "?manual=1&chapter=2&objective=0" },
  { name: "ch3-obj0", query: "?manual=1&chapter=3&objective=0" },
  { name: "ch4-obj0", query: "?manual=1&chapter=4&objective=0" },
  { name: "ch5-obj0-night", query: "?manual=1&chapter=5&objective=0" },
  { name: "ch6-obj0", query: "?manual=1&chapter=6&objective=0" }
];
const only = (process.env.SILT_SHOTS ?? "ch0-obj0-chase,ch0-rings,rider-close,ch0-gatehouse").split(",").map((s) => s.trim()).filter(Boolean);

const STATS = `(async () => {
  window.__AURA_SILT__.render();
  const canvas = document.getElementById("world");
  const img = new Image(); img.src = canvas.toDataURL("image/png"); await img.decode();
  const c = document.createElement("canvas"); c.width = img.width; c.height = img.height;
  const g = c.getContext("2d"); g.drawImage(img, 0, 0);
  const { data, width, height } = g.getImageData(0, 0, c.width, c.height);
  const seen = new Set(); let lum = 0, n = 0, edge = 0;
  for (let y = 1; y < height - 1; y += 2) for (let x = 1; x < width - 1; x += 2) {
    const i = (y * width + x) * 4, l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    const r = (y * width + x + 1) * 4, d = (((y + 1) * width) + x) * 4;
    edge += Math.abs(l - (0.2126 * data[r] + 0.7152 * data[r + 1] + 0.0722 * data[r + 2])) + Math.abs(l - (0.2126 * data[d] + 0.7152 * data[d + 1] + 0.0722 * data[d + 2]));
    lum += l; n++;
    seen.add(((data[i] >> 4) << 8) | ((data[i + 1] >> 4) << 4) | (data[i + 2] >> 4));
  }
  return { meanLuma: lum / n, edgeDensity: edge / n / 2, distinctColors: seen.size, width, height };
})()`;

test.describe("silt-and-signal art frames", () => {
  test.setTimeout(1_800_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("captures every chapter and the title screen", async ({ browser }) => {
    const errors: string[] = [];
    const hosts = new Set<string>();
    for (const shot of SHOTS) {
      if (only.length && !only.includes(shot.name)) continue;
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      page.on("pageerror", (e) => errors.push(`${shot.name}: ${e.message}`));
      page.on("console", (m) => { if (m.type() === "error") errors.push(`${shot.name}: ${m.text()}`); });
      page.on("request", (r) => { try { hosts.add(new URL(r.url()).host); } catch { /* data: urls */ } });
      const started = Date.now();
      await page.goto(`${server.origin}${LAB}${shot.query}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => (window as unknown as SiltWindow).__AURA_SILT__?.ready === true, undefined, { timeout: 420_000 });
      const bootMs = Date.now() - started;
      if (shot.steps) await page.evaluate(([n, input]) => (window as unknown as SiltWindow).__AURA_SILT__.stepFrames(n as number, input as Record<string, unknown>), [shot.steps, FLY] as const);
      if (shot.pose) await page.evaluate((p) => (window as unknown as SiltWindow).__AURA_SILT__.pose(p), shot.pose);
      await page.evaluate(() => (window as unknown as SiltWindow).__AURA_SILT__.render());
      await page.evaluate(() => (window as unknown as SiltWindow).__AURA_SILT__.render());
      const stats = shot.title ? null : await page.evaluate(STATS);
      const info = await page.evaluate(() => (window as unknown as SiltWindow).__AURA_SILT__.info());
      const mode = await page.evaluate(() => (window as unknown as SiltWindow).__AURA_SILT__.mode());
      const jpeg = await page.screenshot({ type: "jpeg", quality: 70 });
      const b64 = jpeg.toString("base64");
      const chunk = 60_000, n = Math.ceil(b64.length / chunk);
      for (let i = 0; i < n; i++) process.stdout.write(`@@SILT_FRAME ${shot.name} ${i} ${n} ${b64.slice(i * chunk, (i + 1) * chunk)}\n`);
      process.stdout.write(`@@SILT_INFO ${shot.name} ${JSON.stringify({ mode, bootMs, stats, nodes: info.nodeCount, draws: info.diagnostics?.drawCalls, triangles: info.diagnostics?.triangles, world: info.world, rider: info.rider })}\n`);
      expect(info.diagnostics?.errors ?? [], `${shot.name} engine errors`).toEqual([]);
      await page.close();
    }
    process.stdout.write(`@@SILT_HOSTS ${JSON.stringify([...hosts])}\n`);
    const own = new Set(["127.0.0.1", "localhost"]);
    expect([...hosts].filter((h) => !own.has(h.split(":")[0]!)), "no third-party hosts").toEqual([]);
    expect(errors.filter((e) => !/favicon|404/.test(e))).toEqual([]);
  });
});

const RING_POSE: Pose = { position: [138, 14, 168], target: [138, 6, 5], up: [0, 1, 0], fov: 62 };
const GRAB = `(() => {
  window.__AURA_SILT__.render();
  const canvas = document.getElementById("world");
  const c = document.createElement("canvas"); c.width = 320; c.height = 180;
  const g = c.getContext("2d"); g.drawImage(canvas, 0, 0, 320, 180);
  return Array.from(g.getImageData(0, 0, 320, 180).data);
})()`;
const lin = (v: number): number => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const relY = (r: number, g: number, b: number): number => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);

test.describe("silt-and-signal ring beacon visibility", () => {
  test.setTimeout(900_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  test("the next-ring beacon contrasts with the sand and sky at 150 m in the chase view", async ({ browser }) => {
    const grabs: number[][] = [];
    for (const query of ["?manual=1&chapter=0&objective=0", "?manual=1&chapter=0&objective=0&nobeacon=1"]) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      await page.goto(`${server.origin}${LAB}${query}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => (window as unknown as SiltWindow).__AURA_SILT__?.ready === true, undefined, { timeout: 420_000 });
      await page.evaluate((p) => (window as unknown as SiltWindow).__AURA_SILT__.pose(p), RING_POSE);
      await page.evaluate(() => (window as unknown as SiltWindow).__AURA_SILT__.render());
      grabs.push(await page.evaluate(GRAB));
      if (query.includes("nobeacon")) { /* second frame */ } else {
        const jpeg = await page.screenshot({ type: "jpeg", quality: 70 });
        const b64 = jpeg.toString("base64"); const chunk = 60_000, n = Math.ceil(b64.length / chunk);
        for (let i = 0; i < n; i++) process.stdout.write(`@@SILT_FRAME ring-150m ${i} ${n} ${b64.slice(i * chunk, (i + 1) * chunk)}\n`);
      }
      await page.close();
    }
    const [a, b] = grabs as [number[], number[]];
    const W = 320, H = 180;
    const mask = new Uint8Array(W * H);
    let masked = 0;
    for (let i = 0; i < W * H; i++) {
      const d = Math.abs(a[i * 4]! - b[i * 4]!) + Math.abs(a[i * 4 + 1]! - b[i * 4 + 1]!) + Math.abs(a[i * 4 + 2]! - b[i * 4 + 2]!);
      if (d > 60) { mask[i] = 1; masked++; }
    }
    const near = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!mask[y * W + x]) continue;
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
        const yy = y + dy, xx = x + dx;
        if (yy >= 0 && yy < H && xx >= 0 && xx < W && !mask[yy * W + xx]) near[yy * W + xx] = 1;
      }
    }
    let ringY = 0, ringN = 0, surY = 0, surN = 0;
    let rr = 0, rg = 0, rb = 0, sr = 0, sg = 0, sb = 0;
    for (let i = 0; i < W * H; i++) {
      const r = a[i * 4]!, g = a[i * 4 + 1]!, bl = a[i * 4 + 2]!;
      if (mask[i]) { ringY += relY(r, g, bl); ringN++; rr += r; rg += g; rb += bl; }
      else if (near[i]) { surY += relY(r, g, bl); surN++; sr += r; sg += g; sb += bl; }
    }
    const yR = ringY / Math.max(1, ringN), yS = surY / Math.max(1, surN);
    const wcag = (Math.max(yR, yS) + 0.05) / (Math.min(yR, yS) + 0.05);
    let pixelRatioSum = 0, strong = 0;
    for (let i = 0; i < W * H; i++) {
      if (!mask[i]) continue;
      const y = relY(a[i * 4]!, a[i * 4 + 1]!, a[i * 4 + 2]!);
      const ratio = (Math.max(y, yS) + 0.05) / (Math.min(y, yS) + 0.05);
      pixelRatioSum += ratio;
      if (ratio > 1.5) strong++;
    }
    const pixelContrast = pixelRatioSum / Math.max(1, ringN);
    const strongShare = strong / Math.max(1, ringN);
    const chroma = Math.hypot(rr / ringN - sr / surN, rg / ringN - sg / surN, rb / ringN - sb / surN);
    process.stdout.write(`@@SILT_RING_CONTRAST ${JSON.stringify({ maskedSamples: masked, ringLuminance: +yR.toFixed(3), surroundLuminance: +yS.toFixed(3), wcagContrastOfMeans: +wcag.toFixed(2), meanPixelContrast: +pixelContrast.toFixed(2), strongPixelShare: +strongShare.toFixed(2), rgbDistance: +chroma.toFixed(1) })}\n`);
    expect(masked, "beacon pixels visible at 150 m").toBeGreaterThan(40);
    expect(pixelContrast, "mean per-pixel contrast ratio of the beacon against its surround").toBeGreaterThan(1.5);
    expect(strongShare, "share of beacon pixels with contrast ratio above 1.5").toBeGreaterThan(0.5);
  });
});
