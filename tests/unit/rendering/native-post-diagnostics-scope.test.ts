import { describe, expect, it } from "vitest";
import { postDiagnostics, PostDiagnosticsStore, type PostDiagnosticToken } from "../../../packages/rendering/src/renderer/PostDiagnosticsScope";
import { beginPostStageTrace, postSkippedReasons, postStagesRan, recordPostSkipped, recordPostStage, resetPostSkipped } from "../../../packages/rendering/src/renderer/postSkipped";
import { postGraphV2LastOutcome, postprocessRequiresDepthTexture, RendererPostprocessPipeline } from "../../../packages/rendering/src/renderer/PostprocessExecution";
import { mergedCustomPasses, v2NeedsLdrTail } from "../../../packages/rendering/src/post/v2Stages";
import { planPostGraph } from "../../../packages/rendering/src/post/PostGraph";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import type { RendererHost } from "../../../packages/rendering/src/renderer/RendererHost";
import type { RendererPostProcessOptions } from "../../../packages/rendering/src/Renderer";
import type { RenderTarget } from "../../../packages/rendering/src/RenderDevice";
import { applyRuntimePostOverrides, authoredPostContextFor, bindPostDiagnosticReader, collectPostSection, createPrd03PostSurface, Prd03PostSurface, recordAuthoredPostContext, recordSubmittedPostprocess, resetAuthoredPostContext, resetRuntimePostOverrides, resetSubmittedPostprocess } from "../../../packages/engine/src/agent-api/postBridge";
import type { AuraApp } from "../../../packages/engine/src/agent-api/nodes/types";
import { effects } from "../../../packages/engine/src/agent-api/nodes/effects.composite";
import { registerPostPass } from "../../../packages/rendering/src/contracts/post";

