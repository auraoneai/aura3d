/**
 * Drift & Deliver port: procedural canvas textures (this port's own art, painted in code).
 *
 * Everything draws through a plain 2D context so the layout is testable with a recording stub. The road tile is
 * one 60 m city tile (block centred, streets on the borders, so it repeats seamlessly); facades are 8 x 8 cell
 * tiles where one cell is a 3.2 m bay by a 3.1 m floor.
 */
import { createCountedRng } from "@aura3d/engine";

export type Ctx2D = Pick<
  CanvasRenderingContext2D,
  "fillRect" | "strokeRect" | "beginPath" | "moveTo" | "lineTo" | "closePath" | "fill" | "stroke" | "save" | "restore" | "translate" | "rotate" | "arc" | "ellipse" | "createLinearGradient" | "createRadialGradient" | "setLineDash"
> & { fillStyle: string | CanvasGradient | CanvasPattern; strokeStyle: string | CanvasGradient | CanvasPattern; lineWidth: number; globalAlpha: number };

export const TILE_M = 60;
/** Half width of the asphalt, then of asphalt + sidewalk, measured from a street centre line. */
export const ASPHALT_HALF = 5.5;
export const KERB_HALF = 8.5;
export const CELLS = 8;
export const BAY_M = 3.2;
export const FLOOR_M = 3.1;
export const SHOP_H = 4.4;

export function rng(seed: number): () => number {
  const rng = createCountedRng(seed);
  return () => rng.next();
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number): number => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

/* ------------------------------------------------------------------ road tile */

export interface RoadTileLayout {
  readonly stripes: number;
  readonly dashes: number;
}

