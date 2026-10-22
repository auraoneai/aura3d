#!/usr/bin/env tsx
/**
 * tools/crayon-probe — Crayon Arcade runtime probe (threejs-parity §9, lane L10).
 *
 * Records P-1..P-4 for a Crayon game inside a live page, over ONE CDP session
 * per game:
 *
 *   P-1  node materials — counts of *NodeMaterial instances and of live
 *        materials carrying fragmentNode/colorNode/positionNode, plus
 *        three/webgpu reachability.
 *   P-2  isBatchedMesh — live BatchedMesh instances (traversal + heap).
 *   P-3  pipeline — EffectComposer instances (+ pass roster) vs the r186
 *        node pipeline (three/webgpu PostProcessing / *Node pass classes).
 *   P-4  shader materials — isShaderMaterial / isRawShaderMaterial counts.
 *
 * Evidence strategy, in order (each probe reports which strategies fired):
 *   1. importmap probe   — `import("three")` + `import("three/addons/…")`
 *      inside the game frame resolves the game's own module record, then
 *      `Runtime.queryObjects` on Scene/EffectComposer/ShaderMaterial
 *      prototypes finds live objects. Works when the game loads three via
 *      an importmap (importmap-readable games).
 *   2. heap snapshot     — `HeapProfiler.takeHeapSnapshot` chunked and
 *      scanned for constructor names (BatchedMesh, *NodeMaterial,
 *      ShaderMaterial, EffectComposer, PostProcessing, WebGPU/WebGLRenderer).
 *      Works even when three is bundle-inlined; reports `inconclusive`
 *      instead of `no` when the bundle is mangled.
 *   3. DOM/global scan   — `window.__THREE__`, canvas[data-engine],
 *      importmap JSON, renderer resource URLs.
 *
 * ── REMOTE RUN ONLY ────────────────────────────────────────────────────────
 * This tool drives a real browser against live Crayon endpoints — per the
 * repo's remote-first rule it must run on the remote runner, never locally.
 * Provision once:
 *     tools/remote-runner/provision.sh
 * then run through the runner's SSM port-forward (see tools/remote-capture.sh
 * for the forward shape):
 *     pnpm exec tsx --tsconfig tsconfig.base.json tools/crayon-probe/index.ts \
 *       --game strange-orbit --url https://app.usecrayon.ai/play/<project-id> \
 *       --wait-ms 25000
 * or probe the whole roster from a manifest:
 *     pnpm exec tsx --tsconfig tsconfig.base.json tools/crayon-probe/index.ts \
 *       --manifest tools/crayon-probe/games.json
 * Output lands at evidence/crayon-probes/<game>.json.
 * ───────────────────────────────────────────────────────────────────────────
 *
 * CLI:
 *   --game <id>          probe one game (requires --url or manifest entry)
 *   --url <url>          play-page URL for --game
 *   --manifest <path>    JSON manifest { games: [{ id, url? }] }; probes all
 *                        entries that have a url
 *   --wait-ms <ms>       settle time after load (default 20000)
 *   --frame-index <n>    force frame index instead of auto-detect
 *   --out <dir>          output dir (default evidence/crayon-probes)
 *   --stdout             also print the report JSON
 *   --channel <name>     playwright channel (e.g. "chromium" = full Google
 *                        Chrome for Testing binary; escapes the local
 *                        agent-process-reaper's chrome-headless-shell pattern
 *                        and uses hardware GPU instead of SwiftShader)
 *   --headed             launch headed (default headless)
 *   --launch-arg <arg>   extra chromium launch arg (repeatable)
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const requireFromRepo = createRequire(path.join(repoRoot, "package.json"));
const { chromium } = requireFromRepo("playwright") as {
  chromium: {
    launch: (opts: Record<string, unknown>) => Promise<Browser>;
    connectOverCDP: (endpoint: string) => Promise<Browser>;
  };
};

// Minimal playwright types (tool runs un-built; keep local shapes).
type Browser = { newContext: (o: Record<string, unknown>) => Promise<BrowserContext>; close: () => Promise<void>; contexts: () => BrowserContext[] };
type BrowserContext = { newPage: () => Promise<Page>; newCDPSession: (o: Page | Frame) => Promise<CdpSession>; pages: () => Page[]; close: () => Promise<void> };
type Page = { goto: (u: string, o: Record<string, unknown>) => Promise<unknown>; waitForTimeout: (ms: number) => Promise<void>; frames: () => Frame[]; evaluate: (fn: unknown, arg?: unknown) => Promise<unknown>; url: () => string; on: (ev: string, cb: (e: unknown) => void) => void; context: () => BrowserContext };
type Frame = { evaluate: (fn: unknown, arg?: unknown) => Promise<unknown>; name: () => string; url: () => string };
type CdpSession = { send: (method: string, params?: Record<string, unknown>) => Promise<Record<string, unknown>>; on: (ev: string, cb: (p: Record<string, unknown>) => void) => void; detach: () => Promise<void> };

// ── CLI args ────────────────────────────────────────────────────────────────

interface Args {
  readonly game?: string;
  readonly url?: string;
  readonly manifest?: string;
  readonly waitMs: number;
  readonly frameIndex?: number;
  readonly outDir: string;
  readonly stdout: boolean;
  readonly cdpEndpoint?: string;
  readonly channel?: string;
  readonly headed?: boolean;
  readonly launchArgs: readonly string[];
}

function parseArgs(argv: readonly string[]): Args {
  const out: Record<string, string | boolean | number | undefined | string[]> = { waitMs: 20000, outDir: path.join(repoRoot, "evidence", "crayon-probes"), launchArgs: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case "--game": out.game = next(); break;
      case "--url": out.url = next(); break;
      case "--manifest": out.manifest = next(); break;
      case "--wait-ms": out.waitMs = Number(next()); break;
      case "--frame-index": out.frameIndex = Number(next()); break;
      case "--out": out.outDir = path.resolve(String(next())); break;
      case "--stdout": out.stdout = true; break;
      case "--connect": out.cdpEndpoint = next(); break;
      case "--channel": out.channel = next(); break;
      case "--headed": out.headed = true; break;
      case "--launch-arg": out.launchArgs = [...(out.launchArgs as string[] | undefined ?? []), next()]; break;
      default:
        if (a?.startsWith("--")) throw new Error(`unknown arg ${a}`);
    }
  }
  return out as unknown as Args;
}

// ── in-frame probe script ───────────────────────────────────────────────────
// Runs inside the game frame's isolated world. Stashes imported module
// namespaces + prototype handles on window.__a3dProbe so Runtime.queryObjects
// can find live instances afterwards.

const PROBE_BOOT = `(async () => {
  const probe = { protos: {}, revision: null, importmap: null, threeModule: null, addons: {}, webgpuModule: null, errors: [] };
  try {
    const im = document.querySelector('script[type="importmap"]');
    if (im) probe.importmap = im.textContent;
  } catch (e) { probe.errors.push("importmap:" + String(e).slice(0, 80)); }
  try {
    const three = await import("three");
    probe.threeModule = true;
    probe.revision = three.REVISION ?? null;
    probe.protos.Scene = three.Scene && three.Scene.prototype;
    probe.protos.Object3D = three.Object3D && three.Object3D.prototype;
    probe.protos.Mesh = three.Mesh && three.Mesh.prototype;
    probe.protos.ShaderMaterial = three.ShaderMaterial && three.ShaderMaterial.prototype;
    probe.protos.Material = three.Material && three.Material.prototype;
    probe.protos.WebGLRenderer = three.WebGLRenderer && three.WebGLRenderer.prototype;
    probe.protos.InstancedMesh = three.InstancedMesh && three.InstancedMesh.prototype;
  } catch (e) { probe.errors.push("three:" + String(e).slice(0, 120)); }
  try {
    const composer = await import("three/addons/postprocessing/EffectComposer.js");
    probe.addons.EffectComposer = composer.EffectComposer && composer.EffectComposer.prototype;
  } catch (e) { probe.errors.push("composer:" + String(e).slice(0, 80)); }
  try {
    const pass = await import("three/addons/postprocessing/Pass.js");
    probe.addons.Pass = pass.Pass && pass.Pass.prototype;
  } catch (e) { probe.errors.push("pass:" + String(e).slice(0, 60)); }
  try {
    const webgpu = await import("three/webgpu");
    probe.webgpuModule = true;
    if (webgpu.PostProcessing) probe.protos.PostProcessing = webgpu.PostProcessing.prototype;
    if (webgpu.WebGPURenderer) probe.protos.WebGPURenderer = webgpu.WebGPURenderer.prototype;
  } catch (e) { probe.errors.push("webgpu:" + String(e).slice(0, 80)); }
  window.__a3dProbe = probe;
  return {
    revision: probe.revision,
    hasThree: !!probe.threeModule,
    hasComposerProto: !!probe.addons.EffectComposer,
    hasPassProto: !!probe.addons.Pass,
    hasWebgpu: !!probe.webgpuModule,
    hasPostProcessingProto: !!probe.protos.PostProcessing,
    protoNames: Object.keys(probe.protos).concat(Object.keys(probe.addons)),
    importmap: probe.importmap ? probe.importmap.slice(0, 2000) : null,
    errors: probe.errors
  };
})()`;

// Traversal summary for a live scene object (called via callFunctionOn).
const SCENE_SUMMARIZE = `function () {
  const counts = {
    objects: 0, meshes: 0, instancedMeshes: 0, batchedMeshes: 0,
    shaderMaterials: 0, rawShaderMaterials: 0, nodeMaterials: 0,
    materialCtorCounts: {}, objectCtorCounts: {}
  };
  const seen = new Set();
  const visit = (o) => {
    if (!o || seen.has(o)) return;
    seen.add(o);
    counts.objects++;
    const ctor = (o.constructor && o.constructor.name) || "?";
    counts.objectCtorCounts[ctor] = (counts.objectCtorCounts[ctor] || 0) + 1;
    if (o.isMesh) counts.meshes++;
    if (o.isInstancedMesh) counts.instancedMeshes++;
    if (o.isBatchedMesh) counts.batchedMeshes++;
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      if (!m || seen.has(m)) continue;
      seen.add(m);
      const mctor = (m.constructor && m.constructor.name) || "?";
      counts.materialCtorCounts[mctor] = (counts.materialCtorCounts[mctor] || 0) + 1;
      if (m.isShaderMaterial) counts.shaderMaterials++;
      if (m.isRawShaderMaterial) counts.rawShaderMaterials++;
      if (/NodeMaterial$/.test(mctor) || m.fragmentNode !== undefined || m.colorNode !== undefined || m.positionNode !== undefined) counts.nodeMaterials++;
    }
    const kids = o.children;
    if (kids) for (const k of kids) visit(k);
  };
  visit(this);
  return counts;
}`;

// Summarize a live EffectComposer / PostProcessing object.
const PIPELINE_SUMMARIZE = `function () {
  const passes = [];
  const stack = [this];
  const seen = new Set();
  while (stack.length) {
    const o = stack.pop();
    if (!o || typeof o !== "object" || seen.has(o)) continue;
    seen.add(o);
    if (o.isPass || (o.constructor && /Pass$/.test(o.constructor.name))) {
      passes.push({ type: o.constructor.name, shaderId: o.shaderID ?? (o.material && o.material.name) ?? null });
    }
    if (Array.isArray(o.passes)) stack.push(...o.passes);
    if (o.renderPass) stack.push(o.renderPass);
    if (o.nodes) stack.push(...(Array.isArray(o.nodes) ? o.nodes : []));
  }
  return { ctor: this.constructor && this.constructor.name, isEffectComposer: !!this.isEffectComposer, passCount: passes.length, passes: passes.slice(0, 24) };
}`;

// ── heap snapshot scan ──────────────────────────────────────────────────────

const HEAP_CLASS_PATTERNS: Readonly<Record<string, RegExp>> = {
  BatchedMesh: /"BatchedMesh"/,
  NodeMaterial: /"[A-Za-z]*NodeMaterial"/,
  ShaderMaterial: /"ShaderMaterial"/,
  RawShaderMaterial: /"RawShaderMaterial"/,
  EffectComposer: /"EffectComposer"/,
  PostProcessing: /"PostProcessing"/,
  WebGLRenderer: /"WebGLRenderer"/,
  WebGPURenderer: /"WebGPURenderer"/,
  InstancedMesh: /"InstancedMesh"/,
  PMREMGenerator: /"PMREMGenerator"/,
  CSM: /"CSM"/
};

async function heapClassCounts(cdp: CdpSession): Promise<{ readonly counts: Record<string, number>; readonly bytes: number; readonly error?: string }> {
  const chunks: string[] = [];
  const onChunk = (p: Record<string, unknown>) => {
    if (typeof p.chunk === "string") chunks.push(p.chunk);
  };
  cdp.on("HeapProfiler.addHeapSnapshotChunk", onChunk);
  try {
    await cdp.send("HeapProfiler.enable");
    await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false, exposeInternals: false, exposeNumericValues: false });
  } catch (e) {
    return { counts: {}, bytes: 0, error: String(e).slice(0, 200) };
  } finally {
    try { await cdp.send("HeapProfiler.disable"); } catch { /* ignore */ }
  }
  const counts: Record<string, number> = {};
  for (const [name, re] of Object.entries(HEAP_CLASS_PATTERNS)) {
    let n = 0;
    for (const chunk of chunks) {
      for (const m of chunk.matchAll(new RegExp(re.source, "g"))) n++;
    }
    counts[name] = n;
  }
  return { counts, bytes: chunks.join("").length };
}

