export interface BufferAttributeCompat {
  readonly array: readonly number[];
  readonly itemSize: number;
}

export class BufferGeometryCompat {
  readonly type: string = "BufferGeometry";
  readonly attributes = new Map<string, BufferAttributeCompat>();
  index: readonly number[] | null = null;
  drawRange: { start: number; count: number } = { start: 0, count: Number.POSITIVE_INFINITY };

  setAttribute(name: string, attribute: BufferAttributeCompat): this {
    this.attributes.set(name, attribute);
    return this;
  }

  getAttribute(name: string): BufferAttributeCompat | undefined {
    return this.attributes.get(name);
  }

  deleteAttribute(name: string): this {
    this.attributes.delete(name);
    return this;
  }

  setIndex(index: readonly number[]): this {
    this.index = index;
    return this;
  }

  setDrawRange(start: number, count: number): this {
    if (!Number.isInteger(start) || start < 0 || !(Number.isFinite(count) || count === Number.POSITIVE_INFINITY) || count < 0) {
      throw new RangeError("BufferGeometryCompat drawRange requires a non-negative integer start and non-negative finite count.");
    }
    this.drawRange = { start, count };
    return this;
  }
}

export class InstancedBufferGeometryCompat extends BufferGeometryCompat {
  override readonly type = "InstancedBufferGeometry";
  instanceCount = 1;
}

export class BoxGeometryCompat extends BufferGeometryCompat { override readonly type = "BoxGeometry"; constructor(public width = 1, public height = 1, public depth = 1) { super(); } }
export class SphereGeometryCompat extends BufferGeometryCompat { override readonly type = "SphereGeometry"; constructor(public radius = 1, public widthSegments = 32, public heightSegments = 16) { super(); } }
export class PlaneGeometryCompat extends BufferGeometryCompat { override readonly type = "PlaneGeometry"; constructor(public width = 1, public height = 1) { super(); } }
export class CylinderGeometryCompat extends BufferGeometryCompat { override readonly type: string = "CylinderGeometry"; constructor(public radiusTop = 1, public radiusBottom = 1, public height = 1) { super(); } }
export class TorusGeometryCompat extends BufferGeometryCompat { override readonly type = "TorusGeometry"; constructor(public radius = 1, public tube = 0.4) { super(); } }
export class ConeGeometryCompat extends CylinderGeometryCompat { override readonly type = "ConeGeometry"; constructor(radius = 1, height = 1) { super(0, radius, height); } }
export class CircleGeometryCompat extends BufferGeometryCompat { override readonly type = "CircleGeometry"; constructor(public radius = 1, public segments = 32) { super(); } }

export const THREE_COMPAT_COMPAT_GEOMETRY_TYPES = [
  "BoxGeometry",
  "SphereGeometry",
  "PlaneGeometry",
  "CylinderGeometry",
  "TorusGeometry",
  "ConeGeometry",
  "CircleGeometry",
  "BufferGeometry",
  "InstancedBufferGeometry"
] as const;
