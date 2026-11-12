// Corner controls during play (PRD 04 E01, PRD 01 sections 6 and 9, PRD 06
// QA-A08 and QA-E10; WP-7). The child plays by tapping big objects in the
// scene, so nothing here is aimed at the child and no text instruction is
// needed for play. These are small grown-up controls in the top corners, each
// at least 48 x 48 CSS px: "All done" on the left; "Your child had a turn"
// (with an unobtrusive SVG radial wait-progress ring), pause/resume, replay
// word and the grown-up button on the right. "All done" is never disabled or
// gated and acts at once. A quick accidental double tap is ignored so a single
// tap never pauses and resumes, or ends twice.

import { docOf, el, icon, iconButton, ignoreRepeats, uiText, type UiLocale } from "./accessibility.js";
import { canFullscreen, isFullscreen, toggleAppFullscreen, watchFullscreen } from "./fullscreen.js";

export interface ChildControlHandlers {
  onPause(): void;
  onResume(): void;
  onReplayWord(): void;
  onAllDone(): void;
  onParent(): void;
  /** The grown-up saw the child take the turn (a point, a look, a sound). Only called while a turn is waiting. */
  onConfirmTurn?(): void;
  /** Initial continuous Auto-play state (`mode === "auto"`). */
  readonly initialAuto?: boolean;
  /** One-tap continuous Auto-play toggle right from the play bar. */
  onToggleAuto?(next: boolean): void;
  /** Initial Wind-down state (`mode === "wind-down"` or `windDown === true`). */
  readonly initialWindDown?: boolean;
  /** Optional Wind-down toggle right from the play bar. */
  onToggleWindDown?(next: boolean): void;
}

export interface ChildControls {
  /** Mirrors the app's pause state (for example after the parent panel paused play). */
  setPaused(paused: boolean): void;
  /** Dims "Replay word" while there is no line to replay. "All done" is unaffected. */
  setReplayAvailable(available: boolean): void;
  /** A beat started (true) or stopped (false) waiting for a turn: enables "Your child had a turn". */
  setTurnWaiting(waiting: boolean): void;
  /** Updates the calm radial wait ring around "Your child had a turn" (`1` = full wait left, `0` = elapsed). */
  setWaitProgress?(fractionRemaining: number): void;
  /** Syncs the continuous Auto-play pill state when mode changes in settings. */
  setAutoPlay?(on: boolean): void;
  /** Syncs the Wind-down pill state when mode/windDown changes in settings. */
  setWindDown?(on: boolean): void;
  /** Updates or hides the unobtrusive tabular-numeral sleep timer badge (e.g. `"14:30"`). */
  setSleepTimerLabel?(label: string | null): void;
  /** Hides or shows the whole bar (for example under the offline card). */
  setVisible(visible: boolean): void;
  dispose(): void;
}

const SVG_NS = "http://www.w3.org/2000/svg";
/** r = 21 inside a 48x48 viewBox -> circumference = 2 * pi * 21 ≈ 131.95. */
const WAIT_RING_CIRCUMFERENCE = 131.95;

function createWaitRing(doc: Document): { readonly svg: SVGSVGElement; readonly arc: SVGCircleElement } {
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 48 48");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", "ww-wait-ring");

  const track = doc.createElementNS(SVG_NS, "circle");
  track.setAttribute("cx", "24");
  track.setAttribute("cy", "24");
  track.setAttribute("r", "21");
  track.setAttribute("class", "ww-wait-track");

  const arc = doc.createElementNS(SVG_NS, "circle");
  arc.setAttribute("cx", "24");
  arc.setAttribute("cy", "24");
  arc.setAttribute("r", "21");
  arc.setAttribute("class", "ww-wait-arc");
  arc.setAttribute("stroke-dasharray", String(WAIT_RING_CIRCUMFERENCE));
  arc.setAttribute("stroke-dashoffset", String(WAIT_RING_CIRCUMFERENCE));

  svg.append(track, arc);
  return { svg, arc };
}

