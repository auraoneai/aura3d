/**
 * GU47 WP-11 TT-H1: World Tour broadcast additions to the scorebug. A venue chip (city code on the venue accent) in the
 * scoreboard's top line with the set label, and a serve-speed strip ("1ST SERVE  176 KM/H") that slides over the
 * scorebug's footer for 2.6 s after every serve. Both live inside the scorebug box, so the HUD area does not grow and
 * stays in the top-left column, clear of the athletes (the TT-C1 frame keeps the far athlete inside the middle half of
 * the canvas width); they use the page's licensed faces (Graphik text, DIN Pro numerals, ui/styles.css). `?look=original`
 * does not create them.
 * Presentation only: reads `lastStroke`, `lastShotSpeed`, `server`, `serveNumber` and the score.
 */
import type { HudState } from "./types";
import { themeFor } from "./venues";

/** How long the serve-speed strip stays up (ms). */
export const SERVE_STRIP_MS = 2600;

export interface ServeStripState { readonly lastStroke?: string; readonly lastShotSpeed?: number; readonly server?: string; readonly serveNumber?: number; readonly mode?: string }

export interface ServeStripView { readonly visible: boolean; readonly label: string; readonly speed: string; readonly side: string | null }

/** Remembers the last serve seen so a new one (a serve stroke with a new speed or server) restarts the strip. */
export interface ServeStripMemo { key: string; shownAt: number; label: string; speed: string; side: string | null }

export const createServeStripMemo = (): ServeStripMemo => ({ key: "", shownAt: Number.NEGATIVE_INFINITY, label: "", speed: "", side: null });

/** The strip for this frame (`nowMs` from performance.now or a test clock). */
export function serveStripView(state: Readonly<ServeStripState>, memo: ServeStripMemo, nowMs: number): ServeStripView {
  const speed = Math.round(Number(state.lastShotSpeed ?? 0));
  if (state.mode === "menu") { memo.key = ""; memo.shownAt = Number.NEGATIVE_INFINITY; }
  else if (state.lastStroke === "serve" && speed > 0) {
    const key = `${state.server ?? ""}:${state.serveNumber ?? 1}:${speed}`;
    if (key !== memo.key) {
      memo.key = key;
      memo.shownAt = nowMs;
      memo.label = (state.serveNumber ?? 1) === 2 ? "2ND SERVE" : "1ST SERVE";
      memo.speed = `${speed} KM/H`;
      memo.side = state.server ?? null;
    }
  } else if (state.lastStroke !== "serve") memo.key = "";
  const visible = nowMs - memo.shownAt < SERVE_STRIP_MS;
  return { visible, label: memo.label, speed: memo.speed, side: visible ? memo.side : null };
}

export interface VenueChipView { readonly text: string; readonly accent: string; readonly setLabel: string }

export function venueChipView(state: Readonly<Pick<HudState, "venue">>): VenueChipView {
  const theme = themeFor(state.venue);
  return { text: theme.short, accent: theme.accent, setLabel: "SET 1" };
}

export interface BroadcastHud { render(state: HudState, nowMs?: number): void; readonly strip: ServeStripView | null }

/** Builds the chip and strip under `#scoreboard` (no-op without a DOM). */
export function createBroadcastHud(doc: Document | null | undefined = typeof document !== "undefined" ? document : null): BroadcastHud {
  const board = doc?.getElementById("scoreboard");
  const topline = board?.querySelector(".scoreboard-topline");
  if (!doc || !board || !topline) return { render() {}, strip: null };
  const chip = doc.createElement("span");
  chip.className = "slam-venue-chip";
  chip.setAttribute("aria-hidden", "true");
  const set = doc.createElement("span");
  set.className = "slam-set-label";
  set.setAttribute("aria-hidden", "true");
  topline.insertBefore(set, topline.lastElementChild);
  topline.insertBefore(chip, set);
  const strip = doc.createElement("div");
  strip.className = "slam-serve-strip";
  strip.setAttribute("role", "status");
  strip.setAttribute("aria-live", "polite");
  const stripLabel = doc.createElement("span");
  stripLabel.className = "slam-serve-strip-label";
  const stripSpeed = doc.createElement("b");
  stripSpeed.className = "slam-serve-strip-speed";
  strip.append(stripLabel, stripSpeed);
  board.appendChild(strip);
  const memo = createServeStripMemo();
  let last: ServeStripView | null = null;
  let chipText = "";
  return {
    get strip() { return last; },
    render(state, nowMs = typeof performance !== "undefined" ? performance.now() : Date.now()) {
      const c = venueChipView(state);
      if (c.text !== chipText) {
        chipText = c.text;
        chip.textContent = c.text;
        chip.style.setProperty("--slam-venue-accent", c.accent);
        set.textContent = c.setLabel;
      }
      const v = serveStripView(state as unknown as ServeStripState, memo, nowMs);
      if (!last || v.visible !== last.visible || v.speed !== last.speed || v.label !== last.label) {
        strip.classList.toggle("shown", v.visible);
        strip.dataset.side = v.side ?? "";
        stripLabel.textContent = v.label;
        stripSpeed.textContent = v.speed;
      }
      last = v;
    }
  };
}
