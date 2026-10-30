/**
 * GU47 WP-28 GC-H1: the dispatch HUD of the shift look (paper ticket card, DELIVERED stamp, analog speed dial and a
 * district-tinted minimap). Pure helpers plus two small DOM writers; `?look=original` never calls them, so the
 * 4.6.1 HUD stays as it was. Fonts come from `/fonts/local.css` only (Graphik Web, TT Commons Pro Mono).
 */
import { BLOCK_HALF, type Block, type District } from "./world";
import { COURIER_TEAL } from "./fx";

/** District paper tints on the minimap (the facade palette of GC-M2; courier teal stays reserved for car and drop-off). */
export const DISTRICT_TINT: Readonly<Record<District, string>> = {
  core: "rgba(183,205,212,.62)", // sea-glass towers
  midtown: "rgba(239,227,207,.5)", // cream
  commerce: "rgba(217,118,95,.55)", // terracotta harbour side
  residential: "rgba(159,216,196,.52)", // mint old town
  outskirts: "rgba(240,196,162,.42)" // apricot
};
export const PARK_TINT = "rgba(126,170,104,.55)";

export interface MinimapRectLayer {
  readonly kind: "rect";
  readonly rect: [number, number, number, number];
  readonly fill: string;
}

/** One rect layer per block (built once; the minimap redraws them every HUD tick without allocating). */
export function districtLayers(blocks: readonly Block[]): MinimapRectLayer[] {
  return blocks.map((b) => ({
    kind: "rect" as const,
    rect: [b.x - BLOCK_HALF, b.z - BLOCK_HALF, b.x + BLOCK_HALF, b.z + BLOCK_HALF] as [number, number, number, number],
    fill: b.park ? PARK_TINT : DISTRICT_TINT[b.district]
  }));
}

/** Dial sweep: 0 km/h at -225 deg, DIAL_MAX at +45 deg (a 270 deg arc opening downward), clamped. */
export const DIAL_MAX = 200;
export const DIAL_START = (-225 * Math.PI) / 180;
export const DIAL_SWEEP = (270 * Math.PI) / 180;
export function dialAngle(kmh: number): number {
  const t = Math.max(0, Math.min(1, kmh / DIAL_MAX));
  return DIAL_START + t * DIAL_SWEEP;
}

export interface DialContext {
  clearRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  arc(x: number, y: number, r: number, a0: number, a1: number): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  fill(): void;
  lineWidth: number;
  lineCap: CanvasLineCap;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  fillStyle: string | CanvasGradient | CanvasPattern;
}

/** Analog dial: cream ticks every 20 km/h, a nitro arc in sodium, a courier-teal needle. */
export function drawDial(ctx: DialContext, size: number, kmh: number, boost: number): void {
  const c = size / 2;
  const r = c - 6;
  ctx.clearRect(0, 0, size, size);
  ctx.lineCap = "round";
  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(38,30,26,.62)";
  ctx.beginPath();
  ctx.arc(c, c, r, DIAL_START, DIAL_START + DIAL_SWEEP);
  ctx.stroke();
  const b = Math.max(0, Math.min(1, boost));
  if (b > 0) {
    ctx.strokeStyle = b < 0.22 ? "#ff3b3b" : "#ffb347";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(c, c, r + 1, DIAL_START, DIAL_START + DIAL_SWEEP * b);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(239,227,207,.9)";
  for (let v = 0; v <= DIAL_MAX; v += 20) {
    const a = dialAngle(v);
    const inner = v % 100 === 0 ? r - 14 : r - 9;
    ctx.lineWidth = v % 100 === 0 ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * inner, c + Math.sin(a) * inner);
    ctx.lineTo(c + Math.cos(a) * (r - 3), c + Math.sin(a) * (r - 3));
    ctx.stroke();
  }
  const a = dialAngle(kmh);
  ctx.strokeStyle = COURIER_TEAL;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(c - Math.cos(a) * 8, c - Math.sin(a) * 8);
  ctx.lineTo(c + Math.cos(a) * (r - 10), c + Math.sin(a) * (r - 10));
  ctx.stroke();
  ctx.fillStyle = "#efe3cf";
  ctx.beginPath();
  ctx.arc(c, c, 5, 0, Math.PI * 2);
  ctx.fill();
}

/** Ticket card text: the job number (deliveries + misses + 1, read only), the distance and the job clock. */
export function ticketText(jobNumber: number, metres: number, clock: string): string {
  return `TICKET ${String(jobNumber).padStart(2, "0")}\n${Math.round(metres)} m   ${clock}`;
}

/** Restarts the stamp animation on `el` (reflow between the class flips); reduced motion is CSS-only (fade, no slam). */
export function slamStamp(el: HTMLElement, text: string): void {
  el.textContent = text;
  el.classList.remove("on");
  void el.offsetWidth;
  el.classList.add("on");
}
