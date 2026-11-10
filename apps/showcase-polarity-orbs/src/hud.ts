/** DOM HUD: writes only when a value changes (C10). Contrast-safe ink pairs live in look.ts (unit tested). */
import { comboTubeFill } from "../../../examples/shared/runner-kit/hud-utils";
import { CONFIG, type GameState } from "./sim";
import { LOOK } from "./look";

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`polarity-orbs: #${id} is missing`);
  return el;
};

export class Hud {
  private readonly cache = new Map<string, string>();

  private changed(key: string, value: string): boolean {
    if (this.cache.get(key) === value) return false;
    this.cache.set(key, value);
    return true;
  }

  resetCache(): void {
    this.cache.clear();
  }

  update(o: GameState, best: number): void {
    if (this.changed("score", String(o.score))) $("hud-score").textContent = o.score.toLocaleString();
    if (this.changed("best", String(best))) {
      const text = `best ${best.toLocaleString()}`;
      $("hud-best").textContent = text;
      $("splash-best").textContent = text;
    }
    const pct = Math.round(comboTubeFill(o.combo, o.mult, CONFIG.MAX_MULT, CONFIG.COMBO_PER_MULT) * 100);
    const fill = `${pct}%`;
    if (this.changed("tube", fill)) {
      $("combo-fill").style.width = fill;
      $("polarity-charge").textContent = fill;
    }
    if (this.changed("mult", String(o.mult))) $("hud-mult").textContent = `x${o.mult}`;

    const polarityKey = `${o.polarity}|${o.rainbowTimer > 0}`;
    if (this.changed("polarity", polarityKey)) {
      const icon = $("polarity-icon");
      const flipBtn = $("btn-flip");
      const flipGlyph = $("flip-pole-glyph");
      const rainbow = o.rainbowTimer > 0;
      const glyph = o.polarity === 1 ? "+" : "−";
      icon.classList.toggle("blue", o.polarity === -1 && !rainbow);
      icon.style.background = rainbow ? `linear-gradient(135deg, ${LOOK.red}, ${LOOK.gold}, ${LOOK.blue})` : "";
      icon.textContent = glyph;
      icon.setAttribute("aria-label", `Current polarity: ${rainbow ? "rainbow" : o.polarity === 1 ? "red" : "blue"}`);
      flipBtn.classList.toggle("blue", o.polarity === -1 && !rainbow);
      flipGlyph.textContent = glyph;
    }

    if (this.changed("lives", String(o.lives))) {
      const pips = $("lives").querySelectorAll<HTMLElement>(".life-pip");
      pips.forEach((pip, i) => pip.classList.toggle("lost", i >= o.lives));
    }

    const badges: readonly [string, boolean, number][] = [
      ["badge-rainbow", o.rainbowTimer > 0, Math.min(100, Math.max(0, Math.round((o.rainbowTimer / CONFIG.RAINBOW_DURATION) * 100)))],
      ["badge-shield", o.shieldActive, o.shieldActive ? 100 : 0],
      ["badge-x2", o.scoreX2Timer > 0, Math.min(100, Math.max(0, Math.round((o.scoreX2Timer / CONFIG.X2_DURATION) * 100)))],
      ["badge-magnet", o.magnetTimer > 0, Math.min(100, Math.max(0, Math.round((o.magnetTimer / CONFIG.MAGNET_DURATION) * 100)))]
    ];
    for (const [id, on, buffPct] of badges) {
      if (this.changed(id, String(on))) $(id).classList.toggle("on", on);
      if (on) {
        const pctKey = `${id}-pct`;
        const pctStr = `${buffPct}%`;
        if (this.changed(pctKey, pctStr)) $(id).style.setProperty("--buff-pct", pctStr);
      }
    }

    if (this.changed("phase", o.phase)) {
      const activeHud = o.phase === "playing" || o.phase === "bursting";
      $("hud").classList.toggle("visible", activeHud);
      $("btn-flip").classList.toggle("visible", o.phase === "playing");
      $("splash-screen").classList.toggle("visible", o.phase === "splash");
      $("gameover-screen").classList.toggle("visible", o.phase === "gameOver");
    }
  }
}
