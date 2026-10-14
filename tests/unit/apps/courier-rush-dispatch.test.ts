import { describe, expect, it } from "vitest";

import {
  applyStrike,
  buildDeliveryQueue,
  createDispatchState,
  currentDelivery,
  deliveryPoints,
  DELIVERY_COUNT,
  DELIVERY_TIMERS_MS,
  EARLY_DELIVERY_FRACTION,
  MAX_STRIKES,
  stepDispatch
} from "../../../apps/showcase-courier-rush/src/dispatch";
import { ZONE_SITES } from "../../../apps/showcase-courier-rush/src/city";

const STEP_MS = 100;

function driveTo(state = createDispatchState(), siteId: string) {
  const site = ZONE_SITES.find((candidate) => candidate.id === siteId)!;
  return { state, site };
}

describe("courier rush dispatch", () => {
  it("builds a five-delivery queue with the authored timer ladder", () => {
    const queue = buildDeliveryQueue();
    expect(queue).toHaveLength(DELIVERY_COUNT);
    expect(DELIVERY_TIMERS_MS).toEqual([60_000, 50_000, 45_000, 40_000, 40_000]);
    for (const plan of queue) {
      expect(plan.pickup.id).not.toBe(plan.drop.id);
    }
    // No pickup is the immediately preceding drop, so runs chain across town.
    for (let index = 1; index < queue.length; index += 1) {
      expect(queue[index]!.pickup.id).not.toBe(queue[index - 1]!.drop.id);
    }
  });

  it("advances pickup -> carrying -> drop purely from zone sensors", () => {
    let state = createDispatchState();
    const first = buildDeliveryQueue()[0]!;

    // Outside the zone: nothing happens.
    const outside = stepDispatch(state, STEP_MS, { vanX: 999, vanZ: 999 });
    expect(outside.events).toHaveLength(0);
    state = outside.state;

    // Enter the pickup sensor: onTriggerEnter fires without the interact key.
    const entered = stepDispatch(state, STEP_MS, { vanX: first.pickup.x, vanZ: first.pickup.z });
    const pickupEvent = entered.events.find((event) => event.type === "pickup");
    expect(pickupEvent).toMatchObject({ type: "pickup", zoneId: first.pickup.id, onTriggerEnter: true });
    expect(entered.state.phase).toBe("carrying");
    state = entered.state;

    // Enter the drop sensor early (full timer): early bonus and combo step.
    const dropped = stepDispatch(state, STEP_MS, { vanX: first.drop.x, vanZ: first.drop.z });
    const dropEvent = dropped.events.find((event) => event.type === "drop") as
      | { type: "drop"; early: boolean; pointsAwarded: number; multiplier: number }
      | undefined;
    expect(dropEvent).toBeDefined();
    expect(dropEvent!.early).toBe(true);
    expect(dropped.state.combo).toBeCloseTo(1.2, 5);
    expect(dropped.state.deliveriesCompleted).toBe(1);
    expect(dropped.state.score).toBeGreaterThan(0);
    expect(dropped.events.some((event) => event.type === "earlyBonus")).toBe(true);
    expect(dropped.events.some((event) => event.type === "dispatch")).toBe(true);
    expect(dropped.state.phase).toBe("awaitingPickup");
  });

  it("resets the combo to 1x on a late drop instead of stepping it", () => {
    let state = createDispatchState();
    const queue = buildDeliveryQueue();

    // Chain two early drops to raise the combo.
    for (let delivery = 0; delivery < 2; delivery += 1) {
      const plan = queue[delivery]!;
      state = stepDispatch(state, STEP_MS, { vanX: plan.pickup.x, vanZ: plan.pickup.z }).state;
      state = stepDispatch(state, STEP_MS, { vanX: plan.drop.x, vanZ: plan.drop.z }).state;
    }
    expect(state.combo).toBeCloseTo(1.4, 5);

    // Burn time down past the early threshold before delivering job 3.
    const plan = queue[2]!;
    state = stepDispatch(state, STEP_MS, { vanX: plan.pickup.x, vanZ: plan.pickup.z }).state;
    const burnMs = Math.floor(plan.timerMs * (1 - EARLY_DELIVERY_FRACTION)) + 500;
    state = stepDispatch(state, burnMs, { vanX: plan.pickup.x, vanZ: plan.pickup.z }).state;

    const late = stepDispatch(state, STEP_MS, { vanX: plan.drop.x, vanZ: plan.drop.z });
    expect(late.state.combo).toBe(1);
    expect(late.events.some((event) => event.type === "comboReset")).toBe(true);
  });

  it("scores base plus scaled time bonus times the multiplier", () => {
    // Instant drop at full timer with x1: base + full bonus.
    expect(deliveryPoints(1, 1)).toBe(150);
    // Half remaining rounds to half bonus.
    expect(deliveryPoints(0.5, 1)).toBe(125);
    // Multiplier compounds the whole payout, not just the bonus.
    expect(deliveryPoints(1, 1.4)).toBe(Math.round(150 * 1.4));
    // Fractions clamp: negative remaining never pays below base*multiplier.
    expect(deliveryPoints(-0.5, 1)).toBe(100);
  });

  it("ends the shift when the timer expires and records the reason", () => {
    let state = createDispatchState();
    state = stepDispatch(state, DELIVERY_TIMERS_MS[0]! + STEP_MS, { vanX: 999, vanZ: 999 }).state;
    expect(state.phase).toBe("shiftOver");
    expect(state.failReason).toBe("timer");
    expect(state.timerMs).toBe(0);
  });

  it("applies strikes with a cooldown and fails after three", () => {
    let state = createDispatchState();
    const first = applyStrike(state, "traffic-sedan-1");
    expect(first.events.map((event) => event.type)).toEqual(["strike"]);
    state = first.state;

    // Inside the cooldown window: suppressed entirely.
    const suppressed = applyStrike(state, "bollard-depot-west-curb-1");
    expect(suppressed.events).toHaveLength(0);
    expect(suppressed.state.strikes).toBe(1);

    // Advance past the cooldown between hits.
    state = stepDispatch(state, 1000, { vanX: 999, vanZ: 999 }).state;
    state = applyStrike(state, "lamp-pole-3").state;
    state = stepDispatch(state, 1000, { vanX: 999, vanZ: 999 }).state;
    const third = applyStrike(state, "traffic-hatch-2");
    expect(third.state.strikes).toBe(MAX_STRIKES);
    expect(third.state.phase).toBe("shiftOver");
    expect(third.state.failReason).toBe("strikes");
    expect(third.events.map((event) => event.type)).toContain("strikesExhausted");

    // A finished shift absorbs further steps and strikes.
    const after = stepDispatch(third.state, STEP_MS, { vanX: 999, vanZ: 999 });
    expect(after.state).toBe(third.state);
  });

  it("keeps every delivery inside its own timer window and exposes plans until the shift ends", () => {
    let state = createDispatchState();
    const queue = buildDeliveryQueue();
    for (let index = 0; index < DELIVERY_COUNT; index += 1) {
      const plan = currentDelivery(state)!;
      expect(plan.index).toBe(index);
      expect(plan.timerMs).toBe(queue[index]!.timerMs);
      state = stepDispatch(state, STEP_MS, { vanX: plan.pickup.x, vanZ: plan.pickup.z }).state;
      state = stepDispatch(state, STEP_MS, { vanX: plan.drop.x, vanZ: plan.drop.z }).state;
    }
    expect(state.phase).toBe("shiftClear");
    expect(currentDelivery(state)).toBeNull();
    expect(state.deliveriesCompleted).toBe(DELIVERY_COUNT);
  });
});
