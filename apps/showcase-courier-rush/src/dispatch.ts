/**
 * Courier Rush dispatch - delivery queue, zones, timers, strikes, combo.
 *
 * Pure and deterministic: no DOM, no engine imports, no clocks. `step` takes an
 * explicit delta and the van position and returns the events that fired, so the
 * whole scoring/fail model is unit-testable and the browser route only wires
 * input, rendering and audio to these outputs.
 *
 * Core loop (PRD section 3): a shift is five deliveries. Each one lights a
 * pickup zone, then a drop zone; delivering with at least 40% of the delivery
 * timer left is "early" and chains +0.2x onto the combo multiplier, while a
 * late drop resets the combo to 1x. Collisions add strikes (three ends the
 * shift); a timer out also ends it. R resets everything.
 */

export const DELIVERY_COUNT = 5;

/** Per-delivery dispatch timers in milliseconds (60/50/45/40/40s per the PRD). */
export const DELIVERY_TIMERS_MS: readonly number[] = [60_000, 50_000, 45_000, 40_000, 40_000];

export const MAX_STRIKES = 3;
/** Combo increment per early drop. */
export const COMBO_STEP = 0.2;
/** Remaining-time fraction at or above which a delivery counts as early. */
export const EARLY_DELIVERY_FRACTION = 0.4;
/** Base payout per delivery. */
export const BASE_PAY = 100;
/** Maximum time bonus, awarded for instant delivery and scaled by remaining time. */
export const TIME_BONUS_MAX = 50;
/** Grace window after a strike before another can register, in milliseconds. */
export const STRIKE_COOLDOWN_MS = 1000;

import { ZONE_RADIUS, ZONE_SITES, type ZoneSite } from "./city";

export type CourierPhase = "awaitingPickup" | "carrying" | "shiftClear" | "shiftOver";

export type CourierFailReason = "timer" | "strikes";

export interface DeliveryPlan {
  readonly index: number;
  readonly pickup: ZoneSite;
  readonly drop: ZoneSite;
  readonly timerMs: number;
}

/**
 * Authored five-delivery queue over the city zone sites.
 *
 * The order is fixed so runs are plannable and tests are deterministic; the
 * route's random seeds live in traffic line variation only.
 */
export function buildDeliveryQueue(): readonly DeliveryPlan[] {
  const site = (id: string): ZoneSite => {
    const found = ZONE_SITES.find((candidate) => candidate.id === id);
    if (!found) throw new Error("Unknown courier zone site: " + id);
    return found;
  };
  const pairs: readonly (readonly [string, string])[] = [
    ["tower-north-curb", "depot-west-curb"],
    ["riverside-west-curb", "tower-north-curb"],
    ["midtown-west-curb", "depot-east-curb"],
    ["riverside-west-curb", "depot-west-curb"],
    ["plaza-east-curb", "riverside-west-curb"]
  ];
  return pairs.map(([pickupId, dropId], index) => ({
    index,
    pickup: site(pickupId),
    drop: site(dropId),
    timerMs: DELIVERY_TIMERS_MS[index] ?? DELIVERY_TIMERS_MS[DELIVERY_TIMERS_MS.length - 1]!
  }));
}

export type CourierEvent =
  | { readonly type: "dispatch"; readonly deliveryIndex: number }
  | {
      readonly type: "pickup";
      readonly zoneId: string;
      /** True when the sensor fired on entry rather than via the interact key. */
      readonly onTriggerEnter: boolean;
    }
  | {
      readonly type: "drop";
      readonly zoneId: string;
      readonly onTriggerEnter: boolean;
      readonly early: boolean;
      readonly pointsAwarded: number;
      readonly multiplier: number;
    }
  | { readonly type: "earlyBonus"; readonly combo: number }
  | { readonly type: "comboReset" }
  | { readonly type: "strike"; readonly strikes: number; readonly source: string }
  | { readonly type: "timerFail" }
  | { readonly type: "strikesExhausted" }
  | { readonly type: "shiftClear" };

export interface DispatchState {
  readonly phase: CourierPhase;
  readonly deliveryIndex: number;
  readonly timerMs: number;
  readonly strikes: number;
  readonly combo: number;
  readonly score: number;
  readonly deliveriesCompleted: number;
  readonly earlyDrops: number;
  readonly bestCombo: number;
  readonly failReason: CourierFailReason | null;
  readonly elapsedMs: number;
  readonly lastStrikeAtMs: number;
  readonly insidePickupZone: boolean;
  readonly insideDropZone: boolean;
}

export function createDispatchState(): DispatchState {
  return {
    phase: "awaitingPickup",
    deliveryIndex: 0,
    timerMs: DELIVERY_TIMERS_MS[0]!,
    strikes: 0,
    combo: 1,
    score: 0,
    deliveriesCompleted: 0,
    earlyDrops: 0,
    bestCombo: 1,
    failReason: null,
    elapsedMs: 0,
    lastStrikeAtMs: Number.NEGATIVE_INFINITY,
    insidePickupZone: false,
    insideDropZone: false
  };
}

/** Active delivery plan, or null once the shift has ended. */
export function currentDelivery(state: DispatchState): DeliveryPlan | null {
  if (state.phase === "shiftClear" || state.phase === "shiftOver") return null;
  return buildDeliveryQueue()[state.deliveryIndex] ?? null;
}

