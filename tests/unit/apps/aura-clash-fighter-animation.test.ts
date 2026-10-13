import { describe, expect, it, vi } from "vitest";
import {
  AURA_CLASH_PLAYER_CLIP_DURATIONS,
  AuraClashFighterAnimation,
  type AuraClashFighterAnimInput
} from "../../../apps/aura-clash-showcase/src/v2/scene/fighter-animation";
import { auraClashPlayerClips } from "../../../apps/aura-clash-showcase/src/playable/animation/auraClashClipMaps";

const DT = 1 / 60;

function makeDriver(): AuraClashFighterAnimation {
  const asset = { metadata: { animations: Object.values(auraClashPlayerClips) } };
  const driver = new AuraClashFighterAnimation(
    "p1", asset, auraClashPlayerClips, AURA_CLASH_PLAYER_CLIP_DURATIONS);
  driver.bind({ id: "p1-node", play: () => undefined } as never);
  return driver;
}

function step(driver: AuraClashFighterAnimation, seconds: number, input: AuraClashFighterAnimInput): void {
  const frames = Math.max(1, Math.round(seconds / DT));
  for (let i = 0; i < frames; i += 1) driver.update(DT, input);
}

const idle = (health = 100): AuraClashFighterAnimInput => ({ state: "idle", health, grounded: true });

describe("Aura Clash v2 fighter animation driver", () => {
  it("enters death once and holds the final KO pose past the clip duration", () => {
    const driver = makeDriver();
    const crossFade = vi.spyOn(driver.controller, "crossFade");
    step(driver, 0.25, idle());
    expect(driver.snapshot().activeClip).toBe(auraClashPlayerClips.idle);

    step(driver, DT, idle(0));
    expect(driver.snapshot().state).toBe("death");
    expect(crossFade.mock.calls.filter((c) => c[0] === auraClashPlayerClips.ko)).toHaveLength(1);

    // Well past the 2.4s Death01 duration while health stays 0: the driver
    // must still report death and the runtime binding must still apply the
    // KO clip (paused at its final frame), not the default idle clip.
    step(driver, 5, idle(0));
    const snap = driver.snapshot();
    expect(snap.state).toBe("death");
    expect(snap.activeClip).toBe(auraClashPlayerClips.ko);
    expect(snap.appliedClipId).toBe(auraClashPlayerClips.ko);
    expect(crossFade.mock.calls.filter((c) => c[0] === auraClashPlayerClips.ko)).toHaveLength(1);

    const koState = driver.controller.snapshot().clips.find((c) => c.clipId === auraClashPlayerClips.ko);
    expect(koState?.status).toBe("paused");
    expect(koState?.completed).toBe(false);
    expect(koState?.localTime).toBeCloseTo(koState?.duration ?? -1, 5);
  });

  it("clears death when health is restored (round reset edge)", () => {
    const driver = makeDriver();
    step(driver, 0.25, idle());
    step(driver, 4, idle(0));
    expect(driver.snapshot().state).toBe("death");

    step(driver, 0.25, idle(100));
    const snap = driver.snapshot();
    expect(snap.state).toBe("idle");
    expect(snap.activeClip).toBe(auraClashPlayerClips.idle);
    expect(snap.appliedClipId).toBe(auraClashPlayerClips.idle);
  });

  it("keeps the guard clip through blocked hitstun and uses hurt clips for real hits", () => {
    const driver = makeDriver();
    step(driver, 0.25, { state: "guard", health: 100, grounded: true });
    expect(driver.snapshot().activeClip).toBe(auraClashPlayerClips.guard);

    // Blocked heavy attack: kit reports hitstun (blockStun) but the blocked
    // signal keeps Sword_Block; the heavy damage must not select Hit_Head.
    step(driver, DT, { state: "hitstun", health: 100, grounded: true, blocked: true, lastHitDamage: 18 });
    let snap = driver.snapshot();
    expect(snap.state).toBe("guard");
    expect(snap.activeClip).toBe(auraClashPlayerClips.guard);

    // Remaining blockstun frames carry no fresh blocked event: guard holds.
    step(driver, 0.3, { state: "hitstun", health: 100, grounded: true });
    snap = driver.snapshot();
    expect(snap.state).toBe("guard");
    expect(snap.activeClip).toBe(auraClashPlayerClips.guard);

    // A later clean heavy hit selects the heavy hurt variant (step past the
    // 0.05s crossfade so the controller's primary clip is the hurt clip).
    step(driver, 0.25, idle());
    step(driver, 0.1, { state: "hitstun", health: 82, grounded: true, lastHitDamage: 18 });
    snap = driver.snapshot();
    expect(snap.state).toBe("hit");
    expect(snap.activeClip).toBe(auraClashPlayerClips.hurtHeavy);
  });

  it("does not leak stale hit damage into a later hit's severity", () => {
    const driver = makeDriver();
    step(driver, 0.25, idle());

    step(driver, 0.1, { state: "hitstun", health: 82, grounded: true, lastHitDamage: 18 });
    expect(driver.snapshot().activeClip).toBe(auraClashPlayerClips.hurtHeavy);

    step(driver, 0.6, idle(82));
    step(driver, 0.1, { state: "hitstun", health: 76, grounded: true, lastHitDamage: 6 });
    expect(driver.snapshot().activeClip).toBe(auraClashPlayerClips.hurt);

    step(driver, 0.6, idle(76));
    step(driver, 0.1, { state: "hitstun", health: 70, grounded: true });
    expect(driver.snapshot().activeClip).toBe(auraClashPlayerClips.hurt);
  });
});
