/**
 * Provider-neutral PRD-09 C-24 implementation, bound by each entry.
 *
 * - Session time delegates to `app.time` when a C-23 controller is mounted,
 *   else a local `StubTimeController` advanced once per real frame.
 * - Capture context comes from the URL once (captureFromUrl); scene snapshots
 *   authored at createGame/setScene feed the look signature.
 * - Beacon (`__AURA3D_GAME__`) and the lazy evidence channel
 *   (`__AURA3D_GAME_EVIDENCE__[route]`) install only in DOM contexts.
 */

import type {
  normalizeSceneSnapshot,
  StubTimeController,
  createGameAudio,
  bindFeelSound,
  AuraApp,
  AuraAppTarget,
  AuraCreateGameAppOptions,
  AuraSceneBuilder,
  AuraSceneSnapshot,
  AuraTimeController,
  CaptureContext,
  CreateGameOptions,
  Game,
  GameScenario,
  TransitionSpec,
  GameAppRuntime,
  GameAudio,
  GameAudioOptions,
  Hud,
  TouchControls
} from "@aura3d/engine/v5/internal";
type MountedRuntime = GameAppRuntime<AuraApp>;
type RuntimeInput = NonNullable<MountedRuntime["input"]>;
type GameAppFactory = (target: AuraAppTarget, options: AuraCreateGameAppOptions) => MountedRuntime;
import { GameSessionImpl } from "./session/GameSession";
import { awaitGamePresentedDraw } from "./session/presented";
import { attachSessionLifecycle, type LifecycleSound } from "./session/lifecycle";
import { createAccessibility } from "./session/accessibility";
import { captureFromUrl } from "./capture/captureFromUrl";
import { lookSignature, type LookSource } from "./capture/lookSignature";
import { installGameBeacon } from "./evidence/beacon";
import { installEvidenceChannel, createPerfRing, type EvidenceChannelContract, type EvidenceSectionCollect } from "./evidence/channel";
import { GameShellImpl, GameHudImpl } from "./components";
import { createPoolFxLayer, withFxPool, type PoolFxLayer, type PoolNodeHandle } from "./juice/fxPoolLayer";
import { mountHud } from "./hud/HudKit";
import { mountTouchControls } from "./touch/TouchControls";
import { createJuice, type Juice, type JuiceCamera, type JuiceEventMap } from "./juice/Juice";
import type { HudDocument, HudElement } from "./hud/dom";
import { createOverlayDriver } from "./juice/overlay";
import { wireContextLoss, type DeviceLossApp } from "./shell/contextLoss";
import { domTransitionDriver } from "./shell/transition";
import { createRumbleDriver } from "./juice/rumble";
import { createTweenEngine } from "./juice/tween";


const currentUrl = (): URL | undefined =>
  typeof location !== "undefined" ? new URL(location.href) : undefined;

const currentRoute = (id: string): string =>
  typeof location !== "undefined" ? location.pathname || id : id;

/** Wait for both the timer and the next paint, with a cancellable owner. */
function sleepThroughPaint(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let frame: number | undefined;
    const finish = (): void => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const abort = (): void => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      if (frame !== undefined && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
      signal?.removeEventListener("abort", abort);
      const error = new Error("Transition wait cancelled.");
      error.name = "AbortError";
      reject(signal?.reason ?? error);
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    if (settled) return;
    timer = setTimeout(() => {
      timer = undefined;
      if (settled) return;
      if (typeof requestAnimationFrame === "function") frame = requestAnimationFrame(finish);
      else finish();
    }, ms);
  });
}

export interface Prd09Game<TCue extends string, TEvent extends string> extends Game<TCue, TEvent> {
  /** SHA-256 look signature over the last authored snapshot. */
  lookSignature(): Promise<string>;
  /** The canonical look manifest input the signature hashes. */
  lookSource(): LookSource;
  /** The mounted session implementation (also `game.session`). */
  readonly sessionImpl: GameSessionImpl;
  /** The mounted app runtime (the driver `game.ready()` waits on). */
  readonly runtime: MountedRuntime;
  /** The mounted input controller when `options.input` was provided. */
  readonly input: RuntimeInput | undefined;
  /** The juice driver built from `options.juice` (juice.define event map). */
  readonly juice: Juice<TEvent>;
  /** The C-25 audio facade when `options.sound` was provided. */
  readonly sound?: GameAudio<TCue>;
  /**
   * Reset game-owned particles, tweens and hit-stops, then run `onReset`.
   * The runtime is suspended during the callback and resumed only when it was
   * running beforehand and the session is not paused. Scene/node, physics,
   * input, HUD, replay, global time and audio state remain owned by the app;
   * restore them in `onReset`. Independently requested hit-stops remain active.
   * A custom time
   * controller without the optional owner-aware stop methods cannot cancel
   * its delegated global stops on reset.
   * A failing callback does not undo the cleanup.
   * A second reset while one is in flight rejects with GAME_RESET_IN_PROGRESS_V1.
   */
  reset(): Promise<void>;
}

