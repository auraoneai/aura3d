import { mergeAssetRequestOptions, type AssetLoadRequest, type AssetLoader } from "../AssetLoader";
import { fetchBytes } from "../LoaderFetch";
import type { LoadContext } from "../LoadContext";
import type { AssetHandle } from "../AssetHandle";
import { createMaterialFromDescriptor } from "../MaterialLoader";
import type { Material } from "@aura3d/rendering";

/** Independent MaterialX 1.38/1.39 subset. Colors are used as authored; no color-space transform is implicit. */
export type MaterialXNumericValue = number | readonly number[];
export type MaterialXExpression =
  | { readonly kind: "constant"; readonly value: MaterialXNumericValue }
  | { readonly kind: "image"; readonly uri: string; readonly channels: number }
  | { readonly kind: "operation"; readonly operation: "add" | "subtract" | "multiply" | "divide" | "mix" | "clamp" | "convert"; readonly args: readonly MaterialXExpression[]; readonly outputType?: string }
  | { readonly kind: "unsupported"; readonly node: string };

export interface MaterialXDiagnostic {
  readonly code: string;
  readonly severity: "warning" | "error";
  readonly message: string;
  readonly node?: string;
}

export interface MaterialXNode {
  readonly name: string;
  readonly category: string;
  readonly type?: string;
  readonly scope: string;
  readonly inputs: Readonly<Record<string, MaterialXPort>>;
  readonly attributes: Readonly<Record<string, string>>;
  readonly sourceUrl?: string;
}

export interface MaterialXPort {
  readonly name: string;
  readonly type?: string;
  readonly value?: string;
  readonly nodeName?: string;
  readonly nodeGraph?: string;
  readonly output?: string;
  readonly interfaceName?: string;
}

export interface MaterialXSurface {
  readonly name: string;
  readonly model: "standard_surface" | "surface_unlit";
  readonly parameters: Readonly<Record<string, MaterialXExpression>>;
  readonly displacement?: {
    readonly value: MaterialXExpression;
    readonly scale: MaterialXExpression;
    /** Scalar displacement is normal-aligned; vector displacement is in tangent/normal space. */
    readonly space: "tangent";
  };
}

export interface MaterialXDocument {
  readonly url?: string;
  readonly version: string;
  readonly nodes: readonly MaterialXNode[];
  readonly materials: readonly MaterialXSurface[];
  readonly dependencies: readonly string[];
  readonly includes: readonly string[];
  readonly diagnostics: readonly MaterialXDiagnostic[];
  /** Present when loaded through MaterialDocumentLoader and its AssetManager. */
  readonly resources?: Readonly<Record<string, unknown>>;
}

export interface MaterialXParseOptions {
  readonly url?: string;
  readonly maxBytes?: number;
  readonly includes?: Readonly<Record<string, MaterialXDocument>>;
}

export interface MaterialXSampleOptions {
  readonly uv?: readonly [number, number];
  /** Samples a decoded image dependency in its declared color space. */
  readonly sampleImage?: (uri: string, uv: readonly [number, number], channels: number) => MaterialXNumericValue;
}

const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
const MAX_NODES = 20000;
const MAX_DEPTH = 128;
const MAX_DEPENDENCIES = 512;
const OP_NODES = new Set(["constant", "image", "add", "subtract", "multiply", "divide", "mix", "clamp", "convert"]);
const SURFACE_NODES = new Set(["standard_surface", "surface_unlit"]);
const STRUCTURAL_NODES = new Set(["nodegraph", "surfacematerial", "displacement"]);

interface XmlElement { name: string; attributes: Record<string, string>; children: XmlElement[]; }

function xmlError(message: string): never { throw new Error(`MATERIALX_XML: ${message}`); }

function unescapeXml(value: string): string {
  if (/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[\da-f]+;)/i.test(value)) xmlError("unknown or malformed XML entity.");
  return value.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, (_, token: string) => {
    const fixed: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (token in fixed) return fixed[token]!;
    if (token[0] !== "#") xmlError("unknown entity.");
    const cp = token[1]?.toLowerCase() === "x" ? Number.parseInt(token.slice(2), 16) : Number.parseInt(token.slice(1), 10);
    if (!Number.isInteger(cp) || cp <= 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff) || (cp < 0x20 && cp !== 9 && cp !== 10 && cp !== 13)) xmlError("invalid XML character reference.");
    return String.fromCodePoint(cp);
  });
}

