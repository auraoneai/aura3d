import { describe, expect, it, vi } from "vitest";
import type { DrawCommand, UniformValue } from "../../../packages/rendering/src/RenderDevice";
import { ShaderLibrary, DEFAULT_UNLIT_SHADER_NAME, registerLeanUnlitShader } from "../../../packages/rendering/src/ShaderLibraryCore";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { STATIC_UNLIT_PAIR_MAX_BUFFER_BYTES, STATIC_UNLIT_PAIR_MAX_MIRROR_BYTES, WebGL2Device } from "../../../packages/rendering/src/WebGL2Device";
import { WebGLBatchSubmissionState } from "../../../packages/rendering/src/webgl2/BatchExecutionCapability";
import { webgl2DeviceHost } from "../../../packages/rendering/src/webgl2/Counters";
import { deriveStaticBatchUnlitShaderSource } from "../../../packages/rendering/src/webgl2/StaticBatchUnlitShader";
import { fakeWebGL } from "./static-unlit-fake-webgl";

function matrix(translation: number): Float32Array {
  return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, translation, 0, 0, 1]);
}

function commandsFor(device: WebGL2Device): readonly [DrawCommand, DrawCommand] {
  const library = new ShaderLibrary();
  registerLeanUnlitShader(library);
  const shader = device.createShaderProgram(library.compileSource(DEFAULT_UNLIT_SHADER_NAME));
  const vertices = new Float32Array([-0.1, -0.1, 0, 0.1, -0.1, 0, 0, 0.1, 0]);
  const vertexBuffer = device.createBuffer("vertex", vertices.byteLength, vertices);
  const indices = new Uint16Array([0, 1, 2]);
  const indexBuffer = device.createBuffer("index", indices.byteLength, indices);
  const uniforms = (translation: number) => new Map<string, UniformValue>([
    ["u_modelViewProjection", matrix(translation)],
    ["u_baseColor", new Float32Array([1, 1, 1, 1])],
    ["u_pointSize", 1], ["u_alphaCutoff", 0], ["u_roundPoints", 0],
    ["u_instanceCount", 0], ["u_instanceAttributeMode", 0]
  ]);
  const base: DrawCommand = { label: "first", topology: "triangles", vertexBuffer, vertexFormat: VertexFormat.P3,
    renderState: { depthTest: true, depthWrite: true, cullMode: "back", blend: false, depthCompare: "less-equal" },
    vertexCount: 3, indexBuffer, indexType: "uint16", indexCount: 3, shader, uniforms: uniforms(-0.5) };
  return [base, { ...base, label: "second", uniforms: uniforms(0.5) }];
}

function liveBinderPair() {
  const fixture = fakeWebGL();
  const { device } = fixture;
  const [first, second] = commandsFor(device);
  device.beginFrame(128, 128);
  device.draw(first);
  const library = new ShaderLibrary();
  registerLeanUnlitShader(library);
  const pairShader = device.createShaderProgram(deriveStaticBatchUnlitShaderSource(library.get(DEFAULT_UNLIT_SHADER_NAME)));
  const binder = webgl2DeviceHost(device)!.drawBinder;
  const plan = binder.inspectStaticUnlitPair(first, second);
  if (!plan) throw new Error("ordinary unlit pair was not inspectable");
  if (!binder.prewarmStaticUnlitPairVao(first, pairShader)) throw new Error("pair VAO was not prewarmed");
  const submission = new WebGLBatchSubmissionState(device.activeFrameToken!, device.generation);
  return { ...fixture, first, second, pairShader, binder, plan, submission };
}

