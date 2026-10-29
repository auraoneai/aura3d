/**
 * Touch buttons the `dpad-4btn` preset has no slot for (throw, dash, crouch, pause; audit IC-01). They use the preset's
 * `.a3g-tc` look and write through `input.setAction`, the same path as the preset's own buttons, and show only while the
 * preset's touch layer is visible.
 */
export interface ExtraTouchButtons {
  sync(): void;
  readonly elements: readonly HTMLElement[];
}

export function mountExtraTouchButtons(
  doc: Document,
  input: { setAction(action: string, held: boolean): void },
  buttons: readonly { readonly id: string; readonly action: string; readonly label: string; readonly rect: { x: number; y: number; w: number; h: number } }[],
  touchVisible: () => boolean
): ExtraTouchButtons {
  const host = doc.createElement("div");
  host.className = "ic-touch-extras";
  host.hidden = true;
  (doc.getElementById("app") ?? doc.body).appendChild(host);
  const elements: HTMLElement[] = [];
  for (const b of buttons) {
    const el = doc.createElement("div");
    el.className = "a3g-tc a3g-tc-btn ic-tc-extra";
    el.dataset.icTouch = b.id;
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", b.label);
    el.textContent = b.label;
    el.style.left = `${b.rect.x * 100}%`;
    el.style.top = `${b.rect.y * 100}%`;
    el.style.width = `${b.rect.w * 100}%`;
    el.style.height = `${b.rect.h * 100}%`;
    let down = false;
    el.addEventListener("touchstart", (ev) => {
      ev.preventDefault?.();
      down = true;
      input.setAction(b.action, true);
      el.classList.add("a3g-tc-down");
    });
    const release = (): void => {
      if (!down) return;
      down = false;
      input.setAction(b.action, false);
      el.classList.remove("a3g-tc-down");
    };
    el.addEventListener("touchend", release);
    el.addEventListener("touchcancel", release);
    host.appendChild(el);
    elements.push(el);
  }
  let shown = false;
  return {
    elements,
    sync() {
      const next = touchVisible();
      if (next !== shown) {
        shown = next;
        host.hidden = !next;
      }
    }
  };
}