/** Minimal strict XML reader: no DTD, external entity expansion, mixed content or browser DOM required. */
function readXml(text: string, maxBytes: number): XmlElement {
  if (!Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_DOCUMENT_BYTES) throw new RangeError("MATERIALX_LIMIT: invalid maxBytes.");
  if (text.length > maxBytes || new TextEncoder().encode(text).byteLength > maxBytes) throw new RangeError("MATERIALX_LIMIT: document is too large.");
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) xmlError("DTD and entity declarations are forbidden.");
  const stack: XmlElement[] = [];
  let root: XmlElement | undefined;
  let cursor = 0;
  let count = 0;
  while (cursor < text.length) {
    const start = text.indexOf("<", cursor);
    if (start < 0) {
      if (text.slice(cursor).trim()) xmlError("unexpected text after the root element.");
      break;
    }
    const contentBeforeTag = text.slice(cursor, start);
    if (contentBeforeTag.trim() && !stack.length) xmlError("text outside the root element.");
    if (contentBeforeTag.includes("&")) unescapeXml(contentBeforeTag);
    if (text.startsWith("<!--", start)) {
      const end = text.indexOf("-->", start + 4);
      if (end < 0 || text.slice(start + 4, end).includes("--")) xmlError("invalid comment.");
      cursor = end + 3;
      continue;
    }
    if (text.startsWith("<?", start)) {
      const end = text.indexOf("?>", start + 2);
      if (end < 0) xmlError("unterminated processing instruction.");
      cursor = end + 2;
      continue;
    }
    let end = start + 1;
    let quote = "";
    for (; end < text.length; end += 1) {
      const ch = text[end]!;
      if (quote) { if (ch === quote) quote = ""; else if (ch === "<") xmlError("unexpected '<' inside an attribute."); }
      else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === ">") break;
      else if (ch === "<") xmlError("unexpected '<' inside a tag.");
    }
    if (end >= text.length || quote) xmlError("unterminated tag.");
    const tag = text.slice(start + 1, end).trim();
    cursor = end + 1;
    if (tag.startsWith("!")) xmlError("declarations are unsupported.");
    if (tag.startsWith("/")) {
      const name = tag.slice(1).trim();
      if (!/^[\w:.-]+$/.test(name) || stack.pop()?.name !== name) xmlError("mismatched closing tag.");
      continue;
    }
    const selfClosing = tag.endsWith("/");
    const content = selfClosing ? tag.slice(0, -1).trimEnd() : tag;
    const match = /^([A-Za-z_:][\w:.-]*)/.exec(content);
    if (!match) xmlError("invalid element name.");
    const element: XmlElement = { name: match[1]!, attributes: {}, children: [] };
    let position = match[0].length;
    while (position < content.length) {
      const attr = /^\s+([A-Za-z_:][\w:.-]*)\s*=\s*(["'])(.*?)\2/s.exec(content.slice(position));
      if (!attr) xmlError("malformed attribute.");
      const key = attr[1]!;
      if (Object.hasOwn(element.attributes, key)) xmlError(`duplicate attribute ${key}.`);
      element.attributes[key] = unescapeXml(attr[3]!);
      position += attr[0].length;
    }
    if (++count > MAX_NODES) throw new RangeError("MATERIALX_LIMIT: too many XML elements.");
    if (stack.length >= MAX_DEPTH) throw new RangeError("MATERIALX_LIMIT: XML nesting is too deep.");
    if (stack.length) stack[stack.length - 1]!.children.push(element);
    else if (root) xmlError("multiple root elements.");
    else root = element;
    if (!selfClosing) stack.push(element);
  }
  if (stack.length || !root || root.name !== "materialx") xmlError("expected a complete materialx document.");
  return root;
}

function inputOf(element: XmlElement): MaterialXPort {
  const name = element.attributes.name;
  if (!name) throw new Error("MATERIALX_PORT: every input and output requires a name.");
  const a = element.attributes;
  return { name, ...(a.type ? { type: a.type } : {}), ...(a.value !== undefined ? { value: a.value } : {}),
    ...(a.nodename ? { nodeName: a.nodename } : {}), ...(a.nodegraph ? { nodeGraph: a.nodegraph } : {}),
    ...(a.output ? { output: a.output } : {}), ...(a.interfacename ? { interfaceName: a.interfacename } : {}) };
}

