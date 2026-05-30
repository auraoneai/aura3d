// Shared configuration for the particle fountain.
//
// The Aura3D scene (ground plane, emitter, lights) and the particle overlay are
// rendered by two stacked canvases. They MUST agree exactly on the camera so the
// simulated particles line up with the Aura-rendered ground plane and emitter.
// Aura3D's Three.js renderer builds its camera as
//   new THREE.PerspectiveCamera(fov, width/height, 0.05, 100)
// positioned at `position` and looking at `target` (see updateThreeCamera in the
// engine). We mirror those exact values for the overlay camera below.

export const CAMERA = {
  position: [3.4, 2.3, 5.2] as const,
  target: [0, 1.05, 0] as const,
  fov: 46,
  near: 0.05,
  far: 100,
};

export const BACKGROUND = "#05070f";

// Fountain physics (world units, seconds).
export const FOUNTAIN = {
  // Nozzle tip in world space — matches the top of the emitter geometry.
  origin: [0, 0.52, 0] as const,
  gravity: 9.81,
  // Upward launch speed range.
  speedUpMin: 5.0,
  speedUpMax: 6.4,
  // Horizontal spread speed (creates the fanned arc, not a single column).
  // A non-zero floor guarantees every particle fans outward into the arc.
  spreadMin: 0.55,
  spreadMax: 1.8,
  // Particle lifetime range.
  lifeMin: 2.0,
  lifeMax: 3.4,
  // Ground collision.
  groundY: 0.025,
  restitution: 0.38,
  groundFriction: 0.55,
  // Pool + emission.
  maxParticles: 6000,
  rateDefault: 700,
  rateMax: 2000,
};

// Lifetime colour ramp (t = age / life, 0 = just born, 1 = dying).
// Stops are bright hot-cyan at birth → blue → violet → warm red as the particle
// ages, so the fountain shows a clear lifetime colour spectrum.
export const COLOR_STOPS: ReadonlyArray<{ t: number; rgb: [number, number, number] }> = [
  { t: 0.0, rgb: [0.45, 0.92, 1.0] }, // bright cyan
  { t: 0.3, rgb: [0.18, 0.62, 1.0] }, // azure
  { t: 0.55, rgb: [0.36, 0.4, 1.0] }, // blue
  { t: 0.78, rgb: [0.85, 0.35, 1.0] }, // violet
  { t: 1.0, rgb: [1.0, 0.4, 0.18] }, // warm orange-red
];
