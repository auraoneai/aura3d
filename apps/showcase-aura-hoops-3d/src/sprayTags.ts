import type { AuraVec3 } from "@aura3d/engine";

/**
 * H47-V3 signature: a spray-tag decal stencilled on the blacktop under the rim after a Jam dunk, fading over 20 s, at
 * most 8 live (the oldest is lifted when a 9th lands). Colour, opacity and size come from the court's `sprayTag` row.
 * Placement walks a fixed ring of spots under the rim by stamp count (no RNG draw, so the sim and cosmetic streams are
 * untouched). The 8 tag textures are WP-36 assets (`hoopsSprayTag1..8`); until they land the decal is the engine's
 * colour stamp.
 */
export const SPRAY_TAG_SECONDS = 20;
export const SPRAY_TAG_MAX = 8;

export interface SprayTagStyle {
  readonly color: string;
  readonly opacity: number;
  readonly size: number;
}

export interface DecalHandle {
  stop(o?: { immediate?: boolean }): void;
}

export interface DecalSurface {
  decal(at: { position: AuraVec3; normal: AuraVec3 }, options: { size?: number; lifetime?: number; color?: string; opacity?: number }): DecalHandle;
}

/** Spot `n` on a ring of 8 around the paint under the rim (x, z; y is the floor). */
export function sprayTagSpot(n: number, rim: AuraVec3): AuraVec3 {
  const i = ((n % SPRAY_TAG_MAX) + SPRAY_TAG_MAX) % SPRAY_TAG_MAX;
  const a = (i / SPRAY_TAG_MAX) * Math.PI * 2 + 0.4;
  const r = 1.1 + (i % 2) * 0.7;
  return [rim[0] + Math.cos(a) * r, 0.016, rim[2] + 1.4 + Math.sin(a) * r];
}

export class SprayTags {
  private readonly live: { handle: DecalHandle; born: number }[] = [];
  private stamps = 0;

  get liveCount(): number {
    return this.live.length;
  }

  /** Drop tags older than 20 s of game time. */
  prune(now: number): void {
    while (this.live.length > 0 && now - this.live[0]!.born >= SPRAY_TAG_SECONDS) {
      this.live.shift()!.handle.stop({ immediate: true });
    }
  }

  stamp(surface: DecalSurface | undefined, style: SprayTagStyle, rim: AuraVec3, now: number): boolean {
    if (!surface?.decal) return false;
    this.prune(now);
    if (this.live.length >= SPRAY_TAG_MAX) this.live.shift()!.handle.stop({ immediate: true });
    const handle = surface.decal(
      { position: sprayTagSpot(this.stamps++, rim), normal: [0, 1, 0] },
      { size: style.size, lifetime: SPRAY_TAG_SECONDS, color: style.color, opacity: style.opacity }
    );
    this.live.push({ handle, born: now });
    return true;
  }

  clear(): void {
    for (const t of this.live) t.handle.stop({ immediate: true });
    this.live.length = 0;
  }
}