/**
 * Games run a synchronous main-thread loop. A `worker` option is accepted only as an explicit main-thread request
 * (`fallback: "main-thread"`), which lets the shared lab-flag fragment be spread into any game; it is never forwarded.
 */
export function assertGameWorkerRequest(worker: CreateGameOptions<string, string>["worker"]): void {
  if (worker === undefined) return;
  if (worker.fallback === "main-thread") return;
  const error = new Error(
    'createGame does not support worker rendering because its game loop requires synchronous onFrame callbacks. Pass worker: { fallback: "main-thread" } to accept the request on the main thread, or use createAuraApp with worker.'
  ) as Error & { code: string };
  error.name = "AuraWorkerError";
  error.code = "worker-unsupported";
  throw error;
}

/** createGame options plus the PRD-09 scenario registry (§7.4) and the
 * createGameApp fields a route already owns (input/loop/physics/diagnostics). */
export type Prd09CreateGameOptions<TCue extends string, TEvent extends string> =
  Omit<CreateGameOptions<TCue, TEvent>, "target"> & Omit<AuraCreateGameAppOptions, "scene" | "worker"> & {
    /** AuraAppTarget — element, canvas, or CSS selector (unlike the narrower contract type). */
    readonly target: AuraAppTarget;
    readonly scenarios?: Readonly<Record<string, GameScenario>>;
    /** Wired into the session lifecycle (suspend/dispose/unlock on tab events). */
    readonly soundAdapter?: LifecycleSound;
    /** Route evidence sections + legacy global aliases (C-24 §6.5).
     * In window contexts, `__AURA3D_GAME__` is reserved and cannot be an alias. */
    readonly evidence?: EvidenceChannelContract;
    /**
     * Restore application-owned run state after game-owned effects are cleared.
     * The signal aborts on disposal; asynchronous callbacks must stop their own
     * work when aborted. Scene transitions that wait for presentation must not
     * be awaited here because the runtime is suspended until this returns.
     */
    readonly onReset?: (game: Prd09Game<TCue, TEvent>, context: { readonly signal: AbortSignal }) => void | Promise<void>;
  };

/** Structural form of the engine's entry-scoped physics access. */
export interface GamePhysicsWorldAccess {
  preload(): Promise<void>;
  requireReady(): unknown;
}

/** An entry supplies its own access-bound app factory without using a global slot. */
export type GameAppWithPhysicsWorldAccess<TAccess extends GamePhysicsWorldAccess> = (
  access: TAccess,
  target: AuraAppTarget,
  options: AuraCreateGameAppOptions
) => MountedRuntime;

/** Solver-independent functions supplied by each entry. */
export interface GameImplementationBindings {
  readonly normalizeSceneSnapshot: typeof normalizeSceneSnapshot;
  readonly StubTimeController: typeof StubTimeController;
  readonly createGameAudio: typeof createGameAudio;
  readonly bindFeelSound: typeof bindFeelSound;
}

/** @internal Bind a game instance to the app factory and physics access of its entry. */
export function createGameImplWithPhysicsWorldAccess<
  TAccess extends GamePhysicsWorldAccess,
  TCue extends string,
  TEvent extends string
>(
  access: TAccess,
  createGameAppWithAccess: GameAppWithPhysicsWorldAccess<TAccess>,
  bindings: GameImplementationBindings,
  options: Prd09CreateGameOptions<TCue, TEvent>
): Prd09Game<TCue, TEvent> {
  return createGameImplWithGameApp((target, appOptions) => createGameAppWithAccess(access, target, appOptions), bindings, options);
}

