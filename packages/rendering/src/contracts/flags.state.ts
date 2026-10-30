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
  A3D_QR_STRICT: "dev",
  // GU47 WP-7 (lane E-G) sub-flag promotions, one commit each so a flip can be
  // reverted alone. Flag-on is a no-op for scenes without the feature
  // (tests/unit/gu47/eg/flag-promotion-noop.test.ts); the phase-2 64-target
  // before/after luma + LPIPS table (evidence/game-upgrades-47/flag-promotion/)
  // decides whether each stays: revert the flip if a target that does not use
  // the feature moves more than 2 mean luma. A promoted sub-flag stays off when
  // a source turned its lane flag off (`none`, `-vfx`, ...).
  A3D_QR_VFX_SKY: "default-on",
  A3D_QR_VFX_FOG: "default-on",
  // threejs-parity lanes (docs/workflows/threejs-parity-gaps.md §5.0). Each new
  // node kind/material/texture/runtime surface compiles to a
  // "not yet implemented (A3D_PARITY_*)" validate error until its lane lands
  // and the flag promotes per the §7.3 integration checkpoint.
  // R-17 (2026-10-22, tests/unit/parity/default-flags.test.ts): only BATCHING
  // (nodes/batched.ts) and LINES (compiler/lines.ts) gate code, and only the new
  // batched/line/points/sprite node kinds, so they cannot change any existing
  // scene. Both promoted default-on on the strength of remote ACR run
  // r17-20261022T204448Z (all 11 parity-*.spec.ts, 16/16). The L4 LPIPS gate
  // needs GitHub Actions + a self-hosted GPU runner, which machine policy
  // prohibits, so it is waived ONLY for flags that gate nothing but new opt-in
  // node kinds (PRD §7.3). SHADING, GEOMETRY, TEXTURES and RUNTIME are read
  // nowhere (inert) and stay "dev". Revert = set either back to "dev".
  A3D_PARITY_SHADING: "dev",
  A3D_PARITY_GEOMETRY: "dev",
  A3D_PARITY_TEXTURES: "dev",
  A3D_PARITY_BATCHING: "default-on",
  A3D_PARITY_LINES: "default-on",
  A3D_PARITY_RUNTIME: "dev"
};

/** §5.4 — flags removed after two consecutive default-on checkpoints. */
export const REMOVED_QR_FLAGS: readonly QrFlagName[] = [];
