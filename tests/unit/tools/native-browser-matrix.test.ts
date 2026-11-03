import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createNativeBrowserFixture,
  NATIVE_BROWSER_FIXTURE_SHA256,
  type NativeBrowserEvidence,
  selectBrowserProcessArguments,
  validateNativeBrowserEvidence,
} from "../../browser/native-cross-browser-harness";

const scenarios = ["rendering", "dom", "input", "asset", "worker", "lifecycle"] as const;

function automationEvidence(): NativeBrowserEvidence {
  return {
    schema: "aura3d.native-browser/1",
    project: "chromium-automation",
    evidenceKind: "automation",
    deviceClass: "unverified",
    browser: { distribution: "Playwright Chromium", executableVersion: "123.0.1" },
    os: { name: "Linux", version: "6.1", architecture: "x64" },
    backend: "webgl2",
    adapter: { unavailableReason: "The browser did not expose adapter identity" },
    driver: { unavailableReason: "The browser did not expose driver identity" },
    featureFlags: [],
    browserLaunchArguments: { unavailableReason: "Complete browser process arguments are not exposed" },
    fixture: { id: "independent-fixture", sha256: "a".repeat(64), license: "MIT", byteLength: 12 },
    scenarios: scenarios.map((name) => ({ name, status: "passed" as const })),
  };
}

function errorsFor(value: unknown): string {
  return validateNativeBrowserEvidence(value).join("\n").toLowerCase();
}

