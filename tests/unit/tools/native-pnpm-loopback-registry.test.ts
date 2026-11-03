import { beforeEach, describe, expect, it, vi } from "vitest";

// A synthetic verifier isolates request-dispatch behavior. It does not change
// the production policy pin or establish admission of any real package.
const verifier = vi.hoisted(() => ({ consume: vi.fn(), consumeWorkspace: vi.fn() }));
vi.mock("../../../tools/release/archive-admission.mjs", () => ({ consumePnpmArchiveAdmission: verifier.consume }));
vi.mock("../../../tools/release/workspace-pnpm-admission.mjs", () => ({ consumeWorkspacePnpmAdmission: verifier.consumeWorkspace }));

import { createPnpmLoopbackRegistry, createWorkspacePnpmLoopbackRegistry } from "../../../tools/release/pnpm-loopback-registry.mjs";

const capability = {} as never;
const manifestBytes = Buffer.from("synthetic manifest");
const lockBytes = Buffer.from("synthetic lock");
const input = { capability, manifestBytes, lockBytes };

function snapshots() {
  return [
    { resolved: "https://registry.npmjs.org/helper/-/helper-1.2.3.tgz", bytes: Buffer.from("admitted helper") },
    { resolved: "https://registry.npmjs.org/@scope/utility/-/utility-2.0.1.tgz", bytes: Buffer.from("admitted scoped utility") },
    { resolved: "file:./tarballs/aura3d-engine-1.2.3.tgz", bytes: Buffer.from("local candidate") }
  ];
}

beforeEach(() => { verifier.consume.mockReset(); verifier.consumeWorkspace.mockReset(); });

