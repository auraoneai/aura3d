/**
 * §5.3 — flag states and defaults. Custodian-owned (PRD 15 / G5).
 *
 * Owner decision 2026-10-11 (#839): no checkpoint wait. A flag moves to
 * `default-on` in its own PR as soon as its GPU (L4) screenshots render
 * correctly, score above flags-off, and the `all` run stays green; the PR
 * carries the before/after pair. `default-on` is honoured by resolveQrFlags:
 * the flag is on unless a source sets it explicitly (`none`, `-x`, `=0`).
 */

import type { QrFlagName } from "./core";

export type QrFlagState = "dev" | "standalone-accepted" | "integrated-accepted" | "default-on" | "removed";

export const QR_FLAG_STATES: Readonly<Partial<Record<QrFlagName, QrFlagState>>> = {
  // Promoted 2026-10-11 (owner rule): GPU L4 promote run 38172695387 on
  // 1102f10ae, PASS, mean LPIPS vs three.js 0.0750 -> 0.0573, 0 regressed beyond noise.
  A3D_QR_CORE: "default-on",
  // Promoted 2026-10-11 (owner rule): GPU L4 promote run 38159877336 on
  // 8b38273f, PASS, mean LPIPS vs three.js 0.1972 -> 0.1785, 0 regressed.
  A3D_QR_LIGHTING: "default-on",
  // Promoted 2026-10-11 (owner rule): GPU L4 promote run 38210220126 on
  // 154cb93f5, PASS, mean LPIPS vs three.js 0.0444 -> 0.0441, 0 regressed.
  A3D_QR_POST: "default-on",
  // Promoted 2026-10-11 (owner rule): GPU L4 promote run 38197365077 on
  // e0701cccd, PASS, mean LPIPS vs three.js 0.1684 -> 0.1630 over 30 scenes, 0 regressed.
  A3D_QR_MATERIALS: "default-on",
  // Promoted 2026-10-11 (owner rule): GPU L4 promote run 38198433913 on
  // b596b4a81, PASS, mean LPIPS vs three.js 0.1684 -> 0.1111 over 24 scenes, 0 regressed.
  A3D_QR_ASSETS: "default-on",
  // Promoted 2026-10-12 (owner rule): GPU L4 promote run 38210437847 on
  // 86dad98c8, PASS, mean LPIPS vs three.js 0.0506 -> 0.0502 over 21 scenes, 0 regressed.
  A3D_QR_ANIMATION: "default-on",
  // Promoted 2026-10-12 (owner rule): GPU L4 promote run 38226517198 on
  // 17c57cf5d, PASS, mean LPIPS vs three.js 0.1158 -> 0.0950 over 34 scenes, 0 regressed.
  A3D_QR_VFX: "default-on",
  A3D_QR_CAMERA: "default-on",
  A3D_QR_GAME: "dev",
  A3D_QR_WORLD: "dev",
  A3D_QR_TIERS: "dev",
  A3D_QR_WEBGPU: "dev",
  A3D_QR_LOOKS: "dev",
  // Promoted 2026-10-13 (owner rule): GPU L4 promote run 38455588100 on
  // 0b97a9305, PASS, mean LPIPS vs three.js 0.0368 -> 0.0367 over 19 scenes, 0 regressed.
  A3D_QR_COMPILER: "default-on",
  A3D_QR_STRICT: "dev"
};

/** §5.4 — flags removed after two consecutive default-on checkpoints. */
export const REMOVED_QR_FLAGS: readonly QrFlagName[] = [];