describe("native browser matrix evidence", () => {
  it("accepts a fully identified automation run without claiming physical hardware", () => {
    expect(validateNativeBrowserEvidence(automationEvidence())).toEqual([]);
  });

  it("treats absent, malformed and incomplete transported records as errors", () => {
    for (const value of [null, undefined, {}, { schema: "aura3d.native-browser/1" }, []]) {
      expect(validateNativeBrowserEvidence(value).length).toBeGreaterThan(0);
    }
  });

  it.each(["distribution", "executableVersion"] as const)("requires a browser %s", (field) => {
    const evidence = automationEvidence();
    evidence.browser[field] = "  ";
    expect(errorsFor(evidence)).toMatch(/browser|version|distribution/);
  });

  it.each(["unknown", "N/A", "unavailable", "not available", "-"])("rejects placeholder browser versions: %s", (version) => {
    const evidence = automationEvidence();
    evidence.browser.executableVersion = version;
    expect(errorsFor(evidence)).toMatch(/browser|version/);
  });

  it("requires project, OS, backend, feature flags and fixture identity", () => {
    const evidence = automationEvidence();
    evidence.project = "";
    evidence.os.version = "";
    evidence.backend = "";
    evidence.fixture.sha256 = "not-a-sha256";
    expect(errorsFor(evidence)).toMatch(/project/);
    expect(errorsFor(evidence)).toMatch(/os|operating/);
    expect(errorsFor(evidence)).toMatch(/backend/);
    expect(errorsFor(evidence)).toMatch(/sha|fixture/);
    expect(errorsFor({ ...automationEvidence(), featureFlags: undefined })).toMatch(/flag/);
    expect(errorsFor({ ...automationEvidence(), browserLaunchArguments: undefined })).toMatch(/argument|launch/);
  });

  it("requires a value or explicit unavailability reason for both adapter and driver", () => {
    const evidence = automationEvidence();
    evidence.adapter = {};
    evidence.driver = { unavailableReason: " " };
    expect(errorsFor(evidence)).toMatch(/adapter/);
    expect(errorsFor(evidence)).toMatch(/driver/);
  });

  it("does not infer hardware from a GPU-labelled project", () => {
    const evidence = automationEvidence();
    evidence.project = "chromium-gpu-headless";
    evidence.deviceClass = "physical";
    expect(errorsFor(evidence)).toMatch(/physical|hardware/);
  });

  it.each(["software", "experimental", "injected"] as const)(
    "rejects a physical-device claim for %s evidence",
    (evidenceKind) => {
      const evidence = automationEvidence();
      evidence.evidenceKind = evidenceKind;
      evidence.deviceClass = "physical";
      evidence.physicalProvenance = { deviceId: "device-1", observedBy: "operator", observation: "on-device run" };
      expect(errorsFor(evidence)).toMatch(/physical|hardware/);
    },
  );

  it("requires explicit on-device provenance before accepting a physical label", () => {
    const evidence = automationEvidence();
    evidence.project = "retail-device-run";
    evidence.evidenceKind = "physical";
    evidence.deviceClass = "physical";
    evidence.browser.distribution = "Retail Chrome";
    expect(errorsFor(evidence)).toMatch(/provenance|physical/);
    evidence.physicalProvenance = { deviceId: "device-1", observedBy: "operator", observation: "on-device run" };
    expect(validateNativeBrowserEvidence(evidence)).toEqual([]);
    evidence.physicalProvenance.observation = " ";
    expect(errorsFor(evidence)).toMatch(/provenance|physical|observation/);
  });

  it("rejects software rasterizers and emulators presented as physical devices", () => {
    const evidence = automationEvidence();
    evidence.project = "retail-device-run";
    evidence.evidenceKind = "physical";
    evidence.deviceClass = "physical";
    evidence.physicalProvenance = { deviceId: "emulator-1", observedBy: "operator", observation: "emulated device" };
    evidence.adapter = { value: "SwiftShader" };
    expect(errorsFor(evidence)).toMatch(/software|emulat|physical|hardware/);
  });

  it.each([
    ["os.version", (e: ReturnType<typeof automationEvidence>) => { e.os.version = "Android 14 Emulator (sdk_gphone64)"; }],
    ["os.kernel", (e: ReturnType<typeof automationEvidence>) => { e.os.kernel = "5.15.0-android-simulator"; }],
    ["physicalProvenance.observedBy", (e: ReturnType<typeof automationEvidence>) => { e.physicalProvenance!.observedBy = "emulator harness"; }],
  ] as const)("rejects an emulator marker found only in %s of a physical record", (_field, mutate) => {
    const evidence = automationEvidence();
    evidence.project = "retail-device-run";
    evidence.evidenceKind = "physical";
    evidence.deviceClass = "physical";
    evidence.browser.distribution = "Retail Chrome";
    evidence.physicalProvenance = { deviceId: "device-1", observedBy: "operator", observation: "on-device run" };
    expect(validateNativeBrowserEvidence(evidence)).toEqual([]);
    mutate(evidence);
    expect(errorsFor(evidence)).toMatch(/software|emulat|physical|hardware/);
  });

  it("rejects physical labels contradicted by actual browser launch arguments or distribution", () => {
    const evidence = automationEvidence();
    evidence.project = "retail-device-run";
    evidence.evidenceKind = "physical";
    evidence.deviceClass = "physical";
    evidence.physicalProvenance = { deviceId: "device-1", observedBy: "operator", observation: "on-device run" };
    evidence.browser.distribution = "Retail Chrome";
    evidence.browserLaunchArguments = { value: ["--use-angle=swiftshader"] };
    expect(errorsFor(evidence)).toMatch(/software|physical|hardware/);
    evidence.browserLaunchArguments = { value: [] };
    evidence.browser.distribution = "Playwright Chromium headless";
    expect(errorsFor(evidence)).toMatch(/automation|headless|physical|hardware/);
  });

  it.each(["skipped", "unsupported", "failed"] as const)("requires a reason when a scenario is %s", (status) => {
    const evidence = automationEvidence();
    evidence.scenarios[0] = { name: "rendering", status, reason: " " };
    expect(errorsFor(evidence)).toMatch(/reason|rendering/);
    evidence.scenarios[0] = { name: "rendering", status, reason: "WebGL2 context unavailable" };
    expect(validateNativeBrowserEvidence(evidence)).toEqual([]);
  });

  it.each(["not run", "skipped", "unsupported", "unavailable", "not available", "n/a"])("rejects an unqualified skip reason: %s", (reason) => {
    const evidence = automationEvidence();
    evidence.scenarios[0] = { name: "rendering", status: "skipped", reason };
    expect(errorsFor(evidence)).toMatch(/reason|rendering/);
  });

  it("requires exactly one result for every public workload", () => {
    const evidence = automationEvidence();
    evidence.scenarios = evidence.scenarios.filter((result) => result.name !== "worker");
    expect(errorsFor(evidence)).toMatch(/worker|scenario/);
    evidence.scenarios.push({ name: "input", status: "passed" });
    expect(errorsFor(evidence)).toMatch(/duplicate|input|scenario/);
  });
});


