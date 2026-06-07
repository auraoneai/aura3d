import type { CartoonGesture } from "./CartoonPerformance.js";

export const bodyLanguageLibrary: readonly CartoonGesture[] = [
  { id: "shrug", label: "Shrug", action: "gesture", defaultDuration: 1, body: { shoulderRaise: 0.45, handPose: "open" }, gesture: { gestureId: "shrug", hand: "both", amplitude: 0.6 }, facial: { brow: "raised", mouth: "neutral" }, reducedMotionSafe: true },
  { id: "thumbs-up", label: "Thumbs Up", action: "gesture", defaultDuration: 0.8, body: { armPose: "open", handPose: "point", energy: 0.7 }, gesture: { gestureId: "thumbs-up", hand: "right", amplitude: 0.5 }, facial: { mouth: "smile" }, reducedMotionSafe: true },
  { id: "thinking", label: "Thinking", action: "gesture", defaultDuration: 1.4, body: { headTilt: -0.12, handPose: "pinch", energy: 0.35 }, gesture: { gestureId: "thinking", hand: "right", amplitude: 0.25 }, facial: { brow: "arched", eyes: "soft" }, reducedMotionSafe: true },
  { id: "applause", label: "Applause", action: "gesture", defaultDuration: 1.2, body: { armPose: "open", handPose: "open", energy: 0.85 }, gesture: { gestureId: "applause", hand: "both", amplitude: 0.8, frequency: 2 }, facial: { mouth: "smile" }, reducedMotionSafe: false }
];

export function resolveBodyLanguageGesture(id: string): CartoonGesture | undefined {
  return bodyLanguageLibrary.find((gesture) => gesture.id === id);
}
