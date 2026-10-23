#!/usr/bin/env tsx
/**
 * tools/crayon-probe/capture-module — capture a Crayon game's module source (R-19).
 *
 * The game module is a `blob:`/inline/`data:` module script inside a sandboxed
 * `about:srcdoc` iframe; api.usecrayon.ai refuses non-browser clients. A hook
 * installed before any game script runs records every Blob passed to
 * `URL.createObjectURL`, and the script then also fetches `<script src>`
 * blob/data URLs from inside each frame. Output is DATA ONLY: the captured text
 * is never evaluated by this tool.
 *
 * REMOTE RUN ONLY (serverless ACR Task, same recipe as evidence/crayon-probes/README.md).
 *   node capture-module.mjs --manifest games.json --only strange-orbit --emit-markers --out /tmp/out
 * Each capture is printed as one JSON line between
 * `@@CRAYON_MODULE_BEGIN:<id>` / `@@CRAYON_MODULE_END:<id>`.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const requireFromRoot = createRequire(path.join(process.env.CRAYON_PROBE_ROOT ?? process.cwd(), "package.json"));
const { chromium } = requireFromRoot("playwright") as {
  chromium: { launch: (o: Record<string, unknown>) => Promise<Browser> };
};

type Frame = { evaluate: (fn: string) => Promise<unknown>; url: () => string };
type Page = { goto: (u: string, o: Record<string, unknown>) => Promise<unknown>; waitForTimeout: (ms: number) => Promise<void>; frames: () => Frame[] };
type Context = { newPage: () => Promise<Page>; addInitScript: (s: string) => Promise<void> };
type Browser = { newContext: (o: Record<string, unknown>) => Promise<Context>; close: () => Promise<void> };

const HOOK = `(function () {
  if (window.__a3dBlobs) return;
  var list = (window.__a3dBlobs = []);
  var orig = URL.createObjectURL;
  URL.createObjectURL = function (obj) {
    var url = orig.apply(this, arguments);
    try { list.push({ url: url, size: obj && obj.size, type: obj && obj.type, blob: obj }); } catch (e) {}
    return url;
  };
})()`;

const READ = `(async function () {
  var out = { href: location.href, blobs: [], scripts: [] };
  var list = window.__a3dBlobs || [];
  for (var i = 0; i < list.length; i++) {
    var b = list[i], text = null;
    try { if (b.blob && /javascript|ecmascript|text|json|^$/.test(b.type || "")) text = await b.blob.text(); } catch (e) {}
    out.blobs.push({ url: b.url, size: b.size, type: b.type, text: text });
  }
  var els = document.querySelectorAll("script");
  for (var j = 0; j < els.length; j++) {
    var s = els[j], text2 = null, src = s.src || null;
    if (src && (src.indexOf("blob:") === 0 || src.indexOf("data:") === 0)) { try { text2 = await (await fetch(src)).text(); } catch (e) {} }
    else if (!src) text2 = s.textContent;
    out.scripts.push({ src: src, type: s.type || null, bytes: text2 == null ? null : text2.length, text: text2 });
  }
  return JSON.stringify(out);
})()`;

const CLICK = `(function () {
  var els = document.querySelectorAll("button,[role=button],a,div,span");
  for (var i = 0; i < els.length; i++) {
    var t = (els[i].textContent || "").trim().toLowerCase();
    if (t && t.length < 40 && /tap to start|click to start|start|play/.test(t)) { els[i].click(); return t; }
  }
  return null;
})()`;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main(): Promise<void> {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(arg("--manifest") ?? "games.json"), "utf8")) as { games: { id: string; url?: string }[] };
  const only = (arg("--only") ?? "").split(",").filter(Boolean);
  const outDir = path.resolve(arg("--out") ?? "capture-out");
  const waitMs = Number(arg("--wait-ms") ?? 20000);
  const markers = process.argv.includes("--emit-markers");
  const launchArgs = process.argv.flatMap((a, i, all) => (a === "--launch-arg" ? [all[i + 1]] : []));
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true, args: launchArgs });
  try {
    for (const game of manifest.games.filter((g) => g.url && (only.length === 0 || only.includes(g.id)))) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      await context.addInitScript(HOOK);
      const page = await context.newPage();
      await page.goto(game.url as string, { waitUntil: "domcontentloaded", timeout: 90000 });
      const started = Date.now();
      const frames: unknown[] = [];
      while (Date.now() - started < waitMs) {
        await page.waitForTimeout(1500);
        for (const f of page.frames()) {
          try { await f.evaluate(CLICK); } catch { /* navigating */ }
        }
      }
      for (const f of page.frames()) {
        try { frames.push(JSON.parse((await f.evaluate(READ)) as string)); } catch (e) { frames.push({ href: f.url(), error: String(e).slice(0, 160) }); }
      }
      const report = { schema: "a3d-crayon-module/1", game: game.id, url: game.url, capturedAt: new Date().toISOString(), frames };
      const json = JSON.stringify(report);
      fs.writeFileSync(path.join(outDir, `${game.id}.module.json`), json);
      if (markers) process.stdout.write(`@@CRAYON_MODULE_BEGIN:${game.id}\n${json}\n@@CRAYON_MODULE_END:${game.id}\n`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => { process.stderr.write(`${String(e)}\n`); process.exit(1); });
