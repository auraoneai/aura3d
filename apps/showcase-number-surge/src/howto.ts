/**
 * Number Surge "How to play" dialog controller. Presentation only: it never touches the sim.
 * The panel markup lives in index.html (#howto-screen); this module opens/closes it, moves
 * focus in and back, traps Tab inside it, and remembers that the player has seen it.
 */

export const HOWTO_SEEN_KEY = "splatSiblings.number-surge.howtoSeen";

export interface HowtoStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export interface HowtoController {
  readonly isOpen: boolean;
  readonly seen: boolean;
  /** Open the panel. `onClose` runs once when it closes (button, Esc, Enter or Space). */
  open(opts?: { primaryLabel?: string; onClose?: () => void }): void;
  close(): void;
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function createHowto(root: HTMLElement, closeButton: HTMLButtonElement, store: HowtoStore): HowtoController {
  let open = false;
  let seen = store.get(HOWTO_SEEN_KEY) === "1";
  let returnFocus: HTMLElement | null = null;
  let onClose: (() => void) | undefined;
  /** A Space keydown that closed the panel must not also click whatever gets focus on keyup. */
  let swallowSpaceUp = false;

  const close = (): void => {
    if (!open) return;
    open = false;
    root.hidden = true;
    if (!seen) {
      seen = true;
      store.set(HOWTO_SEEN_KEY, "1");
    }
    const target = returnFocus;
    returnFocus = null;
    if (target && target.isConnected && !target.closest("[hidden]")) target.focus({ preventScroll: true });
    const done = onClose;
    onClose = undefined;
    done?.();
  };

  closeButton.addEventListener("click", (e) => {
    e.stopPropagation();
    close();
  });

  // Capture phase so the game's own key handler never sees keys meant for the panel.
  addEventListener(
    "keydown",
    (e) => {
      if (!open) return;
      if (e.code === "Escape" || e.code === "Enter" || e.code === "NumpadEnter" || e.code === "Space") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.repeat) return;
        if (e.code === "Space") swallowSpaceUp = true;
        close();
        return;
      }
      if (e.code === "Tab") {
        const items = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute("disabled"));
        if (items.length === 0) return;
        const first = items[0] as HTMLElement;
        const last = items[items.length - 1] as HTMLElement;
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && (active === first || !root.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !root.contains(active))) {
          e.preventDefault();
          first.focus();
        }
        return;
      }
      if (e.code === "KeyM") return; // sound toggle still works while reading
      // Steering, pause and start keys do nothing while the panel is up.
      e.stopImmediatePropagation();
    },
    true
  );
  addEventListener(
    "keyup",
    (e) => {
      // A Space released while the panel is up (e.g. the Space press that opened it) must not click the
      // focused button; the panel closes on keydown only.
      if (e.code === "Space" && (swallowSpaceUp || open)) {
        swallowSpaceUp = false;
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true
  );

  return {
    get isOpen() {
      return open;
    },
    get seen() {
      return seen;
    },
    open(opts = {}) {
      if (open) return;
      open = true;
      onClose = opts.onClose;
      closeButton.textContent = opts.primaryLabel ?? "GOT IT";
      const active = document.activeElement;
      returnFocus = active instanceof HTMLElement && active !== document.body ? active : null;
      root.hidden = false;
      const card = root.querySelector<HTMLElement>(".howto-card");
      if (card) card.scrollTop = 0;
      closeButton.focus({ preventScroll: true });
    },
    close
  };
}
