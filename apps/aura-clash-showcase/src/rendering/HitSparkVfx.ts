export type HitSparkKind = "light" | "heavy" | "special" | "guard" | "ko";

export interface HitSparkFrame {
  kind: HitSparkKind;
  label: string;
  color: string;
  secondaryColor: string;
  durationMs: number;
  radiusPx: number;
  shake: number;
  reducedMotionShake: number;
}

export interface HitboxDebugVolumeStyle {
  readonly id: "active-hitbox" | "hurtbox" | "guardbox" | "pushbox";
  readonly label: string;
  readonly visibleInNormalPlay: false;
  readonly visibleWhenDebugEnabled: true;
  readonly color: string;
  readonly outline: string;
}

export interface HitboxDebugOverlayContract {
  readonly kind: "aura-clash-hitbox-debug-overlay";
  readonly engineOverlay: "game.fighting().debugHitboxOverlay";
  readonly normalPlayVisible: false;
  readonly debugPlayVisible: true;
  readonly volumes: readonly HitboxDebugVolumeStyle[];
}

export const hitSparkFrames: Record<HitSparkKind, HitSparkFrame> = {
  light: {
    kind: "light",
    label: "Light hit spark",
    color: "#fbffbf",
    secondaryColor: "#41ffad",
    durationMs: 120,
    radiusPx: 90,
    shake: 2,
    reducedMotionShake: 0,
  },
  heavy: {
    kind: "heavy",
    label: "Heavy hit burst",
    color: "#ffe18e",
    secondaryColor: "#ff6b40",
    durationMs: 170,
    radiusPx: 140,
    shake: 6,
    reducedMotionShake: 1,
  },
  special: {
    kind: "special",
    label: "Aura Burst flash",
    color: "#ffffff",
    secondaryColor: "#32ff9f",
    durationMs: 260,
    radiusPx: 220,
    shake: 10,
    reducedMotionShake: 1,
  },
  guard: {
    kind: "guard",
    label: "Guard shield ring",
    color: "#7de2ff",
    secondaryColor: "#c7fff0",
    durationMs: 150,
    radiusPx: 115,
    shake: 1,
    reducedMotionShake: 0,
  },
  ko: {
    kind: "ko",
    label: "Round finish flare",
    color: "#fff4b8",
    secondaryColor: "#32ff9f",
    durationMs: 420,
    radiusPx: 280,
    shake: 12,
    reducedMotionShake: 2,
  },
};

export const auraClashHitboxDebugOverlay: HitboxDebugOverlayContract = {
  kind: "aura-clash-hitbox-debug-overlay",
  engineOverlay: "game.fighting().debugHitboxOverlay",
  normalPlayVisible: false,
  debugPlayVisible: true,
  volumes: [
    {
      id: "active-hitbox",
      label: "Active attack hitbox",
      visibleInNormalPlay: false,
      visibleWhenDebugEnabled: true,
      color: "#ff6b40",
      outline: "#fff4b8"
    },
    {
      id: "hurtbox",
      label: "Fighter hurtbox",
      visibleInNormalPlay: false,
      visibleWhenDebugEnabled: true,
      color: "#62d8ff",
      outline: "#d9fbff"
    },
    {
      id: "guardbox",
      label: "Guard volume",
      visibleInNormalPlay: false,
      visibleWhenDebugEnabled: true,
      color: "#7de2ff",
      outline: "#c7fff0"
    },
    {
      id: "pushbox",
      label: "Body pushbox",
      visibleInNormalPlay: false,
      visibleWhenDebugEnabled: true,
      color: "#a16eff",
      outline: "#f0dbff"
    }
  ]
};

export function getAuraClashHitboxDebugOverlay(options?: { enabled?: boolean }): HitboxDebugOverlayContract & {
  readonly enabled: boolean;
  readonly visibleVolumes: readonly HitboxDebugVolumeStyle[];
} {
  const enabled = Boolean(options?.enabled);
  return {
    ...auraClashHitboxDebugOverlay,
    enabled,
    visibleVolumes: enabled ? auraClashHitboxDebugOverlay.volumes : []
  };
}

export function getHitSparkFrame(kind: HitSparkKind, options?: { reducedMotion?: boolean; reducedFlash?: boolean }): HitSparkFrame {
  const frame = hitSparkFrames[kind];

  if (!options?.reducedMotion && !options?.reducedFlash) {
    return frame;
  }

  return {
    ...frame,
    durationMs: options.reducedFlash ? Math.max(80, Math.round(frame.durationMs * 0.62)) : frame.durationMs,
    radiusPx: options.reducedFlash ? Math.round(frame.radiusPx * 0.55) : frame.radiusPx,
    shake: options.reducedMotion ? frame.reducedMotionShake : frame.shake,
  };
}
