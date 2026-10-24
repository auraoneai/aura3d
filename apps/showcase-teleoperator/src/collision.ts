import { createImpactFeedback, createImpactWorld, type Impact, type ImpactFeedbackOptions, type ImpactWorld } from "@aura3d/engine/game";

export interface TrafficBody {
  laneX: number;
  z: number;
  speed: number;
  direction: 1 | -1;
}

export interface PlayerBody {
  x: number;
  z: number;
  /** Forward speed in m/s (the player drives towards -z). */
  speed: number;
  /** Lateral velocity in m/s (+x is right). */
  lateral: number;
}

export interface TrafficHit {
  readonly slot: number;
  readonly impact: Impact;
}

export const PLAYER_RADIUS = 0.95;
export const PLAYER_HALF_LENGTH = 2.35;
const BODY_Y = 0.8;
const CULL_DZ = 12;
const CULL_DX = 4.5;

// Footprints of the ten traffic vehicles in `trafficSpecs` order: [length, width] in metres.
export const TRAFFIC_FOOTPRINTS: ReadonlyArray<readonly [number, number]> = [
  [4.75, 1.9],
  [4.6, 1.9],
  [4.75, 1.9],
  [4.75, 2.0],
  [4.75, 2.0],
  [4.6, 1.9],
  [5.05, 2.05],
  [5.25, 2.05],
  [5.25, 2.05],
  [11.8, 2.6]
];

const trafficVelocityZ = (car: TrafficBody): number => (car.direction === 1 ? -car.speed : car.speed);

/**
 * Player-versus-traffic contact. Each car gets its own impact world with the car's box at the origin, and the player
 * is stepped in that car's frame (position and velocity relative to the car), so a moving car behaves like a wall that
 * moves with it and each new contact raises exactly one impact event.
 */
export function createTrafficContacts(slotCount: number, feedback?: ImpactFeedbackOptions) {
  const worlds: ImpactWorld[] = [];
  for (let i = 0; i < slotCount; i++) {
    const [length, width] = TRAFFIC_FOOTPRINTS[i % TRAFFIC_FOOTPRINTS.length]!;
    worlds.push(
      createImpactWorld({
        colliders: [
          {
            kind: "box",
            id: `traffic-${i}`,
            tag: "traffic",
            center: [0, BODY_Y, 0],
            // Sphere radius stands in for the player's half width, so lengthen the box by the player's extra half length.
            half: [width / 2, BODY_Y, length / 2 + (PLAYER_HALF_LENGTH - PLAYER_RADIUS)],
            restitution: 0.15,
            friction: 0.3
          }
        ],
        eventMinSpeed: 0.8
      })
    );
  }
  const handler = feedback ? createImpactFeedback(feedback) : undefined;

  return {
    /**
     * `player` and `cars` are the state AFTER this frame's integration. The step rewinds one `dt`, then lets the impact
     * kit redo that motion with contact, so with no contact the result equals the input.
     */
    step(player: PlayerBody, cars: readonly TrafficBody[], dt: number): TrafficHit[] {
      const hits: TrafficHit[] = [];
      for (let i = 0; i < cars.length; i++) {
        const car = cars[i]!;
        if (Math.abs(player.z - car.z) > CULL_DZ + player.speed * dt || Math.abs(player.x - car.laneX) > CULL_DX) {
          worlds[i]!.reset();
          continue;
        }
        const carVz = trafficVelocityZ(car);
        const body = {
          position: [
            player.x - player.lateral * dt - car.laneX,
            BODY_Y,
            player.z + player.speed * dt - (car.z - carVz * dt)
          ] as [number, number, number],
          velocity: [player.lateral, 0, -player.speed - carVz] as [number, number, number],
          radius: PLAYER_RADIUS
        };
        for (const impact of worlds[i]!.step(body, dt)) {
          hits.push({ slot: i, impact });
          handler?.handle(impact);
        }
        player.x = body.position[0] + car.laneX;
        player.z = body.position[2] + car.z;
        player.lateral = body.velocity[0];
        player.speed = Math.max(0, -(body.velocity[2] + carVz));
      }
      return hits;
    },
    reset(): void {
      for (const world of worlds) world.reset();
    }
  };
}

export type TrafficContacts = ReturnType<typeof createTrafficContacts>;

export interface CollisionPenaltyState {
  comfortScore: number;
  streetBounty: number;
  streetMultiplier: number;
}

export interface CollisionPenalty {
  readonly label: string;
  readonly detail: string;
}

/** The Teleoperator rule for a hit: comfort rides lose comfort, street rides lose multiplier and bounty. */
export function applyCollisionPenalty(state: CollisionPenaltyState, rideStyle: "comfort" | "street", impactSpeed: number): CollisionPenalty {
  if (rideStyle === "comfort") {
    const loss = Math.round(2.5 + impactSpeed * 1.2);
    state.comfortScore = Math.max(0, state.comfortScore - loss);
    return { label: `COLLISION -${loss}% COMFORT`, detail: `Impact at ${(impactSpeed * 3.6).toFixed(0)} km/h` };
  }
  const bounty = Math.round(impactSpeed * 40);
  state.streetMultiplier = Math.max(1, state.streetMultiplier - 1);
  state.streetBounty = Math.max(0, state.streetBounty - bounty);
  return { label: `COLLISION -${bounty} BOUNTY`, detail: `Multiplier x${state.streetMultiplier.toFixed(1)}` };
}

export interface TrafficRecovery {
  /** A struck car stops dead and starts recovering `holdSec` later. */
  onHit(slot: number, now: number): void;
  /** Ramp every recovering car back towards its cruise speed. */
  update(cars: TrafficBody[], now: number, dt: number): void;
  setBaseSpeed(slot: number, speed: number): void;
}

export function createTrafficRecovery(baseSpeeds: readonly number[], options: { holdSec?: number; accel?: number } = {}): TrafficRecovery {
  const base = baseSpeeds.slice();
  const resumeAt = base.map(() => 0);
  const hold = options.holdSec ?? 1.2;
  const accel = options.accel ?? 6;
  return {
    onHit(slot, now) {
      resumeAt[slot] = now + hold;
    },
    update(cars, now, dt) {
      for (let i = 0; i < cars.length; i++) {
        const car = cars[i]!;
        if (now >= resumeAt[i]!) car.speed = Math.min(base[i]!, car.speed + accel * dt);
      }
    },
    setBaseSpeed(slot, speed) {
      base[slot] = speed;
    }
  };
}
