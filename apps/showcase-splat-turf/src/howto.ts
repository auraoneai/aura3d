/**
 * How to play dialog for Splat Turf. DOM only: opens over the splash ("first" auto-open on the first
 * Play, or the splash button) or over the pause card, traps Tab focus inside, and hands focus back.
 * `main.ts` gates the fixed-step loop on `open` so the sim never starts or advances while it shows.
 */
export type HowtoContext = "first" | "splash" | "pause";

export const HOWTO_SEEN_KEY = "splatSiblings.splat-turf.howtoSeen";

const CONFIRM_LABEL: Record<HowtoContext, string> = {
  first: "GOT IT — PLAY",
  splash: "GOT IT",
  pause: "BACK TO PAUSE"
};

export interface HowtoPanel {
  readonly open: boolean;
  readonly context: HowtoContext | null;
  show(context: HowtoContext, returnFocus: HTMLElement | null): void;
  /** `confirmed` is true for Got it / Enter / Space, false for Esc. No-op when closed. */
  close(confirmed: boolean): void;
  /** Keep Tab / Shift+Tab inside the dialog; returns true when it handled the event. */
  trapTab(e: KeyboardEvent): boolean;
}

export function createHowto(opts: {
  root: HTMLElement;
  confirm: HTMLButtonElement;
  onClose: (context: HowtoContext, confirmed: boolean) => void;
}): HowtoPanel {
  let context: HowtoContext | null = null;
  let returnTo: HTMLElement | null = null;
  const focusables = (): HTMLElement[] =>
    Array.from(opts.root.querySelectorAll<HTMLElement>("button, [tabindex='0']")).filter((el) => !el.hasAttribute("disabled"));

  const panel: HowtoPanel = {
    get open() { return context !== null; },
    get context() { return context; },
    show(next, focusBack) {
      context = next;
      returnTo = focusBack;
      opts.confirm.textContent = CONFIRM_LABEL[next];
      opts.root.classList.add("on");
      opts.root.setAttribute("aria-hidden", "false");
      const body = opts.root.querySelector<HTMLElement>(".howto-body");
      if (body) body.scrollTop = 0;
      opts.confirm.focus({ preventScroll: true });
    },
    close(confirmed) {
      if (context === null) return;
      const was = context;
      context = null;
      opts.root.classList.remove("on");
      opts.root.setAttribute("aria-hidden", "true");
      const back = returnTo;
      returnTo = null;
      if (back && back.offsetParent !== null) back.focus({ preventScroll: true });
      else (document.activeElement as HTMLElement | null)?.blur?.();
      opts.onClose(was, confirmed);
    },
    trapTab(e) {
      if (context === null || e.key !== "Tab") return false;
      const list = focusables();
      if (list.length === 0) return false;
      const first = list[0] as HTMLElement;
      const last = list[list.length - 1] as HTMLElement;
      const active = document.activeElement as HTMLElement | null;
      const inside = active !== null && opts.root.contains(active);
      if (e.shiftKey && (!inside || active === first)) { e.preventDefault(); last.focus(); return true; }
      if (!e.shiftKey && (!inside || active === last)) { e.preventDefault(); first.focus(); return true; }
      return false;
    }
  };
  opts.confirm.addEventListener("click", () => panel.close(true));
  return panel;
}
