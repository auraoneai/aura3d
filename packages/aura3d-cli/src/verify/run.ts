// `aura3d verify`: author -> validate -> render -> inspect -> correct, as one pass that ends in ONE machine-readable report.
// Steps run in a fixed order (typecheck, assets, lint, build, serve, render, inspect). Every problem becomes a finding with a stable code,
// a severity, a location (file:line for source findings), a plain-English cause and a fix hint from the explainer table in codes.ts.
// The browser is a pluggable driver (default: local Chrome over CDP, see cdp.ts); nothing here imports Playwright or the engine.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmdirSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join, resolve } from "node:path";
import type { Server } from "node:http";
import { startStaticServer } from "../deploy-browser-check.js";
import { checkDeploy, validateAssets } from "../index.js";
import { BrowserUnavailableError, createChromeCdpDriver, type RenderCapture, type VerifyBrowserDriver } from "./cdp.js";
import { explainCode, type VerifySeverity, type VerifyStepId } from "./codes.js";
import { analyzeFrame, compareFrames, decodePng, type FrameAnalysis, type MotionAnalysis } from "./frame.js";
import { lintProject } from "./lint.js";

export const VERIFY_SCHEMA = "aura3d.verify/1";
export const VERIFY_STEP_ORDER = ["typecheck", "assets", "lint", "build", "serve", "render", "inspect"] as const;
export type VerifyStep = (typeof VERIFY_STEP_ORDER)[number];

export interface VerifyFinding {
  readonly code: string;
  readonly severity: VerifySeverity;
  readonly step: VerifyStepId;
  /** What was found, specific to this project. */
  readonly message: string;
  /** Plain-English cause, keyed by code (same text as `aura3d verify --explain <code>`). */
  readonly cause: string;
  /** Concrete fix hint, keyed by code. */
  readonly fix: string;
  /** `file:line:column` for source findings. */
  readonly location?: { readonly file: string; readonly line: number; readonly column: number };
  readonly evidence?: Readonly<Record<string, unknown>>;
}

export interface VerifyStepResult {
  readonly id: VerifyStep;
  readonly status: "pass" | "fail" | "skipped";
  readonly durationMs: number;
  readonly detail?: string;
}

export interface VerifyReport {
  readonly schema: typeof VERIFY_SCHEMA;
  /** True when no finding has severity "error" and no step crashed. */
  readonly ok: boolean;
  readonly project: string;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly steps: readonly VerifyStepResult[];
  readonly findings: readonly VerifyFinding[];
  readonly counts: { readonly error: number; readonly warning: number; readonly info: number };
  /** Present when the render step produced a frame. */
  readonly render?: {
    readonly driver: string;
    readonly viewport: { readonly width: number; readonly height: number };
    readonly backend?: string;
    readonly drawCalls?: number;
    readonly frame?: FrameAnalysis;
    readonly motion?: MotionAnalysis;
    readonly degradeCodes: readonly string[];
  };
}

export interface VerifyOptions {
  readonly projectDir: string;
  /** Steps to leave out. `inspect` needs `render`. */
  readonly skip?: readonly VerifyStep[];
  readonly distDir?: string;
  readonly buildTimeoutMs?: number;
  /** Replaces the default Chrome/CDP driver (tests inject a mock). */
  readonly driver?: VerifyBrowserDriver;
  readonly chromePath?: string;
  readonly softwareGl?: boolean;
  readonly route?: string;
  readonly width?: number;
  readonly height?: number;
  readonly settleMs?: number;
  readonly motionGapMs?: number;
  readonly timeoutMs?: number;
  readonly readyTimeoutMs?: number;
  /** Directory used as a mutex (mkdir) around the browser steps only, so several verify runs share one GPU/browser without holding it during builds. */
  readonly browserLock?: string;
  /** Test seam: skip real tsc and build processes. */
  readonly runCommand?: (command: string, args: readonly string[], cwd: string, timeoutMs: number) => { status: number | null; output: string };
  readonly now?: () => number;
}

