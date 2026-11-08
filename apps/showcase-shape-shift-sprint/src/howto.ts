/**
 * How to play panel: a modal rules card over the 3D scene. Colours come from look.ts and every number
 * from the sim's CONFIG, so the card cannot drift from the real rules. Presentation only: it never
 * touches the sim; main.ts decides what closing it does (start the first run, or nothing).
 *
 * While open it owns the keyboard (capture phase): Esc / Enter / Space close it, Tab cycles inside it,
 * every other key is swallowed so the game's shortcuts do not fire behind the dialog.
 */
import { CONFIG } from "./sim";
import { LOOK } from "./look";

export interface HowToOptions {
  /** Called once per close; `play` is true when the panel was opened from PLAY and should start the run. */
  onClose(play: boolean): void;
}

export interface HowTo {
  readonly isOpen: boolean;
  open(play: boolean): void;
  close(): void;
}

const FOCUSABLE = "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";

/** Fact values written into `[data-fact]` slots, derived from the sim configuration. */
export function howtoFacts(): Record<string, string> {
  return {
    WILDCARD_DURATION: String(CONFIG.WILDCARD_DURATION),
    X2_DURATION: String(CONFIG.X2_DURATION),
    POINTS_GATE: String(CONFIG.POINTS_GATE),
    POINTS_PERFECT: String(CONFIG.POINTS_PERFECT),
    COMBO_PER_MULT: String(CONFIG.COMBO_PER_MULT),
    MAX_MULT_X: `x${CONFIG.MAX_MULT}`,
    MILESTONE: CONFIG.MILESTONE.toLocaleString("en-US"),
    MILESTONE_BONUS: `+${CONFIG.MILESTONE_BONUS}`,
    MAX_LIVES: String(CONFIG.MAX_LIVES)
  };
}

/** Swatch colours keyed by `[data-swatch]`, all real in-game colours. */
export function howtoSwatches(): Record<string, string> {
  return {
    shape0: LOOK.shapes[0], shape1: LOOK.shapes[1], shape2: LOOK.shapes[2],
    wildcard: LOOK.tokenColors.wildcard, shield: LOOK.tokenColors.shield, x2: LOOK.tokenColors.x2
  };
}

export function createHowTo(options: HowToOptions): HowTo {
  const screen = document.getElementById("howto-screen");
  const card = screen?.querySelector<HTMLElement>(".howto-card") ?? null;
  const closeButton = document.getElementById("btn-howto-close");
  if (!screen || !card || !closeButton) throw new Error("shape-shift-sprint: How to play panel is missing");

  const facts = howtoFacts();
  for (const node of screen.querySelectorAll<HTMLElement>("[data-fact]")) {
    const value = facts[node.dataset.fact ?? ""];
    if (value !== undefined) node.textContent = value;
  }
  const swatches = howtoSwatches();
  for (const node of screen.querySelectorAll<HTMLElement>("[data-swatch]")) {
    const value = swatches[node.dataset.swatch ?? ""];
    if (value !== undefined) node.style.setProperty("--sw", value);
  }
  for (const [i, c] of LOOK.shapes.entries()) screen.style.setProperty(`--c${i}`, c);

  let isOpen = false;
  let playOnClose = false;
  let returnFocus: HTMLElement | null = null;

  const focusables = (): HTMLElement[] =>
    [...screen.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null || n === document.activeElement);

  function open(play: boolean): void {
    if (isOpen) return;
    isOpen = true;
    playOnClose = play;
    closeButton!.textContent = play ? "GOT IT — PLAY" : "GOT IT";
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    screen!.classList.remove("hidden");
    card!.scrollTop = 0;
    card!.focus({ preventScroll: true });
  }

  function close(): void {
    if (!isOpen) return;
    isOpen = false;
    screen!.classList.add("hidden");
    const play = playOnClose;
    playOnClose = false;
    // Hand focus back to the opener if it is still on screen; otherwise to the game canvas.
    const back = returnFocus && returnFocus.isConnected && returnFocus.offsetParent !== null ? returnFocus : document.getElementById("app");
    returnFocus = null;
    back?.focus({ preventScroll: true });
    options.onClose(play);
  }

  closeButton.addEventListener("click", close);

  /* A key that closes the panel must not also activate the opener we hand focus back to on keyup. */
  let swallowKeyUp = false;
  const ACTIVATE = new Set(["Escape", "Enter", "NumpadEnter", "Space"]);
  addEventListener("keydown", (e) => {
    if (!isOpen) return;
    e.stopImmediatePropagation();
    if (ACTIVATE.has(e.code)) {
      e.preventDefault();
      if (!e.repeat) { swallowKeyUp = true; close(); }
      return;
    }
    if (e.key === "Tab") {
      const list = focusables();
      if (list.length === 0) { e.preventDefault(); card.focus(); return; }
      const first = list[0] as HTMLElement;
      const last = list[list.length - 1] as HTMLElement;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === card)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (active === last || !screen.contains(active))) { e.preventDefault(); first.focus(); }
    }
  }, true);
  addEventListener("keyup", (e) => {
    if (!swallowKeyUp || !ACTIVATE.has(e.code)) return;
    swallowKeyUp = false;
    e.preventDefault();
    e.stopImmediatePropagation();
  }, true);

  return {
    get isOpen() { return isOpen; },
    open,
    close
  };
}
