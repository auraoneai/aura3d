/**
 * GU47 WP-34 runtime effects driver (DG-V1 sand wake, DG-V2 jade ribbons, DG-V3 signal and impact, DG-V4 motes).
 *
 * Reads only presentation inputs (the board's pose, speed and the ground height under it); never touches the sim.
 * Every call is a no-op without an effects surface (headless tests) or under `?look=original`.
 */
import type { AuraAppEffects, AuraEffectInstanceHandle, AuraTrailHandle, AuraVec3 } from "@aura3d/engine";
import { chapterLook } from "./art/look";
import { SILT_TRAIL, registerSiltVfx, siltVfxPresets, wakeInterval, wakeStrength, type SiltVfxKind } from "./art/vfx";

export interface SiltFxOptions {
  readonly chapter: number;
  readonly reducedMotion?: boolean;
  readonly low?: boolean;
  /** Runtime node ids the two ribbons follow (the jade strips under the board). */
  readonly trailNodes?: readonly string[];
  /** Runtime node the ambient motes follow (the rider), so they stay around the camera. */
  readonly motesNode?: string;
}

export interface SiltFxFrame {
  readonly position: AuraVec3;
  readonly forward: readonly [number, number];
  readonly speed: number;
  /** Height of the board above the ground or water under it. */
  readonly altitude: number;
  readonly overCanal: boolean;
}

export interface SiltFx {
  readonly kinds: readonly SiltVfxKind[];
  update(frame: SiltFxFrame, dt: number): void;
  ringPassed(at: AuraVec3): void;
  impact(at: AuraVec3, strength: number): void;
  /** QA: bursts fired per kind and the current wake strength. */
  readonly stats: () => { readonly fired: Readonly<Record<string, number>>; readonly wake: number; readonly trails: number; readonly trailLength: number };
  dispose(): void;
}

export function createSiltFx(effects: AuraAppEffects | undefined, options: SiltFxOptions): SiltFx {
  const kinds = registerSiltVfx(effects, options);
  const fired: Record<string, number> = {};
  const fire = (kind: SiltVfxKind, at: AuraVec3): void => {
    if (!effects) return;
    effects.burst(kind, at);
    fired[kind] = (fired[kind] ?? 0) + 1;
  };
  const trails: AuraTrailHandle[] = effects ? (options.trailNodes ?? []).map((id) => effects.trail(id, SILT_TRAIL)) : [];
  let motes: AuraEffectInstanceHandle | undefined;
  if (effects && options.motesNode) {
    const look = chapterLook(options.chapter);
    const spec = siltVfxPresets(options)[`silt-motes-${look.motes.kind}`];
    // an authored spec object loops until stopped (E-F spawn); attached to the rider so it travels with the camera
    motes = effects.spawn({ ...spec, attachTo: options.motesNode }, { node: options.motesNode });
  }
  let wake = 0;
  let wakeClock = 0;
  return {
    kinds,
    update(frame, dt) {
      wake = wakeStrength(frame.speed, frame.altitude);
      if (wake <= 0) { wakeClock = 0; return; }
      wakeClock += dt;
      const interval = wakeInterval(wake);
      if (wakeClock < interval) return;
      wakeClock = 0;
      const [fx, fz] = frame.forward;
      // just behind the board, on the ground or water surface under it
      const at: AuraVec3 = [frame.position[0] - fx * 2.2, frame.position[1] - frame.altitude + 0.2, frame.position[2] - fz * 2.2];
      fire(frame.overCanal ? "silt-canal-spray" : "silt-sand-wake", at);
    },
    ringPassed(at) { fire("silt-signal", at); },
    impact(at, strength) { if (strength > 0.05) fire("silt-impact", at); },
    stats: () => ({ fired: { ...fired }, wake, trails: trails.length, trailLength: trails.reduce((m, t) => Math.max(m, t.length), 0) }),
    dispose() {
      for (const t of trails) t.stop({ immediate: true });
      motes?.stop({ immediate: true });
    }
  };
}
