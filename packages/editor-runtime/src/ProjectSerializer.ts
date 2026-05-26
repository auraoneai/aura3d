export interface EditorProjectDocument {
  readonly schema: "a3d-editor-project";
  readonly name: string;
  readonly nodes: readonly unknown[];
  readonly assets?: readonly string[];
}

export function serializeEditorProject(project: EditorProjectDocument): string {
  if (!project.name.trim()) throw new Error("Editor project name is required.");
  return `${JSON.stringify(project, null, 2)}\n`;
}

export function parseEditorProject(text: string): EditorProjectDocument {
  const parsed = JSON.parse(text) as EditorProjectDocument;
  if (parsed.schema !== "a3d-editor-project") throw new Error("Unsupported editor project schema.");
  if (!Array.isArray(parsed.nodes)) throw new Error("Editor project nodes must be an array.");
  return parsed;
}
