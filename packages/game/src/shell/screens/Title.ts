/**
 * Title screen (§6.2): shows title/subtitle/prompt; the first key/tap/click is
 * the audio-unlock gesture and starts play (§6.3 lifecycle, iOS unlock).
 */
import type { HudDocument } from "../../hud/dom.js";
import { BaseScreen } from "./menu.js";

export function createTitleScreen(
  doc: HudDocument,
  opts: {
    title: string;
    subtitle?: string;
    prompt?: string;
    art?: string;
    onStart: () => void;
  }
) {
  const screen = new (class extends BaseScreen {
    constructor() {
      super(doc, "a3g-title");
      const panel = doc.createElement("div");
      panel.className = "a3g-title-panel";
      const h = doc.createElement("h1");
      h.className = "a3g-title-heading";
      h.textContent = opts.title;
      panel.appendChild(h);
      if (opts.subtitle) {
        const sub = doc.createElement("p");
        sub.className = "a3g-title-sub";
        sub.textContent = opts.subtitle;
        panel.appendChild(sub);
      }
      if (opts.art) {
        const img = doc.createElement("img");
        img.className = "a3g-title-art";
        img.setAttribute("src", opts.art);
        img.setAttribute("alt", "");
        panel.appendChild(img);
      }
      const prompt = doc.createElement("div");
      prompt.className = "a3g-title-prompt";
      prompt.textContent = opts.prompt ?? "Press any key / tap to start";
      panel.appendChild(prompt);
      this.el.appendChild(panel);

      const start = () => { if (this.visible) opts.onStart(); };
      this.el.addEventListener("click", start);
      this.el.addEventListener("pointerdown", start);
    }
    /** Route/window key hook: any key while visible starts the game. */
    keydown(): boolean {
      if (!this.visible) return false;
      opts.onStart();
      return true;
    }
  })();
  return screen;
}
