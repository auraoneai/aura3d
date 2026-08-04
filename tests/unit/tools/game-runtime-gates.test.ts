import { describe, expect, it } from "vitest";
import { runGameRuntimeGates } from "../../../tools/showcase-library/game-runtime-gates.mjs";

/**
 * WS-7 rule 3: "Gates are written first and observed failing on the 1.5.2 build, then the fix makes
 * them pass. Every defect the user reported was invisible to a green pipeline."
 *
 * A gate that never failed proves nothing, so this test *is* the proof. It runs the same gate code
 * against the `v1.5.2` tag and against the working tree, and asserts the verdicts flip. That makes
 * "observed failing on 1.5.2" reproducible by anyone with the repo, rather than a claim in a commit
 * message that decays the moment the code moves.
 */
describe("game-runtime gates were failing on 1.5.2 and pass now", () => {
  const released = runGameRuntimeGates({ against: "v1.5.2" });
  const current = runGameRuntimeGates();

  it("every gate fails on the 1.5.2 release", () => {
    expect(released.pass).toBe(false);
    const failing = released.checks.filter((check) => check.verdict === "fail").map((check) => check.id);
    expect(failing.sort()).toEqual(["motion-feel", "opaque-asset", "penetration", "telemetry-coherence"]);
  });

  it("every gate passes on the current tree", () => {
    const failing = current.checks
      .filter((check) => check.verdict === "fail")
      .map((check) => `${check.id}: ${check.blockers.join(", ")}`);
    expect(failing).toEqual([]);
    expect(current.pass).toBe(true);
  });

  it("the 1.5.2 penetration failure names the route-local constants that caused it", () => {
    // The specific defect, not just a red light: these five constants are what the wheels sank on.
    const penetration = released.checks.find((check) => check.id === "penetration");
    for (const name of ["TRACK_SURFACE_Y", "CAR_GROUND_Y", "CAR_TYRE_CONTACT_Y", "VERGE_DROP", "SHOULDER_WIDTH"]) {
      expect(penetration?.blockers ?? []).toContain(`route-local-surface-constant:${name}`);
    }
    expect(penetration?.blockers).toContain("geometry-contract-has-no-drivable-mesh");
  });

  it("the 1.5.2 motion failure names the authored gravity and jump velocity", () => {
    const motion = released.checks.find((check) => check.id === "motion-feel");
    const blockers = (motion?.blockers ?? []).join(" ");
    expect(blockers).toContain("apex-not-derived-from-declared-intent");
    // The exact tuning that produced the 0.684 apex.
    expect(blockers).toContain("gravity=-22");
    expect(blockers).toContain("jumpVelocity=7.4");
  });

  it("the 1.5.2 telemetry failure names the raw-enum HUD", () => {
    const telemetry = released.checks.find((check) => check.id === "telemetry-coherence");
    expect(telemetry?.blockers).toContain("hud-labels-idle-car-as-running");
  });

  it("reports which revision it measured, so a passing run is attributable", () => {
    expect(released.against).toBe("v1.5.2");
    expect(current.against).toBe("working-tree");
  });
});
