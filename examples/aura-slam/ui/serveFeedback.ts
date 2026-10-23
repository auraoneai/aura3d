import { controlText } from "./format";
import type { ControlsPort } from "./controls";
import type { HudState, ScoreboardNames, ServeAttemptView, ServeFeedback } from "./types";

export const serveAttemptOf = (state: HudState): ServeAttemptView | null => (state.serveAttempt as ServeAttemptView | null) ?? null;
export const lastServeOf = (state: HudState): ServeAttemptView | null => (state.lastServe as ServeAttemptView | null) ?? null;

export const serveTimingText = (attempt: ServeAttemptView | null | undefined): string =>
  attempt?.timing === "PERFECT" ? "CENTERED" : attempt?.timing ?? "";

export function serveFaultText(attempt: ServeAttemptView): string {
  return [serveTimingText(attempt), attempt.power ? "POWER +0.5 m" : "",
    `${attempt.result === "doubleFault" ? "DOUBLE FAULT" : "FAULT"} — ${attempt.faultReason}`].filter(Boolean).join(" · ");
}

/** game.js `withServeFaultTiming`: folds the serve fault timing into the call banner. */
export function withServeFaultTiming(call: string, state: HudState, modernServe: boolean): string {
  const attempt = serveAttemptOf(state);
  if (!call || !modernServe || !attempt?.faultReason) return call;
  if (state.phase === "serveFault" && attempt.result === "fault") return `${serveFaultText(attempt)} • SECOND SERVE`;
  if (state.phase === "point" && attempt.result === "doubleFault") {
    const fault = serveFaultText(attempt);
    return call.includes("DOUBLE FAULT") ? call.replace("DOUBLE FAULT", fault) : `${call} · ${fault}`;
  }
  return call;
}

interface ServeStatsLike {
  aces?: number; doubleFaults?: number; firstIn?: number; firstAttempts?: number; secondIn?: number; secondAttempts?: number;
  unreturned?: number; pointsWon?: number; pointsPlayed?: number; powerIn?: number; powerAttempts?: number;
  speedCount?: number; speedTotal?: number; firstSpeedCount?: number; firstSpeedTotal?: number; secondSpeedCount?: number; secondSpeedTotal?: number;
  fastest?: number;
}

export function serveStatsText(state: HudState, side: "player" | "ai", names: ScoreboardNames): string {
  const stats = (state[side] as { stats?: { serve?: ServeStatsLike } }).stats?.serve;
  if (!stats) return "";
  const rate = (made?: number, total?: number): string => (total ? `${Math.round((100 * (made ?? 0)) / total)}%` : "—");
  const avg = (total?: number, count?: number): string => (count ? `${Math.round((total ?? 0) / count)} km/h` : "—");
  return `${names[side]} · ${stats.aces} aces · ${stats.doubleFaults} double faults · 1st in ${rate(stats.firstIn, stats.firstAttempts)} · ` +
    `2nd in ${rate(stats.secondIn, stats.secondAttempts)} · ${stats.unreturned} unreturned · serve points ${rate(stats.pointsWon, stats.pointsPlayed)} · ` +
    `power in ${rate(stats.powerIn, stats.powerAttempts)} · average ${avg(stats.speedTotal, stats.speedCount)} ` +
    `(1st ${avg(stats.firstSpeedTotal, stats.firstSpeedCount)}, 2nd ${avg(stats.secondSpeedTotal, stats.secondSpeedCount)}) · fastest ${stats.fastest || "—"} km/h`;
}

export interface ServeCardView {
  hidden: boolean; launchSpeed: string; launchLabel: string; hint: string; powered: boolean; warning: boolean;
  statsPlayer: string; statsAi: string;
}

/** game.js `renderServeFeedback` as a pure view model. */
export function serveCardView(state: HudState, feedback: ServeFeedback | null, names: ScoreboardNames, modernServe: boolean): ServeCardView {
  const hidden = !modernServe || Boolean(state.practice) || state.mode === "menu";
  const empty: ServeCardView = { hidden, launchSpeed: "—", launchLabel: "SERVE LAUNCH", hint: "SERVE", powered: false, warning: false, statsPlayer: "", statsAi: "" };
  if (hidden) return empty;
  const serving = state.server === "player" && ["serve", "serveToss", "serveSwing"].includes(state.phase);
  const attempt = serveAttemptOf(state);
  const last = lastServeOf(state);
  const recent = (attempt?.launchSpeedKph ?? 0) > 0 || attempt?.faultReason ? attempt : last;
  const speed = recent?.launchSpeedKph || last?.launchSpeedKph;
  let hint = "SERVE";
  if (serving) {
    const locked = attempt?.lockedAim;
    hint = locked ? (attempt?.power ? "POWER · +0.5 m depth" : "AIM LOCKED · 240 ms swing") : "MOVE TARGET · WIDE / BODY / T";
    if (feedback?.netRisk) hint = "NET RISK · MOVE TARGET DEEPER";
    else if (attempt?.power && feedback?.powerLongRisk) hint = "POWER · +0.5 m · LONG RISK";
  } else if (recent?.result === "ace") hint = `ACE · ${names[recent.server]}`;
  else if (recent?.result === "let") hint = `LET · REPLAY ${recent.number === 2 ? "SECOND" : "FIRST"} SERVE`;
  else if (recent?.faultReason) hint = serveFaultText(recent);
  else if (recent?.quality != null) {
    const actual = recent.actual ? ((recent as { legal?: boolean }).legal === false ? "FAULT" : "IN") : /fault/i.test(String(recent.result ?? "")) ? "FAULT" : "IN FLIGHT";
    hint = `${serveTimingText(recent) || "OFF-CENTER"}${recent.power ? " · POWER +0.5 m" : ""} · ${actual}`;
  }
  return {
    hidden: false,
    launchSpeed: (speed ?? 0) > 0 ? `${Math.round(speed as number)} km/h` : "—",
    launchLabel: recent?.server ? `${names[recent.server]} · SERVE` : "SERVE LAUNCH",
    hint,
    powered: Boolean(serving ? attempt?.power : recent?.power),
    warning: Boolean(serving && (feedback?.netRisk || (attempt?.power && feedback?.powerLongRisk))),
    statsPlayer: serveStatsText(state, "player", names),
    statsAi: serveStatsText(state, "ai", names)
  };
}

