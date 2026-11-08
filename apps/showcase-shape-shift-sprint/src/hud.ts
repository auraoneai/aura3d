/**
 * Playing HUD: DOM writes only when values change; every text sits in navy ink on a cream paper chip
 * (contrast pinned by tests/unit/shape-shift-sprint/hud-contrast.test.ts). Popups drain by monotonic
 * seq (kit `drainPopups`), live in a CSS-expiry column and never overlap the meters.
 */
import { comboTubeFill, drainPopups, type Popup } from "../../../examples/shared/runner-kit/index";
import { CONFIG, type GameState } from "./sim";
import { LOOK } from "./look";

export const HUD_INK = LOOK.ink;
export const HUD_PAPER = LOOK.paper;
/** Ink/paper pairs used by the shell; the contrast test pins each at >= 4.5:1. */
export const HUD_PAIRS: readonly (readonly [string, string])[] = [
  [LOOK.ink, LOOK.paper],
  [LOOK.good, LOOK.paper],
  [LOOK.bad, LOOK.paper],
  [LOOK.gold, LOOK.paper],
  [LOOK.ink, "#f7c531"],
  [LOOK.paper, LOOK.ink]
];

const el = (id: string): HTMLElement => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`shape-shift-sprint: missing HUD element #${id}`);
  return node;
};

export class Hud {
  private readonly score = el("score");
  private readonly best = el("best");
  private readonly mult = el("mult");
  private readonly tube = el("combo-fill");
  private readonly lives = el("lives");
  private readonly shapeChip = el("shape-chip");
  private readonly shapeName = el("shape-name");
  private readonly status = el("status-line");
  private readonly popupHost = el("popups");
  private nextSeq = 0;
  private last = { score: -1, best: -1, mult: -1, fill: -1, lives: -1, shape: -1, status: "" };

  update(o: GameState, best: number, popups: readonly Popup[]): void {
    if (o.score !== this.last.score) { this.score.textContent = String(o.score); this.last.score = o.score; }
    if (best !== this.last.best) { this.best.textContent = `BEST ${best}`; this.last.best = best; }
    if (o.multiplier !== this.last.mult) { this.mult.textContent = `x${o.multiplier}`; this.last.mult = o.multiplier; }
    const fill = Math.round(comboTubeFill(o.combo, o.multiplier, CONFIG.MAX_MULT, CONFIG.COMBO_PER_MULT) * 100);
    if (fill !== this.last.fill) { this.tube.style.width = `${fill}%`; this.last.fill = fill; }
    if (o.lives !== this.last.lives) {
      this.lives.replaceChildren(...Array.from({ length: CONFIG.MAX_LIVES }, (_, i) => {
        const pip = document.createElement("span");
        pip.className = i < o.lives ? "pip on" : "pip";
        return pip;
      }));
      this.last.lives = o.lives;
    }
    if (o.shapeIndex !== this.last.shape) {
      this.shapeChip.style.background = LOOK.shapes[o.shapeIndex] as string;
      this.shapeChip.dataset.shape = LOOK.shapeNames[o.shapeIndex] as string;
      this.shapeName.textContent = (LOOK.shapeNames[o.shapeIndex] as string).toUpperCase();
      this.last.shape = o.shapeIndex;
    }
    const status = o.wildcardTimer > 0 ? `ANY SHAPE ${o.wildcardTimer.toFixed(1)}s`
      : o.scoreX2Timer > 0 ? `x2 SCORE ${o.scoreX2Timer.toFixed(1)}s`
      : o.shieldActive ? "SHIELD READY" : "";
    if (status !== this.last.status) { this.status.textContent = status; this.last.status = status; }
    this.drain(popups);
  }

  private drain(popups: readonly Popup[]): void {
    const { fresh, nextSeq } = drainPopups(popups, this.nextSeq);
    this.nextSeq = nextSeq;
    for (const p of fresh) {
      const div = document.createElement("div");
      div.className = "popup";
      div.textContent = p.text;
      div.style.setProperty("--popup-accent", p.color);
      div.style.fontSize = `${Math.round(16 * p.size)}px`;
      div.addEventListener("animationend", () => div.remove(), { once: true });
      this.popupHost.appendChild(div);
      while (this.popupHost.childElementCount > 8) this.popupHost.firstElementChild?.remove();
    }
  }

  /** A restart keeps draining by seq; only the visible column is cleared. */
  resetColumn(): void {
    this.popupHost.replaceChildren();
  }
}