import type { HudPort } from "../contract";
import type { ControlsPort } from "./controls";
import { byId, createTextWriter } from "./dom";
import { ballSpeedKph, clamp, controlText, reducedMotion } from "./format";
import { renderMatchResults } from "./results";
import { renderScoreboard } from "./scoreboard";
import {
  renderServeCard, renderServeInstructions, serveInstructionTexts, withServeFaultTiming
} from "./serveFeedback";
import { SHOT_DEFAULTS, type ShotConstants, type HudState, type OutFeedbackBlock, type PracticeView, type ScoreboardNames, type ServeFeedback } from "./types";
import { themeFor } from "./venues";
import { createBroadcastHud, type BroadcastHud } from "./broadcast";

export const practiceOf = (state: HudState): PracticeView | null => (state.practice as unknown as PracticeView | undefined) ?? null;
export const outFeedbackOf = (state: HudState): OutFeedbackBlock | null => (state.outFeedback as unknown as OutFeedbackBlock | null) ?? null;

export interface SpeedometerView { speedKph: number; lastShotSpeedKph: number; maxKph: number; fraction: number }
/** game.js `ballSpeedState` + the gauge fraction used by `renderSpeedometer`. */
export function speedometerView(state: HudState): SpeedometerView {
  const ball = state.ball;
  const moving = ball.active || ball.settling || state.phase === "serveToss";
  const speedKph = moving ? ballSpeedKph(ball) : 0;
  const maxKph = 250;
  return { speedKph, lastShotSpeedKph: state.lastShotSpeed, maxKph, fraction: clamp(speedKph / maxKph, 0, 1) };
}

export interface OutFeedbackView { visible: boolean; remainingMs: number; pulse: number; reducedMotion: boolean }
/** game.js `outFeedbackState`: two soft pulses that follow simulation time so pause and replay stay exact. */
export function outFeedbackView(state: HudState, reduced = false): OutFeedbackView {
  const feedback = outFeedbackOf(state);
  const visible = state.mode === "playing" && !state.paused && Boolean(feedback && feedback.remaining > 0);
  const age = feedback ? feedback.duration - feedback.remaining : 0;
  const pulse = age < 1.1 ? Math.sin((Math.PI * (age % 0.55)) / 0.55) ** 2 : 0;
  return {
    visible, remainingMs: Math.round((feedback?.remaining || 0) * 1000),
    pulse: visible ? +(reduced ? 0.35 : pulse).toFixed(3) : 0, reducedMotion: reduced
  };
}

export interface PowerView { low: boolean; armed: boolean; aiming: boolean; denied: boolean; label: string; value: number; fraction: number }
export function powerView(state: HudState, shot = SHOT_DEFAULTS): PowerView {
  const p = state.player;
  const energy = state.energy ?? p.energy;
  const aiming = p.aimRemaining > 1e-9;
  const direction = p.queuedShot === "deep" ? (p.queuedAim < 0 ? "↖" : p.queuedAim > 0 ? "↗" : "↑")
    : p.queuedShot === "short" ? (p.queuedAim < 0 ? "↙" : p.queuedAim > 0 ? "↘" : "↓")
    : p.queuedAim < 0 ? "←" : p.queuedAim > 0 ? "→" : "·";
  const denied = state.time < (state.powerDeniedUntil ?? p.powerDeniedUntil ?? 0);
  return {
    low: energy < shot.powerCost, armed: p.queuedPower, aiming, denied,
    label: denied ? "RECOVERING" : aiming ? (p.queuedPower ? "POWER " : "AIM ") + direction : "POWER",
    value: Math.floor(energy), fraction: energy / shot.energyMax
  };
}

