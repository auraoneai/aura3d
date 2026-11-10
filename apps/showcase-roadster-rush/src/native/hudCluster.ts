/**
 * GU47 WP-12 AO-H2 / WP-06: the motorsport telemetry cluster of the Apex Overdrive HUD, in the identity palette: an arc
 * speedometer (240-degree sweep, cobalt to cyan to tangerine), live RPM / GEAR / RUN-TIME digital telemetry in DIN Pro,
 * an AIR ladder of eight rungs (cyan, tangerine when low), and crisp single-colour geometric SVG glyphs (original inline
 * vector paths, no icon font). Presentation only: the HUD reads the run's numbers and never writes.
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

/** Synthetic 6-speed powertrain telemetry derived strictly from read-only km/h (presentation only). */
export function engineTelemetry(kmh: number): { readonly gear: number; readonly rpm: number } {
  const clamped = Math.max(0, Number.isFinite(kmh) ? kmh : 0);
  if (clamped < 2) return { gear: 1, rpm: 1150 };
  const bands = [0, 52, 98, 146, 196, 248, 320] as const;
  let gear = 6;
  for (let g = 1; g <= 6; g++) {
    if (clamped <= bands[g]!) {
      gear = g;
      break;
    }
  }
  const lo = bands[gear - 1]!;
  const hi = bands[gear]!;
  const frac = Math.max(0, Math.min(1, (clamped - lo) / Math.max(1, hi - lo)));
  const rpm = Math.round((3400 + frac * 5200) / 50) * 50;
  return { gear, rpm };
}

/** Compact run timer `MM:SS.d` for standalone DIN Pro metric display. */
export function formatRunClock(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const tenths = Math.floor((safe - Math.floor(safe)) * 10);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${tenths}`;
}

export type HudIconKey = "air" | "rocket" | "shield" | "magnet" | "multiplier";

const svg = (body: string): string =>
  `<svg class="rr-glyph" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">${body}</svg>`;

/** The five power-up / ladder glyphs (fill/stroke `currentColor`, so the CSS colours them). */
export const HUD_ICONS: Readonly<Record<HudIconKey, string>> = {
  air: svg(`<path fill="currentColor" d="M8 1.5 13 7H9.6v7.5H6.4V7H3z"/>`),
  rocket: svg(`<path fill="currentColor" d="M8 1c2.6 1.9 3.7 4.7 3.4 8.3L13 11.2V14l-2.7-1.4H5.7L3 14v-2.8l1.6-1.9C4.3 5.7 5.4 2.9 8 1Zm0 4.2a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6Z"/>`),
  shield: svg(`<path fill="currentColor" d="M8 1.2 14 3.4v4.2c0 3.5-2.4 6-6 7.3-3.6-1.3-6-3.8-6-7.3V3.4Z"/>`),
  magnet: svg(`<path fill="currentColor" d="M2.5 2h3.3v6a2.2 2.2 0 0 0 4.4 0V2h3.3v6A5.5 5.5 0 0 1 2.5 8Z"/>`),
  multiplier: svg(`<path fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" d="m3.8 3.8 8.4 8.4m0-8.4-8.4 8.4"/>`)
};

/** Crisp inline vector icons for top-right utility controls and 390x844 thumb controls. */
export const CONTROL_ICONS = {
  pause: svg(`<path fill="currentColor" d="M4.2 3h2.6v10H4.2zm5 0h2.6v10H9.2z"/>`),
  soundOn: svg(`<path fill="currentColor" d="M2.5 6h2.8l3.5-3v10l-3.5-3H2.5z"/><path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" d="M11.2 5.4a3.8 3.8 0 0 1 0 5.2M13 3.6a6.4 6.4 0 0 1 0 8.8"/>`),
  soundOff: svg(`<path fill="currentColor" d="M2.5 6h2.8l3.5-3v10l-3.5-3H2.5z"/><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" d="m11 5.5 3.6 5m0-5-3.6 5"/>`),
  steerLeft: svg(`<path fill="currentColor" d="M10.8 2.8 4.6 8l6.2 5.2V2.8z"/>`),
  steerRight: svg(`<path fill="currentColor" d="M5.2 2.8 11.4 8l-6.2 5.2V2.8z"/>`),
  rollLeft: svg(`<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M12.5 9.2A4.8 4.8 0 1 0 6.2 13M3.5 4.2v3.6h3.6"/>`),
  rollRight: svg(`<path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M3.5 9.2A4.8 4.8 0 1 1 9.8 13M12.5 4.2v3.6H8.9"/>`),
  boost: svg(`<path fill="currentColor" d="M9.4 1.5 3.6 9h3.8l-0.8 5.5L12.4 7H8.6z"/>`),
  dive: svg(`<path fill="currentColor" d="M8 14.5 3 9h3.4V1.5h3.2V9H13z"/>`),
  fly: svg(`<path fill="currentColor" d="M8 1.5 13 7H9.6v7.5H6.4V7H3z"/>`)
} as const;

/** The cluster markup (speedometer + RPM/Gear/Clock telemetry + AIR ladder) the HUD mounts in its score card. */
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
    <div class="rr-air rr-ladder"><span class="rr-micro rr-ladder-label">${HUD_ICONS.air}air</span><div class="rr-rungs">${rungs}</div></div>
    <div class="rr-telemetry">
      <div class="rr-tele-cell"><span class="rr-micro">gear</span><b class="rr-gear-val">1</b></div>
      <div class="rr-tele-cell"><span class="rr-micro">rpm</span><b class="rr-rpm-val">1,150</b></div>
      <div class="rr-tele-cell"><span class="rr-micro">run</span><b class="rr-time-val">00:00.0</b></div>
    </div>
  </div>`;
}
