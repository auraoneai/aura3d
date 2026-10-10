// PRD-07 P2-T7 — transient light pool (§6.2.12): pre-allocated PointLights
// capped by tier (Low 0 / Medium 2 / High 4 / Ultra 8). Dead slots idle at
// intensity 0; a full pool recycles the oldest (lowest-intensity) slot. The
// `prd07.lights` frame contributor publishes the CollectedLights through the
// C-01 collect phase.

import { PointLight } from "@aura3d/scene";
import { collectLight, type CollectedLight } from "@aura3d/rendering";

export type TransientLightTier = "low" | "medium" | "high" | "ultra";

export const TRANSIENT_LIGHT_CAPS: Record<TransientLightTier, number> = {
  low: 0,
  medium: 2,
  high: 4,
  ultra: 8
};

export interface TransientLightFlash {
  readonly position: readonly [number, number, number];
  readonly color: readonly [number, number, number];
  readonly intensity: number;
  readonly range?: number;
  /** Seconds to decay to zero. */
  readonly duration?: number;
}

interface PoolSlot {
  light: PointLight;
  age: number;
  duration: number;
  startIntensity: number;
  /** Monotonic assignment id — recycling picks the smallest (oldest) live slot. */
  generation: number;
}

export class TransientLightPool {
  readonly cap: number;
  private readonly slots: PoolSlot[] = [];

  constructor(tier: TransientLightTier) {
    this.cap = TRANSIENT_LIGHT_CAPS[tier];
    for (let i = 0; i < this.cap; i++) {
      const light = new PointLight(`prd07.transient.${i}`);
      light.intensity = 0;
      this.slots.push({ light, age: 0, duration: 0, startIntensity: 0, generation: -1 });
    }
  }

  get liveCount(): number {
    let n = 0;
    for (const s of this.slots) if (s.light.intensity > 0) n++;
    return n;
  }

  private nextGeneration = 0;

  flash(flash: TransientLightFlash): boolean {
    if (this.cap === 0) return false;
    let slot = this.slots.find((s) => s.light.intensity <= 0);
    if (!slot) {
      // Full pool: recycle the oldest live slot (smallest generation).
      slot = this.slots.reduce((a, b) => (a.generation <= b.generation ? a : b));
    }
    slot.light.transform.setPosition(flash.position[0], flash.position[1], flash.position[2]);
    slot.light.updateWorldTransform();
    slot.light.color = [flash.color[0], flash.color[1], flash.color[2]];
    slot.light.intensity = flash.intensity;
    slot.light.range = flash.range ?? 8;
    slot.light.castsShadow = false;
    slot.age = 0;
    slot.duration = Math.max(1e-4, flash.duration ?? 0.5);
    slot.startIntensity = flash.intensity;
    slot.generation = this.nextGeneration++;
    return true;
  }

  step(dt: number): void {
    for (const slot of this.slots) {
      if (slot.light.intensity <= 0) continue;
      slot.age += dt;
      const t = Math.min(1, slot.age / slot.duration);
      slot.light.intensity = slot.startIntensity * (1 - t) * (1 - t);
      if (t >= 1) slot.light.intensity = 0;
    }
  }

  /** CollectedLights for the C-01 collect phase — only live slots (intensity
   *  > 0); idle slots must not appear as lights in the frame or they push
   *  scenes past the 8-light clustered-program threshold. */
  collect(): readonly CollectedLight[] {
    return this.slots.filter((s) => s.light.intensity > 0).map((s) => collectLight(s.light));
  }
}
