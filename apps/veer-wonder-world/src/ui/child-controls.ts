// Corner controls during play (PRD 04 E01, PRD 01 sections 6 and 9, PRD 06
// QA-A08 and QA-E10). The child plays by tapping big objects in the scene, so
// nothing here is aimed at the child and no text instruction is needed for
// play. These are small grown-up controls in the top corners, each at least
// 44 x 44 CSS px: "All done" on the left; "Your child had a turn", pause/resume,
// replay word and the grown-up button on the right. "All done" is never
// disabled or gated and acts at once. A quick accidental double tap is ignored
// so a single tap never pauses and resumes, or ends twice.
//
// "Your child had a turn" is the grown-up's confirm (PRD 01 section 3.2: the
// parent can trigger the response to a real-world gesture; PRD 03 section 3
// PARENT_CONFIRM): when the child points, looks or makes a sound during a
// turn, the grown-up presses it and the story answers exactly as for a tap on
// the glowing object. It is enabled only while a beat waits for a turn (and
// not while play is paused); it never judges or labels what the child did.

import { docOf, el, icon, iconButton, ignoreRepeats, uiText, type UiLocale } from "./accessibility.js";

export interface ChildControlHandlers {
  onPause(): void;
  onResume(): void;
  onReplayWord(): void;
  onAllDone(): void;
  onParent(): void;
  /** The grown-up saw the child take the turn (a point, a look, a sound). Only called while a turn is waiting. */
  onConfirmTurn?(): void;
}

export interface ChildControls {
  /** Mirrors the app's pause state (for example after the parent panel paused play). */
  setPaused(paused: boolean): void;
  /** Dims "Replay word" while there is no line to replay. "All done" is unaffected. */
  setReplayAvailable(available: boolean): void;
  /** A beat started (true) or stopped (false) waiting for a turn: enables "Your child had a turn". */
  setTurnWaiting(waiting: boolean): void;
  /** Hides or shows the whole bar (for example under the offline card). */
  setVisible(visible: boolean): void;
  dispose(): void;
}

export function mountChildControls(root: HTMLElement, locale: UiLocale, handlers: ChildControlHandlers): ChildControls {
  const doc = docOf(root);
  const pauseLabel = uiText(locale, "ui.pause");
  const resumeLabel = uiText(locale, "ui.resume");

  const allDone = el(doc, "button", { className: "ww-pill-button ww-control-done", attrs: { type: "button", "data-control": "all-done" } }, [
    icon(doc, "done"),
    el(doc, "span", { text: uiText(locale, "ui.allDone") })
  ]);
  const confirm = iconButton(doc, "turn", uiText(locale, "ui.confirm"), { "data-control": "confirm" });
  const pause = iconButton(doc, "pause", pauseLabel, { "data-control": "pause" });
  const replay = iconButton(doc, "replay", uiText(locale, "ui.replay"), { "data-control": "replay" });
  const parent = iconButton(doc, "settings", uiText(locale, "ui.parentButton"), { "data-control": "parent" });

  const bar = el(doc, "div", {
    className: "ww-controls",
    attrs: { role: "group", "aria-label": uiText(locale, "ui.controls.label"), "data-ui": "controls" }
  }, [
    el(doc, "div", { className: "ww-controls-group" }, [allDone]),
    el(doc, "div", { className: "ww-controls-group ww-controls-group-end" }, [confirm, pause, replay, parent])
  ]);

  let paused = false;
  let turnWaiting = false;
  const sync = (): void => {
    const label = paused ? resumeLabel : pauseLabel;
    pause.replaceChildren(icon(doc, paused ? "play" : "pause"));
    pause.setAttribute("aria-label", label);
    pause.title = label;
    pause.dataset["paused"] = String(paused);
    confirm.disabled = !turnWaiting || paused;
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
      sync();
    },
    setVisible(visible: boolean): void {
      bar.hidden = !visible;
    },
    dispose(): void {
      bar.remove();
    }
  };
}
