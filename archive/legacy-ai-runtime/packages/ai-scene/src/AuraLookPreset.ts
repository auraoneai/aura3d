export interface AuraLookPreset {
  readonly id: string;
  readonly label: string;
  readonly contrast: number;
  readonly saturation: number;
  readonly bloom: number;
  readonly notes: string;
}

export function createLookPreset(mood: readonly string[]): AuraLookPreset {
  const text = mood.join(" ").toLowerCase();
  if (text.includes("night") || text.includes("noir")) return { id: "look-noir", label: "Noir realtime grade", contrast: 1.18, saturation: 0.92, bloom: 0.08, notes: "Supported as realtime color grade; not final offline film grade." };
  if (text.includes("warm") || text.includes("golden")) return { id: "look-warm", label: "Warm cinematic grade", contrast: 1.08, saturation: 1.08, bloom: 0.1, notes: "Warm realtime grade for previs." };
  return { id: "look-neutral", label: "Neutral realtime grade", contrast: 1.04, saturation: 1.0, bloom: 0.04, notes: "Default realtime grade." };
}
