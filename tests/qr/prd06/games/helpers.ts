// PRD-06 T5.x — shared probes for the six per-game §17.4 failing-control
// specs. All reads reach the live app through the engine's
// `__AURA3D_LIVE_APPS__` registry (`nodes.get`/`nodes.all`); each route's own
// deterministic pump hook is used where one exists (`__GS_PUMP__`,
// `__RB_PUMP__`, `__AURA3D_SKYLINE_PUMP__`). No route instrumentation is
// touched.

import type { Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { request as httpRequest } from "node:http";
import { resolve } from "node:path";

declare global {
  interface Window {
    __AURA3D_LIVE_APPS__?: {
      count(): number;
      all(): readonly {
        nodes: {
          get(id: string): unknown;
          all(): readonly unknown[];
          ids?(): readonly string[];
        };
        diagnostics(): unknown;
      }[];
    };
  }
}

export interface AnimationStateProbe {
  readonly available: boolean;
  readonly state?: {
    readonly activeClip: string | null;
    readonly tracksApplied: number;
    readonly activeActions: readonly {
      readonly clip?: string;
      readonly weight?: number;
      readonly layer?: string | number | null;
      readonly additive?: boolean;
      readonly mask?: unknown;
    }[];
    readonly timeScale: number;
  } | null;
}

/** Waits until at least one live app is registered. */
export async function waitForApps(page: Page, timeout = 120_000): Promise<void> {
  await page.waitForFunction(() => (window.__AURA3D_LIVE_APPS__?.count() ?? 0) > 0, undefined, { timeout });
}

// NOTE: `page.evaluate`/`waitForFunction` callbacks serialize and run in the
// page — module-scope identifiers are NOT visible inside them. Every page
// function carries its own `window as unknown as Record<string, unknown>`
// cast for custom hooks.

/** Waits for a named window hook (a route's deterministic pump). */
export async function waitForHook(page: Page, name: string, timeout = 20_000): Promise<void> {
  await page.waitForFunction((n) => typeof (window as unknown as Record<string, unknown>)[n] === "function", name, { timeout });
}

/** Runs a route pump hook (`__GS_PUMP__`, `__RB_PUMP__`, ...) `frames` times. */
export function pumpFrames(page: Page, hookName: string, frames: number): Promise<number> {
  return page.evaluate(([name, n]) => {
    const hook = (window as unknown as Record<string, unknown>)[name] as ((f: number) => number) | undefined;
    return hook ? hook(n) : -1;
  }, [hookName, frames] as const);
}

/** Reads `nodes.get(id).animation.animationState()` — `available:false` when the C-19 api isn't attached. */
export function readAnimationState(page: Page, nodeId: string): Promise<AnimationStateProbe> {
  return page.evaluate((id) => {
    const app = window.__AURA3D_LIVE_APPS__?.all()[0];
    const handle = app?.nodes.get(id) as { animation?: { animationState?: () => unknown } } | undefined;
    const api = handle?.animation;
    if (typeof api?.animationState !== "function") return { available: false };
    return { available: true, state: api.animationState() as AnimationStateProbe["state"] };
  }, nodeId);
}

/** True when `socket(bone)` reports valid on the node — i.e. it has a bound skeleton. */
export function socketValid(page: Page, nodeId: string, bone: string): Promise<boolean> {
  return page.evaluate(([id, b]) => {
    const app = window.__AURA3D_LIVE_APPS__?.all()[0];
    const handle = app?.nodes.get(id) as { animation?: { socket?: (x: string) => { valid: boolean } } } | undefined;
    return handle?.animation?.socket?.(b)?.valid === true;
  }, [nodeId, bone] as const);
}

const HIP_BONE_CANDIDATES = ["Hips", "hips", "Hip", "Root", "root", "Spine", "mixamorigHips", "mixamorig:Hips"];

/** Discovers a rig's hip/root bone name through `socket(bone).valid`. */
export function findHipsBone(page: Page, nodeId: string): Promise<string | null> {
  return page.evaluate(([id, candidates]) => {
    const app = window.__AURA3D_LIVE_APPS__?.all()[0];
    const handle = app?.nodes.get(id) as { animation?: { socket?: (bone: string) => { valid: boolean } } } | undefined;
    if (typeof handle?.animation?.socket !== "function") return null;
    for (const bone of candidates) {
      if (handle.animation.socket(bone).valid) return bone;
    }
    return null;
  }, [nodeId, HIP_BONE_CANDIDATES] as const);
}

/** Lists the ids of every registered node whose `animation.socket` api is attached. */
export function listSocketCapableNodeIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const app = window.__AURA3D_LIVE_APPS__?.all()[0];
    const out: string[] = [];
    const candidates = ["Hips", "hips", "Spine", "spine", "Root", "root", "Head", "head"];
    for (const node of app?.nodes.all() ?? []) {
      const h = node as { id?: string; name?: string; animation?: { socket?: (b: string) => { valid: boolean } } };
      if (typeof h?.animation?.socket !== "function") continue;
      if (candidates.some((b) => h.animation!.socket!(b).valid)) out.push(h.id ?? h.name ?? "?");
    }
    return out;
  });
}

