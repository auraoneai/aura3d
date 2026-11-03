import { afterEach, describe, expect, it, vi } from "vitest";
import { MockRenderDevice, RenderDeviceError } from "../../../packages/rendering/src/RenderDevice";
import { WebGL2Device } from "../../../packages/rendering/src/WebGL2Device";
import { WebGL2StateCache } from "../../../packages/rendering/src/WebGL2StateCache";
import { renderTargetPoolSlot } from "../../../packages/rendering/src/contracts/device";
import { acquireV2TargetLease, disposeNativePostEffects, PostV2InitializationRollbackError } from "../../../packages/rendering/src/post/v2Stages";
import * as lifecycleRegistry from "../../../packages/rendering/src/renderer/postSkipped";
import { disposeNativePostEffectsForHost } from "../../../packages/rendering/src/renderer/postSkipped";
import { webgl2DeviceHost } from "../../../packages/rendering/src/webgl2/Counters";
import type { WebGL2DeviceHost } from "../../../packages/rendering/src/webgl2/DeviceHost";

type Handle = { readonly kind: "vao" | "texture"; readonly id: number };

function fixture() {
  const device = new MockRenderDevice();
  const vaos: Handle[] = [], textures: Handle[] = [];
  const attempts = new Map<Handle, number>();
  const failures = new Map<Handle, Error>();
  const counts = new Map<string, number>();
  let onCall: ((name: string, count: number) => void) | undefined;
  let onCreate: ((handle: Handle) => void) | undefined;
  let onDelete: ((handle: Handle) => void) | undefined;
  const enter = (name: string): void => {
    const count = (counts.get(name) ?? 0) + 1;
    counts.set(name, count);
    onCall?.(name, count);
  };
  const make = (kind: Handle["kind"]): Handle => {
    const list = kind === "vao" ? vaos : textures;
    const handle = { kind, id: list.length };
    list.push(handle);
    onCreate?.(handle);
    return handle;
  };
  const remove = (handle: Handle): void => {
    attempts.set(handle, (attempts.get(handle) ?? 0) + 1);
    onDelete?.(handle);
    const failure = failures.get(handle);
    if (failure) throw failure;
  };
  const gl = {
    TEXTURE_2D: 1, TEXTURE_3D: 2, RGBA8: 3, RGBA: 4, UNSIGNED_BYTE: 5,
    TEXTURE_MIN_FILTER: 6, TEXTURE_MAG_FILTER: 7, TEXTURE_WRAP_S: 8,
    TEXTURE_WRAP_T: 9, TEXTURE_WRAP_R: 10, LINEAR: 11, NEAREST: 12, CLAMP_TO_EDGE: 13,
    createVertexArray: vi.fn(() => { enter("createVertexArray"); return make("vao"); }),
    createTexture: vi.fn(() => { enter("createTexture"); return make("texture"); }),
    bindTexture: vi.fn((..._args: unknown[]) => { enter("bindTexture"); }),
    texImage3D: vi.fn((..._args: unknown[]) => { enter("texImage3D"); }),
    texImage2D: vi.fn((..._args: unknown[]) => { enter("texImage2D"); }),
    texParameteri: vi.fn((..._args: unknown[]) => { enter("texParameteri"); }),
    deleteVertexArray: vi.fn(remove),
    deleteTexture: vi.fn(remove)
  };
  const host = { gl, device, disposed: false, contextLost: false } as unknown as WebGL2DeviceHost;
  return {
    device, gl, host, vaos, textures, attempts, failures,
    setOnCall(callback?: (name: string, count: number) => void) { onCall = callback; },
    setOnCreate(callback?: (handle: Handle) => void) { onCreate = callback; },
    setOnDelete(callback?: (handle: Handle) => void) { onDelete = callback; }
  };
}

