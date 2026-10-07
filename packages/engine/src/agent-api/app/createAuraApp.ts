// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import { computeRuntimeAlpha } from "./frameAlpha.js";
import type { AuraApp, AuraAppTarget, AuraBackend, AuraCreateAppOptions, AuraFrameCallback, AuraFrameInfo, AuraModelNode, AuraPrimitiveNode, AuraSceneSnapshot, WebGLRenderController } from "../index.js";
import { AuraRuntimeError, captureAuraScreenshot, collectAuraSceneEvidence, configureCanvas, createDiagnosticsOverlay, createInitialDiagnostics, createRuntimeScenePhysics, devicePixelRatioSafe, eulerToQuat, flattenSceneSnapshot, isWebGLRenderableNode, markRouteError, markRouteReady, normalizeSceneSnapshot, performanceNow, physics, productionRenderErrorMessage, registerAuraApp, renderDiagnosticPreviewToCanvas, renderer, resolveCanvas, resolveNodePhysicsShape, scene, shouldRenderOverlay, snapshotDiagnostics, startProductionRender, unregisterAuraApp, validateSceneAssets } from "../index.js";
import { collectGameRuntimeEvidence as collectGameRuntimeEvidenceV105 } from "../GameEvidence.js";
import { createGameInput } from "../GameRuntime.js";
import { createPhysicsRuntime, type AuraPhysicsRuntime } from "../PhysicsRuntime.js";
import { applyRootParticleQuality, hasRootRenderableContent, initializeRootPerformanceQuality, readRootDiagnosticSnapshot, setRootPerformanceQuality, supportsRootParticleQuality, validateRootPerformanceQuality } from "../RootRuntimeSupport.js";
import { PhysicsWorld } from "@aura3d/physics/world";
import { normalizeCreateAppRendererOptions } from "./rendererOptions.js";
import { resolveQrFlags } from "../../contracts/flags.js";
import { appExtensionsAll } from "../../contracts/app.js";
import { diagnosticsSectionsAll } from "../../contracts/diagnostics.js";
import { resolveTierSettings } from "@aura3d/rendering/contracts";
import { createAuraRuntimeNodeRegistry } from "./runtimeNodes.js";
import { setPrd01ModelMatrixCache } from "../compiler/renderInput.js";
import { createModelMatrixCache } from "../sceneGraph.js";
import { collectGeneratedCodeWarnings } from "../looks/generatedCodeWarnings.js";
import { material } from "../nodes/material.js";

