import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT ?? 8787);
const providerMode = process.env.AURA_PROVIDER_MODE ?? "fixture";
const provider = process.env.AURA_PROVIDER ?? "fixture";

const secretEnvByProvider = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
  local: "LOCAL_MODEL_ENDPOINT"
};

createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/api/provider-status") {
      return sendJson(response, 200, providerStatus());
    }
    if (request.method === "POST" && request.url === "/api/scene") {
      const body = await readRequestJson(request);
      const scene = await createScene(String(body.prompt ?? ""), body.mode === "live" ? "live" : providerMode);
      return sendJson(response, 200, scene);
    }
    return sendJson(response, 404, { error: "not_found" });
  } catch (error) {
    return sendJson(response, 500, {
      error: "proxy_error",
      message: redact(error instanceof Error ? error.message : String(error))
    });
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Aura3D scene proxy listening on http://127.0.0.1:${port}`);
  console.log(`mode=${providerMode} provider=${provider}`);
});

async function createScene(prompt, requestedMode) {
  const manifest = JSON.parse(await readFile(resolve(root, "asset-manifest.json"), "utf8"));
  const mode = requestedMode === "live" ? "live" : requestedMode === "mock" ? "mock" : "fixture";
  if (mode === "live") return createLiveScene(prompt, manifest);
  return createLocalScene(prompt, manifest, mode, []);
}

async function createLiveScene(prompt, manifest) {
  const status = providerStatus();
  if (!status.configured) {
    return createLocalScene(prompt, manifest, "fixture", [
      `Live provider ${provider} is not configured on the server; fixture fallback returned.`
    ]);
  }

  if (provider === "local" && process.env.LOCAL_MODEL_ENDPOINT) {
    return createLocalEndpointScene(prompt, manifest);
  }

  if (!process.env.AURA_PROVIDER_ENDPOINT) {
    return createLocalScene(prompt, manifest, "fixture", [
      "AURA_PROVIDER_ENDPOINT is not set; fixture fallback returned instead of exposing provider secrets to the browser."
    ]);
  }

  const upstream = await fetch(process.env.AURA_PROVIDER_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env[status.secretEnv] ?? ""}`
    },
    body: JSON.stringify({
      prompt,
      qualityTarget: "L3-cinematic-realtime",
      responseFormat: "AuraSceneIR"
    })
  });
  if (!upstream.ok) throw new Error(`upstream provider returned ${upstream.status}`);
  const result = await upstream.json();
  return {
    ...createLocalScene(prompt, manifest, "live", []),
    ...result,
    providerMode: provider,
    diagnostics: {
      ...createLocalScene(prompt, manifest, "live", []).diagnostics,
      ...(result.diagnostics ?? {}),
      networkUsed: true,
      secretsExposed: false,
      noFinalFilmClaim: true
    }
  };
}

async function createLocalEndpointScene(prompt, manifest) {
  const endpoint = process.env.LOCAL_MODEL_ENDPOINT;
  const upstream = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ prompt, qualityTarget: "L3-cinematic-realtime" })
  });
  if (!upstream.ok) throw new Error(`local model endpoint returned ${upstream.status}`);
  const result = await upstream.json();
  return {
    ...createLocalScene(prompt, manifest, "live", []),
    ...result,
    providerMode: "local",
    diagnostics: {
      ...createLocalScene(prompt, manifest, "live", []).diagnostics,
      ...(result.diagnostics ?? {}),
      networkUsed: true,
      secretsExposed: false,
      noFinalFilmClaim: true
    }
  };
}

function createLocalScene(prompt, manifest, mode, warnings) {
  return {
    schema: "aura-scene-ir/0.1",
    sceneId: `proxy-scene-${stableHash(`${mode}:${prompt}`).slice(0, 8)}`,
    title: "Rooftop Signal In Rain Haze",
    prompt,
    providerMode: mode,
    qualityTarget: "L3-cinematic-realtime",
    camera: {
      shot: "low medium-wide",
      movement: "slow push toward beacon antenna",
      durationSeconds: 7
    },
    look: {
      palette: ["storm blue", "signal green", "warm window amber"],
      atmosphere: "rain haze, layered city silhouettes, beacon glow",
      lighting: ["storm rim light", "green beacon practical", "warm distant windows"],
      vfx: ["rain streaks", "fog layers", "emissive beacon glow"]
    },
    assets: manifest.assets,
    diagnostics: {
      backend: "server-proxy-template",
      networkUsed: false,
      secretsExposed: false,
      fallbackUsed: warnings.length > 0,
      unresolvedAssets: [],
      placeholders: [],
      warnings,
      noFinalFilmClaim: true
    }
  };
}

function providerStatus() {
  const secretEnv = secretEnvByProvider[provider] ?? "";
  const configured = provider === "fixture" || provider === "mock" || Boolean(secretEnv && process.env[secretEnv]);
  return {
    providerMode,
    provider,
    configured,
    secretEnv,
    keyPresent: Boolean(secretEnv && process.env[secretEnv]),
    secretsExposed: false
  };
}

function readRequestJson(request) {
  return new Promise((resolvePromise, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 128_000) {
        reject(new Error("request body too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolvePromise(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("invalid JSON request"));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(`${JSON.stringify(payload, null, 2)}\n`);
}

function redact(value) {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [redacted]")
    .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/AIza[A-Za-z0-9_-]+/g, "[redacted]");
}

function stableHash(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
