/**
 * Sonar overlap query, contact detection, marker aging, and range ring feedback.
 */
import type { Vec3 } from "./reef";

export interface SonarTarget {
  readonly id: string;
  readonly kind: "crate-standard" | "crate-heavy" | "wreck" | "buoy";
  readonly position: Vec3;
  readonly value: number;
}

export interface SonarOccluder {
  readonly id: string;
  readonly position: Vec3;
  readonly radius: number;
}

export interface SonarContact {
  readonly id: string;
  readonly kind: "crate-standard" | "crate-heavy" | "wreck" | "buoy";
  readonly position: Vec3;
  readonly distance: number;
  readonly age: number; // seconds since detected
  readonly lifetime: number; // max lifetime before age-out
  readonly intensity: number; // 1.0 down to 0.0
  readonly occluded: false;
}

export interface SonarState {
  readonly contacts: readonly SonarContact[];
  readonly pingCooldownRemaining: number;
  readonly pingCount: number;
  readonly returnCount: number;
  readonly ageOutCount: number;
  readonly lastPingTime: number;
  readonly pulseWaveRadius: number; // visual expanding pulse wave
}

export const SONAR_RANGE = 38.0;
export const SONAR_PING_COOLDOWN = 2.4;
export const SONAR_MARKER_LIFETIME = 6.0;
export const SONAR_WAVE_SPEED = 30.0; // m/s expanding ring

export function initialSonarState(): SonarState {
  return {
    contacts: [],
    pingCooldownRemaining: 0,
    pingCount: 0,
    returnCount: 0,
    ageOutCount: 0,
    lastPingTime: -100,
    pulseWaveRadius: 0
  };
}

export function querySonarContacts(
  subPos: Vec3,
  targets: readonly SonarTarget[],
  range: number = SONAR_RANGE,
  occluders: readonly SonarOccluder[] = []
): SonarContact[] {
  const detected: SonarContact[] = [];
  for (const target of targets) {
    const dx = target.position.x - subPos.x;
    const dy = target.position.y - subPos.y;
    const dz = target.position.z - subPos.z;
    const distance = Math.hypot(dx, dy, dz);
    const occluded = target.kind !== "wreck" && occluders.some((occluder) => {
      if (occluder.id === target.id) return false;
      const segmentLengthSq = dx * dx + dy * dy + dz * dz;
      if (segmentLengthSq <= 0.0001) return false;
      const ox = occluder.position.x - subPos.x;
      const oy = occluder.position.y - subPos.y;
      const oz = occluder.position.z - subPos.z;
      const t = Math.max(0, Math.min(1, (ox * dx + oy * dy + oz * dz) / segmentLengthSq));
      if (t <= 0.02 || t >= 0.98) return false;
      const closestX = subPos.x + dx * t;
      const closestY = subPos.y + dy * t;
      const closestZ = subPos.z + dz * t;
      return Math.hypot(
        closestX - occluder.position.x,
        closestY - occluder.position.y,
        closestZ - occluder.position.z
      ) < occluder.radius;
    });
    if (distance <= range && !occluded) {
      detected.push({
        id: target.id,
        kind: target.kind,
        position: target.position,
        distance,
        age: 0,
        lifetime: SONAR_MARKER_LIFETIME,
        intensity: 1.0,
        occluded: false
      });
    }
  }
  return detected;
}

export function triggerPing(
  state: SonarState,
  subPos: Vec3,
  targets: readonly SonarTarget[],
  currentTime: number,
  occluders: readonly SonarOccluder[] = []
): { nextState: SonarState; newContacts: readonly SonarContact[] } {
  if (state.pingCooldownRemaining > 0) {
    return { nextState: state, newContacts: [] };
  }

  const detected = querySonarContacts(subPos, targets, SONAR_RANGE, occluders);
  const existingMap = new Map(state.contacts.map((c) => [c.id, c]));

  for (const contact of detected) {
    existingMap.set(contact.id, contact); // refresh contact
  }

  const nextContacts = Array.from(existingMap.values());

  return {
    nextState: {
      contacts: nextContacts,
      pingCooldownRemaining: SONAR_PING_COOLDOWN,
      pingCount: state.pingCount + 1,
      returnCount: state.returnCount + detected.length,
      ageOutCount: state.ageOutCount,
      lastPingTime: currentTime,
      pulseWaveRadius: 0.1
    },
    newContacts: detected
  };
}

export function updateSonar(state: SonarState, dt: number): SonarState {
  const nextCooldown = Math.max(0, state.pingCooldownRemaining - dt);
  const nextWaveRadius = state.pulseWaveRadius > 0 && state.pulseWaveRadius < SONAR_RANGE
    ? state.pulseWaveRadius + SONAR_WAVE_SPEED * dt
    : 0;

  let agedOutThisFrame = 0;
  const aliveContacts: SonarContact[] = [];

  for (const contact of state.contacts) {
    const nextAge = contact.age + dt;
    if (nextAge >= contact.lifetime) {
      agedOutThisFrame += 1;
    } else {
      const nextIntensity = Math.max(0, 1.0 - nextAge / contact.lifetime);
      aliveContacts.push({
        ...contact,
        age: nextAge,
        intensity: nextIntensity
      });
    }
  }

  return {
    contacts: aliveContacts,
    pingCooldownRemaining: nextCooldown,
    pingCount: state.pingCount,
    returnCount: state.returnCount,
    ageOutCount: state.ageOutCount + agedOutThisFrame,
    lastPingTime: state.lastPingTime,
    pulseWaveRadius: nextWaveRadius
  };
}
