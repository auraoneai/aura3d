/**
 * Gridlock Courier (GU47 WP-28 GC-V2): the drop-off address board, an SDF "DROP-OFF" sign on a dark teal panel
 * hung on the beacon pillar above the pad, turned to face the chase camera every frame (yaw only).
 *
 * Text geometry is built once (text3D, SDF backend), so the board names the drop-off and the HUD job line carries
 * the distance and job clock. Two draws, both moved with the job; hidden under the road with no open job.
 */
export const BOARD = { text: "DROP-OFF", size: 1.5, y: 9, offset: 1.4, panel: [11.2, 2.4, 0.18] as const } as const;

/** Board pose next to a drop-off at (x, z), facing the eye; the panel stands `offset` m toward the eye off the pillar. */
export function boardPose(job: { x: number; z: number } | null, eye: readonly [number, number, number]): { x: number; y: number; z: number; yaw: number } {
  if (!job) return { x: 0, y: -60, z: 0, yaw: 0 };
  const dx = eye[0] - job.x, dz = eye[2] - job.z;
  const len = Math.hypot(dx, dz);
  const ux = len > 1e-6 ? dx / len : 0, uz = len > 1e-6 ? dz / len : 1;
  return { x: job.x + ux * BOARD.offset, y: BOARD.y, z: job.z + uz * BOARD.offset, yaw: Math.atan2(ux, uz) };
}

/** Width of `text3D` block glyphs (5 x 7 cells, advance 5 cells plus the default 0.14 size spacing), metres. */
export function textWidth(text: string, size: number): number {
  const cell = size / 7;
  const spacing = size * 0.14;
  let w = 0;
  for (const ch of text) w += ch === " " ? size * 0.5 + spacing : cell * 5 + spacing;
  return Math.max(0, w - spacing);
}

/** Where the text node's origin (its lower-left glyph corner) goes so the text is centred on the panel's face. */
export function textOrigin(pose: { x: number; y: number; z: number; yaw: number }, width: number, size: number): [number, number, number] {
  const rx = Math.cos(pose.yaw), rz = -Math.sin(pose.yaw);
  const fx = Math.sin(pose.yaw), fz = Math.cos(pose.yaw);
  const front = BOARD.panel[2] / 2 + 0.01;
  return [pose.x - rx * (width / 2) + fx * front, pose.y - size / 2, pose.z - rz * (width / 2) + fz * front];
}
