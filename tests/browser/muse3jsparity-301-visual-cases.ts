import type { VisualContract, VisualFamily } from '../../tools/muse3jsparity-readiness/visual-acceptance';

/** Frozen before capture. Changes invalidate every prior matrix receipt. */
export const VISUAL_SETTINGS_301 = Object.freeze({
  version: 1, width: 600, height: 380, pixelRatio: 1, seed: 301,
  camera: { position: [0, 2.9, 4.6], target: [0, 0.55, 0], fov: 40, near: 0.1, far: 100 },
  background: '#05070d', asset: 'robotcand', assetHash: 'sha256-f71a470103b0ff13cf36f465ef958e283392414e157cce08e6e2a424cef35516',
  assetTargetMaxDimension: 2.4, bloom: { intensity: 0.35, radius: 0.38, threshold: 0.7 },
  particles: { width: 640, height: 360, count: 10000, camera: [0, 0, 4], fov: 45, nativeQuadSize: 0.024, lifetime: 10000 },
  water: { cubeSize: 0.9, waterSize: 6, waterY: 0, sourceY: 0.75, motionAmplitude: 0.65, sourceOffsets: [[-0.65, 0], [0.65, -0.5]], reflectionTargetSize: 600 },
  sdfText: { text: 'AURA', size: 0.5, position: [-1.3, 0.5, 2], texelsPerWorldUnit: 64 },
  cameraShake: { seed: 301, decay: 1.4, maxOffset: 0.22, maxRoll: 0, trauma: 1 },
  frames: [0, 15, 30, 45, 60], dt: 1 / 60,
});
export function captureSettings301(family: VisualFamily) {
  return family === 'particles'
    ? { width: 640, height: 360, camera: { position: [0, 0, 4], target: [0, 0, 0], fov: 45, near: 0.1, far: 100 }, assets: [] as string[], geometry: '10000-native-particle-quads' }
    : { width: 600, height: 380, camera: VISUAL_SETTINGS_301.camera, assets: family === 'water-reflections' ? [] : [VISUAL_SETTINGS_301.assetHash], geometry: family === 'water-reflections' ? 'two-native-cubes-and-water-plane' : 'typed-robot-receiver-and-calibration-emitter' };
}
/** Predeclared feature-quality contracts; actual captures and independent review determine closure. */
export const VISUAL_CASES_301: readonly VisualContract[] = (
  ['bloom', 'night-lighting', 'water-reflections', 'decals', 'sdf-text', 'particles', 'camera-game-feel'] as const
).map(family => ({
  family,
  workloadFingerprint: JSON.stringify({ settings: VISUAL_SETTINGS_301, family, capture: captureSettings301(family) }),
  minimumEffectDelta: 0.0005,
  metrics: [
    { id: 'clipping', direction: 'lower' as const, maximum: 0.05, tieTolerance: 0.005 },
    { id: 'replayInstability', direction: 'lower' as const, maximum: 0.001, tieTolerance: 0.0001 },
    ...(family === 'water-reflections' ? [{ id: 'reflectionProjectionError', direction: 'lower' as const, maximum: 0.03, tieTolerance: 0.005 }] : []),
    ...(family === 'sdf-text' ? [{ id: 'glyphEdgeError', direction: 'lower' as const, maximum: 0.18, tieTolerance: 0.02 }] : []),
    ...(family === 'night-lighting' ? [{ id: 'shadowEdgeInstability', direction: 'lower' as const, maximum: 0.001, tieTolerance: 0.0001 }] : []),
    ...(family === 'decals' ? [{ id: 'footprintError', direction: 'lower' as const, maximum: 0.15, tieTolerance: 0.02 }] : []),
    ...(family === 'particles' ? [{ id: 'trajectoryProjectionError', direction: 'lower' as const, maximum: 0.01, tieTolerance: 0.001 }] : []),
    ...(family === 'camera-game-feel' ? [{ id: 'temporalJerk', direction: 'lower' as const, maximum: 0.08, tieTolerance: 0.005 }, { id: 'settlingError', direction: 'lower' as const, maximum: 0.001, tieTolerance: 0.0001 }] : []),
  ],
}));
export interface VisualCapture301 {
  family: VisualFamily; engine: 'aura' | 'three'; enabled: boolean; frame: number;
  width: number; height: number; pixels: number[]; dataUrl: string;
  passes: string[]; errors: string[]; settings: typeof VISUAL_SETTINGS_301;
  claimSurface: string;
  actualSettings?: ReturnType<typeof captureSettings301>;
}
