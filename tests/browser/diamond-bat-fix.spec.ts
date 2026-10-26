import { test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { readFileSync } from "node:fs";
import { startExampleDevServer, type ExampleDevServer } from "./example-dev-server";
import { drawnGrip, loadHandMesh, renderedHandCentroid, type HandMesh } from "./diamond-skin-measure";

/**
 * Diamond batter grip, deterministic (remote, software WebGL2). The swing clock is frozen at exact t through
 * `holdSwingAt`; at each t the spec reads `gripProbe()` (true palm positions from the engine bone matrices vs the
 * engine-placed bat axis) and grabs one frame from three cameras. Lines: `@@PROBE` (JSON) and `@@FRAME` (base64 jpeg).
 */
let server: ExampleDevServer;
test.setTimeout(3_000_000);
test.beforeAll(async () => { server = await startExampleDevServer(); });
test.afterAll(async () => { await server?.close(); });

const CHUNK = 30_000;
function emit(name: string, buf: Buffer): void {
  const dir = path.resolve("tests/reports/dbat");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${name}.jpg`), buf);
  const b64 = buf.toString("base64");
  const total = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < total; i += 1) process.stdout.write(`@@FRAME dbat/${name} ${i + 1}/${total} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}\n`);
}

const VIEWS: Record<string, { eye: number[]; target: number[]; fov: number }> = {
  owner: { eye: [-1.7, 2.7, 6.2], target: [-0.85, 1.4, 0.3], fov: 32 },
  side: { eye: [3.4, 1.7, 0.3], target: [-0.85, 1.35, 0.3], fov: 34 },
  front: { eye: [-0.7, 1.9, -3.6], target: [-0.85, 1.35, 0.3], fov: 34 },
  hands: { eye: [-2.0, 1.9, 2.4], target: [-0.95, 1.55, 0.4], fov: 22 }
};
const VIEW_TIMES: Record<string, Array<number | null>> = {
  owner: [null, 0.12, 0.26, 0.4, 0.476, 0.55, 0.7, 0.87, 1.0],
  hands: [null, 0.26, 0.476, 0.7, 0.87],
  side: [null, 0.476],
  front: [null, 0.476]
};

function loadMesh(): HandMesh {
  const route = readFileSync("apps/showcase-aura-diamond-3d/src/aura-assets.route.ts", "utf8");
  const url = /"diamondAthlete":\s*\{[^}]*?url:\s*"([^"]+)"/s.exec(route)![1]!;
  return loadHandMesh(path.resolve("public", url.replace(/^\//, "")));
}

test("diamond batter grip across the swing", async ({ page }) => {
  const mesh = loadMesh();
  const drawn = async (row: Record<string, unknown> | null): Promise<Record<string, unknown>> => {
    if (!row) return {};
    const jm = (await page.evaluate((names) => (window as unknown as Record<string, any>).__AURA3D_GAME_DIAMOND__?.jointMatrices?.(names) ?? null, mesh.jointNames)) as { mats: Record<string, number[] | null>; pos: [number, number, number]; yaw: number; s: number; n: [number, number, number] } | null;
    if (!jm) return {};
    const r = renderedHandCentroid(mesh, "Right", jm.mats, jm);
    const l = renderedHandCentroid(mesh, "Left", jm.mats, jm);
    const g = drawnGrip(r, l, row.knob as [number, number, number], row.tip as [number, number, number]);
    return { drawnRightHand: r, drawnLeftHand: l, ...g };
  };
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error" && !/404|favicon|fonts\//.test(m.text())) errors.push(m.text().slice(0, 200)); });
  await page.setViewportSize({ width: 640, height: 360 });
  await page.goto(`${server.origin}/apps/showcase-aura-diamond-3d/index.html?mode=quick&post=0&shadow=0&aa=0`, { waitUntil: "load", timeout: 300_000 });
  await page.waitForFunction(() => Boolean((window as unknown as Record<string, unknown>).__AURA3D_GAME_DIAMOND__), undefined, { timeout: 600_000 });
  const probe = () => page.evaluate(() => (window as unknown as Record<string, any>).__AURA3D_GAME_DIAMOND__?.gripProbe?.() ?? null) as Promise<Record<string, unknown> | null>;
  const t0 = Date.now();
  for (;;) {
    const ok = await page.evaluate(() => {
      const raw = (window as unknown as Record<string, any>).__AURA3D_GAME_EVIDENCE__ ?? (window as unknown as Record<string, any>).__AURA3D_GAME__;
      const e = typeof raw === "function" ? raw() : raw;
      return Boolean(e?.bat?.socketed);
    });
    if (ok) break;
    if (Date.now() - t0 > 600_000) { process.stdout.write(`@@PROBE {"error":"socket never attached"}\n`); break; }
    await page.waitForTimeout(1_000);
  }
  // The owner's own view: the default batting camera and HUD at the size of their screenshot.
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(4_000);
  emit("default-stance", await page.screenshot({ type: "jpeg", quality: 90 }));
  await page.setViewportSize({ width: 640, height: 360 });
  await page.addStyleTag({ content: "#hud,#menu,#event-ticker,#controls-hint,#render-error{display:none!important} body > *:not(#app){display:none!important}" });
  await page.waitForTimeout(3_000);

  for (const [viewName, view] of Object.entries(VIEWS)) {
    await page.evaluate((v) => (window as unknown as Record<string, any>).__AURA3D_GAME_DIAMOND__?.setCamOverride?.(v), view);
    for (const t of VIEW_TIMES[viewName] ?? []) {
      await page.evaluate((tt) => (window as unknown as Record<string, any>).__AURA3D_GAME_DIAMOND__?.holdSwingAt?.(tt), t);
      if (t === null) await page.waitForTimeout(2_500);
      let prev = "";
      let stable = 0;
      let s: Record<string, unknown> | null = null;
      const t1 = Date.now();
      while (Date.now() - t1 < 120_000 && stable < 2) {
        s = await probe();
        const key = s ? JSON.stringify([s.t, s.rightPalm, s.leftPalm, s.knob]) : "";
        if (s && (t === null ? s.phase === "stance" : Math.abs(Number(s.t) - t) < 0.02) && key === prev) stable += 1; else stable = 0;
        prev = key;
        await page.waitForTimeout(500);
      }
      const label = `${viewName}-${t === null ? "stance" : String(Math.round(t * 1000)).padStart(4, "0")}`;
      process.stdout.write(`@@PROBE ${JSON.stringify({ view: viewName, hold: t, stable, ...(s ?? {}), ...(viewName === "owner" ? await drawn(s) : {}) })}\n`);
      emit(label, await page.screenshot({ type: "jpeg", quality: 88 }));
    }
  }
  // Walk-up (the batter stepping, Walk_Loop) and the run to first (bat put down), from the owner's camera.
  await page.evaluate((v) => (window as unknown as Record<string, any>).__AURA3D_GAME_DIAMOND__?.setCamOverride?.(v), VIEWS.owner);
  await page.evaluate(() => { const hook = (window as unknown as Record<string, any>).__AURA3D_GAME_DIAMOND__; hook?.holdSwingAt?.(null); hook?.qaWalk?.(60); });
  await page.waitForTimeout(6_000);
  const walkRow = await probe();
  process.stdout.write(`@@PROBE ${JSON.stringify({ view: "owner", state: "walk", ...(walkRow ?? {}), ...(await drawn(walkRow)) })}\n`);
  emit("owner-walk", await page.screenshot({ type: "jpeg", quality: 88 }));
  emit("hands-walk", await (async () => { await page.evaluate((v) => (window as unknown as Record<string, any>).__AURA3D_GAME_DIAMOND__?.setCamOverride?.(v), VIEWS.hands); await page.waitForTimeout(1_500); return page.screenshot({ type: "jpeg", quality: 88 }); })());
  await page.evaluate((v) => (window as unknown as Record<string, any>).__AURA3D_GAME_DIAMOND__?.setCamOverride?.(v), VIEWS.owner);
  await page.evaluate(() => { const hook = (window as unknown as Record<string, any>).__AURA3D_GAME_DIAMOND__; hook?.qaWalk?.(0); hook?.qaRun?.(true); });
  await page.waitForTimeout(3_500);
  emit("owner-run", await page.screenshot({ type: "jpeg", quality: 88 }));
  await page.evaluate(() => (window as unknown as Record<string, any>).__AURA3D_GAME_DIAMOND__?.qaRun?.(false));
  await page.waitForTimeout(2_000);

  // Contact: freeze at the contact key with the ball drawn at the predicted contact point, so the sweet spot and the ball can be compared by eye.
  for (const viewName of ["side"]) {
    await page.evaluate((v) => (window as unknown as Record<string, any>).__AURA3D_GAME_DIAMOND__?.setCamOverride?.(v), VIEWS[viewName]);
    await page.evaluate(() => {
      const hook = (window as unknown as Record<string, any>).__AURA3D_GAME_DIAMOND__;
      hook?.holdSwingAt?.(0.5);
      hook?.setQaBall?.(hook.predictedContact());
    });
    await page.waitForTimeout(6_000);
    const s = await probe();
    const predicted = await page.evaluate(() => (window as unknown as Record<string, any>).__AURA3D_GAME_DIAMOND__?.predictedContact?.());
    process.stdout.write(`@@PROBE ${JSON.stringify({ view: viewName, hold: 0.5, ball: predicted, ...(s ?? {}) })}\n`);
    emit(`${viewName}-contact-ball`, await page.screenshot({ type: "jpeg", quality: 88 }));
  }
  await page.evaluate(() => {
    const hook = (window as unknown as Record<string, any>).__AURA3D_GAME_DIAMOND__;
    hook?.setQaBall?.(null);
    hook?.holdSwingAt?.(null);
  });
  process.stdout.write(`@@PROBE ${JSON.stringify({ done: true, errors })}\n`);
});
