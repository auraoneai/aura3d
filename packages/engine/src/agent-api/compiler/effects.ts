// PRD-07 P1-T15 — option-coverage rows for the prd07 surface (C-37).
// Each row declares a builder field and two probe values; the coverage test in
// tests/unit/contracts asserts every field appears in the compiled map.

import { registerOptionCoverage } from "../../contracts/compiler";

export function registerPrd07OptionCoverage(): void {
  registerOptionCoverage([
    { builder: "effect", field: "effect", probeValueA: "particles", probeValueB: "rain", ownerPrd: 7 },
    { builder: "effect", field: "materialMode", probeValueA: "additive-glow", probeValueB: "smoke", ownerPrd: 7 },
    { builder: "effect", field: "particleCount", probeValueA: 64, probeValueB: 2000, ownerPrd: 7 },
    { builder: "effect", field: "emitter", probeValueA: "fountain", probeValueB: "swirl", ownerPrd: 7 },
    { builder: "effect", field: "emissionRate", probeValueA: 20, probeValueB: 600, ownerPrd: 7 },
    { builder: "effect", field: "gravity", probeValueA: -9.8, probeValueB: 0, ownerPrd: 7 },
    { builder: "effect", field: "turbulence", probeValueA: 0, probeValueB: 0.7, ownerPrd: 7 },
    { builder: "effect", field: "speed", probeValueA: 1, probeValueB: 20, ownerPrd: 7 },
    { builder: "effect", field: "spriteColumns", probeValueA: 1, probeValueB: 6, ownerPrd: 7 },
    { builder: "effect", field: "frameRate", probeValueA: 0, probeValueB: 12, ownerPrd: 7 },
    { builder: "atmosphere.fog", field: "mode", probeValueA: "exp2", probeValueB: "height", ownerPrd: 7 },
    { builder: "atmosphere.fog", field: "heightDensity", probeValueA: 0, probeValueB: 0.04, ownerPrd: 7 },
    { builder: "atmosphere.fog", field: "heightFalloff", probeValueA: 1, probeValueB: 0.1, ownerPrd: 7 },
    { builder: "atmosphere.fog", field: "maxOpacity", probeValueA: 0.5, probeValueB: 0.95, ownerPrd: 7 },
    { builder: "atmosphere.fog", field: "sunInscatter", probeValueA: 0, probeValueB: 0.6, ownerPrd: 7 },
    { builder: "atmosphere.setSky", field: "model", probeValueA: "preetham", probeValueB: "gradient", ownerPrd: 7 },
    { builder: "atmosphere.setWetness", field: "value", probeValueA: 0, probeValueB: 1, ownerPrd: 7 },
    { builder: "effects.spawn", field: "effect", probeValueA: "burst", probeValueB: "trail", ownerPrd: 7 },
    { builder: "effects.burst", field: "kind", probeValueA: "spark", probeValueB: "dust", ownerPrd: 7 },
    { builder: "sky", field: "spec", probeValueA: { model: "gradient" }, probeValueB: { model: "preetham" }, ownerPrd: 7 },
    { builder: "sky", field: "captureEnvironment", probeValueA: false, probeValueB: true, ownerPrd: 7 }
  ]);
}
