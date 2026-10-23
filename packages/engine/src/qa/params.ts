/** One declared URL parameter: how to parse it and what it defaults to. */
export type QaParamSpec =
  | { readonly type: "flag" }
  | { readonly type: "number"; readonly default: number }
  | { readonly type: "int"; readonly default: number }
  | { readonly type: "string"; readonly default?: string }
  | { readonly type: "enum"; readonly values: readonly string[]; readonly default: string };

export type QaParamSchema = Readonly<Record<string, QaParamSpec>>;

export type QaParamValues<S extends QaParamSchema> = {
  readonly [K in keyof S]: S[K] extends { readonly type: "flag" }
    ? boolean
    : S[K] extends { readonly type: "number" | "int" }
      ? number
      : S[K] extends { readonly type: "enum"; readonly default: infer D }
        ? D extends string ? string : never
        : S[K] extends { readonly type: "string"; readonly default: string }
          ? string
          : string | undefined;
};

/**
 * Parse the QA query parameters every port repeats (`manual=1`, `autostart=1`, `warmup=30`, `seed=7`,
 * `quality=low`, ...). A flag is true for `1`, `true` and the bare key; numbers that fail to parse fall back
 * to their default; enums outside `values` fall back to their default.
 */
export function readQaParams<const S extends QaParamSchema>(
  schema: S,
  search: string = typeof location === "undefined" ? "" : location.search
): QaParamValues<S> {
  const params = new URLSearchParams(search);
  const out: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(schema)) {
    const raw = params.get(key);
    switch (spec.type) {
      case "flag":
        out[key] = raw !== null && (raw === "" || raw === "1" || raw.toLowerCase() === "true");
        break;
      case "number": {
        const value = raw === null || raw === "" ? Number.NaN : Number(raw);
        out[key] = Number.isFinite(value) ? value : spec.default;
        break;
      }
      case "int": {
        const value = raw === null || raw === "" ? Number.NaN : Number(raw);
        out[key] = Number.isFinite(value) ? Math.trunc(value) : spec.default;
        break;
      }
      case "enum":
        out[key] = raw !== null && spec.values.includes(raw) ? raw : spec.default;
        break;
      case "string":
        out[key] = raw ?? spec.default;
        break;
    }
  }
  return out as QaParamValues<S>;
}
