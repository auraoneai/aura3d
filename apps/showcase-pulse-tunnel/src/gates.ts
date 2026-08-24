/**
 * Pulse Tunnel gate spawner — authored chart to moving volumes, collision and
 * graze evaluation at the pass moment.
 *
 * Gates spawn up-tunnel when their chart time approaches, stream toward the player
 * plane at cruise speed, and resolve exactly once as they cross it:
 * collision (shield hit), graze (near-miss inside PULSE_GRAZE_WINDOW), or clean pass.
 * All geometry is expressed by `pulseGateGeometry` so the renderer, the sim, and the
 * unit tests share one source of truth.
 */
import { PULSE_BEAT_SECONDS } from "./beat-clock";
import { PULSE_GRAZE_WINDOW } from "./style";
import type { PulseChartEntry, PulseGateKind } from "./patterns";
import type { PulsePlayerState } from "./player";

export const PULSE_SPAWN_Z = -13.5;
export const PULSE_PLAYER_Z = 1.4;
/** Cruise speed matches style.ts distance pacing so score and world agree. */
export const PULSE_GATE_SPEED = 14;
export const PULSE_GATE_HALF_DEPTH = 0.28;
export const PULSE_PREFLASH_SECONDS = 0.5;
export const PULSE_PLAYER_HALF_WIDTH = 0.16;

export interface PulseGateGeometry {
  readonly centerX: number;
  readonly halfWidth: number;
  readonly bottomY: number;
  readonly topY: number;
}

function laneCenter(lane: number): number {
  return [-0.75, 0, 0.75][Math.max(0, Math.min(2, Math.round(lane)))];
}

function laneBox(lane: number, halfWidth: number, bottomY: number, topY: number): PulseGateGeometry {
  return { centerX: laneCenter(lane), halfWidth, bottomY, topY };
}

/** Seconds a chart beat takes to arrive; chart beats are the shared schedule. */
export function pulseArrivalSeconds(entry: Pick<PulseChartEntry, "beat">): number {
  return entry.beat * PULSE_BEAT_SECONDS;
}

/**
 * Volume for one gate at simulation time `tSeconds` (pylons oscillate between two
 * lanes on a whole-beat period; everything else is static).
 */
export function pulseGateGeometry(
  entry: { kind: PulseGateKind; lane: number; moveTo?: number },
  tSeconds: number
): PulseGateGeometry {
  switch (entry.kind) {
    case "wall":
      return laneBox(entry.lane, 0.36, 0, 1.05);
    case "low":
      return { centerX: 0, halfWidth: 1.15, bottomY: 0, topY: 0.34 };
    case "high":
      return { centerX: 0, halfWidth: 1.15, bottomY: 0.38, topY: 1.05 };
    case "pylon": {
      const from = laneCenter(entry.lane);
      const to = laneCenter(entry.moveTo ?? Math.max(0, Math.min(2, entry.lane === 2 ? entry.lane - 1 : entry.lane + 1)));
      const period = 1; // seconds per full sweep between the two lanes
      const phase = 0.5 * (1 - Math.cos((2 * Math.PI * ((tSeconds % period) / period))));
      return { centerX: from + (to - from) * phase, halfWidth: 0.18, bottomY: 0, topY: 1.05 };
    }
  }
}

export type PulsePassEventType = "collision" | "graze" | "pass";

export interface PulsePassEvent {
  readonly type: PulsePassEventType;
  readonly gateId: string;
  readonly kind: PulseGateKind;
  /** Audio-elapsed seconds this gate's chart beat scheduled. */
  readonly scheduledAudioTime: number;
  /** Audio-elapsed seconds observed at the crossing frame. */
  readonly arrivedAudioTime: number;
  /** Nearest-surface distance at the pass moment (0 for collisions). */
  readonly missDistance: number;
}

export interface ActivePulseGate {
  readonly id: string;
  readonly entry: PulseChartEntry;
  z: number;
  readonly scheduleSeconds: number;
  resolved: boolean;
}

