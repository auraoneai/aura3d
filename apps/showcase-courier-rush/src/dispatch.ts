/**
 * Courier Rush dispatch — delivery queue, dock sensors, timers, strikes,
 * combo scoring.
 *
 * Pure and deterministic: no DOM, no engine imports, no clocks. Dock data
 * comes from the route-local `./zones` module authored for the
 * single-path rebuild; nothing here reaches into a retired tree, so the
 * runtime-import downgrade this route once carried cannot recur.
 *
 * Shift model: five deliveries. Each lights a pickup dock, then a drop
 * dock. Dropping with at least 40% of the delivery timer left is "early"
 * and steps the combo multiplier by +0.2x; a late drop resets it to 1x.
 * Three collision strikes or an expired timer ends the shift; clearing
 * all five deliveries wins it. `stepDispatch` takes an explicit delta
 * and the van position and returns the events that fired, so the whole
 * model is unit-testable without a browser.
 */
import { ZONE_RADIUS, ZONE_SITES, type ZoneSite } from "./zones";

export const DELIVERY_COUNT = 5;

/** Per-delivery timers in milliseconds: 60/50/45/40/40 seconds. */
export const DELIVERY_TIMERS_MS: readonly number[] = [60_000, 50_000, 45_000, 40_000, 40_000];

export const MAX_STRIKES = 3;
/** Combo increment per early drop. */
export const COMBO_STEP = 0.2;
/** Remaining-time fraction at or above which a drop counts as early. */
export const EARLY_DELIVERY_FRACTION = 0.4;
/** Base payout per delivery. */
export const BASE_PAY = 100;
/** Maximum time bonus, scaled by the fraction of timer remaining. */
export const TIME_BONUS_MAX = 50;
/** Grace window after a strike before another can register. */
export const STRIKE_COOLDOWN_MS = 1000;

export type CourierPhase = "awaitingPickup" | "carrying" | "shiftClear" | "shiftOver";
export type CourierFailReason = "timer" | "strikes";

export interface DeliveryPlan {
  readonly index: number;
  readonly pickup: ZoneSite;
  readonly drop: ZoneSite;
  readonly timerMs: number;
}

/**
 * The authored five-delivery queue over the fresh dock sites. Legs chain
 * across town (no pickup repeats the previous drop) and alternate the
 * north-south and east-west mains so a shift uses the whole grid.
 */
export function buildDeliveryQueue(): readonly DeliveryPlan[] {
  const site = (id: string): ZoneSite => {
    const found = ZONE_SITES.find((candidate) => candidate.id === id);
    if (!found) throw new Error("Unknown courier dock site: " + id);
    return found;
  };
  const pairs: readonly (readonly [string, string])[] = [
    ["north-tower-dock", "south-depot-dock"],
    ["west-market-stand", "east-plaza-stand"],
    ["canal-stand", "north-tower-dock"],
    ["east-plaza-stand", "central-kiosk-dock"],
    ["south-depot-dock", "west-market-stand"]
  ];
  return pairs.map(([pickupId, dropId], index) => ({
    index,
    pickup: site(pickupId),
    drop: site(dropId),
    timerMs: DELIVERY_TIMERS_MS[index] ?? DELIVERY_TIMERS_MS[DELIVERY_TIMERS_MS.length - 1]!
  }));
}

// The queue is constant for the shift; build it once.
const QUEUE: readonly DeliveryPlan[] = buildDeliveryQueue();

export type CourierEvent =
  | { readonly type: "dispatch"; readonly deliveryIndex: number }
  | { readonly type: "pickup"; readonly zoneId: string; readonly onTriggerEnter: boolean }
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
  return QUEUE[state.deliveryIndex] ?? null;
}

/** The dock the driver should head for right now, or null when done. */
export function targetSite(state: DispatchState): ZoneSite | null {
  const plan = currentDelivery(state);
  if (!plan) return null;
  return state.phase === "awaitingPickup" ? plan.pickup : plan.drop;
}

/** Circle sensor test shared by pickup docks, drop docks, and evidence. */
export function zoneContains(site: ZoneSite, x: number, z: number, radius = ZONE_RADIUS): boolean {
  return Math.hypot(x - site.x, z - site.z) <= radius;
}

/** Points for a delivery: base plus scaled time bonus, times the combo. */
export function deliveryPoints(remainingFraction: number, combo: number): number {
  const bonus = TIME_BONUS_MAX * Math.max(0, Math.min(1, remainingFraction));
  return Math.round((BASE_PAY + bonus) * combo);
}

export interface DispatchStepContext {
  readonly vanX: number;
  readonly vanZ: number;
  /** True on the frame the interact key fires (E). The sensor always applies too. */
  readonly interactPressed?: boolean;
}

/**
 * Advance the dispatch by `dtMs`. Returns a fresh state plus the events
 * that fired this step, in order; the input state is never mutated.
 */
export function stepDispatch(
  state: DispatchState,
  dtMs: number,
  context: DispatchStepContext
): { readonly state: DispatchState; readonly events: readonly CourierEvent[] } {
  const events: CourierEvent[] = [];
  if (state.phase === "shiftClear" || state.phase === "shiftOver") return { state, events };
  const plan = currentDelivery(state);
  if (!plan) return { state, events };

  let next: DispatchState = {
    ...state,
    elapsedMs: state.elapsedMs + dtMs,
    timerMs: state.timerMs - dtMs,
    insidePickupZone: zoneContains(plan.pickup, context.vanX, context.vanZ),
    insideDropZone: zoneContains(plan.drop, context.vanX, context.vanZ)
  };

  // An expired timer ends the shift before any sensor can score.
  if (next.timerMs <= 0) {
    return { state: { ...next, timerMs: 0, phase: "shiftOver", failReason: "timer" }, events: [{ type: "timerFail" }] };
  }

  const interact = context.interactPressed ?? false;

  if (next.phase === "awaitingPickup" && next.insidePickupZone) {
    // The sensor fires on entry; E is a manual fallback while parked in
    // the dock, and the event says which path actually triggered.
    events.push({ type: "pickup", zoneId: plan.pickup.id, onTriggerEnter: !state.insidePickupZone && !interact });
    next = { ...next, phase: "carrying" };
  } else if (next.phase === "carrying" && next.insideDropZone) {
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
      onTriggerEnter: !state.insideDropZone && !interact,
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
    events.push(completedAll ? { type: "shiftClear" } : { type: "dispatch", deliveryIndex });
  }

  return { state: next, events };
}

/**
 * Register a collision strike. The post-strike cooldown means one scrape
 * cannot drain the meter; the third strike ends the shift.
 */
export function applyStrike(
  state: DispatchState,
  source: string
): { readonly state: DispatchState; readonly events: readonly CourierEvent[] } {
  if (state.phase === "shiftClear" || state.phase === "shiftOver") return { state, events: [] };
  if (state.elapsedMs - state.lastStrikeAtMs < STRIKE_COOLDOWN_MS) return { state, events: [] };
  const strikes = state.strikes + 1;
  const exhausted = strikes >= MAX_STRIKES;
  const next: DispatchState = {
    ...state,
    strikes,
    lastStrikeAtMs: state.elapsedMs,
    ...(exhausted ? { phase: "shiftOver" as const, failReason: "strikes" as const } : {})
  };
  const events: CourierEvent[] = [{ type: "strike", strikes, source }];
  if (exhausted) events.push({ type: "strikesExhausted" });
  return { state: next, events };
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
