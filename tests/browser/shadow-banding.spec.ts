import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

/**
 * Banding regression for every game with a sun shadow (remote only: tools/remote-acr/run.sh). One full-viewport screenshot per
 * game at DPR 1 and DPR 2; frames are logged as `SLAMV_FILE <path> <i> <n> <base64>` (rebuild with tools/aura-slam/extract-frames.mjs)
 * and `BANDING <id> <dpr> <json>` carries the stripe metric: the high-pass energy of the per-row mean luma. Acne or shadow-map
 * banding on a large flat receiver shows up as regular dark rows, i.e. a large `stripe` value. The metric is a smoke check only (court
 * lines alone read about 11); software WebGL2 did not reproduce the real-GPU stripes, so read the frames, not the number.
 */
const FILE_CHUNK = 15000;
export const MAX_STRIPE = Number(process.env.BANDING_MAX ?? 40);

interface Game {
  readonly id: string;
  readonly url: string;
  /** QA hook global; the first name whose hook is ready wins (new name first, then the pre-rename one for older trees). */
  readonly hook?: string | readonly string[];
  readonly begin?: string;
  readonly step?: string;
  readonly harness?: boolean;
}

const GAMES: readonly Game[] = [
  { id: "aura-slam-page", url: "/apps/showcase-top-tennis/" },
  { id: "aura-slam-harness-hard", url: "/examples/aura-slam/view/harness.html?venue=hard", harness: true },
  { id: "ninja-runner", url: "/examples/ninja-runner-port/?manual=1&quality=high", hook: "__AURA_NINJA_RUNNER__", begin: "begin", step: "h.setAutopilot(true); h.advanceTo(90, [], 6)" },
  { id: "heatsink", url: "/examples/heatsink-port/?manual=1&quality=high&autostart=1", hook: "__AURA_HEATSINK__", begin: "begin", step: "h.stepFrames(120)" },
  { id: "roadster-hours", url: "/examples/roadster-hours-port/?manual=1&level=0", hook: "__AURA_ROADSTER_HOURS__", begin: "begin", step: "h.stepSteps(180)" },
  { id: "strange-orbit", url: "/examples/strange-orbit-port/?manual=1&autostart=1&mode=trial&quality=high", hook: "__AURA_STRANGE_ORBIT__", begin: "begin", step: "h.stepFrames(120)" },
  { id: "drift-and-deliver", url: "/examples/drift-and-deliver-port/?manual=1&quality=high&autostart=1", hook: "__AURA_DRIFT_AND_DELIVER__", begin: "begin", step: "h.stepFrames(120)" },
  { id: "last-train", url: "/examples/last-train-port/?manual=1", hook: "__AURA_LAST_TRAIN__", begin: "begin", step: "h.stepFrames(120)" },
  { id: "kid-goku", url: "/examples/kid-goku-beyond-the-clouds-port/?manual=1", hook: ["__AURA_CUMULUS_DASH__", "__AURA_KID_GOKU__"], begin: "begin", step: "h.stepFrames(120)" },
  { id: "silt", url: "/examples/silt-and-signal-port/?manual=1&start=1", hook: "__AURA_SILT__", begin: "begin", step: "h.stepFrames(120)" },
  { id: "serpentine-sky-run", url: "/examples/saiyan-snake-way-port/?manual=1&autostart=1", hook: ["__AURA_SERPENTINE_SKY_RUN__", "__AURA_SAIYAN_SNAKE_WAY__"], begin: "start", step: "h.stepFrames(90)" }
];

// Env knobs do not reach the remote container; the same knobs may live in tests/browser/shadow-banding.config.json.
const CONFIG_FILE = "tests/browser/shadow-banding.config.json";
const config: { base?: string; games?: string[]; dprs?: number[]; width?: number; height?: number; pageWait?: number } =
  existsSync(CONFIG_FILE) ? JSON.parse(readFileSync(CONFIG_FILE, "utf8")) : {};
const only = (process.env.BANDING_GAMES ?? (config.games ?? []).join(",")).split(",").map((s) => s.trim()).filter(Boolean);
const DPRS = (process.env.BANDING_DPRS ?? (config.dprs ?? [1, 2]).join(",")).split(",").map(Number);
const WIDTH = Number(process.env.BANDING_W ?? config.width ?? 960);
const HEIGHT = Number(process.env.BANDING_H ?? config.height ?? 540);
const BASE = (process.env.BANDING_BASE ?? config.base ?? "").replace(/\/$/, "");

function emit(path: string, bytes: Buffer): void {
  const b64 = bytes.toString("base64");
  const n = Math.ceil(b64.length / FILE_CHUNK);
  for (let i = 0; i < n; i++) console.log(`SLAMV_FILE ${path} ${i} ${n} ${b64.slice(i * FILE_CHUNK, (i + 1) * FILE_CHUNK)}`);
}

