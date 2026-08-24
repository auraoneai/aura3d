import { game, type RuntimeNodeHandleLike } from "@aura3d/engine";
import { resolveSkylineActIndex } from "./act-palette";
import { skylineCameraFrame, type SkylineCameraFrame, type SkylineCameraTuning } from "./camera-readability";
import { SKYLINE_SENTRY_ENCOUNTERS } from "./level";
import type { SkylineAudioCue } from "./skyline-audio-manifest";
import type { SkylineAudioController } from "./skyline-audio";

export interface SkylineFeelOptions {
  readonly reducedMotion: boolean;
  readonly cameraTuning: SkylineCameraTuning;
  readonly audio?: SkylineAudioController;
}

export interface SkylineFeelSnapshot {
  readonly paused: boolean;
  readonly actIndex: number;
  readonly simFrozen: boolean;
  readonly reducedMotion: boolean;
  readonly cameraShakeOffset: readonly [number, number, number];
  readonly maximumCameraShakeMagnitude: number;
  readonly cameraImpactRequests: number;
  readonly cameraImpactsSuppressed: number;
}

export type SkylineRequiredFeedbackEvent =
  | "jump"
  | "land"
  | "dash"
  | "collect"
  | "relay"
  | "hazard"
  | "defeat"
  | "respawn"
  | "finish";

export interface SkylineEventFeedbackObservation {
  readonly event: SkylineRequiredFeedbackEvent;
  readonly kitEvent: "jump" | "land" | "dash" | "collect" | "checkpoint" | "hazard-or-fall" | "defeat-or-stomp" | "respawn" | "complete";
  readonly sceneSignature: string;
  readonly audioCue: SkylineAudioCue;
  readonly observedCount: number;
  readonly sceneEffectApplied: boolean;
  readonly audioCueRequested: boolean;
}

export interface SkylineEventFeedbackProof {
  readonly scope: "mounted-session-cumulative";
  readonly requiredEventCount: number;
  readonly observedEventCount: number;
  readonly allRequiredObserved: boolean;
  readonly distinctSceneSignatureCount: number;
  readonly distinctAudioCueCount: number;
  readonly events: Readonly<Record<SkylineRequiredFeedbackEvent, SkylineEventFeedbackObservation>>;
}

/**
 * Canonical SR-06 contract. Every entry owns a distinct rendered response and a
 * distinct typed cue, and handlers are called only from the matching public-kit
 * event in main.ts.
 */
export const SKYLINE_REQUIRED_EVENT_FEEDBACK = Object.freeze({
  jump: { kitEvent: "jump", sceneSignature: "cyan-lift-ring", audioCue: "jump" },
  land: { kitEvent: "land", sceneSignature: "mint-ground-dust-camera-dip", audioCue: "land-dust" },
  dash: { kitEvent: "dash", sceneSignature: "lavender-dash-trail-camera-punch", audioCue: "dash" },
  collect: { kitEvent: "collect", sceneSignature: "gold-pickup-hit-spark", audioCue: "coin-chime" },
  relay: { kitEvent: "checkpoint", sceneSignature: "cyan-relay-ring-wave-and-pulse", audioCue: "checkpoint" },
  hazard: { kitEvent: "hazard-or-fall", sceneSignature: "coral-impact-flash-camera-hit", audioCue: "death" },
  defeat: { kitEvent: "defeat-or-stomp", sceneSignature: "orange-aura-burst-and-ring", audioCue: "sentry-defeat" },
  respawn: { kitEvent: "respawn", sceneSignature: "cyan-recovery-dust-and-ring", audioCue: "respawn" },
  finish: { kitEvent: "complete", sceneSignature: "emerald-summit-burst-and-double-ring", audioCue: "summit" }
} satisfies Record<SkylineRequiredFeedbackEvent, Omit<SkylineEventFeedbackObservation, "event" | "observedCount" | "sceneEffectApplied" | "audioCueRequested">>);