// ── probe one game ──────────────────────────────────────────────────────────

interface ProbeReport {
  readonly schema: "a3d-crayon-probe/1";
  readonly game: string;
  readonly url: string;
  readonly probedAt: string;
  readonly frame: { readonly index: number; readonly url: string; readonly pickReason: string };
  readonly dom: Record<string, unknown>;
  readonly module: Record<string, unknown>;
  readonly heap: Record<string, number>;
  readonly liveObjects: Record<string, unknown>;
  readonly probes: {
    readonly p1_nodeMaterials: ProbeAnswer;
    readonly p2_batchedMesh: ProbeAnswer;
    readonly p3_pipeline: ProbeAnswer;
    readonly p4_shaderMaterials: ProbeAnswer;
  };
  readonly errors: readonly string[];
}

interface ProbeAnswer {
  readonly answer: "yes" | "no" | "inconclusive";
  readonly value: unknown;
  readonly detail: string;
}

async function pickGameFrame(page: Page, forcedIndex: number | undefined): Promise<{ readonly frame: Frame; readonly index: number; readonly reason: string }> {
  const frames = page.frames();
  if (forcedIndex !== undefined && frames[forcedIndex]) {
    return { frame: frames[forcedIndex], index: forcedIndex, reason: `--frame-index ${forcedIndex}` };
  }
  let best: { frame: Frame; index: number; score: number; why: string } | undefined;
  for (let i = 0; i < frames.length; i++) {
    try {
      const info = (await frames[i].evaluate(`(() => {
        const im = document.querySelector('script[type="importmap"]');
        return {
          canvases: document.querySelectorAll("canvas").length,
          glCanvas: !!document.querySelector("canvas[data-engine], canvas"),
          hasImportmap: !!im,
          threeImport: im ? /"three"/.test(im.textContent || "") : false,
          scripts: document.scripts.length,
          threeGlobal: typeof window.__THREE__
        };
      })()`)) as Record<string, unknown>;
      const score =
        (info.canvases ? 4 : 0) +
        (info.hasImportmap ? 2 : 0) +
        (info.threeImport ? 4 : 0) +
        (info.threeGlobal ? 1 : 0) +
        Math.min(2, Number(info.scripts) > 0 ? 1 : 0);
      if (!best || score > best.score) best = { frame: frames[i], index: i, score, why: `canvas=${info.canvases} importmap=${info.hasImportmap} threeImport=${info.threeImport} __THREE__=${info.threeGlobal}` };
    } catch {
      /* cross-origin frame — skip */
    }
  }
  if (!best) throw new Error("no reachable frame found (all frames cross-origin or empty)");
  return { frame: best.frame, index: best.index, reason: `best score ${best.score} — ${best.why}` };
}