/** Real WebGL2Device lifecycle, backed only by a synchronous recording GL. */
function deviceFixture() {
  const vaos: object[] = [], textures: object[] = [];
  const attempts = new Map<object, number>(), failures = new Map<object, Error>();
  let onVao: ((handle: object) => void) | undefined, onUpload: (() => void) | undefined;
  const remove = (handle: object): void => {
    attempts.set(handle, (attempts.get(handle) ?? 0) + 1);
    const failure = failures.get(handle);
    if (failure) throw failure;
  };
  const methods: Record<string, unknown> = {
    getError: () => 0, getParameter: () => 16, getExtension: () => null, isContextLost: () => false,
    createVertexArray: () => {
      const handle = {};
      vaos.push(handle);
      onVao?.(handle);
      return handle;
    },
    createTexture: () => { const handle = {}; textures.push(handle); return handle; },
    texImage3D: () => onUpload?.(),
    deleteVertexArray: remove, deleteTexture: remove, deleteBuffer: remove,
    deleteFramebuffer: remove, deleteProgram: remove, deleteSampler: remove
  };
  const gl = new Proxy({}, { get(_target, property) {
    const name = String(property);
    if (name in methods) return methods[name];
    if (name === "NO_ERROR") return 0;
    return /^[A-Z0-9_]+$/.test(name) ? 1 : () => undefined;
  } }) as WebGL2RenderingContext;
  const canvas = { getContext: () => gl, addEventListener() {}, removeEventListener() {} } as unknown as HTMLCanvasElement;
  const device = WebGL2Device.create({ canvas });
  const host = webgl2DeviceHost(device)!;
  return {
    device, host, vaos, textures, attempts, failures,
    setOnVao(callback: (handle: object) => void) { onVao = callback; },
    setOnUpload(callback: () => void) { onUpload = callback; }
  };
}

const key = { width: 4, height: 4, format: "rgba8" } as const;

function caught(action: () => void): unknown {
  try { action(); } catch (error) { return error; }
  throw new Error("Expected the action to throw");
}

afterEach(() => vi.restoreAllMocks());

