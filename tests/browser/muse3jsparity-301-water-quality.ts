import { VISUAL_SETTINGS_301 as SETTINGS, type VisualCapture301 } from './muse3jsparity-301-visual-cases';
import { projectVisualPoint } from './muse3jsparity-301-visual-geometry-quality';

/** Analytic target is reflected world-space center, independent of renderer implementation. */
export function expectedWaterReflectionCenters301(frame: number): readonly (readonly [number, number])[] {
  const x = Math.sin(frame / 60) * 0.65;
  return [[x - 0.65, -0.75, 0], [x + 0.65, -0.75, -0.5]].map(point => projectVisualPoint(
    point, SETTINGS.camera.position, SETTINGS.camera.target, SETTINGS.camera.fov, SETTINGS.width, SETTINGS.height));
}

/** Color-isolated on/off effect centroids measured against independent geometric projections. */
export function calculateWaterReflectionProjectionError301(on: VisualCapture301, off: VisualCapture301): number {
  if (on.family !== 'water-reflections' || off.family !== on.family || on.engine !== off.engine ||
      on.frame !== off.frame || on.width !== off.width || on.height !== off.height || !on.enabled || off.enabled) {
    throw new Error('Water projection metric requires matching native on/off captures');
  }
  const centers = expectedWaterReflectionCenters301(on.frame);
  const accumulators = [{ x: 0, y: 0, count: 0 }, { x: 0, y: 0, count: 0 }];
  for (let y = 0; y < on.height; y++) for (let x = 0; x < on.width; x++) {
    const i = (y * on.width + x) * 4;
    const r = on.pixels[i]!, g = on.pixels[i + 1]!, b = on.pixels[i + 2]!;
    const delta = Math.abs(r - off.pixels[i]!) + Math.abs(g - off.pixels[i + 1]!) + Math.abs(b - off.pixels[i + 2]!);
    if (delta < 12) continue;
    const color = r > 30 && r > g * 1.6 && r > b * 1.6 ? 0 : b > 30 && b > r * 1.6 && b > g * 1.3 ? 1 : -1;
    if (color < 0) continue;
    const accumulator = accumulators[color]!;
    accumulator.x += x + 0.5; accumulator.y += y + 0.5; accumulator.count++;
  }
  // Missing reflected geometry fails instead of receiving an artificial perfect score.
  if (accumulators.some(value => value.count < 16)) return 1;
  return accumulators.reduce((sum, value, i) => sum + Math.hypot(
    (value.x / value.count - centers[i]![0]),
    (value.y / value.count - centers[i]![1])), 0) / accumulators.length / Math.hypot(on.width, on.height);
}