/** One city tile: streets on the borders (so four copies meet at an intersection), a paved block in the middle. */
export function paintRoadTile(g: Ctx2D, px: number): RoadTileLayout {
  const S = px / TILE_M;
  const r = rng(0x51d0);
  const m = (v: number): number => v * S;
  const rect = (x: number, y: number, w: number, h: number, color: string, alpha = 1): void => {
    g.globalAlpha = alpha;
    g.fillStyle = color;
    g.fillRect(m(x), m(y), m(w), m(h));
    g.globalAlpha = 1;
  };

  rect(0, 0, TILE_M, TILE_M, "#b3a58a");
  // sidewalks: two bands beside each border street, with paving joints
  for (const c of [0, TILE_M]) {
    rect(0, c - KERB_HALF, TILE_M, KERB_HALF - ASPHALT_HALF, "#d0bf9d");
    rect(0, c + ASPHALT_HALF, TILE_M, KERB_HALF - ASPHALT_HALF, "#d0bf9d");
    rect(c - KERB_HALF, 0, KERB_HALF - ASPHALT_HALF, TILE_M, "#d0bf9d");
    rect(c + ASPHALT_HALF, 0, KERB_HALF - ASPHALT_HALF, TILE_M, "#d0bf9d");
    for (let t = 0; t < TILE_M; t += 2) {
      rect(t, c - KERB_HALF, 0.05, KERB_HALF - ASPHALT_HALF, "#9c8b6e", 0.55);
      rect(t, c + ASPHALT_HALF, 0.05, KERB_HALF - ASPHALT_HALF, "#9c8b6e", 0.55);
      rect(c - KERB_HALF, t, KERB_HALF - ASPHALT_HALF, 0.05, "#9c8b6e", 0.55);
      rect(c + ASPHALT_HALF, t, KERB_HALF - ASPHALT_HALF, 0.05, "#9c8b6e", 0.55);
    }
  }
  // paving of the block interior (a faint 2 m grid)
  for (let t = 8.5; t < 51.5; t += 2) {
    rect(t, 8.5, 0.04, 43, "#8d826c", 0.35);
    rect(8.5, t, 43, 0.04, "#8d826c", 0.35);
  }
  // asphalt, drawn over the sidewalks so the intersections cut cleanly
  for (const c of [0, TILE_M]) {
    rect(0, c - ASPHALT_HALF, TILE_M, 2 * ASPHALT_HALF, "#74675e");
    rect(c - ASPHALT_HALF, 0, 2 * ASPHALT_HALF, TILE_M, "#74675e");
  }
  // kerb edge: a light lip and a dark gutter
  for (const c of [0, TILE_M]) {
    for (const s of [-1, 1]) {
      const edge = c + s * ASPHALT_HALF;
      rect(0, s > 0 ? edge : edge - 0.28, TILE_M, 0.28, "#ecdfc3");
      rect(0, s > 0 ? edge - 0.35 : edge + 0.0, TILE_M, 0.35, "#3f3a3e", 0.7);
      rect(s > 0 ? edge : edge - 0.28, 0, 0.28, TILE_M, "#ecdfc3");
      rect(s > 0 ? edge - 0.35 : edge, 0, 0.35, TILE_M, "#3f3a3e", 0.7);
    }
  }
  // the intersection squares are repainted flat so the kerb lips do not cross them
  for (const cx of [0, TILE_M]) for (const cz of [0, TILE_M]) rect(cx - ASPHALT_HALF, cz - ASPHALT_HALF, 2 * ASPHALT_HALF, 2 * ASPHALT_HALF, "#74675e");

  // tyre wear: two darker tracks per lane, away from the intersections
  for (const c of [0, TILE_M]) {
    for (const lane of [-2.8, 2.8]) {
      for (const off of [-0.8, 0.8]) {
        rect(ASPHALT_HALF + 4, c + lane + off - 0.25, TILE_M - 2 * (ASPHALT_HALF + 4), 0.5, "#3a3438", 0.32);
        rect(c + lane + off - 0.25, ASPHALT_HALF + 4, 0.5, TILE_M - 2 * (ASPHALT_HALF + 4), "#3a3438", 0.32);
      }
    }
  }
  // asphalt grain and patches
  for (let i = 0; i < 9000; i++) {
    const x = r() * TILE_M;
    const y = r() * TILE_M;
    const v = r();
    rect(x, y, 0.12, 0.12, v > 0.5 ? "#7a737a" : "#2f2a2f", 0.16);
  }
  for (let i = 0; i < 70; i++) {
    const c = r() > 0.5 ? TILE_M : 0;
    const along = ASPHALT_HALF + 2 + r() * (TILE_M - 2 * ASPHALT_HALF - 4);
    const across = (r() - 0.5) * 9;
    const w = 0.8 + r() * 2.2;
    const h = 0.6 + r() * 1.6;
    if (r() > 0.5) rect(along, c + across, w, h, "#4a444a", 0.45);
    else rect(c + across, along, h, w, "#4a444a", 0.45);
  }

  return paintLaneMarkings(g, px);
}

/**
 * The lane paint of the road tile: centre dashes, edge lines, crosswalks, stop lines, yellow boxes and lane arrows.
 * `paintRoadTile` calls it last; the shift look calls it again after its wet multiply pass (GU47 phase 2: the wet
 * pass dimmed the white paint to 43% grey, so the street lost its lines against the 4.6.2 frame).
 */
