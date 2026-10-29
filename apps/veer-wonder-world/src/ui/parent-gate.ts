// Parent gate (PRD 04 E04, PRD 01 section 6, PRD 06 QA-A08). Press and hold
// the round button for 2 seconds, or hold Enter (or Space) for 2 seconds on a
// keyboard. It keeps grown-up settings out of the way of small hands during
// play. It is ordinary product UX, NOT a security control, and it says so on
// screen ("It is not a lock"): no lock icon, no puzzle, no claim of
// protection. "Not now", Escape or a tap outside the card backs out at once,
// and letting go early simply resets the hold.

import { docOf, el, icon, presentModal, uiText, uniqueId, type UiLocale, type UiStringKey } from "./accessibility.js";

export const PARENT_GATE_HOLD_MS = 2000;

export interface ParentGateOptions {
  /** Aborting closes the gate and resolves false (for example when the story ends meanwhile). */
  readonly signal?: AbortSignal;
}

type HeldInput = { readonly kind: "pointer"; readonly pointerId: number } | { readonly kind: "key"; readonly key: string };

/** One gate per overlay root: a second request while one is open gets the same answer. */
const openGates = new WeakMap<HTMLElement, Promise<boolean>>();

/** Resolves true after a completed 2 s hold, false when the grown-up backs out. */
export function requireParent(root: HTMLElement, locale: UiLocale, options: ParentGateOptions = {}): Promise<boolean> {
  const existing = openGates.get(root);
  if (existing) return existing;
  if (options.signal?.aborted) return Promise.resolve(false);

  const promise = new Promise<boolean>((resolve) => {
    const doc = docOf(root);
    const titleId = uniqueId("ww-gate-title");
    const descId = uniqueId("ww-gate-desc");

    const overlay = el(doc, "div", { className: "ww-overlay ww-gate-overlay", attrs: { "data-ui": "parent-gate" } });
    const dialog = el(doc, "div", {
      className: "ww-dialog ww-gate",
      attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": titleId, "aria-describedby": descId }
    });
    const title = el(doc, "h2", { className: "ww-dialog-title", text: uiText(locale, "ui.gate.title"), attrs: { id: titleId } });
    const instruction = el(doc, "p", { className: "ww-gate-text", text: uiText(locale, "ui.gate.hold"), attrs: { id: descId } });
    // The whole stack (ring, icon and "Hold to open") is one large button.
    const hold = el(doc, "button", { className: "ww-hold", attrs: { type: "button", "aria-describedby": descId, "data-action": "hold" } }, [
      el(doc, "span", { className: "ww-hold-disc" }, [progressRing(doc), icon(doc, "hold")]),
      el(doc, "span", { className: "ww-hold-label", text: uiText(locale, "ui.gate.button") })
    ]);
    const status = el(doc, "p", { className: "ww-visually-hidden", attrs: { role: "status", "aria-live": "polite" } });
    const cancel = el(doc, "button", {
      className: "ww-button ww-button-quiet",
      text: uiText(locale, "ui.gate.cancel"),
      attrs: { type: "button", "data-action": "cancel" }
    });
    const note = el(doc, "p", { className: "ww-note-small ww-gate-note", text: uiText(locale, "ui.gate.note") });
    dialog.append(title, instruction, hold, status, cancel, note);
    overlay.appendChild(dialog);

    let timer: ReturnType<typeof setTimeout> | null = null;
    let heldBy: HeldInput | null = null;
    /** The press that started the current hold, as that input event's own timestamp. */
    let heldSince = 0;
    /** True between a pointer press on the button and the click that follows it. */
    let pressed = false;
    let settled = false;
    let release: () => void = () => {};

    const say = (key: UiStringKey): void => {
      // A fresh text node makes screen readers repeat a message.
      status.textContent = "";
      status.appendChild(doc.createTextNode(uiText(locale, key)));
    };

    const stopHold = (showHint: boolean): void => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
        if (showHint) say("ui.gate.again");
      }
      heldBy = null;
      hold.classList.remove("is-holding");
    };

    const onVisibility = (): void => {
      if (doc.hidden) stopHold(false);
    };
    const onAbort = (): void => finish(false);

    function finish(result: boolean): void {
      if (settled) return;
      settled = true;
      // After a completed hold the finger or key is still down: its release
      // (or key repeat) must not activate whatever gets focus next.
      if (result && heldBy) swallowRelease(doc, heldBy);
      stopHold(false);
      openGates.delete(root);
      doc.removeEventListener("visibilitychange", onVisibility);
      options.signal?.removeEventListener("abort", onAbort);
      release();
      resolve(result);
    }

    const startHold = (input: HeldInput, at: number): void => {
      if (settled || timer !== null) return;
      heldBy = input;
      heldSince = at;
      hold.classList.add("is-holding");
      say("ui.gate.holding");
      timer = setTimeout(() => {
        timer = null;
        finish(true);
      }, PARENT_GATE_HOLD_MS);
    };

    /**
     * Letting go. A busy page (a slow tablet, software WebGL) can handle the press late and the release straight after
     * it, before the timer has had a turn, so the hold is judged by the two input events' own timestamps: held long
     * enough opens the gate (the finger or key is already up, so nothing is left to swallow), shorter resets it.
     */
    const releaseHold = (at: number): void => {
      if (timer !== null && at - heldSince >= PARENT_GATE_HOLD_MS) {
        heldBy = null;
        finish(true);
        return;
      }
      stopHold(true);
    };

    hold.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.preventDefault();
      try {
        hold.setPointerCapture(event.pointerId);
      } catch {
        // Capture is a nicety; the hold still works without it.
      }
      pressed = true;
      startHold({ kind: "pointer", pointerId: event.pointerId }, event.timeStamp);
    });
    hold.addEventListener("pointerup", (event) => releaseHold(event.timeStamp));
    hold.addEventListener("pointercancel", () => stopHold(false));
    hold.addEventListener("lostpointercapture", () => stopHold(false));
    hold.addEventListener("contextmenu", (event) => event.preventDefault());
    hold.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      if (!event.repeat) startHold({ kind: "key", key: event.key }, event.timeStamp);
    });
    hold.addEventListener("keyup", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      releaseHold(event.timeStamp);
    });
    hold.addEventListener("blur", () => stopHold(false));
    // An activation with no hold at all (for example from assistive
    // technology) explains what to do instead.
    hold.addEventListener("click", (event) => {
      event.preventDefault();
      if (!settled && timer === null && !pressed) say("ui.gate.hold");
      pressed = false;
    });
    cancel.addEventListener("click", () => finish(false));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) finish(false);
    });
    doc.addEventListener("visibilitychange", onVisibility);
    options.signal?.addEventListener("abort", onAbort, { once: true });

    release = presentModal(root, overlay, dialog, () => finish(false));
    hold.focus({ preventScroll: true });
  });

  openGates.set(root, promise);
  return promise;
}

