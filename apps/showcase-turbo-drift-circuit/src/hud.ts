import type { GameRacingSnapshot } from "@aura3d/engine";
import {
  formatGapToRival,
  formatLapClock,
  resolveRaceHudStatus,
  resolveRacePosition,
  startLightsLabel,
  type RaceSessionState,
  wrappedProgressGap
} from "./feel";

export interface TurboHudElements {
  speed: HTMLElement;
  lap: HTMLElement;
  checkpoint: HTMLElement;
  status: HTMLElement;
  gap: HTMLElement;
  position: HTMLElement;
  lastLap: HTMLElement;
  bestLap: HTMLElement;
  trackState: HTMLElement;
  startLights: HTMLElement;
  resultCard: HTMLElement;
  resultTime: HTMLElement;
  resultBest: HTMLElement;
  resultPosition: HTMLElement;
  debugSection: HTMLElement | null;
  alignment: HTMLElement;
  /** TDC-A1 additive ghost controls. */
  ghostState: HTMLElement;
  ghostBest: HTMLElement;
}

export interface TurboHudUpdateInput {
  readonly snapshot: GameRacingSnapshot;
  readonly session: RaceSessionState;
  readonly opponentProgress: number;
  readonly routeLength: number;
  readonly referenceSpeed: number;
  readonly onAsphalt: boolean;
  readonly recoveryVisible: boolean;
  readonly debugMode: boolean;
  /** TDC-A1 additive ghost fields. */
  readonly ghostAvailable: boolean;
  readonly ghostEnabled: boolean;
  readonly ghostBestLabel: string;
}

export function requireHudElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element;
}

export function bindTurboHudElements(): TurboHudElements {
  return {
    speed: requireHudElement("speed-value"),
    lap: requireHudElement("lap-value"),
    checkpoint: requireHudElement("checkpoint-value"),
    status: requireHudElement("status-value"),
    gap: requireHudElement("gap-value"),
    position: requireHudElement("position-value"),
    lastLap: requireHudElement("last-lap-value"),
    bestLap: requireHudElement("best-lap-value"),
    trackState: requireHudElement("track-state-value"),
    startLights: requireHudElement("start-lights"),
    resultCard: requireHudElement("result-card"),
    resultTime: requireHudElement("result-time-value"),
    resultBest: requireHudElement("result-best-value"),
    resultPosition: requireHudElement("result-position-value"),
    debugSection: document.getElementById("debug-section"),
    alignment: requireHudElement("alignment-value"),
    ghostState: requireHudElement("ghost-state-value"),
    ghostBest: requireHudElement("ghost-best-value")
  };
}

export function renderTurboHudPanel(debugMode: boolean): string {
  const debugBlock = debugMode ? `
    <section id="debug-section" class="debug-section" aria-label="Debug telemetry">
      <span id="alignment-status" class="contract-status" data-state="locked"><i aria-hidden="true"></i><strong id="alignment-value">Road locked</strong></span>
      <p>Alignment and kit telemetry visible with <kbd>?debug=1</kbd>.</p>
    </section>` : `<section id="debug-section" class="debug-section debug-section--hidden" hidden aria-hidden="true">
      <span id="alignment-status" class="contract-status" data-state="locked"><i aria-hidden="true"></i><strong id="alignment-value">Road locked</strong></span>
    </section>`;

  return `
    <header class="race-brand">
      <span class="panel__label"><i aria-hidden="true"></i> Tsukuba velocity trial</span>
      <h1>Turbo Drift Circuit</h1>
      <p class="panel__lede">Four laps, six gates, one rival — hold drift through the hairpin and steal the inside line.</p>
    </header>
    <div id="start-lights" class="start-lights" aria-live="polite" aria-label="Start lights">
      <span class="start-lights__light" data-lit="false">3</span>
      <span class="start-lights__light" data-lit="false">2</span>
      <span class="start-lights__light" data-lit="false">1</span>
      <span class="start-lights__light start-lights__light--go" data-lit="false">GO</span>
    </div>
    <section class="metrics-row" aria-label="Live race HUD">
      <article class="metric metric--speed"><span>Speed · km/h</span><strong id="speed-value">0</strong></article>
      <article class="metric"><span>Lap</span><strong id="lap-value">1/4</strong></article>
      <article class="metric"><span>Gate</span><strong id="checkpoint-value">0/6</strong></article>
      <article class="metric"><span>Gap</span><strong id="gap-value">+0.00s</strong></article>
      <article class="metric"><span>Pos</span><strong id="position-value">P2</strong></article>
      <article class="metric metric--status"><span>Race</span><strong id="status-value">Lights</strong></article>
    </section>
    <section class="lap-times" aria-label="Lap times">
      <article class="metric metric--compact"><span>Last</span><strong id="last-lap-value">--:--.--</strong></article>
      <article class="metric metric--compact"><span>Best</span><strong id="best-lap-value">--:--.--</strong></article>
      <article class="metric metric--compact"><span>Track</span><strong id="track-state-value">On track</strong></article>
    </section>
    <section class="lap-times" aria-label="Time-trial ghost">
      <button id="ghost-toggle-control" type="button" aria-pressed="false"><b aria-hidden="true">G</b><span id="ghost-state-value">Ghost OFF</span></button>
      <article class="metric metric--compact"><span>Ghost best</span><strong id="ghost-best-value">--:--.--</strong></article>
    </section>
    <section id="result-card" class="result-card result-card--hidden" aria-label="Race results" hidden>
      <h2>Race complete</h2>
      <dl>
        <div><dt>Time</dt><dd id="result-time-value">0:00.00</dd></div>
        <div><dt>Best lap</dt><dd id="result-best-value">--:--.--</dd></div>
        <div><dt>Position</dt><dd id="result-position-value">P2</dd></div>
      </dl>
      <p class="result-card__hint"><kbd>R</kbd> reset · <kbd>P</kbd> pause</p>
    </section>
    ${debugBlock}
    <section class="race-controls" aria-label="Race controls">
      <h2>Drive</h2>
      <div class="control-cluster">
        <button id="throttle-control" type="button"><b aria-hidden="true">↑</b><span>Throttle</span></button>
        <button id="brake-control" type="button"><b aria-hidden="true">↓</b><span>Brake</span></button>
        <button id="left-control" type="button"><b aria-hidden="true">←</b><span>Left</span></button>
        <button id="right-control" type="button"><b aria-hidden="true">→</b><span>Right</span></button>
        <button id="drift-control" type="button"><b aria-hidden="true">◆</b><span>Drift</span></button>
        <button id="reset-control" type="button"><b aria-hidden="true">↺</b><span>Reset</span></button>
      </div>
      <ul class="controls-list">
        <li><kbd>W S</kbd> Drive</li>
        <li><kbd>A D</kbd> Steer</li>
        <li><kbd>Space</kbd> Drift</li>
        <li><kbd>P</kbd> Pause</li>
        <li><kbd>R</kbd> Reset</li>
        <li><kbd>G</kbd> Ghost</li>
      </ul>
    </section>`;
}

