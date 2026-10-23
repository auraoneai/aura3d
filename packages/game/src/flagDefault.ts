import type { QrFlagInput } from "@aura3d/engine";

const GAME_TOKEN = /^[-+]?(game|a3d_qr_game)(=.*)?$/i;

/**
 * Importing `createGame` from `@aura3d/engine/game` is itself the opt-in to the real game kit, so the `game`
 * lane defaults on here. Any explicit setting still wins: a `game`/`-game` token, an `A3D_QR_GAME` entry, `none`
 * (all lanes off), and the URL (`?a3d-qr=-game`) and env sources, which `resolveQrFlags` applies first.
 */
export function withGameFlagDefault(input: QrFlagInput | undefined): QrFlagInput {
  if (input === undefined) return ["game"];
  if (typeof input === "string") {
    const tokens = input.split(",").map((t) => t.trim()).filter((t) => t.length > 0);
    if (tokens.length === 0 || tokens.includes("none") || tokens.includes("all")) return input;
    return tokens.some((t) => GAME_TOKEN.test(t)) ? input : `${tokens.join(",")},game`;
  }
  if (Array.isArray(input)) {
    const tokens = input as readonly string[];
    const flat = tokens.flatMap((entry) => entry.split(",").map((t) => t.trim()).filter((t) => t.length > 0));
    if (flat.includes("none") || flat.includes("all")) return input;
    return flat.some((t) => GAME_TOKEN.test(t)) ? input : [...tokens, "game"];
  }
  const record = input as Readonly<Record<string, unknown>>;
  if (record.A3D_QR_GAME !== undefined) return input;
  return { ...record, A3D_QR_GAME: true } as unknown as QrFlagInput;
}
