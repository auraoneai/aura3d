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
  { name: "ch1-obj0", query: "?manual=1&chapter=1&objective=0" },
  { name: "ch2-obj0-night", query: "?manual=1&chapter=2&objective=0" },
  { name: "ch3-obj0", query: "?manual=1&chapter=3&objective=0" },
  { name: "ch4-obj0", query: "?manual=1&chapter=4&objective=0" },
  { name: "ch5-obj0-night", query: "?manual=1&chapter=5&objective=0" },
  { name: "ch6-obj0", query: "?manual=1&chapter=6&objective=0" }
];
const only = (process.env.SILT_SHOTS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

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