/** Circle sensor test shared by pickup zones, drop zones and the autopilot. */
export function zoneContains(site: ZoneSite, x: number, z: number, radius = ZONE_RADIUS): boolean {
  return Math.hypot(x - site.x, z - site.z) <= radius;
}

/** Points for a delivery: base plus scaled time bonus, times the combo multiplier. */
export function deliveryPoints(remainingFraction: number, combo: number): number {
  const bonus = TIME_BONUS_MAX * Math.max(0, Math.min(1, remainingFraction));
  return Math.round((BASE_PAY + bonus) * combo);
}

export interface DispatchStepContext {
  readonly vanX: number;
  readonly vanZ: number;
  /** True on the frame the interact key fires (E). Auto-sensor always applies too. */
  readonly interactPressed?: boolean;
}

/**
 * Advance the dispatch by `dtMs`. Returns the events that fired this step, in
 * order. The returned state is a fresh object; the input is never mutated.
 */
export function stepDispatch(
  state: DispatchState,
  dtMs: number,
  context: DispatchStepContext
): { readonly state: DispatchState; readonly events: readonly CourierEvent[] } {
  const events: CourierEvent[] = [];
  if (state.phase === "shiftClear" || state.phase === "shiftOver") {
    return { state, events };
  }
  const plan = currentDelivery(state);
  if (!plan) return { state, events };

  let next: DispatchState = {
    ...state,
    elapsedMs: state.elapsedMs + dtMs,
    timerMs: state.timerMs - dtMs,
    insidePickupZone: zoneContains(plan.pickup, context.vanX, context.vanZ),
    insideDropZone: zoneContains(plan.drop, context.vanX, context.vanZ)
  };

  // Timer failure dominates everything else this step.
  if (next.timerMs <= 0) {
    next = { ...next, timerMs: 0, phase: "shiftOver", failReason: "timer" };
    events.push({ type: "timerFail" });
    return { state: next, events };
  }

  const interact = context.interactPressed ?? false;

  // Pickup: the sensor fires on entry; E works as a manual fallback while
  // standing inside (the event then honestly reports interact, not enter).
  if (next.phase === "awaitingPickup" && next.insidePickupZone) {
    const onTriggerEnter = !state.insidePickupZone && !interact;
    next = { ...next, phase: "carrying" };
    events.push({ type: "pickup", zoneId: plan.pickup.id, onTriggerEnter });
  } else if (next.phase === "carrying" && next.insideDropZone) {
    // Drop: same sensor-plus-interact rule on the drop zone.
    const onTriggerEnter = !state.insideDropZone && !interact;
    const remainingFraction = next.timerMs / plan.timerMs;
    const early = remainingFraction >= EARLY_DELIVERY_FRACTION;
    let combo = next.combo;
    if (early) {
      combo = round4(next.combo + COMBO_STEP);
    } else if (next.combo !== 1) {
      events.push({ type: "comboReset" });
      combo = 1;
    }
    const points = deliveryPoints(remainingFraction, combo);
    events.push({
      type: "drop",
      zoneId: plan.drop.id,
      onTriggerEnter,
      early,
      pointsAwarded: points,
      multiplier: combo
    });
    if (early) events.push({ type: "earlyBonus", combo });
    const deliveryIndex = next.deliveryIndex + 1;
    const completedAll = deliveryIndex >= DELIVERY_COUNT;
    next = {
      ...next,
      phase: completedAll ? "shiftClear" : "awaitingPickup",
      deliveryIndex,
      combo,
      bestCombo: Math.max(next.bestCombo, combo),
      score: next.score + points,
      deliveriesCompleted: next.deliveriesCompleted + 1,
      earlyDrops: next.earlyDrops + (early ? 1 : 0),
      timerMs: completedAll ? next.timerMs : DELIVERY_TIMERS_MS[deliveryIndex]!,
      insidePickupZone: false,
      insideDropZone: false
    };
    if (completedAll) {
      events.push({ type: "shiftClear" });
      return { state: next, events };
    }
    events.push({ type: "dispatch", deliveryIndex });
  }

  return { state: next, events };
}

/**
 * Register a collision strike. Respects the post-strike cooldown so one scrape
 * cannot drain the meter; returns the events (possibly none while cooling down).
 */
export function applyStrike(
  state: DispatchState,
  source: string
): { readonly state: DispatchState; readonly events: readonly CourierEvent[] } {
  const events: CourierEvent[] = [];
  if (state.phase === "shiftClear" || state.phase === "shiftOver") {
    return { state, events };
  }
  if (state.elapsedMs - state.lastStrikeAtMs < STRIKE_COOLDOWN_MS) {
    return { state, events };
  }
  const strikes = state.strikes + 1;
  let next: DispatchState = { ...state, strikes, lastStrikeAtMs: state.elapsedMs };
  events.push({ type: "strike", strikes, source });
  if (strikes >= MAX_STRIKES) {
    next = { ...next, phase: "shiftOver", failReason: "strikes" };
    events.push({ type: "strikesExhausted" });
  }
  return { state: next, events };
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
