/**
 * GU47 WP-12 AO-H2: the motorsport cluster of the Apex Overdrive HUD, in the identity palette: an arc speedometer (240-degree
 * sweep, cobalt to cyan to tangerine), an AIR ladder of eight rungs (cyan, tangerine when low), and five single-colour glyphs
 * (air, rocket, shield, magnet, multiplier) drawn inline as simple geometric SVG paths (original, no icon font, no file to
 * load; a WP-36 icon set can replace them key by key). Presentation only: the HUD reads the run's numbers and never writes.
 */

/** Full scale of the speedometer (km/h): 64 m/s cruise is 230 km/h, a rocket runs past it. */
export const SPEEDO_MAX_KMH = 300;
/** AIR ladder rungs. */
export const AIR_RUNGS = 8;
/** At or below this air fraction the ladder turns tangerine (and pulses unless reduced motion). */
export const AIR_LOW = 0.2;

/** Speedometer arc in a 100 x 80 viewBox: centre (50, 52), radius 40, from 210 deg round the top to -30 deg. */
export const SPEEDO_ARC = { cx: 50, cy: 52, r: 40, startDeg: 210, endDeg: -30 } as const;

const round2 = (v: number): number => Math.round(v * 100) / 100;

/** A point on the arc at `deg` (maths convention, SVG y down). */
export function arcPoint(deg: number): [number, number] {
  const t = (deg * Math.PI) / 180;
  return [round2(SPEEDO_ARC.cx + SPEEDO_ARC.r * Math.cos(t)), round2(SPEEDO_ARC.cy - SPEEDO_ARC.r * Math.sin(t))];
}

/** The SVG path of the whole sweep (draw it with `pathLength="100"` so a dash of N is N percent of full scale). */
export function speedoArcPath(): string {
  const [x0, y0] = arcPoint(SPEEDO_ARC.startDeg);
  const [x1, y1] = arcPoint(SPEEDO_ARC.endDeg);
  return `M ${x0} ${y0} A ${SPEEDO_ARC.r} ${SPEEDO_ARC.r} 0 1 1 ${x1} ${y1}`;
}

/** Share of full scale (0..100, one decimal) for a speed in km/h. */
export function speedoPercent(kmh: number): number {
  if (!Number.isFinite(kmh) || kmh <= 0) return 0;
  return Math.round(Math.min(1, kmh / SPEEDO_MAX_KMH) * 1000) / 10;
}

/** Lit rungs for an air fraction (0..1): a sliver of air still lights the first rung. */
export function airRungsLit(air: number): number {
  if (!Number.isFinite(air) || air <= 0) return 0;
  return Math.max(1, Math.min(AIR_RUNGS, Math.round(Math.min(1, air) * AIR_RUNGS)));
}

export type HudIconKey = "air" | "rocket" | "shield" | "magnet" | "multiplier";

const svg = (body: string): string =>
  `<svg class="rr-glyph" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">${body}</svg>`;

/** The five glyphs (fill/stroke `currentColor`, so the CSS colours them). */
export const HUD_ICONS: Readonly<Record<HudIconKey, string>> = {
  air: svg(`<path fill="currentColor" d="M8 1.5 13 7H9.6v7.5H6.4V7H3z"/>`),
  rocket: svg(`<path fill="currentColor" d="M8 1c2.6 1.9 3.7 4.7 3.4 8.3L13 11.2V14l-2.7-1.4H5.7L3 14v-2.8l1.6-1.9C4.3 5.7 5.4 2.9 8 1Zm0 4.2a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Z"/>`),
  shield: svg(`<path fill="currentColor" d="M8 1.2 14 3.4v4.2c0 3.5-2.4 6-6 7.3-3.6-1.3-6-3.8-6-7.3V3.4Z"/>`),
  magnet: svg(`<path fill="currentColor" d="M2.5 2h3.3v6a2.2 2.2 0 0 0 4.4 0V2h3.3v6A5.5 5.5 0 0 1 2.5 8Z"/>`),
  multiplier: svg(`<path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="m3.8 3.8 8.4 8.4m0-8.4-8.4 8.4"/>`)
};

/** The cluster markup (speedometer + AIR ladder) the HUD mounts in its score card. */
export function clusterMarkup(): string {
  const arc = speedoArcPath();
  const rungs = Array.from({ length: AIR_RUNGS }, () => `<i class="rr-rung"></i>`).join("");
  return `<div class="rr-cluster">
    <div class="rr-gauge">
      <svg class="rr-gauge-svg" viewBox="0 0 100 80" aria-hidden="true" focusable="false">
        <defs><linearGradient id="rr-speedo-grad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1f3fa8"/><stop offset="0.55" stop-color="#4df0ff"/><stop offset="1" stop-color="#ff8a3d"/></linearGradient></defs>
        <path class="rr-gauge-track" d="${arc}" pathLength="100"/>
        <path class="rr-gauge-value" d="${arc}" pathLength="100" stroke="url(#rr-speedo-grad)"/>
      </svg>
      <b class="rr-speed">0</b><span class="rr-micro rr-gauge-unit">km/h</span>
    </div>
    <div class="rr-air rr-ladder"><span class="rr-micro rr-ladder-label">${HUD_ICONS.air}Air</span><div class="rr-rungs">${rungs}</div></div>
  </div>`;
}
