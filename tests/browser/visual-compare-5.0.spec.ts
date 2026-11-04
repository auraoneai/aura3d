import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { test, type Page } from "@playwright/test";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { glMetaInPage } from "./game-luma-stats";
import { GAME_LUMA_TARGETS, type GameLumaTarget } from "./game-luma-targets";

/**
 * 4.7.10 -> 5.0 paired visual comparison capture (acceptance group `visual-compare`, optional).
 *
 * Loads each `kind: "paired"` view of tools/release/visual-compare-5.0/plan.json through the SAME route, `prepare` step,
 * viewport (1280x720, DPR 1), canvas-only screenshot and settle protocol as tests/browser/game-luma-capture.spec.ts, the
 * spec that produced the 4.7.x frames of record, and writes lossless PNGs plus the 0.7-quality JPEG the baselines used:
 *
 *   tests/reports/visual-compare-5.0/<run>/frames/<id>.png          the view's primary shot (the one a baseline exists for)
 *   tests/reports/visual-compare-5.0/<run>/frames/<id>--<shot>.png  an extra shot (VC_SHOTS=25,60)
 *   tests/reports/visual-compare-5.0/<run>/frames/<id>[--<shot>].jpg  same pixels through canvas.toDataURL("image/jpeg", 0.7)
 *   tests/reports/visual-compare-5.0/<run>/meta/<id>--<shot>.json   GL_META rows, engine info and timing for that shot
 *   tests/reports/visual-compare-5.0/<run>/environment.json         browser, WebGL renderer, project, candidate
 * Compare with tools/release/visual-compare-5.0/contact-sheet.mjs. Remote only (tools/remote-acr/run-acceptance5.sh,
 * ACCEPT_GROUPS=visual-compare); no baseline is re-captured.
 *
 * Env: VC_VIEWS=<id,id>  capture only those plan ids (default all);  VC_SHOTS=25,60  shots to take (default: the plan's
 * defaultShots, 25 s where a 25 s baseline exists else 60 s);  VC_RUN=<name>  run folder (default AURA3D_RUN_ID).
 * Software WebGL2 presents about one frame every 5 to 10 s: a 25 s shot completes about 3.5 min after ready (median), a 60 s
 * shot 5 to 12 min. The tests are `parallel` so Playwright --shard can spread views over several ACR runs.
 */

type ShotName = "settle-25s" | "settle-60s";
interface PlanBaseline { readonly path: string; readonly sha256: string }
interface PlanView {
  readonly kind: "paired";
  readonly id: string;
  readonly target: string;
  readonly route: string;
  readonly query: string;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly deviceScaleFactor: number;
  readonly settle: { readonly shots: readonly ShotName[]; readonly defaultShots: readonly ShotName[]; readonly waitSeconds: Record<ShotName, number> };
  readonly baselines: Record<ShotName, PlanBaseline | null>;
  readonly capture: { readonly primaryShot: ShotName };
}
interface Plan { readonly schema: string; readonly views: readonly PlanView[] }

const PLAN_PATH = "tools/release/visual-compare-5.0/plan.json";
const plan = JSON.parse(readFileSync(PLAN_PATH, "utf8")) as Plan;
if (plan.schema !== "aura3d.visual-compare-plan/1") throw new Error(`unexpected plan schema ${plan.schema}`);

const RUN = (process.env.VC_RUN ?? process.env.AURA3D_RUN_ID ?? "local").replace(/[^a-zA-Z0-9_-]/g, "-");
const OUT = join("tests/reports/visual-compare-5.0", RUN);
const WANT = (process.env.VC_VIEWS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
const SHOT_OVERRIDE = (process.env.VC_SHOTS ?? "").split(",").map((s) => s.trim()).filter(Boolean).map((s) => `settle-${s.replace(/s$/, "")}s` as ShotName);

// Same constants as tests/browser/game-luma-capture.spec.ts (not exported there: importing a spec would register its tests).
const CANVAS_ONLY = "body *:not(canvas){visibility:hidden !important} canvas{visibility:visible !important} html,body{background:#000 !important}";
const READY = "document.body.dataset.aura3dReady === 'true' || Boolean(window.__AURA3D_LIVE_APPS__ && window.__AURA3D_LIVE_APPS__.all().some((a) => (a.diagnostics?.().drawCalls ?? 0) > 0))";

const write = (file: string, data: string | Buffer): void => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
};

const targetByName = new Map<string, GameLumaTarget>(GAME_LUMA_TARGETS.map((t) => [t.name, t]));

/** Plan views to run; exported for the unit test of the plan/target agreement. */
function plannedViews(): readonly PlanView[] {
  return plan.views.filter((v) => v.kind === "paired" && (!WANT.length || WANT.includes(v.id)));
}

function shotsFor(view: PlanView): ShotName[] {
  const shots = SHOT_OVERRIDE.length ? SHOT_OVERRIDE : [...view.settle.defaultShots];
  for (const s of shots) if (!(s in view.settle.waitSeconds)) throw new Error(`${view.id}: unknown shot ${s}`);
  return [...new Set(shots)].sort((a, b) => view.settle.waitSeconds[a] - view.settle.waitSeconds[b]);
}

async function engineInfo(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const reg = (globalThis as unknown as { __AURA3D_LIVE_APPS__?: { all(): any[] } }).__AURA3D_LIVE_APPS__;
    const app = reg?.all()[0];
    if (!app) return { app: false };
    try {
      const dg = app.diagnostics?.();
      const rows: { status?: string }[] = dg?.renderer?.runtime?.texturedMaterials ?? [];
      return { app: true, renderPath: dg?.renderPath?.path ?? null, drawCalls: dg?.drawCalls ?? null,
        triangles: typeof dg?.triangles === "number" ? dg.triangles : null, textureBytes: typeof dg?.textureBytes === "number" ? dg.textureBytes : null,
        texPending: rows.filter((r) => r?.status === "pending").length, texTotal: rows.length, errors: Array.isArray(dg?.errors) ? dg.errors.length : null };
    } catch (e) { return { app: true, diagErr: String(e) }; }
  });
}

