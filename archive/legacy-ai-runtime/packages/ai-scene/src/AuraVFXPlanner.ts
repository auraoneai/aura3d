import type { AuraVFXCue } from "./AuraSceneIR.js";

export function planVFXFromMood(mood: readonly string[]): readonly AuraVFXCue[] {
  const text = mood.join(" ").toLowerCase();
  if (text.includes("dust") || text.includes("cinematic")) return [{ id: "vfx-generated-dust", kind: "dust", intensity: 0.35, notes: "Subtle dust motes for readable cinematic depth." }];
  if (text.includes("glow") || text.includes("neon")) return [{ id: "vfx-generated-glow", kind: "glow", intensity: 0.55, notes: "Glow cue approximated with emissive material and bloom." }];
  return [{ id: "vfx-none", kind: "none", intensity: 0, notes: "No VFX requested." }];
}
