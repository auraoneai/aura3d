/** DOM HUD: writes only when a value changes (C10). Contrast-safe ink pairs live in look.ts (unit tested). */
import { comboTubeFill } from "../../../examples/shared/runner-kit/index";
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
    if (this.changed("score", String(o.score))) $("hud-score").textContent = String(o.score);
    if (this.changed("best", String(best))) {
      $("hud-best").textContent = `BEST ${best}`;
      $("splash-best").textContent = `BEST ${best}`;
    }
    const fill = `${Math.round(comboTubeFill(o.combo, o.mult, CONFIG.MAX_MULT, CONFIG.COMBO_PER_MULT) * 100)}%`;
    if (this.changed("tube", fill)) ($("combo-fill") as HTMLElement).style.width = fill;
    if (this.changed("mult", String(o.mult))) $("hud-mult").textContent = `x${o.mult}`;

    const polarityKey = `${o.polarity}|${o.rainbowTimer > 0}`;
    if (this.changed("polarity", polarityKey)) {
      const icon = $("polarity-icon");
      const rainbow = o.rainbowTimer > 0;
      icon.classList.toggle("blue", o.polarity === -1 && !rainbow);
      icon.style.background = rainbow ? `linear-gradient(135deg, ${LOOK.red}, ${LOOK.gold}, ${LOOK.blue})` : "";
      icon.textContent = o.polarity === 1 ? "+" : "−";
      icon.setAttribute("aria-label", `Current polarity: ${rainbow ? "rainbow" : o.polarity === 1 ? "red" : "blue"}`);
    }

    if (this.changed("lives", String(o.lives))) {
      const pips = $("lives").querySelectorAll<HTMLElement>(".life-pip");
      pips.forEach((pip, i) => pip.classList.toggle("lost", i >= o.lives));
    }

    const badges: [string, boolean][] = [
      ["badge-rainbow", o.rainbowTimer > 0],
      ["badge-shield", o.shieldActive],
      ["badge-x2", o.scoreX2Timer > 0],
      ["badge-magnet", o.magnetTimer > 0]
    ];
    for (const [id, on] of badges) {
      if (this.changed(id, String(on))) $(id).classList.toggle("on", on);
    }

    if (this.changed("phase", o.phase)) {
      $("hud").classList.toggle("visible", o.phase === "playing" || o.phase === "bursting");
      $("splash-screen").classList.toggle("visible", o.phase === "splash");
      $("gameover-screen").classList.toggle("visible", o.phase === "gameOver");
    }
  }
}