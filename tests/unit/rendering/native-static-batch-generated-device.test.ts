import { describe, expect, it, vi } from "vitest";
import { STATIC_GENERATED_UNLIT_MAX_UNIFORM_BUFFER_BYTES } from "../../../packages/rendering/src/WebGL2Device";
import { webgl2DeviceHost } from "../../../packages/rendering/src/webgl2/Counters";
import {
  GENERATED_STATIC_TEST_GEOMETRY as geometryMatrix,
  GENERATED_STATIC_TEST_VIEW_PROJECTION as viewProjection,
  generatedStaticTestModel as model,
  preparedGeneratedStaticUnlitPair as readyPair
} from "./static-generated-unlit-fake-webgl";

describe("generated static unlit device pair", () => {
  it("admits only the issued, unchanged ordinary reflection without invoking an accessor", () => {
    const f = readyPair();
    const shader = f.commands[0].shader!;
    const reflection = shader.reflection;
    const admitted = () => f.device.hasStaticGeneratedUnlitProgram(shader, f.features);
    try {
      expect(admitted()).toBe(true);

      const shaderReflection = Object.getOwnPropertyDescriptor(shader, "reflection")!;
      try {
        Object.defineProperty(shader, "reflection", { ...shaderReflection, value: { ...reflection } });
        expect(admitted()).toBe(false);
      } finally { Object.defineProperty(shader, "reflection", shaderReflection); }
      expect(admitted()).toBe(true);

      for (const key of ["attributes", "uniforms", "attributeDetails", "uniformDetails"] as const) {
        const original = Object.getOwnPropertyDescriptor(reflection, key)!;
        const contents = original.value as ReadonlyMap<unknown, unknown> | ReadonlySet<unknown>;
        const replacement = contents instanceof Set ? new Set(contents) : new Map(contents as ReadonlyMap<unknown, unknown>);
        try {
          Object.defineProperty(reflection, key, { ...original, value: replacement });
          expect(admitted()).toBe(false);
        } finally { Object.defineProperty(reflection, key, original); }
        expect(admitted()).toBe(true);
      }

      const attributes = reflection.attributes as Map<string, number>;
      const location = attributes.get("a_position")!;
      try {
        attributes.set("a_position", location + 1);
        expect(admitted()).toBe(false);
      } finally { attributes.set("a_position", location); }
      expect(admitted()).toBe(true);

      const uniforms = reflection.uniforms as Set<string>;
      try {
        uniforms.add("u_unexpected");
        expect(admitted()).toBe(false);
      } finally { uniforms.delete("u_unexpected"); }
      expect(admitted()).toBe(true);

      const uniformDetails = reflection.uniformDetails as Map<string, object>;
      const detail = uniformDetails.get("u_baseColor")!;
      try {
        uniformDetails.set("u_baseColor", { ...detail });
        expect(admitted()).toBe(false);
      } finally { uniformDetails.set("u_baseColor", detail); }
      expect(admitted()).toBe(true);

      for (const [table, name] of [
        [reflection.attributeDetails, "a_position"], [reflection.uniformDetails, "u_baseColor"]
      ] as const) {
        const entry = table.get(name)!;
        const originalType = Object.getOwnPropertyDescriptor(entry, "type")!;
        try {
          Object.defineProperty(entry, "type", { ...originalType, value: "unexpected-type" });
          expect(admitted()).toBe(false);
        } finally { Object.defineProperty(entry, "type", originalType); }
        expect(admitted()).toBe(true);
      }

      const getter = vi.fn(() => { throw new Error("reflection getter must not run"); });
      try {
        Object.defineProperty(shader, "reflection", { configurable: true, get: getter });
        expect(admitted()).toBe(false);
        expect(getter).not.toHaveBeenCalled();
      } finally { Object.defineProperty(shader, "reflection", shaderReflection); }
      expect(admitted()).toBe(true);
    } finally { f.dispose(); }
  });

  it("submits authentic generated transforms and AuraFrame bytes, counts both logical triangles, and restores ordinary state", () => {
    const f = readyPair();
    const { device, gl, state, generated, nativeDraws, matrixUploads, commands, ticket } = f;
    try {
      const ordinary = generated.programs.find((entry) => !entry.pair)!;
      const pair = generated.programs.find((entry) => entry.pair)!;
      expect(ordinary.vertex).toContain("gl_Position = u_viewProjection * a3dWorld;");
      expect(pair.vertex).toContain("u_batchModel[gl_InstanceID] * instanceMatrix * a3dLocal");
      expect(pair.vertex).toContain("u_geometryMatrix * vec4(transformed, 1.0)");
      expect(pair.fragment).toBe(ordinary.fragment);
      expect(generated.blockBindings.get(ordinary.program)).toBe(0);
      expect(generated.blockBindings.get(pair.program)).toBe(0);

      const before = device.getDiagnostics();
      const instancedBefore = webgl2DeviceHost(device)!.counters.nativeInstancedSubmissions;
      const originalProgram = state.currentProgram;
      const originalVao = state.currentVao;
      const onAttempt = vi.fn(), onSubmitted = vi.fn();
      expect(device.submitStaticGeneratedUnlitPair(ticket, { onAttempt, onSubmitted })).toBe("submitted");
      expect(onAttempt).toHaveBeenCalledTimes(1);
      expect(onSubmitted).toHaveBeenCalledTimes(1);
      const draw = nativeDraws.at(-1)!;
      expect(draw.name).toBe("drawElementsInstanced");
      expect(draw.args).toEqual([gl.TRIANGLES, 3, gl.UNSIGNED_SHORT, 0, 2]);
      expect(draw.program).toBe(pair.program);
      expect(draw.uniforms.get("u_batchModel")).toEqual(new Float32Array([...model(-0.5), ...model(0.5)]));
      expect(draw.uniforms.get("u_geometryMatrix")).toEqual(geometryMatrix);
      expect(draw.uniforms.get("u_baseColor")).toEqual(new Float32Array([0.25, 0.5, 0.75, 1]));
      const binding = generated.drawBindings.at(-1)!;
      expect(binding.program).toBe(pair.program);
      expect(binding.offset).toBe(0);
      expect(binding.size).toBe(304);
      expect(binding.bytes).toEqual(f.frameBytes);
      expect(new Float32Array(binding.bytes.buffer, binding.bytes.byteOffset + 128, 16)).toEqual(viewProjection);
      expect(device.getDiagnostics().drawCalls).toBe(before.drawCalls + 1);
      expect(device.getDiagnostics().triangles).toBe(before.triangles! + 2);
      expect(webgl2DeviceHost(device)!.counters.nativeInstancedSubmissions).toBe(instancedBefore + 1);
      expect(state.currentProgram).toBe(originalProgram);
      expect(state.currentVao).toBe(originalVao);
      expect(device.submitStaticGeneratedUnlitPair(ticket, { onAttempt, onSubmitted })).toBe("declined");

      const uploads = matrixUploads.filter((entry) => entry.program === originalProgram && entry.name === "u_modelMatrix").length;
      device.draw(commands[1]);
      expect(nativeDraws.at(-1)?.program).toBe(ordinary.program);
      expect(matrixUploads.filter((entry) => entry.program === originalProgram && entry.name === "u_modelMatrix")).toHaveLength(uploads);
    } finally { f.dispose(); }
  });

  it.each(["vertex", "index", "frame"] as const)("declines a stale %s buffer revision before native entry", (kind) => {
    const f = readyPair();
    try {
      if (kind === "vertex") f.device.updateBuffer(f.vertexBuffer, 0, new Float32Array([-0.2]));
      if (kind === "index") f.device.updateBuffer(f.indexBuffer, 0, new Uint16Array([2]));
      if (kind === "frame") f.device.updateBuffer(f.auraFrameBuffer, 128, new Float32Array([0.625]));
      const before = f.nativeDraws.length;
      const onAttempt = vi.fn(), onSubmitted = vi.fn();
      expect(f.device.submitStaticGeneratedUnlitPair(f.ticket, { onAttempt, onSubmitted })).toBe("declined");
      expect(onAttempt).not.toHaveBeenCalled();
      expect(onSubmitted).not.toHaveBeenCalled();
      expect(f.nativeDraws).toHaveLength(before);
      f.device.draw(f.commands[0]);
      f.device.draw(f.commands[1]);
      expect(f.nativeDraws.slice(before).map((draw) => draw.name)).toEqual(["drawElements", "drawElements"]);
    } finally { f.dispose(); }
  });

  it("invalidates a prepared ticket on a partial AuraFrame upload even when the bytes are unchanged", () => {
    const f = readyPair();
    try {
      f.device.updateBuffer(f.auraFrameBuffer, 128, new Float32Array([viewProjection[0]!]));
      const before = f.nativeDraws.length;
      const onAttempt = vi.fn(), onSubmitted = vi.fn();
      expect(f.device.submitStaticGeneratedUnlitPair(f.ticket, { onAttempt, onSubmitted })).toBe("declined");
      expect(onAttempt).not.toHaveBeenCalled();
      expect(f.nativeDraws).toHaveLength(before);
      f.device.draw(f.commands[0]); f.device.draw(f.commands[1]);
      expect(f.nativeDraws.slice(before).map((draw) => draw.name)).toEqual(["drawElements", "drawElements"]);
      for (const binding of f.generated.drawBindings.slice(-2)) expect(binding.bytes).toEqual(f.frameBytes);
    } finally { f.dispose(); }
  });

  it("keeps the generic UBO binding coherent when another indexed frame buffer is bound", () => {
    const f = readyPair();
    try {
      const other = f.device.createBuffer("uniform", 304, new Uint8Array(304));
      const otherNative = f.gl.getParameter(f.gl.UNIFORM_BUFFER_BINDING) as { bytes: Uint8Array };
      f.device.bindUniformBuffer(f.auraFrameBuffer, 0);
      const frameNative = f.generated.indexedBindings.get(0)!.buffer!;
      expect(frameNative).not.toBe(otherNative);
      f.device.updateBuffer(other, 128, new Float32Array([0.375]));
      expect(frameNative.bytes).toEqual(f.frameBytes);
      expect(new Float32Array(otherNative.bytes.buffer, otherNative.bytes.byteOffset + 128, 1)[0]).toBe(0.375);
    } finally { f.dispose(); }
  });

  it("falls back to ordinary draws for an AuraFrame buffer above the mirror cap", () => {
    const f = readyPair();
    try {
      const bytes = new Uint8Array(STATIC_GENERATED_UNLIT_MAX_UNIFORM_BUFFER_BYTES + 1);
      bytes.set(f.frameBytes);
      const frame = f.device.createBuffer("uniform", bytes.byteLength, bytes);
      f.device.bindUniformBuffer(frame, 0);
      const before = f.nativeDraws.length;
      expect(f.device.prepareStaticGeneratedUnlitPair(f.commands, { ...f.context, auraFrameBuffer: frame })).toBeUndefined();
      expect(f.nativeDraws).toHaveLength(before);
      f.device.draw(f.commands[0]); f.device.draw(f.commands[1]);
      expect(f.nativeDraws.slice(before).map((draw) => draw.name)).toEqual(["drawElements", "drawElements"]);
      expect(f.generated.drawBindings.at(-1)?.bytes.slice(0, 304)).toEqual(f.frameBytes);
    } finally { f.dispose(); }
  });

  it("falls back for a concurrently mutable SharedArrayBuffer AuraFrame upload", () => {
    if (typeof SharedArrayBuffer === "undefined") return;
    const f = readyPair();
    try {
      const shared = new Uint8Array(new SharedArrayBuffer(f.frameBytes.byteLength));
      shared.set(f.frameBytes);
      const frame = f.device.createBuffer("uniform", shared.byteLength, shared);
      f.device.bindUniformBuffer(frame, 0);
      const before = f.nativeDraws.length;
      expect(f.device.prepareStaticGeneratedUnlitPair(f.commands, { ...f.context, auraFrameBuffer: frame })).toBeUndefined();
      expect(f.nativeDraws).toHaveLength(before);
      f.device.draw(f.commands[0]); f.device.draw(f.commands[1]);
      expect(f.nativeDraws.slice(before).map((draw) => draw.name)).toEqual(["drawElements", "drawElements"]);
      expect(f.generated.drawBindings.at(-1)?.bytes).toEqual(f.frameBytes);
    } finally { f.dispose(); }
  });

  it("declines a changed indexed AuraFrame binding range before native entry", () => {
    const f = readyPair();
    try {
      const binding = f.generated.indexedBindings.get(0)!;
      expect(binding.buffer).not.toBeNull();
      f.gl.bindBufferRange(f.gl.UNIFORM_BUFFER, 0, binding.buffer as unknown as WebGLBuffer, 0, 128);
      const before = f.nativeDraws.length;
      const onAttempt = vi.fn(), onSubmitted = vi.fn();
      expect(f.device.submitStaticGeneratedUnlitPair(f.ticket, { onAttempt, onSubmitted })).toBe("declined");
      expect(onAttempt).not.toHaveBeenCalled();
      expect(f.nativeDraws).toHaveLength(before);
      f.device.bindUniformBuffer(f.auraFrameBuffer, 0);
      f.device.draw(f.commands[0]); f.device.draw(f.commands[1]);
      expect(f.nativeDraws.slice(before).map((draw) => draw.name)).toEqual(["drawElements", "drawElements"]);
    } finally { f.dispose(); }
  });

  it("declines a different AuraFrame buffer even when its bytes match", () => {
    const f = readyPair();
    try {
      const replacement = f.device.createBuffer("uniform", f.frameBytes.byteLength, f.frameBytes);
      f.device.bindUniformBuffer(replacement, 0);
      const before = f.nativeDraws.length;
      const onAttempt = vi.fn(), onSubmitted = vi.fn();
      expect(f.device.submitStaticGeneratedUnlitPair(f.ticket, { onAttempt, onSubmitted })).toBe("declined");
      expect(onAttempt).not.toHaveBeenCalled();
      expect(f.nativeDraws).toHaveLength(before);
      f.device.draw(f.commands[0]); f.device.draw(f.commands[1]);
      expect(f.nativeDraws.slice(before).map((draw) => draw.name)).toEqual(["drawElements", "drawElements"]);
      expect(f.generated.drawBindings.at(-1)?.bytes).toEqual(f.frameBytes);
    } finally { f.dispose(); }
  });

  it("declines a changed draw range, a stale frame, and a lost context", () => {
    const range = readyPair();
    try {
      Object.assign(range.commands[0], { firstIndex: 1 });
      const before = range.nativeDraws.length;
      expect(range.device.submitStaticGeneratedUnlitPair(range.ticket, { onAttempt: vi.fn(), onSubmitted: vi.fn() })).toBe("declined");
      expect(range.nativeDraws).toHaveLength(before);
      Object.assign(range.commands[0], { firstIndex: 0 });
      range.device.draw(range.commands[0]); range.device.draw(range.commands[1]);
      expect(range.nativeDraws.slice(before).map((draw) => draw.name)).toEqual(["drawElements", "drawElements"]);
    } finally { range.dispose(); }

    const frame = readyPair();
    try {
      const before = frame.nativeDraws.length;
      frame.device.endFrame(); frame.device.beginFrame(128, 128);
      expect(frame.device.submitStaticGeneratedUnlitPair(frame.ticket, { onAttempt: vi.fn(), onSubmitted: vi.fn() })).toBe("declined");
      expect(frame.nativeDraws).toHaveLength(before);
    } finally { frame.dispose(); }

    const lost = readyPair();
    try {
      const before = lost.nativeDraws.length;
      lost.dispatch("webglcontextlost");
      expect(lost.device.submitStaticGeneratedUnlitPair(lost.ticket, { onAttempt: vi.fn(), onSubmitted: vi.fn() })).toBe("declined");
      expect(lost.nativeDraws).toHaveLength(before);
    } finally { lost.dispose(); }
  });

  it("declines a pair-only link failure while retaining the ready ordinary shader", () => {
    const f = readyPair();
    try {
      const ordinary = f.generated.programs.find((entry) => !entry.pair)!;
      f.generated.pairLinkStatus = "failed";
      const before = f.nativeDraws.length;
      expect(f.device.submitStaticGeneratedUnlitPair(f.ticket, { onAttempt: vi.fn(), onSubmitted: vi.fn() })).toBe("declined");
      expect(f.nativeDraws).toHaveLength(before);
      f.device.draw(f.commands[0]); f.device.draw(f.commands[1]);
      expect(f.nativeDraws.slice(before).map((draw) => [draw.name, draw.program])).toEqual([
        ["drawElements", ordinary.program], ["drawElements", ordinary.program]
      ]);
    } finally { f.dispose(); }
  });

  it("rejects a changed pair reflection and can use the same program when its reflection is restored", () => {
    const f = readyPair();
    try {
      const pair = f.generated.programs.find((entry) => entry.pair)!.program;
      const uniforms = pair.uniforms;
      pair.uniforms = uniforms.filter((entry) => entry.name !== "u_batchModel[0]");
      const before = f.nativeDraws.length;
      expect(f.device.prepareStaticGeneratedUnlitPair(f.commands, f.context)).toBeUndefined();
      f.device.draw(f.commands[0]); f.device.draw(f.commands[1]);
      expect(f.nativeDraws.slice(before).map((draw) => draw.name)).toEqual(["drawElements", "drawElements"]);
      pair.uniforms = uniforms;
      const retry = f.device.prepareStaticGeneratedUnlitPair(f.commands, f.context);
      expect(retry).toBeDefined();
      if (!retry) throw new Error("pair did not recover after reflection was restored");
      expect(f.device.submitStaticGeneratedUnlitPair(retry, { onAttempt: vi.fn(), onSubmitted: vi.fn() })).toBe("submitted");
      expect(f.nativeDraws.at(-1)?.name).toBe("drawElementsInstanced");
    } finally { f.dispose(); }
  });

  it("marks native entry before a throwing pair and never replays the consumed ticket", () => {
    const f = readyPair();
    try {
      f.state.failInstanced = true;
      const before = f.nativeDraws.length;
      const events: string[] = [];
      f.state.onNativeDraw = () => { events.push("native"); };
      const onAttempt = vi.fn(() => { events.push("attempt"); });
      const onSubmitted = vi.fn(() => { events.push("submitted"); });
      expect(() => f.device.submitStaticGeneratedUnlitPair(f.ticket, { onAttempt, onSubmitted })).toThrow("instanced draw failed after entry");
      expect(onAttempt).toHaveBeenCalledTimes(1);
      expect(onSubmitted).not.toHaveBeenCalled();
      expect(events).toEqual(["attempt", "native"]);
      expect(f.nativeDraws.slice(before).map((draw) => draw.name)).toEqual(["drawElementsInstanced"]);
      expect(f.device.submitStaticGeneratedUnlitPair(f.ticket, { onAttempt, onSubmitted })).toBe("declined");
      expect(f.nativeDraws.slice(before).map((draw) => draw.name)).toEqual(["drawElementsInstanced"]);
    } finally { f.dispose(); }
  });

  it("does not enter native drawing when the attempt hook changes AuraFrame", () => {
    const f = readyPair();
    try {
      const before = f.nativeDraws.length;
      const onAttempt = vi.fn(() => f.device.updateBuffer(f.auraFrameBuffer, 128, new Float32Array([0.625])));
      const onSubmitted = vi.fn();
      expect(() => f.device.submitStaticGeneratedUnlitPair(f.ticket, { onAttempt, onSubmitted })).toThrow(/AuraFrame changed/);
      expect(onAttempt).toHaveBeenCalledTimes(1);
      expect(onSubmitted).not.toHaveBeenCalled();
      expect(f.nativeDraws).toHaveLength(before);
      expect(f.device.submitStaticGeneratedUnlitPair(f.ticket, { onAttempt, onSubmitted })).toBe("declined");
      expect(f.nativeDraws).toHaveLength(before);
    } finally { f.dispose(); }
  });

  it("counts a completed native pair once, propagates a restoration failure, and safely recovers on a later draw", () => {
    const f = readyPair();
    const ordinary = f.generated.programs.find((entry) => !entry.pair)!.program;
    const before = f.nativeDraws.length;
    const diagnostics = f.device.getDiagnostics();
    const instanced = webgl2DeviceHost(f.device)!.counters.nativeInstancedSubmissions;
    const events: string[] = [];
    const useProgram = f.gl.useProgram.bind(f.gl);
    f.state.onNativeDraw = () => { events.push("native"); };
    const restore = vi.spyOn(f.gl, "useProgram").mockImplementation((program) => {
      if (program === (ordinary as unknown as WebGLProgram) && f.nativeDraws.length > before) {
        events.push("restore");
        throw new Error("ordinary program restoration failed");
      }
      useProgram(program);
    });
    try {
      const onAttempt = vi.fn(() => { events.push("attempt"); });
      const onSubmitted = vi.fn(() => { events.push("submitted"); });
      expect(() => f.device.submitStaticGeneratedUnlitPair(f.ticket, { onAttempt, onSubmitted }))
        .toThrow("ordinary program restoration failed");
      expect(events).toEqual(["attempt", "native", "submitted", "restore"]);
      expect(f.nativeDraws.slice(before).map((draw) => draw.name)).toEqual(["drawElementsInstanced"]);
      expect(f.device.getDiagnostics().drawCalls).toBe(diagnostics.drawCalls + 1);
      expect(f.device.getDiagnostics().triangles).toBe(diagnostics.triangles! + 2);
      expect(webgl2DeviceHost(f.device)!.counters.nativeInstancedSubmissions).toBe(instanced + 1);
      expect(f.device.submitStaticGeneratedUnlitPair(f.ticket, { onAttempt, onSubmitted })).toBe("declined");
      expect(f.nativeDraws.slice(before)).toHaveLength(1);
      restore.mockRestore();
      f.state.onNativeDraw = undefined;
      f.device.draw(f.commands[0]);
      expect(f.nativeDraws.at(-1)?.name).toBe("drawElements");
      expect(f.nativeDraws.at(-1)?.program).toBe(ordinary);
    } finally { restore.mockRestore(); f.state.onNativeDraw = undefined; f.dispose(); }
  });

  it("reuploads an ordinary uniform after its restoration upload throws", () => {
    const f = readyPair();
    const ordinary = f.generated.programs.find((entry) => !entry.pair)!.program;
    const before = f.nativeDraws.length;
    const upload = f.gl.uniformMatrix4fv.bind(f.gl);
    const restore = vi.spyOn(f.gl, "uniformMatrix4fv").mockImplementation((location, transpose, data) => {
      const target = location as unknown as { readonly program: unknown; readonly name: string };
      if (target.program === ordinary && target.name === "u_modelMatrix" && f.nativeDraws.length > before) {
        throw new Error("ordinary model restoration upload failed");
      }
      upload(location, transpose, data);
    });
    try {
      expect(ordinary.values.get("u_modelMatrix")).toEqual(model(0.5));
      const onAttempt = vi.fn(), onSubmitted = vi.fn();
      expect(() => f.device.submitStaticGeneratedUnlitPair(f.ticket, { onAttempt, onSubmitted }))
        .toThrow("ordinary model restoration upload failed");
      expect(onAttempt).toHaveBeenCalledTimes(1);
      expect(onSubmitted).toHaveBeenCalledTimes(1);
      expect(f.nativeDraws.slice(before).map((draw) => draw.name)).toEqual(["drawElementsInstanced"]);
      expect(f.device.submitStaticGeneratedUnlitPair(f.ticket, { onAttempt, onSubmitted })).toBe("declined");

      restore.mockRestore();
      const uploads = f.matrixUploads.filter((entry) => entry.program === ordinary && entry.name === "u_modelMatrix").length;
      f.device.draw(f.commands[0]);
      const recovery = f.nativeDraws.at(-1)!;
      expect(recovery.name).toBe("drawElements");
      expect(recovery.program).toBe(ordinary);
      expect(recovery.uniforms.get("u_modelMatrix")).toEqual(model(-0.5));
      expect(f.matrixUploads.filter((entry) => entry.program === ordinary && entry.name === "u_modelMatrix")).toHaveLength(uploads + 1);
    } finally { restore.mockRestore(); f.dispose(); }
  });
});