export function updateTurboHud(hud: TurboHudElements, input: TurboHudUpdateInput): void {
  const raceFinished = input.snapshot.status === "finished";
  const status = resolveRaceHudStatus(input.session, raceFinished);
  const gap = wrappedProgressGap(input.snapshot.progress, input.opponentProgress);

  hud.speed.textContent = String(Math.round(Math.abs(input.snapshot.speed) * 36));
  hud.lap.textContent = `${Math.min(input.snapshot.lap, input.snapshot.lapsToWin)}/${input.snapshot.lapsToWin}`;
  hud.checkpoint.textContent = `${Math.min(input.snapshot.checkpoint, input.snapshot.checkpointCount)}/${input.snapshot.checkpointCount}`;
  hud.gap.textContent = formatGapToRival(gap, input.routeLength, input.referenceSpeed);
  hud.position.textContent = resolveRacePosition(gap);
  hud.status.textContent = status;
  hud.lastLap.textContent = formatLapClock(input.snapshot.lapTime);
  hud.bestLap.textContent = formatLapClock(input.snapshot.bestTime);

  if (input.recoveryVisible || !input.onAsphalt) {
    hud.trackState.textContent = "Off track";
  } else if (input.session.nitroSeconds > 0) {
    hud.trackState.textContent = "Nitro";
  } else {
    hud.trackState.textContent = "On track";
  }

  updateStartLightsDom(hud.startLights, input.session);
  updateResultCard(hud, input, gap, raceFinished);

  // TDC-A1 additive ghost controls.
  hud.ghostState.textContent = input.ghostAvailable && input.ghostEnabled ? "Ghost ON" : "Ghost OFF";
  hud.ghostBest.textContent = input.ghostAvailable ? input.ghostBestLabel : "--:--.--";

  if (input.debugMode && hud.debugSection) {
    hud.debugSection.hidden = false;
    hud.debugSection.classList.remove("debug-section--hidden");
    hud.alignment.textContent = input.recoveryVisible ? "Edge assist" : "Road locked";
    const alignmentStatus = document.getElementById("alignment-status");
    if (alignmentStatus) alignmentStatus.dataset.state = input.recoveryVisible ? "recovering" : "locked";
  } else if (hud.debugSection) {
    hud.debugSection.hidden = true;
    hud.debugSection.classList.add("debug-section--hidden");
  }
}

function updateStartLightsDom(container: HTMLElement, session: RaceSessionState): void {
  const label = startLightsLabel(session.startLights);
  const lights = container.querySelectorAll<HTMLElement>(".start-lights__light");
  lights.forEach((light) => {
    const text = light.textContent?.trim() ?? "";
    const isGo = text === "GO";
    const lit = session.startLights.complete
      ? isGo
      : !isGo && Number(text) === session.startLights.step;
    light.dataset.lit = lit ? "true" : "false";
    light.classList.toggle("start-lights__light--active", lit);
    if (isGo && session.startLights.complete) light.textContent = "GO";
  });
  container.setAttribute("aria-label", session.startLights.complete ? "Green flag" : `Start lights ${label}`);
}

function updateResultCard(
  hud: TurboHudElements,
  input: TurboHudUpdateInput,
  gap: number,
  raceFinished: boolean
): void {
  const show = raceFinished && input.session.finishCameraBlend > 0.35;
  hud.resultCard.hidden = !show;
  hud.resultCard.classList.toggle("result-card--hidden", !show);
  if (!show) return;
  hud.resultTime.textContent = formatLapClock(input.session.displayedRaceTime || input.snapshot.time);
  hud.resultBest.textContent = formatLapClock(input.snapshot.bestTime);
  hud.resultPosition.textContent = resolveRacePosition(gap);
}

/** @deprecated Use resolveRaceHudStatus via updateTurboHud. Kept for structural test compatibility. */
export function racingStatusLabelFromSession(
  session: RaceSessionState,
  raceFinished: boolean,
  speed: number
): string {
  void speed;
  return resolveRaceHudStatus(session, raceFinished);
}
