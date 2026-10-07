export interface LoadingStage {
  id: string;
  label: string;
  maxExpectedMs: number;
  fallbackCopy: string;
}

export const auraClashLoadingStages: LoadingStage[] = [
  {
    id: "ui-shell",
    label: "Render UI shell",
    maxExpectedMs: 100,
    fallbackCopy: "Loading Aura Clash interface",
  },
  {
    id: "typed-assets",
    label: "Resolve typed GLB assets",
    maxExpectedMs: 650,
    fallbackCopy: "Preparing typed Aura3D assets",
  },
  {
    id: "scene-compose",
    label: "Compose fight scene",
    maxExpectedMs: 1200,
    fallbackCopy: "Building the neon arena",
  },
  {
    id: "ready",
    label: "Ready to fight",
    maxExpectedMs: 1600,
    fallbackCopy: "Start Aura Clash",
  },
];

export const auraClashDeveloperLinks = [
  {
    label: "Open source",
    href: "https://github.com/auraoneai/aura3d",
  },
  {
    label: "Install @aura3d/engine",
    href: "https://www.npmjs.com/package/@aura3d/engine",
  },
] as const;
