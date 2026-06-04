import { redactSecrets } from "./AuraSecretRedactor.js";
import type { AuraPatchProvenanceRecord, AuraPromptProvenanceRecord } from "./AuraSceneIR.js";

export interface AuraPromptProvenanceOptions {
  readonly prompt: string;
  readonly provider: string;
  readonly model: string;
  readonly generatedAt?: string;
  readonly networkUsed?: boolean;
  readonly patches?: readonly AuraPatchProvenanceRecord[];
  readonly requestId?: string;
  readonly sceneId?: string;
  readonly patchId?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

const SHA256_INITIAL_STATE = [
  0x6a09e667,
  0xbb67ae85,
  0x3c6ef372,
  0xa54ff53a,
  0x510e527f,
  0x9b05688c,
  0x1f83d9ab,
  0x5be0cd19
];

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function toUtf8Bytes(value: string): number[] {
  return Array.from(new TextEncoder().encode(value));
}

function sha256Hex(value: string): string {
  const bytes = toUtf8Bytes(value);
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while ((bytes.length % 64) !== 56) {
    bytes.push(0);
  }

  const high = Math.floor(bitLength / 0x100000000);
  const low = bitLength >>> 0;
  bytes.push((high >>> 24) & 0xff, (high >>> 16) & 0xff, (high >>> 8) & 0xff, high & 0xff);
  bytes.push((low >>> 24) & 0xff, (low >>> 16) & 0xff, (low >>> 8) & 0xff, low & 0xff);

  const hash = SHA256_INITIAL_STATE.slice();
  const words = new Array<number>(64);

  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      const index = offset + i * 4;
      words[i] =
        ((bytes[index] ?? 0) << 24) |
        ((bytes[index + 1] ?? 0) << 16) |
        ((bytes[index + 2] ?? 0) << 8) |
        (bytes[index + 3] ?? 0);
    }

    for (let i = 16; i < 64; i += 1) {
      const s0 = rotateRight(words[i - 15] ?? 0, 7) ^ rotateRight(words[i - 15] ?? 0, 18) ^ ((words[i - 15] ?? 0) >>> 3);
      const s1 = rotateRight(words[i - 2] ?? 0, 17) ^ rotateRight(words[i - 2] ?? 0, 19) ^ ((words[i - 2] ?? 0) >>> 10);
      words[i] = (((words[i - 16] ?? 0) + s0 + (words[i - 7] ?? 0) + s1) >>> 0);
    }

    let [a, b, c, d, e, f, g, h] = hash;

    for (let i = 0; i < 64; i += 1) {
      const sum1 = rotateRight(e ?? 0, 6) ^ rotateRight(e ?? 0, 11) ^ rotateRight(e ?? 0, 25);
      const choice = ((e ?? 0) & (f ?? 0)) ^ (~(e ?? 0) & (g ?? 0));
      const temp1 = ((h ?? 0) + sum1 + choice + (SHA256_K[i] ?? 0) + (words[i] ?? 0)) >>> 0;
      const sum0 = rotateRight(a ?? 0, 2) ^ rotateRight(a ?? 0, 13) ^ rotateRight(a ?? 0, 22);
      const majority = ((a ?? 0) & (b ?? 0)) ^ ((a ?? 0) & (c ?? 0)) ^ ((b ?? 0) & (c ?? 0));
      const temp2 = (sum0 + majority) >>> 0;

      h = g;
      g = f;
      f = e;
      e = ((d ?? 0) + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] = ((hash[0] ?? 0) + (a ?? 0)) >>> 0;
    hash[1] = ((hash[1] ?? 0) + (b ?? 0)) >>> 0;
    hash[2] = ((hash[2] ?? 0) + (c ?? 0)) >>> 0;
    hash[3] = ((hash[3] ?? 0) + (d ?? 0)) >>> 0;
    hash[4] = ((hash[4] ?? 0) + (e ?? 0)) >>> 0;
    hash[5] = ((hash[5] ?? 0) + (f ?? 0)) >>> 0;
    hash[6] = ((hash[6] ?? 0) + (g ?? 0)) >>> 0;
    hash[7] = ((hash[7] ?? 0) + (h ?? 0)) >>> 0;
  }

  return hash.map((value) => value.toString(16).padStart(8, "0")).join("");
}

export function createPromptHash(prompt: string): string {
  return `sha256:${sha256Hex(redactSecrets(prompt))}`;
}

export function createPromptProvenance(options: AuraPromptProvenanceOptions): AuraPromptProvenanceRecord {
  return {
    provider: options.provider,
    model: options.model,
    promptHash: createPromptHash(options.prompt),
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    networkUsed: options.networkUsed ?? false,
    promptPreview: redactSecrets(options.prompt).slice(0, 96),
    ...(options.requestId ? { requestId: options.requestId } : {}),
    ...(options.sceneId ? { sceneId: options.sceneId } : {}),
    ...(options.patchId ? { patchId: options.patchId } : {}),
    ...(options.metadata ? { metadata: redactSecrets(options.metadata) } : {}),
    patches: options.patches ?? []
  };
}
