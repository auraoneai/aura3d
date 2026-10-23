import { DEFAULT_HEAL_LADDER, healParams, type HealRung } from "./blackFrame.js";

/**
 * Quality URL switches shared by every game: `?post=0 ?shadow=0 ?env=0 ?sky=0 ?aa=0 ?quality=low ?tm=aces ?heal=0 ?diag=1`.
 * Parsing is pure; a game decides what each switch changes in its own options. Rung parameters from the black-frame
 * ladder are merged UNDER explicit parameters, so an author's URL always wins.
 */
export interface QualitySwitches {
  readonly post: boolean;
  readonly shadow: boolean;
  readonly env: boolean;
  readonly sky: boolean;
  readonly aa: boolean;
  readonly heal: boolean;
  readonly diag: boolean;
  readonly quality: "default" | "low";
  readonly toneMapping: "default" | "aces";
  /** The merged query parameters actually used (explicit + ladder). */
  readonly params: Readonly<Record<string, string>>;
}

export interface ResolveQualitySwitchesOptions {
  readonly search?: string | URLSearchParams;
  /** Black-frame ladder rung currently in force (0 = none). */
  readonly healStage?: number;
  readonly ladder?: readonly HealRung[];
}

export function resolveQualitySwitches(options: ResolveQualitySwitchesOptions = {}): QualitySwitches {
  const raw = options.search ?? (typeof location === "undefined" ? "" : location.search);
  const query = raw instanceof URLSearchParams ? new URLSearchParams(raw) : new URLSearchParams(raw);
  for (const [key, value] of Object.entries(healParams(options.healStage ?? 0, options.ladder ?? DEFAULT_HEAL_LADDER))) {
    if (!query.has(key)) query.set(key, value);
  }
  const off = (key: string): boolean => query.get(key) !== "0";
  return {
    post: off("post"),
    shadow: off("shadow"),
    env: off("env"),
    sky: off("sky"),
    aa: off("aa"),
    heal: off("heal"),
    diag: query.get("diag") === "1",
    quality: query.get("quality") === "low" ? "low" : "default",
    toneMapping: query.get("tm") === "aces" ? "aces" : "default",
    params: Object.fromEntries(query.entries())
  };
}
