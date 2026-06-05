export interface ParallaxLayer {
  id: string;
  label: string;
  depth: "foreground" | "midground" | "background" | "skyline";
  speed: number;
  opacity: number;
  blurPx: number;
  assetFamilies: string[];
}

export const neonDowntownParallaxLayers: ParallaxLayer[] = [
  {
    id: "foreground-rail",
    label: "Foreground rooftop rail silhouettes",
    depth: "foreground",
    speed: 0.42,
    opacity: 0.72,
    blurPx: 0,
    assetFamilies: ["Downtown City MegaKit railings", "roof vents", "utility boxes"],
  },
  {
    id: "midground-towers",
    label: "Midground modular towers",
    depth: "midground",
    speed: 0.22,
    opacity: 0.58,
    blurPx: 0.6,
    assetFamilies: ["office towers", "balcony modules", "window strips"],
  },
  {
    id: "background-skyline",
    label: "Background skyline wall",
    depth: "background",
    speed: 0.11,
    opacity: 0.36,
    blurPx: 1.4,
    assetFamilies: ["distant skyscrapers", "antenna tops", "billboard shells"],
  },
  {
    id: "skyline-haze",
    label: "Atmospheric skyline haze",
    depth: "skyline",
    speed: 0.045,
    opacity: 0.24,
    blurPx: 2.2,
    assetFamilies: ["fog planes", "soft light cards", "distant city glow"],
  },
];

export function getParallaxOffset(layer: ParallaxLayer, cameraX: number): number {
  return Number((-cameraX * layer.speed).toFixed(3));
}
