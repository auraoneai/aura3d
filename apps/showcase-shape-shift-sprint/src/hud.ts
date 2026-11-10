/**
 * Playing HUD (WP-15 AuraOne typography & ergonomic overhaul):
 * - DOM writes only when values change; every text pair clears WCAG AA >= 4.5:1
 *   (pinned by tests/unit/shape-shift-sprint/hud-contrast.test.ts).
 * - Standalone metrics (`#score`, `#best-val`, `#mult`, `#hud-speed`, `#hud-dist`, `#hud-streak`)
 *   render in `var(--font-metric)` (DIN Pro `tabular-nums`); labels and form buttons use
 *   `var(--font-ui)` (Whitney `400/500/600`); world tag uses `var(--font-mono)`.
 * - `#status-line` hides cleanly when empty (zero empty pill chrome).
 * - `#popups` sits in the upper sky header band above gate sightlines.
 * - `#form-selector` highlights the active morph form and shows upcoming gate lanes (`L`/`M`/`R`).
 */
import { comboTubeFill, drainPopups, type Popup } from "../../../examples/shared/runner-kit/index";
import { CONFIG, type GameState, type WallRow } from "./sim";
import { LOOK, TOYBOX_WORLDS } from "./look";

export const HUD_INK = LOOK.ink;
export const HUD_PAPER = LOOK.paper;
export const HUD_MUTED = "#324264";
/** Ink/paper pairs used by the shell & form-selector HUD; the contrast test pins each at >= 4.5:1. */
export const HUD_PAIRS: readonly (readonly [string, string])[] = [
  [LOOK.ink, LOOK.paper],
  [HUD_MUTED, LOOK.paper],
  [HUD_MUTED, "#f7c531"],
  [LOOK.good, LOOK.paper],
  [LOOK.bad, LOOK.paper],
  [LOOK.gold, LOOK.paper],
  [LOOK.ink, "#f7c531"],
  [LOOK.ink, "#fffaf2"],
  [LOOK.paper, LOOK.ink]
];

const LANE_TAG = ["L", "M", "R"] as const;

const el = (id: string): HTMLElement => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`shape-shift-sprint: missing HUD element #${id}`);
  return node;
};

export class Hud {
  private readonly score = el("score");
  private readonly bestVal = document.getElementById("best-val") ?? el("best");
  private readonly speedEl = document.getElementById("hud-speed");
  private readonly distEl = document.getElementById("hud-dist");
  private readonly streakEl = document.getElementById("hud-streak");
  private readonly worldTag = document.getElementById("world-tag");
  private readonly mult = el("mult");
  private readonly tube = el("combo-fill");
  private readonly lives = el("lives");
  private readonly shapeChip = el("shape-chip");
  private readonly shapeName = el("shape-name");
  private readonly status = el("status-line");
  private readonly popupHost = el("popups");
  private readonly formBar = document.getElementById("form-selector");
  private readonly formBtns: HTMLElement[] = Array.from(document.querySelectorAll<HTMLElement>("[data-form-btn]"));
  private readonly formLanes: (HTMLElement | null)[] = [0, 1, 2].map((i) => document.querySelector<HTMLElement>(`[data-form-lane="${i}"]`));
  private nextSeq = 0;
  private last = {
    score: -1,
    best: -1,
    speed: -1,
    dist: -1,
    streak: -1,
    milestone: -1,
    mult: -1,
    fill: -1,
    lives: -1,
    shape: -1,
    phase: "",
    lanes: "",
    status: "__init__"
  };

  update(o: GameState, best: number, popups: readonly Popup[], rows?: readonly WallRow[]): void {
    if (o.score !== this.last.score) {
      this.score.textContent = o.score.toLocaleString();
      this.last.score = o.score;
    }
    if (best !== this.last.best) {
      this.bestVal.textContent = best.toLocaleString();
      this.last.best = best;
    }
    const speedRounded = Math.round(o.speed);
    if (this.speedEl && speedRounded !== this.last.speed) {
      this.speedEl.textContent = String(speedRounded);
      this.last.speed = speedRounded;
    }
    const distRounded = Math.floor(o.distance);
    if (this.distEl && distRounded !== this.last.dist) {
      this.distEl.textContent = distRounded.toLocaleString();
      this.last.dist = distRounded;
    }
    if (this.streakEl && o.combo !== this.last.streak) {
      this.streakEl.textContent = String(o.combo);
      this.last.streak = o.combo;
    }
    if (this.worldTag && o.milestone !== this.last.milestone) {
      const idx = o.milestone % TOYBOX_WORLDS.length;
      const worldName = TOYBOX_WORLDS[idx]!.name.toUpperCase();
      this.worldTag.textContent = `W${o.milestone + 1} · ${worldName}`;
      this.last.milestone = o.milestone;
    }
    if (o.multiplier !== this.last.mult) {
      this.mult.textContent = `x${o.multiplier}`;
      this.last.mult = o.multiplier;
    }
    const fill = Math.round(comboTubeFill(o.combo, o.multiplier, CONFIG.MAX_MULT, CONFIG.COMBO_PER_MULT) * 100);
    if (fill !== this.last.fill) {
      this.tube.style.width = `${fill}%`;
      this.last.fill = fill;
    }
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
      this.shapeName.textContent = LOOK.shapeNames[o.shapeIndex] as string;
      for (const btn of this.formBtns) {
        const active = Number(btn.dataset.formBtn) === o.shapeIndex;
        btn.classList.toggle("is-active", active);
        btn.setAttribute("aria-current", String(active));
      }
      this.last.shape = o.shapeIndex;
    }
    if (this.formBar && o.phase !== this.last.phase) {
      this.formBar.classList.toggle("hidden", o.phase !== "playing");
      this.last.phase = o.phase;
    }
    if (rows && o.phase === "playing") {
      let nextRow: WallRow | undefined;
      for (const r of rows) {
        if (!r.resolved && r.z <= 0.4 && (!nextRow || r.z > nextRow.z)) nextRow = r;
      }
      if (nextRow) {
        const map = ["-", "-", "-"];
        nextRow.holes.forEach((h, laneIdx) => { map[h.shapeIndex] = LANE_TAG[laneIdx] ?? "-"; });
        const key = map.join("");
        if (key !== this.last.lanes) {
          for (let s = 0; s < 3; s++) {
            const laneNode = this.formLanes[s];
            if (laneNode) laneNode.textContent = map[s]!;
          }
          this.last.lanes = key;
        }
      }
    }
    const status = o.wildcardTimer > 0 ? `any shape ${o.wildcardTimer.toFixed(1)}s`
      : o.scoreX2Timer > 0 ? `x2 score ${o.scoreX2Timer.toFixed(1)}s`
      : o.shieldActive ? "shield ready" : "";
    if (status !== this.last.status) {
      this.status.textContent = status;
      this.status.classList.toggle("hidden", status === "");
      this.last.status = status;
    }
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
      div.style.fontSize = `${Math.max(12, Math.round(14 * p.size))}px`;
      div.addEventListener("animationend", () => div.remove(), { once: true });
      this.popupHost.appendChild(div);
      while (this.popupHost.childElementCount > 6) this.popupHost.firstElementChild?.remove();
    }
  }

  /** A restart keeps draining by seq; only the visible column is cleared. */
  resetColumn(): void {
    this.popupHost.replaceChildren();
  }
}
