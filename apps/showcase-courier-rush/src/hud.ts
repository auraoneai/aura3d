/**
 * Courier Rush HUD - dispatch card, timer, strikes, combo, arrow, radio toasts,
 * touch controls and the shift summary overlay. DOM is UI only: every visible
 * 3D claim (zones, parcel, traffic, drop flash) is rendered scene content.
 */
import { bindGameTouchControls } from "@aura3d/engine";

export interface CourierHudRefs {
  readonly root: HTMLElement;
  readonly objectiveLabel: HTMLElement;
  readonly deliveryMeta: HTMLElement;
  readonly timerValue: HTMLElement;
  readonly timerFill: HTMLElement;
  readonly strikePips: readonly HTMLElement[];
  readonly comboChip: HTMLElement;
  readonly scoreValue: HTMLElement;
  readonly navArrow: HTMLElement;
  readonly radioToast: HTMLElement;
  readonly strikeFlash: HTMLElement;
  readonly summaryOverlay: HTMLElement;
  readonly summaryTitle: HTMLElement;
  readonly summaryBody: HTMLElement;
  readonly summaryStats: HTMLElement;
}

function requireElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error("Courier Rush is missing element #" + id);
  return element;
}

/** Build the panel markup once and return stable element refs. */
export function mountCourierHud(panel: HTMLElement): CourierHudRefs {
  panel.innerHTML = [
    '<section class="dispatch-card" aria-label="Dispatch">',
    '  <div class="dispatch-card__label"><span class="dispatch-card__dot"></span> Dispatch radio</div>',
    '  <div class="dispatch-card__objective" id="courier-objective">Waiting for dispatch...</div>',
    '  <div class="dispatch-card__meta" id="courier-meta"></div>',
    "</section>",
    '<section class="status-strip" aria-label="Shift status">',
    '  <div class="timer-row"><span class="timer-row__label">Timer</span><span class="timer-row__value" id="courier-timer">60.0</span></div>',
    '  <div class="timer-bar"><div class="timer-bar__fill" id="courier-timer-fill"></div></div>',
    '  <div class="strikes-row"><span>Strikes</span><span class="strikes-row__pips" id="courier-strikes"></span></div>',
    '  <div class="combo-chip" id="courier-combo">x1.0</div>',
    '  <div class="score-line"><span>Earnings</span><strong id="courier-score">0</strong></div>',
    "</section>",
    '<div class="nav-arrow" id="courier-arrow" aria-hidden="true"><svg viewBox="0 0 44 44"><path d="M22 4 L36 34 L22 27 L8 34 Z" fill="#7ce8ff" stroke="#37e0ff" stroke-width="2"/></svg></div>',
    '<div class="radio-toast" id="courier-radio"></div>',
    '<div class="controls-help"><kbd>W A S D</kbd>/<kbd>&#8593;&#8595;&#8592;&#8594;</kbd> drive &nbsp; <kbd>Space</kbd> handbrake &nbsp; <kbd>E</kbd> interact &nbsp; <kbd>P</kbd> pause &nbsp; <kbd>R</kbd> reset shift</div>',
    '<div class="touch-controls" aria-label="Touch controls">',
    '  <button class="touch-btn touch-btn--steer-left" id="left-control">&#9664;</button>',
    '  <button class="touch-btn touch-btn--forward" id="throttle-control">FWD</button>',
    '  <button class="touch-btn touch-btn--brake" id="brake-control">BRK</button>',
    '  <button class="touch-btn touch-btn--back" id="reverse-control">REV</button>',
    '  <button class="touch-btn touch-btn--interact" id="interact-control">E</button>',
    '  <button class="touch-btn touch-btn--steer-right" id="right-control">&#9654;</button>',
    "</div>",
    '<div class="strike-flash" id="courier-strike-flash"></div>',
    '<div class="overlay" id="courier-summary">',
    '  <div class="overlay__card">',
    '    <h2 class="overlay__title" id="courier-summary-title">Shift complete</h2>',
    '    <p class="overlay__body" id="courier-summary-body"></p>',
    '    <div class="overlay__stats" id="courier-summary-stats"></div>',
    '    <div class="overlay__hint">Press <kbd>R</kbd> to start a new shift</div>',
    "  </div>",
    "</div>"
  ].join("");

  bindGameTouchControls({
    hold: [
      { elementId: "throttle-control", code: "KeyW" },
      { elementId: "reverse-control", code: "KeyS" },
      { elementId: "left-control", code: "KeyA" },
      { elementId: "right-control", code: "KeyD" },
      { elementId: "brake-control", code: "Space" }
    ],
    pulse: [{ elementId: "interact-control", code: "KeyE" }]
  });

  const pips = [0, 1, 2].map((index) => {
    const pip = document.createElement("span");
    pip.className = "strike-pip";
    pip.dataset.used = "false";
    const container = requireElement("courier-strikes");
    container.appendChild(pip);
    void index;
    return pip;
  });

  return {
    root: panel,
    objectiveLabel: requireElement("courier-objective"),
    deliveryMeta: requireElement("courier-meta"),
    timerValue: requireElement("courier-timer"),
    timerFill: requireElement("courier-timer-fill"),
    strikePips: pips,
    comboChip: requireElement("courier-combo"),
    scoreValue: requireElement("courier-score"),
    navArrow: requireElement("courier-arrow"),
    radioToast: requireElement("courier-radio"),
    strikeFlash: requireElement("courier-strike-flash"),
    summaryOverlay: requireElement("courier-summary"),
    summaryTitle: requireElement("courier-summary-title"),
    summaryBody: requireElement("courier-summary-body"),
    summaryStats: requireElement("courier-summary-stats")
  };
}