function defaultRunCommand(command: string, args: readonly string[], cwd: string, timeoutMs: number): { status: number | null; output: string } {
  const result = spawnSync(command, [...args], { cwd, encoding: "utf8", timeout: timeoutMs, maxBuffer: 1 << 26, env: { ...process.env, FORCE_COLOR: "0", CI: "1" } });
  return { status: result.status, output: `${result.stdout ?? ""}${result.stderr ?? ""}${result.error ? `\n${result.error.message}` : ""}` };
}

function makeFinding(code: string, message: string, extra: { severity?: VerifySeverity; location?: VerifyFinding["location"]; evidence?: Record<string, unknown> } = {}): VerifyFinding {
  const entry = explainCode(code);
  if (!entry) throw new Error(`verify: code ${code} is missing from the explainer table`);
  return {
    code, severity: extra.severity ?? entry.severity, step: entry.step, message, cause: entry.cause, fix: entry.fix,
    ...(extra.location ? { location: extra.location } : {}), ...(extra.evidence ? { evidence: extra.evidence } : {})
  };
}

const tail = (text: string, lines = 15): string => text.split("\n").filter((line) => line.trim()).slice(-lines).join("\n");

/** Nearest local `tsc`: the project's node_modules (or an ancestor's), else the TypeScript bundled with this CLI. */
function resolveTsc(projectDir: string): string | undefined {
  let dir = projectDir;
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, "node_modules", "typescript", "bin", "tsc");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  try { return createRequire(import.meta.url).resolve("typescript/bin/tsc"); } catch { return undefined; }
}

const SCENE_DEGRADED = /\b[A-Z][A-Z0-9_]*_DEGRADED\b/g;
const hasDegradeCode = (text: string): boolean => /\b[A-Z][A-Z0-9_]*_DEGRADED\b/.test(text);

