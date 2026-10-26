import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";

const QUICK = false;
const CASES: Array<[string, string[]]> = QUICK ? [["bunkerGuardMeshy", ["Walk_Loop"]]] : [
  ["bunkerGuardMeshy", ["Idle_Loop", "Walk_Loop"]],
  ["bunkerGunnerMeshy", ["Idle_Loop", "Walk_Loop"]],
  ["bunkerWardenMeshy", ["Idle_Loop", "Walk_Loop"]],
  ["bunkerHoundMeshy", ["Idle_Loop", "Walk_Loop"]],
  ["gullsiegeHeroGullMeshy", ["Ready", "Load", "Jump_Loop"]],
  ["gullsiegeRaiderBossMeshy", ["Idle_Loop", "Contest"]]
];
const FRAMES = QUICK ? 4 : 5;
const CHUNK = 30_000;
let server: ExampleDevServer;
test.setTimeout(3_000_000);
test.beforeAll(async () => { server = await startExampleDevServer(); });
test.afterAll(async () => { await server?.close(); });

for (const [asset, clips] of CASES) {
  test(`rig ${asset}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => { errors.push(`pageerror ${e.message}`.slice(0, 200)); process.stdout.write(`@@RIGLOG pageerror ${e.message.slice(0, 300)}\n`); });
    page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") process.stdout.write(`@@RIGLOG ${m.type()} ${m.text().slice(0, 300).replace(/\n/g, " ")}\n`); if (m.type() === "error" && !/404|favicon/.test(m.text())) errors.push(m.text().slice(0, 200)); });
    page.on("response", (r) => { if (r.status() >= 400 && /aura-assets|\.glb/.test(r.url())) { errors.push(`HTTP ${r.status()} ${r.url().slice(-80)}`); process.stdout.write(`@@RIGLOG HTTP ${r.status()} ${r.url().slice(-100)}\n`); } });
    await page.setViewportSize({ width: 560, height: 700 });
    for (const clip of clips) {
      for (const view of ["front", "side"]) {
        await page.goto(`${server.origin}/tests/browser/p2-rig-viewer/index.html?asset=${asset}&clip=${clip}&side=${view === "side" ? 1 : 0}`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => Boolean((window as unknown as { __RIG__?: unknown }).__RIG__), undefined, { timeout: 240_000 });
        // wait for the model: the empty stage screenshot is small and static, the lit character makes the frame clearly larger
        const base = (await page.screenshot({ type: "jpeg", quality: 40, timeout: 120_000 })).length;
        const t0 = Date.now();
        let lit = false;
        while (Date.now() - t0 < (QUICK ? 40_000 : 150_000)) {
          await page.waitForTimeout(3_000);
          const len = (await page.screenshot({ type: "jpeg", quality: 40, timeout: 120_000 })).length;
          if (Math.abs(len - base) > base * 0.12) { lit = true; break; }
        }
        const info = await page.evaluate(() => { const r = (window as unknown as { __RIG__?: { app: { nodes?: { get?: (id: string) => unknown } } } }).__RIG__; const n = r?.app?.nodes?.get?.("rig") as Record<string, unknown> | undefined; return n ? Object.keys(n).slice(0, 20).join(",") : "no-node"; }).catch((e) => `eval-error ${String(e).slice(0, 100)}`);
        process.stdout.write(`@@RIGINFO ${info}\n`);
        process.stdout.write(`@@RIGLIT ${asset} ${clip} ${view} lit=${lit} after=${Math.round((Date.now() - t0) / 1000)}s\n`);
        await page.waitForTimeout(2_000);
        const dir = path.resolve("tests/reports/p2rig", asset);
        mkdirSync(dir, { recursive: true });
        for (let i = 0; i < FRAMES; i += 1) {
          const buf = await page.screenshot({ type: "jpeg", quality: 72, timeout: 120_000 });
          const name = `${clip}-${view}-${i}`;
          writeFileSync(path.join(dir, `${name}.jpg`), buf);
          const b64 = buf.toString("base64");
          const total = Math.ceil(b64.length / CHUNK);
          for (let c = 0; c < total; c += 1) process.stdout.write(`@@FRAME ${asset}/${name} ${c + 1}/${total} ${b64.slice(c * CHUNK, (c + 1) * CHUNK)}\n`);
          await page.waitForTimeout(160);
        }
      }
    }
    process.stdout.write(`@@RIGDONE ${asset} errors=${JSON.stringify(errors.slice(0, 6))}\n`);
  });
}