export interface CourierHudFrame {
  readonly objective: string;
  readonly meta: string;
  readonly timerSeconds: number;
  readonly timerFraction: number;
  readonly strikes: number;
  readonly maxStrikes: number;
  readonly combo: number;
  readonly score: number;
  /** Bearing from the van heading to the active zone, radians, screen-consistent. */
  readonly arrowBearing: number | null;
  readonly carrying: boolean;
}

let toastTimer = 0;

/** Per-frame HUD update. Cheap string writes only when values change textually. */
export function updateCourierHud(hud: CourierHudRefs, frame: CourierHudFrame): void {
  if (hud.objectiveLabel.textContent !== frame.objective) {
    hud.objectiveLabel.textContent = frame.objective;
  }
  if (hud.deliveryMeta.textContent !== frame.meta) {
    hud.deliveryMeta.textContent = frame.meta;
  }
  const timerText = (Math.max(0, frame.timerSeconds)).toFixed(1);
  if (hud.timerValue.textContent !== timerText) hud.timerValue.textContent = timerText;
  const low = frame.timerFraction <= 0.25;
  hud.timerValue.dataset.low = String(low);
  hud.timerFill.dataset.low = String(low);
  hud.timerFill.style.width = (Math.max(0, Math.min(1, frame.timerFraction)) * 100).toFixed(1) + "%";
  hud.strikePips.forEach((pip, index) => {
    pip.dataset.used = String(index < frame.strikes);
  });
  const comboText = "x" + frame.combo.toFixed(1);
  if (hud.comboChip.textContent !== comboText) hud.comboChip.textContent = comboText;
  hud.comboChip.dataset.hot = String(frame.combo >= 1.6);
  const scoreText = String(Math.round(frame.score));
  if (hud.scoreValue.textContent !== scoreText) hud.scoreValue.textContent = scoreText;
  if (frame.arrowBearing === null) {
    hud.navArrow.style.visibility = "hidden";
  } else {
    hud.navArrow.style.visibility = "visible";
    // Screen-space rotation: positive bearing turns the arrow clockwise.
    hud.navArrow.style.transform = "rotate(" + ((frame.arrowBearing * 180) / Math.PI).toFixed(1) + "deg)";
  }
}

/** Show a dispatch-radio style toast for a few seconds. */
export function showRadioToast(hud: CourierHudRefs, html: string, seconds = 3.2): void {
  hud.radioToast.innerHTML = html;
  hud.radioToast.dataset.visible = "true";
  toastTimer = seconds;
}

/** Decays transient HUD effects; call once per frame with dt seconds. */
export function decayHudEffects(hud: CourierHudRefs, dtSeconds: number): void {
  if (toastTimer > 0) {
    toastTimer = Math.max(0, toastTimer - dtSeconds);
    if (toastTimer === 0) hud.radioToast.dataset.visible = "false";
  }
  if (hud.strikeFlash.dataset.visible === "true") {
    hud.strikeFlash.dataset.visible = "false";
  }
}

export function pulseStrikeFlash(hud: CourierHudRefs): void {
  // Force a reflow so repeated strikes re-trigger the CSS transition.
  hud.strikeFlash.dataset.visible = "false";
  void hud.strikeFlash.offsetWidth;
  hud.strikeFlash.dataset.visible = "true";
}

export interface ShiftSummaryInput {
  readonly cleared: boolean;
  readonly failReason: "timer" | "strikes" | null;
  readonly deliveriesCompleted: number;
  readonly score: number;
  readonly bestCombo: number;
  readonly earlyDrops: number;
}

export function showShiftSummary(hud: CourierHudRefs, input: ShiftSummaryInput): void {
  hud.summaryTitle.textContent = input.cleared ? "Shift complete!" : input.failReason === "strikes" ? "Shift over - van wrecked" : "Shift over - out of time";
  hud.summaryTitle.dataset.tone = input.cleared ? "clear" : "fail";
  hud.summaryBody.textContent = input.cleared
    ? "All five deliveries landed before the clock died. Dispatch sends its regards."
    : input.failReason === "strikes"
      ? "Three strikes and dispatch pulls you off the road. The city wins this round."
      : "The clock beat you. In the courier game, lateness is the only rival.";
  hud.summaryStats.innerHTML =
    "Deliveries: <strong>" + input.deliveriesCompleted + " / 5</strong><br>" +
    "Earnings: <strong>" + Math.round(input.score) + "</strong><br>" +
    "Best combo: <strong>x" + input.bestCombo.toFixed(1) + "</strong><br>" +
    "Early drops: <strong>" + input.earlyDrops + "</strong>";
  hud.summaryOverlay.dataset.visible = "true";
}

export function hideShiftSummary(hud: CourierHudRefs): void {
  hud.summaryOverlay.dataset.visible = "false";
}
