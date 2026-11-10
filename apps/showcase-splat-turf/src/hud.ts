/**
 * HUD helpers for Splat Turf (WP-17): plum ink on cream paper, territory-meter coverage bar with
 * C / B / A / S grade thresholds (50% / 70% / 85%), remaining course countdown, and tactile glass ink
 * pressure gauge. Pure helpers are unit-tested for contrast; `main.ts` owns change-gated DOM writes.
 */
import { comboTubeFill } from "../../../examples/shared/runner-kit/index";
import { CONFIG, coverageGrade, type GameState } from "./sim";

export const HUD_INK = "#3b1f47";
export const HUD_PAPER = "#fff8f2";
export const HUD_PLUM = "#3b1f47";
export const HUD_GOLD = "#ffb400";
export const HUD_CYAN = "#14c9c9";
export const HUD_TANK_LOW = "#d92626";

/** Every foreground/background pair the shell renders text with (all must clear WCAG AA 4.5:1). */
export const HUD_PAIRS: readonly (readonly [string, string])[] = [
  [HUD_INK, HUD_PAPER],     // score, territory meter, tank readout over cream paper chips
  [HUD_PAPER, HUD_PLUM],    // overlay card body text & grade pill
  [HUD_GOLD, HUD_PLUM],     // overlay headings
  [HUD_INK, HUD_GOLD],      // primary CTA button & S-grade badge
  [HUD_CYAN, HUD_PLUM],     // coverage grade on the results card
  [HUD_PAPER, HUD_TANK_LOW] // low-tank warning badge on crimson fill
];

export const TANK_LOW_PERCENT = 25;

export function tankPercent(o: Pick<GameState, "tank">): number {
  return Math.round((o.tank / CONFIG.TANK_MAX) * 100);
}

export function coveragePercent(o: Pick<GameState, "coverage">): number {
  return Math.round(o.coverage * 100);
}

export function remainingMeters(o: Pick<GameState, "distance">): number {
  return Math.max(0, Math.ceil(CONFIG.RUN_LENGTH - o.distance));
}

export function tubeFill(o: Pick<GameState, "combo" | "mult">): number {
  return comboTubeFill(o.combo, o.mult, CONFIG.MAX_MULT, CONFIG.COMBO_PER_MULT);
}

export interface HudElements {
  score: HTMLElement;
  best: HTMLElement;
  coverage: HTMLElement;
  mult: HTMLElement;
  comboFill: HTMLElement;
  tankFill: HTMLElement;
  tankBar: HTMLElement;
  coveragePct?: HTMLElement;
  territoryFill?: HTMLElement;
  liveGrade?: HTMLElement;
  distanceRem?: HTMLElement;
  courseFill?: HTMLElement;
  tankPct?: HTMLElement;
}

/** Change-gated DOM writer: every field is written only when its rendered text/style changes. */
export class HudWriter {
  private readonly cache = new Map<string, string>();

  constructor(private readonly els: HudElements) {}

  private changed(key: string, value: string): boolean {
    if (this.cache.get(key) === value) return false;
    this.cache.set(key, value);
    return true;
  }

  update(o: GameState, bestCoverage: number): void {
    const score = Math.floor(o.score).toLocaleString();
    if (this.changed("score", score)) this.els.score.textContent = score;

    const best = `best ${bestCoverage}%`;
    if (this.changed("best", best)) this.els.best.textContent = best;

    const cov = coveragePercent(o);
    const coverage = `coverage ${cov}%`;
    if (this.changed("coverage", coverage)) {
      this.els.coverage.textContent = coverage;
      if (this.els.coveragePct) this.els.coveragePct.textContent = `${cov}%`;
      if (this.els.territoryFill) this.els.territoryFill.style.width = `${Math.min(100, Math.max(0, cov))}%`;
    }

    const grade = coverageGrade(cov);
    if (this.els.liveGrade && this.changed("grade", grade)) {
      this.els.liveGrade.textContent = grade;
      this.els.liveGrade.dataset.grade = grade;
    }

    const rem = remainingMeters(o);
    if (this.els.distanceRem && this.changed("rem", String(rem))) {
      this.els.distanceRem.textContent = `${rem.toLocaleString()} m`;
    }
    if (this.els.courseFill) {
      const pct = `${Math.min(100, Math.max(0, Math.round((o.distance / CONFIG.RUN_LENGTH) * 100)))}%`;
      if (this.changed("course", pct)) this.els.courseFill.style.width = pct;
    }

    const mult = `x${o.mult}`;
    if (this.changed("mult", mult)) this.els.mult.textContent = mult;

    const fill = `${Math.round(tubeFill(o) * 100)}%`;
    if (this.changed("tube", fill)) this.els.comboFill.style.width = fill;

    const tank = tankPercent(o);
    if (this.changed("tank", String(tank))) {
      this.els.tankFill.style.width = `${tank}%`;
      this.els.tankBar.classList.toggle("low", tank <= TANK_LOW_PERCENT);
      if (this.els.tankPct) this.els.tankPct.textContent = `${tank}%`;
    }
  }
}
