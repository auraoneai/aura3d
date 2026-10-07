/* PRD-06 harness Buffer shim — must be imported FIRST (before any import that
 * pulls a module evaluating `Buffer.*` at load, e.g.
 * `packages/rendering/src/environment/HdrEquirect.ts` `HDR_MAGIC`). ES module
 * evaluation is depth-first in source order, so a first-position import of
 * this file installs the shim before the rest of the graph evaluates.
 *
 * Node `Buffer` shim (same shape as the inline copies): `Buffer.from`,
 * `Buffer.isBuffer`, `Buffer.concat`, `Buffer.alloc`, `toString("base64")`.
 */
export {};

function bufferFrom(data: string | ArrayLike<number> | ArrayBufferView | ArrayBuffer): Uint8Array & { equals(o: Uint8Array): boolean; toString(enc?: string): string } {
  const bytes = typeof data === "string"
    ? new TextEncoder().encode(data)
    : data instanceof ArrayBuffer
      ? new Uint8Array(data)
      : ArrayBuffer.isView(data)
        ? new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength))
        : Uint8Array.from(data as ArrayLike<number>);
  const out = bytes as Uint8Array & { equals(o: Uint8Array): boolean; toString(enc?: string): string };
  out.equals = (other) => out.length === other.length && out.every((v, i) => v === other[i]);
  const nativeToString = out.toString.bind(out);
  out.toString = (enc?: string) => {
    if (enc !== "base64") return nativeToString();
    let s = "";
    for (let i = 0; i < out.length; i += 0x8000) s += String.fromCharCode(...out.subarray(i, i + 0x8000));
    return btoa(s);
  };
  return out;
}

(globalThis as { Buffer?: unknown }).Buffer ??= {
  from: bufferFrom,
  alloc: (size: number, fill = 0) => {
    const out = new Uint8Array(size) as Uint8Array & { equals(o: Uint8Array): boolean; toString(enc?: string): string };
    out.fill(fill);
    out.equals = (other) => out.length === other.length && out.every((v, i) => v === other[i]);
    const nativeToString = out.toString.bind(out);
    out.toString = (enc?: string) => {
      if (enc !== "base64") return nativeToString();
      let s = "";
      for (let i = 0; i < out.length; i += 0x8000) s += String.fromCharCode(...out.subarray(i, i + 0x8000));
      return btoa(s);
    };
    return out;
  },
  isBuffer: (value: unknown) => value instanceof Uint8Array,
  concat: (parts: readonly Uint8Array[]) => {
    const total = parts.reduce((n, p) => n + p.length, 0);
    const merged = new Uint8Array(total);
    let off = 0;
    for (const p of parts) { merged.set(p, off); off += p.length; }
    return merged;
  }
};