export function paintLaneMarkings(g: Ctx2D, px: number): RoadTileLayout {
  const S = px / TILE_M;
  const m = (v: number): number => v * S;
  const rect = (x: number, y: number, w: number, h: number, color: string, alpha = 1): void => {
    g.globalAlpha = alpha;
    g.fillStyle = color;
    g.fillRect(m(x), m(y), m(w), m(h));
    g.globalAlpha = 1;
  };
  let stripes = 0;
  let dashes = 0;
  const white = "#efeadc";
  const yellow = "#e6b23a";
  for (const c of [0, TILE_M]) {
    // centre dashes + edge lines between the stop lines
    for (let t = 14; t < TILE_M - 14; t += 6) {
      rect(t, c - 0.17, 3.4, 0.34, yellow);
      rect(c - 0.17, t, 0.34, 3.4, yellow);
      dashes += 2;
    }
    rect(14, c - 5, TILE_M - 28, 0.24, white, 0.92);
    rect(14, c + 4.76, TILE_M - 28, 0.24, white, 0.92);
    rect(c - 5, 14, 0.24, TILE_M - 28, white, 0.92);
    rect(c + 4.76, 14, 0.24, TILE_M - 28, white, 0.92);
  }
  // crosswalks and stop lines on all four arms of each intersection
  for (const cx of [0, TILE_M]) {
    for (const cz of [0, TILE_M]) {
      for (const sgn of [-1, 1]) {
        // arm along x
        for (let k = -4.7; k <= 4.7; k += 1.1) {
          rect(cx + sgn * 6.4 - (sgn < 0 ? 2.8 : 0), cz + k - 0.28, 2.8, 0.56, white, 0.9);
          stripes++;
        }
        rect(cx + sgn * 10.3 - (sgn < 0 ? 0.45 : 0), cz + (sgn < 0 ? -4.7 : 0.1), 0.45, 4.6, white, 0.92);
        // arm along z
        for (let k = -4.7; k <= 4.7; k += 1.1) {
          rect(cx + k - 0.28, cz + sgn * 6.4 - (sgn < 0 ? 2.8 : 0), 0.56, 2.8, white, 0.9);
          stripes++;
        }
        rect(cx + (sgn < 0 ? 0.1 : -4.7), cz + sgn * 10.3 - (sgn < 0 ? 0.45 : 0), 4.6, 0.45, white, 0.92);
      }
      // yellow box with diagonals
      g.strokeStyle = yellow;
      g.lineWidth = m(0.26);
      g.setLineDash([m(1.1), m(0.8)]);
      g.strokeRect(m(cx - 3.9), m(cz - 3.9), m(7.8), m(7.8));
      g.beginPath();
      g.moveTo(m(cx - 3.9), m(cz - 3.9));
      g.lineTo(m(cx + 3.9), m(cz + 3.9));
      g.moveTo(m(cx + 3.9), m(cz - 3.9));
      g.lineTo(m(cx - 3.9), m(cz + 3.9));
      g.stroke();
      g.setLineDash([]);
    }
  }
  // lane arrows
  const arrow = (x: number, y: number, angle: number): void => {
    g.save();
    g.translate(m(x), m(y));
    g.rotate(angle);
    g.fillStyle = white;
    g.globalAlpha = 0.88;
    g.beginPath();
    g.moveTo(0, m(-2.2));
    g.lineTo(m(1.3), m(0.1));
    g.lineTo(m(0.5), m(0.1));
    g.lineTo(m(0.5), m(2.2));
    g.lineTo(m(-0.5), m(2.2));
    g.lineTo(m(-0.5), m(0.1));
    g.lineTo(m(-1.3), m(0.1));
    g.closePath();
    g.fill();
    g.restore();
    g.globalAlpha = 1;
  };
  for (const c of [0, TILE_M]) {
    arrow(22, c + 2.8, Math.PI / 2);
    arrow(38, c - 2.8, -Math.PI / 2);
    arrow(c + 2.8, 22, Math.PI);
    arrow(c - 2.8, 38, 0);
  }
  return { stripes, dashes };
}