function xmlNodes(root: XmlElement, sourceUrl?: string): MaterialXNode[] {
  const nodes: MaterialXNode[] = [];
  const visit = (element: XmlElement, scope: string): void => {
    if (element.name === "xi:include" || element.name === "include") return;
    if (["input", "output", "parameter", "token"].includes(element.name)) return;
    const name = element.attributes.name;
    if (!name) return;
    const inputs: Record<string, MaterialXPort> = {};
    for (const child of element.children) {
      if (child.name !== "input" && child.name !== "output" && child.name !== "parameter") continue;
      const port = inputOf(child);
      if (Object.hasOwn(inputs, port.name)) throw new Error(`MATERIALX_PORT: duplicate port ${name}.${port.name}.`);
      inputs[port.name] = port;
    }
    nodes.push({ name, category: element.name, scope, inputs, attributes: element.attributes,
      ...(element.attributes.type ? { type: element.attributes.type } : {}), ...(sourceUrl ? { sourceUrl } : {}) });
    if (element.name === "nodegraph") {
      const nextScope = scope ? `${scope}/${name}` : name;
      for (const child of element.children) visit(child, nextScope);
    }
  };
  for (const element of root.children) visit(element, "");
  return nodes;
}

function literal(value: string, type: string | undefined): MaterialXNumericValue {
  const values = value.split(/[\s,]+/).filter(Boolean).map(Number);
  const lengths: Record<string, number> = { float: 1, integer: 1, boolean: 1, color3: 3, color4: 4, vector2: 2, vector3: 3, vector4: 4 };
  if (type === "boolean") {
    if (value === "true") return 1;
    if (value === "false") return 0;
  }
  const expected = type ? lengths[type] : undefined;
  if (expected === undefined || values.length !== expected || values.some((v) => !Number.isFinite(v)) || (type === "integer" && !Number.isInteger(values[0]))) {
    throw new Error(`MATERIALX_VALUE: invalid ${type ?? "untyped"} value ${value.slice(0, 80)}.`);
  }
  return expected === 1 ? values[0]! : values;
}

function resolveUri(uri: string, base?: string): string {
  if (!uri || /[\u0000-\u001f]/.test(uri)) throw new Error("MATERIALX_DEPENDENCY: invalid empty or control-character URI.");
  if (!base) return uri;
  try { return new URL(uri, base).toString(); } catch { return uri; }
}

function extractIncludes(root: XmlElement): string[] {
  return root.children.filter((element) => element.name === "xi:include" || element.name === "include").map((element) => {
    const href = element.attributes.href;
    if (!href) throw new Error("MATERIALX_DEPENDENCY: include lacks href.");
    return href;
  });
}

