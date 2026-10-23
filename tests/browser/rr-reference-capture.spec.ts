import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * Apex Overdrive reference capture (remote only: tools/remote-acr/run.sh, never local Playwright).
 * Loads the ORIGINAL build's simulation (`tests/support/rr-capture/engine.js`, a temporary, uncommitted copy of the file the showcase shipped before it was replaced by the native simulation: git show 00383a9cc07d69ca1d233103923a18eda60481fc:apps/showcase-roadster-rush/public/roadster-rush/engine.js)
 * on a bare page, drives it with the scripted input run in tests/support/rr-reference-run.mjs (manual stepping, fixed seed),
 * and prints the recorded samples as gzip+base64 chunks (`RRREF <seed> <index> <total> <chunk>`) because ACR runs cannot return files.
 */

const SEEDS = (process.env.RR_SEEDS ?? "42,7,20261023").split(",").map((s) => Number(s));
const STEPS = Number(process.env.RR_STEPS ?? 6000);
const EVERY = Number(process.env.RR_EVERY ?? 10);
const ENGINE = readFileSync(resolve("tests/support/rr-capture/engine.js"), "utf8");
const RUN_SRC = readFileSync(resolve("tests/support/rr-reference-run.mjs"), "utf8").replace(/^export /m, "");

for (const seed of SEEDS) {
  test(`original simulation reference, seed ${seed}`, async ({ page }) => {
    test.setTimeout(30 * 60_000);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.route("http://rr.local/**", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/engine.js") return route.fulfill({ contentType: "text/javascript", body: ENGINE });
      if (url.pathname === "/") {
        return route.fulfill({
          contentType: "text/html",
          body: `<!doctype html><html><body style="margin:0"><canvas id="game" width="320" height="200"></canvas><div id="hud"></div><div id="boot"></div><script src="/engine.js"></script></body></html>`
        });
      }
      return route.fulfill({ status: 404, body: "" });
    });
    await page.goto(`http://rr.local/?seed=${seed}`);
    await page.waitForFunction(() => document.body.dataset.ready === "1" || Boolean((window as unknown as { __GAME__?: unknown }).__GAME__), undefined, { timeout: 20 * 60_000 });
    const packed = await page.evaluate(
      async ({ src, seed, steps, every }) => {
        const run = new Function(`${src}; return runReference;`)() as (game: unknown, o: { seed: number; steps: number; every: number }) => unknown;
        const game = (window as unknown as { __GAME__: { game: unknown } }).__GAME__.game;
        const result = run(game, { seed, steps, every });
        const bytes = new TextEncoder().encode(JSON.stringify(result));
        const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
        const buf = new Uint8Array(await new Response(stream).arrayBuffer());
        let bin = "";
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        return btoa(bin);
      },
      { src: RUN_SRC, seed, steps: STEPS, every: EVERY }
    );
    const CHUNK = 3500;
    const total = Math.ceil(packed.length / CHUNK);
    for (let i = 0; i < total; i++) console.log(`RRREF ${seed} ${i} ${total} ${packed.slice(i * CHUNK, (i + 1) * CHUNK)}`);
    console.log(`RRREF_DONE ${seed} bytes=${packed.length} errors=${errors.length}`);
    expect(errors, errors.join("\n")).toEqual([]);
  });
}
