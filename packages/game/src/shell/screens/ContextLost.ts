/** Context-lost screen (§6.2): "Recovering graphics…" + Reload after 3 s. */
import type { HudDocument } from "../../hud/dom.js";
import { BaseScreen } from "./menu.js";

export function createContextLostScreen(
  doc: HudDocument,
  opts: { onReload?: () => void; reloadAfterMs?: number; now?: () => number; setTimer?: (cb: () => void, ms: number) => { cancel(): void } }
) {
  const now = opts.now ?? (() => Date.now());
  const setTimer = opts.setTimer ?? ((cb: () => void, ms: number) => {
    const id = setTimeout(cb, ms);
    return { cancel: () => clearTimeout(id) };
  });
  let reloadTimer: { cancel(): void } | null = null;

  const screen = new (class extends BaseScreen {
    readonly reload = doc.createElement("button");
    constructor() {
      super(doc, "a3g-context-lost");
      const panel = doc.createElement("div");
      panel.className = "a3g-context-lost-panel";
      const h = doc.createElement("h2");
      h.textContent = "Recovering graphics…";
      panel.appendChild(h);
      const p = doc.createElement("p");
      p.className = "a3g-context-lost-desc";
      p.textContent = "The graphics device was lost. Reconnecting…";
      panel.appendChild(p);
      this.reload.className = "a3g-reload a3g-hidden";
      this.reload.textContent = "Reload";
      this.reload.addEventListener("click", () => opts.onReload?.());
      panel.appendChild(this.reload);
      this.el.appendChild(panel);
    }
    override show() {
      super.show();
      this.reload.classList.add("a3g-hidden");
      reloadTimer?.cancel();
      reloadTimer = setTimer(() => this.reload.classList.remove("a3g-hidden"), opts.reloadAfterMs ?? 3000);
    }
    override hide() {
      super.hide();
      reloadTimer?.cancel();
      reloadTimer = null;
    }
    override dispose() {
      reloadTimer?.cancel();
      super.dispose();
    }
  })();
  void now;
  return screen;
}
