/**
 * Mech Hangar feel pass — hit feedback, camera punch, renderer-owned particles.
 *
 * Everything here is rendered geometry: spark, dust, and impact-ring particles
 * are primitive meshes driven per frame through runtime handles (no DOM/CSS
 * fakery).
 * Camera punch moves the shared follow-camera anchor; the KO push-in lerps the
 * anchor toward the loser. Reduced-motion gates the punch intensity and particle
 * counts, and pause freezes the whole controller because main stops updating it.
 */
import type { RuntimeNodeHandleLike } from "@aura3d/engine";
import type { BoutEvent } from "./mech-fight";

const HIDDEN_SCALE: readonly [number, number, number] = [0.0001, 0.0001, 0.0001];

export interface FeelParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  baseScale: number;
}

export interface FeelOptions {
  readonly reducedMotion: boolean;
  /** World-space depth of the arena where pooled effects should be rendered. */
  readonly arenaZ: number;
  readonly sparkNodes: readonly RuntimeNodeHandleLike[];
  readonly dustNodes: readonly RuntimeNodeHandleLike[];
  readonly impactNodes: readonly RuntimeNodeHandleLike[];
}

export interface FeelSnapshot {
  readonly activeSparks: number;
  readonly activeDust: number;
  readonly activeImpacts: number;
  readonly cameraPunchSeen: boolean;
  readonly koPushSeen: boolean;
  readonly lastHitStopFrames: number;
}

export interface CameraAnchorState {
  /** Where the anchor sits this frame (world). */
  position: [number, number, number];
}

interface ImpactPulse {
  x: number;
  y: number;
  z: number;
  life: number;
  maxLife: number;
  baseScale: number;
}

const SPARK_GRAVITY = -7.5;
const DUST_GRAVITY = -1.4;