/** A park block: mown grass in two tones, gravel paths, a flower bed ring. */
export function paintPark(g: Ctx2D, px: number): void {
  const r = rng(0x9a2c);
  g.fillStyle = "#6f9a4c";
  g.fillRect(0, 0, px, px);
  for (let i = 0; i < 14; i++) {
    g.fillStyle = i % 2 ? "#78a554" : "#689447";
    g.fillRect(0, (i * px) / 14, px, px / 14);
  }
  for (let i = 0; i < 5000; i++) {
    g.globalAlpha = 0.14;
    g.fillStyle = r() > 0.5 ? "#9bc473" : "#4d7a35";
    g.fillRect(r() * px, r() * px, 2 + r() * 3, 2 + r() * 3);
  }
  g.globalAlpha = 1;
  g.fillStyle = "#cdbf9c";
  g.fillRect(px * 0.46, 0, px * 0.08, px);
  g.fillRect(0, px * 0.46, px, px * 0.08);
  g.beginPath();
  g.arc(px / 2, px / 2, px * 0.15, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#6a9448";
  g.beginPath();
  g.arc(px / 2, px / 2, px * 0.11, 0, Math.PI * 2);
  g.fill();
  const flowers = ["#e8627c", "#f2c14e", "#f4f1de", "#b583e6"];
  for (let i = 0; i < 90; i++) {
    const a = r() * Math.PI * 2;
    const rad = px * (0.11 + r() * 0.03);
    g.fillStyle = flowers[i % flowers.length] as string;
    g.beginPath();
    g.arc(px / 2 + Math.cos(a) * rad, px / 2 + Math.sin(a) * rad, 2.5, 0, Math.PI * 2);
    g.fill();
  }
}

/** A plaza block: stone paving in a checker with a fountain ring. */
export function paintPlaza(g: Ctx2D, px: number): void {
  const n = 12;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      g.fillStyle = (x + y) % 2 ? "#cdc2a8" : "#bfb396";
      g.fillRect((x * px) / n, (y * px) / n, px / n + 1, px / n + 1);
    }
  }
  g.fillStyle = "#8f836c";
  g.beginPath();
  g.arc(px / 2, px / 2, px * 0.17, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#58a5be";
  g.beginPath();
  g.arc(px / 2, px / 2, px * 0.14, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#e9e0c8";
  g.beginPath();
  g.arc(px / 2, px / 2, px * 0.04, 0, Math.PI * 2);
  g.fill();
}

/* ------------------------------------------------------------------ facades */

export type FacadeKind = "tower" | "apartment" | "brick";

const WALL: Record<FacadeKind, string> = { tower: "#f3eee3", apartment: "#f6f0e4", brick: "#d9a58b" };

export interface FacadeLayout {
  readonly cells: number;
  readonly lit: number;
  readonly total: number;
}

/**
 * Paints the base-colour tile and a matching emissive tile (lit windows only). The wall is near white so a per-vertex
 * tint colours it; windows keep their own colours.
 */
export function paintFacade(kind: FacadeKind, albedo: Ctx2D, emissive: Ctx2D, px: number, seed = 1, wallHex: string = WALL[kind]): FacadeLayout {
  const r = rng(0x7a11 + seed * 977 + kind.length * 131);
  const c = px / CELLS;
  albedo.fillStyle = wallHex;
  albedo.fillRect(0, 0, px, px);
  emissive.fillStyle = "#000000";
  emissive.fillRect(0, 0, px, px);
  let lit = 0;
  for (let y = 0; y < CELLS; y++) {
    const floorLine = y * c;
    // floor slab line and a faint panel shadow
    albedo.fillStyle = shade(wallHex, 0.84);
    albedo.fillRect(0, floorLine + c - c * 0.07, px, c * 0.07);
    // coursed masonry: horizontal mortar lines, vertical joints staggered per course
    const courses = kind === "brick" ? 12 : 6;
    for (let b = 0; b < courses; b++) {
      const cy = floorLine + (b * c) / courses;
      albedo.globalAlpha = kind === "brick" ? 0.2 : 0.16;
      albedo.fillStyle = kind === "brick" ? "#6e3d2c" : "#7d6b4f";
      albedo.fillRect(0, cy, px, 1);
      const blockW = kind === "brick" ? c / 8 : c / 3;
      for (let bx = (b % 2) * blockW * 0.5; bx < px; bx += blockW) albedo.fillRect(bx, cy, 1, c / courses);
    }
    albedo.globalAlpha = 1;
    for (let x = 0; x < CELLS; x++) {
      const cx = x * c;
      const isLit = r() < (kind === "tower" ? 0.2 : kind === "apartment" ? 0.34 : 0.28);
      if (isLit) lit++;
      const glass = isLit ? "#f4d9a4" : r() > 0.5 ? "#2e4260" : "#3a4f6e";
      const drawWindow = (wx: number, wy: number, ww: number, wh: number, litHere: boolean): void => {
        albedo.fillStyle = shade(wallHex, 0.62);
        albedo.fillRect(wx - c * 0.035, wy - c * 0.035, ww + c * 0.07, wh + c * 0.07);
        albedo.fillStyle = litHere ? "#f4d9a4" : glass;
        albedo.fillRect(wx, wy, ww, wh);
        if (!litHere) {
          const grad = albedo.createLinearGradient(wx, wy, wx + ww, wy + wh);
          grad.addColorStop(0, "rgba(180,205,235,0.45)");
          grad.addColorStop(0.5, "rgba(120,150,190,0.05)");
          grad.addColorStop(1, "rgba(20,30,50,0.25)");
          albedo.fillStyle = grad;
          albedo.fillRect(wx, wy, ww, wh);
        } else {
          emissive.fillStyle = "#ffd89a";
          emissive.fillRect(wx, wy, ww, wh);
        }
      };
      if (kind === "tower") {
        drawWindow(cx + c * 0.06, floorLine + c * 0.2, c * 0.88, c * 0.56, isLit);
        albedo.fillStyle = shade(wallHex, 0.74);
        albedo.fillRect(cx + c * 0.5 - 1.5, floorLine + c * 0.2, 3, c * 0.56);
      } else if (kind === "apartment") {
        const lit2 = r() < 0.3;
        drawWindow(cx + c * 0.12, floorLine + c * 0.18, c * 0.32, c * 0.52, isLit);
        drawWindow(cx + c * 0.56, floorLine + c * 0.18, c * 0.32, c * 0.52, lit2);
        if (lit2) lit++;
        if ((x + y) % 3 === 0) {
          albedo.fillStyle = "#3b3a3f";
          albedo.fillRect(cx + c * 0.06, floorLine + c * 0.74, c * 0.88, c * 0.05);
          for (let k = 0; k < 8; k++) albedo.fillRect(cx + c * (0.08 + k * 0.115), floorLine + c * 0.74, 2, c * 0.18);
        } else if ((x * 7 + y * 3) % 5 === 0) {
          albedo.fillStyle = shade(wallHex, 0.7);
          albedo.fillRect(cx + c * 0.62, floorLine + c * 0.74, c * 0.26, c * 0.15);
        }
      } else {
        drawWindow(cx + c * 0.2, floorLine + c * 0.14, c * 0.6, c * 0.62, isLit);
        albedo.fillStyle = shade(wallHex, 0.94);
        albedo.fillRect(cx + c * 0.16, floorLine + c * 0.78, c * 0.68, c * 0.06);
      }
    }
  }
  return { cells: CELLS * CELLS, lit, total: CELLS * CELLS };
}

/** Shopfront strip: 4 cells wide (256 px each): stone base, dark glass with a warm glow in some bays, frames and a sign band. */
export function paintShopfront(albedo: Ctx2D, emissive: Ctx2D, w: number, h: number, seed = 3): void {
  const r = rng(0x5b09 + seed);
  albedo.fillStyle = "#e4d8c0";
  albedo.fillRect(0, 0, w, h);
  emissive.fillStyle = "#000000";
  emissive.fillRect(0, 0, w, h);
  const cw = w / 4;
  const signH = h * 0.2;
  const frames = ["#2f5f4a", "#8f3030", "#2c466d", "#a37a28"];
  for (let i = 0; i < 4; i++) {
    const x = i * cw;
    const hue = frames[Math.floor(r() * frames.length)] as string;
    // sign band
    albedo.fillStyle = hue;
    albedo.fillRect(x + cw * 0.04, h * 0.03, cw * 0.92, signH);
    albedo.fillStyle = "#f1e8d2";
    albedo.fillRect(x + cw * 0.14, h * 0.07, cw * 0.72, signH * 0.5);
    // stone base and frame
    albedo.fillStyle = shade("#e4d8c0", 0.8);
    albedo.fillRect(x, h * 0.86, cw, h * 0.14);
    albedo.fillStyle = hue;
    albedo.fillRect(x + cw * 0.06, h * 0.32, cw * 0.88, h * 0.56);
    // glass
    const lit = r() < 0.45;
    const glass = albedo.createLinearGradient(0, h * 0.35, 0, h * 0.85);
    glass.addColorStop(0, lit ? "#e9c27c" : "#4f6a73");
    glass.addColorStop(1, lit ? "#b98846" : "#27363d");
    albedo.fillStyle = glass;
    const door = r() > 0.45;
    albedo.fillRect(x + cw * 0.1, h * 0.36, cw * (door ? 0.5 : 0.8), h * 0.48);
    if (lit) {
      emissive.fillStyle = "#7a5424";
      emissive.fillRect(x + cw * 0.1, h * 0.36, cw * (door ? 0.5 : 0.8), h * 0.48);
    }
    if (door) {
      albedo.fillStyle = shade(hue, 0.7);
      albedo.fillRect(x + cw * 0.66, h * 0.36, cw * 0.24, h * 0.5);
    }
    albedo.fillStyle = shade(hue, 0.55);
    albedo.fillRect(x + cw * 0.06, h * 0.32, cw * 0.88, h * 0.025);
  }
}

/** The palette strip: one 16 px block per slot. */
export function paintPalette(g: Ctx2D, hexes: readonly string[], slots: number, blockPx = 16): void {
  g.fillStyle = "#ff00ff";
  g.fillRect(0, 0, slots * blockPx, blockPx);
  hexes.forEach((hex, i) => {
    g.fillStyle = hex;
    g.fillRect(i * blockPx, 0, blockPx, blockPx);
  });
}

/* ------------------------------------------------------------------ sky and skyline */

export function paintSky(g: Ctx2D, w: number, h: number): void {
  const grad = g.createLinearGradient(0, 0, 0, h);
  for (const [at, color] of [[0, "#e9c08c"], [0.28, "#f1cc9c"], [0.55, "#f5d9b0"], [0.78, "#f2dcc0"], [0.9, "#f0dcc0"], [1, "#f0dcc0"]] as const) grad.addColorStop(at, color);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
}

/** A hazy skyline ring texture: far hills, then three layers of towers fading into the haze colour. */
export function paintSkyline(g: Ctx2D, w: number, h: number, seed = 11): number {
  const r = rng(seed);
  let towers = 0;
  // distant hills: wide soft triangles
  g.globalAlpha = 0.55;
  g.fillStyle = "#d8c196";
  for (let x = -100; x < w; x += 160 + r() * 260) {
    const hw = 180 + r() * 260;
    const hh = h * (0.16 + r() * 0.22);
    g.beginPath();
    g.moveTo(x, h);
    g.lineTo(x + hw / 2, h - hh);
    g.lineTo(x + hw, h);
    g.closePath();
    g.fill();
  }
  for (const layer of [0, 1, 2]) {
    const tone = ["#e0cfae", "#d6c29c", "#cbb48c"][layer] as string;
    let x = -20 * r();
    while (x < w) {
      const bw = 24 + r() * 70;
      const bh = h * (0.16 + 0.07 * layer + r() * (0.36 - layer * 0.05));
      g.globalAlpha = 0.9 - layer * 0.08;
      g.fillStyle = tone;
      g.fillRect(x, h - bh, bw, bh);
      if (r() > 0.7) g.fillRect(x + bw * 0.3, h - bh - 14 - r() * 20, bw * 0.4, 20);
      g.globalAlpha = 0.55;
      g.fillStyle = "#f7dca8";
      for (let k = 0; k < 7; k++) g.fillRect(x + 4 + r() * (bw - 10), h - bh + 8 + r() * (bh - 16), 3, 4);
      x += bw * (0.6 + r() * 0.5);
      towers++;
    }
  }
  g.globalAlpha = 1;
  return towers;
}
