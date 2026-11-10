/**
 * Number Surge HUD: DOM writes only when a value changes. Contrast-safe ink/paper
 * pairs are exported for the unit contrast gate (every pair >= 4.5:1, kit helpers).
 */
import { comboTubeFill, contrastRatio } from "../../../examples/shared/runner-kit/index";
import { DIMS } from "./meshes";
import { CONFIG, type GameState } from "./sim";

/** Every HUD text/background pair used by index.html (worst-case backdrop per surface). */
export const HUD_PAIRS: readonly { readonly name: string; readonly ink: string; readonly paper: string }[] = [
  { name: "score", ink: "#eaf6ff", paper: "#131230" },
  { name: "best", ink: "#ffd84d", paper: "#131230" },
  { name: "mult", ink: "#3ef2ff", paper: "#131230" },
  { name: "number", ink: "#3ef2ff", paper: "#131230" },
  { name: "wall", ink: "#ff4fd8", paper: "#131230" },
  { name: "wall-smash", ink: "#7dff9e", paper: "#131230" },
  { name: "wall-danger", ink: "#ff6b86", paper: "#131230" },
  { name: "shield", ink: "#7dff9e", paper: "#131230" },
  { name: "x2", ink: "#ffd84d", paper: "#131230" },
  { name: "eyebrow", ink: "#a9b8d8", paper: "#131230" },
  { name: "splash-title-cyan", ink: "#3ef2ff", paper: "#281a52" },
  { name: "splash-title-magenta", ink: "#ff4fd8", paper: "#281a52" },
  { name: "splash-instruction", ink: "#eaf6ff", paper: "#281a52" },
  { name: "splash-hint", ink: "#a9b8d8", paper: "#281a52" },
  { name: "splash-best", ink: "#ffd84d", paper: "#281a52" },
  { name: "button-start", ink: "#10102e", paper: "#3ef2ff" },
  { name: "button-restart", ink: "#10102e", paper: "#ffd84d" },
  { name: "results-heading", ink: "#ffd84d", paper: "#191840" },
  { name: "results-score", ink: "#eaf6ff", paper: "#191840" },
  { name: "results-value", ink: "#3ef2ff", paper: "#23224c" },
  { name: "results-label", ink: "#eaf6ff", paper: "#23224c" },
  { name: "corner-button", ink: "#eaf6ff", paper: "#1d1c44" },
  { name: "pause-heading", ink: "#ffd84d", paper: "#191840" },
  { name: "howto-title", ink: "#3ef2ff", paper: "#1e1d43" },
  { name: "howto-section", ink: "#ffd84d", paper: "#1e1d43" },
  { name: "howto-body", ink: "#eaf6ff", paper: "#1e1d43" },
  { name: "howto-body-dim", ink: "#a9b8d8", paper: "#1e1d43" },
  { name: "howto-key-chip", ink: "#eaf6ff", paper: "#23224c" },
  { name: "howto-swatch-gate-good", ink: "#ffffff", paper: "#0d3540" },
  { name: "howto-swatch-gate-bad", ink: "#ffffff", paper: "#381131" },
  { name: "howto-swatch-wall", ink: "#ffd84d", paper: "#5a2d91" },
  { name: "howto-swatch-ball", ink: "#10102e", paper: "#3ef2ff" },
  { name: "howto-button-ghost", ink: "#eaf6ff", paper: "#1d1c44" }
];

export function auditHudContrast(): { name: string; ratio: number }[] {
  return HUD_PAIRS.map((p) => ({ name: p.name, ratio: contrastRatio(p.ink, p.paper) }));
}

export interface HudElements {
  hud: HTMLElement;
  score: HTMLElement;
  best: HTMLElement;
  comboFill: HTMLElement;
  mult: HTMLElement;
  number: HTMLElement;
  wall: HTMLElement;
  shield: HTMLElement;
  x2: HTMLElement;
  laneRail?: HTMLElement | null;
  laneThumb?: HTMLElement | null;
}

const text = (el: HTMLElement, value: string): void => {
  if (el.textContent !== value) el.textContent = value;
};

export class NumberSurgeHud {
  private lastScore = -1;
  private lastBest = -1;
  private lastMult = -1;
  private lastNumber = -1;
  private lastWallKey = "";
  private lastFill = -1;
  private lastShield: boolean | null = null;
  private lastX2 = false;
  private lastVisible: boolean | null = null;
  private lastLanePct = -1;

  constructor(private readonly el: HudElements) {}

  update(o: GameState, best: number): void {
    const visible = o.phase === "playing" || o.phase === "bursting";
    if (visible !== this.lastVisible) {
      this.lastVisible = visible;
      this.el.hud.hidden = !visible;
      if (this.el.laneRail) this.el.laneRail.hidden = !visible;
    }
    if (!visible) return;
    if (o.score !== this.lastScore) {
      this.lastScore = o.score;
      text(this.el.score, o.score.toLocaleString());
    }
    if (best !== this.lastBest) {
      this.lastBest = best;
      text(this.el.best, `best ${best.toLocaleString()}`);
    }
    if (o.mult !== this.lastMult) {
      this.lastMult = o.mult;
      text(this.el.mult, `×${o.mult}`);
    }
    const fill = Math.round(comboTubeFill(o.combo, o.mult, CONFIG.MAX_MULT, CONFIG.COMBO_PER_MULT) * 100);
    if (fill !== this.lastFill) {
      this.lastFill = fill;
      this.el.comboFill.style.width = `${fill}%`;
    }
    if (o.number !== this.lastNumber) {
      this.lastNumber = o.number;
      text(this.el.number, o.number.toLocaleString());
    }
    const wallState = o.wallHp <= 0 ? "none" : o.number > o.wallHp ? "smash" : o.shieldActive ? "shield" : "danger";
    const wallKey = `${wallState}:${o.wallHp}`;
    if (wallKey !== this.lastWallKey) {
      this.lastWallKey = wallKey;
      if (wallState === "none") {
        this.el.wall.hidden = true;
        text(this.el.wall, "");
      } else {
        this.el.wall.hidden = false;
        this.el.wall.dataset.state = wallState === "danger" ? "danger" : "smash";
        const label =
          wallState === "smash" ? `smash −${o.wallHp}` : wallState === "shield" ? `shield ${o.wallHp}` : `danger ${o.wallHp}`;
        text(this.el.wall, label);
      }
    }
    if (o.shieldActive !== this.lastShield) {
      this.lastShield = o.shieldActive;
      this.el.shield.hidden = !o.shieldActive;
    }
    const x2 = o.scoreX2Timer > 0;
    if (x2 !== this.lastX2) {
      this.lastX2 = x2;
      this.el.x2.hidden = !x2;
    }
    if (this.el.laneThumb) {
      const pct = Math.round(Math.max(0, Math.min(100, ((o.laneOffset / (DIMS.EDGE_X - 0.55)) * 0.5 + 0.5) * 100)));
      if (pct !== this.lastLanePct) {
        this.lastLanePct = pct;
        this.el.laneThumb.style.left = `${pct}%`;
      }
    }
  }
}
