import { type ShaderSources } from "./RenderDevice";

export interface ShaderAttributeReflection {
  readonly name: string;
  readonly type: string;
  readonly location: number;
  readonly source: "vertex";
  readonly line: number;
}

export interface ShaderUniformReflection {
  readonly name: string;
  readonly type: string;
  readonly arraySize: number | null;
  readonly source: "vertex" | "fragment";
  readonly line: number;
}

export interface ShaderReflection {
  readonly attributes: ReadonlyMap<string, number>;
  readonly uniforms: ReadonlySet<string>;
  readonly attributeDetails: ReadonlyMap<string, ShaderAttributeReflection>;
  readonly uniformDetails: ReadonlyMap<string, ShaderUniformReflection>;
}

interface DeclarationSource {
  readonly source: "vertex" | "fragment";
  readonly text: string;
}

export function reflectShaderSources(sources: ShaderSources): ShaderReflection {
  const attributes = new Map<string, number>();
  const uniforms = new Set<string>();
  const attributeDetails = new Map<string, ShaderAttributeReflection>();
  const uniformDetails = new Map<string, ShaderUniformReflection>();

  const cleanVertex = stripShaderComments(sources.vertex);
  const cleanFragment = stripShaderComments(sources.fragment);

  for (const declaration of parseShaderDeclarations({ source: "vertex", text: cleanVertex })) {
    if (declaration.kind !== "attribute") {
      continue;
    }
    const location = declaration.location ?? nextAvailableLocation(attributes);
    attributes.set(declaration.name, location);
    attributeDetails.set(declaration.name, {
      name: declaration.name,
      type: declaration.type,
      location,
      source: "vertex",
      line: declaration.line
    });
  }

  for (const source of [
    { source: "vertex" as const, text: cleanVertex },
    { source: "fragment" as const, text: cleanFragment }
  ]) {
    for (const declaration of parseShaderDeclarations(source)) {
      if (declaration.kind !== "uniform") {
        continue;
      }
      uniforms.add(declaration.name);
      uniformDetails.set(declaration.name, {
        name: declaration.name,
        type: declaration.type,
        arraySize: declaration.arraySize,
        source: source.source,
        line: declaration.line
      });
    }
  }

  return { attributes, uniforms, attributeDetails, uniformDetails };
}

function stripShaderComments(source: string): string {
  let output = "";
  let inBlockComment = false;

  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];
    const next = source[index + 1];

    if (inBlockComment) {
      if (current === "*" && next === "/") {
        inBlockComment = false;
        index += 1;
        continue;
      }
      output += current === "\n" ? "\n" : " ";
      continue;
    }

    if (current === "/" && next === "*") {
      inBlockComment = true;
      output += "  ";
      index += 1;
      continue;
    }

    if (current === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n") {
        output += " ";
        index += 1;
      }
      if (source[index] === "\n") {
        output += "\n";
      }
      continue;
    }

    output += current;
  }

  return output;
}

function parseShaderDeclarations(source: DeclarationSource): readonly ShaderDeclaration[] {
  const declarations: ShaderDeclaration[] = [];

  source.text.split("\n").forEach((lineText, lineIndex) => {
    for (const statement of lineText.split(";")) {
      const normalized = statement.replace(/\s+/g, " ").trim();
      if (!normalized || normalized.startsWith("#")) {
        continue;
      }

      const line = lineIndex + 1;
      const attribute = parseAttributeDeclaration(normalized, line);
      if (attribute) {
        declarations.push(attribute);
        continue;
      }

      const uniform = parseUniformDeclaration(normalized, line);
      if (uniform) {
        declarations.push(uniform);
      }
    }
  });

  return declarations;
}

interface BaseShaderDeclaration {
  readonly name: string;
  readonly type: string;
  readonly line: number;
}

interface AttributeDeclaration extends BaseShaderDeclaration {
  readonly kind: "attribute";
  readonly location: number | null;
}

interface UniformDeclaration extends BaseShaderDeclaration {
  readonly kind: "uniform";
  readonly arraySize: number | null;
}

type ShaderDeclaration = AttributeDeclaration | UniformDeclaration;

function parseAttributeDeclaration(statement: string, line: number): AttributeDeclaration | null {
  const match = statement.match(
    /^(?:layout\s*\(\s*location\s*=\s*(\d+)\s*\)\s*)?(?:flat\s+|smooth\s+|noperspective\s+|centroid\s+)*(?:(?:lowp|mediump|highp)\s+)?(?:in|attribute)\s+(\w+)\s+(\w+)(?:\s*\[[^\]]+\])?$/
  );
  if (!match) {
    return null;
  }
  return {
    kind: "attribute",
    location: match[1] ? Number(match[1]) : null,
    type: match[2] ?? "",
    name: match[3] ?? "",
    line
  };
}

function parseUniformDeclaration(statement: string, line: number): UniformDeclaration | null {
  const match = statement.match(/^(?:layout\s*\([^)]+\)\s*)?uniform\s+(?:(?:lowp|mediump|highp)\s+)?(\w+)\s+(\w+)(?:\s*\[\s*(\d+)\s*\])?$/);
  if (!match) {
    return null;
  }
  return {
    kind: "uniform",
    type: match[1] ?? "",
    name: match[2] ?? "",
    arraySize: match[3] ? Number(match[3]) : null,
    line
  };
}

function nextAvailableLocation(attributes: ReadonlyMap<string, number>): number {
  const used = new Set(attributes.values());
  let location = 0;
  while (used.has(location)) {
    location += 1;
  }
  return location;
}
