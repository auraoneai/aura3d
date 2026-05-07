export interface DebugRenderLine {
  readonly from: readonly [number, number, number];
  readonly to: readonly [number, number, number];
  readonly color: readonly [number, number, number, number];
}

export interface DebugLineCanvasRendererOptions {
  readonly scale?: number;
  readonly origin?: readonly [number, number];
  readonly axis?: "xy" | "xz";
  readonly lineWidth?: number;
}

export interface DebugLineCanvasRenderResult {
  readonly lineCount: number;
  readonly bounds: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
  };
}

export class DebugLineCanvasRenderer {
  render(
    context: CanvasRenderingContext2D,
    lines: readonly DebugRenderLine[],
    options: DebugLineCanvasRendererOptions = {}
  ): DebugLineCanvasRenderResult {
    const scale = options.scale ?? 1;
    if (!Number.isFinite(scale) || scale <= 0) {
      throw new RangeError("Debug line canvas scale must be a finite positive number.");
    }
    const origin = options.origin ?? [0, 0];
    const axis = options.axis ?? "xy";
    const lineWidth = options.lineWidth ?? 1;
    if (!Number.isFinite(lineWidth) || lineWidth <= 0) {
      throw new RangeError("Debug line canvas width must be a finite positive number.");
    }

    const bounds = {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY
    };

    context.save();
    context.lineWidth = lineWidth;
    for (const line of lines) {
      const from = project(line.from, axis, scale, origin);
      const to = project(line.to, axis, scale, origin);
      include(bounds, from);
      include(bounds, to);
      context.strokeStyle = rgba(line.color);
      context.beginPath();
      context.moveTo(from[0], from[1]);
      context.lineTo(to[0], to[1]);
      context.stroke();
    }
    context.restore();

    if (lines.length === 0) {
      return { lineCount: 0, bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 } };
    }
    return { lineCount: lines.length, bounds };
  }
}

function project(
  point: readonly [number, number, number],
  axis: "xy" | "xz",
  scale: number,
  origin: readonly [number, number]
): readonly [number, number] {
  const y = axis === "xy" ? point[1] : point[2];
  return [origin[0] + point[0] * scale, origin[1] - y * scale];
}

function include(bounds: { minX: number; minY: number; maxX: number; maxY: number }, point: readonly [number, number]): void {
  bounds.minX = Math.min(bounds.minX, point[0]);
  bounds.minY = Math.min(bounds.minY, point[1]);
  bounds.maxX = Math.max(bounds.maxX, point[0]);
  bounds.maxY = Math.max(bounds.maxY, point[1]);
}

function rgba(color: readonly [number, number, number, number]): string {
  const r = Math.round(clamp01(color[0]) * 255);
  const g = Math.round(clamp01(color[1]) * 255);
  const b = Math.round(clamp01(color[2]) * 255);
  return `rgba(${r}, ${g}, ${b}, ${clamp01(color[3])})`;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}