describe("v2 post initialization rollback", () => {
  it("does not allocate a texture when the vertex array is unavailable", () => {
    const f = fixture();
    f.gl.createVertexArray.mockReturnValueOnce(null as never);
    const error = caught(() => acquireV2TargetLease(f.host, key));
    expect(error).toBeInstanceOf(RenderDeviceError);
    expect((error as RenderDeviceError).code).toBe("POST_GRAPH_V2_UNSUPPORTED");
    expect(f.gl.createTexture).not.toHaveBeenCalled();
    disposeNativePostEffectsForHost(f.host);
    f.device.dispose();
  });

  it("deletes an acquired vertex array if the identity texture allocation returns null", () => {
    const f = fixture();
    f.gl.createTexture.mockReturnValueOnce(null as never);
    const error = caught(() => acquireV2TargetLease(f.host, key));
    expect(error).toBeInstanceOf(RenderDeviceError);
    expect((error as RenderDeviceError).code).toBe("POST_GRAPH_V2_UNSUPPORTED");
    expect(f.attempts.get(f.vaos[0]!)).toBe(1);
    disposeNativePostEffectsForHost(f.host);
    expect(f.attempts.get(f.vaos[0]!)).toBe(1);
    f.device.dispose();
  });

  it.each([
    ["createVertexArray", 1, 0, 0],
    ["createTexture", 1, 1, 0],
    ["bindTexture", 1, 1, 1],
    ["texImage3D", 1, 1, 1],
    ["texParameteri", 1, 1, 1],
    ["bindTexture", 2, 1, 1],
    ["createTexture", 2, 1, 1],
    ["bindTexture", 3, 1, 2],
    ["texImage2D", 1, 1, 2],
    ["texParameteri", 6, 1, 2],
    ["bindTexture", 4, 1, 2]
  ] as const)("rolls back returned handles when %s call %i throws", (name, count, vaoCount, textureCount) => {
    const f = fixture(), failure = new Error(`${name} ${count} failed`);
    f.setOnCall((called, ordinal) => { if (called === name && ordinal === count) throw failure; });
    expect(caught(() => acquireV2TargetLease(f.host, key))).toBe(failure);
    expect(f.vaos).toHaveLength(vaoCount);
    expect(f.textures).toHaveLength(textureCount);
    for (const handle of [...f.vaos, ...f.textures]) expect(f.attempts.get(handle)).toBe(1);
    disposeNativePostEffectsForHost(f.host);
    for (const handle of [...f.vaos, ...f.textures]) expect(f.attempts.get(handle)).toBe(1);
    f.device.dispose();
  });

  it("also rolls back GL objects when creation of the post pool throws", () => {
    const f = fixture(), failure = new Error("post pool factory failed");
    vi.spyOn(renderTargetPoolSlot, "get").mockImplementationOnce(() => { throw failure; });
    expect(caught(() => acquireV2TargetLease(f.host, key))).toBe(failure);
    expect(f.vaos).toHaveLength(1);
    expect(f.textures).toHaveLength(2);
    for (const handle of [...f.vaos, ...f.textures]) expect(f.attempts.get(handle)).toBe(1);
    disposeNativePostEffectsForHost(f.host);
    f.device.dispose();
  });

  it("keeps every failed rollback reachable by host cleanup without repeating successful deletes", () => {
    const f = fixture();
    const initial = new Error("3D upload failed");
    const vaoFailure = new Error("vao delete failed"), textureFailure = new Error("texture delete failed");
    f.setOnCall(name => {
      if (name !== "texImage3D") return;
      f.failures.set(f.vaos[0]!, vaoFailure);
      f.failures.set(f.textures[0]!, textureFailure);
      throw initial;
    });
    const error = caught(() => acquireV2TargetLease(f.host, key)) as AggregateError;
    expect(error).toBeInstanceOf(AggregateError);
    expect(error.cause).toBe(initial);
    expect(error.errors).toEqual(expect.arrayContaining([initial, vaoFailure, textureFailure]));
    expect([...f.attempts.values()]).toEqual([1, 1]);

    f.failures.delete(f.vaos[0]!);
    expect(() => disposeNativePostEffectsForHost(f.host)).toThrow(AggregateError);
    expect(f.attempts.get(f.vaos[0]!)).toBe(2);
    expect(f.attempts.get(f.textures[0]!)).toBe(2);
    f.failures.clear();
    disposeNativePostEffectsForHost(f.host);
    disposeNativePostEffectsForHost(f.host);
    expect(f.attempts.get(f.vaos[0]!)).toBe(2);
    expect(f.attempts.get(f.textures[0]!)).toBe(3);
    f.device.dispose();
  });

  it("retries a real WebGL2Device lifecycle after initialization rollback fails", () => {
    const f = deviceFixture(), initial = new Error("upload failed"), deletion = new Error("delete failed");
    f.setOnUpload(() => {
      f.failures.set(f.textures[0]!, deletion);
      throw initial;
    });
    const error = caught(() => acquireV2TargetLease(f.host, key)) as PostV2InitializationRollbackError;
    expect(error.cause).toBe(initial);
    expect(error.errors).toContain(deletion);
    expect(f.attempts.get(f.vaos[0]!)).toBe(1);
    expect(f.attempts.get(f.textures[0]!)).toBe(1);
    expect(() => f.device.dispose()).toThrow(AggregateError);
    expect(f.attempts.get(f.textures[0]!)).toBe(2);
    f.failures.clear();
    f.device.dispose();
    f.device.dispose();
    expect(f.attempts.get(f.vaos[0]!)).toBe(1);
    expect(f.attempts.get(f.textures[0]!)).toBe(3);
  });

  it("exposes an explicit retry when the real device is disposed before its VAO call returns", () => {
    const f = deviceFixture(), deletion = new Error("delete failed");
    f.setOnVao(handle => {
      f.failures.set(handle, deletion);
      f.device.dispose();
    });
    const error = caught(() => acquireV2TargetLease(f.host, key)) as PostV2InitializationRollbackError;
    expect(error).toBeInstanceOf(PostV2InitializationRollbackError);
    expect((error.cause as Error).message).toBe("POSTPROCESS_STATE_INVALIDATED");
    expect(error.errors).toContain(deletion);
    expect(f.device.disposed).toBe(true);
    expect(f.attempts.get(f.vaos[0]!)).toBe(1);
    f.failures.clear();
    error.retryCleanup();
    error.retryCleanup();
    f.device.dispose();
    disposeNativePostEffectsForHost(f.host);
    expect(f.attempts.get(f.vaos[0]!)).toBe(2);
  });

  it("keeps failed rollback reachable when a delete reenters host disposal", () => {
    const f = fixture(), initial = new Error("upload failed"), deletion = new Error("delete failed");
    f.setOnCall(name => {
      if (name !== "texImage2D") return;
      f.failures.set(f.textures[0]!, deletion);
      throw initial;
    });
    let nested = false;
    f.setOnDelete(() => {
      if (!nested) {
        nested = true;
        disposeNativePostEffectsForHost(f.host);
      }
    });
    const error = caught(() => acquireV2TargetLease(f.host, key)) as AggregateError;
    expect(error).toBeInstanceOf(AggregateError);
    expect(error.cause).toBe(initial);
    expect(error.errors).toContain(deletion);
    expect([...f.vaos, ...f.textures].map(handle => f.attempts.get(handle))).toEqual([1, 1, 1]);
    expect(() => disposeNativePostEffectsForHost(f.host)).toThrow(AggregateError);
    expect([...f.vaos, ...f.textures].map(handle => f.attempts.get(handle))).toEqual([1, 2, 1]);
    f.failures.clear();
    disposeNativePostEffectsForHost(f.host);
    expect([...f.vaos, ...f.textures].map(handle => f.attempts.get(handle))).toEqual([1, 3, 1]);
    f.device.dispose();
  });

  it("keeps old failed initialization cleanup when a replacement state is created", () => {
    const f = fixture(), initial = new Error("first upload failed"), deletion = new Error("old texture failed");
    f.setOnCall(name => {
      if (name !== "texImage3D") return;
      f.setOnCall();
      f.failures.set(f.textures[0]!, deletion);
      throw initial;
    });
    const first = caught(() => acquireV2TargetLease(f.host, key)) as AggregateError;
    expect(first.cause).toBe(initial);
    const lease = acquireV2TargetLease(f.host, key);
    expect(f.attempts.get(f.textures[0]!)).toBe(1);
    expect(() => disposeNativePostEffectsForHost(f.host)).toThrow(AggregateError);
    expect(f.attempts.get(f.textures[0]!)).toBe(2);
    expect(f.attempts.get(f.vaos[0]!)).toBe(1);
    expect(f.attempts.get(f.vaos[1]!)).toBe(1);
    expect(f.attempts.get(f.textures[1]!)).toBe(1);
    expect(f.attempts.get(f.textures[2]!)).toBe(1);
    f.failures.clear();
    disposeNativePostEffectsForHost(f.host);
    lease.release();
    expect(f.attempts.get(f.textures[0]!)).toBe(3);
    for (const handle of [f.vaos[0]!, f.vaos[1]!, f.textures[1]!, f.textures[2]!]) {
      expect(f.attempts.get(handle)).toBe(1);
    }
    f.device.dispose();
  });

  it("does not retry an older failed generation during an unrelated initialization rollback", () => {
    const f = fixture(), firstFailure = new Error("first upload"), secondFailure = new Error("second upload");
    f.setOnCall((name, count) => {
      if (name !== "texImage3D") return;
      if (count === 1) {
        f.failures.set(f.textures[0]!, new Error("old delete failed"));
        throw firstFailure;
      }
      throw secondFailure;
    });
    expect((caught(() => acquireV2TargetLease(f.host, key)) as AggregateError).cause).toBe(firstFailure);
    expect(caught(() => acquireV2TargetLease(f.host, key))).toBe(secondFailure);
    expect(f.attempts.get(f.textures[0]!)).toBe(1);
    expect(f.attempts.get(f.vaos[1]!)).toBe(1);
    expect(f.attempts.get(f.textures[1]!)).toBe(1);
    expect(() => disposeNativePostEffectsForHost(f.host)).toThrow(AggregateError);
    expect(f.attempts.get(f.textures[0]!)).toBe(2);
    f.failures.clear();
    disposeNativePostEffectsForHost(f.host);
    expect(f.attempts.get(f.textures[0]!)).toBe(3);
    expect(f.attempts.get(f.vaos[1]!)).toBe(1);
    expect(f.attempts.get(f.textures[1]!)).toBe(1);
    f.device.dispose();
  });

  it("retains a failed initialization created during an already-running host disposal", () => {
    const f = fixture(), initial = new Error("nested upload failed"), deletion = new Error("nested delete failed");
    const lease = acquireV2TargetLease(f.host, key);
    let nested: unknown;
    f.setOnDelete(handle => {
      if (handle !== f.vaos[0]) return;
      f.setOnDelete();
      f.setOnCall(name => {
        if (name !== "texImage3D") return;
        f.setOnCall();
        f.failures.set(f.textures[2]!, deletion);
        throw initial;
      });
      nested = caught(() => acquireV2TargetLease(f.host, key));
    });
    const error = caught(() => disposeNativePostEffectsForHost(f.host)) as AggregateError;
    expect(nested).toBe(initial);
    expect(error).toBeInstanceOf(AggregateError);
    expect(error.errors).toContain(deletion);
    expect(f.vaos).toHaveLength(2);
    expect(f.textures).toHaveLength(3);
    for (const handle of [...f.vaos, ...f.textures]) expect(f.attempts.get(handle)).toBe(1);
    expect(() => disposeNativePostEffectsForHost(f.host)).toThrow(AggregateError);
    expect(f.attempts.get(f.textures[2]!)).toBe(2);
    f.failures.clear();
    disposeNativePostEffectsForHost(f.host);
    disposeNativePostEffectsForHost(f.host);
    expect(f.attempts.get(f.textures[2]!)).toBe(3);
    for (const handle of [f.vaos[0]!, f.vaos[1]!, f.textures[0]!, f.textures[1]!]) {
      expect(f.attempts.get(handle)).toBe(1);
    }
    lease.release();
    f.device.dispose();
  });

  it("allows the error handle to retry only its own generation, leaving a replacement active", () => {
    const f = fixture(), initial = new Error("upload failed");
    f.setOnCall(name => {
      if (name !== "texImage3D") return;
      f.setOnCall();
      f.failures.set(f.textures[0]!, new Error("delete failed"));
      throw initial;
    });
    const error = caught(() => acquireV2TargetLease(f.host, key)) as PostV2InitializationRollbackError;
    expect(error).toBeInstanceOf(PostV2InitializationRollbackError);
    expect(error.cause).toBe(initial);
    const lease = acquireV2TargetLease(f.host, key);
    f.failures.clear();
    error.retryCleanup();
    error.retryCleanup();
    expect(f.attempts.get(f.vaos[0]!)).toBe(1);
    expect(f.attempts.get(f.textures[0]!)).toBe(2);
    expect(f.attempts.get(f.vaos[1]!)).toBeUndefined();
    expect(f.attempts.get(f.textures[1]!)).toBeUndefined();
    expect(f.attempts.get(f.textures[2]!)).toBeUndefined();
    expect(lease.target.disposed).toBe(false);
    disposeNativePostEffectsForHost(f.host);
    lease.release();
    expect([...f.vaos, ...f.textures].map(handle => f.attempts.get(handle))).toEqual([1, 1, 2, 1, 1]);
    f.device.dispose();
  });

  it("preserves lifecycle ownership when an error-handle retry reenters host disposal", () => {
    const f = fixture(), initial = new Error("upload failed");
    f.setOnCall(name => {
      if (name !== "texImage3D") return;
      f.setOnCall();
      f.failures.set(f.textures[0]!, new Error("delete failed"));
      throw initial;
    });
    const error = caught(() => acquireV2TargetLease(f.host, key)) as PostV2InitializationRollbackError;
    f.setOnDelete(() => {
      f.setOnDelete();
      disposeNativePostEffectsForHost(f.host);
    });
    expect(() => error.retryCleanup()).toThrow(AggregateError);
    expect(f.attempts.get(f.textures[0]!)).toBe(2);
    expect(() => disposeNativePostEffectsForHost(f.host)).toThrow(AggregateError);
    expect(f.attempts.get(f.textures[0]!)).toBe(3);
    f.failures.clear();
    disposeNativePostEffectsForHost(f.host);
    error.retryCleanup();
    expect(f.attempts.get(f.textures[0]!)).toBe(4);
    expect(f.attempts.get(f.vaos[0]!)).toBe(1);
    f.device.dispose();
  });

  it("attempts newly retired initialization handles created inside an error-handle retry", () => {
    const f = fixture(), initial = new Error("first upload"), nestedInitial = new Error("nested upload");
    const nestedDeletion = new Error("nested delete");
    f.setOnCall(name => {
      if (name !== "texImage3D") return;
      f.setOnCall();
      f.failures.set(f.textures[0]!, new Error("first delete"));
      throw initial;
    });
    const first = caught(() => acquireV2TargetLease(f.host, key)) as PostV2InitializationRollbackError;
    f.failures.clear();
    let nested: unknown;
    f.setOnDelete(handle => {
      if (handle !== f.textures[0]) return;
      f.setOnDelete();
      f.setOnCall(name => {
        if (name !== "texImage3D") return;
        f.setOnCall();
        f.failures.set(f.textures[1]!, nestedDeletion);
        throw nestedInitial;
      });
      nested = caught(() => acquireV2TargetLease(f.host, key));
    });
    const retryError = caught(() => first.retryCleanup()) as AggregateError;
    expect(nested).toBe(nestedInitial);
    expect(retryError.errors).toContain(nestedDeletion);
    expect(f.attempts.get(f.vaos[0]!)).toBe(1);
    expect(f.attempts.get(f.textures[0]!)).toBe(2);
    expect(f.attempts.get(f.vaos[1]!)).toBe(1);
    expect(f.attempts.get(f.textures[1]!)).toBe(1);
    f.failures.clear();
    disposeNativePostEffectsForHost(f.host);
    expect(f.attempts.get(f.textures[1]!)).toBe(2);
    expect(f.attempts.get(f.vaos[1]!)).toBe(1);
    f.device.dispose();
  });

  it("exposes retry even when reentrant host disposal consumes registration and re-registration throws", () => {
    const f = fixture(), deletion = new Error("delete failed"), registration = new Error("registration failed");
    const register = lifecycleRegistry.registerNativePostEffectLifecycle;
    let registrations = 0;
    vi.spyOn(lifecycleRegistry, "registerNativePostEffectLifecycle").mockImplementation((host, lifecycle) => {
      if (++registrations > 1) throw registration;
      register(host, lifecycle);
    });
    f.setOnCreate(handle => {
      if (handle.kind !== "vao") return;
      f.failures.set(handle, deletion);
      disposeNativePostEffectsForHost(f.host);
    });
    const error = caught(() => acquireV2TargetLease(f.host, key)) as PostV2InitializationRollbackError;
    expect(error).toBeInstanceOf(PostV2InitializationRollbackError);
    expect((error.cause as Error).message).toBe("POSTPROCESS_STATE_INVALIDATED");
    expect(error.errors).toEqual(expect.arrayContaining([deletion, registration]));
    disposeNativePostEffectsForHost(f.host);
    expect(f.attempts.get(f.vaos[0]!)).toBe(1);
    expect(() => error.retryCleanup()).toThrow(AggregateError);
    expect(f.attempts.get(f.vaos[0]!)).toBe(2);
    f.failures.clear();
    error.retryCleanup();
    error.retryCleanup();
    expect(f.attempts.get(f.vaos[0]!)).toBe(3);
    f.device.dispose();
  });

  it.each(["vao", "identity", "blank"] as const)(
    "invalidates in-flight initialization when host disposal runs before the %s handle returns",
    stage => {
      const f = fixture(), deletion = new Error("returned handle delete failed");
      f.setOnCreate(handle => {
        const match = stage === "vao" ? handle.kind === "vao"
          : handle.kind === "texture" && handle.id === (stage === "identity" ? 0 : 1);
        if (!match) return;
        f.failures.set(handle, deletion);
        disposeNativePostEffectsForHost(f.host);
      });
      const error = caught(() => acquireV2TargetLease(f.host, key)) as AggregateError;
      expect(error).toBeInstanceOf(AggregateError);
      expect((error.cause as Error).message).toContain("POSTPROCESS_STATE_INVALIDATED");
      expect(error.errors).toContain(deletion);
      for (const handle of [...f.vaos, ...f.textures]) expect(f.attempts.get(handle)).toBe(1);
      const failed = [...f.failures.keys()][0]!;
      f.failures.clear();
      disposeNativePostEffectsForHost(f.host);
      for (const handle of [...f.vaos, ...f.textures]) {
        expect(f.attempts.get(handle)).toBe(handle === failed ? 2 : 1);
      }
      f.device.dispose();
    }
  );

  it("aborts immediately when disposal happens during a texture upload", () => {
    const f = fixture();
    f.setOnCall(name => { if (name === "texImage3D") disposeNativePostEffectsForHost(f.host); });
    expect(() => acquireV2TargetLease(f.host, key)).toThrow("POSTPROCESS_STATE_INVALIDATED");
    expect(f.gl.texParameteri).not.toHaveBeenCalled();
    expect(f.gl.createTexture).toHaveBeenCalledTimes(1);
    expect([...f.vaos, ...f.textures].map(handle => f.attempts.get(handle))).toEqual([1, 1]);
    disposeNativePostEffectsForHost(f.host);
    f.device.dispose();
  });

  it("deletes partial handles using the original GL context after the host context changes", () => {
    const f = fixture(), replacement = fixture();
    f.setOnCall(name => { if (name === "texImage3D") Object.assign(f.host, { gl: replacement.gl }); });
    expect(() => acquireV2TargetLease(f.host, key)).toThrow("POSTPROCESS_STATE_INVALIDATED");
    expect([...f.vaos, ...f.textures].map(handle => f.attempts.get(handle))).toEqual([1, 1]);
    expect(replacement.gl.deleteVertexArray).not.toHaveBeenCalled();
    expect(replacement.gl.deleteTexture).not.toHaveBeenCalled();
    disposeNativePostEffectsForHost(f.host);
    f.device.dispose();
    replacement.device.dispose();
  });

  it("rejects a context generation change even when loss flags have already cleared", () => {
    const f = fixture();
    Object.assign(f.device, { generation: 1 });
    f.setOnCall(name => { if (name === "texImage3D") Object.assign(f.device, { generation: 2 }); });
    expect(() => acquireV2TargetLease(f.host, key)).toThrow("POSTPROCESS_STATE_INVALIDATED");
    expect(f.gl.texParameteri).not.toHaveBeenCalled();
    expect([...f.vaos, ...f.textures].map(handle => f.attempts.get(handle))).toEqual([1, 1]);
    disposeNativePostEffectsForHost(f.host);
    f.device.dispose();
  });

  it("rejects native context loss detected before the loss event updates the host", () => {
    const f = fixture();
    let lost = false;
    Object.assign(f.device, { isDeviceLost: () => lost });
    f.setOnCall(name => { if (name === "texImage3D") lost = true; });
    const error = caught(() => acquireV2TargetLease(f.host, key));
    expect(error).toBeInstanceOf(RenderDeviceError);
    expect((error as RenderDeviceError).code).toBe("CONTEXT_LOST");
    expect(f.gl.texParameteri).not.toHaveBeenCalled();
    expect([...f.vaos, ...f.textures].map(handle => f.attempts.get(handle))).toEqual([1, 1]);
    disposeNativePostEffectsForHost(f.host);
    f.device.dispose();
  });

  it("invalidates the cached texture bindings when raw initialization upload fails", () => {
    const f = fixture(), cache = new WebGL2StateCache({ label: "post-init" }), previous = {};
    Object.assign(f.host, { stateCache: cache });
    cache.activeTexture(0, () => {});
    cache.bindTexture(f.gl.TEXTURE_3D, previous, () => {});
    expect(cache.bindTexture(f.gl.TEXTURE_3D, previous, () => {})).toBe(false);
    const failure = new Error("upload failed");
    f.setOnCall(name => { if (name === "texImage3D") throw failure; });
    expect(caught(() => acquireV2TargetLease(f.host, key))).toBe(failure);
    expect(cache.snapshot().textures).toEqual({});
    cache.activeTexture(0, () => {});
    expect(cache.bindTexture(f.gl.TEXTURE_3D, previous, () => {})).toBe(true);
    disposeNativePostEffectsForHost(f.host);
    f.device.dispose();
  });

  it("does not retry a failed deletion when cache invalidation reenters host disposal", () => {
    const f = fixture(), cache = new WebGL2StateCache({ label: "post-init-reentrant" });
    Object.assign(f.host, { stateCache: cache });
    cache.onInvalidate(() => disposeNativePostEffectsForHost(f.host));
    const initial = new Error("upload failed"), deletion = new Error("texture delete failed");
    f.setOnCall(name => {
      if (name !== "texImage3D") return;
      f.failures.set(f.textures[0]!, deletion);
      throw initial;
    });
    const error = caught(() => acquireV2TargetLease(f.host, key)) as PostV2InitializationRollbackError;
    expect(error.cause).toBe(initial);
    expect(error.errors).toEqual(expect.arrayContaining([initial, deletion]));
    expect(f.attempts.get(f.vaos[0]!)).toBe(1);
    expect(f.attempts.get(f.textures[0]!)).toBe(1);
    expect(() => disposeNativePostEffectsForHost(f.host)).toThrow(AggregateError);
    expect(f.attempts.get(f.textures[0]!)).toBe(2);
    f.failures.clear();
    disposeNativePostEffectsForHost(f.host);
    expect(f.attempts.get(f.textures[0]!)).toBe(3);
    expect(f.attempts.get(f.vaos[0]!)).toBe(1);
    f.device.dispose();
  });

  it("does not publish an initializer invalidated by a device-loss callback in pool construction", () => {
    const f = fixture(), unsubscribeFailure = new Error("unsubscribe failed");
    let unsubscribeAttempts = 0, failUnsubscribe = true;
    Object.assign(f.device, {
      onDeviceLost: () => {
        disposeNativePostEffectsForHost(f.host);
        return () => {
          unsubscribeAttempts++;
          if (failUnsubscribe) throw unsubscribeFailure;
        };
      }
    });
    const error = caught(() => acquireV2TargetLease(f.host, key)) as AggregateError;
    expect(error).toBeInstanceOf(AggregateError);
    expect((error.cause as Error).message).toContain("POSTPROCESS_STATE_INVALIDATED");
    expect(unsubscribeAttempts).toBe(1);
    expect([...f.vaos, ...f.textures].map(handle => f.attempts.get(handle))).toEqual([1, 1, 1]);
    failUnsubscribe = false;
    disposeNativePostEffectsForHost(f.host);
    expect(unsubscribeAttempts).toBe(2);
    expect([...f.vaos, ...f.textures].map(handle => f.attempts.get(handle))).toEqual([1, 1, 1]);
    f.device.dispose();
  });

  it("rejects nested setup without creating or publishing a competing state", () => {
    const f = fixture();
    let nested: unknown;
    f.setOnCreate(handle => {
      if (handle.kind === "vao") {
        f.setOnCreate();
        nested = caught(() => acquireV2TargetLease(f.host, key));
      }
    });
    const lease = acquireV2TargetLease(f.host, key);
    expect((nested as Error).message).toContain("POSTPROCESS_STATE_INITIALIZING");
    expect(f.vaos).toHaveLength(1);
    expect(f.textures).toHaveLength(2);
    disposeNativePostEffectsForHost(f.host);
    lease.release();
    expect([...f.vaos, ...f.textures].map(handle => f.attempts.get(handle))).toEqual([1, 1, 1]);
    f.device.dispose();
  });

  it("preserves the optional blank-texture fallback and deletes its identity only once", () => {
    const f = fixture();
    const identity = { kind: "texture", id: 0 } as const;
    f.gl.createTexture.mockReturnValueOnce(identity).mockReturnValueOnce(null as never);
    const lease = acquireV2TargetLease(f.host, key);
    disposeNativePostEffects(f.host);
    lease.release();
    expect(f.attempts.get(f.vaos[0]!)).toBe(1);
    expect(f.attempts.get(identity)).toBe(1);
    f.device.dispose();
  });

  it("does not delete an aliased blank and identity texture twice during rollback", () => {
    const f = fixture(), identity = { kind: "texture", id: 0 } as const, initial = new Error("blank upload");
    f.gl.createTexture.mockReturnValueOnce(identity).mockReturnValueOnce(identity);
    f.setOnCall(name => { if (name === "texImage2D") throw initial; });
    expect(caught(() => acquireV2TargetLease(f.host, key))).toBe(initial);
    expect(f.attempts.get(f.vaos[0]!)).toBe(1);
    expect(f.attempts.get(identity)).toBe(1);
    disposeNativePostEffectsForHost(f.host);
    expect(f.attempts.get(identity)).toBe(1);
    f.device.dispose();
  });
});
