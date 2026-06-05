export type SignageMotion = "pulse" | "scanline" | "ticker" | "flicker" | "static";

export interface AnimatedSignageCue {
  id: string;
  label: string;
  text: string;
  color: string;
  motion: SignageMotion;
  durationMs: number;
  reducedMotionMotion: SignageMotion;
}

export const neonDowntownSignageCues: AnimatedSignageCue[] = [
  {
    id: "aura-clash-title",
    label: "Arena title blade",
    text: "AURA CLASH",
    color: "#38ff9f",
    motion: "scanline",
    durationMs: 3200,
    reducedMotionMotion: "static",
  },
  {
    id: "round-ready",
    label: "Round ready ticker",
    text: "READY / FIGHT / AURA BURST",
    color: "#7ce7ff",
    motion: "ticker",
    durationMs: 5200,
    reducedMotionMotion: "static",
  },
  {
    id: "super-warning",
    label: "Aura Burst warning",
    text: "BURST ONLINE",
    color: "#fff1a8",
    motion: "pulse",
    durationMs: 900,
    reducedMotionMotion: "static",
  },
  {
    id: "ko-flare",
    label: "KO flare",
    text: "ROUND FINISH",
    color: "#ff795d",
    motion: "flicker",
    durationMs: 1300,
    reducedMotionMotion: "static",
  },
];

export function getAccessibleSignageMotion(cue: AnimatedSignageCue, reducedMotion: boolean): SignageMotion {
  return reducedMotion ? cue.reducedMotionMotion : cue.motion;
}
