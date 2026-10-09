/**
 * Fixture: style-(b) direct camera-spec writes (PRD-08 §9.3).
 * No `as unknown as` cast — the codemod must NOT rewrite these; it reports
 * them as manual-migration rows (`mapping: "none"`) so a human moves each
 * write to `app.camera.setPose/setFov` or `app.camera.rigs.fromSpec`.
 */

const cameraSpec = {
  mode: "orbit",
  position: [0, 1.6, 8],
  target: [0, 1, 0],
  fov: 42,
  offset: [0, 0, 0],
  distance: 8,
  smoothing: 0.08
};

export function trackSubject(subjectY: number): void {
  cameraSpec.offset = [0, subjectY * 0.5, 0];
  cameraSpec.distance = 6.4;
  cameraSpec.smoothing = 0.16;
}
