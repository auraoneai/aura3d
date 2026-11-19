/** Minimal strict argv parser for the generate verbs: known value flags, known boolean flags, positionals. */

export interface ParsedArgs {
  readonly positionals: readonly string[];
  readonly values: ReadonlyMap<string, string>;
  readonly flags: ReadonlySet<string>;
  readonly errors: readonly string[];
}

export function parseArgs(argv: readonly string[], spec: { readonly values: readonly string[]; readonly booleans: readonly string[] }): ParsedArgs {
  const valueFlags = new Set(spec.values);
  const booleanFlags = new Set(spec.booleans);
  const positionals: string[] = [];
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const errors: string[] = [];
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;
    if (arg === "--") {
      positionals.push(...argv.slice(index + 1));
      break;
    }
    if (arg.startsWith("-") && arg.length > 1 && !/^-\d/.test(arg)) {
      const eq = arg.indexOf("=");
      const name = eq > 0 ? arg.slice(0, eq) : arg;
      if (valueFlags.has(name)) {
        const value = eq > 0 ? arg.slice(eq + 1) : argv[index + 1];
        // Values may start with "-" when they are numbers or signed axes (--front -z, --yaw -90).
        if (value === undefined || (eq < 0 && value.startsWith("--"))) errors.push(`${name} needs a value`);
        else {
          values.set(name, value);
          if (eq < 0) index++;
        }
      } else if (booleanFlags.has(name) && eq < 0) {
        flags.add(name);
      } else {
        errors.push(`unknown flag ${name}`);
      }
      continue;
    }
    positionals.push(arg);
  }
  return { positionals, values, flags, errors };
}

export function numberValue(args: ParsedArgs, name: string, errors: string[], check?: (value: number) => boolean): number | undefined {
  const raw = args.values.get(name);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isFinite(value) || (check && !check(value))) {
    errors.push(`${name} got "${raw}"`);
    return undefined;
  }
  return value;
}

export function listValue(args: ParsedArgs, name: string): string[] | undefined {
  const raw = args.values.get(name);
  return raw === undefined ? undefined : raw.split(",").map((part) => part.trim()).filter(Boolean);
}

/** `height=1.8` | `length=4` | `width=2` | `maxDim=2` (also `max-dim=2`). */
export function parseSize(raw: string): { height?: number; length?: number; width?: number; maxDim?: number } | undefined {
  const match = raw.trim().match(/^(height|length|width|maxDim|max-dim|maxdim)\s*=\s*([0-9]*\.?[0-9]+)$/i);
  if (!match) return undefined;
  const value = Number(match[2]);
  if (!(value > 0)) return undefined;
  const key = match[1]!.toLowerCase();
  if (key === "height") return { height: value };
  if (key === "length") return { length: value };
  if (key === "width") return { width: value };
  return { maxDim: value };
}

export function parseWindow(raw: string): [number, number] | undefined {
  const parts = raw.split(",").map((part) => Number(part.trim()));
  if (parts.length !== 2 || parts.some((part) => !Number.isFinite(part)) || !(parts[0]! >= 0 && parts[1]! > parts[0]!)) return undefined;
  return [parts[0]!, parts[1]!];
}

export function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "project";
}
