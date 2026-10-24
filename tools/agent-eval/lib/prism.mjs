import { readFileSync } from "node:fs";

const KEY_FILE = "/Users/gurbakshchahal/kiro-prism/.prism_key.txt";
export const DEFAULT_MODEL = "claude-sonnet-5.5";

export function loadKey(env = process.env, readFile = readFileSync) {
  if (env.PRISM_API_KEY) return env.PRISM_API_KEY.trim();
  return String(readFile(KEY_FILE, "utf8")).trim();
}

const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Anthropic-compatible Messages client for Kiro Prism. The key is only ever placed in a request header. */
export function createPrismClient({
  key,
  baseUrl = "https://prism.auraone.ai",
  fetchImpl = fetch,
  clientId = "aura3d-agent-eval",
  maxRetries = 6,
  sleep = sleepMs
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
          body: JSON.stringify(body)
        });
        if (response.ok) return await response.json();
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
