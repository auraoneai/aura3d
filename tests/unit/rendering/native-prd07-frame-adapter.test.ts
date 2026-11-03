import { describe, expect, it } from "vitest";
import {
  acquirePrd07DeviceLease,
  assertPrd07AdapterMount,
  assertPrd07DeviceLease,
  createPrd07AdapterMount,
  releasePrd07DeviceLease,
  revokePrd07AdapterDevice,
  revokePrd07AdapterDeviceGeneration,
  revokePrd07AdapterMount,
  type Prd07AdapterMount,
  type Prd07DeviceLease
} from "../../../packages/rendering/src/vfx/Prd07FrameAdapter";

function setup(device: object = {}, generation = 2) {
  const renderer = {}, owner = {}, canvas = {}, overlay = {};
  const mount = createPrd07AdapterMount(renderer, device, generation, owner, canvas, overlay);
  return { renderer, device, generation, owner, canvas, overlay, mount };
}

type Context = ReturnType<typeof setup>;
const acquire = (c: Context) => acquirePrd07DeviceLease(c.mount, c.renderer, c.device, c.generation, c.owner, c.canvas, c.overlay);
const assertMount = (c: Context) => assertPrd07AdapterMount(c.mount, c.renderer, c.device, c.generation, c.owner, c.canvas, c.overlay);
const assertLease = (c: Context, lease: Prd07DeviceLease) =>
  assertPrd07DeviceLease(lease, c.mount, c.renderer, c.device, c.generation, c.owner, c.canvas, c.overlay);