/** Parse and translate MaterialX documents without resolving external resources implicitly. */
export function parseMaterialXDocument(text: string, options: MaterialXParseOptions = {}): MaterialXDocument {
  const root = readXml(text, options.maxBytes ?? MAX_DOCUMENT_BYTES);
  const version = root.attributes.version ?? "1.38";
  if (!/^1\.(?:38|39)(?:\.\d+)?$/.test(version)) throw new Error(`MATERIALX_VERSION_UNSUPPORTED: ${version}.`);
  const diagnostics: MaterialXDiagnostic[] = [];
  const imported: MaterialXNode[] = [];
  const importedByKey = new Map<string, MaterialXNode>();
  const dependencies = new Set<string>();
  const includes = new Set<string>();
  for (const href of extractIncludes(root)) {
    const uri = resolveUri(href, options.url);
    dependencies.add(uri);
    includes.add(uri);
    const include = options.includes?.[href] ?? options.includes?.[uri];
    if (include) {
      for (const node of include.nodes) {
        const key = node.scope ? `${node.scope}/${node.name}` : node.name;
        const previous = importedByKey.get(key);
        if (previous && node.sourceUrl && node.sourceUrl === previous.sourceUrl && JSON.stringify(node) === JSON.stringify(previous)) continue;
        imported.push(node);
        if (!previous) importedByKey.set(key, node);
      }
      for (const dependency of include.dependencies) dependencies.add(dependency);
      for (const nested of include.includes) includes.add(nested);
      diagnostics.push(...include.diagnostics);
    }
    else diagnostics.push({ code: "MATERIALX_INCLUDE_UNRESOLVED", severity: "error", message: `Include ${uri} must be resolved by the asset manager.` });
  }
  const nodes = [...imported, ...xmlNodes(root, options.url)];
  if (nodes.length > MAX_NODES) throw new RangeError("MATERIALX_LIMIT: too many imported nodes.");
  const index = new Map<string, MaterialXNode>();
  for (const node of nodes) {
    const key = node.scope ? `${node.scope}/${node.name}` : node.name;
    if (index.has(key)) throw new Error(`MATERIALX_DUPLICATE_NODE: ${key}.`);
    index.set(key, node);
    if (!OP_NODES.has(node.category) && !SURFACE_NODES.has(node.category) && !STRUCTURAL_NODES.has(node.category)) {
      diagnostics.push({ code: "MATERIALX_UNSUPPORTED_NODE", severity: "warning", node: key, message: `Node category ${node.category} is not translated.` });
    }
    if (node.attributes.inherit) diagnostics.push({ code: "MATERIALX_INHERIT_UNSUPPORTED", severity: "error", node: key, message: "Material inheritance is not translated." });
  }
  const active = new Set<string>();
  const activePorts = new Set<MaterialXPort>();
  const expressionCache = new Map<string, MaterialXExpression>();
  const constant = (value: MaterialXNumericValue): MaterialXExpression => ({ kind: "constant", value });
  const findNode = (name: string, scope: string): MaterialXNode | undefined => index.get(scope ? `${scope}/${name}` : name) ?? index.get(name);
  const portExpr = (port: MaterialXPort | undefined, scope: string, fallback: MaterialXNumericValue): MaterialXExpression => {
    if (!port) return constant(fallback);
    if (activePorts.has(port) || activePorts.size >= MAX_DEPTH) throw new Error(`MATERIALX_CYCLE: ${scope}.${port.name}.`);
    activePorts.add(port);
    try {
    const refs = Number(!!port.nodeName) + Number(!!port.nodeGraph) + Number(!!port.interfaceName);
    if (refs > 1 || (refs && port.value !== undefined)) throw new Error(`MATERIALX_PORT: conflicting sources for ${port.name}.`);
    if (port.interfaceName) {
      const graph = index.get(scope);
      const source = graph?.inputs[port.interfaceName];
      if (!source) throw new Error(`MATERIALX_MISSING_INTERFACE: ${scope}.${port.interfaceName}.`);
      return portExpr(source, graph!.scope, fallback);
    }
    if (port.nodeGraph) {
      const graph = findNode(port.nodeGraph, scope);
      if (!graph || graph.category !== "nodegraph") throw new Error(`MATERIALX_MISSING_GRAPH: ${port.nodeGraph}.`);
      const output = graph.inputs[port.output ?? "out"];
      if (!output) throw new Error(`MATERIALX_MISSING_OUTPUT: ${port.nodeGraph}.${port.output ?? "out"}.`);
      return portExpr(output, graph.scope ? `${graph.scope}/${graph.name}` : graph.name, fallback);
    }
    if (port.nodeName) {
      const node = findNode(port.nodeName, scope);
      if (!node) throw new Error(`MATERIALX_MISSING_NODE: ${port.nodeName}.`);
      return nodeExpr(node);
    }
    return port.value === undefined ? constant(fallback) : constant(literal(port.value, port.type));
    } finally { activePorts.delete(port); }
  };
  const nodeExpr = (node: MaterialXNode): MaterialXExpression => {
    const id = node.scope ? `${node.scope}/${node.name}` : node.name;
    if (active.has(id) || active.size >= MAX_DEPTH) throw new Error(`MATERIALX_CYCLE: ${id}.`);
    const existing = expressionCache.get(id);
    if (existing) return existing;
    active.add(id);
    try {
      const input = (name: string, fallback: MaterialXNumericValue): MaterialXExpression => portExpr(node.inputs[name], node.scope, fallback);
      const remember = (expression: MaterialXExpression): MaterialXExpression => { expressionCache.set(id, expression); return expression; };
      if (node.category === "constant") return remember(input("value", 0));
      if (node.category === "image") {
        const file = node.inputs.file;
        if (!file?.value || file.nodeName || file.nodeGraph || file.interfaceName) throw new Error(`MATERIALX_IMAGE: ${id} requires a literal filename.`);
        const uri = resolveUri(file.value, node.sourceUrl);
        if (/<(?:UDIM|UVTILE)>/i.test(uri)) throw new Error(`MATERIALX_UDIM_UNSUPPORTED: ${id}.`);
        dependencies.add(uri);
        if (dependencies.size > MAX_DEPENDENCIES) throw new RangeError("MATERIALX_LIMIT: too many dependencies.");
        for (const key of Object.keys(node.inputs)) if (key !== "file") {
          diagnostics.push({ code: "MATERIALX_IMAGE_SETTING_UNSUPPORTED", severity: "warning", node: id, message: `Image input ${key} must be applied by the image sampler.` });
        }
        if (node.attributes.colorspace && node.attributes.colorspace !== "none") diagnostics.push({ code: "MATERIALX_COLORSPACE_UNCONVERTED", severity: "warning", node: id, message: `Image color space ${node.attributes.colorspace} is not converted automatically.` });
        const channels = node.type === "color4" || node.type === "vector4" ? 4 : node.type === "float" ? 1 : node.type === "vector2" ? 2 : 3;
        return remember({ kind: "image", uri, channels });
      }
      if (node.category === "add" || node.category === "subtract" || node.category === "multiply" || node.category === "divide") {
        return remember({ kind: "operation", operation: node.category, args: [input("in1", 0), input("in2", node.category === "multiply" || node.category === "divide" ? 1 : 0)] });
      }
      if (node.category === "mix") return remember({ kind: "operation", operation: "mix", args: [input("bg", 0), input("fg", 0), input("mix", 0)] });
      if (node.category === "clamp") return remember({ kind: "operation", operation: "clamp", args: [input("in", 0), input("low", 0), input("high", 1)] });
      if (node.category === "convert") return remember({ kind: "operation", operation: "convert", args: [input("in", 0)], outputType: node.type });
      return remember({ kind: "unsupported", node: id });
    } finally { active.delete(id); }
  };
  const materials: MaterialXSurface[] = [];
  const linkedNode = (port: MaterialXPort | undefined, scope: string, seen = new Set<MaterialXPort>()): MaterialXNode | undefined => {
    if (!port) return undefined;
    if (seen.has(port) || seen.size >= MAX_DEPTH) throw new Error(`MATERIALX_CYCLE: ${scope}.${port.name}.`);
    seen.add(port);
    if (port.nodeName) return findNode(port.nodeName, scope);
    if (port.nodeGraph) {
      const graph = findNode(port.nodeGraph, scope);
      if (!graph || graph.category !== "nodegraph") throw new Error(`MATERIALX_MISSING_GRAPH: ${port.nodeGraph}.`);
      const output = graph.inputs[port.output ?? "out"];
      if (!output) throw new Error(`MATERIALX_MISSING_OUTPUT: ${port.nodeGraph}.${port.output ?? "out"}.`);
      return linkedNode(output, graph.scope ? `${graph.scope}/${graph.name}` : graph.name, seen);
    }
    if (port.interfaceName) {
      const graph = index.get(scope);
      return linkedNode(graph?.inputs[port.interfaceName], graph?.scope ?? "", seen);
    }
    return undefined;
  };
  const materialNodes = nodes.filter((node) => node.category === "surfacematerial");
  const addMaterial = (material: MaterialXNode | undefined, surface: MaterialXNode): void => {
    const name = material?.name ?? surface.name;
    if (!SURFACE_NODES.has(surface.category)) {
      diagnostics.push({ code: "MATERIALX_UNSUPPORTED_SURFACE", severity: "error", node: name, message: `Surface ${surface.category} is unsupported.` });
      return;
    }
    const defaults: Record<string, MaterialXNumericValue> = surface.category === "standard_surface"
      ? { base: 1, base_color: [0.8, 0.8, 0.8], metalness: 0, specular: 1, specular_color: [1, 1, 1], specular_roughness: 0.2, specular_IOR: 1.5, transmission: 0, emission: 0, emission_color: [1, 1, 1], opacity: [1, 1, 1], coat: 0, coat_roughness: 0.1, sheen: 0, sheen_color: [1, 1, 1] }
      : { emission: 1, emission_color: [1, 1, 1], transmission: 0, opacity: [1, 1, 1] };
    const parameters: Record<string, MaterialXExpression> = {};
    for (const [key, fallback] of Object.entries(defaults)) parameters[key] = portExpr(surface.inputs[key], surface.scope, fallback);
    for (const key of Object.keys(surface.inputs)) if (!(key in defaults)) {
      diagnostics.push({ code: "MATERIALX_UNSUPPORTED_INPUT", severity: "warning", node: surface.name, message: `${surface.category}.${key} is not translated.` });
    }
    const displacementRef = material?.inputs.displacementshader;
    let displacement: MaterialXSurface["displacement"];
    if (displacementRef?.nodeName || displacementRef?.nodeGraph) {
      const displacementNode = linkedNode(displacementRef, material!.scope);
      if (!displacementNode) throw new Error(`MATERIALX_MISSING_NODE: ${displacementRef.nodeName ?? displacementRef.nodeGraph}.`);
      if (displacementNode.category === "displacement") {
        displacement = { value: portExpr(displacementNode.inputs.displacement, displacementNode.scope, 0), scale: portExpr(displacementNode.inputs.scale, displacementNode.scope, 1), space: "tangent" };
        diagnostics.push({ code: "MATERIALX_DISPLACEMENT_REQUIRES_GEOMETRY", severity: "warning", node: name, message: "Apply the translated displacement to geometry; the material object alone does not change vertex positions." });
      } else diagnostics.push({ code: "MATERIALX_UNSUPPORTED_DISPLACEMENT", severity: "error", node: name, message: `${displacementNode.category} is not a displacement node.` });
    } else if (displacementRef) diagnostics.push({ code: "MATERIALX_UNSUPPORTED_DISPLACEMENT", severity: "error", node: name, message: "Only named displacement nodes are supported." });
    materials.push({ name, model: surface.category as MaterialXSurface["model"], parameters, ...(displacement ? { displacement } : {}) });
  };
  for (const material of materialNodes) {
    const port = material.inputs.surfaceshader;
    if (!port?.nodeName && !port?.nodeGraph) { diagnostics.push({ code: "MATERIALX_MISSING_SURFACE", severity: "error", node: material.name, message: "Material requires a named surface shader." }); continue; }
    const surface = linkedNode(port, material.scope);
    if (!surface) throw new Error(`MATERIALX_MISSING_NODE: ${port.nodeName ?? port.nodeGraph}.`);
    addMaterial(material, surface);
  }
  if (!materialNodes.length) for (const surface of nodes.filter((node) => SURFACE_NODES.has(node.category))) addMaterial(undefined, surface);
  if (dependencies.size > MAX_DEPENDENCIES) throw new RangeError("MATERIALX_LIMIT: too many dependencies.");
  return { ...(options.url ? { url: options.url } : {}), version, nodes, materials, dependencies: [...dependencies], includes: [...includes], diagnostics };
}

