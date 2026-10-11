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
  A3D_QR_CORE: "dev",
  // Promoted 2026-10-11 (owner rule): GPU L4 promote run 38159877336 on
  // 8b38273f, PASS, mean LPIPS vs three.js 0.1972 -> 0.1785, 0 regressed.
  A3D_QR_LIGHTING: "default-on",
  A3D_QR_POST: "dev",
  A3D_QR_MATERIALS: "dev",
  A3D_QR_ASSETS: "dev",
  A3D_QR_ANIMATION: "dev",
  A3D_QR_VFX: "dev",
  A3D_QR_CAMERA: "default-on",
  A3D_QR_GAME: "dev",
  A3D_QR_WORLD: "dev",
  A3D_QR_TIERS: "dev",
  A3D_QR_WEBGPU: "dev",
  A3D_QR_LOOKS: "dev",
  A3D_QR_COMPILER: "dev",
  A3D_QR_STRICT: "dev"
};

/** §5.4 — flags removed after two consecutive default-on checkpoints. */
export const REMOVED_QR_FLAGS: readonly QrFlagName[] = [];