/**
 * Swallows the rest of a completed hold: key repeats and the key-up of the
 * held key, or the release of the held pointer. Listeners remove themselves
 * on that release (or on the next fresh press).
 */
function swallowRelease(doc: Document, input: HeldInput): void {
  if (input.kind === "key") {
    const removeKey = (): void => {
      doc.removeEventListener("keydown", onKey, true);
      doc.removeEventListener("keyup", onKey, true);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== input.key) return;
      // A fresh press (not an auto-repeat) means the release was lost, for
      // example when the window lost focus mid-hold: stop swallowing and let
      // this press through.
      if (event.type === "keydown" && !event.repeat) {
        removeKey();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (event.type === "keyup") removeKey();
    };
    doc.addEventListener("keydown", onKey, true);
    doc.addEventListener("keyup", onKey, true);
    return;
  }
  const remove = (): void => {
    doc.removeEventListener("pointerup", onPointer, true);
    doc.removeEventListener("pointercancel", onPointer, true);
    doc.removeEventListener("pointerdown", remove, true);
  };
  const onPointer = (event: PointerEvent): void => {
    if (event.pointerId !== input.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    remove();
  };
  doc.addEventListener("pointerup", onPointer, true);
  doc.addEventListener("pointercancel", onPointer, true);
  doc.addEventListener("pointerdown", remove, true);
}

/** The ring that fills while the button is held (decorative; CSS drives the fill). */
function progressRing(doc: Document): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = doc.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", "ww-hold-ring");
  for (const className of ["ww-hold-track", "ww-hold-progress"]) {
    const circle = doc.createElementNS(ns, "circle");
    circle.setAttribute("cx", "50");
    circle.setAttribute("cy", "50");
    circle.setAttribute("r", "44");
    circle.setAttribute("class", className);
    svg.appendChild(circle);
  }
  return svg;
}
