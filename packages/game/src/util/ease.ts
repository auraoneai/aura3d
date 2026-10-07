/**
 * §7.6 `EaseName` — re-exports `@aura3d/math` Easing keyed by the contract
 * names so routes/tweens resolve `Easing[easeName]` directly.
 */
import { Easing } from "@aura3d/math";

export type EaseName =
  | "linear"
  | `${"quad" | "cubic" | "quart" | "quint" | "sine" | "expo" | "circ" | "back" | "elastic" | "bounce"}${"In" | "Out" | "InOut"}`;

export const ease: Readonly<Record<EaseName, (t: number) => number>> = Object.freeze({
  linear: Easing.linear,
  quadIn: Easing.quadIn,
  quadOut: Easing.quadOut,
  quadInOut: Easing.quadInOut,
  cubicIn: Easing.cubicIn,
  cubicOut: Easing.cubicOut,
  cubicInOut: Easing.cubicInOut,
  quartIn: Easing.quartIn,
  quartOut: Easing.quartOut,
  quartInOut: Easing.quartInOut,
  quintIn: Easing.quintIn,
  quintOut: Easing.quintOut,
  quintInOut: Easing.quintInOut,
  sineIn: Easing.sineIn,
  sineOut: Easing.sineOut,
  sineInOut: Easing.sineInOut,
  expoIn: Easing.expoIn,
  expoOut: Easing.expoOut,
  expoInOut: Easing.expoInOut,
  circIn: Easing.circIn,
  circOut: Easing.circOut,
  circInOut: Easing.circInOut,
  backIn: Easing.backIn,
  backOut: Easing.backOut,
  backInOut: Easing.backInOut,
  elasticIn: Easing.elasticIn,
  elasticOut: Easing.elasticOut,
  elasticInOut: Easing.elasticInOut,
  bounceIn: Easing.bounceIn,
  bounceOut: Easing.bounceOut,
  bounceInOut: Easing.bounceInOut
});

export { Easing };
