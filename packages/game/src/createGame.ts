/**
 * createGame.ts — PRD-09 day-0 real C-24 implementation.
 *
 * - Session time delegates to `app.time` when a C-23 controller is mounted,
 *   else a local `StubTimeController` advanced once per real frame.
 * - Capture context comes from the URL once (captureFromUrl); scene snapshots
 *   authored at createGame/setScene feed the look signature.
 * - Beacon (`__AURA3D_GAME__`) and the lazy evidence channel
 *   (`__AURA3D_GAME_EVIDENCE__[route]`) install only in DOM contexts.
 */

import {
  createGameApp,
  normalizeSceneSnapshot,
  type AuraAppTarget,
  type AuraCreateGameAppOptions,
  type AuraSceneBuilder,
  type AuraSceneSnapshot,
  type AuraTimeController
} from "@aura3d/engine";
type RuntimeInput = ReturnType<typeof createGameApp>["input"];
type MountedRuntime = ReturnType<typeof createGameApp>;
import type {
  CaptureContext,
  CreateGameOptions,
  Game,
  GameScenario,
  TransitionSpec
} from "@aura3d/engine/contracts";
import { StubTimeController } from "@aura3d/engine/contracts";
import { GameSessionImpl } from "./session/GameSession";
import { awaitFirstPresentedDraw, drawCallsOf } from "./session/presented";
import { attachSessionLifecycle, type LifecycleSound } from "./session/lifecycle";
import { createAccessibility } from "./session/accessibility";
import { captureFromUrl } from "./capture/captureFromUrl";
import { lookSignature, type LookSource } from "./capture/lookSignature";
import { installGameBeacon } from "./evidence/beacon";
import { installEvidenceChannel, createPerfRing, type EvidenceChannelContract, type EvidenceSectionCollect } from "./evidence/channel";
import { GameShellImpl, GameHudImpl } from "./components";
import { createPoolFxLayer, withFxPool, type PoolNodeHandle } from "./juice/fxPoolLayer";
import { mountHud } from "./hud/HudKit";
import { mountTouchControls } from "./touch/TouchControls";
import { createJuice, type Juice, type JuiceCamera, type JuiceEventMap } from "./juice/Juice";
import type { HudDocument, HudElement } from "./hud/dom";
import { createOverlayDriver } from "./juice/overlay";
import { wireContextLoss, type DeviceLossApp } from "./shell/contextLoss";
import { domTransitionDriver } from "./shell/transition";
import { createRumbleDriver } from "./juice/rumble";
import { createTweenEngine } from "./juice/tween";
import { createGameAudio, type GameAudio, type GameAudioOptions } from "@aura3d/engine";
import { bindFeelSound } from "@aura3d/engine/lanes";
import type { Hud, TouchControls } from "@aura3d/engine/contracts";


const currentUrl = (): URL | undefined =>
  typeof location !== "undefined" ? new URL(location.href) : undefined;

const currentRoute = (id: string): string =>
  typeof location !== "undefined" ? location.pathname || id : id;

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
  readonly input: RuntimeInput;
  /** The juice driver built from `options.juice` (juice.define event map). */
  readonly juice: Juice<TEvent>;
  /** The C-25 audio facade when `options.sound` was provided. */
  readonly sound?: GameAudio<TCue>;
}

/** createGame options plus the PRD-09 scenario registry (§7.4) and the
 * createGameApp fields a route already owns (input/loop/physics/diagnostics). */
export type Prd09CreateGameOptions<TCue extends string, TEvent extends string> =
  Omit<CreateGameOptions<TCue, TEvent>, "target"> & Omit<AuraCreateGameAppOptions, "scene"> & {
    /** AuraAppTarget — element, canvas, or CSS selector (unlike the narrower contract type). */
    readonly target: AuraAppTarget;
    readonly scenarios?: Readonly<Record<string, GameScenario>>;
    /** Wired into the session lifecycle (suspend/dispose/unlock on tab events). */
    readonly soundAdapter?: LifecycleSound;
    /** Route evidence sections + legacy global aliases (C-24 §6.5). */
    readonly evidence?: EvidenceChannelContract;
  };

