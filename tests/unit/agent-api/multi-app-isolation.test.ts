import { describe, expect, it, vi } from "vitest";
import {
  assetEventScopeForApp,
  bindAppAssetEventScope,
  createAppAssetEventScope,
  emitAppAssetProgress,
  unbindAppAssetEventScope
} from "../../../packages/engine/src/agent-api/assetEvents";
import {
  bindActorAnimationContext,
  createActorAnimationContext,
  disposeActorAnimationContext,
  qrAnimationFlags,
  registerActorBindMatrixSource,
  actorBindMatrixFor,
  registerActorClipInfoSource,
  resolveAnimationClipsForNode
} from "../../../packages/engine/src/agent-api/app/actorAnimationHandle";
import { setTypedGLBActorQrFlags, typedGLBActorQrFlags } from "../../../packages/engine/src/production-runtime/actor/extensions";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { prd01ColorSrgb, setPrd01ColorParsing, withPrd01ColorParsing } from "../../../packages/engine/src/agent-api/compiler/color";
import { setWorldBuilderFlags, withWorldBuilderFlags, worldBuilderFlagOn } from "../../../packages/engine/src/agent-api/world/flags";
import { bindPrd07FogRuntime, createProductionRuntimeEnvironmentFog, prd07FogRuntimeState } from "../../../packages/engine/src/agent-api/compiler/fog";
import { LiveAtmosphere } from "../../../packages/engine/src/production-runtime/effects/LiveAtmosphere";
import { formatDiagnosticError } from "../../../packages/engine/src/agent-api/sanitizeDiagnostics";
import { snapshotDiagnostics, type MutableDiagnostics } from "../../../packages/engine/src/agent-api/diagnostics";
import { createAuraApp } from "../../../packages/engine/src/agent-api/app/createAuraApp";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import { setTextureAssetManager, texture } from "../../../packages/engine/src/agent-api/nodes/texture";
import type { AssetManager } from "../../../packages/assets/src/AssetManager";
import { createTypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor";
import { createProductionRuntimeRendererInput, setPrd01ModelMatrixCache } from "../../../packages/engine/src/agent-api/compiler/renderInput";
import {
  bindShaderFailureStore,
  clearShaderFailures,
  createShaderFailureStore,
  getShaderFailures,
  recordShaderFailure,
  resolveShaderFailureMode,
  setShaderFailureMode,
  shaderFailureStoreFor
} from "../../../packages/rendering/src/ShaderFailures";

describe("app-owned runtime isolation", () => {
  it("routes real texture-load callbacks to the requesting app across concurrent failures and disposal", async () => {
    type Pending = { progress: (event: { loadedBytes: number; totalBytes: number }) => void; reject: (error: Error) => void };
    const pending = new Map<string, Pending>();
    setTextureAssetManager({
      load: (url: string, options: { onProgress: Pending["progress"] }) => new Promise((_resolve, reject: (error: Error) => void) => {
        pending.set(url, { progress: options.onProgress, reject });
      })
    } as unknown as AssetManager);
    const progressA: string[] = [], progressB: string[] = [], errorsA: string[] = [], errorsB: string[] = [];
    const appA = createAuraApp(null, {
      scene: scene(), autoStart: false, strict: true,
      qualityRebuild: { flags: { A3D_QR_ANIMATION: true } },
      onAssetProgress: (event) => progressA.push(event.url ?? ""),
      onAssetError: (event) => errorsA.push(event.url ?? "")
    });
    const appB = createAuraApp(null, {
      scene: scene(), autoStart: false, strict: false,
      qualityRebuild: { flags: { A3D_QR_ANIMATION: false } },
      onAssetProgress: (event) => progressB.push(event.url ?? ""),
      onAssetError: (event) => errorsB.push(event.url ?? "")
    });
    try {
      expect(qrAnimationFlags(appA).on("A3D_QR_ANIMATION")).toBe(true);
      expect(qrAnimationFlags(appB).on("A3D_QR_ANIMATION")).toBe(false);
      const firstA = texture.load("a.png", { app: appA });
      const lateA = texture.load("late.png", { app: appA });
      const firstB = texture.load("b.png", { app: appB });
      const rejectA = expect(firstA).rejects.toThrow("a failed");
      // 5.0: disposing the owner settles its pending load as an AbortError at
      // once; the loader's later failure is suppressed and never reaches app A.
      const rejectLate = expect(lateA).rejects.toMatchObject({ name: "AbortError", message: expect.stringMatching(/app is closed/) });
      const rejectB = expect(firstB).rejects.toThrow("b failed");
      pending.get("b.png")!.progress({ loadedBytes: 1, totalBytes: 2 });
      pending.get("a.png")!.progress({ loadedBytes: 2, totalBytes: 2 });
      pending.get("a.png")!.reject(new Error("a failed"));
      await rejectA;
      expect(progressA).toEqual(["a.png"]);
      expect(progressB).toEqual(["b.png"]);
      expect(errorsA).toEqual(["a.png"]);
      expect(errorsB).toEqual([]);
      appA.dispose();
      await rejectLate;
      pending.get("late.png")!.progress({ loadedBytes: 1, totalBytes: 1 });
      pending.get("late.png")!.reject(new Error("late failed"));
      pending.get("b.png")!.reject(new Error("b failed"));
      await rejectB;
      await Promise.resolve();
      expect(progressA).toEqual(["a.png"]);
      expect(errorsA).toEqual(["a.png"]);
      expect(errorsB).toEqual(["b.png"]);
    } finally {
      appA.dispose(); appB.dispose(); setTextureAssetManager(null);
    }
  });

  it("cancels every loader kind owned by a closed app while a non-strict second app keeps its own events", async () => {
    // Model requests: app A's stays pending until aborted; app B's fails with a signed URL.
    const modelSignals = new Map<string, AbortSignal | undefined>();
    vi.stubGlobal("fetch", vi.fn((input: unknown, init?: RequestInit) => {
      const url = String(input);
      modelSignals.set(url, init?.signal ?? undefined);
      if (url.includes("b.gltf")) return Promise.reject(new Error("fetch https://cdn.test/b.gltf?X-Amz-Signature=secret failed"));
      return new Promise((_resolve, reject) => {
        const abort = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
        if (init?.signal?.aborted) abort();
        init?.signal?.addEventListener("abort", abort, { once: true });
      });
    }));
    type Pending = { reject: (error: Error) => void };
    const pending = new Map<string, Pending>();
    setTextureAssetManager({
      load: (url: string) => new Promise((_resolve, reject: (error: Error) => void) => { pending.set(url, { reject }); })
    } as unknown as AssetManager);
    const errorsA: string[] = [], errorsB: string[] = [], messagesB: string[] = [];
    const appA = createAuraApp(null, { scene: scene(), autoStart: false, strict: true, onAssetError: (event) => errorsA.push(event.url ?? "") });
    const appB = createAuraApp(null, {
      scene: scene(), autoStart: false, strict: false,
      onAssetError: (event) => { errorsB.push(event.url ?? ""); messagesB.push(event.message ?? ""); }
    });
    const actor = (app: object, url: string, id: string) => createTypedGLBActor({ asset: { url, format: "gltf" }, id, width: 8, height: 8, runtimeOwner: app });
    try {
      const modelA = actor(appA, "https://cdn.test/a.gltf", "model-a");
      const textureA = texture.load("a.png", { app: appA });
      const modelB = actor(appB, "https://cdn.test/b.gltf", "model-b");
      const textureB = texture.load("b.png", { app: appB });
      const settledA = Promise.allSettled([modelA, textureA]);
      await expect(modelB).rejects.toThrow();
      expect(errorsB).toEqual(["https://cdn.test/b.gltf"]);
      expect(messagesB.join(" ")).not.toContain("secret");
      await vi.waitFor(() => expect(modelSignals.has("https://cdn.test/a.gltf")).toBe(true));
      // The model request carries an owner-linked signal even though the caller passed none.
      const signalA = modelSignals.get("https://cdn.test/a.gltf");
      expect(signalA?.aborted).toBe(false);
      appA.dispose();
      expect(signalA?.aborted).toBe(true);
      const [modelOutcome, textureOutcome] = await settledA;
      expect(modelOutcome).toMatchObject({ status: "rejected", reason: { name: "AbortError" } });
      expect(textureOutcome).toMatchObject({ status: "rejected", reason: { name: "AbortError" } });
      pending.get("a.png")!.reject(new Error("late a failed"));
      pending.get("b.png")!.reject(new Error("b texture failed"));
      await expect(textureB).rejects.toThrow("b texture failed");
      await Promise.resolve();
      // Nothing from the closed app's loaders reaches it, nothing crosses apps,
      // and a closed owner rejects new requests of every kind up front.
      expect(errorsA).toEqual([]);
      expect(errorsB).toEqual(["https://cdn.test/b.gltf", "b.png"]);
      await expect(actor(appA, "https://cdn.test/a2.gltf", "model-a2")).rejects.toMatchObject({ name: "AbortError" });
      await expect(texture.load("a2.png", { app: appA })).rejects.toMatchObject({ name: "AbortError" });
      expect(modelSignals.has("https://cdn.test/a2.gltf")).toBe(false);
      expect(pending.has("a2.png")).toBe(false);
    } finally {
      appA.dispose(); appB.dispose(); setTextureAssetManager(null); vi.unstubAllGlobals();
    }
  });

  it("delivers only to the captured request owner, redacts data and drops late events", () => {
    const appA = {};
    const appB = {};
    const progressA: unknown[] = [];
    const progressB: unknown[] = [];
    const errorsA: unknown[] = [];
    const scopeA = createAppAssetEventScope({ onAssetProgress: (event) => progressA.push(event), onAssetError: (event) => errorsA.push(event) });
    const scopeB = createAppAssetEventScope({ onAssetProgress: (event) => progressB.push(event) });
    bindAppAssetEventScope(appA, scopeA);
    bindAppAssetEventScope(appB, scopeB);
    const requestA = assetEventScopeForApp(appA)!;
    const requestB = assetEventScopeForApp(appB)!;

    requestB.emitProgress({ url: "b.png", loaded: 2, total: 2 });
    requestA.emitProgress({ url: "https://user:password@example.test/a?X-Amz-Signature=secret", loaded: 1, total: 2 });
    requestA.emitError({ url: "/a?token=secret", message: "Authorization: Bearer secret", error: new Error("fetch https://user:password@example.test/a?token=secret") });
    emitAppAssetProgress({ url: "standalone.png", loaded: 1, total: 1 });

    expect(progressA).toHaveLength(1);
    expect(progressB).toEqual([{ url: "b.png", loaded: 2, total: 2 }]);
    const safe = JSON.stringify([progressA, errorsA]);
    expect(safe).not.toContain("password");
    expect(safe).not.toContain("secret");
    expect(errorsA).toHaveLength(1);
    expect(String((errorsA[0] as { error: unknown }).error)).not.toMatch(/secret|password/);
    unbindAppAssetEventScope(appA);
    unbindAppAssetEventScope(appA);
    expect(assetEventScopeForApp(appA)).toBeUndefined();
    requestA.emitProgress({ url: "late.png", loaded: 1, total: 1 });
    requestB.emitProgress({ url: "still-active.png", loaded: 1, total: 1 });
    expect(progressA).toHaveLength(1);
    expect(progressB).toHaveLength(2);
    unbindAppAssetEventScope(appB);
  });

  it("keeps clip sources, flags, pending work and bone matrices per app", async () => {
    const appA = {}, appB = {}, actorA = {}, actorB = {};
    const flagsA = resolveQrFlags({ options: { A3D_QR_ANIMATION: true } });
    const flagsB = resolveQrFlags({ options: { A3D_QR_ANIMATION: false } });
    const contextA = createActorAnimationContext(flagsA);
    const contextB = createActorAnimationContext(flagsB);
    bindActorAnimationContext(appA, contextA);
    bindActorAnimationContext(actorA, contextA);
    bindActorAnimationContext(appB, contextB);
    bindActorAnimationContext(actorB, contextB);
    setTypedGLBActorQrFlags(flagsA, appA);
    setTypedGLBActorQrFlags(flagsB, appB);
    expect(qrAnimationFlags(appA).on("A3D_QR_ANIMATION")).toBe(true);
    expect(qrAnimationFlags(appB).on("A3D_QR_ANIMATION")).toBe(false);
    expect(typedGLBActorQrFlags(appA)).toBe(flagsA);
    expect(typedGLBActorQrFlags(appB)).toBe(flagsB);

    const clipA = { name: "walk-a", duration: 1, channelCount: 1, hasRootMotionCandidate: false };
    const clipB = { name: "walk-b", duration: 2, channelCount: 2, hasRootMotionCandidate: false };
    registerActorClipInfoSource("same-id", () => [clipA], actorA);
    registerActorClipInfoSource("same-id", () => [clipB], actorB);
    registerActorBindMatrixSource("same-id", () => [1, 2, 3], actorA);
    registerActorBindMatrixSource("same-id", () => [4, 5, 6], actorB);
    expect(await resolveAnimationClipsForNode("same-id", appA)).toEqual([clipA]);
    expect(await resolveAnimationClipsForNode("same-id", appB)).toEqual([clipB]);
    expect([...actorBindMatrixFor("same-id", "bone", appA)!]).toEqual([1, 2, 3]);
    expect([...actorBindMatrixFor("same-id", "bone", appB)!]).toEqual([4, 5, 6]);
    const pending = resolveAnimationClipsForNode("not-yet-loaded", appA);
    disposeActorAnimationContext(contextA);
    expect(await pending).toEqual([]);
    registerActorClipInfoSource("late", () => [clipA], actorA);
    expect(await resolveAnimationClipsForNode("late", appA)).toEqual([]);
    expect(await resolveAnimationClipsForNode("same-id", appB)).toEqual([clipB]);
    disposeActorAnimationContext(contextB);
  });

  it("restores owner-specific color and world policies after nested calls and stale cleanup", () => {
    const ownerA = {}, ownerB = {};
    const oldCleanup = setPrd01ColorParsing({ strict: true }, ownerA);
    setPrd01ColorParsing(null, ownerB);
    const newCleanup = setPrd01ColorParsing({ strict: true }, ownerA);
    oldCleanup();
    withPrd01ColorParsing(ownerA, () => {
      expect(() => prd01ColorSrgb("not a color")).toThrow();
      expect(() => withPrd01ColorParsing(ownerB, () => prd01ColorSrgb("not a color"))).toThrow(/COLOR_INVALID/);
      expect(() => prd01ColorSrgb("not a color")).toThrow();
    });
    const flagsA = resolveQrFlags({ options: { A3D_QR_WORLD: true } });
    const flagsB = resolveQrFlags({ options: { A3D_QR_WORLD: false } });
    const clearA = setWorldBuilderFlags(flagsA, ownerA);
    const clearB = setWorldBuilderFlags(flagsB, ownerB);
    withWorldBuilderFlags(ownerA, () => {
      expect(worldBuilderFlagOn("A3D_QR_WORLD")).toBe(true);
      expect(withWorldBuilderFlags(ownerB, () => worldBuilderFlagOn("A3D_QR_WORLD"))).toBe(false);
      expect(worldBuilderFlagOn("A3D_QR_WORLD")).toBe(true);
    });
    newCleanup(); clearA(); clearB();
  });

  it("uses the owning atmosphere and protects newer bindings from stale disposal", () => {
    const ownerA = {}, ownerB = {};
    const flags = resolveQrFlags({ options: { A3D_QR_VFX_FOG: true } });
    const atmosphereA = new LiveAtmosphere();
    const atmosphereB = new LiveAtmosphere();
    atmosphereA.setFog({ mode: "exp", density: 0.2 });
    atmosphereB.setFog({ mode: "exp", density: 0.6 });
    const stale = bindPrd07FogRuntime({ flags, atmosphere: atmosphereB }, ownerA);
    const disposeA = bindPrd07FogRuntime({ flags, atmosphere: atmosphereA }, ownerA);
    const disposeB = bindPrd07FogRuntime({ flags, atmosphere: atmosphereB }, ownerB);
    stale();
    const snapshot = { nodes: [] } as never;
    expect(prd07FogRuntimeState(ownerA)?.atmosphere).toBe(atmosphereA);
    expect((createProductionRuntimeEnvironmentFog(snapshot, [], 100, 100, ownerA) as { density: number }).density).toBeCloseTo(0.2);
    expect((createProductionRuntimeEnvironmentFog(snapshot, [], 100, 100, ownerB) as { density: number }).density).toBeCloseTo(0.6);
    disposeA();
    expect(prd07FogRuntimeState(ownerA)).toBeNull();
    expect(prd07FogRuntimeState(ownerB)?.atmosphere).toBe(atmosphereB);
    disposeB();
  });

  it("uses a separate matrix cache for each canvas even with the same scene and node", () => {
    const canvasA = { width: 800, height: 600 } as HTMLCanvasElement;
    const canvasB = { width: 800, height: 600 } as HTMLCanvasElement;
    const node = { kind: "primitive", primitive: "box", position: [2, 0, 0] };
    const snapshot = { schema: "aura3d-scene-snapshot/1.0", background: "#000", diagnostics: { enabled: false }, nodes: [node], camera: { mode: "orbit", position: [0, 0, 5], target: [0, 0, 0] } } as never;
    const entry = { node, resources: [{ geometry: { topology: "triangles" }, material: { renderState: {}, getParameter: () => undefined, setParameter: () => {} }, bounds: { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] }, name: "box", sdfText: null }], currentLodIndex: 0 } as never;
    const cache = (x: number) => ({ modelMatrix: () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, 0, 0, 1]), beginFrame: () => {}, composed: 0, hits: 0 });
    const oldA = setPrd01ModelMatrixCache(cache(3), canvasA);
    const clearA = setPrd01ModelMatrixCache(cache(7), canvasA);
    const clearB = setPrd01ModelMatrixCache(null, canvasB);
    oldA();
    const translateX = (canvas: HTMLCanvasElement) => {
      const input = createProductionRuntimeRendererInput(snapshot, canvas, [], [entry], 0, undefined, new Set(), { color: [0, 0, 0], intensity: 0 }, []);
      return Array.from(input.source.collectRenderItems?.() ?? [])[0]!.modelMatrix?.[12];
    };
    expect(translateX(canvasA)).toBe(7);
    expect(translateX(canvasB)).toBe(2);
    expect(translateX(canvasA)).toBe(7);
    clearA(); clearB();
  });

  it("keeps shader modes and bounded diagnostic records separate", () => {
    const appA = {}, appB = {};
    const storeA = createShaderFailureStore(), storeB = createShaderFailureStore();
    bindShaderFailureStore(appA, storeA); bindShaderFailureStore(appB, storeB);
    setShaderFailureMode("throw", storeA); setShaderFailureMode("skip", storeB);
    expect(resolveShaderFailureMode(false, shaderFailureStoreFor(appA))).toBe("throw");
    expect(resolveShaderFailureMode(false, shaderFailureStoreFor(appB))).toBe("skip");
    recordShaderFailure({
      code: "CUSTOM_SHADER_COMPILE_FAILED", material: "A", shaderKey: "shader", stage: "fragment",
      message: "bad shader", log: "bad shader", locations: [], mode: "throw", count: 1
    }, storeA);
    const state = {
      backend: "headless", fps: 0, drawCalls: 0, renderSize: [1, 1],
      assets: [{ id: "asset", type: "model", status: "ready", url: "https://u:p@example.test/a?token=secret" }],
      evidence: {}, renderer: {}, warnings: [], errors: []
    } as unknown as MutableDiagnostics;
    expect(snapshotDiagnostics(state, storeA).shaderFailures).toHaveLength(1);
    expect(snapshotDiagnostics(state, storeB).shaderFailures).toBeUndefined();
    expect(JSON.stringify(snapshotDiagnostics(state, storeA))).not.toContain("secret");
    clearShaderFailures(storeA);
    expect(getShaderFailures(storeA)).toHaveLength(0);
    expect(getShaderFailures(storeB)).toHaveLength(0);
  });

  it("formats hostile or cyclic error details without leaking credentials", () => {
    const details: Record<string, unknown> = { authorization: "secretA", headers: { "x-private": "secretB" }, n: 42n, huge: "x".repeat(15000) };
    details.self = details;
    Object.defineProperty(details, "bad", { enumerable: true, get() { throw new Error("getter ran"); } });
    const error = Object.assign(new Error("https://user:password@example.test/a?X-Amz-Signature=secret"), { details });
    const formatted = formatDiagnosticError(error);
    expect(formatted).toContain("42n");
    expect(formatted).not.toMatch(/secret|password/);
    expect(formatted.length).toBeLessThanOrEqual(2049);
    const cycle: Record<string, unknown> = { n: 1n };
    cycle.self = cycle;
    expect(formatDiagnosticError(Object.assign(new Error("cycle"), { details: cycle }))).toContain("[circular]");
    const revoked = Proxy.revocable({}, {}); revoked.revoke();
    expect(() => formatDiagnosticError(revoked.proxy)).not.toThrow();
  });
});