function liveDevicePair() {
  const fixture = fakeWebGL();
  const { device } = fixture;
  const commands = commandsFor(device);
  device.beginFrame(128, 128);
  // The ordinary draw warms its native program and VAO. A cold pair attempt
  // may then warm its own program/VAO, but must not submit either member.
  device.draw(commands[0]);
  const drawsBeforeWarm = fixture.nativeDraws.length;
  expect(device.prepareStaticUnlitPair(commands)).toBeUndefined();
  expect(fixture.nativeDraws).toHaveLength(drawsBeforeWarm);
  // The caller's cold fallback remains two immediate ordinary draws.
  device.draw(commands[0]);
  device.draw(commands[1]);
  const ticket = device.prepareStaticUnlitPair(commands);
  if (!ticket) throw new Error("warmed disjoint unlit pair was not prepared");
  return { ...fixture, commands, ticket };
}

describe("static unlit device buffer mirrors", () => {
  it("copies the uploaded view range, preserves zero-filled bytes and isolates snapshots", () => {
    const { device } = fakeWebGL();
    try {
      const backing = new Uint8Array([99, 11, 12, 13, 98]);
      const initial = new Uint8Array(backing.buffer, 1, 3);
      const buffer = device.createBuffer("vertex", 8, initial);
      const first = device.snapshotStaticUnlitBuffer(buffer)!;
      expect([...first.bytes]).toEqual([11, 12, 13, 0, 0, 0, 0, 0]);
      expect(first.generation).toBe(device.generation);

      initial.fill(7);
      first.bytes.fill(8);
      expect([...device.snapshotStaticUnlitBuffer(buffer)!.bytes]).toEqual([11, 12, 13, 0, 0, 0, 0, 0]);

      const updateBacking = new Uint8Array([70, 21, 22, 71]);
      const update = new DataView(updateBacking.buffer, 1, 2);
      device.updateBuffer(buffer, 4, update);
      const second = device.snapshotStaticUnlitBuffer(buffer)!;
      expect([...second.bytes]).toEqual([11, 12, 13, 0, 21, 22, 0, 0]);
      expect(second.revision).toBeGreaterThan(first.revision);
      updateBacking.fill(0);
      expect([...device.snapshotStaticUnlitBuffer(buffer)!.bytes]).toEqual([11, 12, 13, 0, 21, 22, 0, 0]);
    } finally { device.dispose(); }
  });

  it("does not change the mirror for an invalid update and drops it when a native update may have partially run", () => {
    const { device, state, calls } = fakeWebGL();
    try {
      const buffer = device.createBuffer("index", 4, new Uint8Array([1, 2, 3, 4]));
      const before = device.snapshotStaticUnlitBuffer(buffer)!;
      const uploads = calls.length;
      expect(() => device.updateBuffer(buffer, 3, new Uint8Array([5, 6]))).toThrow();
      expect(calls).toHaveLength(uploads);
      expect(device.snapshotStaticUnlitBuffer(buffer)).toEqual(before);

      state.failBufferSubData = true;
      expect(() => device.updateBuffer(buffer, 1, new Uint8Array([8, 9]))).toThrow("buffer update failed after entry");
      expect(device.snapshotStaticUnlitBuffer(buffer)).toBeUndefined();
      state.failBufferSubData = false;
      device.updateBuffer(buffer, 1, new Uint8Array([6, 6]));
      expect(device.snapshotStaticUnlitBuffer(buffer)).toBeUndefined();
      device.updateBuffer(buffer, 0, new Uint8Array([7, 7, 7, 7]));
      expect([...device.snapshotStaticUnlitBuffer(buffer)!.bytes]).toEqual([7, 7, 7, 7]);
    } finally { device.dispose(); }
  });

  it("does not retain a snapshot when an upload uses concurrently mutable shared memory", () => {
    if (typeof SharedArrayBuffer === "undefined") return;
    const { device } = fakeWebGL();
    try {
      const buffer = device.createBuffer("vertex", 4, new Uint8Array([1, 2, 3, 4]));
      const shared = new Uint8Array(new SharedArrayBuffer(4));
      shared.set([5, 6, 7, 8]);
      device.updateBuffer(buffer, 0, shared);
      expect(device.snapshotStaticUnlitBuffer(buffer)).toBeUndefined();
      expect([...device.readBuffer(buffer)]).toEqual([5, 6, 7, 8]);
    } finally { device.dispose(); }
  });

  it("enforces per-buffer and total mirror caps and releases capacity on disposal", () => {
    const { device } = fakeWebGL();
    try {
      const oversized = device.createBuffer("vertex", STATIC_UNLIT_PAIR_MAX_BUFFER_BYTES + 1);
      expect(device.snapshotStaticUnlitBuffer(oversized)).toBeUndefined();
      const uniform = device.createBuffer("uniform", 4);
      expect(device.snapshotStaticUnlitBuffer(uniform)).toBeUndefined();

      const count = STATIC_UNLIT_PAIR_MAX_MIRROR_BYTES / STATIC_UNLIT_PAIR_MAX_BUFFER_BYTES;
      expect(Number.isInteger(count)).toBe(true);
      const buffers = Array.from({ length: count }, () => device.createBuffer("vertex", STATIC_UNLIT_PAIR_MAX_BUFFER_BYTES));
      expect(buffers.every((buffer) => device.snapshotStaticUnlitBuffer(buffer) !== undefined)).toBe(true);
      const pending = device.createBuffer("index", 4, new Uint8Array([1, 2, 3, 4]));
      expect(device.snapshotStaticUnlitBuffer(pending)).toBeUndefined();
      buffers[0]!.dispose();
      device.updateBuffer(pending, 0, new Uint8Array([5, 6, 7, 8]));
      expect([...device.snapshotStaticUnlitBuffer(pending)!.bytes]).toEqual([5, 6, 7, 8]);
    } finally { device.dispose(); }
  });

  it("invalidates snapshots on buffer disposal, device loss and device disposal", () => {
    const { device, dispatch } = fakeWebGL();
    const deleted = device.createBuffer("vertex", 4, new Uint8Array([1, 2, 3, 4]));
    deleted.dispose();
    expect(device.snapshotStaticUnlitBuffer(deleted)).toBeUndefined();

    const lost = device.createBuffer("vertex", 4, new Uint8Array([5, 6, 7, 8]));
    const generation = device.generation;
    dispatch("webglcontextlost");
    expect(device.generation).toBeGreaterThan(generation);
    expect(device.snapshotStaticUnlitBuffer(lost)).toBeUndefined();
    dispatch("webglcontextrestored");
    expect(device.snapshotStaticUnlitBuffer(lost)).toBeUndefined();
    const current = device.createBuffer("vertex", 4, new Uint8Array([9, 8, 7, 6]));
    expect(device.snapshotStaticUnlitBuffer(current)).toBeDefined();
    device.dispose();
    expect(device.snapshotStaticUnlitBuffer(current)).toBeUndefined();
  });

  it("does not expose snapshots for resources owned by another device", () => {
    const first = fakeWebGL(), second = fakeWebGL();
    try {
      const buffer = first.device.createBuffer("vertex", 4, new Uint8Array([1, 2, 3, 4]));
      expect(first.device.snapshotStaticUnlitBuffer(buffer)).toBeDefined();
      expect(second.device.snapshotStaticUnlitBuffer(buffer)).toBeUndefined();
    } finally {
      first.device.dispose();
      second.device.dispose();
    }
  });

  it("declines before invoking overridden device methods or accessors", () => {
    const { device } = fakeWebGL();
    const vertex = device.createBuffer("vertex", 4, new Uint8Array([1, 2, 3, 4]));
    const index = device.createBuffer("index", 4, new Uint8Array([0, 0, 1, 0]));
    const overriddenLoss = vi.fn(() => { throw new Error("loss override must not run"); });
    const overriddenCreate = vi.fn(() => { throw new Error("create override must not run"); });
    const overriddenDisposed = vi.fn(() => { throw new Error("disposed getter must not run"); });
    try {
      expect(device.hasStaticUnlitPairBuffers([vertex], index)).toBe(true);
      Object.defineProperty(device, "isDeviceLost", { configurable: true, value: overriddenLoss });
      expect(device.hasStaticUnlitPairBuffers([vertex], index)).toBe(false);
      expect(overriddenLoss).not.toHaveBeenCalled();
      Reflect.deleteProperty(device, "isDeviceLost");

      Object.defineProperty(device, "createBuffer", { configurable: true, get: overriddenCreate });
      expect(device.hasStaticUnlitPairBuffers([vertex], index)).toBe(false);
      expect(overriddenCreate).not.toHaveBeenCalled();
      Reflect.deleteProperty(device, "createBuffer");

      Object.defineProperty(device, "disposed", { configurable: true, get: overriddenDisposed });
      expect(device.hasStaticUnlitPairBuffers([vertex], index)).toBe(false);
      expect(overriddenDisposed).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(device, "isDeviceLost");
      Reflect.deleteProperty(device, "createBuffer");
      Reflect.deleteProperty(device, "disposed");
      device.dispose();
    }
  });
});