describe("post diagnostics frame ownership", () => {
  it("separates renderers and views even when their frame numbers and view labels match", () => {
    const store = new PostDiagnosticsStore(), appA = {}, appB = {};
    const aLeft = store.begin(appA, "left", 1);
    const aRight = store.begin(appA, "right", 1);
    const bLeft = store.begin(appB, "left", 1);
    store.recordSkipped(aLeft, "a-left-only");
    store.recordStage(aLeft, "depth");
    store.recordStage(aLeft, "taa");
    store.setOutcome(aLeft, "v2");
    store.recordSkipped(aRight, "a-right-only");
    store.recordStage(aRight, "bloom");
    store.setOutcome(bLeft, "legacy-chain:backend");
    store.recordStage(bLeft, "tone-map");
    expect(store.snapshot(appA, "left")).toEqual({ viewId: "left", frameId: 1, skipped: ["a-left-only"], stagesRan: ["depth", "taa"], outcome: "v2" });
    expect(store.snapshot(appA, "right")).toEqual({ viewId: "right", frameId: 1, skipped: ["a-right-only"], stagesRan: ["bloom"], outcome: null });
    expect(store.snapshot(appB, "left")).toEqual({ viewId: "left", frameId: 1, skipped: [], stagesRan: ["tone-map"], outcome: "legacy-chain:backend" });
    expect(store.snapshotScope(appA).map(view => view.viewId)).toEqual(["left", "right"]);
    expect(store.snapshotScope({})).toEqual([]);
  });

  it("keeps one token for repeated passes and rejects a callback from an older frame", () => {
    const store = new PostDiagnosticsStore(), app = {};
    const frame = store.begin(app, 0, 7);
    expect(store.begin(app, 0, 7)).toBe(frame);
    store.recordSkipped(frame, "lut-pending");
    store.recordSkipped(frame, "lut-pending");
    store.recordStage(frame, "depth");
    store.recordStage(store.begin(app, 0, 7), "taa");
    store.setOutcome(frame, "v2");
    const saved = store.snapshot(app, 0)!;
    const next = store.begin(app, 0, 8);
    expect(next).not.toBe(frame);
    expect(store.snapshot(app, 0)).toEqual({ viewId: 0, frameId: 8, skipped: ["lut-pending"], stagesRan: [], outcome: null });
    expect(store.clearSkipped(frame, "lut-pending")).toBe(false);
    expect(store.recordSkipped(frame, "late-failure")).toBe(false);
    expect(store.recordStage(frame, "late-stage")).toBe(false);
    expect(store.setOutcome(frame, "v2")).toBe(false);
    expect(store.clearSkipped(next, "lut-pending")).toBe(true);
    store.recordStage(next, "present");
    expect(store.snapshot(app, 0)).toEqual({ viewId: 0, frameId: 8, skipped: [], stagesRan: ["present"], outcome: null });
    expect(saved).toEqual({ viewId: 0, frameId: 7, skipped: ["lut-pending"], stagesRan: ["depth", "taa"], outcome: "v2" });
  });

  it("does not resurrect a retired view, including when its frame number is reused", () => {
    const store = new PostDiagnosticsStore(), app = {}, other = {};
    const retired = store.begin(app, "view", 1);
    const survivor = store.begin(app, "other-view", 1);
    const otherApp = store.begin(other, "view", 1);
    store.recordStage(survivor, "survivor");
    store.recordStage(otherApp, "other-app");
    store.resetView(app, "view");
    expect(store.snapshot(app, "view")).toBeNull();
    expect(store.recordSkipped(retired, "late")).toBe(false);
    const replacement = store.begin(app, "view", 1);
    expect(replacement).not.toBe(retired);
    expect(store.recordStage(retired, "stale")).toBe(false);
    expect(store.recordStage(replacement, "fresh")).toBe(true);
    store.resetScope(app);
    expect(store.recordStage(replacement, "after-disposal")).toBe(false);
    expect(store.snapshotScope(app)).toEqual([]);
    expect(store.snapshot(other, "view")?.stagesRan).toEqual(["other-app"]);
    expect(store.recordStage(otherApp, "still-live")).toBe(true);
  });

  it("rejects malformed identities and cannot be written through a copied token", () => {
    const store = new PostDiagnosticsStore(), app = {};
    expect(() => store.begin(null as unknown as object, "v", 1)).toThrow("POST_DIAGNOSTICS_SCOPE_INVALID");
    expect(() => store.begin(app, NaN, 1)).toThrow("POST_DIAGNOSTICS_VIEW_INVALID");
    expect(() => store.begin(app, "v", -1)).toThrow("POST_DIAGNOSTICS_FRAME_INVALID");
    expect(() => store.begin(app, "v", 0.5)).toThrow("POST_DIAGNOSTICS_FRAME_INVALID");
    const token = store.begin(app, "v", 1);
    const forged: PostDiagnosticToken = { scopeId: app, viewId: "v", frameId: 1 };
    expect(Object.isFrozen(token)).toBe(true);
    expect(store.recordStage(forged, "forged")).toBe(false);
    expect(store.snapshot(app, "v")?.stagesRan).toEqual([]);
    expect(store.recordStage(token, "real")).toBe(true);
    // Frame IDs are explicit tokens; restarting an ID after another frame
    // creates a fresh token and never makes the original one current again.
    store.begin(app, "v", 2);
    const reusedId = store.begin(app, "v", 1);
    expect(reusedId).not.toBe(token);
    expect(store.recordSkipped(token, "stale-same-id")).toBe(false);
    expect(store.recordSkipped(reusedId, "current")).toBe(true);
    expect(store.snapshot(app, "v")?.skipped).toEqual(["current"]);
  });
});

