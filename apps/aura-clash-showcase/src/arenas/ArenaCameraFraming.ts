export interface ArenaCameraFrame {
  id: string;
  label: string;
  routeUse: "playable" | "poster" | "evidence" | "accessibility";
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  screenshotRule: string;
}

export const auraClashCameraFrames: ArenaCameraFrame[] = [
  {
    id: "playable-wide",
    label: "Playable wide",
    routeUse: "playable",
    position: [0, 2.35, 7.4],
    target: [0, 1.05, 0],
    fov: 42,
    screenshotRule: "Keep both fighters full-body with health bars and arena signage visible.",
  },
  {
    id: "poster-versus",
    label: "Poster versus",
    routeUse: "poster",
    position: [0, 2.65, 6.15],
    target: [0, 1.15, 0],
    fov: 34,
    screenshotRule: "Use stronger silhouettes, lower HUD weight, and visible city depth.",
  },
  {
    id: "evidence-proof",
    label: "Evidence proof",
    routeUse: "evidence",
    position: [0, 2.15, 7.9],
    target: [0, 1.0, 0],
    fov: 45,
    screenshotRule: "Keep typed asset proof and route panels readable on a laptop screenshot.",
  },
  {
    id: "accessibility-calm",
    label: "Accessibility calm",
    routeUse: "accessibility",
    position: [0, 2.25, 7.6],
    target: [0, 1.05, 0],
    fov: 44,
    screenshotRule: "Avoid heavy bloom and motion cues; prioritize readable controls.",
  },
];

export function getArenaCameraFrame(id: string): ArenaCameraFrame {
  return auraClashCameraFrames.find((frame) => frame.id === id) ?? auraClashCameraFrames[0]!;
}