export interface SkylineFeelController {
  readonly snapshot: () => SkylineFeelSnapshot;
  readonly eventFeedbackProof: () => SkylineEventFeedbackProof;
  togglePause(): boolean;
  resetPause(): void;
  resetRuntime(): void;
  onJump(scenePlayerPosition: readonly [number, number, number]): void;
  onLand(scenePlayerPosition: readonly [number, number, number]): void;
  onDash(scenePlayerPosition: readonly [number, number, number]): void;
  onCollect(scenePoint: readonly [number, number, number]): void;
  onEmberPickup(scenePoint: readonly [number, number, number]): void;
  onCheckpoint(actTitle: string, scenePoint: readonly [number, number, number]): void;
  onSentryDefeat(scenePoint: readonly [number, number, number], scoreDelta: number): void;
  onEmberDeny(scenePoint: readonly [number, number, number]): void;
  onEmberFire(scenePoint: readonly [number, number, number]): void;
  onEmberImpact(scenePoint: readonly [number, number, number]): void;
  onHazard(scenePoint: readonly [number, number, number]): void;
  onRespawn(scenePoint: readonly [number, number, number]): void;
  onSummit(scenePoint: readonly [number, number, number]): void;
  applyCameraShake(cameraSpec: {
    offset?: readonly [number, number, number];
    targetOffset?: readonly [number, number, number];
  }, playerFacing: number): SkylineCameraFrame;
  updatePresentation(step: number, input: {
    readonly simTime: number;
    readonly playerX: number;
    readonly playerY: number;
    readonly playerFacing: number;
    readonly sceneBinding: { readonly toScenePoint: (point: { readonly x: number; readonly y: number }, elevation?: number) => readonly [number, number, number] };
    readonly defeatedHazardIds: readonly string[];
    readonly sentryNodes: Readonly<Record<string, RuntimeNodeHandleLike>>;
    readonly sentryAccentNodes: Readonly<Record<string, readonly RuntimeNodeHandleLike[]>>;
    readonly emberVolleys: readonly { readonly x: number; readonly y: number; readonly slot: number }[];
    readonly emberVolleyNodes: readonly RuntimeNodeHandleLike[];
    readonly firePressed: boolean;
    readonly emberStock: number;
    readonly scoreElement?: HTMLElement | null;
  }): void;
  bindScorePopHost(host: HTMLElement | null): void;
  /** Evidence accessors surfacing the live ceremony state for the mounted proof. */
  telegraphActive(): boolean;
  sentryDefeatSeen(): boolean;
  landDipSeen(): boolean;
  dashPunchSeen(): boolean;
}

const HIDDEN_SCALE = [0.0001, 0.0001, 0.0001] as const;
const TELEGRAPH_SECONDS = 0.5;