test.describe("shadow banding", () => {
  test.setTimeout(3_000_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { if (!BASE) server = await startExampleDevServer(); });
  test.afterAll(async () => { await server?.close(); });

  for (const game of GAMES.filter((g) => only.length === 0 || only.includes(g.id))) {
    for (const dpr of DPRS) {
      test(`${game.id} @${dpr}x has no shadow banding`, async ({ browser }) => {
        const context = await browser.newContext({ viewport: { width: dpr === 1 ? WIDTH : Math.round(WIDTH * 0.8), height: dpr === 1 ? HEIGHT : Math.round(HEIGHT * 0.8) }, deviceScaleFactor: dpr });
        const page = await context.newPage();
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
        await page.goto(`${BASE || server.origin}${game.url}`, { waitUntil: "domcontentloaded" });
        if (game.harness) {
          await page.waitForFunction(() => (window as unknown as { __AURA_SLAM_RENDER__?: { ready(): boolean } }).__AURA_SLAM_RENDER__?.ready() === true, undefined, { timeout: 600_000 });
          await page.evaluate(() => (window as unknown as { __AURA_SLAM_RENDER__: { show(v: string): Promise<void> } }).__AURA_SLAM_RENDER__.show("hard"));
          await page.waitForTimeout(4000);
        } else if (game.hook) {
          const hookNames = typeof game.hook === "string" ? [game.hook] : [...game.hook];
          const readyHook = await page.waitForFunction((names) => {
            const w = window as unknown as Record<string, { ready?: (() => boolean) | boolean } | undefined>;
            for (const name of names) {
              const ready = w[name]?.ready;
              if (typeof ready === "function" ? ready() : ready === true) return name;
            }
            return false;
          }, hookNames, { timeout: 900_000 });
          const hook = (await readyHook.jsonValue()) as string;
          await page.evaluate(`(() => { const h = window.${hook}; if (typeof h.${game.begin} === "function") h.${game.begin}(); ${game.step}; })()`);
          await page.evaluate(async (hook) => {
            const h = (window as unknown as Record<string, { textures?: () => { pending: number } | null; renderNow?: () => void }>)[hook];
            if (typeof h?.textures !== "function") return;
            const t0 = performance.now();
            while (performance.now() - t0 < 240_000) {
              h.renderNow?.();
              if ((h.textures()?.pending ?? 0) === 0) break;
              await new Promise((r) => setTimeout(r, 1000));
            }
          }, hook);
          await page.waitForTimeout(1500);
        } else {
          await page.waitForSelector("canvas", { timeout: 600_000 });
          await page.waitForTimeout(Number(process.env.BANDING_PAGE_WAIT ?? config.pageWait ?? 45_000));
        }
        const png = await page.screenshot({ type: "png" });
        const stats = await page.evaluate(async (b64) => {
          const bmp = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
          const cv = new OffscreenCanvas(bmp.width, bmp.height);
          const cx = cv.getContext("2d")!;
          cx.drawImage(bmp, 0, 0);
          const { data } = cx.getImageData(0, 0, bmp.width, bmp.height);
          const rows: number[] = [];
          let total = 0;
          const x0 = Math.round(bmp.width * 0.2), x1 = Math.round(bmp.width * 0.8);
          for (let y = 0; y < bmp.height; y++) {
            let s = 0;
            for (let x = x0; x < x1; x++) { const i = (y * bmp.width + x) * 4; s += data[i]! * 0.2126 + data[i + 1]! * 0.7152 + data[i + 2]! * 0.0722; }
            rows.push(s / (x1 - x0));
            total += rows[y]!;
          }
          // High-pass energy of the row means (window = 9 device rows scaled by DPR so DPR 2 compares with DPR 1).
          const half = Math.max(2, Math.round((bmp.height / 540) * 4));
          let acc = 0, count = 0;
          for (let y = half; y < bmp.height - half; y++) {
            let m = 0;
            for (let k = -half; k <= half; k++) m += rows[y + k]!;
            m /= 2 * half + 1;
            acc += (rows[y]! - m) ** 2;
            count++;
          }
          return { width: bmp.width, height: bmp.height, luma: Number((total / bmp.height).toFixed(2)), stripe: Number(Math.sqrt(acc / Math.max(1, count)).toFixed(3)) };
        }, png.toString("base64"));
        console.log(`BANDING ${game.id} ${dpr} ${JSON.stringify(stats)} errors=${JSON.stringify(errors.slice(0, 3))}`);
        emit(`banding/${game.id}-${dpr}x.png`, png);
        await context.close();
        expect(stats.luma, `${game.id} not blank`).toBeGreaterThan(6);
        expect(stats.stripe, `${game.id} @${dpr}x stripe energy`).toBeLessThanOrEqual(MAX_STRIPE);
      });
    }
  }
});
