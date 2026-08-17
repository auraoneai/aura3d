interface FxNode {
  setPosition(x: number, y: number, z: number): unknown;
  setRotation(x: number, y: number, z: number): unknown;
  setScale(scale: number | readonly [number, number, number]): unknown;
}

export const MUZZLE_COUNT = 3;
export const SHOT_HOLD = 0.5;

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

export function hideShotFx(nodes: { get(id: string): FxNode | undefined }): void {
  for (let i = 0; i < MUZZLE_COUNT; i += 1) {
    const flash = handle(nodes, `muzzle-${i}`);
    flash?.setPosition(0, -8, 0);
    flash?.setScale(0.02);
  }
  const impact = handle(nodes, "shot-impact");
  impact?.setPosition(0, -8, 0);
  impact?.setScale(0.02);
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
  syncShotFx(nodes, clock.pose);
}

export function syncShotFx(
  nodes: { get(id: string): FxNode | undefined },
  pose: ShotPose
): void {
  const forwardX = -Math.sin(pose.yaw);
  const forwardZ = -Math.cos(pose.yaw);
  const rightX = Math.cos(pose.yaw);
  const rightZ = -Math.sin(pose.yaw);
  const offsets: readonly (readonly [number, number, number])[] = [
    [0, 0, 0],
    [forwardX * 0.05 + rightX * 0.02, 0.03, forwardZ * 0.05 + rightZ * 0.02],
    [forwardX * 0.02 - rightX * 0.04, 0.05, forwardZ * 0.02 - rightZ * 0.04]
  ];
  const sizes = [0.11, 0.075, 0.055];
  for (let i = 0; i < MUZZLE_COUNT; i += 1) {
    const flash = handle(nodes, `muzzle-${i}`);
    const offset = offsets[i] ?? [0, 0, 0];
    flash?.setPosition(pose.barrel[0] + offset[0], pose.barrel[1] + offset[1], pose.barrel[2] + offset[2]);
    flash?.setRotation(0, pose.yaw, 0);
    flash?.setScale(sizes[i] ?? 0.055);
  }
  const impact = handle(nodes, "shot-impact");
  impact?.setPosition(pose.end[0], pose.end[1], pose.end[2]);
  impact?.setRotation(0, pose.yaw, 0);
  impact?.setScale(0.07);
}

export function updateShotFx(
  nodes: { get(id: string): FxNode | undefined },
  clock: { visible: number; pose: ShotPose | null },
  dt: number
): void {
  if (clock.visible > 0 && clock.pose) {
    syncShotFx(nodes, clock.pose);
  } else {
    hideShotFx(nodes);
  }
  clock.visible = Math.max(0, clock.visible - dt);
}