describe("scoped post producer and app bridge", () => {
  it("isolates unbound and reused canvases, retiring only the owning app's post settings", () => {
    const canvas = {} as HTMLCanvasElement, unbound = {} as HTMLCanvasElement;
    const flags = { values: { A3D_QR_POST: true }, on: (flag: string) => flag === "A3D_QR_POST" };
    let oldNotify: ((event: { to: "low" | "ultra" }) => void) | undefined;
    let newNotify: ((event: { to: "low" | "ultra" }) => void) | undefined;
    let oldUnsubscribed = 0, newUnsubscribed = 0;
    const oldApp = { canvas, quality: { set: async () => {}, onChange: (listener: typeof oldNotify) => { oldNotify = listener; return () => { oldUnsubscribed += 1; }; } } } as unknown as AuraApp;
    const newApp = { canvas, quality: { set: async () => {}, onChange: (listener: typeof newNotify) => { newNotify = listener; return () => { newUnsubscribed += 1; }; } } } as unknown as AuraApp;
    const nodes = [effects.vignette({ intensity: 0.2 }).toJSON()];
    const oldSurface = createPrd03PostSurface(oldApp, { flags, options: { output: { exposure: 2 } } }) as Prd03PostSurface;
    let newSurface: Prd03PostSurface | undefined;
    try {
      oldSurface.setEffect("vignette", { intensity: 0.8 });
      oldSurface.setQualityTier("low");
      expect(authoredPostContextFor(canvas)?.qualityTier).toBe("low");
      expect(applyRuntimePostOverrides(nodes, canvas)[0]).toMatchObject({ intensity: 0.8 });
      // Legacy canvas-less lookup still resolves the latest app, but another
      // canvas never borrows its output, AA tier or runtime overrides.
      expect(authoredPostContextFor()?.output?.exposure).toBe(2);
      expect(applyRuntimePostOverrides(nodes)[0]).toMatchObject({ intensity: 0.8 });
      expect(authoredPostContextFor(unbound)).toBeNull();
      expect(applyRuntimePostOverrides(nodes, unbound)).toBe(nodes);

      const authored = { bloom: false, ambientOcclusion: false, contactOcclusion: false, colorGrade: false, antiAlias: false,
        outline: false, ssr: false, depthOfField: false, motionBlur: false, volumetricFog: false, colorGradeExposure: null, antiAliasMode: null, v2: true };
      recordSubmittedPostprocess({}, { renderWidth: 8, renderHeight: 8, temporalRequested: false, authored, canvas });
      expect(collectPostSection(oldApp).present).toBe(true);
      newSurface = createPrd03PostSurface(newApp, { flags, options: { output: { exposure: 3 } } }) as Prd03PostSurface;
      expect(collectPostSection(newApp).present).toBe(false);
      expect(authoredPostContextFor(canvas)?.qualityTier).toBeNull();
      expect(applyRuntimePostOverrides(nodes, canvas)).toBe(nodes);
      newSurface.setEffect("vignette", { intensity: 0.4 });
      oldNotify?.({ to: "ultra" });
      oldSurface.setQualityTier("ultra");
      oldSurface.dispose();
      expect(oldUnsubscribed).toBe(1);
      expect(authoredPostContextFor(canvas)?.output?.exposure).toBe(3);
      expect(authoredPostContextFor(canvas)?.qualityTier).toBeNull();
      expect(applyRuntimePostOverrides(nodes, canvas)[0]).toMatchObject({ intensity: 0.4 });
      newNotify?.({ to: "low" });
      expect(authoredPostContextFor(canvas)?.qualityTier).toBe("low");
      newSurface.dispose();
      newNotify?.({ to: "ultra" });
      expect(newUnsubscribed).toBe(1);
      expect(authoredPostContextFor(canvas)).toBeNull();
      expect(applyRuntimePostOverrides(nodes, canvas)).toBe(nodes);
    } finally {
      oldSurface.dispose(); newSurface?.dispose();
      resetAuthoredPostContext(); resetRuntimePostOverrides(); resetSubmittedPostprocess();
    }
  });

  it("isolates same-named app passes, uniform overrides, depth planning and reports", () => {
    const scopeA = {}, scopeB = {}, canvasA = {} as HTMLCanvasElement, canvasB = {} as HTMLCanvasElement;
    const flags = { values: { A3D_QR_POST: true }, on: (flag: string) => flag === "A3D_QR_POST" };
    const appA = { canvas: canvasA } as AuraApp, appB = { canvas: canvasB } as AuraApp;
    const a = new Prd03PostSurface(flags, canvasA), b = new Prd03PostSurface(flags, canvasB);
    const unbindA = bindPostDiagnosticReader(canvasA, () => postDiagnostics.snapshotScope(scopeA), scopeA);
    const unbindB = bindPostDiagnosticReader(canvasB, () => postDiagnostics.snapshotScope(scopeB), scopeB);
    const tokenA = postDiagnostics.begin(scopeA, "view", 1), tokenB = postDiagnostics.begin(scopeB, "view", 1);
    const common = { name: "same-name", fragment: { glsl: "void main() {}" } };
    const base = { antiAliasing: "off" as const, depthRange: { near: .1, far: 10, projection: "perspective" as const }, exposure: 1, toneMapping: "none" as const, dither: false };
    try {
      a.addPostPass({ ...common, insertAt: "after-tonemap", inputs: ["color", "depth"], uniforms: { value: 0 } });
      b.addPostPass({ ...common, insertAt: "before-tonemap", inputs: ["color"], uniforms: { value: 0 } });
      expect(() => a.addPostPass({ ...common, insertAt: "before-tonemap" })).toThrow("REGISTRY_DUPLICATE:prd03.custom.same-name");
      a.setPassUniform("same-name", "value", 11); b.setPassUniform("same-name", "value", 22);
      const passesA = mergedCustomPasses(base, tokenA).filter(pass => pass.id.startsWith("prd03.custom.same-name"));
      const passesB = mergedCustomPasses(base, tokenB).filter(pass => pass.id.startsWith("prd03.custom.same-name"));
      expect(passesA).toHaveLength(1); expect(passesB).toHaveLength(1);
      expect(passesA[0]!.uniforms!(null as never)).toEqual({ value: 11 });
      expect(passesB[0]!.uniforms!(null as never)).toEqual({ value: 22 });
      expect(postprocessRequiresDepthTexture({ v2: true, pipeline: base }, scopeA)).toBe(true);
      expect(postprocessRequiresDepthTexture({ v2: true, pipeline: base }, scopeB)).toBe(false);
      expect(v2NeedsLdrTail(base, tokenA)).toBe(true);
      expect(v2NeedsLdrTail(base, tokenB)).toBe(false);
      const planA = planPostGraph(base, { width: 4, height: 4, scopeId: scopeA });
      const planB = planPostGraph(base, { width: 4, height: 4, scopeId: scopeB });
      expect(planA.stages.some(stage => stage.name === "S1-depth-prep")).toBe(true);
      expect(planB.stages.some(stage => stage.name === "S1-depth-prep")).toBe(false);
      expect(planA.stages.some(stage => stage.name === passesA[0]!.id)).toBe(true);
      expect(planB.stages.some(stage => stage.name === passesA[0]!.id)).toBe(false);
      expect(collectPostSection(appA).customPasses.filter(pass => pass.id === "prd03.custom.same-name")).toHaveLength(1);
      expect(collectPostSection(appB).customPasses.filter(pass => pass.id === "prd03.custom.same-name")).toHaveLength(1);
      a.dispose();
      expect(mergedCustomPasses(base, tokenB).filter(pass => pass.id.startsWith("prd03.custom.same-name"))).toHaveLength(1);
      expect(passesB[0]!.uniforms!(null as never)).toEqual({ value: 22 });
    } finally { a.dispose(); b.dispose(); unbindA(); unbindB(); postDiagnostics.resetScope(scopeA); postDiagnostics.resetScope(scopeB); }
  });

  it("keeps legacy no-token diagnostics separate from explicit frame tokens", () => {
    const a = {}, b = {};
    const first = postDiagnostics.begin(a, "v", 1), second = postDiagnostics.begin(b, "v", 1);
    resetPostSkipped(); beginPostStageTrace();
    recordPostSkipped("legacy"); recordPostStage("legacy-stage");
    recordPostSkipped("first-only", first); recordPostStage("first-stage", first);
    recordPostSkipped("second-only", second); recordPostStage("second-stage", second);
    expect(postSkippedReasons()).toEqual(["legacy"]);
    expect(postStagesRan()).toEqual(["legacy-stage"]);
    expect(postSkippedReasons(first)).toEqual(["first-only"]);
    expect(postStagesRan(second)).toEqual(["second-stage"]);
    postDiagnostics.resetScope(a); postDiagnostics.resetScope(b); resetPostSkipped();
  });

  it("attributes the actual v2 route decision to each renderer frame", () => {
    const appA = {}, appB = {};
    const a = postDiagnostics.begin(appA, "view", 1), b = postDiagnostics.begin(appB, "view", 1);
    const device = { kind: "mock" } as RendererHost["device"];
    setRendererQrFlags({ values: { A3D_QR_CORE_OUTPUT: "1" }, on: flag => flag === "A3D_QR_CORE_OUTPUT" }, device);
    const pipeline = new RendererPostprocessPipeline({ device } as RendererHost);
    const invoke = (options: RendererPostProcessOptions) => (pipeline as unknown as {
      tryExecutePostGraphV2(options: RendererPostProcessOptions, target: RenderTarget, passes: readonly never[]): boolean;
    }).tryExecutePostGraphV2(options, { colorTexture: { format: "rgba8" } } as RenderTarget, []);
    const context = (token: PostDiagnosticToken) => ({ source: {}, items: [], diagnosticToken: token,
      sceneDepth: { texture: null, available: false, linearize: { near: .1, far: 10, orthographic: false } } });
    expect(invoke({ v2: true, pipeline: {} as never, postFrameContext: context(a) })).toBe(false);
    expect(invoke({ postFrameContext: context(b) })).toBe(false);
    expect(postGraphV2LastOutcome(a)).toBe("legacy-chain:backend");
    expect(postGraphV2LastOutcome(b)).toBe("legacy-chain:no-v2-plan");
    expect(postSkippedReasons(a)).toEqual(["POSTPROCESS_LEGACY_ROUTE:backend"]);
    expect(postSkippedReasons(b)).toEqual(["POSTPROCESS_LEGACY_ROUTE:no-v2-plan"]);
    const next = postDiagnostics.begin(appA, "view", 2);
    expect(postGraphV2LastOutcome(a)).toBeNull();
    expect(postGraphV2LastOutcome(next)).toBeNull();
    postDiagnostics.resetScope(appA); postDiagnostics.resetScope(appB);
  });

  it("delivers each canvas only its own renderer/view results and keeps newer bindings on old cleanup", () => {
    const a = {}, b = {}, appA = { canvas: {} as HTMLCanvasElement } as AuraApp, appB = { canvas: {} as HTMLCanvasElement } as AuraApp;
    const tokenA = postDiagnostics.begin(a, "left", 1), tokenB = postDiagnostics.begin(b, "left", 1);
    postDiagnostics.recordSkipped(tokenA, "only-a"); postDiagnostics.recordStage(tokenA, "taa-a"); postDiagnostics.setOutcome(tokenA, "v2");
    postDiagnostics.recordSkipped(tokenB, "only-b"); postDiagnostics.recordStage(tokenB, "bloom-b"); postDiagnostics.setOutcome(tokenB, "legacy-chain:backend");
    const flags = { values: {}, on: (flag: string) => flag === "A3D_QR_POST" };
    recordAuthoredPostContext({ flags, options: {} }, appA); recordAuthoredPostContext({ flags, options: {} }, appB);
    const authored = { bloom: false, ambientOcclusion: false, contactOcclusion: false, colorGrade: false, antiAlias: false,
      outline: false, ssr: false, depthOfField: false, motionBlur: false, volumetricFog: false, colorGradeExposure: null, antiAliasMode: null, v2: true };
    for (const app of [appA, appB]) recordSubmittedPostprocess({}, { renderWidth: 8, renderHeight: 8, temporalRequested: false, authored, canvas: app.canvas });
    const removeOld = bindPostDiagnosticReader(appA.canvas!, () => []);
    const removeA = bindPostDiagnosticReader(appA.canvas!, () => postDiagnostics.snapshotScope(a));
    const removeB = bindPostDiagnosticReader(appB.canvas!, () => postDiagnostics.snapshotScope(b));
    removeOld();
    const unregister = registerPostPass({ id: "scope-test-pass", owner: "prd03", flag: "A3D_QR_POST", insertAt: "after-tonemap", space: "display", inputs: ["color"], fragment: { glsl: "void main() {}" }, gpuOnly: true });
    try {
      const reportA = collectPostSection(appA), reportB = collectPostSection(appB);
      expect(reportA.skipped).toContain("only-a"); expect(reportA.skipped).not.toContain("only-b");
      expect(reportB.skipped).toContain("only-b"); expect(reportB.skipped).not.toContain("only-a");
      expect(reportA.stagesRan).toEqual(["taa-a"]); expect(reportB.stagesRan).toEqual(["bloom-b"]);
      expect(reportA.customPasses.find(pass => pass.id === "scope-test-pass")?.status).toBe("v2");
      expect(reportB.customPasses.find(pass => pass.id === "scope-test-pass")?.status).toBe("legacy-chain:backend");
      expect(collectPostSection({ canvas: {} as HTMLCanvasElement } as AuraApp).present).toBe(false);
      removeA();
      expect(collectPostSection(appA).stagesRan).toEqual([]);
      expect(collectPostSection(appB).stagesRan).toEqual(["bloom-b"]);
    } finally {
      unregister(); removeA(); removeB(); postDiagnostics.resetScope(a); postDiagnostics.resetScope(b);
      resetSubmittedPostprocess(); resetAuthoredPostContext();
    }
  });
});
