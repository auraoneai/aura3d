import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bindBrowserGate, consumerReportFromEnvironment, restoreGatedBrowserConsumer, snapshotBrowserOutput } from "../../../tools/native-capability-gate/browser-contract";

const digest = (value: string): string => createHash("sha256").update(value).digest("hex");
const sha = "a".repeat(64);
const gate = () => ({
  status: "CODE_COMPLETE_GO",
  candidatePlan: { path: "candidate/plan.json", sha256: sha },
  sourceConsumerReport: { path: "reports/consumer.json", sha256: sha },
  matrixSourceReport: { path: "reports/matrix.json", sha256: sha },
  examplesSourceReport: { path: "reports/examples.json", sha256: sha }
});
const bindings = { candidatePlan: "candidate/plan.json", reports: { sourceConsumerReport: "reports/consumer.json" } };
const temporary: string[] = [];
afterEach(() => { for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }); });

describe("browser candidate binding", () => {
  it("uses the canonical source-report variable and rejects conflicting legacy values", () => {
    expect(consumerReportFromEnvironment({ NATIVE_CONSUMER_SOURCE_REPORT: "consumer.json" })).toBe("consumer.json");
    expect(consumerReportFromEnvironment({ NATIVE_CONSUMER_SOURCE_REPORT: "consumer.json", A3D_SOURCE_REPORT: "consumer.json" })).toBe("consumer.json");
    expect(() => consumerReportFromEnvironment({ A3D_SOURCE_REPORT: "consumer.json" })).toThrow("NATIVE_CONSUMER_SOURCE_REPORT");
    expect(() => consumerReportFromEnvironment({ NATIVE_CONSUMER_SOURCE_REPORT: "consumer.json", AURA3D_SOURCE_REPORT: "other.json" })).toThrow("disagree");
  });
  it("requires the real validator to succeed before restore and rejects other gate report kinds", async () => {
    const restore = vi.fn(async () => {});
    await expect(restoreGatedBrowserConsumer(() => { throw new Error("gate rejected"); }, bindings, restore)).rejects.toThrow("gate rejected");
    await expect(restoreGatedBrowserConsumer(gate, { ...bindings, reports: { sourceConsumerReport: "reports/matrix.json" } }, restore)).rejects.toThrow("source report");
    await expect(restoreGatedBrowserConsumer(gate, { ...bindings, candidatePlan: "candidate/other.json" }, restore)).rejects.toThrow("candidate plan");
    expect(restore).not.toHaveBeenCalled();
    expect(() => bindBrowserGate(() => ({ ...gate(), status: "not-run" }), bindings)).toThrow("candidate plan");
  });

  it("restores under a private fresh temporary parent and cleans up on success or failure", async () => {
    const validated = vi.fn(gate);
    const restored = await restoreGatedBrowserConsumer(validated, bindings, async (destination) => {
      expect(validated).toHaveBeenCalledTimes(1);
      expect(existsSync(destination)).toBe(false);
      if (process.platform !== "win32") expect(lstatSync(dirname(destination)).mode & 0o077).toBe(0);
      mkdirSync(destination);
      writeFileSync(join(destination, "fixture.txt"), "fixture");
    });
    const workspace = dirname(restored.directory);
    expect(existsSync(join(restored.directory, "fixture.txt"))).toBe(true);
    restored.cleanup();
    restored.cleanup();
    expect(existsSync(workspace)).toBe(false);

    let failedWorkspace = "";
    await expect(restoreGatedBrowserConsumer(gate, bindings, async (destination) => {
      failedWorkspace = dirname(destination);
      mkdirSync(destination);
      throw new Error("restore failed");
    })).rejects.toThrow("restore failed");
    expect(existsSync(failedWorkspace)).toBe(false);
  });
});

describe("retained browser output", () => {
  it("serves a snapshot of the exact recorded files, even if the source later changes", () => {
    const root = mkdtempSync(join(tmpdir(), "aura3d-browser-output-"));
    temporary.push(root);
    mkdirSync(join(root, "assets"));
    writeFileSync(join(root, "index.html"), "entry");
    writeFileSync(join(root, "assets", "scene.js"), "scene");
    writeFileSync(join(root, "unrecorded.txt"), "do not serve");
    const inventory = [{ path: "index.html", size: 5, sha256: digest("entry") }, { path: "assets/scene.js", size: 5, sha256: digest("scene") }];
    const output = snapshotBrowserOutput(root, inventory);
    writeFileSync(join(root, "assets", "scene.js"), "other");
    expect(output.files.get("assets/scene.js")?.toString()).toBe("scene");
    expect(output.files.has("unrecorded.txt")).toBe(false);
    expect(() => snapshotBrowserOutput(root, inventory)).toThrow("differs");
  });

  it("rejects missing, escaping, duplicate, and linked output entries", () => {
    const root = mkdtempSync(join(tmpdir(), "aura3d-browser-output-"));
    temporary.push(root);
    writeFileSync(join(root, "index.html"), "entry");
    const row = { path: "index.html", size: 5, sha256: digest("entry") };
    expect(() => snapshotBrowserOutput(root, [row, row])).toThrow("inventory");
    expect(() => snapshotBrowserOutput(root, [{ ...row, path: "../index.html" }])).toThrow("inventory");
    expect(() => snapshotBrowserOutput(root, [{ ...row, path: "missing.html" }])).toThrow();
    symlinkSync("index.html", join(root, "link.html"));
    expect(() => snapshotBrowserOutput(root, [{ ...row, path: "link.html" }])).toThrow("unsafe path");
  });
});
