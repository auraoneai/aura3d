/* PRD-06 T1.14 harness driver: runs the prd06-crossfade-filmstrip lane adapter
 * for ?engine=aura3d (default) or ?engine=three against the shared spec. The
 * adapters themselves publish __PRD06_CROSSFADE_FILMSTRIP__ /
 * __PRD06_CROSSFADE_THREE__; this wrapper only surfaces mount failures. */
type Runner = (host: HTMLElement, opts?: { variant?: string; dpr?: 1 | 2; qrFlags?: readonly string[] }) => Promise<unknown>;

export {};

// Node `Buffer` shim for the engine graph (VersionedSerialization.ts evaluates
// `Buffer.from` / `.toString("base64")` when the lane modules load).
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
  isBuffer: (value: unknown) => value instanceof Uint8Array,
  concat: (parts: readonly Uint8Array[]) => {
    const total = parts.reduce((n, p) => n + p.length, 0);
    const merged = new Uint8Array(total);
    let off = 0;
    for (const p of parts) { merged.set(p, off); off += p.length; }
    return merged;
  }
};

declare global {
  interface Window {
    __PRD06_FILMSTRIP_HARNESS__?: { status: "importing" | "running" | "ok" | "error"; engine: string; error?: string };
  }
}

async function main(): Promise<void> {
  const engine = new URLSearchParams(location.search).get("engine") ?? "aura3d";
  const host = document.getElementById("stage");
  if (!host) throw new Error("missing #stage host");
  window.__PRD06_FILMSTRIP_HARNESS__ = { status: "importing", engine } as never;
  try {
    const mod = engine === "three"
      ? await import("../../../../benchmarks/quality-rebuild/three/scenes/prd06/crossfade-filmstrip")
      : await import("../../../../benchmarks/quality-rebuild/aura3d/scenes/prd06/crossfade-filmstrip");
    const run = mod.default as Runner;
    window.__PRD06_FILMSTRIP_HARNESS__ = { status: "running", engine } as never;
    await run(host, { qrFlags: engine === "aura3d" ? ["animation"] : [] });
    window.__PRD06_FILMSTRIP_HARNESS__ = { status: "ok", engine };
  } catch (error) {
    const message = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
    window.__PRD06_FILMSTRIP_HARNESS__ = { status: "error", engine, error: message };
    if (engine === "three") {
      window.__PRD06_CROSSFADE_THREE__ = { status: "error" };
    } else {
      window.__PRD06_CROSSFADE_FILMSTRIP__ = { status: "error", error: message };
    }
  }
}
void main();
