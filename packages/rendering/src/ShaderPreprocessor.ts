export interface ShaderPreprocessOptions {
  readonly defines?: Readonly<Record<string, string | number | boolean>>;
  readonly includes?: ReadonlyMap<string, string>;
}

export interface ShaderSourceMapEntry {
  readonly generatedLine: number;
  readonly sourceName: string;
  readonly sourceLine: number;
}

export interface ShaderPreprocessResult {
  readonly source: string;
  readonly included: readonly string[];
  readonly sourceMap: readonly ShaderSourceMapEntry[];
}

interface ExpandedShaderSource {
  readonly lines: readonly string[];
  readonly sourceMap: readonly ShaderSourceMapEntry[];
}

export class ShaderPreprocessor {
  preprocess(source: string, options: ShaderPreprocessOptions = {}): ShaderPreprocessResult {
    const included: string[] = [];
    const defines = normalizeDefines(options.defines ?? {});
    const expanded = this.expandSource({
      source,
      sourceName: "root",
      includes: options.includes ?? new Map(),
      defines,
      stack: [],
      included
    });
    const defineLines = [...defines.entries()].map(([key, value]) => `#define ${key} ${value}`);
    const { lines, sourceMap } = mergeDefines(expanded, defineLines);
    return {
      source: lines.filter(Boolean).join("\n"),
      included,
      sourceMap
    };
  }

  private expandSource({
    source,
    sourceName,
    includes,
    defines,
    stack,
    included
  }: {
    readonly source: string;
    readonly sourceName: string;
    includes: ReadonlyMap<string, string>,
    readonly defines: ReadonlyMap<string, string>;
    stack: readonly string[],
    included: string[]
  }): ExpandedShaderSource {
    const output: string[] = [];
    const sourceMap: ShaderSourceMapEntry[] = [];
    const conditions: Array<{ parentActive: boolean; conditionActive: boolean; elseSeen: boolean; line: number }> = [];
    const lines = source.split(/\r?\n/);
    const isActive = (): boolean => conditions.every((condition) => condition.parentActive && condition.conditionActive);

    const pushLine = (line: string, sourceLine: number, mappedSourceName = sourceName): void => {
      output.push(line);
      sourceMap.push({
        generatedLine: output.length,
        sourceName: mappedSourceName,
        sourceLine
      });
    };

    lines.forEach((line, index) => {
      const sourceLine = index + 1;
      const conditional = parseConditionalDirective(line);
      if (conditional) {
        if (conditional.kind === "else") {
          const current = conditions[conditions.length - 1];
          if (!current) {
            throw new Error(`Shader #else without matching #if at ${sourceName}:${sourceLine}`);
          }
          if (current.elseSeen) {
            throw new Error(`Shader duplicate #else at ${sourceName}:${sourceLine}`);
          }
          current.conditionActive = !current.conditionActive;
          current.elseSeen = true;
          return;
        }
        if (conditional.kind === "endif") {
          if (!conditions.pop()) {
            throw new Error(`Shader #endif without matching #if at ${sourceName}:${sourceLine}`);
          }
          return;
        }
        if (conditional.kind === "if") {
          const parentActive = isActive();
          conditions.push({
            parentActive,
            conditionActive: evaluateCondition(conditional.expression, defines, sourceName, sourceLine),
            elseSeen: false,
            line: sourceLine
          });
        }
        return;
      }

      if (!isActive()) {
        return;
      }

      const includeName = parseInclude(line);
      if (includeName !== null) {
        if (stack.includes(includeName)) {
          throw new Error(`Circular shader include detected: ${[...stack, includeName].join(" -> ")}`);
        }
        const includeSource = includes.get(includeName);
        if (includeSource === undefined) {
          throw new Error(`Shader include not found: ${includeName}`);
        }
        included.push(includeName);
        const expanded = this.expandSource({
          source: includeSource,
          sourceName: includeName,
          includes,
          defines,
          stack: [...stack, includeName],
          included
        });
        for (const expandedLine of expanded.lines) {
          output.push(expandedLine);
        }
        for (const entry of expanded.sourceMap) {
          sourceMap.push({
            ...entry,
            generatedLine: output.length - expanded.lines.length + entry.generatedLine
          });
        }
        return;
      }

      pushLine(line, sourceLine);
    });

    const unclosed = conditions[conditions.length - 1];
    if (unclosed) {
      throw new Error(`Shader conditional opened at ${sourceName}:${unclosed.line} is missing #endif`);
    }

    return { lines: output, sourceMap };
  }
}