describe("staged PRD07 private mount and cooperative lease", () => {
  it("requires every exact mount identity and does not accept lookalikes", () => {
    const c = setup();
    assertMount(c);
    const check = (mount = c.mount, renderer = c.renderer, device = c.device, generation = c.generation,
      owner = c.owner, canvas = c.canvas, overlay = c.overlay) =>
      assertPrd07AdapterMount(mount, renderer, device, generation, owner, canvas, overlay);
    for (const mismatch of [
      () => check({} as Prd07AdapterMount), () => check(c.mount, {}),
      () => check(c.mount, c.renderer, {}), () => check(c.mount, c.renderer, c.device, 3),
      () => check(c.mount, c.renderer, c.device, c.generation, {}),
      () => check(c.mount, c.renderer, c.device, c.generation, c.owner, {}),
      () => check(c.mount, c.renderer, c.device, c.generation, c.owner, c.canvas, {})
    ]) expect(mismatch).toThrow(/MOUNT_INVALID/);
    expect(Object.isFrozen(c.mount)).toBe(true);
    expect(Reflect.ownKeys(c.mount)).toEqual([]);
    expect(revokePrd07AdapterMount(c.mount)).toBe(true);
    expect(revokePrd07AdapterMount(c.mount)).toBe(false);
    expect(() => assertMount(c)).toThrow(/MOUNT_INVALID/);
  });

  it("rejects borrowed renderer, canvas and overlay identities at mount creation", () => {
    const c = setup();
    expect(() => createPrd07AdapterMount(c.renderer, {}, 2, {}, {}, {})).toThrow(/MOUNT_IN_USE/);
    expect(() => createPrd07AdapterMount({}, {}, 2, {}, c.canvas, {})).toThrow(/MOUNT_IN_USE/);
    expect(() => createPrd07AdapterMount({}, {}, 2, {}, {}, c.overlay)).toThrow(/MOUNT_IN_USE/);
    assertMount(c);
    revokePrd07AdapterMount(c.mount);
  });

  it("rejects malformed mount arguments without reserving any identities", () => {
    const renderer = {}, device = {}, owner = {}, canvas = {}, overlay = {};
    for (const generation of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => createPrd07AdapterMount(renderer, device, generation, owner, canvas, overlay)).toThrow(/ARGUMENT_INVALID/);
    }
    expect(() => createPrd07AdapterMount(renderer, device, 1, null as unknown as object, canvas, overlay)).toThrow(/ARGUMENT_INVALID/);
    const mount = createPrd07AdapterMount(renderer, device, 0, owner, canvas, overlay);
    expect(revokePrd07AdapterMount(mount)).toBe(true);
  });

  it("allows different apps to share a device but rejects all overlapping leases", () => {
    const device = {};
    const a = setup(device), b = setup(device);
    const leaseA = acquire(a);
    assertLease(a, leaseA);
    expect(() => acquire(a)).toThrow(/LEASE_BUSY/);
    expect(() => acquire(b)).toThrow(/LEASE_BUSY/);
    expect(() => assertLease(b, leaseA)).toThrow(/LEASE_INVALID/);
    expect(releasePrd07DeviceLease(leaseA)).toBe(true);
    expect(releasePrd07DeviceLease(leaseA)).toBe(false);
    expect(() => assertLease(a, leaseA)).toThrow(/LEASE_INVALID/);
    const leaseB = acquire(b);
    assertLease(b, leaseB);
    releasePrd07DeviceLease(leaseB);
    revokePrd07AdapterMount(a.mount);
    revokePrd07AdapterMount(b.mount);
  });

  it("does not serialize unrelated devices", () => {
    const a = setup(), b = setup();
    const leaseA = acquire(a), leaseB = acquire(b);
    assertLease(a, leaseA);
    assertLease(b, leaseB);
    releasePrd07DeviceLease(leaseA);
    releasePrd07DeviceLease(leaseB);
    revokePrd07AdapterMount(a.mount);
    revokePrd07AdapterMount(b.mount);
  });

  it("revalidates after an async yield and retains the slot until finally", async () => {
    const device = {}, a = setup(device), b = setup(device);
    let resume!: () => void;
    const gate = new Promise<void>((resolve) => { resume = resolve; });
    const pending = (async () => {
      const lease = acquire(a);
      try {
        await gate;
        assertLease(a, lease);
      } finally {
        releasePrd07DeviceLease(lease);
      }
    })();
    expect(revokePrd07AdapterMount(a.mount)).toBe(true);
    expect(() => acquire(b)).toThrow(/LEASE_BUSY/);
    resume();
    await expect(pending).rejects.toThrow(/MOUNT_INVALID/);
    const lease = acquire(b);
    assertLease(b, lease);
    releasePrd07DeviceLease(lease);
    revokePrd07AdapterMount(b.mount);
  });

  it("keeps a revoked old generation busy until its operation actually releases", () => {
    const device = {}, old = setup(device, 4);
    const oldLease = acquire(old);
    expect(revokePrd07AdapterDeviceGeneration(device, 4)).toBe(1);
    const restored = setup(device, 5);
    expect(() => assertLease(old, oldLease)).toThrow(/MOUNT_INVALID/);
    expect(() => acquire(restored)).toThrow(/LEASE_BUSY/);
    expect(revokePrd07AdapterDeviceGeneration(device, 4)).toBe(0);
    expect(releasePrd07DeviceLease(oldLease)).toBe(true);
    const nextLease = acquire(restored);
    expect(releasePrd07DeviceLease(oldLease)).toBe(false);
    assertLease(restored, nextLease);
    releasePrd07DeviceLease(nextLease);
    revokePrd07AdapterMount(restored.mount);
  });

  it("retains renderer and app ownership across revocation and a device replacement", () => {
    const old = setup();
    const oldLease = acquire(old);
    revokePrd07AdapterMount(old.mount);
    const replacement: Context = {
      ...old,
      device: {},
      generation: old.generation + 1,
      mount: undefined as unknown as Prd07AdapterMount
    };
    replacement.mount = createPrd07AdapterMount(replacement.renderer, replacement.device, replacement.generation,
      replacement.owner, replacement.canvas, replacement.overlay);
    expect(() => acquire(replacement)).toThrow(/LEASE_BUSY/);
    releasePrd07DeviceLease(oldLease);
    const lease = acquire(replacement);
    assertLease(replacement, lease);
    releasePrd07DeviceLease(lease);
    revokePrd07AdapterMount(replacement.mount);
  });

  it("serializes two mounts of the same app even on different devices", () => {
    const first = setup(), device = {}, renderer = {}, canvas = {}, overlay = {};
    const mount = createPrd07AdapterMount(renderer, device, 2, first.owner, canvas, overlay);
    const second: Context = { renderer, device, generation: 2, owner: first.owner, canvas, overlay, mount };
    const firstLease = acquire(first);
    expect(() => acquire(second)).toThrow(/LEASE_BUSY/);
    releasePrd07DeviceLease(firstLease);
    const secondLease = acquire(second);
    releasePrd07DeviceLease(secondLease);
    revokePrd07AdapterMount(first.mount);
    revokePrd07AdapterMount(second.mount);
  });

  it("does not let stale mount cleanup revoke a replacement", () => {
    const old = setup();
    expect(revokePrd07AdapterMount(old.mount)).toBe(true);
    const mount = createPrd07AdapterMount(old.renderer, old.device, old.generation + 1, old.owner, old.canvas, old.overlay);
    expect(revokePrd07AdapterMount(old.mount)).toBe(false);
    assertPrd07AdapterMount(mount, old.renderer, old.device, old.generation + 1, old.owner, old.canvas, old.overlay);
    expect(revokePrd07AdapterMount(mount)).toBe(true);
  });

  it("retires just the requested generation and every owner of a lost device", () => {
    const device = {}, oldA = setup(device, 1), oldB = setup(device, 1), current = setup(device, 2), other = setup();
    expect(revokePrd07AdapterDeviceGeneration(device, 1)).toBe(2);
    expect(() => assertMount(oldA)).toThrow(/MOUNT_INVALID/);
    expect(() => assertMount(oldB)).toThrow(/MOUNT_INVALID/);
    assertMount(current);
    assertMount(other);
    expect(revokePrd07AdapterDevice(device)).toBe(1);
    expect(revokePrd07AdapterDevice(device)).toBe(0);
    expect(() => assertMount(current)).toThrow(/MOUNT_INVALID/);
    assertMount(other);
    revokePrd07AdapterMount(other.mount);
  });

  it("never inspects a source, identity, or unknown capability proxy", () => {
    let accesses = 0;
    const opaque = () => new Proxy({}, {
      get() { accesses++; throw new Error("unexpected get"); },
      getOwnPropertyDescriptor() { accesses++; throw new Error("unexpected descriptor"); },
      ownKeys() { accesses++; throw new Error("unexpected keys"); }
    });
    const renderer = opaque(), device = opaque(), owner = opaque(), canvas = opaque(), overlay = opaque();
    const mount = createPrd07AdapterMount(renderer, device, 0, owner, canvas, overlay);
    const lease = acquirePrd07DeviceLease(mount, renderer, device, 0, owner, canvas, overlay);
    assertPrd07DeviceLease(lease, mount, renderer, device, 0, owner, canvas, overlay);
    expect(() => assertPrd07AdapterMount(opaque() as Prd07AdapterMount, renderer, device, 0, owner, canvas, overlay)).toThrow(/MOUNT_INVALID/);
    expect(() => assertPrd07DeviceLease(opaque() as Prd07DeviceLease, mount, renderer, device, 0, owner, canvas, overlay)).toThrow(/LEASE_INVALID/);
    expect(releasePrd07DeviceLease(opaque() as Prd07DeviceLease)).toBe(false);
    expect(revokePrd07AdapterMount(opaque() as Prd07AdapterMount)).toBe(false);
    expect(accesses).toBe(0);
    releasePrd07DeviceLease(lease);
    revokePrd07AdapterMount(mount);
  });
});
