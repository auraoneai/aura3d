export type SkylineStatus = "playing" | "completed";

export interface SkylineVec2 {
  readonly x: number;
  readonly y: number;
}

export interface SkylineRect {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SkylineMovingPlatform extends SkylineRect {
  readonly axis: "x" | "y";
  readonly amplitude: number;
  readonly period: number;
  readonly phase: number;
}

export interface SkylineCoin extends SkylineVec2 {
  readonly id: string;
  readonly value: number;
}

export interface SkylineDrone {
  readonly id: string;
  readonly baseX: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly amplitude: number;
  readonly period: number;
  readonly phase: number;
}

export interface SkylineCheckpoint extends SkylineVec2 {
  readonly id: string;
}

export interface SkylineLevel {
  readonly id: string;
  readonly version: string;
  readonly width: number;
  readonly lowerBound: number;
  readonly gravity: number;
  readonly coyoteSeconds: number;
  readonly jumpBufferSeconds: number;
  readonly player: {
    readonly width: number;
    readonly height: number;
    readonly moveSpeed: number;
    readonly dashSpeed: number;
    readonly jumpVelocity: number;
  };
  readonly start: SkylineVec2;
  readonly finish: SkylineVec2;
  readonly platforms: readonly SkylineRect[];
  readonly movingPlatforms: readonly SkylineMovingPlatform[];
  readonly coins: readonly SkylineCoin[];
  readonly drones: readonly SkylineDrone[];
  readonly checkpoints: readonly SkylineCheckpoint[];
}

export interface SkylineSnapshot {
  readonly status: SkylineStatus;
  readonly frame: number;
  readonly time: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly grounded: boolean;
  readonly checkpointId: string;
  readonly score: number;
  readonly deaths: number;
  readonly coins: number;
  readonly defeatedDrones: number;
}

export interface SkylineStepEvent {
  readonly type:
    | "jump"
    | "land"
    | "coin"
    | "checkpoint"
    | "dash"
    | "stomp"
    | "hit"
    | "fall"
    | "respawn"
    | "complete";
  readonly id?: string;
  readonly x: number;
  readonly y: number;
  readonly frame: number;
}

export interface SkylineCompletionProof {
  readonly kind: "skyline-runner-completion-proof";
  readonly levelId: string;
  readonly levelVersion: string;
  readonly source: "game.platformer";
  readonly fps: number;
  readonly completed: boolean;
  readonly stable: boolean;
  readonly checksum: string;
  readonly repeatedChecksum: string;
  readonly finalFrame: number;
  readonly finalTime: number;
  readonly finalSnapshot: SkylineSnapshot;
  readonly collectedCoins: number;
  readonly defeatedDrones: number;
  readonly checkpoints: readonly string[];
  readonly eventCounts: Record<string, number>;
  readonly sampledFrames: readonly SkylineSnapshot[];
}

export const SKYLINE_LEVEL: SkylineLevel = {
  id: "showcase-skyline-runner",
  version: "2026-06-20.side-scroller-world-long-route-pass",
  width: 38.2,
  lowerBound: -1.55,
  gravity: -20.2,
  coyoteSeconds: 0.16,
  jumpBufferSeconds: 0.17,
  player: {
    width: 0.44,
    height: 1.05,
    moveSpeed: 1.15,
    dashSpeed: 2.15,
    jumpVelocity: 8.75
  },
  start: { x: 0.65, y: 0.34 },
  finish: { x: 36.65, y: 0.34 },
  platforms: [
    { id: "skyline-main-runway", x: 0, y: 0, width: 38.2, height: 0.36 },
    { id: "start-grass-run", x: 0, y: 0, width: 5.85, height: 0.36 },
    { id: "mushroom-step", x: 5.62, y: 0.18, width: 2.7, height: 0.34 },
    { id: "coin-bridge", x: 8.05, y: 0.02, width: 4.95, height: 0.36 },
    { id: "sky-stone-ledge", x: 12.65, y: 0.36, width: 2.85, height: 0.34 },
    { id: "market-drop", x: 15.05, y: 0.14, width: 2.85, height: 0.34 },
    { id: "flag-run", x: 17.55, y: 0, width: 3.85, height: 0.36 },
    { id: "forest-climb", x: 21.65, y: 0.12, width: 3.85, height: 0.36 },
    { id: "tower-terrace", x: 25.25, y: 0.52, width: 3.2, height: 0.34 },
    { id: "cloud-bridge", x: 28.15, y: 0.28, width: 3.45, height: 0.34 },
    { id: "ridge-gap", x: 31.15, y: 0.04, width: 2.95, height: 0.36 },
    { id: "finish-balcony", x: 34.25, y: 0, width: 3.95, height: 0.36 },
    { id: "bonus-block-01", x: 2.45, y: 1.12, width: 1.4, height: 0.24 },
    { id: "bonus-block-02", x: 9.8, y: 1.04, width: 1.45, height: 0.24 },
    { id: "bonus-block-03", x: 16.6, y: 1.16, width: 1.25, height: 0.24 },
    { id: "bonus-block-04", x: 24.15, y: 1.42, width: 1.34, height: 0.24 },
    { id: "bonus-block-05", x: 30.5, y: 1.28, width: 1.38, height: 0.24 },
    { id: "bonus-block-06", x: 35.35, y: 1.18, width: 1.18, height: 0.24 }
  ],
  movingPlatforms: [
    { id: "waterfall-lift", x: 11.62, y: 0.62, width: 1.3, height: 0.22, axis: "y", amplitude: 0.18, period: 2.4, phase: 0.15 },
    { id: "flag-shuttle", x: 16.72, y: 0.64, width: 1.28, height: 0.22, axis: "x", amplitude: 0.32, period: 2.8, phase: 0.5 },
    { id: "ridge-lift", x: 27.45, y: 1.0, width: 1.34, height: 0.22, axis: "y", amplitude: 0.2, period: 2.55, phase: 0.22 },
    { id: "finish-shuttle", x: 33.15, y: 0.76, width: 1.42, height: 0.22, axis: "x", amplitude: 0.36, period: 2.9, phase: 0.64 }
  ],
  coins: [
    { id: "coin-01", x: 1.45, y: 1.08, value: 50 },
    { id: "coin-02", x: 2.55, y: 1.56, value: 75 },
    { id: "coin-03", x: 3.55, y: 1.56, value: 75 },
    { id: "coin-04", x: 6.25, y: 1.28, value: 50 },
    { id: "coin-05", x: 7.35, y: 1.28, value: 50 },
    { id: "coin-06", x: 9.35, y: 1.08, value: 50 },
    { id: "coin-07", x: 10.45, y: 1.44, value: 75 },
    { id: "coin-08", x: 11.65, y: 1.22, value: 75 },
    { id: "coin-09", x: 13.55, y: 1.36, value: 100 },
    { id: "coin-10", x: 14.62, y: 1.36, value: 100 },
    { id: "coin-11", x: 16.35, y: 1.02, value: 50 },
    { id: "coin-12", x: 17.35, y: 1.52, value: 100 },
    { id: "coin-13", x: 18.55, y: 1.08, value: 75 },
    { id: "coin-14", x: 19.45, y: 1.08, value: 150 },
    { id: "coin-15", x: 22.25, y: 1.16, value: 75 },
    { id: "coin-16", x: 23.35, y: 1.46, value: 100 },
    { id: "coin-17", x: 24.45, y: 1.46, value: 100 },
    { id: "coin-18", x: 26.15, y: 1.78, value: 150 },
    { id: "coin-19", x: 27.52, y: 1.56, value: 100 },
    { id: "coin-20", x: 29.4, y: 1.32, value: 75 },
    { id: "coin-21", x: 30.55, y: 1.58, value: 100 },
    { id: "coin-22", x: 32.15, y: 1.02, value: 75 },
    { id: "coin-23", x: 34.75, y: 1.2, value: 100 },
    { id: "coin-24", x: 36.25, y: 1.12, value: 150 }
  ],
  drones: [
    { id: "drone-01", baseX: 7.0, y: 4.35, width: 0.46, height: 0.34, amplitude: 0.38, period: 2.2, phase: 0.18 },
    { id: "drone-02", baseX: 14.35, y: 4.15, width: 0.48, height: 0.36, amplitude: 0.42, period: 2.35, phase: 0.51 },
    { id: "drone-03", baseX: 18.25, y: 3.85, width: 0.48, height: 0.36, amplitude: 0.4, period: 2.15, phase: 0.08 },
    { id: "drone-04", baseX: 25.65, y: 4.1, width: 0.48, height: 0.36, amplitude: 0.4, period: 2.25, phase: 0.35 },
    { id: "drone-05", baseX: 32.45, y: 4.0, width: 0.48, height: 0.36, amplitude: 0.44, period: 2.2, phase: 0.72 }
  ],
  checkpoints: [
    { id: "checkpoint-bridge", x: 8.62, y: 0.72 },
    { id: "checkpoint-ledge", x: 13.85, y: 0.94 },
    { id: "checkpoint-flag", x: 18.4, y: 0.72 },
    { id: "checkpoint-forest", x: 23.85, y: 0.76 },
    { id: "checkpoint-ridge", x: 30.1, y: 0.92 },
    { id: "checkpoint-finale", x: 35.35, y: 0.72 }
  ]
} as const;

export function movingPlatformRectsAt(time: number, level: SkylineLevel = SKYLINE_LEVEL): readonly SkylineRect[] {
  return level.movingPlatforms.map((platform) => {
    const phase = ((time / platform.period) + platform.phase) * Math.PI * 2;
    const offset = Math.sin(phase) * platform.amplitude;
    return {
      id: platform.id,
      x: platform.axis === "x" ? platform.x + offset : platform.x,
      y: platform.axis === "y" ? platform.y + offset : platform.y,
      width: platform.width,
      height: platform.height
    };
  });
}

export function droneRectAt(drone: SkylineDrone, time: number): SkylineRect {
  const phase = ((time / drone.period) + drone.phase) * Math.PI * 2;
  return {
    id: drone.id,
    x: drone.baseX + Math.sin(phase) * drone.amplitude - drone.width / 2,
    y: drone.y,
    width: drone.width,
    height: drone.height
  };
}

export function skylineChecksum(value: unknown): string {
  const json = JSON.stringify(stableValue(value));
  let hash = 2166136261;
  for (let index = 0; index < json.length; index += 1) {
    hash ^= json.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return Object.keys(record)
    .sort()
    .reduce<Record<string, unknown>>((sorted, key) => {
      sorted[key] = stableValue(record[key]);
      return sorted;
    }, {});
}