export interface CallContext {
  names: ScoreboardNames; key: string; modernServe: boolean; feedback: ServeFeedback | null; smashAvailable: boolean;
}
/** The call banner (`#hud-call`): game.js `render()` between `let call=` and `hudText('hud-call')`. */
export function callText(state: HudState, ctx: CallContext): string {
  const { names, key, modernServe, feedback } = ctx;
  const p = state.player;
  let call = state.messageTimer > 0 ? state.message : "";
  if (call === "TOSS AGAIN  •  SPACE") call = `TOSS AGAIN  •  ${key}`;
  call = call.replace(/\bYOU\b/g, () => names.player).replace(/\bRIVAL\b/g, () => names.ai);
  if (call && state.phase === "point" && state.pointWinner && !state.lastCall.startsWith("GAME")) {
    const reason = state.lastCall === "WINNER" || state.lastCall.startsWith("POINT —") ? "" : ` · ${state.lastCall}`;
    call = `${names[state.pointWinner]} WINS POINT${reason}`;
  }
  if (state.phase === "rally" && state.ball.active && state.ball.lastHit === "ai" && !p.swing) {
    if (state.ball.defensiveLob && state.ball.bounceCount === 0) call = "HIGH BALL · GET READY";
    if (ctx.smashAvailable) call = `SMASH · ${key}`;
  }
  const practice = practiceOf(state);
  if (practice && state.phase === "practiceFeed") call = state.message;
  if (practice && state.phase === "practiceResult") call = practice.lastResult ?? "";
  if (state.phase === "serve" && state.server === "player") {
    call = `${state.serveNumber === 2 ? "SECOND SERVE" : "YOUR SERVE"}${modernServe ? " · AIM THEN " : " · "}${key} TO TOSS`;
  }
  const attempt = state.serveAttempt as { swingAt?: number | null; power?: boolean } | null;
  if (state.phase === "serveToss" && state.server === "player") {
    if (!modernServe) call = Math.abs(state.ball.vz) < 0.75 ? `${key} · HIT NOW` : "WAIT FOR THE TOP OF THE TOSS";
    else if (attempt?.swingAt != null) call = attempt.power ? "POWER SERVE · +0.5 m" : `SWINGING · DOUBLE ${key} FOR POWER`;
    else call = feedback?.swingCue === "late" ? "LATE · LET TOSS DROP TO RETRY"
      : feedback?.swingCue === "ready" ? `START SWING · ${key} AS BALL REACHES CIRCLE` : `PRESS ${key} AS BALL RISES INTO CIRCLE`;
  }
  if (state.phase === "point" && (state.lastCall === "ACE" || (state.lastServe as { result?: string } | null)?.result === "ace")) {
    call = `ACE · ${names[state.pointWinner ?? "player"]}${state.lastCall.startsWith("GAME") ? " · GAME" : ""}`;
  }
  return withServeFaultTiming(call, state, modernServe);
}

export interface HudDeps {
  names: () => ScoreboardNames;
  controls: Pick<ControlsPort, "getBindings" | "labelFor">;
  /** The hit-key label shown in prompts: controller button, "HIT" on touch, or the bound key. */
  hitKeyLabel: () => string;
  modernServe: () => boolean;
  serveFeedback: () => ServeFeedback | null;
  smashAvailable: (state: HudState) => boolean;
  strategicDifficulty: (state: HudState) => boolean;
  intentionalLobAllLevels: () => boolean;
  swipeActive: () => boolean;
  shot?: Readonly<ShotConstants>;
  /** Fired once when a match finishes, for the shell to show results. */
  onResultsShown?: () => void;
  /** GU47 TT-H1: add the World Tour venue chip and serve-speed strip to the scorebug (off in `?look=original`). */
  broadcast?: boolean;
}

export interface Hud extends HudPort {
  /** Render every HUD element from `state` (game.js `render()` minus the touch and swipe overlays). */
  render(state: HudState): void;
  hideResults(): void;
}