function broadcast(value: MaterialXNumericValue, length: number): number[] {
  const values = typeof value === "number" ? [value] : [...value];
  if (values.length === 1) return Array(length).fill(values[0]!);
  if (values.length !== length) throw new Error("MATERIALX_TYPE: incompatible graph vector widths.");
  return values;
}

/** Evaluate supported graph nodes at a UV coordinate; unsupported nodes fail explicitly. */
export function evaluateMaterialXExpression(expression: MaterialXExpression, options: MaterialXSampleOptions = {}): MaterialXNumericValue {
  const cache = new Map<MaterialXExpression, MaterialXNumericValue>();
  const active = new Set<MaterialXExpression>();
  const evaluate = (node: MaterialXExpression): MaterialXNumericValue => {
    if (cache.has(node)) return cache.get(node)!;
    if (active.has(node) || active.size >= MAX_DEPTH) throw new Error("MATERIALX_CYCLE: expression graph contains a cycle or exceeds depth limit.");
    if (cache.size >= MAX_NODES) throw new RangeError("MATERIALX_LIMIT: expression graph is too large.");
    active.add(node);
    try {
      let output: MaterialXNumericValue;
      if (node.kind === "constant") {
        const values = typeof node.value === "number" ? [node.value] : node.value;
        if (values.length < 1 || values.length > 4 || values.some((v) => !Number.isFinite(v))) throw new Error("MATERIALX_VALUE: invalid constant.");
        output = node.value;
      } else if (node.kind === "unsupported") {
        throw new Error(`MATERIALX_UNSUPPORTED_NODE: ${node.node}.`);
      } else if (node.kind === "image") {
        if (!options.sampleImage) throw new Error(`MATERIALX_IMAGE_SAMPLER_REQUIRED: ${node.uri}.`);
        if (!Number.isInteger(node.channels) || node.channels < 1 || node.channels > 4) throw new Error("MATERIALX_IMAGE: invalid channel count.");
        const sampled = options.sampleImage(node.uri, options.uv ?? [0, 0], node.channels);
        const values = broadcast(sampled, node.channels);
        if (values.some((v) => !Number.isFinite(v))) throw new Error("MATERIALX_VALUE: image sample is not finite.");
        output = node.channels === 1 ? values[0]! : values;
      } else {
        const expected = node.operation === "convert" ? 1 : node.operation === "mix" || node.operation === "clamp" ? 3 : 2;
        if (node.args.length !== expected) throw new Error("MATERIALX_TYPE: wrong operation arity.");
        const args = node.args.map(evaluate);
        if (node.operation === "convert") {
          const targetLengths: Record<string, number> = { float: 1, integer: 1, color3: 3, color4: 4, vector2: 2, vector3: 3, vector4: 4 };
          const length = targetLengths[node.outputType ?? ""];
          if (!length) throw new Error(`MATERIALX_CONVERSION_UNSUPPORTED: ${node.outputType ?? "missing output type"}.`);
          const source = args[0]!;
          const values = typeof source === "number" ? [source] : [...source];
          let result: number[];
          if (values.length === 1) result = Array(length).fill(values[0]!);
          else if (length === 1) result = [values[0]!];
          else if (values.length === length) result = values;
          else if (values.length === 3 && length === 4) result = [...values, 1];
          else if (values.length === 4 && length === 3) result = values.slice(0, 3);
          else throw new Error("MATERIALX_CONVERSION_UNSUPPORTED: incompatible vector widths.");
          if (node.outputType === "integer") result = result.map(Math.trunc);
          output = length === 1 ? result[0]! : result;
        } else {
          const length = Math.max(...args.map((arg) => typeof arg === "number" ? 1 : arg.length));
          const values = args.map((arg) => broadcast(arg, length));
          const result = Array.from({ length }, (_, i) => {
            const a = values[0]![i]!;
            const b = values[1]?.[i] ?? 0;
            const c = values[2]?.[i] ?? 0;
            switch (node.operation) {
              case "add": return a + b;
              case "subtract": return a - b;
              case "multiply": return a * b;
              case "divide": if (b === 0) throw new Error("MATERIALX_DIVIDE_BY_ZERO: graph division by zero."); return a / b;
              case "mix": return a * (1 - c) + b * c;
              case "clamp": if (b > c) throw new Error("MATERIALX_VALUE: clamp low exceeds high."); return Math.max(b, Math.min(c, a));
              default: throw new Error("MATERIALX_UNSUPPORTED_NODE: unknown operation.");
            }
          });
          if (result.some((value) => !Number.isFinite(value))) throw new Error("MATERIALX_VALUE: non-finite graph result.");
          output = length === 1 ? result[0]! : result;
        }
      }
      cache.set(node, output);
      return output;
    } finally { active.delete(node); }
  };
  return evaluate(expression);
}

