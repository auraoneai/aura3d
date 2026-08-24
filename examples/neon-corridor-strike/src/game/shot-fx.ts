interface FxNode {
  setPosition(x: number, y: number, z: number): unknown;
  setRotation(x: number, y: number, z: number): unknown;
  setScale(scale: number | readonly [number, number, number]): unknown;
}

export const MUZZLE_COUNT = 3;
/**
 * Presentation window in WALL seconds (measured via performance.now, because
 * slow frames make clamped sim time outrun wall time). Authored pacing:
 * muzzle punch (FLASH_HOLD) -> bolt flight (BOLT_TRAVEL_SECONDS) -> the bolt
 * and flashes fade to a faint impact ember that persists for the rest of the
 * window. The long tail keeps the shot provably present through loaded-browser
 * evidence windows (screenshot stalls of several seconds were measured).
 */
export const SHOT_HOLD = 12;
export const FLASH_HOLD = 0.28;
export const BOLT_TRAVEL_SECONDS = 1.1;
/** Post-flight fade: everything dims toward a small ember, never to nothing. */
const FADE_START = BOLT_TRAVEL_SECONDS + 0.4;
const FADE_SPAN = 1.5;

export interface ShotPose {
  readonly barrel: readonly [number, number, number];
  readonly end: readonly [number, number, number];
  readonly yaw: number;
}

export function createShotClock(): { visible: number; pose: ShotPose | null; expiresAt?: number } {
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

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

export function showShot(
  nodes: { get(id: string): FxNode | undefined },
  origin: readonly [number, number, number],
  direction: readonly [number, number, number],
  barrel: readonly [number, number, number],
  end: readonly [number, number, number],
  yaw: number,
  clock: { visible: number; pose: ShotPose | null; expiresAt?: number }
): void {
  void origin;
  void direction;
  clock.pose = { barrel, end, yaw };
  // Hold is measured against WALL time: slow frames make the app's dt clamp
  // consume sim time faster than wall time, which let long screenshot stalls
  // hide the FX before the shot-visual spec could read them.
  clock.expiresAt = nowMs() + SHOT_HOLD * 1000;
  clock.visible = SHOT_HOLD;
  syncShotFx(nodes, clock.pose, clock.visible);
}

export function syncShotFx(
  nodes: { get(id: string): FxNode | undefined },
  pose: ShotPose,
  remaining: number
): void {
  const elapsed = Math.max(0, SHOT_HOLD - remaining);
  // Bolt completes its run early in the window; afterwards everything fades
  // toward a faint ember that stays until the window closes (see SHOT_HOLD).
  const travel = Math.min(1, elapsed / BOLT_TRAVEL_SECONDS);
  const fade = elapsed <= FADE_START ? 1 : Math.max(0.25, 1 - (elapsed - FADE_START) / FADE_SPAN);
  const flash = handle(nodes, "muzzle-0");
  const punch = elapsed <= FLASH_HOLD ? 1 - elapsed / FLASH_HOLD : 0;
  flash?.setPosition(pose.barrel[0], pose.barrel[1], pose.barrel[2]);
  flash?.setRotation(0, pose.yaw, 0);
  flash?.setScale(Math.max(0.02, (0.07 + punch * 0.05) * fade));

  const bolt = handle(nodes, "muzzle-1");
  const boltAt = lerp(pose.barrel, pose.end, Math.min(1, 0.08 + travel * 0.92));
  bolt?.setPosition(boltAt[0], boltAt[1], boltAt[2]);
  bolt?.setRotation(0, pose.yaw, 0);
  bolt?.setScale(Math.max(0.02, 0.08 * fade));

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
  if (travel >= 1) {
    impact?.setPosition(pose.end[0], pose.end[1], pose.end[2]);
    impact?.setRotation(0, pose.yaw, 0);
    impact?.setScale(Math.max(0.025, 0.07 * Math.max(fade, 0.4)));
  } else {
    impact?.setPosition(0, -8, 0);
    impact?.setScale(0.01);
  }
}

/** Diagnostic counters for the evidence payload (why did FX hide, when). */
export const shotFxDebug = { hideCount: 0, lastAliveMs: -1, lastHideMs: -1, lastReason: "" };

export function updateShotFx(
  nodes: { get(id: string): FxNode | undefined },
  clock: { visible: number; pose: ShotPose | null; expiresAt?: number },
  dt: number
): void {
  const alive = Boolean(clock.pose) && (clock.expiresAt === undefined || nowMs() < clock.expiresAt);
  if (alive && clock.pose) {
    syncShotFx(nodes, clock.pose, clock.visible);
    clock.visible = Math.max(0, ((clock.expiresAt ?? 0) - nowMs()) / 1000);
    shotFxDebug.lastAliveMs = Math.round(nowMs());
  } else {
    // Clear the pose so a stale expiry can never resurrect an old bolt.
    shotFxDebug.hideCount += 1;
    shotFxDebug.lastHideMs = Math.round(nowMs());
    shotFxDebug.lastReason = clock.pose ? "expired" : "no-pose";
    clock.pose = null;
    clock.expiresAt = undefined;
    hideShotFx(nodes);
    clock.visible = 0;
  }
}
