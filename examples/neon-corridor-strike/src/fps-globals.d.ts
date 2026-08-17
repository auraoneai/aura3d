interface FpsEvidenceGlobal {
  readonly status: string;
  readonly claimLabel: "prototype";
  readonly hp: number;
  readonly ammo: number;
  readonly reserve: number;
  readonly score: number;
  readonly kills: number;
  readonly shotsFired: number;
  readonly hits: number;
  readonly pickups: number;
  readonly resets: number;
  readonly paused: boolean;
  readonly pointerLockRequested: number;
  readonly pointerLockActive: boolean;
  readonly ignoreFireUntil?: number;
  readonly yaw: number;
  readonly pitch: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly grounded: boolean;
  readonly sprinting: boolean;
  readonly objective: string;
  readonly killed: readonly string[];
  readonly collected: readonly string[];
  readonly exitReached: boolean;
  readonly lastHitName: string;
  readonly shotFxVisible?: boolean;
  readonly shotFxNodeCount?: number;
  readonly shotBolt0?: readonly number[];
  readonly enemyVisualY?: number;
  readonly bulletOnBulletContacts: number;
  readonly usedKit: false;
  readonly typedAssets: readonly string[];
  readonly primitiveCount: number;
  readonly rendererMode: string;
  readonly rendererFallback: string;
  readonly knownLimits: readonly string[];
  readonly frame: number;
}

interface Window {
  __AURA3D_FPS_EVIDENCE__?: FpsEvidenceGlobal;
  __AURA3D_ROUTE_READY__?: { readonly ready: boolean; readonly diagnostics?: unknown };
}