interface ExecCtxInfo {
  readonly id: number;
  readonly frameId?: string;
  readonly isDefault: boolean;
}

async function probeGame(page: Page, cdp: CdpSession, context: BrowserContext, game: string, url: string, waitMs: number, forcedFrameIndex: number | undefined, errors: string[]): Promise<ProbeReport> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(waitMs);

  const pick = await pickGameFrame(page, forcedFrameIndex);
  const frame = pick.frame;

  // Frame-scoped CDP session: Crayon runs games in a sandboxed srcdoc iframe
  // (`sandbox="allow-scripts …"` without allow-same-origin → opaque origin →
  // OOPIF with its own process and CDP target). The page-level session cannot
  // see the game frame's execution contexts or heap, so live-object queries
  // and the heap snapshot must go through a session attached to the frame
  // target itself. Falls back to the page session when the frame attach fails.
  let gameCdp: CdpSession | undefined;
  try {
    gameCdp = await context.newCDPSession(frame);
  } catch (e) {
    errors.push(`framecdp:${String(e).slice(0, 140)}`);
  }
  const session = gameCdp ?? cdp;
  const contexts: ExecCtxInfo[] = [];
  if (gameCdp) {
    gameCdp.on("Runtime.executionContextCreated", (p) => {
      const c = (p as { context?: { id?: number; auxData?: { frameId?: string; isDefault?: boolean } } }).context;
      if (c?.id !== undefined) contexts.push({ id: c.id, frameId: c.auxData?.frameId, isDefault: c.auxData?.isDefault === true });
    });
    await gameCdp.send("Runtime.enable").catch((e: unknown) => errors.push(`rt:${String(e).slice(0, 120)}`));
  }

  // DOM/global scan (strategy 3)
  const dom = (await frame.evaluate(`(() => {
    const im = document.querySelector('script[type="importmap"]');
    const res = performance.getEntriesByType("resource").map((e) => e.name).filter((n) => /three|module|game/i.test(n)).slice(0, 40);
    return {
      title: document.title,
      canvases: [...document.querySelectorAll("canvas")].map((c) => ({
        w: c.width, h: c.height, engine: c.getAttribute("data-engine"),
        webgl2: !!c.getContext("webgl2"), webgpu: !!(navigator.gpu && c.getContext("webgpu"))
      })),
      hasImportmap: !!im,
      importmap: im ? (im.textContent || "").slice(0, 2000) : null,
      threeGlobal: typeof window.__THREE__ !== "undefined" ? window.__THREE__ : null,
      threeResources: res,
      scripts: document.scripts.length
    };
  })()`).catch((e: unknown) => ({ error: String(e).slice(0, 160) }))) as Record<string, unknown>;

  // Strategy 1: boot the module probe inside the frame's own context via
  // playwright's frame.evaluate (runs the game frame's main world — the
  // importmap import resolves the same module record the game uses).
  const boot = (await frame.evaluate(PROBE_BOOT).catch((e: unknown) => ({ error: String(e).slice(0, 160) }))) as Record<string, unknown>;

  // For queryObjects we need the game frame's MAIN-world execution context id.
  // Isolated worlds (Page.createIsolatedWorld) do NOT see main-world window
  // globals — __a3dProbe lives on the main world — so instead mark the DOM
  // (document.documentElement attributes are shared by every world bound to
  // that frame) and match it against the contexts Runtime.enable replayed.
  const markToken = `${game}-${Date.now()}`;
  await frame.evaluate(`document.documentElement.setAttribute("data-a3d-probe-mark", ${JSON.stringify(markToken)});`).catch(() => undefined);

  let contextId: number | undefined;
  const candidates = [...contexts.filter((c) => c.isDefault), ...contexts.filter((c) => !c.isDefault)];
  for (const ctx of candidates) {
    try {
      const marked = (await session.send("Runtime.evaluate", {
        expression: `document.documentElement.getAttribute("data-a3d-probe-mark")`,
        contextId: ctx.id,
        returnByValue: true
      })) as { result?: { value?: unknown } };
      if (marked.result?.value === markToken) {
        // Prefer the main-world context (the one where PROBE_BOOT stashed
        // __a3dProbe); keep scanning if this is a utility world.
        const hasProbe = (await session.send("Runtime.evaluate", {
          expression: `"object" === typeof window.__a3dProbe`,
          contextId: ctx.id,
          returnByValue: true
        })) as { result?: { value?: unknown } };
        contextId = ctx.id;
        if (hasProbe.result?.value === true) break;
      }
    } catch {
      /* context may be destroyed or cross-origin — keep scanning */
    }
  }
  await frame.evaluate(`document.documentElement.removeAttribute("data-a3d-probe-mark");`).catch(() => undefined);

  const liveObjects: Record<string, unknown> = { contextFound: contextId !== undefined, frameSession: gameCdp !== undefined };
  const liveCounts = { nodeMaterials: 0, batchedMeshes: 0, shaderMaterials: 0, rawShaderMaterials: 0, composerInstances: 0, postProcessingInstances: 0, passes: [] as unknown[] };

  if (contextId !== undefined && boot.hasThree === true) {
    const evalObj = async (expression: string): Promise<string | undefined> => {
      const r = (await session.send("Runtime.evaluate", { expression, contextId, returnByValue: false, awaitPromise: true })) as { result?: { objectId?: string } };
      return r.result?.objectId;
    };
    const queryObjects = async (protoExpr: string): Promise<unknown[] | undefined> => {
      const protoId = await evalObj(protoExpr);
      if (!protoId) return undefined;
      const res = (await session.send("Runtime.queryObjects", { prototypeObjectId: protoId, executionContextId: contextId })) as { objects?: { objectId?: string } };
      const arrId = res.objects?.objectId;
      if (!arrId) return undefined;
      const summary = (await session.send("Runtime.callFunctionOn", {
        objectId: arrId,
        functionDeclaration: `function () { return this.length; }`,
        returnByValue: true
      })) as { result?: { value?: number } };
      await session.send("Runtime.releaseObject", { objectId: arrId }).catch(() => undefined);
      return [summary.result?.value ?? 0];
    };
    // Scenes — traverse each live Scene for the full material/object census.
    const sceneCount = await queryObjects("window.__a3dProbe && window.__a3dProbe.protos.Scene");
    const sceneTotal = sceneCount?.[0] as number | undefined;
    liveObjects.scenes = sceneTotal ?? 0;
    if (sceneTotal && sceneTotal > 0) {
      const protoId = await evalObj("window.__a3dProbe.protos.Scene");
      const res = (await session.send("Runtime.queryObjects", { prototypeObjectId: protoId!, executionContextId: contextId })) as { objects?: { objectId?: string } };
      const arrId = res.objects?.objectId;
      if (arrId) {
        const agg = (await session.send("Runtime.callFunctionOn", {
          objectId: arrId,
          functionDeclaration: `function () {
            const out = { objects: 0, meshes: 0, instancedMeshes: 0, batchedMeshes: 0, shaderMaterials: 0, rawShaderMaterials: 0, nodeMaterials: 0, materialCtorCounts: {}, objectCtorCounts: {} };
            const merge = (dst, src) => { for (const k of Object.keys(src)) if (typeof src[k] === "number") dst[k] += src[k]; else for (const k2 of Object.keys(src[k])) dst[k][k2] = (dst[k][k2] || 0) + src[k][k2]; };
            for (const s of this) {
              const c = ${SCENE_SUMMARIZE.replace(/\n/g, " ")}.call(s);
              merge(out, c);
            }
            return out;
          }`,
          returnByValue: true
        })) as { result?: { value?: { batchedMeshes?: number; shaderMaterials?: number; rawShaderMaterials?: number; nodeMaterials?: number; objects?: number; meshes?: number; instancedMeshes?: number; materialCtorCounts?: Record<string, number>; objectCtorCounts?: Record<string, number> } } };
        if (agg.result?.value) {
          const v = agg.result.value;
          liveObjects.sceneTraversal = v;
          liveCounts.batchedMeshes += v.batchedMeshes ?? 0;
          liveCounts.shaderMaterials += v.shaderMaterials ?? 0;
          liveCounts.rawShaderMaterials += v.rawShaderMaterials ?? 0;
          liveCounts.nodeMaterials += v.nodeMaterials ?? 0;
        }
        await session.send("Runtime.releaseObject", { objectId: arrId }).catch(() => undefined);
      }
    }
    // Composer instances — live EffectComposer objects and their pass rosters.
    const composerCount = await queryObjects("window.__a3dProbe && window.__a3dProbe.addons.EffectComposer");
    liveObjects.effectComposers = composerCount?.[0] ?? 0;
    liveCounts.composerInstances = (composerCount?.[0] as number | undefined) ?? 0;
    if (liveCounts.composerInstances > 0) {
      const protoId = await evalObj("window.__a3dProbe.addons.EffectComposer");
      const res = (await session.send("Runtime.queryObjects", { prototypeObjectId: protoId!, executionContextId: contextId })) as { objects?: { objectId?: string } };
      const arrId = res.objects?.objectId;
      if (arrId) {
        const passRoster = (await session.send("Runtime.callFunctionOn", {
          objectId: arrId,
          functionDeclaration: `function () { return this.map(function (c) { return (${PIPELINE_SUMMARIZE.replace(/\n/g, " ")}).call(c); }); }`,
          returnByValue: true
        })) as { result?: { value?: { passes?: unknown[] }[] } };
        liveObjects.composerPasses = passRoster.result?.value ?? [];
        liveCounts.passes = (passRoster.result?.value ?? []).flatMap((c) => c.passes ?? []);
        await session.send("Runtime.releaseObject", { objectId: arrId }).catch(() => undefined);
      }
    }
    // r186 node pipeline — PostProcessing instances (three/webgpu builds).
    if (boot.hasPostProcessingProto === true) {
      const ppCount = await queryObjects("window.__a3dProbe && window.__a3dProbe.protos.PostProcessing");
      liveObjects.postProcessingInstances = ppCount?.[0] ?? 0;
      liveCounts.postProcessingInstances = (ppCount?.[0] as number | undefined) ?? 0;
    }
    // ShaderMaterial census via prototype scan (catches materials not yet in a scene).
    const smCount = await queryObjects("window.__a3dProbe && window.__a3dProbe.protos.ShaderMaterial");
    liveObjects.shaderMaterialHeapObjects = smCount?.[0] ?? 0;
    if ((smCount?.[0] as number | undefined ?? 0) > liveCounts.shaderMaterials) {
      liveCounts.shaderMaterials = smCount?.[0] as number;
    }
  }

  // Strategy 2: heap snapshot — constructor-name census.
  const heap = await heapClassCounts(session);
  if (heap.error) errors.push(`heap:${heap.error}`);

  // ── verdicts ──────────────────────────────────────────────────────────
  const heapMat = heap.counts;
  const nodeMatCtorHits = Object.entries((liveObjects.sceneTraversal as { materialCtorCounts?: Record<string, number> } | undefined)?.materialCtorCounts ?? {})
    .filter(([k]) => /NodeMaterial$/.test(k))
    .reduce((acc, [, v]) => acc + v, 0);
  const p1Value = {
    liveTraversal: liveCounts.nodeMaterials + nodeMatCtorHits,
    heapClasses: heapMat.NodeMaterial ?? 0,
    webgpuModuleReachable: boot.hasWebgpu === true
  };
  const p1: ProbeAnswer = p1Value.liveTraversal + p1Value.heapClasses > 0
    ? { answer: "yes", value: p1Value, detail: "node materials observed (live traversal and/or heap NodeMaterial classes)" }
    : boot.hasThree !== true && (heap.bytes ?? 0) === 0
      ? { answer: "inconclusive", value: p1Value, detail: "three module not reachable via import() and heap snapshot failed — bundle likely inlined/mangled" }
      : { answer: "no", value: p1Value, detail: "no NodeMaterial instances or classes observed" };

  const p2Value = { liveTraversal: liveCounts.batchedMeshes, heapClasses: heapMat.BatchedMesh ?? 0 };
  const p2: ProbeAnswer = p2Value.liveTraversal + p2Value.heapClasses > 0
    ? { answer: "yes", value: p2Value, detail: "BatchedMesh observed" }
    : { answer: "no", value: p2Value, detail: "no BatchedMesh observed (live traversal + heap)" };

  const p3Value = {
    effectComposers: liveCounts.composerInstances,
    postProcessingInstances: liveCounts.postProcessingInstances,
    heapEffectComposer: heapMat.EffectComposer ?? 0,
    heapPostProcessing: heapMat.PostProcessing ?? 0,
    passRoster: liveCounts.passes
  };
  const p3: ProbeAnswer = p3Value.effectComposers + p3Value.heapEffectComposer > 0
    ? { answer: "yes", value: p3Value, detail: `EffectComposer pipeline (${p3Value.effectComposers} live, ${p3Value.heapEffectComposer} heap)` }
    : p3Value.postProcessingInstances + p3Value.heapPostProcessing > 0
      ? { answer: "yes", value: p3Value, detail: "r186 node pipeline (PostProcessing) observed" }
      : { answer: "no", value: p3Value, detail: "no composer/post-processing pipeline observed" };

  const p4Value = {
    liveTraversal: { shader: liveCounts.shaderMaterials, rawShader: liveCounts.rawShaderMaterials },
    heapClasses: { shader: heapMat.ShaderMaterial ?? 0, rawShader: heapMat.RawShaderMaterial ?? 0 }
  };
  const p4: ProbeAnswer = p4Value.liveTraversal.shader + p4Value.heapClasses.shader + p4Value.heapClasses.rawShader > 0
    ? { answer: "yes", value: p4Value, detail: `${liveCounts.shaderMaterials} live isShaderMaterial, ${liveCounts.rawShaderMaterials} isRawShaderMaterial (+heap classes)` }
    : { answer: "no", value: p4Value, detail: "no ShaderMaterial/RawShaderMaterial observed" };

  return {
    schema: "a3d-crayon-probe/1",
    game,
    url,
    probedAt: new Date().toISOString(),
    frame: { index: pick.index, url: frame.url(), pickReason: pick.reason },
    dom,
    module: boot,
    heap: heap.counts,
    liveObjects,
    probes: {
      p1_nodeMaterials: p1,
      p2_batchedMesh: p2,
      p3_pipeline: p3,
      p4_shaderMaterials: p4
    },
    errors
  };
}

