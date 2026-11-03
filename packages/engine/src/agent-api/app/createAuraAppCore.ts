// Provider-injected app implementation, shared by legacy and isolated entries.

import { computeRuntimeAlpha } from "./frameAlpha.js";
import type { AuraApp, AuraAppTarget, AuraBackend, AuraCreateAppOptions, AuraFrameCallback, AuraFrameInfo, AuraModelNode, AuraPrimitiveNode, AuraSceneNode, AuraSceneSnapshot, AuraVec3, WebGLRenderController } from "../nodes/types.js";
import type { AuraReadinessOptions, AuraReadyOutcome, AuraRenderTermination } from "../nodes/types/runtime.js";
import { declaresWebGLContent, productionRenderErrorMessage } from "../compiler/observations.js";
import { createDiagnosticsOverlay, renderDiagnosticPreviewToCanvas, shouldRenderOverlay } from "../public/devtools.js";
import { createInitialDiagnostics, snapshotDiagnostics, validateSceneAssets } from "../diagnostics.js";
import { assertScenePhysicsPivotSupport, createRuntimeScenePhysicsWithAccess, expandInstancePhysicsNodes, instanceTransformFromPhysics, fixedModelBoundsPhysicsGuard, nodePhysicsPosition, pivotPhysicsColliderSync, nodePositionFromPhysics, nodeRotationQuaternion, offsetPhysicsPosition, resolveNodePhysicsOffset, resolveNodePhysicsShape, writeNodeRotationFromBody } from "../nodes/physics-core.js";
import { hasNonzeroPivot } from "../pivotGuard.js";
import { colorToLinearRgba } from "../colorUtils.js";
import { scene } from "../nodes/scene.js";
import { createComputeSurface, type AuraComputeDeviceSource } from "../nodes/compute.js";
import { devicePixelRatioSafe, markTiming, performanceNow } from "../platform.js";
import { renderer } from "../rendererDiagnostics.js";
import { collectAuraSceneEvidence } from "../sceneEvidence.js";
import { animatedPosition, animatedRotation, normalizeSceneSnapshot, scaleToVec3 } from "../sceneMath.js";
import { configureCanvas, resolveCanvas } from "./canvas.js";
import { resolveAppOutputColorPolicy } from "./colorManagement.js";
import { mountFailureConsoleMessage } from "./mountFailure.js";
import { appTierMaxPixelRatio, currentDevicePixelRatio, minimumBackingSize, resolveAppPixelRatio } from "./pixelRatio.js";
import { resolveMountQuality } from "../compiler/renderer.js";
import { clearAdvancedLightingScene } from "./advancedLightingState.js";
import { AuraRuntimeError } from "./errors.js";
import { AuraMigrationError } from "../compiler/errors.js";
import { createFrameRateMeter, startProductionRender } from "./frameLoop.js";
import { isDirectRenderPath, vetoDirectPath } from "./renderPath.js";
import { registerAuraApp, unregisterAuraApp } from "./liveApps.js";
import { markRouteError, markRouteReady } from "./routeState.js";
import { AURA_APP_CANVAS, captureAuraScreenshot } from "./screenshot.js";
import { attachErrorOverlay } from "./errorOverlay.js";
import { collectGameRuntimeEvidence as collectGameRuntimeEvidenceV105 } from "../GameEvidence.js";
import { createGameInput, round } from "../GameRuntimeCore.js";
import { createPhysicsRuntime, type AuraPhysicsRuntime } from "../PhysicsRuntime.js";
import { applyRootParticleQuality, hasRootRenderableContent, initializeRootPerformanceQuality, readRootDiagnosticSnapshot, registerManagedRootApp, reserveRootCanvas, setRootPerformanceQuality, supportsRootParticleQuality, validateRootPerformanceQuality } from "../RootRuntimeSupport.js";
import type { PhysicsWorldAccess } from "../physics/PhysicsWorldAccess.js";
import { normalizeCreateAppRendererOptions, rendererQualityWarnings } from "./rendererOptions.js";
import { qrFlagsWithAnimationMixer, resolveQrFlags } from "../../contracts/flags.js";
import { clearTypedGLBActorQrFlags, setTypedGLBActorQrFlags } from "../../production-runtime/actor/extensions.js";
import { bindActorAnimationContext, createActorAnimationContext, disposeActorAnimationContext } from "./actorAnimationHandle.js";
import { setWorldBuilderFlags } from "../world/flags.js";
import { appExtensionsAll } from "../../contracts/app.js";
import { snapshotAuraAssetsOption } from "./assetsOptionSnapshot.js";
import { diagnosticsSectionsAll } from "../../contracts/diagnostics.js";
import type { AuraQualityTier } from "@aura3d/rendering/contracts";
import { bindShaderFailureStore, createShaderFailureStore, RenderDeviceError, setShaderFailureMode } from "@aura3d/rendering";
import { createAuraRuntimeNodeRegistry, prepareRuntimeNodeWorldPose, runtimeNodeHandleForSceneNode, runtimeNodeParentedTransform } from "./runtimeNodes.js";
import { setPrd01ModelMatrixCache } from "../compiler/renderInput.js";
import { createModelMatrixCache, decomposeMatrix } from "../sceneGraph.js";
import { flattenAuraSceneNodes, flattenNodesWithLineWorldMatrices, modelMatrixFor, parentTransformOf, worldTransformOf } from "../compiler/sceneGraph.js";
import { flattenTaggingMountedRoots } from "../compiler/mountedRoots.js";
import { setPrd01ColorParsing } from "../compiler/color.js";
import { collectGeneratedCodeWarnings } from "../looks/generatedCodeWarnings.js";
import { material } from "../nodes/material.js";
import { assets } from "../AssetDecoders.js";
import { bindAppAssetEventScope, createAppAssetEventScope, unbindAppAssetEventScope } from "../assetEvents.js";
import { bindAtmosphereRuntimeOwner, disposeAtmosphereExtension } from "../vfx/atmosphere-api.js";
import { bindPrd07AppRuntimeOwner, disposePrd07SystemFor, prd07MountAuthorityFor, prd07SystemFor } from "../vfx/effects-api.js";
import type { Prd07MountAuthority } from "../vfx/bridge.js";
import { sanitizeDiagnosticText, sanitizeDiagnosticValue } from "../sanitizeDiagnostics.js";
import { createAuraXRRuntime } from "../xr/xrRuntime.js";
import type { AuraXRDeviceBridge } from "../xr/types.js";
import { createWorkerRootApp } from "./workerRootApp.js";
import { workerCanvasTransferAttempted } from "./workerRuntime.js";

type ReadinessStage = "renderer" | "first-frame";
type ReadyBackend = "webgl2" | "webgpu";

function managedCanvasInUse(): RenderDeviceError {
  return new RenderDeviceError(
    "WEBGPU_CANVAS_IN_USE: The canvas is already owned by a managed renderer; a WebGPU or auto app cannot share it.",
    "WEBGPU_CANVAS_IN_USE"
  );
}

/** The synchronous and idle paths can report the same nested cleanup error. */
/** True when `error` (or, for an aggregate, each of its members) is already
 * one of `failures` or nested in a reported aggregate. */
function cleanupFailureReported(failures: readonly unknown[], error: unknown): boolean {
  const reported = (target: unknown): boolean => {
    const visited = new Set<unknown>();
    const contains = (candidate: unknown): boolean => {
      if (Object.is(candidate, target)) return true;
      if (visited.has(candidate)) return false;
      visited.add(candidate);
      try { return candidate instanceof AggregateError && candidate.errors.some(contains); } catch { return false; }
    };
    return failures.some(contains);
  };
  if (reported(error)) return true;
  try {
    return error instanceof AggregateError && error.errors.length > 0 && error.errors.every(reported);
  } catch { return false; }
}

/** Non-aggregate failures nested in `error` (cycle-safe). */
function cleanupFailureLeaves(error: unknown): unknown[] {
  const leaves: unknown[] = [];
  const visited = new Set<unknown>();
  const visit = (candidate: unknown): void => {
    if (visited.has(candidate)) return;
    visited.add(candidate);
    let children: readonly unknown[] | undefined;
    try { children = candidate instanceof AggregateError && Array.isArray(candidate.errors) && candidate.errors.length ? candidate.errors : undefined; }
    catch { children = undefined; }
    if (children) children.forEach(visit);
    else leaves.push(candidate);
  };
  visit(error);
  return leaves;
}

function distinctCleanupFailures(failures: readonly unknown[]): unknown[] {
  const seen = new Set<unknown>();
  const active = new Set<unknown>();
  const visited: unknown[] = [];
  const visit = (error: unknown): { error: unknown } | undefined => {
    // An ancestor reference is a cycle, not an already-reported sibling.
    if (active.has(error)) return { error };
    if (seen.has(error)) return undefined;
    seen.add(error);
    visited.push(error);
    const childrenStart = visited.length;
    try {
      if (!(error instanceof AggregateError)) return { error };
      active.add(error);
      const errors = error.errors;
      const entries = errors.map(visit).filter((entry): entry is { error: unknown } => entry !== undefined);
      if (errors.length > 0 && entries.length === 0) return undefined;
      if (entries.length === errors.length && entries.every((entry, index) => Object.is(entry.error, errors[index]))) {
        return { error };
      }
      return { error: new AggregateError(entries.map((entry) => entry.error), error.message, { cause: error.cause }) };
    } catch {
      // A disposer may throw an opaque proxy or an aggregate with throwing
      // accessors. Preserve it, and do not suppress siblings visited before
      // inspection failed.
      for (const child of visited.splice(childrenStart)) seen.delete(child);
      return { error };
    } finally {
      active.delete(error);
    }
  };
  return failures.map(visit).filter((entry): entry is { error: unknown } => entry !== undefined).map((entry) => entry.error);
}

/** One mount owns its own waiters; superseding it must settle them immediately. */
function createMountReadiness() {
  const deferred = () => {
    let resolve!: (outcome: AuraReadyOutcome) => void;
    let settled = false;
    const promise = new Promise<AuraReadyOutcome>((done) => { resolve = done; });
    return {
      promise,
      settle(outcome: AuraReadyOutcome) {
        if (settled) return;
        settled = true;
        resolve(outcome);
      }
    };
  };
  const renderer = deferred();
  const firstFrame = deferred();
  return {
    renderer,
    firstFrame,
    settle(outcome: AuraReadyOutcome) { renderer.settle(outcome); firstFrame.settle(outcome); }
  };
}

function waitForReadiness(result: Promise<AuraReadyOutcome>, signal?: AbortSignal): Promise<AuraReadyOutcome> {
  if (!signal) return result;
  if (signal.aborted) return Promise.resolve({ state: "cancelled" });
  return new Promise((resolve) => {
    const abort = () => { signal.removeEventListener("abort", abort); resolve({ state: "cancelled" }); };
    signal.addEventListener("abort", abort, { once: true });
    void result.then((outcome) => { signal.removeEventListener("abort", abort); resolve(outcome); });
    // Abort may race registration for a foreign AbortSignal implementation.
    if (signal.aborted) abort();
  });
}

function readinessErrorCode(error: unknown, fallback = "renderer-mount-failed"): string {
  try {
    const code = (error as { code?: unknown } | null)?.code;
    if (typeof code === "string" && /^[\w.-]{1,80}$/.test(code)) return code;
  } catch { /* A hostile error getter is not a reason to lose readiness. */ }
  return fallback;
}

/** Restrict a bridge authority to one app mount, even if the bridge survives a remount. */
function scopePrd07MountAuthority(
  authority: Prd07MountAuthority,
  signal: AbortSignal,
  isCurrentMount: () => boolean
): Prd07MountAuthority {
  const isLive = (): boolean => isCurrentMount() && authority.isLive();
  const scoped: Prd07MountAuthority = {
    owner: authority.owner,
    canvas: authority.canvas,
    overlay: authority.overlay,
    isLive,
    capture: () => isLive() ? authority.capture() : null,
    isCurrent: (snapshot) => isLive() && authority.isCurrent(snapshot),
    onChange: (listener) => {
      if (!isLive()) return () => {};
      let subscribed = true;
      const unsubscribe = authority.onChange(() => { if (isLive()) listener(); });
      const offRevoke = scoped.onRevoke(() => { if (subscribed) { subscribed = false; unsubscribe(); } });
      return () => {
        offRevoke();
        if (subscribed) { subscribed = false; unsubscribe(); }
      };
    },
    onRevoke: (listener) => {
      let subscribed = true;
      let offAuthority: (() => void) | undefined;
      const release = (): void => {
        if (!subscribed) return;
        subscribed = false;
        signal.removeEventListener("abort", revoke);
        offAuthority?.();
        offAuthority = undefined;
      };
      const revoke = (): void => {
        if (!subscribed) return;
        release();
        listener();
      };
      if (!isLive()) { revoke(); return () => {}; }
      signal.addEventListener("abort", revoke, { once: true });
      try {
        const off = authority.onRevoke(revoke);
        if (subscribed) offAuthority = off;
        else off(); // The underlying authority may revoke during registration.
      } catch (error) { release(); throw error; }
      if (!isLive()) revoke();
      return release;
    },
    noteCamera: (x, y, z, fx, fy, fz) => {
      if (!isLive()) throw new Error("PRD07_APP_AUTHORITY_REVOKED");
      authority.noteCamera(x, y, z, fx, fy, fz);
    }
  };
  return Object.freeze(scoped);
}

