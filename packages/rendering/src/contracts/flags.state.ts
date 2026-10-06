/**
 * §5.3 — flag states and defaults. Custodian-owned (PRD 15): state changes are
 * made only at checkpoints (§7), by the PRD 15 lane, from the checkpoint record.
 */

import type { QrFlagName } from "./core";

export type QrFlagState = "dev" | "standalone-accepted" | "integrated-accepted" | "default-on" | "removed";

export const QR_FLAG_STATES: Readonly<Partial<Record<QrFlagName, QrFlagState>>> = {
  A3D_QR_CORE: "dev",
  A3D_QR_LIGHTING: "dev",
  A3D_QR_POST: "dev",
  A3D_QR_MATERIALS: "dev",
  A3D_QR_ASSETS: "dev",
  A3D_QR_ANIMATION: "dev",
  A3D_QR_VFX: "dev",
  A3D_QR_CAMERA: "dev",
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
