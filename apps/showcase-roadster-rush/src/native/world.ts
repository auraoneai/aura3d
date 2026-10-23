import { hash2 } from "./math";
import { ROAD_HALF_WIDTH } from "./constants";

/** Overhead sign gantry on the endless freeway: a ring of slots re-seeded as the player advances. */
export interface Gantry {
  position: { x: number; y: number; z: number };
  userData: { hit: boolean; nearMissed: boolean };
}

const GANTRY_SPACING = 155;
const RING_BEHIND = 70;
const SIGN_SET_COUNT = 5;
const NO_GANTRY_Z = 1e5;
const CLEAR_ZONE = 15;
const GANTRY_COUNT = Math.ceil(500 / GANTRY_SPACING) + 1;

export interface WorldEvent {
  type: "crash" | "nearMiss";
  what: string;
  position: { x: number; y: number; z: number };
}

/** Time-of-day, gantry ring and gantry collisions of the freeway (visuals live in the renderer). */
export class FreewayWorld {
  readonly gantries: Gantry[] = [];
  private slotOf = new Float64Array(GANTRY_COUNT).fill(NaN);
  private tod = 0;
  private events: WorldEvent[] = [];
  private evPos = { x: 0, y: 0, z: 0 };

  constructor() {
    for (let i = 0; i < GANTRY_COUNT; i++) this.gantries.push({ position: { x: 0, y: 0, z: NO_GANTRY_Z }, userData: { hit: false, nearMissed: false } });
  }

  get timeOfDay(): number {
    return this.tod;
  }

  setTimeOfDay(value: number): void {
    let t = Number.isFinite(value) ? value : 0;
    t = ((t % 2) + 2) % 2;
    if (t > 1) t = 2 - t;
    this.tod = t;
  }

  reset(): void {
    this.slotOf.fill(NaN);
    this.setTimeOfDay(0);
  }

  update(_dt: number, playerPosition: { z: number }): void {
    const dist = -playerPosition.z;
    const first = Math.floor((dist - RING_BEHIND) / GANTRY_SPACING);
    const last = first + GANTRY_COUNT - 1;
    for (let slot = first; slot <= last; slot++) {
      const idx = ((slot % GANTRY_COUNT) + GANTRY_COUNT) % GANTRY_COUNT;
      if (this.slotOf[idx] === slot) continue;
      this.slotOf[idx] = slot;
      const gantry = this.gantries[idx]!;
      let z = -(slot * GANTRY_SPACING + GANTRY_SPACING * 0.5 + (hash2(slot, 313) - 0.5) * 70);
      if (slot === 0) z = -145;
      else if (Math.abs(z) < CLEAR_ZONE || Math.abs(z) < 120) z = NO_GANTRY_Z;
      gantry.position.z = z;
      gantry.userData.hit = false;
      gantry.userData.nearMissed = false;
    }
  }

  checkCollisions(
    player: { alive?: boolean; position: { x: number; y: number; z: number }; bounds(): { minY: number; maxY: number; minZ: number; maxZ: number }; speed: number; invulnerable: boolean },
    dt = 0.016
  ): WorldEvent[] {
    const out = this.events;
    out.length = 0;
    if (!player || player.alive === false) return out;
    const b = player.bounds();
    const pos = player.position;
    if (b.maxY < 5.1) return out;
    const sweep = (player.speed || 30) * (dt || 0.016) * 0.7;
    const invulnerable = !!player.invulnerable;
    for (const gantry of this.gantries) {
      const gz = gantry.position.z;
      if (gz > 1e4 || b.minZ > gz + 0.65 + sweep || b.maxZ < gz - 1.15 || Math.abs(pos.x) > ROAD_HALF_WIDTH + 1.2) continue;
      if (b.maxY > 6.95 && b.minY < 11.1) {
        gantry.userData.nearMissed = true;
        if (!invulnerable && !gantry.userData.hit) {
          gantry.userData.hit = true;
          this.evPos = { x: pos.x, y: Math.min(b.maxY, 9), z: gz };
          out.push({ type: "crash", what: "sign", position: this.evPos });
          return out;
        }
      } else if (!gantry.userData.nearMissed && ((b.maxY >= 5.5 && b.maxY <= 6.95) || (b.minY >= 11.1 && b.minY <= 12.5))) {
        gantry.userData.nearMissed = true;
        this.evPos = { x: pos.x, y: pos.y + 0.6, z: gz };
        out.push({ type: "nearMiss", what: "sign", position: this.evPos });
      }
    }
    return out;
  }
}