describe("admitted pnpm registry request dispatcher", () => {
  it("routes only admitted normal and scoped tarball paths through private byte copies", () => {
    const source = snapshots();
    verifier.consume.mockReturnValue(source);
    const registry = createPnpmLoopbackRegistry(input);
    expect(verifier.consume).toHaveBeenCalledOnce();
    expect(verifier.consume).toHaveBeenCalledWith(input);
    expect(registry.registryPath).toMatch(/^\/[a-f0-9]{48}\/$/);
    source[0].bytes.fill(0);
    const helper = registry.handle({ method: "GET", target: `${registry.registryPath}helper/-/helper-1.2.3.tgz` });
    expect(helper.status).toBe(200);
    expect(Buffer.from(helper.body).toString()).toBe("admitted helper");
    expect(helper.headers["content-length"]).toBe(String(Buffer.byteLength("admitted helper")));
    helper.body.fill(0);
    expect(Buffer.from(registry.handle({ method: "GET", target: `${registry.registryPath}helper/-/helper-1.2.3.tgz` }).body).toString()).toBe("admitted helper");
    const scoped = registry.handle({ method: "GET", target: `${registry.registryPath}@scope/utility/-/utility-2.0.1.tgz` });
    expect(Buffer.from(scoped.body).toString()).toBe("admitted scoped utility");
    expect(registry.status()).toMatchObject({ requests: 3, denied: 0, registryArchives: 2 });
    expect(registry.finish()).toMatchObject({ closed: true, requests: 3, denied: 0 });
    expect(() => registry.handle({ method: "GET", target: `${registry.registryPath}helper/-/helper-1.2.3.tgz` })).toThrow(/closed/);
  });

  it("fails permanently after unknown, encoded, query, malformed, or non-GET requests", () => {
    const requests = [
      { method: "GET", target: "https://registry.npmjs.org/helper/-/helper-1.2.3.tgz" },
      { method: "GET", target: "/unknown/-/unknown-1.0.0.tgz" },
      { method: "POST", target: "/ignored" }
    ];
    for (const request of requests) {
      verifier.consume.mockReturnValue(snapshots());
      const registry = createPnpmLoopbackRegistry(input);
      expect(registry.handle(request).status).not.toBe(200);
      expect(registry.status().denied).toBe(1);
      expect(() => registry.finish()).toThrow(/unexpected or failed/);
      expect(registry.status().closed).toBe(true);
    }
    for (const suffix of ["helper/-/helper-1.2.3.tgz?x=1", "helper/-/helper-1.2.3.tgz#fragment", "%68elper/-/helper-1.2.3.tgz", "../helper/-/helper-1.2.3.tgz", "tarballs/aura3d-engine-1.2.3.tgz"]) {
      verifier.consume.mockReturnValue(snapshots());
      const registry = createPnpmLoopbackRegistry(input);
      expect(registry.handle({ method: "GET", target: registry.registryPath + suffix }).status).not.toBe(200);
      expect(() => registry.finish()).toThrow(/unexpected or failed/);
    }
  });

  it("requires the verifier capability and binds the exact manifest and lock", () => {
    verifier.consume.mockImplementation(({ capability: supplied, manifestBytes: manifest, lockBytes: lock }) => {
      if (supplied !== capability || !Buffer.from(manifest).equals(manifestBytes) || !Buffer.from(lock).equals(lockBytes)) throw new Error("synthetic admission rejected");
      return snapshots();
    });
    expect(() => createPnpmLoopbackRegistry({ ...input, capability: {} as never })).toThrow(/synthetic admission rejected/);
    expect(() => createPnpmLoopbackRegistry({ ...input, manifestBytes: Buffer.from("changed") })).toThrow(/synthetic admission rejected/);
    expect(() => createPnpmLoopbackRegistry({ ...input, lockBytes: Buffer.from("changed") })).toThrow(/synthetic admission rejected/);
    expect(createPnpmLoopbackRegistry(input).finish()).toMatchObject({ denied: 0 });
  });

  it("uses the separate workspace verifier and its source-bound capability", () => {
    const workspaceCapability = {} as never;
    const workspaceInput = { capability: workspaceCapability, root: "/synthetic/source", sourceManifestPath: ".native-source-manifest.json" };
    verifier.consumeWorkspace.mockImplementation(({ capability: supplied, root, sourceManifestPath }) => {
      if (supplied !== workspaceCapability || root !== workspaceInput.root || sourceManifestPath !== workspaceInput.sourceManifestPath) throw new Error("synthetic workspace admission rejected");
      return { archives: snapshots() };
    });
    expect(() => createWorkspacePnpmLoopbackRegistry({ ...workspaceInput, capability: capability })).toThrow(/synthetic workspace admission rejected/);
    expect(() => createWorkspacePnpmLoopbackRegistry({ ...workspaceInput, root: "/different" })).toThrow(/synthetic workspace admission rejected/);
    const registry = createWorkspacePnpmLoopbackRegistry(workspaceInput);
    expect(Buffer.from(registry.handle({ method: "GET", target: `${registry.registryPath}helper/-/helper-1.2.3.tgz` }).body).toString()).toBe("admitted helper");
    expect(registry.finish()).toMatchObject({ denied: 0, registryArchives: 2 });
    expect(verifier.consume).not.toHaveBeenCalled();
  });

  it("revalidates on finish even when no further archive is requested", () => {
    verifier.consume.mockReturnValueOnce(snapshots()).mockImplementation(() => { throw new Error("source changed"); });
    const registry = createPnpmLoopbackRegistry(input);
    expect(() => registry.finish()).toThrow(/admission.*(changed|unavailable)/i);
    expect(registry.status()).toMatchObject({ closed: true, denied: 1 });
    expect(() => registry.handle({ method: "GET", target: `${registry.registryPath}helper/-/helper-1.2.3.tgz` })).toThrow(/closed/);
  });

  it("rejects duplicate, noncanonical, unsafe and non-registry archive resolutions", () => {
    const good = snapshots()[0];
    const bad = [
      [good, good],
      [{ ...good, resolved: "https://example.invalid/helper/-/helper-1.2.3.tgz" }],
      [{ ...good, resolved: "https://registry.npmjs.org/helper/-/helper-1.2.3.tgz?x=1" }],
      [{ ...good, resolved: "https://registry.npmjs.org/%68elper/-/helper-1.2.3.tgz" }],
      [{ ...good, resolved: "https://registry.npmjs.org/helper/-/different-1.2.3.tgz" }],
      [{ ...good, resolved: "file:./tarballs/../../escape.tgz" }],
      [{ ...good, bytes: new Uint8Array() }]
    ];
    for (const value of bad) {
      verifier.consume.mockReturnValue(value);
      expect(() => createPnpmLoopbackRegistry(input)).toThrow(/PNPM_LOOPBACK_REGISTRY/);
    }
  });
});