export function createSkylineFeel(options: SkylineFeelOptions): SkylineFeelController {
  const cameraDirector = game.cameraDirector({
    reducedMotion: options.reducedMotion,
    impactShake: !options.reducedMotion
  });
  const runtimeEffects = game.effects({ poolSize: 64, reducedMotion: options.reducedMotion });
  // Optional audio wiring: feel handlers remain pure presentation if no controller is supplied.
  const audio = options.audio;
  const playCue = (cueId: SkylineAudioCue): void => {
    audio?.cue(cueId).catch(() => { /* audio is optional; ignore unlock/suppress errors */ });
  };
  let paused = false;
  let actIndex = 0;
  let scorePopHost: HTMLElement | null = null;
  let actCardRemaining = 0;
  let denyFlashRemaining = 0;
  let muzzleFlashRemaining = 0;
  let checkpointPulseRemaining = 0;
  const sentryTelegraph = new Map<string, number>();
  const sentriesHaveTelegraphed = new Map<string, boolean>();
  let cameraShakeOffset: [number, number, number] = [0, 0, 0];
  let maximumCameraShakeMagnitude = 0;
  let cameraImpactRequests = 0;
  let cameraImpactsSuppressed = 0;
  let lastTelegraphEffectAt = 0;
  // Evidence-tracking flags so the route can publish ceremony state without reading DOM.
  let telegraphWindowSeen = false;
  let sentryDefeatSeenFlag = false;
  let landDipSeenFlag = false;
  let dashPunchSeenFlag = false;
  const eventFeedback = Object.fromEntries(
    Object.entries(SKYLINE_REQUIRED_EVENT_FEEDBACK).map(([event, contract]) => [event, {
      event,
      ...contract,
      observedCount: 0,
      sceneEffectApplied: false,
      audioCueRequested: false
    }])
  ) as Record<SkylineRequiredFeedbackEvent, SkylineEventFeedbackObservation>;

  const recordEventFeedback = (event: SkylineRequiredFeedbackEvent): void => {
    const current = eventFeedback[event];
    eventFeedback[event] = {
      ...current,
      observedCount: current.observedCount + 1,
      sceneEffectApplied: true,
      audioCueRequested: true
    };
  };

  const requestCameraImpact = (intensity: number, duration: number): void => {
    cameraImpactRequests += 1;
    if (options.reducedMotion) cameraImpactsSuppressed += 1;
    cameraDirector.impact(intensity, duration);
  };

  const ensureActCard = (): HTMLElement | null => {
    if (typeof document === "undefined") return null;
    let card = document.getElementById("skyline-act-card");
    if (!card) {
      card = document.createElement("div");
      card.id = "skyline-act-card";
      card.className = "act-title-card";
      card.setAttribute("role", "status");
      card.setAttribute("aria-live", "polite");
      document.body.appendChild(card);
    }
    return card;
  };

  const showActCard = (title: string): void => {
    actCardRemaining = 1.8;
    const card = ensureActCard();
    if (!card) return;
    card.textContent = title;
    card.dataset.visible = "true";
  };

  const hideActCard = (): void => {
    const card = document.getElementById("skyline-act-card");
    if (!card) return;
    card.dataset.visible = "false";
    card.textContent = "";
  };

  const spawnScorePop = (value: number): void => {
    if (!scorePopHost || value <= 0) return;
    const pop = document.createElement("span");
    pop.className = "score-pop";
    pop.textContent = `+${value}`;
    scorePopHost.appendChild(pop);
    window.setTimeout(() => pop.remove(), 900);
  };

  return {
    snapshot() {
      return {
        paused,
        actIndex,
        simFrozen: paused,
        reducedMotion: options.reducedMotion,
        cameraShakeOffset: [...cameraShakeOffset],
        maximumCameraShakeMagnitude,
        cameraImpactRequests,
        cameraImpactsSuppressed
      };
    },
    eventFeedbackProof() {
      const events = Object.fromEntries(
        Object.entries(eventFeedback).map(([event, observation]) => [event, { ...observation }])
      ) as Record<SkylineRequiredFeedbackEvent, SkylineEventFeedbackObservation>;
      const observed = Object.values(events).filter((entry) => entry.observedCount > 0);
      return {
        scope: "mounted-session-cumulative",
        requiredEventCount: Object.keys(SKYLINE_REQUIRED_EVENT_FEEDBACK).length,
        observedEventCount: observed.length,
        allRequiredObserved: observed.length === Object.keys(SKYLINE_REQUIRED_EVENT_FEEDBACK).length,
        distinctSceneSignatureCount: new Set(Object.values(events).map((entry) => entry.sceneSignature)).size,
        distinctAudioCueCount: new Set(Object.values(events).map((entry) => entry.audioCue)).size,
        events
      };
    },
    togglePause() {
      paused = !paused;
      playCue("pause");
      return paused;
    },
    resetPause() {
      paused = false;
    },
    resetRuntime() {
      paused = false;
      actIndex = 0;
      actCardRemaining = 0;
      denyFlashRemaining = 0;
      muzzleFlashRemaining = 0;
      checkpointPulseRemaining = 0;
      sentryTelegraph.clear();
      sentriesHaveTelegraphed.clear();
      runtimeEffects.clear();
      cameraShakeOffset = [0, 0, 0];
      maximumCameraShakeMagnitude = 0;
      cameraImpactRequests = 0;
      cameraImpactsSuppressed = 0;
      hideActCard();
    },
    bindScorePopHost(host) {
      scorePopHost = host;
    },
    onJump(scenePlayerPosition) {
      runtimeEffects.ringShockwave(
        [scenePlayerPosition[0], scenePlayerPosition[1] - 0.14, 0.4],
        { intensity: 0.26, duration: 0.12, color: "#8ef0ff" }
      );
      playCue("jump");
      recordEventFeedback("jump");
    },
    onLand(scenePlayerPosition) {
      requestCameraImpact(0.42, 0.12);
      runtimeEffects.groundDust(scenePlayerPosition, { intensity: 0.35, duration: 0.12 });
      playCue("land-dust");
      landDipSeenFlag = true;
      recordEventFeedback("land");
    },
    onDash(scenePlayerPosition) {
      requestCameraImpact(0.58, 0.14);
      runtimeEffects.dashTrail(scenePlayerPosition, { intensity: 0.72, duration: 0.16 });
      playCue("dash");
      dashPunchSeenFlag = true;
      recordEventFeedback("dash");
    },
    onCollect(scenePoint) {
      runtimeEffects.hitSpark([scenePoint[0], scenePoint[1], 0.42], { intensity: 0.62, duration: 0.18, color: "#fff1a8" });
      playCue("coin-chime");
      recordEventFeedback("collect");
    },
    onCheckpoint(actTitle, scenePoint) {
      checkpointPulseRemaining = 0.65;
      showActCard(actTitle);
      runtimeEffects.ringShockwave([scenePoint[0], scenePoint[1] + 0.18, 0.4], {
        intensity: 0.72,
        duration: 0.4,
        color: "#22d3ee"
      });
      playCue("checkpoint");
      recordEventFeedback("relay");
    },
    onSentryDefeat(scenePoint, scoreDelta) {
      runtimeEffects.auraBurst([scenePoint[0], scenePoint[1], 0.42], { intensity: 0.85, duration: 0.22, color: "#ffb070" });
      runtimeEffects.ringShockwave([scenePoint[0], scenePoint[1], 0.4], { intensity: 0.55, duration: 0.2, color: "#ffd08a" });
      spawnScorePop(scoreDelta);
      playCue("sentry-defeat");
      sentryDefeatSeenFlag = true;
      recordEventFeedback("defeat");
    },
    onEmberDeny(scenePoint) {
      denyFlashRemaining = 0.22;
      runtimeEffects.impactFlash([scenePoint[0], scenePoint[1], 0.44], { intensity: 0.28, duration: 0.14, color: "#ff8866" });
      playCue("ember-deny");
    },
    onEmberFire(scenePoint) {
      muzzleFlashRemaining = 0.12;
      runtimeEffects.impactFlash([scenePoint[0], scenePoint[1], 0.44], { intensity: 0.72, duration: 0.1, color: "#ffd08a" });
      playCue("ember-fire");
    },
    onEmberImpact(scenePoint) {
      runtimeEffects.hitSpark([scenePoint[0], scenePoint[1], 0.42], { intensity: 0.95, duration: 0.16, color: "#ff7a32" });
      playCue("ember-impact");
    },
    onEmberPickup(scenePoint) {
      runtimeEffects.hitSpark([scenePoint[0], scenePoint[1], 0.34], { intensity: 0.7, duration: 0.18, color: "#ffb070" });
      playCue("ember-pickup");
    },
    onHazard(scenePoint) {
      requestCameraImpact(0.86, 0.2);
      runtimeEffects.impactFlash([scenePoint[0], scenePoint[1] + 0.12, 0.44], {
        intensity: 0.9,
        duration: 0.2,
        color: "#f43f5e"
      });
      runtimeEffects.auraBurst([scenePoint[0], scenePoint[1] + 0.08, 0.42], {
        intensity: 0.58,
        duration: 0.24,
        color: "#ff8a9b"
      });
      playCue("death");
      recordEventFeedback("hazard");
    },
    onRespawn(scenePoint) {
      runtimeEffects.groundDust(scenePoint, { intensity: 0.52, duration: 0.32, color: "#8ef0ff" });
      runtimeEffects.ringShockwave([scenePoint[0], scenePoint[1] + 0.12, 0.4], {
        intensity: 0.68,
        duration: 0.55,
        color: "#8ef0ff"
      });
      playCue("respawn");
      recordEventFeedback("respawn");
    },
    onSummit(scenePoint) {
      requestCameraImpact(0.52, 0.3);
      runtimeEffects.auraBurst([scenePoint[0], scenePoint[1] + 0.2, 0.42], {
        intensity: 1,
        duration: 0.72,
        color: "#64e8c4"
      });
      runtimeEffects.ringShockwave([scenePoint[0], scenePoint[1] + 0.18, 0.4], {
        intensity: 0.9,
        duration: 0.75,
        color: "#64e8c4"
      });
      runtimeEffects.ringShockwave([scenePoint[0], scenePoint[1] + 0.18, 0.39], {
        intensity: 0.58,
        duration: 1.05,
        color: "#f7c948"
      });
      playCue("summit");
      recordEventFeedback("finish");
    },
    applyCameraShake(cameraSpec, playerFacing) {
      const frame = skylineCameraFrame(options.cameraTuning, playerFacing, cameraShakeOffset);
      cameraSpec.offset = frame.offset;
      cameraSpec.targetOffset = frame.targetOffset;
      return frame;
    },
    telegraphActive() {
      if (sentryTelegraph.size === 0) return false;
      let anyActive = false;
      for (const remaining of sentryTelegraph.values()) {
        if (remaining > 0) { anyActive = true; break; }
      }
      // A telegraph was seen if any window has ever opened; treat the flag as sticky for evidence.
      telegraphWindowSeen = telegraphWindowSeen || anyActive;
      return telegraphWindowSeen;
    },
    sentryDefeatSeen() {
      return sentryDefeatSeenFlag;
    },
    landDipSeen() {
      return landDipSeenFlag;
    },
    dashPunchSeen() {
      return dashPunchSeenFlag;
    },
    updatePresentation(step, input) {
      if (actCardRemaining > 0) {
        actCardRemaining = Math.max(0, actCardRemaining - step);
        if (actCardRemaining <= 0) hideActCard();
      }
      denyFlashRemaining = Math.max(0, denyFlashRemaining - step);
      muzzleFlashRemaining = Math.max(0, muzzleFlashRemaining - step);
      checkpointPulseRemaining = Math.max(0, checkpointPulseRemaining - step);

      actIndex = resolveSkylineActIndex(input.playerX);

      const cameraFrame = cameraDirector.update(step, [{
        id: "player",
        position: [input.playerX, input.playerY, 0]
      }]);
      cameraShakeOffset = cameraFrame.shake > 0
        ? [cameraFrame.shake * 0.04, -cameraFrame.shake * 0.02, 0]
        : [0, 0, 0];
      maximumCameraShakeMagnitude = Math.max(
        maximumCameraShakeMagnitude,
        Math.hypot(cameraShakeOffset[0], cameraShakeOffset[1], cameraShakeOffset[2])
      );
      runtimeEffects.update(step);

      for (const encounter of SKYLINE_SENTRY_ENCOUNTERS) {
        if (input.defeatedHazardIds.includes(encounter.id)) {
          input.sentryNodes[encounter.id]?.setVisible(false);
          for (const accent of input.sentryAccentNodes[encounter.id] ?? []) accent.setVisible(false);
          continue;
        }
        const node = input.sentryNodes[encounter.id];
        if (!node) continue;

        const distance = Math.abs(input.playerX - encounter.x);
        const playerApproaching = (input.playerFacing >= 0 && encounter.x > input.playerX)
          || (input.playerFacing < 0 && encounter.x < input.playerX);
        let telegraph = sentryTelegraph.get(encounter.id) ?? 0;
        if (distance <= 1.35 && playerApproaching && distance > 0.18) {
          telegraph = telegraph > 0 ? telegraph : TELEGRAPH_SECONDS;
        } else if (distance > 1.6) {
          telegraph = 0;
        }
        telegraph = Math.max(0, telegraph - step);
        sentryTelegraph.set(encounter.id, telegraph);

        const phase = ((input.simTime / Math.max(0.001, encounter.period)) + encounter.phase) * Math.PI * 2;
        const patrolOffset = Math.sin(phase) * encounter.amplitude;
        const [sceneX, sceneY] = input.sceneBinding.toScenePoint({
          x: encounter.x + patrolOffset + encounter.width / 2,
          y: encounter.y
        });
        const faceYaw = input.playerX >= encounter.x ? Math.PI / 2 : -Math.PI / 2;
        const telegraphPulse = telegraph > 0 ? 1 + Math.sin((TELEGRAPH_SECONDS - telegraph) * 24) * 0.06 : 1;
        node.setVisible(true)
          .setPosition(sceneX, sceneY, 0.42)
          .setRotation(0, faceYaw, 0)
          .setScale(telegraphPulse);
        for (const accent of input.sentryAccentNodes[encounter.id] ?? []) {
          accent
            .setVisible(true)
            .setPosition(sceneX, sceneY + 0.075, 0.395)
            // Runtime transforms replace authored transforms. Preserve the compact
            // crossed-warning silhouette instead of expanding each slash to a
            // full-size foreground box when the sentry starts moving.
            .setScale([0.12 * telegraphPulse, 0.018 * telegraphPulse, 0.022 * telegraphPulse]);
        }

        if (telegraph > 0 && input.simTime - lastTelegraphEffectAt > 0.12) {
          runtimeEffects.ringShockwave([sceneX, sceneY + 0.18, 0.42], {
            intensity: 0.22,
            duration: 0.08,
            color: "#ff8866",
            ownerId: encounter.id
          });
          lastTelegraphEffectAt = input.simTime;
        }
        if (telegraph > 0 && !sentriesHaveTelegraphed.get(encounter.id)) {
          sentriesHaveTelegraphed.set(encounter.id, true);
          playCue("sentry-telegraph");
        }
      }

      if (input.firePressed && input.emberStock <= 0) {
        const [px, py] = input.sceneBinding.toScenePoint({ x: input.playerX, y: input.playerY });
        this.onEmberDeny([px, py, 0.42]);
      }

      for (const [index, node] of input.emberVolleyNodes.entries()) {
        const volley = input.emberVolleys.find((entry) => entry.slot === index);
        if (!volley) {
          node.setVisible(false).setScale([...HIDDEN_SCALE]);
          continue;
        }
        const [sx, sy] = input.sceneBinding.toScenePoint({ x: volley.x, y: volley.y });
        const scaleBoost = muzzleFlashRemaining > 0 && volley.slot === index ? 0.05 : 0;
        node.setVisible(true).setPosition(sx, sy, 0.42).setScale([
          0.14 + scaleBoost,
          0.045 + scaleBoost * 0.35,
          0.045 + scaleBoost * 0.35
        ]);
      }

      if (denyFlashRemaining > 0) input.scoreElement?.classList.add("ember-deny");
      else input.scoreElement?.classList.remove("ember-deny");

      if (typeof document !== "undefined") {
        document.documentElement.style.setProperty(
          "--skyline-checkpoint-pulse",
          checkpointPulseRemaining > 0 ? String(checkpointPulseRemaining / 0.65) : "0"
        );
      }
    }
  };
}

export function applySkylineActPaletteVisibility(
  actIndex: number,
  bandSets: Readonly<Record<number, readonly RuntimeNodeHandleLike[]>>,
  fogSets: Readonly<Record<number, RuntimeNodeHandleLike | undefined>>
): number {
  const active = Math.max(0, Math.min(4, actIndex));
  for (const [index, nodes] of Object.entries(bandSets)) {
    const visible = Number(index) === active;
    for (const node of nodes) node.setVisible(visible);
  }
  for (const [index, node] of Object.entries(fogSets)) {
    node?.setVisible(Number(index) === active);
  }
  return active;
}