export function mountChildControls(root: HTMLElement, locale: UiLocale, handlers: ChildControlHandlers): ChildControls {
  const doc = docOf(root);
  const pauseLabel = uiText(locale, "ui.pause");
  const resumeLabel = uiText(locale, "ui.resume");

  const allDone = el(doc, "button", { className: "ww-pill-button ww-control-done", attrs: { type: "button", "data-control": "all-done" } }, [
    icon(doc, "done"),
    el(doc, "span", { text: uiText(locale, "ui.allDone") })
  ]);
  const confirm = iconButton(doc, "turn", uiText(locale, "ui.confirm"), {
    "data-control": "confirm",
    "data-action": "confirm"
  });
  confirm.classList.add("ww-control-confirm");
  const waitRing = createWaitRing(doc);
  confirm.appendChild(waitRing.svg);

  const pause = iconButton(doc, "pause", pauseLabel, { "data-control": "pause" });
  const replay = iconButton(doc, "replay", uiText(locale, "ui.replay"), { "data-control": "replay" });
  const enterFsLabel = uiText(locale, "ui.fullscreen.enter");
  const exitFsLabel = uiText(locale, "ui.fullscreen.exit");
  const fullscreenBtn = canFullscreen(doc)
    ? iconButton(doc, "fullscreen", enterFsLabel, {
        "data-control": "fullscreen",
        "aria-pressed": "false"
      })
    : null;
  const syncFullscreen = (): void => {
    if (!fullscreenBtn) return;
    const active = isFullscreen(doc);
    const label = active ? exitFsLabel : enterFsLabel;
    fullscreenBtn.textContent = "";
    fullscreenBtn.appendChild(icon(doc, active ? "exitFullscreen" : "fullscreen"));
    fullscreenBtn.setAttribute("aria-label", label);
    fullscreenBtn.setAttribute("aria-pressed", String(active));
    fullscreenBtn.classList.toggle("is-active", active);
    fullscreenBtn.title = label;
    fullscreenBtn.dataset["fullscreen"] = String(active);
  };
  syncFullscreen();
  const unwatchFullscreen = fullscreenBtn ? watchFullscreen(doc, () => syncFullscreen()) : () => {};
  const parent = iconButton(doc, "settings", uiText(locale, "ui.parentButton"), { "data-control": "parent" });

  let autoOn = handlers.initialAuto === true;
  const autoToggle = handlers.onToggleAuto
    ? el(
        doc,
        "button",
        {
          className: "ww-pill-button ww-auto-toggle",
          attrs: { type: "button", "data-control": "auto", "aria-pressed": String(autoOn) }
        },
        [icon(doc, "auto"), el(doc, "span", { text: uiText(locale, "ui.mode.auto") })]
      )
    : null;

  const syncAuto = (): void => {
    if (!autoToggle) return;
    autoToggle.classList.toggle("is-active", autoOn);
    autoToggle.setAttribute("aria-pressed", String(autoOn));
    autoToggle.dataset["auto"] = String(autoOn);
  };
  syncAuto();

  let windDownOn = handlers.initialWindDown === true;
  const windDownToggle = handlers.onToggleWindDown
    ? el(
        doc,
        "button",
        {
          className: "ww-pill-button ww-wind-down-toggle",
          attrs: { type: "button", "data-control": "wind-down", "aria-pressed": String(windDownOn) }
        },
        [icon(doc, "moon"), el(doc, "span", { text: uiText(locale, "ui.mode.windDown") })]
      )
    : null;

  const syncWindDown = (): void => {
    if (!windDownToggle) return;
    windDownToggle.classList.toggle("is-active", windDownOn);
    windDownToggle.setAttribute("aria-pressed", String(windDownOn));
    windDownToggle.dataset["windDown"] = String(windDownOn);
  };
  syncWindDown();

  const sleepTimerBadge = el(doc, "span", {
    className: "ww-sleep-timer-badge ww-chip-tnum",
    attrs: { "data-ui": "sleep-timer", "aria-hidden": "true" }
  });
  sleepTimerBadge.hidden = true;

  const bar = el(
    doc,
    "div",
    {
      className: "ww-controls",
      attrs: { role: "group", "aria-label": uiText(locale, "ui.controls.label"), "data-ui": "controls" }
    },
    [
      el(doc, "div", { className: "ww-controls-group" }, [allDone]),
      el(doc, "div", { className: "ww-controls-group ww-controls-group-end" }, [
        sleepTimerBadge,
        ...(windDownToggle ? [windDownToggle] : []),
        ...(autoToggle ? [autoToggle] : []),
        confirm,
        pause,
        replay,
        ...(fullscreenBtn ? [fullscreenBtn] : []),
        parent
      ])
    ]
  );

  let paused = false;
  let turnWaiting = false;
  let waitFraction = 0;

  const syncRing = (): void => {
    const clamped = Number.isFinite(waitFraction) ? Math.min(1, Math.max(0, waitFraction)) : 0;
    const active = turnWaiting && !paused;
    const offset = active ? WAIT_RING_CIRCUMFERENCE * (1 - clamped) : WAIT_RING_CIRCUMFERENCE;
    waitRing.arc.setAttribute("stroke-dashoffset", offset.toFixed(2));
    confirm.dataset["waitProgress"] = active ? clamped.toFixed(2) : "0.00";
  };

  const sync = (): void => {
    const label = paused ? resumeLabel : pauseLabel;
    pause.textContent = "";
    pause.appendChild(icon(doc, paused ? "play" : "pause"));
    pause.setAttribute("aria-label", label);
    pause.title = label;
    pause.dataset["paused"] = String(paused);
    confirm.disabled = !turnWaiting || paused;
    confirm.classList.toggle("is-waiting", turnWaiting && !paused);
    syncRing();
  };

  pause.addEventListener(
    "click",
    ignoreRepeats(() => {
      paused = !paused;
      sync();
      if (paused) handlers.onPause();
      else handlers.onResume();
    })
  );
  confirm.addEventListener(
    "click",
    ignoreRepeats(() => {
      if (confirm.disabled) return;
      handlers.onConfirmTurn?.();
    })
  );
  if (autoToggle) {
    autoToggle.addEventListener(
      "click",
      ignoreRepeats(() => {
        autoOn = !autoOn;
        syncAuto();
        handlers.onToggleAuto?.(autoOn);
      })
    );
  }
  if (windDownToggle) {
    windDownToggle.addEventListener(
      "click",
      ignoreRepeats(() => {
        windDownOn = !windDownOn;
        syncWindDown();
        handlers.onToggleWindDown?.(windDownOn);
      })
    );
  }
  if (fullscreenBtn) {
    fullscreenBtn.addEventListener(
      "click",
      ignoreRepeats(() => {
        void toggleAppFullscreen(doc).then(() => syncFullscreen());
      })
    );
  }
  replay.addEventListener("click", ignoreRepeats(() => handlers.onReplayWord()));
  parent.addEventListener("click", ignoreRepeats(() => handlers.onParent()));
  allDone.addEventListener("click", ignoreRepeats(() => handlers.onAllDone()));

  root.appendChild(bar);
  sync();

  return {
    setPaused(next: boolean): void {
      if (paused === next) return;
      paused = next;
      sync();
    },
    setReplayAvailable(available: boolean): void {
      replay.disabled = !available;
    },
    setTurnWaiting(waiting: boolean): void {
      if (turnWaiting === waiting) return;
      turnWaiting = waiting;
      waitFraction = waiting ? 1 : 0;
      sync();
    },
    setWaitProgress(fractionRemaining: number): void {
      waitFraction = Number.isFinite(fractionRemaining) ? Math.min(1, Math.max(0, fractionRemaining)) : 0;
      syncRing();
    },
    setAutoPlay(on: boolean): void {
      if (autoOn === on) return;
      autoOn = on;
      syncAuto();
    },
    setWindDown(on: boolean): void {
      if (windDownOn === on) return;
      windDownOn = on;
      syncWindDown();
    },
    setSleepTimerLabel(label: string | null): void {
      const clean = label?.trim() ?? "";
      sleepTimerBadge.hidden = clean === "";
      sleepTimerBadge.textContent = clean;
    },
    setVisible(visible: boolean): void {
      bar.hidden = !visible;
    },
    dispose(): void {
      unwatchFullscreen();
      bar.remove();
    }
  };
}