export function createAuraApp(target: AuraAppTarget, options: AuraCreateAppOptions): AuraApp {
  let snapshot = normalizeSceneSnapshot(options.scene);
  let renderSnapshot = flattenSceneSnapshot(snapshot);
  const rendererSelection = normalizeCreateAppRendererOptions(options.renderer);
  // PR 0 seams (CONTRACTS.md §3.2): flag resolution, C-27 quality-tier resolve, C-38
  // app-extension mount and C-31 diagnostics sections are fixed call sites owned by PRD 15.
  const qrFlags = resolveQrFlags({ options: options.qualityRebuild?.flags });
  // PRD-01 §15 Phase-6: install the fingerprinted static-node matrix cache on
  // the compiler seam. Flag-off leaves renderInput on verbatim calls (C-01).
  setPrd01ModelMatrixCache(qrFlags.on("A3D_QR_CORE") ? createModelMatrixCache() : null);
  const qrQualityTier = resolveTierSettings("high");
  void qrQualityTier;
  const diagnosticsState = createInitialDiagnostics(renderSnapshot, options.renderer);
  const canvas = resolveCanvas(target);
  if (canvas) {
    const pixelRatioOption = typeof options.pixelRatio === "number" ? options.pixelRatio : options.pixelRatio?.max ?? undefined;
    configureCanvas(canvas, pixelRatioOption ?? rendererSelection.profile.pixelRatio ?? devicePixelRatioSafe(), options.resize ?? true);
    initializeRootPerformanceQuality(canvas);
    // Apply a caller's device/capture budget before the production controller
    // derives its first backing size, LODs, particle pool and shadow target.
    // Runtime mutations remain guarded by app.setPerformanceQuality().
    if (options.performanceQuality) setRootPerformanceQuality(canvas, options.performanceQuality);
  }
  const overlay = canvas && shouldRenderOverlay(options.diagnostics, snapshot) ? createDiagnosticsOverlay(canvas, diagnosticsState) : undefined;
  let disposed = false;
  let animationHandle = 0;
  let productionController: WebGLRenderController | undefined;
  let pendingAsyncSteps = 0;
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
  let productionMountTask: Promise<void> = Promise.resolve();
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
  const attachDeviceListeners = (controller: WebGLRenderController): void => {
    for (const [listener, unsubscribe] of deviceLostListeners) {
      unsubscribe?.();
      deviceLostListeners.set(listener, controller.onDeviceLost?.(listener));
    }
    for (const [listener, unsubscribe] of deviceRestoredListeners) {
      unsubscribe?.();
      deviceRestoredListeners.set(listener, controller.onDeviceRestored?.(listener));
    }
  };
  let lastTime = 0;
  let mountRevision = 0;
  let canvasRuntimePhysics: ReturnType<typeof createRuntimeScenePhysics> | undefined;
  const runtimeNodes = createAuraRuntimeNodeRegistry(renderSnapshot);
  // One world owned by the app, so `app.physics` is live whether or not the scene declared
  // any bodies. A route that spawns everything at runtime (a shooter, a stacking puzzle) is
  // then no harder to write than one that declares bodies up front.
  const appPhysicsNodeNames = new Map<number, string>();
  /*
   * The physics world is created on first use, not on app construction.
   *
   * `app.physics` must be live for every app — a route that spawns bodies at runtime should be no
   * harder to write than one that declares them. But constructing the world eagerly made **every**
   * app pay for the selected physical solver.
   *
   * Measured cost of the eager version: a minimal `createAuraApp` scene containing one box bundled to
   * The eager version made the physical runtime part of every route's startup path, including
   * routes that never created a body.
   *
   * Lazily constructing it changes no behaviour — `app.physics` still returns a working runtime, and
   * a scene that declares `.physics({...})` still gets its bodies registered, because
   * `registerDeclaredBodies` asks for the world and therefore creates it. What changes is that a
   * scene with no physics never instantiates a solver, so a bundler can drop it.
   */
  let appPhysicsWorldInstance: PhysicsWorld | undefined;
  const appPhysicsWorld = (): PhysicsWorld => {
    appPhysicsWorldInstance ??= new PhysicsWorld({
      gravity: options.physics?.gravity ? [...options.physics.gravity] : [0, -9.81, 0],
      fixedDelta: 1 / 60,
      enableSleeping: true,
      ...(options.physics?.seed === undefined ? {} : { seed: options.physics.seed }),
      ...(options.physics?.continuousCollision ? { continuousCollision: options.physics.continuousCollision } : {})
    });
    return appPhysicsWorldInstance;
  };
  let appPhysicsInstance: AuraPhysicsRuntime | undefined;
  /** Lazy `app.physics`. Identity is stable: the same runtime is returned on every access. */
  const appPhysics = (): AuraPhysicsRuntime => {
    appPhysicsInstance ??= createPhysicsRuntime(appPhysicsWorld(), {
      ...(options.physics?.layers ? { layers: options.physics.layers } : {}),
      nodeNameFor: (bodyId) => appPhysicsNodeNames.get(bodyId)
    });
    return appPhysicsInstance;
  };
  /**
   * Register scene-declared bodies into the app-owned world.
   *
   * Runs on construction and on every `setScene`, so a declared node name resolves through
   * `app.physics.bodies.require(name)` without the route restating the body.
   */
  const registerDeclaredBodies = (target: AuraSceneSnapshot) => {
    // Ask the question before creating the world, so a scene with no declared bodies never does.
    const declaresPhysics = target.nodes.some(
      (node) => (node.kind === "model" || node.kind === "primitive") && Boolean(node.physics)
    );
    if (!declaresPhysics) return;
    const world = appPhysicsWorld();
    for (const node of target.nodes) {
      if ((node.kind !== "model" && node.kind !== "primitive") || !node.physics) continue;
      const spec = node.physics;
      const body = world.createRigidBody({
        type: spec.type ?? "dynamic",
        position: node.position ?? [0, 0, 0],
        rotation: eulerToQuat(node.rotation ?? [0, 0, 0]),
        ...(spec.mass === undefined ? {} : { mass: spec.mass }),
        ...(spec.friction === undefined ? {} : { friction: spec.friction }),
        ...(spec.restitution === undefined ? {} : { restitution: spec.restitution })
      });
      world.createCollider(body, {
        shape: resolveNodePhysicsShape(node as AuraModelNode | AuraPrimitiveNode, spec),
        ...(spec.sensor === undefined ? {} : { sensor: spec.sensor }),
        material: { friction: spec.friction ?? 0.5, restitution: spec.restitution ?? 0 }
      });
      if (node.name) appPhysicsNodeNames.set(body.id, node.name);
    }
  };
  registerDeclaredBodies(renderSnapshot);
  const frameCallbacks = new Set<AuraFrameCallback>();
  let runtimePaused = options.autoStart === false;
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
    for (const callback of [...frameCallbacks]) callback(frame);
  };
  const shouldUseProductionRendererForCurrentScene = () =>
    Boolean(canvas && hasRootRenderableContent(canvas, renderSnapshot.nodes.some(isWebGLRenderableNode)) && typeof window !== "undefined");
  const resetDiagnosticsForCurrentScene = (backend: AuraBackend) => {
    const fresh = createInitialDiagnostics(renderSnapshot, options.renderer);
    diagnosticsState.backend = backend;
    diagnosticsState.fps = fresh.fps;
    diagnosticsState.drawCalls = fresh.drawCalls;
    diagnosticsState.renderSize = fresh.renderSize;
    diagnosticsState.assets = [];
    diagnosticsState.evidence = fresh.evidence;
    diagnosticsState.renderer = fresh.renderer;
    diagnosticsState.warnings = [...fresh.warnings];
    diagnosticsState.errors = [];
    validateSceneAssets(renderSnapshot, diagnosticsState.assets);
    diagnosticsState.warnings.push(...collectGeneratedCodeWarnings(renderSnapshot));
  };
  const render = (time = performanceNow()) => {
    if (disposed) return;
    const delta = lastTime > 0 ? Math.max(1, time - lastTime) : 16.67;
    lastTime = time;
    const dt = delta / 1000;
    if (!runtimePaused) {
      runRuntimeFrame(dt, "raf");
      canvasRuntimePhysics?.step(dt);
    }
    diagnosticsState.evidence = collectAuraSceneEvidence(renderSnapshot);
    diagnosticsState.fps = Math.round(1000 / delta);
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
  const mountCurrentScene = () => {
    if (disposed) return;
    if (animationHandle && typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(animationHandle);
    animationHandle = 0;
    productionController?.dispose();
    productionController = undefined;
    lastTime = 0;
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
    const declaresRenderableContent = hasRootRenderableContent(canvas, renderSnapshot.nodes.some(isWebGLRenderableNode));
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
    canvasRuntimePhysics = shouldUseProductionRenderer ? undefined : createRuntimeScenePhysics(renderSnapshot);
    overlay?.update();
    const revision = ++mountRevision;
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
    productionMountSettled = productionMountPending
      ? new Promise<void>((resolveSettled) => { settleMount = resolveSettled; })
      : Promise.resolve();
    settleMountForDispose = settleMount;
    if (shouldUseProductionRenderer && canvas) {
      productionMountTask = startProductionRender(
        canvas,
        renderSnapshot,
        diagnosticsState,
        options,
        overlay,
        runRuntimeFrame,
        () => runtimePaused,
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
        () => runtimeTime * 1000
      )
        .then((controller) => {
          if (disposed || revision !== mountRevision) {
            settleMount();
            controller.dispose();
            return;
          }
          productionController = controller;
          productionMountPending = false;
          // PRD-01 Q-15-1 seam: hang the live `Renderer` for lane diagnostics
          // and the C-05 output surface (`prd01.output` extension reads it).
          const auraRenderer = (controller as { auraRenderer?: unknown }).auraRenderer;
          if (auraRenderer) {
            (app as unknown as Record<symbol, unknown>)[Symbol.for("a3d.prd01.renderer")] = auraRenderer;
          }
          attachDeviceListeners(controller);
          settleMount();
          markRouteReady(snapshot, diagnosticsState);
        })
        .catch((error: unknown) => {
          settleMount();
          if (disposed || revision !== mountRevision) return;
          productionMountPending = false;
          productionMountFailed = true;
          settleMount();
          diagnosticsState.backend = "webgl2";
          diagnosticsState.errors.push(productionRenderErrorMessage(error));
          overlay?.update();
          markRouteError(snapshot, diagnosticsState);
        });
      return;
    }
    render();
    markRouteReady(snapshot, diagnosticsState);
  };
  mountCurrentScene();
  const app: AuraApp & { resetRuntimeClock(): void } = {
    canvas,
    get scene() {
      return snapshot;
    },
    get backend() {
      return diagnosticsState.backend;
    },
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
      snapshot = normalizeSceneSnapshot(nextScene);
      renderSnapshot = flattenSceneSnapshot(snapshot);
      runtimeNodes.reset(renderSnapshot);
      // Drop bodies from the previous scene before registering the new ones, so swapping
      // scenes does not leave orphaned bodies colliding with the new level.
      // Only a world that exists can hold stale bodies; `setScene` on a physics-free app is a no-op here.
      for (const id of [...appPhysicsNodeNames.keys()]) appPhysicsWorldInstance?.removeRigidBody(id);
      appPhysicsNodeNames.clear();
      registerDeclaredBodies(renderSnapshot);
      mountCurrentScene();
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
      frameCallbacks.add(callback);
      return () => {
        frameCallbacks.delete(callback);
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
    onDeviceLost(listener) {
      // Attach now when a device already exists; otherwise the mount handler attaches it on arrival.
      deviceLostListeners.set(listener, productionController?.onDeviceLost?.(listener));
      return () => {
        // Read the CURRENT subscription: a re-mount may have replaced the one captured at registration.
        deviceLostListeners.get(listener)?.();
        deviceLostListeners.delete(listener);
      };
    },
    onDeviceRestored(listener) {
      deviceRestoredListeners.set(listener, productionController?.onDeviceRestored?.(listener));
      return () => {
        deviceRestoredListeners.get(listener)?.();
        deviceRestoredListeners.delete(listener);
      };
    },
    deviceLost() {
      return productionController?.deviceLost?.() ?? false;
    },
    advance(dt = 1 / 60) {
      assertMutableFrame();
      const seconds = Math.max(0, dt);
      runRuntimeFrame(seconds, "manual");
      canvasRuntimePhysics?.step(seconds);
      // Imported GLB animation, consumed root motion and foot planting live in the
      // production actor bridge. They are simulation state, so `advance()` must
      // update them even when no GPU frame is presented.
      productionController?.update?.(runtimeTime * 1000);
    },
    step(dt = 1 / 60) {
      assertMutableFrame();
      const seconds = Math.max(0, dt);
      app.advance(seconds);
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
        render(simulatedMs);
        lastTime = previousLastTime;
      }
      runtimePaused = previousPaused;
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
          runRuntimeFrame(dt, "manual");
          canvasRuntimePhysics?.step(dt);
          return runtimeTime * 1000;
        });
      }).finally(() => { pendingAsyncSteps -= 1; });
      asyncSteps = next.catch(() => undefined);
      return next;
    },
    async disposeAsync() {
      const controller = productionController;
      app.dispose();
      await asyncSteps;
      await productionMountTask;
      await controller?.whenIdle?.();
    },
    diagnostics() {
      diagnosticsState.renderer = readRootDiagnosticSnapshot(
        diagnosticsState.renderer,
        productionController?.diagnostics,
        disposed,
        pendingAsyncSteps > 0 || Boolean(productionController?.busy?.())
      );
      const report = snapshotDiagnostics(diagnosticsState);
      for (const section of diagnosticsSectionsAll()) {
        (report as unknown as Record<string, unknown>)[section.key] = section.collect(app);
      }
      return report;
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
      return captureAuraScreenshot(canvas);
    },
    dispose() {
      disposed = true;
      /*
       * Settle any in-flight mount so `await app.ready()` cannot hang on a disposed app. A promise
       * that never resolves is a worse failure than the one WS-2.9 fixed: it has no diagnostic at all.
       */
      productionMountPending = false;
      settleMountForDispose();
      for (const unsubscribe of [...deviceLostListeners.values(), ...deviceRestoredListeners.values()]) unsubscribe?.();
      deviceLostListeners.clear();
      deviceRestoredListeners.clear();
      if (animationHandle && typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(animationHandle);
      for (const controller of ownedInputControllers) controller.dispose();
      ownedInputControllers.clear();
      productionController?.dispose();
      overlay?.dispose();
      unregisterAuraApp(app);
    }
  };
  const extensionDisposers: Array<() => void> = [];
  for (const ext of appExtensionsAll()) {
    const value = ext.create(app, { flags: qrFlags, options });
    (app as unknown as Record<string, unknown>)[ext.member] = value;
    if (ext.dispose) { const disposeExt = ext.dispose; extensionDisposers.push(() => disposeExt(value)); }
  }
  const baseDispose = app.dispose;
  app.dispose = () => {
    for (const disposeExt of extensionDisposers.splice(0)) disposeExt();
    baseDispose();
  };
  registerAuraApp(app);
  return app;
}
