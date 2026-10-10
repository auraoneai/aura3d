/**
 * Fixture: style-(a) camera cast-mutations (PRD-08 §9.3).
 * Every `as unknown as` cast below is a mutation the `camera-cast` codemod
 * rewrites into C-22 `app.camera` calls:
 *  - pose-field literals   → app.camera.setPose        (exact)
 *  - fov literals / writes → app.camera.setFov         (exact)
 *  - spec-shape fields     → app.camera.rigs.fromSpec  (approximate)
 */

interface MutableLegacyCameraSpec {
  position?: readonly number[];
  target?: readonly number[];
  fov?: number;
  near?: number;
  far?: number;
  offset?: readonly number[];
  distance?: number;
  mode?: string;
}

const chaseCameraSpec = {
  mode: "chase",
  position: [0, 2, 6],
  target: [0, 1, 0],
  fov: 50,
  offset: [0.4, 0, 0],
  distance: 4.2
};

const tuning = { damping: 0.2, lead: 0.35 };

export function reframeChase(): void {
  // Pose fields only — rewritten to setPose (exact).
  Object.assign(chaseCameraSpec as unknown as MutableLegacyCameraSpec, { position: [0, 2, 6], target: [0, 1, 0] });

  // fov only — rewritten to setFov (exact).
  Object.assign(chaseCameraSpec as unknown as MutableLegacyCameraSpec, { fov: 47 });
  (chaseCameraSpec as unknown as MutableLegacyCameraSpec).fov = 51;

  // Spec-shape fields — rewritten to a rigs.fromSpec merge (approximate).
  Object.assign(chaseCameraSpec as unknown as MutableLegacyCameraSpec, { offset: [0.6, 0, 0], distance: 5.1 });

  // Dynamic update object — rewritten to a rigs.fromSpec merge (approximate).
  Object.assign(chaseCameraSpec as unknown as MutableLegacyCameraSpec, tuning);
}
