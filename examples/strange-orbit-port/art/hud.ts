/**
 * Craterline GP orbital telemetry cluster (`#hud.hud-gouache`):
 * unified 220-degree speed & stardust-boost SVG gauge with centered DIN Pro `km/h` readout,
 * Monument Grotesk Mono sector & split/gap telemetry, stardust/gravity status, and a 72x72
 * orbit-ring minimap with rider livery dots. Built once inside `#hud`; every update mutates
 * the DOM only when a displayed value changes. `?look=original` leaves it unmounted.
 */
import { COURSE_LENGTH } from "../course";
import { sectorAt, type SectorId } from "./look";

const SVG = "http://www.w3.org/2000/svg";
const SECTOR_LABEL: Readonly<Record<SectorId, string>> = {
  warm: "SEC 01 · TERRACOTTA",
  violet: "SEC 02 · VIOLET",
  jade: "SEC 03 · JADE",
  opal: "SEC 04 · OPAL"
};
const SECTOR_CHIP: Readonly<Record<SectorId, string>> = {
  warm: "#d98464",
  violet: "#9b88cf",
  jade: "#69bfb0",
  opal: "#d2c5d9"
};
/** Arc geometry: a 220-degree sweep, radius 34 px. */
const ARC = { r: 34, sweep: 220 } as const;

export interface OrbitHudInput {
  readonly s: number;
  readonly speedKmh: number;
  readonly energy: number;
  /** Metres to the rider ahead (null when leading or solo). */
  readonly gapAhead: number | null;
  readonly dust?: number;
  readonly gravityLabel?: string;
  readonly boosting?: boolean;
  readonly splitLabel?: string;
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
  root.classList.add("hud-gouache");

  const wrap = document.createElement("div");
  wrap.className = "gouache-hud hud-card";

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

  /* ---- 220-degree speed + stardust gauge with centered DIN Pro metric ---- */
  const gaugeWrap = document.createElement("div");
  gaugeWrap.className = "gouache-gauge";
  const gauge = svg(88, 88);
  const mk = (stroke: string, width: number, r: number): SVGPathElement => {
    const path = document.createElementNS(SVG, "path");
    path.setAttribute("d", arcPath(44, 46, r));
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", stroke);
    path.setAttribute("stroke-width", String(width));
    path.setAttribute("stroke-linecap", "round");
    gauge.appendChild(path);
    return path;
  };
  mk("rgba(238, 243, 250, 0.14)", 6, ARC.r);
  const speedArc = mk("#f3e6cb", 6, ARC.r);
  mk("rgba(238, 243, 250, 0.10)", 3.2, ARC.r - 7.5);
  const energyArc = mk("#ecb75f", 3.2, ARC.r - 7.5);

  const gaugeCenter = document.createElement("div");
  gaugeCenter.className = "gouache-gauge-readout";
  const speedNum = document.createElement("div");
  speedNum.className = "gouache-speed-num hud-metric";
  speedNum.textContent = "0";
  const speedUnit = document.createElement("div");
  speedUnit.className = "gouache-speed-unit";
  speedUnit.textContent = "km/h";
  gaugeCenter.append(speedNum, speedUnit);
  gaugeWrap.append(gauge, gaugeCenter);

  /* ---- Telemetry column (sector chip, split/gap, boost & gravity status) ---- */
  const chip = document.createElement("div");
  chip.className = "gouache-sector hud-mono";
  const chipDot = document.createElement("span");
  chipDot.className = "gouache-sector-dot";
  const chipText = document.createElement("span");
  chip.append(chipDot, chipText);

  const gap = document.createElement("div");
  gap.className = "gouache-gap hud-mono";

  const statusRow = document.createElement("div");
  statusRow.className = "gouache-status";
  const boostText = document.createElement("span");
  boostText.className = "gouache-boost hud-tnum";
  const gravText = document.createElement("span");
  gravText.className = "gouache-grav hud-tnum";
  statusRow.append(boostText, gravText);

