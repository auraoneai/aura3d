#!/usr/bin/env tsx
/**
 * tools/crayon-capture/drift-and-deliver — scripted, repeatable drive of the ORIGINAL Drift & Deliver.
 * REMOTE RUN ONLY (serverless ACR Task, recipe in evidence/crayon-capture/drift-and-deliver.md); never run
 * Playwright on the Mac.
 *
 * The game keeps its car physics in `zr(dt)` and exposes `window.__sim(steps, keys, dt)` and `window.__tp`.
 * On the splash screen the real-time loop does not simulate, so this tool teleports to a spawn, steps the
 * physics one 1/60 s step at a time with a key map and records the full state vector after every step. Each
 * scenario is hashed; fresh browser contexts must reproduce the hash exactly.
 *
 *   node drift-and-deliver.mjs --manifest games.json --sessions 3 --emit-markers --out /tmp/out
 * Each session prints one JSON object between `@@DRIFT_CAPTURE_BEGIN:<n>` / `@@DRIFT_CAPTURE_END:<n>`.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { GAME_ID, READY_EXPRESSION, SCENARIOS, pageRunnerSource, type SessionResult } from "./drift-and-deliver-lib.js";

const requireFromRoot = createRequire(path.join(process.env.CRAYON_PROBE_ROOT ?? process.cwd(), "package.json"));
const { chromium } = requireFromRoot("playwright") as { chromium: { launch: (o: Record<string, unknown>) => Promise<Browser> } };

interface Frame { evaluate: (expr: string) => Promise<unknown>; url: () => string }
interface Page { goto: (u: string, o: Record<string, unknown>) => Promise<unknown>; waitForTimeout: (ms: number) => Promise<void>; frames: () => Frame[] }
interface Context { newPage: () => Promise<Page>; close: () => Promise<void> }
interface Browser { newContext: (o: Record<string, unknown>) => Promise<Context>; close: () => Promise<void>; version: () => string }

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function findReadyFrame(page: Page, waitMs: number): Promise<Frame | null> {
  const started = Date.now();
  while (Date.now() - started < waitMs) {
    await page.waitForTimeout(2000);
    for (const f of page.frames()) {
      try {
        if ((await f.evaluate(READY_EXPRESSION)) === true) return f;
      } catch {
        /* navigating or stalled while the world builds */
      }
    }
  }
  return null;
}

async function main(): Promise<void> {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(arg("--manifest") ?? "games.json"), "utf8")) as { games: { id: string; url?: string }[] };
  const game = manifest.games.find((g) => g.id === GAME_ID);
  if (!game?.url) throw new Error(`${GAME_ID} url missing from manifest`);
  const outDir = path.resolve(arg("--out") ?? "capture-out");
  const sessions = Number(arg("--sessions") ?? 2);
  const waitMs = Number(arg("--wait-ms") ?? 240000);
  const sampleEvery = Number(arg("--sample-every") ?? 10);
  const markers = process.argv.includes("--emit-markers");
  const launchArgs = process.argv.flatMap((a, i, all) => (a === "--launch-arg" ? [all[i + 1] as string] : []));
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true, args: launchArgs });
  try {
    for (let n = 1; n <= sessions; n++) {
      const context = await browser.newContext({ viewport: { width: 800, height: 450 } });
      const page = await context.newPage();
      const startedAt = new Date().toISOString();
      await page.goto(game.url, { waitUntil: "domcontentloaded", timeout: 90000 });
      const frame = await findReadyFrame(page, waitMs);
      const base = { schema: "a3d-crayon-capture-session/1", session: n, startedAt, url: game.url, browser: browser.version() };
      let session: Record<string, unknown>;
      if (!frame) {
        session = { ...base, error: "game frame with __sim/__tp/__dbg not found", frames: page.frames().map((f) => f.url()) };
      } else {
        const raw = (await frame.evaluate(pageRunnerSource(SCENARIOS, sampleEvery))) as string;
        session = { ...base, ...(JSON.parse(raw) as Pick<SessionResult, "world" | "scenarios">) };
      }
      const json = JSON.stringify(session);
      fs.writeFileSync(path.join(outDir, `${GAME_ID}.session-${n}.json`), json);
      if (markers) process.stdout.write(`@@DRIFT_CAPTURE_BEGIN:${n}\n${json}\n@@DRIFT_CAPTURE_END:${n}\n`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && /drift-and-deliver\.(ts|mjs|js)$/.test(process.argv[1])) {
  main().catch((e) => {
    process.stderr.write(`${String(e)}\n`);
    process.exit(1);
  });
}
