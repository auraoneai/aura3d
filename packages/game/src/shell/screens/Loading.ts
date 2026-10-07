/** Loading screen (§6.2): real progress = Σ settled weights ÷ Σ tracked. */
import type { HudDocument } from "../../hud/dom.js";
import { BaseScreen } from "./menu.js";

export function createLoadingScreen(
  doc: HudDocument,
  opts: { tips?: readonly string[]; minMs?: number; art?: string } | false | undefined
) {
  const s = new (class extends BaseScreen {
    readonly bar = doc.createElement("div");
    readonly label = doc.createElement("div");
    readonly tip = doc.createElement("div");
    constructor() {
      super(doc, "a3g-loading");
      const panel = doc.createElement("div");
      panel.className = "a3g-loading-panel";
      const track = doc.createElement("div");
      track.className = "a3g-loading-track";
      this.bar.className = "a3g-loading-bar";
      track.appendChild(this.bar);
      this.label.className = "a3g-loading-label";
      this.label.textContent = "Loading…";
      this.tip.className = "a3g-loading-tip";
      if (opts && opts.tips?.length) this.tip.textContent = opts.tips[0];
      panel.appendChild(track);
      panel.appendChild(this.label);
      panel.appendChild(this.tip);
      this.el.appendChild(panel);
    }
    setProgress(fraction: number, label?: string) {
      const f = Math.min(1, Math.max(0, fraction));
      this.bar.style.width = `${(f * 100).toFixed(1)}%`;
      if (label) this.label.textContent = label;
    }
  })();
  return s;
}