// ── main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const games: { id: string; url: string }[] = [];
  if (args.manifest) {
    const manifest = JSON.parse(fs.readFileSync(args.manifest, "utf8")) as { games: { id: string; url?: string }[] };
    for (const g of manifest.games) if (g.url) games.push({ id: g.id, url: g.url });
  }
  if (args.game && args.url) games.push({ id: args.game, url: args.url });
  if (games.length === 0) {
    console.error("nothing to probe — pass --game + --url, or a --manifest with urls.\nSee the header for the remote-run instructions.");
    process.exit(2);
  }

  fs.mkdirSync(args.outDir, { recursive: true });
  const browser = args.cdpEndpoint
    ? await chromium.connectOverCDP(args.cdpEndpoint)
    : await chromium.launch({
        timeout: 60000,
        // The local AuraOne reaper (ai.auraone.agent-process-reaper) SIGSTOPs
        // chrome-headless-shell trees under load; --channel chromium launches
        // the full "Google Chrome for Testing" binary (not matched by the
        // reaper pattern) and uses the real GPU via ANGLE/Metal instead of
        // SwiftShader. Omit --channel on the remote runner.
        ...(args.channel ? { channel: args.channel } : {}),
        ...(args.headed ? { headless: false } : {}),
        ...(args.launchArgs.length ? { args: [...args.launchArgs] } : {})
      });

  for (const game of games) {
    const errors: string[] = [];
    let report: ProbeReport | undefined;
    // ONE CDP session per game.
    const context = args.cdpEndpoint ? browser.contexts()[0] : await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = args.cdpEndpoint ? context.pages()[0] : await context.newPage();
    if (!page) {
      errors.push("no page in connected context");
    } else {
      page.on("pageerror", (e) => errors.push(`pageerror:${String(e).slice(0, 160)}`));
      const cdp = await context.newCDPSession(page);
      try {
        report = await probeGame(page, cdp, context, game.id, game.url, args.waitMs, args.frameIndex, errors);
      } catch (e) {
        errors.push(`probe:${String(e).slice(0, 200)}`);
      } finally {
        await cdp.detach().catch(() => undefined);
      }
    }
    const final: ProbeReport = report ?? {
      schema: "a3d-crayon-probe/1",
      game: game.id,
      url: game.url,
      probedAt: new Date().toISOString(),
      frame: { index: -1, url: "", pickReason: "probe failed before frame pick" },
      dom: {},
      module: {},
      heap: {},
      liveObjects: {},
      probes: {
        p1_nodeMaterials: { answer: "inconclusive", value: null, detail: "probe failed — see errors" },
        p2_batchedMesh: { answer: "inconclusive", value: null, detail: "probe failed — see errors" },
        p3_pipeline: { answer: "inconclusive", value: null, detail: "probe failed — see errors" },
        p4_shaderMaterials: { answer: "inconclusive", value: null, detail: "probe failed — see errors" }
      },
      errors
    };
    const outPath = path.join(args.outDir, `${game.id}.json`);
    fs.writeFileSync(outPath, `${JSON.stringify(final, null, 2)}\n`);
    console.log(`[crayon-probe] ${game.id}: p1=${final.probes.p1_nodeMaterials.answer} p2=${final.probes.p2_batchedMesh.answer} p3=${final.probes.p3_pipeline.answer} p4=${final.probes.p4_shaderMaterials.answer} → ${path.relative(repoRoot, outPath)}`);
    if (args.stdout) console.log(JSON.stringify(final, null, 2));
    if (!args.cdpEndpoint) await context.close().catch(() => undefined);
  }
  await browser.close().catch(() => undefined);
}

await main();
