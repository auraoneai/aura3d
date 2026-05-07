export const Easing = Object.freeze({
  linear(t: number): number {
    assertUnit(t);
    return t;
  },
  easeInQuad(t: number): number {
    assertUnit(t);
    return t * t;
  },
  easeOutQuad(t: number): number {
    assertUnit(t);
    return t * (2 - t);
  },
  easeInOutCubic(t: number): number {
    assertUnit(t);
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }
});

function assertUnit(t: number): void {
  if (!Number.isFinite(t) || t < 0 || t > 1) {
    throw new RangeError("Easing input must be a finite value in [0, 1].");
  }
}