/** Material translation evaluated at one UV. Dynamic textures require a graph-capable renderer for per-fragment evaluation. */
export function createMaterialXMaterial(surface: MaterialXSurface, options: MaterialXSampleOptions = {}): Material {
  const get = (name: string): MaterialXNumericValue => evaluateMaterialXExpression(surface.parameters[name]!, options);
  const scalar = (name: string): number => {
    const value = get(name);
    if (typeof value !== "number") throw new Error(`MATERIALX_TYPE: ${name} must be scalar.`);
    return value;
  };
  const color = (name: string): [number, number, number] => {
    const value = get(name);
    if (typeof value === "number" || value.length !== 3) throw new Error(`MATERIALX_TYPE: ${name} must be a color3.`);
    return [value[0]!, value[1]!, value[2]!];
  };
  const opacity = color("opacity");
  if (Math.abs(opacity[0] - opacity[1]) > 1e-6 || Math.abs(opacity[1] - opacity[2]) > 1e-6) {
    throw new Error("MATERIALX_COLORED_OPACITY_UNSUPPORTED: Aura materials use scalar alpha.");
  }
  if (surface.model === "surface_unlit") {
    const emission = scalar("emission");
    const emissionColor = color("emission_color");
    if (scalar("transmission") !== 0) throw new Error("MATERIALX_UNLIT_TRANSMISSION_UNSUPPORTED: Aura unlit materials use alpha blending.");
    return createMaterialFromDescriptor({ name: surface.name, model: "unlit", properties: { color: [...emissionColor.map((v) => v * emission), opacity[0]], renderState: { blend: opacity[0] < 1 } } });
  }
  const base = scalar("base");
  const baseColor = color("base_color");
  const sheen = scalar("sheen");
  return createMaterialFromDescriptor({ name: surface.name, model: "pbr", properties: {
    baseColor: [...baseColor.map((v) => v * base), opacity[0]], metallic: scalar("metalness"), roughness: scalar("specular_roughness"),
    specularFactor: scalar("specular"), specularColorFactor: color("specular_color"), ior: scalar("specular_IOR"),
    transmissionFactor: scalar("transmission"), emissiveStrength: scalar("emission"), emissiveColor: color("emission_color"),
    clearcoatFactor: scalar("coat"), clearcoatRoughnessFactor: scalar("coat_roughness"), sheenColorFactor: color("sheen_color").map((v) => v * sheen),
    renderState: { blend: opacity[0] < 1 }
  } });
}

