// PRD-07 P4-T3 — per-app atmosphere state (fog / sky / wetness).
// Owns the spec-level AuraApp.atmosphere surface and the values published to
// the render source; resolution/tweening is per PRD-07 §8.2.

import type { AuraHeightFogSpec, AuraSkySpec } from "../../contracts/atmosphere";

export interface AtmosphereFrameState {
  readonly sky: AuraSkySpec | null;
  readonly fog: AuraHeightFogSpec | null;
  readonly wetness: number;
}

export class LiveAtmosphere {
  private sky: AuraSkySpec | null = null;
  private fog: AuraHeightFogSpec | null = null;
  private wetness = 0;
  private readonly listeners = new Set<() => void>();
  private readonly skyListeners = new Set<() => void>();

  setFog(spec: AuraHeightFogSpec | null, _o?: { transitionSeconds?: number }): void {
    this.fog = spec;
    this.emit();
  }

  setSky(spec: Partial<AuraSkySpec>, _o?: { transitionSeconds?: number }): void {
    this.sky = spec as AuraSkySpec;
    for (const listener of this.skyListeners) listener();
    this.emit();
  }

  /** P3-T6 — fires only when the sky spec changes (probe re-capture hook). */
  onSkyChanged(listener: () => void): () => void {
    this.skyListeners.add(listener);
    return () => this.skyListeners.delete(listener);
  }

  setWetness(value: number, _o?: { transitionSeconds?: number }): void {
    this.wetness = value;
    this.emit();
  }

  state(): AtmosphereFrameState {
    return { sky: this.sky, fog: this.fog, wetness: this.wetness };
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  /** Atmosphere diagnostics section (C-31). */
  report(): {
    background: "sky-preetham" | "sky-gradient" | "environment" | "color" | "none";
    fog: { mode: string; path: "legacy-uniforms" | "generator"; activeNodeId: string | null; maxOpacity: number | null };
    volumetric: { mode: "analytic" | "froxel" };
  } {
    const model = this.sky?.model;
    return {
      background:
        model === "preetham" ? "sky-preetham" :
        model === "gradient" ? "sky-gradient" :
        model === "hdri" || model === "cubemap" ? "environment" :
        model ? "color" : "none",
      fog: {
        mode: this.fog?.mode ?? "exp2",
        path: "legacy-uniforms", // generator path arrives with the C-05 real impl (P4-T5)
        activeNodeId: null,
        maxOpacity: this.fog?.maxOpacity ?? null
      },
      volumetric: { mode: "analytic" }
    };
  }
}