export function createGameImplWithGameApp<TCue extends string, TEvent extends string>(
  createGameAppForEntry: GameAppFactory,
  bindings: GameImplementationBindings,
  options: Prd09CreateGameOptions<TCue, TEvent>
): Prd09Game<TCue, TEvent> {
  // A channel alias installs after the beacon. Letting it claim the same key
  // would shadow that beacon and later restore it after the owner is disposed.
  if (typeof window !== "undefined" && options.evidence?.legacyGlobals?.includes("__AURA3D_GAME__")) {
    throw new Error('EVIDENCE_CHANNEL_RESERVED_ALIAS_V1: "__AURA3D_GAME__" is reserved for the game beacon.');
  }
  const { normalizeSceneSnapshot, StubTimeController, createGameAudio, bindFeelSound } = bindings;
  const capture: CaptureContext = captureFromUrl(currentUrl());
  const fallbackTime = new StubTimeController();
  const session = new GameSessionImpl({ seed: capture.seed ?? 0, time: fallbackTime });

  // §6.7: every game scene carries the hidden FX pool nodes (one instanced
  // node per GameFxKind) so `fx.burst` / juice `fx` presets render.
  const authoredScene = withFxPool(normalizeSceneSnapshot(
    options.scene() as AuraSceneBuilder | AuraSceneSnapshot
  ));
  let lookSource: LookSource = authoredScene as unknown as LookSource;

  const {
    id: _id, target: _target, layout: _layout, hud: _hud, touch: _touch, sound: _sound,
    juice: _juice, scenarios: _scenarios, soundAdapter, evidence: _evidence, onReset: _onReset,
    worker,
    ...appOptions
  } = options;
  assertGameWorkerRequest(worker);
  const runtime = createGameAppForEntry(options.target, {
    ...appOptions,
    diagnostics: {
      overlay: false,
      performancePanel: false,
      ...(typeof options.diagnostics === "object" ? options.diagnostics : {})
    },
    scene: authoredScene,
    qualityRebuild: options.qualityRebuild as { flags?: readonly string[] }
  });
  const app = runtime.app;
  // Delegate to the real controller when one is mounted on the app.
  if ((app as { time?: AuraTimeController }).time !== undefined) {
    session.bindTimeController((app as { time?: AuraTimeController }).time!);
  }

  const accessibility = createAccessibility(options.id);
  session.setAccessibility(accessibility.values);
  const accessibilityUnsub = accessibility.onChange((v) => session.setAccessibility(v));

  const hasDom = typeof document !== "undefined" && typeof window !== "undefined";

  let disposed = false;
  const disposedError = () => new Error("GAME_DISPOSED_V1: This game has been disposed; create a new game to continue.");
  const assertAlive = () => { if (disposed) throw disposedError(); };
  let signalDisposed!: () => void;
  const disposedSignal = new Promise<void>((resolve) => { signalDisposed = resolve; });
  const whileAlive = <T>(promise: Promise<T>): Promise<T> => Promise.race([
    promise,
    disposedSignal.then(() => { throw disposedError(); })
  ]);

  const makeFxLayer = () => createPoolFxLayer({
    node: (name) => {
      try {
        return app.nodes.get(name) as unknown as PoolNodeHandle | undefined;
      } catch {
        return undefined;
      }
    },
    seed: capture.seed ?? 1
  });
  let ownedFx = makeFxLayer();
  // Keep the public object stable while replacing its particle pool on scene
  // reset. A scene swap must not resurrect particles or stale node handles.
  const fx: PoolFxLayer = {
    get backend() { return ownedFx.backend; },
    get liveCount() { return disposed ? 0 : ownedFx.liveCount; },
    burst(kind, position, options) { assertAlive(); ownedFx.burst(kind, position, options); },
    trail() {
      assertAlive();
      throw new Error("GAME_FX_TRAIL_UNSUPPORTED_V1: The game primitive-pool backend does not render trails. Use a supported particle-pass effect instead.");
    },
    tick(dt) { if (!disposed) ownedFx.tick(dt); },
    reset() { assertAlive(); ownedFx = makeFxLayer(); }
  };

  // §7.7 HUD (mountHud) + §6.11 touch controls mount only in DOM contexts;
  // node/test contexts keep the contract stubs. `target` may be a selector,
  // so the HUD/touch root resolves to the element when one is found.
  const targetEl = hasDom
    ? (typeof options.target === "string"
      ? (document.querySelector(options.target) as HTMLElement | null)
      : options.target instanceof HTMLElement ? options.target : null)
    : null;

  // Canvas descendants are fallback content, not visible overlays. Mount the
  // results screen beside a canvas; container targets use the same root as
  // HUD/touch. A null target has no mounted UI, even if a document exists.
  const canvasTarget = targetEl?.tagName.toLowerCase() === "canvas" ? targetEl : null;
  const resultsRoot = canvasTarget
    ? () => canvasTarget.parentElement as unknown as HudElement | null
    : targetEl as unknown as HudElement | null;

  // §6.2 loading transition: a DOM `.a3g-overlay` (opacity 0 at idle) fades to
  // opaque, the scene swaps, and it fades back only after the runtime presents
  // the new scene's first frame. The fade-out sleep adds one frame so the CSS
  // opacity transition has settled at 1 before the swap.
  const transitionOverlay = hasDom ? createTransitionOverlay() : null;
  const shell = new GameShellImpl(
    session,
    transitionOverlay
      ? domTransitionDriver(transitionOverlay as unknown as HudElement, {
        firstPresentedFrame: (wait) => runtime.firstPresentedFrame(wait).then(() => undefined),
        sleep: (ms, wait) => sleepThroughPaint(ms, wait?.signal)
      })
      : undefined,
    resultsRoot
      ? {
        doc: document as unknown as HudDocument,
        root: resultsRoot,
        canvas: canvasTarget ? canvasTarget as unknown as HudElement : undefined
      }
      : undefined
  );
  const hud: Hud = hasDom && options.hud
    ? (mountHud(
      { root: (targetEl ?? document.body) as unknown as HudElement, doc: document as unknown as HudDocument },
      options.hud as Parameters<typeof mountHud>[1]
    ) as unknown as Hud)
    : new GameHudImpl();

  // §6.11: touch controls need an input sink. No route passes `input` (all 18
  // v2 boots set `touch` only), so without this the controls never mounted
  // and mobile players got no on-screen controls. Declare each bound action
  // with no keys; the controls drive them through `setAction`.
  const touchInput: RuntimeInput | undefined = runtime.input
    ?? (hasDom && options.touch
      ? runtime.inputController({
        actions: Object.fromEntries(Object.values(options.touch.bindings).map((action) => [action, []]))
      })
      : undefined);

  const touch: TouchControls | null = hasDom && options.touch && touchInput
    ? mountTouchControls(
      touchInput,
      { preset: options.touch.preset, bindings: options.touch.bindings },
      { doc: document as unknown as HudDocument, root: (targetEl ?? document.body) as unknown as HudElement }
    )
    : null;

  // C-25: options.sound is a GameAudioOptions<TCue> cue map; the facade owns
  // the browser context and is threaded through the session lifecycle so tab
  // suspend/visibility pauses and disposes it with the game.
  const audioOptions = options.sound as GameAudioOptions<TCue> | undefined;
  const audio: GameAudio<TCue> | undefined =
    !options.soundAdapter && audioOptions
      ? createGameAudio<TCue>({
        ...audioOptions,
        browserContext: audioOptions.browserContext ??
          (hasDom && audioOptions.context === undefined && audioOptions.createContext === undefined),
        qualityRebuild: { flags: options.qualityRebuild?.flags }
      })
      : undefined;
  // Q-09-6 (#213): lane-08 listener glue — the audio listener tracks the
  // PRESENTED camera pose once per frame via bindFeelSound.
  const feelSoundDetach =
    audio !== undefined
      ? bindFeelSound(app as never, audio as never)
      : undefined;
  let soundDisposal: Promise<void> | undefined;
  let mutedBeforeSuspend: boolean | undefined;
  const disposeSound = (): Promise<void> => {
    if (!soundDisposal) {
      try {
        soundDisposal = Promise.resolve(options.soundAdapter ? options.soundAdapter.dispose() : audio?.dispose()).then(() => undefined);
      } catch (error) {
        soundDisposal = Promise.reject(error);
      }
    }
    return soundDisposal;
  };
  const lifecycleSound: LifecycleSound | undefined = options.soundAdapter || audio ? {
    suspend: () => {
      if (options.soundAdapter) options.soundAdapter.suspend();
      else if (audio) {
        if (mutedBeforeSuspend === undefined) mutedBeforeSuspend = audio.evidence.muted;
        audio.setMuted(true);
      }
    },
    dispose: () => { void disposeSound().catch(() => undefined); },
    unlock: () => { if (options.soundAdapter) options.soundAdapter.unlock?.(); else void audio?.unlock(); }
  } : undefined;

  let firstFrameAt: number | null = null;
  let scenarioStarted = false;
  // Scene revision counter for the §15 test hook's presentLog.sceneId.
  let sceneRevision = 0;
  const armFirstPresented = () => {
    void runtime.firstPresentedFrame().then(async () => {
      if (disposed) return;
      if (firstFrameAt === null) {
        firstFrameAt = Date.now();
        beacon.refresh();
      }
      // Scenario setup runs after the first presented frame (§7.4).
      if (!scenarioStarted && capture.mode === "scenario" && capture.scenario !== undefined) {
        scenarioStarted = true;
        const scenario = options.scenarios?.[capture.scenario];
        await scenario?.setup(game);
      }
    }).catch((error: unknown) => { if (!disposed) console.error("GAME_FIRST_FRAME_FAILED", error); });
  };
  armFirstPresented();

  const perfRing = createPerfRing();
  // §17 (16.1-8) CPU span: `performance.now()` around the session tick, last
  // 600 frames, read only through the opted-in `spans` evidence section.
  const SPAN_CAP = 600;
  const sessionSpans = new Float32Array(SPAN_CAP);
  let spanHead = 0;
  let spanCount = 0;
  const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());
  // Session time delegates per real frame: dt flowing through the loop is
  // real time; the controller returns the scaled dt routes should simulate on.
  // §15 juice envelopes run on the presented-frame clock, not wall time: the
  // overlay advances by each frame's dt and re-writes inside the frame, so a
  // flash decays over the frames that show it (real dt under rAF; exactly the
  // stepped dt under `__AURA3D_GAME_TEST__.stepFrames`, which runs frames
  // faster than wall time and would otherwise never see the 200 ms decay).
  let overlayClock = 0;
  const overlayFrameCallbacks = new Set<() => void>();
  const tweens = createTweenEngine();
  const detachFrame = runtime.onFrame((frame) => {
    const t0 = now();
    const activeDt = session.paused ? 0 : frame.dt;
    session.tick(activeDt);
    sessionSpans[spanHead] = now() - t0;
    spanHead = (spanHead + 1) % SPAN_CAP;
    spanCount = Math.min(spanCount + 1, SPAN_CAP);
    perfRing.record(frame.dt * 1000);
    overlayClock += Math.max(0, frame.dt);
    const scaledDt = session.paused ? 0 : session.scaledDt(activeDt);
    (touch as (TouchControls & { update?: () => void }) | null)?.update?.();
    tweens.tick(frame.dt, scaledDt);
    fx.tick(scaledDt);
    const due = [...overlayFrameCallbacks];
    overlayFrameCallbacks.clear();
    for (const cb of due) cb();
  });

  const spanSamples = (): number[] => {
    const out: number[] = [];
    const start = spanCount < SPAN_CAP ? 0 : spanHead;
    for (let i = 0; i < spanCount; i += 1) out.push(sessionSpans[(start + i) % SPAN_CAP]);
    return out;
  };

  // 09-MIG look signature for the opted-in `look` evidence section: hashed
  // asynchronously on first read per scene revision; later reads return it.
  let look: { revision: number; signature: string | null; error: string | null } | null = null;
  const lookSection = () => {
    const revision = sceneRevision;
    if (look === null || look.revision !== revision) {
      const pending = { revision, signature: null as string | null, error: null as string | null };
      look = pending;
      lookSignature(lookSource).then(
        (sig) => { pending.signature = sig; },
        (e: unknown) => { pending.error = String(e); }
      );
    }
    return { revision: look.revision, signature: look.signature, error: look.error };
  };

  // AuraCameraController already carries shake/punch/evidence (JuiceCamera);
  // OverlayApp needs the optional C-38 setOutputOverlay — DOM fallback covers
  // runtimes that do not expose it.
  const overlayApp = (app as { setOutputOverlay?: unknown }).setOutputOverlay
    ? (app as unknown as Parameters<typeof createOverlayDriver>[0]["app"])
    : undefined;

  function createTransitionOverlay(): HTMLElement {
    const host = targetEl ?? document.body;
    const el = document.createElement("div");
    el.className = "a3g-overlay";
    el.setAttribute("aria-hidden", "true");
    el.style.cssText = "position:absolute;inset:0;pointer-events:none;background:#000;opacity:0;z-index:35;";
    if (host !== document.body && getComputedStyle(host).position === "static") host.style.position = "relative";
    host.appendChild(el);
    return el;
  }

  // §7.8 DOM fallback: without the C-05 output overlay (A3D_QR_CORE off) the
  // flash/vignette drive a transparent full-bleed layer over the canvas;
  // without it juice.flash was a silent no-op. Transparent at idle, so idle
  // frames stay pixel-identical (overlay-identity).
  function juiceOverlayElement(): HTMLElement | null {
    if (!hasDom) return null;
    const host = targetEl ?? document.body;
    const el = document.createElement("div");
    el.className = "a3g-juice-overlay";
    el.setAttribute("aria-hidden", "true");
    el.style.cssText = "position:absolute;inset:0;pointer-events:none;background:transparent;z-index:30;";
    if (host !== document.body && getComputedStyle(host).position === "static") host.style.position = "relative";
    host.appendChild(el);
    return el;
  }

  const ownedJuiceOverlay = overlayApp ? undefined : juiceOverlayElement();
  const juice: Juice<TEvent> = createJuice<TEvent, TCue>({
    events: (options.juice ?? {}) as JuiceEventMap<TEvent, TCue>,
    camera: app.camera as unknown as JuiceCamera,
    session,
    fx,
    overlay: createOverlayDriver({
      app: overlayApp,
      domElement: ownedJuiceOverlay,
      now: () => overlayClock,
      schedule: (cb) => {
        overlayFrameCallbacks.add(cb);
        return () => { overlayFrameCallbacks.delete(cb); };
      }
    }),
    tweens,
    rumble: createRumbleDriver(),
    sound: audio ? { cue: (cue) => { void audio.cue(cue); } } : undefined
  });

  const detachLifecycle = attachSessionLifecycle({ session, sound: lifecycleSound });
  let resumeRuntimeAfterPause = false;
  // While reset owns a temporary runtime suspension, a user/visibility pause
  // still needs to remember that play was running before that suspension.
  let resetSuspendedRunning = false;
  let resetSuspensionActive = false;
  const detachPause = session.on("pause", () => {
    const running = runtime.running;
    resumeRuntimeAfterPause = running || resetSuspendedRunning || (resetSuspensionActive && resumeRuntimeAfterPause);
    if (running) runtime.pause();
  });
  const detachResume = session.on("resume", () => {
    if (!disposed && resumeRuntimeAfterPause && !resetSuspensionActive) runtime.resume();
    if (!resetSuspensionActive) resumeRuntimeAfterPause = false;
    if (audio && mutedBeforeSuspend !== undefined) {
      audio.setMuted(mutedBeforeSuspend);
      mutedBeforeSuspend = undefined;
    }
  });

  // §6.2 context loss: the engine owns `webglcontextlost` behind
  // app.onDeviceLost; the shell pauses with reason "context-lost", hides the
  // HUD and shows the ContextLost screen (Reload after 3 s unrecovered).
  const deviceApp = app as unknown as Partial<DeviceLossApp>;
  const contextLoss = hasDom && typeof deviceApp.onDeviceLost === "function" && typeof deviceApp.onDeviceRestored === "function"
    ? wireContextLoss(deviceApp as DeviceLossApp, document as unknown as HudDocument, {
      pause: (reason) => session.pause(reason),
      hideHud: () => hud.setVisible(false),
      showHud: () => hud.setVisible(true),
      mount: (el) => { (targetEl ?? document.body).appendChild(el as Node); },
      onReload: () => location.reload()
    })
    : null;

  let readyPromise: Promise<void> | null = null;
  let readySucceeded = false;
  let readyController: AbortController | undefined;
  let disposal: Promise<void> | undefined;
  let sceneTail: Promise<void> = Promise.resolve();
  let resetController: AbortController | undefined;
  let channel: { dispose(): void } = { dispose() {} };

  const game: Prd09Game<TCue, TEvent> = {
    id: options.id,
    app,
    runtime,
    input: touchInput,
    session,
    sessionImpl: session,
    shell,
    hud,
    touch,
    fx,
    juice,
    sound: audio,
    capture,
    lookSignature: () => lookSignature(lookSource),
    lookSource: () => lookSource,
    ready(): Promise<void> {
      if (disposed) return Promise.reject(disposedError());
      if (!readyPromise) {
        const controller = new AbortController();
        readyController = controller;
        const work = (async () => {
          // T0-30 (#54): `playing` is a *presented* state — wait until a frame
          // that actually drew was presented, never just `app.ready()`. The
          // helper also watches for mount and terminal frame failures.
          await awaitGamePresentedDraw(app, runtime, controller.signal, (isCurrent) => {
            assertAlive();
            if (session.state === "booting") session.transition("loading");
            // State listeners can synchronously lose or replace the mount.
            // Recheck while the readiness subscriptions are still active.
            assertAlive();
            if (!isCurrent()) return false;
            // Mark the committed draw before notifying state listeners: one
            // may synchronously start a new run or schedule a scene change.
            if (readyController === controller) readySucceeded = true;
            if (session.state === "loading" || session.state === "title") {
              session.transition("playing");
            }
            return true;
          });
        })();
        let attempt!: Promise<void>;
        attempt = whileAlive(work).then(
          () => { if (readyPromise === attempt) readySucceeded = true; },
          (error: unknown) => {
            if (readyPromise === attempt) {
              readyPromise = null;
              readySucceeded = false;
            }
            throw error;
          }
        ).finally(() => {
          if (!controller.signal.aborted) controller.abort();
          if (readyController === controller) readyController = undefined;
        });
        readyPromise = attempt;
      }
      return readyPromise;
    },
    start(): void {
      assertAlive();
      // A successful earlier run does not authorize entering playing after a
      // later title/results restart without checking the current scene again.
      if ((session.state === "title" || session.state === "results") && readySucceeded) {
        readyPromise = null;
        readySucceeded = false;
      }
      if (session.state === "booting" || session.state === "title" || session.state === "results") session.transition("loading");
      else if (session.state !== "loading") return;
      runtime.start();
      // Explicit callers still receive the rejection from ready(); starting a
      // game without awaiting it must not create an unhandled rejection.
      void game.ready().catch(() => undefined);
    },
    setScene(scene: AuraSceneSnapshot, o?: { transition?: TransitionSpec | false }): Promise<void> {
      if (disposed) return Promise.reject(disposedError());
      const operation = sceneTail.then(async () => {
        assertAlive();
        const apply = async () => {
          const next = withFxPool(normalizeSceneSnapshot(scene as AuraSceneBuilder | AuraSceneSnapshot));
          if (readySucceeded) {
            readyPromise = null;
            readySucceeded = false;
          }
          await app.setScene(next);
          assertAlive();
          tweens.cancelAll();
          fx.reset();
          lookSource = next as unknown as LookSource;
          sceneRevision += 1;
          armFirstPresented();
        };
        if (o?.transition) await shell.transition(apply, o.transition);
        else await apply();
      });
      sceneTail = operation.then(() => undefined, () => undefined);
      return whileAlive(operation);
    },
    reset(): Promise<void> {
      if (disposed) return Promise.reject(disposedError());
      if (resetController) return Promise.reject(new Error("GAME_RESET_IN_PROGRESS_V1: A game reset is already in progress."));
      const controller = new AbortController();
      resetController = controller;
      const operation = (async () => {
        // Finish an already requested scene change before touching its pools.
        // The callback may request a subsequent transition-free scene change.
        await sceneTail;
        assertAlive();
        const resumeAfterReset = runtime.running;
        resetSuspensionActive = true;
        try {
          if (resumeAfterReset) {
            resetSuspendedRunning = true;
            runtime.pause();
          }
          session.clearRunHitStops();
          tweens.cancelAll();
          fx.reset();
          // Re-hide the old pool immediately, even when the game was paused
          // and no frame will arrive to tick the newly created pool.
          fx.tick(0);
          await options.onReset?.(game, { signal: controller.signal });
          assertAlive();
        } finally {
          resetSuspensionActive = false;
          resetSuspendedRunning = false;
          if (!disposed && (resumeAfterReset || resumeRuntimeAfterPause) && !session.paused) {
            if (!runtime.running) runtime.resume();
            resumeRuntimeAfterPause = false;
          }
        }
      })();
      return whileAlive(operation).finally(() => {
        if (resetController === controller) resetController = undefined;
      });
    },
    dispose(): Promise<void> {
      if (disposal) return disposal;
      // Publish the result before invoking any user callbacks: a listener can
      // reenter dispose() while the synchronous teardown is still in progress.
      let resolveDisposal!: () => void;
      let rejectDisposal!: (reason: unknown) => void;
      disposal = new Promise<void>((resolve, reject) => {
        resolveDisposal = resolve;
        rejectDisposal = reject;
      });
      const failures: unknown[] = [];
      const pending: Promise<unknown>[] = [];
      const attempt = (cleanup: () => void): void => {
        try { cleanup(); } catch (error) { failures.push(error); }
      };

      disposed = true;
      signalDisposed();
      attempt(() => { if (resetController && !resetController.signal.aborted) resetController.abort(disposedError()); });
      attempt(() => { if (readyController && !readyController.signal.aborted) readyController.abort(disposedError()); });
      attempt(detachLifecycle);
      attempt(detachPause);
      attempt(detachResume);
      attempt(() => contextLoss?.dispose());
      attempt(() => feelSoundDetach?.());
      attempt(accessibilityUnsub);
      attempt(() => accessibility.dispose());
      attempt(detachFrame);
      attempt(() => tweens.cancelAll());
      attempt(() => overlayFrameCallbacks.clear());
      attempt(detachBeacon);
      // The beacon handle owns the descriptor and its restoration. Never read
      // or delete the restored global: it may belong to a different owner.
      attempt(() => beacon.dispose());
      attempt(() => channel.dispose());
      attempt(() => shell.dispose());
      attempt(() => session.transition("disposed"));
      attempt(() => hud.dispose());
      attempt(() => touch?.dispose());
      attempt(() => transitionOverlay?.remove());
      attempt(() => ownedJuiceOverlay?.remove());
      // Capture and drain the app's pending GPU/mount work before the runtime
      // disposes its app. Both calls are idempotent; the async one must begin
      // first so it can retain the live renderer while it drains.
      attempt(() => { pending.push(Promise.resolve(app.disposeAsync())); });
      attempt(() => runtime.dispose());
      attempt(() => {
        if (soundGlobal === undefined || typeof window === "undefined") return;
        const globals = window as unknown as Record<string, unknown>;
        if (globals.__AURA3D_GAME_SOUND__ === soundGlobal) delete globals.__AURA3D_GAME_SOUND__;
      });
      attempt(() => { pending.push(disposeSound()); });
      void Promise.allSettled(pending).then((results) => {
        for (const result of results) if (result.status === "rejected") failures.push(result.reason);
        if (failures.length === 0) resolveDisposal();
        else if (failures.length === 1) rejectDisposal(failures[0]);
        else rejectDisposal(new AggregateError(failures, "Game disposal failed.", { cause: failures[0] }));
      }, rejectDisposal);
      return disposal;
    }
  };

  const beacon = installGameBeacon({
    route: currentRoute(options.id),
    getState: () => session.state,
    getFrame: () => runtime.evidence.frame,
    getFirstFrameAt: () => firstFrameAt,
    getApp: () => app as unknown as { scene?: unknown; diagnostics?: () => Record<string, unknown> },
    getSession: () => session
  });
  const detachBeacon = session.on("state", () => beacon.refresh());

  // §15 deterministic-clock hook: compiled-in only for MODE === "test"
  // builds (esbuild `define` in the browser dev server / vite test mode).
  // Dynamic import keeps the module lazy for production bundles, where the
  // gate is false and `window.__AURA3D_GAME_TEST__` stays undefined.
  if ((import.meta as { env?: { MODE?: string } }).env?.MODE === "test") {
    // The lazy import can settle after a fast dispose(); a disposed runtime
    // rejects firstPresentedFrame(), so never install (or re-arm) past it.
    void import("./testHook").then(({ installGameTestHook }) => {
      if (disposed) return;
      installGameTestHook({ stepper: runtime, getSceneId: () => sceneRevision, isActive: () => !disposed });
    });
  }

  // §20 `audio.webm` tap — one-function global the lane-12 `audio-webm`
  // capture step calls to record the master bus. DOM-gated like the beacon.
  let soundGlobal: { recordMaster(seconds?: number): Promise<Blob | null> } | undefined;
  if (audio && typeof window !== "undefined") {
    soundGlobal = { recordMaster: (seconds?: number) => audio.recordMaster(seconds) };
    (window as { __AURA3D_GAME_SOUND__?: { recordMaster(seconds?: number): Promise<Blob | null> } })
      .__AURA3D_GAME_SOUND__ = soundGlobal;
  }

  try {
    channel = installEvidenceChannel({
      id: options.id,
      builtins: {
        session: () => ({ state: session.state, seed: session.seed, simTime: session.simTime }),
        capture: () => capture,
        perf: () => perfRing.summary(),
        spans: () => ({ session: spanSamples() }),
        look: lookSection
      },
      loader: options.evidence?.sections === undefined
        ? undefined
        : typeof options.evidence.sections === "function"
          ? options.evidence.sections
          : () => Promise.resolve(options.evidence!.sections as Readonly<Record<string, EvidenceSectionCollect>>),
      legacyGlobals: options.evidence?.legacyGlobals
    });
  } catch (error) {
    try { void game.dispose().catch(() => undefined); } catch {}
    throw error;
  }

  return game;
}
