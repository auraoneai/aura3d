export type BlendTreeChild<T> = {
  readonly value: T;
  readonly threshold: number;
};

export type BlendTree2DChild<T> = {
  readonly value: T;
  readonly position: readonly [number, number];
};

export type BlendTreeWeight<T> = {
  readonly value: T;
  readonly weight: number;
};

export class BlendTree1D<T> {
  readonly children: readonly BlendTreeChild<T>[];

  constructor(children: readonly BlendTreeChild<T>[]) {
    if (children.length === 0) {
      throw new Error("BlendTree1D requires at least one child.");
    }
    this.children = [...children].sort((a, b) => a.threshold - b.threshold);
  }

  weights(parameter: number): readonly BlendTreeWeight<T>[] {
    if (!Number.isFinite(parameter)) {
      throw new Error("Blend parameter must be finite.");
    }
    if (this.children.length === 1 || parameter <= this.children[0]!.threshold) {
      return [{ value: this.children[0]!.value, weight: 1 }];
    }
    const last = this.children[this.children.length - 1]!;
    if (parameter >= last.threshold) {
      return [{ value: last.value, weight: 1 }];
    }
    for (let index = 0; index < this.children.length - 1; index += 1) {
      const a = this.children[index]!;
      const b = this.children[index + 1]!;
      if (parameter >= a.threshold && parameter <= b.threshold) {
        const span = b.threshold - a.threshold;
        const t = span === 0 ? 0 : (parameter - a.threshold) / span;
        return [{ value: a.value, weight: 1 - t }, { value: b.value, weight: t }];
      }
    }
    return [{ value: last.value, weight: 1 }];
  }
}

export class BlendTree2D<T> {
  readonly children: readonly BlendTree2DChild<T>[];

  constructor(children: readonly BlendTree2DChild<T>[]) {
    if (children.length === 0) {
      throw new Error("BlendTree2D requires at least one child.");
    }
    for (const child of children) {
      if (!Number.isFinite(child.position[0]) || !Number.isFinite(child.position[1])) {
        throw new Error("BlendTree2D child positions must be finite.");
      }
    }
    this.children = [...children];
  }

  weights(parameter: readonly [number, number]): readonly BlendTreeWeight<T>[] {
    if (!Number.isFinite(parameter[0]) || !Number.isFinite(parameter[1])) {
      throw new Error("BlendTree2D parameters must be finite.");
    }
    if (this.children.length === 1) {
      return [{ value: this.children[0]!.value, weight: 1 }];
    }

    const distances = this.children.map((child) => {
      const dx = parameter[0] - child.position[0];
      const dy = parameter[1] - child.position[1];
      return Math.hypot(dx, dy);
    });
    const exactIndex = distances.findIndex((distance) => distance === 0);
    if (exactIndex >= 0) {
      return [{ value: this.children[exactIndex]!.value, weight: 1 }];
    }

    const inverseDistances = distances.map((distance) => 1 / distance);
    const total = inverseDistances.reduce((sum, weight) => sum + weight, 0);
    return this.children
      .map((child, index) => ({ value: child.value, weight: inverseDistances[index]! / total }))
      .filter((weight) => weight.weight > 0);
  }
}