export function createHud(deps: HudDeps): Hud {
  const text = createTextWriter();
  const shot = deps.shot ?? SHOT_DEFAULTS;
  let broadcast: BroadcastHud | null = null;

  function renderPractice(state: HudState): void {
    const drill = practiceOf(state);
    const el = byId("practice-hud");
    el.classList.toggle("hidden", !drill || state.mode === "menu");
    byId("scoreboard").classList.toggle("hidden", Boolean(drill) && state.mode !== "menu");
    if (!drill) return;
    text("practice-streak", `STREAK ${drill.streak}`);
    text("practice-smashes", `${drill.smashes} / ${drill.completed}`);
    text("practice-perfect", drill.perfect);
    text("practice-speed", drill.bestSpeed ? `${drill.bestSpeed} km/h` : "—");
    text("practice-result", drill.lastResult || controlText("Move under the lob and press Space before contact.", deps.controls));
  }

  function renderSpeedometer(state: HudState): void {
    const speed = speedometerView(state);
    text("hud-speed", speed.speedKph);
    text("hud-last-speed", speed.lastShotSpeedKph > 0 ? `${speed.lastShotSpeedKph} km/h` : "—");
    byId("speed-arc").setAttribute("stroke-dasharray", `${speed.fraction * 100} 100`);
    byId("speed-needle").setAttribute("transform", `rotate(${speed.fraction * 180} 64 64)`);
    byId("speed-live").classList.toggle("moving", speed.speedKph > 0);
    byId("speedometer").setAttribute("aria-label", `Ball speed ${speed.speedKph} kilometers per hour. Last shot ${speed.lastShotSpeedKph} kilometers per hour.`);
  }

  function renderOut(state: HudState): OutFeedbackView {
    const feedback = outFeedbackView(state, reducedMotion());
    const el = byId("out-feedback");
    el.classList.toggle("hidden", !feedback.visible);
    el.style.setProperty("--out-pulse", String(feedback.pulse));
    el.style.opacity = String(Math.min(1, feedback.remainingMs / 180));
    text("out-announcement", feedback.visible ? "Out" : "");
    return feedback;
  }

  function renderPower(state: HudState): void {
    const power = powerView(state, shot);
    const el = byId("power-hud");
    el.classList.toggle("low", power.low);
    el.classList.toggle("armed", power.armed);
    el.classList.toggle("aiming", power.aiming);
    el.classList.toggle("denied", power.denied);
    text("power-label", power.label);
    text("power-value", power.value);
    byId("power-fill").style.transform = `scaleX(${power.fraction})`;
    byId("power-meter").setAttribute("aria-valuenow", String(power.value));
  }

  const hud: Hud = {
    render(state) {
      const names = deps.names();
      const feedback = deps.serveFeedback();
      const modern = deps.modernServe();
      byId("match-hud").classList.toggle("hidden", state.mode === "menu");
      renderScoreboard(state, names, text);
      renderPractice(state);
      const out = renderOut(state);
      renderPower(state);
      const call = callText(state, { names, key: deps.hitKeyLabel(), modernServe: modern, feedback, smashAvailable: deps.smashAvailable(state) });
      text("hud-call", call);
      byId("hud-call").classList.toggle("hidden", !call || state.paused || (out.visible && call === "OUT"));
      renderSpeedometer(state);
      renderServeCard(state, feedback, names, modern, text);
      renderServeInstructions(serveInstructionTexts({
        modernServe: modern, intentionalLobAllLevels: deps.intentionalLobAllLevels(), strategic: deps.strategicDifficulty(state),
        swipeActive: deps.swipeActive(), controls: deps.controls
      }), text);
      const theme = themeFor(state.venue);
      text("hud-venue", `${theme.name} / ${theme.surface}`);
      if (deps.broadcast) (broadcast ??= createBroadcastHud()).render(state);
    },
    update(state) { hud.render(state as HudState); },
    showResults(state) {
      const names = deps.names();
      const won = (state as HudState).winner === "player";
      byId("result-title").textContent = won ? "VICTORY" : `${names.ai.toUpperCase()} WINS`;
      byId("result-score").textContent = `${state.score.playerGames} — ${state.score.aiGames} GAMES`;
      byId("result-matchup").textContent = `${names.player} vs ${names.ai}`;
      byId("result-stats").textContent = "";
      renderMatchResults(byId("match-stats"), state as HudState, names);
      const result = byId("result");
      result.classList.remove("hidden");
      result.setAttribute("aria-hidden", "false");
      (result as HTMLElement & { inert: boolean }).inert = false;
      byId("pause-btn").classList.add("hidden");
      byId("rematch-btn").focus({ preventScroll: true });
      result.scrollTop = 0;
      deps.onResultsShown?.();
    },
    hideResults() {
      const result = byId("result");
      result.classList.add("hidden");
      result.setAttribute("aria-hidden", "true");
      (result as HTMLElement & { inert: boolean }).inert = true;
      byId("match-stats").innerHTML = "";
    }
  };
  return hud;
}
