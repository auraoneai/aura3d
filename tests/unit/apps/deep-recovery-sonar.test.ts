import { describe, expect, it } from "vitest";
import {
  initialSonarState,
  querySonarContacts,
  triggerPing,
  updateSonar,
  SONAR_RANGE,
  SONAR_MARKER_LIFETIME,
  type SonarTarget
} from "../../../apps/showcase-deep-recovery/src/sonar";

describe("Deep Recovery — Sonar Query & Age-Out System", () => {
  const sampleTargets: SonarTarget[] = [
    { id: "crate-near", kind: "crate-standard", position: { x: 10, y: -5, z: 0 }, value: 400 },
    { id: "wreck-mid", kind: "wreck", position: { x: 20, y: -20, z: 15 }, value: 0 },
    { id: "crate-far", kind: "crate-heavy", position: { x: 60, y: -50, z: 40 }, value: 900 }
  ];

  it("queries targets within sonar sphere radius", () => {
    const subPos = { x: 0, y: 0, z: 0 };
    const detected = querySonarContacts(subPos, sampleTargets, SONAR_RANGE);

    // crate-near (~11.18m) and wreck-mid (~32.0m) are in range (<= 38m)
    // crate-far (~87.7m) is out of range
    expect(detected.length).toBe(2);
    expect(detected.map((c) => c.id)).toEqual(["crate-near", "wreck-mid"]);
  });

  it("triggers ping, generates contacts, and enforces ping cooldown", () => {
    let state = initialSonarState();
    const subPos = { x: 0, y: 0, z: 0 };

    const ping1 = triggerPing(state, subPos, sampleTargets, 0);
    expect(ping1.newContacts.length).toBe(2);
    expect(ping1.nextState.pingCount).toBe(1);
    expect(ping1.nextState.pingCooldownRemaining).toBeGreaterThan(0);

    // Immediate second ping is blocked by cooldown
    const ping2 = triggerPing(ping1.nextState, subPos, sampleTargets, 0.1);
    expect(ping2.newContacts.length).toBe(0);
    expect(ping2.nextState.pingCount).toBe(1);
  });

  it("ages out contacts over their lifetime with decaying intensity", () => {
    let state = initialSonarState();
    const subPos = { x: 0, y: 0, z: 0 };
    const ping = triggerPing(state, subPos, sampleTargets, 0);
    state = ping.nextState;

    expect(state.contacts.length).toBe(2);
    expect(state.contacts[0]!.intensity).toBe(1.0);

    // Advance 3.0 seconds (half lifetime)
    state = updateSonar(state, 3.0);
    expect(state.contacts.length).toBe(2);
    expect(state.contacts[0]!.intensity).toBeCloseTo(0.5, 1);
    expect(state.ageOutCount).toBe(0);

    // Advance past max lifetime (total 6.5s)
    state = updateSonar(state, 3.5);
    expect(state.contacts.length).toBe(0);
    expect(state.ageOutCount).toBe(2);
  });

  it("filters a crate hidden behind an authored wreck sphere while retaining the wreck return", () => {
    const subPos = { x: 0, y: -10, z: 0 };
    const targets: SonarTarget[] = [
      { id: "wreck", kind: "wreck", position: { x: 0, y: -10, z: 10 }, value: 0 },
      { id: "hidden-crate", kind: "crate-standard", position: { x: 0, y: -10, z: 18 }, value: 400 },
      { id: "clear-crate", kind: "crate-heavy", position: { x: 10, y: -10, z: 12 }, value: 900 }
    ];
    const contacts = querySonarContacts(subPos, targets, SONAR_RANGE, [
      { id: "wreck", position: { x: 0, y: -10, z: 10 }, radius: 3 }
    ]);
    expect(contacts.map((contact) => contact.id)).toEqual(["wreck", "clear-crate"]);
    expect(contacts.every((contact) => contact.occluded === false)).toBe(true);
  });
});
