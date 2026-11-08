/**
 * HUD helpers for Splat Turf: plum ink on cream paper, tank bar and live coverage %. Pure helpers are
 * unit-tested for contrast; `main.ts` owns the DOM writes (only when a value changes).
 */
import { comboTubeFill } from "../../../examples/shared/runner-kit/index";
import { CONFIG, type GameState } from "./sim";

export const HUD_INK = "#3b1f47";
export const HUD_PAPER = "#fff8f2";
export const HUD_PLUM = "#3b1f47";
export const HUD_GOLD = "#ffb400";
export const HUD_CYAN = "#14c9c9";
export const HUD_TANK_LOW = "#d92626";

/** Every foreground/background pair the shell renders text with (all must clear WCAG AA 4.5:1). */
export const HUD_PAIRS: readonly (readonly [string, string])[] = [
  [HUD_INK, HUD_PAPER],   // score, coverage, tank label over the paper chip / white road
  [HUD_PAPER, HUD_PLUM],  // overlay card body text
  [HUD_GOLD, HUD_PLUM],   // overlay headings
  [HUD_INK, HUD_GOLD],    // PLAY NOW / PLAY AGAIN button label
  [HUD_CYAN, HUD_PLUM],   // coverage grade on the results card
  [HUD_PAPER, HUD_TANK_LOW] // low-tank warning text on the red fill
];

export const TANK_LOW_PERCENT = 25;

export function tankPercent(o: Pick<GameState, "tank">): number {
  return Math.round((o.tank / CONFIG.TANK_MAX) * 100);
}

export function coveragePercent(o: Pick<GameState, "coverage">): number {
  return Math.round(o.coverage * 100);
}

export function tubeFill(o: Pick<GameState, "combo" | "mult">): number {
  return comboTubeFill(o.combo, o.mult, CONFIG.MAX_MULT, CONFIG.COMBO_PER_MULT);
}

/** Change-gated DOM writer (C10): every field is written only when its rendered text changes. */
export class HudWriter {
  private readonly cache = new Map<string, string>();

  constructor(private readonly els: {
    score: HTMLElement; best: HTMLElement; coverage: HTMLElement; mult: HTMLElement;
    comboFill: HTMLElement; tankFill: HTMLElement; tankBar: HTMLElement;
  }) {}

  private changed(key: string, value: string): boolean {
    if (this.cache.get(key) === value) return false;
    this.cache.set(key, value);
    return true;
  }

  update(o: GameState, bestCoverage: number): void {
    const score = String(Math.floor(o.score));
    if (this.changed("score", score)) this.els.score.textContent = score;
    const best = `BEST ${bestCoverage}%`;
    if (this.changed("best", best)) this.els.best.textContent = best;
    const coverage = `COVERAGE ${coveragePercent(o)}%`;
    if (this.changed("coverage", coverage)) this.els.coverage.textContent = coverage;
    const mult = `x${o.mult}`;
    if (this.changed("mult", mult)) this.els.mult.textContent = mult;
    const fill = `${Math.round(tubeFill(o) * 100)}%`;
    if (this.changed("tube", fill)) this.els.comboFill.style.width = fill;
    const tank = tankPercent(o);
    if (this.changed("tank", String(tank))) {
      this.els.tankFill.style.width = `${tank}%`;
      this.els.tankBar.classList.toggle("low", tank <= TANK_LOW_PERCENT);
    }
  }
}