export interface GateSystemOptions {
  readonly chart: readonly PulseChartEntry[];
  /** Scheduler time in seconds (beat clock .time()). */
  readonly getSchedulerTime: () => number;
  /** Audio-context elapsed seconds relative to the run anchor. */
  readonly getAudioElapsed: () => number;
  readonly getPlayer: () => Pick<PulsePlayerState, "x" | "y" | "colliderTop" | "invulnRemaining">;
  readonly onPass?: (event: PulsePassEvent) => void;
  readonly onSpawn?: (gate: ActivePulseGate) => void;
}

export interface GateSystem {
  update(dtSeconds: number): void;
  activeGates(): readonly ActivePulseGate[];
  pendingCount(): number;
  reset(): void;
  preFlashActive(): boolean;
  /** Test-only companion to scheduler seeks: re-space live gates on their schedules. */
  respace(): void;
}

const TRAVEL_SECONDS = (PULSE_PLAYER_Z - PULSE_SPAWN_Z) / PULSE_GATE_SPEED;

export function createGateSystem(options: GateSystemOptions): GateSystem {
  let queue: PulseChartEntry[] = [...options.chart];
  let active: ActivePulseGate[] = [];

  return {
    update(dtSeconds) {
      const schedulerTime = options.getSchedulerTime();
      // Spawn anything whose arrival is within the travel window.
      while (
        queue.length > 0 &&
        schedulerTime + TRAVEL_SECONDS >= pulseArrivalSeconds(queue[0])
      ) {
        const entry = queue.shift()!;
        const gate: ActivePulseGate = {
          id: entry.id,
          entry,
          z: PULSE_SPAWN_Z,
          scheduleSeconds: pulseArrivalSeconds(entry),
          resolved: false
        };
        active.push(gate);
        options.onSpawn?.(gate);
      }

      const player = options.getPlayer();
      for (const gate of active) {
        const prevZ = gate.z;
        gate.z += PULSE_GATE_SPEED * dtSeconds;
        if (!gate.resolved && prevZ < PULSE_PLAYER_Z && gate.z >= PULSE_PLAYER_Z) {
          gate.resolved = true;
          const geometry = pulseGateGeometry(gate.entry, schedulerTime);
          const horizontalGap = Math.max(
            0,
            Math.abs(player.x - geometry.centerX) - (geometry.halfWidth + PULSE_PLAYER_HALF_WIDTH)
          );
          const verticalGap = Math.max(
            0,
            geometry.bottomY - player.colliderTop,
            player.y - geometry.topY
          );
          const collides =
            player.invulnRemaining <= 0 && horizontalGap <= 0 && verticalGap <= 0;
          const missDistance = collides ? 0 : Math.hypot(horizontalGap, verticalGap);
          const type: PulsePassEventType = collides
            ? "collision"
            : missDistance <= PULSE_GRAZE_WINDOW
              ? "graze"
              : "pass";
          options.onPass?.({
            type,
            gateId: gate.id,
            kind: gate.entry.kind,
            scheduledAudioTime: gate.scheduleSeconds,
            arrivedAudioTime: options.getAudioElapsed(),
            missDistance
          });
        }
      }
      // Cull resolved gates once they fall behind the camera plane.
      active = active.filter((gate) => gate.z < PULSE_PLAYER_Z + 3.2);
    },
    activeGates() {
      return [...active];
    },
    pendingCount() {
      return queue.length;
    },
    reset() {
      queue = [...options.chart];
      active = [];
    },
    preFlashActive() {
      return active.some((gate) => {
        if (gate.resolved) return false;
        // Gates stream toward +z; remaining seconds shrink as z closes on the player.
        const secondsToArrival = (PULSE_PLAYER_Z - gate.z) / PULSE_GATE_SPEED;
        return secondsToArrival >= 0 && secondsToArrival <= PULSE_PREFLASH_SECONDS;
      });
    },
    respace() {
      const schedulerTime = options.getSchedulerTime();
      for (const gate of active) {
        if (schedulerTime >= gate.scheduleSeconds && !gate.resolved) {
          // The seek jumped past this arrival; retire it silently so the run stays
          // coherent instead of dumping stale collisions into the event log.
          gate.resolved = true;
        } else {
          gate.z = Math.min(PULSE_SPAWN_Z, PULSE_PLAYER_Z - (gate.scheduleSeconds - schedulerTime) * PULSE_GATE_SPEED);
        }
      }
      active = active.filter((gate) => gate.z < PULSE_PLAYER_Z + 3.2);
    }
  };
}
