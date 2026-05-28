import { containsPotentialSecret, redactSecrets } from "@aura3d/ai-scene";

const SERVER_SECRET_KEY_PATTERN = /api[_-]?key|token|secret|password|authorization|cookie/i;

export function redactProviderSecrets(input: string): string;
export function redactProviderSecrets<T>(input: T): T;
export function redactProviderSecrets<T>(input: string | T): string | T {
  return redactSecrets(input);
}

export function collectSecretFieldPaths(input: unknown, prefix = ""): readonly string[] {
  if (!input || typeof input !== "object") return [];
  const paths: string[] = [];
  for (const [key, value] of Object.entries(input)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (SERVER_SECRET_KEY_PATTERN.test(key)) {
      paths.push(path);
      continue;
    }
    if (typeof value === "string" && containsPotentialSecret(value)) paths.push(path);
    if (value && typeof value === "object") paths.push(...collectSecretFieldPaths(value, path));
  }
  return paths;
}

export function sanitizeProviderErrorMessage(message: string): string {
  return redactProviderSecrets(message).slice(0, 1_000);
}

export function safeProviderSnippet(input: string, maxLength = 240): string {
  const compact = input.replace(/\s+/g, " ").trim();
  return redactProviderSecrets(compact.length > maxLength ? `${compact.slice(0, maxLength)}...` : compact);
}
