/**
 * Shared menu chrome for the shell (§6.2): a modal panel with roving tabindex,
 * `aria-modal`, a focus trap, and Escape-to-close. Structural-DOM friendly.
 */
import type { HudDocument, HudElement } from "../../hud/dom.js";

export interface MenuKeyEvent {
  readonly key: string;
  preventDefault(): void;
  stopPropagation(): void;
}

export interface MenuItemSpec {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly run?: () => void | Promise<void>;
}

export interface ShellScreen {
  readonly el: HudElement;
  show(): void;
  hide(): void;
  readonly visible: boolean;
  dispose(): void;
}

export abstract class BaseScreen implements ShellScreen {
  readonly el: HudElement;
  visible = false;
  constructor(doc: HudDocument, cls: string) {
    this.el = doc.createElement("div");
    this.el.className = `a3g-screen ${cls} a3g-hidden`;
    this.el.setAttribute("aria-hidden", "true");
  }
  show(): void {
    this.visible = true;
    this.el.classList.remove("a3g-hidden");
    this.el.setAttribute("aria-hidden", "false");
  }
  hide(): void {
    this.visible = false;
    this.el.classList.add("a3g-hidden");
    this.el.setAttribute("aria-hidden", "true");
  }
  dispose(): void {
    this.el.remove();
  }
}

export interface MenuHandle extends ShellScreen {
  /** Roving-tabindex items; arrow keys move focus, Enter activates, Escape closes. */
  readonly items: readonly HudElement[];
  focusIndex(): number;
  keydown(ev: MenuKeyEvent): boolean;
  onClose?: () => void;
}

/**
 * Build a modal menu panel. `items` render as buttons with roving tabindex
 * (first item tabindex=0, others -1). Focus bookkeeping is DOM-light so the
 * fake-DOM tests can assert the same behavior the browser gets.
 */
export function createMenu(
  doc: HudDocument,
  spec: { id: string; title: string; items: readonly MenuItemSpec[]; description?: string }
): MenuHandle {
  const wrap = doc.createElement("div");
  wrap.className = `a3g-screen a3g-menu a3g-menu-${spec.id} a3g-hidden`;
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-modal", "true");
  wrap.setAttribute("aria-label", spec.title);
  wrap.setAttribute("aria-hidden", "true");

  const panel = doc.createElement("div");
  panel.className = "a3g-menu-panel";
  const heading = doc.createElement("h2");
  heading.className = "a3g-menu-title";
  heading.textContent = spec.title;
  panel.appendChild(heading);
  if (spec.description) {
    const d = doc.createElement("p");
    d.className = "a3g-menu-desc";
    d.textContent = spec.description;
    panel.appendChild(d);
  }

  const list = doc.createElement("ul");
  list.className = "a3g-menu-items";
  list.setAttribute("role", "menu");
  const buttons: HudElement[] = [];
  spec.items.forEach((item, i) => {
    const li = doc.createElement("li");
    const btn = doc.createElement("button");
    btn.className = "a3g-menu-item";
    btn.dataset.itemId = item.id;
    btn.setAttribute("role", "menuitem");
    btn.setAttribute("tabindex", i === 0 ? "0" : "-1");
    const label = doc.createElement("span");
    label.className = "a3g-menu-item-label";
    label.textContent = item.label;
    btn.appendChild(label);
    if (item.hint) {
      const hint = doc.createElement("span");
      hint.className = "a3g-menu-item-hint";
      hint.textContent = item.hint;
      btn.appendChild(hint);
    }
    btn.addEventListener("click", () => void item.run?.());
    li.appendChild(btn);
    list.appendChild(li);
    buttons.push(btn);
  });
  panel.appendChild(list);
  wrap.appendChild(panel);

  let visible = false;
  let focus = 0;
  const setFocus = (i: number) => {
    if (buttons.length === 0) return;
    focus = (i + buttons.length) % buttons.length;
    buttons.forEach((b, j) => b.setAttribute("tabindex", j === focus ? "0" : "-1"));
  };

  const menu: MenuHandle = {
    el: wrap,
    items: buttons,
    get visible() { return visible; },
    focusIndex: () => focus,
    show() { visible = true; wrap.classList.remove("a3g-hidden"); wrap.setAttribute("aria-hidden", "false"); setFocus(0); },
    hide() { visible = false; wrap.classList.add("a3g-hidden"); wrap.setAttribute("aria-hidden", "true"); },
    keydown(ev) {
      if (!visible) return false;
      switch (ev.key) {
        case "ArrowDown": case "ArrowRight": setFocus(focus + 1); ev.preventDefault(); return true;
        case "ArrowUp": case "ArrowLeft": setFocus(focus - 1); ev.preventDefault(); return true;
        case "Home": setFocus(0); ev.preventDefault(); return true;
        case "End": setFocus(buttons.length - 1); ev.preventDefault(); return true;
        case "Enter": case " ": case "Spacebar": {
          const item = spec.items[focus];
          if (item?.run) { void item.run(); ev.preventDefault(); return true; }
          return false;
        }
        case "Escape": ev.preventDefault(); menu.onClose?.(); return true;
        // Focus trap: Tab/Shift+Tab wrap inside the menu instead of leaving it.
        case "Tab": setFocus(focus + 1); ev.preventDefault(); return true;
        default: return false;
      }
    },
    dispose() { wrap.remove(); }
  };
  return menu;
}
