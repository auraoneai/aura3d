interface FxNode {
  setPosition(x: number, y: number, z: number): unknown;
  setRotation(x: number, y: number, z: number): unknown;
  setScale(scale: number | readonly [number, number, number]): unknown;
}

export const MUZZLE_COUNT = 3;
export const SHOT_HOLD = 0.85;
export const FLASH_HOLD = 0.28;

export interface ShotPose {
  readonly barrel: readonly [number, number, number];
  readonly end: readonly [number, number, number];
  readonly yaw: number;
}

export function createShotClock(): { visible: number; pose: ShotPose | null } {
  return { visible: 0, pose: null };
}

function handle(nodes: { get(id: string): FxNode | undefined }, id: string): FxNode | undefined {
  return nodes.get(id);
}

function lerp(
  from: readonly [number, number, number],
  to: readonly [number, number, number],
  t: number
): readonly [number, number, number] {
  const clamped = Math.min(1, Math.max(0, t));
  return [
    from[0] + (to[0] - from[0]) * clamped,
    from[1] + (to[1] - from[1]) * clamped,
    from[2] + (to[2] - from[2]) * clamped
  ];
}

export function hideShotFx(nodes: { get(id: string): FxNode | undefined }): void {
  for (const id of ["muzzle-0", "muzzle-1", "muzzle-2", "shot-impact"] as const) {
    handle(nodes, id)?.setPosition(0, -8, 0);
  }
  handle(nodes, "muzzle-0")?.setScale(0.02);
  handle(nodes, "muzzle-1")?.setScale(0.02);
  handle(nodes, "shot-impact")?.setScale(0.02);
}

export function showShot(
  nodes: { get(id: string): FxNode | undefined },
  origin: readonly [number, number, number],
  direction: readonly [number, number, number],
  barrel: readonly [number, number, number],
  end: readonly [number, number, number],
  yaw: number,
  clock: { visible: number; pose: ShotPose | null }
): void {
  void origin;
  void direction;
  clock.pose = { barrel, end, yaw };
  clock.visible = SHOT_HOLD;
  syncShotFx(nodes, clock.pose, clock.visible);
}

export function syncShotFx(
  nodes: { get(id: string): FxNode | undefined },
  pose: ShotPose,
  remaining: number
): void {
  const elapsed = Math.max(0, SHOT_HOLD - remaining);
  const travel = Math.min(1, elapsed / SHOT_HOLD);
  const flash = handle(nodes, "muzzle-0");
  const punch = elapsed <= FLASH_HOLD ? 1 - elapsed / FLASH_HOLD : 0;
  flash?.setPosition(pose.barrel[0], pose.barrel[1], pose.barrel[2]);
  flash?.setRotation(0, pose.yaw, 0);
  flash?.setScale(0.07 + punch * 0.05);

  const bolt = handle(nodes, "muzzle-1");
  const boltAt = lerp(pose.barrel, pose.end, Math.min(1, 0.08 + travel * 0.92));
  bolt?.setPosition(boltAt[0], boltAt[1], boltAt[2]);
  bolt?.setRotation(0, pose.yaw, 0);
  bolt?.setScale(0.08);

  const tracer = handle(nodes, "muzzle-2");
  const forwardX = -Math.sin(pose.yaw);
  const forwardZ = -Math.cos(pose.yaw);
  tracer?.setPosition(
    pose.barrel[0] + forwardX * 0.85,
    pose.barrel[1],
    pose.barrel[2] + forwardZ * 0.85
  );
  tracer?.setRotation(0, pose.yaw, 0);

  const impact = handle(nodes, "shot-impact");
  if (travel >= 0.88) {
    impact?.setPosition(pose.end[0], pose.end[1], pose.end[2]);
    impact?.setRotation(0, pose.yaw, 0);
    impact?.setScale(0.07);
  } else {
    impact?.setPosition(0, -8, 0);
    impact?.setScale(0.01);
  }
}

export function updateShotFx(
  nodes: { get(id: string): FxNode | undefined },
  clock: { visible: number; pose: ShotPose | null },
  dt: number
): void {
  if (clock.visible > 0 && clock.pose) {
    syncShotFx(nodes, clock.pose, clock.visible);
  } else {
    hideShotFx(nodes);
  }
  clock.visible = Math.max(0, clock.visible - dt);
}
