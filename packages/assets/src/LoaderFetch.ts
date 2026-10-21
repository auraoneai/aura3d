/**
 * threejs-parity ST-04 (§6 lane L4): shared fetch-with-progress helper for the
 * three-signature loaders (`FileLoader`, `ImageBitmapLoader`, `DataTextureLoader`,
 * `EXRLoader`). Streams the response body when it is readable so `onProgress`
 * receives real byte counts — the equivalent of three's `FileLoader` progress.
 */

export interface AuraLoaderProgress {
  readonly loaded: number;
  readonly total?: number;
}

export async function fetchBytes(
  url: string,
  signal: AbortSignal | undefined,
  onProgress?: (progress: AuraLoaderProgress) => void
): Promise<ArrayBuffer> {
  if (typeof fetch !== "function") {
    throw new Error(`fetch is unavailable — cannot load ${url}`);
  }
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Request for ${url} failed with ${response.status}`);
  }
  const totalHeader = response.headers.get("content-length");
  const total = totalHeader ? Number.parseInt(totalHeader, 10) : undefined;
  const body = response.body;
  if (!body || typeof body.getReader !== "function" || !onProgress) {
    const buffer = await response.arrayBuffer();
    onProgress?.({ loaded: buffer.byteLength, ...(total !== undefined ? { total } : {}) });
    return buffer;
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      onProgress({ loaded, ...(total !== undefined ? { total } : {}) });
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(loaded);
  let cursor = 0;
  for (const chunk of chunks) {
    out.set(chunk, cursor);
    cursor += chunk.byteLength;
  }
  return out.buffer;
}
