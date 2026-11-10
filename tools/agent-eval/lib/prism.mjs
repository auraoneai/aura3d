import { readFileSync } from "node:fs";

const KEY_FILE = "/Users/gurbakshchahal/kiro-prism/.prism_key.txt";
export const DEFAULT_MODEL = "claude-sonnet-5.5";

export function loadKey(env = process.env, readFile = readFileSync) {
  if (env.PRISM_API_KEY) return env.PRISM_API_KEY.trim();
  return String(readFile(KEY_FILE, "utf8")).trim();
}

const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Turn an Anthropic-style SSE stream into the non-streamed message shape: content blocks (text, tool_use with its
 * input parsed from input_json_delta), stop_reason, and usage (message_start usage overlaid by message_delta usage,
 * which on Prism carries the final input/output tokens and kiro_credits). A stream that ends without message_stop, or
 * an error event, throws a retryable error.
 */
export async function assembleStream(response) {
  const text = await response.text();
  const message = { content: [], usage: {}, stop_reason: null };
  const partial = {};
  let stopped = false;
  for (const chunk of text.split(/\n\n/)) {
    const data = chunk.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim()).join("");
    if (!data) continue;
    const ev = JSON.parse(data);
    if (ev.type === "message_start") Object.assign(message, { ...ev.message, content: [], usage: { ...(ev.message?.usage ?? {}) } });
    else if (ev.type === "content_block_start") {
      message.content[ev.index] = { ...ev.content_block };
      if (ev.content_block.type === "tool_use") partial[ev.index] = "";
    } else if (ev.type === "content_block_delta") {
      const b = message.content[ev.index];
      if (ev.delta.type === "text_delta") b.text = (b.text ?? "") + ev.delta.text;
      else if (ev.delta.type === "input_json_delta") partial[ev.index] += ev.delta.partial_json;
      else if (ev.delta.type === "thinking_delta") b.thinking = (b.thinking ?? "") + ev.delta.thinking;
      else if (ev.delta.type === "signature_delta") b.signature = ev.delta.signature;
    } else if (ev.type === "content_block_stop") {
      if (partial[ev.index] != null) message.content[ev.index].input = partial[ev.index] ? JSON.parse(partial[ev.index]) : {};
    } else if (ev.type === "message_delta") {
      Object.assign(message, ev.delta ?? {});
      Object.assign(message.usage, ev.usage ?? {});
    } else if (ev.type === "message_stop") stopped = true;
    else if (ev.type === "error") throw new Error(`prism 503: stream error ${JSON.stringify(ev.error ?? ev).slice(0, 200)}`);
  }
  if (!stopped) throw new Error("prism 503: stream ended without message_stop");
  message.content = message.content.filter(Boolean);
  return message;
}

/** Anthropic-compatible Messages client for Kiro Prism. The key is only ever placed in a request header. */
export function createPrismClient({
  key,
  baseUrl = "https://prism.auraone.ai",
  fetchImpl = fetch,
  clientId = "aura3d-agent-eval",
  maxRetries = 6,
  sleep = sleepMs,
  // A request with no response after this long is abandoned and retried (C1 phase 2, 2026-11-09: three task-103 runs
  // sat >20 min on one open request each, with no timeout to end them). a full 8192-token turn can take several minutes on this route.
  requestTimeoutMs = Number(process.env.AGENT_EVAL_REQUEST_TIMEOUT_MS ?? 900000),
  // Stream by default: a long non-streamed turn (a near-cap write_file) ends as a CloudFront 504 at Prism's edge on every
  // retry (C1 run c1-551-t103-three-r1, 2026-11-09). The streamed events are assembled into the same message object.
  stream = process.env.AGENT_EVAL_STREAM !== "0"
} = {}) {
  if (!key) throw new Error("Prism key missing");
  async function messages(body, { session, jobType = "agent-eval" } = {}) {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      try {
        const response = await fetchImpl(`${baseUrl}/v1/messages`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "X-Prism-Client": clientId,
            "X-Prism-Job-Type": jobType,
            ...(session ? { "X-Prism-Session": session } : {})
          },
          body: JSON.stringify(stream ? { ...body, stream: true } : body),
          ...(requestTimeoutMs > 0 && typeof AbortSignal?.timeout === "function" ? { signal: AbortSignal.timeout(requestTimeoutMs) } : {})
        });
        if (response.ok) return stream && /event-stream/.test(response.headers?.get?.("content-type") ?? "") ? await assembleStream(response) : await response.json();
        const text = (await response.text()).slice(0, 300);
        lastError = new Error(`prism ${response.status}: ${text}`);
        const retryable = response.status === 429 || response.status >= 500 || response.status === 409;
        if (!retryable) throw lastError;
        const retryAfter = Number(response.headers?.get?.("retry-after"));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : Math.min(60000, 2000 * 2 ** attempt));
      } catch (error) {
        if (error === lastError && !String(error.message).match(/prism (429|5\d\d|409)/)) throw error;
        lastError = error;
        if (attempt === maxRetries) break;
        await sleep(Math.min(60000, 2000 * 2 ** attempt));
      }
    }
    const redacted = String(lastError?.message ?? lastError).split(key).join("[redacted]");
    throw new Error(`prism request failed after retries: ${redacted}`);
  }
  return { messages };
}