export function createMechHangarFeel(options: FeelOptions) {
  const reducedMotion = options.reducedMotion;
  const arenaZ = options.arenaZ;
  const sparks: FeelParticle[] = [];
  const dust: FeelParticle[] = [];
  const impacts: ImpactPulse[] = [];
  let cameraPunchX = 0;
  let cameraPunchY = 0;
  let cameraPunchSeen = false;
  let koPushSeen = false;
  let koPushT = -1;
  let koTargetX = 0;
  let lastHitStopFrames = 0;

  function spawnSparkBurst(x: number, y: number, heavy: boolean): void {
    const count = reducedMotion ? 4 : heavy ? 12 : 8;
    for (let i = 0; i < count; i += 1) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.6;
      const speed = (heavy ? 2.6 : 1.8) * (0.6 + Math.random() * 0.6);
      sparks.push({
        x,
        y,
        z: arenaZ + 0.35,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.7 + 1.1,
        vz: (Math.random() - 0.5) * 0.6,
        life: 0,
        maxLife: heavy ? 0.62 : 0.48,
        baseScale: heavy ? 0.28 : 0.2
      });
    }
    while (sparks.length > options.sparkNodes.length * 2) sparks.shift();
  }

  function spawnDustPuff(x: number, strength: number): void {
    const count = reducedMotion ? 2 : Math.round(3 + strength * 3);
    for (let i = 0; i < count; i += 1) {
      dust.push({
        x: x + (Math.random() - 0.5) * 0.5,
        y: 0.06 + Math.random() * 0.08,
        z: arenaZ + (Math.random() - 0.5) * 0.6,
        vx: (Math.random() - 0.5) * 1.1,
        vy: 0.25 + Math.random() * 0.5 * strength,
        vz: (Math.random() - 0.5) * 0.5,
        life: 0,
        maxLife: 0.78 + Math.random() * 0.35,
        baseScale: 0.22 + Math.random() * 0.18 * strength
      });
    }
    while (dust.length > options.dustNodes.length * 2) dust.shift();
  }

  function spawnImpactPulse(x: number, y: number, heavy: boolean): void {
    impacts.push({
      x,
      y: Math.max(0.32, y),
      // The review camera is on +Z in the arena. Pull the ring just in front
      // of the fighters so a contact does not disappear into the shell.
      z: arenaZ + 0.62,
      life: 0,
      maxLife: heavy ? 0.56 : 0.42,
      baseScale: heavy ? 0.28 : 0.2
    });
    while (impacts.length > options.impactNodes.length * 2) impacts.shift();
  }

  function punchCamera(strength: number): void {
    if (reducedMotion) return;
    cameraPunchX = (Math.random() - 0.5) * 0.22 * strength;
    cameraPunchY = (Math.random() - 0.5) * 0.16 * strength;
    cameraPunchSeen = true;
  }

  function beginKoPush(loserX: number): void {
    if (reducedMotion) return;
    koPushSeen = true;
    koPushT = 0;
    koTargetX = loserX;
  }

  /** Consume sim events into presentation state. */
  function onEvents(events: readonly BoutEvent[]): void {
    for (const event of events) {
      if (event.type === "hit") {
        spawnSparkBurst(event.x, event.y, event.heavy);
        spawnImpactPulse(event.x, event.y, event.heavy);
        punchCamera(event.heavy ? 1.5 : 0.9);
      } else if (event.type === "blocked") {
        spawnSparkBurst(event.x, event.y, false);
        spawnImpactPulse(event.x, event.y, false);
        punchCamera(0.45);
      } else if (event.type === "guardBreak") {
        spawnSparkBurst(event.x, event.y + 0.3, true);
        spawnImpactPulse(event.x, event.y + 0.3, true);
        punchCamera(1.8);
      } else if (event.type === "land") {
        spawnDustPuff(event.x, 0.8);
      } else if (event.type === "ko") {
        spawnDustPuff(event.x, 2.2);
        spawnSparkBurst(event.x, 1.1, true);
        spawnImpactPulse(event.x, 1.1, true);
        punchCamera(2.4);
        beginKoPush(event.x);
      } else if (event.type === "specialFire" && event.attackerId) {
        punchCamera(0.5);
      }
    }
  }

  function updateParticles(dt: number): void {
    for (let i = sparks.length - 1; i >= 0; i -= 1) {
      const p = sparks[i]!;
      p.life += dt;
      if (p.life >= p.maxLife) {
        sparks.splice(i, 1);
        continue;
      }
      p.vy += SPARK_GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.03) {
        p.y = 0.03;
        p.vy = Math.abs(p.vy) * 0.35;
      }
    }
    for (let i = dust.length - 1; i >= 0; i -= 1) {
      const p = dust[i]!;
      p.life += dt;
      if (p.life >= p.maxLife) {
        dust.splice(i, 1);
        continue;
      }
      p.vy += DUST_GRAVITY * dt;
      p.x += p.vx * dt;
      p.y = Math.max(0.04, p.y + p.vy * dt);
      p.z += p.vz * dt;
    }
    for (let i = impacts.length - 1; i >= 0; i -= 1) {
      const pulse = impacts[i]!;
      pulse.life += dt;
      if (pulse.life >= pulse.maxLife) impacts.splice(i, 1);
    }
  }

  /** Drive the pooled nodes from live particle state. */
  function render(): void {
    const sparkHandles = options.sparkNodes;
    for (let i = 0; i < sparkHandles.length; i += 1) {
      const node = sparkHandles[i]!;
      const p = sparks[i];
      if (!p) {
        node.setVisible(true);
        node.setScale([HIDDEN_SCALE[0], HIDDEN_SCALE[1], HIDDEN_SCALE[2]]);
        continue;
      }
      const fade = 1 - p.life / p.maxLife;
      node.setPosition(p.x, p.y, p.z);
      node.setScale([p.baseScale * fade, p.baseScale * fade, p.baseScale * fade]);
      node.setVisible(true);
    }
    const dustHandles = options.dustNodes;
    for (let i = 0; i < dustHandles.length; i += 1) {
      const node = dustHandles[i]!;
      const p = dust[i];
      if (!p) {
        node.setVisible(true);
        node.setScale([HIDDEN_SCALE[0], HIDDEN_SCALE[1], HIDDEN_SCALE[2]]);
        continue;
      }
      const grow = 1 + (p.life / p.maxLife) * 1.6;
      const fade = 1 - p.life / p.maxLife;
      node.setPosition(p.x, p.y, p.z);
      node.setScale([p.baseScale * grow * fade, p.baseScale * 0.5 * grow * fade, p.baseScale * grow * fade]);
      node.setVisible(true);
    }
    const impactHandles = options.impactNodes;
    for (let i = 0; i < impactHandles.length; i += 1) {
      const node = impactHandles[i]!;
      const pulse = impacts[i];
      if (!pulse) {
        node.setVisible(true);
        node.setScale([HIDDEN_SCALE[0], HIDDEN_SCALE[1], HIDDEN_SCALE[2]]);
        continue;
      }
      const progress = Math.min(1, pulse.life / pulse.maxLife);
      const fade = 1 - progress;
      const radius = pulse.baseScale * (0.72 + progress * 1.95);
      node.setPosition(pulse.x, pulse.y, pulse.z);
      node.setScale([radius, radius, 0.045 * fade]);
      node.setVisible(true);
    }
  }

  /**
   * Per-frame presentation tick.
   *
   * anchor is mutated in place: base arena framing plus decaying camera punch plus
   * the KO push-in offset. Returns nothing; the caller positions its follow target.
   */
  function update(dt: number, events: readonly BoutEvent[], anchor: { x: number; y: number; z: number }): void {
    onEvents(events);
    updateParticles(dt);
    // Camera punch decay.
    cameraPunchX *= Math.pow(0.0015, dt);
    cameraPunchY *= Math.pow(0.0015, dt);
    // KO push-in: glide the anchor toward the loser for ~1.1s then hold.
    if (koPushT >= 0) {
      koPushT += dt;
      const t = Math.min(1, koPushT / 1.1);
      const eased = t * t * (3 - 2 * t);
      anchor.x = anchor.x + (koTargetX - anchor.x) * eased * 0.24;
      anchor.y = anchor.y + (0.85 - anchor.y) * eased * 0.18;
    }
    anchor.x += cameraPunchX;
    anchor.y += cameraPunchY;
    render();
  }

  return {
    update,
    onEvents,
    snapshot(): FeelSnapshot {
      return {
        activeSparks: sparks.length,
        activeDust: dust.length,
        activeImpacts: impacts.length,
        cameraPunchSeen,
        koPushSeen,
        lastHitStopFrames
      };
    },
    noteHitStop(frames: number): void {
      lastHitStopFrames = frames;
    },
    resetRuntime(): void {
      sparks.length = 0;
      dust.length = 0;
      impacts.length = 0;
      cameraPunchX = 0;
      cameraPunchY = 0;
      koPushT = -1;
    }
  };
}