describe("static unlit pair binder", () => {
  it("submits the ordered matrices once and restores ordinary program, VAO and uniform cache", () => {
    const { device, gl, state, first, second, pairShader, binder, plan, submission, nativeDraws, matrixUploads } = liveBinderPair();
    try {
      const originalProgram = state.currentProgram;
      const originalVao = state.currentVao;
      const onSubmitted = vi.fn();
      expect(binder.tryDrawStaticUnlitPair(first, second, pairShader, plan, submission, onSubmitted)).toBe(true);
      expect(onSubmitted).toHaveBeenCalledTimes(1);
      expect(submission.phase).toBe("completed");
      expect(submission.mayFallBackBeforeSubmission).toBe(false);
      expect(nativeDraws.map((draw) => draw.name)).toEqual(["drawElements", "drawElementsInstanced"]);
      expect(nativeDraws[1]!.args).toEqual([gl.TRIANGLES, 3, gl.UNSIGNED_SHORT, 0, 2]);
      const batchUpload = matrixUploads.find((upload) => upload.name === "u_batchMVP");
      expect(batchUpload?.data).toEqual([...matrix(-0.5), ...matrix(0.5)]);
      expect(state.currentProgram).toBe(originalProgram);
      expect(state.currentVao).toBe(originalVao);
      expect(state.currentProgram?.values.get("u_modelViewProjection")).toEqual(matrix(0.5));
      expect(webgl2DeviceHost(device)!.counters.drawCalls).toBe(2);
      expect(webgl2DeviceHost(device)!.counters.nativeInstancedSubmissions).toBe(1);

      const ordinaryMvpUploads = matrixUploads.filter((upload) => upload.program === originalProgram && upload.name === "u_modelViewProjection").length;
      device.draw(second);
      expect(matrixUploads.filter((upload) => upload.program === originalProgram && upload.name === "u_modelViewProjection")).toHaveLength(ordinaryMvpUploads);
      expect(nativeDraws.map((draw) => draw.name)).toEqual(["drawElements", "drawElementsInstanced", "drawElements"]);
    } finally { device.dispose(); }
  });

  it("marks native entry before a throwing instanced draw and never permits logical replay", () => {
    const { device, state, first, second, pairShader, binder, plan, submission, nativeDraws } = liveBinderPair();
    try {
      state.failInstanced = true;
      const onSubmitted = vi.fn();
      expect(() => binder.tryDrawStaticUnlitPair(first, second, pairShader, plan, submission, onSubmitted)).toThrow("instanced draw failed after entry");
      expect(onSubmitted).not.toHaveBeenCalled();
      expect(submission.phase).toBe("invalidated");
      expect(submission.mayFallBackBeforeSubmission).toBe(false);
      expect(nativeDraws.map((draw) => draw.name)).toEqual(["drawElements", "drawElementsInstanced"]);
    } finally { device.dispose(); }
  });

  it("declines mismatched uniforms before native submission so ordinary draws can remain in order", () => {
    const { device, first, second, binder, nativeDraws } = liveBinderPair();
    try {
      const changed = new Map(second.uniforms);
      changed.set("u_alphaCutoff", 0.5);
      const incompatible = { ...second, uniforms: changed };
      expect(binder.inspectStaticUnlitPair(first, incompatible)).toBeUndefined();
      device.draw(first);
      device.draw(incompatible);
      expect(nativeDraws.map((draw) => draw.name)).toEqual(["drawElements", "drawElements", "drawElements"]);
    } finally { device.dispose(); }
  });
});