export function createGameImpl<TCue extends string, TEvent extends string>(
  options: Prd09CreateGameOptions<TCue, TEvent>
): Prd09Game<TCue, TEvent> {
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
    juice: _juice, scenarios: _scenarios, soundAdapter, evidence: _evidence,
    ...appOptions
  } = options;
  const runtime = createGameApp(options.target, {
    ...appOptions,
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

  const fx = createPoolFxLayer({
    node: (name) => {
      try {
        return app.nodes.get(name) as unknown as PoolNodeHandle | undefined;
      } catch {
        return undefined;
      }
    },
    seed: capture.seed ?? 1
  });

  // §7.7 HUD (mountHud) + §6.11 touch controls mount only in DOM contexts;
  // node/test contexts keep the contract stubs. `target` may be a selector,
  // so the HUD/touch root resolves to the element when one is found.
  const targetEl = hasDom
    ? (typeof options.target === "string"
      ? (document.querySelector(options.target) as HTMLElement | null)
      : options.target instanceof HTMLElement ? options.target : null)
    : null;

  // §6.2 loading transition: a DOM `.a3g-overlay` (opacity 0 at idle) fades to
  // opaque, the scene swaps, and it fades back only after the runtime presents
  // the new scene's first frame. The fade-out sleep adds one frame so the CSS
  // opacity transition has settled at 1 before the swap.
  const transitionOverlay = hasDom ? createTransitionOverlay() : null;
  const shell = new GameShellImpl(
    session,
    transitionOverlay
      ? domTransitionDriver(transitionOverlay as unknown as HudElement, {
        firstPresentedFrame: () => runtime.firstPresentedFrame().then(() => undefined),
        sleep: (ms) => new Promise<void>((resolve) => {
          setTimeout(() => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(() => resolve()) : resolve()), ms);
        })
      })
      : undefined
  );
  const hud: Hud = hasDom && options.hud
    ? (mountHud(
      { root: (targetEl ?? document.body) as unknown as HudElement, doc: document as unknown as HudDocument },
      options.hud as Parameters<typeof mountHud>[1]
    ) as unknown as Hud)
    : new GameHudImpl();

  const touch: TouchControls | null = hasDom && options.touch && runtime.input
    ? mountTouchControls(
      runtime.input,
      { preset: options.touch.preset, bindings: options.touch.bindings },
      { doc: document as unknown as HudDocument, root: (targetEl ?? document.body) as unknown as HudElement }
    )
    : null;

  // C-25: options.sound is a GameAudioOptions<TCue> cue map; the facade owns
  // the browser context and is threaded through the session lifecycle so tab
  // suspend/visibility pauses and disposes it with the game.
  const audio: GameAudio<TCue> | undefined =
    !options.soundAdapter && options.sound && hasDom
      ? createGameAudio<TCue>({
        browserContext: true,
        ...(options.sound as GameAudioOptions<TCue>),
        qualityRebuild: { flags: options.qualityRebuild?.flags }
      })
      : undefined;
  // Q-09-6 (#213): lane-08 listener glue — the audio listener tracks the
  // PRESENTED camera pose once per frame via bindFeelSound.
  const feelSoundDetach =
    audio !== undefined
      ? bindFeelSound(app as never, audio as never)
      : undefined;
  const lifecycleSound: LifecycleSound | undefined = options.soundAdapter ?? (audio && {
    suspend: () => { void audio.setMuted(true); },
    dispose: () => { void audio.dispose(); },
    unlock: () => { void audio.unlock(); }
  });

  let firstFrameAt: number | null = null;
  // Scene revision counter for the §15 test hook's presentLog.sceneId.
  let sceneRevision = 0;
  const armFirstPresented = () => {
    void runtime.firstPresentedFrame().then(() => {
      if (firstFrameAt === null) {
        firstFrameAt = Date.now();
        beacon.refresh();
      }
      // Scenario setup runs after the first presented frame (§7.4).
      if (capture.mode === "scenario" && capture.scenario !== undefined) {
        const scenario = options.scenarios?.[capture.scenario];
        void Promise.resolve(scenario?.setup(game));
      }
    });
  };
  armFirstPresented();

  const perfRing = createPerfRing();
  // Session time delegates per real frame: dt flowing through the loop is
  // real time; the controller returns the scaled dt routes should simulate on.
  // §15 juice envelopes run on the presented-frame clock, not wall time: the
  // overlay advances by each frame's dt and re-writes inside the frame, so a
  // flash decays over the frames that show it (real dt under rAF; exactly the
  // stepped dt under `__AURA3D_GAME_TEST__.stepFrames`, which runs frames
  // faster than wall time and would otherwise never see the 200 ms decay).
  let overlayClock = 0;
  const overlayFrameCallbacks = new Set<() => void>();
  runtime.onFrame((frame) => {
    session.tick(frame.dt);
    perfRing.record(frame.dt * 1000);
    overlayClock += Math.max(0, frame.dt);
    fx.tick(session.scaledDt(frame.dt));
    const due = [...overlayFrameCallbacks];
    overlayFrameCallbacks.clear();
    for (const cb of due) cb();
  });

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

  const juice: Juice<TEvent> = createJuice<TEvent, TCue>({
    events: (options.juice ?? {}) as JuiceEventMap<TEvent, TCue>,
    camera: app.camera as unknown as JuiceCamera,
    session,
    fx,
    overlay: createOverlayDriver({
      app: overlayApp,
      domElement: overlayApp ? undefined : juiceOverlayElement(),
      now: () => overlayClock,
      schedule: (cb) => {
        overlayFrameCallbacks.add(cb);
        return () => { overlayFrameCallbacks.delete(cb); };
      }
    }),
    tweens: createTweenEngine(),
    rumble: createRumbleDriver(),
    sound: audio ? { cue: (cue) => { void audio.cue(cue); } } : undefined
  });

  const detachLifecycle = attachSessionLifecycle({ session, sound: lifecycleSound });

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

  let disposed = false;
  let readyPromise: Promise<void> | null = null;

  const game: Prd09Game<TCue, TEvent> = {
    id: options.id,
    app,
    runtime,
    input: runtime.input,
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
      if (!readyPromise) {
        readyPromise = (async () => {
          await app.ready();
          // T0-30 (#54): `playing` is a *presented* state — wait until a frame
          // that actually drew was presented, never just `app.ready()`.
          await awaitFirstPresentedDraw(runtime, () => drawCallsOf(app));
          if (session.state === "booting") session.transition("loading");
          if (session.state === "loading" || session.state === "title") {
            session.transition("playing");
          }
        })();
      }
      return readyPromise;
    },
    start(): void {
      session.transition("loading");
      runtime.start();
      void game.ready();
    },
    async setScene(scene: AuraSceneSnapshot, o?: { transition?: TransitionSpec | false }): Promise<void> {
      if (disposed) return;
      const apply = async () => {
        const next = withFxPool(normalizeSceneSnapshot(scene as AuraSceneBuilder | AuraSceneSnapshot));
        await app.setScene(next);
        fx.reset();
        lookSource = next as unknown as LookSource;
        sceneRevision += 1;
        armFirstPresented();
      };
      if (o?.transition) {
        await shell.transition(apply, o.transition);
      } else {
        await apply();
      }
    },
    async dispose(): Promise<void> {
      if (disposed) return;
      disposed = true;
      detachLifecycle();
      contextLoss?.dispose();
      feelSoundDetach?.();
      accessibilityUnsub();
      accessibility.dispose();
      beacon.dispose();
      channel.dispose();
      session.transition("disposed");
      hud.dispose();
      touch?.dispose();
      transitionOverlay?.remove();
      if (hasDom) document.querySelectorAll(".a3g-juice-overlay").forEach((el) => { if ((targetEl ?? document.body).contains(el)) el.remove(); });
      runtime.dispose();
      await app.dispose();
    }
  };

  const beacon = installGameBeacon({
    route: currentRoute(options.id),
    getState: () => session.state,
    getFrame: () => runtime.evidence.frame,
    getFirstFrameAt: () => firstFrameAt
  });
  session.on("state", () => beacon.refresh());

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
  if (audio && typeof window !== "undefined") {
    (window as { __AURA3D_GAME_SOUND__?: { recordMaster(seconds?: number): Promise<Blob | null> } })
      .__AURA3D_GAME_SOUND__ = { recordMaster: (seconds?: number) => audio.recordMaster(seconds) };
  }

  const channel = installEvidenceChannel({
    id: options.id,
    builtins: {
      session: () => ({ state: session.state, seed: session.seed, simTime: session.simTime }),
      capture: () => capture,
      perf: () => perfRing.summary()
    },
    loader: options.evidence?.sections === undefined
      ? undefined
      : typeof options.evidence.sections === "function"
        ? options.evidence.sections
        : () => Promise.resolve(options.evidence!.sections as Readonly<Record<string, EvidenceSectionCollect>>),
    legacyGlobals: options.evidence?.legacyGlobals
  });

  return game;
}