export async function runVerify(options: VerifyOptions): Promise<VerifyReport> {
  const now = options.now ?? Date.now;
  const started = now();
  const projectDir = resolve(options.projectDir);
  const skip = new Set(options.skip ?? []);
  const run = options.runCommand ?? defaultRunCommand;
  const distDir = resolve(projectDir, options.distDir ?? "dist");
  const findings: VerifyFinding[] = [];
  const steps: VerifyStepResult[] = [];
  let render: VerifyReport["render"];
  let capture: RenderCapture | undefined;
  let server: Server | undefined;
  let origin: string | undefined;
  const viewport = { width: options.width ?? 960, height: options.height ?? 540 };

  const step = async (id: VerifyStep, body: () => Promise<string | void> | string | void): Promise<void> => {
    if (skip.has(id)) { steps.push({ id, status: "skipped", durationMs: 0, detail: "skipped by option" }); return; }
    const before = findings.length;
    const t0 = now();
    let detail: string | undefined;
    try { detail = (await body()) || undefined; }
    catch (error) { findings.push(makeFinding("VERIFY_STEP_CRASHED", `${id}: ${String((error as Error).message ?? error).split("\n")[0]}`)); }
    const failed = findings.slice(before).some((f) => f.severity === "error");
    steps.push({ id, status: failed ? "fail" : "pass", durationMs: now() - t0, ...(detail ? { detail } : {}) });
  };

  // 1. typecheck ----------------------------------------------------------------------------------------------------
  await step("typecheck", () => {
    if (!existsSync(join(projectDir, "tsconfig.json"))) { findings.push(makeFinding("TYPECHECK_UNAVAILABLE", "No tsconfig.json in the project.")); return "no tsconfig.json"; }
    const tsc = resolveTsc(projectDir);
    if (!tsc) { findings.push(makeFinding("TYPECHECK_UNAVAILABLE", "No TypeScript compiler could be resolved.")); return "no tsc"; }
    const result = run(process.execPath, [tsc, "--noEmit", "-p", "tsconfig.json", "--pretty", "false"], projectDir, 600_000);
    const errors = result.output.split("\n").map((line) => /^(.+?)\((\d+),(\d+)\): error (TS\d+): (.*)$/.exec(line)).filter((m): m is RegExpExecArray => !!m);
    for (const m of errors.slice(0, 20)) {
      findings.push(makeFinding("TYPECHECK_ERROR", `${m[4]}: ${m[5]}`, { location: { file: m[1]!.replace(/^\.\//, ""), line: Number(m[2]), column: Number(m[3]) }, evidence: { tsCode: m[4] } }));
    }
    if (errors.length > 20) findings.push(makeFinding("TYPECHECK_ERROR", `${errors.length - 20} more TypeScript errors not listed.`, { severity: "info" }));
    if (result.status !== 0 && errors.length === 0) findings.push(makeFinding("TYPECHECK_ERROR", `tsc exited ${result.status}: ${tail(result.output, 4)}`));
    return `${errors.length} error(s)`;
  });

  // 2. assets -------------------------------------------------------------------------------------------------------
  await step("assets", () => {
    let detail = "no aura.assets.json";
    if (existsSync(join(projectDir, "aura.assets.json"))) {
      const result = validateAssets({ projectDir, source: true });
      for (const failure of result.failures.slice(0, 15)) findings.push(makeFinding("ASSET_VALIDATION_FAILED", failure));
      for (const warning of result.warnings.slice(0, 10)) findings.push(makeFinding("ASSET_VALIDATION_WARNING", warning));
      detail = `${result.failures.length} failure(s), ${result.warnings.length} warning(s)`;
    }
    for (const lint of lintProject(projectDir, { group: "assets" })) findings.push(makeFinding(lint.code, lint.message, { location: lint.location }));
    return detail;
  });

  // 3. lint ---------------------------------------------------------------------------------------------------------
  await step("lint", () => {
    const results = lintProject(projectDir, { group: "scene" });
    for (const lint of results) findings.push(makeFinding(lint.code, lint.message, { location: lint.location }));
    return `${results.length} finding(s)`;
  });

  // 4. build --------------------------------------------------------------------------------------------------------
  await step("build", () => {
    const pkgPath = join(projectDir, "package.json");
    const pkg = existsSync(pkgPath) ? (JSON.parse(readFileSync(pkgPath, "utf8")) as { scripts?: Record<string, string> }) : {};
    if (!pkg.scripts?.build) { findings.push(makeFinding("BUILD_SCRIPT_MISSING", "package.json has no scripts.build.")); return; }
    const result = run("npm", ["run", "build"], projectDir, options.buildTimeoutMs ?? 600_000);
    if (result.status !== 0) { findings.push(makeFinding("BUILD_FAILED", `npm run build exited ${result.status}.`, { evidence: { outputTail: tail(result.output) } })); return; }
    if (existsSync(join(projectDir, "aura.assets.json"))) {
      const deploy = checkDeploy({ projectDir, distDir: options.distDir ?? "dist" });
      for (const failure of deploy.failures.slice(0, 10)) findings.push(makeFinding("DEPLOY_CHECK_FAILED", failure));
    }
  });

  // 5. serve --------------------------------------------------------------------------------------------------------
  const wantsBrowser = !skip.has("render") || !skip.has("inspect");
  await step("serve", async () => {
    if (!wantsBrowser) return "no browser step requested";
    if (!existsSync(join(distDir, "index.html"))) { findings.push(makeFinding("SERVE_FAILED", `No index.html in ${basename(distDir)}/ (did the build step run?).`)); return; }
    try { ({ server, origin } = await startStaticServer(distDir)); return origin; }
    catch (error) { findings.push(makeFinding("SERVE_FAILED", String((error as Error).message ?? error))); }
  });

  // 6. render -------------------------------------------------------------------------------------------------------
  const lockDir = options.browserLock && wantsBrowser ? options.browserLock : undefined;
  if (lockDir) {
    for (;;) {
      try { mkdirSync(lockDir); break; } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; await new Promise((done) => setTimeout(done, 2_000)); }
    }
  }
  const driver = options.driver ?? createChromeCdpDriver({ ...(options.chromePath ? { chromePath: options.chromePath } : {}), ...(options.softwareGl ? { softwareGl: true } : {}) });
  try {
    await step("render", async () => {
      if (!origin) return "no server";
      try {
        capture = await driver.capture(`${origin}${options.route ?? "/"}`, { ...viewport, settleMs: options.settleMs ?? 2_000, motionGapMs: options.motionGapMs ?? 1_000, timeoutMs: options.timeoutMs ?? 30_000, readyTimeoutMs: options.readyTimeoutMs ?? 12_000 });
      } catch (error) {
        const message = String((error as Error).message ?? error).split("\n")[0]!;
        findings.push(makeFinding(error instanceof BrowserUnavailableError ? "BROWSER_UNAVAILABLE" : "RENDER_NAVIGATION_FAILED", message));
        return;
      }
      if (capture.status === null || capture.status >= 400) { findings.push(makeFinding("RENDER_NAVIGATION_FAILED", `The page answered ${capture.status ?? "no response"}.`)); return; }
      if (capture.appState.ready === undefined) findings.push(makeFinding("RENDER_NEVER_READY", `data-aura3d-ready never appeared within ${(options.readyTimeoutMs ?? 12_000) / 1000}s of page load (tab ${capture.appState.page?.visibility ?? "?"}, ${capture.appState.page?.canvases ?? "?"} canvas, size ${capture.appState.page?.canvasSize ?? "?"}).`));
      const diag = capture.appState.routeReady?.diagnostics;
      const consoleText = capture.consoleMessages.map((m) => m.text).join("\n");
      const allText = [consoleText, ...(diag?.errors ?? []), ...(diag?.warnings ?? [])].join("\n");
      const mountText = [...capture.consoleMessages.map((m) => m.text), ...(diag?.errors ?? [])].find((t) => t.includes("RENDERER_MOUNT_FAILED"));
      if (mountText || capture.appState.ready === "error") {
        findings.push(makeFinding("RENDERER_MOUNT_FAILED", (mountText ?? capture.appState.error ?? "The app reported a boot error (data-aura3d-ready=error).").slice(0, 500)));
      }
      const degrade = [...new Set(allText.match(SCENE_DEGRADED) ?? [])].sort();
      for (const code of degrade) {
        const line = allText.split("\n").find((l) => l.includes(code)) ?? code;
        findings.push(makeFinding(code, line.slice(0, 400), { evidence: { degradeCode: code } }));
      }
      render = { driver: capture.driver, viewport, ...(diag?.backend ? { backend: diag.backend } : {}), ...(diag?.drawCalls !== undefined ? { drawCalls: diag.drawCalls } : {}), degradeCodes: degrade };
      return `${capture.driver}, ready=${capture.appState.ready ?? "never"}`;
    });

    // 7. inspect ----------------------------------------------------------------------------------------------------
    await step("inspect", () => {
      if (!capture) return "no capture";
      const diag = capture.appState.routeReady?.diagnostics;
      const mountReported = findings.some((f) => f.code === "RENDERER_MOUNT_FAILED");
      for (const text of diag?.errors ?? []) {
        if (text.includes("RENDERER_MOUNT_FAILED") && mountReported) continue;
        findings.push(makeFinding("RUNTIME_DIAGNOSTIC_ERROR", text.slice(0, 500)));
      }
      const seenMessages = new Set<string>();
      for (const d of (diag?.degradations ?? []).slice(0, 20)) {
        if (seenMessages.has(d.message)) continue;
        seenMessages.add(d.message);
        if (hasDegradeCode(d.message) && !/OPTION_IGNORED/.test(d.message)) continue;
        const ignored = d.code === "option-ignored" || /OPTION_IGNORED/.test(d.message);
        findings.push(makeFinding(ignored ? "RUNTIME_OPTION_IGNORED" : "RUNTIME_DEGRADATION", d.message.slice(0, 500), { evidence: { degradation: d.code, ...(d.nodeId ? { nodeId: d.nodeId } : {}) } }));
      }
      for (const text of (diag?.warnings ?? []).slice(0, 12)) {
        if (hasDegradeCode(text) || seenMessages.has(text)) continue;
        seenMessages.add(text);
        const code = /OPTION_IGNORED/.test(text) ? "RUNTIME_OPTION_IGNORED" : /^Scene has no lights/i.test(text) ? "RUNTIME_NO_LIGHTS" : /^Scene has no interactions/i.test(text) ? "RUNTIME_NO_INTERACTIONS" : "RUNTIME_DIAGNOSTIC_WARNING";
        findings.push(makeFinding(code, text.slice(0, 500)));
      }
      const hasHttp = capture.badResponses.length > 0 || capture.failedRequests.length > 0;
      for (const message of capture.consoleMessages) {
        if (message.level !== "error") continue;
        if (/RENDERER_MOUNT_FAILED/.test(message.text) && mountReported) continue;
        if (/^Failed to load resource/i.test(message.text) && hasHttp) continue;
        findings.push(makeFinding("CONSOLE_ERROR", message.text));
      }
      for (const text of capture.pageErrors) findings.push(makeFinding("PAGE_EXCEPTION", text));
      for (const response of capture.badResponses) if (!/^404 \/(favicon\.ico|apple-touch-icon[^/]*\.png)$/.test(response)) findings.push(makeFinding("REQUEST_FAILED", `HTTP ${response}`));
      for (const failed of capture.failedRequests.slice(0, 5)) findings.push(makeFinding("REQUEST_FAILED", `request did not complete: ${failed}`, { severity: "warning" }));

      let frame: FrameAnalysis | undefined;
      let motion: MotionAnalysis | undefined;
      try {
        const first = decodePng(capture.frames[0]!);
        frame = analyzeFrame(first);
        const metrics = { p99Luma: frame.p99Luma, meanLuma: frame.meanLuma, distinctColors: frame.distinctColors, texturedBlockFraction: frame.texturedBlockFraction };
        if (frame.black) findings.push(makeFinding("FRAME_BLACK", `The frame is black (p99 luma ${frame.p99Luma}).`, { evidence: metrics }));
        else if (frame.flat) findings.push(makeFinding("FRAME_FLAT", `The frame is one flat colour (${frame.distinctColors} distinct colours).`, { evidence: metrics }));
        else if (frame.empty) findings.push(makeFinding("FRAME_EMPTY", `Only ${(frame.texturedBlockFraction * 100).toFixed(1)}% of the frame has scene texture.`, { evidence: metrics }));
        else if (frame.dim) findings.push(makeFinding("FRAME_DIM", `The frame is dim (p99 luma ${frame.p99Luma}).`, { evidence: metrics }));
        if (capture.frames[1] && frame.drawn) {
          motion = compareFrames(first, decodePng(capture.frames[1]));
          if (!motion.moved) findings.push(makeFinding("MOTION_NONE", `Two frames ${options.motionGapMs ?? 1000} ms apart are identical (${(motion.changedPixelFraction * 100).toFixed(3)}% of pixels changed).`, { evidence: { ...motion } }));
        }
      } catch (error) {
        findings.push(makeFinding("VERIFY_STEP_CRASHED", `frame analysis: ${String((error as Error).message ?? error)}`));
      }
      if (render) render = { ...render, ...(frame ? { frame } : {}), ...(motion ? { motion } : {}) };
      return frame ? (frame.drawn ? "frame drawn" : frame.reasons.join("; ")) : "no frame";
    });
  } finally {
    await driver.close().catch(() => undefined);
    if (lockDir) { try { rmdirSync(lockDir); } catch { /* already released */ } }
    if (server) await new Promise<void>((done) => server!.close(() => done()));
  }

  const counts = { error: 0, warning: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;
  return {
    schema: VERIFY_SCHEMA,
    ok: counts.error === 0,
    project: basename(projectDir),
    startedAt: new Date(started).toISOString(),
    durationMs: now() - started,
    steps,
    findings,
    counts,
    ...(render ? { render } : {})
  };
}
