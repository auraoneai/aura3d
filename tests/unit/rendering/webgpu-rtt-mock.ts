import type { WebGPUDeviceLike, WebGPULike } from "../../../packages/rendering/src/WebGPUDevice";

type Size = readonly number[] | { readonly width: number; readonly height: number; readonly depthOrArrayLayers?: number };
type FakeBuffer = {
  readonly label: string;
  data: Uint8Array;
  destroyed: boolean;
  mapAsync(): Promise<void>;
  getMappedRange(): ArrayBuffer;
  unmap(): void;
  destroy(): void;
};
type FakeTexture = {
  readonly label: string;
  readonly format: string;
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  destroyed: boolean;
  createView(): { texture: FakeTexture };
  destroy(): void;
};
type FakePipeline = { readonly label?: string; readonly descriptor: Record<string, unknown>; getBindGroupLayout(): object };
type FakeGroup = { readonly entries: readonly { readonly binding: number; readonly resource: unknown }[] };
type Action = () => void;

/**
 * A small CPU simulation of the exact calls used by the offscreen proof.
 * It records native-shaped descriptors and executes a triangle and texture copy;
 * it does not compile WGSL, implement general WebGPU, or establish GPU pixels.
 */
export function createProofWebGPU(options: { readonly corruptCopy?: boolean; readonly rejectReadback?: boolean } = {}) {
  const events: string[] = [];
  const modules: string[] = [];
  const textures: FakeTexture[] = [];
  const buffers: FakeBuffer[] = [];
  const byte = (n: number) => Math.round(Math.max(0, Math.min(1, n)) * 255);
  const native = {
    queue: {
      writeBuffer(buffer: FakeBuffer, offset: number, data: ArrayBuffer | ArrayBufferView) {
        const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        buffer.data.set(bytes, offset);
      },
      submit(commands: readonly { readonly actions: readonly Action[] }[]) {
        for (const command of commands) for (const action of command.actions) action();
      },
      onSubmittedWorkDone: async () => undefined
    },
    createBuffer(descriptor: { readonly label?: string; readonly size: number }): FakeBuffer {
      const buffer: FakeBuffer = {
        label: descriptor.label ?? "", data: new Uint8Array(descriptor.size), destroyed: false,
        async mapAsync() {
          events.push("map");
          if (options.rejectReadback) throw new Error("injected readback failure");
        },
        getMappedRange() { return this.data.buffer as ArrayBuffer; },
        unmap() { events.push("unmap"); },
        destroy() { this.destroyed = true; }
      };
      buffers.push(buffer);
      return buffer;
    },
    createShaderModule(descriptor: { readonly code: string; readonly label?: string }) {
      modules.push(descriptor.code);
      return descriptor;
    },
    createTexture(descriptor: { readonly label?: string; readonly format: string; readonly size: Size }): FakeTexture {
      const width = Array.isArray(descriptor.size) ? descriptor.size[0]! : (descriptor.size as { width: number }).width;
      const height = Array.isArray(descriptor.size) ? descriptor.size[1]! : (descriptor.size as { height: number }).height;
      const texture: FakeTexture = {
        label: descriptor.label ?? "", format: descriptor.format, width, height,
        pixels: new Uint8Array(width * height * 4), destroyed: false,
        createView() { return { texture }; },
        destroy() { this.destroyed = true; }
      };
      textures.push(texture);
      return texture;
    },
    createRenderPipeline(descriptor: Record<string, unknown>): FakePipeline {
      return { label: descriptor.label as string | undefined, descriptor, getBindGroupLayout: () => ({}) };
    },
    createBindGroup(descriptor: { readonly entries: FakeGroup["entries"] }): FakeGroup { return { entries: descriptor.entries }; },
    createSampler: () => ({}),
    createCommandEncoder() {
      const actions: Action[] = [];
      return {
        beginRenderPass(descriptor: { readonly label?: string; readonly colorAttachments: readonly { readonly view: { texture: FakeTexture }; readonly resolveTarget?: { texture: FakeTexture }; readonly loadOp: string; readonly clearValue?: readonly number[] | { readonly r: number; readonly g: number; readonly b: number; readonly a: number } }[] }) {
          const attachment = descriptor.colorAttachments[0]!;
          const destination = attachment.view.texture;
          let pipeline: FakePipeline | undefined;
          let vertex: FakeBuffer | undefined;
          let group: FakeGroup | undefined;
          actions.push(() => {
            if (attachment.loadOp === "clear" && attachment.clearValue) {
              const clear = attachment.clearValue;
              const color = (Array.isArray(clear) ? clear : [(clear as { r: number }).r, (clear as { g: number }).g, (clear as { b: number }).b, (clear as { a: number }).a]).map(byte);
              for (let at = 0; at < destination.pixels.length; at += 4) destination.pixels.set(color, at);
            }
            // A multisampled attachment resolves into its single-sample target at pass end.
            attachment.resolveTarget?.texture.pixels.set(destination.pixels);
          });
          return {
            setPipeline(value: FakePipeline) { pipeline = value; },
            setVertexBuffer(_slot: number, value: FakeBuffer) { vertex = value; },
            setBindGroup(_slot: number, value: FakeGroup) { group = value; },
            setViewport() {}, setScissorRect() {}, setBlendConstant() {}, setStencilReference() {},
            draw(count: number) {
              const selectedPipeline = pipeline;
              const selectedVertex = vertex;
              const selectedGroup = group;
              actions.push(() => {
                if (selectedPipeline?.label?.includes("webgpu-post-present")) {
                  const source = selectedGroup?.entries.find((entry) => entry.binding === 2)?.resource as { texture?: FakeTexture } | undefined;
                  if (!source?.texture) throw new Error("proof mock missing presentation source");
                  destination.pixels.set(source.texture.pixels);
                  if (options.corruptCopy) {
                    const center = (Math.floor(destination.height / 2) * destination.width + Math.floor(destination.width / 2)) * 4;
                    destination.pixels[center] = destination.pixels[center]! ^ 1;
                  }
                  events.push("presentation-copy");
                  return;
                }
                if (!selectedVertex || !selectedGroup || count !== 3) throw new Error("proof mock missing triangle inputs");
                const uniform = selectedGroup.entries.find((entry) => entry.binding === 0)?.resource as { buffer?: FakeBuffer } | undefined;
                if (!uniform?.buffer) throw new Error("proof mock missing triangle color");
                const color = Array.from(new Float32Array(uniform.buffer.data.buffer, 0, 4)).map(byte);
                const vertices = new Float32Array(selectedVertex.data.buffer, selectedVertex.data.byteOffset, 9);
                const ax = vertices[0]!, ay = vertices[1]!, bx = vertices[3]!, by = vertices[4]!, cx = vertices[6]!, cy = vertices[7]!;
                const edge = (x1: number, y1: number, x2: number, y2: number, x: number, y: number) => (x - x1) * (y2 - y1) - (y - y1) * (x2 - x1);
                const area = edge(ax, ay, bx, by, cx, cy);
                for (let y = 0; y < destination.height; y += 1) for (let x = 0; x < destination.width; x += 1) {
                  const px = (x + 0.5) / destination.width * 2 - 1;
                  const py = 1 - (y + 0.5) / destination.height * 2;
                  const e0 = edge(ax, ay, bx, by, px, py), e1 = edge(bx, by, cx, cy, px, py), e2 = edge(cx, cy, ax, ay, px, py);
                  if (area < 0 ? e0 <= 0 && e1 <= 0 && e2 <= 0 : e0 >= 0 && e1 >= 0 && e2 >= 0) destination.pixels.set(color, (y * destination.width + x) * 4);
                }
                events.push("triangle");
              });
            },
            end() {}
          };
        },
        copyTextureToBuffer(source: { readonly texture: FakeTexture; readonly origin?: { readonly x?: number; readonly y?: number } }, destination: { readonly buffer: FakeBuffer; readonly bytesPerRow: number }, size: Size) {
          actions.push(() => {
            const width = Array.isArray(size) ? size[0]! : (size as { width: number }).width;
            const height = Array.isArray(size) ? size[1]! : (size as { height: number }).height;
            const x = source.origin?.x ?? 0, y = source.origin?.y ?? 0;
            for (let row = 0; row < height; row += 1) {
              const start = ((y + row) * source.texture.width + x) * 4;
              destination.buffer.data.set(source.texture.pixels.subarray(start, start + width * 4), row * destination.bytesPerRow);
            }
            events.push("copy-readback");
          });
        },
        copyTextureToTexture(source: { readonly texture: FakeTexture }, destination: { readonly texture: FakeTexture }) {
          actions.push(() => {
            destination.texture.pixels.set(source.texture.pixels);
            events.push("copy-texture");
          });
        },
        finish() { return { actions }; }
      };
    },
    destroy() { events.push("device-destroy"); }
  } as unknown as WebGPUDeviceLike;
  const webgpu: WebGPULike = { async requestAdapter() { return { name: "proof-mock", async requestDevice() { return native; } }; } };
  return { webgpu, native, events, modules, textures, buffers };
}