function mergeDefines(expanded: ExpandedShaderSource, defineLines: readonly string[]): ExpandedShaderSource {
  if (defineLines.length === 0) return expanded;
  const versionLineIndex = expanded.lines.findIndex((line) => line.trim().startsWith("#version"));
  if (versionLineIndex === 0) {
    return {
      lines: [
        expanded.lines[0]!,
        ...defineLines,
        ...expanded.lines.slice(1)
      ],
      sourceMap: [
        {
          ...expanded.sourceMap[0]!,
          generatedLine: 1
        },
        ...defineLines.map((_, index) => ({
          generatedLine: index + 2,
          sourceName: "<defines>",
          sourceLine: index + 1
        })),
        ...expanded.sourceMap.slice(1).map((entry) => ({
          ...entry,
          generatedLine: entry.generatedLine + defineLines.length
        }))
      ]
    };
  }
  return {
    lines: [...defineLines, ...expanded.lines],
    sourceMap: [
      ...defineLines.map((_, index) => ({
        generatedLine: index + 1,
        sourceName: "<defines>",
        sourceLine: index + 1
      })),
      ...expanded.sourceMap.map((entry) => ({
        ...entry,
        generatedLine: entry.generatedLine + defineLines.length
      }))
    ]
  };
}

function normalizeDefines(defines: Readonly<Record<string, string | number | boolean>>): ReadonlyMap<string, string> {
  const normalized = new Map<string, string>();
  for (const [key, value] of Object.entries(defines)) {
    if (!/^[A-Za-z_]\w*$/.test(key)) {
      throw new Error(`Shader define name is invalid: ${key}`);
    }
    normalized.set(key, formatDefine(value));
  }
  return normalized;
}

function formatDefine(value: string | number | boolean): string {
  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }
  return String(value);
}

function parseInclude(line: string): string | null {
  const match = line.match(/^\s*#include\s+<([^>]+)>\s*$/);
  return match?.[1] ?? null;
}

function parseConditionalDirective(line: string):
  | { readonly kind: "if"; readonly expression: string }
  | { readonly kind: "else" | "endif" }
  | null {
  const match = line.match(/^\s*#(ifdef|ifndef|if|else|endif)\b\s*(.*?)\s*$/);
  if (!match) return null;
  const directive = match[1]!;
  const expression = match[2] ?? "";
  if (directive === "else" || directive === "endif") {
    if (expression.length > 0) {
      throw new Error(`Shader #${directive} does not accept an expression`);
    }
    return { kind: directive };
  }
  if (directive === "ifdef") return { kind: "if", expression: `defined(${expression})` };
  if (directive === "ifndef") return { kind: "if", expression: `!defined(${expression})` };
  return { kind: "if", expression };
}

function evaluateCondition(expression: string, defines: ReadonlyMap<string, string>, sourceName: string, sourceLine: number): boolean {
  const trimmed = expression.trim();
  const definedMatch = trimmed.match(/^(!)?defined\s*\(\s*([A-Za-z_]\w*)\s*\)$/);
  if (definedMatch) {
    const exists = defines.has(definedMatch[2]!);
    return definedMatch[1] === "!" ? !exists : exists;
  }
  const bareMatch = trimmed.match(/^([A-Za-z_]\w*)$/);
  if (bareMatch) {
    const defineName = bareMatch[1]!;
    const value = defines.get(defineName);
    if (value === undefined) {
      throw new Error(`Shader conditional references undefined define ${defineName} at ${sourceName}:${sourceLine}`);
    }
    return value !== "0" && value !== "false" && value !== "";
  }
  const literalMatch = trimmed.match(/^[01]$/);
  if (literalMatch) {
    return trimmed === "1";
  }
  throw new Error(`Unsupported shader conditional expression at ${sourceName}:${sourceLine}: ${expression}`);
}
