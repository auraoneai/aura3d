/**
 * GU47 SO47-H1 (lane g15): gouache HUD additions for Craterline GP: a curved speed/energy arc, the painted-sector chip,
 * the gap to the car ahead, and an orbit-ring minimap with a livery dot per rider. Built once inside `#hud`; every
 * update writes the DOM only when a shown value changes. The original look (`?look=original`) does not mount it.
 * Fonts: the page's licensed Graphik Web (inherited).
 */
import { COURSE_LENGTH } from "../course";
import { sectorAt, type SectorId } from "./look";

const SVG = "http://www.w3.org/2000/svg";
const SECTOR_LABEL: Readonly<Record<SectorId, string>> = { warm: "Terracotta", violet: "Violet", jade: "Jade", opal: "Opal" };
const SECTOR_CHIP: Readonly<Record<SectorId, string>> = { warm: "#d98464", violet: "#8471b3", jade: "#69bfb0", opal: "#d2c5d9" };
/** Arc geometry: a 220-degree sweep, radius 34 px. */
const ARC = { r: 34, sweep: 220 } as const;

export interface OrbitHudInput {
  readonly s: number;
  readonly speedKmh: number;
  readonly energy: number;
  /** Metres to the rider ahead (null when leading or solo). */
  readonly gapAhead: number | null;
  readonly riders: readonly { readonly s: number; readonly color: string; readonly you: boolean }[];
}

/** Arc dash for a 0..1 fill (exported for the unit test). */
export function arcDash(fill: number): string {
  const length = (Math.PI * 2 * ARC.r * ARC.sweep) / 360;
  const on = Math.max(0, Math.min(1, fill)) * length;
  return `${on.toFixed(1)} ${(length * 2).toFixed(1)}`;
}

/** Minimap position (0..1 box) of a rider at course distance `s`: the orbit ring read clockwise from the top. */
export function ringPoint(s: number): { x: number; y: number } {
  const a = ((((s % COURSE_LENGTH) + COURSE_LENGTH) % COURSE_LENGTH) / COURSE_LENGTH) * Math.PI * 2;
  return { x: 0.5 + Math.sin(a) * 0.4, y: 0.5 - Math.cos(a) * 0.4 };
}

export function gapLabel(gap: number | null): string {
  return gap === null ? "Leading" : `+${Math.round(gap)} m to next`;
}

export function mountOrbitHud(root: HTMLElement): { update(input: OrbitHudInput): void } {
  const wrap = document.createElement("div");
  wrap.className = "gouache-hud";
  Object.assign(wrap.style, { position: "absolute", right: "max(12px, env(safe-area-inset-right))", bottom: "64px", display: "flex", gap: "10px", alignItems: "flex-end", pointerEvents: "none" });
  // GU47 phase 3 (SO47-H1 overlap at 390x844): on narrow screens the touch buttons own the bottom right, so the gauge
  // and the sector chip move to the top left, under the pause row and beside the standings (the toast owns mid-screen).
  const narrow = typeof matchMedia === "function" ? matchMedia("(max-width: 600px)") : null;
  const place = (): void => {
    const n = Boolean(narrow?.matches);
    Object.assign(wrap.style, n
      ? { right: "auto", left: "max(12px, env(safe-area-inset-left))", bottom: "auto", top: "190px" }
      : { left: "auto", top: "auto", right: "max(12px, env(safe-area-inset-right))", bottom: "64px" });
  };
  place();
  narrow?.addEventListener?.("change", place);

  const svg = (w: number, h: number): SVGSVGElement => {
    const el = document.createElementNS(SVG, "svg");
    el.setAttribute("width", String(w));
    el.setAttribute("height", String(h));
    el.setAttribute("viewBox", `0 0 ${w} ${h}`);
    el.setAttribute("aria-hidden", "true");
    return el;
  };
  const arcPath = (cx: number, cy: number, r: number): string => {
    const start = (90 + (360 - ARC.sweep) / 2) * (Math.PI / 180);
    const end = start + ARC.sweep * (Math.PI / 180);
    const p = (a: number) => `${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`;
    return `M ${p(start)} A ${r} ${r} 0 1 1 ${p(end)}`;
  };
  const gauge = svg(84, 84);
  const mk = (stroke: string, width: number, r: number): SVGPathElement => {
    const path = document.createElementNS(SVG, "path");
    path.setAttribute("d", arcPath(42, 44, r));
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", stroke);
    path.setAttribute("stroke-width", String(width));
    path.setAttribute("stroke-linecap", "round");
    gauge.appendChild(path);
    return path;
  };
  mk("rgba(243,221,175,0.18)", 6, ARC.r);
  const speedArc = mk("#f3ddaf", 6, ARC.r);
  const energyArc = mk("#ecb75f", 3, ARC.r - 7);
  energyArc.setAttribute("d", arcPath(42, 44, ARC.r - 7));

  const chip = document.createElement("div");
  Object.assign(chip.style, { font: "500 12px/1 'Graphik Web', sans-serif", padding: "5px 8px", borderRadius: "10px", color: "#1b1622", minWidth: "64px", textAlign: "center" });
  const gap = document.createElement("div");
  gap.className = "meta num";
  const column = document.createElement("div");
  Object.assign(column.style, { display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-end" });
  column.append(chip, gap);

  const map = svg(72, 72);
  const ring = document.createElementNS(SVG, "circle");
  ring.setAttribute("cx", "36"); ring.setAttribute("cy", "36"); ring.setAttribute("r", "28.8");
  ring.setAttribute("fill", "none"); ring.setAttribute("stroke", "rgba(243,221,175,0.35)"); ring.setAttribute("stroke-width", "2");
  map.appendChild(ring);
  const dots: SVGCircleElement[] = [];

  wrap.append(column, gauge, map);
  root.appendChild(wrap);

  const last = { speed: "", energy: "", sector: "", gap: "", dots: "" };
  return {
    update(input) {
      const speed = arcDash(input.speedKmh / 160);
      if (speed !== last.speed) { speedArc.setAttribute("stroke-dasharray", speed); last.speed = speed; }
      const energy = arcDash(input.energy / 100);
      if (energy !== last.energy) { energyArc.setAttribute("stroke-dasharray", energy); last.energy = energy; }
      const sector = sectorAt(input.s);
      if (sector !== last.sector) { chip.textContent = SECTOR_LABEL[sector]; chip.style.background = SECTOR_CHIP[sector]; last.sector = sector; }
      const g = gapLabel(input.gapAhead);
      if (g !== last.gap) { gap.textContent = g; last.gap = g; }
      while (dots.length < input.riders.length) {
        const dot = document.createElementNS(SVG, "circle");
        dot.setAttribute("r", "3");
        map.appendChild(dot);
        dots.push(dot);
      }
      const key = input.riders.map((r) => `${Math.round(ringPoint(r.s).x * 72)},${Math.round(ringPoint(r.s).y * 72)}`).join(";");
      if (key === last.dots) return;
      last.dots = key;
      input.riders.forEach((r, i) => {
        const p = ringPoint(r.s);
        const dot = dots[i]!;
        dot.setAttribute("cx", (p.x * 72).toFixed(1));
        dot.setAttribute("cy", (p.y * 72).toFixed(1));
        dot.setAttribute("fill", r.color);
        dot.setAttribute("r", r.you ? "4" : "3");
      });
    }
  };
}