  const column = document.createElement("div");
  column.className = "gouache-telemetry";
  column.append(chip, gap, statusRow);

  /* ---- 72x72 orbital ring minimap ---- */
  const map = svg(72, 72);
  map.classList.add("gouache-map");
  const ringBg = document.createElementNS(SVG, "circle");
  ringBg.setAttribute("cx", "36");
  ringBg.setAttribute("cy", "36");
  ringBg.setAttribute("r", "28.8");
  ringBg.setAttribute("fill", "rgba(7, 10, 19, 0.45)");
  ringBg.setAttribute("stroke", "rgba(238, 243, 250, 0.28)");
  ringBg.setAttribute("stroke-width", "2");
  map.appendChild(ringBg);
  for (const [tx, ty] of [[36, 5.2], [66.8, 36], [36, 66.8], [5.2, 36]] as const) {
    const tick = document.createElementNS(SVG, "circle");
    tick.setAttribute("cx", String(tx));
    tick.setAttribute("cy", String(ty));
    tick.setAttribute("r", "1.3");
    tick.setAttribute("fill", "rgba(238, 243, 250, 0.42)");
    map.appendChild(tick);
  }
  const dots: SVGCircleElement[] = [];

  wrap.append(column, gaugeWrap, map);
  root.appendChild(wrap);

  const last = { speed: "", speedText: "", energy: "", boostStroke: "", sector: "", gap: "", boost: "", grav: "", dots: "" };
  return {
    update(input) {
      const speed = arcDash(input.speedKmh / 160);
      if (speed !== last.speed) { speedArc.setAttribute("stroke-dasharray", speed); last.speed = speed; }
      const roundedSpeed = String(Math.round(input.speedKmh));
      if (roundedSpeed !== last.speedText) { speedNum.textContent = roundedSpeed; last.speedText = roundedSpeed; }

      const energy = arcDash(input.energy / 100);
      if (energy !== last.energy) { energyArc.setAttribute("stroke-dasharray", energy); last.energy = energy; }
      const boostStroke = input.boosting ? "#7fe0cf" : "#ecb75f";
      if (boostStroke !== last.boostStroke) { energyArc.setAttribute("stroke", boostStroke); last.boostStroke = boostStroke; }

      const sector = sectorAt(input.s);
      if (sector !== last.sector) {
        chipText.textContent = SECTOR_LABEL[sector];
        chipDot.style.background = SECTOR_CHIP[sector];
        last.sector = sector;
      }

      const gBase = gapLabel(input.gapAhead);
      const g = input.splitLabel ? `${gBase} · ${input.splitLabel}` : gBase;
      if (g !== last.gap) { gap.textContent = g; last.gap = g; }

      const boostLabel = `Boost ${Math.round(input.energy)}%${input.dust !== undefined ? ` · Dust ${input.dust}` : ""}`;
      if (boostLabel !== last.boost) { boostText.textContent = boostLabel; last.boost = boostLabel; }

      const gravLabel = input.gravityLabel ?? "";
      if (gravLabel !== last.grav) { gravText.textContent = gravLabel; last.grav = gravLabel; }

      while (dots.length < input.riders.length) {
        const dot = document.createElementNS(SVG, "circle");
        dot.setAttribute("r", "3");
        dot.setAttribute("stroke", "rgba(7, 10, 19, 0.85)");
        dot.setAttribute("stroke-width", "1");
        map.appendChild(dot);
        dots.push(dot);
      }
      const key = input.riders.map((r) => `${Math.round(ringPoint(r.s).x * 72)},${Math.round(ringPoint(r.s).y * 72)},${r.color}`).join(";");
      if (key === last.dots) return;
      last.dots = key;
      input.riders.forEach((r, i) => {
        const p = ringPoint(r.s);
        const dot = dots[i]!;
        dot.setAttribute("cx", (p.x * 72).toFixed(1));
        dot.setAttribute("cy", (p.y * 72).toFixed(1));
        dot.setAttribute("fill", r.color);
        dot.setAttribute("r", r.you ? "4.2" : "3");
      });
    }
  };
}
