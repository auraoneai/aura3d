import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * WS-1.5 — guards the properties that make these gates *structural* rather than another threshold.
 *
 * The failure mode this replaces is subtle: `anisotropy-strength-test` passes the 85-asset glTF
 * visual-parity suite at MAE 17.9 against a threshold of 32, while rendering flat spheres where
 * Three.js renders stretched highlights. So the assertions below are about the tool's *method* — a
 * global average must not be the pass/fail mechanism, and a blank frame must never be reportable as a
 * physics finding.
 */
const toolSource = readFileSync("tools/material-structural-parity/index.ts", "utf8");
const reportPath = "tests/reports/material-structural-parity.json";

describe("material structural parity gates (WS-1.5)", () => {
  it("measures through the public entry point only", () => {
    expect(toolSource).toContain('from "@aura3d/engine"');
    expect(toolSource).not.toMatch(/@aura3d\/[a-z-]+\/src\//);
    expect(toolSource).not.toMatch(/\.\.\/\.\.\/packages\//);
  });

  it("does not gate physical behaviour on mean absolute error", () => {
    /*
     * MAE may be *reported* — regression tracking against the 85-asset baseline is useful — but the
     * per-capability pass flags must come from the structural assertions.
     */
    expect(toolSource).toContain("meanAbsoluteErrorBaseline");
    expect(toolSource).toContain("REPORTED EVIDENCE ONLY");
    const assessBlocks = toolSource.split(/function assess/).slice(1);
    expect(assessBlocks.length).toBeGreaterThanOrEqual(5);
    for (const block of assessBlocks) {
      const body = block.slice(0, block.indexOf("\n}\n") + 1);
      expect(body, "an assess* function must not consult mean absolute error").not.toMatch(/meanAbsoluteError/);
    }
  });

  it("asserts a named physical behaviour per capability", () => {
    for (const capability of ["anisotropy", "sheen", "iridescence", "clearcoat", "transmission"]) {
      expect(toolSource).toContain(`capability: "${capability}"`);
    }
    // Each failure must name what is missing, not just report a number.
    expect(toolSource).toContain("missingPhysicalBehaviour");
    expect(toolSource).toContain("anisotropic GGX distribution");
    expect(toolSource).toContain("thin-film interference");
    expect(toolSource).toContain("sheen distribution");
  });

  it("refuses to draw a physics conclusion from a blank frame", () => {
    /*
     * This guard exists because of a real incident while building the tool: the app was disposed
     * before the pixels were read, every gate failed, and the failure text — "the highlight does not
     * stretch", "hue does not change with viewing angle" — was indistinguishable from the genuine
     * expected result. Both were true of a blank image.
     */
    expect(toolSource).toContain("guardAgainstBlankFrames");
    expect(toolSource).toContain("MEASUREMENT INVALID");
    expect(toolSource).toContain("measurementValid");
  });

  it("measures the production profile, not the safe-basic default", () => {
    // safe-basic's own descriptor lists "production PBR parity" under blockedInRoot.
    expect(toolSource).toContain('qualityProfile: "production"');
  });

  it("finds highlight shape from image moments rather than a fixed pixel window", () => {
    // Elongation and orientation come from the covariance of the bright region.
    expect(toolSource).toContain("highlightStats");
    expect(toolSource).toContain("orientationDegrees");
    expect(toolSource).toContain("elongation");
    // And the sheen rim is found from the subject silhouette, not the image frame.
    expect(toolSource).toContain("silhouetteBands");
  });

  it("records a valid, failing measurement in its report", () => {
    if (!existsSync(reportPath)) return; // Generated artifact under gitignored tests/reports/.
    const report = JSON.parse(readFileSync(reportPath, "utf8")) as Record<string, any>;
    expect(report.schema).toBe("a3d-material-structural-parity");
    expect(report.capabilities.length).toBeGreaterThanOrEqual(5);
    for (const capability of report.capabilities) {
      // Whatever the verdict, the frame must have been real: drawn, on a real backend.
      expect(capability.measured.backend, `${capability.capability} must render on a real backend`).toMatch(/webgl2|webgpu/);
      expect(Number(capability.measured.drawCalls), `${capability.capability} must have submitted draw calls`).toBeGreaterThan(0);
      if (!capability.pass) {
        expect(capability.missingPhysicalBehaviour, `${capability.capability} failure must name the missing behaviour`).toBeTruthy();
        expect(capability.missingPhysicalBehaviour).not.toContain("MEASUREMENT INVALID");
      }
    }
  });

  /*
   * A scoped-out capability exits zero so it does not block the gate. That makes its *label* the only
   * thing standing between "we deliberately do not claim this" and "this works" — and the console is
   * what a human reads. `PASS transmission` printed next to numbers showing the backdrop is less
   * visible through the transmissive sphere is the same label/measurement mismatch R1 forbids, so the
   * word and the recorded verdict are both locked here.
   */
  it("never prints PASS for a capability it has scoped out", () => {
    expect(toolSource).toContain('result.scopedOut ? "SCOPED"');
    // The honest verdict must survive into the report, not only the console.
    expect(toolSource).toContain("measuredPass");
    if (!existsSync(reportPath)) return;
    const report = JSON.parse(readFileSync(reportPath, "utf8")) as Record<string, any>;
    for (const capability of report.capabilities) {
      if (!capability.scopedOut) continue;
      expect(capability.scopedOut.reason, `${capability.capability} must record why it is scoped out`).toBeTruthy();
      // A scope-out that actually measures as working would be a claim, not a scope-out.
      expect(typeof capability.scopedOut.measuredPass).toBe("boolean");
    }
  });
});
