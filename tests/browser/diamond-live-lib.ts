import type { Page } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { drawnGrip, loadHandMesh, renderedHandCentroid } from "./diamond-skin-measure";

/**
 * The owner's path against the LIVE site: Quick Play from the menu, the default game camera behind the batter, waiting for the pitch,
 * then the swing; desktop 1440x900 at DPR 2 and 1. The grip is measured on screen: the distance from each drawn palm (CPU-skinned hand
 * vertices) to the bat handle, projected through the default batting camera, in CSS pixels and as a fraction of the batter's height.
 * Lines: `@@LIVE` (JSON) and `@@FRAME` (base64 jpeg). Set DIAMOND_LIVE_URL to point at another origin (a preview, a local build).
 */
export const BASE = process.env.DIAMOND_LIVE_URL ?? "https://aura3d.auraone.ai/apps/showcase-aura-diamond-3d/";
const CHUNK = 30_000;
export function emit(name: string, buf: Buffer): void {
  const dir = path.resolve("tests/reports/dlive");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${name}.jpg`), buf);
  const b64 = buf.toString("base64");
  const total = Math.ceil(b64.length / CHUNK);
  for (let i = 0; i < total; i += 1) process.stdout.write(`@@FRAME dlive/${name} ${i + 1}/${total} ${b64.slice(i * CHUNK, (i + 1) * CHUNK)}\n`);
}
export const line = (o: unknown): void => { process.stdout.write(`@@LIVE ${JSON.stringify(o)}\n`); };

export type V3 = [number, number, number];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (v: V3): V3 => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; };

/** The default batting camera (updateCamera, batting mode, no pitch in flight, pci centred), settled. */
const CAM = { eye: [-0.5, 6.4, 11.6] as V3, target: [-0.5, 1.28, -7.2] as V3, fov: 40 };
export let liveCam: { eye: V3; target: V3; fov: number } | null = null;
export function project(p: V3, w: number, h: number): [number, number] {
  const cam = liveCam ?? CAM;
  const f = unit(sub(cam.target, cam.eye));
  const r = unit(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const d = sub(p, cam.eye);
  const z = dot(d, f);
  const t = Math.tan((cam.fov * Math.PI) / 360);
  return [w / 2 + ((dot(d, r) / (z * t * (w / h))) * w) / 2, h / 2 - ((dot(d, u) / (z * t)) * h) / 2];
}
export function segDist(p: [number, number], a: [number, number], b: [number, number]): number {
  const ab = [b[0] - a[0], b[1] - a[1]];
  const ap = [p[0] - a[0], p[1] - a[1]];
  const t = Math.max(0, Math.min(1, (ap[0]! * ab[0]! + ap[1]! * ab[1]!) / (ab[0]! * ab[0]! + ab[1]! * ab[1]! || 1)));
  return Math.hypot(p[0] - (a[0] + ab[0]! * t), p[1] - (a[1] + ab[1]! * t));
}

export function loadMesh() {
  const route = readFileSync("apps/showcase-aura-diamond-3d/src/aura-assets.route.ts", "utf8");
  const url = /"diamondAthlete":\s*\{[^}]*?url:\s*"([^"]+)"/s.exec(route)![1]!;
  return loadHandMesh(path.resolve("public", url.replace(/^\//, "")));
}



export function setLiveCam(c: { eye: V3; target: V3; fov: number } | null): void { liveCam = c; }

export type Snap = { probe: Record<string, any> | null; joints: { mats: Record<string, number[] | null>; pos: V3; yaw: number; s: number; n: V3 } | null; state: { phase: string } | undefined; url: string | null; frame: number };

/** Boot the live page the owner's way (Quick Play) and run one part: "swing" (stance + a real swing) or "hold" (frozen filmstrip). */
export async function runLive(page: Page, part: "swing" | "hold" | "multi", dpr: number): Promise<void> {
  const mesh = loadMesh();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message.slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error" && !/404|favicon|fonts\//.test(m.text())) errors.push(m.text().slice(0, 200)); });
  await page.goto(BASE, { waitUntil: "load", timeout: 300_000 });
  await page.waitForFunction(() => Boolean((window as unknown as Record<string, unknown>).__AURA3D_GAME_DIAMOND__), undefined, { timeout: 600_000 });
  await page.waitForTimeout(2_000);
  let clicked = false;
  try { await page.getByRole("button", { name: /quick play/i }).first().click({ timeout: 10_000 }); clicked = true; } catch { /* fall back to the hook */ }
  if (!clicked) await page.evaluate(() => (window as unknown as Record<string, any>).__AURA3D_GAME_DIAMOND__?.start?.("quick"));
  const state = () => page.evaluate(() => (window as unknown as Record<string, any>).__AURA3D_GAME_DIAMOND__?.state?.()) as Promise<{ phase: string } | undefined>;
  const t0 = Date.now();
  for (;;) {
    const st = await state();
    if (st && st.phase !== "menu") break;
    if (Date.now() - t0 > 300_000) break;
    await page.waitForTimeout(500);
  }
  line({ part, dpr, clicked, state: await state() });
  await page.waitForTimeout(5_000);

  const collect = (opts: { maxFrames: number; mode: "all" | "swing" | "every"; every?: number; holdTimes?: number[]; stopAfterSwing?: boolean }) =>
    page.evaluate(async ({ names, o }) => {
      const hook = (window as unknown as Record<string, any>).__AURA3D_GAME_DIAMOND__;
      const canvas = document.querySelector("#app canvas") as HTMLCanvasElement;
      const out: unknown[] = [];
      const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
      let f = 0;
      let sawSwing = false;
      let calm = 0;
      const take = (force: boolean) => {
        const probe = hook.gripProbe?.() ?? null;
        const joints = hook.jointMatrices?.(names) ?? null;
        const swinging = Boolean(probe && probe.phase !== "stance");
        const shoot = force || o.mode === "all" || (o.mode === "swing" && swinging) || (o.mode === "every" && f % (o.every ?? 1) === 0);
        out.push({ probe, joints, state: hook.state?.(), url: shoot ? canvas.toDataURL("image/jpeg", 0.86) : null, frame: f });
        if (swinging) { sawSwing = true; calm = 0; } else if (sawSwing) calm += 1;
      };
      if (o.holdTimes) {
        for (const t of o.holdTimes) {
          hook.holdSwingAt?.(t);
          for (let i = 0; i < 4; i += 1) await frame();
          take(true);
        }
        hook.holdSwingAt?.(null);
        return out;
      }
      for (; f < o.maxFrames; f += 1) {
        await frame();
        take(false);
        if (o.stopAfterSwing && sawSwing && calm >= 3) break;
      }
      return out;
    }, { names: mesh.jointNames, o: opts }) as Promise<Snap[]>;

  const report = (label: string, sn: Snap, extra: Record<string, unknown> = {}): void => {
    const s = sn.probe;
    if (s?.camera) liveCam = s.camera as { eye: V3; target: V3; fov: number };
    const out: Record<string, unknown> = { label, dpr, state: sn.state, ...extra, ...(s ?? {}) };
    if (s && sn.joints) {
      const r = renderedHandCentroid(mesh, "Right", sn.joints.mats, sn.joints);
      const l = renderedHandCentroid(mesh, "Left", sn.joints.mats, sn.joints);
      Object.assign(out, drawnGrip(r, l, s.knob as V3, s.tip as V3));
      const W = 1440, H = 900;
      const knob = s.knob as V3, tip = s.tip as V3;
      const d = sub(tip, knob);
      const len = Math.hypot(...d);
      const handleEnd: V3 = [knob[0] + (d[0] / len) * 0.3, knob[1] + (d[1] / len) * 0.3, knob[2] + (d[2] / len) * 0.3];
      const a = project(knob, W, H), b = project(handleEnd, W, H);
      const head = project([-0.82, 1.9, 0.28], W, H), feet = project([-0.82, 0, 0.28], W, H);
      const batterPx = Math.hypot(head[0] - feet[0], head[1] - feet[1]);
      const rp = r ? project(r, W, H) : null, lp = l ? project(l, W, H) : null;
      Object.assign(out, {
        batterHeightPx: Math.round(batterPx),
        drawnRightToHandlePx: rp ? Number(segDist(rp, a, b).toFixed(1)) : null,
        drawnLeftToHandlePx: lp ? Number(segDist(lp, a, b).toFixed(1)) : null,
        drawnRightToHandleFrac: rp ? Number((segDist(rp, a, b) / batterPx).toFixed(3)) : null,
        drawnLeftToHandleFrac: lp ? Number((segDist(lp, a, b) / batterPx).toFixed(3)) : null
      });
    }
    line(out);
    if (sn.url) emit(`dpr${dpr}-${label}`, Buffer.from(sn.url.split(",")[1]!, "base64"));
  };

  if (part === "swing") {
    const stance = await collect({ maxFrames: 31, mode: "every", every: 15 });
    stance.filter((x) => x.url).forEach((x, i) => report(`01-stance-${i}`, x));
    // A real swing: Space, then every frame kept while the batter swings (numbers and pixels come from the same frame).
    const swingP = collect({ maxFrames: 90, mode: "swing", stopAfterSwing: true });
    await page.waitForTimeout(300);
    await page.keyboard.press("Space");
    const swing = await swingP;
    const kept = swing.filter((x) => x.url);
    line({ real: "swing", frames: swing.length, keptFrames: kept.length });
    kept.slice(0, 40).forEach((x, i) => report(`02-swing-${String(i).padStart(2, "0")}`, x));
  } else if (part === "multi") {
    // Several plate appearances in a row the way the owner plays: stance, Space, ball in play, the batter runs and is hidden, the next batter steps in.
    // A snapshot (numbers and pixels of the same frame) every few seconds for up to 30 minutes, whatever the game is doing, so batter run, hide and return are all covered.
    let swings = 0;
    const started = Date.now();
    let shot = 0;
    while (Date.now() - started < 1_800_000 && shot < 70) {
      const snaps = await collect({ maxFrames: 2, mode: "all" });
      const last = snaps[snaps.length - 1]!;
      const ph = last.state?.phase;
      report(`04-multi-${String(shot).padStart(2, "0")}-${ph ?? "x"}`, last, { swings });
      shot += 1;
      if (ph === "between" && last.probe && last.probe.phase === "stance") {
        await page.keyboard.press("Space");
        swings += 1;
      }
      await page.waitForTimeout(1_800);
    }
  } else {
    const times = [0.03, 0.08, 0.14, 0.2, 0.26, 0.33, 0.4, 0.45, 0.476, 0.52, 0.55, 0.62, 0.7, 0.8, 0.9, 1.0];
    const held = await collect({ maxFrames: 0, mode: "all", holdTimes: times });
    held.forEach((x, i) => report(`03-hold-${String(Math.round(times[i]! * 1000)).padStart(4, "0")}`, x, { hold: times[i] }));
  }
  line({ done: true, part, dpr, errors });
}
