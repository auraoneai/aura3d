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
export const FLASH_HOLD = 0.34;
export const BOLT_TRAVEL_SECONDS = 0.72;
/** Post-flight fade: everything dims toward a small ember, never to nothing. */
const FADE_START = BOLT_TRAVEL_SECONDS + 0.4;
const FADE_SPAN = 1.5;

export interface ShotPose {
  readonly barrel: readonly [number, number, number];
  readonly end: readonly [number, number, number];
  readonly yaw: number;
  readonly pitch: number;
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
  pitch: number,
  clock: { visible: number; pose: ShotPose | null; expiresAt?: number }
): void {
  void origin;
  void direction;
  clock.pose = { barrel, end, yaw, pitch };
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
  flash?.setRotation(pose.pitch, pose.yaw, 0);
  // Keep the flash attached to the typed rifle. Its small ice-white core is
  // readable against the warm Warden mask without becoming an accessibility-
  // hostile full-frame blink.
  const flashRadius = Math.max(0.014, (0.03 + punch * 0.02) * fade);
  flash?.setScale([flashRadius, flashRadius, flashRadius * 3.4]);

  const bolt = handle(nodes, "muzzle-1");
  const boltAt = lerp(pose.barrel, pose.end, Math.min(0.88, 0.48 + travel * 0.4));
  bolt?.setPosition(boltAt[0], boltAt[1], boltAt[2]);
  bolt?.setRotation(pose.pitch, pose.yaw, 0);
  // The blue-white bolt carries the player-action read through the center of
  // the lane, while the visible target remains the warmer, larger Warden.
  const boltRadius = Math.max(0.02, 0.046 * fade);
  bolt?.setScale([boltRadius, boltRadius, boltRadius * 3.8]);

  const tracer = handle(nodes, "muzzle-2");
  const tracerAt = lerp(pose.barrel, pose.end, Math.min(0.5, 0.2 + travel * 0.3));
  tracer?.setPosition(tracerAt[0], tracerAt[1], tracerAt[2]);
  tracer?.setRotation(pose.pitch, pose.yaw, 0);
  // This is a compact second pulse, not a stretched beam. Together with the
  // muzzle core, lead bolt, and endpoint ring it makes one readable causal
  // chain while keeping the target and corridor visible between the pulses.
  tracer?.setScale([0.03 * fade, 0.03 * fade, 0.34 * fade]);

  const impact = handle(nodes, "shot-impact");
  // Hitscan resolves immediately, so the endpoint fracture belongs on screen
  // immediately too; the travelling bolt is presentation, not hit authority.
  // Torus normal is +Y, hence the quarter-turn before yaw/pitch aligns its open
  // face with the firing ray instead of showing the player an edge-on sliver.
  impact?.setPosition(pose.end[0], pose.end[1], pose.end[2]);
  impact?.setRotation(pose.pitch + Math.PI / 2, pose.yaw, 0);
  impact?.setScale(Math.max(0.18, (0.2 + travel * 0.06) * Math.max(fade, 0.8)));
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