/** @internal Bind an app and every physics world it owns to this access. */
export function createAuraAppWithPhysicsWorldAccess(
  physicsAccess: PhysicsWorldAccess,
  target: AuraAppTarget,
  options: AuraCreateAppOptions,
  admissionFailure?: RenderDeviceError
): AuraApp {
  // Reject invalid presentation policy before any canvas/context acquisition.
  resolveAppOutputColorPolicy({ ...options.renderer?.output, ...options.output });
  if (options.worker !== undefined) {
    // A worker transfers the canvas, even when it selects WebGL. Reserve
    // before transfer and keep the reservation for the lifetime of that
    // transferred canvas (which cannot be transferred back to the page).
    const workerCanvas = resolveCanvas(target);
    const reservation = workerCanvas && !workerCanvasTransferAttempted(workerCanvas)
      ? reserveRootCanvas(workerCanvas, {}, true) : undefined;
    if (workerCanvas && !reservation) {
      return createAuraAppWithPhysicsWorldAccess(physicsAccess, workerCanvas, { ...options, worker: undefined }, managedCanvasInUse());
    }
    let result: ReturnType<typeof createWorkerRootApp>;
    try {
      result = createWorkerRootApp(workerCanvas ?? target, options);
    } catch (error) {
      if (!workerCanvas || !workerCanvasTransferAttempted(workerCanvas)) reservation?.release();
      throw error;
    }
    if (result.kind === "worker") return result.app;
    reservation?.release();
    const app = createAuraAppWithPhysicsWorldAccess(physicsAccess, result.target, { ...options, worker: undefined });
    Object.defineProperty(app, "execution", {
      value: { requested: "worker", active: "main-thread", fallbackReason: result.reason },
      enumerable: true
    });
    return app;
  }
  // Authentication generations belong to this app, not to mutable caller
  // options. Capture and validate before acquiring a canvas or mounting.
  const assetOptions = snapshotAuraAssetsOption(options.assets);
  // Keep this app's registry selection stable across asynchronous remounts.
  const formatRegistry = options.formatRegistry;
  // T0-12: mount-phase timing marks consumed by the bench harness's
  // payload.extra.mountTiming (see markTiming in ./platform).
  markTiming("a3d:mount:create-app-start");
  let snapshot = normalizeSceneSnapshot(options.scene);
  /*
   * One top-level node at a time, so the compiled scene can find the children of a mounted group or look by the group's
   * runtime id (`app.nodes.remove`). The concatenation is the same node list as flattening the whole list at once.
   */
  const flattenForRender = (scene: AuraSceneSnapshot, hierarchical: boolean): AuraSceneSnapshot => ({
    ...scene,
    nodes: flattenTaggingMountedRoots(scene.nodes, hierarchical && qrFlags.on("A3D_QR_CORE")
      ? (nodes, options) => flattenAuraSceneNodes(nodes, qrFlags, options)
      : flattenNodesWithLineWorldMatrices)
  });
  // Select the graph path only after flags resolve. A speculative legacy
  // flatten can reject a hierarchy that the hierarchical path supports.
  let renderSnapshot: AuraSceneSnapshot;
  const rendererSelection = normalizeCreateAppRendererOptions(options.renderer);
  // PR 0 seams (CONTRACTS.md §3.2): flag resolution, C-27 quality-tier resolve, C-38
  // app-extension mount and C-31 diagnostics sections are fixed call sites owned by PRD 15.
  // C-38 source chain (contracts/flags.ts §source order): `qualityRebuild.flags`
  // wins over URL `?a3d-qr=` — `resolveQrFlags` applies options first and
  // `setEntry` never overwrites an earlier key. URL flags apply unless the app
  // opts out (`allowUrlFlags:false`); without this the `a3d-qr` param was dead
  // for every app — lane extensions, actor sources and clip-drive all gated on
  // the resolved flags and silently ran flag-off under `?a3d-qr=animation`.
  const qrFlags = qrFlagsWithAnimationMixer(
    resolveQrFlags({
      options: options.qualityRebuild?.flags,
      url: options.qualityRebuild?.allowUrlFlags === false
        ? undefined
        : typeof location !== "undefined" ? location.href : undefined
    }),
    options.animation?.mixer
  );
  // T4.5 (PRD-15): strict callers receive the migration error before a
  // physics-declaring app allocates either of its worlds.
  if ((options.strict ?? qrFlags.on("A3D_QR_STRICT")) && options.renderer) {
    const removed: string[] = [];
    if (options.renderer.mode !== undefined) removed.push("renderer.mode");
    if (options.renderer.fallback !== undefined) removed.push("renderer.fallback");
    if (removed.length > 0) {
      throw new AuraMigrationError({ removedApi: removed.join(" + "), replacement: "renderer.quality", prd: 15 });
    }
  }
  assertScenePhysicsPivotSupport(snapshot.nodes);
  renderSnapshot = flattenForRender(snapshot, true);

  // Stage declared bodies before acquiring app resources or changing a mounted
  // scene. In particular, an unready provider or a throwing constructor must
  // leave an existing scene, its handles and bodies untouched.
  type World = InstanceType<ReturnType<PhysicsWorldAccess["requireReady"]>>;
  type NodeBinding = { readonly runtimeId: string; readonly node: AuraModelNode | AuraPrimitiveNode; readonly worldScale: readonly [number, number, number]; readonly pivot?: AuraVec3; readonly modelOffset?: AuraVec3 };
  type ModelBoundsBinding = {
    readonly node: AuraModelNode;
    readonly source: AuraModelNode;
    readonly runtimeId?: string;
    readonly worldScale: AuraVec3;
    readonly offset: AuraVec3;
    readonly type: "static" | "kinematic" | "dynamic";
  };
  let appPhysicsWorldInstance: World | undefined;
  let appPhysicsInstance: AuraPhysicsRuntime | undefined;
  const appPhysicsNodeNames = new Map<number, string>();
  const appPhysicsNodeBindings = new Map<number, NodeBinding>();
  const appPhysicsPivotGuards = new Map<number, () => void>();
  const appPhysicsPivotKinematics = new Map<number, AuraModelNode | AuraPrimitiveNode>();
  type ColliderSync = { readonly node: AuraModelNode | AuraPrimitiveNode; readonly runtimeId?: string; readonly prepare: NonNullable<ReturnType<typeof pivotPhysicsColliderSync>> };
  const appPhysicsColliderSyncs = new Map<number, ColliderSync>();
  const appPhysicsModelBounds = new Map<number, ModelBoundsBinding>();
  // Numeric body identities, rather than only node names, keep an older subtree
  // distinct from a same-id replacement published during a removal callback.
  const appPhysicsBodyOwners = new Map<number, readonly string[]>();
  const retiringDeclaredBodyIds = new Set<number>();
  let appDeclaredBodyIds = new Set<number>();
  /**
   * S5-WP19-04: one body per instance of an instanced physics node. A batch
   * remembers the `instances` array (and batch pose) its bodies were built
   * from; `setInstances` replaces that array, so the next step or query
   * rebuilds the batch's bodies (add/remove/update), and retirement of the
   * owning runtime node releases all of them.
   */
  type InstanceBatch = {
    readonly live: AuraModelNode | AuraPrimitiveNode;
    readonly flat: AuraModelNode | AuraPrimitiveNode;
    readonly owners: readonly string[];
    bodyIds: number[];
    builtInstances: AuraModelNode["instances"];
    builtPose: string;
  };
  const appPhysicsInstanceBatches = new Set<InstanceBatch>();
  const appPhysicsInstanceBodies = new Map<number, { readonly batch: InstanceBatch; readonly node: AuraModelNode | AuraPrimitiveNode; readonly offset?: AuraVec3 }>();
  const instanceBatchPoseKey = (node: AuraModelNode | AuraPrimitiveNode): string =>
    JSON.stringify([node.position ?? null, node.rotation ?? null, node.rotationOrder ?? null, node.quaternion ?? null, node.scale ?? null]);
  const retireInstanceBatches = (matches: (batch: InstanceBatch) => boolean): void => {
    for (const batch of [...appPhysicsInstanceBatches]) if (matches(batch)) appPhysicsInstanceBatches.delete(batch);
  };
  /** Create one body + collider per instance of a batch's current `instances`. */
  const createInstanceBatchBodies = (world: World, batch: InstanceBatch): number[] => {
    const current = batch.live === batch.flat ? batch.live : { ...batch.flat, instances: batch.live.instances } as AuraModelNode | AuraPrimitiveNode;
    const created: number[] = [];
    try {
      for (const node of expandInstancePhysicsNodes(current) ?? []) {
        const spec = node.physics!;
        const offset = resolveNodePhysicsOffset(node);
        const body = world.createRigidBody({
          type: spec.type ?? "dynamic",
          position: nodePhysicsPosition(node, offset),
          rotation: nodeRotationQuaternion(node),
          ...(spec.mass === undefined ? {} : { mass: spec.mass }),
          ...(spec.friction === undefined ? {} : { friction: spec.friction }),
          ...(spec.restitution === undefined ? {} : { restitution: spec.restitution })
        });
        created.push(body.id);
        world.createCollider(body, {
          shape: resolveNodePhysicsShape(node, spec),
          ...(spec.sensor === undefined ? {} : { sensor: spec.sensor }),
          material: { friction: spec.friction ?? 0.5, restitution: spec.restitution ?? 0 }
        });
        appDeclaredBodyIds.add(body.id);
        appPhysicsBodyOwners.set(body.id, batch.owners);
        if (node.name) appPhysicsNodeNames.set(body.id, node.name);
        appPhysicsInstanceBodies.set(body.id, { batch, node, ...(offset ? { offset } : {}) });
      }
    } catch (error) {
      for (const id of created) {
        try { world.removeRigidBody(id); } catch { /* already gone */ }
        appDeclaredBodyIds.delete(id); appPhysicsBodyOwners.delete(id); appPhysicsNodeNames.delete(id); appPhysicsInstanceBodies.delete(id);
      }
      throw error;
    }
    return created;
  };
  /** Rebuild the bodies of every batch whose instances (or batch pose) changed since they were built. */
  const syncInstanceBatches = (): void => {
    for (const batch of appPhysicsInstanceBatches) {
      const pose = batch.live === batch.flat ? instanceBatchPoseKey(batch.live) : batch.builtPose;
      if (batch.live.instances === batch.builtInstances && pose === batch.builtPose) continue;
      const world = appPhysicsWorld();
      const next = createInstanceBatchBodies(world, batch);
      const previous = batch.bodyIds;
      batch.bodyIds = next;
      batch.builtInstances = batch.live.instances;
      batch.builtPose = pose;
      retireDeclaredBodies(previous);
    }
  };
  const appPhysicsWorld = (): World => {
    if (appPhysicsWorldInstance === undefined) {
      const WorldConstructor = physicsAccess.requireReady();
      appPhysicsWorldInstance = new WorldConstructor({
        gravity: options.physics?.gravity ? [...options.physics.gravity] : [0, -9.81, 0],
        fixedDelta: 1 / 60,
        enableSleeping: true,
        ...(options.physics?.seed === undefined ? {} : { seed: options.physics.seed }),
        ...(options.physics?.continuousCollision ? { continuousCollision: options.physics.continuousCollision } : {})
      });
    }
    return appPhysicsWorldInstance;
  };
  type PhysicsSource = { readonly node: AuraSceneNode; readonly owners: readonly string[]; readonly parented: boolean; readonly lookAt: boolean };
  const sourceOwnership = (nodes: readonly AuraSceneNode[], prefix: readonly string[] = []): PhysicsSource[] => {
    const entries: PhysicsSource[] = [];
    const visit = (node: AuraSceneNode, ancestors: readonly string[], parented: boolean, inheritedLookAt: boolean): void => {
      const id = "runtime" in node ? node.runtime?.id : undefined;
      const owners = id === undefined || ancestors.includes(id) ? ancestors : [...ancestors, id];
      const lookAt = inheritedLookAt || ("lookAt" in node && node.lookAt !== undefined);
      if (node.kind === "group") {
        for (const child of node.children) visit(child, owners, true, lookAt);
        return;
      }
      // Only authored physics leaves need ownership. Do not invoke a look
      // lowerer a second time just to count unrelated rendered nodes.
      if ((node.kind === "model" || node.kind === "primitive") && node.physics) entries.push({ node, owners, parented, lookAt });
    };
    for (const node of nodes) visit(node, prefix, prefix.length > 0, false);
    return entries;
  };
  const subtreeRuntimeIds = (node: AuraSceneNode): string[] => {
    const result = new Set<string>();
    const visit = (entry: AuraSceneNode): void => {
      const id = "runtime" in entry ? entry.runtime?.id : undefined;
      if (id !== undefined) result.add(id);
      if (entry.kind === "group") for (const child of entry.children) visit(child);
    };
    visit(node);
    return [...result];
  };
  const retireDeclaredBodies = (ids: Iterable<number>): void => {
    const failures: unknown[] = [];
    for (const id of ids) {
      if (!appDeclaredBodyIds.has(id) || retiringDeclaredBodyIds.has(id)) continue;
      const world = appPhysicsWorldInstance;
      retiringDeclaredBodyIds.add(id);
      try {
        try { world?.removeRigidBody(id); } catch (error) { failures.push(error); }
        // A backend may throw after removing the body. Do not retain stale
        // names or bindings in that case, and never touch programmatic IDs.
        try {
          if (!world?.getBody(id)) {
            appDeclaredBodyIds.delete(id);
            appPhysicsBodyOwners.delete(id);
            appPhysicsNodeNames.delete(id);
            appPhysicsNodeBindings.delete(id);
            appPhysicsPivotGuards.delete(id);
            appPhysicsPivotKinematics.delete(id);
            appPhysicsColliderSyncs.delete(id);
            appPhysicsModelBounds.delete(id);
            const instance = appPhysicsInstanceBodies.get(id);
            if (instance) instance.batch.bodyIds = instance.batch.bodyIds.filter((bodyId) => bodyId !== id);
            appPhysicsInstanceBodies.delete(id);
          }
        } catch (error) { failures.push(error); }
      } finally {
        retiringDeclaredBodyIds.delete(id);
      }
    }
    if (failures.length) throw new AggregateError(failures, "Could not retire declared physics bodies.");
  };
  const stageDeclaredBodies = (
    candidate: AuraSceneSnapshot,
    sourceNodes: readonly AuraSceneNode[],
    incremental?: { readonly prefix: readonly string[]; readonly replaceIds: readonly string[] }
  ) => {
    // Resolve all scene-side descriptors before allocating or mutating a world.
    assertScenePhysicsPivotSupport(sourceNodes);
    const stagedInstanceBatches: InstanceBatch[] = [];
    const physicsNodes = candidate.nodes.filter((node) => (node.kind === "model" || node.kind === "primitive") && node.physics);
    const sources = physicsNodes.length
      ? sourceOwnership(sourceNodes, incremental?.prefix)
      : [];
    if (sources.length !== physicsNodes.length || sources.some((entry, index) => {
      const flat = physicsNodes[index];
      return !flat || entry.node.kind !== flat.kind || !("physics" in entry.node) || !("physics" in flat) || entry.node.physics !== flat.physics;
    })) {
      throw new Error("PHYSICS_SOURCE_OWNERSHIP_MISMATCH: flattened physics nodes do not match their authored declarations.");
    }
    const descriptors = physicsNodes.flatMap((batchNode, index) => {
      if ((batchNode.kind !== "model" && batchNode.kind !== "primitive") || !batchNode.physics) return [];
      const source = sources[index]!;
      // S5-WP19-04: an instanced node gets one body per instance. The live
      // node is the one whose `instances` the runtime handle replaces.
      const live = (incremental ? source.node : batchNode) as AuraModelNode | AuraPrimitiveNode;
      const expanded = expandInstancePhysicsNodes(batchNode);
      const batch: InstanceBatch | undefined = expanded
        ? { live, flat: batchNode, owners: source.owners, bodyIds: [], builtInstances: live.instances, builtPose: instanceBatchPoseKey(live) }
        : undefined;
      if (batch) stagedInstanceBatches.push(batch);
      return (expanded ?? [batchNode]).map((node) => {
      if (qrFlags.on("A3D_QR_CORE") && source.parented && source.lookAt) {
        throw new Error("PARENTED_LOOK_AT_UNSUPPORTED: live parented look-at physics is not supported.");
      }
      // The hierarchical renderer carries a full matrix when ancestor scale and
      // rotation produce shear, but its flattened TRS fields cannot represent
      // that matrix. A rigid body would otherwise be seeded with a different
      // orientation/shape than the rendered node. A singular or non-finite
      // world basis also cannot produce a valid body quaternion. Reject these
      // cases before allocating or mutating the app's physics world. Preserve
      // existing reflected-collider handling: manually specified symmetric
      // shapes can still have meaningful behavior under a mirrored visual.
      const worldTransform = worldTransformOf(batchNode);
      if (worldTransform && (worldTransform.sheared ||
          !worldTransform.matrix.every(Number.isFinite) ||
          !worldTransform.quaternion.every(Number.isFinite) ||
          worldTransform.scale.some((value) => !Number.isFinite(value) || value === 0))) {
        throw new RangeError("PHYSICS_UNSUPPORTED_WORLD_TRANSFORM: a declared physics node has a sheared, singular, or non-finite world transform.");
      }
      const spec = node.physics!;
      const modelOffset = resolveNodePhysicsOffset(node);
      const authored = source.node as AuraModelNode | AuraPrimitiveNode;
      if (modelOffset && !qrFlags.on("A3D_QR_CORE") &&
          (authored.quaternion !== undefined || (authored.rotationOrder !== undefined && authored.rotationOrder !== "ZYX"))) {
        throw new RangeError("MODEL_COLLIDER_UNSUPPORTED_TRANSFORM: legacy model rendering cannot match quaternion or non-default Euler physics.");
      }
      const parent = modelOffset && (spec.type ?? "dynamic") !== "static" ? parentTransformOf(batchNode) : undefined;
      if (modelOffset && source.parented && (spec.type ?? "dynamic") !== "static" && worldTransform &&
          worldTransform.scale.some((value) => value <= 0)) {
        throw new RangeError("MODEL_COLLIDER_UNSUPPORTED_PARENT: moving parented models cannot use reflected world transforms.");
      }
      if (parent) {
        const transform = decomposeMatrix(parent.parentWorldMatrix);
        const [x, y, z] = transform.scale;
        const same = (a: number, b: number) => Math.abs(a - b) <= 1e-4 * Math.max(1e-12, Math.abs(a), Math.abs(b));
        if (transform.sheared || !parent.parentWorldMatrix.every(Number.isFinite) ||
            transform.scale.some((value) => !Number.isFinite(value) || value <= 0) || !same(x, y) || !same(y, z)) {
          throw new RangeError("MODEL_COLLIDER_UNSUPPORTED_PARENT: moving model bodies require a finite, positive, uniform-scale parent.");
        }
      }
      const runtimeId = batchNode.runtime?.id;
      if (modelOffset && node.kind === "model" && (spec.type ?? "dynamic") !== "static" && options.physics?.bindNodes === true && runtimeId === undefined) {
        throw new RangeError("MODEL_COLLIDER_UNBOUND: a bound moving model requires a runtime node id.");
      }
      const rotation = nodeRotationQuaternion(node);
      const shape = resolveNodePhysicsShape(node, spec);
      const position = nodePhysicsPosition(node, modelOffset);
      return { node, source, spec, rotation, shape, position, modelOffset, batch };
      });
    });
    const ids = new Set<number>();
    const names = new Map<number, string>();
    const bindings = new Map<number, NodeBinding>();
    const pivotGuards = new Map<number, () => void>();
    const colliderSyncs = new Map<number, ColliderSync>();
    const pivotKinematics = new Map<number, AuraModelNode | AuraPrimitiveNode>();
    const modelBounds = new Map<number, ModelBoundsBinding>();
    const owners = new Map<number, readonly string[]>();
    const instanceBodies = new Map<number, { readonly batch: InstanceBatch; readonly node: AuraModelNode | AuraPrimitiveNode; readonly offset?: AuraVec3 }>();
    const hadWorld = appPhysicsWorldInstance !== undefined;
    let world: World | undefined;
    let active = true;
    const rollback = (): void => {
      if (!active) return;
      active = false;
      if (!world) return;
      const failures: unknown[] = [];
      for (const id of [...ids].reverse()) {
        try { world.removeRigidBody(id); } catch (error) { failures.push(error); }
      }
      // A callback may have created an unrelated body while the staged world
      // was being built. Dispose a new world only if it is still empty.
      if (!hadWorld && world.bodies().length === 0 && appPhysicsWorldInstance === world && appPhysicsInstance === undefined) {
        try { world.dispose(); } catch (error) { failures.push(error); }
        finally { appPhysicsWorldInstance = undefined; }
      }
      if (failures.length) throw new AggregateError(failures, "Could not remove staged physics bodies.");
    };
    try {
      if (descriptors.length > 0) world = appPhysicsWorld();
      for (const { node, source, spec, rotation, shape, position, modelOffset, batch } of descriptors) {
        const body = world!.createRigidBody({
          type: spec.type ?? "dynamic",
          position,
          rotation,
          ...(spec.mass === undefined ? {} : { mass: spec.mass }),
          ...(spec.friction === undefined ? {} : { friction: spec.friction }),
          ...(spec.restitution === undefined ? {} : { restitution: spec.restitution })
        });
        ids.add(body.id);
        world!.createCollider(body, {
          shape,
          ...(spec.sensor === undefined ? {} : { sensor: spec.sensor }),
          material: { friction: spec.friction ?? 0.5, restitution: spec.restitution ?? 0 }
        });
        owners.set(body.id, source.owners);
        if (node.name) names.set(body.id, node.name);
        if (batch) {
          // Per-instance bodies are synchronized through their batch (syncInstanceBatches / syncBoundNodes).
          batch.bodyIds.push(body.id);
          instanceBodies.set(body.id, { batch, node, ...(modelOffset ? { offset: modelOffset } : {}) });
          continue;
        }
        const bindingNode = (incremental ? source.node : node) as AuraModelNode | AuraPrimitiveNode;
        const modelGuard = fixedModelBoundsPhysicsGuard(source.node as AuraModelNode | AuraPrimitiveNode);
        const flatModelGuard = source.node === node ? undefined : fixedModelBoundsPhysicsGuard(node);
        if (modelGuard || flatModelGuard) {
          pivotGuards.set(body.id, () => { modelGuard?.(); flatModelGuard?.(); });
        }
        const runtimeId = (node as { readonly runtime?: { readonly id?: string } }).runtime?.id;
        // Pivot, scale, size or geometry edits rebuild this body's collider before the next step.
        const prepareCollider = pivotPhysicsColliderSync(bindingNode);
        if (prepareCollider) colliderSyncs.set(body.id, { node: bindingNode, ...(runtimeId === undefined ? {} : { runtimeId }), prepare: prepareCollider });
        if (hasNonzeroPivot(bindingNode.pivot) && options.physics?.bindNodes === true && runtimeId !== undefined && spec.type === "kinematic") {
          pivotKinematics.set(body.id, bindingNode);
        }
        if (options.physics?.bindNodes === true && runtimeId !== undefined && (spec.type ?? "dynamic") === "dynamic") {
          // Initial app handles own flattened nodes; runtime additions own the
          // original subtree node registered by the compiled add path.
          const scale = typeof node.scale === "number" ? [node.scale, node.scale, node.scale] as const : node.scale ?? [1, 1, 1] as const;
          // A primitive's custom-geometry collider centre is resolved from the live node.
          bindings.set(body.id, { runtimeId, node: bindingNode, worldScale: [scale[0], scale[1], scale[2]], ...(modelOffset && node.kind === "model" ? { modelOffset } : {}),
            ...(hasNonzeroPivot(bindingNode.pivot) ? { pivot: [...bindingNode.pivot!] as AuraVec3 } : {}) });
        }
        if (modelOffset && node.kind === "model" && source.node.kind === "model") {
          const scale = scaleToVec3(node.scale);
          modelBounds.set(body.id, {
            node, source: source.node, ...(runtimeId === undefined ? {} : { runtimeId }),
            worldScale: [scale[0], scale[1], scale[2]], offset: modelOffset, type: spec.type ?? "dynamic"
          });
        }
      }
    } catch (error) {
      try { rollback(); } catch (cleanupError) { throw new AggregateError([error, cleanupError], "Could not stage or roll back scene physics."); }
      throw error;
    }
    return {
      rollback,
      commit(isCurrent: () => boolean = () => true): boolean {
        if (!active) return false;
        if (!isCurrent()) { rollback(); return false; }
        const replaced = incremental
          ? [...appPhysicsBodyOwners].filter(([, paths]) => paths.some((id) => incremental.replaceIds.includes(id))).map(([id]) => id)
          : [...appDeclaredBodyIds];
        retireDeclaredBodies(replaced);
        retireInstanceBatches((batch) => !incremental || batch.owners.some((id) => incremental.replaceIds.includes(id)));
        // Retiring an older body may synchronously publish a newer subtree.
        // It owns the runtime ID now, so discard this staged generation.
        if (!isCurrent()) { rollback(); return false; }
        for (const id of ids) appDeclaredBodyIds.add(id);
        for (const [id, paths] of owners) appPhysicsBodyOwners.set(id, paths);
        for (const [id, name] of names) appPhysicsNodeNames.set(id, name);
        for (const [id, binding] of bindings) appPhysicsNodeBindings.set(id, binding);
        for (const [id, guard] of pivotGuards) appPhysicsPivotGuards.set(id, guard);
        for (const [id, sync] of colliderSyncs) appPhysicsColliderSyncs.set(id, sync);
        for (const [id, node] of pivotKinematics) appPhysicsPivotKinematics.set(id, node);
        for (const [id, binding] of modelBounds) appPhysicsModelBounds.set(id, binding);
        for (const [id, instance] of instanceBodies) appPhysicsInstanceBodies.set(id, instance);
        for (const batch of stagedInstanceBatches) appPhysicsInstanceBatches.add(batch);
        active = false;
        return true;
      }
    };
  };
  stageDeclaredBodies(renderSnapshot, snapshot.nodes).commit();

  let initialRuntimePhysics: ReturnType<typeof createRuntimeScenePhysicsWithAccess>;
  // The first mount starts before the public app object exists. Reserve the
  // unique owner before examining canvas sources, then bind the app below.
  const runtimeOwner: object = {};
  let rootAppRegistration: ReturnType<typeof registerManagedRootApp> | undefined;
  let canvasAdmission: ReturnType<typeof reserveRootCanvas>;
  let canvasAdmissionError: RenderDeviceError | undefined;
  let canvasAdmissionQuarantined = false;
  let canvasAdmissionExclusive = false;
  let releaseAdmissionAfterStartupFailure: (() => void) | undefined;
  const canvas = (() => {
    try {
      const resolved = resolveCanvas(target);
      if (resolved) {
        const exclusive = options.renderer?.backend === "webgpu" || options.renderer?.backend === "auto"
          || (options.renderer?.backend === undefined && options.renderer?.qualityProfile === "experimental-webgpu");
        canvasAdmissionExclusive = exclusive;
        canvasAdmission = admissionFailure || workerCanvasTransferAttempted(resolved)
          ? undefined : reserveRootCanvas(resolved, runtimeOwner, exclusive);
        if (!canvasAdmission) {
          canvasAdmissionError = admissionFailure ?? managedCanvasInUse();
        } else rootAppRegistration = registerManagedRootApp(resolved, runtimeOwner);
      }
      // A rejected app gets no usable canvas at all. Its extensions, preview,
      // sizing and remounts cannot mutate the admitted owner's surface.
      const admittedCanvas = canvasAdmissionError ? undefined : resolved;
      const usesProductionRenderer = Boolean(admittedCanvas && hasRootRenderableContent(admittedCanvas, declaresWebGLContent(renderSnapshot.nodes), runtimeOwner) && typeof window !== "undefined");
      initialRuntimePhysics = usesProductionRenderer ? undefined : createRuntimeScenePhysicsWithAccess(physicsAccess, renderSnapshot);
      return admittedCanvas;
    } catch (error) {
      const failures: unknown[] = [error];
      try { rootAppRegistration?.release(); } catch (cleanupError) { failures.push(cleanupError); }
      try { canvasAdmission?.release(); } catch (cleanupError) { failures.push(cleanupError); }
      try { appPhysicsWorldInstance?.dispose(); } catch (cleanupError) { failures.push(cleanupError); }
      if (failures.length > 1) throw new AggregateError(failures, "Could not prepare or dispose scene physics.");
      throw error;
    }
  })();
  let startupAssetScope: ReturnType<typeof createAppAssetEventScope> | undefined;
  let abortStartupMount: (() => void) | undefined;
  let startupApp: AuraApp | undefined;
  const extensionDisposers: Array<() => void> = [];
  try {
  const actorAnimationContext = createActorAnimationContext(qrFlags);
  bindActorAnimationContext(runtimeOwner, actorAnimationContext);
  // PRD-06 §10 app-side install (C-37): `qrAnimationFlags()` reads this first
  // (then ?a3d-qr / env) and `typedGLBActorExtensions()` gates the actor
  // extension onLoad publishes — without it the lane flag resolves false in an
  // app context and `handle.animation` sources never attach. Same install-once
  // pattern as setPrd01ModelMatrixCache below.
  setTypedGLBActorQrFlags(qrFlags, runtimeOwner);
  // GU47 E-G handoff: world builders called after the app exists (runtime
  // `app.nodes.add(water.surface())`, scene rebuilds) decide with the app's
  // flags without `world.useAppFlags` (same install-once pattern).
  const releaseWorldFlags = setWorldBuilderFlags(qrFlags, runtimeOwner);
  // PRD-01 §15 Phase-6: install the fingerprinted static-node matrix cache on
  // the compiler seam. Flag-off leaves renderInput on verbatim calls (C-01).
  // PRD-01 §15 Phase 1 (C-06, 01-S2/T1.5): under the flag the cache composes
  // through compiler/sceneGraph.ts (rotationOrder, quaternion, group world
  // matrices) and the snapshot flattens hierarchically. Flag-off: unchanged.
  const releaseMatrixCache = setPrd01ModelMatrixCache(qrFlags.on("A3D_QR_CORE") ? createModelMatrixCache(modelMatrixFor(qrFlags)) : null, runtimeOwner);
  // 01-S5 (C-06): colorUtils helpers delegate to parseAuraColor under the flag.
  const releaseColorPolicy = setPrd01ColorParsing(qrFlags.on("A3D_QR_CORE") ? { strict: options.strict ?? qrFlags.on("A3D_QR_STRICT") } : null, runtimeOwner);
  // Custom-shader compile/link failures: a fresh app starts with a clean failure list; strict (or
  // renderer.materialStrictness "strict") fails the frame with AuraRuntimeError("custom-shader-compile-failed"),
  // otherwise the failing draw is skipped (magenta with ?diag=1) and the failure is reported in diagnostics.
  const shaderFailures = createShaderFailureStore();
  bindShaderFailureStore(runtimeOwner, shaderFailures);
  setShaderFailureMode(
    options.renderer?.shaderFailures ?? ((options.strict ?? qrFlags.on("A3D_QR_STRICT")) || options.renderer?.materialStrictness === "strict" ? "throw" : undefined),
    shaderFailures
  );
  // TIER: the compile ctx's quality.tier resolves from renderer.quality at
  // mount (compiler/renderer.ts) — no app-side stub remains.
  const diagnosticsState = createInitialDiagnostics(renderSnapshot, options.renderer);
  if (canvas) {
    // PRD-01 §6.9 (Q-15-1): under A3D_QR_CORE the ratio is min(devicePixelRatio, tier cap), not the profile's 1.5.
    const coreDpr = qrFlags.on("A3D_QR_CORE");
    configureCanvas(canvas, resolveAppPixelRatio({
      flagOn: coreDpr,
      option: options.pixelRatio,
      profilePixelRatio: rendererSelection.profile.pixelRatio,
      maxPixelRatio: appTierMaxPixelRatio(resolveMountQuality(options.renderer).tier),
      devicePixelRatio: currentDevicePixelRatio(),
      legacyDevicePixelRatio: devicePixelRatioSafe
    }), options.resize ?? true, minimumBackingSize(coreDpr));
    initializeRootPerformanceQuality(canvas);
    // Apply a caller's device/capture budget before the production controller
    // derives its first backing size, LODs, particle pool and shadow target.
    // Runtime mutations remain guarded by app.setPerformanceQuality().
    if (options.performanceQuality) setRootPerformanceQuality(canvas, options.performanceQuality);
  }
  const overlay = canvas && shouldRenderOverlay(options.diagnostics, snapshot) ? createDiagnosticsOverlay(canvas, diagnosticsState) : undefined;
  let disposed = false;
  let disposingApp = false;
  const liveVetoReleases = new Set<() => void>();
  const assetEventScope = startupAssetScope = createAppAssetEventScope({
    onAssetProgress: options.onAssetProgress,
    onAssetError: options.onAssetError
  });
  // The initial mount starts before the public app object exists. Bind its
  // unique runtime owner now so model requests capture the right channel.
  bindAppAssetEventScope(runtimeOwner, assetEventScope);
  let animationHandle = 0;
  let productionController: WebGLRenderController | undefined;
  let activeRendererBackend: ReadyBackend | undefined;
  // Once WebGPU may own this canvas, every subsequent mount must wait for
  // superseded mounts and renderer teardown. This remains set across a
  // burst of scene changes while the previous device is still retiring.
  let webGPUCanvasRequiresFence = options.renderer?.backend === "webgpu" || options.renderer?.backend === "auto"
    || (options.renderer?.backend === undefined && options.renderer?.qualityProfile === "experimental-webgpu");
  // WebGPU does not restore a lost device in place. Keep the loss visible
  // until a newly mounted WebGPU renderer has actually presented a frame.
  let pendingWebGPURecovery: { readonly lossRevision: number; attempted: boolean; readonly cleanupErrors: string[]; computeCleanupFailure?: { readonly error: unknown } } | undefined;
  let revokeCurrentPrd07Authority: (() => void) | undefined;
  const appCompute = createComputeSurface(
    () => diagnosticsState.backend,
    () => disposed || productionController?.deviceLost?.()
      ? undefined
      : (productionController?.auraRenderer as { readonly device?: AuraComputeDeviceSource } | undefined)?.device
  );
  let mountReadiness = createMountReadiness();
  let currentMountFailure: Extract<AuraReadyOutcome, { state: "failed" }> | undefined;
  let mountRevision = 0;
  let currentRenderTermination: AuraRenderTermination | undefined;
  let reportedFailureRevision: number | undefined;
  const renderTerminationListeners = new Set<(event: AuraRenderTermination) => void>();
  const pendingRenderTerminations: { event: AuraRenderTermination; clearAfter: boolean }[] = [];
  let notifyingRenderTermination = false;
  const publishRenderTermination = (event: AuraRenderTermination, remember: boolean, clearAfter = false): void => {
    const immutableEvent = Object.freeze(event);
    if (remember) currentRenderTermination = immutableEvent;
    pendingRenderTerminations.push({ event: immutableEvent, clearAfter });
    if (notifyingRenderTermination) return;
    notifyingRenderTermination = true;
    try {
      while (pendingRenderTerminations.length) {
        const next = pendingRenderTerminations.shift()!;
        for (const listener of [...renderTerminationListeners]) {
          if (!renderTerminationListeners.has(listener)) continue;
          try { listener(next.event); } catch { /* A lifecycle observer cannot mask the terminal event. */ }
        }
        if (next.clearAfter) renderTerminationListeners.clear();
      }
    } finally { notifyingRenderTermination = false; }
  };
  const recordTerminalFrameFailure = (revision: number, error: unknown, fallback = "render-frame-failed"): void => {
    if (disposed || revision !== mountRevision || reportedFailureRevision === revision ||
        (currentRenderTermination?.state === "device-lost" && currentRenderTermination.revision === revision)) return;
    reportedFailureRevision = revision;
    publishRenderTermination({ state: "failed", revision, code: readinessErrorCode(error, fallback), message: productionRenderErrorMessage(error) }, true);
  };
  const mountTasks = new Set<Promise<void>>();
  const teardownTasks = new Set<Promise<void>>();
  interface ControllerRetirement {
    readonly controller: WebGLRenderController;
    current: Promise<void>;
    pending: boolean;
    invoking: boolean;
    queued?: Promise<void>;
    failure?: { readonly error: unknown };
    firstFailure?: { readonly error: unknown };
  }
  const teardownByController = new WeakMap<WebGLRenderController, ControllerRetirement>();
  // Keep failed and in-flight controllers owned by this app, not by the
  // canvas. The weak map also recognizes stale callbacks after success.
  const retainedRetirements = new Set<ControllerRetirement>();
  const retirementObservers = new Set<(state: ControllerRetirement) => void>();
  const teardownFailures = new Map<WebGLRenderController, unknown>();
  const appCleanupFailures: unknown[] = [];
  let pendingAsyncSteps = 0;
  let canvasAdmissionDrain: Promise<void> | undefined;
  let canvasAdmissionDrainDone = false;
  const releaseCanvasIfRetired = (): void => {
    if (!canvasAdmission || !disposed || disposingApp || canvasAdmissionQuarantined || pendingAsyncSteps ||
        mountTasks.size || teardownTasks.size || retainedRetirements.size) return;
    if ((canvasAdmissionExclusive || formatRegistry) && !canvasAdmissionDrainDone) {
      if (!canvasAdmissionDrain) {
        canvasAdmissionDrain = import("../../production-runtime/TypedGLBActor.js")
          .then(({ awaitTypedGLBActorDisposals }) => awaitTypedGLBActorDisposals(runtimeOwner));
        void canvasAdmissionDrain.then(() => {
          canvasAdmissionDrainDone = true;
          releaseCanvasIfRetired();
        }, (error: unknown) => {
          canvasAdmissionQuarantined = true;
          appCleanupFailures.push(error);
          diagnosticsState.errors.push(`DISPOSE_FAILED: ${productionRenderErrorMessage(error)}`);
        });
      }
      return;
    }
    canvasAdmission?.release();
    canvasAdmission = undefined;
  };
  releaseAdmissionAfterStartupFailure = () => { disposed = true; releaseCanvasIfRetired(); };
  const startControllerRetirement = (state: ControllerRetirement, callDispose: boolean): Promise<void> => {
    const { controller } = state;
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const pending = new Promise<void>((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
    // Publish before dispose() or whenIdle() can synchronously reenter the app.
    state.current = pending;
    state.pending = true;
    retainedRetirements.add(state);
    teardownTasks.add(pending);
    void pending.catch(() => undefined);
    for (const observe of retirementObservers) observe(state);
    const failures: unknown[] = [];
    const addFailure = (error: unknown): void => {
      if (!failures.some((failure) => Object.is(failure, error))) failures.push(error);
    };
    const finish = (idleFailure?: { readonly error: unknown }): void => {
      if (idleFailure) addFailure(idleFailure.error);
      state.pending = false;
      teardownTasks.delete(pending);
      if (failures.length) {
        state.firstFailure ??= { error: failures[0] };
        const reported = [state.firstFailure.error];
        for (const failure of failures) {
          if (!reported.some((previous) => Object.is(previous, failure))) reported.push(failure);
        }
        const error = reported.length === 1
          ? reported[0]
          : new AggregateError(reported, "Renderer controller cleanup failed", { cause: reported[0] });
        state.failure = { error };
        teardownFailures.set(controller, error);
        reject(error);
      } else {
        state.failure = undefined;
        state.firstFailure = undefined;
        teardownFailures.delete(controller);
        retainedRetirements.delete(state);
        resolve();
      }
      releaseCanvasIfRetired();
    };
    let idle: Promise<void> | undefined;
    state.invoking = true;
    try {
      if (callDispose) {
        try { controller.dispose(); } catch (error) { addFailure(error); }
      }
      // whenIdle snapshots the controller's current retirement *when called*.
      // Deferring this call to a microtask lets a retry replace the attempt and
      // loses the failure belonging to this waiter.
      try { idle = controller.whenIdle?.(); } catch (error) { addFailure(error); }
    } finally {
      state.invoking = false;
    }
    if (idle) void Promise.resolve(idle).then(() => finish(), (error: unknown) => finish({ error }));
    else finish();
    return pending;
  };
  const queueControllerRetry = (state: ControllerRetirement): Promise<void> => {
    if (state.queued) return state.queued;
    const previous = state.current;
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    const queued = new Promise<void>((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
    state.queued = queued;
    state.current = queued;
    teardownTasks.add(queued);
    void queued.catch(() => undefined);
    for (const observe of retirementObservers) observe(state);
    void previous.then(
      () => {
        // The extra request was unnecessary: do not repeat successful work.
        state.queued = undefined;
        teardownTasks.delete(queued);
        resolve();
        releaseCanvasIfRetired();
      },
      () => {
        // Never overlap an active frame or its asynchronous idle cleanup.
        state.queued = undefined;
        const retry = startControllerRetirement(state, true);
        void retry.then(
          () => { teardownTasks.delete(queued); resolve(); releaseCanvasIfRetired(); },
          (error: unknown) => { teardownTasks.delete(queued); reject(error); releaseCanvasIfRetired(); }
        );
      }
    );
    return queued;
  };
  const retireController = (
    controller: WebGLRenderController | undefined,
    retry = false,
    alreadyDisposed = false
  ): Promise<void> => {
    if (!controller) return Promise.resolve();
    let state = teardownByController.get(controller);
    if (state) {
      if (retry) {
        if (state.invoking) return state.current;
        if (state.queued) return state.queued;
        if (state.pending) return queueControllerRetry(state);
        if (state.failure) return startControllerRetirement(state, true);
      }
      return state.current;
    }
    state = { controller, current: Promise.resolve(), pending: false, invoking: false };
    teardownByController.set(controller, state);
    return startControllerRetirement(state, !alreadyDisposed);
  };
  const retryControllerRetirements = (includePending: boolean): void => {
    for (const state of [...retainedRetirements]) {
      if (!state.invoking && !state.queued && ((includePending && state.pending) || (!state.pending && state.failure))) {
        void retireController(state.controller, true);
      }
    }
  };
  let asyncSteps: Promise<void> = Promise.resolve();
  const assertMutableFrame = (): void => {
    if (disposed) throw new Error("Aura3D app is disposed.");
    if (pendingAsyncSteps > 0 || productionController?.busy?.()) {
      throw new Error("Aura3D frame submission is pending; await stepAsync() before synchronous mutation.");
    }
  };
  /** WS-2.9: true from the moment a WebGL mount starts until the controller arrives or fails. */
  let productionMountPending = false;
  /**
   * WS-2.5 — true when a WebGL mount was attempted and FAILED for this scene.
   *
   * Distinct from `productionMountPending`, and the distinction is the whole point. After a failed mount
   * both the pending flag and the controller are absent, which used to be indistinguishable from "this
   * scene never wanted WebGL" — so `step()` and the render loop fell through to the Canvas-2D branch and
   * painted a gradient over a scene whose renderer had just failed. Measured: 16,384 lit pixels on a
   * 128x128 canvas, i.e. the entire surface, with the real error sitting in `diagnostics().errors` where
   * nobody was looking.
   */
  let productionMountFailed = false;
  /**
   * Settles when the in-flight WebGL mount finishes, successfully or not. Backs `app.ready()`.
   *
   * Resolved rather than pending when no mount is in flight, so `await app.ready()` is safe to call at
   * any time and on any scene.
   */
  let productionMountSettled: Promise<void> = Promise.resolve();
  /** Cancel asset and decoder work belonging to the superseded mount. */
  let productionMountAbort: AbortController | undefined;
  abortStartupMount = () => { disposed = true; productionMountAbort?.abort(); };
  /** Lets `dispose()` settle an in-flight mount; see the note there. */
  let settleMountForDispose: () => void = () => undefined;
  /*
   * WS-2.6 — device-loss subscribers, held here rather than pushed straight at the controller.
   *
   * The renderer mounts asynchronously, so a developer writing `app.onDeviceLost(...)` on the line after
   * `createAuraApp` has no controller to attach to yet. Making them await `ready()` first would be the
   * same trap WS-2.9 fixed: an API that silently does nothing depending on timing. So subscriptions are
   * recorded and attached when the device arrives, and on every re-mount from `setScene`.
   */
  /*
   * Keyed BY LISTENER, not a flat array — and that detail is load-bearing.
   *
   * A flat list of unsubscribe functions looks equivalent and is not. `attachDeviceListeners` re-attaches
   * every held listener on each mount, so a listener registered before the mount ends up with **two**
   * controller subscriptions: the one its own `onDeviceLost` call created, and the one the mount handler
   * created. Its returned unsubscribe closure only knew about the first, so calling it left the second
   * live and the listener still fired.
   *
   * Measured by the WS-2.6 test's final assertion: after `unsubscribe()`, a second context loss still
   * incremented the counter — 2 where 1 was expected. A map from listener to its current subscription
   * makes unsubscribing complete regardless of how many mounts have happened.
   */
  const deviceLostListeners = new Map<() => void, (() => void) | undefined>();
  const deviceRestoredListeners = new Map<() => void, (() => void) | undefined>();
  /*
   * top-tennis C8: a restored context comes back with every GL object of the lost one gone, including the post chain's programs
   * and targets, so frames stay black until something mounts the renderer again. Apps that remount in their own
   * `onDeviceRestored` handler (setScene) keep doing so; for every other app the engine remounts the current scene, with
   * nodes added at runtime, once those handlers have run. Runtime node handles, physics and the clock are kept.
   */
  let restoreRemountUnsubscribe: (() => void) | undefined;
  let internalDeviceLostUnsubscribe: (() => void) | undefined;
  const attachRestoreRemount = (controller: WebGLRenderController): void => {
    restoreRemountUnsubscribe?.();
    restoreRemountUnsubscribe = undefined;
    // WebGPU replaces its device rather than restoring the old controller.
    if (activeRendererBackend === "webgpu") return;
    const attachedRevision = mountRevision;
    restoreRemountUnsubscribe = controller.onDeviceRestored?.(() => {
      if (disposed || attachedRevision !== mountRevision || productionController !== controller) return;
      try {
        const current = runtimeNodes.sceneWithRuntimeAdditions() ?? snapshot;
        renderSnapshot = flattenForRender(current, qrFlags.on("A3D_QR_CORE"));
        mountCurrentScene();
        diagnosticsState.warnings.push("DEVICE_RESTORED_REMOUNT: the WebGL context was restored; the scene was mounted again so it renders.");
      } catch (error) {
        // Keep repeated failed restores bounded, and use the same safe error
        // formatter as mount/frame failures. A thrown value can itself have
        // hostile accessors or string conversion and must not escape this
        // lifecycle callback or retain credentials in the live diagnostics.
        if (diagnosticsState.errors.length >= 128) diagnosticsState.errors.splice(0, diagnosticsState.errors.length - 127);
        diagnosticsState.errors.push(`DEVICE_RESTORE_REMOUNT_FAILED: ${productionRenderErrorMessage(error)}`);
      }
    });
  };
  const reportDeviceLoss = (revision: number, controller?: WebGLRenderController): void => {
    if (disposed || revision !== mountRevision || (controller && productionController !== controller)) return;
    if (currentRenderTermination?.state === "device-lost" && currentRenderTermination.revision === revision) return;
    revokeCurrentPrd07Authority?.();
    let computeCleanupFailure: string | undefined;
    let computeCleanupError: { readonly error: unknown } | undefined;
    try { appCompute.dispose(); } catch (error) {
      computeCleanupError = { error };
      let message = productionRenderErrorMessage(error);
      try {
        if (error instanceof AggregateError && Array.isArray(error.errors)) {
          const causes = error.errors.slice(0, 8).map(productionRenderErrorMessage);
          if (causes.length) message += `; causes: ${causes.join("; ")}`;
        }
      } catch { /* Keep the safely formatted aggregate summary. */ }
      computeCleanupFailure = `DEVICE_LOSS_COMPUTE_CLEANUP_FAILED: ${message}`.slice(0, 4096);
      if (diagnosticsState.errors.length >= 128) diagnosticsState.errors.shift();
      diagnosticsState.errors.push(computeCleanupFailure);
    }
    currentMountFailure = { state: "failed", code: "device-lost", message: "The rendering device was lost; wait for restoration and remount." };
    mountReadiness.settle(currentMountFailure);
    const recovery = activeRendererBackend === "webgpu"
      ? (pendingWebGPURecovery ??= { lossRevision: revision, attempted: false, cleanupErrors: [] })
      : undefined;
    if (recovery && computeCleanupFailure && recovery.cleanupErrors.length < 8) recovery.cleanupErrors.push(computeCleanupFailure);
    if (recovery && computeCleanupError) recovery.computeCleanupFailure ??= computeCleanupError;
    publishRenderTermination({ state: "device-lost", revision }, true);
    if (!recovery) return;
    // The event may have been detected by a frame before the native loss
    // event. Notify WebGPU listeners here exactly once for this revision;
    // they are not subscribed independently to the old device.
    for (const listener of [...deviceLostListeners.keys()]) {
      if (disposed || revision !== mountRevision) break;
      if (!deviceLostListeners.has(listener)) continue;
      try { listener(); } catch (error) {
        if (diagnosticsState.errors.length >= 128) diagnosticsState.errors.shift();
        diagnosticsState.errors.push(`DEVICE_LOSS_LISTENER_FAILED: ${productionRenderErrorMessage(error)}`);
      }
    }
    // Let observers replace the scene or dispose synchronously before an
    // automatic attempt. A failed attempt is not retried in a loop.
    queueMicrotask(() => {
      if (disposed || revision !== mountRevision || pendingWebGPURecovery !== recovery || recovery.attempted) return;
      recovery.attempted = true;
      try {
        const current = runtimeNodes.sceneWithRuntimeAdditions() ?? snapshot;
        renderSnapshot = flattenForRender(current, qrFlags.on("A3D_QR_CORE"));
        mountCurrentScene();
      } catch (error) {
        if (diagnosticsState.errors.length >= 128) diagnosticsState.errors.shift();
        diagnosticsState.errors.push(`DEVICE_RECOVERY_REMOUNT_FAILED: ${productionRenderErrorMessage(error)}`);
      }
    });
  };
  const attachDeviceListeners = (controller: WebGLRenderController): void => {
    internalDeviceLostUnsubscribe?.();
    const attachedRevision = mountRevision;
    internalDeviceLostUnsubscribe = controller.onDeviceLost?.(() => reportDeviceLoss(attachedRevision, controller));
    for (const [listener, unsubscribe] of deviceLostListeners) {
      unsubscribe?.();
      deviceLostListeners.set(listener, activeRendererBackend === "webgpu" ? undefined : controller.onDeviceLost?.(listener));
    }
    for (const [listener, unsubscribe] of deviceRestoredListeners) {
      unsubscribe?.();
      deviceRestoredListeners.set(listener, activeRendererBackend === "webgpu" ? undefined : controller.onDeviceRestored?.(listener));
    }
    // Last, so the app's own restored handlers (which may remount through setScene) run first.
    attachRestoreRemount(controller);
  };
  let lastTime = 0;
  // ENG-FPS: the canvas preview loop reports a 1 s windowed rate, not 1000 / (last delta).
  let canvasFrameRate = createFrameRateMeter();
  let canvasRuntimePhysics: ReturnType<typeof createRuntimeScenePhysicsWithAccess> | undefined;
  const runtimeNodes = createAuraRuntimeNodeRegistry(renderSnapshot, { flags: qrFlags }, snapshot);
  const samePhysicsScale = (a: AuraVec3, b: AuraVec3): boolean =>
    a.every((value, axis) => Math.abs(value - b[axis]!) <= 1e-4 * Math.max(1e-12, Math.abs(value), Math.abs(b[axis]!)));
  const modelBoundsPose = (binding: ModelBoundsBinding) => {
    const handle = binding.runtimeId === undefined
      ? runtimeNodeHandleForSceneNode(runtimeNodes, binding.source)
      : runtimeNodes.get(binding.runtimeId);
    const parented = handle ? runtimeNodeParentedTransform(handle) : undefined;
    if (parented) {
      const transform = decomposeMatrix(parented.worldMatrix);
      if (parented.hasPivot || parented.hasLookAt || transform.sheared ||
          !parented.worldMatrix.every(Number.isFinite) ||
          !transform.quaternion.every(Number.isFinite) ||
          transform.scale.some((value) => !Number.isFinite(value) || value === 0 || (binding.type !== "static" && value < 0))) {
        throw new RangeError("MODEL_COLLIDER_UNSUPPORTED_PARENT: the live model transform is pivoted, sheared, reflected, or non-finite.");
      }
      if (binding.type !== "static") {
        const parent = decomposeMatrix(parented.parentWorldMatrix);
        const [x, y, z] = parent.scale;
        if (parent.sheared || parent.scale.some((value) => !Number.isFinite(value) || value <= 0) ||
            !samePhysicsScale([x, y, z], [x, x, x])) {
          throw new RangeError("MODEL_COLLIDER_UNSUPPORTED_PARENT: moving model bodies require a finite, positive, uniform-scale parent.");
        }
      }
      return { handle, position: transform.position, rotation: transform.quaternion, scale: transform.scale };
    }
    return {
      handle,
      position: handle?.position ?? binding.node.position ?? [0, 0, 0] as AuraVec3,
      rotation: nodeRotationQuaternion(binding.node),
      scale: handle ? scaleToVec3(handle.scale) : scaleToVec3(binding.node.scale)
    };
  };
  const preflightModelBounds = () => {
    const kinematics: Array<{ body: ReturnType<World["createRigidBody"]>; position: AuraVec3; rotation: ReturnType<typeof nodeRotationQuaternion> }> = [];
    syncInstanceBatches();
    const world = appPhysicsWorldInstance;
    if (!world) return kinematics;
    for (const [id, binding] of appPhysicsModelBounds) {
      const body = world.getBody(id);
      if (!body) continue;
      appPhysicsPivotGuards.get(id)?.();
      const pose = modelBoundsPose(binding);
      if (["float", "orbit", "turntable"].includes(pose.handle?.snapshot().animation?.clip ?? "")) {
        throw new RangeError("MODEL_COLLIDER_UNSUPPORTED_MOTION: bounds colliders cannot follow transform animation.");
      }
      if (!samePhysicsScale(pose.scale, binding.worldScale)) {
        throw new RangeError("MODEL_COLLIDER_SCALE_CHANGED: changing the model or ancestor scale requires rebuilding its collider.");
      }
      if (binding.type === "kinematic" && options.physics?.bindNodes === true && pose.handle) {
        void prepareRuntimeNodeWorldPose(pose.handle, pose.position, pose.rotation, binding.worldScale);
        kinematics.push({ body, position: offsetPhysicsPosition(pose.position, pose.rotation, binding.offset, 1), rotation: pose.rotation });
      } else if (binding.type === "static" || binding.type === "kinematic") {
        const expected = offsetPhysicsPosition(pose.position, pose.rotation, binding.offset, 1);
        const rotationLength = Math.hypot(...pose.rotation);
        const dot = pose.rotation.reduce((sum, value, axis) => sum + value * body.rotation[axis]!, 0) / rotationLength;
        if (!expected.every((value, axis) => Math.abs(value - body.position[axis]!) <= 1e-5 * Math.max(1, Math.abs(value), Math.abs(body.position[axis]!))) ||
            !Number.isFinite(dot) || Math.abs(Math.abs(dot) - 1) > 1e-5) {
          throw new RangeError("MODEL_COLLIDER_POSE_CHANGED: moving an unbound static or kinematic model requires synchronizing or rebuilding its collider.");
        }
      }
    }
    return kinematics;
  };
  const stepCanvasPhysics = (dt: number): void => {
    preflightModelBounds();
    if (canvasRuntimePhysics) {
      for (const [id, binding] of appPhysicsModelBounds) {
        if (!appPhysicsWorldInstance?.getBody(id)) continue;
        const pose = modelBoundsPose(binding);
        if (binding.type !== "static" && pose.handle && runtimeNodeParentedTransform(pose.handle)) {
          throw new RangeError("MODEL_COLLIDER_UNSUPPORTED_PARENT: preview physics cannot synchronize a moving bounds collider through a parent.");
        }
      }
      canvasRuntimePhysics.step(dt);
    }
  };
  /**
   * `physics: { bindNodes: true }` — dynamic bodies declared on nodes that carry `.runtime({ id })`
   * write their position and rotation back to that runtime node after every `app.physics.step()`.
   * Off by default: a route that already moves its own nodes (and steps physics only for events) must
   * not have them overwritten.
   */
  const syncBoundNodes = (): void => {
    const world = appPhysicsWorldInstance;
    if (world === undefined) return;
    // Dynamic per-instance bodies write their pose back into the batch's instance transforms.
    for (const batch of appPhysicsInstanceBatches) {
      const runtimeId = batch.live.runtime?.id;
      const handle = runtimeId === undefined ? undefined : runtimeNodes.get(runtimeId);
      const transforms = batch.live.instances;
      if (!handle || !transforms || batch.live.instances !== batch.builtInstances || batch.bodyIds.length !== transforms.length) continue;
      let moved = false;
      const next = transforms.map((transform, index) => {
        const body = world.getBody(batch.bodyIds[index]!);
        const instance = appPhysicsInstanceBodies.get(batch.bodyIds[index]!);
        if (!body || !instance || body.type !== "dynamic" || body.sleeping) return transform;
        moved = true;
        return instanceTransformFromPhysics(instance.node, body.position, body.rotation, instance.offset);
      });
      if (!moved) continue;
      handle.setInstances(next, batch.live.instanceColors);
      batch.builtInstances = batch.live.instances;
    }
    for (const [bodyId, binding] of appPhysicsNodeBindings) {
      const body = world.getBody(bodyId);
      const handle = runtimeNodes.get(binding.runtimeId);
      if (body === undefined || handle === undefined) continue;
      const position = nodePositionFromPhysics(binding.node, body.position, body.rotation, binding.modelOffset);
      const parented = prepareRuntimeNodeWorldPose(handle, position, body.rotation, binding.worldScale);
      if (parented) { parented(); continue; }
      // A model's visual origin is offset from the body even while asleep.
      // Re-publish it so a scene-side edit cannot separate a sleeping collider.
      if (body.sleeping && !binding.modelOffset) continue;
      if (binding.pivot || binding.modelOffset) {
        writeNodeRotationFromBody(binding.node, body.rotation, (euler) => handle.setTransform({ position, rotation: euler }));
        continue;
      }
      handle.setPosition(body.position[0], body.position[1], body.position[2]);
      // Same convention the node was seeded with (anim-phys-01): quaternion or `rotationOrder`.
      writeNodeRotationFromBody(binding.node, body.rotation, (euler) => handle.setRotation(euler[0], euler[1], euler[2]));
    }
  };
  const preflightBoundNodes = () => {
    const world = appPhysicsWorldInstance;
    const modelKinematics = preflightModelBounds();
    if (!world) return modelKinematics;
    for (const [bodyId, guard] of appPhysicsPivotGuards) if (world.getBody(bodyId)) guard();
    // Stage collider rebuilds (pivot/scale/size/geometry edits); commit only
    // after every body and binding has validated.
    const colliderCommits: Array<() => void> = [];
    for (const [bodyId, sync] of appPhysicsColliderSyncs) {
      const body = world.getBody(bodyId);
      const commit = body ? sync.prepare(world, body) : undefined;
      if (!commit) continue;
      colliderCommits.push(() => {
        const { pivoted } = commit();
        const binding = appPhysicsNodeBindings.get(bodyId);
        if (binding) {
          const { pivot: _pivot, ...rest } = binding;
          const scale = scaleToVec3(sync.node.scale);
          appPhysicsNodeBindings.set(bodyId, { ...rest, worldScale: [scale[0], scale[1], scale[2]], ...(pivoted ? { pivot: [...sync.node.pivot!] as AuraVec3 } : {}) });
        }
        if (pivoted && body!.type === "kinematic" && options.physics?.bindNodes === true && sync.runtimeId !== undefined) {
          appPhysicsPivotKinematics.set(bodyId, sync.node);
        }
      });
    }
    for (const [bodyId, binding] of appPhysicsNodeBindings) {
      const body = world.getBody(bodyId);
      const handle = runtimeNodes.get(binding.runtimeId);
      if (body && handle) {
        const position = nodePositionFromPhysics(binding.node, body.position, body.rotation, binding.modelOffset);
        void prepareRuntimeNodeWorldPose(handle, position, body.rotation, binding.worldScale);
      }
    }
    for (const commit of colliderCommits) commit();
    return modelKinematics;
  };
  /** Lazy `app.physics`. Identity is stable: the same runtime is returned on every access. */
  const appPhysics = (): AuraPhysicsRuntime => {
    if (appPhysicsInstance === undefined) {
      const runtime = createPhysicsRuntime(appPhysicsWorld(), {
        ...(options.physics?.layers ? { layers: options.physics.layers } : {}),
        nodeNameFor: (bodyId) => appPhysicsNodeNames.get(bodyId)
      });
      const bound = Object.create(runtime) as { step: AuraPhysicsRuntime["step"] };
      const beforeQuery = (): void => {
        for (const { body, position, rotation } of preflightModelBounds()) {
          const dot = rotation.reduce((sum, value, axis) => sum + value * body.rotation[axis]!, 0) / Math.hypot(...rotation);
          if (!position.every((value, axis) => Math.abs(value - body.position[axis]!) <= 1e-5 * Math.max(1, Math.abs(value), Math.abs(body.position[axis]!))) ||
              !Number.isFinite(dot) || Math.abs(Math.abs(dot) - 1) > 1e-5) {
            throw new RangeError("MODEL_COLLIDER_POSE_CHANGED: step physics before querying a moved kinematic model.");
          }
        }
      };
      const queries: AuraPhysicsRuntime["queries"] = {
        raycast: (...args) => { beforeQuery(); return runtime.queries.raycast(...args); },
        raycastAll: (...args) => { beforeQuery(); return runtime.queries.raycastAll(...args); },
        sphereCast: (...args) => { beforeQuery(); return runtime.queries.sphereCast(...args); },
        overlapSphere: (...args) => { beforeQuery(); return runtime.queries.overlapSphere(...args); },
        overlapBox: (...args) => { beforeQuery(); return runtime.queries.overlapBox(...args); }
      };
      Object.defineProperty(bound, "queries", { value: queries, enumerable: true });
      bound.step = (dt) => {
        const modelKinematics = preflightBoundNodes();
        // Stage every kinematic pose before mutating any body. Unbound nodes
        // retain the existing explicit-physics semantics.
        const kinematicPoses = [...appPhysicsPivotKinematics].flatMap(([id, node]) => {
          const body = appPhysicsWorldInstance?.getBody(id);
          if (!body) return [];
          // A transform clip moves the drawn node; the kinematic collider follows the same animated pose.
          const posed = node.animation === undefined ? node
            : { ...node, position: animatedPosition(node, runtimeTime), rotation: animatedRotation(node, runtimeTime) };
          return [{ body, position: nodePhysicsPosition(posed), rotation: nodeRotationQuaternion(posed) }];
        });
        for (const { body, position, rotation } of [...kinematicPoses, ...modelKinematics]) {
          body.setPosition(position);
          body.setRotation(rotation);
        }
        const events = runtime.step(dt);
        if (options.physics?.bindNodes === true) syncBoundNodes();
        return events;
      };
      appPhysicsInstance = bound as unknown as AuraPhysicsRuntime;
    }
    return appPhysicsInstance;
  };
  // A registration token keeps an old unsubscribe from removing a later
  // registration of the same callback.
  const frameCallbacks = new Map<AuraFrameCallback, object>();
  const reportedFrameCallbackErrors = new Set<string>();
  let runtimePaused = options.autoStart === false;
  let xrOwnsFrames = false;
  let runtimeFrame = 0;
  let runtimeTime = 0;
  const runtimeFixedDt = 1 / 60;
  let runtimeAlpha = 0;
  const ownedInputControllers = new Set<ReturnType<typeof createGameInput>>();
  const runRuntimeFrame = (dt: number, source: AuraFrameInfo["source"]) => {
    if (disposed) return;
    runtimeFrame += 1;
    runtimeTime += dt;
    runtimeAlpha = computeRuntimeAlpha(dt, runtimeFixedDt);
    const frame: AuraFrameInfo = {
      dt,
      fixedDt: runtimeFixedDt,
      time: runtimeTime,
      frame: runtimeFrame,
      alpha: runtimeAlpha,
      paused: runtimePaused,
      source,
      substep: 1,
      substeps: 1
    };
    for (const [callback, registration] of [...frameCallbacks]) {
      // Disposal or an unsubscribe may occur in an earlier callback.
      if (disposed) break;
      if (frameCallbacks.get(callback) !== registration) continue;
      try {
        callback(frame);
      } catch (error) {
        // A throwing callback used to unwind the frame loop: nothing was drawn again and the page stayed blank.
        // Shipped 4.2.0 format (docs/agents/recipes.md): the Error message itself, redacted, without the "Error:" name prefix.
        const message = `onFrame callback threw: ${frameCallbackErrorText(error)}`;
        if (!reportedFrameCallbackErrors.has(message)) {
          if (reportedFrameCallbackErrors.size >= 128) reportedFrameCallbackErrors.delete(reportedFrameCallbackErrors.values().next().value!);
          reportedFrameCallbackErrors.add(message);
          if (diagnosticsState.errors.length >= 128) diagnosticsState.errors.shift();
          diagnosticsState.errors.push(message);
          if (typeof console !== "undefined") console.error(`[aura3d] ${message}`);
        }
      }
    }
  };
  const shouldUseProductionRendererForScene = (candidate: AuraSceneSnapshot) =>
    Boolean(canvas && hasRootRenderableContent(canvas, declaresWebGLContent(candidate.nodes), runtimeOwner) && typeof window !== "undefined");
  const shouldUseProductionRendererForCurrentScene = () => shouldUseProductionRendererForScene(renderSnapshot);
  const resetDiagnosticsForCurrentScene = (backend: AuraBackend) => {
    const fresh = createInitialDiagnostics(renderSnapshot, options.renderer);
    diagnosticsState.backend = backend;
    diagnosticsState.fps = fresh.fps;
    diagnosticsState.drawCalls = fresh.drawCalls;
    diagnosticsState.renderSize = fresh.renderSize;
    diagnosticsState.assets = [];
    diagnosticsState.evidence = fresh.evidence;
    diagnosticsState.renderer = fresh.renderer;
    diagnosticsState.warnings = [...fresh.warnings, ...rendererQualityWarnings(options.renderer)];
    diagnosticsState.errors = [];
    validateSceneAssets(renderSnapshot, diagnosticsState.assets, formatRegistry);
    diagnosticsState.warnings.push(
      ...collectGeneratedCodeWarnings(renderSnapshot, qrFlags, {
        production: options.renderer?.qualityProfile === "production"
      })
    );
  };
  const render = (time = performanceNow()) => {
    if (disposed) return;
    const delta = lastTime > 0 ? Math.max(1, time - lastTime) : 16.67;
    lastTime = time;
    const dt = delta / 1000;
    if (!runtimePaused) {
      const revision = mountRevision;
      runRuntimeFrame(dt, "raf");
      // A callback that called `setScene()` (or `dispose()`) already mounted the next scene and started its loop.
      if (disposed || revision !== mountRevision) return;
      stepCanvasPhysics(dt);
    }
    diagnosticsState.evidence = collectAuraSceneEvidence(renderSnapshot);
    canvasFrameRate.sample(time);
    diagnosticsState.fps = canvasFrameRate.fps();
    /*
     * WS-2.5 — the live loop must respect the same rule as `step()`.
     *
     * Fixing only `step()` would have left the gradient reachable through `autoStart`, which is the path
     * most routes take. A scene whose WebGL mount is pending or has failed gets nothing drawn; the reason
     * is already recorded in `warnings`/`errors`.
     */
    diagnosticsState.drawCalls = productionMountPending || productionMountFailed
      ? 0
      : renderDiagnosticPreviewToCanvas(canvas, renderSnapshot, time);
    if (canvas) diagnosticsState.renderSize = [canvas.width, canvas.height];
    overlay?.update();
    if (options.autoStart !== false && typeof requestAnimationFrame !== "undefined") {
      animationHandle = requestAnimationFrame(render);
    }
  };
  const mountCurrentScene = (prepared?: { runtimePhysics: ReturnType<typeof createRuntimeScenePhysicsWithAccess> }) => {
    // The prepared preview world is not app-owned until it is installed below.
    // A failed or superseded mount must release it independently.
    let preparedPhysics = prepared?.runtimePhysics;
    const cleanupFailures: unknown[] = [];
    const cleanup = (fn: (() => void) | undefined): void => {
      if (!fn) return;
      try { fn(); } catch (error) {
        cleanupFailures.push(error);
        appCleanupFailures.push(error);
        if (diagnosticsState.errors.length >= 128) diagnosticsState.errors.shift();
        diagnosticsState.errors.push(`DISPOSE_FAILED: ${productionRenderErrorMessage(error)}`);
      }
    };
    const disposePrepared = (): void => {
      const physics = preparedPhysics;
      preparedPhysics = undefined;
      if (physics === initialRuntimePhysics) initialRuntimePhysics = undefined;
      physics?.dispose();
    };
    const throwCleanupFailures = (): void => {
      if (cleanupFailures.length === 1) throw cleanupFailures[0];
      if (cleanupFailures.length > 1) {
        throw new AggregateError(cleanupFailures, "Aura3D remount cleanup failed", { cause: cleanupFailures[0] });
      }
    };
    if (disposed) {
      cleanup(disposePrepared);
      throwCleanupFailures();
      return;
    }
    if (canvasAdmissionError) {
      cleanup(disposePrepared);
      throwCleanupFailures();
      mountReadiness.settle({ state: "superseded" });
      mountReadiness = createMountReadiness();
      const revision = ++mountRevision;
      productionMountPending = false;
      productionMountFailed = true;
      diagnosticsState.backend = "headless";
      const message = productionRenderErrorMessage(canvasAdmissionError);
      currentMountFailure = { state: "failed", code: canvasAdmissionError.code, message };
      mountReadiness.settle(currentMountFailure);
      if (!diagnosticsState.errors.includes(message)) diagnosticsState.errors.push(message);
      productionMountSettled = Promise.reject(canvasAdmissionError);
      void productionMountSettled.catch(() => undefined);
      settleMountForDispose = () => undefined;
      recordTerminalFrameFailure(revision, canvasAdmissionError);
      return;
    }
    const recoveryAttempt = pendingWebGPURecovery;
    // A user-driven setScene can replace the lost scene before the queued
    // automatic attempt; it consumes that attempt as well.
    if (recoveryAttempt) recoveryAttempt.attempted = true;
    // A waiter belongs to the mount it observed, not whichever mount wins later.
    mountReadiness.settle({ state: "superseded" });
    const previousRevision = mountRevision;
    const revision = ++mountRevision;
    const readiness = createMountReadiness();
    mountReadiness = readiness;
    currentMountFailure = undefined;
    currentRenderTermination = undefined;
    reportedFailureRevision = undefined;
    if (previousRevision > 0) publishRenderTermination({ state: "superseded", revision: previousRevision }, false);
    // A listener may synchronously dispose or mount an even newer scene.
    if (disposed || revision !== mountRevision) {
      // The caller prepared this preview world before the notification, but it
      // was never installed on the app and therefore is not owned by teardown.
      cleanup(disposePrepared);
      throwCleanupFailures();
      return;
    }
    try {
    // Relinquish each old owner before invoking it. A disposer can reenter
    // setScene()/dispose(); the newer mount (or app disposal) then owns the
    // remaining slots, and this older mount must not retire its replacements.
    const cleanupCurrent = (fn: () => void): void => {
      if (!disposed && revision === mountRevision) cleanup(fn);
    };
    cleanupCurrent(() => {
      const settle = settleMountForDispose;
      settleMountForDispose = () => undefined;
      productionMountPending = false;
      settle();
    });
    cleanupCurrent(() => {
      const abort = productionMountAbort;
      productionMountAbort = undefined;
      revokeCurrentPrd07Authority = undefined;
      abort?.abort();
    });
    cleanupCurrent(() => {
      const unsubscribe = internalDeviceLostUnsubscribe;
      internalDeviceLostUnsubscribe = undefined;
      unsubscribe?.();
    });
    cleanupCurrent(() => {
      const handle = animationHandle;
      animationHandle = 0;
      if (handle && typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(handle);
    });
    cleanupCurrent(() => {
      try { appCompute.dispose(); } catch (error) {
        // Lost-generation compute leases whose destroy already failed stay
        // retained for an explicit retry (and app disposal), but the failure
        // reported at loss must not block the replacement device generation.
        // Any new failure still aborts this mount.
        const lost = recoveryAttempt?.computeCleanupFailure;
        if (lost && cleanupFailureLeaves(error).every((leaf) => cleanupFailureLeaves(lost.error).includes(leaf))) return;
        throw error;
      }
    });
    cleanupCurrent(() => {
      const controller = productionController;
      productionController = undefined;
      activeRendererBackend = undefined;
      void retireController(controller);
    });
    cleanupCurrent(() => {
      const unsubscribe = restoreRemountUnsubscribe;
      restoreRemountUnsubscribe = undefined;
      unsubscribe?.();
    });
    const detachListeners = (listeners: Map<() => void, (() => void) | undefined>): void => {
      for (const [listener, unsubscribe] of [...listeners]) {
        cleanupCurrent(() => {
          if (!unsubscribe || listeners.get(listener) !== unsubscribe) return;
          // Keep the app-level listener for the next controller, but release
          // its subscription to the old controller even if no remount follows.
          listeners.set(listener, undefined);
          unsubscribe();
        });
      }
    };
    detachListeners(deviceLostListeners);
    detachListeners(deviceRestoredListeners);
    cleanupCurrent(() => {
      const physics = canvasRuntimePhysics;
      canvasRuntimePhysics = undefined;
      physics?.dispose();
    });
    if (disposed || revision !== mountRevision || cleanupFailures.length > 0) {
      cleanup(disposePrepared);
      throwCleanupFailures();
      return;
    }
    lastTime = 0;
    canvasFrameRate = createFrameRateMeter();
    const shouldUseProductionRenderer = shouldUseProductionRendererForCurrentScene();
    /*
     * WS-2.5 — a scene with renderable content must never fall to the diagnostic 2D path.
     *
     * `shouldUseProductionRendererForCurrentScene()` is false in two very different situations, and the
     * old code treated them the same: a scene with nothing renderable in it (fine, nothing to draw), and
     * a scene *with* renderable nodes that could not reach WebGL — no canvas, or no `window`. The second
     * used to silently produce a gradient schematic, which looks like a render and is not.
     *
     * So the two cases are separated. A renderable scene with no usable canvas now raises a diagnosable
     * error naming the cause, instead of drawing something plausible.
     */
    const declaresRenderableContent = hasRootRenderableContent(canvas, declaresWebGLContent(renderSnapshot.nodes), runtimeOwner);
    /*
     * Scoped to the case that is actually a lie: a canvas WAS supplied, so the caller is looking at
     * pixels, and the scene has renderable content — but WebGL declined it, so those pixels would be a
     * gradient schematic.
     *
     * Deliberately NOT extended to `canvas === undefined`. Constructing an app with no canvas is a
     * legitimate and widely used pattern — 18 tests across `tests/unit/agent-api` and
     * `tests/unit/rendering` do it to exercise scene, runtime and physics behaviour headlessly, and
     * `createAuraApp(undefined, ...)` is how `lazy-physics-world.test.ts` checks `app.physics`. Throwing
     * there would break working semantics to satisfy a rendering rule, which R7 forbids. Those callers
     * are not being shown a misleading frame; they are not being shown a frame at all, and
     * `diagnostics().backend` reports `"headless"`.
     */
    if (declaresRenderableContent && canvas && !shouldUseProductionRenderer) {
      throw new AuraRuntimeError(
        "backend-fallback",
        "Aura3D cannot render this scene on the canvas you supplied: it has renderable nodes but WebGL2 is unavailable in this context. It will NOT fall back to the Canvas 2D diagnostic preview, because that draws a gradient schematic rather than your scene and has silently hidden defects before — world labels once reached the scene graph but were drawn only in that path. Suggested fix: run in a browser context with WebGL2 available, or inspect diagnostics().errors for the underlying device failure."
      );
    }
    const backend: AuraBackend = shouldUseProductionRenderer ? "webgl2" : canvas ? "canvas2d" : "headless";
    resetDiagnosticsForCurrentScene(backend);
    // Preserve loss-time cleanup failures after the fresh mount resets its
    // diagnostics, so successful recovery cannot hide a resource error.
    if (recoveryAttempt?.cleanupErrors.length) diagnosticsState.errors.push(...recoveryAttempt.cleanupErrors);
    canvasRuntimePhysics = prepared
      ? preparedPhysics
      : shouldUseProductionRenderer ? undefined : createRuntimeScenePhysicsWithAccess(physicsAccess, renderSnapshot);
    preparedPhysics = undefined;
    overlay?.update();
    /*
     * WS-2.9 — record that a WebGL mount is in flight.
     *
     * `startProductionRender` is async, so between `createAuraApp` returning and the controller
     * arriving there is a window in which `step()` used to fall through to the Canvas-2D `render()`
     * path and draw nothing for a WebGL scene — silently, with `drawCalls: 0`, `warnings: []` and
     * `errors: []`. `step(dt)` is the documented deterministic entry point, so a developer writing a
     * headless capture got a blank image and no explanation.
     */
    productionMountPending = shouldUseProductionRenderer && Boolean(canvas);
    productionMountFailed = false;
    let settleMount: () => void = () => undefined;
    let failMount: (error: unknown) => void = () => undefined;
    productionMountSettled = productionMountPending
      ? new Promise<void>((resolveSettled, rejectSettled) => {
        settleMount = resolveSettled;
        failMount = rejectSettled;
      })
      : Promise.resolve();
    // The rejection only carries meaning to an `app.ready()` awaiter; this
    // no-op keeps an unawaited strict failure out of unhandledrejection.
    void productionMountSettled.catch(() => undefined);
    settleMountForDispose = settleMount;
    if (shouldUseProductionRenderer && canvas) {
      markTiming("a3d:mount:start");
      const mountAbort = new AbortController();
      productionMountAbort = mountAbort;
      // Revoke this mount's authority on loss without aborting the renderer's
      // restoration path. A scene replacement or app disposal aborts both.
      const authorityAbort = new AbortController();
      const revokeAuthority = (): void => { if (!authorityAbort.signal.aborted) authorityAbort.abort(); };
      mountAbort.signal.addEventListener("abort", revokeAuthority, { once: true });
      revokeCurrentPrd07Authority = revokeAuthority;
      const isCurrentMount = (): boolean => !disposed && revision === mountRevision && !mountAbort.signal.aborted && !authorityAbort.signal.aborted;
      let scopedAtmosphere: Prd07MountAuthority | undefined;
      let rendererBackend: ReadyBackend | undefined;
      let firstFrameBackend: ReadyBackend | undefined;
      let attachedController: WebGLRenderController | undefined;
      const attachController = (controller: WebGLRenderController) => {
        attachedController = controller;
        if (productionController === controller) return;
        productionController = controller;
        productionMountPending = false;
        attachDeviceListeners(controller);
      };
      // The old mount may still be cancelling a decoder or waiting for a GPU
      // fence. Do not configure a new renderer on its canvas before it retires.
      const waitForResidency = options.renderer?.textureResidency !== undefined;
      // A new WebGPU device must not configure the same canvas while the lost
      // renderer or a superseded mount still owns in-flight resources.
      const waitForPriorRenderer = waitForResidency || webGPUCanvasRequiresFence || recoveryAttempt !== undefined;
      const precedingMounts = waitForPriorRenderer ? [...mountTasks] : [];
      const precedingTeardowns = waitForPriorRenderer ? [...teardownTasks] : [];
      const mountingSnapshot = renderSnapshot;
      const startMount = (): Promise<WebGLRenderController | undefined> => {
        if (waitForPriorRenderer && teardownFailures.size) return Promise.reject(teardownFailures.values().next().value);
        if (disposed || revision !== mountRevision) { settleMount(); return Promise.resolve(undefined); }
        return startProductionRender(
        canvas,
        mountingSnapshot,
        diagnosticsState,
        { ...options, assets: assetOptions, formatRegistry,
          // A lost WebGPU device is recreated as WebGPU. Never silently switch
          // the app to a different backend during recovery.
          ...(recoveryAttempt ? { renderer: { ...options.renderer, backend: "webgpu", allowFallback: false } } : {}) },
        overlay,
        runRuntimeFrame,
        () => runtimePaused || xrOwnsFrames,
        runtimeNodes,
        // A route that registered a frame callback, or that has bodies to simulate, needs
        // frames regardless of what the scene declares.
        /*
         * Must not *create* a world just to ask whether one exists.
         * Reading `appPhysicsWorldInstance` directly keeps the lazy construction lazy; calling
         * `appPhysicsWorld()` here would instantiate the solver on the first render of every scene
         * and defeat the whole point.
         */
        () => frameCallbacks.size > 0 || (appPhysicsWorldInstance?.bodies().length ?? 0) > 0,
        // Paused frames render at the app's own simulated clock, so a held frame really is held.
        () => runtimeTime * 1000,
        // T0-28: flags resolve once per app; every (re-)mount's renderer gets these.
        qrFlags,
        () => disposed || revision !== mountRevision,
        {
          onRendererReady(backend, controller) {
            if (disposed || revision !== mountRevision) return;
            rendererBackend = backend;
            activeRendererBackend = backend;
            if (backend === "webgpu") webGPUCanvasRequiresFence = true;
            attachController(controller);
            readiness.renderer.settle({ state: "ready", stage: "renderer", backend });
          },
          onFirstFrame(backend) {
            if (disposed || revision !== mountRevision) return;
            if (recoveryAttempt && backend === "webgpu") {
              // A reported frame must not settle readiness if the replacement
              // was lost before the lifecycle callback could commit it.
              try {
                if (!productionController?.deviceLost) throw new Error("The replacement renderer cannot report its device-loss state.");
                if (productionController.deviceLost()) { reportDeviceLoss(revision, productionController); return; }
              } catch (error) {
                const message = productionRenderErrorMessage(error);
                currentMountFailure = { state: "failed", code: "device-recovery-failed", message };
                readiness.settle(currentMountFailure);
                if (diagnosticsState.errors.length >= 128) diagnosticsState.errors.shift();
                diagnosticsState.errors.push(`DEVICE_RECOVERY_FAILED: ${message}`);
                recordTerminalFrameFailure(revision, error, "device-recovery-failed");
                return;
              }
            }
            firstFrameBackend = backend;
            // Later frames may arrive after the controller has already been attached.
            if (productionController) readiness.firstFrame.settle({ state: "ready", stage: "first-frame", backend });
            if (!recoveryAttempt || pendingWebGPURecovery !== recoveryAttempt || backend !== "webgpu" || !productionController) return;
            pendingWebGPURecovery = undefined;
            diagnosticsState.warnings.push("DEVICE_RESTORED_REMOUNT: a replacement WebGPU device presented the current scene.");
            for (const listener of [...deviceRestoredListeners.keys()]) {
              if (disposed || revision !== mountRevision) break;
              if (!deviceRestoredListeners.has(listener)) continue;
              try { listener(); } catch (error) {
                if (diagnosticsState.errors.length >= 128) diagnosticsState.errors.shift();
                diagnosticsState.errors.push(`DEVICE_RESTORE_LISTENER_FAILED: ${productionRenderErrorMessage(error)}`);
              }
            }
          },
          onFirstFrameFailed(error) {
            if (disposed || revision !== mountRevision) return;
            readiness.firstFrame.settle({ state: "failed", code: readinessErrorCode(error), message: productionRenderErrorMessage(error) });
          },
          onTerminalFrameFailure(error) {
            recordTerminalFrameFailure(revision, error);
          },
          onDeviceLossDetected() {
            reportDeviceLoss(revision);
          }
        },
        mountAbort.signal,
        runtimeOwner,
        {
          getPrd07MountAuthority() {
            if (!isCurrentMount()) return null;
            // The narrow createAuraApp source entry need not load the PRD07
            // extension. Distinguish that normal absence from an installed
            // effect system whose authority has been revoked or is invalid.
            // A system disposed directly (supported: see ProductionEffectSystem.onDispose) has no overlay
            // left to bind, so it is the same normal absence, not a revoked authority.
            const prd07System = prd07SystemFor(app);
            if (!prd07System || prd07System.disposed) return undefined;
            if (scopedAtmosphere?.isLive()) return scopedAtmosphere;
            const authority = prd07MountAuthorityFor(app, canvas, runtimeOwner);
            if (!authority?.isLive()) return null;
            scopedAtmosphere = scopePrd07MountAuthority(authority, authorityAbort.signal, isCurrentMount);
            return scopedAtmosphere;
          },
          subscribePrd07Atmosphere(listener) {
            if (!isCurrentMount()) return () => {};
            const atmosphere = prd07SystemFor(app)?.atmosphere;
            if (!atmosphere) return () => {};
            let subscribed = true;
            const off = atmosphere.onRenderChange(() => { if (isCurrentMount()) listener(); });
            const unsubscribe = (): void => {
              if (!subscribed) return;
              subscribed = false;
              authorityAbort.signal.removeEventListener("abort", unsubscribe);
              off();
            };
            authorityAbort.signal.addEventListener("abort", unsubscribe, { once: true });
            if (!isCurrentMount()) unsubscribe();
            return unsubscribe;
          }
        }
      );
      };
      const task = (precedingMounts.length || precedingTeardowns.length
        ? Promise.all([...precedingMounts, ...precedingTeardowns]).then(startMount)
        : startMount())
        .then(async (controller) => {
          if (!controller) return;
          markTiming("a3d:mount:renderer-resolved");
          if (disposed || revision !== mountRevision) {
            settleMount();
            await retireController(controller);
            return;
          }
          attachController(controller);
          // A device can be lost (or its first frame fail) before the mount
          // promise resolves. Preserve that failure instead of marking the
          // route ready from a stale renderer milestone.
          if (currentMountFailure) { settleMount(); return; }
          // PRD-01 Q-15-1 seam: hang the live `Renderer` for lane diagnostics
          // and the C-05 output surface (`prd01.output` extension reads it).
          const auraRenderer = (controller as { auraRenderer?: unknown }).auraRenderer;
          if (auraRenderer) {
            (app as unknown as Record<symbol, unknown>)[Symbol.for("a3d.prd01.renderer")] = auraRenderer;
          }
          if (rendererBackend) readiness.renderer.settle({ state: "ready", stage: "renderer", backend: rendererBackend });
          if (firstFrameBackend) readiness.firstFrame.settle({ state: "ready", stage: "first-frame", backend: firstFrameBackend });
          settleMount();
          markRouteReady(snapshot, diagnosticsState);
        })
        .catch((error: unknown) => {
          markTiming("a3d:mount:catch");
          const ownershipCode = readinessErrorCode(error);
          if (ownershipCode === "WEBGPU_OWNERSHIP_CLEANUP_FAILED" && !attachedController) canvasAdmissionQuarantined = true;
          // The frame loop has already disposed an attached controller on a
          // mount/first-frame failure. Adopt its idle result without invoking
          // another disposal before an explicit retry.
          if (attachedController) void retireController(attachedController, false, true);
          if (disposed || revision !== mountRevision) {
            settleMount();
            return;
          }
          mountAbort.abort();
          if (productionMountAbort === mountAbort) productionMountAbort = undefined;
          if (revokeCurrentPrd07Authority === revokeAuthority) revokeCurrentPrd07Authority = undefined;
          productionMountPending = false;
          productionMountFailed = true;
          productionController = undefined;
          const mountMessage = productionRenderErrorMessage(error);
          const code = readinessErrorCode(error);
          const ownershipFailure = code === "WEBGPU_CANVAS_IN_USE" || code === "WEBGPU_DEVICE_IN_USE" || code === "WEBGPU_OWNERSHIP_CLEANUP_FAILED";
          diagnosticsState.backend = ownershipFailure ? "headless" : "webgl2";
          currentMountFailure = { state: "failed", code, message: mountMessage };
          readiness.settle(currentMountFailure);
          diagnosticsState.errors.push(mountMessage);
          overlay?.update();
          markRouteError(snapshot, diagnosticsState);
          recordTerminalFrameFailure(revision, error, "renderer-mount-failed");
          if (disposed || revision !== mountRevision) { settleMount(); return; }
          // T4.2 (PRD-15): under strict the mount failure is fatal — the
          // overlay surfaces it on the canvas and `app.ready()` rejects with
          // the AuraRuntimeError("renderer-mount-failed") mountRenderer threw.
          const strict = options.strict ?? qrFlags.on("A3D_QR_STRICT");
          if (ownershipFailure) {
            // Do not paint an error overlay on a canvas that may belong to a
            // peer; the exact typed conflict remains available in readiness.
            failMount(error);
          } else if (strict) {
            const safeError = Object.assign(new Error(mountMessage), { code });
            attachErrorOverlay(canvas, safeError);
            failMount(safeError);
          } else {
            if (typeof console !== "undefined") console.error(mountFailureConsoleMessage(mountMessage));
            settleMount();
          }
        });
      mountTasks.add(task);
      void task.finally(() => { mountTasks.delete(task); releaseCanvasIfRetired(); });
      return;
    }
    readiness.settle({ state: "failed", code: "renderer-unavailable", message: "No WebGL2 or WebGPU renderer is available for this app." });
    render();
    markRouteReady(snapshot, diagnosticsState);
    } catch (error) {
      const previousFailures = cleanupFailures.length;
      cleanup(disposePrepared);
      const failure = cleanupFailures.length === previousFailures
        ? error
        : new AggregateError([error, ...cleanupFailures.slice(previousFailures)], "Aura3D mount and cleanup failed", { cause: error });
      if (!disposed && revision === mountRevision) {
        productionMountPending = false;
        productionMountFailed = true;
        currentMountFailure = { state: "failed", code: readinessErrorCode(failure), message: productionRenderErrorMessage(failure) };
        readiness.settle(currentMountFailure);
        recordTerminalFrameFailure(revision, failure, "renderer-mount-failed");
      }
      throw failure;
    }
  };
  mountCurrentScene({ runtimePhysics: initialRuntimePhysics });
  // region parity:L7 — SR-01/03/05/07 + SH-05 runtime members land here:
  // `app.info`, `app.setPixelRatio`, `app.setClearColor`, `app.precompile`
  // (owner lane L7, do not edit outside this region).
  // SH-05: overrides requested before the mount settles (or across remounts)
  // must re-apply to the next renderer — remember them and re-push on mount.
  let parityL7PixelRatio: number | undefined;
  let parityL7ClearColor: { readonly color: readonly [number, number, number] | readonly [number, number, number, number]; readonly alpha?: number } | undefined;
  let parityL7AppliedTo: unknown;
  const parityL7AuraRenderer = (): {
    readonly info?: import("../nodes/types/runtime.js").AuraRendererInfo;
    setPixelRatio?(ratio: number): void;
    setClearColor?(color: readonly [number, number, number] | readonly [number, number, number, number], alpha?: number): void;
  } | undefined => {
    const r = (productionController?.auraRenderer ?? undefined) as
      | {
          readonly info?: import("../nodes/types/runtime.js").AuraRendererInfo;
          setPixelRatio?(ratio: number): void;
          setClearColor?(color: readonly [number, number, number] | readonly [number, number, number, number], alpha?: number): void;
        }
      | undefined;
    // A remount swaps the renderer instance; re-push the stored overrides the
    // first time the new one is observed.
    if (r && r !== parityL7AppliedTo) {
      parityL7AppliedTo = r;
      if (parityL7PixelRatio !== undefined) r.setPixelRatio?.(parityL7PixelRatio);
      if (parityL7ClearColor !== undefined) r.setClearColor?.(parityL7ClearColor.color, parityL7ClearColor.alpha);
    }
    return r;
  };
  // Re-apply deferred overrides the moment a renderer appears.
  void productionMountSettled.then(() => { if (!disposed) parityL7AuraRenderer(); }, () => undefined);
  // SC-04: `app.xr`. Frames render through the lane renderer's device; with no
  // setExternalFramebuffer/setViewport on it, `xr.enter()` refuses to start.
  let xrFrameMountRevision = mountRevision;
  const parityL7XR = createAuraXRRuntime({
    key: canvas ?? {},
    getGL: () => (canvas?.getContext?.("webgl2") as { makeXRCompatible?(): Promise<void> } | null | undefined) ?? undefined,
    getDevice: () => (parityL7AuraRenderer() as { readonly device?: AuraXRDeviceBridge } | undefined)?.device,
    advanceFrame: (dt) => {
      xrFrameMountRevision = mountRevision;
      if (runtimePaused || disposed) return;
      runRuntimeFrame(dt, "raf");
      if (!disposed && xrFrameMountRevision === mountRevision) stepCanvasPhysics(dt);
    },
    isFrameCurrent: () => !disposed && xrFrameMountRevision === mountRevision,
    renderFrame: (seconds) => { productionController?.render(seconds * 1000); },
    pauseLoop: () => { xrOwnsFrames = true; productionController?.pause?.(); },
    resumeLoop: () => {
      xrOwnsFrames = false;
      if (!disposed && !runtimePaused) productionController?.resume?.();
    },
    getTime: () => runtimeTime,
    setTime: (seconds) => { runtimeTime = seconds; },
    depthRange: () => ({
      ...(snapshot.camera.near !== undefined ? { near: snapshot.camera.near } : {}),
      ...(snapshot.camera.far !== undefined ? { far: snapshot.camera.far } : {})
    }),
    canvasSize: () => ({ width: canvas?.width ?? 0, height: canvas?.height ?? 0 })
  });
  // endregion parity:L7
  const app: AuraApp & { resetRuntimeClock(): void } = {
    canvas,
    // region parity:L7 (continued) — the members themselves must live in the
    // object literal; the helpers above stay in the lane-owned block.
    get info() {
      return parityL7AuraRenderer()?.info;
    },
    get xr() {
      return parityL7XR;
    },
    setPixelRatio(ratio: number) {
      parityL7PixelRatio = ratio;
      parityL7AuraRenderer()?.setPixelRatio?.(ratio);
    },
    setClearColor(color, alpha) {
      const rgba = colorToLinearRgba(color);
      parityL7ClearColor = { color: rgba, alpha };
      parityL7AuraRenderer()?.setClearColor?.(rgba, alpha);
    },
    async precompile() {
      await productionMountSettled;
      const startedAt = performanceNow();
      const result = await productionController?.precompile?.();
      return result ?? { compiledPrograms: 0, durationMs: performanceNow() - startedAt };
    },
    // endregion parity:L7
    get scene() {
      return snapshot;
    },
    get backend() {
      return diagnosticsState.backend;
    },
    // SH-04: WebGPU-only compute; throws `compute-requires-webgpu` until a WebGPU device is bound.
    compute: appCompute,
    setPerformanceQuality(settings) {
      assertMutableFrame();
      const quality = validateRootPerformanceQuality(settings);
      if (!canvas || !productionController?.setPerformanceQuality) throw new Error("PERFORMANCE_QUALITY_UNSUPPORTED: await a production renderer mount before changing quality.");
      if (quality.particleScale !== 1 && !supportsRootParticleQuality(canvas)) throw new Error("PERFORMANCE_PARTICLE_OWNER_UNAVAILABLE: this root workload has no adaptive native particle owner.");
      applyRootParticleQuality(canvas, quality.particleScale);
      productionController.setPerformanceQuality(quality);
    },
    setScene(nextScene) {
      assertMutableFrame();
      const nextSnapshot = normalizeSceneSnapshot(nextScene);
      assertScenePhysicsPivotSupport(nextSnapshot.nodes);
      const nextRenderSnapshot = flattenForRender(nextSnapshot, true);
      // The preview bridge is a separate world, so prepare it before changing
      // the live world or invalidating the old scene's node handles.
      const nextRuntimePhysics = shouldUseProductionRendererForScene(nextRenderSnapshot)
        ? undefined
        : createRuntimeScenePhysicsWithAccess(physicsAccess, nextRenderSnapshot);
      let stagedBodies: ReturnType<typeof stageDeclaredBodies> | undefined;
      try {
        stagedBodies = stageDeclaredBodies(nextRenderSnapshot, nextSnapshot.nodes);
      } catch (error) {
        try { nextRuntimePhysics?.dispose(); } catch (cleanupError) { throw new AggregateError([error, cleanupError], "Could not stage or dispose scene physics."); }
        throw error;
      }
      try {
        clearAdvancedLightingScene(runtimeNodes);
        snapshot = nextSnapshot;
        renderSnapshot = nextRenderSnapshot;
        runtimeNodes.reset(renderSnapshot, snapshot);
        stagedBodies.commit();
      } catch (error) {
        const failures: unknown[] = [error];
        try { stagedBodies.rollback(); } catch (cleanupError) { failures.push(cleanupError); }
        try { nextRuntimePhysics?.dispose(); } catch (cleanupError) { failures.push(cleanupError); }
        if (failures.length > 1) throw new AggregateError(failures, "Could not commit or roll back scene physics.");
        throw error;
      }
      mountCurrentScene({ runtimePhysics: nextRuntimePhysics });
    },
    nodes: runtimeNodes,
    /*
     * A getter, so touching `app.physics` is what constructs the world.
     * Declared as a getter rather than an eager property because the property access itself is the
     * signal that a route intends to use physics.
     */
    get physics() {
      return appPhysics();
    },
    get runtime() {
      return {
        paused: runtimePaused,
        frame: runtimeFrame,
        time: runtimeTime,
        fixedDt: runtimeFixedDt,
        alpha: runtimeAlpha
      };
    },
    onFrame(callback) {
      if (disposed) return () => {};
      const added = !frameCallbacks.has(callback);
      const registration = frameCallbacks.get(callback) ?? {};
      if (added) frameCallbacks.set(callback, registration);
      // An auto-start renderer may have gone idle before this subscriber was
      // added. Its existing invalidation path coalesces the wake with any
      // already scheduled frame and keeps hidden pages asleep.
      if (added && !disposed && !runtimePaused && !xrOwnsFrames && options.autoStart !== false) {
        productionController?.invalidate?.();
      }
      return () => {
        if (frameCallbacks.get(callback) === registration) frameCallbacks.delete(callback);
      };
    },
    offFrame(callback) {
      frameCallbacks.delete(callback);
    },
    input(inputOptions) {
      const controller = createGameInput(inputOptions);
      ownedInputControllers.add(controller);
      return controller;
    },
    pause() {
      runtimePaused = true;
      // Stop the production requestAnimationFrame owner as well as simulation.
      // Holding the clock alone still submitted the same expensive frame forever.
      productionController?.pause?.();
      productionController?.resetTemporalHistory?.("pause");
    },
    resetRuntimeClock() {
      /*
       * Rewind the frame counter and elapsed time to zero.
       *
       * Needed for reproducible capture. Routes animate from accumulated `time` — Data Galaxy sets
       * `setRotation(time * 0.16, ...)` — so a scene paused after 180 frames of real-time loading
       * looks different from the same scene paused after 240, even though both were then advanced by
       * an identical number of fixed steps. Zeroing the clock first makes "settle to N steps" name
       * exactly one state.
       *
       * Not part of `AuraApp`: this is a capture/testing seam, reached through `auraAppRegistry`
       * rather than offered as gameplay API, because rewinding a live game's clock mid-session is
       * not something a route should be encouraged to do.
       */
      runtimeFrame = 0;
      runtimeTime = 0;
      runtimeAlpha = 0;
      lastTime = 0;
    },
    resume() {
      runtimePaused = false;
      productionController?.resetTemporalHistory?.("resume");
      productionController?.resume?.();
      if (!animationHandle && !productionController && options.autoStart !== false && typeof requestAnimationFrame !== "undefined") {
        animationHandle = requestAnimationFrame(render);
      }
    },
    async ready() {
      // Resolves when the in-flight mount settles; immediate when there is none. See AuraApp.ready.
      await productionMountSettled;
    },
    readiness(readinessOptions: AuraReadinessOptions = {}) {
      if (disposed) return Promise.resolve({ state: "disposed" } as const);
      if (readinessOptions.signal?.aborted) return Promise.resolve({ state: "cancelled" } as const);
      if (currentMountFailure) return Promise.resolve(currentMountFailure);
      if (productionController?.deviceLost?.()) return Promise.resolve({ state: "failed", code: "device-lost", message: "The rendering device is lost." } as const);
      const stage: ReadinessStage = readinessOptions.stage ?? "renderer";
      return waitForReadiness(stage === "first-frame" ? mountReadiness.firstFrame.promise : mountReadiness.renderer.promise, readinessOptions.signal);
    },
    async readyStrict(readinessOptions: AuraReadinessOptions = {}) {
      const outcome = await app.readiness(readinessOptions);
      if (outcome.state === "ready") return outcome;
      const message = outcome.state === "failed" ? outcome.message : `Aura3D readiness ${outcome.state}.`;
      const error = new Error(message);
      error.name = outcome.state === "cancelled" ? "AbortError" : "AuraReadinessError";
      Object.assign(error, { code: outcome.state === "failed" ? outcome.code : outcome.state });
      throw error;
    },
    onRenderTermination(listener) {
      if (disposed) return () => {};
      renderTerminationListeners.add(listener);
      return () => { renderTerminationListeners.delete(listener); };
    },
    renderTermination() {
      return currentRenderTermination;
    },
    onDeviceLost(listener) {
      // Attach now when a device already exists; otherwise the mount handler attaches it on arrival.
      deviceLostListeners.set(listener, activeRendererBackend === "webgpu" ? undefined : productionController?.onDeviceLost?.(listener));
      return () => {
        // Read the CURRENT subscription: a re-mount may have replaced the one captured at registration.
        deviceLostListeners.get(listener)?.();
        deviceLostListeners.delete(listener);
      };
    },
    onDeviceRestored(listener) {
      deviceRestoredListeners.set(listener, activeRendererBackend === "webgpu" ? undefined : productionController?.onDeviceRestored?.(listener));
      // Keep the engine's restore remount after the app's handlers.
      if (productionController) attachRestoreRemount(productionController);
      return () => {
        deviceRestoredListeners.get(listener)?.();
        deviceRestoredListeners.delete(listener);
      };
    },
    deviceLost() {
      return pendingWebGPURecovery !== undefined || (productionController?.deviceLost?.() ?? false);
    },
    advance(dt = 1 / 60) {
      assertMutableFrame();
      const seconds = Math.max(0, dt);
      const revision = mountRevision;
      runRuntimeFrame(seconds, "manual");
      if (disposed || revision !== mountRevision) return;
      stepCanvasPhysics(seconds);
      // Imported GLB animation, consumed root motion and foot planting live in the
      // production actor bridge. They are simulation state, so `advance()` must
      // update them even when no GPU frame is presented.
      productionController?.update?.(runtimeTime * 1000);
    },
    step(dt = 1 / 60) {
      assertMutableFrame();
      const seconds = Math.max(0, dt);
      const revision = mountRevision;
      app.advance(seconds);
      if (disposed || revision !== mountRevision) return;
      const previousPaused = runtimePaused;
      runtimePaused = true;
      /*
       * Render at the *simulated* time, not wall-clock time.
       *
       * `step(dt)` is the deterministic entry point — a caller advances a fixed amount and expects a
       * reproducible frame. Passing `performanceNow()` to the renderer defeated that: any
       * time-driven shader or effect sampled real elapsed milliseconds, so the same `step` sequence
       * produced a different image on every run.
       *
       * Measured while making screenshot approval satisfiable: after zeroing the runtime clock and
       * stepping identically, 6 of 29 screenshots still drifted perceptually — all of them routes
       * with time-animated rendering (particle lab, material inspector). Feeding `runtimeTime`
       * instead makes `step` mean one thing.
       *
       * The live `render()` loop still uses wall-clock time, which is correct for real playback.
       */
      const simulatedMs = runtimeTime * 1000;
      try {
      if (productionController) {
        productionController.render(simulatedMs);
      } else if (productionMountPending || productionMountFailed) {
        /*
         * WS-2.9 — a WebGL mount is in flight, so there is nothing correct to draw yet.
         *
         * Falling through to the Canvas-2D `render()` branch below would draw a gradient for a scene
         * that has a WebGL renderer coming, which is worse than drawing nothing: it produces a frame
         * that looks like a real render and is not one. Measured before this fix: eight synchronous
         * `step(1/60)` calls after construction gave `drawCalls: 0`, a fully blank canvas,
         * `backend: "webgl2"` and — the actual defect — **empty `warnings` and `errors`**. One
         * `await requestAnimationFrame` first gave 58,480 lit pixels.
         *
         * So this reports rather than renders. The warning is actionable and names both the cause and
         * the fix, because a developer writing a headless capture has no way to guess that a
         * documented deterministic entry point depends on an animation frame having elapsed.
         */
        const pendingWarning = productionMountFailed
          ? "Aura3D step() rendered nothing because the WebGL renderer failed to mount for this scene. It will NOT fall back to the Canvas 2D diagnostic preview, because that paints a gradient schematic over a scene whose renderer just failed. Suggested fix: read diagnostics().errors for the underlying device failure."
          : "Aura3D step() was called before the WebGL renderer finished mounting, so this frame rendered nothing. The production renderer mounts asynchronously. Suggested fix: await one animation frame — `await new Promise(requestAnimationFrame)` — or await `app.ready()` before stepping, then call step() as normal.";
        if (!diagnosticsState.warnings.includes(pendingWarning)) diagnosticsState.warnings.push(pendingWarning);
        diagnosticsState.drawCalls = 0;
        overlay?.update();
      } else {
        /*
         * `render` records `lastTime` to derive its own delta. Feeding it simulated time would leave
         * `lastTime` in a different clock from `performanceNow()`, so the first frame after a
         * `resume()` would compute a wildly wrong delta — a visible jump. Restore it afterwards so
         * `step` stays side-effect-free with respect to live playback.
         */
        const previousLastTime = lastTime;
        try { render(simulatedMs); }
        finally { lastTime = previousLastTime; }
      }
      } finally { runtimePaused = previousPaused; }
      // A callback may have been registered while this explicit render held
      // the clock paused. Resume automatic frames only if the app was running.
      if (!runtimePaused && !xrOwnsFrames && !disposed && options.autoStart !== false && frameCallbacks.size > 0) {
        productionController?.invalidate?.();
      }
    },
    stepAsync(dt = 1 / 60) {
      if (!Number.isFinite(dt) || dt < 0) return Promise.reject(new Error("Aura3D stepAsync requires a finite non-negative delta."));
      if (disposed) return Promise.reject(new Error("Aura3D app is disposed."));
      pendingAsyncSteps += 1;
      const next = asyncSteps.then(async () => {
        await productionMountSettled;
        if (disposed) throw new Error("Aura3D app is disposed.");
        const controller = productionController;
        if (productionMountFailed || !controller?.renderAsync) {
          throw new Error(`Aura3D asynchronous submission unavailable: ${diagnosticsState.errors.join("; ") || "a production renderer is required"}`);
        }
        await controller.renderAsync(() => {
          const revision = mountRevision;
          runRuntimeFrame(dt, "manual");
          if (!disposed && revision === mountRevision) stepCanvasPhysics(dt);
          return runtimeTime * 1000;
        });
      }).finally(() => { pendingAsyncSteps -= 1; releaseCanvasIfRetired(); });
      asyncSteps = next.catch(() => undefined);
      return next;
    },
    async disposeAsync() {
      // Observe before dispose(), including reentrant calls made while the
      // app is publishing its terminal event and has not retired a controller
      // yet. Each waiter keeps the attempt it saw, even if another call retries.
      const attempts = new Map<ControllerRetirement, Promise<void>>();
      const observe = (state: ControllerRetirement): void => {
        if (!attempts.has(state)) attempts.set(state, state.current);
      };
      retirementObservers.add(observe);
      try {
        if (!disposed) app.dispose();
        else if (!disposingApp) {
          // Await an existing attempt rather than implicitly queuing a retry.
          // A settled failure, however, makes a later disposeAsync() a retry.
          disposingApp = true;
          try { retryControllerRetirements(false); } finally { disposingApp = false; }
        }
        for (const state of retainedRetirements) observe(state);
        const failures: unknown[] = [];
        await asyncSteps;
        const mounts = await Promise.allSettled([...mountTasks]);
        for (const result of mounts) if (result.status === "rejected") failures.push(result.reason);
        for (const state of retainedRetirements) observe(state);
        const awaited = new Set<Promise<void>>();
        for (;;) {
          const batch = [...attempts.values()].filter((attempt) => !awaited.has(attempt));
          if (!batch.length) break;
          for (const attempt of batch) awaited.add(attempt);
          const results = await Promise.allSettled(batch);
          for (const result of results) if (result.status === "rejected") failures.push(result.reason);
        }
        failures.push(...appCleanupFailures);
        if (formatRegistry || canvasAdmissionExclusive) {
          const { awaitTypedGLBActorDisposals } = await import("../../production-runtime/TypedGLBActor.js");
          try { await awaitTypedGLBActorDisposals(runtimeOwner); }
          catch (error) {
            // A retried disposal can surface the same actor failure through
            // its retirement and this drain; report that failure only once.
            if (!cleanupFailureReported(failures, error)) failures.push(new Error(productionRenderErrorMessage(error), { cause: error }));
          }
        }
        releaseCanvasIfRetired();
        if (canvasAdmissionDrain) {
          try { await canvasAdmissionDrain; } catch { /* actor failure is reported above */ }
        }
        const distinctFailures = distinctCleanupFailures(failures);
        if (distinctFailures.length === 1) throw distinctFailures[0];
        if (distinctFailures.length) throw new AggregateError(distinctFailures, "Aura3D app cleanup failed", { cause: distinctFailures[0] });
      } finally {
        retirementObservers.delete(observe);
      }
    },
    diagnostics() {
      const rendererBusy = pendingAsyncSteps > 0 || Boolean(productionController?.busy?.());
      const rendererSnapshot = readRootDiagnosticSnapshot(
        diagnosticsState.renderer,
        productionController?.diagnostics,
        disposed,
        rendererBusy
      );
      diagnosticsState.renderer = rendererSnapshot;
      // Extract these from the current completed renderer report before the
      // rest of that report consumes its independent sanitization budget.
      const lightWarnings = rendererSnapshot.warnings.filter((warning) =>
        warning.includes("LIGHT_MODULATION_UNSUPPORTED:") || warning.includes("PHOTOMETRIC_PROFILE_UNSUPPORTED:") ||
        warning.includes("PROJECTED_SPOT_UNSUPPORTED:") || warning.includes("PROJECTED_SPOT_LOAD_FAILED:"));
      const snapshot = snapshotDiagnostics(diagnosticsState, shaderFailures);
      // Independently sanitize both copies, retaining their view/frame detail
      // without bypassing the normal text, size or redaction limits.
      const sanitizedRenderer = snapshot.renderer;
      const report = lightWarnings.length ? {
        ...snapshot,
        warnings: sanitizeDiagnosticValue([...new Set([...lightWarnings, ...diagnosticsState.warnings])]) as readonly string[],
        ...(sanitizedRenderer ? { renderer: {
          ...sanitizedRenderer,
          warnings: sanitizeDiagnosticValue(rendererSnapshot.warnings) as readonly string[],
          runtime: sanitizedRenderer.runtime && typeof sanitizedRenderer.runtime === "object"
            ? { ...sanitizedRenderer.runtime, warnings: sanitizeDiagnosticValue(rendererSnapshot.runtime.warnings) as readonly string[] }
            : sanitizedRenderer.runtime
        } } : {})
      } : snapshot;
      // The rest of the report intentionally keeps the last completed frame
      // while busy or disposed. Its old canvas color is not an active value.
      const outputUnavailable = disposed || rendererBusy || !productionController || Boolean(currentRenderTermination);
      const currentReport = outputUnavailable && report.renderer
        ? { ...report, renderer: { ...report.renderer, outputColorSpace: "unknown" as const } }
        : report;
      for (const section of diagnosticsSectionsAll()) {
        const collected = sanitizeDiagnosticValue(section.collect(app));
        // A queued async step can be busy before the device has a frame token.
        // Do not let the output section expose its prior canvas/pass as current
        // when the main renderer report has already masked that observation.
        (currentReport as unknown as Record<string, unknown>)[section.key] =
          section.id === "prd01.output" && outputUnavailable && collected && typeof collected === "object" && !Array.isArray(collected)
            ? { ...collected, configured: null, effective: null, applied: (collected as Record<string, unknown>).applied === null ? null : {},
                colorSpace: { active: "unknown" }, toneMapping: null, exposure: null, dithering: null, targetFormat: null, degraded: null }
            : collected;
      }
      return currentReport;
    },
    evidence(evidenceOptions = {}) {
      return collectGameRuntimeEvidenceV105(
        {
          runtime: {
            paused: runtimePaused,
            frame: runtimeFrame,
            time: runtimeTime,
            fixedDt: runtimeFixedDt,
            alpha: runtimeAlpha
          },
          nodes: runtimeNodes
        },
        evidenceOptions
      );
    },
    screenshot() {
      /*
       * `toDataURL` reads the drawing buffer, which the browser clears after presenting a frame unless
       * the context was created with `preserveDrawingBuffer` (capture/evidence runs only). Called in a
       * later task than the one that rendered, it returned a blank PNG (measured: 0 non-background
       * pixels on both render paths). Re-render the current state synchronously first so the buffer is
       * populated in this task. Rendering uses the app's simulated clock, the same as `step()`.
       */
      if (productionController && !disposed && !productionController.busy?.()) {
        productionController.render(runtimeTime * 1000);
      } else if (productionController && !disposed) {
        /*
         * RP-08: an async frame is in flight, so a synchronous render would throw and the buffer may be cleared or half drawn.
         * Say so instead of returning a possibly blank image silently; `screenshotAsync()` waits for the frame.
         */
        const warning = "SCREENSHOT_DURING_ASYNC_FRAME: app.screenshot() was called while an async frame was in flight, so it could not re-render and may return a cleared canvas. Use await app.screenshotAsync().";
        if (!diagnosticsState.warnings.includes(warning)) diagnosticsState.warnings.push(warning);
      }
      return captureAuraScreenshot(canvas);
    },
    async screenshotAsync() {
      // RP-08: wait for pending stepAsync() calls and the controller's in-flight frame, then re-render and read in one task.
      await asyncSteps;
      await productionController?.whenIdle?.();
      if (productionController && !disposed && !productionController.busy?.()) {
        productionController.render(runtimeTime * 1000);
      }
      return captureAuraScreenshot(canvas);
    },
    dispose() {
      if (disposingApp) return;
      disposingApp = true;
      try {
        if (disposed) {
          // Coalesce an explicit retry request behind any in-flight work. If
          // that work succeeds, the queued request performs no extra cleanup.
          retryControllerRetirements(true);
          return;
        }
        disposed = true;
        frameCallbacks.clear();
        const failures: unknown[] = [];
        const recordFailure = (error: unknown): void => {
          failures.push(error);
          appCleanupFailures.push(error);
        };
        const cleanup = (fn: (() => void) | undefined) => {
          if (!fn) return;
          try { fn(); } catch (error) { recordFailure(error); }
        };
        // Close asset ownership before any user/extension callback can
        // reenter disposal or publish progress for an unfinished request.
        cleanup(rootAppRegistration?.release);
        cleanup(() => unbindAppAssetEventScope(app));
        cleanup(() => unbindAppAssetEventScope(runtimeOwner));
        // Close before invoking extension callbacks: they may reenter disposal.
        // These are one-shot owners, so attempt every sibling and retain each
        // failure for disposeAsync() instead of losing the remaining callbacks.
        for (const disposeExt of extensionDisposers.splice(0)) cleanup(disposeExt);
        for (const releaseVeto of [...liveVetoReleases]) cleanup(releaseVeto);
        pendingWebGPURecovery = undefined;
        publishRenderTermination({ state: "disposed", revision: mountRevision }, true, true);
        cleanup(() => productionMountAbort?.abort());
        productionMountAbort = undefined;
        revokeCurrentPrd07Authority = undefined;
        mountReadiness.settle({ state: "disposed" });
        /*
         * Settle any in-flight mount so `await app.ready()` cannot hang on a disposed app. A promise
         * that never resolves is a worse failure than the one WS-2.9 fixed: it has no diagnostic at all.
         */
        productionMountPending = false;
        settleMountForDispose();
        cleanup(() => disposeAtmosphereExtension(app));
        cleanup(() => parityL7XR.dispose());
        cleanup(() => appCompute.dispose());
        cleanup(() => { for (const error of disposeActorAnimationContext(actorAnimationContext)) recordFailure(error); });
        cleanup(() => clearTypedGLBActorQrFlags(runtimeOwner));
        cleanup(releaseWorldFlags);
        cleanup(releaseAppWorldFlags);
        cleanup(releaseMatrixCache);
        cleanup(releaseColorPolicy);
        for (const unsubscribe of [...deviceLostListeners.values(), ...deviceRestoredListeners.values()]) cleanup(unsubscribe);
        deviceLostListeners.clear();
        deviceRestoredListeners.clear();
        cleanup(restoreRemountUnsubscribe);
        restoreRemountUnsubscribe = undefined;
        cleanup(internalDeviceLostUnsubscribe);
        internalDeviceLostUnsubscribe = undefined;
        if (animationHandle && typeof cancelAnimationFrame !== "undefined") cleanup(() => cancelAnimationFrame(animationHandle));
        for (const controller of ownedInputControllers) cleanup(() => controller.dispose());
        ownedInputControllers.clear();
        cleanup(() => canvasRuntimePhysics?.dispose());
        cleanup(() => appPhysicsWorldInstance?.dispose());
        cleanup(() => { void retireController(productionController); });
        productionController = undefined;
        cleanup(() => runtimeNodes.dispose());
        cleanup(() => overlay?.dispose());
        cleanup(() => unregisterAuraApp(app));
        for (const error of failures.slice(0, 32)) diagnosticsState.errors.push(`DISPOSE_FAILED: ${productionRenderErrorMessage(error)}`);
        if (canvasAdmissionExclusive && failures.length) canvasAdmissionQuarantined = true;
      } finally {
        disposingApp = false;
        releaseCanvasIfRetired();
      }
    }
  };
  startupApp = app;
  bindActorAnimationContext(app, actorAnimationContext);
  const releaseAppWorldFlags = setWorldBuilderFlags(qrFlags, app);
  bindAppAssetEventScope(app, assetEventScope);
  const findRuntimeNodePath = (
    nodes: readonly AuraSceneNode[],
    id: string,
    ancestors: readonly string[] = [],
    groups: readonly AuraSceneNode[] = []
  ): { readonly node: AuraSceneNode; readonly ancestors: readonly string[]; readonly groups: readonly AuraSceneNode[] } | undefined => {
    for (const node of nodes) {
      const runtimeId = "runtime" in node ? node.runtime?.id : undefined;
      if (runtimeId === id) return { node, ancestors, groups };
      if (node.kind === "group") {
        const next = runtimeId === undefined || ancestors.includes(runtimeId) ? ancestors : [...ancestors, runtimeId];
        const found = findRuntimeNodePath(node.children, id, next, [...groups, node]);
        if (found) return found;
      }
    }
    return undefined;
  };
  // C-37 (PRD 15 T3.12): the registry's add/remove path needs the live scene —
  // flag-off appends to the snapshot and remounts via setScene (with the
  // RUNTIME_ADD_REMOUNT diagnostic); flag-on with a mounted compiled scene takes
  // the subtree-compile path bound by compiler/renderer.ts.
  runtimeNodes.configure({
    flags: qrFlags,
    app,
    getScene: () => snapshot,
    setScene: (next) => app.setScene(next),
    diagnostic: (message) => { diagnosticsState.warnings = [...diagnosticsState.warnings, message]; },
    prepareCompiledPhysicsAdd: (node, parentId, currentScene, parentGroups) => {
      const parent = parentId === undefined || !currentScene ? undefined : findRuntimeNodePath(currentScene.nodes, parentId);
      // The compiler retains the whole authored slot on an implicit group
      // replacement; explicit parent insertion is a direct child of that group.
      const groups = parentGroups ?? (parent?.node.kind === "group" ? [...parent.groups, parent.node] : []);
      let root = node;
      for (const ancestor of [...groups].reverse()) {
        if (ancestor.kind === "group") root = { ...ancestor, children: [root] };
      }
      const roots: readonly AuraSceneNode[] = [root];
      assertScenePhysicsPivotSupport(roots);
      const prefix = parent && parent.node.kind !== "group" ? [...parent.ancestors, parentId!] : [];
      const candidate = { ...(currentScene ?? snapshot), nodes: qrFlags.on("A3D_QR_CORE")
        ? flattenAuraSceneNodes(roots, qrFlags) : flattenNodesWithLineWorldMatrices(roots) };
      return stageDeclaredBodies(candidate, roots, { prefix, replaceIds: subtreeRuntimeIds(node) });
    },
    prepareCompiledPhysicsRemove: (runtimeIds) => {
      const removed = new Set(runtimeIds);
      // Capture IDs now: compiler disposal can synchronously add a new subtree
      // with the same runtime ID, which must survive this older removal.
      const bodyIds = [...appPhysicsBodyOwners].filter(([, paths]) => paths.some((id) => removed.has(id))).map(([id]) => id);
      const batches = new Set([...appPhysicsInstanceBatches].filter((batch) => batch.owners.some((id) => removed.has(id))));
      return () => {
        retireInstanceBatches((batch) => batches.has(batch));
        retireDeclaredBodies([...bodyIds, ...[...batches].flatMap((batch) => batch.bodyIds)]);
      };
    }
  });
  for (const ext of appExtensionsAll()) {
    const value = ext.create(app, { flags: qrFlags, options });
    (app as unknown as Record<string, unknown>)[ext.member] = value;
    if (ext.dispose) { const disposeExt = ext.dispose; extensionDisposers.push(() => disposeExt(value)); }
  }
  // Seal only after C-38 extensions have attached the app's effect system and
  // bridge. The mount supplier is evaluated later, after renderer creation.
  bindPrd07AppRuntimeOwner(app, runtimeOwner);
  bindAtmosphereRuntimeOwner(app, runtimeOwner);
  // The public app can name an owned base only after its runtime owner is sealed.
  rootAppRegistration?.bindApp(app);
  // PRD-03 Phase 4 (C-13/C-14): flattened app-level members. `app.post` was
  // assigned by the extension loop; cutCamera binds the controller's C-14
  // reset so the camera extension's onCut hook invalidates temporal history.
  const postSurface = (app as { post?: { addPostPass?: (p: import("../../contracts/post.js").AuraCustomPostPass) => () => void; setQualityTier?: (t: AuraQualityTier | "auto") => void } }).post;
  /*
   * RP-03: a custom post pass needs the post chain, which the direct path does not have, and the path was chosen at mount
   * (before any addPostPass call could run). On a direct-path canvas, keep the canvas off the direct path while the pass is
   * registered and remount, carrying over nodes added at runtime, so the pass runs.
   */
  // GU47 phase 2: the vetoes live as long as the pass or the app, whichever ends first (a disposed app's veto kept a later
  // app on the same canvas off the direct path for a pass that no longer existed).
  if (postSurface?.addPostPass && canvas) {
    const addPostPass = postSurface.addPostPass.bind(postSurface);
    postSurface.addPostPass = (pass) => {
      const release = addPostPass(pass);
      const vetoRelease = vetoDirectPath(canvas, `custom post pass "${pass.name}"`);
      const releaseVeto = (): void => { liveVetoReleases.delete(releaseVeto); vetoRelease(); };
      liveVetoReleases.add(releaseVeto);
      if (isDirectRenderPath(canvas) && !disposed) {
        const remount = (): void => {
          if (disposed) return;
          app.setScene(runtimeNodes.sceneWithRuntimeAdditions() ?? snapshot);
          // After setScene: the remount resets the warning list.
          diagnosticsState.warnings.push(`DIRECT_PATH_REMOUNT: custom post pass "${pass.name}" needs the HDR target; the scene was remounted so it runs.`);
        };
        if (pendingAsyncSteps > 0 || productionController?.busy?.()) void asyncSteps.then(() => productionController?.whenIdle?.()).then(remount);
        else remount();
      }
      return () => { releaseVeto(); release(); };
    };
  }
  (app as { addPostPass?: (p: import("../../contracts/post.js").AuraCustomPostPass) => () => void }).addPostPass =
    (p) => postSurface?.addPostPass?.(p) ?? (() => { /* stub */ });
  (app as { setQualityTier?: (t: AuraQualityTier | "auto") => void }).setQualityTier =
    (t) => { postSurface?.setQualityTier?.(t); };
  (app as { cutCamera?: () => void }).cutCamera = () => {
    productionController?.resetTemporalHistory?.("camera-cut");
  };
  registerAuraApp(app);
  // #1131: diagnostics read the canvas size through this slot, not screenshot().
  Object.defineProperty(app, AURA_APP_CANVAS, { value: canvas, enumerable: false });
  return app;
  } catch (error) {
    // No app was returned to own these worlds. Keep the original failure if
    // cleanup succeeds, while still attempting both independent disposals.
    const failures: unknown[] = [error];
    try { rootAppRegistration?.release(); } catch (cleanupError) { failures.push(cleanupError); }
    try { startupAssetScope?.dispose(); } catch (cleanupError) { failures.push(cleanupError); }
    try { abortStartupMount?.(); } catch (cleanupError) { failures.push(cleanupError); }
    // Factories that completed before a later startup failure still own their
    // callbacks and bridges. Retire only this app's registrations, even if a
    // cleanup callback synchronously constructs a replacement app.
    for (const disposeExt of extensionDisposers.splice(0)) {
      try { disposeExt(); } catch (cleanupError) { failures.push(cleanupError); }
    }
    if (startupApp) {
      try { disposeAtmosphereExtension(startupApp); } catch (cleanupError) { failures.push(cleanupError); }
      try { disposePrd07SystemFor(startupApp); } catch (cleanupError) { failures.push(cleanupError); }
    }
    try { initialRuntimePhysics?.dispose(); } catch (cleanupError) { failures.push(cleanupError); }
    try { appPhysicsWorldInstance?.dispose(); } catch (cleanupError) { failures.push(cleanupError); }
    try {
      if (canvasAdmissionExclusive && failures.length > 1) canvasAdmissionQuarantined = true;
      if (releaseAdmissionAfterStartupFailure) releaseAdmissionAfterStartupFailure();
      else canvasAdmission?.release();
    } catch (cleanupError) { failures.push(cleanupError); }
    if (failures.length > 1) throw new AggregateError(failures, "Could not initialize or dispose app physics.");
    throw error;
  }
}

/** onFrame error text: the redacted Error message (4.2.0 format); other values and hostile accessors use the diagnostic formatter. */
function frameCallbackErrorText(error: unknown): string {
  if (error instanceof Error) {
    try {
      const message: unknown = error.message;
      if (typeof message === "string") return sanitizeDiagnosticText(message);
    } catch {
      // Fall through to the accessor-safe formatter.
    }
  }
  return productionRenderErrorMessage(error);
}
