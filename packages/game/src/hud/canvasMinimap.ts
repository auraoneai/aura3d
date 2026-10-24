/** Structural subset of CanvasRenderingContext2D the minimap draws with (a recording fake satisfies it in node tests). */
export interface CanvasMinimapContext {
  fillStyle: unknown;
  strokeStyle: unknown;
  lineWidth: number;
  clearRect(x: number, y: number, w: number, h: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  rotate(angle: number): void;
  roundRect?(x: number, y: number, w: number, h: number, r: number): void;
}

/** World rectangle `[x0, z0, x1, z1]` mapped onto the full square canvas. */
export type CanvasMinimapBounds = readonly [number, number, number, number];

export type CanvasMinimapLayer =
  | { readonly kind: "rect"; readonly rect: CanvasMinimapBounds; readonly fill: string }
  | { readonly kind: "lines"; readonly segments: readonly CanvasMinimapBounds[]; readonly stroke: string; readonly width: number }
  | { readonly kind: "points"; readonly points: readonly (readonly [number, number])[]; readonly fill: string; readonly size: number };

export interface CanvasMinimapMarker {
  readonly x: number;
  readonly z: number;
  /** Radians; the arrow rotates by `-heading` (the convention of the -z-forward game worlds). */
  readonly heading: number;
  readonly fill: string;
  /** Arrow outline in canvas pixels around the origin; default is the 4-point chevron the ports used. */
  readonly shape?: readonly (readonly [number, number])[];
}

export interface CanvasMinimapSpec {
  /** Canvas side in pixels (the minimap is square). */
  readonly size: number;
  readonly bounds: CanvasMinimapBounds;
  readonly background?: { readonly fill: string; readonly radius?: number };
  /** Drawn in order, under the marker. */
  readonly layers?: readonly CanvasMinimapLayer[];
  readonly marker?: CanvasMinimapMarker;
}

const CHEVRON: readonly (readonly [number, number])[] = [[0, -8], [5.5, 7], [0, 3.5], [-5.5, 7]];

/** Redraw the whole minimap. World to pixel is linear over `bounds`, so the same spec works at any `size`. */
export function drawCanvasMinimap(ctx: CanvasMinimapContext, spec: CanvasMinimapSpec): void {
  const e = spec.size;
  const [bx0, bz0, bx1, bz1] = spec.bounds;
  const nx = (x: number): number => ((x - bx0) / (bx1 - bx0)) * e;
  const nz = (z: number): number => ((z - bz0) / (bz1 - bz0)) * e;
  ctx.clearRect(0, 0, e, e);
  if (spec.background) {
    ctx.fillStyle = spec.background.fill;
    ctx.beginPath();
    if (ctx.roundRect && spec.background.radius) ctx.roundRect(0, 0, e, e, spec.background.radius);
    else {
      ctx.moveTo(0, 0);
      ctx.lineTo(e, 0);
      ctx.lineTo(e, e);
      ctx.lineTo(0, e);
      ctx.closePath();
    }
    ctx.fill();
  }
  for (const layer of spec.layers ?? []) {
    if (layer.kind === "rect") {
      const [x0, z0, x1, z1] = layer.rect;
      ctx.fillStyle = layer.fill;
      ctx.fillRect(nx(x0), nz(z0), nx(x1) - nx(x0), nz(z1) - nz(z0));
    } else if (layer.kind === "lines") {
      ctx.strokeStyle = layer.stroke;
      ctx.lineWidth = layer.width;
      for (const [x0, z0, x1, z1] of layer.segments) {
        ctx.beginPath();
        ctx.moveTo(nx(x0), nz(z0));
        ctx.lineTo(nx(x1), nz(z1));
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = layer.fill;
      const h = layer.size / 2;
      for (const [x, z] of layer.points) ctx.fillRect(nx(x) - h, nz(z) - h, layer.size, layer.size);
    }
  }
  const m = spec.marker;
  if (m) {
    ctx.save();
    ctx.translate(nx(m.x), nz(m.z));
    ctx.rotate(-m.heading);
    ctx.fillStyle = m.fill;
    ctx.beginPath();
    const shape = m.shape ?? CHEVRON;
    ctx.moveTo(shape[0]![0], shape[0]![1]);
    for (let i = 1; i < shape.length; i++) ctx.lineTo(shape[i]![0], shape[i]![1]);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
