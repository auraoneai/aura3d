/**
 * How to play dialog (DOM only; the sim never sees it). Opens over the splash or pause screen, moves focus into
 * the card, traps Tab, closes on the button or Esc/Enter/Space and hands focus back to the opener.
 */
export interface HowtoDialog {
  readonly isOpen: boolean;
  /** `label` is the close-button text; `onClose` runs after the dialog hides (e.g. start the run). */
  open(label: string, onClose?: () => void): void;
  close(): void;
  /** Keyboard while open: returns true when the event was consumed. */
  handleKey(e: KeyboardEvent): boolean;
}

export function createHowtoDialog(root: HTMLElement, closeButton: HTMLButtonElement): HowtoDialog {
  let open = false;
  let after: (() => void) | undefined;
  let opener: HTMLElement | null = null;
  const body = root.querySelector<HTMLElement>(".howto-body");

  const focusables = (): HTMLElement[] =>
    Array.from(root.querySelectorAll<HTMLElement>("button, [href], input, [tabindex]:not([tabindex='-1'])")).filter((el) => !el.hasAttribute("disabled"));

  const dialog: HowtoDialog = {
    get isOpen() { return open; },
    open(label, onClose) {
      after = onClose;
      if (open) { closeButton.textContent = label; return; }
      open = true;
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      closeButton.textContent = label;
      root.hidden = false;
      root.classList.add("visible");
      if (body) body.scrollTop = 0;
      closeButton.focus({ preventScroll: true });
    },
    close() {
      if (!open) return;
      open = false;
      root.classList.remove("visible");
      root.hidden = true;
      const next = after;
      after = undefined;
      if (opener && opener.isConnected && opener.offsetParent !== null) opener.focus({ preventScroll: true });
      opener = null;
      next?.();
    },
    handleKey(e) {
      if (!open) return false;
      if (e.code === "Escape" || e.code === "Enter" || e.code === "NumpadEnter" || e.code === "Space") {
        e.preventDefault();
        if (!e.repeat) dialog.close();
        return true;
      }
      if (e.key === "Tab") {
        const list = focusables();
        if (list.length > 0) {
          const first = list[0] as HTMLElement;
          const last = list[list.length - 1] as HTMLElement;
          if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
        }
        return true;
      }
      // Arrow keys and PageUp/Down scroll the card; every other game key is swallowed while the rules are up.
      return true;
    }
  };

  closeButton.addEventListener("click", () => dialog.close());
  return dialog;
}