export function renderServeCard(state: HudState, feedback: ServeFeedback | null, names: ScoreboardNames, modernServe: boolean,
  text: (id: string, v: string | number) => void): void {
  const card = document.getElementById("serve-feedback");
  if (!card) return;
  const view = serveCardView(state, feedback, names, modernServe);
  card.hidden = view.hidden;
  if (view.hidden) return;
  text("serve-launch-speed", view.launchSpeed);
  text("serve-launch-label", view.launchLabel);
  text("serve-hint", view.hint);
  card.classList.toggle("powered", view.powered);
  card.classList.toggle("warning", view.warning);
  text("serve-stats-player", view.statsPlayer);
  text("serve-stats-ai", view.statsAi);
}

export interface ServeInstructionTexts {
  keyboardHelp: string; powerHelp: string; touchHelp: string; lobKeyboardHelp: string; introHelp: string;
}

/** game.js `renderServeInstructions` as pure text, with the current bindings substituted in. */
export function serveInstructionTexts(opts: {
  modernServe: boolean; intentionalLobAllLevels: boolean; strategic: boolean; swipeActive: boolean;
  controls: Pick<ControlsPort, "getBindings" | "labelFor">;
}): ServeInstructionTexts {
  const { modernServe: modern, controls } = opts;
  const lobHelp = opts.intentionalLobAllLevels
    ? " In rallies, press LOB once to swing a high shot near the opposite baseline. Hold left/right to aim."
    : opts.strategic ? " In Ace and Legend rallies, press LOB once to swing a lob. Hold left/right to aim." : "";
  const t = (s: string): string => controlText(s, controls);
  const out: ServeInstructionTexts = {
    keyboardHelp: t(modern
      ? "Move the service target with arrows/WASD. Space tosses. Press Space as the rising ball reaches the overhead circle to start a 240 ms swing and lock aim."
      : "Tap to toss your serve. Tap again near the top to strike."),
    powerHelp: t(modern
      ? "On serve, press Space twice within 0.22 seconds during the swing for power and +0.5 m depth. No energy cost. Rally power still needs 38 energy."
      : "During a rally, press twice within 0.22 seconds before contact, or Shift + Space. Needs 38 power."),
    touchHelp: (modern
      ? "Drag the joystick or court to move; during serve setup and toss, drag moves only the target. HIT tosses; press HIT as the rising ball reaches the overhead circle to start the swing and lock aim. Double HIT within 0.22 seconds adds power, or use POWER HIT. Releasing a drag never swings."
      : "Drag the joystick to move and aim. HIT tosses; tap again near the top to serve. Double HIT during a rally swing adds power.") + lobHelp,
    lobKeyboardHelp: t(opts.intentionalLobAllLevels
      ? "In a rally, press R to swing a high, deep lob. Hold left/right to aim; depth is automatic and power is ignored."
      : "In Ace and Legend rallies, press R to swing a lob. Hold left/right to aim."),
    introHelp: t(modern ? "AIM · TOSS · PRESS AS THE RISING BALL REACHES THE CIRCLE" : "SPACE TO TOSS · SPACE AGAIN AT THE TOP TO SERVE")
  };
  if (opts.swipeActive) {
    out.touchHelp = "Swipe in the direction you want to hit. A longer upward swipe lands deeper; a faster swipe adds power. The target locks when you lift your finger. Movement and contact timing are automatic. Swipe once for each shot, including your serve.";
    out.introHelp = "SWIPE TO AIM AND SERVE";
  }
  return out;
}

export function renderServeInstructions(texts: ServeInstructionTexts, text: (id: string, v: string | number) => void): void {
  text("serve-keyboard-help", texts.keyboardHelp);
  text("serve-power-help", texts.powerHelp);
  text("serve-touch-help", texts.touchHelp);
  text("lob-keyboard-help", texts.lobKeyboardHelp);
  text("serve-intro-help", texts.introHelp);
}
