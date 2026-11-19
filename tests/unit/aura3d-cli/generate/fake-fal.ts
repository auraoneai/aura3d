/** In-memory fal.ai queue + CDN for the generate tests (no network, no paid calls). */

export interface FakeRequest {
  readonly id: string;
  readonly model: string;
  readonly input: Record<string, unknown>;
  /** Status replies left before COMPLETED. */
  pending: number;
}

export interface FakeCall {
  readonly method: string;
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body?: string;
}

export interface FakeFalOptions {
  /** Result JSON per model, given the request input. */
  readonly results: Record<string, (input: Record<string, unknown>, id: string) => unknown>;
  /** Media bytes by URL. */
  readonly media?: Record<string, Buffer | string>;
  /** Status polls answered IN_PROGRESS before COMPLETED (default 1). */
  readonly polls?: number;
  /** Respond to the first N submits with this status (e.g. 429). */
  readonly submitFailures?: { readonly status: number; readonly count: number; readonly body?: string };
  /** Status answered for every poll (never completes) when set. */
  readonly stuck?: boolean;
  readonly base?: string;
}

function reply(status: number, body: unknown) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => JSON.parse(text) as unknown,
    text: async () => text,
    arrayBuffer: async () => {
      const bytes = Buffer.isBuffer(body) ? body : Buffer.from(text);
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    }
  };
}

function bytesReply(bytes: Buffer) {
  return {
    ok: true,
    status: 200,
    json: async () => JSON.parse(bytes.toString("utf8")) as unknown,
    text: async () => bytes.toString("utf8"),
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  };
}

export function createFakeFal(options: FakeFalOptions) {
  const base = options.base ?? "https://queue.fal.run";
  const requests = new Map<string, FakeRequest>();
  const calls: FakeCall[] = [];
  let submits = 0;
  let failuresLeft = options.submitFailures?.count ?? 0;
  const fetch = async (url: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) => {
    const method = init.method ?? "GET";
    calls.push({ method, url, headers: init.headers ?? {}, ...(init.body ? { body: init.body } : {}) });
    if (method === "POST" && url.startsWith(`${base}/`)) {
      if (failuresLeft > 0) {
        failuresLeft--;
        return reply(options.submitFailures!.status, options.submitFailures!.body ?? { detail: "rate limited" });
      }
      const model = url.slice(base.length + 1);
      const id = `req-${++submits}`;
      requests.set(id, { id, model, input: JSON.parse(init.body ?? "{}") as Record<string, unknown>, pending: options.polls ?? 1 });
      return reply(200, { request_id: id, status_url: `${base}/${model}/requests/${id}/status`, response_url: `${base}/${model}/requests/${id}` });
    }
    const status = url.match(/\/requests\/([^/]+)\/status$/);
    if (status) {
      const request = requests.get(status[1]!);
      if (!request) return reply(404, { detail: "not found" });
      if (options.stuck) return reply(200, { status: "IN_QUEUE" });
      if (request.pending > 0) {
        request.pending--;
        return reply(200, { status: "IN_PROGRESS" });
      }
      return reply(200, { status: "COMPLETED" });
    }
    const result = url.match(/\/requests\/([^/]+)$/);
    if (result) {
      const request = requests.get(result[1]!);
      if (!request) return reply(404, { detail: "not found" });
      return reply(200, options.results[request.model]!(request.input, request.id));
    }
    const media = options.media?.[url];
    if (media !== undefined) return bytesReply(Buffer.isBuffer(media) ? media : Buffer.from(media));
    return reply(404, { detail: `no fake for ${method} ${url}` });
  };
  return {
    fetch,
    calls,
    requests,
    posts: () => calls.filter((call) => call.method === "POST"),
    /** Seed a request as if an earlier process had submitted it. */
    seed(model: string, id: string, input: Record<string, unknown> = {}, pending = 0) {
      requests.set(id, { id, model, input, pending });
      return { request_id: id, status_url: `${base}/${model}/requests/${id}/status`, response_url: `${base}/${model}/requests/${id}` };
    }
  };
}

export const fastFal = { sleep: async () => undefined, pollMs: 0, retryBaseMs: 0 };