describe("static unlit device pair submission", () => {
  it("warms and submits across a frame boundary with an unknown VAO shadow", () => {
    const { device, gl, state, nativeDraws } = fakeWebGL();
    const commands = commandsFor(device);
    const host = webgl2DeviceHost(device)!;
    try {
      device.beginFrame(128, 128);
      device.draw(commands[0]);
      const originalVao = gl.getParameter(gl.VERTEX_ARRAY_BINDING);
      const originalArray = gl.getParameter(gl.ARRAY_BUFFER_BINDING);
      const originalElement = gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING);
      expect(originalVao).not.toBeNull();
      expect(originalElement).not.toBeNull();
      const genericColor = new Float32Array([0.25, 0.5, 0.75, 1]);
      gl.vertexAttrib4fv(4, genericColor);
      device.endFrame();

      // beginFrame forgets its cache while the native binding survives.
      device.beginFrame(128, 128);
      expect(host.stateCache.snapshot().vertexArray).toBeNull();
      expect(gl.getParameter(gl.VERTEX_ARRAY_BINDING)).toBe(originalVao);
      const drawCount = nativeDraws.length;
      const vaoCount = host.counters.vertexArrayCreateCount;
      expect(device.prepareStaticUnlitPair(commands)).toBeUndefined();
      expect(host.counters.vertexArrayCreateCount).toBe(vaoCount + 1);
      expect(nativeDraws).toHaveLength(drawCount);
      expect(gl.getParameter(gl.VERTEX_ARRAY_BINDING)).toBe(originalVao);
      expect(gl.getParameter(gl.ARRAY_BUFFER_BINDING)).toBe(originalArray);
      expect(gl.getParameter(gl.ELEMENT_ARRAY_BUFFER_BINDING)).toBe(originalElement);
      expect(state.currentColor).toEqual(genericColor);

      const ticket = device.prepareStaticUnlitPair(commands);
      expect(ticket).toBeDefined();
      expect(nativeDraws).toHaveLength(drawCount);
      expect(device.submitStaticUnlitPair(ticket!)).toBe("submitted");
      expect(nativeDraws.slice(drawCount).map((draw) => draw.name)).toEqual(["drawElementsInstanced"]);
    } finally { device.dispose(); }
  });

  it("submits a warmed ticket once and counts both logical triangles", () => {
    const { device, gl, commands, ticket, nativeDraws, matrixUploads, state } = liveDevicePair();
    try {
      const before = device.getDiagnostics();
      const originalProgram = state.currentProgram;
      const originalVao = state.currentVao;
      expect(device.submitStaticUnlitPair(ticket)).toBe("submitted");
      expect(nativeDraws.at(-1)?.name).toBe("drawElementsInstanced");
      expect(nativeDraws.at(-1)?.args).toEqual([gl.TRIANGLES, 3, gl.UNSIGNED_SHORT, 0, 2]);
      expect(matrixUploads.find((entry) => entry.name === "u_batchMVP")?.data).toEqual([...matrix(-0.5), ...matrix(0.5)]);
      expect(state.currentProgram).toBe(originalProgram);
      expect(state.currentVao).toBe(originalVao);
      expect(device.getDiagnostics().drawCalls).toBe(before.drawCalls + 1);
      expect(device.getDiagnostics().triangles).toBe(before.triangles! + 2);
      expect(device.submitStaticUnlitPair(ticket)).toBe("declined");
      expect(nativeDraws.filter((draw) => draw.name === "drawElementsInstanced")).toHaveLength(1);

      const ordinaryUploads = matrixUploads.filter((entry) => entry.program === originalProgram && entry.name === "u_modelViewProjection").length;
      device.draw(commands[1]);
      expect(matrixUploads.filter((entry) => entry.program === originalProgram && entry.name === "u_modelViewProjection")).toHaveLength(ordinaryUploads);
    } finally { device.dispose(); }
  });

  it("declines stale buffer revisions and leaves ordered ordinary draws available", () => {
    const { device, commands, ticket, nativeDraws } = liveDevicePair();
    try {
      device.updateBuffer(commands[0].vertexBuffer, 0, new Float32Array([-0.2]));
      const before = nativeDraws.length;
      expect(device.submitStaticUnlitPair(ticket)).toBe("declined");
      expect(nativeDraws).toHaveLength(before);
      device.draw(commands[0]);
      device.draw(commands[1]);
      expect(nativeDraws.slice(before).map((draw) => draw.name)).toEqual(["drawElements", "drawElements"]);
    } finally { device.dispose(); }
  });

  it("declines a stale frame and a changed public draw entry point before native submission", () => {
    const stale = liveDevicePair();
    try {
      const before = stale.nativeDraws.length;
      stale.device.endFrame();
      stale.device.beginFrame(128, 128);
      expect(stale.device.submitStaticUnlitPair(stale.ticket)).toBe("declined");
      expect(stale.nativeDraws).toHaveLength(before);
    } finally { stale.device.dispose(); }

    const changed = liveDevicePair();
    try {
      const originalDraw = changed.device.draw.bind(changed.device);
      const labels: (string | undefined)[] = [];
      changed.device.draw = (command) => { labels.push(command.label); originalDraw(command); };
      const before = changed.nativeDraws.length;
      expect(changed.device.submitStaticUnlitPair(changed.ticket)).toBe("declined");
      expect(changed.nativeDraws).toHaveLength(before);
      changed.device.draw(changed.commands[0]);
      changed.device.draw(changed.commands[1]);
      expect(labels).toEqual(["first", "second"]);
    } finally { changed.device.dispose(); }
  });

  it("declines context loss, a changed viewport, or an active query after preparation", () => {
    const lost = liveDevicePair();
    try {
      const before = lost.nativeDraws.length;
      lost.dispatch("webglcontextlost");
      expect(lost.device.submitStaticUnlitPair(lost.ticket)).toBe("declined");
      expect(lost.nativeDraws).toHaveLength(before);
    } finally { lost.device.dispose(); }

    const viewport = liveDevicePair();
    try {
      const before = viewport.nativeDraws.length;
      viewport.gl.viewport(0, 0, 64, 64);
      expect(viewport.device.submitStaticUnlitPair(viewport.ticket)).toBe("declined");
      expect(viewport.nativeDraws).toHaveLength(before);
    } finally { viewport.device.dispose(); }

    const query = liveDevicePair();
    try {
      const before = query.nativeDraws.length;
      query.state.activeQuery = {};
      expect(query.device.submitStaticUnlitPair(query.ticket)).toBe("declined");
      expect(query.nativeDraws).toHaveLength(before);
    } finally { query.device.dispose(); }
  });

  it("does not retry a ticket when the native instanced call throws after entry", () => {
    const { device, state, ticket, nativeDraws } = liveDevicePair();
    try {
      state.failInstanced = true;
      expect(() => device.submitStaticUnlitPair(ticket)).toThrow("instanced draw failed after entry");
      expect(nativeDraws.filter((draw) => draw.name === "drawElementsInstanced")).toHaveLength(1);
      expect(device.submitStaticUnlitPair(ticket)).toBe("declined");
      expect(nativeDraws.filter((draw) => draw.name === "drawElementsInstanced")).toHaveLength(1);
    } finally { device.dispose(); }
  });
});