async function environment(page: Page, project: string, browserVersion: string): Promise<Record<string, unknown>> {
  const gl = await page.evaluate(() => {
    const c = document.createElement("canvas");
    const ctx = c.getContext("webgl2");
    if (!ctx) return { webgl2: false };
    const ext = ctx.getExtension("WEBGL_debug_renderer_info");
    return { webgl2: true, version: ctx.getParameter(ctx.VERSION) as string,
      renderer: ext ? (ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) as string) : (ctx.getParameter(ctx.RENDERER) as string),
      vendor: ext ? (ctx.getParameter(ext.UNMASKED_VENDOR_WEBGL) as string) : (ctx.getParameter(ctx.VENDOR) as string),
      devicePixelRatio: window.devicePixelRatio, userAgent: navigator.userAgent };
  });
  let candidate: string | null = process.env.AURA3D_CANDIDATE ?? null;
  const gatePath = process.env.AURA3D_CODE_COMPLETE_GATE;
  if (!candidate && gatePath && existsSync(gatePath)) {
    try { candidate = (JSON.parse(readFileSync(gatePath, "utf8")) as { freezeCommit?: string }).freezeCommit ?? null; } catch { candidate = null; }
  }
  return { schema: "aura3d.visual-compare-environment/1", run: RUN, project, browserVersion, platform: process.platform, node: process.version,
    candidateFreezeCommit: candidate, gate: gatePath ?? null, acrRunId: process.env.AURA3D_RUN_ID ?? null, shard: process.env.AURA3D_PW_SHARD ?? null,
    forceSwiftshader: process.env.AURA3D_FORCE_SWIFTSHADER ?? null, gl, planSchema: plan.schema, baselineEnvironment: "software WebGL2 (SwiftShader), see plan.json from.environment" };
}

test.describe.configure({ mode: "parallel" });
test.describe("visual compare 5.0 (paired)", () => {
  test.setTimeout(1_200_000);
  let server: ExampleDevServer;
  test.beforeAll(async () => { server = await startExampleDevServer(); });
  test.afterAll(async () => { await server.close(); });

  for (const view of plannedViews()) {
    test(`${view.target} @vc:${view.id}`, async ({ page, browser }, testInfo) => {
      const target = targetByName.get(view.target);
      if (!target) throw new Error(`${view.id}: no game-luma target named ${view.target}`);
      if (target.url !== `${view.route}${view.query}`) throw new Error(`${view.id}: plan route ${view.route}${view.query} differs from the target ${target.url}; rerun tools/release/visual-compare-5.0/build-plan.mjs`);
      const shots = shotsFor(view);
      page.on("pageerror", (e) => process.stdout.write(`VC_ERR ${view.id} pageerror ${e.message.slice(0, 300)}\n`));
      page.on("console", (m) => { if (m.type() === "error") process.stdout.write(`VC_CONSOLE ${view.id} ${m.text().slice(0, 200)}\n`); });
      const badResponses: string[] = [];
      page.on("response", (r) => {
        if (r.status() < 400) return;
        const row = `${r.status()} ${new URL(r.url()).pathname}`;
        if (badResponses.length < 20) badResponses.push(row);
        process.stdout.write(`VC_HTTP ${view.id} ${row}\n`);
      });
      await page.setViewportSize(view.viewport);
      const started = Date.now();
      await page.goto(`${server.origin}${target.url}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(READY, undefined, { timeout: 420_000, polling: 500 });
      if (target.prepare) await target.prepare(page);
      const loaded = Date.now();
      const readyAt = performance.now();
      process.stdout.write(`VC_READY ${view.id} ${loaded - started}ms\n`);
      write(join(OUT, "environment.json"), `${JSON.stringify(await environment(page, testInfo.project.name, browser.version()), null, 2)}\n`);

      for (const shot of shots) {
        const wait = view.settle.waitSeconds[shot] * 1000 - (Date.now() - loaded);
        if (wait > 0) await page.waitForTimeout(wait);
        const sinceReadyMs = Date.now() - loaded;
        const style = await page.addStyleTag({ content: CANVAS_ONLY });
        await page.waitForTimeout(250);
        const png = await page.screenshot({ type: "png" });
        const shotDoneMs = Math.round(performance.now() - readyAt);
        const meta = await page.evaluate(glMetaInPage, { png: png.toString("base64"), crops: target.crops ?? [] });
        const info = await engineInfo(page);
        const stem = shot === view.capture.primaryShot ? view.id : `${view.id}--${shot}`;
        write(join(OUT, "frames", `${stem}.png`), png);
        write(join(OUT, "frames", `${stem}.jpg`), Buffer.from(meta.jpeg, "base64"));
        write(join(OUT, "meta", `${view.id}--${shot}.json`), `${JSON.stringify({
          id: view.id, target: view.target, shot, frame: `frames/${stem}.png`, viewport: view.viewport, dpr: view.deviceScaleFactor,
          sinceReadyMs, screenshotCompletedSinceReadyMs: shotDoneMs, readyMs: loaded - started, info, badResponses, glMeta: meta.v1, glMetaV2: meta.v2
        }, null, 1)}\n`);
        process.stdout.write(`VC_SHOT ${view.id} ${shot} ${png.length}b sinceReady=${sinceReadyMs}ms done=${shotDoneMs}ms\n`);
        await style.evaluate((el) => (el as Element).remove());
      }
      process.stdout.write(`VC_DONE ${view.id}\n`);
    });
  }
});
