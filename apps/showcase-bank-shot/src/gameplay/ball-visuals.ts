// apps/showcase-bank-shot/src/gameplay/ball-visuals.ts — PRD-14 T1.12 (Bank Shot).
// Pure quaternion->euler conversion for ball visual shells. Matches the engine's
// intrinsic-XYZ convention (eulerToQuat / quatToEuler in agent-api).
export function ballEulerFromBody(q: readonly [number, number, number, number]): readonly [number, number, number] {
  const [x, y, z, w] = q;
  const sinrCosp = 2 * (w * x + y * z);
  const cosrCosp = 1 - 2 * (x * x + y * y);
  const roll = Math.atan2(sinrCosp, cosrCosp);
  const sinp = 2 * (w * y - z * x);
  const pitch = Math.abs(sinp) >= 1 ? Math.sign(sinp) * Math.PI / 2 : Math.asin(sinp);
  const sinyCosp = 2 * (w * z + x * y);
  const cosyCosp = 1 - 2 * (y * y + z * z);
  const yaw = Math.atan2(sinyCosp, cosyCosp);
  return [roll, pitch, yaw];
}
