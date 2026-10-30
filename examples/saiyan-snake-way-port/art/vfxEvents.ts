/**
 * GU47 WP-27 SSR-12: turns read-only changes of the run state into effect events for the serpent VFX pack (art/vfx.ts).
 * Pure and presentation-only: it compares the state it saw last frame with this one and never writes the simulation.
 */
import type { Entity, RunState } from "../sim";
import type { SerpentVfxKind } from "./vfx";

export interface VfxEvent {
  readonly kind: SerpentVfxKind;
  /** The entity the event happened at (its road position), or null for the runner. */
  readonly entity: Entity | null;
}

export interface VfxEventTracker {
  /** Events since the last call; the first call only primes the tracker. */
  step(S: Pick<RunState, "kiPulse" | "stumble" | "surge" | "grounded" | "puff" | "phase" | "ents">): readonly VfxEvent[];
  /** True while the runner trail should draw (surge or flight). */
  readonly trailOn: boolean;
}

export function createVfxEventTracker(): VfxEventTracker {
  let primed = false;
  let pulse = 0;
  let stumble = 0;
  let surge = "off";
  let grounded = true;
  let trailOn = false;
  let deadSeen = new WeakSet<Entity>();
  let puntSeen = new WeakSet<Entity>();
  return {
    get trailOn() { return trailOn; },
    step(S) {
      const events: VfxEvent[] = [];
      if (primed && S.phase === "run") {
        if (S.kiPulse > pulse + 0.3) events.push({ kind: "serpent-orb", entity: null });
        if (S.stumble > 0.3 && stumble <= 0.3) events.push({ kind: "serpent-hit", entity: null });
        if (S.surge !== "off" && surge === "off") events.push({ kind: "serpent-surge", entity: null });
        if (S.grounded && !grounded) events.push({ kind: "serpent-cloud-puff", entity: null });
        for (const ent of S.ents) {
          if (ent.punt && !puntSeen.has(ent)) {
            puntSeen.add(ent);
            events.push({ kind: "serpent-pearl-chips", entity: ent });
          }
          if (ent.dead && !deadSeen.has(ent)) {
            deadSeen.add(ent);
            if (ent.type === "power") events.push({ kind: "serpent-power", entity: ent });
            else if (ent.type === "soul") events.push({ kind: "serpent-soul", entity: ent });
          }
        }
      } else {
        deadSeen = new WeakSet();
        puntSeen = new WeakSet();
        for (const ent of S.ents) {
          if (ent.dead) deadSeen.add(ent);
          if (ent.punt) puntSeen.add(ent);
        }
      }
      primed = true;
      pulse = S.kiPulse;
      stumble = S.stumble;
      surge = S.surge;
      grounded = S.grounded;
      trailOn = S.phase === "run" && (S.surge !== "off" || S.puff > 0);
      return events;
    }
  };
}