describe("effective browser launch arguments", () => {
  const exe = "/ms-playwright/firefox-1490/firefox/firefox";
  it("returns the complete argv of the single browser child of this worker", () => {
    const argv = [exe, "-no-remote", "-headless", "-profile", "/tmp/pw-profile", "-juggler-pipe"];
    expect(selectBrowserProcessArguments([
      { pid: 10, ppid: 4, argv },
      { pid: 11, ppid: 10, argv: [exe, "-contentproc", "1"] },
      { pid: 12, ppid: 99, argv: [exe, "-juggler-pipe"] },
    ], 4, exe)).toEqual({ value: argv, source: "proc-cmdline" });
  });

  it("records a reason instead of guessing when no or several child processes match", () => {
    expect(selectBrowserProcessArguments([], 4, exe).unavailableReason).toMatch(/No child process/);
    expect(selectBrowserProcessArguments([{ pid: 1, ppid: 4, argv: [exe] }, { pid: 2, ppid: 4, argv: [exe] }], 4, exe).unavailableReason).toMatch(/ambiguous/);
    expect(selectBrowserProcessArguments([{ pid: 1, ppid: 4, argv: [exe] }], 4, " ").unavailableReason).toMatch(/executable path/);
  });
});

describe("native browser fixture", () => {
  it("is a deterministic, independently authored GLB bound to the declared digest", () => {
    const bytes = createNativeBrowserFixture();
    const second = createNativeBrowserFixture();
    expect(bytes).toEqual(second);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(NATIVE_BROWSER_FIXTURE_SHA256);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(view.getUint32(0, true)).toBe(0x46546c67);
    expect(view.getUint32(4, true)).toBe(2);
    expect(view.getUint32(8, true)).toBe(bytes.byteLength);
    const jsonLength = view.getUint32(12, true);
    expect(view.getUint32(16, true)).toBe(0x4e4f534a);
    const document = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)).trim());
    expect(document.asset.version).toBe("2.0");
    expect(document.meshes[0].primitives[0].attributes.POSITION).toBeDefined();
    expect(document.accessors[0].count).toBe(3);
    expect(view.getUint32(24 + jsonLength, true)).toBe(0x004e4942);
  });
});

describe("native browser projects", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("isolates default automation from the legacy experimental launch flags", async () => {
    vi.stubEnv("AURA3D_BROWSER_PROJECT", "");
    vi.stubEnv("AURA3D_HEADED_XVFB", "1");
    const { default: config } = await import("../../../playwright.config");
    const projects = new Map(config.projects?.map((project) => [project.name, project]));
    expect(projects.has("legacy-chromium")).toBe(true);
    for (const [name, browserName] of [["chromium-automation", "chromium"], ["firefox-automation", "firefox"], ["webkit-automation", "webkit"]] as const) {
      const project = projects.get(name);
      expect(project?.use).toMatchObject({ browserName, headless: true, launchOptions: {} });
      expect(project?.use?.launchOptions?.args ?? []).toEqual([]);
      expect(project?.metadata?.evidenceTier).toBe("automation");
    }
    expect(projects.get("chromium-gpu-headless")?.metadata?.evidenceTier).toBe("gpu-probe");
    expect(projects.get("chromium-software")?.metadata?.evidenceTier).toBe("software");
    expect(projects.get("chromium-experimental")?.metadata?.evidenceTier).toBe("experimental");
  });

  it("honors a forwarded project selection and rejects unknown project labels", async () => {
    vi.stubEnv("AURA3D_BROWSER_PROJECT", "firefox-automation");
    let config = (await import("../../../playwright.config")).default;
    expect(config.projects?.map((project) => project.name)).toEqual(["firefox-automation"]);
    expect(config.projects?.[0].testMatch).toBeUndefined();
    vi.resetModules();
    vi.stubEnv("AURA3D_BROWSER_PROJECT", "not-a-project");
    await expect(import("../../../playwright.config")).rejects.toThrow(/Unknown AURA3D_BROWSER_PROJECT/);
  });
});