export interface NodeTransformProbe {
  readonly exists: boolean;
  readonly visible: boolean | null;
  readonly scale: readonly [number, number, number] | null;
  readonly position: readonly [number, number, number] | null;
  readonly rotationEuler: readonly [number, number, number] | null;
}

/** Reads existence/visibility/transform of a node handle. */
export function readNodeTransform(page: Page, nodeId: string): Promise<NodeTransformProbe> {
  return page.evaluate((id) => {
    const app = window.__AURA3D_LIVE_APPS__?.all()[0];
    const node = app?.nodes.get(id) as
      | { visible?: boolean; scale?: { x: number; y: number; z: number } | [number, number, number]; position?: { x: number; y: number; z: number } | [number, number, number]; rotation?: { x: number; y: number; z: number } | [number, number, number] }
      | undefined;
    if (!node) return { exists: false, visible: null, scale: null, position: null, rotationEuler: null };
    const triple = (v: unknown): [number, number, number] | null => {
      if (v == null) return null;
      if (Array.isArray(v)) return [v[0], v[1], v[2]];
      const o = v as { x: number; y: number; z: number };
      return [o.x, o.y, o.z];
    };
    return {
      exists: true,
      visible: typeof node.visible === "boolean" ? node.visible : null,
      scale: triple(node.scale),
      position: triple(node.position),
      rotationEuler: triple(node.rotation)
    };
  }, nodeId);
}

/** World-matrix Y of `bone` after one pump step (or immediately, when no hook). */
export function socketWorldY(page: Page, nodeId: string, bone: string, hookName?: string): Promise<number | null> {
  return page.evaluate(([id, b, hook]) => {
    if (hook) {
      const pump = (window as unknown as Record<string, unknown>)[hook] as ((f: number) => number) | undefined;
      pump?.(1);
    }
    const app = window.__AURA3D_LIVE_APPS__?.all()[0];
    const handle = app?.nodes.get(id) as { animation?: { socket?: (x: string) => { worldMatrix(o?: Float32Array): Float32Array } } } | undefined;
    const m = handle?.animation?.socket?.(b)?.worldMatrix();
    return m ? m[13] : null;
  }, [nodeId, bone, hookName ?? ""] as const);
}

export const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
export const range = (xs: readonly number[]) => (xs.length ? Math.max(...xs) - Math.min(...xs) : 0);

// ─── Game dev server ────────────────────────────────────────────────────────
// The six §17.4 routes serve their own vite dev server from the app directory
// (their `index.html` references `/src/main.ts` — a repo-root-relative path
// that only resolves with the app dir as the web root). The lane
// `startExampleDevServer` can't serve those routes; each spec spawns the
// app's `pnpm dev` on a dedicated port instead. Vite's root config aliases
// `@aura3d/*` to local src, so `?a3d-qr=animation` exercises the same
// source tree the unit battery sees.

export interface GameDevServer {
  readonly origin: string;
  close(): Promise<void>;
}

function probePort(port: number): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const req = httpRequest({ host: "127.0.0.1", port, path: "/", method: "GET", timeout: 1500 }, (res) => {
      res.resume();
      resolvePromise(res.statusCode !== undefined && res.statusCode < 500);
    });
    req.on("error", () => resolvePromise(false));
    req.on("timeout", () => {
      req.destroy();
      resolvePromise(false);
    });
    req.end();
  });
}

/**
 * Spawns `pnpm dev --host 127.0.0.1 --port <port> --strictPort` inside
 * `apps/<appDir>` and waits until the port serves. `process.env.AURA3D_GAMES_DEV`
 * may hold a comma list of already-running origins ("appDir=http://..." — the
 * full URL is used verbatim, no spawn) for keeping boot cost out of reruns.
 */
export async function startGameDevServer(appDir: string, port: number, bootTimeout = 90_000): Promise<GameDevServer> {
  const prestarted = (process.env.AURA3D_GAMES_DEV ?? "")
    .split(",")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${appDir}=`));
  if (prestarted) {
    return { origin: prestarted.slice(appDir.length + 1), close: () => Promise.resolve() };
  }

  const cwd = resolve(process.cwd(), "apps", appDir);
  const proc: ChildProcess = spawn("pnpm", ["dev", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd,
    env: { ...process.env, FORCE_COLOR: "0" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const logs: string[] = [];
  proc.stdout?.on("data", (d) => logs.push(String(d)));
  proc.stderr?.on("data", (d) => logs.push(String(d)));

  const deadline = Date.now() + bootTimeout;
  let alive = true;
  proc.on("exit", () => {
    alive = false;
  });
  while (Date.now() < deadline) {
    if (!alive) {
      throw new Error(`vite dev server for ${appDir} exited early:\n${logs.join("").slice(-3000)}`);
    }
    if (await probePort(port)) {
      const origin = `http://127.0.0.1:${port}`;
      return {
        origin,
        close: () =>
          new Promise((done) => {
            proc.on("exit", () => done());
            proc.kill("SIGTERM");
            setTimeout(() => {
              proc.kill("SIGKILL");
              done();
            }, 5000);
          })
      };
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  proc.kill("SIGKILL");
  throw new Error(`vite dev server for ${appDir} did not serve on :${port} within ${bootTimeout}ms:\n${logs.join("").slice(-3000)}`);
}
