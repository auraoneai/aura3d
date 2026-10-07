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
  type AuraCreateGameAppOptions,
  type AuraSceneBuilder,
  type AuraSceneSnapshot,
  type AuraTimeController
} from "@aura3d/engine";
type RuntimeInput = ReturnType<typeof createGameApp>["input"];
import type {
  CaptureContext,
  CreateGameOptions,
  Game,
  GameScenario,
  TransitionSpec
} from "@aura3d/engine/contracts";
import { StubTimeController } from "@aura3d/engine/contracts";
import { GameSessionImpl } from "./session/GameSession";
import { attachSessionLifecycle, type LifecycleSound } from "./session/lifecycle";
import { createAccessibility } from "./session/accessibility";
import { captureFromUrl } from "./capture/captureFromUrl";
import { lookSignature, type LookSource } from "./capture/lookSignature";
import { installGameBeacon } from "./evidence/beacon";
import { installEvidenceChannel, createPerfRing, type EvidenceChannelContract } from "./evidence/channel";
import { GameShellImpl, GameHudImpl, GameFxLayerImpl } from "./components";


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
  /** The mounted input controller when `options.input` was provided. */
  readonly input: RuntimeInput;
}

/** createGame options plus the PRD-09 scenario registry (§7.4) and the
 * createGameApp fields a route already owns (input/loop/physics/diagnostics). */
export type Prd09CreateGameOptions<TCue extends string, TEvent extends string> =
  CreateGameOptions<TCue, TEvent> & {
    readonly scenarios?: Readonly<Record<string, GameScenario>>;
    /** Wired into the session lifecycle (suspend/dispose/unlock on tab events). */
    readonly soundAdapter?: LifecycleSound;
    readonly input?: AuraCreateGameAppOptions["input"];
    readonly loop?: AuraCreateGameAppOptions["loop"];
    readonly physics?: AuraCreateGameAppOptions["physics"];
    readonly diagnostics?: AuraCreateGameAppOptions["diagnostics"];
    readonly runtimeEvidence?: AuraCreateGameAppOptions["runtimeEvidence"];
    /** Route evidence sections + legacy global aliases (C-24 §6.5). */
    readonly evidence?: EvidenceChannelContract;
  };

export function createGameImpl<TCue extends string, TEvent extends string>(
  options: Prd09CreateGameOptions<TCue, TEvent>
): Prd09Game<TCue, TEvent> {
  const capture: CaptureContext = captureFromUrl(currentUrl());
  const fallbackTime = new StubTimeController();
  const session = new GameSessionImpl({ seed: capture.seed ?? 0, time: fallbackTime });

  const authoredScene = normalizeSceneSnapshot(
    options.scene() as AuraSceneBuilder | AuraSceneSnapshot
  );
  let lookSource: LookSource = authoredScene as unknown as LookSource;

  const runtime = createGameApp(options.target, {
    scene: authoredScene,
    qualityRebuild: options.qualityRebuild as { flags?: readonly string[] },
    input: options.input,
    loop: options.loop,
    physics: options.physics,
    diagnostics: options.diagnostics,
    runtimeEvidence: options.runtimeEvidence
  });
  const app = runtime.app;
  // Delegate to the real controller when one is mounted on the app.
  if ((app as { time?: AuraTimeController }).time !== undefined) {
    session.bindTimeController((app as { time?: AuraTimeController }).time!);
  }

  const accessibility = createAccessibility(options.id);
  session.setAccessibility(accessibility.values);
  const accessibilityUnsub = accessibility.onChange((v) => session.setAccessibility(v));

  const shell = new GameShellImpl(session);
  const hud = new GameHudImpl();
  const fx = new GameFxLayerImpl();

  let firstFrameAt: number | null = null;
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
  runtime.onFrame((frame) => {
    session.tick(frame.dt);
    perfRing.record(frame.dt * 1000);
  });

  const detachLifecycle = attachSessionLifecycle({ session, sound: options.soundAdapter });

  let disposed = false;
  let readyPromise: Promise<void> | null = null;

  const game: Prd09Game<TCue, TEvent> = {
    id: options.id,
    app,
    input: runtime.input,
    session,
    sessionImpl: session,
    shell,
    hud,
    touch: null,
    fx,
    capture,
    lookSignature: () => lookSignature(lookSource),
    lookSource: () => lookSource,
    ready(): Promise<void> {
      if (!readyPromise) {
        readyPromise = app.ready().then(() => {
          if (session.state === "booting" || session.state === "loading" || session.state === "title") {
            session.transition("playing");
          }
        });
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
        await app.setScene(scene);
        lookSource = normalizeSceneSnapshot(
          scene as AuraSceneBuilder | AuraSceneSnapshot
        ) as unknown as LookSource;
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
      accessibilityUnsub();
      accessibility.dispose();
      beacon.dispose();
      channel.dispose();
      session.transition("disposed");
      hud.dispose();
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

  const channel = installEvidenceChannel({
    id: options.id,
    builtins: {
      session: () => ({ state: session.state, seed: session.seed, simTime: session.simTime }),
      capture: () => capture,
      perf: () => perfRing.summary()
    },
    loader: options.evidence?.sections,
    legacyGlobals: options.evidence?.legacyGlobals
  });

  return game;
}
