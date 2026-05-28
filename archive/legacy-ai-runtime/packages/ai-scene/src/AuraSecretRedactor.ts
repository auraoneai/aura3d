const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_-]{16,}/g,
  /AKIA[A-Z0-9]{16}/g,
  /(api[_-]?key|token|secret|password)\s*[:=]\s*["']?[^"'\s,}]+/gi,
  /(OPENAI_API_KEY|ANTHROPIC_API_KEY|GEMINI_API_KEY)\s*[:=]\s*["']?[^"'\s,}]+/g
] as const;

export function redactSecrets(input: string): string;
export function redactSecrets<T>(input: T): T;
export function redactSecrets<T>(input: string | T): string | T {
  if (typeof input !== "string") return redactObject(input);
  let output = input;
  for (const pattern of SECRET_PATTERNS) output = output.replace(pattern, (match) => redactMatch(match));
  return output;
}

export function redactSecretsFromObject<T>(input: T): T {
  return redactSecrets(input);
}

export function containsPotentialSecret(input: string): boolean {
  return SECRET_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(input);
  });
}

function redactMatch(match: string): string {
  const separator = match.match(/[:=]/);
  if (!separator || separator.index === undefined) return "[REDACTED]";
  return `${match.slice(0, separator.index + 1)}[REDACTED]`;
}

function redactObject<T>(input: T): T {
  if (Array.isArray(input)) return input.map((entry) => redactObject(entry)) as T;
  if (!input || typeof input !== "object") return input;
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (/api[_-]?key|token|secret|password|authorization/i.test(key)) {
      output[key] = typeof value === "string" && /^Bearer\s+/i.test(value) ? "Bearer [REDACTED]" : "[REDACTED]";
      continue;
    }
    output[key] = typeof value === "string" ? redactPromptString(value) : redactObject(value);
  }
  return output as T;
}

function redactPromptString(value: string): string {
  const secretEnvPattern = /SECRET_[A-Z0-9_]*=[^\s,}]+/g;
  const bearerPattern = /Bearer\s+[A-Za-z0-9._-]+/g;
  const geminiPattern = /AIza[0-9A-Za-z_-]+/g;
  return redactSecrets(value)
    .replace(secretEnvPattern, "SECRET_[REDACTED]")
    .replace(bearerPattern, "Bearer [REDACTED]")
    .replace(geminiPattern, "[REDACTED]");
}
