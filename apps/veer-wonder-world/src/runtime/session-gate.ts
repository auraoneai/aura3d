// Session gate (PRD 04 B08): the session-level safety rules around a story.
//
// - Pause on hide: when the page is hidden (tab switch, app to background,
//   screen lock) the gate calls onHide once; the app sends PAUSE.
// - Never auto-resume speech: when the page is visible again the gate calls
//   onShow so the app can show its paused state. The app must NOT send RESUME
//   from onShow; a grown-up resumes with the Resume control.
// - No auto-next: a finished story shows its offline card and stays there.
//   The next story only starts when a grown-up picks one from the menu.
// - "All done" (ALL_DONE) and manual next (SKIP_BEAT) are director events
//   that work at any moment; the finite ending is the director's job.

/** Nothing ever plays the next episode or activity by itself. */
export const AUTO_NEXT = false;

export type VisibilityDocument = Pick<Document, "addEventListener" | "removeEventListener" | "visibilityState">;

export interface SessionGateHandlers {
  /** The page was hidden: pause the story and all media. */
  onHide(): void;
  /** The page is visible again: show the paused state. Do not resume speech here. */
  onShow(): void;
}

export interface SessionGate {
  /** Stop listening; no handler is called afterwards. Safe to call twice. */
  dispose(): void;
}

export function createSessionGate(doc: VisibilityDocument, handlers: SessionGateHandlers): SessionGate {
  let hidden = doc.visibilityState === "hidden";
  let disposed = false;

  const onVisibilityChange = (): void => {
    if (disposed) return;
    const nowHidden = doc.visibilityState === "hidden";
    if (nowHidden === hidden) return;
    hidden = nowHidden;
    if (nowHidden) handlers.onHide();
    else handlers.onShow();
  };

  doc.addEventListener("visibilitychange", onVisibilityChange);

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      doc.removeEventListener("visibilitychange", onVisibilityChange);
    }
  };
}
