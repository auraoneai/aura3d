/**
 * DOM HUD: writes only when a value changes. Night-neon ink on deep-indigo paper (contrast pinned by
 * `tests/unit/beat-hopper/hud-contrast.test.ts`); the beat dot, beat ring, and live sync accuracy % pulse
 * with the deterministic 132 BPM sim clock, never a wall clock.
 */
import { comboTubeFill, drainPopups, type Popup } from "../../../examples/shared/runner-kit/index";
import { CONFIG, type BeatHopperSim } from "./sim";
import { LOOK, beatPulse } from "./look";

export const HUD_INK = LOOK.hudInk;
export const HUD_PAPER = LOOK.hudPaper;

export interface HudElements {
  readonly root: HTMLElement;
  readonly score: HTMLElement;
  readonly best: HTMLElement;
  readonly comboFill: HTMLElement;
  readonly comboLabel: HTMLElement;
  readonly lives: HTMLElement;
  readonly beatDot: HTMLElement;
  readonly popups: HTMLElement;
  readonly accuracyVal?: HTMLElement | null;
  readonly comboStreak?: HTMLElement | null;
  readonly bpmVal?: HTMLElement | null;
  readonly beatRing?: HTMLElement | null;
}

export function hudElements(doc: Document): HudElements {
  const get = (id: string): HTMLElement => {
    const el = doc.getElementById(id);
    if (!el) throw new Error(`beat-hopper: #${id} is missing`);
    return el;
  };
  return {
    root: get("hud"),
    score: get("hud-score"),
    best: get("hud-best"),
    comboFill: get("combo-fill"),
    comboLabel: get("combo-label"),
    lives: get("hud-lives"),
    beatDot: get("beat-dot"),
    popups: get("popups"),
    accuracyVal: doc.getElementById("hud-acc-val"),
    comboStreak: doc.getElementById("combo-streak"),
    bpmVal: doc.getElementById("hud-bpm"),
    beatRing: doc.getElementById("beat-ring")
  };
}

export class Hud {
  private readonly cache = new Map<string, string>();
  private nextSeq = 0;
  popupsShown = 0;

  constructor(private readonly els: HudElements) {}

  private changed(key: string, value: string): boolean {
    if (this.cache.get(key) === value) return false;
    this.cache.set(key, value);
    return true;
  }

  reset(): void {
    this.cache.clear();
    this.els.popups.replaceChildren();
  }

  update(sim: BeatHopperSim, best: number, manual: boolean): void {
    const o = sim.o;
    if (this.changed("visible", String(o.phase === "playing" || o.phase === "bursting"))) {
      this.els.root.classList.toggle("hidden", !(o.phase === "playing" || o.phase === "bursting"));
    }
    if (this.changed("score", String(o.score))) this.els.score.textContent = String(o.score);
    if (this.changed("best", String(best))) this.els.best.textContent = `Best ${best}`;
    const fill = `${Math.round(comboTubeFill(o.combo, o.mult, CONFIG.MAX_MULT, CONFIG.COMBO_PER_MULT) * 100)}%`;
    if (this.changed("fill", fill)) this.els.comboFill.style.width = fill;
    if (this.changed("mult", String(o.mult))) this.els.comboLabel.textContent = `x${o.mult}`;
    if (this.els.comboStreak) {
      const streak = o.combo > 0 ? `${o.combo}` : "";
      if (this.changed("streak", streak)) this.els.comboStreak.textContent = streak;
    }
    if (this.els.accuracyVal) {
      const judged = o.perfect + o.good + o.dodges + o.miss;
      const acc = judged === 0 ? "100%" : `${Math.round(((o.perfect + o.good * 0.75 + o.dodges) / judged) * 100)}%`;
      if (this.changed("acc", acc)) this.els.accuracyVal.textContent = acc;
    }
    if (this.els.bpmVal) {
      const bpm = `${CONFIG.BPM} BPM`;
      if (this.changed("bpm", bpm)) this.els.bpmVal.textContent = bpm;
    }
    if (this.changed("lives", String(o.lives))) {
      const pips = this.els.lives.children;
      for (let i = 0; i < pips.length; i++) (pips[i] as HTMLElement).classList.toggle("lost", i >= o.lives);
    }
    const p = beatPulse(o.t, CONFIG.BEAT);
    const pulse = (1 + 0.36 * p).toFixed(3);
    if (this.changed("pulse", pulse)) {
      this.els.beatDot.style.transform = `scale(${pulse})`;
      if (this.els.beatRing) {
        const ringScale = (1.05 + 0.65 * p).toFixed(3);
        const ringAlpha = (0.28 + 0.62 * p).toFixed(2);
        this.els.beatRing.style.transform = `scale(${ringScale})`;
        this.els.beatRing.style.opacity = ringAlpha;
      }
    }
    const drained = drainPopups(sim.popups, this.nextSeq);
    this.nextSeq = drained.nextSeq;
    if (manual && drained.fresh.length > 0) this.els.popups.replaceChildren();
    for (const popup of drained.fresh) this.showPopup(popup);
  }

  private showPopup(p: Popup): void {
    this.popupsShown++;
    const el = document.createElement("div");
    el.className = "popup";
    el.textContent = p.text;
    el.style.color = p.color;
    el.style.fontSize = `${Math.max(15, Math.round(18 * p.size))}px`;
    this.els.popups.appendChild(el);
    el.addEventListener("animationend", () => el.remove());
    while (this.els.popups.children.length > 2) this.els.popups.firstElementChild?.remove();
  }
}
