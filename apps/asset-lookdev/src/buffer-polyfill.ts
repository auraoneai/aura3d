// apps/asset-lookdev/src/buffer-polyfill.ts
// Minimal Node `Buffer` surface for the browser, loaded before any engine
// module. packages/rendering/src/environment/HdrEquirect.ts (lane-02 owned)
// evaluates `Buffer.from` at module scope and uses from/alloc/subarray/equals/
// toString("latin1") while decoding .hdr sources at runtime (Q-05-5). This
// polyfill implements exactly that surface on a Uint8Array subclass; no
// sibling-owned file is touched.
class BufferPolyfill extends Uint8Array {
  static from(input: ArrayLike<number> | ArrayBuffer | string | Iterable<number>, ...rest: unknown[]): BufferPolyfill {
    if (typeof input === "string") {
      const bytes = new Uint8Array(input.length);
      for (let i = 0; i < input.length; i += 1) bytes[i] = input.charCodeAt(i) & 0xff;
      return new BufferPolyfill(bytes);
    }
    if (input instanceof ArrayBuffer) {
      const offset = typeof rest[0] === "number" ? rest[0] : 0;
      const length = typeof rest[1] === "number" ? rest[1] : input.byteLength - offset;
      return new BufferPolyfill(input, offset, length);
    }
    return new BufferPolyfill(Array.from(input as ArrayLike<number> | Iterable<number>));
  }
  static alloc(size: number): BufferPolyfill {
    return new BufferPolyfill(size);
  }
  equals(other: Uint8Array): boolean {
    if (this.length !== other.length) return false;
    for (let i = 0; i < this.length; i += 1) if (this[i] !== other[i]) return false;
    return true;
  }
  override toString(encoding?: string): string {
    const bytes = this as Uint8Array;
    if (encoding === "latin1" || encoding === "binary") {
      let s = "";
      for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]);
      return s;
    }
    return new TextDecoder("utf-8").decode(bytes);
  }
}

const g = globalThis as { Buffer?: unknown };
if (typeof g.Buffer === "undefined") {
  g.Buffer = BufferPolyfill;
}
export {};