/** Evaluate scalar normal or vector tangent-space displacement, including the authored scale. */
export function evaluateMaterialXDisplacement(surface: MaterialXSurface, options: MaterialXSampleOptions = {}): MaterialXNumericValue {
  if (!surface.displacement) return 0;
  const value = evaluateMaterialXExpression(surface.displacement.value, options);
  const scale = evaluateMaterialXExpression(surface.displacement.scale, options);
  if (typeof scale !== "number") throw new Error("MATERIALX_TYPE: displacement scale must be scalar.");
  if (typeof value === "number") return value * scale;
  if (value.length !== 3) throw new Error("MATERIALX_TYPE: displacement must be float or vector3.");
  return value.map((channel) => channel * scale);
}

/** Opt-in AssetManager loader; includes and image files inherit WP-07 transport, integrity and ownership. */
export class MaterialDocumentLoader implements AssetLoader<MaterialXDocument> {
  readonly type = "materialx";
  private readonly ownedDependencies = new WeakMap<MaterialXDocument, readonly AssetHandle<unknown>[]>();
  canLoad(request: AssetLoadRequest): boolean { return request.type === this.type || /\.mtlx(?:[?#]|$)/i.test(request.url); }
  async load(request: AssetLoadRequest, context: LoadContext): Promise<MaterialXDocument> {
    context.throwIfAborted(request.url);
    const transport = mergeAssetRequestOptions(context.requestOptionsFor(request.url), request);
    const maxBytes = Math.min(transport.maxBytes ?? MAX_DOCUMENT_BYTES, MAX_DOCUMENT_BYTES);
    const signal = context.signalFor(request.signal);
    const bytes = await fetchBytes(request.url, signal, request.onProgress ? (progress) => request.onProgress!({ url: request.url, phase: "document", loadedBytes: progress.loaded, ...(progress.total !== undefined ? { totalBytes: progress.total } : {}) }) : undefined, { ...transport, maxBytes });
    context.throwIfAborted(request.url);
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const tree = readXml(text, maxBytes);
    const includeHrefs = extractIncludes(tree);
    if (includeHrefs.length > MAX_DEPENDENCIES) throw new RangeError("MATERIALX_LIMIT: too many includes.");
    // AssetManager already provides a child context; direct loader users need
    // one derived from the document URL for parent-relative dependencies.
    const dependenciesContext = context.dependencyChain.at(-1) === request.url && (!request.signal || request.signal === context.signal)
      ? context : context.child(request.url, undefined, request);
    const locallyOwned: AssetHandle<unknown>[] = [];
    try {
      const acquire = async <T>(url: string, type: string): Promise<T> => {
        const handle = await dependenciesContext.loadDependency<T>(url, type);
        if (!dependenciesContext.tracksDependencies) locallyOwned.push(handle as AssetHandle<unknown>);
        return handle.value;
      };
      const includes: Record<string, MaterialXDocument> = {};
      for (const href of includeHrefs) includes[href] = await acquire<MaterialXDocument>(href, "materialx");
      const document = parseMaterialXDocument(text, { url: request.url, maxBytes, includes });
      const resources: Record<string, unknown> = {};
      const includeUris = new Set(document.includes);
      for (const uri of document.dependencies) {
        if (!includeUris.has(uri)) resources[uri] = await acquire(uri, "image");
      }
      context.throwIfAborted(request.url);
      if (signal?.aborted) throw signal.reason ?? new Error("MATERIALX_ABORTED: request was aborted.");
      const result: MaterialXDocument = { ...document, resources };
      if (locallyOwned.length) this.ownedDependencies.set(result, locallyOwned);
      return result;
    } catch (error) {
      const failures: unknown[] = [];
      for (const handle of locallyOwned.reverse()) {
        try { await handle.release(); } catch (failure) { failures.push(failure); }
      }
      if (failures.length) throw new AggregateError([error, ...failures], "MATERIALX_DEPENDENCY: failed to release dependencies after an error.");
      throw error;
    }
  }
  async dispose(document: MaterialXDocument): Promise<void> {
    const handles = this.ownedDependencies.get(document);
    if (!handles) return;
    this.ownedDependencies.delete(document);
    const failures: unknown[] = [];
    for (const handle of [...handles].reverse()) {
      try { await handle.release(); } catch (failure) { failures.push(failure); }
    }
    if (failures.length) throw new AggregateError(failures, "MATERIALX_DEPENDENCY: failed to release dependencies.");
  }
}
